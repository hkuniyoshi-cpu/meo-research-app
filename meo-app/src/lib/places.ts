import type { PlaceData } from "./types";

type FetchFn = typeof fetch;

const DETAILS_MASK = [
  "id", "displayName", "formattedAddress", "nationalPhoneNumber", "websiteUri",
  "businessStatus", "primaryType", "types", "rating", "userRatingCount",
  "reviews", "photos", "regularOpeningHours", "specialDays",
  "editorialSummary", "priceLevel", "reservable", "servesLunch", "servesDinner",
].join(",");

const SEARCH_MASK = [
  "places.id", "places.displayName", "places.rating",
  "places.userRatingCount", "places.photos",
].join(",");

/** 事業名＋住所/エリアで Text Search し先頭候補を返す。 */
export async function findPlace(
  name: string, area: string, apiKey: string, fetchFn: FetchFn = fetch
): Promise<{ id: string } | null> {
  const resp = await fetchFn("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": SEARCH_MASK,
    },
    body: JSON.stringify({ textQuery: `${name} ${area}`, languageCode: "ja", maxResultCount: 1 }),
  });
  if (!resp.ok) throw new Error(`searchText failed: ${resp.status}`);
  const data: any = await resp.json();
  const first = data.places?.[0];
  return first ? { id: first.id } : null;
}

/** place_id の詳細を取得。 */
export async function getDetails(placeId: string, apiKey: string, fetchFn: FetchFn = fetch): Promise<any> {
  const resp = await fetchFn(`https://places.googleapis.com/v1/places/${placeId}?languageCode=ja`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": DETAILS_MASK },
  });
  if (!resp.ok) throw new Error(`getDetails failed: ${resp.status}`);
  return resp.json();
}

/** 同カテゴリ近隣の競合を Text Search で取得（軽量フィールドのみ）。 */
export async function findCompetitors(
  primaryType: string | undefined, area: string, apiKey: string, fetchFn: FetchFn = fetch
): Promise<any[]> {
  const q = `${primaryType ?? "店舗"} ${area}`;
  const resp = await fetchFn("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": SEARCH_MASK,
    },
    body: JSON.stringify({ textQuery: q, languageCode: "ja", maxResultCount: 12 }),
  });
  if (!resp.ok) throw new Error(`competitors search failed: ${resp.status}`);
  const data: any = await resp.json();
  return data.places ?? [];
}

/** Places詳細応答 → PlaceData。 */
export function normalizeDetails(d: any): PlaceData {
  return {
    placeId: d.id,
    displayName: d.displayName?.text ?? "",
    formattedAddress: d.formattedAddress ?? "",
    nationalPhoneNumber: d.nationalPhoneNumber,
    websiteUri: d.websiteUri,
    businessStatus: d.businessStatus,
    primaryType: d.primaryType,
    types: d.types ?? [],
    rating: d.rating,
    userRatingCount: d.userRatingCount ?? 0,
    reviews: (d.reviews ?? []).map((r: any) => ({ rating: r.rating ?? 0, publishTime: r.publishTime ?? "" })),
    photoCount: (d.photos ?? []).length,
    hasVideo: false, // Places APIは動画を返さないため常にfalse（将来別ソース）
    hasRegularHours: !!d.regularOpeningHours,
    hasSpecialHours: (d.specialDays ?? d.regularOpeningHours?.specialDays ?? []).length > 0,
    editorialSummary: d.editorialSummary?.text,
    priceLevel: d.priceLevel,
    attributeCount: countAttributes(d),
    hasReservationLink: !!d.reservable,
    hasMenuLink: !!d.servesLunch || !!d.servesDinner,
  };
}

/** boolean属性(serves*, reservable等)で trueの数を数える簡易指標。 */
function countAttributes(d: any): number {
  const keys = ["reservable", "servesLunch", "servesDinner", "servesBreakfast", "takeout", "delivery", "dineIn"];
  return keys.filter(k => d[k] === true).length;
}

/** 軽量検索応答 → PlaceData(部分)。競合ランキング用。 */
export function normalizeLight(d: any): PlaceData {
  return {
    placeId: d.id, displayName: d.displayName?.text ?? "",
    formattedAddress: "", types: [], rating: d.rating,
    userRatingCount: d.userRatingCount ?? 0, reviews: [],
    photoCount: (d.photos ?? []).length, hasVideo: false,
    hasRegularHours: false, hasSpecialHours: false, attributeCount: 0,
    hasReservationLink: false, hasMenuLink: false,
  };
}
