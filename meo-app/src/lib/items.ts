import type { PlaceData, DiagItem, ItemStatus, ItemGap } from "./types";
import type { Enriched, ReviewActivity } from "./outscraper";
import { REC_PHOTOS, daysSinceLatestPost } from "./scoring";
import type { SiteCheck } from "./sitecheck";

/** 公式サイトではなく、SNS・ポータル・リンクまとめのURLかどうかを判定するホスト一覧。 */
const NON_OWN_HOSTS = [
  "instagram.com", "facebook.com", "fb.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "youtu.be",
  "line.me", "lin.ee", "page.line.me", "ameblo.jp", "note.com", "linktr.ee", "lit.link",
  "instabio.cc", "bio.link", "beacons.ai", "linkin.bio", "potofu.me", "profu.link", "linkfly.to", "solo.to", "taplink.cc", "lnk.bio",
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
 * 項目別診断を作る。どの事業所でも同じ18項目を同じ順番で返す。
 * 取得したデータから判定できない項目、その業種には当てはまらない項目は status="na"（判定なし）にし、
 * 理由を v.reason に入れる（推測で良し悪しを付けない）。しきい値は採点（scoring.ts）と同じ考え方に合わせている。
 *
 * reason：nodata=データを取得できなかった / nosite=サイト未設定 / notown=自社サイトではない（SNS・ポータル） / noreviews=クチコミが無い /
 *         few=件数が少なく割合を出せない / lodging=宿泊業には当てはまらない / notapplicable=この業種では導線にならない /
 *         sitefail=サイトを読み込めなかった / jsonly=サイトの中身がプログラムで後から表示され、読み取れなかった
 */
export function buildItems(
  p: PlaceData,
  e: Enriched | undefined,
  activity: ReviewActivity | null | undefined,
  biz: { kind: string; limitedAttrs: boolean },
  now: Date,
  sc?: SiteCheck | null,
): DiagItem[] {
  const out: DiagItem[] = [];
  const add = (key: string, cat: DiagItem["cat"], status: ItemStatus, v: DiagItem["v"] = {}) => out.push({ key, cat, status, v, rate: null, gap: null });
  const na = (key: string, cat: DiagItem["cat"], reason: string) => add(key, cat, "na", { reason });
  const isLodging = biz.kind === "lodging";

  // ---- 基本情報 ----
  add("phone", "nap", p.nationalPhoneNumber ? "good" : "bad");
  const site = classifySite(p.websiteUri);
  add("website", "nap", site.kind === "own" ? "good" : site.kind === "other" ? "warn" : "bad", { host: site.host });
  if (site.kind === "own") add("https", "nap", site.https ? "good" : "warn");
  else na("https", "nap", site.kind === "other" ? "notown" : "nosite"); // SNS・ポータルのURLは店側でhttpsを選べない
  // サイトの中身（店名・住所・電話の一致／店舗情報の構造化データ）。読めなかったときは推測で判定しない
  if (site.kind !== "own") {
    na("site_nap", "nap", site.kind === "other" ? "notown" : "nosite");
    na("site_schema", "nap", site.kind === "other" ? "notown" : "nosite");
  } else if (!sc || !sc.ok) {
    const reason = !sc ? "nodata" : sc.fail === "jsonly" ? "jsonly" : "sitefail";
    na("site_nap", "nap", reason);
    // プログラムで表示するサイトでも、構造化データは埋め込まれていれば読める
    if (sc && sc.fail === "jsonly" && sc.schema !== "none") addSchema(sc);
    else na("site_schema", "nap", reason);
  } else {
    // Google側に電話・照合できる住所が無いときは、その項目を判定に入れない
    const parts = [sc.name ? 1 : 0];
    if (sc.address !== "na") parts.push(sc.address === "match" ? 1 : sc.address === "partial" ? 0.5 : 0);
    if (sc.phone !== "na") parts.push(sc.phone === "match" ? 1 : 0);
    const score = parts.reduce((a, b) => a + b, 0);
    // 読めなかった関連ページがあるときは、見つからない情報がそこに載っている可能性があるので、そろっていない限り判定しない
    if (sc.unread && score < parts.length) na("site_nap", "nap", "sitefail");
    else add("site_nap", "nap", score === parts.length ? "good" : score === 0 ? "bad" : "warn",
      { name: sc.name, addr: sc.address, phone: sc.phone, pages: sc.pages, score, max: parts.length, miss: parts.filter((x) => x < 1).length });
    if (sc.unread && sc.schema !== "local") na("site_schema", "nap", "sitefail");
    else addSchema(sc);
  }
  function addSchema(c: SiteCheck) {
    add("site_schema", "nap", c.schema === "local" ? "good" : c.schema === "none" ? "bad" : "warn", { kind: c.schema, type: c.schemaType });
  }
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
    add("posts", "hours", !has ? "warn" : d <= 30 ? "good" : d <= 180 ? "warn" : "bad", { has, days: has ? Math.max(0, Math.round(d)) : null });
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

  return out.map(measure);
}

/** 目標（良好の基準）。達成率100%＝この値に到達。 */
export const TARGETS = { reviews: 50, rating: 4.0, freshDays: 30, lowPct: 10, attrs: 5, attrsLimited: 3, subcats: 1 } as const;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const r2 = (x: number) => Math.round(x * 100) / 100;
/** 日数が目標（30日）を過ぎたら下がり、さらに150日たつと0になる */
const freshRate = (days: number) => (days <= TARGETS.freshDays ? 1 : clamp01(1 - (days - TARGETS.freshDays) / 150));

/**
 * 達成率（0〜1）と、次の目標までの不足分を付ける。
 * 達成率1＝判定の「良好」と同じ基準に届いた状態になるよう、目標は判定のしきい値にそろえている。
 */
function measure(it: DiagItem): DiagItem {
  if (it.status === "na") return it;
  const v = it.v as Record<string, any>;
  const gap = (kind: ItemGap["kind"], need: number, target: number): ItemGap | null => (need > 0 ? { kind, need, target } : null);
  const binary = it.status === "good" ? 1 : it.status === "warn" ? 0.5 : 0;
  let rate: number | null = binary;
  let g: ItemGap | null = it.status === "good" ? null : { kind: "setup", need: 1, target: 1 };
  switch (it.key) {
    case "site_nap":
      rate = clamp01(v.score / v.max);
      g = gap("sitenap", v.miss, v.max);
      break;
    case "sub_category":
      rate = clamp01(v.n / TARGETS.subcats);
      g = gap("subcat", TARGETS.subcats - v.n, TARGETS.subcats);
      break;
    case "review_count":
      rate = clamp01(v.n / TARGETS.reviews);
      g = gap("count", TARGETS.reviews - v.n, TARGETS.reviews);
      break;
    case "rating":
      rate = clamp01((v.rating - 3) / (TARGETS.rating - 3));
      g = it.status === "good" ? null : { kind: "rating", need: Math.round((TARGETS.rating - v.rating) * 10) / 10, target: TARGETS.rating };
      break;
    case "review_fresh":
      rate = freshRate(v.days);
      g = it.status === "good" ? null : { kind: "fresh", need: v.days - TARGETS.freshDays, target: TARGETS.freshDays };
      break;
    case "low_ratings":
      rate = v.pct <= TARGETS.lowPct ? 1 : clamp01(1 - (v.pct - TARGETS.lowPct) / 20);
      g = gap("lowpct", v.pct - TARGETS.lowPct, TARGETS.lowPct);
      break;
    case "photos":
      rate = clamp01(v.n / v.rec);
      g = gap("photos", v.rec - v.n, v.rec);
      break;
    case "posts":
      // 投稿を確認できなかったときは、0%と断定せず「不明」にする
      rate = v.has ? freshRate(v.days) : null;
      g = !v.has ? { kind: "post", need: 1, target: TARGETS.freshDays }
        : it.status === "good" ? null : { kind: "fresh", need: v.days - TARGETS.freshDays, target: TARGETS.freshDays };
      if (g && g.kind === "fresh") g = { ...g, kind: "post" };
      break;
    case "attributes": {
      const target = v.limited ? TARGETS.attrsLimited : TARGETS.attrs;
      rate = clamp01(v.n / target);
      g = gap("attrs", target - v.n, target);
      break;
    }
  }
  // 表示用に丸めた値（★3.96→4.0、30.1日→30日など）で計算すると、判定は未達なのに100%・不足0になることがある。
  // 判定を正として、未達の項目は100%未満・不足分は最小単位以上にそろえる
  if (it.status !== "good") {
    if (rate != null) rate = Math.min(rate, 0.99);
    const unit = (k: ItemGap["kind"]) => (k === "rating" ? 0.1 : 1);
    if (g) g = { ...g, need: Math.max(unit(g.kind), g.need) };
    else if (rate != null) g = { kind: "setup", need: 1, target: 1 };
  }
  return { ...it, rate: rate == null ? null : r2(rate), gap: g };
}

/** 項目の並び（どの事業所でも同じ）。テストと画面の確認用。 */
export const ITEM_KEYS = [
  "phone", "website", "https", "site_nap", "site_schema", "verified", "status",
  "main_category", "sub_category",
  "review_count", "rating", "review_fresh", "low_ratings",
  "photos", "hours", "posts", "attributes", "booking",
] as const;
