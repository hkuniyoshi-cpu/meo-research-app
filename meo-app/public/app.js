let turnstileToken = "";
window.onTurnstile = (t) => { turnstileToken = t; };

const $ = (id) => document.getElementById(id);
const show = (id) => { $(id).hidden = false; };
const hide = (id) => { $(id).hidden = true; };

const LOAD_TARGET_MS = 20000; // 待ち時間の目安（約20秒）。1〜2分にしたい場合はここを増やす
const LOAD_MIN_MS = 7000;     // 最低表示時間（速くてもこの時間は演出を見せる）
const LOAD_STEPS = ["店舗をGoogleマップで特定中…", "基本情報（NAP）を照合中…", "写真・口コミ・属性を解析中…", "近隣の競合を取得・比較中…", "整備スコア＆知名度を算出中…", "レポートを生成中…"];
const SHORT = { nap: "基本情報", category: "カテゴリ", reviews: "口コミ", photos: "写真", hours: "最新性", extras: "付加情報" };

let currentShare = { url: "", text: "", title: "MEO無料診断" };
let currentResult = null;

$("go").addEventListener("click", async () => {
  const name = $("f-name").value.trim();
  const area = $("f-area").value.trim();
  const compare = $("f-compare").checked;
  $("err").hidden = true;
  if (!name || !area) { showErr("事業名と住所/エリアを入力してください"); return; }

  hide("input-view"); show("loading-view");
  window.scrollTo({ top: 0, behavior: "smooth" });
  const loader = startLoader();

  try {
    const resp = await fetch("/api/diagnose", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, area, compare, turnstileToken }),
    });
    const data = await resp.json();
    if (!resp.ok) { loader.cancel(); backToInput(errMessage(data.error)); return; }
    data._compare = compare;
    await loader.finish();
    renderResult(data);
    hide("loading-view"); show("result-view");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    loader.cancel(); backToInput("通信に失敗しました。時間をおいて再度お試しください");
  }
});

/* ===== リッチローディング（進捗バー＋待ち時間目安＋段階チェック） ===== */
function startLoader() {
  const bar = $("load-bar"), pctEl = $("load-pct"), etaEl = $("load-eta"), txt = $("loading-text");
  const stepEls = Array.from(document.querySelectorAll("#load-steps li"));
  stepEls.forEach(el => el.classList.remove("done", "active"));
  const start = performance.now();
  let done = false, raf;
  function frame() {
    const el = performance.now() - start;
    const p = done ? 100 : Math.min(96, (el / LOAD_TARGET_MS) * 100);
    bar.style.width = p.toFixed(1) + "%";
    pctEl.textContent = Math.floor(p) + "%";
    if (done) etaEl.textContent = "完了！";
    else if (el >= LOAD_TARGET_MS) etaEl.textContent = "もうすぐ完了…";
    else etaEl.textContent = "残り 約" + Math.max(1, Math.ceil((LOAD_TARGET_MS - el) / 1000)) + "秒";
    txt.textContent = LOAD_STEPS[Math.min(LOAD_STEPS.length - 1, Math.floor(p / (100 / LOAD_STEPS.length)))];
    stepEls.forEach((s, i) => {
      const top = (i + 1) / stepEls.length * 100, bot = i / stepEls.length * 100;
      s.classList.toggle("done", p >= top);
      s.classList.toggle("active", p < top && p >= bot);
    });
    if (!(done && p >= 100)) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return {
    cancel() { cancelAnimationFrame(raf); },
    async finish() {
      const el = performance.now() - start;
      if (el < LOAD_MIN_MS) await new Promise(r => setTimeout(r, LOAD_MIN_MS - el));
      done = true;
      await new Promise(r => setTimeout(r, 650));
      cancelAnimationFrame(raf);
    },
  };
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
function healthOf(t) {
  if (t >= 80) return { icon: "🟢", sky: "☀️", label: "絶好調", c: "#34A853" };
  if (t >= 60) return { icon: "🟡", sky: "⛅", label: "あと一歩", c: "#FBBC05" };
  return { icon: "🔴", sky: "🌧", label: "要対策", c: "#EA4335" };
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
  const health = healthOf(d.profile.total);
  const benchPct = d.ranking ? Math.max(1, Math.round(d.ranking.rank / d.ranking.total * 100)) : null;

  const BADGE = { high: { t: "最優先", cls: "pri-high" }, mid: { t: "推奨", cls: "pri-mid" }, info: { t: "ヒント", cls: "pri-info" } };
  const plan = d.tipsVisible.map((t) => {
    const b = BADGE[t.level] || BADGE.mid;
    return `<li><div class="tip-head"><span class="pri ${b.cls}">${b.t}</span><b>${esc(t.title)}</b></div><div class="tip-detail">${esc(t.detail)}</div></li>`;
  }).join("");
  const lockedPlan = d.tipsLockedCount > 0
    ? `<li class="more">＋ほか${d.tipsLockedCount}項目の改善で、さらに上位が狙えます</li>` : "";

  // 実データ補足チップ（Outscraper enrichmentがある時のみ）
  const chips = [];
  if (d.verified === true) chips.push(`<span class="chip ok">✓ オーナー認証済み</span>`);
  else if (d.verified === false) chips.push(`<span class="chip warn">未認証の可能性</span>`);
  if (d.photosCount != null) {
    const rec = d.recPhotos || 50;
    const okP = d.photosCount >= rec;
    chips.push(`<span class="chip ${okP ? "ok" : "warn"}">📷 写真 ${d.photosCount}枚${okP ? " ✓" : `（推奨${rec}枚〜）`}</span>`);
  }
  if (d.latestPostDays != null) chips.push(`<span class="chip">📣 最終投稿 ${d.latestPostDays}日前</span>`);
  if (d.reviewActivity && d.reviewActivity.latestDays != null) {
    const a = d.reviewActivity;
    const okR = a.latestDays <= 60;
    chips.push(`<span class="chip ${okR ? "ok" : "warn"}">🔎 直近クチコミ 最新${a.latestDays}日前${a.monthlyPace != null ? ` / 月${a.monthlyPace}件ペース` : ""}</span>`);
  }
  const chipsHTML = chips.length ? `<div class="chips">${chips.join("")}</div>` : "";

  // 今後の見通し（予測）— 店ごとに弱点・数値が変わる具体予測
  const pr = d.prediction;
  const gapNames = (pr?.topGaps || []).map(g => `「${SHORT[g.key] || g.label}」（+${g.gain}点）`);
  const predHTML = pr ? `
    <div class="glass">
      <div class="g-head"><span class="g-ico">🔮</span>今後の見通し（予測）</div>
      <div class="note">あなたの店の現状データから算出した目安です（実際の結果を保証するものではありません）。</div>
      <ul class="predlist">
        ${pr.scoreGain > 0 && gapNames.length
          ? `<li><b>整備スコアの伸びしろ：+${pr.scoreGain}点</b>（${d.profile.total}点 → <b>${pr.potentialScore}点</b>）<br>特に伸びるのは ${gapNames.join("・")}。ここを埋めるのが最短ルートです。</li>`
          : pr.scoreGain > 0
            ? `<li><b>整備スコアの伸びしろ：+${pr.scoreGain}点</b>（${d.profile.total}点 → <b>${pr.potentialScore}点</b>）まで引き上げられる見込みです。</li>`
            : `<li><b>整備度は上位水準</b>：現在${d.profile.total}点を維持すれば、上位表示を保ちやすい状態です。</li>`}
        ${pr.nextRank
          ? `<li><b>順位アップの射程：あと知名度${pr.nextRank.gap}ポイント</b><br>現在 近隣同業${pr.nextRank.total}店中${pr.nextRank.rank}位。1つ上の店との知名度差は${pr.nextRank.gap}pt${pr.monthlyPace ? `。月${pr.monthlyPace}件のクチコミ獲得を続ければ射程圏内です。` : "。クチコミと最新情報の強化で詰められます。"}</li>`
          : ""}
        ${pr.reviewIn6m != null
          ? `<li><b>クチコミの将来予測</b>：現在${pr.reviewNow}件・月${pr.monthlyPace}件ペース → <b>半年後 約${pr.reviewIn6m}件</b>${pr.nextMilestone && pr.monthsToMilestone != null ? `。この調子なら<b>約${pr.monthsToMilestone}ヶ月で${pr.nextMilestone}件の大台</b>に到達します。` : "。"}</li>`
          : pr.nextMilestone != null
            ? `<li><b>クチコミの目標設定</b>：現在${pr.reviewNow}件。次の節目は<b>${pr.nextMilestone}件</b>。月◯件の獲得計画を立てると到達時期が見えてきます。</li>`
            : ""}
      </ul>
    </div>` : "";

  // ✨ あなたの店の強み（高スコアのカテゴリ＋良好な実データ）
  const strong = [];
  [...d.profile.categories].sort((a, b) => (b.score / b.max) - (a.score / a.max))
    .forEach(c => { if (c.score / c.max >= 0.8) strong.push(SHORT[c.key] || c.label); });
  if (d.verified === true) strong.push("オーナー認証済み");
  if (d.photosCount != null && d.photosCount >= (d.recPhotos || 200)) strong.push("写真が充実");
  if (d.reviewActivity && d.reviewActivity.latestDays != null && d.reviewActivity.latestDays <= 30) strong.push("クチコミが新しい");
  const strongHTML = strong.length ? `
    <div class="glass strengths-card">
      <div class="g-head"><span class="g-ico">✨</span>あなたの店の強み</div>
      <div class="str-tags">${strong.slice(0, 6).map(s => `<span class="str-tag">${esc(s)}</span>`).join("")}</div>
      <div class="note">これらは維持しつつ、クチコミ・投稿で積極的にアピールすると効果的です。</div>
    </div>` : "";

  // 🎚 効果シミュレーター（改善項目をトグルで想定スコアが動く）
  const simCats = d.profile.categories.filter(c => c.score / c.max < 0.85);
  const simHTML = simCats.length ? `
    <div class="glass">
      <div class="g-head"><span class="g-ico">🎚</span>効果シミュレーター</div>
      <div class="note">改善したい項目をチェックすると、想定スコアがその場で変わります。</div>
      <div class="sim-score">想定スコア <b id="sim-val">${d.profile.total}</b><small> / 100</small></div>
      <div class="sim-opts">
        ${simCats.map(c => `<label class="sim-opt"><input type="checkbox" class="sim-cb" data-gain="${((0.85 - c.score / c.max) * c.max).toFixed(2)}"><span>${esc(SHORT[c.key] || c.label)}を改善</span></label>`).join("")}
      </div>
    </div>` : "";


  const compRow = (name, rating, reviews, index, isYou) => `
    <div class="comp ${isYou ? "you" : ""}">
      <div class="comp-top"><span class="comp-name">${esc(name)}${isYou ? ' <small>(調査対象)</small>' : ""}</span><span class="comp-idx">知名度 ${index}</span></div>
      ${(rating != null || reviews != null) ? `<div class="comp-meta">${rating != null ? `★${rating}` : ""}${reviews != null ? ` ・ クチコミ${reviews}件` : ""}</div>` : ""}
      <div class="comp-bar"><i data-w="${Math.max(4, Math.min(100, index))}"></i></div>
    </div>`;
  const ranking = d.ranking ? `
    <div class="glass">
      <div class="g-head"><span class="g-ico">📊</span>検索評価（想定）— 近隣${d.ranking.total}件中 ${d.ranking.rank}位相当</div>
      <div class="note">※整備スコア(/100)とは別の指標です。口コミ数・評価などから算出した「近隣同業内での知名度の相対値」を示します。</div>
      ${compRow(d.name, null, null, d.prominence, true)}
      ${d.ranking.competitors.slice(0, 7).map(c => compRow(c.name, c.rating, c.reviews, c.index, false)).join("")}
    </div>` : `
    <div class="glass"><div class="g-head"><span class="g-ico">📊</span>検索評価（想定）</div>
      <div class="note">※整備スコア(/100)とは別の指標です。口コミ数・評価などから算出した知名度の相対値です。</div>
      ${compRow(d.name, null, null, d.prominence, true)}</div>`;

  $("result-view").innerHTML = `
    <div class="report-title"><span class="g-ico">📋</span>診断結果レポート</div>
    <div class="report-sub">${esc(d.name)} ／ ${esc(d.area)}</div>
    ${d.investigatedAt ? `<div class="report-date">📅 調査日 ${esc(d.investigatedAt)}（最新調査サイクルの結果）</div>` : ""}
    ${chipsHTML}
    ${d.investigatedAt ? `<div class="freshness-note">※「最終投稿」「直近クチコミ」など最新の動きは、データ更新の都合で数日〜数週間前の状態を表示する場合があります（Googleの各種レポートと同様）。最新の実状況はGoogleマップでご確認ください。</div>` : ""}

    <div class="report-grid">
      <div class="glass score-card">
        <div class="g-head"><span class="g-ico">🎯</span>総合スコア（整備度）</div>
        ${donutSVG(r.c)}
        <div class="rankbadge" style="background:${r.c}">${r.l}ランク<small>${r.label}</small></div>
        <div class="health" style="border-color:${health.c}55"><span class="health-ico">${health.icon}${health.sky}</span>MEO健康度：<b style="color:${health.c}">${health.label}</b></div>
        ${benchPct != null ? `<div class="benchmark">🏆 近隣同業 ${d.ranking.total}店中 <b>上位${benchPct}%</b>（${d.ranking.rank}位相当）</div>` : ""}
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

    ${strongHTML}

    ${ranking}

    ${predHTML}

    ${simHTML}

    <div class="glass share">
      <div class="g-head"><span class="g-ico">📤</span>結果をシェア</div>
      <div class="share-btns">
        <button class="sh sh-native" onclick="shareNative()">スマホ / SNSで共有</button>
        <button class="sh sh-img" onclick="saveImage()">🖼 画像で保存</button>
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

    <div class="foot">Supervised &amp; Powered by <a href="https://search-mania.net/" target="_blank" rel="noopener">SearchMania</a> ・ <a href="https://search-mania.net/" target="_blank" rel="noopener">もっと詳しく改善したい方はこちら</a></div>`;

  // シェアデータ
  const url = location.origin + "/?" + new URLSearchParams({ name: d.name, area: d.area, compare: d._compare ? "1" : "0" }).toString();
  currentShare = { url, text: `${d.name} のMEO診断結果：整備スコア ${d.profile.total}点（${r.l}ランク）｜SearchMania MEO無料診断`, title: "MEO無料診断" };

  // アニメ起動
  countUp($("dnum"), d.profile.total);
  requestAnimationFrame(() => {
    const ring = document.querySelector(".donut-val");
    if (ring) { const C = parseFloat(ring.getAttribute("stroke-dasharray")); ring.style.strokeDashoffset = (C * (1 - d.profile.total / 100)).toFixed(1); }
    const rv = document.querySelector(".radar-val"); if (rv) rv.classList.add("in");
    document.querySelectorAll(".comp-bar i").forEach(el => { el.style.width = el.dataset.w + "%"; });
  });

  // 🎚 効果シミュレーターのライブ更新
  const simBase = d.profile.total;
  document.querySelectorAll(".sim-cb").forEach(cb => cb.addEventListener("change", () => {
    let s = simBase;
    document.querySelectorAll(".sim-cb:checked").forEach(c => s += parseFloat(c.dataset.gain));
    const el = document.getElementById("sim-val"); if (el) el.textContent = Math.min(100, Math.round(s));
  }));
  currentResult = d;
}

/* 🖼 結果カード画像を生成して保存/共有 */
function roundRect(x, a, b, w, h, r) {
  x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}
window.saveImage = () => {
  const d = currentResult; if (!d) return;
  const cv = document.createElement("canvas"); cv.width = 1080; cv.height = 1080;
  const x = cv.getContext("2d");
  const g = x.createLinearGradient(0, 0, 1080, 1080);
  g.addColorStop(0, "#e9f3ff"); g.addColorStop(1, "#c2dcff");
  x.fillStyle = g; x.fillRect(0, 0, 1080, 1080);
  x.textAlign = "center";
  x.fillStyle = "#1a73e8"; x.font = "bold 42px sans-serif"; x.fillText("MEO診断結果レポート", 540, 120);
  x.fillStyle = "#13294b"; x.font = "bold 50px sans-serif"; x.fillText(d.name.slice(0, 18), 540, 200);
  x.fillStyle = "#3a5a85"; x.font = "28px sans-serif"; x.fillText(d.area, 540, 248);
  const r = rankOf(d.profile.total);
  x.beginPath(); x.arc(540, 470, 150, 0, Math.PI * 2); x.lineWidth = 30; x.strokeStyle = "rgba(120,160,210,.25)"; x.stroke();
  x.beginPath(); x.lineCap = "round"; x.arc(540, 470, 150, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (d.profile.total / 100)); x.lineWidth = 30; x.strokeStyle = r.c; x.stroke();
  x.fillStyle = r.c; x.font = "bold 120px sans-serif"; x.fillText(String(d.profile.total), 540, 505);
  x.fillStyle = "#8aa3c2"; x.font = "30px sans-serif"; x.fillText("/ 100", 540, 560);
  x.fillStyle = r.c; roundRect(x, 400, 615, 280, 74, 20); x.fill();
  x.fillStyle = "#fff"; x.font = "bold 40px sans-serif"; x.fillText(`${r.l}ランク ${r.label}`, 540, 666);
  x.textAlign = "left"; x.fillStyle = "#1c3a63"; x.font = "32px sans-serif";
  const stats = [];
  const bench = d.ranking ? `近隣同業 上位${Math.max(1, Math.round(d.ranking.rank / d.ranking.total * 100))}%` : null;
  if (bench) stats.push("🏆 " + bench);
  if (d.verified) stats.push("✓ オーナー認証済み");
  if (d.photosCount != null) stats.push(`📷 写真 ${d.photosCount}枚`);
  if (d.reviewActivity && d.reviewActivity.latestDays != null) stats.push(`🔎 直近クチコミ ${d.reviewActivity.latestDays}日前`);
  stats.slice(0, 4).forEach((s, i) => x.fillText(s, 200, 770 + i * 56));
  x.textAlign = "center"; x.fillStyle = "#1a73e8"; x.font = "bold 32px sans-serif";
  x.fillText("SearchMania ・ search-mania.net", 540, 1020);
  cv.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], "MEO診断.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: "MEO診断結果" }).catch(() => {});
    } else {
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "MEO診断_" + d.name + ".png"; a.click();
      toast("画像を保存しました");
    }
  });
};

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

/* ===== 背景：Googleカラーのネットワークアニメ ===== */
(function bgNetwork() {
  const cv = document.getElementById("bg-net");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const COLORS = ["#4285F4", "#EA4335", "#FBBC05", "#34A853"];
  let w, h, pts;
  function resize() {
    w = cv.width = window.innerWidth;
    h = cv.height = window.innerHeight;
    const n = Math.max(28, Math.min(72, Math.floor(w * h / 24000)));
    pts = Array.from({ length: n }, (_, i) => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
      c: COLORS[i % COLORS.length],
    }));
  }
  function loop() {
    ctx.clearRect(0, 0, w, h);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j], dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
        if (d < 140) {
          ctx.globalAlpha = (1 - d / 140) * 0.4;
          ctx.strokeStyle = a.c; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 0.85;
    for (const p of pts) { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, 6.3); ctx.fill(); }
    requestAnimationFrame(loop);
  }
  window.addEventListener("resize", resize);
  resize(); loop();
})();
