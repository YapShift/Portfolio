/**
 * YapShift 专属作品集配置层 (config.js)
 * 已彻底清空所有外部示例，100% 仅包含 YapShift 指定的真实模型资产！
 */
window.PortfolioConfig = {
  yapshiftExclusive: true,
  author: {
    name: 'YapShift',
    tagline: '3D Hard-Surface Modeler · LOD Optimization · Technical Artist',
    githubUrl: 'https://yapshift.github.io/Portfolio/',
    skills: [
      { name: 'Hard-Surface 机械结构建模 (Suspension/CAD)', pct: 96, gradient: 'from-orange-500 to-amber-300', text: 'text-orange-400' },
      { name: '游戏级多级 LOD 拓扑减面与烘焙', pct: 95, gradient: 'from-sky-500 to-cyan-300', text: 'text-sky-400' },
      { name: '风格化雕刻与 PBR 材质表现 (Stylized/PBR)', pct: 92, gradient: 'from-emerald-500 to-teal-300', text: 'text-emerald-400' },
      { name: 'WebGL / Sketchfab API 实时交互管线', pct: 88, gradient: 'from-purple-500 to-pink-400', text: 'text-purple-400' }
    ],
    milestones: [
      { title: '🛠️ 机械悬挂系统与模块化 3D 打印结构研发', badge: 'YapShift 原创工程', tags: ['机械悬挂公差配合', 'MGN12H / BMG 模块化', 'OpenSCAD & Blender'] },
      { title: '🪨 游戏引擎 5 级 LOD 资产优化管线与 JK AI 系统', badge: 'Technical Art', tags: ['5-Level LOD 减面管线', '法线烘焙零接缝', 'Web 交互前端'] }
    ]
  },

  shaders: [
    { id: 'rendered', label: '● PBR实机' },
    { id: 'clay',     label: '◐ 雕塑灰模' },
    { id: 'wire',     label: '⌗ 拓扑线框' },
    { id: 'xray',     label: '🩻 X-Ray透视' },
    { id: 'albedo',   label: '🎨 纯色贴图' },
    { id: 'chrome',   label: '✦ 镜面反射' }
  ],

  postFX: [
    { id: 'ssao',    label: '🕳️ SSAO阴影' },
    { id: 'bloom',   label: '✨ Bloom辉光' },
    { id: 'sharpen', label: '🔪 4K锐化' },
    { id: 'cinema',  label: '🎬 电影胶片' }
  ],

  // 仅保留你发出的 2 个专属模型链接！
  assets: [
    {
      id: 'yapshift-suspention',
      title: '机械悬挂系统总成 (Suspention Assembly)',
      category: 'MECHANICAL // HARD-SURFACE',
      roleBadge: 'YapShift 原创：机械结构建模 + 装配配合',
      uid: '08632550c5604444a14b53dc339b6589',
      sourceUrl: 'https://sketchfab.com/3d-models/suspention-08632550c5604444a14b53dc339b6589',
      highlights: ['✦ 避震弹簧与摆臂精密配合', '✦ 360° 零漂移对称爆炸拆解', '✦ X-Ray 幽灵内腔透视'],
      roles: [
        { name: '硬表面机械结构', pct: 55, color: 'bg-orange-500', text: 'text-orange-400' },
        { name: '组件拆分与拓扑', pct: 25, color: 'bg-sky-400', text: 'text-sky-400' },
        { name: '金属PBR材质', pct: 20, color: 'bg-emerald-400', text: 'text-emerald-400' }
      ],
      workflow: [
        { step: 'STEP 01', title: '悬挂组件 360° 零漂移爆炸拆解', tag: '炸开 65%', action: 'explode65', desc: '将避震器、螺旋弹簧、控制臂与轴承座沿中心对称向外推开，展示内部连接关系。' },
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
      sourceUrl: 'https://sketchfab.com/3d-models/stylized-rock-lod-preview-5-versions-f9963591aa36459b9837b7a9ca411438',
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
  ]
};
