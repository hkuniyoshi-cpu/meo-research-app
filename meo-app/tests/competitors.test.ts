import { describe, it, expect, vi } from "vitest";
import { pickIndustry, cleanIndustry, boundingRect, haversineMeters, findCompetitors, findAreaScope, rectContains } from "../src/lib/places";
import type { Region } from "../src/lib/places";

const ok = (j: any) => ({ ok: true, status: 200, json: async () => j });
const CENTER = { latitude: 26.246, longitude: 127.7037 };
const R8: Region = { kind: "radius", center: CENTER, radiusMeters: 8000 };

describe("pickIndustry", () => {
  it("利用者指定が最優先", () => {
    expect(pickIndustry("音楽教室", "学習センター", "school", "学校")).toEqual({ mode: "keyword", keyword: "音楽教室", label: "音楽教室" });
  });
  it("指定が無ければGBPのメインカテゴリ", () => {
    expect(pickIndustry("", "接骨院", "health", "健康")).toEqual({ mode: "gbp", keyword: "接骨院", label: "接骨院" });
  });
  it("GBPカテゴリも無ければ具体的な primaryType をタイプ指定で使う", () => {
    expect(pickIndustry("", null, "ramen_restaurant", "ラーメン屋")).toEqual({ mode: "type", type: "ramen_restaurant", label: "ラーメン屋" });
  });
  it("primaryType が無い／汎用タイプだけのときは業種を決めない（異業種を混ぜない）", () => {
    expect(pickIndustry("", null, undefined, undefined)).toBeNull();
    expect(pickIndustry("", "", "store", "店舗")).toBeNull();
    expect(pickIndustry("", null, "health", "健康")).toBeNull();
    expect(pickIndustry("", null, "point_of_interest", undefined)).toBeNull();
  });
});

describe("cleanIndustry", () => {
  it("前後の空白・制御文字を除き、長さを制限する", () => {
    expect(cleanIndustry("  音楽\n教室  ")).toBe("音楽 教室");
    expect(cleanIndustry("あ".repeat(100))).toHaveLength(40);
    expect(cleanIndustry(undefined)).toBe("");
    expect(cleanIndustry(123)).toBe("");
  });
});

describe("boundingRect", () => {
  it("半径の円がちょうど収まる矩形を返す（東西南北の端が半径ぶん離れている）", () => {
    const r = boundingRect(CENTER, 8000);
    const north = haversineMeters(CENTER, { latitude: r.high.latitude, longitude: CENTER.longitude });
    const east = haversineMeters(CENTER, { latitude: CENTER.latitude, longitude: r.high.longitude });
    expect(north).toBeGreaterThan(7990);
    expect(north).toBeLessThan(8010);
    // 経度方向は緯度で縮むぶん広げてあるので、端までの距離は半径以上になる
    expect(east).toBeGreaterThanOrEqual(7990);
    expect(east).toBeLessThan(8100);
    expect(r.low.longitude).toBeLessThan(CENTER.longitude);
  });
  it("日付変更線をまたぐときは low.longitude > high.longitude", () => {
    const r = boundingRect({ latitude: 0, longitude: 179.99 }, 8000);
    expect(r.low.longitude).toBeGreaterThan(r.high.longitude);
  });
  it("極を含むときは全経度", () => {
    const r = boundingRect({ latitude: 89.99, longitude: 10 }, 8000);
    expect(r.low.longitude).toBe(-180);
    expect(r.high.longitude).toBe(180);
    expect(r.high.latitude).toBe(90);
  });
});

describe("findCompetitors", () => {
  const near = (id: string) => ({ id, displayName: { text: id }, location: { latitude: 26.25, longitude: 127.70 } });
  const corner = { id: "corner", displayName: { text: "corner" }, location: { latitude: 26.3175, longitude: 127.783 } }; // 矩形の角＝円の外

  it("矩形で絞り、円の外（矩形の角）の店は除く", async () => {
    const f = vi.fn().mockResolvedValue(ok({ places: [near("a"), corner] }));
    const r = await findCompetitors({ mode: "keyword", keyword: "音楽教室", label: "音楽教室" }, R8, "K", "ja", 2, f as any);
    expect(r.places.map(p => p.id)).toEqual(["a"]);
    expect(r.fetched).toBe(2);
    expect(r.capped).toBe(false);
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.textQuery).toBe("音楽教室");
    expect(body.locationRestriction.rectangle).toBeTruthy();
    expect(body.includedType).toBeUndefined();
  });

  it("タイプ指定のときは includedType と strictTypeFiltering を付ける", async () => {
    const f = vi.fn().mockResolvedValue(ok({ places: [near("a")] }));
    await findCompetitors({ mode: "type", type: "ramen_restaurant", label: "ラーメン屋" }, R8, "K", "ja", 2, f as any);
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.includedType).toBe("ramen_restaurant");
    expect(body.strictTypeFiltering).toBe(true);
    expect(body.textQuery).toBe("ラーメン屋");
  });

  it("nextPageToken を上限ページまで辿り、2ページ目は同じ条件に pageToken だけ足す", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(ok({ places: [near("a")], nextPageToken: "T1" }))
      .mockResolvedValueOnce(ok({ places: [near("b")], nextPageToken: "T2" }));
    const r = await findCompetitors({ mode: "gbp", keyword: "接骨院", label: "接骨院" }, R8, "K", "ja", 2, f as any);
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.places.map(p => p.id)).toEqual(["a", "b"]);
    expect(r.capped).toBe(true); // まだ続きがある
    const b1 = JSON.parse(f.mock.calls[0][1].body), b2 = JSON.parse(f.mock.calls[1][1].body);
    expect(b2).toEqual({ ...b1, pageToken: "T1" });
  });

  it("1ページ目が失敗したら例外（位置制限なしの検索に切り替えない）", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
    await expect(findCompetitors({ mode: "keyword", keyword: "x", label: "x" }, R8, "K", "ja", 2, f as any)).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("2ページ目が通信例外でも、取れた分だけで続ける", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(ok({ places: [near("a")], nextPageToken: "T1" }))
      .mockRejectedValueOnce(new Error("network"));
    const r = await findCompetitors({ mode: "keyword", keyword: "x", label: "x" }, R8, "K", "ja", 2, f as any);
    expect(r.places.map(p => p.id)).toEqual(["a"]);
    expect(r.capped).toBe(true);
  });

  it("エリア指定のときは、そのエリアの矩形で絞り、矩形内の店をすべて残す", async () => {
    const rect = { low: { latitude: 26.0, longitude: 127.5 }, high: { latitude: 26.9, longitude: 128.4 } };
    const far = { id: "far", displayName: { text: "far" }, location: { latitude: 26.8, longitude: 128.3 } };  // 対象から遠いがエリア内
    const out = { id: "out", displayName: { text: "out" }, location: { latitude: 24.3, longitude: 124.1 } };  // エリア外
    const f = vi.fn().mockResolvedValue(ok({ places: [near("a"), far, out] }));
    const r = await findCompetitors({ mode: "gbp", keyword: "接骨院", label: "接骨院" }, { kind: "area", name: "沖縄県", rect }, "K", "ja", 2, f as any);
    expect(r.places.map(p => p.id)).toEqual(["a", "far"]);
    expect(JSON.parse(f.mock.calls[0][1].body).locationRestriction.rectangle).toEqual(rect);
  });

  it("2ページ目の失敗は、取れた分だけで続ける", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(ok({ places: [near("a")], nextPageToken: "T1" }))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const r = await findCompetitors({ mode: "keyword", keyword: "x", label: "x" }, R8, "K", "ja", 2, f as any);
    expect(r.places.map(p => p.id)).toEqual(["a"]);
    expect(r.capped).toBe(true);
  });
});

describe("findAreaScope", () => {
  const vp = { low: { latitude: 26.22, longitude: 127.68 }, high: { latitude: 26.27, longitude: 127.76 } };
  const res = (types: string[], viewport: any = vp) => ok({ places: [{ displayName: { text: "浦添市" }, types, viewport }] });

  it("市区町村・都道府県はエリアとして返す", async () => {
    const f = vi.fn().mockResolvedValue(res(["locality", "political"]));
    expect(await findAreaScope("浦添市", "K", "ja", f as any)).toEqual({ name: "浦添市", rect: vp });
    const g = vi.fn().mockResolvedValue(res(["administrative_area_level_1", "political"]));
    expect(await findAreaScope("沖縄県", "K", "ja", g as any)).not.toBeNull();
  });
  it("町名・番地・施設に解決されたら null（半径での比較に回す）", async () => {
    for (const types of [["sublocality_level_2", "sublocality", "political"], ["premise", "street_address"], ["route"], ["restaurant", "point_of_interest"]]) {
      const f = vi.fn().mockResolvedValue(res(types));
      expect(await findAreaScope("x", "K", "ja", f as any)).toBeNull();
    }
  });
  it("区（sublocality_level_1）は、十分な広さがあるときだけエリア扱い", async () => {
    const small = { low: { latitude: 26.21, longitude: 127.68 }, high: { latitude: 26.22, longitude: 127.69 } }; // 約1km四方
    expect(await findAreaScope("x", "K", "ja", vi.fn().mockResolvedValue(res(["sublocality_level_1"], small)) as any)).toBeNull();
    expect(await findAreaScope("x", "K", "ja", vi.fn().mockResolvedValue(res(["sublocality_level_1"], vp)) as any)).not.toBeNull();
  });
  it("該当なし・viewport無しは null", async () => {
    expect(await findAreaScope("x", "K", "ja", vi.fn().mockResolvedValue(ok({})) as any)).toBeNull();
    expect(await findAreaScope("x", "K", "ja", vi.fn().mockResolvedValue(ok({ places: [{ types: ["locality"] }] })) as any)).toBeNull();
  });
});

describe("rectContains", () => {
  it("日付変更線をまたぐ矩形も判定できる", () => {
    const r = { low: { latitude: -1, longitude: 179 }, high: { latitude: 1, longitude: -179 } };
    expect(rectContains(r, { latitude: 0, longitude: 179.5 })).toBe(true);
    expect(rectContains(r, { latitude: 0, longitude: -179.5 })).toBe(true);
    expect(rectContains(r, { latitude: 0, longitude: 0 })).toBe(false);
    expect(rectContains(r, { latitude: 5, longitude: 179.5 })).toBe(false);
  });
});
