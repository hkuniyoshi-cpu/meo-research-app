import type { PlaceData } from "./types";

type FetchFn = typeof fetch;

const DETAILS_MASK = [
  "id", "displayName", "formattedAddress", "nationalPhoneNumber", "websiteUri",
  "businessStatus", "primaryType", "types", "rating", "userRatingCount",
  "reviews", "photos", "regularOpeningHours", "currentOpeningHours",
  "editorialSummary", "priceLevel", "reservable", "servesLunch", "servesDinner",
  "servesBreakfast", "takeout", "delivery", "dineIn",
  "location",
  // 公式の実属性（同じEnterprise+Atmosphere SKU内＝追加料金階層なし）。業種横断で信頼できる属性判定に使う。
  "parkingOptions", "paymentOptions", "accessibilityOptions",
  "allowsDogs", "outdoorSeating", "restroom", "goodForChildren", "goodForGroups",
  "curbsidePickup", "liveMusic", "menuForChildren",
].join(",");

const SEARCH_MASK = [
  "places.id", "places.displayName", "places.rating",
  "places.userRatingCount", "places.photos", "places.location",
].join(",");

/** 事業名＋住所/エリアで Text Search し先頭候補を返す。lang=言語コード(日本以外は"en"等)。 */
export async function findPlace(
  name: string, area: string, apiKey: string, lang: string = "ja", fetchFn: FetchFn = fetch
): Promise<{ id: string } | null> {
  const resp = await fetchFn("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": SEARCH_MASK,
    },
    body: JSON.stringify({ textQuery: `${name} ${area}`, languageCode: lang, maxResultCount: 1 }),
  });
  if (!resp.ok) throw new Error(`searchText failed: ${resp.status}`);
  const data: any = await resp.json();
  const first = data.places?.[0];
  return first ? { id: first.id } : null;
}

/** place_id の詳細を取得。 */
export async function getDetails(placeId: string, apiKey: string, lang: string = "ja", fetchFn: FetchFn = fetch): Promise<any> {
  const resp = await fetchFn(`https://places.googleapis.com/v1/places/${placeId}?languageCode=${lang}`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": DETAILS_MASK },
  });
  if (!resp.ok) throw new Error(`getDetails failed: ${resp.status}`);
  return resp.json();
}

/** 同カテゴリ近隣の競合を Text Search で取得（軽量フィールドのみ）。 */
export async function findCompetitors(
  primaryType: string | undefined, area: string, apiKey: string, lang: string = "ja", fetchFn: FetchFn = fetch
): Promise<any[]> {
  const q = `${primaryType ?? (lang === "ja" ? "店舗" : "business")} ${area}`;
  const resp = await fetchFn("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": SEARCH_MASK,
    },
    body: JSON.stringify({ textQuery: q, languageCode: lang, maxResultCount: 20 }),
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
    hasSpecialHours: (d.currentOpeningHours?.specialDays ?? d.regularOpeningHours?.specialDays ?? []).length > 0,
    editorialSummary: d.editorialSummary?.text,
    priceLevel: d.priceLevel,
    attributeCount: countAttributes(d),
    hasReservationLink: !!d.reservable,
    hasMenuLink: !!d.servesLunch || !!d.servesDinner,
    location: d.location ? { latitude: d.location.latitude, longitude: d.location.longitude } : undefined,
  };
}

/** 公式Placesの実属性で「設定済み(true)」の数を数える。業種横断で信頼できる属性件数。 */
function countAttributes(d: any): number {
  const flatKeys = [
    "reservable", "servesLunch", "servesDinner", "servesBreakfast", "takeout", "delivery", "dineIn",
    "allowsDogs", "outdoorSeating", "restroom", "goodForChildren", "goodForGroups",
    "curbsidePickup", "liveMusic", "menuForChildren",
  ];
  let n = flatKeys.filter(k => d[k] === true).length;
  // 駐車場・決済・バリアフリーは入れ子オブジェクト（boolean子要素の true 数を加算）
  for (const obj of [d.parkingOptions, d.paymentOptions, d.accessibilityOptions]) {
    if (obj && typeof obj === "object") n += Object.values(obj).filter(v => v === true).length;
  }
  return n;
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
    location: d.location ? { latitude: d.location.latitude, longitude: d.location.longitude } : undefined,
  };
}
