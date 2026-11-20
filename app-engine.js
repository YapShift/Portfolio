/**
 * YapShift Native Three.js 3D Workbench Engine (app-engine.js v30.0)
 * Zero-iframe native WebGL2 architecture with Draco GLB preloading,
 * true Box3 collision-free explosion, 60FPS raycast hover outline + CAD cursor callout,
 * smooth OrbitControls with auto-resuming turntable spin, and 5 inspection shaders.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SceneGraphMath } from './scene-math.js';

const EventBus = {
  listeners: {},
  on(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); },
  emit(event, payload) { (this.listeners[event] || []).forEach(fn => fn(payload)); }
};

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Exclusive Tactical Cursor Follower & Linked CAD Part-Name Callout System
 */
const CustomCursorHUD = {
  el: null, idxEl: null, nameEl: null,
  x: -9999, y: -9999,
  tx: -9999, ty: -9999,
  visible: false,
  lockedPartActive: false,

  init() {
    if (!window.PortfolioConfig.cursor.enabled) return;
    this.el = document.getElementById('yapshift-cursor-hud');
    this.idxEl = document.getElementById('cursor-part-idx');
    this.nameEl = document.getElementById('cursor-part-name');
    if (!this.el) return;

    window.addEventListener('mousemove', (e) => {
      this.setTarget(e.clientX, e.clientY);
      const isCtrl = Boolean(e.target.closest('button, a, input, [data-action]'));
      this.el.classList.toggle('is-interactive', isCtrl && !this.lockedPartActive);
    }, { passive: true });

    document.addEventListener('mouseleave', () => this.hide());
    requestAnimationFrame(() => this.loop());
  },

  setTarget(clientX, clientY) {
    if (!this.el) return;
    this.tx = clientX;
    this.ty = clientY;
    if (!this.visible) {
      this.x = clientX;
      this.y = clientY;
      this.visible = true;
      this.el.classList.remove('opacity-0');
    }
    const flipLimit = window.PortfolioConfig.cursor.flipLeftThresholdPx;
    this.el.classList.toggle('flip-left', clientX > window.innerWidth - flipLimit);
  },

  setDragging(active) {
    if (!this.el) return;
    this.el.classList.toggle('is-dragging', active);
    if (active) this.unlockPart();
  },

  lockOnPart(part, idx) {
    if (!this.el || !part || idx === null) {
      this.unlockPart();
      return;
    }
    this.lockedPartActive = true;
    this.idxEl.textContent = `#${String(idx + 1).padStart(2, '0')}`;
    this.nameEl.textContent = part.name;
    this.el.classList.remove('is-interactive');
    this.el.classList.add('is-part-lock');
  },

  unlockPart() {
    if (!this.el) return;
    this.lockedPartActive = false;
    this.el.classList.remove('is-part-lock');
  },

  hide() {
    if (!this.el) return;
    this.visible = false;
    this.lockedPartActive = false;
    this.el.classList.remove('is-part-lock', 'is-interactive', 'is-dragging');
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
 * Batched 2D Canvas Architectural Grid & Breathing Reticle Stage
 */
const AnimeGridStage = {
  canvas: null, ctx: null, w: 0, h: 0, dpr: 1,
  mouse: { x: -9999, y: -9999, tx: -9999, ty: -9999 },
  accentRGB: '224, 90, 43',
  explodeT: 0, targetExplodeT: 0,
  lastFrame: 0,

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

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const bgCfg = window.PortfolioConfig.background;
    if (now - this.lastFrame < bgCfg.frameIntervalMs) return;
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
 * Native Three.js Multi-Asset Engine
 */
class ThreeStudioEngine {
  constructor() {
    const cfg = window.PortfolioConfig;
    this.container = document.getElementById('webgl-viewport');
    this.cache = new Map();
    this.activeAssetId = null;
    this.mode = 'radial';
    this.autoSpinEnabled = cfg.turntable.enabledByDefault;

    this.initRendererAndScene(cfg);
    this.initLoaders(cfg);
    this.initOutlineMaterial(cfg);
    this.bindViewportEvents();

    // Animation tweens
    this.camTween = null;
    this.explodeTween = null;
    this.clock = new THREE.Clock();
    this.userInteracting = false;
    this.spinResumeTimer = null;
    this.isDragging = false;
    this.pointerDownPos = { x: 0, y: 0 };

    this.raycaster = new THREE.Raycaster();
    this.pointerNDC = new THREE.Vector2();
    this.outlineShell = null;

    this.animate();
  }

  get activeCtx() { return this.cache.get(this.activeAssetId) || null; }

  initRendererAndScene(cfg) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.renderer.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = cfg.renderer.exposure;
    this.renderer.setClearColor(0x000000, 0);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    // Zero-dependency procedural studio HDRI environment
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRenderTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    this.scene.environmentIntensity = cfg.renderer.envIntensity;
    pmrem.dispose();

    // Rotatable studio key & rim light rig (syncs with HDRI rotation slider)
    this.lightRig = new THREE.Group();
    const keyLight = new THREE.DirectionalLight(0xfff5eb, 1.4);
    keyLight.position.set(4, 6, 5);
    const rimLight = new THREE.DirectionalLight(0xcbd5e1, 0.85);
    rimLight.position.set(-5, 3, -4);
    const fillLight = new THREE.HemisphereLight(0xffffff, 0x18181b, 0.45);
    this.lightRig.add(keyLight, rimLight, fillLight);
    this.scene.add(this.lightRig);

    // Camera & OrbitControls
    this.camera = new THREE.PerspectiveCamera(
      cfg.camera.fov,
      window.innerWidth / window.innerHeight,
      cfg.camera.near,
      cfg.camera.far
    );
    this.camera.position.set(2.4, 1.5, 2.8);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = cfg.camera.dampingFactor;
    this.controls.screenSpacePanning = true;

    // Pause turntable immediately on orbit/pan/zoom and always resume cleanly after idle
    this.controls.addEventListener('start', () => {
      this.userInteracting = true;
      this.camTween = null;
      if (this.spinResumeTimer) clearTimeout(this.spinResumeTimer);
    });
    this.controls.addEventListener('end', () => {
      this.syncBaseCameraDistance();
      if (this.spinResumeTimer) clearTimeout(this.spinResumeTimer);
      this.spinResumeTimer = setTimeout(() => {
        this.userInteracting = false;
      }, cfg.turntable.resumeAfterCameraIdleMs);
    });

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  initLoaders(cfg) {
    this.gltfLoader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath(cfg.renderer.dracoDecoderPath);
    this.gltfLoader.setDRACOLoader(draco);
  }

  /**
   * Inverted-hull normal-extruded copper outline shader:
   * Preserves 100% transparent WebGL canvas + native MSAA with 1 draw call.
   */
  initOutlineMaterial(cfg) {
    const color = new THREE.Color(cfg.interaction.hoverOutlineColor);
    const thickness = cfg.interaction.hoverOutlineThickness;
    this.outlineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: color },
        uThickness: { value: thickness }
      },
      vertexShader: `
        uniform float uThickness;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vec3 mvNormal = normalize(normalMatrix * normal);
          float distScale = clamp(length(mvPos.xyz) * 0.22, 0.35, 1.4);
          mvPos.xyz += mvNormal * (uThickness * distScale);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        void main() {
          gl_FragColor = vec4(uColor, 0.96);
        }
      `,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false
    });
  }

  bindViewportEvents() {
    const dom = this.renderer.domElement;
    const camCfg = window.PortfolioConfig.camera;

    dom.addEventListener('pointerdown', (e) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
      this.isDragging = true;
      this.container.classList.add('is-orbiting');
      CustomCursorHUD.setDragging(true);
      this.clearHover(false);
    });

    dom.addEventListener('pointermove', (e) => {
      if (this.isDragging) return;
      const ctx = this.activeCtx;
      if (!ctx || !ctx.ready || ctx.parts.length <= 1) return;

      const onlyWhenUnfocused = window.PortfolioConfig.cursor.showPartLabelOnlyWhenUnfocused;
      if (onlyWhenUnfocused && ctx.focusedPartIdx !== null) return;

      const hitIdx = this.raycastPartIndex(ctx, e.clientX, e.clientY);
      if (hitIdx !== null) this.hoverPart(hitIdx, false);
      else this.clearHover(false);
    });

    const endPointer = (e) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.container.classList.remove('is-orbiting');
      CustomCursorHUD.setDragging(false);

      const moved = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      if (moved <= camCfg.dragClickThresholdPx && e.button === 0) {
        const ctx = this.activeCtx;
        if (ctx && ctx.ready && ctx.parts.length > 1) {
          const hitIdx = this.raycastPartIndex(ctx, e.clientX, e.clientY);
          if (hitIdx !== null) this.selectSinglePartToFocus(hitIdx);
        }
      }
    };

    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);
    dom.addEventListener('pointerleave', () => {
      if (!this.isDragging) this.clearHover(false);
    });
    dom.addEventListener('dblclick', () => this.recenter());
  }

  raycastPartIndex(ctx, clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);

    const visibleMeshes = ctx.parts.filter(p => p.mesh.visible).map(p => p.mesh);
    const hits = this.raycaster.intersectObjects(visibleMeshes, false);
    if (!hits.length) return null;

    const hitMesh = hits[0].object;
    const idx = ctx.meshToPartIdx.get(hitMesh);
    return idx !== undefined ? idx : null;
  }

  preloadAll(assets) {
    assets.forEach(asset => this.loadAsset(asset));
  }

  getReadyCount() {
    let n = 0;
    this.cache.forEach(ctx => { if (ctx.ready) n++; });
    return n;
  }

  loadAsset(asset) {
    if (this.cache.has(asset.id)) return this.cache.get(asset.id);

    const ctx = {
      asset,
      ready: false,
      error: null,
      spinPivot: null,
      parts: [],
      meshToPartIdx: new Map(),
      originalMaterials: new Map(),
      collisionBadge: '',
      polys: 0,
      verts: 0,
      defaultCamPos: new THREE.Vector3(),
      defaultCamTarget: new THREE.Vector3(),
      baseCamDistance: 3.6,
      explodeVal: 0,
      shaderMode: 'rendered',
      lightDeg: 0,
      focusedPartIdx: null,
      hoveredPartIdx: null,
      savedPreFocusCam: null
    };
    this.cache.set(asset.id, ctx);

    this.gltfLoader.load(
      asset.modelUrl,
      (gltf) => {
        const { spinPivot, normSphere } = SceneGraphMath.normalizeModel(gltf.scene);
        const stats = SceneGraphMath.measureGeometryStats(spinPivot);
        const analysis = SceneGraphMath.analyzeModelParts(spinPivot);

        ctx.spinPivot = spinPivot;
        ctx.parts = analysis.parts;
        ctx.collisionBadge = analysis.collisionBadge;
        ctx.polys = stats.tris;
        ctx.verts = stats.verts;
        asset.loadedPolys = stats.tris;

        ctx.parts.forEach((p, idx) => {
          ctx.meshToPartIdx.set(p.mesh, idx);
          ctx.originalMaterials.set(p.mesh, p.mesh.material);
        });

        // Compute ideal default camera framing from normalized bounding sphere
        const camCfg = window.PortfolioConfig.camera;
        const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
        const dist = (normSphere.radius / Math.sin(fovRad * 0.5)) * camCfg.initialFramingMargin;
        const dir = new THREE.Vector3(0.68, 0.36, 0.85).normalize();

        ctx.defaultCamTarget.copy(normSphere.center);
        ctx.defaultCamPos.copy(normSphere.center).addScaledVector(dir, dist);
        ctx.baseCamDistance = dist;

        spinPivot.visible = (this.activeAssetId === asset.id);
        this.scene.add(spinPivot);
        ctx.ready = true;

        EventBus.emit('engine:preload-updated');
        if (this.activeAssetId === asset.id) {
          this.activateLoadedContext(ctx);
        }
      },
      undefined,
      (err) => {
        ctx.error = `GLB NOT FOUND: ${asset.modelUrl}`;
        console.error('[ThreeStudioEngine] Failed to load model:', asset.modelUrl, err);
        EventBus.emit('engine:preload-updated');
        if (this.activeAssetId === asset.id) {
          EventBus.emit('engine:error', ctx.error);
        }
      }
    );

    return ctx;
  }

  activateLoadedContext(ctx) {
    this.resetModelState(ctx, false);
    const camCfg = window.PortfolioConfig.camera;
    this.controls.minDistance = ctx.baseCamDistance * camCfg.minDistanceFactor;
    this.controls.maxDistance = ctx.baseCamDistance * camCfg.maxDistanceFactor;
    this.camera.position.copy(ctx.defaultCamPos);
    this.controls.target.copy(ctx.defaultCamTarget);
    this.controls.update();
    EventBus.emit('engine:ready', ctx);
  }

  selectModel(asset) {
    const prevCtx = this.activeCtx;
    if (prevCtx && prevCtx.asset.id !== asset.id && prevCtx.ready) {
      this.resetModelState(prevCtx, false);
      prevCtx.spinPivot.visible = false;
    }

    this.activeAssetId = asset.id;
    this.mode = 'radial';
    this.clearHover(false);

    const targetCtx = this.loadAsset(asset);
    if (targetCtx.error) {
      EventBus.emit('engine:error', targetCtx.error);
      return;
    }

    if (targetCtx.ready) {
      targetCtx.spinPivot.visible = true;
      this.activateLoadedContext(targetCtx);
    } else {
      EventBus.emit('engine:loading', asset.modelUrl);
    }
  }

  resetModelState(ctx, animateCam = true) {
    if (!ctx || !ctx.ready) return;

    this.explodeTween = null;
    this.clearHover(false);

    ctx.focusedPartIdx = null;
    ctx.savedPreFocusCam = null;
    ctx.parts.forEach(p => {
      p.mesh.visible = true;
      p.mesh.position.copy(p.origPos);
    });

    ctx.explodeVal = 0;
    ctx.spinPivot.rotation.set(0, 0, 0);

    if (ctx.shaderMode !== 'rendered') {
      this.applyShaderModeToContext(ctx, 'rendered');
    }

    ctx.lightDeg = 0;
    this.rotateLight(0);

    if (animateCam) {
      this.tweenCameraTo(ctx.defaultCamPos, ctx.defaultCamTarget, window.PortfolioConfig.camera.transitionDurationMs);
    }
  }

  getZoomMultiplier(explodeVal) {
    const expCfg = window.PortfolioConfig.explosion;
    const factor = (parseFloat(explodeVal) || 0) / 100;
    return 1 + factor * (this.mode === 'linear' ? expCfg.cameraZoomLinear : expCfg.cameraZoomRadial);
  }

  syncBaseCameraDistance() {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || ctx.focusedPartIdx !== null) return;
    const curDist = this.camera.position.distanceTo(this.controls.target);
    ctx.baseCamDistance = curDist / this.getZoomMultiplier(ctx.explodeVal);
  }

  tweenCameraTo(targetPos, targetLookAt, durationMs = 650) {
    this.camTween = {
      startPos: this.camera.position.clone(),
      endPos: targetPos.clone(),
      startTarget: this.controls.target.clone(),
      endTarget: targetLookAt.clone(),
      startTime: performance.now(),
      duration: Math.max(1, durationMs)
    };
  }

  applyExplosionImmediate(ctx, percent) {
    const t = Math.max(0, Math.min(1, (parseFloat(percent) || 0) / 100));
    ctx.explodeVal = t * 100;
    const isLinear = this.mode === 'linear';
    ctx.parts.forEach(p => {
      const delta = isLinear ? p.linearDelta : p.radialDelta;
      p.mesh.position.copy(p.origPos).addScaledVector(delta, t);
    });
    AnimeGridStage.setExplodeProgress(t);
  }

  explode(percent, adjustCam = true, durationMs = 0) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || ctx.parts.length <= 1) return;

    const targetVal = Math.max(0, Math.min(100, parseFloat(percent) || 0));

    if (durationMs <= 0) {
      this.explodeTween = null;
      this.applyExplosionImmediate(ctx, targetVal);
    } else {
      this.explodeTween = {
        ctx,
        startVal: ctx.explodeVal,
        endVal: targetVal,
        startTime: performance.now(),
        duration: durationMs
      };
    }

    if (adjustCam && ctx.focusedPartIdx === null) {
      const z = this.getZoomMultiplier(targetVal);
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      const endPos = this.controls.target.clone().addScaledVector(dir, ctx.baseCamDistance * z);
      this.tweenCameraTo(endPos, this.controls.target, Math.max(250, durationMs));
    }
  }

  // Hover Outline + Emissive Accent + Linked Cursor Callout
  hoverPart(idx, fromList = false) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready) return;

    const onlyWhenUnfocused = window.PortfolioConfig.cursor.showPartLabelOnlyWhenUnfocused;
    if (onlyWhenUnfocused && ctx.focusedPartIdx !== null) {
      this.clearHover(fromList);
      return;
    }

    if (ctx.hoveredPartIdx !== idx) {
      this.removeHoverVisuals(ctx);
      ctx.hoveredPartIdx = idx;
      const part = idx !== null ? ctx.parts[idx] : null;
      if (part) this.applyHoverVisuals(part.mesh);
    }

    EventBus.emit('engine:hover-updated', {
      idx,
      part: idx !== null ? ctx.parts[idx] : null,
      fromList
    });
  }

  clearHover(fromList = false) {
    const ctx = this.activeCtx;
    if (ctx && ctx.hoveredPartIdx !== null) {
      this.removeHoverVisuals(ctx);
      ctx.hoveredPartIdx = null;
    }
    EventBus.emit('engine:hover-updated', { idx: null, part: null, fromList });
  }

  applyHoverVisuals(mesh) {
    const interCfg = window.PortfolioConfig.interaction;
    // 1. Attach inverted-hull copper silhouette shell as child so it tracks spin & explosion automatically
    const shell = new THREE.Mesh(mesh.geometry, this.outlineMaterial);
    shell.name = '__HoverOutlineShell';
    shell.renderOrder = 999;
    mesh.add(shell);
    this.outlineShell = shell;

    // 2. Subtle warm copper emissive boost on supported materials
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(m => {
      if (m && m.emissive) {
        if (!m.userData.__origEmissive) {
          m.userData.__origEmissive = m.emissive.clone();
          m.userData.__origEmissiveInt = m.emissiveIntensity;
        }
        m.emissive.setHex(interCfg.hoverOutlineColor);
        m.emissiveIntensity = interCfg.hoverEmissiveIntensity;
      }
    });
  }

  removeHoverVisuals(ctx) {
    if (this.outlineShell && this.outlineShell.parent) {
      this.outlineShell.parent.remove(this.outlineShell);
      this.outlineShell = null;
    }
    if (ctx && ctx.hoveredPartIdx !== null && ctx.parts[ctx.hoveredPartIdx]) {
      const mesh = ctx.parts[ctx.hoveredPartIdx].mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach(m => {
        if (m && m.emissive && m.userData.__origEmissive) {
          m.emissive.copy(m.userData.__origEmissive);
          m.emissiveIntensity = m.userData.__origEmissiveInt;
        }
      });
    }
  }

  selectSinglePartToFocus(idx) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready || !ctx.parts[idx]) return;

    if (ctx.focusedPartIdx === idx) {
      this.exitFocusMode();
      return;
    }

    if (!ctx.savedPreFocusCam) {
      ctx.savedPreFocusCam = {
        pos: this.camera.position.clone(),
        target: this.controls.target.clone()
      };
    }

    this.clearHover(false);
    ctx.focusedPartIdx = idx;

    ctx.parts.forEach((p, i) => {
      p.mesh.visible = (i === idx);
    });

    // Compute exact current world bounding sphere of the isolated part & frame smoothly
    const targetMesh = ctx.parts[idx].mesh;
    targetMesh.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(targetMesh);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const margin = window.PortfolioConfig.interaction.focusFramingMargin;
    const dist = Math.max(0.25, (sphere.radius / Math.sin(fovRad * 0.5)) * margin);
    const viewDir = this.camera.position.clone().sub(this.controls.target).normalize();
    const endPos = sphere.center.clone().addScaledVector(viewDir, dist);

    this.tweenCameraTo(endPos, sphere.center, window.PortfolioConfig.camera.transitionDurationMs);
    EventBus.emit('engine:isolation-updated', ctx);
  }

  exitFocusMode() {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready) return;

    ctx.focusedPartIdx = null;
    this.clearHover(false);
    ctx.parts.forEach(p => { p.mesh.visible = true; });

    if (ctx.savedPreFocusCam) {
      const saved = ctx.savedPreFocusCam;
      ctx.savedPreFocusCam = null;
      this.tweenCameraTo(saved.pos, saved.target, window.PortfolioConfig.camera.transitionDurationMs);
    }

    EventBus.emit('engine:isolation-updated', ctx);
  }

  recenter() {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready) return;
    if (ctx.focusedPartIdx !== null) {
      this.exitFocusMode();
      return;
    }
    const z = this.getZoomMultiplier(ctx.explodeVal);
    const dir = ctx.defaultCamPos.clone().sub(ctx.defaultCamTarget).normalize();
    const endPos = ctx.defaultCamTarget.clone().addScaledVector(dir, ctx.baseCamDistance * z);
    this.tweenCameraTo(endPos, ctx.defaultCamTarget, window.PortfolioConfig.camera.transitionDurationMs);
  }

  toggleAutoSpin() {
    this.autoSpinEnabled = !this.autoSpinEnabled;
    return this.autoSpinEnabled;
  }

  setShading(mode) {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready) return;
    this.applyShaderModeToContext(ctx, mode);
    const shaderDef = window.PortfolioConfig.theme.shaders.find(s => s.id === mode);
    if (shaderDef) AnimeGridStage.setAccent(shaderDef.rgb);
  }

  applyShaderModeToContext(ctx, mode) {
    const themeCfg = window.PortfolioConfig.theme;
    ctx.shaderMode = mode;

    // Remove temporary hover visuals before swapping materials
    const prevHovered = ctx.hoveredPartIdx;
    this.removeHoverVisuals(ctx);

    ctx.parts.forEach(p => {
      const orig = ctx.originalMaterials.get(p.mesh);
      if (mode === 'rendered') {
        p.mesh.material = orig;
        return;
      }

      const convertMat = (src) => {
        if (mode === 'clay') {
          return new THREE.MeshStandardMaterial({
            color: themeCfg.clayColor,
            roughness: 0.72,
            metalness: 0.05,
            normalMap: src && src.normalMap ? src.normalMap : null,
            normalScale: src && src.normalScale ? src.normalScale.clone() : new THREE.Vector2(1, 1)
          });
        }
        if (mode === 'wire') {
          return new THREE.MeshBasicMaterial({
            color: themeCfg.wireframeColor,
            wireframe: true
          });
        }
        if (mode === 'xray') {
          const cloned = src ? src.clone() : new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
          cloned.transparent = true;
          cloned.opacity = themeCfg.xrayOpacity;
          cloned.depthWrite = false;
          return cloned;
        }
        if (mode === 'albedo') {
          return new THREE.MeshBasicMaterial({
            color: src && src.color ? src.color.clone() : new THREE.Color(0xffffff),
            map: src && src.map ? src.map : null
          });
        }
        return src;
      };

      p.mesh.material = Array.isArray(orig) ? orig.map(convertMat) : convertMat(orig);
    });

    if (prevHovered !== null && ctx.parts[prevHovered]) {
      this.applyHoverVisuals(ctx.parts[prevHovered].mesh);
    }
  }

  rotateLight(deg) {
    const rad = THREE.MathUtils.degToRad(parseFloat(deg) || 0);
    const ctx = this.activeCtx;
    if (ctx) ctx.lightDeg = parseFloat(deg) || 0;
    this.lightRig.rotation.y = rad;
    if (this.scene.environmentRotation) {
      this.scene.environmentRotation.y = rad;
    }
  }

  exportScreenshot() {
    const ctx = this.activeCtx;
    if (!ctx || !ctx.ready) return;
    const rCfg = window.PortfolioConfig.renderer;

    const prevW = window.innerWidth;
    const prevH = window.innerHeight;
    const prevRatio = this.renderer.getPixelRatio();

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(rCfg.screenshotWidth, rCfg.screenshotHeight, false);
    this.camera.aspect = rCfg.screenshotWidth / rCfg.screenshotHeight;
    this.camera.updateProjectionMatrix();

    // Temporarily render onto obsidian studio background for clean PNG export
    const prevBg = this.scene.background;
    this.scene.background = new THREE.Color(rCfg.screenshotBgHex);
    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    // Restore transparent interactive canvas immediately
    this.scene.background = prevBg;
    this.renderer.setPixelRatio(prevRatio);
    this.renderer.setSize(prevW, prevH, false);
    this.camera.aspect = prevW / prevH;
    this.camera.updateProjectionMatrix();

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `YapShift_${ctx.asset.id}_${Date.now()}.png`;
    a.click();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const now = performance.now();

    // 1. Update smooth camera transition tween
    if (this.camTween) {
      const t = Math.min(1, (now - this.camTween.startTime) / this.camTween.duration);
      const e = easeOutCubic(t);
      this.camera.position.lerpVectors(this.camTween.startPos, this.camTween.endPos, e);
      this.controls.target.lerpVectors(this.camTween.startTarget, this.camTween.endTarget, e);
      if (t >= 1) this.camTween = null;
    }

    // 2. Update smooth explosion tween
    if (this.explodeTween) {
      const tw = this.explodeTween;
      const t = Math.min(1, (now - tw.startTime) / tw.duration);
      const val = tw.startVal + (tw.endVal - tw.startVal) * easeOutCubic(t);
      this.applyExplosionImmediate(tw.ctx, val);
      if (t >= 1) this.explodeTween = null;
    }

    // 3. In-place horizontal turntable spin (resumes automatically after camera idle)
    const heroOverlay = document.getElementById('hero-overlay');
    const heroClosed = !heroOverlay || heroOverlay.classList.contains('hidden');
    const ctx = this.activeCtx;

    if (
      heroClosed &&
      ctx && ctx.ready && ctx.spinPivot &&
      this.autoSpinEnabled &&
      !this.userInteracting &&
      !this.camTween &&
      ctx.focusedPartIdx === null
    ) {
      ctx.spinPivot.rotation.y += window.PortfolioConfig.turntable.radiansPerSecond * dt;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
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
    this.engine = new ThreeStudioEngine();
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
        : `<span class="text-[10px] font-mono text-zinc-600">GLB</span>`;
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
    CustomCursorHUD.unlockPart();
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

  runExplodeTo(target) {
    const expCfg = window.PortfolioConfig.explosion;
    const slider = document.getElementById('explode-slider');
    slider.value = target;
    document.getElementById('explode-percent').textContent = Math.round(target) + '%';
    this.engine.explode(target, true, expCfg.buttonDurationMs);
  },

  bindBus() {
    EventBus.on('engine:preload-updated', () => {
      this.renderAssetList();
      this.updateHeroPreloadStatus();
    });

    EventBus.on('engine:loading', (url) => {
      document.getElementById('loading-spinner').classList.remove('hidden');
      document.getElementById('loading-text').textContent = `LOADING ${url || 'GLB MODEL'}`;
      document.getElementById('loading-overlay').classList.remove('opacity-0', 'pointer-events-none');
    });

    EventBus.on('engine:error', (msg) => {
      document.getElementById('loading-spinner').classList.add('hidden');
      document.getElementById('loading-text').textContent = `${msg} — Place exported .glb in /models/ and run via local server or GitHub Pages.`;
      document.getElementById('loading-overlay').classList.remove('opacity-0', 'pointer-events-none');
    });

    EventBus.on('engine:isolation-updated', (ctx) => {
      CustomCursorHUD.unlockPart();
      this.renderSubpartList(ctx);
    });

    EventBus.on('engine:hover-updated', ({ idx, part, fromList }) => {
      if (!fromList) this.syncSidebarHoverState(idx);
      if (part && idx !== null) CustomCursorHUD.lockOnPart(part, idx);
      else CustomCursorHUD.unlockPart();
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

    const subpartList = document.getElementById('subpart-list');
    if (subpartList) {
      subpartList.addEventListener('mousemove', (e) => {
        const row = e.target.closest('[data-action="isolate-part"]');
        if (!row) return;
        this.engine.hoverPart(parseInt(row.dataset.idx, 10), true);
      });
      subpartList.addEventListener('mouseleave', () => {
        this.engine.clearHover(true);
      });
    }

    document.body.addEventListener('click', (e) => {
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
        if (curVal > 0) this.engine.explode(curVal, true, expCfg.modeSwitchDurationMs);
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
    expSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      document.getElementById('explode-percent').textContent = Math.round(val) + '%';
      this.engine.explode(val, false, 0);
    });
    expSlider.addEventListener('change', (e) => {
      this.engine.explode(e.target.value, true, expCfg.sliderReleaseDurationMs);
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
