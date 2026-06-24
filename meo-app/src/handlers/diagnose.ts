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

  // v18: クチコミ件数/評価を実店舗ページ値(Outscraper)で採用＋競合表示増。旧キャッシュ無効化
  const cacheKey = `diag:v18:${body.name}|${body.area}|${body.compare ? 1 : 0}`;
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

    // 今後の見通し（予測）：現状データからの目安
    let gain = 0;
    for (const c of profile.categories) {
      const r = c.score / c.max;
      if (r < 0.7) gain += (Math.min(0.85, r + 0.3) - r) * c.max;
    }
    const potentialScore = Math.min(100, Math.round(profile.total + gain));
    const prediction = {
      potentialScore,
      scoreGain: potentialScore - profile.total,
      reviewNow: details.userRatingCount,
      monthlyPace: activity?.monthlyPace ?? null,
      reviewIn6m: activity?.monthlyPace != null ? details.userRatingCount + activity.monthlyPace * 6 : null,
    };

    const result = {
      name: details.displayName,
      area: body.area,
      investigatedAt: now.toISOString().slice(0, 10),
      profile,
      prominence: prominenceLight(details),
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

  // ---- 基本情報 ----
  if (!p.websiteUri) items.push({ r: ratio("nap"), title: "Webサイト/予約リンクを登録", detail: "公式サイト・SNS・ネット予約のリンクが未登録です。登録すると情報の信頼性が上がり、来店前のユーザーを取りこぼしません。" });
  if (!p.nationalPhoneNumber) items.push({ r: ratio("nap"), title: "電話番号を登録", detail: "電話番号が未登録です。問い合わせ・予約の導線として必ず登録しましょう。" });

  if (p.types.filter(t => t !== p.primaryType).length === 0)
    items.push({ r: ratio("category"), title: "副カテゴリを追加", detail: "主カテゴリだけになっています。提供サービスに合う副カテゴリ（例：居酒屋＋宴会場、カフェ＋ケーキ店）を追加すると、関連キーワードでの露出が広がります。" });

  if (p.userRatingCount < 30)
    items.push({ r: ratio("reviews"), title: "クチコミ件数を増やす", detail: `現在${p.userRatingCount}件。来店時の一声やレジ横のQR・カードでレビュー依頼を仕組み化しましょう。件数は上位表示の主要因です。` });
  if (p.rating != null && p.rating < 4.0)
    items.push({ r: ratio("reviews"), title: "平均評価を引き上げる", detail: `現在★${p.rating.toFixed(1)}。低評価の要因（提供時間・接客・清潔感など）を洗い出し、運用改善と丁寧な返信で評価を底上げしましょう。` });

  if (!p.hasRegularHours) items.push({ r: ratio("hours"), title: "営業時間を登録", detail: "営業時間が未設定です。曜日ごとの営業時間・定休日・祝日対応・特別営業を登録しましょう。" });

  if (e) {
    const d = daysSinceLatestPost(e.posts, now);
    if (e.posts.length === 0)
      items.push({ r: ratio("hours"), title: "最新情報の投稿を始める", detail: "前回調査時点で『最新情報』の投稿が確認できませんでした。週1回を目安に、季節メニュー・イベント・キャンペーン・臨時休業などを投稿しましょう。投稿の鮮度は検索順位に直結します。" });
    else if (d > 60)
      items.push({ r: ratio("hours"), title: "最新情報の投稿を継続", detail: `前回調査時点で最新投稿が約${Math.round(d)}日前でした。週1回を目安に投稿を続けましょう（既に再開済みなら次回調査で反映されます）。鮮度が順位に効きます。` });

    if (e.photosCount < REC_PHOTOS)
      items.push({ r: ratio("photos"), title: "写真を増やす", detail: `現在${e.photosCount}枚。料理・店内・外観・スタッフ・メニュー表など、推奨${REC_PHOTOS}枚以上を目安に高画質写真を追加・定期更新しましょう。写真量は閲覧数とクリック率に直結します。` });

    if (e.attributeTotal > 0 && e.attributeFilled / e.attributeTotal < 0.5)
      items.push({ r: ratio("extras"), title: "属性を充実させる", detail: "決済方法（各種キャッシュレス）・バリアフリー・予約可・Wi-Fiなど、未設定の属性を追加しましょう。『条件で絞り込む』検索にヒットしやすくなります。" });

    const rpsValues = Object.values(e.reviewsPerScore);
    const rpsTotal = rpsValues.reduce((a, b) => a + b, 0);
    const low = (e.reviewsPerScore["1"] ?? 0) + (e.reviewsPerScore["2"] ?? 0);
    if (rpsTotal > 0 && low / rpsTotal > 0.2)
      items.push({ r: ratio("reviews"), title: "低評価への対応", detail: `★1〜2の割合がやや高めです（${Math.round((low / rpsTotal) * 100)}%）。共通する不満点を特定し、運用改善＋誠実な返信で印象を回復しましょう。` });
  } else {
    if (p.photoCount < 10)
      items.push({ r: ratio("photos"), title: "写真を増やす", detail: `現在${p.photoCount}枚。料理・店内・外観などの写真を追加しましょう。` });
    const isFood = [p.primaryType, ...p.types].some(t => !!t && /restaurant|food|cafe|bar|bakery|meal_/.test(t));
    if (isFood && p.attributeCount < 2)
      items.push({ r: ratio("extras"), title: "属性を登録", detail: "テイクアウト・予約可・店内飲食などの属性を登録しましょう。" });
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
