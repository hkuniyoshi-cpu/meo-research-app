# MEO調査アプリ (Phase 1 MVP)

事業名＋住所/エリアを入力すると、Google Places API から店舗データを取得し、Googleマップの整備スコア(100点)と検索評価(想定・相対指数)を診断する Cloudflare Workers アプリ。

## セットアップ
1. `npm install`
2. KV作成:
   - `npx wrangler kv namespace create CACHE`
   - `npx wrangler kv namespace create RATELIMIT`
   出力された id を `wrangler.toml` の該当 `REPLACE_WITH_*_KV_ID` に記入。
3. Turnstile（Cloudflareダッシュボードでサイト作成）:
   - sitekey を `public/index.html` の `data-sitekey` に記入
   - secret を `npx wrangler secret put TURNSTILE_SECRET` で投入
   - ローカルでは「常にpass」テスト値（sitekey `1x00000000000000000000AA` / secret `1x0000000000000000000000000000000AA`）が使える
4. Places APIキー: `npx wrangler secret put GOOGLE_PLACES_API_KEY`
   - Google Cloud で "Places API (New)" を有効化したキー
5. ローカル実行: `meo-app/.dev.vars` に以下を記入して `npm run dev`
   ```
   GOOGLE_PLACES_API_KEY = "実キー"
   TURNSTILE_SECRET = "1x0000000000000000000000000000000AA"
   ```

## デプロイ
`npm run deploy`

## テスト
`npm test`（Vitest）

## アーキテクチャ
- `src/index.ts` — Worker エントリ（`POST /api/diagnose` 以外は静的アセット `public/`）
- `src/handlers/diagnose.ts` — 診断オーケストレーション（Turnstile→レート制限→キャッシュ→Places→採点→もったいぶり）
- `src/lib/scoring.ts` — 整備スコア / 知名度指数（純粋関数）
- `src/lib/places.ts` — Places API クライアント＋正規化
- `src/lib/types.ts` — 共通型定義
- `src/lib/{turnstile,ratelimit,cache,weights}.ts` — 補助
- `public/index.html` — フロント（B+H 淡い青グラデ UI）
- `public/app.js` — フロント JS（診断リクエスト・結果表示）
- `public/styles.css` — フロント スタイル

## 注意
- 検索評価は「想定（相対指数）」であり実順位ではない。
- Places API は動画情報を返さないため `hasVideo` は常に false（将来別ソース）。
- Phase 2（別途）: メール詳細版（Resend・確認コード）、SearchMania 誘導の本実装、業種別重み拡充、レート/キャッシュ/演出の本番チューニング。
