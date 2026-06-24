type FetchFn = typeof fetch;
const BASE = "https://api.outscraper.cloud";

export interface Enriched {
  posts: { timestamp: number }[];        // Unix seconds
  photosCount: number;
  verified: boolean;
  reviewsPerScore: Record<string, number>;
  attributeFilled: number;               // about内で true の属性数
  attributeTotal: number;                // about内の全属性数
  hasMenuLink: boolean;
  hasReservation: boolean;
  description: string | null;            // Outscraperのdescription（多くnull・採点には使わない）
  replySampled: number;                  // reviews-v3で取得したレビュー件数
  replyReplied: number;                  // うちowner返信が付いた件数
}

function pickPlace(data: any): any | null {
  if (!Array.isArray(data)) return null;
  const first = data[0];
  return Array.isArray(first) ? (first[0] ?? null) : (first ?? null);
}

/** search-v3 で店舗のリッチ情報を取得。失敗時は例外を投げる。 */
export async function fetchEnriched(name: string, area: string, apiKey: string, fetchFn: FetchFn = fetch): Promise<Enriched | null> {
  const url = `${BASE}/maps/search-v3?query=${encodeURIComponent(`${name} ${area}`)}&limit=1&language=ja&region=JP&async=false&t=${Date.now()}`;
  const r = await fetchFn(url, { headers: { "X-API-KEY": apiKey }, cf: { cacheTtl: 0, cacheEverything: false } });
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
    reviewsPerScore: p.reviews_per_score ?? {},
    attributeFilled: filled,
    attributeTotal: total,
    hasMenuLink: !!p.menu_link,
    hasReservation: (Array.isArray(p.reservation_links) && p.reservation_links.length > 0) || !!p.booking_appointment_link,
    description: p.description ?? null,
    replySampled: 0,
    replyReplied: 0,
  };
}

/** reviews-v3 で直近レビューを取得し、owner返信率の母数/件数を返す。失敗時は {0,0}。 */
export async function fetchReplyStats(name: string, area: string, apiKey: string, limit = 10, fetchFn: FetchFn = fetch): Promise<{ replySampled: number; replyReplied: number }> {
  const url = `${BASE}/maps/reviews-v3?query=${encodeURIComponent(`${name} ${area}`)}&reviewsLimit=${limit}&language=ja&region=JP&async=false&sort=newest&t=${Date.now()}`;
  const r = await fetchFn(url, { headers: { "X-API-KEY": apiKey }, cf: { cacheTtl: 0, cacheEverything: false } });
  if (!r.ok) throw new Error(`outscraper reviews failed: ${r.status}`);
  const j: any = await r.json();
  const p = pickPlace(j.data);
  const reviews: any[] = p?.reviews_data ?? [];
  const replied = reviews.filter(x => x && typeof x.owner_answer === "string" && x.owner_answer.trim().length > 0).length;
  return { replySampled: reviews.length, replyReplied: replied };
}
