import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleDiagnose, type Env } from "../src/handlers/diagnose";

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
