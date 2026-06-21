let turnstileToken = "";
window.onTurnstile = (t) => { turnstileToken = t; };

const $ = (id) => document.getElementById(id);
const show = (id) => { $(id).hidden = false; };
const hide = (id) => { $(id).hidden = true; };

const LOADING_STEPS = ["店舗を特定中…", "NAP整合性を照合中…", "口コミ傾向を解析中…", "競合の知名度を取得中…", "スコアを算出中…"];
const SHORT = { nap: "基本情報", category: "カテゴリ", reviews: "口コミ", photos: "写真", hours: "営業時間", extras: "付加情報" };

let currentShare = { url: "", text: "", title: "MEO無料診断" };

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
    data._compare = compare;
    renderResult(data);
    hide("loading-view"); show("result-view");
    window.scrollTo({ top: 0, behavior: "smooth" });
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

function backToInput(msg) { hide("loading-view"); show("input-view"); showErr(msg); resetTurnstile(); }
function resetTurnstile() { try { window.turnstile && window.turnstile.reset(); } catch (e) {} turnstileToken = ""; }
function showErr(msg) { const e = $("err"); e.textContent = msg; e.hidden = false; }
function errMessage(code) {
  return ({
    not_found: "該当する店舗が見つかりませんでした。事業名や住所を見直してください",
    rate_limited: "本日の診断上限に達しました。明日また試せます",
    bot_check_failed: "ボット判定をやり直しました。もう一度「無料でMEO診断する」を押してください",
    missing_fields: "入力が不足しています",
    upstream_error: "データ取得に失敗しました。時間をおいて再度お試しください",
  })[code] || "診断に失敗しました";
}

/* ===== ランク / 総評 ===== */
function rankOf(t) {
  if (t >= 90) return { l: "S", label: "卓越", c: "#34A853" };
  if (t >= 75) return { l: "A", label: "良好", c: "#4285F4" };
  if (t >= 60) return { l: "B", label: "あと一歩", c: "#FBBC05" };
  if (t >= 45) return { l: "C", label: "要改善", c: "#FB8C00" };
  return { l: "D", label: "要対策", c: "#EA4335" };
}
function weakestCat(d) {
  return [...d.profile.categories].sort((a, b) => a.score / a.max - b.score / b.max)[0];
}
function verdictText(d) {
  const t = d.profile.total, w = SHORT[weakestCat(d).key] || weakestCat(d).label;
  let head;
  if (t >= 90) head = "非常に良く整備されています。この高水準を維持しましょう。";
  else if (t >= 75) head = "良好な状態です。あと少しの改善で上位表示が狙えます。";
  else if (t >= 60) head = "合格ラインまであと一歩。弱い項目を埋めていきましょう。";
  else if (t >= 45) head = "改善の余地が大きい状態です。基本項目から着実に整えましょう。";
  else head = "早急な対策が必要です。まずは基本情報の整備から始めましょう。";
  return `${head}特に「${w}」が弱点です。ここを強化すると全体が底上げされます。`;
}

/* ===== SVGグラフ ===== */
function donutSVG(color) {
  const R = 54, C = (2 * Math.PI * R).toFixed(1);
  return `<svg class="donut" viewBox="0 0 140 140">
    <circle cx="70" cy="70" r="${R}" fill="none" stroke="rgba(120,160,210,.18)" stroke-width="14"/>
    <circle class="donut-val" cx="70" cy="70" r="${R}" fill="none" stroke="${color}" stroke-width="14"
      stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 70 70)"/>
    <text x="70" y="74" text-anchor="middle" class="donut-num" id="dnum" fill="${color}">0</text>
    <text x="70" y="92" text-anchor="middle" class="donut-sub">/ 100</text>
  </svg>`;
}
function radarSVG(cats) {
  const cx = 100, cy = 100, R = 60, n = cats.length;
  const pt = (ratio, i) => { const a = (-90 + i * 360 / n) * Math.PI / 180; return [cx + R * ratio * Math.cos(a), cy + R * ratio * Math.sin(a)]; };
  const grid = [1, 0.66, 0.33].map(r => {
    const pts = cats.map((_, i) => pt(r, i).map(v => v.toFixed(1)).join(",")).join(" ");
    return `<polygon points="${pts}" fill="none" stroke="rgba(120,160,210,.22)" stroke-width="1"/>`;
  }).join("");
  const axes = cats.map((_, i) => { const [x, y] = pt(1, i); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(120,160,210,.22)"/>`; }).join("");
  const valPts = cats.map((c, i) => pt(Math.max(0.05, c.score / c.max), i).map(v => v.toFixed(1)).join(",")).join(" ");
  const dots = cats.map((c, i) => { const [x, y] = pt(Math.max(0.05, c.score / c.max), i); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#4285F4"/>`; }).join("");
  const labels = cats.map((c, i) => {
    const [x, y] = pt(1.28, i);
    return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle" class="radar-lbl">${SHORT[c.key] || c.label}</text>`;
  }).join("");
  return `<svg class="radar" viewBox="-22 -22 244 244">${grid}${axes}
    <polygon class="radar-val" points="${valPts}" fill="rgba(66,133,244,.25)" stroke="#4285F4" stroke-width="2"/>
    ${dots}${labels}</svg>`;
}

/* ===== メイン描画 ===== */
function renderResult(d) {
  const r = rankOf(d.profile.total);

  const plan = d.tipsVisible.map((t, i) => {
    const p = i < 2 ? { t: "最優先", cls: "pri-high" } : { t: "推奨", cls: "pri-mid" };
    return `<li><span class="pri ${p.cls}">${p.t}</span>${esc(t)}</li>`;
  }).join("");
  const lockedPlan = d.tipsLockedCount > 0
    ? `<li class="more">＋ほか${d.tipsLockedCount}項目の改善で、さらに上位が狙えます</li>` : "";

  const ranking = d.ranking ? `
    <div class="glass">
      <div class="g-head"><span class="g-ico">📊</span>検索評価（想定）— 近隣${d.ranking.total}件中 ${d.ranking.rank}位相当</div>
      <div class="note">※整備スコア(/100)とは別の指標です。口コミ数・評価などから算出した「近隣同業内での知名度の相対値」を示します。</div>
      ${d.ranking.competitors.slice(0, 3).map(c =>
        `<div class="comp">${esc(c.name)} ★${c.rating ?? "-"} / 口コミ${c.reviews}<span>知名度 ${c.index}</span></div>`).join("")}
      <div class="comp you">${esc(d.name)}<small> (自店)</small><span>知名度 ${d.prominence}</span></div>
    </div>` : `
    <div class="glass"><div class="g-head"><span class="g-ico">📊</span>検索評価（想定）</div>
      <div class="note">※整備スコア(/100)とは別の指標です。口コミ数・評価などから算出した知名度の相対値です。</div>
      <div class="comp you">${esc(d.name)}<small> (自店)</small><span>知名度指数 ${d.prominence}</span></div></div>`;

  $("result-view").innerHTML = `
    <div class="report-title"><span class="g-ico">📋</span>診断結果レポート</div>
    <div class="report-sub">${esc(d.name)} ／ ${esc(d.area)}</div>

    <div class="report-grid">
      <div class="glass score-card">
        <div class="g-head"><span class="g-ico">🎯</span>総合スコア（整備度）</div>
        ${donutSVG(r.c)}
        <div class="rankbadge" style="background:${r.c}">${r.l}ランク<small>${r.label}</small></div>
      </div>
      <div class="glass">
        <div class="g-head"><span class="g-ico">💬</span>診断総評</div>
        <p class="verdict">${esc(verdictText(d))}</p>
      </div>
    </div>

    <div class="report-grid">
      <div class="glass">
        <div class="g-head"><span class="g-ico">⚖️</span>対策バランス</div>
        ${radarSVG(d.profile.categories)}
        <div class="note">特に「${esc(SHORT[weakestCat(d).key] || weakestCat(d).label)}」の対策が不足しています。ここを強化すると全体の底上げが期待できます。</div>
      </div>
      <div class="glass plan">
        <div class="g-head"><span class="g-ico">📝</span>今後のアクションプラン</div>
        <ul class="planlist">${plan}${lockedPlan}</ul>
        ${d.tipsLockedCount > 0 ? `<div class="subtle-cta"><a href="#">整った詳細レポートをメールで受け取る</a></div>` : ""}
      </div>
    </div>

    ${ranking}

    <div class="glass share">
      <div class="g-head"><span class="g-ico">📤</span>結果をシェア</div>
      <div class="share-btns">
        <button class="sh sh-native" onclick="shareNative()">スマホ / SNSで共有</button>
        <button class="sh sh-line" onclick="shareLine()">LINE</button>
        <button class="sh sh-x" onclick="shareX()">X</button>
        <button class="sh sh-copy" onclick="copyShare()">リンクをコピー</button>
      </div>
      <div id="sh-toast" class="sh-toast" hidden></div>
    </div>

    <div class="nav-btns">
      <button class="navbtn re" onclick="reSearch()">🔍 別の店舗を再調査</button>
      <button class="navbtn top" onclick="goTop()">🏠 TOPへ戻る</button>
    </div>

    <div class="foot">Supervised &amp; Powered by SearchMania ・ もっと詳しく改善したい方はこちら</div>`;

  // シェアデータ
  const url = location.origin + "/?" + new URLSearchParams({ name: d.name, area: d.area, compare: d._compare ? "1" : "0" }).toString();
  currentShare = { url, text: `${d.name} のMEO診断結果：整備スコア ${d.profile.total}点（${r.l}ランク）｜SearchMania MEO無料診断`, title: "MEO無料診断" };

  // アニメ起動
  countUp($("dnum"), d.profile.total);
  requestAnimationFrame(() => {
    const ring = document.querySelector(".donut-val");
    if (ring) { const C = parseFloat(ring.getAttribute("stroke-dasharray")); ring.style.strokeDashoffset = (C * (1 - d.profile.total / 100)).toFixed(1); }
    const rv = document.querySelector(".radar-val"); if (rv) rv.classList.add("in");
  });
}

function countUp(el, target) {
  if (!el) return;
  let v = 0; const step = Math.max(1, Math.round(target / 40));
  const t = setInterval(() => { v += step; if (v >= target) { v = target; clearInterval(t); } el.textContent = v; }, 25);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

/* ===== シェア ===== */
window.shareNative = async () => {
  if (navigator.share) { try { await navigator.share(currentShare); } catch (e) {} }
  else { copyShare(); }
};
window.shareLine = () => { window.open("https://line.me/R/msg/text/?" + encodeURIComponent(currentShare.text + "\n" + currentShare.url), "_blank"); };
window.shareX = () => { window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(currentShare.text) + "&url=" + encodeURIComponent(currentShare.url), "_blank"); };
window.copyShare = async () => {
  try { await navigator.clipboard.writeText(currentShare.url); toast("リンクをコピーしました"); }
  catch (e) { toast("コピーに失敗しました"); }
};
function toast(msg) { const t = $("sh-toast"); if (!t) return; t.textContent = msg; t.hidden = false; setTimeout(() => { t.hidden = true; }, 2000); }

/* ===== ナビゲーション ===== */
window.reSearch = () => backToTop(false); // 入力値を残して再調査
window.goTop = () => backToTop(true);      // 入力をクリアしてTOPへ
function backToTop(clear) {
  hide("result-view"); show("input-view");
  if (clear) { $("f-name").value = ""; $("f-area").value = ""; $("f-compare").checked = true; }
  $("err").hidden = true;
  resetTurnstile();
  if (location.search) history.replaceState(null, "", location.pathname); // 共有URLの再自動実行を防ぐ
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ===== 共有URLから自動実行 ===== */
(function initFromQuery() {
  const p = new URLSearchParams(location.search);
  const name = p.get("name"), area = p.get("area");
  if (!name || !area) return;
  $("f-name").value = name;
  $("f-area").value = area;
  if (p.get("compare") === "0") $("f-compare").checked = false;
  let tries = 0;
  const iv = setInterval(() => {
    if (turnstileToken) { clearInterval(iv); $("go").click(); }
    else if (++tries > 30) { clearInterval(iv); }
  }, 300);
})();
