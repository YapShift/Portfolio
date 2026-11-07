// config.js - 个人履历与 3D 资产配置表
window.PortfolioConfig = {
  author: {
    name: 'TANG JIN JIANG',
    role: '3D Modeler · Parametric CAD · Web 3D',
    email: 'tang_jinjiang1@ge.rakyatdigital.gov.my',
    skills: [
      { name: 'Blender / Hard-Surface', pct: 96, gradient: 'from-orange-500 to-amber-300', text: 'text-orange-400' },
      { name: 'OpenSCAD 参数化机械建模', pct: 94, gradient: 'from-sky-500 to-cyan-300', text: 'text-sky-400' },
      { name: 'Substance 3D Painter / PBR', pct: 90, gradient: 'from-emerald-500 to-teal-300', text: 'text-emerald-400' },
      { name: 'Sketchfab API / WebGL 前端架构', pct: 88, gradient: 'from-purple-500 to-pink-400', text: 'text-purple-400' }
    ],
    milestones: [
      { title: '🛠️ 模块化 3D 打印机挤出头总成', badge: '主设计师', tags: ['MGN12H 导轨适配', 'BMG 挤出机集成', 'OpenSCAD 全参数化'] },
      { title: '🤖 JK AI 智能教育交互系统', badge: '独立全栈开发', tags: ['SPM 知识图谱结构化', '双语实时转译', 'Web 交互前端'] }
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

  // 👇 在这里把 uid 替换成你自己的 Sketchfab 32位模型 ID 即可！
  assets: [
    {
      id: 'mechanical-gearbox',
      title: '精密机械多部件总成 (Multi-Part Assy)',
      category: 'PARAMETRIC CAD // MULTI-PART',
      roleBadge: '主导设计：参数化公差配合 + 独立零件拆解',
      uid: 'eb022e8b473b49b19a21b91e840c5b6e',
      highlights: ['✦ 递归穿透 Group 识别零件', '✦ X-Ray 幽灵透视内腔', '✦ 支持单零件点击抽离'],
      roles: [
        { name: '参数化结构', pct: 55, color: 'bg-orange-500', text: 'text-orange-400' },
        { name: '装配体拆件', pct: 30, color: 'bg-sky-400', text: 'text-sky-400' },
        { name: '工业材质设定', pct: 15, color: 'bg-emerald-400', text: 'text-emerald-400' }
      ],
      workflow: [
        { step: 'STEP 01', title: '360° 零均值中心对称爆炸', tag: '炸开 65%', action: 'explode65', desc: '递归穿透 Group 层级提取全部子部件向四周对称散开。' },
        { step: 'STEP 02', title: 'X-Ray 幽灵半透明内腔透视', tag: '开启X-Ray', action: 'xray', desc: '将所有外甲切换为 28% AlphaBlend 半透明态，直视内部配合。' },
        { step: 'STEP 03', title: '装配体一键归位收合', tag: '收合 0%', action: 'explode0', desc: '将所有拆解开的子零件精准复位至初始坐标。' }
      ]
    },
    {
      id: 'sci-fi-drone',
      title: '反重力多装甲侦查无人机 (Sci-Fi Drone)',
      category: 'CONCEPT MECH // MULTI-MESH',
      roleBadge: '负责：概念分件设计 + 发光核心管线',
      uid: '84999d3e8e7a4ebbb0f7c234a9094196',
      highlights: ['✦ 多材质 Geometry 拆解', '✦ 电影级色差与暗角', '✦ Bloom 自发光核心'],
      roles: [
        { name: '概念硬表面', pct: 50, color: 'bg-orange-500', text: 'text-orange-400' },
        { name: '发光与后期', pct: 30, color: 'bg-sky-400', text: 'text-sky-400' },
        { name: '结构分件', pct: 20, color: 'bg-emerald-400', text: 'text-emerald-400' }
      ],
      workflow: [
        { step: 'STEP 01', title: '外甲与内核对称分离拆解', tag: '爆炸拆解', action: 'explode65', desc: '向外对称推开无人机外层装甲片，同时镜头自动拉远。' },
        { step: 'STEP 02', title: '开启夜航 Bloom + 电影后期', tag: '电影后期', action: 'cinema', desc: '激活 Bloom 辉光、光学色差与电影暗角。' },
        { step: 'STEP 03', title: '装甲蒙皮拓扑流向检视', tag: '拓扑线框', action: 'wire', desc: '查看曲面硬表面切分线与边缘卡线。' }
      ]
    }
  ]
};
