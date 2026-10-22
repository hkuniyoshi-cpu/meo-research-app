import type { PlaceData, DiagItem, ItemStatus } from "./types";
import type { Enriched, ReviewActivity } from "./outscraper";
import { REC_PHOTOS, daysSinceLatestPost } from "./scoring";

/** 公式サイトではなく、SNS・ポータル・リンクまとめのURLかどうかを判定するホスト一覧。 */
const NON_OWN_HOSTS = [
  "instagram.com", "facebook.com", "fb.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "youtu.be",
  "line.me", "lin.ee", "page.line.me", "ameblo.jp", "note.com", "linktr.ee", "lit.link",
  "hotpepper.jp", "tabelog.com", "gnavi.co.jp", "retty.me", "ekiten.jp", "epark.jp",
  "jalan.net", "booking.com", "airbnb.jp", "airbnb.com", "tripadvisor.jp", "tripadvisor.com",
];

/** websiteUri を own(独自サイト) / other(SNS・ポータル) に分ける。解析できないURLは own 扱いにしない。 */
export function classifySite(uri: string | undefined): { kind: "none" | "own" | "other"; host: string; https: boolean } {
  if (!uri) return { kind: "none", host: "", https: false };
  try {
    const u = new URL(uri);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const other = NON_OWN_HOSTS.some(h => host === h || host.endsWith("." + h));
    return { kind: other ? "other" : "own", host, https: u.protocol === "https:" };
  } catch {
    return { kind: "other", host: "", https: false };
  }
}

/** 予約・メニューのリンクが集客導線として意味を持つ業種。これ以外では「未設定」を指摘しない。 */
const BOOKING_KINDS = new Set(["food", "beauty", "medical", "lodging", "fitness", "entertainment"]);

/**
 * 項目別診断を作る。どの事業所でも同じ16項目を同じ順番で返す。
 * 取得したデータから判定できない項目、その業種には当てはまらない項目は status="na"（判定なし）にし、
 * 理由を v.reason に入れる（推測で良し悪しを付けない）。しきい値は採点（scoring.ts）と同じ考え方に合わせている。
 *
 * reason：nodata=データを取得できなかった / nosite=サイト未設定 / notown=自社サイトではない（SNS・ポータル） / noreviews=クチコミが無い /
 *         few=件数が少なく割合を出せない / lodging=宿泊業には当てはまらない / notapplicable=この業種では導線にならない
 */
export function buildItems(
  p: PlaceData,
  e: Enriched | undefined,
  activity: ReviewActivity | null | undefined,
  biz: { kind: string; limitedAttrs: boolean },
  now: Date,
): DiagItem[] {
  const out: DiagItem[] = [];
  const add = (key: string, cat: DiagItem["cat"], status: ItemStatus, v: DiagItem["v"] = {}) => out.push({ key, cat, status, v });
  const na = (key: string, cat: DiagItem["cat"], reason: string) => add(key, cat, "na", { reason });
  const isLodging = biz.kind === "lodging";

  // ---- 基本情報 ----
  add("phone", "nap", p.nationalPhoneNumber ? "good" : "bad");
  const site = classifySite(p.websiteUri);
  add("website", "nap", site.kind === "own" ? "good" : site.kind === "other" ? "warn" : "bad", { host: site.host });
  if (site.kind === "own") add("https", "nap", site.https ? "good" : "warn");
  else na("https", "nap", site.kind === "other" ? "notown" : "nosite"); // SNS・ポータルのURLは店側でhttpsを選べない
  if (e && e.known.verified) add("verified", "nap", e.verified ? "good" : "bad");
  else na("verified", "nap", "nodata");
  if (p.businessStatus) {
    add("status", "nap",
      p.businessStatus === "OPERATIONAL" ? "good" : p.businessStatus === "CLOSED_TEMPORARILY" ? "warn" : "bad",
      { state: p.businessStatus });
  } else na("status", "nap", "nodata");

  // ---- カテゴリ ----
  const mainLabel = e?.category || p.primaryTypeLabel || "";
  add("main_category", "category", mainLabel ? "good" : "warn", { label: mainLabel });
  // 追加カテゴリはGBPの実カテゴリが取れたときだけ判定する（Placesのtypesは追加カテゴリと一致しない）
  if (e && e.category) {
    add("sub_category", "category", e.subCategories.length > 0 ? "good" : "warn",
      { n: e.subCategories.length, list: e.subCategories.slice(0, 4).join("、") });
  } else na("sub_category", "category", "nodata");

  // ---- クチコミ ----
  const count = p.userRatingCount;
  add("review_count", "reviews", count >= 50 ? "good" : count >= 10 ? "warn" : "bad", { n: count });
  if (count > 0 && p.rating != null) {
    add("rating", "reviews", p.rating >= 4.0 ? "good" : p.rating >= 3.5 ? "warn" : "bad", { rating: Number(p.rating.toFixed(1)) });
  } else na("rating", "reviews", count > 0 ? "nodata" : "noreviews");
  if (count > 0 && activity && activity.latestDays != null) {
    const d = activity.latestDays;
    add("review_fresh", "reviews", d <= 30 ? "good" : d <= 90 ? "warn" : "bad", { days: d, pace: activity.monthlyPace });
  } else na("review_fresh", "reviews", count > 0 ? "nodata" : "noreviews");
  const rpsTotal = e ? Object.values(e.reviewsPerScore).reduce((a, b) => a + b, 0) : 0;
  if (e && rpsTotal >= 5) {
    const low = (e.reviewsPerScore["1"] ?? 0) + (e.reviewsPerScore["2"] ?? 0);
    const pct = Math.round((low / rpsTotal) * 100);
    add("low_ratings", "reviews", pct <= 10 ? "good" : pct <= 20 ? "warn" : "bad", { pct });
  } else na("low_ratings", "reviews", count === 0 ? "noreviews" : (e && rpsTotal > 0) || (count > 0 && count < 5) ? "few" : "nodata");

  // ---- 写真 ----
  if (e && e.known.photos) {
    const n = e.photosCount;
    add("photos", "photos", n >= REC_PHOTOS ? "good" : n >= 30 ? "warn" : "bad", { n, rec: REC_PHOTOS, capped: false });
  } else {
    // Places は写真を最大10枚までしか返さない（10枚＝「10枚以上」）
    const n = p.photoCount;
    add("photos", "photos", n >= 10 ? "good" : n >= 3 ? "warn" : "bad", { n, rec: 10, capped: n >= 10 });
  }

  // ---- 営業時間・最新情報 ----
  // 宿泊業はチェックイン制で営業時間を持たないことが多く、未登録を欠点と断定できない
  if (!isLodging) add("hours", "hours", p.hasRegularHours ? "good" : "bad");
  else na("hours", "hours", "lodging");
  if (e) {
    const d = daysSinceLatestPost(e.posts, now);
    // 投稿データは反映が遅れることがある。「要改善」と言い切るのは、投稿が確認でき、かつ半年以上あいている場合だけ。
    // 投稿が1件も取れなかった場合は「無い」と断定できないので warn にとどめる。
    const has = e.posts.length > 0;
    add("posts", "hours", !has ? "warn" : d <= 30 ? "good" : d <= 180 ? "warn" : "bad", { has });
  } else na("posts", "hours", "nodata");

  // ---- 付加情報 ----
  if (!isLodging) {
    const n = Math.max(p.attributeCount, e ? e.attributeFilled : 0);
    // 専門サービス・教育などは設定できる属性自体が少ないため、基準を下げ「要改善」にはしない
    const status: ItemStatus = biz.limitedAttrs
      ? (n >= 3 ? "good" : "warn")
      : (n >= 5 ? "good" : n >= 1 ? "warn" : "bad");
    add("attributes", "extras", status, { n, limited: biz.limitedAttrs });
  } else na("attributes", "extras", "lodging");
  const hasLink = e ? (e.hasReservation || e.hasMenuLink) : false;
  if (hasLink) add("booking", "extras", "good");
  else if (!e) na("booking", "extras", "nodata");
  else if (BOOKING_KINDS.has(biz.kind)) add("booking", "extras", "warn");
  else na("booking", "extras", "notapplicable");

  return out;
}

/** 項目の並び（どの事業所でも同じ）。テストと画面の確認用。 */
export const ITEM_KEYS = [
  "phone", "website", "https", "verified", "status",
  "main_category", "sub_category",
  "review_count", "rating", "review_fresh", "low_ratings",
  "photos", "hours", "posts", "attributes", "booking",
] as const;
