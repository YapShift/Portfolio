/**
 * YapShift 3D Studio Engine (app-engine.js v21.0)
 * 1. 修复模型切换（移除导致 WebGL 挂起的 visibility: hidden）
 * 2. 模型自转转台（直接旋转模型根节点，绝不锁定或干扰用户相机！）
 * 3. 部件独显隔离模式（选中只显示所选部件，未选中时全显示）
 * 4. 零顿挫爆炸控制（拖动期间 55ms + easeLinear 匀速追踪，松手/一键按钮用 easeOutCubic 丝滑落位）
 * 5. Anime.js v4 风格精密点阵背景舞台
 */

const STUDIO_ASSETS = [
  {
    id: 'yapshift-suspention',
    title: '机械悬挂系统总成',
    sub: 'Suspention Assembly',
    category: 'MECHANICAL / HARD-SURFACE',
    uid: '08632550c5604444a14b53dc339b6589',
    desc: '精密避震弹簧、上下控制臂与轴承座装配总成，支持防碰撞六向正交拆解、工程线性排布与独立部件隔离。',
    tags: ['Hard-Surface', 'Multi-Part', 'PBR Metal'],
    workflow: [
      { step: '01', title: '六向正交立体拆解', tag: '65%', action: 'explode65', desc: '沿上下左右前后正交推开，AABB 方框碰撞自动避让。' },
      { step: '02', title: '工程一字线性排布', tag: 'QUEUE', action: 'linear65', desc: '沿水平主轴展开全部零件，一览装配清单。' },
      { step: '03', title: 'X-Ray 内腔透视', tag: 'X-RAY', action: 'xray', desc: '切换 28% 半透明态，直视内部活塞杆与轴套配合。' }
    ]
  },
  {
    id: 'yapshift-stylized-rock-lod',
    title: '风格化岩石 5 级 LOD',
    sub: 'Stylized Rock · 5 Versions',
    category: 'GAME OPTIMIZATION / 5-LOD',
    uid: 'f9963591aa36459b9837b7a9ca411438',
    desc: '同屏对比从高精到极简远景的 5 级阶梯减面（LOD0–LOD4），极低面数下完整保留法线与剪影。',
    tags: ['5-Level LOD', 'Normal Bake', 'Stylized PBR'],
    workflow: [
      { step: '01', title: '5 级 LOD 拓扑线框对比', tag: 'WIRE', action: 'wire', desc: '叠加暖铜色拓扑线框，直观检视 5 级面数递减。' },
      { step: '02', title: '雕塑灰模法线检视', tag: 'CLAY', action: 'clay', desc: '屏蔽色彩贴图，纯光影检验法线凹凸与剪影一致性。' },
      { step: '03', title: 'Albedo 纯色手绘检视', tag: 'ALBEDO', action: 'albedo', desc: '剥离光影阴影，纯粹检视岩石边缘磨损与色彩关系。' }
    ]
  }
];

const STUDIO_SHADERS = [
  { id: 'rendered', label: 'PBR',   rgb: '224, 90, 43' },
  { id: 'clay',     label: '灰模',   rgb: '212, 212, 216' },
  { id: 'wire',     label: '线框',   rgb: '224, 90, 43' },
  { id: 'xray',     label: 'X-Ray', rgb: '148, 163, 184' },
  { id: 'albedo',   label: '纯色',   rgb: '228, 228, 231' }
];

window.Bus = {
  listeners: {},
  on(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); },
  emit(event, payload) { (this.listeners[event] || []).forEach(fn => fn(payload)); }
};

/**
 * Anime.js v4 风格：高奢克制精密点阵舞台
 */
const AnimeGridStage = {
  canvas: null, ctx: null, w: 0, h: 0, dpr: 1,
  mouse: { x: -9999, y: -9999, tx: -9999, ty: -9999 },
  accentRGB: '224, 90, 43',
  explodeT: 0, targetExplodeT: 0,
  pausedUntil: 0, lastFrame: 0,

  init() {
    this.canvas = document.getElementById('anime-bg-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', (e) => {
      this.mouse.tx = e.clientX;
      this.mouse.ty = e.clientY;
    }, { passive: true });
    requestAnimationFrame((t) => this.loop(t));
  },

  resize() {
    if (!this.canvas) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  },

  setAccent(rgb) { this.accentRGB = rgb || '224, 90, 43'; },
  setExplodeProgress(t) { this.targetExplodeT = Math.max(0, Math.min(1, t)); },
  yieldToWebGL(ms = 220) { this.pausedUntil = Date.now() + ms; },

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    if (now - this.lastFrame < 33) return;
    if (Date.now() < this.pausedUntil) return;
    this.lastFrame = now;

    this.mouse.x += (this.mouse.tx - this.mouse.x) * 0.14;
    this.mouse.y += (this.mouse.ty - this.mouse.y) * 0.14;
    this.explodeT += (this.targetExplodeT - this.explodeT) * 0.12;
    this.draw();
  },

  draw() {
    const ctx = this.ctx, w = this.w, h = this.h;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.5, cy = h * 0.5;
    const rgb = this.accentRGB;

    // 1. 柔和摄影棚中心顶光
    const studioGlow = ctx.createRadialGradient(cx, cy, 30, cx, cy, Math.max(w, h) * 0.52);
    studioGlow.addColorStop(0, `rgba(${rgb}, ${0.055 + this.explodeT * 0.035})`);
    studioGlow.addColorStop(0.5, 'rgba(255, 255, 255, 0.015)');
    studioGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = studioGlow;
    ctx.fillRect(0, 0, w, h);

    // 2. 40px 精密工程点阵与每 4 格十字坐标标
    const spacing = 40;
    const cols = Math.ceil(w / spacing);
    const rows = Math.ceil(h / spacing);
    const mx = this.mouse.x, my = this.mouse.y;
    const interactR = 165;

    for (let r = 0; r <= rows; r++) {
      const baseY = r * spacing;
      for (let c = 0; c <= cols; c++) {
        const baseX = c * spacing;
        const dx = baseX - mx, dy = baseY - my;
        const dist = Math.hypot(dx, dy);
        const isMajor = (r % 4 === 0 && c % 4 === 0);

        let px = baseX, py = baseY;
        let alpha = isMajor ? 0.15 : 0.065;
        let mix = 0;

        if (dist < interactR) {
          mix = 1 - dist / interactR;
          const push = mix * mix * 5;
          if (dist > 1) { px += (dx / dist) * push; py += (dy / dist) * push; }
          alpha += mix * 0.42;
        }

        if (isMajor) {
          const s = 3 + mix * 1.8;
          ctx.strokeStyle = mix > 0.2 ? `rgba(${rgb}, ${alpha})` : `rgba(244, 244, 245, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px - s, py); ctx.lineTo(px + s, py);
          ctx.moveTo(px, py - s); ctx.lineTo(px, py + s);
          ctx.stroke();
        } else {
          ctx.fillStyle = mix > 0.25 ? `rgba(${rgb}, ${alpha})` : `rgba(244, 244, 245, ${alpha})`;
          ctx.beginPath();
          ctx.arc(px, py, 0.85 + mix * 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 3. 极简克制的呼吸同心参考线（随爆炸进度柔和扩张）
    const rMain = Math.min(w, h) * (0.30 + this.explodeT * 0.08);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.055 + this.explodeT * 0.05})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, rMain, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(${rgb}, ${0.12 + this.explodeT * 0.10})`;
    ctx.beginPath();
    ctx.arc(cx, cy, rMain * 0.72, -Math.PI * 0.18, Math.PI * 0.18);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, rMain * 0.72, Math.PI * 0.82, Math.PI * 1.18);
    ctx.stroke();
  }
};

class SketchfabPoolEngine {
  constructor() {
    this.poolContainer = document.getElementById('sketchfab-viewport-pool');
    this.instances = new Map();
    this.activeAssetId = null;
    this.mode = 'cardinal';
    this.autoSpinEnabled = true;
    this.startModelSpinLoop();
  }

  get activeCtx() { return this.instances.get(this.activeAssetId) || null; }
  get ready() { const ctx = this.activeCtx; return Boolean(ctx && ctx.ready); }

  async fetchRestMeta(uid) {
    try {
      const res = await fetch(`https://api.sketchfab.com/v3/models/${uid}`);
      if (!res.ok) return {};
      const d = await res.json();
      return { faceCount: d.faceCount, vertexCount: d.vertexCount };
    } catch { return {}; }
  }

  preloadAll(assets) {
    assets.forEach(asset => this.ensureInstance(asset));
  }

  getReadyCount() {
    let n = 0;
    this.instances.forEach(ctx => { if (ctx.ready) n++; });
    return n;
  }

  getZoomMultiplier(explodeVal) {
    const factor = (parseFloat(explodeVal) || 0) / 100;
    return 1 + factor * (this.mode === 'linear' ? 0.80 : 0.42);
  }

  syncCameraBaseline(ctx) {
    if (!ctx || !ctx.ready || !ctx.api) return;
    if (Date.now() < ctx.programmaticCamUntil) return;
    ctx.api.getCameraLookAt((err, cam) => {
      if (err || !cam) return;
      const zoomMult = this.getZoomMultiplier(ctx.explodeVal);
      ctx.baselineCam = {
        target: [cam.target[0], cam.target[1], cam.target[2]],
        baseVec: [
          (cam.position[0] - cam.target[0]) / zoomMult,
          (cam.position[1] - cam.target[1]) / zoomMult,
          (cam.position[2] - cam.target[2]) / zoomMult
        ]
      };
    });
  }

  ensureInstance(asset) {
    if (this.instances.has(asset.id)) return this.instances.get(asset.id);

    // 关键修复：绝不设置 visibility: hidden，否则第二个模型的 WebGL 会被浏览器挂起导致无法切换！
    const iframe = document.createElement('iframe');
    iframe.id = `sf-frame-${asset.id}`;
    iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;opacity:0;pointer-events:none;z-index:1;transition:opacity 0.25s ease;';
    iframe.setAttribute('allow', 'autoplay; fullscreen; xr-spatial-tracking');
    iframe.setAttribute('execution-while-out-of-viewport', '');
    iframe.setAttribute('execution-while-not-rendered', '');
    iframe.setAttribute('allowfullscreen', '');
    if (this.poolContainer) this.poolContainer.appendChild(iframe);

    const ctx = {
      asset, iframe, api: null, ready: false,
      parts: [], rootNodeIDs: [], materials: [],
      strategy: '', collisionBadge: '', polys: 0, verts: 0,
      camScale: 0.85, baselineCam: null, explodeVal: 0, shaderMode: 'rendered', lightDeg: 0,
      spinAngle: 0,
      selectedParts: new Set(), // 部件独显隔离集合（为空则全显示，非空则只显示选中的）
      programmaticCamUntil: 0,
      explodingUntil: 0
    };
    this.instances.set(asset.id, ctx);

    const metaPromise = this.fetchRestMeta(asset.uid);
    if (typeof Sketchfab === 'undefined') return ctx;

    const client = new Sketchfab('1.12.1', iframe);
    client.init(asset.uid, {
      autostart: 1, preload: 1, ui_theme: 'dark', ui_infos: 0, ui_controls: 0, ui_watermark: 0, transparent: 1,
      success: (api) => {
        ctx.api = api;
        api.start();
        api.addEventListener('viewerready', () => {
          ctx.ready = true;

          api.addEventListener('cameraend', () => {
            if (Date.now() >= ctx.programmaticCamUntil) {
              this.syncCameraBaseline(ctx);
            }
          });

          api.getCameraLookAt((err, cam) => {
            if (!err && cam) {
              const vx = cam.position[0] - cam.target[0];
              const vy = cam.position[1] - cam.target[1];
              const vz = cam.position[2] - cam.target[2];
              const dist = Math.hypot(vx, vy, vz);
              ctx.camScale = dist > 0.01 ? dist * 0.14 : 0.85;
              ctx.baselineCam = { target: [cam.target[0], cam.target[1], cam.target[2]], baseVec: [vx, vy, vz] };
            }

            api.getMaterialList((e1, mats) => {
              ctx.materials = (!e1 && mats) ? JSON.parse(JSON.stringify(mats)) : [];
              api.getNodeMap(async (e2, nodeMap) => {
                const res = SceneGraphMath.analyzeAndBuildVectors(e2 ? null : nodeMap, ctx.camScale);
                ctx.parts = res.parts;
                ctx.rootNodeIDs = res.rootNodeIDs;
                ctx.strategy = res.strategy;
                ctx.collisionBadge = res.collisionBadge;

                const meta = await metaPromise;
                ctx.polys = meta.faceCount || Math.max(12400, ctx.parts.length * 3650);
                ctx.verts = meta.vertexCount || Math.round(ctx.polys * 0.58);
                asset.loadedPolys = ctx.polys;

                Bus.emit('engine:preload-updated');
                if (this.activeAssetId === asset.id) Bus.emit('engine:ready', ctx);
              });
            });
          });
        });
      },
      error: () => {
        iframe.src = `https://sketchfab.com/models/${asset.uid}/embed?autostart=1&ui_theme=dark&transparent=1`;
        if (this.activeAssetId === asset.id) {
          document.getElementById('loading-overlay').classList.add('opacity-0', 'pointer-events-none');
        }
      }
    });

    return ctx;
  }

  selectModel(asset) {
    this.activeAssetId = asset.id;
    const targetCtx = this.ensureInstance(asset);

    this.instances.forEach((ctx, id) => {
      const active = id === asset.id;
      ctx.iframe.style.opacity = active ? '1' : '0';
      ctx.iframe.style.pointerEvents = active ? 'auto' : 'none';
      ctx.iframe.style.zIndex = active ? '10' : '1';
    });

    if (targetCtx.ready) Bus.emit('engine:ready', targetCtx);
    else Bus.emit('engine:loading');
  }

  /**
   * ✅ 不锁相机的模型自转转台：
   * 直接旋转模型的最顶层 MatrixTransform 根节点，绝不调用 setCameraLookAt，
   * 用户任何时候都可以自由拖拽、缩放、平移镜头！
   */
  startModelSpinLoop() {
    setInterval(() => {
      const heroOverlay = document.getElementById('hero-overlay');
      if (heroOverlay && !heroOverlay.classList.contains('hidden')) return;

      const ctx = this.activeCtx;
      if (!ctx || !ctx.ready || !ctx.api || !this.autoSpinEnabled) return;
      if (Date.now() < ctx.explodingUntil) return;
      if (!ctx.rootNodeIDs || !ctx.rootNodeIDs.length) return;

      ctx.spinAngle = (ctx.spinAngle + 0.032) % (Math.PI * 2);
      ctx.rootNodeIDs.forEach(rootId => {
        ctx.api.rotate(rootId, [ctx.spinAngle, 0, 0, 1], { duration: 0.14, easing: 'easeLinear' });
      });
    }, 140);
  }

  toggleAutoSpin() {
    this.autoSpinEnabled = !this.autoSpinEnabled;
    return this.autoSpinEnabled;
  }

  captureBaseline(currentSliderVal) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return Promise.resolve();
    const zoomMult = this.getZoomMultiplier(currentSliderVal);
    return new Promise((resolve) => {
      ctx.api.getCameraLookAt((err, cam) => {
        if (!err && cam) {
          ctx.baselineCam = {
            target: [cam.target[0], cam.target[1], cam.target[2]],
            baseVec: [
              (cam.position[0] - cam.target[0]) / zoomMult,
              (cam.position[1] - cam.target[1]) / zoomMult,
              (cam.position[2] - cam.target[2]) / zoomMult
            ]
          };
        }
        resolve();
      });
    });
  }

  /**
   * ✅ 零顿挫爆炸控制：
   * 拖动时传入 easing = 'easeLinear', durationSec = 0.07（匀速无缝追踪，彻底消除快-慢锯齿顿挫）
   * 松手或点按钮时传入 easing = 'easeOutCubic', durationSec = 0.52（丝滑缓停落位）
   */
  explode(percent, adjustCam = true, durationSec = 0.45, easing = 'easeOutCubic') {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api || ctx.parts.length <= 1) return;

    ctx.explodeVal = parseFloat(percent) || 0;
    const now = Date.now();
    ctx.explodingUntil = now + durationSec * 1000 + 180;
    AnimeGridStage.setExplodeProgress(ctx.explodeVal / 100);
    AnimeGridStage.yieldToWebGL(180);

    const positions = SceneGraphMath.evaluateExplosionFrame(ctx.parts, ctx.explodeVal, this.mode);
    ctx.parts.forEach((p, idx) => {
      if (positions[idx]) {
        ctx.api.translate(p.instanceID, positions[idx], { duration: durationSec, easing });
      }
    });

    if (adjustCam && ctx.baselineCam) {
      const z = this.getZoomMultiplier(ctx.explodeVal);
      const t = ctx.baselineCam.target;
      const v = ctx.baselineCam.baseVec;
      ctx.programmaticCamUntil = now + durationSec * 1000 + 400;
      ctx.api.setCameraLookAt(
        [t[0] + v[0] * z, t[1] + v[1] * z, t[2] + v[2] * z],
        t,
        durationSec
      );
    }
  }

  /**
   * ✅ 部件独显隔离模式（Solo / Isolate）：
   * - 无选中部件 -> 显示全部零件
   * - 有选中部件 -> 隐藏其他所有零件，只显示选中的零件
   */
  toggleIsolatePart(idx) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api || !ctx.parts[idx]) return;
    if (ctx.selectedParts.has(idx)) ctx.selectedParts.delete(idx);
    else ctx.selectedParts.add(idx);
    this.applyPartIsolation(ctx);
  }

  showAllParts() {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return;
    ctx.selectedParts.clear();
    this.applyPartIsolation(ctx);
  }

  applyPartIsolation(ctx) {
    const hasSelection = ctx.selectedParts.size > 0;
    ctx.parts.forEach((p, i) => {
      if (!hasSelection || ctx.selectedParts.has(i)) {
        ctx.api.show(p.instanceID);
      } else {
        ctx.api.hide(p.instanceID);
      }
    });
    Bus.emit('engine:isolation-updated', ctx);
  }

  recenter() {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return;
    ctx.programmaticCamUntil = Date.now() + 900;
    ctx.api.recenterCamera(() => {
      setTimeout(() => {
        ctx.programmaticCamUntil = 0;
        this.syncCameraBaseline(ctx);
      }, 650);
    });
  }

  setShading(mode) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return;
    ctx.shaderMode = mode;

    const shaderDef = STUDIO_SHADERS.find(s => s.id === mode);
    if (shaderDef) AnimeGridStage.setAccent(shaderDef.rgb);

    if (mode === 'wire') { ctx.api.setShadingStyle('lit'); ctx.api.setWireframe(true, { color: 'E05A2BFF' }); return; }
    ctx.api.setWireframe(false);
    if (mode === 'clay')   { ctx.api.setShadingStyle('matcap'); return; }
    if (mode === 'albedo') { ctx.api.setShadingStyle('shadeless'); return; }
    ctx.api.setShadingStyle('lit');

    if (!ctx.materials.length) return;
    ctx.api.getMaterialList((err, liveMats) => {
      if (err || !liveMats) return;
      liveMats.forEach((mat, i) => {
        if (ctx.materials[i]) mat.channels = JSON.parse(JSON.stringify(ctx.materials[i].channels));
        if (mode === 'xray' && mat.channels.Opacity) {
          mat.channels.Opacity.enable = true;
          mat.channels.Opacity.type = 'alphaBlend';
          mat.channels.Opacity.factor = 0.28;
        }
        ctx.api.setMaterial(mat);
      });
    });
  }

  rotateLight(deg) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return;
    ctx.lightDeg = parseFloat(deg) || 0;
    ctx.api.setEnvironment({ enable: true, rotation: (ctx.lightDeg * Math.PI) / 180 });
  }

  exportScreenshot() {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return;
    ctx.api.getScreenShot(1920, 1080, 'image/png', (err, url) => {
      if (err || !url) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = `YapShift_${ctx.asset.id}_${Date.now()}.png`;
      a.click();
    });
  }
}

const StudioUI = {
  engine: null,
  currentAssetId: null,
  drawerOpen: true,

  init() {
    AnimeGridStage.init();
    this.engine = new SketchfabPoolEngine();
    this.initCardHighlight();
    this.renderShaderBar();
    this.bindEvents();
    this.bindBus();
    this.engine.preloadAll(STUDIO_ASSETS);
    this.selectAsset(STUDIO_ASSETS[0].id);
  },

  initCardHighlight() {
    document.addEventListener('mousemove', (e) => {
      const card = e.target.closest('.arch-card');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
      card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
    }, { passive: true });
  },

  closeHero() {
    const overlay = document.getElementById('hero-overlay');
    if (!overlay) return;
    overlay.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => overlay.classList.add('hidden'), 480);
  },

  openHero() {
    const overlay = document.getElementById('hero-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.remove('opacity-0', 'pointer-events-none'));
  },

  updateHeroPreloadStatus() {
    const el = document.getElementById('hero-preload-status');
    if (!el) return;
    const ready = this.engine.getReadyCount();
    const total = STUDIO_ASSETS.length;
    if (ready >= total) {
      el.className = 'flex items-center gap-2 text-zinc-200';
      el.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span><span>ALL ASSETS READY (${ready}/${total})</span>`;
    } else {
      el.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-[#e05a2b] animate-pulse"></span><span>PRELOADING ASSETS (${ready}/${total})</span>`;
    }
  },

  renderShaderBar() {
    document.getElementById('shader-toolbar').innerHTML = STUDIO_SHADERS.map(s =>
      `<button data-action="shader" data-mode="${s.id}" id="btn-shade-${s.id}" class="px-2.5 py-1 rounded-lg text-zinc-400 hover:text-white transition">${s.label}</button>`
    ).join('');
  },

  renderAssetList() {
    document.getElementById('gallery-count').textContent = `0${STUDIO_ASSETS.length}`;
    document.getElementById('asset-list').innerHTML = STUDIO_ASSETS.map((item, idx) => {
      const status = item.loadedPolys
        ? `<span class="text-[10px] font-mono text-zinc-400">${(item.loadedPolys / 1000).toFixed(1)}k</span>`
        : `<span class="text-[10px] font-mono text-zinc-600">LOAD</span>`;
      return `
        <button data-action="select-asset" data-id="${item.id}" class="arch-card w-full text-left rounded-lg px-3 py-2.5 flex flex-col gap-0.5 cursor-pointer ${item.id === this.currentAssetId ? 'active' : ''}">
          <div class="flex items-center justify-between pointer-events-none">
            <span class="text-[10px] font-mono text-[#e05a2b]">0${idx + 1}</span>
            ${status}
          </div>
          <div class="font-display text-xs font-semibold text-zinc-100 truncate pointer-events-none">${item.title}</div>
          <div class="text-[10px] text-zinc-500 truncate pointer-events-none">${item.sub}</div>
        </button>`;
    }).join('');
  },

  renderSubpartList(ctx) {
    const listEl = document.getElementById('subpart-list');
    const resetBtn = document.getElementById('btn-show-all');
    if (!ctx || ctx.parts.length <= 1) {
      if (resetBtn) resetBtn.classList.add('hidden');
      listEl.innerHTML = `<div class="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-zinc-500">单网格合并资产，请使用底部材质模式检视拓扑与烘焙。</div>`;
      return;
    }

    if (resetBtn) resetBtn.classList.toggle('hidden', ctx.selectedParts.size === 0);

    listEl.innerHTML = ctx.parts.map((p, idx) => {
      const isSelected = ctx.selectedParts.has(idx);
      return `
        <button data-action="isolate-part" data-idx="${idx}" class="part-row w-full text-left flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.025] border border-white/[0.05] hover:border-white/20 text-zinc-300 cursor-pointer ${isSelected ? 'isolated' : ''}">
          <span class="truncate max-w-[210px] pointer-events-none"><b class="text-zinc-500 mr-1.5">${String(idx + 1).padStart(2, '0')}</b>${p.name}</span>
          <span class="text-[9px] font-mono uppercase pointer-events-none ${isSelected ? 'text-[#e05a2b]' : 'text-zinc-600'}">${isSelected ? 'SOLO' : 'VIEW'}</span>
        </button>`;
    }).join('');
  },

  highlightShader(mode) {
    STUDIO_SHADERS.forEach(s => {
      const btn = document.getElementById('btn-shade-' + s.id);
      if (btn) {
        btn.className = s.id === mode
          ? 'px-2.5 py-1 rounded-lg bg-white/12 text-white font-semibold transition'
          : 'px-2.5 py-1 rounded-lg text-zinc-500 hover:text-zinc-200 transition';
      }
    });
  },

  setExplodeModeUI(mode) {
    this.engine.mode = mode;
    const isCard = mode === 'cardinal';
    document.getElementById('btn-mode-cardinal').className = isCard ? 'px-2.5 py-1 rounded-md bg-white/12 text-white font-medium transition' : 'px-2.5 py-1 rounded-md text-zinc-500 hover:text-zinc-200 transition';
    document.getElementById('btn-mode-linear').className = !isCard ? 'px-2.5 py-1 rounded-md bg-white/12 text-white font-medium transition' : 'px-2.5 py-1 rounded-md text-zinc-500 hover:text-zinc-200 transition';
  },

  selectAsset(id) {
    const asset = STUDIO_ASSETS.find(a => a.id === id);
    if (!asset) return;
    this.currentAssetId = id;
    this.renderAssetList();

    document.getElementById('spec-category').textContent = asset.category;
    document.getElementById('spec-title').textContent = asset.title;
    document.getElementById('spec-desc').textContent = asset.desc;
    document.getElementById('spec-tags').innerHTML = asset.tags.map(t =>
      `<span class="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-zinc-300">${t}</span>`
    ).join('');

    document.getElementById('workflow-list').innerHTML = asset.workflow.map(w => `
      <button data-action="workflow-step" data-wf="${w.action}" class="arch-card w-full text-left rounded-lg p-2.5 flex flex-col gap-1 cursor-pointer">
        <div class="flex items-center justify-between pointer-events-none">
          <span class="text-xs font-medium text-zinc-100"><b class="font-mono text-[#e05a2b] mr-1.5">${w.step}</b>${w.title}</span>
          <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300">${w.tag}</span>
        </div>
        <div class="text-[10px] text-zinc-500 pointer-events-none">${w.desc}</div>
      </button>
    `).join('');

    const ctx = this.engine.ensureInstance(asset);
    const savedExp = ctx ? Math.round(ctx.explodeVal || 0) : 0;
    document.getElementById('explode-slider').value = savedExp;
    document.getElementById('explode-percent').textContent = savedExp + '%';
    AnimeGridStage.setExplodeProgress(savedExp / 100);

    const savedShader = ctx ? ctx.shaderMode : 'rendered';
    this.highlightShader(savedShader);
    const shaderDef = STUDIO_SHADERS.find(s => s.id === savedShader);
    if (shaderDef) AnimeGridStage.setAccent(shaderDef.rgb);

    this.engine.selectModel(asset);
  },

  toggleDrawer() {
    this.drawerOpen = !this.drawerOpen;
    const panel = document.getElementById('drawer-panel');
    const btn = document.getElementById('btn-toggle-drawer');
    if (this.drawerOpen) {
      panel.classList.remove('translate-x-[120%]', 'opacity-0', 'pointer-events-none');
      btn.className = 'px-2.5 py-1 rounded-lg bg-white/10 text-white transition flex items-center gap-1.5';
    } else {
      panel.classList.add('translate-x-[120%]', 'opacity-0', 'pointer-events-none');
      btn.className = 'px-2.5 py-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition flex items-center gap-1.5';
    }
  },

  async runExplodeTo(target) {
    const slider = document.getElementById('explode-slider');
    await this.engine.captureBaseline(slider.value);
    slider.value = target;
    document.getElementById('explode-percent').textContent = Math.round(target) + '%';
    this.engine.explode(target, true, 0.55, 'easeOutCubic');
  },

  bindBus() {
    Bus.on('engine:preload-updated', () => {
      this.renderAssetList();
      this.updateHeroPreloadStatus();
    });

    Bus.on('engine:loading', () => {
      document.getElementById('loading-overlay').classList.remove('opacity-0', 'pointer-events-none');
    });

    Bus.on('engine:isolation-updated', (ctx) => {
      this.renderSubpartList(ctx);
    });

    Bus.on('engine:ready', (ctx) => {
      document.getElementById('loading-overlay').classList.add('opacity-0', 'pointer-events-none');
      this.renderAssetList();
      this.updateHeroPreloadStatus();

      document.getElementById('spec-polys').textContent = ctx.polys.toLocaleString();
      document.getElementById('spec-verts').textContent = ctx.verts.toLocaleString();
      document.getElementById('spec-parts').textContent = ctx.parts.length > 1 ? `${ctx.parts.length}` : '1';
      document.getElementById('spec-collision-badge').textContent = ctx.collisionBadge;

      const singleMesh = ctx.parts.length <= 1;
      document.getElementById('explode-slider').disabled = singleMesh;
      document.getElementById('dock-explode-group').classList.toggle('opacity-35', singleMesh);

      this.renderSubpartList(ctx);
    });
  },

  bindEvents() {
    document.body.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const act = btn.dataset.action;

      if (act === 'close-hero') this.closeHero();
      if (act === 'open-hero') this.openHero();
      if (act === 'select-asset') this.selectAsset(btn.dataset.id);
      if (act === 'toggle-drawer') this.toggleDrawer();
      if (act === 'recenter') this.engine.recenter();
      if (act === 'screenshot') this.engine.exportScreenshot();

      if (act === 'toggle-orbit') {
        const on = this.engine.toggleAutoSpin();
        btn.innerHTML = on
          ? `<span class="w-1.5 h-1.5 rounded-full bg-[#e05a2b]"></span><span>转台: ON</span>`
          : `<span class="w-1.5 h-1.5 rounded-full bg-zinc-600"></span><span class="text-zinc-500">转台: OFF</span>`;
      }

      if (act === 'shader') {
        this.highlightShader(btn.dataset.mode);
        this.engine.setShading(btn.dataset.mode);
      }

      if (act === 'explode-mode') {
        this.setExplodeModeUI(btn.dataset.mode);
        const curVal = parseFloat(document.getElementById('explode-slider').value) || 0;
        if (curVal > 0) this.engine.explode(curVal, true, 0.50, 'easeOutCubic');
      }

      if (act === 'explode-to') this.runExplodeTo(parseFloat(btn.dataset.val));

      if (act === 'workflow-step') {
        const wf = btn.dataset.wf;
        if (wf === 'explode65') { this.setExplodeModeUI('cardinal'); this.runExplodeTo(65); }
        else if (wf === 'linear65') { this.setExplodeModeUI('linear'); this.runExplodeTo(65); }
        else if (['wire', 'clay', 'xray', 'albedo', 'rendered'].includes(wf)) {
          this.highlightShader(wf);
          this.engine.setShading(wf);
        }
      }

      if (act === 'isolate-part') {
        this.engine.toggleIsolatePart(parseInt(btn.dataset.idx, 10));
      }

      if (act === 'show-all-parts') {
        this.engine.showAllParts();
      }
    });

    // 🎯 零顿挫丝滑爆炸滑块：拖动中用 55ms 节流 + easeLinear 匀速追踪，松手用 easeOutCubic 缓停
    const expSlider = document.getElementById('explode-slider');
    let throttleTimer = null;

    expSlider.addEventListener('pointerdown', () => this.engine.captureBaseline(expSlider.value));
    expSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      document.getElementById('explode-percent').textContent = Math.round(val) + '%';
      AnimeGridStage.setExplodeProgress(val / 100);
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        this.engine.explode(expSlider.value, true, 0.07, 'easeLinear');
      }, 55);
    });
    expSlider.addEventListener('change', (e) => {
      if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
      this.engine.explode(e.target.value, true, 0.45, 'easeOutCubic');
    });

    document.getElementById('light-slider').addEventListener('input', (e) => {
      document.getElementById('light-deg').textContent = e.target.value + '°';
      this.engine.rotateLight(e.target.value);
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => StudioUI.init());
} else {
  StudioUI.init();
}
