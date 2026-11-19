/**
 * YapShift 3D Studio Engine (app-engine.js v18.0)
 * 极简专业版：无冗余特效，专注 3D 模型并行预载秒切、立体/线性双模式丝滑爆炸、材质检视与子件诊断。
 */

const STUDIO_ASSETS = [
  {
    id: 'yapshift-suspention',
    title: '机械悬挂系统总成',
    sub: 'Suspention Assembly',
    category: 'MECHANICAL // HARD-SURFACE',
    uid: '08632550c5604444a14b53dc339b6589',
    desc: '精密避震弹簧、上下控制臂与轴承座机械装配体，支持立体正交拆解、工程线性排布与 X-Ray 内腔透视。',
    tags: ['Hard-Surface', 'Multi-Part Assembly', 'PBR Metal']
  },
  {
    id: 'yapshift-stylized-rock-lod',
    title: '风格化岩石 5 级 LOD',
    sub: 'Stylized Rock (5 Versions)',
    category: 'GAME ASSET // 5-LEVEL LOD',
    uid: 'f9963591aa36459b9837b7a9ca411438',
    desc: '同屏展示从高精到极简远景的 5 级阶梯减面（LOD0–LOD4），极低面数下完整保持高模法线与剪影。',
    tags: ['5-Level LOD', 'Normal Bake', 'Stylized PBR']
  }
];

const STUDIO_SHADERS = [
  { id: 'rendered', label: 'PBR' },
  { id: 'clay',     label: '灰模' },
  { id: 'wire',     label: '线框' },
  { id: 'xray',     label: 'X-Ray' },
  { id: 'albedo',   label: '纯色' }
];

window.Bus = {
  listeners: {},
  on(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); },
  emit(event, payload) { (this.listeners[event] || []).forEach(fn => fn(payload)); }
};

class SketchfabPoolEngine {
  constructor() {
    this.poolContainer = document.getElementById('sketchfab-viewport-pool');
    this.instances = new Map();
    this.activeAssetId = null;
    this.mode = 'cardinal'; // 'cardinal' (立体拆解) | 'linear' (线性排布)
    this.autoOrbitEnabled = true;
    this.orbitTimer = null;
    this.toastTimer = null;
    this.startOrbitLoop();
  }

  get activeCtx() { return this.instances.get(this.activeAssetId) || null; }
  get ready() { const ctx = this.activeCtx; return Boolean(ctx && ctx.ready); }
  get api() { const ctx = this.activeCtx; return ctx ? ctx.api : null; }

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

  syncCameraBaseline(ctx) {
    if (!ctx || !ctx.ready || !ctx.api || ctx.programmaticCamMoving) return;
    ctx.api.getCameraLookAt((err, cam) => {
      if (err || !cam) return;
      const factor = (parseFloat(ctx.explodeVal) || 0) / 100;
      const zoomMult = 1 + factor * (this.mode === 'linear' ? 0.55 : 0.35);
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

    const iframe = document.createElement('iframe');
    iframe.id = `sf-frame-${asset.id}`;
    iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;opacity:0;pointer-events:none;z-index:1;transition:opacity 0.2s ease;';
    iframe.setAttribute('allow', 'autoplay; fullscreen; xr-spatial-tracking');
    iframe.setAttribute('allowfullscreen', '');
    if (this.poolContainer) this.poolContainer.appendChild(iframe);

    const ctx = {
      asset, iframe, api: null, ready: false,
      parts: [], materials: [], strategy: '', polys: 0, verts: 0,
      camScale: 0.85, baselineCam: null, explodeVal: 0, shaderMode: 'rendered', lightDeg: 0,
      userInteracting: false, programmaticCamMoving: false
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

          api.addEventListener('camerastart', () => { if (!ctx.programmaticCamMoving) ctx.userInteracting = true; });
          api.addEventListener('cameraend', () => {
            if (!ctx.programmaticCamMoving) this.syncCameraBaseline(ctx);
            setTimeout(() => { ctx.userInteracting = false; }, 1200);
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
                ctx.strategy = res.strategy;

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

    if (targetCtx.ready) {
      Bus.emit('engine:ready', targetCtx);
    } else {
      Bus.emit('engine:loading');
    }
  }

  startOrbitLoop() {
    this.orbitTimer = setInterval(() => {
      const ctx = this.activeCtx;
      if (!ctx || !ctx.ready || !ctx.api || !this.autoOrbitEnabled || ctx.userInteracting) return;
      ctx.lightDeg = (ctx.lightDeg + 1.2) % 360;
      ctx.api.setEnvironment({ enable: true, rotation: (ctx.lightDeg * Math.PI) / 180 });
      const ls = document.getElementById('light-slider'), ld = document.getElementById('light-deg');
      if (ls && ld) { ls.value = Math.round(ctx.lightDeg); ld.textContent = Math.round(ctx.lightDeg) + '°'; }
    }, 90);
  }

  toggleAutoOrbit() {
    this.autoOrbitEnabled = !this.autoOrbitEnabled;
    return this.autoOrbitEnabled;
  }

  captureBaseline(currentSliderVal) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return Promise.resolve();
    const factor = (parseFloat(currentSliderVal) || 0) / 100;
    const zoomMult = 1 + factor * (this.mode === 'linear' ? 0.55 : 0.35);
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

  showCamToast() {
    const toast = document.getElementById('cam-toast');
    if (!toast) return;
    toast.classList.remove('opacity-0');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.add('opacity-0'), 1400);
  }

  explode(percent, adjustCam = true, durationSec = 0.38) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api || ctx.parts.length <= 1) return;

    ctx.explodeVal = parseFloat(percent) || 0;
    const factor = ctx.explodeVal / 100;
    const positions = SceneGraphMath.evaluateExplosionFrame(ctx.parts, ctx.explodeVal, this.mode);

    ctx.parts.forEach((p, idx) => {
      if (positions[idx]) {
        ctx.api.translate(p.instanceID, positions[idx], { duration: durationSec, easing: 'easeOutQuad' });
      }
    });

    if (adjustCam && ctx.baselineCam) {
      // 线性排布跨度更宽，相机同步拉远更多（1.55x），立体拆解温和拉远（1.35x）
      const z = 1 + factor * (this.mode === 'linear' ? 0.55 : 0.35);
      const t = ctx.baselineCam.target;
      const v = ctx.baselineCam.baseVec;
      ctx.programmaticCamMoving = true;
      ctx.api.setCameraLookAt(
        [t[0] + v[0] * z, t[1] + v[1] * z, t[2] + v[2] * z],
        t,
        durationSec,
        () => setTimeout(() => { ctx.programmaticCamMoving = false; }, 60)
      );
      this.showCamToast();
    }
  }

  setShading(mode) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return;
    ctx.shaderMode = mode;

    if (mode === 'wire') { ctx.api.setShadingStyle('lit'); ctx.api.setWireframe(true, { color: 'F5792AFF' }); return; }
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

  pulsePart(idx) {
    const ctx = this.activeCtx;
    const p = ctx && ctx.parts[idx];
    if (!ctx || !ctx.ready || !ctx.api || !p || !p.cardinalDelta) return null;
    p.pulsed = !p.pulsed;
    const factor = p.pulsed ? 1.0 : (ctx.explodeVal / 100);
    const delta = this.mode === 'linear' ? p.linearDelta : p.cardinalDelta;
    ctx.api.translate(
      p.instanceID,
      [p.origPos[0] + delta[0] * factor, p.origPos[1] + delta[1] * factor, p.origPos[2] + delta[2] * factor],
      { duration: 0.35, easing: 'easeOutQuad' }
    );
    return p.pulsed;
  }

  togglePartVis(idx) {
    const ctx = this.activeCtx;
    const p = ctx && ctx.parts[idx];
    if (!ctx || !ctx.ready || !ctx.api || !p) return null;
    p.visible = !p.visible;
    p.visible ? ctx.api.show(p.instanceID) : ctx.api.hide(p.instanceID);
    return p.visible;
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
  drawerOpen: false,

  init() {
    this.engine = new SketchfabPoolEngine();
    this.renderShaderBar();
    this.bindEvents();
    this.bindBus();
    this.engine.preloadAll(STUDIO_ASSETS);
    this.selectAsset(STUDIO_ASSETS[0].id);
  },

  renderShaderBar() {
    document.getElementById('shader-toolbar').innerHTML = STUDIO_SHADERS.map(s =>
      `<button data-action="shader" data-mode="${s.id}" id="btn-shade-${s.id}" class="px-2.5 py-1 rounded-lg text-zinc-400 hover:text-white transition">${s.label}</button>`
    ).join('');
  },

  renderAssetList() {
    document.getElementById('gallery-count').textContent = `${STUDIO_ASSETS.length} ASSETS`;
    document.getElementById('asset-list').innerHTML = STUDIO_ASSETS.map((item, idx) => {
      const badge = item.loadedPolys
        ? `<span class="text-[10px] font-mono text-emerald-400">⚡ ${(item.loadedPolys / 1000).toFixed(1)}k</span>`
        : `<span class="text-[10px] font-mono text-zinc-500">⏳ 预载中</span>`;
      return `
        <button data-action="select-asset" data-id="${item.id}" class="asset-card w-full text-left rounded-lg px-3 py-2 flex flex-col gap-0.5 ${item.id === this.currentAssetId ? 'active' : ''}">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono text-zinc-400">0${idx + 1}</span>
            ${badge}
          </div>
          <div class="text-xs font-semibold text-white truncate">${item.title}</div>
          <div class="text-[10px] text-zinc-400 truncate">${item.sub}</div>
        </button>`;
    }).join('');
  },

  highlightShader(mode) {
    STUDIO_SHADERS.forEach(s => {
      const btn = document.getElementById('btn-shade-' + s.id);
      if (btn) {
        btn.className = s.id === mode
          ? 'px-2.5 py-1 rounded-lg bg-[#f5792a]/25 text-orange-200 font-semibold transition'
          : 'px-2.5 py-1 rounded-lg text-zinc-400 hover:text-white transition';
      }
    });
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
      `<span class="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-300">${t}</span>`
    ).join('');

    const ctx = this.engine.ensureInstance(asset);
    const savedExp = ctx ? Math.round(ctx.explodeVal || 0) : 0;
    document.getElementById('explode-slider').value = savedExp;
    document.getElementById('explode-percent').textContent = savedExp + '%';
    this.highlightShader(ctx ? ctx.shaderMode : 'rendered');

    this.engine.selectModel(asset);
  },

  toggleDrawer() {
    this.drawerOpen = !this.drawerOpen;
    const panel = document.getElementById('drawer-panel');
    const btn = document.getElementById('btn-toggle-drawer');
    if (this.drawerOpen) {
      panel.classList.remove('translate-x-[120%]', 'opacity-0', 'pointer-events-none');
      btn.classList.add('bg-[#f5792a]/30', 'text-orange-200');
    } else {
      panel.classList.add('translate-x-[120%]', 'opacity-0', 'pointer-events-none');
      btn.classList.remove('bg-[#f5792a]/30', 'text-orange-200');
    }
  },

  bindBus() {
    Bus.on('engine:preload-updated', () => this.renderAssetList());

    Bus.on('engine:loading', () => {
      document.getElementById('loading-overlay').classList.remove('opacity-0', 'pointer-events-none');
    });

    Bus.on('engine:ready', (ctx) => {
      document.getElementById('loading-overlay').classList.add('opacity-0', 'pointer-events-none');
      this.renderAssetList();

      document.getElementById('spec-polys').textContent = ctx.polys.toLocaleString();
      document.getElementById('spec-verts').textContent = ctx.verts.toLocaleString();
      document.getElementById('spec-parts').textContent = ctx.parts.length > 1 ? `${ctx.parts.length} 件` : '1 网格';
      document.getElementById('spec-strategy').textContent = ctx.strategy;

      const singleMesh = ctx.parts.length <= 1;
      document.getElementById('explode-slider').disabled = singleMesh;
      document.getElementById('dock-explode-group').classList.toggle('opacity-40', singleMesh);

      const listEl = document.getElementById('subpart-list');
      if (singleMesh) {
        listEl.innerHTML = `<div class="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-zinc-400">单网格合并资产，可使用底部「线框 / 灰模 / 纯色」检视拓扑与烘焙细节。</div>`;
      } else {
        listEl.innerHTML = ctx.parts.map((p, idx) => `
          <div class="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <span class="text-zinc-200 truncate max-w-[155px]"><b class="text-[#f5792a] mr-1">#${idx + 1}</b>${p.name}</span>
            <div class="flex gap-1">
              <button data-action="pulse-part" data-idx="${idx}" class="px-1.5 py-0.5 rounded bg-[#f5792a]/20 text-orange-200 text-[10px]">${p.pulsed ? '收回' : '弹出'}</button>
              <button data-action="vis-part" data-idx="${idx}" class="px-1.5 py-0.5 rounded bg-white/10 text-zinc-300 text-[10px]">${p.visible ? '显隐' : '已隐'}</button>
            </div>
          </div>`).join('');
      }
    });
  },

  bindEvents() {
    document.body.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const act = btn.dataset.action;

      if (act === 'select-asset') this.selectAsset(btn.dataset.id);
      if (act === 'toggle-drawer') this.toggleDrawer();
      if (act === 'recenter' && this.engine.ready) this.engine.api.recenterCamera();
      if (act === 'screenshot') this.engine.exportScreenshot();

      if (act === 'toggle-orbit') {
        const on = this.engine.toggleAutoOrbit();
        btn.className = on ? 'flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition' : 'flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition';
        btn.innerHTML = on ? `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span><span>转台: ON</span>` : `<span>转台: OFF</span>`;
      }

      if (act === 'shader') {
        this.highlightShader(btn.dataset.mode);
        this.engine.setShading(btn.dataset.mode);
      }

      if (act === 'explode-mode') {
        this.engine.mode = btn.dataset.mode;
        const isCard = this.engine.mode === 'cardinal';
        document.getElementById('btn-mode-cardinal').className = isCard ? 'px-2.5 py-1 rounded-md bg-[#f5792a]/25 text-orange-200 font-semibold transition' : 'px-2.5 py-1 rounded-md text-zinc-400 hover:text-white transition';
        document.getElementById('btn-mode-linear').className = !isCard ? 'px-2.5 py-1 rounded-md bg-[#f5792a]/25 text-orange-200 font-semibold transition' : 'px-2.5 py-1 rounded-md text-zinc-400 hover:text-white transition';
        const curVal = parseFloat(document.getElementById('explode-slider').value) || 0;
        if (curVal > 0) this.engine.explode(curVal, true, 0.55);
      }

      if (act === 'explode-to') {
        const target = parseFloat(btn.dataset.val);
        const slider = document.getElementById('explode-slider');
        await this.engine.captureBaseline(slider.value);
        slider.value = target;
        document.getElementById('explode-percent').textContent = Math.round(target) + '%';
        this.engine.explode(target, true, 0.65);
      }

      if (act === 'pulse-part') {
        const pulsed = this.engine.pulsePart(parseInt(btn.dataset.idx, 10));
        if (pulsed !== null) btn.textContent = pulsed ? '收回' : '弹出';
      }

      if (act === 'vis-part') {
        const vis = this.engine.togglePartVis(parseInt(btn.dataset.idx, 10));
        if (vis !== null) btn.textContent = vis ? '显隐' : '已隐';
      }
    });

    // 全百分比丝滑节流控制（120ms 节流 + 松手精准落位）
    const expSlider = document.getElementById('explode-slider');
    let throttleTimer = null;

    expSlider.addEventListener('pointerdown', () => this.engine.captureBaseline(expSlider.value));
    expSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      document.getElementById('explode-percent').textContent = Math.round(val) + '%';
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        this.engine.explode(expSlider.value, true, 0.38);
      }, 120);
    });
    expSlider.addEventListener('change', (e) => {
      if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
      this.engine.explode(e.target.value, true, 0.45);
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
