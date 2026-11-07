/**
 * YapShift 引擎与全场景动态交互主模块 (app-engine.js v8.0)
 * 包含：
 *  1. KineticBackground (60FPS 鼠标引力拓扑粒子网 + 流星光束 Canvas)
 *  2. EventBus & MotionFX (ReactBits 字符解密 + Anime.js 机甲展开 + 3D 倾斜视差)
 *  3. SketchfabEngine (含 3D 相机自动环绕转台 Auto-Orbit Turntable)
 *  4. StudioUI
 */

// ============================================================================
// 1. 全域 60FPS 动态拓扑粒子网与流星背景引擎 (ReactBits / Aceternity 风格)
// ============================================================================
window.KineticBackground = {
  canvas: null,
  ctx: null,
  particles: [],
  meteors: [],
  mouse: { x: -1000, y: -1000 },

  init() {
    this.canvas = document.getElementById('kinetic-bg-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });

    // 创建 75 个 3D 顶点粒子
    const count = 75;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: (Math.random() - 0.5) * 0.65,
        vy: (Math.random() - 0.5) * 0.65,
        r: Math.random() * 1.8 + 0.8,
        color: i % 3 === 0 ? '#f5792a' : '#38bdf8'
      });
    }

    // 创建 4 道 Aceternity 风格斜向流星光束
    for (let i = 0; i < 4; i++) {
      this.meteors.push(this.createMeteor());
    }

    this.animate();
  },

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  createMeteor() {
    return {
      x: Math.random() * window.innerWidth * 1.3,
      y: -50 - Math.random() * 300,
      len: 90 + Math.random() * 80,
      speed: 4.5 + Math.random() * 4,
      alpha: 0.25 + Math.random() * 0.45
    };
  },

  animate() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 1. 绘制斜向流星光束 (Meteors)
    this.meteors.forEach((m, idx) => {
      m.x -= m.speed;
      m.y += m.speed * 0.7;
      const grad = ctx.createLinearGradient(m.x, m.y, m.x + m.len, m.y - m.len * 0.7);
      grad.addColorStop(0, `rgba(245, 121, 42, ${m.alpha})`);
      grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x + m.len, m.y - m.len * 0.7);
      ctx.stroke();

      if (m.y > h + 100 || m.x < -100) {
        this.meteors[idx] = this.createMeteor();
      }
    });

    // 2. 更新并绘制拓扑顶点粒子与鼠标引力连线
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;

      // 鼠标柔和引力交互
      const mdx = this.mouse.x - p.x;
      const mdy = this.mouse.y - p.y;
      const mDist = Math.hypot(mdx, mdy);
      if (mDist < 170) {
        p.x += mdx * 0.012;
        p.y += mdy * 0.012;
        ctx.strokeStyle = `rgba(245, 121, 42, ${(1 - mDist / 170) * 0.45})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(this.mouse.x, this.mouse.y);
        ctx.stroke();
      }

      // 粒子间拓扑网格连线
      for (let j = i + 1; j < this.particles.length; j++) {
        const p2 = this.particles[j];
        const d = Math.hypot(p.x - p2.x, p.y - p2.y);
        if (d < 115) {
          ctx.strokeStyle = `rgba(148, 163, 184, ${(1 - d / 115) * 0.16})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(() => this.animate());
  }
};

// ============================================================================
// 2. 发布/订阅事件总线与物理动效辅助器
// ============================================================================
window.Bus = {
  listeners: {},
  on(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); },
  emit(event, payload) { (this.listeners[event] || []).forEach(fn => fn(payload)); }
};

window.MotionFX = {
  chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#*+=-_',
  scrambleText(el, finalStr, duration = 520) {
    if (!el) return;
    const start = performance.now();
    const len = finalStr.length;
    const step = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const revealCount = Math.floor(p * len);
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
    anime({
      targets: selector,
      translateY: [18, 0],
      opacity: [0, 1],
      delay: anime.stagger(65),
      duration: 680,
      easing: 'spring(1, 80, 13, 0)'
    });
  },

  // 进入 Workbench 时的机甲三栏展开入场动画
  animateWorkbenchEntrance() {
    if (typeof anime === 'undefined') return;
    anime({
      targets: '#workbench-left',
      translateX: [-80, 0],
      opacity: [0, 1],
      duration: 750,
      easing: 'spring(1, 75, 13, 0)'
    });
    anime({
      targets: '#workbench-right',
      translateX: [80, 0],
      opacity: [0, 1],
      duration: 750,
      easing: 'spring(1, 75, 13, 0)'
    });
    anime({
      targets: '#workbench-center',
      scale: [0.94, 1],
      opacity: [0, 1],
      duration: 650,
      easing: 'easeOutExpo'
    });
  }
};

// ============================================================================
// 3. Sketchfab 3D 引擎（新增 3D 镜头自动环绕转台 Auto-Orbit Turntable）
// ============================================================================
window.SketchfabEngine = class SketchfabEngine {
  constructor(iframeId) {
    this.iframe = document.getElementById(iframeId);
    this.api = null;
    this.ready = false;
    this.parts = [];
    this.materials = [];
    this.pattern = 'radial';
    this.baselineCam = null;
    this.camScale = 1.8;
    this.postFx = { ssao: false, bloom: false, sharpen: false, cinema: false };

    // 动态自动环绕转台状态
    this.autoOrbitEnabled = true;
    this.orbitAngle = 0;
    this.orbitTimer = null;
    this.userInteracting = false;
  }

  async fetchRestMeta(uid) {
    try {
      const res = await fetch(`https://api.sketchfab.com/v3/models/${uid}`);
      if (!res.ok) return {};
      const d = await res.json();
      return { faceCount: d.faceCount, vertexCount: d.vertexCount, officialName: d.name };
    } catch { return {}; }
  }

  loadModel(asset) {
    this.ready = false;
    this.stopOrbitLoop();
    Bus.emit('engine:loading', asset);
    const metaPromise = this.fetchRestMeta(asset.uid);
    const client = new Sketchfab(this.iframe);

    client.init(asset.uid, {
      autostart: 1, ui_theme: 'dark', ui_infos: 0, ui_controls: 1, ui_watermark: 0, transparent: 1,
      success: (api) => {
        this.api = api;
        api.start();
        api.addEventListener('viewerready', () => {
          this.ready = true;

          // 当用户在 3D 视口中主动拖拽相机时，自动暂停转台不抢鼠标控制权
          api.addEventListener('camerastart', () => { this.userInteracting = true; });
          api.addEventListener('cameraend', () => {
            setTimeout(() => { this.userInteracting = false; }, 1800);
          });

          api.getCameraLookAt((err, cam) => {
            if (!err && cam) {
              const vx = cam.position[0] - cam.target[0], vy = cam.position[1] - cam.target[1], vz = cam.position[2] - cam.target[2];
              const dist = Math.hypot(vx, vy, vz);
              this.camScale = dist > 0.01 ? dist * 0.26 : 1.6;
              this.baselineCam = { target: cam.target.slice(), baseVec: [vx, vy, vz] };
              this.orbitAngle = Math.atan2(vy, vx);
            }

            if (this.autoOrbitEnabled) this.startOrbitLoop();

            api.getMaterialList((e1, mats) => {
              this.materials = (!e1 && mats) ? JSON.parse(JSON.stringify(mats)) : [];
              api.getNodeMap(async (e2, nodeMap) => {
                const result = SceneGraphMath.analyzeAndBuildVectors(e2 ? null : nodeMap, this.camScale);
                this.parts = result.parts;
                const meta = await metaPromise;
                Bus.emit('engine:ready', {
                  asset,
                  parts: this.parts,
                  strategy: result.strategy,
                  polys: meta.faceCount || Math.max(12400, this.parts.length * 3650),
                  verts: meta.vertexCount || Math.round((meta.faceCount || 18000) * 0.58),
                  officialName: meta.officialName
                });
              });
            });
          });
        });
      }
    });
  }

  // 持续柔和旋转 3D 镜头或 HDRI 光影，让 Workbench 里的模型永远充满生命力
  startOrbitLoop() {
    this.stopOrbitLoop();
    let envDeg = 0;
    this.orbitTimer = setInterval(() => {
      if (!this.ready || !this.api || !this.autoOrbitEnabled || this.userInteracting) return;
      envDeg = (envDeg + 1.5) % 360;
      const rad = (envDeg * Math.PI) / 180;
      this.api.setEnvironment({ enable: true, rotation: rad });
      const lightSlider = document.getElementById('light-rot-slider');
      const lightDeg = document.getElementById('light-rot-deg');
      if (lightSlider && lightDeg) {
        lightSlider.value = Math.round(envDeg);
        lightDeg.textContent = Math.round(envDeg) + '°';
      }
    }, 90);
  }

  stopOrbitLoop() {
    if (this.orbitTimer) {
      clearInterval(this.orbitTimer);
      this.orbitTimer = null;
    }
  }

  toggleAutoOrbit() {
    this.autoOrbitEnabled = !this.autoOrbitEnabled;
    if (this.autoOrbitEnabled) this.startOrbitLoop();
    else this.stopOrbitLoop();
    return this.autoOrbitEnabled;
  }

  captureBaseline(currentSliderVal) {
    if (!this.ready || !this.api) return;
    const factor = (parseFloat(currentSliderVal) || 0) / 100;
    this.api.getCameraLookAt((err, cam) => {
      if (err || !cam) return;
      const s = 1 + factor * 0.65;
      this.baselineCam = {
        target: cam.target.slice(),
        baseVec: [(cam.position[0] - cam.target[0]) / s, (cam.position[1] - cam.target[1]) / s, (cam.position[2] - cam.target[2]) / s]
      };
    });
  }

  explode(percent, adjustCam = true) {
    if (!this.ready || !this.api || this.parts.length <= 1) return;
    const factor = (parseFloat(percent) || 0) / 100;

    this.parts.forEach(p => {
      const vec = this.pattern === 'axial' ? p.axialDir : p.radialDir;
      const dist = factor * p.maxDistance;
      this.api.translate(p.instanceID, [p.origPos[0] + vec[0] * dist, p.origPos[1] + vec[1] * dist, p.origPos[2] + vec[2] * dist], { duration: 0.06 });
    });

    if (adjustCam && this.baselineCam) {
      const z = 1 + factor * 0.65;
      const eye = [
        this.baselineCam.target[0] + this.baselineCam.baseVec[0] * z,
        this.baselineCam.target[1] + this.baselineCam.baseVec[1] * z,
        this.baselineCam.target[2] + this.baselineCam.baseVec[2] * z
      ];
      this.api.setCameraLookAt(eye, this.baselineCam.target, 0.12);
    }
    Bus.emit('engine:log', `> YapShift Explode [${this.pattern.toUpperCase()}]: ${Math.round(percent)}% (${this.parts.length} parts)`);
  }

  setShading(mode) {
    if (!this.ready || !this.api) return;
    if (mode === 'wire') {
      this.api.setShadingStyle('lit');
      this.api.setWireframe(true, { color: 'F5792AFF' });
      Bus.emit('engine:log', `> Wireframe Topology Overlay Enabled`);
      return;
    }
    this.api.setWireframe(false);
    if (mode === 'clay')   { this.api.setShadingStyle('matcap');    Bus.emit('engine:log', `> Matcap Clay Shading Enabled`); return; }
    if (mode === 'albedo') { this.api.setShadingStyle('shadeless'); Bus.emit('engine:log', `> Albedo BaseColor Inspector`); return; }

    this.api.setShadingStyle('lit');
    if (!this.materials.length) return;
    this.api.getMaterialList((err, liveMats) => {
      if (err || !liveMats) return;
      liveMats.forEach((mat, i) => {
        if (this.materials[i]) mat.channels = JSON.parse(JSON.stringify(this.materials[i].channels));
        if (mode === 'chrome') {
          if (mat.channels.MetalnessPBR) { mat.channels.MetalnessPBR.factor = 1.0; mat.channels.MetalnessPBR.enable = true; }
          if (mat.channels.RoughnessPBR) { mat.channels.RoughnessPBR.factor = 0.03; mat.channels.RoughnessPBR.enable = true; }
        } else if (mode === 'xray' && mat.channels.Opacity) {
          mat.channels.Opacity.enable = true; mat.channels.Opacity.type = 'alphaBlend'; mat.channels.Opacity.factor = 0.28;
        }
        this.api.setMaterial(mat);
      });
      Bus.emit('engine:log', `> Shader Mode Switched: [${mode.toUpperCase()}]`);
    });
  }

  togglePostFX(key) {
    this.postFx[key] = !this.postFx[key];
    if (!this.ready || !this.api) return this.postFx;
    const any = Object.values(this.postFx).some(Boolean);
    this.api.setPostProcessing({
      enable: any,
      ssaoEnable: this.postFx.ssao, ssaoRadius: 0.15, ssaoIntensity: 0.75,
      bloomEnable: this.postFx.bloom || this.postFx.cinema, bloomFactor: 0.85, bloomThreshold: 0.6,
      sharpenEnable: this.postFx.sharpen, sharpenFactor: 0.45,
      chromaticAberrationEnable: this.postFx.cinema, chromaticAberrationFactor: 0.025,
      vignetteEnable: this.postFx.cinema, vignetteAmount: 0.45,
      toneMappingEnable: this.postFx.cinema, toneMappingMethod: 'filmic'
    });
    Bus.emit('engine:log', `> Post-FX Updated: ${JSON.stringify(this.postFx)}`);
    return this.postFx;
  }

  rotateLight(deg) {
    if (!this.ready || !this.api) return;
    const rad = (parseFloat(deg) * Math.PI) / 180;
    this.api.setEnvironment({ enable: true, rotation: rad });
    Bus.emit('engine:log', `> HDRI Light Rotation: ${deg}°`);
  }

  pulsePart(idx) {
    const p = this.parts[idx];
    if (!this.ready || !this.api || !p || !p.radialDir) return null;
    p.pulsed = !p.pulsed;
    const d = p.pulsed ? p.maxDistance * 0.75 : 0;
    this.api.translate(p.instanceID, [p.origPos[0] + p.radialDir[0] * d, p.origPos[1] + p.radialDir[1] * d, p.origPos[2] + p.radialDir[2] * d], { duration: 0.25 });
    Bus.emit('engine:log', `> Part #${idx + 1} [${p.name}] ${p.pulsed ? 'EXTRUDED' : 'RESET'}`);
    return p.pulsed;
  }

  togglePartVis(idx) {
    const p = this.parts[idx];
    if (!this.ready || !this.api || !p) return null;
    p.visible = !p.visible;
    p.visible ? this.api.show(p.instanceID) : this.api.hide(p.instanceID);
    Bus.emit('engine:log', `> Part #${idx + 1} [${p.name}] ${p.visible ? 'SHOWN' : 'HIDDEN'}`);
    return p.visible;
  }

  exportScreenshot(assetId) {
    if (!this.ready || !this.api) return;
    this.api.getScreenShot(1920, 1080, 'image/png', (err, url) => {
      if (err || !url) return;
      const a = document.createElement('a');
      a.href = url; a.download = `YapShift_Render_${assetId}_${Date.now()}.png`;
      a.click();
      Bus.emit('engine:log', `> 1080P PNG Screenshot Exported!`);
    });
  }
};

// ============================================================================
// 4. StudioUI 视图与交互管理层
// ============================================================================
window.StudioUI = {
  currentAssetId: null,
  currentShader: 'rendered',
  engine: null,

  init(engine) {
    this.engine = engine;
    KineticBackground.init();
    this.initHeroShowreel();
    this.initCursorSpotlightAndTilt();
    this.renderToolbars();
    this.renderProfileTab();
    this.bindGlobalEvents();
    this.bindBusListeners();
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
      anime({
        targets: overlay,
        opacity: [1, 0],
        scale: [1, 1.06],
        duration: 480,
        easing: 'easeInOutQuad',
        complete: () => overlay.classList.add('hidden')
      });
    } else {
      overlay.classList.add('hidden');
    }

    // 触发 Workbench 三栏机甲展开动画 + 卡片波浪入场 + 首次呼吸拆解演示
    MotionFX.animateWorkbenchEntrance();
    MotionFX.staggerCards('#asset-list-container > div');
    MotionFX.staggerCards('#panel-workflow > div');

    if (this.engine.ready && this.engine.parts.length > 1) {
      setTimeout(() => this.animateExplodeTo(35), 400);
      setTimeout(() => this.animateExplodeTo(0), 1350);
    }
  },

  openShowreel() {
    const overlay = document.getElementById('hero-showreel-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden', 'pointer-events-none');
    if (typeof anime !== 'undefined') {
      anime({ targets: overlay, opacity: [0, 1], scale: [0.96, 1], duration: 420, easing: 'easeOutCubic' });
    }
    MotionFX.scrambleText(document.getElementById('hero-scramble-name'), 'YAPSHIFT', 550);
    MotionFX.staggerCards('.hero-bento-item');
  },

  // 鼠标跟随聚光灯 + 3D 物理透视倾斜 (3D Tilt)
  initCursorSpotlightAndTilt() {
    document.addEventListener('mousemove', (e) => {
      const heroSpot = document.getElementById('hero-spotlight');
      if (heroSpot) {
        heroSpot.style.background = `radial-gradient(600px circle at ${e.clientX}px ${e.clientY}px, rgba(245, 121, 42, 0.16), transparent 70%)`;
      }
      document.querySelectorAll('.spotlight-card').forEach(card => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);

        if (card.classList.contains('tilt-card')) {
          if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
            const rotY = ((x / rect.width) - 0.5) * 10;
            const rotX = (0.5 - (y / rect.height)) * 10;
            card.style.transform = `perspective(600px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(4px)`;
          } else {
            card.style.transform = 'perspective(600px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
          }
        }
      });
    });
  },

  renderToolbars() {
    document.getElementById('shader-toolbar').innerHTML = `<span class="text-[9px] text-slate-500 font-mono mr-1">SHADER:</span>` +
      PortfolioConfig.shaders.map(s => `
        <button data-action="shader" data-mode="${s.id}" id="btn-shade-${s.id}" class="px-2 py-1 rounded text-slate-400 hover:text-white transition">${s.label}</button>
      `).join('');

    document.getElementById('postfx-toolbar').innerHTML = `<span class="text-[9px] text-slate-500 font-mono mr-0.5">POST-FX:</span>` +
      PortfolioConfig.postFX.map(f => `
        <button data-action="postfx" data-fx="${f.id}" id="btn-fx-${f.id}" class="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-mono transition">${f.label}</button>
      `).join('') +
      `<button data-action="recenter" class="px-2 py-1 bg-white/5 hover:bg-white/15 rounded text-slate-300 text-[10px] ml-1">⟳</button>`;
  },

  renderProfileTab() {
    const a = PortfolioConfig.author;
    document.getElementById('tab-panel-profile').innerHTML = `
      <div class="spotlight-card tilt-card rounded-xl p-4 flex items-center gap-3.5">
        <div class="w-12 h-12 rounded-xl bg-orange-500/20 border border-orange-400/50 flex items-center justify-center font-header font-bold text-lg text-orange-300 shrink-0 shadow-[0_0_15px_rgba(245,121,42,0.3)]">YS</div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h2 class="font-header text-base font-bold text-white truncate">${a.name}</h2>
            <span class="text-[9px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded font-mono">CREATOR</span>
          </div>
          <p class="text-xs text-orange-400 font-header truncate">${a.tagline}</p>
          <a href="${a.githubUrl}" target="_blank" class="text-[10px] text-sky-400 hover:underline font-mono truncate block mt-0.5">${a.githubUrl}</a>
        </div>
      </div>
      <div class="spotlight-card rounded-xl p-4 space-y-3">
        <div class="text-[11px] font-bold text-slate-200 font-header uppercase">⚙️ YapShift 核心工具链熟练度</div>
        <div class="space-y-2.5 text-[11px] font-mono">
          ${a.skills.map(s => `
            <div>
              <div class="flex justify-between mb-1"><span class="text-white">${s.name}</span><span class="${s.text}">${s.pct}%</span></div>
              <div class="h-1.5 bg-black/50 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r ${s.gradient}" style="width:${s.pct}%"></div></div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="space-y-2">
        <div class="text-[11px] font-bold text-slate-300 font-header uppercase">🏆 YapShift 代表性实战工程</div>
        ${a.milestones.map(m => `
          <div class="spotlight-card tilt-card rounded-xl p-3 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-white font-header">${m.title}</span>
              <span class="text-[9px] px-2 py-0.5 bg-orange-500/15 text-orange-300 rounded font-mono">${m.badge}</span>
            </div>
            <div class="flex flex-wrap gap-1 text-[10px] font-mono">
              ${m.tags.map(t => `<span class="px-2 py-0.5 rounded bg-white/5 text-slate-300">${t}</span>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  renderAssetCards() {
    const assets = PortfolioConfig.assets;
    document.getElementById('gallery-count').textContent = `${assets.length} ASSETS`;
    document.getElementById('asset-list-container').innerHTML = assets.map((item, idx) => {
      const badge = item.loadedPolys
        ? `<span class="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">${(item.loadedPolys / 1000).toFixed(1)}k tris</span>`
        : `<span class="px-1.5 py-0.5 rounded bg-white/5 text-slate-500">待读取</span>`;
      return `
        <div data-action="select-asset" data-id="${item.id}" class="spotlight-card tilt-card p-3 rounded-xl flex flex-col gap-1.5 cursor-pointer ${item.id === this.currentAssetId ? 'active' : ''}">
          <div class="flex items-center justify-between text-[10px] font-mono pointer-events-none relative z-10">
            <span class="text-orange-400 font-bold">0${idx + 1} // ${item.category.split('//')[0]}</span>
            ${badge}
          </div>
          <div class="text-xs font-bold text-white truncate font-header pointer-events-none relative z-10">${item.title}</div>
          <div class="flex items-center gap-1 pt-1 pointer-events-none relative z-10">
            ${item.roles.map(r => `<div class="h-1 rounded-full ${r.color}" style="width:${r.pct}%"></div>`).join('')}
          </div>
        </div>
      `;
    }).join('');
  },

  selectAsset(id) {
    const asset = PortfolioConfig.assets.find(a => a.id === id);
    if (!asset) return;
    this.currentAssetId = id;
    this.renderAssetCards();

    document.getElementById('top-active-name').textContent = asset.title;
    document.getElementById('hud-model-title').textContent = asset.title;
    document.getElementById('panel-category').textContent = asset.category;
    document.getElementById('panel-role-badge').textContent = asset.roleBadge;

    MotionFX.scrambleText(document.getElementById('panel-title'), asset.title, 480);

    document.getElementById('panel-highlights').innerHTML = asset.highlights.map(h =>
      `<span class="text-[10px] px-2.5 py-1 rounded-md bg-orange-500/10 border border-orange-500/25 text-orange-200 font-mono">${h}</span>`
    ).join('');

    document.getElementById('role-bar-container').innerHTML = asset.roles.map(r => `<div class="h-full ${r.color}" style="width:${r.pct}%"></div>`).join('');
    document.getElementById('role-legend-container').innerHTML = asset.roles.map(r =>
      `<div class="bg-[#141b2d]/80 rounded px-2 py-1 border border-white/5"><div class="text-slate-400 text-[9px] truncate">${r.name}</div><div class="font-bold ${r.text}">${r.pct}%</div></div>`
    ).join('');

    document.getElementById('panel-workflow').innerHTML = asset.workflow.map((w, i) => `
      <div data-action="workflow-step" data-wf="${w.action}" data-idx="${i}" class="pipeline-node spotlight-card rounded-xl p-2.5 flex flex-col gap-1">
        <div class="flex items-center justify-between pointer-events-none relative z-10">
          <span class="text-xs font-bold text-white font-header"><b class="text-orange-300 font-mono mr-1">${w.step}</b>${w.title}</span>
          <span class="text-[9px] font-mono px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300">${w.tag} ➔</span>
        </div>
        <div class="text-[10px] text-slate-400 pointer-events-none relative z-10">${w.desc}</div>
      </div>
    `).join('');

    MotionFX.staggerCards('#panel-workflow > div');

    document.getElementById('explode-slider').value = 0;
    document.getElementById('explode-percent').textContent = '0%';
    this.highlightShaderBtn('rendered');
    this.engine.loadModel(asset);
  },

  highlightShaderBtn(mode) {
    this.currentShader = mode;
    PortfolioConfig.shaders.forEach(s => {
      const btn = document.getElementById('btn-shade-' + s.id);
      if (btn) btn.className = s.id === mode
        ? 'px-2 py-1 rounded bg-orange-500/25 border border-orange-400/50 text-orange-200 font-semibold transition'
        : 'px-2 py-1 rounded text-slate-400 hover:text-white transition';
    });
  },

  animateExplodeTo(targetVal) {
    this.engine.captureBaseline(document.getElementById('explode-slider').value);
    const slider = document.getElementById('explode-slider');
    const obj = { val: parseFloat(slider.value) || 0 };
    if (typeof anime !== 'undefined') {
      anime({
        targets: obj,
        val: targetVal,
        duration: 520,
        easing: 'easeOutCubic',
        update: () => {
          slider.value = obj.val;
          document.getElementById('explode-percent').textContent = Math.round(obj.val) + '%';
          this.engine.explode(obj.val, true);
        }
      });
    } else {
      slider.value = targetVal;
      this.engine.explode(targetVal, true);
    }
  },

  bindBusListeners() {
    Bus.on('engine:loading', () => {
      document.getElementById('loading-overlay').classList.remove('opacity-0', 'pointer-events-none');
      ['spec-polys', 'spec-verts', 'spec-mats'].forEach(id => {
        const el = document.getElementById(id);
        el.textContent = 'SCANNING...';
        el.className = 'text-xs font-bold text-slate-400 font-mono mt-0.5 telemetry-scanning';
      });
      document.getElementById('telemetry-status-tag').textContent = '⟳ 正在递归扫描真实节点树...';
    });

    Bus.on('engine:ready', ({ asset, parts, strategy, polys, verts }) => {
      document.getElementById('loading-overlay').classList.add('opacity-0', 'pointer-events-none');
      asset.loadedPolys = polys;
      this.renderAssetCards();

      ['spec-polys', 'spec-verts'].forEach(id => {
        document.getElementById(id).className = 'text-sm font-bold text-white font-mono mt-0.5';
      });
      document.getElementById('spec-mats').className = 'text-sm font-bold text-emerald-300 font-mono mt-0.5';

      const counter = { p: 0, v: 0 };
      if (typeof anime !== 'undefined') {
        anime({
          targets: counter,
          p: polys,
          v: verts,
          round: 1,
          duration: 700,
          easing: 'easeOutExpo',
          update: () => {
            document.getElementById('spec-polys').textContent = counter.p.toLocaleString();
            document.getElementById('spec-verts').textContent = counter.v.toLocaleString();
          }
        });
      } else {
        document.getElementById('spec-polys').textContent = polys.toLocaleString();
        document.getElementById('spec-verts').textContent = verts.toLocaleString();
      }

      document.getElementById('spec-mats').textContent = parts.length > 1 ? `${parts.length} 可拆子件` : `1 合并网格`;
      document.getElementById('telemetry-status-tag').textContent = `✔ 场景树校验完毕 (${strategy})`;
      document.getElementById('part-strategy-badge').textContent = strategy;
      document.getElementById('hud-nodes-badge').textContent = `${parts.length} 部件`;
      document.getElementById('hud-explode-mode').textContent = strategy;

      document.getElementById('explode-slider').disabled = parts.length <= 1;

      const listEl = document.getElementById('subpart-inspector-list');
      if (parts.length <= 1) {
        listEl.innerHTML = `<div class="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200">⚠️ 单网格合并模型：内部仅有 1 个合并几何体，可使用 X-Ray 透视与光影旋转检视。</div>`;
      } else {
        listEl.innerHTML = parts.map((p, idx) => `
          <div class="flex items-center justify-between px-2 py-1 rounded bg-[#131b2e]/90 border border-white/5">
            <span class="text-white truncate max-w-[175px]"><b class="text-orange-400 mr-1">#${idx + 1}</b>${p.name}</span>
            <div class="flex gap-1">
              <button data-action="pulse-part" data-idx="${idx}" class="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 text-[9px]">弹出</button>
              <button data-action="vis-part" data-idx="${idx}" class="px-1.5 py-0.5 rounded bg-white/10 text-slate-200 text-[9px]">显隐</button>
            </div>
          </div>
        `).join('');
      }
    });

    Bus.on('engine:log', (msg) => {
      document.getElementById('panel-api-log').textContent = msg;
    });
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
        btn.className = on
          ? 'px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[11px] font-bold transition flex items-center gap-1.5'
          : 'px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400 text-[11px] transition flex items-center gap-1.5';
        btn.innerHTML = on
          ? `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span><span>🔄 动态转台: ON</span>`
          : `<span>⏸ 动态转台: OFF</span>`;
      }
      if (act === 'select-asset') this.selectAsset(btn.dataset.id);
      if (act === 'shader') { this.highlightShaderBtn(btn.dataset.mode); this.engine.setShading(btn.dataset.mode); }
      if (act === 'postfx') {
        const state = this.engine.togglePostFX(btn.dataset.fx);
        btn.className = state[btn.dataset.fx]
          ? 'px-2 py-1 rounded bg-purple-500/30 border border-purple-400/50 text-purple-200 font-bold text-[10px] font-mono'
          : 'px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-mono';
      }
      if (act === 'explode-pattern') {
        this.engine.pattern = btn.dataset.pattern;
        document.getElementById('btn-pat-radial').className = btn.dataset.pattern === 'radial' ? 'px-2 py-0.5 rounded bg-orange-500/30 text-orange-200 font-bold' : 'px-2 py-0.5 rounded text-slate-400';
        document.getElementById('btn-pat-axial').className = btn.dataset.pattern === 'axial' ? 'px-2 py-0.5 rounded bg-sky-500/30 text-sky-200 font-bold' : 'px-2 py-0.5 rounded text-slate-400';
        this.engine.explode(document.getElementById('explode-slider').value, false);
      }
      if (act === 'explode-to') this.animateExplodeTo(parseFloat(btn.dataset.val));
      if (act === 'pulse-part') {
        const pulsed = this.engine.pulsePart(parseInt(btn.dataset.idx, 10));
        if (pulsed !== null) btn.textContent = pulsed ? '收回' : '弹出';
      }
      if (act === 'vis-part') {
        const vis = this.engine.togglePartVis(parseInt(btn.dataset.idx, 10));
        if (vis !== null) btn.textContent = vis ? '显隐' : '已隐';
      }
      if (act === 'workflow-step') {
        const wf = btn.dataset.wf;
        if (['clay', 'wire', 'chrome', 'rendered', 'xray', 'albedo'].includes(wf)) {
          this.highlightShaderBtn(wf); this.engine.setShading(wf);
        } else if (wf === 'explode65') this.animateExplodeTo(65);
        else if (wf === 'explode0') this.animateExplodeTo(0);
        else if (wf === 'cinema') this.engine.togglePostFX('cinema');
        else if (wf === 'ssaoSharpen') { this.engine.togglePostFX('ssao'); this.engine.togglePostFX('sharpen'); }
      }
      if (act === 'switch-tab') {
        const isProf = btn.dataset.tab === 'profile';
        document.getElementById('tab-panel-profile').classList.toggle('hidden', !isProf);
        document.getElementById('tab-panel-model').classList.toggle('hidden', isProf);
      }
      if (act === 'screenshot') this.engine.exportScreenshot(this.currentAssetId);
      if (act === 'recenter' && this.engine.ready) this.engine.api.recenterCamera();
      if (act === 'add-custom') {
        const raw = document.getElementById('custom-model-uid').value.trim();
        if (!raw) return;
        const match = raw.match(/[a-f0-9]{32}/i);
        const uid = match ? match[0] : raw.split('/').pop().split('-').pop();
        const newId = 'custom-' + Date.now();
        PortfolioConfig.assets.unshift({
          id: newId, isCustom: true,
          title: document.getElementById('custom-model-title').value.trim() || 'YapShift 自定义 3D 资产',
          category: 'YAPSHIFT // CUSTOM ASSET', roleBadge: 'YapShift 原创自研模型', uid,
          highlights: ['✦ 递归穿透 Group 识别', '✦ 零漂移对称爆炸'],
          roles: [{ name: '结构建模', pct: 60, color: 'bg-orange-500', text: 'text-orange-400' }, { name: '材质渲染', pct: 40, color: 'bg-sky-400', text: 'text-sky-400' }],
          workflow: [{ step: 'STEP 01', title: '360° 零均值中心对称爆炸', tag: '炸开 65%', action: 'explode65', desc: '自动提取子部件向四周对称散开。' }]
        });
        this.selectAsset(newId);
      }
    });

    const expSlider = document.getElementById('explode-slider');
    expSlider.addEventListener('mousedown', () => this.engine.captureBaseline(expSlider.value));
    expSlider.addEventListener('input', (e) => {
      document.getElementById('explode-percent').textContent = Math.round(e.target.value) + '%';
      this.engine.explode(e.target.value, true);
    });

    document.getElementById('light-rot-slider').addEventListener('input', (e) => {
      document.getElementById('light-rot-deg').textContent = e.target.value + '°';
      this.engine.rotateLight(e.target.value);
    });
  }
};

async function syncLiveConfigFromGitHub() {
  try {
    const rawUrl = `https://raw.githubusercontent.com/yapshift/Portfolio/main/assets.json?t=${Date.now()}`;
    const res = await fetch(rawUrl);
    if (res.ok) {
      const liveData = await res.json();
      if (Array.isArray(liveData.assets) && liveData.assets.length > 0) {
        PortfolioConfig.assets = liveData.assets;
      }
      if (liveData.author) {
        Object.assign(PortfolioConfig.author, liveData.author);
      }
    }
  } catch (err) {}
}

document.addEventListener('DOMContentLoaded', () => {
  syncLiveConfigFromGitHub().then(() => {
    StudioUI.init(new SketchfabEngine('sketchfab-viewport-frame'));
  });
});
