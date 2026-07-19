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
  // --- 受信メタ ---
  { header: "受信日時（JST）",      key: "receivedAt",   width: 155 },
  { header: "ステータス",           key: "status",       width:  90 },
  // --- 入力 ---
  { header: "事業名（入力）",       key: "name",         width: 200 },
  { header: "エリア／住所（入力）", key: "area",         width: 200 },
  { header: "競合比較",             key: "compare",      width:  75 },
  { header: "UI言語",               key: "uiLang",       width:  70 },
  // --- 診断結果 ---
  { header: "店舗名（Google）",     key: "resultName",   width: 200 },
  { header: "住所（Google）",       key: "resultAddress",width: 220 },
  { header: "名称ミスマッチ",       key: "nameMismatch", width:  95 },
  { header: "整備スコア",           key: "score",        width:  90 },
  { header: "ランク",               key: "scoreRank",    width:  70 },
  { header: "オーナー確認",         key: "verified",     width:  90 },
  { header: "写真枚数",             key: "photos",       width:  80 },
  { header: "クチコミ件数",         key: "reviews",      width: 100 },
  { header: "評価",                 key: "rating",       width:  70 },
  { header: "エリア内順位",         key: "rankingRank",  width:  95 },
  { header: "エリア母集団",         key: "rankingTotal", width:  95 },
  { header: "最弱カテゴリ",         key: "weakest",      width: 140 },
  { header: "店舗緯度",             key: "bizLat",       width:  90 },
  { header: "店舗経度",             key: "bizLng",       width:  90 },
  // --- 接続元 ---
  { header: "IPアドレス",           key: "ip",           width: 130 },
  { header: "国",                   key: "country",      width:  55 },
  { header: "地域（都道府県/州）",  key: "region",       width: 130 },
  { header: "市区町村",             key: "city",         width: 130 },
  { header: "郵便番号",             key: "postalCode",   width:  85 },
  { header: "接続元緯度",           key: "lat",          width:  85 },
  { header: "接続元経度",           key: "lng",          width:  85 },
  { header: "タイムゾーン",         key: "timezone",     width: 140 },
  { header: "UserAgent",            key: "userAgent",    width: 300 },
  { header: "参照元URL",            key: "referer",      width: 220 },
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

  // 数値列の書式
  const setFmt = function (key, fmt) {
    const col = COLUMNS.findIndex(function (c) { return c.key === key; }) + 1;
    if (col > 0) sh.getRange(2, col, sh.getMaxRows() - 1, 1).setNumberFormat(fmt);
  };
  ["lat", "lng", "bizLat", "bizLng"].forEach(function (k) { setFmt(k, "0.0000"); });
  setFmt("score", "0");
  setFmt("photos", "0");
  setFmt("reviews", "0");
  setFmt("rating", "0.0");
  setFmt("rankingRank", "0");
  setFmt("rankingTotal", "0");

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

    // 数値として扱う列
    const NUM_KEYS = { lat:1, lng:1, bizLat:1, bizLng:1, score:1, photos:1, reviews:1, rating:1, rankingRank:1, rankingTotal:1 };

    // COLUMNSの順番どおりに値を組み立てる
    const row = COLUMNS.map(function (c) {
      if (c.key === "receivedAt") return receivedAt;
      if (c.key === "compare")    return data.compare ? "ON" : "OFF";
      const v = data[c.key];
      if (v === "" || v == null) return "";
      if (NUM_KEYS[c.key]) return Number(v);
      return String(v);
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
