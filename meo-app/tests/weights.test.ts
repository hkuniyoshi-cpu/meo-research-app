import { describe, it, expect } from "vitest";
import { weightsFor, DEFAULT_WEIGHTS } from "../src/lib/weights";

describe("weightsFor", () => {
  it("未知の業種は既定重みを返す", () => {
    expect(weightsFor(undefined)).toEqual(DEFAULT_WEIGHTS);
    expect(weightsFor("unknown_type")).toEqual(DEFAULT_WEIGHTS);
  });

  it("飲食系は写真の重みが既定より大きい", () => {
    const w = weightsFor("restaurant");
    expect(w.photos).toBeGreaterThan(DEFAULT_WEIGHTS.photos);
  });

  it("どの重みも合計100になる", () => {
    for (const key of ["restaurant", "cafe", "unknown"]) {
      const w = weightsFor(key);
      const sum = w.nap + w.category + w.reviews + w.photos + w.hours + w.extras;
      expect(sum).toBe(100);
    }
  });
});
