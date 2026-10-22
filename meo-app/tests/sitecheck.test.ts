import { describe, it, expect, vi } from "vitest";
import { checkSite, addrKey, findSchema, subpageLinks, normAddr } from "../src/lib/sitecheck";

const html = (body: string, head = "") => `<!doctype html><html><head><meta charset="utf-8"><title>テスト整骨院</title>${head}</head><body>${body}</body></html>`;
const res = (body: string | Uint8Array, ct = "text/html; charset=utf-8") => new Response(body, { status: 200, headers: { "content-type": ct } });
const router = (pages: Record<string, () => Response>) => vi.fn(async (u: any) => {
  const h = pages[String(u)];
  if (!h) return new Response("nf", { status: 404 });
  return h();
}) as any;
const T = { url: "https://ex.jp/", names: ["テスト整骨院 那覇"], address: "日本、〒900-0033 沖縄県那覇市久米２丁目３−１４ 久米ビル2F", phone: "098-123-4567" };

describe("住所の正規化", () => {
  it("Googleの住所から郵便番号・町名・番地を取り出す", () => {
    expect(addrKey(T.address)).toEqual({ postal: "9000033", town: "久米", blocks: "2-3-14", parts: 3 });
    expect(addrKey("日本、〒901-1105 沖縄県島尻郡南風原町字新川４５６")).toMatchObject({ town: "新川", blocks: "456", parts: 1 });
    expect(addrKey("2-3-14 Kume, Naha, Okinawa 900-0033, Japan")).toMatchObject({ postal: "9000033", town: "", blocks: "2-3-14" });
  });
  it("二丁目・番・号・全角数字の表記ゆれをそろえる", () => {
    expect(normAddr("久米二丁目３番14号")).toBe("久米2-3-14");
    expect(normAddr("久米2丁目3番地の14")).toBe("久米2-3-14");
  });
});

describe("checkSite", () => {
  it("表記が違っても、店名・番地までの住所・電話が載っていれば一致", async () => {
    const f = router({ "https://ex.jp/": () => res(html(`<footer>テスト整骨院<br>〒900-0033 沖縄県那覇市久米二丁目3番14号<br>TEL：０９８（１２３）４５６７</footer>`)) });
    expect(await checkSite(T, f)).toMatchObject({ ok: true, name: true, address: "match", phone: "match" });
  });
  it("町名だけ一致・別の電話番号は partial / other", async () => {
    const f = router({ "https://ex.jp/": () => res(html(`<p>テスト整骨院 那覇市久米5-1-1 TEL 098-999-0000</p>`)) });
    expect(await checkSite(T, f)).toMatchObject({ address: "partial", phone: "other" });
  });
  it("番地の数字が電話番号の一部に含まれていても一致としない", async () => {
    const f = router({ "https://ex.jp/": () => res(html(`<p>お問い合わせ 098-2-3-14 テスト</p>`)) });
    expect((await checkSite({ ...T, address: "日本、〒999-9999 沖縄県那覇市久米２丁目３−１４" }, f)).address).toBe("none");
  });
  it("トップに無い情報は「アクセス」ページも見る", async () => {
    const f = router({
      "https://ex.jp/": () => res(html(`<a href="/access/">アクセス</a><a href="/blog/">ブログ</a><p>テスト整骨院へようこそ。${"施術の説明。".repeat(40)}</p>`)),
      "https://ex.jp/access/": () => res(html(`<p>沖縄県那覇市久米2-3-14 電話 098-123-4567</p>`)),
    });
    expect(await checkSite(T, f)).toMatchObject({ pages: 2, name: true, address: "match", phone: "match" });
    expect(f.mock.calls.map((c: any) => String(c[0]))).not.toContain("https://ex.jp/blog/");
  });
  it("Shift_JIS のサイトも読める", async () => {
    const sjis = new Uint8Array([0x8b, 0x76, 0x95, 0xc4, 0x32, 0x2d, 0x33, 0x2d, 0x31, 0x34]); // 久米2-3-14
    const f = router({ "https://ex.jp/": () => res(sjis, "text/html; charset=Shift_JIS") });
    expect((await checkSite(T, f)).address).toBe("match");
  });
  it("読み込めない・本文がほぼ空のプログラム表示のサイトは判定しない", async () => {
    expect((await checkSite(T, router({}))).fail).toBe("fetchfail");
    const js = router({ "https://ex.jp/": () => res(html(`<div id="root"></div><script src="/app.js"></script>`)) });
    expect(await checkSite(T, js)).toMatchObject({ ok: false, fail: "jsonly" });
  });
});

describe("構造化データ", () => {
  const ld = (o: any) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
  it("LocalBusiness 系で住所・電話があれば local、どちらか欠ければ incomplete", () => {
    expect(findSchema([ld({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite" }, { "@type": "Dentist", address: { "@type": "PostalAddress", streetAddress: "久米2-3-14" }, telephone: "098-1" }] })]))
      .toEqual({ schema: "local", schemaType: "Dentist" });
    expect(findSchema([ld({ "@type": ["LocalBusiness"], address: "沖縄県那覇市久米" })]).schema).toBe("incomplete");
  });
  it("Organization・WebSite だけなら other、何も無ければ none", () => {
    expect(findSchema([ld({ "@type": "Organization", name: "x" })])).toEqual({ schema: "other", schemaType: "Organization" });
    expect(findSchema(["<p>none</p>"]).schema).toBe("none");
  });
  it("microdata も読む", () => {
    expect(findSchema([`<div itemscope itemtype="https://schema.org/HairSalon"><span itemprop="address">x</span><span itemprop="telephone">098-123-4567</span></div>`]).schema).toBe("local");
  });
});

describe("下層ページの選び方", () => {
  it("同じサイト内の会社概要・アクセスを優先し、外部・ファイル・別機能のページは選ばない", () => {
    const links = subpageLinks(`<a href="https://other.jp/access">アクセス</a><a href="/files/map.pdf">地図</a><a href="/automap/">自動マップ</a><a href="/company.html">会社概要</a><a href="tel:0981">電話</a>`, "https://ex.jp/");
    expect(links).toEqual(["https://ex.jp/company.html"]);
  });
});

describe("誤判定・安全対策", () => {
  it("社内向け・認証付き・標準外ポートのURLは読まない。リダイレクト先も確かめる", async () => {
    const { isSafeUrl } = await import("../src/lib/sitecheck");
    for (const u of ["http://localhost/", "http://127.0.0.1/", "http://192.168.1.1/", "http://10.0.0.5/", "http://169.254.169.254/", "https://user:pw@ex.jp/", "https://ex.jp:8080/", "http://[::1]/"]) {
      expect(isSafeUrl(new URL(u))).toBe(false);
    }
    expect(isSafeUrl(new URL("https://www.ex.co.jp/shop/"))).toBe(true);
    const f = vi.fn(async (u: any) => String(u) === "https://ex.jp/"
      ? new Response("", { status: 302, headers: { location: "http://169.254.169.254/latest" } })
      : res(html("secret"))) as any;
    expect((await checkSite(T, f)).fail).toBe("fetchfail");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("隣り合う電話番号（TEL と FAX、本文と tel: リンク）をつなげない", async () => {
    const f = router({ "https://ex.jp/": () => res(html(`<p>テスト整骨院 098-999-0000 098-123-4567</p><a href="tel:098-123-4567">098-123-4567</a>`)) });
    expect((await checkSite(T, f)).phone).toBe("match");
  });
  it("一般的な語（整骨院・restaurant など）だけの一致は店名の一致としない", async () => {
    const f = router({ "https://ex.jp/": () => res(html(`<p>那覇の整骨院です Central Clinic restaurant 久米2-3-14</p>`)) });
    expect((await checkSite({ ...T, names: ["ひまわり 整骨院", "Central Restaurant"] }, f)).name).toBe(false);
  });
  it("英語表記の住所は、郵便番号が無いと判定しない（na）", async () => {
    const f = router({ "https://ex.jp/": () => res(html(`<p>テスト整骨院 2-3-14 Kume</p>`)) });
    expect((await checkSite({ ...T, address: "2-3-14 Kume, Naha, Okinawa, Japan" }, f)).address).toBe("na");
  });
  it("関連ページが読めなかったときは unread を付ける（404 は数えない）", async () => {
    const top = () => res(html(`<a href="/access/">アクセス</a><a href="/company/">会社概要</a><p>テスト整骨院。${"説明。".repeat(80)}</p>`));
    const err = router({ "https://ex.jp/": top, "https://ex.jp/access/": () => new Response("x", { status: 503 }) });
    expect((await checkSite(T, err)).unread).toBe(true);
    const missing = router({ "https://ex.jp/": top });
    expect((await checkSite(T, missing)).unread).toBe(false);
  });
  it("空の住所・電話の構造化データは入っていないものとみなす", () => {
    const ld = (o: any) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
    expect(findSchema([ld({ "@type": "Dentist", address: {}, telephone: [""] })]).schema).toBe("incomplete");
  });
});

describe("英語表示の住所", () => {
  it("英語表記に混ざった漢字の町名を使って照合する", async () => {
    const en = "Japan, 〒901-1113 Okinawa, Shimajiri District, Haebaru, 喜屋武２６１−２";
    expect(addrKey(en)).toMatchObject({ postal: "9011113", town: "喜屋武", blocks: "261-2" });
    const f = router({ "https://ex.jp/": () => res(html(`<p>テスト整骨院 営業所 沖縄県島尻郡南風原町字喜屋武261-2</p>`)) });
    expect((await checkSite({ ...T, address: en }, f)).address).toBe("match");
  });
});
