/**
 * 登録されているウェブサイトを読み、
 *  ① 店名・住所・電話番号がGoogleの登録内容と同じ形で載っているか（NAP一致）
 *  ② 店舗情報の構造化データ（schema.org の LocalBusiness など）があるか
 * を調べる。
 *
 * 誤判定を避けるための方針：
 *  - 読み込めなかった（アクセス制限・タイムアウト・HTML以外）→ 判定しない（fetchfail）
 *  - 本文がほぼ空で、プログラムで後から表示する作りのページ → 判定しない（jsonly）
 *  - トップページで見つからない情報は、トップからリンクされた「アクセス」「会社概要」などのページも最大2枚まで確認する
 *  - 住所は「番地まで一致」したときだけ一致とみなす。町名や郵便番号だけ一致は「一部一致」
 */

type FetchFn = typeof fetch;

// fetchfail=トップを読めなかった / jsonly=中身がプログラム表示で読めない
export type SiteFail = "fetchfail" | "jsonly";
export interface SiteCheck {
  ok: boolean;
  fail?: SiteFail;
  pages: number;                                  // 確認したページ数
  name: boolean;                                  // 店名が載っているか
  phone: "match" | "other" | "none" | "na";       // na=Google側に電話番号が無い
  address: "match" | "partial" | "none" | "na";   // na=Google側の住所が照合できる形でない
  schema: "local" | "incomplete" | "other" | "none";
  schemaType: string;                             // 見つかった種類（LocalBusiness / Dentist など）
  unread?: boolean;                               // 読めなかった関連ページがある（見つからない情報は、そこに載っている可能性がある）
}

export interface SiteTarget {
  url: string;
  names: string[];      // 店名の候補（入力した店名・Googleの店名）
  address: string;      // Googleの住所
  phone?: string;       // Googleの電話番号（国内表記）
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 SearchManiaMEO/1.0 (+https://meo.search-mania.net)";
const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 6000;

const MAX_REDIRECTS = 4;

/**
 * 読みに行ってよいURLか。http(s)・標準ポートのみで、認証情報付き・社内向け（localhost / 私的IP）は読まない。
 * リダイレクト先も1回ごとにここで確かめる。
 */
export function isSafeUrl(u: URL): boolean {
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h.includes(".") || h === "localhost" || /\.(localhost|local|internal|lan|home|corp)$/.test(h)) return false;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
  }
  if (h.includes(":")) return false; // IPv6 の直書きは読まない
  return true;
}

/** ページを読む。missing=ページが無い（404など）/ error=読めなかった（アクセス制限・タイムアウトなど） */
type Page = { html: string; url: string; truncated: boolean };
async function fetchPage(url: string, fetchFn: FetchFn): Promise<Page | "missing" | "error"> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let cur = new URL(url);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isSafeUrl(cur)) return "error";
      const r = await fetchFn(cur.href, { headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "ja,en;q=0.8" }, redirect: "manual", signal: ctrl.signal });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) return "error";
        cur = new URL(loc, cur);
        continue;
      }
      if (r.status === 404 || r.status === 410) return "missing";
      if (!r.ok) return "error";
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (ct && !ct.includes("html") && !ct.includes("xml")) return "missing";
      const { bytes, truncated } = await readLimited(r);
      const html = decode(bytes, ct);
      if (html == null) return "error";
      return { html, url: cur.href, truncated };
    }
    return "error";
  } catch {
    return "error";
  } finally {
    clearTimeout(timer);
  }
}

async function readLimited(r: Response): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!r.body) {
    const all = new Uint8Array(await r.arrayBuffer());
    return { bytes: all.subarray(0, MAX_BYTES), truncated: all.length > MAX_BYTES };
  }
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let done = false;
  while (size < MAX_BYTES) {
    const c = await reader.read();
    if (c.done) { done = true; break; }
    chunks.push(c.value);
    size += c.value.length;
  }
  if (!done) reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(size, MAX_BYTES));
  let off = 0;
  for (const c of chunks) {
    const take = Math.min(c.length, out.length - off);
    out.set(c.subarray(0, take), off);
    off += take;
    if (off >= out.length) break;
  }
  return { bytes: out, truncated: !done && size >= MAX_BYTES };
}

/** 文字コード：ヘッダー → meta の順で判断（古いサイトの Shift_JIS / EUC-JP に対応） */
function decode(bytes: Uint8Array, contentType: string): string | null {
  let cs = /charset=["']?([\w-]+)/.exec(contentType)?.[1];
  if (!cs) {
    const head = String.fromCharCode(...bytes.subarray(0, 4096));
    cs = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder((cs || "utf-8").toLowerCase()).decode(bytes);
  } catch {
    // 実行環境が対応していない文字コード。UTF-8 として読むと文字化けして誤判定になるので、読めなかったものとして扱う
    return null;
  }
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©" };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

/** 表示される文字（タイトル・説明文を含む）を取り出す */
export function visibleText(html: string): string {
  const meta = [...html.matchAll(/<meta[^>]+(?:name|property)=["'](?:description|og:site_name|og:title)["'][^>]*>/gi)]
    .map((m) => /content=["']([^"']*)["']/i.exec(m[0])?.[1] || "").join(" ");
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(meta + " " + body).replace(/\s+/g, " ").trim();
}

// ---------------- 正規化 ----------------
const KANJI_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function kanjiToNum(s: string): number {
  if (s === "十") return 10;
  const m = /^([一二三四五六七八九])?十([一二三四五六七八九])?$/.exec(s);
  if (m) return (m[1] ? KANJI_NUM[m[1]] : 1) * 10 + (m[2] ? KANJI_NUM[m[2]] : 0);
  return s.length === 1 ? KANJI_NUM[s] ?? NaN : NaN;
}
const DASH = /[‐‑‒–—―−ー－ｰ─━]/g;

/** 住所の表記ゆれをそろえる：全角→半角、二丁目→2-、3番14号→3-14、ハイフンの種類 */
export function normAddr(s: string): string {
  return s.normalize("NFKC")
    .replace(/([一二三四五六七八九十]+)(?=丁目)/g, (m) => { const n = kanjiToNum(m); return Number.isNaN(n) ? m : String(n); })
    .replace(/(\d)\s*(?:丁目|番地の?|番|号|の)\s*(?=\d)/g, "$1-")
    .replace(/(\d)\s*(?:丁目|番地|番|号)/g, "$1")
    .replace(/(\d)\s*[‐‑‒–—―−ー－ｰ─━]\s*(?=\d)/g, "$1-")
    .replace(/\s+/g, "");
}

/** 店名の比較用：記号・空白を除き小文字に */
function normName(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[\s・\-‐－|｜/／()（）「」『』【】\[\]&＆.,、。'’"!！?？~〜:：]/g, "");
}

// ---------------- 店名 ----------------
/** 店名のまとまりとしては使わない一般的な語（これだけ一致しても同じ店とは言えない） */
const GENERIC_WORDS = new Set([
  "株式会社", "有限会社", "合同会社", "本店", "支店", "店", "本社", "公式", "official",
  "restaurant", "cafe", "coffee", "bar", "salon", "clinic", "dental", "hotel", "shop", "store", "studio", "school", "office", "center", "centre", "central", "okinawa", "naha", "japan",
  "整骨院", "接骨院", "整体院", "歯科", "歯科医院", "クリニック", "病院", "医院", "美容室", "美容院", "サロン", "カフェ", "レストラン", "居酒屋", "食堂", "ホテル", "教室", "スクール", "事務所", "不動産", "工務店",
]);
function nameCandidates(names: string[]): string[] {
  const out = new Set<string>();
  for (const raw of names) {
    if (!raw) continue;
    const full = normName(raw);
    if (full.length >= 2 && !GENERIC_WORDS.has(full)) out.add(full);
    // 「ひかり整骨院 豊見城」→ いちばん長いまとまり（ひかり整骨院）でも探す。一般的な語・短い語だけでは探さない
    const parts = raw.normalize("NFKC").split(/[\s|｜/／\-－・(（)）【】「」]+/).map(normName)
      .filter((p) => p.length >= 3 && !GENERIC_WORDS.has(p));
    const longest = parts.sort((a, b) => b.length - a.length)[0];
    if (longest) out.add(longest);
  }
  return [...out];
}

// ---------------- 電話・郵便番号 ----------------
/** 電話番号らしい文字列を1つずつ取り出して数字だけにする（隣り合う番号どうしをつなげない） */
const PHONE_RE = /(?:\+81[\s\-‐−ー－]*\(?0?\)?[\s\-‐−ー－]*|(?<!\d)0)\d{1,4}(?:[\s\-‐‑‒–—―−ー－.]|[(（)）]){0,3}\d{1,4}(?:[\s\-‐‑‒–—―−ー－.]|[(（)）]){0,3}\d{3,4}(?!\d)/g;
export function phoneCandidates(s: string): string[] {
  const out: string[] = [];
  for (const m of s.normalize("NFKC").matchAll(PHONE_RE)) {
    let d = m[0].startsWith("+81") ? "0" + m[0].slice(3).replace(/\D/g, "").replace(/^0/, "") : m[0].replace(/\D/g, "");
    if (d.length >= 10 && d.length <= 11) out.push(d);
  }
  return out;
}
function phoneDigits(p?: string): string {
  if (!p) return "";
  return phoneCandidates(p)[0] || "";
}
function postalCandidates(s: string): Set<string> {
  return new Set([...s.normalize("NFKC").matchAll(/(?<![\d\-‐−ー－])(\d{3})[\-‐−ー－]?(\d{4})(?![\d\-‐−ー－])/g)].map((m) => m[1] + m[2]));
}

// ---------------- 住所 ----------------
interface AddrKey { postal: string; town: string; blocks: string; parts: number }
export function addrKey(address: string): AddrKey {
  const s = address.normalize("NFKC");
  const postal = /(\d{3})-?(\d{4})/.exec(s.replace(DASH, "-"));
  let rest = s.replace(/^日本、?\s*/, "").replace(/〒?\s*\d{3}-?\d{4}\s*/, "").trim();
  let town = "";
  if (/[都道府県市区町村]/.test(rest) && !/^[0-9a-z]/i.test(rest)) {
    rest = rest.replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, "");
    const city = /^(.+?郡)?(.+?[市区町村])/.exec(rest);
    if (city) rest = rest.slice(city[0].length);
    // 政令市の区（那覇市は無いが、大阪市北区など）
    const ward = /^(.{1,4}区)(?=\D)/.exec(rest);
    if (ward) rest = rest.slice(ward[0].length);
    town = (/^(?:大字|字)?([^\d\s]+?)(?=\d|[一二三四五六七八九十]+丁目|$)/.exec(rest)?.[1] || "").replace(/^(?:大字|字)/, "");
  } else {
    // 英語表記でも町名だけ漢字のまま入っていることがある（例：「Haebaru, 喜屋武２６１−２」）。番地の直前の漢字・かなを町名として使う
    const m = /(?:^|[\s,、])(?:大字|字)?([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]{2,})(?=\s*\d)/u.exec(rest);
    if (m) {
      town = m[1].replace(/^(?:大字|字)/, "");
      rest = rest.slice((m.index ?? 0) + m[0].length);
    }
  }
  const blocks = /\d+(?:-\d+)*/.exec(normAddr(rest))?.[0] || "";
  return { postal: postal ? postal[1] + postal[2] : "", town: town.length >= 2 ? normAddr(town) : "", blocks, parts: blocks ? blocks.split("-").length : 0 };
}

/**
 * 住所の一致。日本語の住所は「町名の直後に番地」で照合する。
 * 英語など日本語以外の表記（表示言語が日本語以外のとき）は町名を比べられないため、郵便番号と番地の両方がそろったときだけ一致とし、
 * 郵便番号が無い住所は判定しない（na）。Google側の住所から番地を取り出せないときも判定しない。
 */
function matchAddress(key: AddrKey, text: string): SiteCheck["address"] {
  if (!key.blocks || (!key.town && !key.postal)) return "na";
  const t = normAddr(text);
  const townFound = !!key.town && t.includes(key.town);
  const postalFound = !!key.postal && postalCandidates(text).has(key.postal);
  const re = new RegExp(`(?<![\\d-])${key.blocks}(?!\\d)`);
  let numsFound = false;
  if (key.town) {
    // 町名の直後（50文字以内）に番地があるか
    const idx = [...t.matchAll(new RegExp(escapeRe(key.town), "g"))].map((m) => m.index ?? 0);
    numsFound = idx.some((i) => re.test(t.slice(i + key.town.length, i + key.town.length + 50)));
    // 町名の書き方が違う（字の有無など）場合は、郵便番号と2つ以上の数字の番地（2-3-14 など）がそろえば一致
    if (!numsFound && key.parts >= 2 && postalFound) numsFound = re.test(t);
  } else {
    numsFound = postalFound && re.test(t);
    // 町名を比べられない表記で郵便番号もサイトに無い＝サイト側が郵便番号を省いているだけかもしれないので判定しない
    if (!numsFound && !postalFound) return "na";
  }
  if (numsFound) return "match";
  return townFound || postalFound ? "partial" : "none";
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------------- 構造化データ ----------------
const LOCAL_TYPES = new Set([
  "localbusiness", "store", "restaurant", "foodestablishment", "cafeorcoffeeshop", "bakery", "barorpub", "fastfoodrestaurant", "icecreamshop", "winery", "brewery", "distillery",
  "dentist", "medicalclinic", "medicalbusiness", "physician", "hospital", "pharmacy", "optician", "physiotherapy", "medicalorganization",
  "healthandbeautybusiness", "beautysalon", "hairsalon", "nailsalon", "dayspa", "healthclub", "tattooparlor",
  "realestateagent", "lodgingbusiness", "hotel", "motel", "hostel", "bedandbreakfast", "resort", "campground", "vacationrental",
  "automotivebusiness", "autorepair", "autodealer", "autobodyshop", "autowash", "gasstation", "autorental",
  "homeandconstructionbusiness", "generalcontractor", "housepainter", "plumber", "electrician", "roofingcontractor", "hvacbusiness", "locksmith", "movingcompany",
  "professionalservice", "legalservice", "attorney", "notary", "accountingservice", "financialservice", "insuranceagency", "employmentagency", "travelagency",
  "sportsactivitylocation", "exercisegym", "sportsclub", "golfcourse", "bowlingalley", "skiresort", "stadiumorarena", "publicswimmingpool",
  "entertainmentbusiness", "nightclub", "amusementpark", "artgallery", "casino", "comedyclub", "movietheater",
  "childcare", "dryCleaningOrLaundry".toLowerCase(), "animalshelter", "veterinarycare", "selfstorage", "shoppingcenter", "touristinformationcenter",
  "educationalorganization", "school", "preschool", "elementaryschool", "middleschool", "highschool", "collegeoruniversity",
  "clothingstore", "bookstore", "conveniencestore", "departmentstore", "electronicsstore", "florist", "furniturestore", "gardenstore", "grocerystore",
  "hardwarestore", "hobbyshop", "homegoodsstore", "jewelrystore", "liquorstore", "mobilephonestore", "musicstore", "officeequipmentstore", "outletstore",
  "pawnshop", "petstore", "shoestore", "sportinggoodsstore", "tireshop", "toystore", "wholesalestore", "bikestore", "computerstore", "autopartsstore",
  "radiostation", "televisionstation", "library", "postoffice", "governmentoffice", "emergencyservice", "internetcafe", "recyclingcenter",
]);
const ORG_TYPES = new Set(["organization", "corporation", "ngo", "onlinebusiness", "onlinestore"]);

interface Node { [k: string]: any }
function collectNodes(v: any, out: Node[], depth = 0): void {
  if (!v || typeof v !== "object" || depth > 8) return;
  if (Array.isArray(v)) { for (const x of v) collectNodes(x, out, depth + 1); return; }
  if (v["@type"]) out.push(v);
  for (const k of Object.keys(v)) if (k !== "@context") collectNodes(v[k], out, depth + 1);
}
const typesOf = (n: Node): string[] => (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]).filter((x) => typeof x === "string")
  .map((x: string) => x.replace(/^https?:\/\/schema\.org\//i, ""));
// 空の入れ物（address: {} や telephone: [""]）は「入っていない」とみなす
const filled = (x: unknown) => typeof x === "string" && x.trim().length > 0;
const hasAddress = (n: Node): boolean => {
  const a = Array.isArray(n.address) ? n.address[0] : n.address;
  if (typeof a === "string") return a.trim().length > 4;
  return !!a && typeof a === "object" && ["streetAddress", "addressLocality", "addressRegion", "postalCode"].some((k) => filled(a[k]));
};
const hasPhone = (n: Node): boolean => (Array.isArray(n.telephone) ? n.telephone : [n.telephone]).some((x: unknown) => typeof x === "string" && /\d{2}/.test(x));

export function findSchema(htmls: string[]): { schema: SiteCheck["schema"]; schemaType: string } {
  const nodes: Node[] = [];
  for (const html of htmls) {
    for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
      const raw = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, "");
      try { collectNodes(JSON.parse(raw), nodes); } catch {
        // 改行コードや末尾のカンマで壊れていることがある。最低限だけ直して読み直す
        try { collectNodes(JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " ").replace(/,\s*([}\]])/g, "$1")), nodes); } catch { /* 読めないものは無視 */ }
      }
    }
    // microdata（itemtype="https://schema.org/Dentist" など）
    for (const m of html.matchAll(/itemtype\s*=\s*["']https?:\/\/schema\.org\/(\w+)["']/gi)) {
      const ty = m[1];
      // 次の（住所・位置・営業時間以外の）itemtype が出てくるまでを、この項目の範囲とみなす（別の要素の値を借りない）
      const start = (m.index ?? 0) + m[0].length;
      const next = html.slice(start).search(/itemtype\s*=\s*["']https?:\/\/schema\.org\/(?!PostalAddress|GeoCoordinates|OpeningHoursSpecification)/i);
      const scope = html.slice(start, start + (next < 0 ? 6000 : Math.min(next, 6000)));
      // 値（タグの中身か content 属性）が入っているものだけ数える
      const prop = (name: string) => {
        const t = new RegExp(`<[^>]*itemprop\\s*=\\s*["'][^"']*\\b${name}\\b[^"']*["'][^>]*>`, "i").exec(scope);
        if (!t) return "";
        const content = /content\s*=\s*["']([^"']+)["']/i.exec(t[0])?.[1];
        return (content || /^\s*([^<]*)/.exec(scope.slice((t.index ?? 0) + t[0].length))?.[1] || "").trim();
      };
      const tel = prop("telephone");
      // PostalAddress を入れ子にした住所は、次の itemtype（PostalAddress）側に値が入るので、itemprop="address" があれば住所ありとみなす
      const addr = prop("streetAddress") || prop("addressLocality") || (/itemprop\s*=\s*["']address["']/i.test(scope) ? prop("address") || "nested" : "");
      nodes.push({ "@type": ty, ...(addr ? { address: addr.length > 4 ? addr : "microdata" } : {}), ...(tel ? { telephone: tel } : {}) });
    }
  }
  if (!nodes.length) return { schema: "none", schemaType: "" };
  const local = nodes.filter((n) => typesOf(n).some((t) => LOCAL_TYPES.has(t.toLowerCase())));
  const best = local.find((n) => hasAddress(n) && hasPhone(n)) || local.find((n) => hasAddress(n) || hasPhone(n)) || local[0];
  if (best) return { schema: hasAddress(best) && hasPhone(best) ? "local" : "incomplete", schemaType: typesOf(best)[0] };
  const org = nodes.find((n) => typesOf(n).some((t) => ORG_TYPES.has(t.toLowerCase())));
  return { schema: "other", schemaType: org ? typesOf(org)[0] : typesOf(nodes[0])[0] || "" };
}

// ---------------- 下層ページ ----------------
const SUB_HREF = /(?:^|[/_.-])(access|company|about|contact|info|shop|store|outline|profile|gaiyou|gaiyo|map|tenpo|clinic|salon|corporate|overview)(?:[/_.-]|$)/i;
const SUB_TEXT = /(アクセス|会社概要|会社案内|会社情報|店舗情報|店舗案内|店舗一覧|医院案内|院内案内|医院紹介|院紹介|サロン案内|サロン情報|教室案内|基本情報|所在地|地図|お問い合わせ|お問合せ|問い合わせ|概要)/;
export function subpageLinks(html: string, baseUrl: string): string[] {
  let base: URL;
  try { base = new URL(baseUrl); } catch { return []; }
  const host = base.hostname.replace(/^www\./, "");
  const scored: { url: string; score: number }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeEntities(m[1]);
    if (/^(mailto|tel|javascript):/i.test(href) || /\.(pdf|jpe?g|png|gif|webp|zip|docx?|xlsx?)(\?|$)/i.test(href)) continue;
    let u: URL;
    try { u = new URL(href, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, "") !== host) continue;
    u.hash = "";
    if (u.href === base.href || u.pathname === "/" ) continue;
    const text = m[2].replace(/<[^>]+>/g, " ");
    const score = (SUB_TEXT.test(text) ? 2 : 0) + (SUB_HREF.test(u.pathname) ? 1 : 0);
    if (score > 0) scored.push({ url: u.href, score });
  }
  const seen = new Set<string>();
  return scored.sort((a, b) => b.score - a.score).map((s) => s.url).filter((u) => (seen.has(u) ? false : (seen.add(u), true))).slice(0, 2);
}

// ---------------- 本体 ----------------
export async function checkSite(target: SiteTarget, fetchFn: FetchFn = fetch): Promise<SiteCheck> {
  const empty: SiteCheck = { ok: false, pages: 0, name: false, phone: "na", address: "na", schema: "none", schemaType: "" };
  let url: URL;
  try { url = new URL(target.url); } catch { return { ...empty, fail: "fetchfail" }; }
  if (!isSafeUrl(url)) return { ...empty, fail: "fetchfail" };

  const top = await fetchPage(url.href, fetchFn);
  if (typeof top === "string") return { ...empty, fail: "fetchfail" };

  const names = nameCandidates(target.names);
  const tel = phoneDigits(target.phone);
  const key = addrKey(target.address || "");
  const pages: Page[] = [top];
  let unread = top.truncated; // 読み切れなかったページがある

  const judge = () => {
    const text = pages.map((p) => visibleText(p.html)).join(" \n ");
    // 電話番号は1つずつ取り出して比べる（本文の番号と tel: リンクの番号をつなげない）
    const phones = new Set([
      ...phoneCandidates(text),
      ...pages.flatMap((p) => [...p.html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)].flatMap((m) => phoneCandidates(decodeEntities(m[1])))),
    ]);
    const nt = normName(text);
    const name = names.some((n) => nt.includes(n));
    const phone: SiteCheck["phone"] = !tel ? "na" : phones.has(tel) ? "match" : phones.size ? "other" : "none";
    const address = matchAddress(key, text);
    return { text, name, phone, address, ...findSchema(pages.map((p) => p.html)) };
  };

  let r = judge();
  const napDone = () => r.name && (r.phone === "match" || r.phone === "na") && (r.address === "match" || r.address === "na");
  if (!napDone() || r.schema !== "local") {
    const got = await Promise.all(subpageLinks(top.html, top.url).map((u) => fetchPage(u, fetchFn)));
    for (const g of got) {
      if (g === "error") unread = true; // 404 などページが無いものは数えない
      else if (g !== "missing") { pages.push(g); unread ||= g.truncated; }
    }
    if (pages.length > 1) r = judge();
  }

  // 本文がほとんど無く、住所も電話も見つからない＝プログラムで後から表示する作り。読み取れないので判定しない
  // （店名はタイトルに入っていることが多いので、読み取れたかどうかの目安にしない）
  const found = r.phone === "match" || r.phone === "other" || r.address === "match" || r.address === "partial";
  if (!found && r.text.length < 200 && /<script/i.test(top.html)) {
    return { ...empty, pages: pages.length, fail: "jsonly", schema: r.schema, schemaType: r.schemaType };
  }
  return { ok: true, unread, pages: pages.length, name: r.name, phone: r.phone, address: r.address, schema: r.schema, schemaType: r.schemaType };
}
