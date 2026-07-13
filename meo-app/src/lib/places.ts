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

/**
 * 同カテゴリ近隣の競合を Text Search で取得（軽量フィールドのみ）。
 * center が指定されると locationRestriction で円形絞り込み（ターゲット店舗の商圏で公平比較）。
 * pageToken を辿って最大 3 ページ（60件）取得。
 */
export async function findCompetitors(
  primaryType: string | undefined,
  area: string,
  apiKey: string,
  lang: string = "ja",
  center?: { latitude: number; longitude: number },
  radiusMeters: number = 5000,
  fetchFn: FetchFn = fetch
): Promise<any[]> {
  const q = `${primaryType ?? (lang === "ja" ? "店舗" : "business")} ${area}`;
  const results: any[] = [];
  let pageToken: string | undefined = undefined;
  const MAX_PAGES = 3;
  const SEARCH_MASK_WITH_TOKEN = SEARCH_MASK + ",nextPageToken";

  for (let page = 0; page < MAX_PAGES; page++) {
    const body: Record<string, unknown> = { textQuery: q, languageCode: lang, maxResultCount: 20 };
    if (center) body.locationRestriction = { circle: { center, radius: Math.min(50000, Math.max(500, radiusMeters)) } };
    if (pageToken) body.pageToken = pageToken;

    const resp = await fetchFn("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": SEARCH_MASK_WITH_TOKEN,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      if (page === 0) throw new Error(`competitors search failed: ${resp.status}`);
      break; // 2ページ目以降の失敗はそこで打ち切って手持ちを返す
    }
    const data: any = await resp.json();
    if (Array.isArray(data.places)) results.push(...data.places);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return results;
}

/** 入力エリア文字列の粒度から検索半径(メートル)を推定。 */
export function radiusFromArea(area: string): number {
  const s = (area || "").trim();
  if (!s) return 5000;
  // 都道府県レベル：〜25km（沖縄県・東京都・大阪府など）
  if (/(都|道|府|県)$/.test(s) || /(都|道|府|県)[^\s、,]{0,4}$/.test(s) === false && /(都|道|府|県)/.test(s) && s.length <= 5) return 25000;
  if (/(都|道|府|県)/.test(s) && !/(市|区|町|村)/.test(s)) return 25000;
  // 市区町村レベル：〜8km
  if (/(市|区|町|村)$/.test(s) || (/(市|区|町|村)/.test(s) && !/[0-9０-９]/.test(s) && !/(丁目|番地|号|通り|駅)/.test(s))) return 8000;
  // 丁目・番地・駅名など詳細レベル：〜4km
  if (/(丁目|番地|号|通り|駅|大字|字)/.test(s) || /[0-9０-９]/.test(s)) return 4000;
  return 5000;
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
