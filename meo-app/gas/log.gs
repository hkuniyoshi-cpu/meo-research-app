/**
 * MEO診断アプリ 入力ログ受信用GAS
 *
 * 【デプロイ手順】
 * 1. https://script.google.com で新規プロジェクト作成
 * 2. このコードを貼り付け
 * 3. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」
 *    - 次のユーザーとして実行: 自分
 *    - アクセスできるユーザー: 全員
 * 4. 発行された Web App URL を Cloudflare Worker の環境変数 LOG_URL に設定:
 *      wrangler secret put LOG_URL
 *
 * 【シート】
 * SHEET_ID のシートに「Logs」というシートを作成しておく（無ければ自動生成）
 */

const SHEET_ID = "1GJPKXJtH3wKXaPbWAUJtjm4Q2U_eD3rem4ykKXyyWjA";
const SHEET_NAME = "Logs";

const HEADERS = [
  "timestamp",       // ISO文字列（Worker側で付与）
  "receivedAt",      // GAS受信時刻（JST）
  "name",            // 事業名
  "area",            // エリア/住所
  "compare",         // 競合比較ON/OFF
  "uiLang",          // UI言語
  "ip",              // 接続元IP
  "country",         // 国コード
  "region",          // 都道府県/州
  "city",            // 都市
  "postalCode",      // 郵便番号
  "lat",             // 緯度（IP推定）
  "lng",             // 経度（IP推定）
  "timezone",        // タイムゾーン
  "userAgent",       // UA
  "referer",         // リファラ
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sh = getSheet_();

    const row = [
      data.ts || "",
      Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss"),
      data.name || "",
      data.area || "",
      data.compare ? "1" : "0",
      data.uiLang || "",
      data.ip || "",
      data.country || "",
      data.region || "",
      data.city || "",
      data.postalCode || "",
      data.lat || "",
      data.lng || "",
      data.timezone || "",
      data.userAgent || "",
      data.referer || "",
    ];
    sh.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput("MEO log endpoint OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

function getSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight("bold");
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}
