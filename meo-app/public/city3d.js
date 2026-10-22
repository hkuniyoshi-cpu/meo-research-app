/* 項目別診断の3D表示（「あなたの店の街」）。
   16項目を建物にし、良好なほど高く建てる。分野ごとに区画を分け、中央に店舗のピンを立てる。
   app.js から import() で必要になったときだけ読み込む（three は index.html の importmap で解決）。 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

const COLORS = { good: 0x22b07d, warn: 0xf2a33a, bad: 0xe5534b, na: 0xb7bfcc };
const HEIGHT = { good: 2.6, warn: 1.5, bad: 0.55, na: 0.06 };
const CAT_ORDER = ["nap", "category", "reviews", "photos", "hours", "extras"];
const STEP = 1.25;   // 建物の間隔
const RING = 5.4;    // 区画を並べる円の半径
const BG = 0xf2f6fb;

// 建物の壁に貼る窓の模様（白地に窓。マテリアルの色と掛け合わせて使う）
function windowTexture() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#cdd6e2";
  for (const x of [10, 36]) g.fillRect(x, 14, 18, 22);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const easeOutBack = (x) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

/**
 * @param {HTMLElement} host 描画先
 * @param {{id:string,cat:string,status:string,label:string,val:string}[]} entries 項目
 * @param {{catLabels:Record<string,string>, youLabel:string, onPick:(id:string)=>void,
 *          text:{hint:string,hintTouch:string,rotate:string,rotateDone:string,zoomIn:string,zoomOut:string}}} opts
 */
export function mountCity(host, entries, opts) {
  try {
    return buildCity(host, entries, opts);
  } catch (err) {
    // 作りかけの描画領域を消す（レンダラーは buildCity 内で失敗時に解放済み）
    host.replaceChildren();
    throw err;
  }
}

function buildCity(host, entries, opts) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = matchMedia("(pointer: coarse)").matches;

  // ---- レンダラー ----
  const renderer = new THREE.WebGLRenderer({ antialias: true });
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
  camera.position.set(0, 12, 15.5);

  // ---- 光 ----
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb6c6dc, 1.05));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(9, 15, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // ---- 地面 ----
  const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ color: 0xe6edf6, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(32, 32, 0xd3deec, 0xdbe4f0);
  grid.position.y = 0.005;
  grid.material.transparent = true; grid.material.opacity = 0.7;
  scene.add(grid);

  // ---- 中央の店舗（広場・ピン・波紋） ----
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.14, 48), new THREE.MeshStandardMaterial({ color: 0xdbe8fb, roughness: 0.8 }));
  plaza.position.y = 0.07; plaza.receiveShadow = true;
  scene.add(plaza);
  const pin = new THREE.Group();
  const pinMat = new THREE.MeshStandardMaterial({ color: 0x1a73e8, roughness: 0.35, metalness: 0.1 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), pinMat);
  head.position.y = 2.25; head.castShadow = true;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 32), pinMat);
  tip.rotation.x = Math.PI; tip.position.y = 1.62; tip.castShadow = true;
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
  dot.position.set(0, 2.25, 0.36);
  pin.add(head, tip, dot);
  pin.scale.setScalar(1.3);
  scene.add(pin);
  const pulse = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 48), new THREE.MeshBasicMaterial({ color: 0x1a73e8, transparent: true, side: THREE.DoubleSide }));
  pulse.rotation.x = -Math.PI / 2; pulse.position.y = 0.16;
  scene.add(pulse);
  const youDiv = document.createElement("div");
  youDiv.className = "c3-lbl c3-you";
  youDiv.textContent = opts.youLabel;
  const youLbl = new CSS2DObject(youDiv);
  youLbl.position.set(0, 4.2, 0);
  scene.add(youLbl);

  // ---- 区画と建物 ----
  const tex = windowTexture();
  const buildings = []; // { mesh, id, entry, delay }
  const byCat = CAT_ORDER.map((k) => ({ key: k, items: entries.filter((e) => e.cat === k) })).filter((c) => c.items.length);
  byCat.forEach((cat, ci) => {
    const n = cat.items.length;
    const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const w = cols * STEP + 0.55, d = rows * STEP + 0.55;
    const ang = -Math.PI / 2 + (ci / byCat.length) * Math.PI * 2;
    const cx = Math.cos(ang) * RING, cz = Math.sin(ang) * RING;

    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }));
    slab.position.set(cx, 0.09, cz);
    slab.receiveShadow = true;
    scene.add(slab);

    const lblDiv = document.createElement("div");
    lblDiv.className = "c3-lbl";
    lblDiv.textContent = opts.catLabels[cat.key] || cat.key;
    const lbl = new CSS2DObject(lblDiv);
    lbl.position.set(cx, 0.2, cz + d / 2 + 0.45);
    scene.add(lbl);

    cat.items.forEach((e, i) => {
      const h = HEIGHT[e.status] ?? HEIGHT.na;
      const color = new THREE.Color(COLORS[e.status] ?? COLORS.na);
      const geo = new THREE.BoxGeometry(0.92, h, 0.92);
      geo.translate(0, h / 2, 0); // 根元を原点にして、高さ方向に伸ばす演出をしやすくする
      const side = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.04 });
      if (e.status !== "na") {
        const t = tex.clone();
        t.repeat.set(1, Math.max(1, Math.round(h / 0.55)));
        t.needsUpdate = true;
        side.map = t;
      }
      const top = new THREE.MeshStandardMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.28), roughness: 0.4 });
      const mesh = new THREE.Mesh(geo, [side, side, top, side, side, side]);
      const col = i % cols, row = Math.floor(i / cols);
      mesh.position.set(cx - w / 2 + 0.275 + STEP / 2 + col * STEP, 0.18, cz - d / 2 + 0.275 + STEP / 2 + row * STEP);
      mesh.castShadow = e.status !== "na";
      mesh.receiveShadow = true;
      mesh.userData.entry = e;
      scene.add(mesh);
      buildings.push({ mesh, entry: e, delay: buildings.length * 70 });
    });
  });

  // ---- 操作（回転・ズーム） ----
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.6, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false; // ホイールはページのスクロールに使う。ズームはボタンで
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.22;
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = 0.55;
  controls.update();
  let desiredDist = camera.position.distanceTo(controls.target);
  const MIN_DIST = 9, MAX_DIST = 27;

  // スマホは「回して見る」を押したときだけ回転操作を受け付ける（指のスクロールを奪わない）
  const setInteractive = (on) => {
    controls.enabled = on;
    renderer.domElement.style.touchAction = on ? "none" : "pan-y";
    host.classList.toggle("c3-active", on);
  };
  setInteractive(!touch);
  controls.addEventListener("start", () => { controls.autoRotate = false; });

  // ---- 操作パネル ----
  const ui = document.createElement("div");
  ui.className = "c3-ui";
  ui.innerHTML = `
    <button type="button" class="c3-btn" data-z="in" aria-label="${opts.text.zoomIn}">＋</button>
    <button type="button" class="c3-btn" data-z="out" aria-label="${opts.text.zoomOut}">－</button>
    ${touch ? `<button type="button" class="c3-btn c3-rot">${opts.text.rotate}</button>` : ""}`;
  host.appendChild(ui);
  ui.querySelectorAll("[data-z]").forEach((b) => b.addEventListener("click", () => {
    desiredDist = Math.min(MAX_DIST, Math.max(MIN_DIST, desiredDist * (b.dataset.z === "in" ? 0.8 : 1.25)));
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

  // ---- 建物のタップ・ホバー ----
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const meshes = buildings.map((b) => b.mesh);
  const pick = (ev) => {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit ? hit.object : null;
  };
  let hovered = null;
  const setHover = (m) => {
    if (hovered === m) return;
    if (hovered) hovered.material.forEach((x) => x.emissive.setHex(0x000000));
    hovered = m;
    if (m) m.material.forEach((x) => x.emissive.copy(x.color).multiplyScalar(0.22));
    renderer.domElement.style.cursor = m ? "pointer" : "";
  };
  let down = null;
  const el = renderer.domElement;
  // 押してから離すまでに一度でも6px以上動いたら、回転操作とみなしてクリックにしない
  const onDown = (ev) => { down = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: performance.now(), moved: false }; };
  const onUp = (ev) => {
    if (!down || down.id !== ev.pointerId) return;
    const moved = down.moved || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6;
    const quick = performance.now() - down.t < 600;
    down = null;
    if (moved || !quick) return;
    const m = pick(ev);
    if (m) opts.onPick(m.userData.entry.id);
  };
  const onMove = (ev) => {
    if (down && down.id === ev.pointerId && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) down.moved = true;
    if (ev.pointerType !== "mouse" || ev.buttons) { tip2.hidden = true; return; }
    const m = pick(ev);
    setHover(m);
    if (m) {
      const e = m.userData.entry;
      const r = host.getBoundingClientRect();
      tip2.textContent = `${e.label}　${e.val}`;
      tip2.style.left = `${ev.clientX - r.left + 14}px`;
      tip2.style.top = `${ev.clientY - r.top + 10}px`;
      tip2.hidden = false;
    } else tip2.hidden = true;
  };
  const onLeave = () => { setHover(null); tip2.hidden = true; };
  const onCancel = () => { down = null; };
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerleave", onLeave);
  el.addEventListener("pointercancel", onCancel);

  // ---- 建ち上がりの演出 ----
  let t0 = 0; // 最初に画面へ描画したときから建ち上がりを始める
  buildings.forEach((b) => { b.mesh.scale.y = reduced ? 1 : 0.001; });
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
    // 縦長（スマホ）では引きで写して全体が入るようにする
    camera.fov = w / h < 0.9 ? 48 : 36;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  // 縦長（スマホ）は最初から少し引いて、区画が端で切れないようにする
  if (host.clientWidth / Math.max(1, host.clientHeight) < 0.9) desiredDist = 21;

  // ---- 描画ループ（画面外・タブ非表示のときは止める） ----
  const offset = new THREE.Vector3();
  const loop = (now) => {
    if (!introDone) {
      if (!t0) t0 = now;
      let all = true;
      for (const b of buildings) {
        const k = Math.min(1, Math.max(0, (now - t0 - b.delay) / 750));
        b.mesh.scale.y = Math.max(0.001, easeOutBack(k));
        if (k < 1) all = false;
      }
      if (all) { buildings.forEach((b) => { b.mesh.scale.y = 1; }); introDone = true; }
    }
    if (!reduced) {
      pin.position.y = Math.sin(now / 520) * 0.12;
      const p = (now % 2200) / 2200;
      pulse.scale.setScalar(1 + p * 1.6);
      pulse.material.opacity = 0.55 * (1 - p);
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
  let visible = false;
  const sync = () => renderer.setAnimationLoop(visible && !document.hidden ? loop : null);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }, { threshold: 0.01 });
  io.observe(host);
  document.addEventListener("visibilitychange", sync);

  return {
    dispose() {
      renderer.setAnimationLoop(null);
      io.disconnect(); ro.disconnect();
      document.removeEventListener("visibilitychange", sync);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointercancel", onCancel);
      controls.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
      tex.dispose();
      renderer.dispose();
      host.replaceChildren();
    },
  };
  } catch (err) {
    renderer.setAnimationLoop(null);
    renderer.dispose();
    throw err;
  }
}
