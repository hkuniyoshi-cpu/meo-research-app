/* 項目別診断の3D表示。
   地図風の地面の中央に店舗のピンを立て、そのまわりに6分野の区画を輪のように並べる。
   区画には項目ごとにシンプルな棒を立て、高さを達成率（0〜100%）にする。
   目標（100%＝良好の基準）まで届いていない分は同じ色の半透明の棒で示し、判定なし・不明は点線の枠だけを立てる。
   app.js から import() で必要になったときだけ読み込む（three は index.html の importmap で解決）。 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const COLORS = { good: 0x22b07d, warn: 0xf2a33a, bad: 0xe5534b, na: 0x9aa4b5 };
const CAT_ORDER = ["nap", "category", "reviews", "photos", "hours", "extras", "site"]; // site=ホームページ側（Googleの登録ではない）
const H = 3.2;        // 達成率100%の高さ
const STEP = 1.0;     // 棒の間隔
const BAR = 0.62;     // 棒の太さ
const RING = 5.6;     // 区画を並べる円の半径
const MAP_R = 18;     // 地面（地図）の半径
const BG = 0xeef2f7;

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

// 文字列から決まった乱数列を作る（同じ店なら毎回同じ地図になる）
function seededRandom(text) {
  let h = 2166136261;
  for (const ch of String(text || "meo")) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  let s = h >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

/** 地図風の地面の模様（道路・街区・建物の形・公園・水辺）。実在の地図ではない。 */
function mapTexture(seed) {
  const N = 2048;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d");
  const rnd = seededRandom(seed);

  g.fillStyle = "#edf0f4"; g.fillRect(0, 0, N, N);
  g.save();
  g.translate(N / 2, N / 2);
  g.rotate((rnd() - 0.5) * 0.7); // 街並みの向きを店ごとに少し変える
  g.translate(-N / 2, -N / 2);

  // 道路の位置（少しずつ間隔をずらす）
  const lines = (from, to) => { const a = []; for (let p = from; p < to; p += 105 + rnd() * 70) a.push(p); return a; };
  const xs = lines(-400, N + 400), ys = lines(-400, N + 400);

  // 街区と建物の形
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const x = xs[i] + 9, y = ys[j] + 9, w = xs[i + 1] - xs[i] - 18, h = ys[j + 1] - ys[j] - 18;
    if (w < 20 || h < 20) continue;
    g.fillStyle = "#f6f7f9"; g.fillRect(x, y, w, h);
    const n = 2 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const bw = 14 + rnd() * (w * 0.45), bh = 14 + rnd() * (h * 0.45);
      g.fillStyle = rnd() < 0.5 ? "#e4e8ee" : "#e9ecf1";
      g.fillRect(x + 4 + rnd() * Math.max(1, w - bw - 8), y + 4 + rnd() * Math.max(1, h - bh - 8), bw, bh);
    }
  }
  // 公園
  for (let k = 0; k < 6; k++) {
    const i = Math.floor(rnd() * (xs.length - 1)), j = Math.floor(rnd() * (ys.length - 1));
    g.fillStyle = "#d9edd5";
    g.fillRect(xs[i] + 9, ys[j] + 9, xs[i + 1] - xs[i] - 18, ys[j + 1] - ys[j] - 18);
  }
  // 細い道（縁取り→中）
  const road = (x1, y1, x2, y2, w, edge, fill) => {
    g.lineCap = "round";
    g.strokeStyle = edge; g.lineWidth = w + 4; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = fill; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  };
  for (const x of xs) road(x, -400, x, N + 400, 12, "#dfe3e9", "#ffffff");
  for (const y of ys) road(-400, y, N + 400, y, 12, "#dfe3e9", "#ffffff");
  // 幹線道路（黄色）と斜めの道
  const mx = xs[Math.floor(xs.length / 2) + 1], my = ys[Math.floor(ys.length / 2) - 1];
  road(mx, -400, mx, N + 400, 26, "#e8d48f", "#fcefc0");
  road(-400, my, N + 400, my, 26, "#e8d48f", "#fcefc0");
  road(-200, N * (0.2 + rnd() * 0.3), N + 200, N * (0.55 + rnd() * 0.3), 18, "#e0e4ea", "#ffffff");
  g.restore();

  // 水辺（端の一辺を海・川にする）
  g.fillStyle = "#c6dcf2";
  g.beginPath();
  const base = N * (0.8 + rnd() * 0.08);
  g.moveTo(0, N);
  for (let x = 0; x <= N; x += 32) g.lineTo(x, base + Math.sin(x / 140 + rnd()) * 28 + Math.sin(x / 47) * 9);
  g.lineTo(N, N);
  g.closePath();
  g.fill();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {HTMLElement} host 描画先
 * @param {{id:string,cat:string,status:string,rate:number|null,label:string,val:string,gap:string}[]} entries 項目
 * @param {{catLabels:Record<string,string>, youLabel:string, seed:string, onPick:(id:string)=>void, onError?:(e:unknown)=>void,
 *          text:{hint:string,hintTouch:string,rotate:string,rotateDone:string,zoomIn:string,zoomOut:string}}} opts
 */
export function mountChart(host, entries, opts) {
  try {
    return buildChart(host, entries, opts);
  } catch (err) {
    host.replaceChildren(); // 作りかけの描画領域を消す（レンダラーは buildChart 内で解放済み）
    throw err;
  }
}

function buildChart(host, entries, opts) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = matchMedia("(pointer: coarse)").matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  // 作った順に片付け処理を積む（初期化の途中で失敗しても、そこまでに作った分を片付けられる）
  const cleanups = [];
  const runCleanups = () => { while (cleanups.length) { try { cleanups.pop()(); } catch (e) {} } };
  try {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touch ? 1.5 : 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "c3-canvas";
    host.appendChild(renderer.domElement);

    const labels = new CSS2DRenderer();
    labels.domElement.className = "c3-labels";
    host.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.Fog(BG, 22, 40);

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 11.5, 15);

    // ---- 光 ----
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb6c6dc, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(9, 15, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    // ---- 地図風の地面 ----
    const mapTex = mapTexture(opts.seed);
    mapTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const ground = new THREE.Mesh(new THREE.CircleGeometry(MAP_R, 96), new THREE.MeshStandardMaterial({ map: mapTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ---- 中央の店舗（ピン・波紋） ----
    const pinMat = new THREE.MeshStandardMaterial({ color: 0x1a73e8, roughness: 0.35, metalness: 0.1 });
    const pin = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), pinMat);
    head.position.y = 2.25; head.castShadow = true;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 32), pinMat);
    tip.rotation.x = Math.PI; tip.position.y = 1.62; tip.castShadow = true;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    dot.position.set(0, 2.25, 0.36);
    pin.add(head, tip, dot);
    pin.scale.setScalar(1.25);
    scene.add(pin);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), new THREE.MeshBasicMaterial({ color: 0x1a73e8, transparent: true, opacity: 0.16 }));
    spot.rotation.x = -Math.PI / 2; spot.position.y = 0.02;
    scene.add(spot);
    const pulse = new THREE.Mesh(new THREE.RingGeometry(1, 1.1, 64), new THREE.MeshBasicMaterial({ color: 0x1a73e8, transparent: true, side: THREE.DoubleSide }));
    pulse.rotation.x = -Math.PI / 2; pulse.position.y = 0.03;
    scene.add(pulse);
    const youDiv = document.createElement("div");
    youDiv.className = "c3-lbl c3-you";
    youDiv.textContent = opts.youLabel;
    const youLbl = new CSS2DObject(youDiv);
    youLbl.position.set(0, 3.9, 0);
    scene.add(youLbl);

    // ---- 区画と棒 ----
    const bars = []; // { mesh, ghost, entry, delay, label, static }
    const groups = CAT_ORDER.map((k) => ({ key: k, items: entries.filter((e) => e.cat === k) })).filter((g) => g.items.length);
    groups.forEach((g, gi) => {
      const n = g.items.length;
      const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
      const rows = Math.ceil(n / cols);
      const w = cols * STEP + 0.5, d = rows * STEP + 0.5;
      const ang = -Math.PI / 2 + (gi / groups.length) * Math.PI * 2;
      const cx = Math.cos(ang) * RING, cz = Math.sin(ang) * RING;

      // 区画（地図の上に置いた半透明の白い台）
      // ホームページ側の区画は、Googleの登録項目と区別できるよう色を変える
      const isSite = g.key === "site";
      const plate = new THREE.Mesh(new RoundedBoxGeometry(w, 0.1, d, 2, 0.08), new THREE.MeshStandardMaterial({ color: isSite ? 0xc9b8ef : 0xffffff, transparent: true, opacity: 0.88, roughness: 0.6 }));
      plate.position.set(cx, 0.05, cz);
      plate.receiveShadow = true;
      scene.add(plate);
      const lblDiv = document.createElement("div");
      lblDiv.className = isSite ? "c3-lbl c3-lbl-site" : "c3-lbl";
      lblDiv.textContent = opts.catLabels[g.key] || g.key;
      const lbl = new CSS2DObject(lblDiv);
      lbl.position.set(cx, 0.1, cz + d / 2 + 0.4);
      scene.add(lbl);

      g.items.forEach((e, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const x = cx - w / 2 + 0.25 + STEP / 2 + col * STEP;
        const z = cz - d / 2 + 0.25 + STEP / 2 + row * STEP;
        const color = new THREE.Color(COLORS[e.status] ?? COLORS.na);
        const unknown = e.rate == null;
        let top;
        if (unknown) {
          // 判定なし・不明：点線の枠だけ（高さは目標まで）＋タップ判定用の見えない箱
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(BAR, H, BAR).translate(0, H / 2, 0)),
            new THREE.LineDashedMaterial({ color, dashSize: 0.14, gapSize: 0.1 }));
          edges.computeLineDistances();
          edges.position.set(x, 0.1, z);
          scene.add(edges);
          const hit = new THREE.Mesh(new THREE.BoxGeometry(BAR, H, BAR).translate(0, H / 2, 0), new THREE.MeshBasicMaterial({ visible: false }));
          hit.position.set(x, 0.1, z);
          scene.add(hit);
          bars.push({ mesh: hit, entry: e, delay: 0, static: true });
          top = H;
        } else {
          const h = Math.max(0.08, e.rate * H);
          const geo = new RoundedBoxGeometry(BAR, h, BAR, 2, Math.min(0.08, h / 2.2));
          geo.translate(0, h / 2, 0); // 根元を原点にして、高さ方向に伸ばす演出をしやすくする
          const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.04 }));
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.position.set(x, 0.1, z);
          scene.add(mesh);
          let ghost = null;
          if (e.rate < 1) {
            // 目標までの不足分：同じ色の半透明の棒＋点線の枠
            const gh = H - h;
            ghost = new THREE.Mesh(new THREE.BoxGeometry(BAR * 0.97, gh, BAR * 0.97).translate(0, h + gh / 2, 0),
              new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.16, roughness: 0.6, depthWrite: false }));
            const ge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(BAR * 0.97, gh, BAR * 0.97).translate(0, h + gh / 2, 0)),
              new THREE.LineDashedMaterial({ color, dashSize: 0.12, gapSize: 0.09, transparent: true, opacity: 0.85 }));
            ge.computeLineDistances();
            ghost.add(ge);
            ghost.position.set(x, 0.1, z);
            scene.add(ghost);
          }
          bars.push({ mesh, ghost, entry: e, delay: bars.length * 55 });
          top = h;
        }
        // 値ラベル：良好でない項目は常に、良好はホバー時のみ
        const lv = document.createElement("div");
        lv.className = `c3-val c3-val-${e.status}`;
        lv.textContent = e.val;
        const lo = new CSS2DObject(lv);
        lo.position.set(x, 0.1 + top + 0.22, z);
        lo.center.set(0.5, 1);
        lo.visible = e.status === "warn" || e.status === "bad";
        scene.add(lo);
        bars[bars.length - 1].label = lo;
      });
    });

    // ---- 操作（回転・ズーム） ----
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.8, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = false; // ホイールはページのスクロールに使う。ズームはボタンで
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = 1.25;
    controls.autoRotate = !reduced;
    controls.autoRotateSpeed = 0.5;
    controls.update();
    cleanups.push(() => controls.dispose());
    controls.addEventListener("start", () => { controls.autoRotate = false; });
    const baseDist = camera.position.distanceTo(controls.target);
    let fitDist = baseDist, desiredDist = baseDist, userZoomed = false;

    const setInteractive = (on) => {
      controls.enabled = on;
      renderer.domElement.style.touchAction = on ? "none" : "pan-y";
      host.classList.toggle("c3-active", on);
    };
    setInteractive(!touch); // スマホは「回して見る」を押したときだけ回転（指のスクロールを奪わない）

    const ui = document.createElement("div");
    ui.className = "c3-ui";
    ui.innerHTML = `
      <button type="button" class="c3-btn" data-z="in" aria-label="${opts.text.zoomIn}">＋</button>
      <button type="button" class="c3-btn" data-z="out" aria-label="${opts.text.zoomOut}">－</button>
      ${touch ? `<button type="button" class="c3-btn c3-rot">${opts.text.rotate}</button>` : ""}`;
    host.appendChild(ui);
    ui.querySelectorAll("[data-z]").forEach((b) => b.addEventListener("click", () => {
      userZoomed = true;
      desiredDist = Math.min(fitDist * 1.5, Math.max(fitDist * 0.45, desiredDist * (b.dataset.z === "in" ? 0.82 : 1.22)));
      controls.autoRotate = false;
    }));
    const rotBtn = ui.querySelector(".c3-rot");
    if (rotBtn) rotBtn.addEventListener("click", () => {
      const on = !controls.enabled;
      setInteractive(on);
      rotBtn.textContent = on ? opts.text.rotateDone : opts.text.rotate;
      controls.autoRotate = false;
    });
    const hint = document.createElement("div");
    hint.className = "c3-hint";
    hint.textContent = touch ? opts.text.hintTouch : opts.text.hint;
    host.appendChild(hint);
    const tip2 = document.createElement("div");
    tip2.className = "c3-tip";
    tip2.hidden = true;
    host.appendChild(tip2);

    // ---- タップ・ホバー ----
    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    const pickables = bars.map((b) => b.mesh);
    const barOf = new Map(bars.map((b) => [b.mesh, b]));
    const pick = (ev) => {
      const r = renderer.domElement.getBoundingClientRect();
      ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      const hit = ray.intersectObjects(pickables, false)[0];
      return hit ? barOf.get(hit.object) : null;
    };
    let hovered = null;
    const setHover = (b) => {
      if (hovered === b) return;
      if (hovered) {
        if (!hovered.static) hovered.mesh.material.emissive.setHex(0x000000);
        hovered.label.visible = hovered.entry.status === "warn" || hovered.entry.status === "bad";
      }
      hovered = b;
      if (b) {
        if (!b.static) b.mesh.material.emissive.copy(b.mesh.material.color).multiplyScalar(0.25);
        b.label.visible = true;
      }
      renderer.domElement.style.cursor = b ? "pointer" : "";
    };
    let down = null;
    const el = renderer.domElement;
    // 押してから離すまでに一度でも6px以上動いたら、回転操作とみなしてクリックにしない。
    // 2本以上の指が触れた操作も、すべての指が離れるまでタップにしない
    const active = new Set();
    let multi = false;
    const onDown = (ev) => {
      active.add(ev.pointerId);
      if (active.size > 1) multi = true;
      down = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: performance.now(), moved: false };
    };
    const onUp = (ev) => {
      active.delete(ev.pointerId);
      if (multi) { if (active.size === 0) multi = false; down = null; return; }
      if (!down || down.id !== ev.pointerId) return;
      const moved = down.moved || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6;
      const quick = performance.now() - down.t < 600;
      down = null;
      if (moved || !quick) return;
      const b = pick(ev);
      if (b) opts.onPick(b.entry.id);
    };
    const onMove = (ev) => {
      if (down && down.id === ev.pointerId && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) down.moved = true;
      if (ev.pointerType !== "mouse" || ev.buttons) { tip2.hidden = true; return; }
      const b = pick(ev);
      setHover(b);
      if (b) {
        const e = b.entry;
        const r = host.getBoundingClientRect();
        tip2.textContent = "";
        const t1 = document.createElement("b"); t1.textContent = e.label;
        const t2 = document.createElement("span"); t2.textContent = e.val;
        tip2.append(t1, t2);
        if (e.gap) { const t3 = document.createElement("small"); t3.textContent = e.gap; tip2.append(t3); }
        tip2.style.left = `${Math.min(ev.clientX - r.left + 14, r.width - 230)}px`;
        tip2.style.top = `${ev.clientY - r.top + 12}px`;
        tip2.hidden = false;
      } else tip2.hidden = true;
    };
    const onLeave = () => { setHover(null); tip2.hidden = true; };
    const onCancel = (ev) => { active.delete(ev.pointerId); if (active.size === 0) multi = false; down = null; };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointercancel", onCancel);
    cleanups.push(() => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointercancel", onCancel);
    });

    // ---- 伸びる演出（最初に画面へ描画したときから） ----
    let t0 = 0;
    const growing = bars.filter((b) => !b.static);
    growing.forEach((b) => { b.mesh.scale.y = reduced ? 1 : 0.001; if (b.ghost) b.ghost.visible = reduced; });
    let introDone = reduced;

    // ---- サイズ ----
    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = w + "px";
      renderer.domElement.style.height = h + "px";
      labels.setSize(w, h);
      camera.aspect = w / h;
      camera.fov = w / h < 0.9 ? 48 : 36; // 縦長（スマホ）は画角を広げて全体を入れる
      camera.updateProjectionMatrix();
      // 回転しても全区画が横に収まる距離（区画の外周＋ラベルの余白）。縦長の画面ほど引く
      const hz = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
      fitDist = Math.max(baseDist, (RING + 2.6) / Math.tan(hz) + 1.5);
      if (!userZoomed) desiredDist = fitDist;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    cleanups.push(() => ro.disconnect());
    resize();

    // ---- 描画ループ（画面外・タブ非表示のときは止める） ----
    const offset = new THREE.Vector3();
    const frame = (now) => {
      if (!introDone) {
        if (!t0) t0 = now;
        let all = true;
        for (const b of growing) {
          const k = Math.min(1, Math.max(0, (now - t0 - b.delay) / 800));
          b.mesh.scale.y = Math.max(0.001, easeOutCubic(k));
          if (b.ghost) b.ghost.visible = k >= 1;
          if (k < 1) all = false;
        }
        if (all) introDone = true;
      }
      if (!reduced) {
        pin.position.y = Math.sin(now / 520) * 0.12;
        const p = (now % 2400) / 2400;
        pulse.scale.setScalar(1 + p * 1.8);
        pulse.material.opacity = 0.6 * (1 - p);
      }
      offset.copy(camera.position).sub(controls.target);
      const dist = offset.length();
      if (Math.abs(dist - desiredDist) > 0.01) {
        offset.setLength(dist + (desiredDist - dist) * 0.15);
        camera.position.copy(controls.target).add(offset);
      }
      controls.update();
      renderer.render(scene, camera);
      labels.render(scene, camera);
    };
    const loop = (now) => {
      try { frame(now); } catch (err) {
        // 描画中に失敗したら3Dをやめ、呼び出し元に知らせる（一覧表示に切り替えてもらう）
        api.dispose();
        if (opts.onError) opts.onError(err);
      }
    };
    let visible = false;
    const sync = () => renderer.setAnimationLoop(visible && !document.hidden ? loop : null);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }, { threshold: 0.01 });
    io.observe(host);
    document.addEventListener("visibilitychange", sync);
    cleanups.push(() => { io.disconnect(); document.removeEventListener("visibilitychange", sync); });

    let disposed = false;
    const api = {
      dispose() {
        if (disposed) return;
        disposed = true;
        renderer.setAnimationLoop(null);
        runCleanups();
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
          mats.forEach((m) => m.dispose());
        });
        mapTex.dispose();
        renderer.dispose();
        host.replaceChildren();
      },
    };
    return api;
  } catch (err) {
    renderer.setAnimationLoop(null);
    runCleanups();
    renderer.dispose();
    throw err;
  }
}
