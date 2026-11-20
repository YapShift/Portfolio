/**
 * YapShift 3D Workbench Engine (app-engine.js)
 * Orchestrates multi-iframe WebGL caching, uninterrupted auto-resuming spin,
 * custom tactical cursor HUD, and linked CAD part-name callouts.
 */

const EventBus = {
  listeners: {},
  on(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); },
  emit(event, payload) { (this.listeners[event] || []).forEach(fn => fn(payload)); }
};

/**
 * Exclusive Tactical Cursor Follower & Linked CAD Part-Name Callout System
 */
const CustomCursorHUD = {
  el: null,
  idxEl: null,
  nameEl: null,
  x: -9999, y: -9999,
  tx: -9999, ty: -9999,
  visible: false,
  lockedPartActive: false,

  init() {
    const curCfg = window.PortfolioConfig.cursor;
    if (!curCfg.enabled) return;

    this.el = document.getElementById('yapshift-cursor-hud');
    this.idxEl = document.getElementById('cursor-part-idx');
    this.nameEl = document.getElementById('cursor-part-name');
    if (!this.el) return;

    // Track pointer smoothly across all parent UI surfaces
    window.addEventListener('mousemove', (e) => {
      this.setTarget(e.clientX, e.clientY, false);
      const isCtrl = Boolean(e.target.closest('button, a, input, [data-action]'));
      this.el.classList.toggle('is-interactive', isCtrl && !this.lockedPartActive);
    }, { passive: true });

    // Hide trailing ring when pointer enters cross-origin iframe empty space (until a 3D part is hovered)
    const pool = document.getElementById('sketchfab-viewport-pool');
    if (pool) {
      pool.addEventListener('mouseenter', () => {
        if (!this.lockedPartActive) this.hide();
      });
    }
    document.addEventListener('mouseleave', () => this.hide());

    requestAnimationFrame(() => this.loop());
  },

  setTarget(clientX, clientY, snapImmediately = false) {
    if (!this.el) return;
    this.tx = clientX;
    this.ty = clientY;
    if (snapImmediately || !this.visible) {
      this.x = clientX;
      this.y = clientY;
    }
    this.show();
    const flipLimit = window.PortfolioConfig.cursor.flipLeftThresholdPx;
    this.el.classList.toggle('flip-left', clientX > window.innerWidth - flipLimit);
  },

  lockOnPart(part, idx, coords) {
    if (!this.el || !part || idx === null) {
      this.unlockPart(false);
      return;
    }
    this.lockedPartActive = true;
    this.idxEl.textContent = `#${String(idx + 1).padStart(2, '0')}`;
    this.nameEl.textContent = part.name;
    this.el.classList.remove('is-interactive');
    this.el.classList.add('is-part-lock');

    if (coords && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
      this.setTarget(coords[0], coords[1], true);
    }
  },

  unlockPart(keepCursorVisible = false) {
    if (!this.el) return;
    this.lockedPartActive = false;
    this.el.classList.remove('is-part-lock');
    if (!keepCursorVisible) this.hide();
  },

  show() {
    if (!this.el || this.visible) return;
    this.visible = true;
    this.el.classList.remove('opacity-0');
  },

  hide() {
    if (!this.el || !this.visible) return;
    this.visible = false;
    this.lockedPartActive = false;
    this.el.classList.remove('is-part-lock', 'is-interactive');
    this.el.classList.add('opacity-0');
  },

  loop() {
    requestAnimationFrame(() => this.loop());
    if (!this.visible || !this.el) return;
    const lerp = window.PortfolioConfig.cursor.followLerp;
    this.x += (this.tx - this.x) * lerp;
    this.y += (this.ty - this.y) * lerp;
    this.el.style.transform = `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0)`;
  }
};

/**
 * Batched 2D Canvas architectural grid & breathing reticle stage
 */
const AnimeGridStage = {
  canvas: null, ctx: null, w: 0, h: 0, dpr: 1,
  mouse: { x: -9999, y: -9999, tx: -9999, ty: -9999 },
  accentRGB: '224, 90, 43',
  explodeT: 0, targetExplodeT: 0,
  pausedUntil: 0, lastFrame: 0,

  init() {
    const cfg = window.PortfolioConfig;
    this.accentRGB = cfg.theme.accentRGB;
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
    const maxDpr = window.PortfolioConfig.background.maxDevicePixelRatio;
    this.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  },

  setAccent(rgb) { this.accentRGB = rgb || window.PortfolioConfig.theme.accentRGB; },
  setExplodeProgress(t) { this.targetExplodeT = Math.max(0, Math.min(1, t)); },
  yieldToWebGL(ms) {
    const pause = ms !== undefined ? ms : window.PortfolioConfig.background.webglYieldPauseMs;
    this.pausedUntil = Date.now() + pause;
  },

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const bgCfg = window.PortfolioConfig.background;
    if (now - this.lastFrame < bgCfg.frameIntervalMs) return;
    if (Date.now() < this.pausedUntil) return;
    this.lastFrame = now;

    this.mouse.x += (this.mouse.tx - this.mouse.x) * 0.15;
    this.mouse.y += (this.mouse.ty - this.mouse.y) * 0.15;
    this.explodeT += (this.targetExplodeT - this.explodeT) * 0.12;
    this.draw(bgCfg);
  },

  draw(bgCfg) {
    const ctx = this.ctx, w = this.w, h = this.h;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.5, cy = h * 0.5;
    const rgb = this.accentRGB;

    const studioGlow = ctx.createRadialGradient(cx, cy, 30, cx, cy, Math.max(w, h) * 0.52);
    studioGlow.addColorStop(0, `rgba(${rgb}, ${0.055 + this.explodeT * 0.035})`);
    studioGlow.addColorStop(0.5, 'rgba(255, 255, 255, 0.015)');
    studioGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = studioGlow;
    ctx.fillRect(0, 0, w, h);

    const spacing = bgCfg.gridSpacing;
    const majorStep = bgCfg.majorCrosshairStep;
    const cols = Math.ceil(w / spacing);
    const rows = Math.ceil(h / spacing);
    const mx = this.mouse.x, my = this.mouse.y;
    const interactR = bgCfg.magneticRadius;
    const interactR2 = interactR * interactR;
    const baseCross = bgCfg.crosshairBaseSize;
    const dotSize = bgCfg.dotBaseRadius * 1.8;
    const activeNodes = [];

    ctx.beginPath();
    for (let r = 0; r <= rows; r++) {
      const baseY = r * spacing;
      const dy = baseY - my;
      const dy2 = dy * dy;
      for (let c = 0; c <= cols; c++) {
        if (r % majorStep === 0 && c % majorStep === 0) continue;
        const baseX = c * spacing;
        const dx = baseX - mx;
        const d2 = dx * dx + dy2;
        if (d2 < interactR2) {
          activeNodes.push({ baseX, baseY, dx, dy, dist: Math.sqrt(d2), isMajor: false });
        } else {
          ctx.rect(baseX - dotSize * 0.5, baseY - dotSize * 0.5, dotSize, dotSize);
        }
      }
    }
    ctx.fillStyle = `rgba(244, 244, 245, ${bgCfg.minorBaseAlpha})`;
    ctx.fill();

    ctx.beginPath();
    for (let r = 0; r <= rows; r += majorStep) {
      const baseY = r * spacing;
      const dy = baseY - my;
      const dy2 = dy * dy;
      for (let c = 0; c <= cols; c += majorStep) {
        const baseX = c * spacing;
        const dx = baseX - mx;
        const d2 = dx * dx + dy2;
        if (d2 < interactR2) {
          activeNodes.push({ baseX, baseY, dx, dy, dist: Math.sqrt(d2), isMajor: true });
        } else {
          ctx.moveTo(baseX - baseCross, baseY); ctx.lineTo(baseX + baseCross, baseY);
          ctx.moveTo(baseX, baseY - baseCross); ctx.lineTo(baseX, baseY + baseCross);
        }
      }
    }
    ctx.strokeStyle = `rgba(244, 244, 245, ${bgCfg.majorBaseAlpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let i = 0; i < activeNodes.length; i++) {
      const n = activeNodes[i];
      const mix = 1 - n.dist / interactR;
      const push = mix * mix * bgCfg.magneticPushStrength;
      const px = n.dist > 1 ? n.baseX + (n.dx / n.dist) * push : n.baseX;
      const py = n.dist > 1 ? n.baseY + (n.dy / n.dist) * push : n.baseY;
      const alpha = (n.isMajor ? bgCfg.majorBaseAlpha : bgCfg.minorBaseAlpha) + mix * bgCfg.hoverAlphaBoost;

      if (n.isMajor) {
        const s = baseCross + mix * 1.8;
        ctx.strokeStyle = mix > 0.2 ? `rgba(${rgb}, ${alpha})` : `rgba(244, 244, 245, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(px - s, py); ctx.lineTo(px + s, py);
        ctx.moveTo(px, py - s); ctx.lineTo(px, py + s);
        ctx.stroke();
      } else {
        ctx.fillStyle = mix > 0.25 ? `rgba(${rgb}, ${alpha})` : `rgba(244, 244, 245, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, bgCfg.dotBaseRadius + mix * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const rMain = Math.min(w, h) * (bgCfg.reticleRadiusRatio + this.explodeT * bgCfg.reticleExplodeExpand);
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

/**
 * Multi-Iframe Parallel Sketchfab WebGL Pool Engine
 */
class SketchfabPoolEngine {
  constructor() {
    const cfg = window.PortfolioConfig;
    this.poolContainer = document.getElementById('sketchfab-viewport-pool');
    this.instances = new Map();
    this.activeAssetId = null;
    this.mode = 'radial';
    this.autoSpinEnabled = cfg.turntable.enabledByDefault;
    this.lastSpinTick = 0;
    this.bindGlobalInteractionFallback();
    this.startInPlaceSpinLoop();
  }

  get activeCtx() { return this.instances.get(this.activeAssetId) || null; }
  get ready() { const ctx = this.activeCtx; return Boolean(ctx && ctx.ready); }

  // Failsafe listener in case pointer drag starts inside iframe and releases outside
  bindGlobalInteractionFallback() {
    const scheduleResume = () => {
      const ctx = this.activeCtx;
      if (!ctx || !ctx.userInteracting) return;
      this.scheduleSpinResume(ctx, window.PortfolioConfig.turntable.resumeAfterCameraIdleMs);
    };
    window.addEventListener('pointerup', scheduleResume, { passive: true });
    window.addEventListener('touchend', scheduleResume, { passive: true });
  }

  scheduleSpinResume(ctx, delayMs) {
    if (ctx.interactTimer) clearTimeout(ctx.interactTimer);
    if (ctx.watchdogTimer) clearTimeout(ctx.watchdogTimer);
    ctx.interactTimer = setTimeout(() => {
      ctx.userInteracting = false;
    }, delayMs);
  }

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
    let count = 0;
    this.instances.forEach(ctx => { if (ctx.ready) count++; });
    return count;
  }

  getZoomMultiplier(explodeVal) {
    const expCfg = window.PortfolioConfig.explosion;
    const factor = (parseFloat(explodeVal) || 0) / 100;
    return 1 + factor * (this.mode === 'linear' ? expCfg.cameraZoomLinear : expCfg.cameraZoomRadial);
  }

  syncCameraBaseline(ctx) {
    if (!ctx || !ctx.ready || !ctx.api) return;
    if (ctx.focusedPartIdx !== null) return;
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

  configureHighlightStyle(api) {
    if (typeof api.setHighlightOptions !== 'function') return;
    const interCfg = window.PortfolioConfig.interaction;
    api.setHighlightOptions({
      outlineWidth: interCfg.outlineWidth,
      outlineColor: interCfg.outlineColor,
      outlineDuration: 0,
      highlightColor: interCfg.outlineColor,
      highlightDuration: 0
    });
  }

  /**
   * Hover part handler:
   * Suppresses part-name callout & outline when a single part is already isolated/focused.
   */
  hoverPart(idx, screenCoords = null, fromList = false) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return;

    const onlyWhenUnfocused = window.PortfolioConfig.cursor.showPartLabelOnlyWhenUnfocused;
    if (onlyWhenUnfocused && ctx.focusedPartIdx !== null) {
      if (ctx.hoveredPartIdx !== null) {
        ctx.hoveredPartIdx = null;
        if (typeof ctx.api.highlightNode === 'function') ctx.api.highlightNode();
      }
      EventBus.emit('engine:hover-updated', { idx: null, part: null, screenCoords: null, fromList });
      return;
    }

    if (ctx.hoveredPartIdx !== idx) {
      ctx.hoveredPartIdx = idx;
      if (typeof ctx.api.highlightNode === 'function') {
        const part = idx !== null ? ctx.parts[idx] : null;
        if (part) ctx.api.highlightNode(part.instanceID);
        else ctx.api.highlightNode();
      }
    }

    EventBus.emit('engine:hover-updated', {
      idx,
      part: idx !== null ? ctx.parts[idx] : null,
      screenCoords,
      fromList
    });
  }

  clearHover(fromList = false) {
    const ctx = this.activeCtx;
    if (ctx && ctx.hoveredPartIdx !== null) {
      ctx.hoveredPartIdx = null;
      if (ctx.api && typeof ctx.api.highlightNode === 'function') ctx.api.highlightNode();
    }
    EventBus.emit('engine:hover-updated', { idx: null, part: null, screenCoords: null, fromList });
  }

  // Project 3D hit point (or 2D canvas point) into exact parent viewport CSS coordinates
  resolveAndEmitPartHover(ctx, partIdx, info) {
    const part = ctx.parts[partIdx];
    if (!part) return;

    const rect = ctx.iframe.getBoundingClientRect();
    let initialCoords = null;

    if (info && Array.isArray(info.position2D) && info.position2D.length >= 2) {
      let [x, y] = info.position2D;
      if (x > rect.width * 1.05 || y > rect.height * 1.05) {
        const dpr = window.devicePixelRatio || 1;
        x /= dpr;
        y /= dpr;
      }
      initialCoords = [rect.left + x, rect.top + y];
    }

    // Emit immediately if 2D coordinates are ready
    if (initialCoords) {
      this.hoverPart(partIdx, initialCoords, false);
    }

    // Project exact 3D hit point via Sketchfab's authoritative top-left CSS coordinate converter
    const worldPt = (info && Array.isArray(info.position3D) && info.position3D) || part.worldPos;
    if (worldPt && typeof ctx.api.getWorldToScreenCoordinates === 'function') {
      ctx.api.getWorldToScreenCoordinates(worldPt, (coord) => {
        if (this.activeAssetId !== ctx.asset.id) return;
        if (ctx.focusedPartIdx !== null) return;
        if (coord && Array.isArray(coord.canvasCoord)) {
          const exactCoords = [
            rect.left + coord.canvasCoord[0],
            rect.top + coord.canvasCoord[1]
          ];
          this.hoverPart(partIdx, exactCoords, false);
        } else if (!initialCoords) {
          this.hoverPart(partIdx, [rect.left + rect.width * 0.5, rect.top + rect.height * 0.5], false);
        }
      });
    } else if (!initialCoords) {
      this.hoverPart(partIdx, [rect.left + rect.width * 0.5, rect.top + rect.height * 0.5], false);
    }
  }

  ensureInstance(asset) {
    if (this.instances.has(asset.id)) return this.instances.get(asset.id);

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
      parts: [], spinRoots: [], nodeToPartIndex: {}, allGeometryIDs: [],
      baseMaterials: [], materialsDirty: false,
      collisionBadge: '', polys: 0, verts: 0,
      camDist: 4.0, spinCenter: [0, 0, 0], defaultCam: null, baselineCam: null,
      explodeVal: 0, shaderMode: 'rendered', lightDeg: 0, spinAngle: 0,
      focusedPartIdx: null, hoveredPartIdx: null, savedPreFocusCam: null,
      userInteracting: false, interactTimer: null, watchdogTimer: null,
      programmaticCamUntil: 0, explodingUntil: 0
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
          this.configureHighlightStyle(api);
          const turnCfg = window.PortfolioConfig.turntable;
          const pickOpts = { pick: window.PortfolioConfig.interaction.pickMode || 'slow' };

          // Pause spin immediately when camera starts moving + set watchdog so wheel-zoom never stalls spin
          api.addEventListener('camerastart', () => {
            if (Date.now() < ctx.programmaticCamUntil) return;
            ctx.userInteracting = true;
            if (ctx.interactTimer) clearTimeout(ctx.interactTimer);
            if (ctx.watchdogTimer) clearTimeout(ctx.watchdogTimer);
            ctx.watchdogTimer = setTimeout(() => {
              ctx.userInteracting = false;
            }, turnCfg.interactionWatchdogMs);
          });

          // Unconditionally resume spin after camera movement settles
          api.addEventListener('cameraend', () => {
            if (Date.now() >= ctx.programmaticCamUntil) {
              this.syncCameraBaseline(ctx);
            }
            this.scheduleSpinResume(ctx, turnCfg.resumeAfterCameraIdleMs);
          });

          // 3D part hover -> outline + linked reticle callout (only when not isolated)
          api.addEventListener('nodeMouseEnter', (info) => {
            if (this.activeAssetId !== asset.id || !info || info.instanceID == null) return;
            if (ctx.parts.length <= 1 || ctx.focusedPartIdx !== null) return;
            const partIdx = ctx.nodeToPartIndex[info.instanceID];
            if (partIdx !== undefined) {
              this.resolveAndEmitPartHover(ctx, partIdx, info);
            }
          }, pickOpts);

          api.addEventListener('nodeMouseLeave', () => {
            if (this.activeAssetId !== asset.id) return;
            this.clearHover(false);
          }, pickOpts);

          // 3D part click -> isolate & center zoom
          api.addEventListener('click', (info) => {
            if (!info || info.instanceID == null || ctx.parts.length <= 1) return;
            const partIdx = ctx.nodeToPartIndex[info.instanceID];
            if (partIdx !== undefined) {
              this.selectSinglePartToFocus(partIdx, info.position3D);
            }
          }, pickOpts);

          const camPromise = new Promise(resolve => api.getCameraLookAt((err, cam) => resolve(!err ? cam : null)));
          const matPromise = new Promise(resolve => api.getMaterialList((err, mats) => resolve(!err && mats ? mats : [])));
          const nodePromise = new Promise(resolve => api.getNodeMap((err, nodeMap) => resolve(!err ? nodeMap : null)));

          Promise.all([camPromise, matPromise, nodePromise, metaPromise]).then(([cam, mats, nodeMap, meta]) => {
            if (cam) {
              const vx = cam.position[0] - cam.target[0];
              const vy = cam.position[1] - cam.target[1];
              const vz = cam.position[2] - cam.target[2];
              ctx.camDist = Math.max(0.1, Math.hypot(vx, vy, vz));
              ctx.spinCenter = [cam.target[0], cam.target[1], cam.target[2]];
              ctx.defaultCam = { position: cam.position.slice(), target: cam.target.slice() };
              ctx.baselineCam = { target: cam.target.slice(), baseVec: [vx, vy, vz] };
            }

            ctx.baseMaterials = JSON.parse(JSON.stringify(mats));
            const res = SceneGraphMath.analyzeAndBuildVectors(nodeMap, ctx.camDist);
            ctx.parts = res.parts;
            ctx.spinRoots = res.spinRoots;
            ctx.nodeToPartIndex = res.nodeToPartIndex;
            ctx.allGeometryIDs = res.allGeometryIDs;
            ctx.collisionBadge = res.collisionBadge;

            ctx.polys = meta.faceCount || Math.max(12400, ctx.parts.length * 3650);
            ctx.verts = meta.vertexCount || Math.round(ctx.polys * 0.58);
            asset.loadedPolys = ctx.polys;
            ctx.ready = true;

            EventBus.emit('engine:preload-updated');
            if (this.activeAssetId === asset.id) EventBus.emit('engine:ready', ctx);
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

  resetModelState(ctx) {
    if (!ctx || !ctx.ready || !ctx.api) return;

    ctx.userInteracting = false;
    if (ctx.interactTimer) clearTimeout(ctx.interactTimer);
    if (ctx.watchdogTimer) clearTimeout(ctx.watchdogTimer);

    if (ctx.hoveredPartIdx !== null) {
      ctx.hoveredPartIdx = null;
      if (typeof ctx.api.highlightNode === 'function') ctx.api.highlightNode();
    }

    if (ctx.focusedPartIdx !== null) {
      ctx.focusedPartIdx = null;
      ctx.savedPreFocusCam = null;
      ctx.allGeometryIDs.forEach(gid => ctx.api.show(gid));
    }

    if (ctx.explodeVal !== 0) {
      ctx.explodeVal = 0;
      ctx.parts.forEach(p => ctx.api.translate(p.instanceID, p.origPos, { duration: 0 }));
    }

    if (ctx.spinAngle !== 0) {
      ctx.spinAngle = 0;
      ctx.spinRoots.forEach(r => ctx.api.setMatrix(r.instanceID, r.L0));
    }

    if (ctx.shaderMode !== 'rendered') {
      ctx.shaderMode = 'rendered';
      ctx.api.setWireframe(false);
      ctx.api.setShadingStyle('lit');
      if (ctx.materialsDirty) {
        ctx.baseMaterials.forEach(mat => ctx.api.setMaterial(JSON.parse(JSON.stringify(mat))));
        ctx.materialsDirty = false;
      }
    }

    if (ctx.lightDeg !== 0) {
      ctx.lightDeg = 0;
      ctx.api.setEnvironment({ enable: true, rotation: 0 });
    }

    ctx.programmaticCamUntil = Date.now() + 800;
    if (ctx.defaultCam) {
      const p = ctx.defaultCam.position, t = ctx.defaultCam.target;
      ctx.api.setCameraLookAt(p, t, 0.35);
      ctx.baselineCam = { target: t.slice(), baseVec: [p[0] - t[0], p[1] - t[1], p[2] - t[2]] };
    } else {
      ctx.api.recenterCamera();
    }
  }

  selectModel(asset) {
    const prevCtx = this.activeCtx;
    if (prevCtx && prevCtx.asset.id !== asset.id) {
      this.resetModelState(prevCtx);
    }

    this.activeAssetId = asset.id;
    this.mode = 'radial';
    const targetCtx = this.ensureInstance(asset);

    this.instances.forEach((ctx, id) => {
      const active = id === asset.id;
      ctx.iframe.style.opacity = active ? '1' : '0';
      ctx.iframe.style.pointerEvents = active ? 'auto' : 'none';
      ctx.iframe.style.zIndex = active ? '10' : '1';
    });

    if (targetCtx.ready) {
      this.resetModelState(targetCtx);
      EventBus.emit('engine:ready', targetCtx);
    } else {
      EventBus.emit('engine:loading');
    }
  }

  startInPlaceSpinLoop() {
    const tick = (now) => {
      requestAnimationFrame(tick);
      const turnCfg = window.PortfolioConfig.turntable;
      if (now - this.lastSpinTick < turnCfg.frameIntervalMs) return;
      this.lastSpinTick = now;

      const heroOverlay = document.getElementById('hero-overlay');
      if (heroOverlay && !heroOverlay.classList.contains('hidden')) return;

      const ctx = this.activeCtx;
      if (!ctx || !ctx.ready || !ctx.api || !this.autoSpinEnabled) return;
      if (ctx.userInteracting || Date.now() < ctx.explodingUntil || ctx.focusedPartIdx !== null) return;
      if (!ctx.spinRoots.length) return;

      ctx.spinAngle = (ctx.spinAngle + turnCfg.stepRadians) % (Math.PI * 2);
      ctx.spinRoots.forEach(rootInfo => {
        const extraOffset = (rootInfo.partIdx !== null && ctx.explodeVal > 0)
          ? SceneGraphMath.getPartLocalOffset(ctx.parts[rootInfo.partIdx], ctx.explodeVal, this.mode)
          : null;
        const localMat = SceneGraphMath.computeRootSpinLocalMatrix(rootInfo, ctx.spinCenter, ctx.spinAngle, extraOffset);
        ctx.api.setMatrix(rootInfo.instanceID, localMat);
      });
    };
    requestAnimationFrame(tick);
  }

  toggleAutoSpin() {
    this.autoSpinEnabled = !this.autoSpinEnabled;
    return this.autoSpinEnabled;
  }

  captureBaseline(currentSliderVal) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api || ctx.focusedPartIdx !== null) return Promise.resolve();
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

  explode(percent, adjustCam = true, durationSec = 0.65) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api || ctx.parts.length <= 1) return;

    const interCfg = window.PortfolioConfig.interaction;
    ctx.explodeVal = parseFloat(percent) || 0;
    const now = Date.now();
    ctx.explodingUntil = now + durationSec * 1000 + 180;
    AnimeGridStage.setExplodeProgress(ctx.explodeVal / 100);
    if (durationSec > 0) AnimeGridStage.yieldToWebGL();

    const positions = SceneGraphMath.evaluateExplosionFrame(ctx.parts, ctx.explodeVal, this.mode);
    const opts = durationSec > 0 ? { duration: durationSec, easing: 'easeOutCubic' } : { duration: 0 };

    ctx.parts.forEach((p, idx) => {
      if (!positions[idx]) return;
      if (p.isSpinRoot && ctx.spinAngle !== 0 && durationSec === 0) {
        const rootInfo = ctx.spinRoots.find(r => r.instanceID === p.instanceID);
        if (rootInfo) {
          const offset = SceneGraphMath.getPartLocalOffset(p, ctx.explodeVal, this.mode);
          const localMat = SceneGraphMath.computeRootSpinLocalMatrix(rootInfo, ctx.spinCenter, ctx.spinAngle, offset);
          ctx.api.setMatrix(p.instanceID, localMat);
          return;
        }
      }
      ctx.api.translate(p.instanceID, positions[idx], opts);
    });

    if (adjustCam && ctx.baselineCam && durationSec > 0 && ctx.focusedPartIdx === null) {
      const z = this.getZoomMultiplier(ctx.explodeVal);
      const t = ctx.baselineCam.target;
      const v = ctx.baselineCam.baseVec;
      ctx.programmaticCamUntil = now + durationSec * 1000 + interCfg.cameraLockBufferMs;
      ctx.api.setCameraLookAt(
        [t[0] + v[0] * z, t[1] + v[1] * z, t[2] + v[2] * z],
        t,
        durationSec
      );
    }
  }

  savePreFocusCameraIfNeeded(ctx) {
    if (ctx.savedPreFocusCam) return Promise.resolve();
    return new Promise((resolve) => {
      ctx.api.getCameraLookAt((err, cam) => {
        if (!err && cam) {
          ctx.savedPreFocusCam = {
            position: cam.position.slice(),
            target: cam.target.slice()
          };
        }
        resolve();
      });
    });
  }

  async selectSinglePartToFocus(idx, hitPos3D = null) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api || !ctx.parts[idx]) return;

    if (ctx.focusedPartIdx === idx) {
      this.exitFocusMode();
      return;
    }

    const interCfg = window.PortfolioConfig.interaction;
    await this.savePreFocusCameraIfNeeded(ctx);
    ctx.focusedPartIdx = idx;
    this.clearHover(false);

    const targetPart = ctx.parts[idx];
    const keepSet = new Set(targetPart.geoIDs || []);
    ctx.allGeometryIDs.forEach(gid => {
      if (keepSet.has(gid)) ctx.api.show(gid);
      else ctx.api.hide(gid);
    });

    EventBus.emit('engine:isolation-updated', ctx);

    ctx.programmaticCamUntil = Date.now() + 1400;
    setTimeout(() => {
      if (!ctx.api || ctx.focusedPartIdx !== idx) return;
      if (typeof ctx.api.focusOnVisibleGeometries === 'function') {
        ctx.api.focusOnVisibleGeometries();
      } else {
        const center = hitPos3D || targetPart.worldPos || ctx.spinCenter;
        const base = ctx.savedPreFocusCam || ctx.defaultCam;
        if (base) {
          const r = interCfg.fallbackFocusDistanceRatio;
          const dir = [base.position[0] - base.target[0], base.position[1] - base.target[1], base.position[2] - base.target[2]];
          ctx.api.setCameraLookAt(
            [center[0] + dir[0] * r, center[1] + dir[1] * r, center[2] + dir[2] * r],
            center,
            interCfg.focusTransitionSec
          );
        }
      }
    }, interCfg.focusBoxUpdateDelayMs);
  }

  exitFocusMode() {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return;
    const interCfg = window.PortfolioConfig.interaction;

    ctx.focusedPartIdx = null;
    this.clearHover(false);
    ctx.allGeometryIDs.forEach(gid => ctx.api.show(gid));

    if (ctx.savedPreFocusCam) {
      const saved = ctx.savedPreFocusCam;
      ctx.savedPreFocusCam = null;
      ctx.programmaticCamUntil = Date.now() + 1100;
      ctx.api.setCameraLookAt(saved.position, saved.target, interCfg.focusTransitionSec);
    }

    EventBus.emit('engine:isolation-updated', ctx);
  }

  recenter() {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return;
    if (ctx.focusedPartIdx !== null) {
      this.exitFocusMode();
      return;
    }
    const settleMs = window.PortfolioConfig.interaction.recenterSettleMs;
    ctx.programmaticCamUntil = Date.now() + settleMs + 300;
    ctx.api.recenterCamera(() => {
      setTimeout(() => {
        ctx.programmaticCamUntil = 0;
        this.syncCameraBaseline(ctx);
      }, settleMs);
    });
  }

  setShading(mode) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.api) return;
    ctx.shaderMode = mode;

    const themeCfg = window.PortfolioConfig.theme;
    const shaderDef = themeCfg.shaders.find(s => s.id === mode);
    if (shaderDef) AnimeGridStage.setAccent(shaderDef.rgb);

    if (mode === 'wire') {
      ctx.api.setShadingStyle('lit');
      ctx.api.setWireframe(true, { color: themeCfg.wireframeHex });
      return;
    }

    ctx.api.setWireframe(false);
    if (mode === 'clay')   { ctx.api.setShadingStyle('matcap'); return; }
    if (mode === 'albedo') { ctx.api.setShadingStyle('shadeless'); return; }
    ctx.api.setShadingStyle('lit');

    if (!ctx.baseMaterials.length) return;
    if (mode === 'xray') {
      ctx.baseMaterials.forEach(baseMat => {
        const mat = JSON.parse(JSON.stringify(baseMat));
        if (mat.channels && mat.channels.Opacity) {
          mat.channels.Opacity.enable = true;
          mat.channels.Opacity.type = 'alphaBlend';
          mat.channels.Opacity.factor = themeCfg.xrayOpacity;
        }
        ctx.api.setMaterial(mat);
      });
      ctx.materialsDirty = true;
    } else if (ctx.materialsDirty) {
      ctx.baseMaterials.forEach(baseMat => {
        ctx.api.setMaterial(JSON.parse(JSON.stringify(baseMat)));
      });
      ctx.materialsDirty = false;
    }
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
    const interCfg = window.PortfolioConfig.interaction;
    ctx.api.getScreenShot(interCfg.screenshotWidth, interCfg.screenshotHeight, 'image/png', (err, url) => {
      if (err || !url) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = `YapShift_${ctx.asset.id}_${Date.now()}.png`;
      a.click();
    });
  }
}

/**
 * UI Controller & Event Binding
 */
const StudioUI = {
  engine: null,
  currentAssetId: null,
  drawerOpen: true,

  init() {
    const cfg = window.PortfolioConfig;
    AnimeGridStage.init();
    CustomCursorHUD.init();
    this.hydrateBrandAndHero(cfg);
    this.engine = new SketchfabPoolEngine();
    this.initCardHighlight();
    this.renderShaderBar(cfg.theme.shaders);
    this.bindEvents();
    this.bindBus();
    this.engine.preloadAll(cfg.assets);
    this.selectAsset(cfg.assets[0].id);
  },

  hydrateBrandAndHero(cfg) {
    const b = cfg.brand;
    document.getElementById('hero-brand-name').textContent = b.name;
    document.getElementById('top-brand-name').textContent = b.name;
    document.getElementById('hero-archive-tag').textContent = b.archiveTag;
    document.getElementById('hero-github-link').href = b.githubUrl;
    document.getElementById('hero-headline').textContent = b.heroHeadline;
    document.getElementById('hero-desc').textContent = b.heroDescription;
    document.getElementById('hero-footer-left').textContent = b.footerLeft;
    document.getElementById('hero-footer-right').textContent = b.footerRight;

    document.getElementById('hero-badges').innerHTML = b.heroBadges
      .map((txt, i) => (i > 0 ? `<span class="text-zinc-600">·</span><span>${txt}</span>` : `<span>${txt}</span>`))
      .join('');

    document.getElementById('hero-features').innerHTML = b.heroFeatures.map(f => `
      <div class="arch-card rounded-xl p-5 space-y-2">
        <div class="text-[10px] font-mono text-zinc-500 tracking-widest">${f.tag}</div>
        <div class="font-display text-sm font-semibold text-zinc-100">${f.title}</div>
        <p class="text-xs text-zinc-400 leading-relaxed">${f.desc}</p>
      </div>
    `).join('');

    const presetBtn = document.getElementById('btn-explode-preset');
    presetBtn.dataset.val = cfg.explosion.presetPercent;
    presetBtn.textContent = `${cfg.explosion.presetPercent}%`;
  },

  updateFocusExitBar(ctx) {
    const bar = document.getElementById('focus-exit-bar');
    const label = document.getElementById('focus-part-label');
    if (!bar || !label) return;

    if (ctx && ctx.focusedPartIdx !== null && ctx.parts[ctx.focusedPartIdx]) {
      label.textContent = `FOCUSED: ${ctx.parts[ctx.focusedPartIdx].name}`;
      bar.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-2');
    } else {
      bar.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
    }
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
    const total = window.PortfolioConfig.assets.length;
    if (ready >= total) {
      el.className = 'flex items-center gap-2 text-zinc-200';
      el.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span><span>ALL ASSETS READY (${ready}/${total})</span>`;
    } else {
      el.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-[#e05a2b] animate-pulse"></span><span>PRELOADING ASSETS (${ready}/${total})</span>`;
    }
  },

  renderShaderBar(shaders) {
    document.getElementById('shader-toolbar').innerHTML = shaders.map(s =>
      `<button data-action="shader" data-mode="${s.id}" id="btn-shade-${s.id}" class="px-2.5 py-1 rounded-lg text-zinc-400 hover:text-white transition">${s.label}</button>`
    ).join('');
  },

  renderAssetList() {
    const assets = window.PortfolioConfig.assets;
    document.getElementById('gallery-count').textContent = String(assets.length).padStart(2, '0');
    document.getElementById('asset-list').innerHTML = assets.map((item, idx) => {
      const status = item.loadedPolys
        ? `<span class="text-[10px] font-mono text-zinc-400">${(item.loadedPolys / 1000).toFixed(1)}k</span>`
        : `<span class="text-[10px] font-mono text-zinc-600">LOAD</span>`;
      return `
        <button data-action="select-asset" data-id="${item.id}" class="arch-card w-full text-left rounded-lg px-3 py-2.5 flex flex-col gap-0.5 ${item.id === this.currentAssetId ? 'active' : ''}">
          <div class="flex items-center justify-between pointer-events-none">
            <span class="text-[10px] font-mono text-[#e05a2b]">${String(idx + 1).padStart(2, '0')}</span>
            ${status}
          </div>
          <div class="font-display text-xs font-semibold text-zinc-100 truncate pointer-events-none">${item.title}</div>
          <div class="text-[10px] text-zinc-500 truncate pointer-events-none">${item.subtitle}</div>
        </button>`;
    }).join('');
  },

  renderSubpartList(ctx) {
    const listEl = document.getElementById('subpart-list');
    const resetBtn = document.getElementById('btn-show-all');
    this.updateFocusExitBar(ctx);

    if (!ctx || ctx.parts.length <= 1) {
      if (resetBtn) resetBtn.classList.add('hidden');
      listEl.innerHTML = `<div class="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-zinc-500">Merged single-mesh asset. Use bottom shader modes to inspect wireframe topology and normal baking.</div>`;
      return;
    }

    if (resetBtn) resetBtn.classList.toggle('hidden', ctx.focusedPartIdx === null);

    listEl.innerHTML = ctx.parts.map((p, idx) => {
      const isSelected = ctx.focusedPartIdx === idx;
      return `
        <button data-action="isolate-part" data-idx="${idx}" class="part-row w-full text-left flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.025] border border-white/[0.05] hover:border-[#e05a2b]/60 hover:bg-white/[0.06] text-zinc-300 ${isSelected ? 'isolated' : ''}">
          <span class="truncate max-w-[210px] pointer-events-none"><b class="text-zinc-500 mr-1.5">${String(idx + 1).padStart(2, '0')}</b>${p.name}</span>
          <span class="text-[9px] font-mono uppercase pointer-events-none ${isSelected ? 'text-[#e05a2b]' : 'text-zinc-600'}">${isSelected ? 'FOCUSED' : 'ISOLATE'}</span>
        </button>`;
    }).join('');
  },

  syncSidebarHoverState(hoveredIdx) {
    document.querySelectorAll('#subpart-list .part-row').forEach((row) => {
      const idx = parseInt(row.dataset.idx, 10);
      row.classList.toggle('hovered-sync', hoveredIdx !== null && idx === hoveredIdx);
    });
  },

  highlightShader(mode) {
    window.PortfolioConfig.theme.shaders.forEach(s => {
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
    const isRadial = mode === 'radial';
    document.getElementById('btn-mode-radial').className = isRadial ? 'px-2.5 py-1 rounded-md bg-white/12 text-white font-medium transition' : 'px-2.5 py-1 rounded-md text-zinc-500 hover:text-zinc-200 transition';
    document.getElementById('btn-mode-linear').className = !isRadial ? 'px-2.5 py-1 rounded-md bg-white/12 text-white font-medium transition' : 'px-2.5 py-1 rounded-md text-zinc-500 hover:text-zinc-200 transition';
  },

  resetAllUIControls() {
    document.getElementById('explode-slider').value = 0;
    document.getElementById('explode-percent').textContent = '0%';
    document.getElementById('light-slider').value = 0;
    document.getElementById('light-deg').textContent = '0°';
    this.setExplodeModeUI('radial');
    this.highlightShader('rendered');
    AnimeGridStage.setExplodeProgress(0);
    AnimeGridStage.setAccent(window.PortfolioConfig.theme.accentRGB);
    this.updateFocusExitBar(null);
    CustomCursorHUD.unlockPart(true);
  },

  selectAsset(id) {
    const asset = window.PortfolioConfig.assets.find(a => a.id === id);
    if (!asset) return;
    this.currentAssetId = id;
    this.renderAssetList();

    document.getElementById('spec-category').textContent = asset.category;
    document.getElementById('spec-title').textContent = asset.title;
    document.getElementById('spec-desc').textContent = asset.description;
    document.getElementById('spec-tags').innerHTML = asset.tags.map(t =>
      `<span class="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-zinc-300">${t}</span>`
    ).join('');

    document.getElementById('workflow-list').innerHTML = asset.workflow.map(w => `
      <button data-action="workflow-step" data-wf="${w.action}" class="arch-card w-full text-left rounded-lg p-2.5 flex flex-col gap-1">
        <div class="flex items-center justify-between pointer-events-none">
          <span class="text-xs font-medium text-zinc-100"><b class="font-mono text-[#e05a2b] mr-1.5">${w.step}</b>${w.title}</span>
          <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300">${w.tag}</span>
        </div>
        <div class="text-[10px] text-zinc-500 pointer-events-none">${w.desc}</div>
      </button>
    `).join('');

    this.resetAllUIControls();
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
    const expCfg = window.PortfolioConfig.explosion;
    const slider = document.getElementById('explode-slider');
    await this.engine.captureBaseline(slider.value);
    slider.value = target;
    document.getElementById('explode-percent').textContent = Math.round(target) + '%';
    this.engine.explode(target, true, expCfg.buttonDurationSec);
  },

  bindBus() {
    EventBus.on('engine:preload-updated', () => {
      this.renderAssetList();
      this.updateHeroPreloadStatus();
    });

    EventBus.on('engine:loading', () => {
      document.getElementById('loading-overlay').classList.remove('opacity-0', 'pointer-events-none');
    });

    EventBus.on('engine:isolation-updated', (ctx) => {
      CustomCursorHUD.unlockPart(false);
      this.renderSubpartList(ctx);
    });

    EventBus.on('engine:hover-updated', ({ idx, part, screenCoords, fromList }) => {
      if (!fromList) this.syncSidebarHoverState(idx);
      if (part && idx !== null) {
        CustomCursorHUD.lockOnPart(part, idx, screenCoords);
      } else {
        CustomCursorHUD.unlockPart(fromList);
      }
    });

    EventBus.on('engine:ready', (ctx) => {
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
    const expCfg = window.PortfolioConfig.explosion;

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.engine.activeCtx && this.engine.activeCtx.focusedPartIdx !== null) {
        this.engine.exitFocusMode();
      }
    });

    // Sidebar list hover -> outline 3D part + show linked cursor callout (only when not focused)
    const subpartList = document.getElementById('subpart-list');
    if (subpartList) {
      subpartList.addEventListener('mousemove', (e) => {
        const row = e.target.closest('[data-action="isolate-part"]');
        if (!row) return;
        this.engine.hoverPart(parseInt(row.dataset.idx, 10), [e.clientX, e.clientY], true);
      });
      subpartList.addEventListener('mouseleave', () => {
        this.engine.clearHover(true);
      });
    }

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
          ? `<span class="w-1.5 h-1.5 rounded-full bg-[#e05a2b]"></span><span>SPIN: ON</span>`
          : `<span class="w-1.5 h-1.5 rounded-full bg-zinc-600"></span><span class="text-zinc-500">SPIN: OFF</span>`;
      }

      if (act === 'shader') {
        this.highlightShader(btn.dataset.mode);
        this.engine.setShading(btn.dataset.mode);
      }

      if (act === 'explode-mode') {
        this.setExplodeModeUI(btn.dataset.mode);
        const curVal = parseFloat(document.getElementById('explode-slider').value) || 0;
        if (curVal > 0) this.engine.explode(curVal, true, expCfg.modeSwitchDurationSec);
      }

      if (act === 'explode-to') this.runExplodeTo(parseFloat(btn.dataset.val));

      if (act === 'workflow-step') {
        const wf = btn.dataset.wf;
        if (wf === 'explode-radial') { this.setExplodeModeUI('radial'); this.runExplodeTo(expCfg.presetPercent); }
        else if (wf === 'explode-linear') { this.setExplodeModeUI('linear'); this.runExplodeTo(expCfg.presetPercent); }
        else if (['wire', 'clay', 'xray', 'albedo', 'rendered'].includes(wf)) {
          this.highlightShader(wf);
          this.engine.setShading(wf);
        }
      }

      if (act === 'isolate-part') this.engine.selectSinglePartToFocus(parseInt(btn.dataset.idx, 10));
      if (act === 'show-all-parts') this.engine.exitFocusMode();
    });

    const expSlider = document.getElementById('explode-slider');
    let rafPending = false;

    expSlider.addEventListener('pointerdown', () => this.engine.captureBaseline(expSlider.value));
    expSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      document.getElementById('explode-percent').textContent = Math.round(val) + '%';
      AnimeGridStage.setExplodeProgress(val / 100);
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        this.engine.explode(expSlider.value, false, 0);
      });
    });
    expSlider.addEventListener('change', (e) => {
      this.engine.explode(e.target.value, true, expCfg.sliderReleaseDurationSec);
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
