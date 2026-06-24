import type { PlaceData, ProfileScore, CategoryScore, ReviewData, RankResult } from "./types";
import type { IndustryWeights } from "./weights";
import type { Enriched } from "./outscraper";

const DAY = 86400000;

/** 写真の推奨累計枚数（これ以上で満点）。MEOでは枚数が多いほど有利。 */
export const REC_PHOTOS = 200;

/** 直近days日に投稿された口コミ比率(0-1)。reviewsが空なら0。 */
export function recentReviewRatio(reviews: ReviewData[], now: Date, days = 90): number {
  if (reviews.length === 0) return 0;
  const cutoff = now.getTime() - days * DAY;
  const recent = reviews.filter(r => Date.parse(r.publishTime) >= cutoff).length;
  return recent / reviews.length;
}

/** 口コミ数を対数で0-1正規化(約1000件で1.0)。 */
function normLogCount(count: number): number {
  return Math.min(1, Math.log10(count + 1) / Math.log10(1001));
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

/** postsの中で最も新しいタイムスタンプ(Unix秒)からnowまでの日数。postsが空ならInfinity。 */
export function daysSinceLatestPost(posts: { timestamp: number }[], now: Date): number {
  if (posts.length === 0) return Infinity;
  const maxTs = Math.max(...posts.map(p => p.timestamp));
  return (now.getTime() - maxTs * 1000) / DAY;
}

export function scoreProfile(p: PlaceData, w: IndustryWeights, now: Date, e?: Enriched): ProfileScore {
  // 各カテゴリ完成度(0-1)
  let nap: number;
  if (e) {
    const napItems = [
      !!p.displayName, !!p.formattedAddress, !!p.nationalPhoneNumber,
      !!p.websiteUri, p.businessStatus === "OPERATIONAL", e.verified,
    ];
    nap = napItems.filter(Boolean).length / napItems.length;
  } else {
    const napItems = [
      !!p.displayName, !!p.formattedAddress, !!p.nationalPhoneNumber,
      !!p.websiteUri, p.businessStatus === "OPERATIONAL",
    ];
    nap = napItems.filter(Boolean).length / napItems.length;
  }

  // primaryType未設定時は types の全要素が "!= undefined" で真になり副カテゴリ加点(0.4)が入る（意図的）
  const category = (p.primaryType ? 0.6 : 0) + (p.types.filter(t => t !== p.primaryType).length > 0 ? 0.4 : 0);

  let reviewsComp: number;
  if (e) {
    // 返信率(owner_answer)はデータ提供元で取りこぼしが多く不安定なため採点に使わない。
    const countComp = normLogCount(p.userRatingCount);
    const ratingComp = (p.rating ?? 0) / 5;
    const recencyComp = recentReviewRatio(p.reviews, now);
    const rpsValues = Object.values(e.reviewsPerScore);
    const rpsTotal = rpsValues.reduce((a, b) => a + b, 0);
    const low = (e.reviewsPerScore["1"] ?? 0) + (e.reviewsPerScore["2"] ?? 0);
    const lowRatingComp = rpsTotal > 0 ? 1 - (low / rpsTotal) : 1;
    reviewsComp = clamp01(0.35 * countComp + 0.3 * ratingComp + 0.2 * recencyComp + 0.15 * lowRatingComp);
  } else {
    const countComp = normLogCount(p.userRatingCount);
    const ratingComp = (p.rating ?? 0) / 5;
    const recencyComp = recentReviewRatio(p.reviews, now);
    reviewsComp = clamp01(0.4 * countComp + 0.3 * ratingComp + 0.3 * recencyComp);
  }

  let photos: number;
  if (e) {
    photos = Math.min(1, e.photosCount / REC_PHOTOS);
  } else {
    photos = clamp01(0.8 * Math.min(p.photoCount, 10) / 10 + (p.hasVideo ? 0.2 : 0));
  }

  let hoursComp: number;
  if (e) {
    const h = p.hasRegularHours ? 1 : 0;
    const d = daysSinceLatestPost(e.posts, now);
    const postFresh = d <= 30 ? 1 : d <= 90 ? 0.6 : d <= 180 ? 0.3 : 0;
    hoursComp = 0.5 * h + 0.5 * postFresh;
  } else {
    hoursComp = (p.hasRegularHours ? 0.7 : 0) + (p.hasSpecialHours ? 0.3 : 0);
  }

  let extras: number;
  if (e) {
    // 属性は業種で総数が違うため「埋まっている割合」で評価（飲食=多い/ランドリー=少ない に非依存）
    const attrComp = e.attributeTotal > 0 ? Math.min(1, e.attributeFilled / e.attributeTotal) : 0;
    extras = clamp01(0.6 * attrComp + 0.2 * (e.hasReservation ? 1 : 0) + 0.2 * (e.hasMenuLink ? 1 : 0));
  } else {
    // 付加情報。editorialSummary(Googleが書く要約=オーナー設定の「ビジネスの説明文」ではない)は
    // Places APIでオーナー説明文の有無を判定できないため採点に使わない。
    const extraItems = [
      !!p.priceLevel, p.attributeCount >= 2,
      p.hasReservationLink, p.hasMenuLink,
    ];
    extras = extraItems.filter(Boolean).length / extraItems.length;
  }

  const categories: CategoryScore[] = [
    { key: "nap",      label: "基本情報(NAP)",     score: nap * w.nap,              max: w.nap },
    { key: "category", label: "カテゴリ設定",       score: category * w.category,    max: w.category },
    { key: "reviews",  label: "口コミ",             score: reviewsComp * w.reviews,  max: w.reviews },
    { key: "photos",   label: "写真",               score: photos * w.photos,        max: w.photos },
    { key: "hours",    label: "営業時間・最新情報",   score: hoursComp * w.hours,      max: w.hours },
    { key: "extras",   label: "付加情報",            score: extras * w.extras,        max: w.extras },
  ];
  const total = Math.round(categories.reduce((a, c) => a + c.score, 0));
  return { total, categories };
}

/** 軽量フィールドのみで算出する知名度指数(0-100)。競合は詳細未取得なので口コミ数/評価/写真数で比較。 */
export function prominenceLight(p: { rating?: number; userRatingCount: number; photoCount: number }): number {
  const countComp = normLogCount(p.userRatingCount);
  const ratingComp = (p.rating ?? 0) / 5;
  const photoComp = Math.min(p.photoCount, 10) / 10;
  return Math.round(100 * (0.45 * countComp + 0.40 * ratingComp + 0.15 * photoComp));
}

/** 対象店を競合群に混ぜて知名度指数で順位付けする。 */
export function rankAmong(target: PlaceData, competitors: PlaceData[]): RankResult {
  const targetIndex = prominenceLight(target);
  const comps = competitors.map(c => ({
    name: c.displayName, rating: c.rating, reviews: c.userRatingCount, index: prominenceLight(c),
  }));
  const all = [targetIndex, ...comps.map(c => c.index)].sort((a, b) => b - a);
  const rank = all.indexOf(targetIndex) + 1;
  comps.sort((a, b) => b.index - a.index);
  return { index: targetIndex, rank, total: all.length, competitors: comps };
}
