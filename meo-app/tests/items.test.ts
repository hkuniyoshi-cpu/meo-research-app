import { describe, it, expect } from "vitest";
import { buildItems, classifySite, ITEM_KEYS } from "../src/lib/items";
import type { PlaceData, DiagItem } from "../src/lib/types";
import type { Enriched } from "../src/lib/outscraper";
import type { SiteCheck } from "../src/lib/sitecheck";

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
const SITE_OK: SiteCheck = { ok: true, pages: 1, name: true, phone: "match", address: "match", schema: "local", schemaType: "Restaurant" };
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
    const items = buildItems(p, e, { latestDays: 3, monthlyPace: 8, sample: 10 }, FOOD, NOW, SITE_OK);
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
    expect(m.https).toMatchObject({ status: "na", v: { reason: "nosite" } }); // サイトが無ければHTTPSは判定しない
    expect(m.verified.status).toBe("bad");
    expect(m.sub_category.status).toBe("warn");
    expect(m.review_count.status).toBe("bad");
    expect(m.rating.status).toBe("bad");
    expect(m.review_fresh.status).toBe("bad");
    expect(m.low_ratings).toMatchObject({ status: "na", v: { reason: "few" } }); // 件数が少なければ割合は判定しない
    expect(m.photos.status).toBe("bad");
    expect(m.hours.status).toBe("bad");
    expect(m.posts).toMatchObject({ status: "warn", v: { has: false } }); // 投稿が取れないだけでは「無い」と断定しない
    expect(m.attributes.status).toBe("warn"); // 属性の少ない業種は bad にしない
    expect(m.booking).toMatchObject({ status: "na", v: { reason: "notapplicable" } }); // 予約リンクが導線にならない業種では指摘しない
  });

  it("判定材料が無い項目は「判定なし」と理由を返す（Outscraper無し・クチコミ0件）", () => {
    const m = byKey(buildItems(place({ photoCount: 10 }), undefined, null, FOOD, NOW));
    for (const [k, r] of [["verified", "nodata"], ["sub_category", "nodata"], ["rating", "noreviews"], ["review_fresh", "noreviews"], ["low_ratings", "noreviews"], ["posts", "nodata"], ["booking", "nodata"], ["status", "nodata"]]) {
      expect(m[k], k).toMatchObject({ status: "na", v: { reason: r } });
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
    expect(lodging.hours).toMatchObject({ status: "na", v: { reason: "lodging" } });
    expect(lodging.attributes).toMatchObject({ status: "na", v: { reason: "lodging" } });
  });

  it("投稿が確認でき、半年以上あいているときだけ bad", () => {
    const e = enriched({ posts: [{ timestamp: nowTs - 200 * 86400 }] });
    expect(byKey(buildItems(place(), e, null, FOOD, NOW)).posts).toMatchObject({ status: "bad", v: { has: true } });
  });

  it("Outscraperの応答に無かった項目は、未認証・0枚と断定しない", () => {
    const e = enriched({ known: { verified: false, photos: false }, verified: false, photosCount: 0 });
    const m = byKey(buildItems(place({ photoCount: 6 }), e, null, FOOD, NOW));
    expect(m.verified).toMatchObject({ status: "na", v: { reason: "nodata" } });
    expect(m.photos).toMatchObject({ status: "warn", v: { n: 6, rec: 10 } }); // Placesの取得値で判定
  });

  it("予約リンクが導線になる業種で未設定なら warn", () => {
    expect(byKey(buildItems(place(), enriched(), null, FOOD, NOW)).booking.status).toBe("warn");
  });
});

describe("buildItems の項目数", () => {
  it("整備状況・業種・データの有無にかかわらず、同じ16項目を同じ順番で返す", () => {
    const cases = [
      buildItems(place(), undefined, null, FOOD, NOW),
      buildItems(place({ websiteUri: "https://x.jp", userRatingCount: 300, rating: 4.5, hasRegularHours: true }), enriched({ category: "居酒屋" }), { latestDays: 2, monthlyPace: 5, sample: 10 }, FOOD, NOW),
      buildItems(place(), enriched(), null, { kind: "lodging", limitedAttrs: false }, NOW),
      buildItems(place(), enriched({ known: { verified: false, photos: false } }), null, { kind: "professional", limitedAttrs: true }, NOW),
    ];
    for (const items of cases) {
      expect(items.map(i => i.key)).toEqual([...ITEM_KEYS]);
      for (const i of items) if (i.status === "na") expect(typeof i.v.reason).toBe("string");
    }
  });
});

describe("buildItems のhttps判定なしの理由", () => {
  it("サイト未設定とSNS・ポータルのURLを区別する", () => {
    const m1 = Object.fromEntries(buildItems(place(), undefined, null, FOOD, NOW).map(i => [i.key, i]));
    const m2 = Object.fromEntries(buildItems(place({ websiteUri: "https://www.instagram.com/x/" }), undefined, null, FOOD, NOW).map(i => [i.key, i]));
    expect(m1.https).toMatchObject({ status: "na", v: { reason: "nosite" } });
    expect(m2.https).toMatchObject({ status: "na", v: { reason: "notown" } });
  });
});

describe("達成率と次の目標までの不足分", () => {
  const all = (p: Partial<PlaceData>, e?: Partial<Enriched>, act: any = null, biz = FOOD) =>
    Object.fromEntries(buildItems(place(p), e ? enriched(e) : undefined, act, biz, NOW).map(i => [i.key, i]));

  it("良好の項目は達成率100%で不足なし、それ以外は100%未満で不足分あり（判定と一致）", () => {
    const cases = [
      all({ userRatingCount: 14, rating: 3.6, nationalPhoneNumber: "1", hasRegularHours: true, attributeCount: 2 },
        { photosCount: 183, category: "建設会社", subCategories: [], reviewsPerScore: { "5": 8, "1": 2 }, posts: [{ timestamp: nowTs - 60 * 86400 }] },
        { latestDays: 70, monthlyPace: 1, sample: 5 }),
      all({ userRatingCount: 300, rating: 4.7, nationalPhoneNumber: "1", websiteUri: "https://x.jp", hasRegularHours: true, attributeCount: 9, businessStatus: "OPERATIONAL" },
        { verified: true, photosCount: 500, category: "居酒屋", subCategories: ["和食"], reviewsPerScore: { "5": 300 }, posts: [{ timestamp: nowTs - 86400 }], hasReservation: true },
        { latestDays: 2, monthlyPace: 9, sample: 10 }),
    ];
    for (const m of cases) for (const it of Object.values(m) as any[]) {
      if (it.status === "na") { expect(it.rate, it.key).toBeNull(); expect(it.gap, it.key).toBeNull(); continue; }
      if (it.rate == null) continue; // 不明（投稿を確認できない等）
      if (it.status === "good") { expect(it.rate, it.key).toBe(1); expect(it.gap, it.key).toBeNull(); }
      else { expect(it.rate, it.key).toBeLessThan(1); expect(it.gap, it.key).not.toBeNull(); }
    }
  });

  it("数値の項目は実測値に応じた達成率と、目標までの不足分を返す", () => {
    const m = all({ userRatingCount: 14, rating: 3.6, attributeCount: 2 },
      { photosCount: 183, category: "x", subCategories: [], reviewsPerScore: { "5": 8, "1": 2 }, posts: [{ timestamp: nowTs - 60 * 86400 }] },
      { latestDays: 70, monthlyPace: 1, sample: 5 });
    expect(m.review_count).toMatchObject({ rate: 0.28, gap: { kind: "count", need: 36, target: 50 } });
    expect(m.rating).toMatchObject({ rate: 0.6, gap: { kind: "rating", need: 0.4, target: 4 } });
    expect(m.photos).toMatchObject({ rate: 0.92, gap: { kind: "photos", need: 17, target: 200 } });
    expect(m.review_fresh).toMatchObject({ rate: 0.73, gap: { kind: "fresh", need: 40, target: 30 } });
    expect(m.low_ratings).toMatchObject({ rate: 0.5, gap: { kind: "lowpct", need: 10, target: 10 } });
    expect(m.posts).toMatchObject({ rate: 0.8, gap: { kind: "post", need: 30 } });
    expect(m.attributes).toMatchObject({ rate: 0.4, gap: { kind: "attrs", need: 3, target: 5 } });
    expect(m.sub_category).toMatchObject({ rate: 0, gap: { kind: "subcat", need: 1 } });
    expect(m.phone).toMatchObject({ rate: 0, gap: { kind: "setup" } });
  });

  it("投稿を確認できないときは達成率を出さない（0%と断定しない）", () => {
    const m = all({}, { posts: [] });
    expect(m.posts).toMatchObject({ status: "warn", rate: null, gap: { kind: "post" } });
  });
});

describe("達成率と判定のずれが起きない（境界値）", () => {
  const all = (p: Partial<PlaceData>, e?: Partial<Enriched>, act: any = null) =>
    Object.fromEntries(buildItems(place(p), e ? enriched(e) : undefined, act, FOOD, NOW).map(i => [i.key, i]));
  it("写真199枚／目標200枚は100%にならず、あと1枚", () => {
    expect(all({}, { photosCount: 199 }).photos).toMatchObject({ status: "warn", rate: 0.99, gap: { kind: "photos", need: 1 } });
  });
  it("★3.96（表示は★4.0）は未達のまま、あと★0.1", () => {
    expect(all({ userRatingCount: 20, rating: 3.96 }).rating).toMatchObject({ status: "warn", rate: 0.99, gap: { kind: "rating", need: 0.1 } });
  });
  it("投稿から30.4日（表示は30日）は未達のまま、あと1日ぶんの不足として扱う", () => {
    const m = all({}, { posts: [{ timestamp: nowTs - Math.round(30.4 * 86400) }] });
    expect(m.posts.status).toBe("warn");
    expect(m.posts.rate).toBeLessThan(1);
    expect(m.posts.gap).toMatchObject({ kind: "post", need: 1, target: 30 });
  });
  it("投稿を確認できないときの目標は30日以内", () => {
    expect(all({}, { posts: [] }).posts.gap).toMatchObject({ kind: "post", target: 30 });
  });
});

describe("サイトの店舗情報・構造化データ", () => {
  const p = place({ websiteUri: "https://example.com", nationalPhoneNumber: "098-123-4567" });
  const get = (sc: SiteCheck | null | undefined, pp = p) => byKey(buildItems(pp, undefined, null, FOOD, NOW, sc));
  it("住所が町名までしか一致しない・電話が別番号なら warn、不足数を目標までの差として出す", () => {
    const m = get({ ...SITE_OK, address: "partial", phone: "other", schema: "other", schemaType: "Organization" });
    expect(m.site_nap).toMatchObject({ status: "warn", rate: 0.5, gap: { kind: "sitenap", need: 2, target: 3 } });
    expect(m.site_schema).toMatchObject({ status: "warn", v: { kind: "other", type: "Organization" } });
  });
  it("何も見つからなければ bad。Google側に電話が無いときは電話を判定に入れない", () => {
    expect(get({ ...SITE_OK, name: false, address: "none", phone: "none", schema: "none", schemaType: "" }).site_nap.status).toBe("bad");
    const m = get({ ...SITE_OK, phone: "na" }, place({ websiteUri: "https://example.com" }));
    expect(m.site_nap).toMatchObject({ status: "good", v: { max: 2 } });
  });
  it("読み込めない・読み取れないサイトは判定しない（構造化データだけ読めたときはそれを判定）", () => {
    const fail = get({ ...SITE_OK, ok: false, fail: "fetchfail" });
    expect(fail.site_nap).toMatchObject({ status: "na", v: { reason: "sitefail" } });
    expect(fail.site_schema).toMatchObject({ status: "na", v: { reason: "sitefail" } });
    const js = get({ ...SITE_OK, ok: false, fail: "jsonly", schema: "local" });
    expect(js.site_nap).toMatchObject({ status: "na", v: { reason: "jsonly" } });
    expect(js.site_schema.status).toBe("good");
    expect(get(undefined).site_nap).toMatchObject({ status: "na", v: { reason: "nodata" } });
  });
  it("SNS・ポータルのURLやサイト未設定なら判定しない", () => {
    expect(get(null, place({ websiteUri: "https://instagram.com/x" })).site_nap.v.reason).toBe("notown");
    expect(get(null, place()).site_schema.v.reason).toBe("nosite");
  });
});
