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

  const date = new Date().toISOString().slice(0, 10);
  const rate = await checkRateLimit(env.RATELIMIT, ip, date, RATE_LIMIT_PER_DAY);
  if (!rate.allowed) return json({ error: "rate_limited" }, 429);

  const cacheKey = `diag:${body.name}|${body.area}|${body.compare ? 1 : 0}`;
  const cached = await getCached(env.CACHE, cacheKey);
  if (cached) return json(cached);

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
}

/** 整備スコアの弱点カテゴリから改善ポイント文を生成。 */
function buildTips(p: ReturnType<typeof normalizeDetails>, profile: ReturnType<typeof scoreProfile>): string[] {
  const tips: string[] = [];
  const ratio = (key: string) => {
    const c = profile.categories.find(x => x.key === key)!;
    return c.score / c.max;
  };
  if (ratio("reviews") < 0.7) tips.push("口コミの新着・返信を増やす（最近の口コミが不足しています）");
  if (ratio("extras") < 0.7) tips.push("サービス・メニュー・属性の詳細登録が未設定");
  if (!p.hasVideo) tips.push("短尺動画を1本追加する");
  if (ratio("photos") < 0.8) tips.push("写真を10枚以上に増やす");
  if (ratio("hours") < 0.8) tips.push("特別営業時間（祝日等）を設定する");
  if (ratio("category") < 1) tips.push("副カテゴリを追加して関連性を高める");
  if (ratio("nap") < 1) tips.push("基本情報（電話・サイト等）の未入力を埋める");
  tips.push("週次で最新情報を投稿し鮮度を保つ");
  return tips;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
