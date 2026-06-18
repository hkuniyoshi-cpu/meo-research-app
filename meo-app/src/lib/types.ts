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
  rank: number;              // 1始まり
  total: number;             // 比較母数(対象含む)
  competitors: { name: string; rating?: number; reviews: number; index: number }[];
}
