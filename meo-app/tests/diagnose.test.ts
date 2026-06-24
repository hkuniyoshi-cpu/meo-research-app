import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleDiagnose, trimAddress, bizProfile, type Env } from "../src/handlers/diagnose";

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
  it("空文字は空文字", () => {
    expect(trimAddress("")).toBe("");
  });
});

function mockKV() {
  const m = new Map<string, string>();
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); } } as any;
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
};

const ok = (j: any) => ({ ok: true, json: async () => j });

/** Turnstile成功・findPlace成功・details・competitorsをURLで振り分けるfetch。 */
function routeFetch() {
  return vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    if (u.includes("siteverify")) return ok({ success: true });
    if (u.includes(":searchText")) {
      const b = JSON.parse(init.body);
      return b.maxResultCount === 1
        ? ok({ places: [{ id: "PID1" }] })
        : ok({ places: [{ id: "PID2", displayName: { text: "A店" }, rating: 4.8, userRatingCount: 300, photos: new Array(10).fill({}) }] });
    }
    if (u.includes("/places/")) return ok(DETAILS);
    if (u.includes("search-v3")) return ok({ data: [[{
      name: "テスト店", photos_count: 30, verified: true,
      reviews_per_score: { "5": 50 },
      posts: [{ body: "x", timestamp: Math.floor(Date.now() / 1000) }],
      about: { "a": { "x": true } },
      menu_link: "m", reservation_links: ["r"],
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

  it("成功時にprofile・prominence・ranking・tipsVisible(<=3)を返す", async () => {
    vi.stubGlobal("fetch", routeFetch());
    const res = await handleDiagnose(makeReq({ name: "テスト店", area: "那覇", compare: true, turnstileToken: "t" }), makeEnv());
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(typeof data.profile.total).toBe("number");
    expect(typeof data.prominence).toBe("number");
    expect(data.ranking.total).toBeGreaterThanOrEqual(2);
    expect(data.tipsVisible.length).toBeLessThanOrEqual(3);
    expect(data.tipsLockedCount).toBeGreaterThanOrEqual(0);
  });

  it("compare:falseならranking=null", async () => {
    vi.stubGlobal("fetch", routeFetch());
    const res = await handleDiagnose(makeReq({ name: "テスト店", area: "那覇", compare: false, turnstileToken: "t" }), makeEnv());
    const data: any = await res.json();
    expect(data.ranking).toBeNull();
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
