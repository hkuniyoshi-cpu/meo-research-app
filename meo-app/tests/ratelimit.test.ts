import { describe, it, expect } from "vitest";
import { checkRateLimit } from "../src/lib/ratelimit";

function mockKV() {
  const m = new Map<string, string>();
  return {
    store: m,
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string, _o?: any) => { m.set(k, v); },
  } as any;
}

describe("checkRateLimit", () => {
  it("上限内はallowed=true、超過でfalse", async () => {
    const kv = mockKV();
    const ip = "1.2.3.4";
    let last = true;
    for (let i = 0; i < 21; i++) last = (await checkRateLimit(kv, ip, "2026-06-19", 20)).allowed;
    expect(last).toBe(false);
  });

  it("別IPは独立してカウント", async () => {
    const kv = mockKV();
    await checkRateLimit(kv, "a", "2026-06-19", 20);
    const r = await checkRateLimit(kv, "b", "2026-06-19", 20);
    expect(r.allowed).toBe(true);
    expect(r.count).toBe(1);
  });
});
