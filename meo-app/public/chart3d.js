/* 項目別診断の3D棒グラフ。
   分野ごとに1列、項目ごとに1本の棒を立て、高さを達成率（0〜100%）にする。
   100%（＝良好の基準）の高さに半透明の「目標面」を張り、届いていない分は同じ色の半透明の棒で示す。
   判定なし・不明の項目は点線の枠だけを立てる。
   app.js から import() で必要になったときだけ読み込む（three は index.html の importmap で解決）。 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

const COLORS = { good: 0x22b07d, warn: 0xf2a33a, bad: 0xe5534b, na: 0x9aa4b5 };
const CAT_ORDER = ["nap", "category", "reviews", "photos", "hours", "extras"];
const H = 4.2;        // 達成率100%の高さ
const COL = 1.15;     // 棒の間隔（横）
const GAP = 0.85;     // 分野と分野の間（横）
const BAR = 0.78;     // 棒の太さ
const BG = 0xf3f6fb;

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

/**
 * @param {HTMLElement} host 描画先
 * @param {{id:string,cat:string,status:string,rate:number|null,label:string,val:string,gap:string}[]} entries 項目
 * @param {{catLabels:Record<string,string>, onPick:(id:string)=>void,
 *          text:{hint:string,hintTouch:string,rotate:string,rotateDone:string,zoomIn:string,zoomOut:string,target:string}}} opts
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

    // ---- 並び ----
    // 横長（PC）は16本を左から右へ1段に、縦長（スマホ）は分野2つずつ3段に並べる。分野の間は少し空ける
    const groups = CAT_ORDER.map((k) => ({ key: k, items: entries.filter((e) => e.cat === k) })).filter((g) => g.items.length);
    const wide = host.clientWidth / Math.max(1, host.clientHeight) >= 1.4;
    const lanes = wide ? [groups] : [groups.slice(0, 2), groups.slice(2, 4), groups.slice(4)].filter((l) => l.length);
    // 正面やや上から見下ろす。スマホ（3段）は高めの角度にして、手前の棒が奥の段に重ならない間隔を取る
    const EL = wide ? 0.42 : 1.0, AZ = wide ? 0.28 : 0.1;
    const LANE = H / Math.tan(EL) + 2.0; // 棒の上の値ラベルぶんも空ける
    const laneWidth = (lane) => lane.reduce((s, g) => s + g.items.length * COL, 0) + (lane.length - 1) * GAP;
    const width = Math.max(...lanes.map(laneWidth));
    const depth = (lanes.length - 1) * LANE + BAR;
    const place = []; // { group, entry, x, z }
    lanes.forEach((lane, li) => {
      const z = (li - (lanes.length - 1) / 2) * LANE;
      let x = -laneWidth(lane) / 2 + COL / 2;
      lane.forEach((g) => {
        const gx0 = x;
        g.items.forEach((e) => { place.push({ group: g, entry: e, x, z }); x += COL; });
        g.cx = (gx0 + x - COL) / 2; g.z = z;
        x += GAP;
      });
    });

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
    const target = new THREE.Vector3(0, H * 0.42, 0);
    const viewDir = new THREE.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL));
    camera.position.copy(target).addScaledVector(viewDir, 20);

    // ---- 光 ----
    scene.add(new THREE.HemisphereLight(0xffffff, 0xbac8dc, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-8, 16, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
    const sh = Math.max(width, depth) / 2 + 3;
    Object.assign(sun.shadow.camera, { left: -sh, right: sh, top: sh, bottom: -sh, near: 1, far: 60 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    // ---- 床と目盛り ----
    const pad = 1.0;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(width + pad * 2 + 1.4, 0.16, depth + pad * 2 + 0.8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
    floor.position.set(0.5, -0.08, 0.2);
    floor.receiveShadow = true;
    scene.add(floor);

    // 奥の壁に 25/50/75/100% の目盛り線
    const wallZ = -depth / 2 - pad;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width + 2.4, H + 0.7), new THREE.MeshStandardMaterial({ color: 0xf7f9fd, roughness: 1, side: THREE.DoubleSide }));
    wall.position.set(-0.3, (H + 0.7) / 2, wallZ);
    wall.receiveShadow = true;
    scene.add(wall);
    const tickPts = [];
    for (const p of [0.25, 0.5, 0.75, 1]) {
      const y = p * H;
      tickPts.push(-width / 2 - 1.4, y, wallZ + 0.01, width / 2 + 0.8, y, wallZ + 0.01);
      const d = document.createElement("div");
      d.className = "c3-tick" + (p === 1 ? " c3-tick-goal" : "");
      d.textContent = p === 1 ? `100%（${opts.text.target}）` : `${p * 100}%`;
      const o = new CSS2DObject(d);
      o.position.set(-width / 2 - 1.5, y, wallZ); // 左端に目盛りの数字（右端は画面外に出やすい）
      o.center.set(1, 0.5);
      scene.add(o);
    }
    const ticks = new THREE.BufferGeometry();
    ticks.setAttribute("position", new THREE.Float32BufferAttribute(tickPts, 3));
    scene.add(new THREE.LineSegments(ticks, new THREE.LineBasicMaterial({ color: 0xcfd9e7 })));

    // 目標面（100%の高さ）
    const gw = width + 0.6, gd = depth + 0.6;
    const goal = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), new THREE.MeshBasicMaterial({ color: 0x1a73e8, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
    goal.rotation.x = -Math.PI / 2;
    goal.position.set(0, H, 0);
    scene.add(goal);
    const goalEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(gw, gd)),
      new THREE.LineDashedMaterial({ color: 0x1a73e8, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.65 }));
    goalEdge.rotation.x = -Math.PI / 2;
    goalEdge.position.set(0, H, 0);
    goalEdge.computeLineDistances();
    scene.add(goalEdge);

    // 分野名：各グループの手前の床に置く
    groups.forEach((g) => {
      const rl = document.createElement("div");
      rl.className = "c3-lbl c3-row";
      rl.textContent = opts.catLabels[g.key] || g.key;
      const o = new CSS2DObject(rl);
      o.position.set(g.cx, 0.05, g.z + BAR / 2 + 0.55);
      scene.add(o);
    });

    // ---- 棒 ----
    const bars = []; // { mesh, ghost, entry, h, delay, label, static }
    place.forEach(({ entry: e, x, z }) => {
        const color = new THREE.Color(COLORS[e.status] ?? COLORS.na);
        const unknown = e.rate == null;
        let mesh, ghost = null;
        if (unknown) {
          // 判定なし・不明：点線の枠だけ（高さは目標まで）
          const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(BAR, H, BAR));
          edges.translate(0, H / 2, 0);
          mesh = new THREE.LineSegments(edges, new THREE.LineDashedMaterial({ color, dashSize: 0.16, gapSize: 0.12 }));
          mesh.computeLineDistances();
          // タップ判定用の見えない箱
          const hit = new THREE.Mesh(new THREE.BoxGeometry(BAR, H, BAR).translate(0, H / 2, 0), new THREE.MeshBasicMaterial({ visible: false }));
          hit.userData.entry = e;
          hit.position.set(x, 0, z);
          scene.add(hit);
          bars.push({ mesh: hit, entry: e, h: H, delay: 0, pick: true, static: true });
          const base = new THREE.Mesh(new THREE.BoxGeometry(BAR, 0.05, BAR), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
          base.position.set(x, 0.025, z);
          scene.add(base);
        } else {
          const h = Math.max(0.06, e.rate * H);
          const geo = new THREE.BoxGeometry(BAR, h, BAR);
          geo.translate(0, h / 2, 0);
          const side = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 });
          const top = new THREE.MeshStandardMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.3), roughness: 0.35 });
          mesh = new THREE.Mesh(geo, [side, side, top, side, side, side]);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          // 目標までの不足分：同じ色の半透明の棒を上に重ねる
          if (e.rate < 1) {
            const gh = H - h;
            const gg = new THREE.BoxGeometry(BAR * 0.98, gh, BAR * 0.98);
            gg.translate(0, h + gh / 2, 0);
            ghost = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.16, roughness: 0.6, depthWrite: false }));
            const ge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(BAR * 0.98, gh, BAR * 0.98).translate(0, h + gh / 2, 0)),
              new THREE.LineDashedMaterial({ color, dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0.8 }));
            ge.computeLineDistances();
            ghost.add(ge);
            ghost.position.set(x, 0, z);
            scene.add(ghost);
          }
          mesh.userData.entry = e;
          mesh.position.set(x, 0, z);
          scene.add(mesh);
          bars.push({ mesh, ghost, entry: e, h, delay: bars.length * 55, pick: true });
        }
        if (unknown) { mesh.position.set(x, 0, z); scene.add(mesh); }

        // 値ラベル：良好でない項目は常に、良好はホバー時のみ
        const lv = document.createElement("div");
        lv.className = `c3-val c3-val-${e.status}`;
        lv.textContent = e.val;
        const lo = new CSS2DObject(lv);
        lo.position.set(x, (unknown ? H : Math.max(0.06, e.rate * H)) + 0.25, z);
        lo.center.set(0.5, 1);
        lo.visible = e.status === "warn" || e.status === "bad";
        scene.add(lo);
        bars[bars.length - 1].label = lo;
    });

    // ---- 操作（回転・ズーム） ----
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = false; // ホイールはページのスクロールに使う。ズームはボタンで
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = 1.35;
    controls.minAzimuthAngle = -1.2; // グラフとして読める範囲に回転を制限（裏側に回り込まない）
    controls.maxAzimuthAngle = 1.2;
    controls.update();
    cleanups.push(() => controls.dispose());
    let fitDist = 20, desiredDist = 20, userZoomed = false;

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
      desiredDist = Math.min(fitDist * 1.5, Math.max(fitDist * 0.5, desiredDist * (b.dataset.z === "in" ? 0.82 : 1.22)));
    }));
    const rotBtn = ui.querySelector(".c3-rot");
    if (rotBtn) rotBtn.addEventListener("click", () => {
      const on = !controls.enabled;
      setInteractive(on);
      rotBtn.textContent = on ? opts.text.rotateDone : opts.text.rotate;
    });
    const hint = document.createElement("div");
    hint.className = "c3-hint";
    hint.textContent = touch ? opts.text.hintTouch : opts.text.hint;
    host.appendChild(hint);
    const tip = document.createElement("div");
    tip.className = "c3-tip";
    tip.hidden = true;
    host.appendChild(tip);

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
        if (!hovered.static) hovered.mesh.material.forEach((x) => x.emissive.setHex(0x000000));
        hovered.label.visible = hovered.entry.status === "warn" || hovered.entry.status === "bad";
      }
      hovered = b;
      if (b) {
        if (!b.static) b.mesh.material.forEach((x) => x.emissive.copy(x.color).multiplyScalar(0.25));
        b.label.visible = true;
      }
      renderer.domElement.style.cursor = b ? "pointer" : "";
    };
    let down = null;
    const el = renderer.domElement;
    // 押してから離すまでに一度でも6px以上動いたら、回転操作とみなしてクリックにしない。
    // 2本以上の指が触れた操作（拡大・回転）も、すべての指が離れるまでタップにしない
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
      if (ev.pointerType !== "mouse" || ev.buttons) { tip.hidden = true; return; }
      const b = pick(ev);
      setHover(b);
      if (b) {
        const e = b.entry;
        const r = host.getBoundingClientRect();
        tip.textContent = "";
        const t1 = document.createElement("b"); t1.textContent = e.label;
        const t2 = document.createElement("span"); t2.textContent = e.val;
        tip.append(t1, t2);
        if (e.gap) { const t3 = document.createElement("small"); t3.textContent = e.gap; tip.append(t3); }
        tip.style.left = `${Math.min(ev.clientX - r.left + 14, r.width - 230)}px`;
        tip.style.top = `${ev.clientY - r.top + 12}px`;
        tip.hidden = false;
      } else tip.hidden = true;
    };
    const onLeave = () => { setHover(null); tip.hidden = true; };
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

    // ---- 伸びる演出（最初に描画したときから） ----
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
      camera.fov = 34;
      camera.updateProjectionMatrix();
      // 全体がちょうど収まる距離（横幅と高さの両方を満たす方）
      const v = THREE.MathUtils.degToRad(camera.fov) / 2;
      const hz = Math.atan(Math.tan(v) * camera.aspect);
      fitDist = Math.max((width / 2 + 2.6) / Math.tan(hz), ((depth + 2) * Math.sin(EL) + H * Math.cos(EL)) / 2 / Math.tan(v) + 1.5);
      if (!userZoomed) desiredDist = fitDist;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    cleanups.push(() => ro.disconnect());
    resize();

    // ---- 描画ループ（画面外・タブ非表示のときは止める） ----
    const offset = new THREE.Vector3();
    const loop = (now) => {
      try { frame(now); } catch (err) {
        // 描画中に失敗したら3Dをやめ、呼び出し元に知らせる（一覧表示に切り替えてもらう）
        api.dispose();
        if (opts.onError) opts.onError(err);
      }
    };
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
