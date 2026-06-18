import type { PlaceData, ProfileScore, CategoryScore, ReviewData } from "./types";
import type { IndustryWeights } from "./weights";

const DAY = 86400000;

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

export function scoreProfile(p: PlaceData, w: IndustryWeights, now: Date): ProfileScore {
  // 各カテゴリ完成度(0-1)
  const napItems = [
    !!p.displayName, !!p.formattedAddress, !!p.nationalPhoneNumber,
    !!p.websiteUri, p.businessStatus === "OPERATIONAL",
  ];
  const nap = napItems.filter(Boolean).length / napItems.length;

  const category = (p.primaryType ? 0.6 : 0) + (p.types.filter(t => t !== p.primaryType).length > 0 ? 0.4 : 0);

  const countComp = normLogCount(p.userRatingCount);
  const ratingComp = (p.rating ?? 0) / 5;
  const recencyComp = recentReviewRatio(p.reviews, now);
  const reviews = clamp01(0.4 * countComp + 0.3 * ratingComp + 0.3 * recencyComp);

  const photos = clamp01(0.8 * Math.min(p.photoCount, 10) / 10 + (p.hasVideo ? 0.2 : 0));

  const hours = (p.hasRegularHours ? 0.7 : 0) + (p.hasSpecialHours ? 0.3 : 0);

  const extraItems = [
    !!p.editorialSummary, !!p.priceLevel, p.attributeCount >= 3,
    p.hasReservationLink, p.hasMenuLink,
  ];
  const extras = extraItems.filter(Boolean).length / extraItems.length;

  const categories: CategoryScore[] = [
    { key: "nap",      label: "基本情報(NAP)",     score: nap * w.nap,           max: w.nap },
    { key: "category", label: "カテゴリ設定",       score: category * w.category, max: w.category },
    { key: "reviews",  label: "口コミ",            score: reviews * w.reviews,    max: w.reviews },
    { key: "photos",   label: "写真・動画",         score: photos * w.photos,      max: w.photos },
    { key: "hours",    label: "営業時間・最新性",    score: hours * w.hours,        max: w.hours },
    { key: "extras",   label: "付加情報",           score: extras * w.extras,      max: w.extras },
  ];
  const total = Math.round(categories.reduce((a, c) => a + c.score, 0));
  return { total, categories };
}
