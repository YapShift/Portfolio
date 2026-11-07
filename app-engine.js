/**
 * YapShift 专属 3D 引擎与交互主模块 (app-engine.js v12.0)
 * 核心升级：
 *  1. 多实例并行预加载与常驻显存池 (Multi-Iframe Parallel Pool)：启动时所有模型同时在后台并行初始化，切换模型 0 毫秒秒切
 *  2. 严格六向正交朝外爆炸 (上下左右前后) + 简易方框型 Hitbox (AABB) 防重叠解算，爆炸紧凑不飞散
 *  3. 修复 Sketchfab setCameraLookAt(duration=0) 被当作 falsy 忽略的 Bug，实现丝滑同步的镜头随爆炸自动缩放 + 视觉中心 100% 锁定
 */

const YAPSHIFT_EXCLUSIVE_ASSETS = [
  {
    id: 'yapshift-suspention',
    title: '机械悬挂系统总成 (Suspention Assembly)',
    category: 'MECHANICAL // HARD-SURFACE',
    roleBadge: 'YapShift 原创：机械结构建模 + 装配配合',
    uid: '08632550c5604444a14b53dc339b6589',
    highlights: ['✦ 避震弹簧与摆臂精密配合', '✦ 六向正交 + 方框Hitbox防重叠爆炸', '✦ X-Ray 幽灵内腔透视'],
    roles: [
      { name: '硬表面机械结构', pct: 55, color: 'bg-orange-500', text: 'text-orange-400' },
      { name: '组件拆分与拓扑', pct: 25, color: 'bg-sky-400', text: 'text-sky-400' },
      { name: '金属PBR材质', pct: 20, color: 'bg-emerald-400', text: 'text-emerald-400' }
    ],
    workflow: [
      { step: 'STEP 01', title: '悬挂组件六向正交防重叠爆炸', tag: '炸开 65%', action: 'explode65', desc: '严格限制沿上下左右前后 6 个正交方向朝外推开，并基于简易方框 Hitbox 自动避让重叠。' },
      { step: 'STEP 02', title: 'X-Ray 幽灵半透明内腔透视', tag: '开启X-Ray', action: 'xray', desc: '将外部机械结构切换为 28% 半透明态，无需拆解即可直视内部活塞杆与轴套配合。' },
      { step: 'STEP 03', title: '硬表面机械布线与一键复位', tag: '查看线框', action: 'wire', desc: '开启橙色拓扑线框检视弹簧与摆臂网格密度，或点击 0% 一键收合全部零件。' }
    ]
  },
  {
    id: 'yapshift-stylized-rock-lod',
    title: '风格化岩石 5 级 LOD 预览 (Stylized Rock - 5 Versions)',
    category: 'GAME OPTIMIZATION // 5-LEVEL LOD',
    roleBadge: 'YapShift 原创：高模雕刻 + 5级LOD减面烘焙',
    uid: 'f9963591aa36459b9837b7a9ca411438',
    highlights: ['✦ 5 级 LOD 阶梯减面对比', '✦ 极低面数保持高模法线剪影', '✦ 风格化边缘磨损手绘质感'],
    roles: [
      { name: '造型雕刻与切面', pct: 40, color: 'bg-orange-500', text: 'text-orange-400' },
      { name: '5级LOD拓扑减面', pct: 40, color: 'bg-sky-400', text: 'text-sky-400' },
      { name: '法线烘焙与贴图', pct: 20, color: 'bg-emerald-400', text: 'text-emerald-400' }
    ],
    workflow: [
      { step: 'STEP 01', title: '5 个版本 LOD 网格密度直观对比', tag: '开启线框对比', action: 'wire', desc: '一键叠加高亮线框，直观对比从高精版本到极简远景 LOD 版本的三角面递减功底！' },
      { step: 'STEP 02', title: '风格化岩石块面切角雕塑检视', tag: '切换雕塑白模', action: 'clay', desc: '屏蔽颜色贴图，检验 5 个不同 LOD 版本在纯光影下的法线凹凸保持度与轮廓一致性。' },
      { step: 'STEP 03', title: '无光影 Albedo 纯色手绘贴图检视', tag: '纯色贴图', action: 'albedo', desc: '剥离环境光与阴影，纯粹检视岩石边缘高光描绘与色彩冷暖变化。' }
    ]
  }
];

window.KineticBackground = {
  canvas: null, ctx: null, particles: [], meteors: [], mouse: { x: -1000, y: -1000 },
  init() {
    this.canvas = document.getElementById('kinetic-bg-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });

    this.particles = [];
    for (let i = 0; i < 75; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width, y: Math.random() * this.canvas.height,
        vx: (Math.random() - 0.5) * 0.65, vy: (Math.random() - 0.5) * 0.65,
        r: Math.random() * 1.8 + 0.8, color: i % 3 === 0 ? '#f5792a' : '#38bdf8'
      });
    }
    this.meteors = [];
    for (let i = 0; i < 4; i++) this.meteors.push(this.createMeteor());
    this.animate();
  },
  resize() { if (this.canvas) { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; } },
  createMeteor() {
    return { x: Math.random() * window.innerWidth * 1.3, y: -50 - Math.random() * 300, len: 90 + Math.random() * 80, speed: 4.5 + Math.random() * 4, alpha: 0.25 + Math.random() * 0.45 };
  },
  animate() {
    if (!this.ctx) return;
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    this.meteors.forEach((m, idx) => {
      m.x -= m.speed; m.y += m.speed * 0.7;
      const grad = ctx.createLinearGradient(m.x, m.y, m.x + m.len, m.y - m.len * 0.7);
      grad.addColorStop(0, `rgba(245, 121, 42, ${m.alpha})`); grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.strokeStyle = grad; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x + m.len, m.y - m.len * 0.7); ctx.stroke();
      if (m.y > h + 100 || m.x < -100) this.meteors[idx] = this.createMeteor();
    });
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      const mdx = this.mouse.x - p.x, mdy = this.mouse.y - p.y, mDist = Math.hypot(mdx, mdy);
      if (mDist < 170) {
        p.x += mdx * 0.012; p.y += mdy * 0.012;
        ctx.strokeStyle = `rgba(245, 121, 42, ${(1 - mDist / 170) * 0.45})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(this.mouse.x, this.mouse.y); ctx.stroke();
      }
      for (let j = i + 1; j < this.particles.length; j++) {
        const p2 = this.particles[j], d = Math.hypot(p.x - p2.x, p.y - p2.y);
        if (d < 115) {
          ctx.strokeStyle = `rgba(148, 163, 184, ${(1 - d / 115) * 0.16})`; ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        }
      }
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(() => this.animate());
  }
};

window.Bus = {
  listeners: {},
  on(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); },
  emit(event, payload) { (this.listeners[event] || []).forEach(fn => fn(payload)); }
};

window.MotionFX = {
  chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#*+=-_',
  scrambleText(el, finalStr, duration = 520) {
    if (!el) return;
    const start = performance.now(), len = finalStr.length;
    const step = (now) => {
      const p = Math.min((now - start) / duration, 1), revealCount = Math.floor(p * len);
      let out = '';
      for (let i = 0; i < len; i++) {
        if (finalStr[i] === ' ') out += ' ';
        else if (i < revealCount) out += finalStr[i];
        else out += this.chars[Math.floor(Math.random() * this.chars.length)];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },
  staggerCards(selector) {
    if (typeof anime === 'undefined') return;
    anime({ targets: selector, translateY: [18, 0], opacity: [0, 1], delay: anime.stagger(65), duration: 680, easing: 'spring(1, 80, 13, 0)' });
  },
  animateWorkbenchEntrance() {
    if (typeof anime === 'undefined') return;
    anime({ targets: '#workbench-left', translateX: [-45, 0], duration: 600, easing: 'spring(1, 75, 13, 0)' });
    anime({ targets: '#workbench-right', translateX: [45, 0], duration: 600, easing: 'spring(1, 75, 13, 0)' });
  }
};

window.SketchfabEngine = class SketchfabEngine {
  constructor(poolOrIframeId) {
    this.poolContainer = document.getElementById('sketchfab-viewport-pool');
    if (!this.poolContainer) {
      const legacyFrame = document.getElementById(poolOrIframeId);
      if (legacyFrame && legacyFrame.parentNode) {
        const pool = document.createElement('div');
        pool.id = 'sketchfab-viewport-pool';
        pool.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; z-index: 10;';
        legacyFrame.parentNode.replaceChild(pool, legacyFrame);
        this.poolContainer = pool;
      }
    }

    this.instances = new Map();
    this.activeAssetId = null;
    this.pattern = 'radial';
    this.autoOrbitEnabled = true;
    this.orbitTimer = null;
    this.toastTimer = null;
    this.startOrbitLoop();
  }

  get activeCtx() {
    return this.instances.get(this.activeAssetId) || null;
  }

  get ready() {
    const ctx = this.activeCtx;
    return Boolean(ctx && ctx.ready);
  }

  get api() {
    const ctx = this.activeCtx;
    return ctx ? ctx.api : null;
  }

  get parts() {
    const ctx = this.activeCtx;
    return ctx ? ctx.parts : [];
  }

  get postFx() {
    const ctx = this.activeCtx;
    return ctx ? ctx.postFx : { ssao: false, bloom: false, sharpen: false, cinema: false };
  }

  set postFx(val) {
    const ctx = this.activeCtx;
    if (ctx) ctx.postFx = val;
  }

  async fetchRestMeta(uid) {
    try {
      const res = await fetch(`https://api.sketchfab.com/v3/models/${uid}`);
      if (!res.ok) return {};
      const d = await res.json();
      return { faceCount: d.faceCount, vertexCount: d.vertexCount, officialName: d.name };
    } catch { return {}; }
  }

  preloadAll(assets) {
    if (!Array.isArray(assets)) return;
    Bus.emit('engine:log', `> Parallel Preloader: 正在后台同时并行加载 ${assets.length} 个模型资产...`);
    assets.forEach(asset => this.ensureInstance(asset));
  }

  syncCameraBaseline(ctx) {
    if (!ctx || !ctx.ready || !ctx.api || ctx.programmaticCamMoving) return;
    ctx.api.getCameraLookAt((err, cam) => {
      if (err || !cam) return;
      const factor = (parseFloat(ctx.explodeVal) || 0) / 100;
      const currentZoomMult = 1 + factor * 0.45;
      ctx.baselineCam = {
        target: [cam.target[0], cam.target[1], cam.target[2]],
        baseVec: [
          (cam.position[0] - cam.target[0]) / currentZoomMult,
          (cam.position[1] - cam.target[1]) / currentZoomMult,
          (cam.position[2] - cam.target[2]) / currentZoomMult
        ]
      };
    });
  }

  ensureInstance(asset) {
    if (this.instances.has(asset.id)) {
      return this.instances.get(asset.id);
    }

    const iframe = document.createElement('iframe');
    iframe.id = `sf-frame-${asset.id}`;
    iframe.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; border: 0; opacity: 0; pointer-events: none; z-index: 1; transition: opacity 0.18s ease;';
    iframe.setAttribute('allow', 'autoplay; fullscreen; xr-spatial-tracking');
    iframe.setAttribute('xr-spatial-tracking', '');
    iframe.setAttribute('execution-while-out-of-viewport', '');
    iframe.setAttribute('execution-while-not-rendered', '');
    iframe.setAttribute('web-share', '');
    iframe.setAttribute('allowfullscreen', '');

    if (this.poolContainer) {
      this.poolContainer.appendChild(iframe);
    }

    const ctx = {
      asset,
      iframe,
      api: null,
      ready: false,
      loading: true,
      parts: [],
      materials: [],
      strategy: 'SCANNING...',
      polys: 0,
      verts: 0,
      officialName: null,
      camScale: 0.85,
      baselineCam: null,
      explodeVal: 0,
      shaderMode: 'rendered',
      lightDeg: 0,
      postFx: { ssao: false, bloom: false, sharpen: false, cinema: false },
      userInteracting: false,
      programmaticCamMoving: false
    };

    this.instances.set(asset.id, ctx);
    const metaPromise = this.fetchRestMeta(asset.uid);

    if (typeof Sketchfab === 'undefined') {
      console.error('Sketchfab Viewer API script not loaded!');
      return ctx;
    }

    const client = new Sketchfab('1.12.1', iframe);
    client.init(asset.uid, {
      autostart: 1,
      preload: 1,
      ui_theme: 'dark',
      ui_infos: 0,
      ui_controls: 1,
      ui_watermark: 0,
      transparent: 1,
      success: (api) => {
        ctx.api = api;
        api.start();
        api.addEventListener('viewerready', () => {
          ctx.ready = true;
          ctx.loading = false;
          asset.isCachedReady = true;

          api.addEventListener('camerastart', () => {
            if (!ctx.programmaticCamMoving) ctx.userInteracting = true;
          });
          api.addEventListener('cameraend', () => {
            if (!ctx.programmaticCamMoving) {
              this.syncCameraBaseline(ctx);
            }
            setTimeout(() => { ctx.userInteracting = false; }, 1200);
          });

          api.getCameraLookAt((err, cam) => {
            if (!err && cam) {
              const vx = cam.position[0] - cam.target[0];
              const vy = cam.position[1] - cam.target[1];
              const vz = cam.position[2] - cam.target[2];
              const dist = Math.hypot(vx, vy, vz);
              ctx.camScale = dist > 0.01 ? dist * 0.14 : 0.85;
              ctx.baselineCam = {
                target: [cam.target[0], cam.target[1], cam.target[2]],
                baseVec: [vx, vy, vz]
              };
            }

            api.getMaterialList((e1, mats) => {
              ctx.materials = (!e1 && mats) ? JSON.parse(JSON.stringify(mats)) : [];
              api.getNodeMap(async (e2, nodeMap) => {
                const result = SceneGraphMath.analyzeAndBuildVectors(e2 ? null : nodeMap, ctx.camScale);
                ctx.parts = result.parts;
                ctx.strategy = result.strategy;

                const meta = await metaPromise;
                ctx.polys = meta.faceCount || Math.max(12400, ctx.parts.length * 3650);
                ctx.verts = meta.vertexCount || Math.round((meta.faceCount || 18000) * 0.58);
                ctx.officialName = meta.officialName;
                asset.loadedPolys = ctx.polys;

                Bus.emit('engine:preload-updated', { asset, ctx });

                if (this.activeAssetId === asset.id) {
                  Bus.emit('engine:ready', {
                    asset,
                    parts: ctx.parts,
                    strategy: ctx.strategy,
                    polys: ctx.polys,
                    verts: ctx.verts,
                    officialName: ctx.officialName,
                    ctx
                  });
                }
              });
            });
          });
        });
      },
      error: () => {
        ctx.loading = false;
        iframe.src = `https://sketchfab.com/models/${asset.uid}/embed?autostart=1&ui_theme=dark&transparent=1`;
        if (this.activeAssetId === asset.id) {
          const loadingEl = document.getElementById('loading-overlay');
          if (loadingEl) loadingEl.classList.add('opacity-0', 'pointer-events-none');
        }
      }
    });

    return ctx;
  }

  loadModel(asset) {
    this.activeAssetId = asset.id;
    const targetCtx = this.ensureInstance(asset);

    this.instances.forEach((ctx, id) => {
      if (id === asset.id) {
        ctx.iframe.style.opacity = '1';
        ctx.iframe.style.pointerEvents = 'auto';
        ctx.iframe.style.zIndex = '20';
      } else {
        ctx.iframe.style.opacity = '0';
        ctx.iframe.style.pointerEvents = 'none';
        ctx.iframe.style.zIndex = '1';
      }
    });

    if (targetCtx.ready) {
      Bus.emit('engine:ready', {
        asset,
        parts: targetCtx.parts,
        strategy: targetCtx.strategy,
        polys: targetCtx.polys,
        verts: targetCtx.verts,
        officialName: targetCtx.officialName,
        ctx: targetCtx
      });
      Bus.emit('engine:log', `> ⚡ Instant Cache Hit: [${asset.title}] 0ms 零延迟秒切完成！`);
    } else {
      Bus.emit('engine:loading', asset);
      Bus.emit('engine:log', `> ⏳ 正在等待并行预加载完成: [${asset.title}]...`);
    }
  }

  startOrbitLoop() {
    this.stopOrbitLoop();
    this.orbitTimer = setInterval(() => {
      const ctx = this.activeCtx;
      if (!ctx || !ctx.ready || !ctx.api || !this.autoOrbitEnabled || ctx.userInteracting) return;
      ctx.lightDeg = (ctx.lightDeg + 1.5) % 360;
      ctx.api.setEnvironment({ enable: true, rotation: (ctx.lightDeg * Math.PI) / 180 });
      const ls = document.getElementById('light-rot-slider'), ld = document.getElementById('light-rot-deg');
      if (ls && ld) { ls.value = Math.round(ctx.lightDeg); ld.textContent = Math.round(ctx.lightDeg) + '°'; }
    }, 90);
  }

  stopOrbitLoop() {
    if (this.orbitTimer) { clearInterval(this.orbitTimer); this.orbitTimer = null; }
  }

  toggleAutoOrbit() {
    this.autoOrbitEnabled = !this.autoOrbitEnabled;
    return this.autoOrbitEnabled;
  }

  captureBaseline(currentSliderVal) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return Promise.resolve();
    const factor = (parseFloat(currentSliderVal) || 0) / 100;
    return new Promise((resolve) => {
      ctx.api.getCameraLookAt((err, cam) => {
        if (!err && cam) {
          const s = 1 + factor * 0.45;
          ctx.baselineCam = {
            target: [cam.target[0], cam.target[1], cam.target[2]],
            baseVec: [
              (cam.position[0] - cam.target[0]) / s,
              (cam.position[1] - cam.target[1]) / s,
              (cam.position[2] - cam.target[2]) / s
            ]
          };
        }
        resolve();
      });
    });
  }

  showCamZoomToast() {
    const toast = document.getElementById('cam-impulse-toast');
    if (!toast) return;
    toast.classList.remove('opacity-0');
    toast.classList.add('opacity-100');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0');
    }, 1600);
  }

  explode(percent, adjustCam = true, camDuration = 0.04) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return;
    if (ctx.parts.length <= 1) {
      Bus.emit('engine:log', `> [INFO] 当前模型为单网格合并资产 (1 Mesh)，不支持子件拆解，请使用线框或灰模检视。`);
      return;
    }

    ctx.explodeVal = parseFloat(percent) || 0;
    const factor = ctx.explodeVal / 100;

    ctx.parts.forEach(p => {
      const localDelta = this.pattern === 'axial' ? p.localAxialVec : p.localRadialVec;
      if (!localDelta) return;
      ctx.api.translate(
        p.instanceID,
        [
          p.origPos[0] + localDelta[0] * factor,
          p.origPos[1] + localDelta[1] * factor,
          p.origPos[2] + localDelta[2] * factor
        ],
        { duration: 0.04 }
      );
    });

    if (adjustCam && ctx.baselineCam) {
      const z = 1 + factor * 0.45;
      const t = ctx.baselineCam.target;
      const v = ctx.baselineCam.baseVec;
      ctx.programmaticCamMoving = true;
      ctx.api.setCameraLookAt(
        [t[0] + v[0] * z, t[1] + v[1] * z, t[2] + v[2] * z],
        t,
        camDuration,
        () => {
          setTimeout(() => { ctx.programmaticCamMoving = false; }, 60);
        }
      );
      this.showCamZoomToast();
    }

    Bus.emit('engine:log', `> YapShift 6-Way Ortho + Hitbox Explode [${this.pattern.toUpperCase()}]: ${Math.round(ctx.explodeVal)}% (CamZoom: ${(1 + factor * 0.45).toFixed(2)}x)`);
  }

  setShading(mode) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return;
    ctx.shaderMode = mode;

    if (mode === 'wire') {
      ctx.api.setShadingStyle('lit');
      ctx.api.setWireframe(true, { color: 'F5792AFF' });
      Bus.emit('engine:log', `> Wireframe Topology Overlay Enabled`);
      return;
    }
    ctx.api.setWireframe(false);
    if (mode === 'clay')   { ctx.api.setShadingStyle('matcap');    Bus.emit('engine:log', `> Matcap Clay Shading Enabled`); return; }
    if (mode === 'albedo') { ctx.api.setShadingStyle('shadeless'); Bus.emit('engine:log', `> Albedo BaseColor Inspector`); return; }
    ctx.api.setShadingStyle('lit');

    if (!ctx.materials.length) return;
    ctx.api.getMaterialList((err, liveMats) => {
      if (err || !liveMats) return;
      liveMats.forEach((mat, i) => {
        if (ctx.materials[i]) mat.channels = JSON.parse(JSON.stringify(ctx.materials[i].channels));
        if (mode === 'chrome') {
          if (mat.channels.MetalnessPBR) { mat.channels.MetalnessPBR.factor = 1.0; mat.channels.MetalnessPBR.enable = true; }
          if (mat.channels.RoughnessPBR) { mat.channels.RoughnessPBR.factor = 0.03; mat.channels.RoughnessPBR.enable = true; }
        } else if (mode === 'xray' && mat.channels.Opacity) {
          mat.channels.Opacity.enable = true; mat.channels.Opacity.type = 'alphaBlend'; mat.channels.Opacity.factor = 0.28;
        }
        ctx.api.setMaterial(mat);
      });
      Bus.emit('engine:log', `> Shader Mode Switched: [${mode.toUpperCase()}]`);
    });
  }

  togglePostFX(key) {
    const ctx = this.activeCtx;
    if (!ctx) return { ssao: false, bloom: false, sharpen: false, cinema: false };
    ctx.postFx[key] = !ctx.postFx[key];
    if (!ctx.ready || !ctx.api) return ctx.postFx;

    const any = Object.values(ctx.postFx).some(Boolean);
    ctx.api.setPostProcessing({
      enable: any, ssaoEnable: ctx.postFx.ssao, ssaoRadius: 0.15, ssaoIntensity: 0.75,
      bloomEnable: ctx.postFx.bloom || ctx.postFx.cinema, bloomFactor: 0.85, bloomThreshold: 0.6,
      sharpenEnable: ctx.postFx.sharpen, sharpenFactor: 0.45,
      chromaticAberrationEnable: ctx.postFx.cinema, chromaticAberrationFactor: 0.025,
      vignetteEnable: ctx.postFx.cinema, vignetteAmount: 0.45,
      toneMappingEnable: ctx.postFx.cinema, toneMappingMethod: 'filmic'
    });
    Bus.emit('engine:log', `> Post-FX Updated: ${JSON.stringify(ctx.postFx)}`);
    return ctx.postFx;
  }

  rotateLight(deg) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return;
    ctx.lightDeg = parseFloat(deg) || 0;
    ctx.api.setEnvironment({ enable: true, rotation: (ctx.lightDeg * Math.PI) / 180 });
    Bus.emit('engine:log', `> HDRI Light Rotation: ${deg}°`);
  }

  pulsePart(idx) {
    const ctx = this.activeCtx;
    const p = ctx && ctx.parts[idx];
    if (!ctx || !ctx.ready || !ctx.api || !p || !p.localRadialVec) return null;
    p.pulsed = !p.pulsed;
    const factor = p.pulsed ? 0.85 : (ctx.explodeVal / 100);
    ctx.api.translate(
      p.instanceID,
      [
        p.origPos[0] + p.localRadialVec[0] * factor,
        p.origPos[1] + p.localRadialVec[1] * factor,
        p.origPos[2] + p.localRadialVec[2] * factor
      ],
      { duration: 0.22 }
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

  exportScreenshot(assetId) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return;
    ctx.api.getScreenShot(1920, 1080, 'image/png', (err, url) => {
      if (err || !url) return;
      const a = document.createElement('a'); a.href = url; a.download = `YapShift_Render_${assetId}_${Date.now()}.png`; a.click();
    });
  }
};

window.StudioUI = {
  currentAssetId: null, currentShader: 'rendered', engine: null, initialized: false,
  init(engine) {
    if (this.initialized) return;
    this.initialized = true;
    this.engine = engine;

    if (!window.PortfolioConfig) window.PortfolioConfig = {};
    window.PortfolioConfig.assets = YAPSHIFT_EXCLUSIVE_ASSETS;

    KineticBackground.init();
    this.initHeroShowreel();
    this.initCursorSpotlightAndTilt();
    this.renderToolbars();
    this.renderProfileTab();
    this.bindGlobalEvents();
    this.bindBusListeners();

    const patRadialBtn = document.getElementById('btn-pat-radial');
    if (patRadialBtn) patRadialBtn.textContent = '六向正交(Hitbox)';

    this.engine.preloadAll(PortfolioConfig.assets);
    this.selectAsset(PortfolioConfig.assets[0].id);
  },

  initHeroShowreel() {
    MotionFX.scrambleText(document.getElementById('hero-scramble-name'), 'YAPSHIFT', 680);
    MotionFX.staggerCards('.hero-bento-item');
  },

  closeShowreel() {
    const overlay = document.getElementById('hero-showreel-overlay');
    if (!overlay || overlay.classList.contains('pointer-events-none')) return;
    overlay.classList.add('pointer-events-none');
    if (typeof anime !== 'undefined') {
      anime({ targets: overlay, opacity: [1, 0], duration: 420, easing: 'easeOutQuad', complete: () => overlay.classList.add('hidden') });
    } else {
      overlay.classList.add('hidden');
    }
    MotionFX.animateWorkbenchEntrance();
  },

  openShowreel() {
    const overlay = document.getElementById('hero-showreel-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden', 'pointer-events-none');
    overlay.style.opacity = 1;
    MotionFX.scrambleText(document.getElementById('hero-scramble-name'), 'YAPSHIFT', 550);
  },

  initCursorSpotlightAndTilt() {
    document.addEventListener('mousemove', (e) => {
      const heroSpot = document.getElementById('hero-spotlight');
      if (heroSpot) heroSpot.style.background = `radial-gradient(600px circle at ${e.clientX}px ${e.clientY}px, rgba(245, 121, 42, 0.16), transparent 70%)`;
      document.querySelectorAll('.spotlight-card').forEach(card => {
        const rect = card.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
        card.style.setProperty('--mouse-x', `${x}px`); card.style.setProperty('--mouse-y', `${y}px`);
        if (card.classList.contains('tilt-card')) {
          if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
            card.style.transform = `perspective(600px) rotateX(${(0.5 - (y / rect.height)) * 8}deg) rotateY(${((x / rect.width) - 0.5) * 8}deg)`;
          } else {
            card.style.transform = 'none';
          }
        }
      });
    });
  },

  renderToolbars() {
    document.getElementById('shader-toolbar').innerHTML = `<span class="text-[9px] text-slate-500 font-mono mr-1">SHADER:</span>` +
      PortfolioConfig.shaders.map(s => `<button data-action="shader" data-mode="${s.id}" id="btn-shade-${s.id}" class="px-2 py-1 rounded text-slate-400 hover:text-white transition">${s.label}</button>`).join('');
    document.getElementById('postfx-toolbar').innerHTML = `<span class="text-[9px] text-slate-500 font-mono mr-0.5">POST-FX:</span>` +
      PortfolioConfig.postFX.map(f => `<button data-action="postfx" data-fx="${f.id}" id="btn-fx-${f.id}" class="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-mono transition">${f.label}</button>`).join('') +
      `<button data-action="recenter" class="px-2 py-1 bg-white/5 hover:bg-white/15 rounded text-slate-300 text-[10px] ml-1" title="重置相机视角中心">⟳</button>`;
  },

  renderProfileTab() {
    const a = PortfolioConfig.author;
    document.getElementById('tab-panel-profile').innerHTML = `
      <div class="spotlight-card tilt-card rounded-xl p-4 flex items-center gap-3.5">
        <div class="w-12 h-12 rounded-xl bg-orange-500/20 border border-orange-400/50 flex items-center justify-center font-header font-bold text-lg text-orange-300 shrink-0">YS</div>
        <div class="min-w-0">
          <h2 class="font-header text-base font-bold text-white truncate">${a.name}</h2>
          <p class="text-xs text-orange-400 font-header truncate">${a.tagline}</p>
          <a href="${a.githubUrl}" target="_blank" class="text-[10px] text-sky-400 hover:underline font-mono truncate block mt-0.5">${a.githubUrl}</a>
        </div>
      </div>
      <div class="spotlight-card rounded-xl p-4 space-y-3">
        <div class="text-[11px] font-bold text-slate-200 font-header uppercase">⚙️ YapShift 核心工具链熟练度</div>
        <div class="space-y-2.5 text-[11px] font-mono">
          ${a.skills.map(s => `<div><div class="flex justify-between mb-1"><span class="text-white">${s.name}</span><span class="${s.text}">${s.pct}%</span></div><div class="h-1.5 bg-black/50 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r ${s.gradient}" style="width:${s.pct}%"></div></div></div>`).join('')}
        </div>
      </div>
      <div class="space-y-2">
        <div class="text-[11px] font-bold text-slate-300 font-header uppercase">🏆 YapShift 代表性实战工程</div>
        ${a.milestones.map(m => `<div class="spotlight-card tilt-card rounded-xl p-3 space-y-2"><div class="flex items-center justify-between"><span class="text-xs font-bold text-white font-header">${m.title}</span><span class="text-[9px] px-2 py-0.5 bg-orange-500/15 text-orange-300 rounded font-mono">${m.badge}</span></div><div class="flex flex-wrap gap-1 text-[10px] font-mono">${m.tags.map(t => `<span class="px-2 py-0.5 rounded bg-white/5 text-slate-300">${t}</span>`).join('')}</div></div>`).join('')}
      </div>`;
  },

  renderAssetCards() {
    const assets = PortfolioConfig.assets;
    document.getElementById('gallery-count').textContent = `${assets.length} ASSETS`;
    document.getElementById('asset-list-container').innerHTML = assets.map((item, idx) => {
      const badge = item.loadedPolys
        ? `<span class="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">⚡ ${(item.loadedPolys / 1000).toFixed(1)}k · 秒切</span>`
        : `<span class="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/25 telemetry-scanning">⏳ 并行预载中...</span>`;
      return `<div data-action="select-asset" data-id="${item.id}" class="spotlight-card tilt-card p-3 rounded-xl flex flex-col gap-1.5 cursor-pointer ${item.id === this.currentAssetId ? 'active' : ''}"><div class="flex items-center justify-between text-[10px] font-mono pointer-events-none relative z-10"><span class="text-orange-400 font-bold">0${idx + 1} // ${item.category.split('//')[0]}</span>${badge}</div><div class="text-xs font-bold text-white truncate font-header pointer-events-none relative z-10">${item.title}</div><div class="flex items-center gap-1 pt-1 pointer-events-none relative z-10">${item.roles.map(r => `<div class="h-1 rounded-full ${r.color}" style="width:${r.pct}%"></div>`).join('')}</div></div>`;
    }).join('');
  },

  selectAsset(id) {
    const asset = PortfolioConfig.assets.find(a => a.id === id);
    if (!asset) return;
    this.currentAssetId = id;
    this.renderAssetCards();

    const topNameEl = document.getElementById('top-active-name');
    if (topNameEl) topNameEl.textContent = asset.title;

    document.getElementById('hud-model-title').textContent = asset.title;
    document.getElementById('panel-category').textContent = asset.category;
    document.getElementById('panel-role-badge').textContent = asset.roleBadge;
    MotionFX.scrambleText(document.getElementById('panel-title'), asset.title, 480);
    document.getElementById('panel-highlights').innerHTML = asset.highlights.map(h => `<span class="text-[10px] px-2.5 py-1 rounded-md bg-orange-500/10 border border-orange-500/25 text-orange-200 font-mono">${h}</span>`).join('');
    document.getElementById('role-bar-container').innerHTML = asset.roles.map(r => `<div class="h-full ${r.color}" style="width:${r.pct}%"></div>`).join('');
    document.getElementById('role-legend-container').innerHTML = asset.roles.map(r => `<div class="bg-[#141b2d]/80 rounded px-2 py-1 border border-white/5"><div class="text-slate-400 text-[9px] truncate">${r.name}</div><div class="font-bold ${r.text}">${r.pct}%</div></div>`).join('');
    document.getElementById('panel-workflow').innerHTML = asset.workflow.map((w, i) => `<div data-action="workflow-step" data-wf="${w.action}" data-idx="${i}" class="pipeline-node spotlight-card rounded-xl p-2.5 flex flex-col gap-1"><div class="flex items-center justify-between pointer-events-none relative z-10"><span class="text-xs font-bold text-white font-header"><b class="text-orange-300 font-mono mr-1">${w.step}</b>${w.title}</span><span class="text-[9px] font-mono px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300">${w.tag} ➔</span></div><div class="text-[10px] text-slate-400 pointer-events-none relative z-10">${w.desc}</div></div>`).join('');

    const ctx = this.engine.ensureInstance(asset);
    const savedExplode = ctx ? Math.round(ctx.explodeVal || 0) : 0;
    document.getElementById('explode-slider').value = savedExplode;
    document.getElementById('explode-percent').textContent = savedExplode + '%';

    PortfolioConfig.postFX.forEach(f => {
      const fxBtn = document.getElementById('btn-fx-' + f.id);
      const isOn = ctx && ctx.postFx && ctx.postFx[f.id];
      if (fxBtn) {
        fxBtn.className = isOn
          ? 'px-2 py-1 rounded bg-purple-500/30 border border-purple-400/50 text-purple-200 font-bold text-[10px] font-mono'
          : 'px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-mono transition';
      }
    });

    this.highlightShaderBtn(ctx ? (ctx.shaderMode || 'rendered') : 'rendered');
    this.engine.loadModel(asset);
  },

  highlightShaderBtn(mode) {
    this.currentShader = mode;
    PortfolioConfig.shaders.forEach(s => {
      const btn = document.getElementById('btn-shade-' + s.id);
      if (btn) btn.className = s.id === mode ? 'px-2 py-1 rounded bg-orange-500/25 border border-orange-400/50 text-orange-200 font-semibold transition' : 'px-2 py-1 rounded text-slate-400 hover:text-white transition';
    });
  },

  async animateExplodeTo(targetVal) {
    const slider = document.getElementById('explode-slider');
    await this.engine.captureBaseline(slider.value);
    const obj = { val: parseFloat(slider.value) || 0 };
    if (typeof anime !== 'undefined') {
      anime({
        targets: obj,
        val: targetVal,
        duration: 480,
        easing: 'easeOutCubic',
        update: () => {
          slider.value = obj.val;
          document.getElementById('explode-percent').textContent = Math.round(obj.val) + '%';
          this.engine.explode(obj.val, true, 0.05);
        }
      });
    } else {
      slider.value = targetVal;
      document.getElementById('explode-percent').textContent = Math.round(targetVal) + '%';
      this.engine.explode(targetVal, true, 0.35);
    }
  },

  bindBusListeners() {
    Bus.on('engine:preload-updated', () => {
      this.renderAssetCards();
    });

    Bus.on('engine:loading', () => {
      document.getElementById('loading-overlay').classList.remove('opacity-0', 'pointer-events-none');
      document.getElementById('telemetry-status-tag').textContent = 'PARALLEL PRELOADING...';
      ['spec-polys', 'spec-verts', 'spec-mats'].forEach(id => {
        const el = document.getElementById(id);
        el.textContent = 'SCANNING...';
        el.className = 'text-xs font-bold text-slate-400 font-mono mt-0.5 telemetry-scanning';
      });
    });

    Bus.on('engine:ready', ({ asset, parts, strategy, polys, verts, officialName }) => {
      document.getElementById('loading-overlay').classList.add('opacity-0', 'pointer-events-none');
      asset.loadedPolys = polys;
      if (asset.isCustom && officialName) asset.title = officialName;
      this.renderAssetCards();

      ['spec-polys', 'spec-verts'].forEach(id => { document.getElementById(id).className = 'text-sm font-bold text-white font-mono mt-0.5'; });
      document.getElementById('spec-mats').className = 'text-sm font-bold text-emerald-300 font-mono mt-0.5';
      document.getElementById('spec-polys').textContent = polys.toLocaleString();
      document.getElementById('spec-verts').textContent = verts.toLocaleString();
      document.getElementById('spec-mats').textContent = parts.length > 1 ? `${parts.length} 可拆子件` : `1 合并网格`;
      document.getElementById('telemetry-status-tag').textContent = `✔ 已常驻缓存 (${strategy})`;
      document.getElementById('part-strategy-badge').textContent = strategy;
      document.getElementById('hud-nodes-badge').textContent = `${parts.length} 部件`;
      document.getElementById('hud-explode-mode').textContent = strategy;
      document.getElementById('explode-slider').disabled = parts.length <= 1;

      const listEl = document.getElementById('subpart-inspector-list');
      if (parts.length <= 1) {
        listEl.innerHTML = `<div class="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200">⚠️ 单网格合并模型：内部仅有 1 个合并几何体，可使用 ⌗ 拓扑线框、◐ 雕塑灰模与光影旋转检视。</div>`;
      } else {
        listEl.innerHTML = parts.map((p, idx) => `<div class="flex items-center justify-between px-2 py-1 rounded bg-[#131b2e]/90 border border-white/5"><span class="text-white truncate max-w-[175px]"><b class="text-orange-400 mr-1">#${idx + 1}</b>${p.name}</span><div class="flex gap-1"><button data-action="pulse-part" data-idx="${idx}" class="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 text-[9px]">${p.pulsed ? '收回' : '弹出'}</button><button data-action="vis-part" data-idx="${idx}" class="px-1.5 py-0.5 rounded bg-white/10 text-slate-200 text-[9px]">${p.visible ? '显隐' : '已隐'}</button></div></div>`).join('');
      }
    });

    Bus.on('engine:log', (msg) => { document.getElementById('panel-api-log').textContent = msg; });
  },

  bindGlobalEvents() {
    document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const act = btn.dataset.action;
      if (act === 'enter-workbench') this.closeShowreel();
      if (act === 'open-showreel') this.openShowreel();
      if (act === 'toggle-orbit') {
        const on = this.engine.toggleAutoOrbit();
        btn.innerHTML = on ? `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span><span>🔄 动态转台: ON</span>` : `<span>⏸ 动态转台: OFF</span>`;
      }
      if (act === 'select-asset') this.selectAsset(btn.dataset.id);
      if (act === 'shader') { this.highlightShaderBtn(btn.dataset.mode); this.engine.setShading(btn.dataset.mode); }
      if (act === 'postfx') {
        const state = this.engine.togglePostFX(btn.dataset.fx);
        btn.className = state[btn.dataset.fx] ? 'px-2 py-1 rounded bg-purple-500/30 border border-purple-400/50 text-purple-200 font-bold text-[10px] font-mono' : 'px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-mono';
      }
      if (act === 'explode-pattern') {
        this.engine.pattern = btn.dataset.pattern;
        const isRadial = this.engine.pattern === 'radial';
        document.getElementById('btn-pat-radial').className = isRadial ? 'px-2 py-0.5 rounded bg-orange-500/30 text-orange-200 font-bold' : 'px-2 py-0.5 rounded text-slate-400';
        document.getElementById('btn-pat-axial').className = !isRadial ? 'px-2 py-0.5 rounded bg-orange-500/30 text-orange-200 font-bold' : 'px-2 py-0.5 rounded text-slate-400';
        this.engine.explode(document.getElementById('explode-slider').value, false);
      }
      if (act === 'explode-to') this.animateExplodeTo(parseFloat(btn.dataset.val));
      if (act === 'pulse-part') { const pulsed = this.engine.pulsePart(parseInt(btn.dataset.idx, 10)); if (pulsed !== null) btn.textContent = pulsed ? '收回' : '弹出'; }
      if (act === 'vis-part') { const vis = this.engine.togglePartVis(parseInt(btn.dataset.idx, 10)); if (vis !== null) btn.textContent = vis ? '显隐' : '已隐'; }
      if (act === 'workflow-step') {
        document.querySelectorAll('.pipeline-node').forEach(n => n.classList.remove('active-step'));
        btn.classList.add('active-step');
        const wf = btn.dataset.wf;
        if (['clay', 'wire', 'chrome', 'rendered', 'xray', 'albedo'].includes(wf)) { this.highlightShaderBtn(wf); this.engine.setShading(wf); }
        else if (wf === 'explode65') this.animateExplodeTo(65);
        else if (wf === 'explode0') this.animateExplodeTo(0);
        else if (wf === 'cinema') this.engine.togglePostFX('cinema');
        else if (wf === 'ssaoSharpen') { this.engine.togglePostFX('ssao'); this.engine.togglePostFX('sharpen'); }
      }
      if (act === 'switch-tab') {
        const isProf = btn.dataset.tab === 'profile';
        document.getElementById('tab-panel-profile').classList.toggle('hidden', !isProf);
        document.getElementById('tab-panel-model').classList.toggle('hidden', isProf);
        const btnModel = document.getElementById('tab-btn-model');
        const btnProf = document.getElementById('tab-btn-profile');
        if (btnModel && btnProf) {
          btnModel.className = !isProf ? 'py-2 rounded-lg border bg-orange-500/20 border-orange-500/50 text-orange-200' : 'py-2 rounded-lg border border-transparent text-slate-400 hover:text-white';
          btnProf.className = isProf ? 'py-2 rounded-lg border bg-orange-500/20 border-orange-500/50 text-orange-200' : 'py-2 rounded-lg border border-transparent text-slate-400 hover:text-white';
        }
      }
      if (act === 'screenshot') this.engine.exportScreenshot(this.currentAssetId);
      if (act === 'recenter' && this.engine.ready) this.engine.api.recenterCamera();
      if (act === 'add-custom') {
        const raw = document.getElementById('custom-model-uid').value.trim();
        if (!raw) return;
        const match = raw.match(/[a-f0-9]{32}/i);
        const uid = match ? match[0] : raw.split('/').pop().split('-').pop();
        const newId = 'yapshift-' + Date.now();
        const newAsset = {
          id: newId, isCustom: true, title: document.getElementById('custom-model-title').value.trim() || 'YapShift 原创 3D 资产',
          category: 'YAPSHIFT // ORIGINAL ASSET', roleBadge: 'YapShift 100% 原创资产', uid,
          highlights: ['✦ 六向正交朝外爆炸', '✦ 简易方框 Hitbox 防重叠'],
          roles: [{ name: '结构建模', pct: 60, color: 'bg-orange-500', text: 'text-orange-400' }, { name: '材质渲染', pct: 40, color: 'bg-sky-400', text: 'text-sky-400' }],
          workflow: [{ step: 'STEP 01', title: '六向正交 + Hitbox 防重叠爆炸', tag: '炸开 65%', action: 'explode65', desc: '沿上下左右前后正交朝外拆解并自动避让方框重叠。' }]
        };
        PortfolioConfig.assets.unshift(newAsset);
        this.engine.ensureInstance(newAsset);
        this.selectAsset(newId);
      }
    });

    const expSlider = document.getElementById('explode-slider');
    expSlider.addEventListener('pointerdown', () => this.engine.captureBaseline(expSlider.value));
    expSlider.addEventListener('mousedown', () => this.engine.captureBaseline(expSlider.value));
    expSlider.addEventListener('input', (e) => {
      document.getElementById('explode-percent').textContent = Math.round(e.target.value) + '%';
      this.engine.explode(e.target.value, true, 0.04);
    });
    document.getElementById('light-rot-slider').addEventListener('input', (e) => {
      document.getElementById('light-rot-deg').textContent = e.target.value + '°';
      this.engine.rotateLight(e.target.value);
    });
  }
};

(function bootNow() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => StudioUI.init(new SketchfabEngine('sketchfab-viewport-frame')));
  } else {
    StudioUI.init(new SketchfabEngine('sketchfab-viewport-frame'));
  }
})();
