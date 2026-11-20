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
      const py = n.dist > 
