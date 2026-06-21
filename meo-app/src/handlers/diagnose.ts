import { verifyTurnstile } from "../lib/turnstile";
import { checkRateLimit } from "../lib/ratelimit";
import { getCached, setCached } from "../lib/cache";
import { findPlace, getDetails, findCompetitors, normalizeDetails, normalizeLight } from "../lib/places";
import { scoreProfile, rankAmong, prominenceLight } from "../lib/scoring";
import { weightsFor } from "../lib/weights";

export interface Env {
  CACHE: KVNamespace;
  RATELIMIT: KVNamespace;
  GOOGLE_PLACES_API_KEY: string;
  TURNSTILE_SECRET: string;
}

const RATE_LIMIT_PER_DAY = 20;
const VISIBLE_TIPS = 3; // 無料版で見せる改善ポイント数（もったいぶり）

interface Body { name: string; area: string; compare: boolean; turnstileToken: string; }

export async function handleDiagnose(req: Request, env: Env): Promise<Response> {
  const ip = req.headers.get("CF-Connecting-IP") ?? "0.0.0.0";
  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  if (!body.name || !body.area) return json({ error: "missing_fields" }, 400);

  if (!(await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET, ip)))
    return json({ error: "bot_check_failed" }, 403);

  // レート制限はキャッシュ判定より前＝キャッシュヒットも1回としてカウント（連打抑止のため意図的）
  const date = new Date().toISOString().slice(0, 10);
  const rate = await checkRateLimit(env.RATELIMIT, ip, date, RATE_LIMIT_PER_DAY);
  if (!rate.allowed) return json({ error: "rate_limited" }, 429);

  // v3: 採点(extras)・改善ポイントの正確性改善に伴い旧キャッシュを無効化（結果ロジック変更時はここを上げる）
  const cacheKey = `diag:v3:${body.name}|${body.area}|${body.compare ? 1 : 0}`;
  const cached = await getCached(env.CACHE, cacheKey);
  if (cached) return json(cached);

  try {
    const found = await findPlace(body.name, body.area, env.GOOGLE_PLACES_API_KEY);
    if (!found) return json({ error: "not_found" }, 404);

    const details = normalizeDetails(await getDetails(found.id, env.GOOGLE_PLACES_API_KEY));
    const weights = weightsFor(details.primaryType);
    const profile = scoreProfile(details, weights, new Date());

    const tips = buildTips(details, profile);

    let ranking = null;
    if (body.compare) {
      const raw = await findCompetitors(details.primaryType, body.area, env.GOOGLE_PLACES_API_KEY);
      const comps = raw.filter((c: any) => c.id !== details.placeId).map(normalizeLight);
      ranking = rankAmong(details, comps);
    }

    const result = {
      name: details.displayName,
      area: body.area,
      profile,
      prominence: prominenceLight(details),
      ranking,
      tipsVisible: tips.slice(0, VISIBLE_TIPS),
      tipsLockedCount: Math.max(0, tips.length - VISIBLE_TIPS),
    };
    await setCached(env.CACHE, cacheKey, result);
    return json(result);
  } catch {
    return json({ error: "upstream_error" }, 502);
  }
}

/**
 * 実データで「確実に判定できる」欠落・不足のみから改善ポイントを生成し、弱いカテゴリ順に並べる。
 * Places APIで取得できない項目（口コミ返信の有無・投稿頻度・動画・オーナー設定の説明文・価格帯の設定有無）は
 * 断定しない（実態との不整合を避ける＝正確性優先）。
 */
function buildTips(p: ReturnType<typeof normalizeDetails>, profile: ReturnType<typeof scoreProfile>): string[] {
  const ratio = (key: string) => {
    const c = profile.categories.find(x => x.key === key);
    return c ? c.score / c.max : 1;
  };
  const items: { r: number; t: string }[] = [];

  // 基本情報（欠落は確実に判定可能）
  if (!p.websiteUri) items.push({ r: ratio("nap"), t: "Webサイトのリンクを登録する" });
  if (!p.nationalPhoneNumber) items.push({ r: ratio("nap"), t: "電話番号を登録する" });

  // カテゴリ
  if (p.types.filter(t => t !== p.primaryType).length === 0)
    items.push({ r: ratio("category"), t: "副カテゴリを追加して関連性を高める" });

  // 口コミ（件数・評価のみ＝確実に判定可能。返信有無・新着はAPIで取得不可のため判定しない）
  if (p.userRatingCount < 30)
    items.push({ r: ratio("reviews"), t: `口コミ件数を増やす（現在${p.userRatingCount}件）— レビュー依頼を強化` });
  if (p.rating != null && p.rating < 4.0)
    items.push({ r: ratio("reviews"), t: `平均評価を改善する（現在★${p.rating.toFixed(1)}）` });

  // 写真
  if (p.photoCount < 10)
    items.push({ r: ratio("photos"), t: `写真を充実させる（現在${p.photoCount}枚）` });

  // 営業時間
  if (!p.hasRegularHours) items.push({ r: ratio("hours"), t: "営業時間を登録する" });

  // 付加情報
  // ※「ビジネスの説明文」はPlaces APIで“オーナー設定の説明文”の有無を取得できない
  //   （editorialSummaryはGoogleの要約で別物）ため、断定せず出さない。
  // ※価格帯(priceLevel)も未設定か非該当かを確実に区別できないため断定しない。
  // 飲食系のみ、確実に取得できる属性ブール値で判定する。
  const isFood = [p.primaryType, ...p.types].some(t => !!t && /restaurant|food|cafe|bar|bakery|meal_/.test(t));
  if (isFood && p.attributeCount < 2)
    items.push({ r: ratio("extras"), t: "属性（テイクアウト・予約・店内飲食など）を登録する" });

  // 弱いカテゴリ由来を先頭へ（=最優先として表示される）
  items.sort((a, b) => a.r - b.r);
  const tips = items.map(i => i.t);

  // 末尾に常時有効な一般推奨（特定の欠落を断定しない言い回し）
  tips.push("週1回を目安に『最新情報』を投稿すると鮮度が保てます");
  return tips;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
