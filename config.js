/**
 * YapShift 3D Portfolio Studio — Centralized Configuration (config.js)
 * Native Three.js + GLB Engine Edition.
 */
window.PortfolioConfig = {
  brand: {
    name: 'YAPSHIFT',
    archiveTag: '/ 3D ARCHIVE 2026',
    githubUrl: 'https://yapshift.github.io/Portfolio/',
    heroBadges: ['Hard-Surface Engineering', '5-Level LOD', 'Native WebGL'],
    heroHeadline: 'Precision 3D Assets',
    heroDescription:
      'Featuring two original production assets: a multi-part Mechanical Suspension Assembly and a 5-Level Stylized Rock LOD pipeline. Powered by a custom native Three.js engine with real Box3 collision-free explosion and 60FPS part inspection.',
    heroFeatures: [
      {
        tag: '01 / ASSEMBLY',
        title: 'Mechanical Suspension',
        desc: 'Precision multi-part hard-surface assembly with real Box3 AABB collision-resolved radial & linear exploded views.'
      },
      {
        tag: '02 / OPTIMIZATION',
        title: '5-Level LOD Pipeline',
        desc: 'Side-by-side comparison from LOD0 to LOD4, preserving high-poly normal fidelity and silhouette at minimal polycount.'
      },
      {
        tag: '03 / ENGINE',
        title: 'Native Three.js Workbench',
        desc: 'Zero-latency custom reticle & CAD part callouts, Draco-compressed GLB preloading, and click-to-focus isolation.'
      }
    ],
    footerLeft: 'DESIGNED & MODELED BY YAPSHIFT',
    footerRight: 'SUSPENSION ASSEMBLY · STYLIZED ROCK 5-LOD'
  },

  renderer: {
    maxPixelRatio: 2,
    exposure: 1.15,
    envIntensity: 1.0,
    dracoDecoderPath: 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/',
    screenshotBgHex: '#09090b',
    screenshotWidth: 1920,
    screenshotHeight: 1080
  },

  theme: {
    accentHex: '#e05a2b',
    accentRGB: '224, 90, 43',
    wireframeColor: 0xe05a2b,
    clayColor: 0xd4d4d8,
    xrayOpacity: 0.28,
    shaders: [
      { id: 'rendered', label: 'PBR',       rgb: '224, 90, 43' },
      { id: 'clay',     label: 'Clay',      rgb: '212, 212, 216' },
      { id: 'wire',     label: 'Wireframe', rgb: '224, 90, 43' },
      { id: 'xray',     label: 'X-Ray',     rgb: '148, 163, 184' },
      { id: 'albedo',   label: 'Albedo',    rgb: '228, 228, 231' }
    ]
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
    gridSpacing: 40,
    majorCrosshairStep: 4,
    crosshairBaseSize: 3,
    dotBaseRadius: 0.85,
    magneticRadius: 165,
    magneticPushStrength: 5,
    majorBaseAlpha: 0.15,
    minorBaseAlpha: 0.065,
    hoverAlphaBoost: 0.42,
    reticleRadiusRatio: 0.30,
    reticleExplodeExpand: 0.06,
    frameIntervalMs: 33,
    maxDevicePixelRatio: 1.5
  },

  turntable: {
    enabledByDefault: true,
    radiansPerSecond: 0.28,
    resumeAfterCameraIdleMs: 650
  },

  explosion: {
    // Normalized model fits within a 2.0-unit bounding sphere; distances are in normalized world units
    baseSpreadRadius: 0.72,
    hitboxPadding: 1.08,
    solverIterations: 24,
    radialHardCapMultiplier: 1.65,
    naturalDirectionBlend: 0.85,
    linearGapMultiplier: 0.22,
    linearOffAxisPull: 0.55,
    presetPercent: 65,
    buttonDurationMs: 650,
    sliderReleaseDurationMs: 420,
    modeSwitchDurationMs: 550,
    cameraZoomRadial: 0.24,
    cameraZoomLinear: 0.42
  },

  interaction: {
    hoverOutlineColor: 0xe05a2b,
    hoverOutlineThickness: 0.018,
    hoverEmissiveIntensity: 0.24,
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
        'Precision coilover spring, control arms, hub carrier, and damper assembly. Supports true Box3 AABB collision-resolved explosion, native 60FPS hover callouts, and single-part camera focus.',
      tags: ['Hard-Surface', 'Multi-Part', 'PBR Metal'],
      workflow: [
        {
          step: '01',
          title: 'Radial 3D Exploded View',
          tag: '65%',
          action: 'explode-radial',
          desc: 'Separates components along natural assembly vectors with real 3D Box3 collision avoidance.'
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
          desc: 'Switches outer housing to translucent alpha-blend to reveal internal piston and bushing fitment.'
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
          desc: 'Overlays copper wireframe to compare triangle density across all 5 LOD stages.'
        },
        {
          step: '02',
          title: 'Matcap Clay Normal Check',
          tag: 'CLAY',
          action: 'clay',
          desc: 'Strips base color to evaluate normal map bevel retention and silhouette consistency under pure shading.'
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
