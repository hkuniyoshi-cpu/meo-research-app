export interface ReviewData {
  rating: number;        // 0-5
  publishTime: string;   // ISO8601
}

export interface PlaceData {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  businessStatus?: string;     // "OPERATIONAL" 等
  primaryType?: string;
  primaryTypeLabel?: string;   // primaryType の表示名（取得言語でローカライズ済み）
  types: string[];
  rating?: number;             // 0-5
  userRatingCount: number;
  reviews: ReviewData[];
  photoCount: number;
  hasVideo: boolean;
  hasRegularHours: boolean;
  hasSpecialHours: boolean;
  editorialSummary?: string;
  priceLevel?: string;
  attributeCount: number;
  hasReservationLink: boolean;
  hasMenuLink: boolean;
  location?: { latitude: number; longitude: number };
}

export interface CategoryScore {
  key: string;
  label: string;
  score: number;   // 実点
  max: number;     // 満点(=重み)
}

export interface ProfileScore {
  total: number;             // 0-100
  categories: CategoryScore[];
}

export interface RankResult {
  index: number;             // 対象店の知名度指数(0-100)
  rank: number;              // 1始まり。同点は上位側に数える（自分より指数が高い店の数＋1）
  total: number;             // 比較母数(対象含む)
  competitors: { name: string; rating?: number; reviews: number; index: number; location?: { lat: number; lng: number } }[];
}

/** 項目別診断の1項目。文言はフロントの辞書が持ち、ここは判定結果と数値だけを持つ。 */
export type ItemStatus = "good" | "warn" | "bad" | "na"; // na=判定なし（データが無い・当てはまらない）
export interface DiagItem {
  key: string;                                   // 項目ID（フロントの辞書キー）
  cat: "nap" | "category" | "reviews" | "photos" | "hours" | "extras";
  status: ItemStatus;
  v: Record<string, string | number | boolean | null>; // 表示に使う実測値
}
