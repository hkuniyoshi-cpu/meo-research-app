import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleDiagnose, trimAddress, bizProfile, type Env } from "../src/handlers/diagnose";
import { ITEM_KEYS } from "../src/lib/items";

describe("bizProfile", () => {
  it("飲食は料理・キャッシュレス系の例文", () => {
    const b = bizProfile("restaurant", ["restaurant", "cafe"]);
    expect(b.kind).toBe("food");
    expect(b.photos).toContain("料理");
    expect(b.limitedAttrs).toBe(false);
  });
  it("ITコンサル等の専門サービスは飲食属性を勧めず limitedAttrs=true", () => {
    const b = bizProfile("consultant", ["consultant", "corporate_office"]);
    expect(b.kind).toBe("professional");
    expect(b.limitedAttrs).toBe(true);
    expect(b.attrs).not.toContain("キャッシュレス");
    expect(b.attrs).not.toContain("Wi-Fi");
    expect(b.photos).toContain("オフィス");
  });
  it("医療は院内・保険対応の例文", () => {
    const b = bizProfile("dentist", ["dentist"]);
    expect(b.kind).toBe("medical");
    expect(b.attrs).toContain("保険");
  });
  it("サロン系（美容/ネイル/まつげ/エステ/リラク/脱毛/足つぼ）は beauty", () => {
    for (const t of ["beauty_salon", "hair_salon", "nail_salon", "eyelash_service",
      "massage", "spa", "wellness_center", "tanning_studio", "makeup_artist", "foot_care", "hair_removal_service"]) {
      expect(bizProfile(t, [t]).kind).toBe("beauty");
    }
    expect(bizProfile("beauty_salon", ["beauty_salon"]).photos).toContain("施術例");
  });
  it("未知の業種は default（限定属性）", () => {
    const b = bizProfile("point_of_interest", ["point_of_interest"]);
    expect(b.kind).toBe("default");
    expect(b.limitedAttrs).toBe(true);
  });
  it("宿泊業は lodging", () => {
    expect(bizProfile("hotel", ["hotel", "lodging"]).kind).toBe("lodging");
    expect(bizProfile("ryokan", ["lodging"]).kind).toBe("lodging");
  });
  it("不動産は real_estate（物件写真の例）", () => {
    const b = bizProfile("real_estate_agency", ["real_estate_agency"]);
    expect(b.kind).toBe("real_estate");
    expect(b.photos).toContain("物件");
  });
  it("コインランドリーは laundromat（洗濯機の例・店舗誤判定しない）", () => {
    const b = bizProfile("laundry", ["laundry", "point_of_interest"]);
    expect(b.kind).toBe("laundromat");
    expect(b.attrs).toContain("24時間");
  });
  it("自動車整備は auto", () => {
    expect(bizProfile("car_repair", ["car_repair"]).kind).toBe("auto");
  });
  it("外壁塗装/リフォームは home-service", () => {
    expect(bizProfile("painter", ["general_contractor"]).kind).toBe("home-service");
  });
  it("primaryTypeを優先（飲食店だがtypesに店舗系が混在）", () => {
    // primaryType=restaurant を優先し food に。types先頭のstoreに引っ張られない
    expect(bizProfile("restaurant", ["store", "restaurant"]).kind).toBe("food");
  });
  it("uiLang=en で英語の例文を返す（kind/limitedAttrsは不変）", () => {
    const ja = bizProfile("restaurant", ["restaurant", "cafe"]);
    const en = bizProfile("restaurant", ["restaurant", "cafe"], "en");
    expect(en.kind).toBe("food");
    expect(en.limitedAttrs).toBe(false);
    expect(en.photos).toContain("dishes");
    expect(en.photos).not.toBe(ja.photos);
  });
  it("uiLang未指定は従来どおり日本語（後方互換）", () => {
    expect(bizProfile("dentist", ["dentist"]).attrs).toContain("保険");
  });
  it("uiLang=ko で韓国語の例文を返す（kind/limitedAttrsは不変・jaと異なる）", () => {
    const ja = bizProfile("restaurant", ["restaurant", "cafe"]);
    const ko = bizProfile("restaurant", ["restaurant", "cafe"], "ko");
    expect(ko.kind).toBe("food");
    expect(ko.limitedAttrs).toBe(false);
    expect(ko.photos).toBeTruthy();
    expect(ko.attrs).toBeTruthy();
    expect(ko.subcat).toBeTruthy();
    expect(ko.photos).not.toBe(ja.photos);
    expect(ko.attrs).not.toBe(ja.attrs);
    expect(ko.subcat).not.toBe(ja.subcat);
  });
  it("uiLang=zh で繁体字中国語の例文を返す（kind/limitedAttrsは不変・jaと異なる）", () => {
    const ja = bizProfile("restaurant", ["restaurant", "cafe"]);
    const zh = bizProfile("restaurant", ["restaurant", "cafe"], "zh");
    expect(zh.kind).toBe("food");
    expect(zh.limitedAttrs).toBe(false);
    expect(zh.photos).toBeTruthy();
    expect(zh.attrs).toBeTruthy();
    expect(zh.subcat).toBeTruthy();
    expect(zh.photos).not.toBe(ja.photos);
    expect(zh.attrs).not.toBe(ja.attrs);
    expect(zh.subcat).not.toBe(ja.subcat);
  });
});

describe("trimAddress", () => {
  it("郵便番号・国名を除去し丁目まで残す", () => {
    expect(trimAddress("日本、〒900-0014 沖縄県那覇市松尾2丁目8-19")).toBe("沖縄県那覇市松尾2丁目");
  });
  it("丁目があれば番地・建物を落とす", () => {
    expect(trimAddress("〒900-0013 沖縄県那覇市牧志3丁目2-10 ビル1F")).toBe("沖縄県那覇市牧志3丁目");
  });
  it("丁目が無ければ最初の番地数字以降を落とす", () => {
    expect(trimAddress("沖縄県浦添市大平1-2-3 ABCビル")).toBe("沖縄県浦添市大平");
    expect(trimAddress("沖縄県国頭郡恩納村前兼久123")).toBe("沖縄県国頭郡恩納村前兼久");
  });
  it("番地が無い住所はそのまま", () => {
    expect(trimAddress("沖縄県中頭郡北谷町美浜")).toBe("沖縄県中頭郡北谷町美浜");
  });
  it("海外住所は番地行と国名を落とし、郵便番号を除去", () => {
    expect(trimAddress("123 Main St, New York, NY 10001, USA")).toBe("New York, NY");
    expect(trimAddress("10 Downing St, London SW1A 2AA, UK")).toBe("London SW1A 2AA");
  });
  it("空文字は空文字", () => {
    expect(trimAddress("")).toBe("");
  });
});

function mockKV() {
  const m = new Map<string, string>();
  const ttl = new Map<string, number | undefined>(); // キー → 最後に書いたときの expirationTtl
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string, o?: { expirationTtl?: number }) => { m.set(k, v); ttl.set(k, o?.expirationTtl); },
    _ttl: ttl,
  } as any;
}
function makeEnv(): Env {
  return { CACHE: mockKV(), RATELIMIT: mockKV(), GOOGLE_PLACES_API_KEY: "K", TURNSTILE_SECRET: "S", OUTSCRAPER_API_KEY: "K" };
}
function makeReq(body: any): Request {
  return new Request("https://x/api/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "1.1.1.1" },
    body: JSON.stringify(body),
  });
}

const DETAILS = {
  id: "PID1", displayName: { text: "テスト店" }, formattedAddress: "那覇市",
  nationalPhoneNumber: "098", websiteUri: "https://x", businessStatus: "OPERATIONAL",
  primaryType: "restaurant", types: ["restaurant", "cafe"], rating: 4.6, userRatingCount: 95,
  reviews: [{ rating: 5, publishTime: "2026-06-01T00:00:00Z" }], photos: new Array(7).fill({ name: "p" }),
  regularOpeningHours: {}, editorialSummary: { text: "x" }, priceLevel: "PRICE_LEVEL_MODERATE",
  reservable: true, servesLunch: true,
  primaryTypeDisplayName: { text: "レストラン" },
  location: { latitude: 26.2, longitude: 127.68 },
};

// 対象から約1km（半径内）と約60km（半径外）の競合
const NEAR = { latitude: 26.209, longitude: 127.68 };
const FAR = { latitude: 26.74, longitude: 127.68 };

const ok = (j: any) => ({ ok: true, json: async () => j });

const isAreaCall = (init: any) => String(init?.headers?.["X-Goog-FieldMask"] ?? "").includes("viewport");
/** fetch の呼び出し履歴から、競合検索（位置を絞った searchText）だけを取り出す。 */
const competitorCalls = (f: any) => f.mock.calls.filter((c: any) => String(c[0]).includes(":searchText") && JSON.parse(c[1].body).locationRestriction);
// 対象店（26.2, 127.68）を含む「那覇市」の範囲。FAR（26.74）は含まない
const NAHA = { displayName: { text: "那覇市" }, types: ["locality", "political"], viewport: { low: { latitude: 26.16, longitude: 127.63 }, high: { latitude: 26.25, longitude: 127.74 } } };

/** Turnstile成功・findPlace成功・details・competitorsをURLで振り分けるfetch。 */
function routeFetch(opts: { details?: any; outscraper?: any; competitors?: any[]; area?: any } = {}) {
  return vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    if (u.includes("siteverify")) return ok({ success: true });
    if (u.includes(":searchText")) {
      const b = JSON.parse(init.body);
      // 入力エリアの解決（viewport を要求する呼び出し）。既定は「行政区画として解決できない」
      if (isAreaCall(init)) return ok(opts.area ? { places: [opts.area] } : {});
      return b.maxResultCount === 1
        ? ok({ places: [{ id: "PID1" }] })
        : ok({ places: opts.competitors ?? [
          { id: "PID2", displayName: { text: "A店" }, rating: 4.8, userRatingCount: 300, photos: new Array(10).fill({}), location: NEAR },
          { id: "PID3", displayName: { text: "遠い店" }, rating: 4.9, userRatingCount: 900, photos: new Array(10).fill({}), location: FAR },
          { id: "PID1", displayName: { text: "テスト店" }, rating: 4.6, userRatingCount: 95, location: { latitude: 26.2, longitude: 127.68 } },
        ] });
    }
    if (u.includes("/places/")) return ok(opts.details ?? DETAILS);
    if (u.includes("search-v3")) return ok({ data: [[{
      name: "テスト店", photos_count: 30, verified: true, type: "レストラン", subtypes: "レストラン, カフェ",
      ...(opts.outscraper ?? {}),
      reviews_per_score: { "5": 50 },
      posts: [{ body: "x", timestamp: Math.floor(Date.now() / 1000) }],
      about: { "a": { "x": true } },
      menu_link: "m", reservation_links: ["r"],
      ...("posts" in (opts.outscraper ?? {}) ? { posts: opts.outscraper.posts } : {}),
    }]], status: "Success" });
    if (u.includes("reviews-v3")) return ok({ data: [{ reviews_data: [{ owner_answer: "thanks", review_rating: 5 }] }], status: "Success" });
    throw new Error("unexpected url " + u);
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("handleDiagnose", () => {
  it("必須欠落で400", async () => {
    const res = await handleDiagnose(makeReq({ name: "", area: "", compare: false, turnstileToken: "t" }), makeEnv());
    expect(res.status).toBe(400);
  });

  it("bot判定失敗で403", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: any) => String(u).includes("siteverify") ? ok({ success: false }) : ok({})));
    const res = await handleDiagnose(makeReq({ name: "店", area: "那覇", compare: false, turnstileToken: "t" }), makeEnv());
    expect(res.status).toBe(403);
  });

  it("該当なしで404", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: any) => String(u).includes("siteverify") ? ok({ success: true }) : ok({})));
    const res = await handleDiagnose(makeReq({ name: "無", area: "無", compare: false, turnstileToken: "t" }), makeEnv());
    expect(res.status).toBe(404);
  });

  it("成功時にprofile・prominence・ranking・項目別診断を返す", async () => {
    vi.stubGlobal("fetch", routeFetch());
    const res = await handleDiagnose(makeReq({ name: "テスト店", area: "那覇", compare: true, turnstileToken: "t" }), makeEnv());
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(typeof data.profile.total).toBe("number");
    expect(typeof data.prominence).toBe("number");
    expect(data.rankingStatus).toBe("ok");
    // 半径外の店と対象自身は母数に入れない（A店＋対象＝2）
    expect(data.ranking.total).toBe(2);
    expect(data.ranking.competitors.map((c: any) => c.name)).toEqual(["A店"]);
    expect(data.ranking.basis).toEqual({ mode: "gbp", label: "レストラン" });
    // エリアを行政区画として解決できないときは、対象中心の半径で比べる
    expect(data.ranking.scope).toEqual({ kind: "radius", km: 5 });
    expect(data.items.length).toBeGreaterThan(5);
    for (const it of data.items) expect(["good", "warn", "bad", "na"]).toContain(it.status);
    expect(data.items.map((i: any) => i.key)).toEqual([...ITEM_KEYS]); // 項目数・並びはどの店でも同じ
    expect(data.bizByLang.en.photos).toBeTruthy();
  });

  it("競合検索は矩形で位置を絞り、GBPカテゴリ名を検索語にする（円指定・エリア文字列は使わない）", async () => {
    const f = routeFetch();
    vi.stubGlobal("fetch", f);
    await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市", compare: true, turnstileToken: "t" }), makeEnv());
    const comp = competitorCalls(f);
    expect(comp).toHaveLength(1);
    const body = JSON.parse(comp[0][1].body);
    expect(body.textQuery).toBe("レストラン");
    expect(body.locationRestriction.rectangle.low.latitude).toBeLessThan(26.2);
    expect(body.locationRestriction.rectangle.high.latitude).toBeGreaterThan(26.2);
    expect(body.locationRestriction.circle).toBeUndefined();
  });

  it("利用者が業種を指定したら、その業種名で比較する", async () => {
    const f = routeFetch();
    vi.stubGlobal("fetch", f);
    const res = await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市", compare: true, turnstileToken: "t", industry: "  音楽教室 " }), makeEnv());
    const data: any = await res.json();
    expect(data.ranking.basis).toEqual({ mode: "keyword", label: "音楽教室" });
    expect(data.industry).toBe("音楽教室");
  });

  it("業種を特定できないときは異業種と比べず、ranking=null・need_industry を返す", async () => {
    // GBPカテゴリ無し・primaryType無し（typesは汎用のみ）＝今回の不具合の条件
    const details = { ...DETAILS, primaryType: undefined, primaryTypeDisplayName: undefined, types: ["point_of_interest", "establishment"] };
    const f = routeFetch({ details, outscraper: { type: null, subtypes: null } });
    vi.stubGlobal("fetch", f);
    const res = await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市", compare: true, turnstileToken: "t" }), makeEnv());
    const data: any = await res.json();
    expect(data.ranking).toBeNull();
    expect(data.rankingStatus).toBe("need_industry");
    expect(competitorCalls(f)).toHaveLength(0);
  });

  it("入力エリアが市・県として解決でき、対象がその中にあれば、エリアの範囲で比べる", async () => {
    const f = routeFetch({ area: NAHA });
    vi.stubGlobal("fetch", f);
    const res = await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市", compare: true, turnstileToken: "t" }), makeEnv());
    const data: any = await res.json();
    expect(data.ranking.scope).toEqual({ kind: "area", name: "那覇市" });
    expect(data.rankingBasis).toEqual({ mode: "gbp", label: "レストラン", scope: { kind: "area", name: "那覇市" } });
    expect(JSON.parse(competitorCalls(f)[0][1].body).locationRestriction.rectangle).toEqual(NAHA.viewport);
    expect(data.ranking.competitors.map((c: any) => c.name)).toEqual(["A店"]); // エリア外の「遠い店」は入らない
  });

  it("対象が入力エリアの外にあるときは、エリアではなく半径で比べる", async () => {
    const elsewhere = { ...NAHA, viewport: { low: { latitude: 34.0, longitude: 135.0 }, high: { latitude: 35.0, longitude: 136.0 } } };
    vi.stubGlobal("fetch", routeFetch({ area: elsewhere }));
    const res = await handleDiagnose(makeReq({ name: "テスト店", area: "大阪市", compare: true, turnstileToken: "t" }), makeEnv());
    const data: any = await res.json();
    expect(data.ranking.scope.kind).toBe("radius");
  });

  it("番地まで入力されたら、エリア解決を呼ばずに半径で比べる", async () => {
    const f = routeFetch({ area: NAHA });
    vi.stubGlobal("fetch", f);
    const res = await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市牧志1-2-3", compare: true, turnstileToken: "t" }), makeEnv());
    const data: any = await res.json();
    expect(data.ranking.scope).toEqual({ kind: "radius", km: 4 });
    expect(f.mock.calls.filter((c: any) => isAreaCall(c[1]))).toHaveLength(0);
  });

  it("同じエリア・同じ業種の2店は同じ母集団で比べる（2店目は競合検索をやり直さない）", async () => {
    // 同系列の2店（PID1 / PID9）。どちらも那覇市内にあり、検索結果には両方が入っている
    const pool = [
      { id: "PID2", displayName: { text: "A店" }, rating: 4.8, userRatingCount: 300, photos: new Array(10).fill({}), location: NEAR },
      { id: "PID1", displayName: { text: "テスト店" }, rating: 4.6, userRatingCount: 95, location: { latitude: 26.2, longitude: 127.68 } },
      { id: "PID9", displayName: { text: "テスト店 2号店" }, rating: 4.0, userRatingCount: 12, location: { latitude: 26.21, longitude: 127.7 } },
    ];
    const env = makeEnv();
    const f1 = routeFetch({ area: NAHA, competitors: pool });
    vi.stubGlobal("fetch", f1);
    const a: any = await (await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市", compare: true, turnstileToken: "t" }), env)).json();

    const second = { ...DETAILS, id: "PID9", displayName: { text: "テスト店 2号店" }, rating: 4.0, userRatingCount: 12, location: { latitude: 26.21, longitude: 127.7 } };
    const f2 = routeFetch({ area: NAHA, competitors: pool, details: second, outscraper: { place_id: "PID9" } });
    vi.stubGlobal("fetch", f2);
    const b: any = await (await handleDiagnose(makeReq({ name: "テスト店 2号店", area: "那覇市", compare: true, turnstileToken: "t" }), env)).json();

    expect(competitorCalls(f1)).toHaveLength(1);
    expect(competitorCalls(f2)).toHaveLength(0); // 母集団はキャッシュを共有
    expect(a.ranking.total).toBe(3);
    expect(b.ranking.total).toBe(3);
    // 互いが相手の比較対象に入っていて、順位が矛盾しない（両方が1位にはならない）
    expect(a.ranking.competitors.map((c: any) => c.name)).toContain("テスト店 2号店");
    expect(b.ranking.competitors.map((c: any) => c.name)).toContain("テスト店");
    expect(new Set([a.ranking.rank, b.ranking.rank]).size).toBe(2);
  });

  it("検索結果に出てこなかった系列店も、診断済みなら同じエリアの比較対象に入る", async () => {
    // 検索が返すのは A店 だけ（上限のある検索で、2店とも結果に入らなかった状況）
    const pool = [{ id: "PID2", displayName: { text: "A店" }, rating: 3.5, userRatingCount: 4, location: NEAR }];
    const env = makeEnv();
    vi.stubGlobal("fetch", routeFetch({ area: NAHA, competitors: pool }));
    const a: any = await (await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市", compare: true, turnstileToken: "t" }), env)).json();
    expect(a.ranking.rank).toBe(1);

    const second = { ...DETAILS, id: "PID9", displayName: { text: "テスト店" }, rating: 4.0, userRatingCount: 12, location: { latitude: 26.21, longitude: 127.7 } };
    vi.stubGlobal("fetch", routeFetch({ area: NAHA, competitors: pool, details: second, outscraper: { place_id: "PID9" } }));
    const b: any = await (await handleDiagnose(makeReq({ name: "テスト店 2号店", area: "那覇市", compare: true, turnstileToken: "t" }), env)).json();
    // 先に診断した1号店（知名度が上）が2号店の表に入るので、2号店は1位にならない
    expect(b.ranking.total).toBe(3);
    expect(b.ranking.rank).toBe(2);
    expect(b.ranking.sameBrandCount).toBe(1);
  });

  it("後から別の店が母集団に加わったら、先に診断した店を診断し直したときの順位にも反映される", async () => {
    const pool = [{ id: "PID2", displayName: { text: "A店" }, rating: 3.5, userRatingCount: 4, location: NEAR }];
    const env = makeEnv();
    const weak = { ...DETAILS, rating: 3.6, userRatingCount: 5 };
    const reqA = () => makeReq({ name: "テスト店", area: "那覇市", compare: true, turnstileToken: "t" });
    vi.stubGlobal("fetch", routeFetch({ area: NAHA, competitors: pool, details: weak }));
    const a1: any = await (await handleDiagnose(reqA(), env)).json();
    expect([a1.ranking.rank, a1.ranking.total]).toEqual([1, 2]);

    // Aより知名度の高いB店（検索結果には出ない）を診断
    const strong = { ...DETAILS, id: "PID9", displayName: { text: "B店" }, rating: 4.9, userRatingCount: 800, location: { latitude: 26.21, longitude: 127.7 } };
    vi.stubGlobal("fetch", routeFetch({ area: NAHA, competitors: pool, details: strong, outscraper: { place_id: "PID9" } }));
    const b: any = await (await handleDiagnose(makeReq({ name: "B店", area: "那覇市", compare: true, turnstileToken: "t" }), env)).json();
    expect(b.ranking.rank).toBe(1);

    // Aを同じ入力で診断し直す：外部APIは呼ばず、順位だけ現在の母集団で出し直す
    const f = routeFetch({ area: NAHA, competitors: pool, details: weak });
    vi.stubGlobal("fetch", f);
    const a2: any = await (await handleDiagnose(reqA(), env)).json();
    expect([a2.ranking.rank, a2.ranking.total]).toEqual([2, 3]);
    expect(f.mock.calls.filter((c: any) => !String(c[0]).includes("siteverify"))).toHaveLength(0);
  });

  it("利用者が業種を指定した比較では、対象を共有の母集団に追記しない（他の人の比較に異業種を混ぜない）", async () => {
    const pool = [{ id: "PID2", displayName: { text: "ピアノ教室" }, rating: 4.5, userRatingCount: 20, location: NEAR }];
    const env = makeEnv();
    // 飲食店（テスト店）を「音楽教室」として診断
    vi.stubGlobal("fetch", routeFetch({ area: NAHA, competitors: pool }));
    await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市", compare: true, turnstileToken: "t", industry: "音楽教室" }), env);
    // 別の店が同じエリア・同じ業種指定で診断しても、先の飲食店は比較対象に入らない
    const other = { ...DETAILS, id: "PID9", displayName: { text: "別の音楽教室" }, location: { latitude: 26.21, longitude: 127.7 } };
    vi.stubGlobal("fetch", routeFetch({ area: NAHA, competitors: pool, details: other, outscraper: { place_id: "PID9" } }));
    const b: any = await (await handleDiagnose(makeReq({ name: "別の音楽教室", area: "那覇市", compare: true, turnstileToken: "t", industry: "音楽教室" }), env)).json();
    expect(b.ranking.competitors.map((c: any) => c.name)).toEqual(["ピアノ教室"]);
  });

  it("母集団に店を追記しても、有効期限は最初の取得から14日のまま延びない", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
      const pool = [{ id: "PID2", displayName: { text: "A店" }, rating: 3.5, userRatingCount: 4, location: NEAR }];
      const env = makeEnv();
      const poolTtl = () => [...(env.CACHE as any)._ttl.entries()].find(([k]: [string, number]) => k.startsWith("pool:"))![1];
      vi.stubGlobal("fetch", routeFetch({ area: NAHA, competitors: pool }));
      await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市", compare: true, turnstileToken: "t" }), env);
      expect(poolTtl()).toBe(14 * 86400);

      vi.setSystemTime(new Date("2026-10-11T00:00:00Z")); // 10日後に別の店を診断（追記が起きる）
      const second = { ...DETAILS, id: "PID9", displayName: { text: "B店" }, location: { latitude: 26.21, longitude: 127.7 } };
      vi.stubGlobal("fetch", routeFetch({ area: NAHA, competitors: pool, details: second, outscraper: { place_id: "PID9" } }));
      await handleDiagnose(makeReq({ name: "B店", area: "那覇市", compare: true, turnstileToken: "t" }), env);
      expect(poolTtl()).toBe(4 * 86400);
    } finally {
      vi.useRealTimers();
    }
  });

  it("投稿だけ欠けた応答が来たら一度取り直し、取れた投稿で判定する", async () => {
    const base = routeFetch();
    let searchCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      if (u.includes("search-v3") && ++searchCalls === 1) {
        // 1回目：写真・認証はあるのに投稿が空
        return ok({ data: [[{ name: "テスト店", photos_count: 30, verified: true, reviews_per_score: { "5": 50 }, posts: null }]], status: "Success" });
      }
      return base(url, init);
    }));
    const env = makeEnv();
    const data: any = await (await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市", compare: false, turnstileToken: "t" }), env)).json();
    expect(searchCalls).toBe(2);
    expect(data.items.find((i: any) => i.key === "posts")).toMatchObject({ status: "good", v: { has: true } });
    const ttl = [...(env.CACHE as any)._ttl.entries()].find(([k]: [string, number]) => k.startsWith("base:"))![1];
    expect(ttl).toBe(14 * 86400); // 投稿が取れたので通常の保存期間
  });

  it("取り直しても投稿が無ければ、店舗データは短時間（6時間）だけ保存する", async () => {
    const env = makeEnv();
    vi.stubGlobal("fetch", routeFetch({ outscraper: { posts: [] } }));
    await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市", compare: false, turnstileToken: "t" }), env);
    const ttl = [...(env.CACHE as any)._ttl.entries()].find(([k]: [string, number]) => k.startsWith("base:"))![1];
    expect(ttl).toBe(6 * 3600);
  });

  it("取り直しが別の店を返したら使わない／取り直しが失敗してもクチコミは取得する", async () => {
    const base = routeFetch();
    const run = async (second: "other" | "throw") => {
      let n = 0;
      const f = vi.fn(async (url: any, init?: any) => {
        const u = String(url);
        if (u.includes("search-v3")) {
          n++;
          if (n === 1) return ok({ data: [[{ name: "テスト店", place_id: "PID1", photos_count: 30, verified: true, reviews_per_score: { "5": 5 }, posts: null }]], status: "Success" });
          if (second === "throw") throw new Error("network");
          return ok({ data: [[{ name: "別の店", place_id: "OTHER", photos_count: 9, verified: true, posts: [{ timestamp: Math.floor(Date.now() / 1000) }] }]], status: "Success" });
        }
        return base(url, init);
      });
      vi.stubGlobal("fetch", f);
      const data: any = await (await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市", compare: false, turnstileToken: "t" }), makeEnv())).json();
      return { data, f };
    };
    const a = await run("other");
    expect(a.data.photosCount).toBe(30); // 初回（対象の店）のデータのまま
    expect(a.data.items.find((i: any) => i.key === "posts").v.has).toBe(false);
    const b = await run("throw");
    expect(b.data.photosCount).toBe(30);
    expect(b.f.mock.calls.some((c: any) => String(c[0]).includes("reviews-v3"))).toBe(true);
  });

  it("2回続けて投稿が空なら投稿なしと確定し、以後は取り直さず通常どおり保存する", async () => {
    const env = makeEnv();
    const searchCalls = (f: any) => f.mock.calls.filter((c: any) => String(c[0]).includes("search-v3")).length;
    const diag = async (area: string) => {
      const f = routeFetch({ outscraper: { place_id: "PID1", posts: [] } });
      vi.stubGlobal("fetch", f);
      await handleDiagnose(makeReq({ name: "テスト店", area, compare: false, turnstileToken: "t" }), env);
      const ttl = [...(env.CACHE as any)._ttl.entries()].filter(([k]: [string, number]) => k.startsWith("base:") && k.includes(area)).pop()![1];
      return { calls: searchCalls(f), ttl };
    };
    expect(await diag("那覇市")).toEqual({ calls: 2, ttl: 6 * 3600 });   // 1回目：取り直す・短時間保存
    expect(await diag("那覇")).toEqual({ calls: 2, ttl: 14 * 86400 });   // 2回目も空：投稿なしと確定
    expect(await diag("沖縄県那覇市")).toEqual({ calls: 1, ttl: 14 * 86400 }); // 確定後は取り直さない
  });

  it("Outscraperの応答に写真数・認証が無いときは、結果でも null（0枚・未認証と断定しない）", async () => {
    vi.stubGlobal("fetch", routeFetch({ outscraper: { photos_count: undefined, verified: undefined } }));
    const res = await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市", compare: false, turnstileToken: "t" }), makeEnv());
    const data: any = await res.json();
    expect(data.photosCount).toBeNull();
    expect(data.verified).toBeNull();
    expect(data.items.find((i: any) => i.key === "verified")).toMatchObject({ status: "na", v: { reason: "nodata" } });
  });

  it("範囲内に同業がいなければ no_peers", async () => {
    vi.stubGlobal("fetch", routeFetch({ competitors: [{ id: "PID3", displayName: { text: "遠い店" }, rating: 4.9, userRatingCount: 900, location: FAR }] }));
    const res = await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市", compare: true, turnstileToken: "t" }), makeEnv());
    const data: any = await res.json();
    expect(data.ranking).toBeNull();
    expect(data.rankingStatus).toBe("no_peers");
  });

  it("Outscraperが別の店を返したら、その情報は採点に使わない", async () => {
    vi.stubGlobal("fetch", routeFetch({ outscraper: { place_id: "OTHER" } }));
    const res = await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市", compare: false, turnstileToken: "t" }), makeEnv());
    const data: any = await res.json();
    expect(data.verified).toBeNull();
    expect(data.photosCount).toBeNull();
  });

  it("業種だけ変えた再比較では、店舗情報(Details/Outscraper)を取り直さない", async () => {
    const f = routeFetch();
    vi.stubGlobal("fetch", f);
    const env = makeEnv();
    await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市", compare: true, turnstileToken: "t" }), env);
    const before = f.mock.calls.length;
    await handleDiagnose(makeReq({ name: "テスト店", area: "那覇市", compare: true, turnstileToken: "t", industry: "カフェ" }), env);
    const added = f.mock.calls.slice(before).map((c: any) => String(c[0])).filter((u: string) => !u.includes("siteverify"));
    expect(added.every((u: string) => u.includes(":searchText"))).toBe(true);
    expect(added).toHaveLength(1); // 競合検索の1回だけ（エリアの解決結果もキャッシュ済み）
  });

  it("compare:falseならranking=null", async () => {
    vi.stubGlobal("fetch", routeFetch());
    const res = await handleDiagnose(makeReq({ name: "テスト店", area: "那覇", compare: false, turnstileToken: "t" }), makeEnv());
    const data: any = await res.json();
    expect(data.ranking).toBeNull();
    expect(data.rankingStatus).toBe("off");
  });

  it("管理者キー一致でBot判定・レート制限をスキップして200", async () => {
    const f = routeFetch();
    // siteverifyを常に失敗させても、adminなら検証スキップで200になる
    vi.stubGlobal("fetch", vi.fn(async (url: any, init?: any) =>
      String(url).includes("siteverify") ? ok({ success: false }) : f(url, init)));
    const env = { ...makeEnv(), ADMIN_KEY: "SECRET" };
    const res = await handleDiagnose(makeReq({ name: "テスト店", area: "那覇", compare: false, turnstileToken: "t", admin: "SECRET" }), env);
    expect(res.status).toBe(200);
  });

  it("管理者キー不一致は通常通りBot判定（403）", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: any) => String(u).includes("siteverify") ? ok({ success: false }) : ok({})));
    const env = { ...makeEnv(), ADMIN_KEY: "SECRET" };
    const res = await handleDiagnose(makeReq({ name: "店", area: "那覇", compare: false, turnstileToken: "t", admin: "WRONG" }), env);
    expect(res.status).toBe(403);
  });

  it("ADMIN_KEY未設定なら admin 値があってもバイパスしない（403）", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: any) => String(u).includes("siteverify") ? ok({ success: false }) : ok({})));
    const res = await handleDiagnose(makeReq({ name: "店", area: "那覇", compare: false, turnstileToken: "t", admin: "anything" }), makeEnv());
    expect(res.status).toBe(403);
  });

  it("2回目は同一入力をキャッシュから返し、Places APIを再度叩かない", async () => {
    const f = routeFetch();
    vi.stubGlobal("fetch", f);
    const body = { name: "テスト店", area: "那覇", compare: false, turnstileToken: "t" };
    const env = makeEnv(); // 同一KVを2回の呼び出しで共有
    const first = await handleDiagnose(makeReq(body), env);
    expect(first.status).toBe(200);
    const callsAfterFirst = f.mock.calls.length;
    const second = await handleDiagnose(makeReq(body), env);
    expect(second.status).toBe(200);
    // 2回目に増えたfetchのうち、siteverify(Turnstile)以外＝Places系は0であること
    const placesCallsSecond = f.mock.calls
      .slice(callsAfterFirst)
      .filter((c: any) => !String(c[0]).includes("siteverify"));
    expect(placesCallsSecond.length).toBe(0);
  });
});
