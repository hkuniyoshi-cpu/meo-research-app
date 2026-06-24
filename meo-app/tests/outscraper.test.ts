import { describe, it, expect, vi } from "vitest";
import { fetchEnriched, fetchReplyStats } from "../src/lib/outscraper";

const ok = (j: any) => ({ ok: true, json: async () => j });

describe("fetchEnriched", () => {
  it("search-v3応答を正規化（about属性カウント・posts・photos_count）", async () => {
    const place = {
      name: "店", description: null, photos_count: 2682, verified: true,
      reviews_per_score: { "1": 71, "5": 1761 },
      posts: [{ body: "x", timestamp: 1717545600 }, { body: "y", timestamp: 1717000000 }],
      about: { "サービス": { "ビール": true, "ワイン": true }, "バリアフリー": { "車椅子": false } },
      menu_link: "https://m", reservation_links: ["https://r"],
    };
    const f = vi.fn().mockResolvedValue(ok({ data: [[place]], status: "Success" }));
    const e = await fetchEnriched("店", "那覇", "K", f as any);
    expect(e).not.toBeNull();
    expect(e!.photosCount).toBe(2682);
    expect(e!.verified).toBe(true);
    expect(e!.posts).toHaveLength(2);
    expect(e!.attributeFilled).toBe(2);
    expect(e!.attributeTotal).toBe(3);
    expect(e!.hasMenuLink).toBe(true);
    expect(e!.hasReservation).toBe(true);
  });
  it("該当なしでnull", async () => {
    const f = vi.fn().mockResolvedValue(ok({ data: [], status: "Success" }));
    expect(await fetchEnriched("無", "無", "K", f as any)).toBeNull();
  });
});

describe("fetchReplyStats", () => {
  it("owner_answerの有無で返信件数を数える", async () => {
    const place = { reviews_data: [
      { owner_answer: "ありがとうございます", review_rating: 5 },
      { owner_answer: "", review_rating: 4 },
      { review_rating: 3 },
    ] };
    const f = vi.fn().mockResolvedValue(ok({ data: [place], status: "Success" }));
    const s = await fetchReplyStats("店", "那覇", "K", 10, f as any);
    expect(s.replySampled).toBe(3);
    expect(s.replyReplied).toBe(1);
  });
});
