type FetchFn = typeof fetch;
const BASE = "https://api.outscraper.cloud";

export interface Enriched {
  posts: { timestamp: number }[];        // Unix seconds
  photosCount: number;
  verified: boolean;
  reviewCount: number | null;            // 実店舗ページのクチコミ総数（Placesの曖昧マッチより信頼）
  rating: number | null;                 // 実店舗ページの平均評価
  reviewsPerScore: Record<string, number>;
  attributeFilled: number;               // about内で true の属性数
  attributeTotal: number;                // about内の全属性数
  hasMenuLink: boolean;
  hasReservation: boolean;
  description: string | null;            // Outscraperのdescription（多くnull・採点には使わない）
}

function pickPlace(data: any): any | null {
  if (!Array.isArray(data)) return null;
  const first = data[0];
  return Array.isArray(first) ? (first[0] ?? null) : (first ?? null);
}

/**
 * search-v3 で店舗のリッチ情報（投稿・写真数・属性・認証・口コミ分布）を取得。失敗時は例外を投げる。
 * ※ owner返信(reviews-v3)は取りこぼしが多く不安定なため取得しない（要確認扱い）。
 */
export async function fetchEnriched(name: string, area: string, apiKey: string, fetchFn: FetchFn = fetch): Promise<Enriched | null> {
  const url = `${BASE}/maps/search-v3?query=${encodeURIComponent(`${name} ${area}`)}&limit=1&language=ja&region=JP&async=false`;
  const r = await fetchFn(url, { headers: { "X-API-KEY": apiKey } });
  if (!r.ok) throw new Error(`outscraper search failed: ${r.status}`);
  const j: any = await r.json();
  const p = pickPlace(j.data);
  if (!p) return null;
  let filled = 0, total = 0;
  const about = p.about ?? {};
  for (const cat of Object.values(about)) {
    if (cat && typeof cat === "object") {
      for (const v of Object.values(cat as Record<string, unknown>)) { total++; if (v === true) filled++; }
    }
  }
  return {
    posts: (p.posts ?? []).filter((x: any) => x && typeof x.timestamp === "number").map((x: any) => ({ timestamp: x.timestamp })),
    photosCount: typeof p.photos_count === "number" ? p.photos_count : 0,
    verified: !!p.verified,
    reviewCount: typeof p.reviews === "number" ? p.reviews : null,
    rating: typeof p.rating === "number" ? p.rating : null,
    reviewsPerScore: p.reviews_per_score ?? {},
    attributeFilled: filled,
    attributeTotal: total,
    hasMenuLink: !!p.menu_link,
    hasReservation: (Array.isArray(p.reservation_links) && p.reservation_links.length > 0) || !!p.booking_appointment_link,
    description: p.description ?? null,
  };
}

export interface ReviewActivity {
  latestDays: number | null;   // 最新クチコミからの日数
  monthlyPace: number | null;  // 直近サンプルから推定した月間獲得ペース
  sample: number;              // 取得したクチコミ件数
}

/**
 * reviews-v3（新着順）から「クチコミの日付」だけを使い、新着性・獲得ペースを算出。
 * ※owner返信は不安定なため使わない。日付(review_timestamp)は安定して取得できる。
 */
export async function fetchReviewActivity(name: string, area: string, apiKey: string, limit = 10, fetchFn: FetchFn = fetch): Promise<ReviewActivity> {
  const url = `${BASE}/maps/reviews-v3?query=${encodeURIComponent(`${name} ${area}`)}&reviewsLimit=${limit}&language=ja&region=JP&async=false&sort=newest`;
  const r = await fetchFn(url, { headers: { "X-API-KEY": apiKey } });
  if (!r.ok) throw new Error(`outscraper reviews failed: ${r.status}`);
  const j: any = await r.json();
  const p = pickPlace(j.data);
  const reviews: any[] = p?.reviews_data ?? [];
  const ts = reviews
    .map(x => (typeof x?.review_timestamp === "number" ? x.review_timestamp : Date.parse(x?.review_datetime_utc ?? "") / 1000))
    .filter(t => Number.isFinite(t) && t > 0)
    .sort((a, b) => b - a);
  if (ts.length === 0) return { latestDays: null, monthlyPace: null, sample: 0 };
  const nowSec = Date.now() / 1000;
  const latestDays = Math.max(0, Math.round((nowSec - ts[0]) / 86400));
  let monthlyPace: number | null = null;
  if (ts.length >= 2) {
    const spanDays = (ts[0] - ts[ts.length - 1]) / 86400;
    monthlyPace = spanDays > 0 ? Math.round((ts.length - 1) / (spanDays / 30)) : ts.length;
  }
  return { latestDays, monthlyPace, sample: ts.length };
}
