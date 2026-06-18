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
    upstream_error: "データ取得に失敗しました。時間をおいて再度お試しください",
  })[code] || "診断に失敗しました";
}

function renderResult(d) {
  const cats = d.profile.categories.map(c =>
    `<div class="cat">${esc(c.label)}<div class="bar"><i data-w="${Math.round(c.score / c.max * 100)}"></i></div></div>`
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
