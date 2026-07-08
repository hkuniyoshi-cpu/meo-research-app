import { verifyTurnstile } from "../lib/turnstile";
import { checkRateLimit } from "../lib/ratelimit";
import { getCached, setCached } from "../lib/cache";
import { findPlace, getDetails, findCompetitors, normalizeDetails, normalizeLight } from "../lib/places";
import { scoreProfile, rankAmong, prominenceLight, daysSinceLatestPost, REC_PHOTOS } from "../lib/scoring";
import { weightsFor } from "../lib/weights";
import { fetchEnriched, fetchReviewActivity } from "../lib/outscraper";
import type { Enriched, ReviewActivity } from "../lib/outscraper";

export interface Env {
  CACHE: KVNamespace;
  RATELIMIT: KVNamespace;
  GOOGLE_PLACES_API_KEY: string;
  TURNSTILE_SECRET: string;
  OUTSCRAPER_API_KEY: string;
  ADMIN_KEY?: string; // 設定時、一致するとレート制限・Bot判定をスキップ（管理者用）
  LOG_URL?: string; // GAS Web App URL（入力ログをスプレッドシートに蓄積）
}

const RATE_LIMIT_PER_DAY = 20;
const VISIBLE_TIPS = 3; // 無料版で見せる改善ポイント数（もったいぶり）

interface Body { name: string; area: string; compare: boolean; turnstileToken: string; admin?: string; uiLang?: string; }

type UiLang = "ja" | "en" | "ko" | "zh";

export async function handleDiagnose(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const ip = req.headers.get("CF-Connecting-IP") ?? "0.0.0.0";
  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  if (!body.name || !body.area) return json({ error: "missing_fields" }, 400);

  // 管理者バイパス：body.admin / ?admin= / X-Admin-Key のいずれかが ADMIN_KEY と一致すると
  // レート制限・Bot判定をスキップ（ADMIN_KEY未設定時は常に無効）
  const adminKey = body.admin || new URL(req.url).searchParams.get("admin") || req.headers.get("X-Admin-Key") || "";
  const isAdmin = !!env.ADMIN_KEY && adminKey === env.ADMIN_KEY;

  if (!isAdmin) {
    if (!(await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET, ip)))
      return json({ error: "bot_check_failed" }, 403);

    // レート制限はキャッシュ判定より前＝キャッシュヒットも1回としてカウント（連打抑止のため意図的）
    const date = new Date().toISOString().slice(0, 10);
    const rate = await checkRateLimit(env.RATELIMIT, ip, date, RATE_LIMIT_PER_DAY);
    if (!rate.allowed) return json({ error: "rate_limited" }, 429);
  }

  // UI言語（TIPS/業種例文をローカライズ）。Placesの lang とは別物（lang は入力から自動判定）
  const uiLang: UiLang = (body.uiLang === "en" || body.uiLang === "ko" || body.uiLang === "zh") ? body.uiLang : "ja";

  // 入力＋接続元情報（診断後に結果と一緒にログ送信するため保持）
  const cf = (req as unknown as { cf?: Record<string, unknown> }).cf || {};
  const inputLog = {
    name: body.name,
    area: body.area,
    compare: !!body.compare,
    uiLang,
    ip,
    country: cf.country ?? "",
    region: cf.region ?? "",
    city: cf.city ?? "",
    postalCode: cf.postalCode ?? "",
    lat: cf.latitude ?? "",
    lng: cf.longitude ?? "",
    timezone: cf.timezone ?? "",
    userAgent: req.headers.get("user-agent") ?? "",
    referer: req.headers.get("referer") ?? "",
  };
  const sendLog = (extra: Record<string, unknown>) => {
    if (!env.LOG_URL) return;
    const p = fetch(env.LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ts: new Date().toISOString(), ...inputLog, ...extra }),
    }).catch(() => {});
    if (ctx) ctx.waitUntil(p);
  };

  // v18: クチコミ件数/評価を実店舗ページ値(Outscraper)で採用＋競合表示増。旧キャッシュ無効化
  // v30: uiLang をキャッシュキーに追加（言語別に結果をキャッシュ）
  // v31: 多言語拡張（ko/zh-TW）。Places lang を uiLang から導出。旧キャッシュ無効化
  const cacheKey = `diag:v33:${body.name}|${body.area}|${body.compare ? 1 : 0}|${uiLang}`;
  const cached = await getCached(env.CACHE, cacheKey);
  if (cached) {
    sendLog({ status: "cached", ...resultLogFields(cached) });
    return json(cached);
  }

  try {
    // Places API の取得言語は選択中のUI言語に追従（店舗名・住所を選択言語で表示）
    const lang = ({ ja: "ja", en: "en", ko: "ko", zh: "zh-TW" } as Record<UiLang, string>)[uiLang] || "en";
    const found = await findPlace(body.name, body.area, env.GOOGLE_PLACES_API_KEY, lang);
    if (!found) { sendLog({ status: "not_found" }); return json({ error: "not_found" }, 404); }

    const details = normalizeDetails(await getDetails(found.id, env.GOOGLE_PLACES_API_KEY, lang));
    const weights = weightsFor(details.primaryType);

    // Outscraper enrichment（失敗時はnullにデグレード）
    let enriched: Enriched | null = null;
    let activity: ReviewActivity | null = null;
    if (env.OUTSCRAPER_API_KEY) {
      try {
        // 出力前の再チェック：取得が不完全（実在店なのに写真もクチコミ分布も空）なら一度だけ取り直す
        const incomplete = (x: Enriched | null) => !x || (x.photosCount === 0 && Object.keys(x.reviewsPerScore).length === 0);
        enriched = await fetchEnriched(body.name, body.area, env.OUTSCRAPER_API_KEY);
        if (incomplete(enriched)) {
          const retry = await fetchEnriched(body.name, body.area, env.OUTSCRAPER_API_KEY);
          if (!incomplete(retry)) enriched = retry;
        }
        activity = await fetchReviewActivity(body.name, body.area, env.OUTSCRAPER_API_KEY, 10);
      } catch {
        // 取れた分だけ使う
      }
    }

    // 実店舗ページのクチコミ件数/評価を正として採用（Placesの曖昧マッチで件数がズレるのを防ぐ）
    if (enriched && enriched.reviewCount != null) {
      details.userRatingCount = enriched.reviewCount;
      if (enriched.rating != null) details.rating = enriched.rating;
    }

    const profile = scoreProfile(details, weights, new Date(), enriched ?? undefined);
    const now = new Date();

    // 改善ポイントは全言語分を生成して結果に持たせる（フロントで言語切替時にtipsも切り替わるように）
    const UI_LANGS: UiLang[] = ["ja", "en", "ko", "zh"];
    const tipsAll: Record<string, Tip[]> = {};
    for (const L of UI_LANGS) tipsAll[L] = buildTips(details, profile, enriched ?? undefined, now, activity, L);
    const tips = tipsAll[uiLang];

    let ranking = null;
    if (body.compare) {
      const raw = await findCompetitors(details.primaryType, body.area, env.GOOGLE_PLACES_API_KEY, lang);
      const comps = raw.filter((c: any) => c.id !== details.placeId).map(normalizeLight);
      ranking = rankAmong(details, comps);
    }

    // 今後の見通し（予測）：現状データからの目安。店ごとに弱点・数値が変わる具体予測にする
    let gain = 0;
    const gapList: { key: string; label: string; gain: number }[] = [];
    for (const c of profile.categories) {
      const r = c.score / c.max;
      const g = r < 0.85 ? Math.round((Math.min(0.85, r + 0.3) - r) * c.max) : 0;
      if (r < 0.7) gain += (Math.min(0.85, r + 0.3) - r) * c.max;
      if (g > 0) gapList.push({ key: c.key, label: c.label, gain: g });
    }
    const topGaps = gapList.sort((a, b) => b.gain - a.gain).slice(0, 2);
    const potentialScore = Math.min(100, Math.round(profile.total + gain));

    // 1つ上位の競合との「知名度差」→ 射程圏内までの目安
    let nextRank: { gap: number; rank: number; total: number } | null = null;
    if (ranking && ranking.rank > 1) {
      const above = ranking.competitors
        .filter((c) => c.index > ranking.index)
        .sort((a, b) => a.index - b.index)[0];
      if (above) nextRank = { gap: Math.max(1, Math.round(above.index - ranking.index)), rank: ranking.rank, total: ranking.total };
    }

    // 次の節目クチコミ件数（50/100/300/500/1000…）までの月数
    const milestones = [50, 100, 200, 300, 500, 1000, 2000];
    const nextMilestone = milestones.find((m) => m > details.userRatingCount) ?? null;
    const monthsToMilestone = nextMilestone != null && activity?.monthlyPace
      ? Math.ceil((nextMilestone - details.userRatingCount) / activity.monthlyPace) : null;

    const prediction = {
      potentialScore,
      scoreGain: potentialScore - profile.total,
      topGaps,
      reviewNow: details.userRatingCount,
      monthlyPace: activity?.monthlyPace ?? null,
      reviewIn6m: activity?.monthlyPace != null ? details.userRatingCount + activity.monthlyPace * 6 : null,
      nextMilestone,
      monthsToMilestone,
      nextRank,
    };

    const result = {
      name: details.displayName,
      area: body.area,
      address: trimAddress(details.formattedAddress) || body.area,
      investigatedAt: now.toISOString().slice(0, 10),
      profile,
      prominence: prominenceLight(details),
      rating: details.rating ?? null,
      reviewCount: details.userRatingCount,
      location: details.location ? { lat: details.location.latitude, lng: details.location.longitude } : null,
      ranking,
      tipsVisible: tips.slice(0, VISIBLE_TIPS),
      tipsByLang: Object.fromEntries(UI_LANGS.map((L) => [L, tipsAll[L].slice(0, VISIBLE_TIPS)])),
      tipsLockedCount: Math.max(0, tips.length - VISIBLE_TIPS),
      // Outscraper enriched fields (null when unavailable)
      verified: enriched?.verified ?? null,
      photosCount: enriched?.photosCount ?? null,
      recPhotos: REC_PHOTOS,
      reviewActivity: activity,
      latestPostDays: enriched
        ? (enriched.posts.length ? Math.round(daysSinceLatestPost(enriched.posts, now)) : null)
        : null,
      unverified: ["ビジネスの説明文", "価格帯", "クチコミへの返信状況"],
      prediction,
    };
    await setCached(env.CACHE, cacheKey, result);
    sendLog({ status: "ok", ...resultLogFields(result) });
    return json(result);
  } catch {
    sendLog({ status: "upstream_error" });
    return json({ error: "upstream_error" }, 502);
  }
}

// スプレッドシート用に結果から要点だけ抽出
function resultLogFields(r: any): Record<string, unknown> {
  return {
    resultName: r?.name ?? "",
    resultAddress: r?.address ?? "",
    score: r?.profile?.total ?? "",
    scoreRank: gradeOf(r?.profile?.total),
    verified: r?.verified == null ? "" : (r.verified ? "1" : "0"),
    photos: r?.photosCount ?? "",
    reviews: r?.reviewCount ?? "",
    rating: r?.rating ?? "",
    rankingRank: r?.ranking?.rank ?? "",
    rankingTotal: r?.ranking?.total ?? "",
    bizLat: r?.location?.lat ?? "",
    bizLng: r?.location?.lng ?? "",
    weakest: r?.profile?.categories
      ? [...r.profile.categories].sort((a: any, b: any) => a.score / a.max - b.score / b.max)[0]?.label ?? ""
      : "",
  };
}

function gradeOf(total: number | undefined | null): string {
  if (typeof total !== "number") return "";
  if (total >= 90) return "S";
  if (total >= 75) return "A";
  if (total >= 60) return "B";
  if (total >= 45) return "C";
  return "D";
}

/**
 * Google登録の住所を「番地より前」までに丸める。
 * 例: 「日本、〒900-0014 沖縄県那覇市松尾2丁目8-19」→「沖縄県那覇市松尾2丁目」
 * 丁目があればそこまで／無ければ末尾の番地数字を除去。郵便番号・国名は除去。
 */
export function trimAddress(a: string): string {
  if (!a) return "";
  let s = a.replace(/^日本[、,\s]*/, "").replace(/^Japan[,\s]*/i, "");
  s = s.replace(/〒?\s*\d{3}[-－]?\d{4}\s*/, ""); // 郵便番号(日本)
  s = s.trim();
  if (/[ぁ-んァ-ヶ一-龯]/.test(s)) {
    // 日本語住所
    const chome = s.match(/^(.*?[0-9０-９]+\s*丁目)/); // 丁目まで残す
    if (chome) return chome[1].replace(/\s+/g, "");
    // 丁目表記が無い場合は最初の番地数字以降（建物名・号室も含む）をすべて落とす
    return s.replace(/\s*[0-9０-９].*$/, "").trim();
  }
  // 海外（非日本語）住所：カンマ区切りで「番地行(先頭)」と「国名(末尾)」を落とし、郵便番号を除去
  let parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 3) parts = parts.slice(0, -1);            // 末尾の国名を除去
  if (parts.length > 1 && /^\d/.test(parts[0])) parts = parts.slice(1); // 番地行(数字始まり)を除去
  parts = parts.map((p) => p.replace(/\s+\d{3,}.*$/, "").trim()).filter(Boolean); // 郵便番号(数字3桁以上)を除去
  return parts.join(", ");
}

/**
 * 業種・業態を分類し、アクションプランで使う「業種に合った例文」を返す。
 * Places の primaryType / types からカテゴリを推定（飲食・美容・医療・宿泊・士業/専門サービス等）。
 * limitedAttrs=true の業種（ITコンサル等の専門サービス）は、そもそもGBPで設定できる属性が少ないため、
 * キャッシュレス/Wi-Fi 等の飲食・小売向け属性を勧めない文言にする。
 */
export interface BizProfile { kind: string; photos: string; attrs: string; subcat: string; limitedAttrs: boolean; }

// 言語別の例文（ja/en/ko/zh）を持つ内部定義。bizProfile() が uiLang に応じて文字列を選ぶ。
type L = { ja: string; en: string; ko: string; zh: string };
interface BizProfileL { kind: string; limitedAttrs: boolean; photos: L; attrs: L; subcat: L; }

// 業種判定ルール（上から順に評価。具体的な業種を先に置く）。Places の type は英語スネークケース。
const BIZ_RULES: { re: RegExp; p: BizProfileL }[] = [
  { re: /laundr|dry_clean|coin_/, p: { kind: "laundromat", limitedAttrs: false, photos: { ja: "店内・設備（洗濯機/乾燥機）・外観・駐車場・利用案内", en: "interior, equipment (washers/dryers), exterior, parking, usage guide", ko: "매장 내부・설비(세탁기/건조기)・외관・주차장・이용 안내", zh: "店內・設備（洗衣機/烘乾機）・外觀・停車場・使用說明" }, attrs: { ja: "24時間営業・駐車場・各種キャッシュレス決済・Wi-Fiなど", en: "24-hour operation, parking, cashless payment options, Wi-Fi, etc.", ko: "24시간 영업・주차장・각종 간편결제・Wi-Fi 등", zh: "24小時營業・停車場・各種行動支付・Wi-Fi 等" }, subcat: { ja: "例：コインランドリー＋宅配クリーニング", en: "e.g., laundromat + delivery dry cleaning", ko: "예: 코인 세탁소＋배달 세탁 서비스", zh: "例：自助洗衣＋到府收送乾洗" } } },
  { re: /car_|\bauto|vehicle|gas_station|motorcycle|\btire|car_wash|car_repair|car_dealer/, p: { kind: "auto", limitedAttrs: false, photos: { ja: "車両・店舗/工場外観・作業場・作業風景・スタッフ", en: "vehicles, shop/garage exterior, work bay, work in progress, staff", ko: "차량・매장/정비소 외관・작업장・작업 모습・직원", zh: "車輛・店面/廠房外觀・維修區・施工過程・員工" }, attrs: { ja: "駐車場・各種キャッシュレス決済・見積無料・代車あり・即日対応など", en: "parking, cashless payment options, free estimates, loaner cars, same-day service, etc.", ko: "주차장・각종 간편결제・무료 견적・대차 제공・당일 대응 등", zh: "停車場・各種行動支付・免費估價・提供代步車・當日完工 等" }, subcat: { ja: "例：自動車整備＋車検、販売＋買取", en: "e.g., auto repair + vehicle inspection, sales + buyback", ko: "예: 자동차 정비＋차량 검사, 판매＋매입", zh: "例：汽車保養＋驗車、銷售＋收購" } } },
  { re: /real_estate|estate_agent/, p: { kind: "real_estate", limitedAttrs: false, photos: { ja: "取扱物件・店舗外観/内観・スタッフ・周辺環境", en: "listed properties, office exterior/interior, staff, surrounding area", ko: "취급 매물・사무실 외관/내부・직원・주변 환경", zh: "經手物件・店面外觀/內部・員工・周邊環境" }, attrs: { ja: "駐車場・オンライン相談対応・対応エリア・営業時間など", en: "parking, online consultation, service areas, business hours, etc.", ko: "주차장・온라인 상담 가능・대응 지역・영업시간 등", zh: "停車場・線上諮詢・服務區域・營業時間 等" }, subcat: { ja: "例：不動産売買＋賃貸仲介、賃貸管理＋リフォーム", en: "e.g., property sales + rental brokerage, rental management + renovation", ko: "예: 부동산 매매＋임대 중개, 임대 관리＋리모델링", zh: "例：不動產買賣＋租賃仲介、租賃管理＋裝修" } } },
  { re: /contractor|plumber|electrician|painter|roofing|locksmith|moving_company|cleaning|pest_control|handyman|renovation|construction|exterminat/, p: { kind: "home-service", limitedAttrs: false, photos: { ja: "施工/対応事例（ビフォー/アフター）・スタッフ・作業風景・自社/店舗外観", en: "project/job examples (before/after), staff, work in progress, company/shop exterior", ko: "시공/대응 사례(비포/애프터)・직원・작업 모습・자사/매장 외관", zh: "施工/服務案例（前/後對比）・員工・施工過程・公司/店面外觀" }, attrs: { ja: "見積無料・対応エリア・オンライン相談対応・駐車場など", en: "free estimates, service areas, online consultation, parking, etc.", ko: "무료 견적・대응 지역・온라인 상담 가능・주차장 등", zh: "免費估價・服務區域・線上諮詢・停車場 等" }, subcat: { ja: "例：外壁塗装＋リフォーム、ハウスクリーニング＋エアコン洗浄", en: "e.g., exterior painting + renovation, house cleaning + AC cleaning", ko: "예: 외벽 도장＋리모델링, 입주 청소＋에어컨 청소", zh: "例：外牆塗裝＋裝修、居家清潔＋冷氣清洗" } } },
  { re: /lodging|hotel|motel|resort|guest_house|hostel|ryokan|\binn\b|bed_and_breakfast|campground|cottage|capsule/, p: { kind: "lodging", limitedAttrs: false, photos: { ja: "客室・外観・館内設備・周辺・食事", en: "guest rooms, exterior, on-site facilities, surroundings, meals", ko: "객실・외관・관내 시설・주변・식사", zh: "客房・外觀・館內設施・周邊・餐點" }, attrs: { ja: "駐車場・Wi-Fi・チェックイン/アウト時間・対応言語など", en: "parking, Wi-Fi, check-in/out times, supported languages, etc.", ko: "주차장・Wi-Fi・체크인/아웃 시간・지원 언어 등", zh: "停車場・Wi-Fi・入住/退房時間・支援語言 等" }, subcat: { ja: "例：ホテル＋宴会場、旅館＋日帰り温泉", en: "e.g., hotel + banquet hall, inn + day-use hot spring", ko: "예: 호텔＋연회장, 료칸＋당일치기 온천", zh: "例：飯店＋宴會廳、旅館＋純泡湯溫泉" } } },
  { re: /dentist|doctor|hospital|clinic|health|physio|chiropract|pharmacy|drugstore|medical|veterinar|dental|nursing|therapist|acupunctur/, p: { kind: "medical", limitedAttrs: false, photos: { ja: "院内・外観・スタッフ・設備・受付の様子", en: "interior, exterior, staff, equipment, reception area", ko: "원내・외관・직원・장비・접수처 모습", zh: "院內・外觀・員工・設備・櫃台環境" }, attrs: { ja: "予約可・バリアフリー・駐車場・各種保険対応など", en: "appointments available, accessibility, parking, insurance accepted, etc.", ko: "예약 가능・배리어프리・주차장・각종 보험 적용 등", zh: "可預約・無障礙設施・停車場・各類保險適用 等" }, subcat: { ja: "例：整骨院＋鍼灸院、歯科＋小児歯科", en: "e.g., osteopathic clinic + acupuncture, dentistry + pediatric dentistry", ko: "예: 접골원＋침구원, 치과＋소아치과", zh: "例：整骨院＋針灸院、牙科＋兒童牙科" } } },
  { re: /hair|beauty|salon|\bspa\b|nail|barber|massage|esthetic|aesthetic|eyelash|\blash|tanning|sauna|skin_care|makeup|foot_care|reflexolog|wax|depilat|hair_removal|cosmetic|wellness|relax/, p: { kind: "beauty", limitedAttrs: false, photos: { ja: "施術例（ビフォー/アフター）・店内・個室・スタッフ・メニュー表・外観", en: "treatment examples (before/after), interior, private rooms, staff, menu, exterior", ko: "시술 사례(비포/애프터)・매장 내부・개인룸・직원・메뉴표・외관", zh: "服務案例（前/後對比）・店內・包廂・員工・價目表・外觀" }, attrs: { ja: "予約可・各種キャッシュレス決済・個室・女性スタッフ在籍・駐車場・バリアフリーなど", en: "appointments available, cashless payment options, private rooms, female staff on hand, parking, accessibility, etc.", ko: "예약 가능・각종 간편결제・개인룸・여성 직원 상주・주차장・배리어프리 등", zh: "可預約・各種行動支付・包廂・有女性員工・停車場・無障礙設施 等" }, subcat: { ja: "例：美容室＋ヘッドスパ、ネイル＋まつげエクステ、エステ＋脱毛", en: "e.g., hair salon + head spa, nails + eyelash extensions, esthetics + hair removal", ko: "예: 미용실＋두피 스파, 네일＋속눈썹 연장, 에스테틱＋제모", zh: "例：美髮＋頭皮SPA、美甲＋接睫毛、美容＋除毛" } } },
  { re: /gym|fitness|yoga|sports_|stadium|dance|martial|swimming|pilates|crossfit|golf/, p: { kind: "fitness", limitedAttrs: false, photos: { ja: "設備・館内・トレーニング/レッスン風景・スタッフ", en: "equipment, interior, training/class sessions, staff", ko: "설비・관내・트레이닝/레슨 모습・직원", zh: "設備・館內・訓練/課程實況・員工" }, attrs: { ja: "駐車場・更衣室/シャワー・見学体験可・キャッシュレス決済など", en: "parking, locker rooms/showers, trial visits available, cashless payment, etc.", ko: "주차장・탈의실/샤워실・견학·체험 가능・간편결제 등", zh: "停車場・更衣室/淋浴間・可參觀體驗・行動支付 等" }, subcat: { ja: "例：ジム＋パーソナル、ヨガ＋ピラティス", en: "e.g., gym + personal training, yoga + pilates", ko: "예: 헬스장＋퍼스널 트레이닝, 요가＋필라테스", zh: "例：健身房＋一對一教練、瑜伽＋皮拉提斯" } } },
  { re: /restaurant|\bfood|cafe|\bbar\b|bakery|meal_|izakaya|ramen|sushi|diner|\bpub\b|brewery|coffee|ice_cream|confectioner|\bdeli\b/, p: { kind: "food", limitedAttrs: false, photos: { ja: "料理・店内・外観・スタッフ・メニュー表", en: "dishes, interior, exterior, staff, menu", ko: "요리・매장 내부・외관・직원・메뉴판", zh: "餐點・店內・外觀・員工・菜單" }, attrs: { ja: "テイクアウト・予約可・各種キャッシュレス決済・Wi-Fiなど", en: "takeout, reservations available, cashless payment options, Wi-Fi, etc.", ko: "포장 가능・예약 가능・각종 간편결제・Wi-Fi 등", zh: "外帶・可訂位・各種行動支付・Wi-Fi 等" }, subcat: { ja: "例：居酒屋＋宴会場、カフェ＋ケーキ店", en: "e.g., izakaya + banquet hall, cafe + cake shop", ko: "예: 이자카야＋연회장, 카페＋케이크 전문점", zh: "例：居酒屋＋宴會廳、咖啡廳＋蛋糕店" } } },
  { re: /school|education|tutor|university|preschool|kindergarten|training|lesson|library|cram|juku/, p: { kind: "education", limitedAttrs: true, photos: { ja: "教室/校舎・授業/レッスン風景・講師・教材・外観", en: "classrooms/building, lessons in session, instructors, materials, exterior", ko: "교실/건물・수업/레슨 모습・강사・교재・외관", zh: "教室/校舍・上課/課程實況・師資・教材・外觀" }, attrs: { ja: "オンライン対応・駐車場・体験/見学可など、該当する項目", en: "online options, parking, trial/observation available, and other applicable items", ko: "온라인 대응・주차장・체험/견학 가능 등 해당 항목", zh: "線上授課・停車場・可試聽/參觀 等適用項目" }, subcat: { ja: "例：学習塾＋オンライン講座、英会話＋資格対策", en: "e.g., cram school + online courses, English conversation + exam prep", ko: "예: 학원＋온라인 강좌, 영어회화＋자격증 대비", zh: "例：補習班＋線上課程、英語會話＋證照輔導" } } },
  { re: /night_club|nightclub|karaoke|cinema|movie_theater|amusement|bowling|casino|arcade|internet_cafe|game_center|\btheater\b/, p: { kind: "entertainment", limitedAttrs: false, photos: { ja: "店内・設備・イベント/プレイ風景・外観・メニュー", en: "interior, facilities, events/play in action, exterior, menu", ko: "매장 내부・설비・이벤트/플레이 모습・외관・메뉴", zh: "店內・設施・活動/遊玩實況・外觀・菜單" }, attrs: { ja: "予約可・駐車場・各種キャッシュレス決済・個室/貸切可など", en: "reservations available, parking, cashless payment options, private rooms/full venue rental, etc.", ko: "예약 가능・주차장・각종 간편결제・개인룸/대관 가능 등", zh: "可預約・停車場・各種行動支付・包廂/可包場 等" }, subcat: { ja: "例：カラオケ＋飲食、バー＋イベントスペース", en: "e.g., karaoke + dining, bar + event space", ko: "예: 노래방＋음식, 바＋이벤트 공간", zh: "例：KTV＋餐飲、酒吧＋活動空間" } } },
  { re: /store|\bshop|market|retail|clothing|grocery|supermarket|convenience|book|furniture|electronics|jewelry|florist|hardware|pet_store|liquor|department|\bmall\b|boutique|bicycle|optician/, p: { kind: "retail", limitedAttrs: false, photos: { ja: "商品・売場/店内・外観・陳列・スタッフ", en: "products, sales floor/interior, exterior, displays, staff", ko: "상품・매장/내부・외관・진열・직원", zh: "商品・賣場/店內・外觀・陳列・員工" }, attrs: { ja: "駐車場・各種キャッシュレス決済・通販/宅配対応など", en: "parking, cashless payment options, online/delivery service, etc.", ko: "주차장・각종 간편결제・온라인 판매/배송 대응 등", zh: "停車場・各種行動支付・網購/宅配服務 等" }, subcat: { ja: "例：物販＋修理対応、小売＋カフェ併設", en: "e.g., retail + repair service, retail + in-store cafe", ko: "예: 판매＋수리 서비스, 소매＋카페 병설", zh: "例：商品銷售＋維修服務、零售＋附設咖啡廳" } } },
  { re: /consult|lawyer|account|finance|insurance|corporate_office|software|marketing|design|web_|advertis|legal|\btax\b|notary|architect|engineer|agency|\bcompany\b|\boffice\b|it_|technology|telecom|\bbank\b|attorney|recruit|employment/, p: { kind: "professional", limitedAttrs: true, photos: { ja: "オフィス外観・スタッフ・サービス内容や実績の資料・セミナー/打合せの様子", en: "office exterior, staff, materials on services and results, seminars/meetings", ko: "사무실 외관・직원・서비스 내용 및 실적 자료・세미나/미팅 모습", zh: "辦公室外觀・員工・服務內容與實績資料・研討會/會議實況" }, attrs: { ja: "オンライン相談対応・対応エリア・駐車場など、該当する項目", en: "online consultation, service areas, parking, and other applicable items", ko: "온라인 상담 가능・대응 지역・주차장 등 해당 항목", zh: "線上諮詢・服務區域・停車場 等適用項目" }, subcat: { ja: "例：ITコンサル＋システム開発、税理士＋経営コンサル", en: "e.g., IT consulting + system development, tax accounting + management consulting", ko: "예: IT 컨설팅＋시스템 개발, 세무사＋경영 컨설팅", zh: "例：IT 顧問＋系統開發、會計師＋經營顧問" } } },
];
const BIZ_DEFAULT_L: BizProfileL = { kind: "default", limitedAttrs: true, photos: { ja: "外観・内観・スタッフ・提供サービスの様子", en: "exterior, interior, staff, services in action", ko: "외관・내부・직원・제공 서비스 모습", zh: "外觀・內部・員工・服務實況" }, attrs: { ja: "駐車場・オンライン対応など、業種に該当する項目", en: "parking, online options, and other items relevant to your industry", ko: "주차장・온라인 대응 등 업종에 해당하는 항목", zh: "停車場・線上服務 等符合行業的項目" }, subcat: { ja: "提供サービスに合う副カテゴリ", en: "a secondary category that fits your services", ko: "제공 서비스에 맞는 보조 카테고리", zh: "符合服務內容的次要類別" } };

function resolveBiz(p: BizProfileL, uiLang: UiLang = "ja"): BizProfile {
  return { kind: p.kind, limitedAttrs: p.limitedAttrs, photos: p.photos[uiLang], attrs: p.attrs[uiLang], subcat: p.subcat[uiLang] };
}

export function bizProfile(primaryType: string | undefined, types: string[], uiLang: UiLang = "ja"): BizProfile {
  const ts = [primaryType, ...(types || [])].filter(Boolean).map(t => String(t).toLowerCase());
  // primaryType を優先的に評価し、無ければ types 全体で判定
  for (const source of [primaryType ? [String(primaryType).toLowerCase()] : [], ts]) {
    for (const { re, p } of BIZ_RULES) if (source.some(t => re.test(t))) return resolveBiz(p, uiLang);
  }
  return resolveBiz(BIZ_DEFAULT_L, uiLang);
}

/**
 * 実データで「確実に判定できる」欠落・不足のみから改善ポイントを生成し、弱いカテゴリ順に並べる。
 * enrichedが渡された場合はリアルデータ（投稿頻度・返信率・写真数・属性充実度等）も活用する。
 */
interface Tip { title: string; detail: string; level: "high" | "mid" | "info"; }

// buildTips 内で使う言語別テンプレート。{x} はプレースホルダ。
const TIP_T: Record<UiLang, Record<string, string | ((v: Record<string, string | number>) => string)>> = {
  ja: {
    website_t: "Webサイト/予約リンクを登録",
    website_d: "公式サイト・SNS・ネット予約のリンクが未登録です。登録すると情報の信頼性が上がり、来店前のユーザーを取りこぼしません。",
    phone_t: "電話番号を登録",
    phone_d: "電話番号が未登録です。問い合わせ・予約の導線として必ず登録しましょう。",
    subcat_t: "副カテゴリを追加",
    subcat_d: (v) => `主カテゴリだけになっています。提供サービスに合う副カテゴリ（${v.subcat}）を追加すると、関連キーワードでの露出が広がります。`,
    revcount_t: "クチコミ件数を増やす",
    revcount_d: (v) => `現在${v.count}件。来店時の一声やレジ横のQR・カードでレビュー依頼を仕組み化しましょう。件数は上位表示の主要因です。`,
    rating_t: "平均評価を引き上げる",
    rating_d: (v) => `現在★${v.rating}。低評価の要因（提供時間・接客・清潔感など）を洗い出し、運用改善と丁寧な返信で評価を底上げしましょう。`,
    hours_t: "営業時間を登録",
    hours_d: "営業時間が未設定です。曜日ごとの営業時間・定休日・祝日対応・特別営業を登録しましょう。",
    photos_t: "写真を増やす",
    photos_d: (v) => `現在${v.count}枚。${v.photos}など、推奨${v.rec}枚以上を目安に高画質写真を追加・定期更新しましょう。写真量は閲覧数とクリック率に直結します。`,
    photos_light_d: (v) => `現在${v.count}枚。${v.photos}などの写真を追加しましょう。`,
    attrs_full_t: "属性を充実させる",
    attrs_full_d: (v) => `${v.attrs}など、業種に該当する属性があれば登録しましょう。${v.svc ? "サービス業はそもそも設定できる属性が少なめですが、" : ""}埋めるほど『条件で絞り込む』検索にヒットしやすくなります。`,
    attrs_full_open_d: (v) => `${v.attrs}など、未設定の属性を追加しましょう。『条件で絞り込む』検索にヒットしやすくなります。`,
    attrs_light_t: "属性を登録",
    attrs_light_d: (v) => `${v.attrs}など、業種に該当する属性を登録しましょう。`,
    lowrev_t: "低評価への対応",
    lowrev_d: (v) => `★1〜2の割合がやや高めです（${v.pct}%）。共通する不満点を特定し、運用改善＋誠実な返信で印象を回復しましょう。`,
    recency_t: "クチコミの新着ペース回復",
    recency_d: (v) => `最新クチコミが${v.days}日前です。定期的なレビュー依頼で新着クチコミを絶やさないように。新着性も鮮度シグナルになります。`,
    ok_t: "整備度は良好です",
    ok_d: "確認できる基本項目に大きな欠落はありません。下のレーダー・各指標で現状を確認しつつ、下記の習慣化で上位を狙いましょう。",
    maintain_t: "今の強みを維持・さらに伸ばす",
    maintain_d: "クチコミへの返信と最新情報の定期投稿を継続し、写真を増やし続けることで、さらに上位表示と来店率の向上が狙えます。",
  },
  en: {
    website_t: "Add a website / booking link",
    website_d: "No links to an official site, social media, or online booking are registered. Adding them boosts the credibility of your information and keeps you from losing customers before they visit.",
    phone_t: "Add a phone number",
    phone_d: "No phone number is registered. Be sure to add one as a path for inquiries and bookings.",
    subcat_t: "Add secondary categories",
    subcat_d: (v) => `You only have a primary category. Adding secondary categories that fit your services (${v.subcat}) broadens your exposure for related keywords.`,
    revcount_t: "Get more reviews",
    revcount_d: (v) => `Currently ${v.count} reviews. Systematize review requests with a quick word at checkout or a QR code/card by the register. Review count is a major ranking factor.`,
    rating_t: "Raise your average rating",
    rating_d: (v) => `Currently ★${v.rating}. Identify the causes of low ratings (wait times, service, cleanliness, etc.) and lift your score through operational improvements and thoughtful replies.`,
    hours_t: "Add business hours",
    hours_d: "Business hours are not set. Register your hours by day of the week, regular closing days, holiday hours, and special hours.",
    photos_t: "Add more photos",
    photos_d: (v) => `Currently ${v.count} photos. Add high-quality photos of ${v.photos} and more, aiming for at least the recommended ${v.rec}, and refresh them regularly. Photo volume directly drives views and click-through rate.`,
    photos_light_d: (v) => `Currently ${v.count} photos. Add photos of ${v.photos} and similar.`,
    attrs_full_t: "Fill out your attributes",
    attrs_full_d: (v) => `Register any attributes that apply to your business, such as ${v.attrs}. ${v.svc ? "Service businesses have relatively few attributes available to begin with, but " : ""}the more you fill in, the easier it is to appear in filtered searches.`,
    attrs_full_open_d: (v) => `Add any unset attributes, such as ${v.attrs}. This makes it easier to appear in filtered searches.`,
    attrs_light_t: "Register attributes",
    attrs_light_d: (v) => `Register attributes that apply to your business, such as ${v.attrs}.`,
    lowrev_t: "Address low ratings",
    lowrev_d: (v) => `The share of 1–2 star reviews is somewhat high (${v.pct}%). Pinpoint the common complaints and recover your image through operational improvements and sincere replies.`,
    recency_t: "Restore your fresh-review pace",
    recency_d: (v) => `Your latest review is ${v.days} days old. Keep new reviews coming with regular review requests. Recency is also a freshness signal.`,
    ok_t: "Your profile is well maintained",
    ok_d: "There are no major gaps in the basics we can check. Review your current state with the radar and metrics below, and aim higher by making the habits below routine.",
    maintain_t: "Keep and build on your strengths",
    maintain_d: "Keep replying to reviews and posting updates regularly, and keep adding photos, to push for even higher rankings and visit rates.",
  },
  ko: {
    website_t: "웹사이트/예약 링크 등록",
    website_d: "공식 사이트・SNS・온라인 예약 링크가 등록되어 있지 않습니다. 등록하면 정보의 신뢰도가 올라가고 방문 전 고객을 놓치지 않습니다.",
    phone_t: "전화번호 등록",
    phone_d: "전화번호가 등록되어 있지 않습니다. 문의・예약의 연결 통로로 반드시 등록하세요.",
    subcat_t: "보조 카테고리 추가",
    subcat_d: (v) => `주 카테고리만 설정되어 있습니다. 제공 서비스에 맞는 보조 카테고리(${v.subcat})를 추가하면 관련 키워드에서의 노출이 넓어집니다.`,
    revcount_t: "리뷰 수 늘리기",
    revcount_d: (v) => `현재 ${v.count}건. 방문 시 한마디나 계산대 옆 QR・카드로 리뷰 요청을 시스템화하세요. 리뷰 수는 상위 노출의 주요 요인입니다.`,
    rating_t: "평균 평점 끌어올리기",
    rating_d: (v) => `현재 ★${v.rating}. 낮은 평점의 원인(제공 시간・접객・청결도 등)을 파악하고, 운영 개선과 정성스러운 답글로 평점을 높이세요.`,
    hours_t: "영업시간 등록",
    hours_d: "영업시간이 설정되어 있지 않습니다. 요일별 영업시간・정기 휴무일・공휴일 대응・특별 영업을 등록하세요.",
    photos_t: "사진 늘리기",
    photos_d: (v) => `현재 ${v.count}장. ${v.photos} 등, 권장 ${v.rec}장 이상을 기준으로 고화질 사진을 추가・정기적으로 갱신하세요. 사진 수는 조회수와 클릭률에 직결됩니다.`,
    photos_light_d: (v) => `현재 ${v.count}장. ${v.photos} 등의 사진을 추가하세요.`,
    attrs_full_t: "부가정보(속성) 충실화",
    attrs_full_d: (v) => `${v.attrs} 등, 업종에 해당하는 속성이 있으면 등록하세요. ${v.svc ? "서비스업은 애초에 설정 가능한 속성이 적은 편이지만, " : ""}채울수록 '조건으로 좁히는' 검색에 노출되기 쉬워집니다.`,
    attrs_full_open_d: (v) => `${v.attrs} 등, 미설정 속성을 추가하세요. '조건으로 좁히는' 검색에 노출되기 쉬워집니다.`,
    attrs_light_t: "부가정보(속성) 등록",
    attrs_light_d: (v) => `${v.attrs} 등, 업종에 해당하는 속성을 등록하세요.`,
    lowrev_t: "낮은 평점 대응",
    lowrev_d: (v) => `★1~2의 비율이 다소 높습니다(${v.pct}%). 공통된 불만 사항을 파악하고, 운영 개선과 진정성 있는 답글로 인상을 회복하세요.`,
    recency_t: "리뷰 신규 등록 속도 회복",
    recency_d: (v) => `최신 리뷰가 ${v.days}일 전입니다. 정기적인 리뷰 요청으로 새 리뷰가 끊기지 않게 하세요. 신선도도 평가 신호가 됩니다.`,
    ok_t: "프로필 완성도가 양호합니다",
    ok_d: "확인 가능한 기본 항목에 큰 누락은 없습니다. 아래 레이더・각 지표로 현황을 확인하면서, 아래 습관화로 상위를 노리세요.",
    maintain_t: "현재 강점을 유지・더욱 강화",
    maintain_d: "리뷰 답글과 최신 정보의 정기 게시를 이어가고 사진을 계속 늘리면, 더 높은 상위 노출과 방문율 향상을 기대할 수 있습니다.",
  },
  zh: {
    website_t: "登錄網站/預約連結",
    website_d: "尚未登錄官方網站・社群・線上預約連結。登錄後可提升資訊可信度，避免在顧客造訪前流失。",
    phone_t: "登錄電話號碼",
    phone_d: "尚未登錄電話號碼。請務必登錄，作為洽詢・預約的聯絡管道。",
    subcat_t: "新增次要類別",
    subcat_d: (v) => `目前僅設定主要類別。新增符合服務內容的次要類別（${v.subcat}）可擴大相關關鍵字的曝光。`,
    revcount_t: "增加評論數量",
    revcount_d: (v) => `目前 ${v.count} 則。可透過結帳時的一句話或櫃台旁的 QR・名片，將邀請評論制度化。評論數量是排名的主要因素。`,
    rating_t: "提升平均評分",
    rating_d: (v) => `目前 ★${v.rating}。請找出低評分的原因（出餐時間・服務・清潔度等），透過營運改善與用心回覆來提升評分。`,
    hours_t: "登錄營業時間",
    hours_d: "尚未設定營業時間。請登錄各星期的營業時間・公休日・國定假日營業・特殊營業時間。",
    photos_t: "增加照片",
    photos_d: (v) => `目前 ${v.count} 張。請以建議的 ${v.rec} 張以上為目標，新增 ${v.photos} 等高畫質照片並定期更新。照片數量直接影響瀏覽數與點擊率。`,
    photos_light_d: (v) => `目前 ${v.count} 張。請新增 ${v.photos} 等照片。`,
    attrs_full_t: "充實屬性資訊",
    attrs_full_d: (v) => `若有符合行業的屬性，例如 ${v.attrs} 等，請加以登錄。${v.svc ? "服務業本身可設定的屬性較少，但 " : ""}填得越完整，越容易出現在「依條件篩選」的搜尋結果中。`,
    attrs_full_open_d: (v) => `請新增尚未設定的屬性，例如 ${v.attrs} 等。如此更容易出現在「依條件篩選」的搜尋結果中。`,
    attrs_light_t: "登錄屬性資訊",
    attrs_light_d: (v) => `請登錄符合行業的屬性，例如 ${v.attrs} 等。`,
    lowrev_t: "處理低評分",
    lowrev_d: (v) => `★1~2 的比例略高（${v.pct}%）。請找出共通的不滿點，透過營運改善與誠懇回覆來挽回印象。`,
    recency_t: "恢復新評論的累積速度",
    recency_d: (v) => `最新評論為 ${v.days} 天前。請透過定期邀請評論，讓新評論不間斷。新近度也是新鮮度的訊號。`,
    ok_t: "檔案完善度良好",
    ok_d: "可確認的基本項目沒有重大缺漏。請透過下方的雷達圖・各項指標確認現況，並將下列習慣化以爭取更高排名。",
    maintain_t: "維持並進一步強化現有優勢",
    maintain_d: "持續回覆評論並定期發布最新資訊，並不斷增加照片，即可爭取更高的排名與來客率。",
  },
};

function buildTips(
  p: ReturnType<typeof normalizeDetails>,
  profile: ReturnType<typeof scoreProfile>,
  e?: Enriched,
  now: Date = new Date(),
  activity?: ReviewActivity | null,
  uiLang: UiLang = "ja",
): Tip[] {
  const T = TIP_T[uiLang];
  const tt = (k: string): string => T[k] as string;
  const td = (k: string, v: Record<string, string | number> = {}): string => {
    const e2 = T[k];
    return typeof e2 === "function" ? e2(v) : (e2 as string);
  };
  const ratio = (key: string) => {
    const c = profile.categories.find(x => x.key === key);
    return c ? c.score / c.max : 1;
  };
  const items: { r: number; title: string; detail: string }[] = [];
  const bp = bizProfile(p.primaryType, p.types, uiLang);
  // 公式Places属性(信頼可)とOutscraper(補助)の多い方＝取りこぼしに強い属性件数
  const reliableAttr = Math.max(p.attributeCount, e ? e.attributeFilled : 0);

  // ---- 基本情報 ----
  if (!p.websiteUri) items.push({ r: ratio("nap"), title: tt("website_t"), detail: tt("website_d") });
  if (!p.nationalPhoneNumber) items.push({ r: ratio("nap"), title: tt("phone_t"), detail: tt("phone_d") });

  if (p.types.filter(t => t !== p.primaryType).length === 0)
    items.push({ r: ratio("category"), title: tt("subcat_t"), detail: td("subcat_d", { subcat: bp.subcat }) });

  if (p.userRatingCount < 30)
    items.push({ r: ratio("reviews"), title: tt("revcount_t"), detail: td("revcount_d", { count: p.userRatingCount }) });
  if (p.rating != null && p.rating < 4.0)
    items.push({ r: ratio("reviews"), title: tt("rating_t"), detail: td("rating_d", { rating: p.rating.toFixed(1) }) });

  // 宿泊業は「営業時間」概念が薄く、Placesでも取得しづらいため誤検知を避けて出さない
  if (!p.hasRegularHours && bp.kind !== "lodging") items.push({ r: ratio("hours"), title: tt("hours_t"), detail: tt("hours_d") });

  if (e) {
    // 「最新情報の投稿◯日前」はデータ更新の遅延でズレるため“表には出さない”。
    // 鮮度(postFresh)は scoring.ts で「最新性」スコアに反映済み（裏側の評価として保持）。

    if (e.photosCount < REC_PHOTOS)
      items.push({ r: ratio("photos"), title: tt("photos_t"), detail: td("photos_d", { count: e.photosCount, photos: bp.photos, rec: REC_PHOTOS }) });

    // 公式属性＋補助の信頼件数で判定（3件未満のみ提案）。宿泊業は不可測項目が多いため出さない。
    if (reliableAttr < 3 && bp.kind !== "lodging")
      items.push({ r: ratio("extras"), title: tt("attrs_full_t"), detail: bp.limitedAttrs
        ? td("attrs_full_d", { attrs: bp.attrs, svc: (bp.kind === "professional" || bp.kind === "education") ? 1 : 0 })
        : td("attrs_full_open_d", { attrs: bp.attrs }) });

    const rpsValues = Object.values(e.reviewsPerScore);
    const rpsTotal = rpsValues.reduce((a, b) => a + b, 0);
    const low = (e.reviewsPerScore["1"] ?? 0) + (e.reviewsPerScore["2"] ?? 0);
    if (rpsTotal > 0 && low / rpsTotal > 0.2)
      items.push({ r: ratio("reviews"), title: tt("lowrev_t"), detail: td("lowrev_d", { pct: Math.round((low / rpsTotal) * 100) }) });
  } else {
    if (p.photoCount < 10)
      items.push({ r: ratio("photos"), title: tt("photos_t"), detail: td("photos_light_d", { count: p.photoCount, photos: bp.photos }) });
    if (!bp.limitedAttrs && bp.kind !== "lodging" && reliableAttr < 3)
      items.push({ r: ratio("extras"), title: tt("attrs_light_t"), detail: td("attrs_light_d", { attrs: bp.attrs }) });
  }

  if (activity && activity.latestDays != null && activity.latestDays > 60)
    items.push({ r: ratio("reviews"), title: tt("recency_t"), detail: td("recency_d", { days: activity.latestDays }) });

  // 弱いカテゴリ由来を先頭へ、ratioで優先度を決定
  items.sort((a, b) => a.r - b.r);
  const level = (r: number): Tip["level"] => (r < 0.5 ? "high" : r < 0.8 ? "mid" : "info");
  const out: Tip[] = items.map(i => ({ title: i.title, detail: i.detail, level: level(i.r) }));

  // 良好な店でも中身が薄くならないよう、維持・強化の提案を補足
  if (out.length === 0)
    out.push({ title: tt("ok_t"), level: "info", detail: tt("ok_d") });
  if (out.length < 3)
    out.push({ title: tt("maintain_t"), level: "info", detail: tt("maintain_d") });

  return out;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
