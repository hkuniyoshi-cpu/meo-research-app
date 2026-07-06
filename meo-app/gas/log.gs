/**
 * MEO診断アプリ 入力ログ受信用GAS
 *
 * 【使い方】
 * ① このコードをApps Scriptに貼り付ける
 * ② 上部メニューから関数「setUpSheet」を選択して「実行」（初回のみ。承認が必要）
 *    → スプレッドシートに「診断ログ」シートが自動作成され、見出し・列幅・書式が整う
 * ③ 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」
 *      次のユーザーとして実行: 自分
 *      アクセスできるユーザー: 全員
 * ④ 発行されたWeb App URLを Cloudflare Worker の LOG_URL に登録
 *
 * 【コード修正後の再デプロイ】
 * 「デプロイ」→「デプロイを管理」→鉛筆マーク→バージョン「新しいバージョン」→デプロイ
 * ※ URLは変わりません
 */

const SHEET_ID   = "1GJPKXJtH3wKXaPbWAUJtjm4Q2U_eD3rem4ykKXyyWjA";
const SHEET_NAME = "診断ログ";

// 列定義（見出し・データキー・列幅）
const COLUMNS = [
  { header: "受信日時（JST）",      key: "receivedAt", width: 155 },
  { header: "Worker記録時刻",       key: "ts",         width: 190 },
  { header: "事業名",               key: "name",       width: 220 },
  { header: "エリア／住所",         key: "area",       width: 220 },
  { header: "競合比較",             key: "compare",    width:  75 },
  { header: "UI言語",               key: "uiLang",     width:  70 },
  { header: "IPアドレス",           key: "ip",         width: 130 },
  { header: "国",                   key: "country",    width:  55 },
  { header: "地域（都道府県/州）",  key: "region",     width: 130 },
  { header: "市区町村",             key: "city",       width: 130 },
  { header: "郵便番号",             key: "postalCode", width:  85 },
  { header: "緯度",                 key: "lat",        width:  85 },
  { header: "経度",                 key: "lng",        width:  85 },
  { header: "タイムゾーン",         key: "timezone",   width: 140 },
  { header: "UserAgent",            key: "userAgent",  width: 300 },
  { header: "参照元URL",            key: "referer",    width: 220 },
];

/* =========================================================
 *  シート初期化（初回に1回だけ手動実行）
 * =======================================================*/
function setUpSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  const _ss = ss; // toast用に保持

  // 既存の「シート1」など空の初期シートがあれば削除（診断ログ以外で行数0のもの）
  ss.getSheets().forEach(function (s) {
    if (s.getName() !== SHEET_NAME && s.getLastRow() === 0 && ss.getSheets().length > 1) {
      try { ss.deleteSheet(s); } catch (e) {}
    }
  });

  const headers = COLUMNS.map(function (c) { return c.header; });

  // 見出し行
  sh.clear();
  const headerRange = sh.getRange(1, 1, 1, headers.length);
  headerRange
    .setValues([headers])
    .setFontWeight("bold")
    .setFontColor("#ffffff")
    .setBackground("#1a73e8")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sh.setRowHeight(1, 34);
  sh.setFrozenRows(1);

  // 列幅
  COLUMNS.forEach(function (c, i) { sh.setColumnWidth(i + 1, c.width); });

  // 数値列の書式（緯度・経度）
  const latCol = COLUMNS.findIndex(function (c) { return c.key === "lat"; }) + 1;
  const lngCol = COLUMNS.findIndex(function (c) { return c.key === "lng"; }) + 1;
  sh.getRange(2, latCol, sh.getMaxRows() - 1, 1).setNumberFormat("0.0000");
  sh.getRange(2, lngCol, sh.getMaxRows() - 1, 1).setNumberFormat("0.0000");

  // 全体のフォント・折り返し
  sh.getRange(1, 1, sh.getMaxRows(), headers.length)
    .setFontFamily("Noto Sans JP")
    .setFontSize(10)
    .setWrap(false);

  // シートタブの色
  sh.setTabColor("#1a73e8");

  _ss.toast("診断ログシートを初期化しました", "セットアップ完了", 5);
  Logger.log("診断ログシートを初期化しました");
}

/* =========================================================
 *  Worker → ここへPOST（1件ぶんログ追記）
 * =======================================================*/
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sh = getOrInitSheet_();

    const receivedAt = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");

    // COLUMNSの順番どおりに値を組み立てる
    const row = COLUMNS.map(function (c) {
      switch (c.key) {
        case "receivedAt": return receivedAt;
        case "compare":    return data.compare ? "ON" : "OFF";
        case "lat":
        case "lng":        return data[c.key] === "" || data[c.key] == null ? "" : Number(data[c.key]);
        default:           return data[c.key] == null ? "" : String(data[c.key]);
      }
    });

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

/* =========================================================
 *  疎通確認（ブラウザでURLを開いたときの応答）
 * =======================================================*/
function doGet() {
  return ContentService
    .createTextOutput("MEO log endpoint OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

/* =========================================================
 *  シート取得（未初期化なら自動初期化）
 * =======================================================*/
function getOrInitSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh || sh.getLastRow() === 0) {
    setUpSheet();
    sh = ss.getSheetByName(SHEET_NAME);
  }
  return sh;
}
