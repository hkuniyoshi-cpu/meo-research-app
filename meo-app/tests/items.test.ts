import { describe, it, expect } from "vitest";
import { buildItems, classifySite } from "../src/lib/items";
import type { PlaceData, DiagItem } from "../src/lib/types";
import type { Enriched } from "../src/lib/outscraper";

const NOW = new Date("2026-10-12T00:00:00Z");
const nowTs = Math.floor(NOW.getTime() / 1000);

function place(o: Partial<PlaceData> = {}): PlaceData {
  return {
    placeId: "x", displayName: "店", formattedAddress: "那覇市", types: [], userRatingCount: 0, reviews: [],
    photoCount: 0, hasVideo: false, hasRegularHours: false, hasSpecialHours: false,
    attributeCount: 0, hasReservationLink: false, hasMenuLink: false, ...o,
  };
}
function enriched(o: Partial<Enriched> = {}): Enriched {
  return {
    posts: [], photosCount: 0, verified: false, reviewCount: null, rating: null, reviewsPerScore: {},
    attributeFilled: 0, attributeTotal: 0, hasMenuLink: false, hasReservation: false, description: null,
    known: { verified: true, photos: true }, placeId: null, category: null, subCategories: [], ...o,
  };
}
const FOOD = { kind: "food", limitedAttrs: false };
const byKey = (items: DiagItem[]) => Object.fromEntries(items.map(i => [i.key, i]));

describe("classifySite", () => {
  it("独自サイト / SNS・ポータル / 未設定を区別する", () => {
    expect(classifySite("https://www.example.co.jp/shop")).toMatchObject({ kind: "own", host: "example.co.jp", https: true });
    expect(classifySite("http://example.com")).toMatchObject({ kind: "own", https: false });
    expect(classifySite("https://www.instagram.com/shop/").kind).toBe("other");
    expect(classifySite("https://beauty.hotpepper.jp/slnH000/").kind).toBe("other");
    expect(classifySite(undefined).kind).toBe("none");
  });
});

describe("buildItems", () => {
  it("整備された店は主要項目がすべて good", () => {
    const p = place({
      nationalPhoneNumber: "098", websiteUri: "https://example.com", businessStatus: "OPERATIONAL",
      primaryType: "restaurant", primaryTypeLabel: "レストラン", rating: 4.6, userRatingCount: 320,
      hasRegularHours: true, attributeCount: 7,
    });
    const e = enriched({
      verified: true, photosCount: 400, category: "居酒屋", subCategories: ["和食店"],
      reviewsPerScore: { "5": 300, "1": 5 }, posts: [{ timestamp: nowTs - 5 * 86400 }], hasReservation: true,
    });
    const items = buildItems(p, e, { latestDays: 3, monthlyPace: 8, sample: 10 }, FOOD, NOW);
    expect(items.every(i => i.status === "good")).toBe(true);
    const m = byKey(items);
    expect(m.main_category.v.label).toBe("居酒屋"); // GBPの実カテゴリを優先
    expect(m.sub_category.v.n).toBe(1);
    expect(m.photos.v).toMatchObject({ n: 400, capped: false });
    for (const k of ["phone", "website", "https", "verified", "status", "review_count", "rating", "review_fresh", "low_ratings", "hours", "posts", "attributes", "booking"]) {
      expect(m[k], k).toBeTruthy();
    }
  });

  it("未整備の店は欠落を bad / warn にする", () => {
    const p = place({ userRatingCount: 2, rating: 3.0, businessStatus: "OPERATIONAL" });
    const e = enriched({ verified: false, photosCount: 1, category: "学習センター", subCategories: [] });
    const m = byKey(buildItems(p, e, { latestDays: 400, monthlyPace: null, sample: 1 }, { kind: "education", limitedAttrs: true }, NOW));
    expect(m.phone.status).toBe("bad");
    expect(m.website.status).toBe("bad");
    expect(m.https).toBeUndefined(); // サイトが無ければHTTPSは判定しない
    expect(m.verified.status).toBe("bad");
    expect(m.sub_category.status).toBe("warn");
    expect(m.review_count.status).toBe("bad");
    expect(m.rating.status).toBe("bad");
    expect(m.review_fresh.status).toBe("bad");
    expect(m.low_ratings).toBeUndefined(); // 評価分布が5件未満なら割合は出さない
    expect(m.photos.status).toBe("bad");
    expect(m.hours.status).toBe("bad");
    expect(m.posts).toMatchObject({ status: "warn", v: { has: false } }); // 投稿が取れないだけでは「無い」と断定しない
    expect(m.attributes.status).toBe("warn"); // 属性の少ない業種は bad にしない
    expect(m.booking).toBeUndefined();        // 予約リンクが導線にならない業種では指摘しない
  });

  it("判定材料が無い項目は出さない（Outscraper無し・クチコミ0件）", () => {
    const m = byKey(buildItems(place({ photoCount: 10 }), undefined, null, FOOD, NOW));
    for (const k of ["verified", "sub_category", "rating", "review_fresh", "low_ratings", "posts", "booking", "status"]) {
      expect(m[k], k).toBeUndefined();
    }
    expect(m.main_category.status).toBe("warn");
    expect(m.photos).toMatchObject({ status: "good", v: { n: 10, capped: true } });
  });

  it("SNSのURLは warn、httpの独自サイトはHTTPSを warn", () => {
    expect(byKey(buildItems(place({ websiteUri: "https://instagram.com/x" }), undefined, null, FOOD, NOW)).website.status).toBe("warn");
    const m = byKey(buildItems(place({ websiteUri: "http://example.com" }), undefined, null, FOOD, NOW));
    expect(m.website.status).toBe("good");
    expect(m.https.status).toBe("warn");
  });

  it("投稿は半年以内なら warn 止まり（反映遅れを考慮）、宿泊業は営業時間・属性を判定しない", () => {
    const e = enriched({ posts: [{ timestamp: nowTs - 100 * 86400 }] });
    expect(byKey(buildItems(place(), e, null, FOOD, NOW)).posts.status).toBe("warn");
    const lodging = byKey(buildItems(place(), e, null, { kind: "lodging", limitedAttrs: false }, NOW));
    expect(lodging.hours).toBeUndefined();
    expect(lodging.attributes).toBeUndefined();
  });

  it("投稿が確認でき、半年以上あいているときだけ bad", () => {
    const e = enriched({ posts: [{ timestamp: nowTs - 200 * 86400 }] });
    expect(byKey(buildItems(place(), e, null, FOOD, NOW)).posts).toMatchObject({ status: "bad", v: { has: true } });
  });

  it("Outscraperの応答に無かった項目は、未認証・0枚と断定しない", () => {
    const e = enriched({ known: { verified: false, photos: false }, verified: false, photosCount: 0 });
    const m = byKey(buildItems(place({ photoCount: 6 }), e, null, FOOD, NOW));
    expect(m.verified).toBeUndefined();
    expect(m.photos).toMatchObject({ status: "warn", v: { n: 6, rec: 10 } }); // Placesの取得値で判定
  });

  it("予約リンクが導線になる業種で未設定なら warn", () => {
    expect(byKey(buildItems(place(), enriched(), null, FOOD, NOW)).booking.status).toBe("warn");
  });
});
