import { describe, it, expect, vi } from "vitest";
import { findPlace, normalizeDetails } from "../src/lib/places";

const DETAILS_SAMPLE = {
  id: "PID1",
  displayName: { text: "クレープの森" },
  formattedAddress: "沖縄県那覇市牧志1-1",
  nationalPhoneNumber: "098-000-0000",
  websiteUri: "https://example.com",
  businessStatus: "OPERATIONAL",
  primaryType: "restaurant",
  types: ["restaurant", "cafe"],
  rating: 4.6,
  userRatingCount: 95,
  reviews: [{ rating: 5, publishTime: "2026-06-01T00:00:00Z" }],
  photos: new Array(7).fill({ name: "p" }),
  regularOpeningHours: { weekdayDescriptions: ["月: 10–18"] },
  editorialSummary: { text: "人気店" },
  priceLevel: "PRICE_LEVEL_MODERATE",
  reservable: true,
  servesLunch: true,
};

describe("normalizeDetails", () => {
  it("Places応答をPlaceDataへ変換する", () => {
    const p = normalizeDetails(DETAILS_SAMPLE);
    expect(p.placeId).toBe("PID1");
    expect(p.displayName).toBe("クレープの森");
    expect(p.photoCount).toBe(7);
    expect(p.hasRegularHours).toBe(true);
    expect(p.editorialSummary).toBe("人気店");
    expect(p.userRatingCount).toBe(95);
    expect(p.reviews).toHaveLength(1);
  });

  it("公式の実属性（駐車場/決済/バリアフリー/入れ子）をattributeCountに数える", () => {
    const p = normalizeDetails({
      ...DETAILS_SAMPLE,
      parkingOptions: { freeParkingLot: true, paidParkingLot: false },
      paymentOptions: { acceptsCreditCards: true, acceptsNfc: true },
      accessibilityOptions: { wheelchairAccessibleEntrance: true },
      allowsDogs: true,
      outdoorSeating: false,
    });
    // reservable, servesLunch, allowsDogs(=3) + 駐車1 + 決済2 + バリアフリー1 = 7
    expect(p.attributeCount).toBe(7);
  });
});

describe("findPlace", () => {
  it("Text Searchの先頭placeを返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ places: [{ id: "PID1", displayName: { text: "クレープの森" } }] }),
    });
    const res = await findPlace("クレープの森", "那覇市牧志", "KEY", fetchMock as any);
    expect(res?.id).toBe("PID1");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("該当なしならnull", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const res = await findPlace("無", "無", "KEY", fetchMock as any);
    expect(res).toBeNull();
  });
});
