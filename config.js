/**
 * YapShift 3D Portfolio Studio — Centralized Configuration (config.js)
 * Native Three.js + GLB Engine · Silhouette Mask Outline & Kinetic 3D Motion (v32.0)
 */
window.PortfolioConfig = {
  brand: {
    name: 'YAPSHIFT',
    archiveTag: '/ 3D ARCHIVE 2026',
    githubUrl: 'https://yapshift.github.io/Portfolio/',
    heroBadges: ['Hard-Surface Engineering', '5-Level LOD', 'Kinetic WebGL'],
    heroHeadline: 'Precision 3D Assets',
    heroDescription:
      'Featuring two original production assets: a multi-part Mechanical Suspension Assembly and a 5-Level Stylized Rock LOD pipeline. Powered by a custom native Three.js engine with real Box3 explosion, X-Ray safe silhouette outlines, and spring-physics model choreography.',
    heroFeatures: [
      {
        tag: '01 / ASSEMBLY',
        title: 'Mechanical Suspension',
        desc: 'Precision multi-part hard-surface assembly with staggered spring explosion and real Box3 collision avoidance.'
      },
      {
        tag: '02 / OPTIMIZATION',
        title: '5-Level LOD Pipeline',
        desc: 'Side-by-side comparison from LOD0 to LOD4, preserving high-poly normal fidelity and silhouette at minimal polycount.'
      },
      {
        tag: '03 / ENGINE',
        title: 'Kinetic Three.js Studio',
        desc: 'Screen-space silhouette mask outlines (X-Ray compatible), spring hover physics, and click-to-focus isolation.'
      }
    ],
    footerLeft: 'DESIGNED & MODELED BY YAPSHIFT',
    footerRight: 'SUSPENSION ASSEMBLY · STYLIZED ROCK 5-LOD'
  },

  renderer: {
    maxPixelRatio: 2,
    // Balanced dark-studio contrast so untextured models never blow out to pure white
    exposure: 0.86,
    envIntensity: 0.52,
    keyLightIntensity: 0.85,
    rimLightIntensity: 0.55,
    hemiLightIntensity: 0.22,
    // Automatically tint untextured pure-white (#ffffff) GLB meshes to matte titanium grey (set null to disable)
    untexturedTintHex: '#9aa0aa',
    untexturedRoughness: 0.56,
    untexturedMetalness: 0.14,
    dracoDecoderPath: 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/',
    screenshotBgHex: '#0b0b0e',
    screenshotWidth: 1920,
    screenshotHeight: 1080
  },

  theme: {
    accentHex: '#ff4b4b',
    accentRGB: '255, 75, 75',
    wireframeColor: 0xff4b4b,
    // Sculptural slate-grey clay for crisp bevel contrast
    clayColor: 0x8c919b,
    clayRoughness: 0.62,
    clayMetalness: 0.12,
    xrayOpacity: 0.28,
    shaders: [
      { id: 'rendered', label: 'PBR',       rgb: '255, 75, 75' },
      { id: 'clay',     label: 'Clay',      rgb: '212, 212, 216' },
      { id: 'wire',     label: 'Wireframe', rgb: '255, 75, 75' },
      { id: 'xray',     label: 'X-Ray',     rgb: '148, 163, 184' },
      { id: 'albedo',   label: 'Albedo',    rgb: '228, 228, 231' }
    ]
  },

  // Anime.js-inspired 3D kinetic model dynamics
  modelMotion: {
    // Subtle weightless idle levitation
    idleFloatEnabled: true,
    idleFloatAmplitude: 0.022,
    idleFloatSpeed: 1.5,
    // Staggered spring assembly when model appears/switches
    assemblyEntranceEnabled: true,
    assemblyDurationMs: 820,
    assemblyStaggerSpanMs: 260,
    assemblyDropOffset: 0.22,
    // Spring scale micro-pop on hovered part
    hoverPopScale: 1.028,
    hoverSpringStiffness: 260,
    hoverSpringDamping: 18,
    // Staggered wave & elastic overshoot during preset explosion buttons
    explodeWaveStaggerMs: 180,
    explodeOvershoot: 1.25
  },

  cursor: {
    enabled: true,
    followLerp: 0.35,
    flipLeftThresholdPx: 280,
    showPartLabelOnlyWhenUnfocused: true
  },

  camera: {
    fov: 38,
    near: 0.01,
    far: 500,
    initialFramingMargin: 1.48,
    dampingFactor: 0.08,
    minDistanceFactor: 0.22,
    maxDistanceFactor: 4.0,
    dragClickThresholdPx: 5,
    transitionDurationMs: 650
  },

  background: {
    gridSpacing: 38,
    majorCrosshairStep: 4,
    crosshairBaseSize: 3,
    dotBaseRadius: 0.9,
    magneticRadius: 175,
    magneticPushStrength: 6,
    majorBaseAlpha: 0.16,
    minorBaseAlpha: 0.07,
    hoverAlphaBoost: 0.48,
    ambientWaveSpeed: 0.0018,
    ambientWaveFrequency: 0.18,
    ambientWaveAlphaBoost: 0.06,
    reticleRadiusRatio: 0.31,
    reticleExplodeExpand: 0.065,
    reticleRotationSpeed: 0.00025,
    shockwaveSpeed: 12,
    shockwaveMaxRadius: 340,
    frameIntervalMs: 28,
    maxDevicePixelRatio: 1.5
  },

  turntable: {
    enabledByDefault: true,
    radiansPerSecond: 0.28,
    resumeAfterCameraIdleMs: 650
  },

  explosion: {
    baseSpreadRadius: 0.72,
    hitboxPadding: 1.08,
    solverIterations: 24,
    radialHardCapMultiplier: 1.65,
    naturalDirectionBlend: 0.85,
    linearGapMultiplier: 0.22,
    linearOffAxisPull: 0.55,
    presetPercent: 65,
    buttonDurationMs: 720,
    sliderReleaseDurationMs: 420,
    modeSwitchDurationMs: 600,
    cameraZoomRadial: 0.24,
    cameraZoomLinear: 0.42
  },

  interaction: {
    // Screen-space silhouette mask outline (100% X-Ray compatible, zero interior bleed)
    hoverOutlineColor: 0xff4b4b,
    hoverOutlinePx: 1.6,
    hoverOutlineOpacity: 0.95,
    focusFramingMargin: 1.65
  },

  assets: [
    {
      id: 'yapshift-suspension',
      title: 'Mechanical Suspension Assembly',
      subtitle: 'Multi-Part Hard-Surface Rig',
      category: 'MECHANICAL / HARD-SURFACE',
      modelUrl: './models/suspension.glb',
      description:
        'Precision coilover spring, control arms, hub carrier, and damper assembly. Supports true Box3 collision-free staggered explosion, X-Ray safe silhouette outlines, and single-part focus.',
      tags: ['Hard-Surface', 'Multi-Part', 'PBR Metal'],
      workflow: [
        {
          step: '01',
          title: 'Radial 3D Exploded View',
          tag: '65%',
          action: 'explode-radial',
          desc: 'Cascades components along natural assembly vectors with real Box3 collision avoidance.'
        },
        {
          step: '02',
          title: 'Main-Axis Linear Queue',
          tag: 'LINEAR',
          action: 'explode-linear',
          desc: 'Aligns all sub-parts sequentially along the primary assembly axis for bill-of-materials inspection.'
        },
        {
          step: '03',
          title: 'X-Ray Internal Inspection',
          tag: 'X-RAY',
          action: 'xray',
          desc: 'Switches outer housing to translucent alpha-blend with clean silhouette-only hover contours.'
        }
      ]
    },
    {
      id: 'yapshift-stylized-rock-lod',
      title: 'Stylized Rock — 5-Level LOD',
      subtitle: 'LOD0 to LOD4 Game Asset',
      category: 'GAME OPTIMIZATION / 5-LOD',
      modelUrl: './models/stylized-rock-lod.glb',
      description:
        'Side-by-side comparison of 5 progressive decimation tiers (LOD0–LOD4), retaining crisp normal map bevels and silhouette accuracy down to ultra-low polycounts.',
      tags: ['5-Level LOD', 'Normal Baking', 'Stylized PBR'],
      workflow: [
        {
          step: '01',
          title: '5-Tier Topology Wireframe',
          tag: 'WIRE',
          action: 'wire',
          desc: 'Overlays vermilion wireframe to compare triangle density across all 5 LOD stages.'
        },
        {
          step: '02',
          title: 'Matcap Clay Normal Check',
          tag: 'CLAY',
          action: 'clay',
          desc: 'Applies dark sculptural clay to evaluate normal map bevel retention and silhouette consistency.'
        },
        {
          step: '03',
          title: 'Unlit Albedo Map Check',
          tag: 'ALBEDO',
          action: 'albedo',
          desc: 'Removes lighting and shadows to inspect hand-crafted edge wear and color gradients.'
        }
      ]
    }
  ]
};
