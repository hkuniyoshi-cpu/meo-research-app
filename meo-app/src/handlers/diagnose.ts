import { verifyTurnstile } from "../lib/turnstile";
import { checkRateLimit } from "../lib/ratelimit";
import { getCached, setCached } from "../lib/cache";
import { findPlace, getDetails, findCompetitors, normalizeDetails, normalizeLight } from "../lib/places";
import { scoreProfile, rankAmong, prominenceLight, daysSinceLatestPost, REC_PHOTOS } from "../lib/scoring";
import { weightsFor } from "../lib/weights";
import { fetchEnriched, fetchReplyStats } from "../lib/outscraper";
import type { Enriched } from "../lib/outscraper";

export interface Env {
  CACHE: KVNamespace;
  RATELIMIT: KVNamespace;
  GOOGLE_PLACES_API_KEY: string;
  TURNSTILE_SECRET: string;
  OUTSCRAPER_API_KEY: string;
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

  // v7: 写真推奨枚数(50)を採点・出力に反映。旧キャッシュを無効化
  const cacheKey = `diag:v7:${body.name}|${body.area}|${body.compare ? 1 : 0}`;
  const cached = await getCached(env.CACHE, cacheKey);
  if (cached) return json(cached);

  try {
    const found = await findPlace(body.name, body.area, env.GOOGLE_PLACES_API_KEY);
    if (!found) return json({ error: "not_found" }, 404);

    const details = normalizeDetails(await getDetails(found.id, env.GOOGLE_PLACES_API_KEY));
    const weights = weightsFor(details.primaryType);

    // Outscraper enrichment（失敗時はnullにデグレード）
    let enriched: Enriched | null = null;
    if (env.OUTSCRAPER_API_KEY) {
      try {
        enriched = await fetchEnriched(body.name, body.area, env.OUTSCRAPER_API_KEY);
        if (enriched) {
          const rs = await fetchReplyStats(body.name, body.area, env.OUTSCRAPER_API_KEY, 10);
          enriched.replySampled = rs.replySampled;
          enriched.replyReplied = rs.replyReplied;
        }
      } catch {
        enriched = null;
      }
    }

    const profile = scoreProfile(details, weights, new Date(), enriched ?? undefined);
    const now = new Date();

    const tips = buildTips(details, profile, enriched ?? undefined, now);

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
      // Outscraper enriched fields (null when unavailable)
      verified: enriched?.verified ?? null,
      photosCount: enriched?.photosCount ?? null,
      recPhotos: REC_PHOTOS,
      replyRate: enriched && enriched.replySampled > 0
        ? Math.round((enriched.replyReplied / enriched.replySampled) * 100)
        : null,
      latestPostDays: enriched
        ? (enriched.posts.length ? Math.round(daysSinceLatestPost(enriched.posts, now)) : null)
        : null,
      unverified: ["ビジネスの説明文", "動画", "価格帯"],
    };
    await setCached(env.CACHE, cacheKey, result);
    return json(result);
  } catch {
    return json({ error: "upstream_error" }, 502);
  }
}

/**
 * 実データで「確実に判定できる」欠落・不足のみから改善ポイントを生成し、弱いカテゴリ順に並べる。
 * enrichedが渡された場合はリアルデータ（投稿頻度・返信率・写真数・属性充実度等）も活用する。
 */
function buildTips(
  p: ReturnType<typeof normalizeDetails>,
  profile: ReturnType<typeof scoreProfile>,
  e?: Enriched,
  now: Date = new Date(),
): string[] {
  const ratio = (key: string) => {
    const c = profile.categories.find(x => x.key === key);
    return c ? c.score / c.max : 1;
  };
  const items: { r: number; t: string }[] = [];

  // ---- Universal tips (Places APIデータから確実に判定可能) ----
  if (!p.websiteUri) items.push({ r: ratio("nap"), t: "Webサイトのリンクを登録する" });
  if (!p.nationalPhoneNumber) items.push({ r: ratio("nap"), t: "電話番号を登録する" });

  if (p.types.filter(t => t !== p.primaryType).length === 0)
    items.push({ r: ratio("category"), t: "副カテゴリを追加して関連性を高める" });

  if (p.userRatingCount < 30)
    items.push({ r: ratio("reviews"), t: `口コミ件数を増やす（現在${p.userRatingCount}件）` });
  if (p.rating != null && p.rating < 4.0)
    items.push({ r: ratio("reviews"), t: `平均評価を改善する（現在★${p.rating.toFixed(1)}）` });

  if (!p.hasRegularHours) items.push({ r: ratio("hours"), t: "営業時間を登録する" });

  // ---- Enriched tips (Outscraperデータで実判定可能) ----
  if (e) {
    // 投稿（最新情報）
    const d = daysSinceLatestPost(e.posts, now);
    if (e.posts.length === 0) {
      items.push({ r: ratio("hours"), t: "最新情報（投稿）がありません。定期投稿を始めましょう" });
    } else if (d > 30) {
      items.push({ r: ratio("hours"), t: `最新情報の投稿が止まっています（最終投稿 約${Math.round(d)}日前）` });
    }

    // 口コミ返信率
    if (e.replySampled > 0 && (e.replyReplied / e.replySampled) < 0.5) {
      items.push({ r: ratio("reviews"), t: `口コミへの返信を増やす（直近${e.replySampled}件中${e.replyReplied}件のみ返信）` });
    }

    // 写真・動画の累計枚数
    if (e.photosCount < REC_PHOTOS) {
      items.push({ r: ratio("photos"), t: `写真・動画を増やす（現在${e.photosCount}枚 → 推奨${REC_PHOTOS}枚以上）` });
    }

    // 属性充実度
    if (e.attributeFilled < 8) {
      items.push({ r: ratio("extras"), t: "属性（決済・駐車場・バリアフリー・予約等）を充実させる" });
    }

    // 低評価割合
    const rpsValues = Object.values(e.reviewsPerScore);
    const rpsTotal = rpsValues.reduce((a, b) => a + b, 0);
    const low = (e.reviewsPerScore["1"] ?? 0) + (e.reviewsPerScore["2"] ?? 0);
    if (rpsTotal > 0 && low / rpsTotal > 0.2) {
      items.push({ r: ratio("reviews"), t: "低評価(★1〜2)の割合が高め。不満点の改善を" });
    }
  } else {
    // enrichedなし: Places APIで判定できる範囲のみ
    if (p.photoCount < 10)
      items.push({ r: ratio("photos"), t: `写真を充実させる（現在${p.photoCount}枚）` });

    // 飲食系のみ、確実に取得できる属性ブール値で判定する。
    const isFood = [p.primaryType, ...p.types].some(t => !!t && /restaurant|food|cafe|bar|bakery|meal_/.test(t));
    if (isFood && p.attributeCount < 2)
      items.push({ r: ratio("extras"), t: "属性（テイクアウト・予約・店内飲食など）を登録する" });
  }

  // 弱いカテゴリ由来を先頭へ（=最優先として表示される）
  items.sort((a, b) => a.r - b.r);
  const tips = items.map(i => i.t);

  if (tips.length === 0) tips.push("APIで確認できる基本項目に大きな欠落はありません。レポート下部の各指標もご確認ください");
  return tips;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
