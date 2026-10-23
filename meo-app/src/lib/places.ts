import type { PlaceData } from "./types";

type FetchFn = typeof fetch;

const DETAILS_MASK = [
  "id", "displayName", "formattedAddress", "nationalPhoneNumber", "websiteUri",
  "businessStatus", "primaryType", "primaryTypeDisplayName", "types", "rating", "userRatingCount",
  "reviews", "photos", "regularOpeningHours", "currentOpeningHours",
  "editorialSummary", "priceLevel", "reservable", "servesLunch", "servesDinner",
  "servesBreakfast", "takeout", "delivery", "dineIn",
  "location",
  // 公式の実属性（同じEnterprise+Atmosphere SKU内＝追加料金階層なし）。業種横断で信頼できる属性判定に使う。
  "parkingOptions", "paymentOptions", "accessibilityOptions",
  "allowsDogs", "outdoorSeating", "restroom", "goodForChildren", "goodForGroups",
  "curbsidePickup", "liveMusic", "menuForChildren",
].join(",");

/** 対象店の特定は place_id だけ取れればよい（IDのみ＝Text Search の最安SKU）。 */
const FIND_MASK = "places.id";

/** 入力エリアを行政区画として解決するときのフィールド。 */
const AREA_MASK = "places.displayName,places.types,places.viewport";

/** 競合検索で使うフィールド。業種の確認用にタイプ情報も取る。 */
const COMP_MASK = [
  "places.id", "places.displayName", "places.rating",
  "places.userRatingCount", "places.photos", "places.location",
  "places.primaryType", "places.primaryTypeDisplayName", "places.types",
  "nextPageToken",
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
      "X-Goog-FieldMask": FIND_MASK,
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

export interface LatLng { latitude: number; longitude: number; }

/**
 * 競合を探すときの「業種」。
 * - keyword: 利用者が指定した業種名。
 * - gbp: Googleビジネスプロフィールのメインカテゴリ名（例：接骨院）。
 * - type: Places の primaryType（includedType で厳密に絞る）。
 */
export interface Industry {
  mode: "keyword" | "gbp" | "type";
  /** keyword / gbp のときの検索語。 */
  keyword?: string;
  /** type のときの Places タイプ。 */
  type?: string;
  /** 画面に出す業種名。 */
  label: string;
}

/** これだけでは同業を絞れない汎用タイプ。primaryType がこれらのときは自動比較に使わない。 */
const GENERIC_TYPES = new Set([
  "point_of_interest", "establishment", "service", "store", "food", "health", "finance",
  "premise", "subpremise", "street_address", "route", "political", "geocode",
  "locality", "sublocality", "neighborhood", "postal_code", "country",
  "administrative_area_level_1", "administrative_area_level_2",
]);

export const INDUSTRY_MAX = 40;

/** 利用者入力の業種キーワードを整える（制御文字除去・連続空白の圧縮・長さ制限）。 */
export function cleanIndustry(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, INDUSTRY_MAX);
}

/**
 * 競合比較に使う業種を決める。優先順：利用者指定 → GBPメインカテゴリ → 具体的な primaryType。
 * どれも無ければ null（＝業種を特定できないので、異業種を混ぜた比較は出さない）。
 */
export function pickIndustry(
  userKeyword: string, gbpCategory: string | null | undefined,
  primaryType: string | undefined, primaryTypeLabel: string | undefined,
): Industry | null {
  if (userKeyword) return { mode: "keyword", keyword: userKeyword, label: userKeyword };
  const gbp = (gbpCategory ?? "").trim();
  if (gbp) return { mode: "gbp", keyword: gbp, label: gbp };
  const pt = (primaryType ?? "").trim();
  if (pt && !GENERIC_TYPES.has(pt)) return { mode: "type", type: pt, label: (primaryTypeLabel ?? "").trim() || pt.replace(/_/g, " ") };
  return null;
}

const EARTH_R = 6371000;
const rad = (x: number) => (x * Math.PI) / 180;
const deg = (x: number) => (x * 180) / Math.PI;

/** 2点間の距離(メートル)。 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.latitude - a.latitude), dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Rect { low: LatLng; high: LatLng; }

/** 点が矩形の中にあるか（日付変更線をまたぐ矩形＝low.longitude > high.longitude にも対応）。 */
export function rectContains(r: Rect, p: LatLng): boolean {
  if (p.latitude < r.low.latitude || p.latitude > r.high.latitude) return false;
  return r.low.longitude <= r.high.longitude
    ? p.longitude >= r.low.longitude && p.longitude <= r.high.longitude
    : p.longitude >= r.low.longitude || p.longitude <= r.high.longitude;
}

/**
 * 競合を探す範囲。
 * - area: 入力されたエリア（県・市など）そのものの範囲。同じエリアを指定した店は同じ母集団で比べられる。
 * - radius: 対象店を中心とする半径。住所まで入力されたときなど、エリアを特定できない場合に使う。
 */
export type Region =
  | { kind: "area"; name: string; rect: Rect }
  | { kind: "radius"; center: LatLng; radiusMeters: number };

/** エリアとして扱う行政区画のタイプ（都道府県・郡・市区町村）。 */
const AREA_TYPES = new Set(["administrative_area_level_1", "administrative_area_level_2", "administrative_area_level_3", "locality"]);

/**
 * 入力エリア文字列を行政区画として解決し、その表示名と範囲（viewport）を返す。
 * 市区町村より細かい地名・番地・施設名に解決された場合は null（＝半径での比較に回す）。
 */
export async function findAreaScope(
  area: string, apiKey: string, lang: string = "ja", fetchFn: FetchFn = fetch,
): Promise<{ name: string; rect: Rect } | null> {
  const resp = await fetchFn("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": AREA_MASK },
    body: JSON.stringify({ textQuery: area, languageCode: lang, pageSize: 1 }),
  });
  if (!resp.ok) throw new Error(`area search failed: ${resp.status}`);
  const data: any = await resp.json();
  const p = data.places?.[0];
  const v = p?.viewport;
  if (!p || !v?.low || !v?.high) return null;
  const types: string[] = p.types ?? [];
  const rect: Rect = {
    low: { latitude: v.low.latitude, longitude: v.low.longitude },
    high: { latitude: v.high.latitude, longitude: v.high.longitude },
  };
  // 政令市の区などは sublocality_level_1 で返る。商圏として狭すぎないもの（短辺3km以上）だけエリア扱いにする
  const shortSideM = Math.min(
    haversineMeters(rect.low, { latitude: rect.high.latitude, longitude: rect.low.longitude }),
    haversineMeters(rect.low, { latitude: rect.low.latitude, longitude: rect.high.longitude }),
  );
  const isArea = types.some(t => AREA_TYPES.has(t)) || (types.includes("sublocality_level_1") && shortSideM >= 3000);
  if (!isArea) return null;
  return { name: p.displayName?.text || area, rect };
}

/** 中心と半径の円に外接する矩形。searchText の locationRestriction は rectangle しか受け付けない。 */
export function boundingRect(center: LatLng, radiusMeters: number): Rect {
  const d = radiusMeters / EARTH_R;
  const lowLat = center.latitude - deg(d);
  const highLat = center.latitude + deg(d);
  // 極を含む円は全経度が対象
  if (lowLat <= -90 || highLat >= 90) {
    return { low: { latitude: Math.max(-90, lowLat), longitude: -180 }, high: { latitude: Math.min(90, highLat), longitude: 180 } };
  }
  const dLng = deg(Math.asin(Math.min(1, Math.sin(d) / Math.cos(rad(center.latitude)))));
  const wrap = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
  // 日付変更線をまたぐ場合は low.longitude > high.longitude になる（APIが許容）
  return {
    low: { latitude: lowLat, longitude: wrap(center.longitude - dLng) },
    high: { latitude: highLat, longitude: wrap(center.longitude + dLng) },
  };
}

/** 競合検索の最大ページ数（1ページ20件）。増やすと母数は増えるが Text Search の課金回数も増える。 */
export const COMPETITOR_MAX_PAGES = 2;

export interface CompetitorSearch {
  /** 範囲内に入った候補（対象自身・重複を含む生データ）。 */
  places: any[];
  /** APIが返した件数（範囲外を含む）。 */
  fetched: number;
  /** 取得上限で打ち切った＝範囲内にまだ他の店がある可能性がある。 */
  capped: boolean;
}

/**
 * 同業の近隣店を Text Search で取得する。
 * 位置は region に限定する（矩形で絞り、radius のときは距離で円内だけ残す）。
 * 1ページ目が失敗したら例外を投げる（位置制限なしの検索には切り替えない＝地域外・異業種を混ぜない）。
 */
export async function findCompetitors(
  industry: Industry, region: Region, apiKey: string, lang: string = "ja",
  maxPages: number = COMPETITOR_MAX_PAGES, fetchFn: FetchFn = fetch,
): Promise<CompetitorSearch> {
  const radius = region.kind === "radius" ? Math.min(50000, Math.max(500, region.radiusMeters)) : 0;
  const rect = region.kind === "area" ? region.rect : boundingRect(region.center, radius);
  const base: Record<string, unknown> = {
    textQuery: industry.mode === "type" ? industry.label : industry.keyword,
    languageCode: lang,
    pageSize: 20,
    locationRestriction: { rectangle: rect },
  };
  if (industry.mode === "type") { base.includedType = industry.type; base.strictTypeFiltering = true; }

  const all: any[] = [];
  let token: string | undefined;
  let pages = 0;
  do {
    let data: any;
    try {
      // 2ページ目以降は初回と同じ条件に pageToken だけ足す（API仕様）
      const resp = await fetchFn("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": COMP_MASK },
        body: JSON.stringify(token ? { ...base, pageToken: token } : base),
      });
      if (!resp.ok) throw new Error(`competitors search failed: ${resp.status}`);
      data = await resp.json();
    } catch (err) {
      if (pages === 0) throw err;
      break; // 途中ページの失敗（HTTPエラー・通信例外）は、取れた分だけで続ける。token が残るので capped=true になる
    }
    if (Array.isArray(data.places)) all.push(...data.places);
    token = typeof data.nextPageToken === "string" && data.nextPageToken ? data.nextPageToken : undefined;
    pages++;
  } while (token && pages < maxPages);

  const places = all.filter(p => {
    if (!p?.location) return false;
    const at = { latitude: p.location.latitude, longitude: p.location.longitude };
    return region.kind === "area" ? rectContains(rect, at) : haversineMeters(region.center, at) <= radius;
  });
  return { places, fetched: all.length, capped: !!token };
}

/** 入力エリア文字列の粒度から検索半径(メートル)を推定。 */
export function radiusFromArea(area: string): number {
  const s = (area || "").trim();
  if (!s) return 5000;
  // 都道府県レベル：〜25km（沖縄県・東京都・大阪府など）
  if (/(都|道|府|県)$/.test(s)) return 25000;
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
    primaryType: d.primaryType || undefined,
    primaryTypeLabel: d.primaryTypeDisplayName?.text || undefined,
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

/**
 * 公式Placesの実属性で「登録済み」の数を数える。業種横断で信頼できる属性件数。
 * 「駐車場なし」のように false で登録されたものも、プロフィールに載っている情報なので数える（値が無いものは未登録）。
 */
function countAttributes(d: any): number {
  const flatKeys = [
    "reservable", "servesLunch", "servesDinner", "servesBreakfast", "takeout", "delivery", "dineIn",
    "allowsDogs", "outdoorSeating", "restroom", "goodForChildren", "goodForGroups",
    "curbsidePickup", "liveMusic", "menuForChildren",
  ];
  let n = flatKeys.filter(k => typeof d[k] === "boolean").length;
  // 駐車場・決済・バリアフリーは入れ子オブジェクト（boolean子要素の数を加算）
  for (const obj of [d.parkingOptions, d.paymentOptions, d.accessibilityOptions]) {
    if (obj && typeof obj === "object") n += Object.values(obj).filter(v => typeof v === "boolean").length;
  }
  return n;
}

/** 軽量検索応答 → PlaceData(部分)。競合ランキング用。 */
export function normalizeLight(d: any): PlaceData {
  return {
    placeId: d.id, displayName: d.displayName?.text ?? "",
    formattedAddress: "", types: d.types ?? [], primaryType: d.primaryType || undefined,
    primaryTypeLabel: d.primaryTypeDisplayName?.text || undefined,
    rating: d.rating,
    userRatingCount: d.userRatingCount ?? 0, reviews: [],
    photoCount: (d.photos ?? []).length, hasVideo: false,
    hasRegularHours: false, hasSpecialHours: false, attributeCount: 0,
    hasReservationLink: false, hasMenuLink: false,
    location: d.location ? { latitude: d.location.latitude, longitude: d.location.longitude } : undefined,
  };
}
