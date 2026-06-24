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
}

const RATE_LIMIT_PER_DAY = 20;
const VISIBLE_TIPS = 3; // 無料版で見せる改善ポイント数（もったいぶり）

interface Body { name: string; area: string; compare: boolean; turnstileToken: string; admin?: string; }

export async function handleDiagnose(req: Request, env: Env): Promise<Response> {
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

  // v18: クチコミ件数/評価を実店舗ページ値(Outscraper)で採用＋競合表示増。旧キャッシュ無効化
  const cacheKey = `diag:v24:${body.name}|${body.area}|${body.compare ? 1 : 0}`;
  const cached = await getCached(env.CACHE, cacheKey);
  if (cached) return json(cached);

  try {
    const found = await findPlace(body.name, body.area, env.GOOGLE_PLACES_API_KEY);
    if (!found) return json({ error: "not_found" }, 404);

    const details = normalizeDetails(await getDetails(found.id, env.GOOGLE_PLACES_API_KEY));
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

    const tips = buildTips(details, profile, enriched ?? undefined, now, activity);

    let ranking = null;
    if (body.compare) {
      const raw = await findCompetitors(details.primaryType, body.area, env.GOOGLE_PLACES_API_KEY);
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
      ranking,
      tipsVisible: tips.slice(0, VISIBLE_TIPS),
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
    return json(result);
  } catch {
    return json({ error: "upstream_error" }, 502);
  }
}

/**
 * Google登録の住所を「番地より前」までに丸める。
 * 例: 「日本、〒900-0014 沖縄県那覇市松尾2丁目8-19」→「沖縄県那覇市松尾2丁目」
 * 丁目があればそこまで／無ければ末尾の番地数字を除去。郵便番号・国名は除去。
 */
export function trimAddress(a: string): string {
  if (!a) return "";
  let s = a.replace(/^日本[、,\s]*/, "").replace(/^Japan[,\s]*/i, "");
  s = s.replace(/〒?\s*\d{3}[-－]?\d{4}\s*/, ""); // 郵便番号
  s = s.trim();
  const chome = s.match(/^(.*?[0-9０-９]+\s*丁目)/); // 丁目まで残す
  if (chome) return chome[1].replace(/\s+/g, "");
  // 丁目表記が無い場合は最初の番地数字以降（建物名・号室も含む）をすべて落とす
  s = s.replace(/\s*[0-9０-９].*$/, "");
  return s.trim();
}

/**
 * 業種・業態を分類し、アクションプランで使う「業種に合った例文」を返す。
 * Places の primaryType / types からカテゴリを推定（飲食・美容・医療・宿泊・士業/専門サービス等）。
 * limitedAttrs=true の業種（ITコンサル等の専門サービス）は、そもそもGBPで設定できる属性が少ないため、
 * キャッシュレス/Wi-Fi 等の飲食・小売向け属性を勧めない文言にする。
 */
export interface BizProfile { kind: string; photos: string; attrs: string; subcat: string; limitedAttrs: boolean; }

// 業種判定ルール（上から順に評価。具体的な業種を先に置く）。Places の type は英語スネークケース。
const BIZ_RULES: { re: RegExp; p: BizProfile }[] = [
  { re: /laundr|dry_clean|coin_/, p: { kind: "laundromat", photos: "店内・設備（洗濯機/乾燥機）・外観・駐車場・利用案内", attrs: "24時間営業・駐車場・各種キャッシュレス決済・Wi-Fiなど", subcat: "例：コインランドリー＋宅配クリーニング", limitedAttrs: false } },
  { re: /car_|\bauto|vehicle|gas_station|motorcycle|\btire|car_wash|car_repair|car_dealer/, p: { kind: "auto", photos: "車両・店舗/工場外観・作業場・作業風景・スタッフ", attrs: "駐車場・各種キャッシュレス決済・見積無料・代車あり・即日対応など", subcat: "例：自動車整備＋車検、販売＋買取", limitedAttrs: false } },
  { re: /real_estate|estate_agent/, p: { kind: "real_estate", photos: "取扱物件・店舗外観/内観・スタッフ・周辺環境", attrs: "駐車場・オンライン相談対応・対応エリア・営業時間など", subcat: "例：不動産売買＋賃貸仲介、賃貸管理＋リフォーム", limitedAttrs: false } },
  { re: /contractor|plumber|electrician|painter|roofing|locksmith|moving_company|cleaning|pest_control|handyman|renovation|construction|exterminat/, p: { kind: "home-service", photos: "施工/対応事例（ビフォー/アフター）・スタッフ・作業風景・自社/店舗外観", attrs: "見積無料・対応エリア・オンライン相談対応・駐車場など", subcat: "例：外壁塗装＋リフォーム、ハウスクリーニング＋エアコン洗浄", limitedAttrs: false } },
  { re: /lodging|hotel|motel|resort|guest_house|hostel|ryokan|\binn\b|bed_and_breakfast|campground|cottage|capsule/, p: { kind: "lodging", photos: "客室・外観・館内設備・周辺・食事", attrs: "駐車場・Wi-Fi・チェックイン/アウト時間・対応言語など", subcat: "例：ホテル＋宴会場、旅館＋日帰り温泉", limitedAttrs: false } },
  { re: /dentist|doctor|hospital|clinic|health|physio|chiropract|pharmacy|drugstore|medical|veterinar|dental|nursing|therapist|acupunctur/, p: { kind: "medical", photos: "院内・外観・スタッフ・設備・受付の様子", attrs: "予約可・バリアフリー・駐車場・各種保険対応など", subcat: "例：整骨院＋鍼灸院、歯科＋小児歯科", limitedAttrs: false } },
  { re: /hair|beauty|salon|\bspa\b|nail|barber|massage|esthetic|eyelash|tanning|sauna|skin_care/, p: { kind: "beauty", photos: "施術例（ビフォー/アフター）・店内・スタッフ・メニュー表・外観", attrs: "予約可・各種キャッシュレス決済・個室・駐車場など", subcat: "例：美容室＋ヘッドスパ、ネイルサロン＋まつげエクステ", limitedAttrs: false } },
  { re: /gym|fitness|yoga|sports_|stadium|dance|martial|swimming|pilates|crossfit|golf/, p: { kind: "fitness", photos: "設備・館内・トレーニング/レッスン風景・スタッフ", attrs: "駐車場・更衣室/シャワー・見学体験可・キャッシュレス決済など", subcat: "例：ジム＋パーソナル、ヨガ＋ピラティス", limitedAttrs: false } },
  { re: /restaurant|\bfood|cafe|\bbar\b|bakery|meal_|izakaya|ramen|sushi|diner|\bpub\b|brewery|coffee|ice_cream|confectioner|\bdeli\b/, p: { kind: "food", photos: "料理・店内・外観・スタッフ・メニュー表", attrs: "テイクアウト・予約可・各種キャッシュレス決済・Wi-Fiなど", subcat: "例：居酒屋＋宴会場、カフェ＋ケーキ店", limitedAttrs: false } },
  { re: /school|education|tutor|university|preschool|kindergarten|training|lesson|library|cram|juku/, p: { kind: "education", photos: "教室/校舎・授業/レッスン風景・講師・教材・外観", attrs: "オンライン対応・駐車場・体験/見学可など、該当する項目", subcat: "例：学習塾＋オンライン講座、英会話＋資格対策", limitedAttrs: true } },
  { re: /night_club|nightclub|karaoke|cinema|movie_theater|amusement|bowling|casino|arcade|internet_cafe|game_center|\btheater\b/, p: { kind: "entertainment", photos: "店内・設備・イベント/プレイ風景・外観・メニュー", attrs: "予約可・駐車場・各種キャッシュレス決済・個室/貸切可など", subcat: "例：カラオケ＋飲食、バー＋イベントスペース", limitedAttrs: false } },
  { re: /store|\bshop|market|retail|clothing|grocery|supermarket|convenience|book|furniture|electronics|jewelry|florist|hardware|pet_store|liquor|department|\bmall\b|boutique|bicycle|optician/, p: { kind: "retail", photos: "商品・売場/店内・外観・陳列・スタッフ", attrs: "駐車場・各種キャッシュレス決済・通販/宅配対応など", subcat: "例：物販＋修理対応、小売＋カフェ併設", limitedAttrs: false } },
  { re: /consult|lawyer|account|finance|insurance|corporate_office|software|marketing|design|web_|advertis|legal|\btax\b|notary|architect|engineer|agency|\bcompany\b|\boffice\b|it_|technology|telecom|\bbank\b|attorney|recruit|employment/, p: { kind: "professional", photos: "オフィス外観・スタッフ・サービス内容や実績の資料・セミナー/打合せの様子", attrs: "オンライン相談対応・対応エリア・駐車場など、該当する項目", subcat: "例：ITコンサル＋システム開発、税理士＋経営コンサル", limitedAttrs: true } },
];
const BIZ_DEFAULT: BizProfile = { kind: "default", photos: "外観・内観・スタッフ・提供サービスの様子", attrs: "駐車場・オンライン対応など、業種に該当する項目", subcat: "提供サービスに合う副カテゴリ", limitedAttrs: true };

export function bizProfile(primaryType: string | undefined, types: string[]): BizProfile {
  const ts = [primaryType, ...(types || [])].filter(Boolean).map(t => String(t).toLowerCase());
  // primaryType を優先的に評価し、無ければ types 全体で判定
  for (const source of [primaryType ? [String(primaryType).toLowerCase()] : [], ts]) {
    for (const { re, p } of BIZ_RULES) if (source.some(t => re.test(t))) return p;
  }
  return BIZ_DEFAULT;
}

/**
 * 実データで「確実に判定できる」欠落・不足のみから改善ポイントを生成し、弱いカテゴリ順に並べる。
 * enrichedが渡された場合はリアルデータ（投稿頻度・返信率・写真数・属性充実度等）も活用する。
 */
interface Tip { title: string; detail: string; level: "high" | "mid" | "info"; }

function buildTips(
  p: ReturnType<typeof normalizeDetails>,
  profile: ReturnType<typeof scoreProfile>,
  e?: Enriched,
  now: Date = new Date(),
  activity?: ReviewActivity | null,
): Tip[] {
  const ratio = (key: string) => {
    const c = profile.categories.find(x => x.key === key);
    return c ? c.score / c.max : 1;
  };
  const items: { r: number; title: string; detail: string }[] = [];
  const bp = bizProfile(p.primaryType, p.types);

  // ---- 基本情報 ----
  if (!p.websiteUri) items.push({ r: ratio("nap"), title: "Webサイト/予約リンクを登録", detail: "公式サイト・SNS・ネット予約のリンクが未登録です。登録すると情報の信頼性が上がり、来店前のユーザーを取りこぼしません。" });
  if (!p.nationalPhoneNumber) items.push({ r: ratio("nap"), title: "電話番号を登録", detail: "電話番号が未登録です。問い合わせ・予約の導線として必ず登録しましょう。" });

  if (p.types.filter(t => t !== p.primaryType).length === 0)
    items.push({ r: ratio("category"), title: "副カテゴリを追加", detail: `主カテゴリだけになっています。提供サービスに合う副カテゴリ（${bp.subcat}）を追加すると、関連キーワードでの露出が広がります。` });

  if (p.userRatingCount < 30)
    items.push({ r: ratio("reviews"), title: "クチコミ件数を増やす", detail: `現在${p.userRatingCount}件。来店時の一声やレジ横のQR・カードでレビュー依頼を仕組み化しましょう。件数は上位表示の主要因です。` });
  if (p.rating != null && p.rating < 4.0)
    items.push({ r: ratio("reviews"), title: "平均評価を引き上げる", detail: `現在★${p.rating.toFixed(1)}。低評価の要因（提供時間・接客・清潔感など）を洗い出し、運用改善と丁寧な返信で評価を底上げしましょう。` });

  // 宿泊業は「営業時間」概念が薄く、Placesでも取得しづらいため誤検知を避けて出さない
  if (!p.hasRegularHours && bp.kind !== "lodging") items.push({ r: ratio("hours"), title: "営業時間を登録", detail: "営業時間が未設定です。曜日ごとの営業時間・定休日・祝日対応・特別営業を登録しましょう。" });

  if (e) {
    const d = daysSinceLatestPost(e.posts, now);
    if (e.posts.length === 0)
      items.push({ r: ratio("hours"), title: "最新情報の投稿を始める", detail: "前回調査時点で『最新情報』の投稿が確認できませんでした。週1回を目安に、お知らせ・実績/事例・キャンペーン・季節の情報・臨時休業などを投稿しましょう。投稿の鮮度は検索順位に直結します。" });
    else if (d > 60)
      items.push({ r: ratio("hours"), title: "最新情報の投稿を継続", detail: `前回調査時点で最新投稿が約${Math.round(d)}日前でした。週1回を目安に投稿を続けましょう（既に再開済みなら次回調査で反映されます）。鮮度が順位に効きます。` });

    if (e.photosCount < REC_PHOTOS)
      items.push({ r: ratio("photos"), title: "写真を増やす", detail: `現在${e.photosCount}枚。${bp.photos}など、推奨${REC_PHOTOS}枚以上を目安に高画質写真を追加・定期更新しましょう。写真量は閲覧数とクリック率に直結します。` });

    // 属性は「埋まっている件数」で判定（割合は総数の多い業種で誤検知）。3件未満のときだけ提案。
    if (e.attributeFilled < 3)
      items.push({ r: ratio("extras"), title: "属性を充実させる", detail: bp.limitedAttrs
        ? `${bp.attrs}など、業種に該当する属性があれば登録しましょう。${bp.kind === "professional" || bp.kind === "education" ? "サービス業はそもそも設定できる属性が少なめですが、" : ""}埋めるほど『条件で絞り込む』検索にヒットしやすくなります。`
        : `${bp.attrs}など、未設定の属性を追加しましょう。『条件で絞り込む』検索にヒットしやすくなります。` });

    const rpsValues = Object.values(e.reviewsPerScore);
    const rpsTotal = rpsValues.reduce((a, b) => a + b, 0);
    const low = (e.reviewsPerScore["1"] ?? 0) + (e.reviewsPerScore["2"] ?? 0);
    if (rpsTotal > 0 && low / rpsTotal > 0.2)
      items.push({ r: ratio("reviews"), title: "低評価への対応", detail: `★1〜2の割合がやや高めです（${Math.round((low / rpsTotal) * 100)}%）。共通する不満点を特定し、運用改善＋誠実な返信で印象を回復しましょう。` });
  } else {
    if (p.photoCount < 10)
      items.push({ r: ratio("photos"), title: "写真を増やす", detail: `現在${p.photoCount}枚。${bp.photos}などの写真を追加しましょう。` });
    if (!bp.limitedAttrs && p.attributeCount < 2)
      items.push({ r: ratio("extras"), title: "属性を登録", detail: `${bp.attrs}など、業種に該当する属性を登録しましょう。` });
  }

  if (activity && activity.latestDays != null && activity.latestDays > 60)
    items.push({ r: ratio("reviews"), title: "クチコミの新着ペース回復", detail: `最新クチコミが${activity.latestDays}日前です。定期的なレビュー依頼で新着クチコミを絶やさないように。新着性も鮮度シグナルになります。` });

  // 弱いカテゴリ由来を先頭へ、ratioで優先度を決定
  items.sort((a, b) => a.r - b.r);
  const level = (r: number): Tip["level"] => (r < 0.5 ? "high" : r < 0.8 ? "mid" : "info");
  const out: Tip[] = items.map(i => ({ title: i.title, detail: i.detail, level: level(i.r) }));

  // 良好な店でも中身が薄くならないよう、維持・強化の提案を補足
  if (out.length === 0)
    out.push({ title: "整備度は良好です", level: "info", detail: "確認できる基本項目に大きな欠落はありません。下のレーダー・各指標で現状を確認しつつ、下記の習慣化で上位を狙いましょう。" });
  if (out.length < 3)
    out.push({ title: "今の強みを維持・さらに伸ばす", level: "info", detail: "クチコミへの返信と最新情報の定期投稿を継続し、写真を増やし続けることで、さらに上位表示と来店率の向上が狙えます。" });

  return out;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
