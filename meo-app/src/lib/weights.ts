export interface IndustryWeights {
  nap: number; category: number; reviews: number;
  photos: number; hours: number; extras: number;
}

export const DEFAULT_WEIGHTS: IndustryWeights = {
  nap: 20, category: 15, reviews: 25, photos: 15, hours: 10, extras: 15,
};

// 主要業種のみ初期搭載。primaryType(Places)文字列にマッチ。合計は必ず100。
const TABLE: Record<string, IndustryWeights> = {
  restaurant: { nap: 18, category: 12, reviews: 25, photos: 22, hours: 10, extras: 13 },
  cafe:       { nap: 18, category: 12, reviews: 25, photos: 22, hours: 10, extras: 13 },
  bar:        { nap: 18, category: 12, reviews: 25, photos: 22, hours: 10, extras: 13 },
  beauty_salon:{ nap: 20, category: 13, reviews: 27, photos: 18, hours: 8,  extras: 14 },
  lawyer:     { nap: 24, category: 16, reviews: 24, photos: 8,  hours: 8,  extras: 20 },
};

export function weightsFor(primaryType?: string): IndustryWeights {
  if (primaryType && TABLE[primaryType]) return TABLE[primaryType];
  return DEFAULT_WEIGHTS;
}
