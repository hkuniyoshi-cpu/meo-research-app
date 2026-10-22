import { verifyTurnstile } from "../lib/turnstile";
import { checkRateLimit } from "../lib/ratelimit";
import { getCached, setCached } from "../lib/cache";
import { findPlace, getDetails, findCompetitors, findAreaScope, rectContains, normalizeDetails, normalizeLight, radiusFromArea, pickIndustry, cleanIndustry } from "../lib/places";
import type { Region, Rect, Industry, LatLng } from "../lib/places";
import { scoreProfile, rankAmong, prominenceLight, daysSinceLatestPost, REC_PHOTOS } from "../lib/scoring";
import { buildItems } from "../lib/items";
import type { PlaceData } from "../lib/types";
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

interface Body { name: string; area: string; compare: boolean; turnstileToken: string; admin?: string; uiLang?: string; industry?: string; }

/** 外部APIから取った素データ。競合比較の業種だけ変えて再計算できるよう、結果とは別にキャッシュする。 */
interface BaseData { details: PlaceData; enriched: Enriched | null; activity: ReviewActivity | null; fetchedAt: number; }

/** 競合比較を出せなかった理由。ok 以外は ranking=null。 */
type RankingStatus = "ok" | "off" | "need_industry" | "no_location" | "no_peers" | "error";

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

  // 競合比較の業種キーワード（任意）。比較しない診断では使わない
  const industryKw = body.compare ? cleanIndustry(body.industry) : "";

  // キャッシュするのは外部APIから取った素データ（店舗情報 base / エリア area / 比較母集団 pool）だけ。
  // 診断結果は毎回そこから計算し直す。結果ごと保存すると、後から母集団に加わった店が古い結果に反映されず、
  // 同じエリアの店どうしで順位が食い違うため。
  try {
    // Places API の取得言語は選択中のUI言語に追従（店舗名・住所を選択言語で表示）
    const lang = ({ ja: "ja", en: "en", ko: "ko", zh: "zh-TW" } as Record<UiLang, string>)[uiLang] || "en";

    // v2: 投稿が欠けた応答を14日間保存していた不具合の修正に伴い、旧データを破棄
    const baseKey = "base:v2:" + JSON.stringify([body.name, body.area, uiLang]);
    let base = await getCached<BaseData>(env.CACHE, baseKey);
    const baseCached = !!base;
    if (!base) {
      const found = await findPlace(body.name, body.area, env.GOOGLE_PLACES_API_KEY, lang);
      if (!found) { sendLog({ status: "not_found" }); return json({ error: "not_found" }, 404); }
      const fetched = normalizeDetails(await getDetails(found.id, env.GOOGLE_PLACES_API_KEY, lang));

      // Outscraper enrichment（失敗時はnullにデグレード）
      let en: Enriched | null = null;
      let act: ReviewActivity | null = null;
      // 投稿が無いことを確認済みの店（2回続けて空だった店）には、投稿の取り直しをしない
      const noPostsKey = "noposts:v1:" + fetched.placeId;
      const noPostsConfirmed = !!(await getCached(env.CACHE, noPostsKey));
      if (env.OUTSCRAPER_API_KEY) {
        try {
          // 出力前の再チェック：取得が不完全（実在店なのに写真もクチコミ分布も空）なら一度だけ取り直す
          const incomplete = (x: Enriched | null) => !x || (x.photosCount === 0 && Object.keys(x.reviewsPerScore).length === 0);
          en = await fetchEnriched(body.name, body.area, env.OUTSCRAPER_API_KEY);
          if (incomplete(en)) {
            const retry = await fetchEnriched(body.name, body.area, env.OUTSCRAPER_API_KEY);
            if (!incomplete(retry)) en = retry;
          } else if (en && en.posts.length === 0 && !noPostsConfirmed) {
            // 投稿だけ欠けた応答が一時的に返ることがある（写真・認証は取れているのに投稿が空）。一度だけ取り直す
            try {
              const retry = await fetchEnriched(body.name, body.area, env.OUTSCRAPER_API_KEY);
              // 対象の店と照合（place_id が無い応答は初回と同じく照合できないものとして採用）
              if (retry && retry.posts.length > 0 && (!retry.placeId || retry.placeId === fetched.placeId)) en = retry;
            } catch {
              // 取り直しに失敗しても、クチコミの取得へ進む
            }
          }
        } catch {
          // 取れた分だけ使う
        }
        try {
          act = await fetchReviewActivity(body.name, body.area, env.OUTSCRAPER_API_KEY, 10);
        } catch {
          // 取れた分だけ使う
        }
      }
      // Outscraperが別の店を返していたら、その情報は使わない（他店のデータで採点しない）
      if (en && en.placeId && en.placeId !== fetched.placeId) { en = null; act = null; }
      base = { details: fetched, enriched: en, activity: act, fetchedAt: Date.now() };
      // 投稿が取れなかったとき：初めてなら一時的な欠けの可能性があるので短時間だけ保存し、次の診断で取り直す。
      // 2回続けて空なら「投稿が無い店」と確定し、以後は通常どおり保存する（毎回の取り直しで費用が膨らまないように）
      let ttl: number | undefined;
      if (en && en.posts.length === 0) {
        if (noPostsConfirmed) ttl = undefined;
        else if (await getCached(env.CACHE, "noposts-seen:v1:" + fetched.placeId)) {
          await setCached(env.CACHE, noPostsKey, { at: Date.now() });
        } else {
          await setCached(env.CACHE, "noposts-seen:v1:" + fetched.placeId, { at: Date.now() }, 2 * 86400);
          ttl = 6 * 3600;
        }
      }
      await setCached(env.CACHE, baseKey, base, ttl);
    }
    const { details, enriched, activity } = base;

    // 競合はPlacesの値で指数を出すため、対象もPlaces由来の値で比べる（データ元をそろえる）
    const rankTarget: PlaceData = { ...details };

    // 実店舗ページのクチコミ件数/評価を正として採用（Placesの曖昧マッチで件数がズレるのを防ぐ）
    if (enriched && enriched.reviewCount != null) {
      details.userRatingCount = enriched.reviewCount;
      if (enriched.rating != null) details.rating = enriched.rating;
    }

    // 「◯日前」などの経過日数は取得時点が基準。再利用時も取得した日を調査日として扱い、判定がずれないようにする
    const now = new Date(base.fetchedAt);
    const weights = weightsFor(details.primaryType);
    const profile = scoreProfile(details, weights, now, enriched ?? undefined);

    // 業種区分（項目の判定基準と、改善例の文言に使う）。例文は言語切替に備えて全言語分を持たせる
    const UI_LANGS: UiLang[] = ["ja", "en", "ko", "zh"];
    const biz = bizProfile(details.primaryType, details.types, "ja");
    const bizByLang = Object.fromEntries(UI_LANGS.map((L) => {
      const b = bizProfile(details.primaryType, details.types, L);
      return [L, { photos: b.photos, attrs: b.attrs, subcat: b.subcat }];
    }));
    const items = buildItems(details, enriched ?? undefined, activity, biz, now);

    let ranking = null;
    let rankingStatus: RankingStatus = "off";
    // 何を基準に比べたか（順位を出せなかった場合も、画面で理由を説明するために返す）
    let rankingBasis: { mode: string; label: string; scope: RankScope } | null = null;
    if (body.compare) {
      const industry = pickIndustry(industryKw, enriched?.category, details.primaryType, details.primaryTypeLabel);
      if (!details.location) rankingStatus = "no_location";
      else {
        const center = { latitude: details.location.latitude, longitude: details.location.longitude };
        const region = await resolveRegion(env, body.area, center, lang);
        const scope: RankScope = region.kind === "area"
          ? { kind: "area", name: region.name }
          : { kind: "radius", km: Math.round(region.radiusMeters / 1000) };
        if (industry) rankingBasis = { mode: industry.mode, label: industry.label, scope };
        if (!industry) rankingStatus = "need_industry";
        else {
          try {
            const pool = await competitorPool(env, industry, region, lang, rankTarget);
            // 対象自身を除外（重複placeIdは pool 作成時に集約済み）
            const comps = pool.places.filter(p => p.placeId !== details.placeId);
            // 対象が母集団に入っているときは、その値で指数を出す（他の店の表に出る値と同じものを使い、互いの順位を一致させる）
            const selfRank = pool.places.find(p => p.placeId === details.placeId) ?? rankTarget;
            if (comps.length === 0) rankingStatus = "no_peers";
            else {
              const rank = rankAmong(selfRank, comps);
              // 同一チェーン（表示名の正規化一致）の件数
              const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "").replace(/[（）()【】\[\]・\-‐‑–—_～〜\/／]/g, "");
              const targetKey = norm(details.displayName);
              // 「◯◯整骨院」と「◯◯整骨院 浦添店」のように、片方がもう片方で始まる場合も同一系列とみなす（短すぎる名前は除く）
              const sameBrand = (a: string, b: string) => {
                if (a === b) return true;
                const [short, long] = a.length <= b.length ? [a, b] : [b, a];
                return short.length >= 5 && long.startsWith(short);
              };
              const sameBrandCount = comps.filter(c => sameBrand(norm(c.displayName), targetKey)).length;
              ranking = {
                ...rank,
                // 順位表の対象行に出す値（競合と同じPlaces由来）
                self: { rating: selfRank.rating ?? null, reviews: selfRank.userRatingCount },
                basis: { mode: industry.mode, label: industry.label },
                scope,
                sameBrandCount,
                fetched: pool.fetched, // 検索で取得した件数（範囲外を含む）
                capped: pool.capped,   // 取得上限で打ち切り＝範囲内の全店ではない
                few: comps.length < 3,  // 同業が少なく順位としては参考値
              };
              rankingStatus = "ok";
            }
          } catch {
            // 競合取得失敗は診断全体を落とさない。タイプ指定が通らない業種は、業種の指定を促す
            rankingStatus = industry.mode === "type" ? "need_industry" : "error";
          }
        }
      }
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
      const self = ranking;
      const above = self.competitors
        .filter((c) => c.index > self.index)
        .sort((a, b) => a.index - b.index)[0];
      if (above) nextRank = { gap: Math.max(1, Math.round(above.index - self.index)), rank: self.rank, total: self.total };
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

    const nameMismatch = !isNameLike(body.name, details.displayName);

    const result = {
      name: details.displayName,
      inputName: body.name,
      nameMismatch,
      area: body.area,
      address: trimAddress(details.formattedAddress) || body.area,
      investigatedAt: now.toISOString().slice(0, 10),
      profile,
      items,
      biz: { kind: biz.kind, limitedAttrs: biz.limitedAttrs },
      bizByLang,
      prominence: ranking ? ranking.index : prominenceLight(rankTarget),
      rating: details.rating ?? null,
      reviewCount: details.userRatingCount,
      location: details.location ? { lat: details.location.latitude, lng: details.location.longitude } : null,
      ranking,
      rankingStatus,
      rankingBasis,
      industry: industryKw,
      // Outscraper enriched fields (null when unavailable)
      // 応答に値が無かった項目は null（未認証・0枚と断定しない）
      verified: enriched && enriched.known.verified ? enriched.verified : null,
      photosCount: enriched && enriched.known.photos ? enriched.photosCount : null,
      recPhotos: REC_PHOTOS,
      reviewActivity: activity,
      latestPostDays: enriched
        ? (enriched.posts.length ? Math.round(daysSinceLatestPost(enriched.posts, now)) : null)
        : null,
      prediction,
    };
    sendLog({ status: baseCached ? "cached" : "ok", ...resultLogFields(result) });
    return json(result);
  } catch {
    sendLog({ status: "upstream_error" });
    return json({ error: "upstream_error" }, 502);
  }
}

/** 画面に出す比較範囲。area=入力エリアの範囲 / radius=対象中心の半径。 */
type RankScope = { kind: "area"; name: string } | { kind: "radius"; km: number };

/**
 * 競合を探す範囲を決める。
 * 入力エリアが県・市などの行政区画で、対象店がその中にあれば、そのエリアの範囲で比べる
 * （同じエリアを指定した店どうしは同じ母集団になり、順位の整合が取れる）。
 * 番地まで入力された場合や解決できない場合は、対象店を中心とする半径で比べる。
 */
async function resolveRegion(env: Env, area: string, center: LatLng, lang: string): Promise<Region> {
  const radius: Region = { kind: "radius", center, radiusMeters: radiusFromArea(area) };
  // 数字を含む入力は番地レベルとみなし、エリア解決のAPI呼び出しを省く
  if (!area.trim() || /[0-9０-９]/.test(area)) return radius;
  try {
    const key = "area:v1:" + JSON.stringify([area.trim(), lang]);
    let hit = await getCached<{ scope: { name: string; rect: Rect } | null }>(env.CACHE, key);
    if (!hit) {
      hit = { scope: await findAreaScope(area.trim(), env.GOOGLE_PLACES_API_KEY, lang) };
      await setCached(env.CACHE, key, hit);
    }
    if (hit.scope && rectContains(hit.scope.rect, center)) return { kind: "area", name: hit.scope.name, rect: hit.scope.rect };
  } catch {
    // エリアを解決できなければ半径で比べる
  }
  return radius;
}

const POOL_TTL_SEC = 14 * 86400;

/** 比較対象の母集団（業種×範囲）。同じ条件の診断で共有できるよう、結果とは別にキャッシュする。 */
interface Pool { places: PlaceData[]; fetched: number; capped: boolean; createdAt: number; }

async function competitorPool(env: Env, industry: Industry, region: Region, lang: string, target: PlaceData): Promise<Pool> {
  const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
  const where = region.kind === "area"
    ? ["a", r5(region.rect.low.latitude), r5(region.rect.low.longitude), r5(region.rect.high.latitude), r5(region.rect.high.longitude)]
    : ["r", r5(region.center.latitude), r5(region.center.longitude), region.radiusMeters];
  const key = "pool:v1:" + JSON.stringify([industry.mode, industry.keyword ?? industry.type, lang, where]);
  let pool = await getCached<Pool>(env.CACHE, key);
  let changed = false;
  if (!pool) {
    const search = await findCompetitors(industry, region, env.GOOGLE_PLACES_API_KEY, lang);
    const seen = new Set<string>();
    const places: PlaceData[] = [];
    for (const c of search.places) {
      if (!c?.id || seen.has(c.id)) continue;
      seen.add(c.id);
      places.push(normalizeLight(c));
    }
    pool = { places, fetched: search.fetched, capped: search.capped, createdAt: Date.now() };
    changed = true;
  }
  // エリアで比べるときは、検索結果に出てこなかった診断済みの店も母集団に加える。
  // 件数に上限がある検索では系列店どうしが互いの表に入らないことがあり、順位が食い違うため。
  // ただし利用者が業種を指定した比較では加えない（その業種の店だと確認できず、他の人の比較に異業種が混ざるため）。
  // KV には排他制御が無く、同時に追記すると片方が消えることがあるが、その店は次に診断されたとき改めて加わる。
  if (region.kind === "area" && industry.mode !== "keyword" && !pool.places.some(p => p.placeId === target.placeId)) {
    pool.places.push({
      placeId: target.placeId, displayName: target.displayName, formattedAddress: "", types: [],
      rating: target.rating, userRatingCount: target.userRatingCount, reviews: [],
      photoCount: target.photoCount, hasVideo: false, hasRegularHours: false, hasSpecialHours: false,
      attributeCount: 0, hasReservationLink: false, hasMenuLink: false, location: target.location,
    });
    changed = true;
  }
  // 追記しても有効期限は延ばさない（最初に取得した時点から14日で取り直す）
  if (changed) {
    const ageSec = Math.floor((Date.now() - pool.createdAt) / 1000);
    await setCached(env.CACHE, key, pool, Math.max(60, POOL_TTL_SEC - ageSec));
  }
  return pool;
}

// スプレッドシート用に結果から要点だけ抽出
function resultLogFields(r: any): Record<string, unknown> {
  return {
    resultName: r?.name ?? "",
    resultAddress: r?.address ?? "",
    nameMismatch: r?.nameMismatch ? "1" : "0",
    score: r?.profile?.total ?? "",
    scoreRank: gradeOf(r?.profile?.total),
    verified: r?.verified == null ? "" : (r.verified ? "1" : "0"),
    photos: r?.photosCount ?? "",
    reviews: r?.reviewCount ?? "",
    rating: r?.rating ?? "",
    rankingRank: r?.ranking?.rank ?? "",
    rankingTotal: r?.ranking?.total ?? "",
    rankingStatus: r?.rankingStatus ?? "",
    rankIndustry: r?.ranking?.basis?.label ?? "",
    industryInput: r?.industry ?? "",
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
 * 入力店舗名と Google Places 解決名が「同じ店を指していそうか」を判定。
 * 表記ゆれ（大小・全角半角・カタカナ↔ひらがな・記号・空白）を吸収した上で
 * どちらかがどちらかを内包 or バイグラム Jaccard 類似度 ≥ 0.25 を"一致"とみなす。
 */
export function isNameLike(input: string, resolved: string): boolean {
  const norm = (s: string): string => {
    if (!s) return "";
    let x = s.normalize("NFKC").toLowerCase();
    // 記号・空白の除去（区切り字・カッコ・句読点等）
    x = x.replace(/[\s\-–—_・･(){}\[\]（）【】「」『』/／\\|,、。.．:：;；!！?？"'`~＝=＋+*]/g, "");
    // カタカナ→ひらがな
    x = x.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
    return x;
  };
  const a = norm(input);
  const b = norm(resolved);
  if (!a || !b) return true; // データ不足時は警告しない
  if (a === b) return true;
  if (a.length >= 3 && b.includes(a)) return true;
  if (b.length >= 3 && a.includes(b)) return true;

  // バイグラム Jaccard 類似度
  const bigrams = (s: string): Set<string> => {
    const g = new Set<string>();
    if (s.length < 2) { g.add(s); return g; }
    for (let i = 0; i < s.length - 1; i++) g.add(s.substring(i, i + 2));
    return g;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  A.forEach((g) => { if (B.has(g)) inter++; });
  const union = A.size + B.size - inter;
  const jaccard = union > 0 ? inter / union : 0;
  return jaccard >= 0.25;
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

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
