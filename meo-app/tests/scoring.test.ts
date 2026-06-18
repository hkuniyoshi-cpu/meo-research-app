import { describe, it, expect } from "vitest";
import { scoreProfile } from "../src/lib/scoring";
import { DEFAULT_WEIGHTS } from "../src/lib/weights";
import type { PlaceData } from "../src/lib/types";

const NOW = new Date("2026-06-19T00:00:00Z");

function place(overrides: Partial<PlaceData> = {}): PlaceData {
  return {
    placeId: "x", displayName: "店", formattedAddress: "那覇市",
    types: [], userRatingCount: 0, reviews: [], photoCount: 0,
    hasVideo: false, hasRegularHours: false, hasSpecialHours: false,
    attributeCount: 0, hasReservationLink: false, hasMenuLink: false,
    ...overrides,
  };
}

describe("scoreProfile", () => {
  it("空に近いプロフィールは低スコア", () => {
    const r = scoreProfile(place(), DEFAULT_WEIGHTS, NOW);
    expect(r.total).toBeLessThan(20);
  });

  it("満点級プロフィールは90以上", () => {
    const reviews = Array.from({ length: 120 }, () => ({
      rating: 5, publishTime: "2026-06-01T00:00:00Z",
    }));
    const r = scoreProfile(place({
      nationalPhoneNumber: "098", websiteUri: "https://x", businessStatus: "OPERATIONAL",
      primaryType: "restaurant", types: ["restaurant", "cafe"],
      rating: 4.8, userRatingCount: 120, reviews,
      photoCount: 10, hasVideo: true, hasRegularHours: true, hasSpecialHours: true,
      editorialSummary: "美味しい", priceLevel: "PRICE_LEVEL_MODERATE",
      attributeCount: 5, hasReservationLink: true, hasMenuLink: true,
    }), DEFAULT_WEIGHTS, NOW);
    expect(r.total).toBeGreaterThanOrEqual(90);
  });

  it("カテゴリ別の点は満点(=重み)を超えない、合計はtotalと一致", () => {
    const r = scoreProfile(place({ userRatingCount: 5, rating: 3 }), DEFAULT_WEIGHTS, NOW);
    const sum = r.categories.reduce((a, c) => a + c.score, 0);
    expect(Math.round(sum)).toBe(r.total);
    for (const c of r.categories) expect(c.score).toBeLessThanOrEqual(c.max);
  });

  it("古い口コミだけだと新着性が効いて口コミ点が下がる", () => {
    const old = Array.from({ length: 50 }, () => ({ rating: 5, publishTime: "2024-01-01T00:00:00Z" }));
    const fresh = Array.from({ length: 50 }, () => ({ rating: 5, publishTime: "2026-06-01T00:00:00Z" }));
    const base = { rating: 5, userRatingCount: 50 };
    const a = scoreProfile(place({ ...base, reviews: old }), DEFAULT_WEIGHTS, NOW);
    const b = scoreProfile(place({ ...base, reviews: fresh }), DEFAULT_WEIGHTS, NOW);
    const ca = a.categories.find(c => c.key === "reviews")!.score;
    const cb = b.categories.find(c => c.key === "reviews")!.score;
    expect(cb).toBeGreaterThan(ca);
  });
});
