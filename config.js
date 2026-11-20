/**
 * YapShift 3D Portfolio Studio — Centralized Configuration (config.js)
 * All tunable visual, cursor, camera proxy, turntable, explosion, and asset parameters live here.
 */
window.PortfolioConfig = {
  brand: {
    name: 'YAPSHIFT',
    archiveTag: '/ 3D ARCHIVE 2026',
    githubUrl: 'https://yapshift.github.io/Portfolio/',
    heroBadges: ['Hard-Surface Engineering', '5-Level LOD', 'WebGL Studio'],
    heroHeadline: 'Precision 3D Assets',
    heroDescription:
      'Featuring two original production assets: a multi-part Mechanical Suspension Assembly and a 5-Level Stylized Rock LOD pipeline. Built with real-time collision-free explosion, custom reticle part callouts, and single-part focus.',
    heroFeatures: [
      {
        tag: '01 / ASSEMBLY',
        title: 'Mechanical Suspension',
        desc: 'Precision multi-part hard-surface assembly with radial & axial exploded views and AABB collision avoidance.'
      },
      {
        tag: '02 / OPTIMIZATION',
        title: '5-Level LOD Pipeline',
        desc: 'Side-by-side comparison from LOD0 to LOD4, preserving high-poly normal fidelity and silhouette at minimal polycount.'
      },
      {
        tag: '03 / INTERACTION',
        title: 'Proxy Reticle & Focus',
        desc: 'Full viewport cursor ownership with live raycast CAD part labels, parallel preloading, and click-to-focus isolation.'
      }
    ],
    footerLeft: 'DESIGNED & MODELED BY YAPSHIFT',
    footerRight: 'SUSPENSION ASSEMBLY · STYLIZED ROCK 5-LOD'
  },

  theme: {
    accentHex: '#e05a2b',
    accentRGB: '224, 90, 43',
    wireframeHex: 'E05A2BFF',
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

  cameraProxy: {
    orbitSensitivity: 0.0065,
    panSensitivity: 0.0014,
    zoomSensitivity: 0.0011,
    damping: 0.26,
    minPitchRad: -1.42,
    maxPitchRad: 1.42,
    minRadiusFactor: 0.22,
    maxRadiusFactor: 3.5,
    dragClickThresholdPx: 5,
    hoverPickThrottleMs: 65,
    cameraSyncIntervalMs: 22
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
    maxDevicePixelRatio: 1.5,
    webglYieldPauseMs: 220
  },

  turntable: {
    enabledByDefault: true,
    stepRadians: 0.008,
    frameIntervalMs: 32,
    resumeAfterCameraIdleMs: 650
  },

  explosion: {
    worldRadiusRatio: 0.065,
    minWorldRadius: 0.02,
    hitboxHalfSizeRatio: 0.14,
    hitboxPadding: 1.06,
    solverIterations: 18,
    radialHardCapMultiplier: 1.35,
    naturalDirectionBlend: 0.85,
    linearHalfSpanMultiplier: 1.55,
    linearOffAxisPull: 0.50,
    presetPercent: 65,
    buttonDurationSec: 0.65,
    sliderReleaseDurationSec: 0.45,
    modeSwitchDurationSec: 0.55,
    cameraZoomRadial: 0.22,
    cameraZoomLinear: 0.38
  },

  interaction: {
    outlineWidth: 3.5,
    outlineColor: [0.95, 0.42, 0.20],
    focusBoxUpdateDelayMs: 90,
    focusTransitionSec: 0.65,
    focusSettleSyncMs: 780,
    fallbackFocusDistanceRatio: 0.35,
    recenterSettleMs: 700,
    screenshotWidth: 1920,
    screenshotHeight: 1080
  },

  assets: [
    {
      id: 'yapshift-suspension',
      title: 'Mechanical Suspension Assembly',
      subtitle: 'Multi-Part Hard-Surface Rig',
      category: 'MECHANICAL / HARD-SURFACE',
      uid: '08632550c5604444a14b53dc339b6589',
      description:
        'Precision coilover spring, control arms, hub carrier, and damper assembly. Supports AABB collision-resolved explosion, cursor-linked part callouts, and single-part camera focus.',
      tags: ['Hard-Surface', 'Multi-Part', 'PBR Metal'],
      workflow: [
        {
          step: '01',
          title: 'Radial 3D Exploded View',
          tag: '65%',
          action: 'explode-radial',
          desc: 'Separates components along natural assembly vectors with 3D AABB collision avoidance.'
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
      uid: 'f9963591aa36459b9837b7a9ca411438',
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
