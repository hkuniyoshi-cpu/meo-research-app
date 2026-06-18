# MEO調査アプリ Phase 1（無料診断MVP）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 事業名＋住所/エリアを入力すると、Cloudflare Worker が Google Places API から店舗データを取得して整備スコア(100点)と検索評価(想定・相対指数)を算出し、淡い青グラデ(B+H)の結果画面に表示する、メール不要の無料診断MVPを作る。

**Architecture:** Cloudflare Workers（Static Assets機能で `public/` の静的フロントと `/api/*` を単一デプロイ）。本体は純粋関数の採点モジュール(`scoring`)＋I/O層(`places`/`cache`/`ratelimit`/`turnstile`)。採点モジュールはTDDで作り、I/O層は fetch/KV をモックして単体テスト、Worker全体と画面は `wrangler dev` で手動結合確認。

**Tech Stack:** TypeScript / Cloudflare Workers (Wrangler) / Workers KV / Vitest / Google Places API (New) / Cloudflare Turnstile / Vanilla JS フロント

参照スペック: `docs/superpowers/specs/2026-06-19-meo-shindan-app-design.md`

---

## File Structure

```
meo-app/
  package.json
  tsconfig.json
  vitest.config.ts
  wrangler.toml
  .gitignore
  src/
    index.ts              # Worker entry: ルーティング(/api/diagnose)
    handlers/diagnose.ts  # 診断ハンドラ(検証→レート→キャッシュ→Places→採点→マスク)
    lib/
      types.ts            # 共有型(PlaceData, ProfileScore, ...)
      weights.ts          # 業種別配点重み
      scoring.ts          # 純粋関数: scoreProfile / prominenceLight / rankAmong
      places.ts           # Places API クライアント＋正規化
      turnstile.ts        # Turnstileトークン検証
      ratelimit.ts        # KVベースのIP/日次レート制限
      cache.ts            # KVキャッシュ get/put
  public/
    index.html            # 入力＋結果コンテナ
    styles.css            # B+H 淡い青グラデ
    app.js                # 入力→ローディング演出→結果描画
  tests/
    weights.test.ts
    scoring.test.ts
    places.test.ts
    ratelimit.test.ts
```

各ファイルは単一責務。`scoring.ts` は外部I/Oを持たない純粋関数のみ（モックなしで単体テスト可能）。

---

## Task 1: プロジェクト雛形

**Files:**
- Create: `meo-app/package.json`
- Create: `meo-app/tsconfig.json`
- Create: `meo-app/vitest.config.ts`
- Create: `meo-app/wrangler.toml`
- Create: `meo-app/.gitignore`

- [ ] **Step 1: package.json を作成**

`meo-app/package.json`:
```json
{
  "name": "meo-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240620.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "wrangler": "^3.60.0"
  }
}
```

- [ ] **Step 2: tsconfig.json を作成**

`meo-app/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: vitest.config.ts を作成**

`meo-app/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
```

- [ ] **Step 4: wrangler.toml を作成**

`meo-app/wrangler.toml`:
```toml
name = "meo-app"
main = "src/index.ts"
compatibility_date = "2026-01-01"

assets = { directory = "./public", binding = "ASSETS" }

kv_namespaces = [
  { binding = "CACHE", id = "REPLACE_WITH_CACHE_KV_ID" },
  { binding = "RATELIMIT", id = "REPLACE_WITH_RATELIMIT_KV_ID" }
]

# secrets (本番は `wrangler secret put` で投入):
#   GOOGLE_PLACES_API_KEY
#   TURNSTILE_SECRET
[vars]
TURNSTILE_SITEKEY = "REPLACE_WITH_TURNSTILE_SITEKEY"
```

- [ ] **Step 5: .gitignore を作成**

`meo-app/.gitignore`:
```
node_modules/
.wrangler/
.dev.vars
```

- [ ] **Step 6: 依存をインストールしてビルド健全性を確認**

Run: `cd meo-app && npm install && npx tsc --noEmit`
Expected: インストール成功、型エラー0（まだソースが無いので `tsc` は何も出力せず成功）

- [ ] **Step 7: Commit**

```bash
cd meo-app && git add -A && git commit -m "chore: scaffold meo-app worker project"
```

---

## Task 2: 共有型と業種別重み

**Files:**
- Create: `meo-app/src/lib/types.ts`
- Create: `meo-app/src/lib/weights.ts`
- Test: `meo-app/tests/weights.test.ts`

- [ ] **Step 1: 型定義を作成**

`meo-app/src/lib/types.ts`:
```ts
export interface ReviewData {
  rating: number;        // 0-5
  publishTime: string;   // ISO8601
}

export interface PlaceData {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  businessStatus?: string;     // "OPERATIONAL" 等
  primaryType?: string;
  types: string[];
  rating?: number;             // 0-5
  userRatingCount: number;
  reviews: ReviewData[];
  photoCount: number;
  hasVideo: boolean;
  hasRegularHours: boolean;
  hasSpecialHours: boolean;
  editorialSummary?: string;
  priceLevel?: string;
  attributeCount: number;
  hasReservationLink: boolean;
  hasMenuLink: boolean;
}

export interface CategoryScore {
  key: string;
  label: string;
  score: number;   // 実点
  max: number;     // 満点(=重み)
}

export interface ProfileScore {
  total: number;             // 0-100
  categories: CategoryScore[];
}

export interface RankResult {
  index: number;             // 対象店の知名度指数(0-100)
  rank: number;              // 1始まり
  total: number;             // 比較母数(対象含む)
  competitors: { name: string; rating?: number; reviews: number; index: number }[];
}
```

- [ ] **Step 2: 業種別重みのテストを書く（失敗するはず）**

`meo-app/tests/weights.test.ts`:
```ts
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
```

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `cd meo-app && npx vitest run tests/weights.test.ts`
Expected: FAIL（`../src/lib/weights` が存在しない）

- [ ] **Step 4: weights.ts を実装**

`meo-app/src/lib/weights.ts`:
```ts
export interface IndustryWeights {
  nap: number; category: number; reviews: number;
  photos: number; hours: number; extras: number;
}

export const DEFAULT_WEIGHTS: IndustryWeights = {
  nap: 20, category: 15, reviews: 25, photos: 15, hours: 10, extras: 15,
};

// 主要業種のみ初期搭載。primaryType(Places)文字列にマッチ。合計は必ず100。
const TABLE: Record<string, IndustryWeights> = {
  restaurant: { nap: 18, category: 12, reviews: 25, photos: 22, hours: 10, extras: 13 },
  cafe:       { nap: 18, category: 12, reviews: 25, photos: 22, hours: 10, extras: 13 },
  bar:        { nap: 18, category: 12, reviews: 25, photos: 22, hours: 10, extras: 13 },
  beauty_salon:{ nap: 20, category: 13, reviews: 27, photos: 18, hours: 8,  extras: 14 },
  lawyer:     { nap: 24, category: 16, reviews: 24, photos: 8,  hours: 8,  extras: 20 },
};

export function weightsFor(primaryType?: string): IndustryWeights {
  if (primaryType && TABLE[primaryType]) return TABLE[primaryType];
  return DEFAULT_WEIGHTS;
}
```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `cd meo-app && npx vitest run tests/weights.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 6: Commit**

```bash
cd meo-app && git add -A && git commit -m "feat: add shared types and industry weight table"
```

---

## Task 3: 整備スコア採点（scoreProfile）TDD

**Files:**
- Create: `meo-app/src/lib/scoring.ts`
- Test: `meo-app/tests/scoring.test.ts`

- [ ] **Step 1: テスト用ファクトリと最初のテストを書く**

`meo-app/tests/scoring.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { scoreProfile } from "../src/lib/scoring";
import { DEFAULT_WEIGHTS } from "../src/lib/weights";
import type { PlaceData } from "../src/lib/types";

const NOW = new Date("2026-06-19T00:00:00Z");

function place(overrides: Partial<PlaceData> = {}): PlaceData {
  return {
    placeId: "x", displayName: "店", formattedAddress: "那覇市",
    types: [], userRatingCount: 0, reviews: [], photoCount: 0,
    hasVideo: false, hasRegularHours: false, hasSpecialHours: false,
    attributeCount: 0, hasReservationLink: false, hasMenuLink: false,
    ...overrides,
  };
}

describe("scoreProfile", () => {
  it("空に近いプロフィールは低スコア", () => {
    const r = scoreProfile(place(), DEFAULT_WEIGHTS, NOW);
    expect(r.total).toBeLessThan(20);
  });

  it("満点級プロフィールは90以上", () => {
    const reviews = Array.from({ length: 120 }, () => ({
      rating: 5, publishTime: "2026-06-01T00:00:00Z",
    }));
    const r = scoreProfile(place({
      nationalPhoneNumber: "098", websiteUri: "https://x", businessStatus: "OPERATIONAL",
      primaryType: "restaurant", types: ["restaurant", "cafe"],
      rating: 4.8, userRatingCount: 120, reviews,
      photoCount: 10, hasVideo: true, hasRegularHours: true, hasSpecialHours: true,
      editorialSummary: "美味しい", priceLevel: "PRICE_LEVEL_MODERATE",
      attributeCount: 5, hasReservationLink: true, hasMenuLink: true,
    }), DEFAULT_WEIGHTS, NOW);
    expect(r.total).toBeGreaterThanOrEqual(90);
  });

  it("カテゴリ別の点は満点(=重み)を超えない、合計はtotalと一致", () => {
    const r = scoreProfile(place({ userRatingCount: 5, rating: 3 }), DEFAULT_WEIGHTS, NOW);
    const sum = r.categories.reduce((a, c) => a + c.score, 0);
    expect(Math.round(sum)).toBe(r.total);
    for (const c of r.categories) expect(c.score).toBeLessThanOrEqual(c.max);
  });

  it("古い口コミだけだと新着性が効いて口コミ点が下がる", () => {
    const old = Array.from({ length: 50 }, () => ({ rating: 5, publishTime: "2024-01-01T00:00:00Z" }));
    const fresh = Array.from({ length: 50 }, () => ({ rating: 5, publishTime: "2026-06-01T00:00:00Z" }));
    const base = { rating: 5, userRatingCount: 50 };
    const a = scoreProfile(place({ ...base, reviews: old }), DEFAULT_WEIGHTS, NOW);
    const b = scoreProfile(place({ ...base, reviews: fresh }), DEFAULT_WEIGHTS, NOW);
    const ca = a.categories.find(c => c.key === "reviews")!.score;
    const cb = b.categories.find(c => c.key === "reviews")!.score;
    expect(cb).toBeGreaterThan(ca);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd meo-app && npx vitest run tests/scoring.test.ts`
Expected: FAIL（`scoreProfile` 未定義）

- [ ] **Step 3: scoring.ts に scoreProfile と補助関数を実装**

`meo-app/src/lib/scoring.ts`:
```ts
import type { PlaceData, ProfileScore, CategoryScore, ReviewData } from "./types";
import type { IndustryWeights } from "./weights";

const DAY = 86400000;

/** 直近days日に投稿された口コミ比率(0-1)。reviewsが空なら0。 */
export function recentReviewRatio(reviews: ReviewData[], now: Date, days = 90): number {
  if (reviews.length === 0) return 0;
  const cutoff = now.getTime() - days * DAY;
  const recent = reviews.filter(r => Date.parse(r.publishTime) >= cutoff).length;
  return recent / reviews.length;
}

/** 口コミ数を対数で0-1正規化(約1000件で1.0)。 */
function normLogCount(count: number): number {
  return Math.min(1, Math.log10(count + 1) / Math.log10(1001));
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

export function scoreProfile(p: PlaceData, w: IndustryWeights, now: Date): ProfileScore {
  // 各カテゴリ完成度(0-1)
  const napItems = [
    !!p.displayName, !!p.formattedAddress, !!p.nationalPhoneNumber,
    !!p.websiteUri, p.businessStatus === "OPERATIONAL",
  ];
  const nap = napItems.filter(Boolean).length / napItems.length;

  const category = (p.primaryType ? 0.6 : 0) + (p.types.filter(t => t !== p.primaryType).length > 0 ? 0.4 : 0);

  const countComp = normLogCount(p.userRatingCount);
  const ratingComp = (p.rating ?? 0) / 5;
  const recencyComp = recentReviewRatio(p.reviews, now);
  const reviews = clamp01(0.4 * countComp + 0.3 * ratingComp + 0.3 * recencyComp);

  const photos = clamp01(0.8 * Math.min(p.photoCount, 10) / 10 + (p.hasVideo ? 0.2 : 0));

  const hours = (p.hasRegularHours ? 0.7 : 0) + (p.hasSpecialHours ? 0.3 : 0);

  const extraItems = [
    !!p.editorialSummary, !!p.priceLevel, p.attributeCount >= 3,
    p.hasReservationLink, p.hasMenuLink,
  ];
  const extras = extraItems.filter(Boolean).length / extraItems.length;

  const categories: CategoryScore[] = [
    { key: "nap",      label: "基本情報(NAP)",     score: nap * w.nap,           max: w.nap },
    { key: "category", label: "カテゴリ設定",       score: category * w.category, max: w.category },
    { key: "reviews",  label: "口コミ",            score: reviews * w.reviews,    max: w.reviews },
    { key: "photos",   label: "写真・動画",         score: photos * w.photos,      max: w.photos },
    { key: "hours",    label: "営業時間・最新性",    score: hours * w.hours,        max: w.hours },
    { key: "extras",   label: "付加情報",           score: extras * w.extras,      max: w.extras },
  ];
  const total = Math.round(categories.reduce((a, c) => a + c.score, 0));
  return { total, categories };
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd meo-app && npx vitest run tests/scoring.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
cd meo-app && git add -A && git commit -m "feat: add profile scoring (scoreProfile)"
```

---

## Task 4: 検索評価(想定)— 知名度指数とランキング TDD

**Files:**
- Modify: `meo-app/src/lib/scoring.ts`（関数追記）
- Modify: `meo-app/tests/scoring.test.ts`（テスト追記）

- [ ] **Step 1: テストを追記**

`meo-app/tests/scoring.test.ts` の末尾に追記:
```ts
import { prominenceLight, rankAmong } from "../src/lib/scoring";

describe("prominenceLight", () => {
  it("口コミ多く高評価ほど指数が高い", () => {
    const strong = prominenceLight({ rating: 4.8, userRatingCount: 300, photoCount: 10 });
    const weak = prominenceLight({ rating: 3.2, userRatingCount: 5, photoCount: 1 });
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeLessThanOrEqual(100);
    expect(weak).toBeGreaterThanOrEqual(0);
  });
});

describe("rankAmong", () => {
  it("対象店の順位と母数を返す", () => {
    const target = place({ rating: 4.6, userRatingCount: 95, photoCount: 8 });
    const comps = [
      place({ displayName: "A店", rating: 4.7, userRatingCount: 210, photoCount: 10 }),
      place({ displayName: "B店", rating: 4.5, userRatingCount: 180, photoCount: 9 }),
      place({ displayName: "C店", rating: 3.9, userRatingCount: 20, photoCount: 2 }),
    ];
    const r = rankAmong(target, comps);
    expect(r.total).toBe(4);
    expect(r.rank).toBe(3); // A,B が上、C が下
    expect(r.competitors).toHaveLength(3);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd meo-app && npx vitest run tests/scoring.test.ts`
Expected: FAIL（`prominenceLight` / `rankAmong` 未定義）

- [ ] **Step 3: scoring.ts に追記**

`meo-app/src/lib/scoring.ts` の末尾に追記:
```ts
import type { RankResult } from "./types";

/** 軽量フィールドのみで算出する知名度指数(0-100)。競合は詳細未取得なので口コミ数/評価/写真数で比較。 */
export function prominenceLight(p: { rating?: number; userRatingCount: number; photoCount: number }): number {
  const countComp = normLogCount(p.userRatingCount);
  const ratingComp = (p.rating ?? 0) / 5;
  const photoComp = Math.min(p.photoCount, 10) / 10;
  return Math.round(100 * (0.45 * countComp + 0.40 * ratingComp + 0.15 * photoComp));
}

/** 対象店を競合群に混ぜて知名度指数で順位付けする。 */
export function rankAmong(target: PlaceData, competitors: PlaceData[]): RankResult {
  const targetIndex = prominenceLight(target);
  const comps = competitors.map(c => ({
    name: c.displayName, rating: c.rating, reviews: c.userRatingCount, index: prominenceLight(c),
  }));
  const all = [targetIndex, ...comps.map(c => c.index)].sort((a, b) => b - a);
  const rank = all.indexOf(targetIndex) + 1;
  comps.sort((a, b) => b.index - a.index);
  return { index: targetIndex, rank, total: all.length, competitors: comps };
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd meo-app && npx vitest run tests/scoring.test.ts`
Expected: PASS（全6 tests）

- [ ] **Step 5: Commit**

```bash
cd meo-app && git add -A && git commit -m "feat: add prominence index and competitor ranking"
```

---

## Task 5: Places API クライアント（fetchモックで単体テスト）

**Files:**
- Create: `meo-app/src/lib/places.ts`
- Test: `meo-app/tests/places.test.ts`

- [ ] **Step 1: 正規化テストを書く**

`meo-app/tests/places.test.ts`:
```ts
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd meo-app && npx vitest run tests/places.test.ts`
Expected: FAIL（`../src/lib/places` 未作成）

- [ ] **Step 3: places.ts を実装**

`meo-app/src/lib/places.ts`:
```ts
import type { PlaceData } from "./types";

type FetchFn = typeof fetch;

const DETAILS_MASK = [
  "id", "displayName", "formattedAddress", "nationalPhoneNumber", "websiteUri",
  "businessStatus", "primaryType", "types", "rating", "userRatingCount",
  "reviews", "photos", "regularOpeningHours", "specialDays",
  "editorialSummary", "priceLevel", "reservable", "servesLunch", "servesDinner",
].join(",");

const SEARCH_MASK = [
  "places.id", "places.displayName", "places.rating",
  "places.userRatingCount", "places.photos",
].join(",");

/** 事業名＋住所/エリアで Text Search し先頭候補を返す。 */
export async function findPlace(
  name: string, area: string, apiKey: string, fetchFn: FetchFn = fetch
): Promise<{ id: string } | null> {
  const resp = await fetchFn("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": SEARCH_MASK,
    },
    body: JSON.stringify({ textQuery: `${name} ${area}`, languageCode: "ja", maxResultCount: 1 }),
  });
  if (!resp.ok) throw new Error(`searchText failed: ${resp.status}`);
  const data: any = await resp.json();
  const first = data.places?.[0];
  return first ? { id: first.id } : null;
}

/** place_id の詳細を取得。 */
export async function getDetails(placeId: string, apiKey: string, fetchFn: FetchFn = fetch): Promise<any> {
  const resp = await fetchFn(`https://places.googleapis.com/v1/places/${placeId}?languageCode=ja`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": DETAILS_MASK },
  });
  if (!resp.ok) throw new Error(`getDetails failed: ${resp.status}`);
  return resp.json();
}

/** 同カテゴリ近隣の競合を Text Search で取得（軽量フィールドのみ）。 */
export async function findCompetitors(
  primaryType: string | undefined, area: string, apiKey: string, fetchFn: FetchFn = fetch
): Promise<any[]> {
  const q = `${primaryType ?? "店舗"} ${area}`;
  const resp = await fetchFn("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": SEARCH_MASK,
    },
    body: JSON.stringify({ textQuery: q, languageCode: "ja", maxResultCount: 12 }),
  });
  if (!resp.ok) throw new Error(`competitors search failed: ${resp.status}`);
  const data: any = await resp.json();
  return data.places ?? [];
}

/** Places詳細応答 → PlaceData。 */
export function normalizeDetails(d: any): PlaceData {
  return {
    placeId: d.id,
    displayName: d.displayName?.text ?? "",
    formattedAddress: d.formattedAddress ?? "",
    nationalPhoneNumber: d.nationalPhoneNumber,
    websiteUri: d.websiteUri,
    businessStatus: d.businessStatus,
    primaryType: d.primaryType,
    types: d.types ?? [],
    rating: d.rating,
    userRatingCount: d.userRatingCount ?? 0,
    reviews: (d.reviews ?? []).map((r: any) => ({ rating: r.rating ?? 0, publishTime: r.publishTime ?? "" })),
    photoCount: (d.photos ?? []).length,
    hasVideo: false, // Places APIは動画を返さないため常にfalse（将来別ソース）
    hasRegularHours: !!d.regularOpeningHours,
    hasSpecialHours: (d.specialDays ?? d.regularOpeningHours?.specialDays ?? []).length > 0,
    editorialSummary: d.editorialSummary?.text,
    priceLevel: d.priceLevel,
    attributeCount: countAttributes(d),
    hasReservationLink: !!d.reservable,
    hasMenuLink: !!d.servesLunch || !!d.servesDinner,
  };
}

/** boolean属性(serves*, reservable等)で trueの数を数える簡易指標。 */
function countAttributes(d: any): number {
  const keys = ["reservable", "servesLunch", "servesDinner", "servesBreakfast", "takeout", "delivery", "dineIn"];
  return keys.filter(k => d[k] === true).length;
}

/** 軽量検索応答 → PlaceData(部分)。競合ランキング用。 */
export function normalizeLight(d: any): PlaceData {
  return {
    placeId: d.id, displayName: d.displayName?.text ?? "",
    formattedAddress: "", types: [], rating: d.rating,
    userRatingCount: d.userRatingCount ?? 0, reviews: [],
    photoCount: (d.photos ?? []).length, hasVideo: false,
    hasRegularHours: false, hasSpecialHours: false, attributeCount: 0,
    hasReservationLink: false, hasMenuLink: false,
  };
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd meo-app && npx vitest run tests/places.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
cd meo-app && git add -A && git commit -m "feat: add Places API client and normalizers"
```

---

## Task 6: レート制限・キャッシュ・Turnstile

**Files:**
- Create: `meo-app/src/lib/ratelimit.ts`
- Create: `meo-app/src/lib/cache.ts`
- Create: `meo-app/src/lib/turnstile.ts`
- Test: `meo-app/tests/ratelimit.test.ts`

- [ ] **Step 1: レート制限テストを書く（モックKV）**

`meo-app/tests/ratelimit.test.ts`:
```ts
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd meo-app && npx vitest run tests/ratelimit.test.ts`
Expected: FAIL（`../src/lib/ratelimit` 未作成）

- [ ] **Step 3: ratelimit.ts を実装**

`meo-app/src/lib/ratelimit.ts`:
```ts
export interface RateResult { allowed: boolean; count: number; }

/** IP×日付で診断回数を制限。KVキーは `rl:<date>:<ip>`、TTL 2日。 */
export async function checkRateLimit(
  kv: KVNamespace, ip: string, date: string, limit: number
): Promise<RateResult> {
  const key = `rl:${date}:${ip}`;
  const current = parseInt((await kv.get(key)) ?? "0", 10);
  const count = current + 1;
  await kv.put(key, String(count), { expirationTtl: 2 * 86400 });
  return { allowed: count <= limit, count };
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd meo-app && npx vitest run tests/ratelimit.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 5: cache.ts を実装**

`meo-app/src/lib/cache.ts`:
```ts
/** 診断結果JSONをplace_id+競合フラグでキャッシュ。 */
export async function getCached<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const v = await kv.get(key);
  return v ? (JSON.parse(v) as T) : null;
}

export async function setCached(kv: KVNamespace, key: string, value: unknown, ttlSeconds = 14 * 86400): Promise<void> {
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}
```

- [ ] **Step 6: turnstile.ts を実装**

`meo-app/src/lib/turnstile.ts`:
```ts
/** Cloudflare Turnstile トークンを検証。 */
export async function verifyTurnstile(token: string, secret: string, ip?: string, fetchFn = fetch): Promise<boolean> {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  const resp = await fetchFn("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  if (!resp.ok) return false;
  const data: any = await resp.json();
  return data.success === true;
}
```

- [ ] **Step 7: 型チェックとCommit**

Run: `cd meo-app && npx tsc --noEmit`
Expected: 型エラー0
```bash
cd meo-app && git add -A && git commit -m "feat: add rate limit, cache, and turnstile verification"
```

---

## Task 7: 診断ハンドラと Worker エントリ（結合）

**Files:**
- Create: `meo-app/src/handlers/diagnose.ts`
- Create: `meo-app/src/index.ts`

- [ ] **Step 1: 診断ハンドラを実装**

`meo-app/src/handlers/diagnose.ts`:
```ts
import { verifyTurnstile } from "../lib/turnstile";
import { checkRateLimit } from "../lib/ratelimit";
import { getCached, setCached } from "../lib/cache";
import { findPlace, getDetails, findCompetitors, normalizeDetails, normalizeLight } from "../lib/places";
import { scoreProfile, rankAmong, prominenceLight } from "../lib/scoring";
import { weightsFor } from "../lib/weights";

export interface Env {
  CACHE: KVNamespace;
  RATELIMIT: KVNamespace;
  GOOGLE_PLACES_API_KEY: string;
  TURNSTILE_SECRET: string;
}

const RATE_LIMIT_PER_DAY = 20;
const VISIBLE_TIPS = 3; // 無料版で見せる改善ポイント数（もったいぶり）

interface Body { name: string; area: string; compare: boolean; turnstileToken: string; }

export async function handleDiagnose(req: Request, env: Env): Promise<Response> {
  const ip = req.headers.get("CF-Connecting-IP") ?? "0.0.0.0";
  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  if (!body.name || !body.area) return json({ error: "missing_fields" }, 400);

  if (!(await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET, ip)))
    return json({ error: "bot_check_failed" }, 403);

  const date = new Date().toISOString().slice(0, 10);
  const rate = await checkRateLimit(env.RATELIMIT, ip, date, RATE_LIMIT_PER_DAY);
  if (!rate.allowed) return json({ error: "rate_limited" }, 429);

  const cacheKey = `diag:${body.name}|${body.area}|${body.compare ? 1 : 0}`;
  const cached = await getCached(env.CACHE, cacheKey);
  if (cached) return json(cached);

  const found = await findPlace(body.name, body.area, env.GOOGLE_PLACES_API_KEY);
  if (!found) return json({ error: "not_found" }, 404);

  const details = normalizeDetails(await getDetails(found.id, env.GOOGLE_PLACES_API_KEY));
  const weights = weightsFor(details.primaryType);
  const profile = scoreProfile(details, weights, new Date());

  const tips = buildTips(details, profile);

  let ranking = null;
  if (body.compare) {
    const raw = await findCompetitors(details.primaryType, body.area, env.GOOGLE_PLACES_API_KEY);
    const comps = raw.filter((c: any) => c.id !== details.placeId).map(normalizeLight);
    ranking = rankAmong(details, comps);
  }

  const result = {
    name: details.displayName,
    area: body.area,
    profile,
    prominence: prominenceLight(details),
    ranking,
    tipsVisible: tips.slice(0, VISIBLE_TIPS),
    tipsLockedCount: Math.max(0, tips.length - VISIBLE_TIPS),
  };
  await setCached(env.CACHE, cacheKey, result);
  return json(result);
}

/** 整備スコアの弱点カテゴリから改善ポイント文を生成。 */
function buildTips(p: ReturnType<typeof normalizeDetails>, profile: ReturnType<typeof scoreProfile>): string[] {
  const tips: string[] = [];
  const ratio = (key: string) => {
    const c = profile.categories.find(x => x.key === key)!;
    return c.score / c.max;
  };
  if (ratio("reviews") < 0.7) tips.push("口コミの新着・返信を増やす（最近の口コミが不足しています）");
  if (ratio("extras") < 0.7) tips.push("サービス・メニュー・属性の詳細登録が未設定");
  if (!p.hasVideo) tips.push("短尺動画を1本追加する");
  if (ratio("photos") < 0.8) tips.push("写真を10枚以上に増やす");
  if (ratio("hours") < 0.8) tips.push("特別営業時間（祝日等）を設定する");
  if (ratio("category") < 1) tips.push("副カテゴリを追加して関連性を高める");
  if (ratio("nap") < 1) tips.push("基本情報（電話・サイト等）の未入力を埋める");
  tips.push("週次で最新情報を投稿し鮮度を保つ");
  return tips;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
```

- [ ] **Step 2: Worker エントリを実装**

`meo-app/src/index.ts`:
```ts
import { handleDiagnose, type Env } from "./handlers/diagnose";

export default {
  async fetch(req: Request, env: Env & { ASSETS: Fetcher }): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/diagnose" && req.method === "POST") {
      return handleDiagnose(req, env);
    }
    // それ以外は静的アセット(public/)
    return env.ASSETS.fetch(req);
  },
};
```

- [ ] **Step 3: 型チェック**

Run: `cd meo-app && npx tsc --noEmit`
Expected: 型エラー0

- [ ] **Step 4: ローカル起動して 404(not_found) 経路を確認**

`meo-app/.dev.vars` を作成（ローカル用シークレット。実キーを入れる）:
```
GOOGLE_PLACES_API_KEY = "実際のキー"
TURNSTILE_SECRET = "1x0000000000000000000000000000000AA"
```
（`1x...AA` はTurnstileの「常にpass」テストシークレット）

Run: `cd meo-app && npx wrangler dev --port 8787` をバックグラウンド起動し、別シェルで:
```bash
curl -s -X POST http://localhost:8787/api/diagnose \
  -H "Content-Type: application/json" \
  -d '{"name":"存在しない架空店XYZ","area":"那覇市","compare":false,"turnstileToken":"dummy"}'
```
Expected: `{"error":"not_found"}` または実在店なら結果JSON（Turnstileテストシークレットで検証通過）。`bot_check_failed` が出る場合は `.dev.vars` の `TURNSTILE_SECRET` がテスト値か確認。

- [ ] **Step 5: 実在店で結果JSONを確認**

```bash
curl -s -X POST http://localhost:8787/api/diagnose \
  -H "Content-Type: application/json" \
  -d '{"name":"スターバックス","area":"那覇 国際通り","compare":true,"turnstileToken":"dummy"}' | head -c 600
```
Expected: `profile.total`(数値)、`prominence`、`ranking.rank`/`ranking.competitors`、`tipsVisible`(3件)、`tipsLockedCount` を含むJSON

- [ ] **Step 6: Commit**

```bash
cd meo-app && git add -A && git commit -m "feat: wire diagnose handler and worker entry"
```

---

## Task 8: フロントエンド（B+H 淡い青グラデ・入力→演出→結果）

**Files:**
- Create: `meo-app/public/index.html`
- Create: `meo-app/public/styles.css`
- Create: `meo-app/public/app.js`

- [ ] **Step 1: index.html を作成**

`meo-app/public/index.html`:
```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MEO無料診断 | SearchMania</title>
  <link rel="stylesheet" href="/styles.css" />
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head>
<body>
  <main class="wrap">
    <section id="input-view" class="card">
      <div class="label">SearchMania MEO診断</div>
      <h1>事業名＋住所で<br>Googleマップ整備度を無料診断</h1>
      <input id="f-name" class="field" placeholder="事業名（例：クレープの森）" />
      <input id="f-area" class="field" placeholder="住所 / エリア（例：那覇市牧志）" />
      <label class="toggle"><input id="f-compare" type="checkbox" checked /> 競合比較もする（任意）</label>
      <div class="cf-turnstile" data-sitekey="REPLACE_WITH_TURNSTILE_SITEKEY" data-callback="onTurnstile"></div>
      <button id="go" class="btn">無料でMEO診断する</button>
      <p id="err" class="err" hidden></p>
    </section>

    <section id="loading-view" hidden>
      <div class="loader-card">
        <div class="spinner"></div>
        <p id="loading-text" class="loading-text">店舗を特定中…</p>
      </div>
    </section>

    <section id="result-view" hidden></section>
  </main>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: styles.css を作成（B+H 淡い青グラデ）**

`meo-app/public/styles.css`:
```css
:root { --ink:#1c3a63; --ink2:#3a5a85; --blue:#4f93f0; --blue2:#7db8ff; }
* { box-sizing:border-box; }
body {
  margin:0; font-family:system-ui,-apple-system,"Hiragino Kaku Gothic ProN",sans-serif; color:var(--ink);
  min-height:100vh; display:flex; align-items:flex-start; justify-content:center; padding:28px 14px;
  background:linear-gradient(125deg,#e6f2ff,#cfe6ff,#bcd9ff,#d6ecff,#c2e8ff);
  background-size:300% 300%; animation:mesh 12s ease infinite;
}
@keyframes mesh { 0%{background-position:0 50%} 50%{background-position:100% 50%} 100%{background-position:0 50%} }
.wrap { width:100%; max-width:780px; }
.card, .glass {
  background:rgba(255,255,255,.45); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,.7);
  border-radius:20px; box-shadow:0 12px 40px rgba(70,110,180,.18); padding:24px; margin-bottom:14px;
}
.label { font-size:12px; letter-spacing:1px; text-transform:uppercase; color:#2a5085; }
h1 { font-size:24px; margin:8px 0 18px; line-height:1.4; }
.field {
  width:100%; padding:13px 16px; margin-bottom:10px; border-radius:14px; font-size:15px;
  border:1px solid rgba(120,160,210,.5); background:rgba(255,255,255,.7); color:var(--ink);
}
.toggle { display:flex; align-items:center; gap:8px; font-size:14px; margin:6px 0 14px; }
.btn {
  width:100%; border:0; cursor:pointer; font-weight:800; font-size:16px; color:#fff; padding:14px; border-radius:18px;
  background:linear-gradient(135deg,#7db8ff,#4f93f0);
  box-shadow:5px 5px 14px rgba(80,130,200,.4),-4px -4px 10px rgba(255,255,255,.7);
  transition:transform .15s; animation:bob 3s ease-in-out infinite;
}
.btn:active { transform:scale(.97); }
@keyframes bob { 0%,100%{transform:translateY(-3px)} 50%{transform:translateY(3px)} }
.err { color:#c0392b; font-size:14px; margin-top:10px; }
/* loading */
.loader-card { text-align:center; padding:48px 24px; }
.spinner {
  width:64px; height:64px; margin:0 auto 18px; border-radius:50%;
  border:6px solid rgba(120,160,210,.25); border-top-color:var(--blue); animation:spin 1s linear infinite;
}
@keyframes spin { to { transform:rotate(360deg); } }
.loading-text { font-weight:700; color:var(--ink2); }
/* result */
.hero { display:flex; align-items:center; gap:22px; }
.clay {
  min-width:130px; height:130px; border-radius:36px; color:#fff; display:flex; flex-direction:column;
  align-items:center; justify-content:center; background:linear-gradient(135deg,#7db8ff,#4f93f0);
  box-shadow:9px 9px 20px rgba(80,130,200,.4),-9px -9px 20px rgba(255,255,255,.9),inset 3px 3px 9px rgba(255,255,255,.5);
  animation:bob 3s ease-in-out infinite;
}
.clay b { font-size:46px; line-height:1; } .clay span { font-size:12px; margin-top:3px; }
.bar { height:11px; border-radius:7px; background:rgba(120,160,210,.22); overflow:hidden; margin:4px 0 10px; }
.bar i { display:block; height:100%; border-radius:7px; background:linear-gradient(90deg,#5aa0ff,#7fd0ff); transition:width 1.2s cubic-bezier(.2,1,.3,1); }
.comp { display:flex; justify-content:space-between; padding:9px 12px; border-radius:12px; background:rgba(255,255,255,.55); margin-top:8px; font-size:13px; }
.comp.you { background:linear-gradient(90deg,#bfe0ff,#dcefff); font-weight:800; }
.tips li { margin:6px 0; font-size:14px; list-style:none; padding-left:22px; position:relative; }
.tips li::before { content:"✓"; position:absolute; left:0; color:#3b82f6; font-weight:900; }
.locked { filter:blur(5px); opacity:.55; }
.more-pill { text-align:center; margin-top:8px; font-size:13px; color:#2a5085; }
.subtle-cta { text-align:center; margin-top:8px; }
.subtle-cta a { font-size:12px; color:#5b7aa3; }
.foot { text-align:center; font-size:11px; color:#8aa3c2; margin-top:8px; }
```

- [ ] **Step 3: app.js を作成（演出＋結果描画）**

`meo-app/public/app.js`:
```js
let turnstileToken = "";
window.onTurnstile = (t) => { turnstileToken = t; };

const $ = (id) => document.getElementById(id);
const show = (id) => { $(id).hidden = false; };
const hide = (id) => { $(id).hidden = true; };

const LOADING_STEPS = ["店舗を特定中…", "NAP整合性を照合中…", "口コミ傾向を解析中…", "競合の知名度を取得中…", "スコアを算出中…"];

$("go").addEventListener("click", async () => {
  const name = $("f-name").value.trim();
  const area = $("f-area").value.trim();
  const compare = $("f-compare").checked;
  $("err").hidden = true;
  if (!name || !area) { showErr("事業名と住所/エリアを入力してください"); return; }

  hide("input-view"); show("loading-view");
  const stopAnim = animateLoading();

  try {
    const resp = await fetch("/api/diagnose", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, area, compare, turnstileToken }),
    });
    const data = await resp.json();
    stopAnim();
    if (!resp.ok) { backToInput(errMessage(data.error)); return; }
    renderResult(data);
    hide("loading-view"); show("result-view");
  } catch (e) {
    stopAnim(); backToInput("通信に失敗しました。時間をおいて再度お試しください");
  }
});

function animateLoading() {
  let i = 0;
  $("loading-text").textContent = LOADING_STEPS[0];
  const timer = setInterval(() => { i = (i + 1) % LOADING_STEPS.length; $("loading-text").textContent = LOADING_STEPS[i]; }, 900);
  return () => clearInterval(timer);
}

function backToInput(msg) { hide("loading-view"); show("input-view"); showErr(msg); }
function showErr(msg) { const e = $("err"); e.textContent = msg; e.hidden = false; }
function errMessage(code) {
  return ({
    not_found: "該当する店舗が見つかりませんでした。事業名や住所を見直してください",
    rate_limited: "本日の診断上限に達しました。明日また試せます",
    bot_check_failed: "ボット判定に失敗しました。ページを再読み込みしてください",
    missing_fields: "入力が不足しています",
  })[code] || "診断に失敗しました";
}

function renderResult(d) {
  const cats = d.profile.categories.map(c =>
    `<div class="cat">${c.label}<div class="bar"><i data-w="${Math.round(c.score / c.max * 100)}"></i></div></div>`
  ).join("");

  const ranking = d.ranking ? `
    <div class="glass">
      <div class="label">検索評価（想定）— 近隣${d.ranking.total}件中 ${d.ranking.rank}位相当</div>
      ${d.ranking.competitors.slice(0, 3).map(c =>
        `<div class="comp">${esc(c.name)} ★${c.rating ?? "-"} / 口コミ${c.reviews}<span>指数 ${c.index}</span></div>`).join("")}
      <div class="comp you">あなた<span>指数 ${d.prominence}</span></div>
    </div>` : `
    <div class="glass"><div class="label">検索評価（想定）</div>
      <div class="comp you">あなたの知名度指数<span>${d.prominence}</span></div></div>`;

  const lockedTips = d.tipsLockedCount > 0 ? `
    <ul class="tips locked"><li>さらなる改善ポイント …………</li><li>属性の追加 ………………</li></ul>
    <div class="more-pill">＋ほか${d.tipsLockedCount}件の改善点</div>
    <div class="subtle-cta"><a href="#">整った詳細レポートをメールで受け取る</a></div>` : "";

  $("result-view").innerHTML = `
    <div class="glass hero">
      <div class="clay"><b id="score">0</b><span>整備スコア /100</span></div>
      <div><div class="label">${esc(d.name)} / ${esc(d.area)}</div>
        <p>整備スコアは <b>${d.profile.total}点</b>。下のバーで弱点を確認できます。</p></div>
    </div>
    <div class="glass"><div class="label">カテゴリ別の整備度</div>${cats}</div>
    ${ranking}
    <div class="glass"><div class="label">今すぐやるべき改善ポイント</div>
      <ul class="tips">${d.tipsVisible.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
      ${lockedTips}
    </div>
    <div class="foot">powered by SearchMania ・ もっと詳しく改善したい方はこちら</div>`;

  countUp($("score"), d.profile.total);
  requestAnimationFrame(() => document.querySelectorAll(".bar i").forEach(el => { el.style.width = el.dataset.w + "%"; }));
}

function countUp(el, target) {
  let v = 0; const step = Math.max(1, Math.round(target / 40));
  const t = setInterval(() => { v += step; if (v >= target) { v = target; clearInterval(t); } el.textContent = v; }, 25);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
```

- [ ] **Step 4: ローカルでブラウザ目視確認**

`public/index.html` と `styles.css` 内の `REPLACE_WITH_TURNSTILE_SITEKEY` を、Turnstileの「常にpass」テストサイトキー `1x00000000000000000000AA` に置換。

Run: `cd meo-app && npx wrangler dev --port 8787`（バックグラウンド）
ブラウザで `http://localhost:8787` を開き、実在店（例：事業名「スターバックス」/ エリア「那覇 国際通り」）で診断。
Expected:
- 入力→ローディング演出（テキストが切り替わる）→結果画面に遷移
- 淡い青グラデ背景、クレイのスコアが0からカウントアップ、バーが伸びる
- 競合比較ONで近隣比較リスト表示、改善ポイント3件＋「＋ほかN件」のもったいぶり

- [ ] **Step 5: Commit**

```bash
cd meo-app && git add -A && git commit -m "feat: add B+H pale-blue frontend (input, loading, result)"
```

---

## Task 9: 仕上げ確認とデプロイ手順

**Files:**
- Create: `meo-app/README.md`

- [ ] **Step 1: 全テストとビルド健全性を確認**

Run: `cd meo-app && npx vitest run && npx tsc --noEmit`
Expected: 全テストPASS、型エラー0

- [ ] **Step 2: README にセットアップ/デプロイ手順を記載**

`meo-app/README.md`:
```md
# MEO調査アプリ (Phase 1 MVP)

## セットアップ
1. `npm install`
2. KV作成: `npx wrangler kv namespace create CACHE` と `... create RATELIMIT` → 出力IDを `wrangler.toml` に記入
3. Turnstileサイト作成（Cloudflareダッシュボード）→ sitekey を `public/index.html`・`public/styles.css`(不要)・`wrangler.toml` に、secret を `wrangler secret put TURNSTILE_SECRET` に
4. Places APIキー: `npx wrangler secret put GOOGLE_PLACES_API_KEY`
5. ローカル: `.dev.vars` に両シークレット記入 → `npm run dev`

## デプロイ
`npm run deploy`

## テスト
`npm test`

## 注意
- 検索評価は「想定（相対指数）」。実順位ではない。
- Places APIは動画情報を返さないため hasVideo は常に false（将来別ソース）。
```

- [ ] **Step 3: 本番デプロイ（任意・キー投入後）**

Run: `cd meo-app && npx wrangler deploy`
Expected: `*.workers.dev` URL が払い出され、ブラウザで診断が動作

- [ ] **Step 4: Commit**

```bash
cd meo-app && git add -A && git commit -m "docs: add README with setup and deploy steps"
```

---

## Phase 2（別計画・本MVP完成後）
- メール詳細版: Resend連携・確認コード発行/検証・もったいぶり全開示・整形レポート
- SearchMania誘導リンクの本実装
- 業種別重みテーブルの拡充
- ローディング最小表示時間・キャッシュTTL・レート上限の本番チューニング
```
