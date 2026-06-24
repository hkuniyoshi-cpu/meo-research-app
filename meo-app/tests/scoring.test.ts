import { describe, it, expect } from "vitest";
import { scoreProfile, recentReviewRatio, prominenceLight, rankAmong, daysSinceLatestPost } from "../src/lib/scoring";
import { DEFAULT_WEIGHTS } from "../src/lib/weights";
import type { PlaceData } from "../src/lib/types";
import type { Enriched } from "../src/lib/outscraper";

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

  it("カテゴリ構造が正しく、各点は0〜満点に収まる", () => {
    const r = scoreProfile(place({ userRatingCount: 5, rating: 3 }), DEFAULT_WEIGHTS, NOW);
    expect(r.categories).toHaveLength(6);
    expect(r.categories.map(c => c.key)).toEqual(["nap", "category", "reviews", "photos", "hours", "extras"]);
    expect(r.total).toBeGreaterThan(0);
    expect(r.total).toBeLessThanOrEqual(100);
    for (const c of r.categories) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(c.max);
    }
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

describe("recentReviewRatio", () => {
  it("空配列は0", () => {
    expect(recentReviewRatio([], NOW)).toBe(0);
  });
  it("全て直近なら1", () => {
    const rs = [
      { rating: 5, publishTime: "2026-06-10T00:00:00Z" },
      { rating: 4, publishTime: "2026-05-01T00:00:00Z" },
    ];
    expect(recentReviewRatio(rs, NOW)).toBe(1);
  });
  it("全て古いと0", () => {
    expect(recentReviewRatio([{ rating: 5, publishTime: "2024-01-01T00:00:00Z" }], NOW)).toBe(0);
  });
  it("ちょうど境界(cutoff)は新着として数える", () => {
    const cutoff = new Date(NOW.getTime() - 90 * 86400000).toISOString();
    expect(recentReviewRatio([{ rating: 5, publishTime: cutoff }], NOW)).toBe(1);
  });
  it("半分が直近なら0.5", () => {
    const rs = [
      { rating: 5, publishTime: "2026-06-01T00:00:00Z" },
      { rating: 5, publishTime: "2024-01-01T00:00:00Z" },
    ];
    expect(recentReviewRatio(rs, NOW)).toBe(0.5);
  });
});

describe("prominenceLight", () => {
  it("口コミ多く高評価ほど指数が高い", () => {
    const strong = prominenceLight({ rating: 4.8, userRatingCount: 300, photoCount: 10 });
    const weak = prominenceLight({ rating: 3.2, userRatingCount: 5, photoCount: 1 });
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeLessThanOrEqual(100);
    expect(weak).toBeGreaterThanOrEqual(0);
  });
});

describe("scoreProfile with Enriched", () => {
  function makeEnriched(overrides: Partial<Enriched> = {}): Enriched {
    return {
      posts: [],
      photosCount: 0,
      verified: false,
      reviewCount: null,
      rating: null,
      reviewsPerScore: {},
      attributeFilled: 0,
      attributeTotal: 0,
      hasMenuLink: false,
      hasReservation: false,
      description: null,
      ...overrides,
    };
  }

  it("リッチな店舗はenriched無しより高スコア", () => {
    const nowTs = Math.floor(NOW.getTime() / 1000);
    const richEnriched = makeEnriched({
      posts: [{ timestamp: nowTs - 60 * 60 * 24 * 5 }], // 5日前
      photosCount: 50,
      verified: true,
      reviewsPerScore: { "5": 100, "4": 50, "1": 2 },
      attributeFilled: 20,
      attributeTotal: 25,
      hasMenuLink: true,
      hasReservation: true,
    });
    const poorEnriched = makeEnriched({
      posts: [],
      photosCount: 1,
      verified: false,
      reviewsPerScore: { "1": 10, "2": 5 },
      attributeFilled: 0,
      attributeTotal: 5,
      hasMenuLink: false,
      hasReservation: false,
    });
    const basePlaceData = place({
      nationalPhoneNumber: "098", websiteUri: "https://x", businessStatus: "OPERATIONAL",
      primaryType: "restaurant", types: ["restaurant", "cafe"],
      rating: 4.5, userRatingCount: 80,
      reviews: [{ rating: 5, publishTime: "2026-06-01T00:00:00Z" }],
      hasRegularHours: true,
    });
    const rich = scoreProfile(basePlaceData, DEFAULT_WEIGHTS, NOW, richEnriched);
    const poor = scoreProfile(basePlaceData, DEFAULT_WEIGHTS, NOW, poorEnriched);
    expect(rich.total).toBeGreaterThan(poor.total);
  });

  it("enrichedありでhours labelが「営業時間・最新情報」", () => {
    const r = scoreProfile(place({ hasRegularHours: true }), DEFAULT_WEIGHTS, NOW, makeEnriched());
    const h = r.categories.find(c => c.key === "hours");
    expect(h?.label).toBe("営業時間・最新情報");
  });

  it("enrichedなしでもhours labelが「営業時間・最新情報」", () => {
    const r = scoreProfile(place(), DEFAULT_WEIGHTS, NOW);
    const h = r.categories.find(c => c.key === "hours");
    expect(h?.label).toBe("営業時間・最新情報");
  });
});

describe("daysSinceLatestPost", () => {
  it("空ならInfinity", () => {
    expect(daysSinceLatestPost([], NOW)).toBe(Infinity);
  });
  it("直近の投稿は日数が少ない", () => {
    const recent = Math.floor(NOW.getTime() / 1000) - 5 * 86400; // 5日前
    expect(daysSinceLatestPost([{ timestamp: recent }], NOW)).toBeCloseTo(5, 0);
  });
  it("最も新しいタイムスタンプを使う", () => {
    const ts1 = Math.floor(NOW.getTime() / 1000) - 10 * 86400; // 10日前
    const ts2 = Math.floor(NOW.getTime() / 1000) - 3 * 86400;  // 3日前
    const d = daysSinceLatestPost([{ timestamp: ts1 }, { timestamp: ts2 }], NOW);
    expect(d).toBeCloseTo(3, 0);
  });
});

describe("rankAmong", () => {
  it("対象店の順位と母数を返す", () => {
    const target = place({ rating: 4.6, userRatingCount: 95, photoCount: 8 });
    const comps = [
      place({ displayName: "A店", rating: 4.7, userRatingCount: 210, photoCount: 10 }),
      place({ displayName: "B店", rating: 4.5, userRatingCount: 180, photoCount: 9 }),
      place({ displayName: "C店", rating: 3.9, userRatingCount: 20, photoCount: 2 }),
    ];
    const r = rankAmong(target, comps);
    expect(r.total).toBe(4);
    expect(r.rank).toBe(3); // A,B が上、C が下
    expect(r.competitors).toHaveLength(3);
  });
});
