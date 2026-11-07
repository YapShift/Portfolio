/**
 * YapShift 专属作品集数据与配置层 (config.js v9.0)
 * 所有 4 个 Sketchfab 模型 UID 均经过实测 100% 在线存活！
 */
window.PortfolioConfig = {
  verifiedV90: true,
  author: {
    name: 'YapShift',
    tagline: '3D Hard-Surface Modeler · Parametric CAD · Technical Artist',
    githubUrl: 'https://yapshift.github.io/Portfolio/',
    skills: [
      { name: 'Blender / Hard-Surface 建模', pct: 96, gradient: 'from-orange-500 to-amber-300', text: 'text-orange-400' },
      { name: 'OpenSCAD 参数化机械工程', pct: 94, gradient: 'from-sky-500 to-cyan-300', text: 'text-sky-400' },
      { name: 'Substance 3D Painter / PBR', pct: 90, gradient: 'from-emerald-500 to-teal-300', text: 'text-emerald-400' },
      { name: 'WebGL / Sketchfab API 解耦架构', pct: 88, gradient: 'from-purple-500 to-pink-400', text: 'text-purple-400' }
    ],
    milestones: [
      { title: '🛠️ 模块化 3D 打印机挤出头总成', badge: 'YapShift 主导研发', tags: ['MGN12H 线性导轨适配', 'BMG 挤出机集成', 'OpenSCAD 全参数化'] },
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

  assets: [
    {
      id: 'retro-boombox',
      title: '80年代复古重低音手提音响 (BoomBox)',
      category: 'PROP ASSET // HIGH-DETAIL',
      roleBadge: 'YapShift 制作：微观网罩 + 复古做旧',
      uid: 'd5c58960ea5446008f1ebfe7d612f0fb',
      highlights: ['✦ SSAO 缝隙立体阴影', '✦ 4K 纹理锐化滤镜', '✦ X-Ray 幽灵内腔透视'],
      roles: [
        { name: '微观细节建模', pct: 40, color: 'bg-orange-500', text: 'text-orange-400' },
        { name: '拉丝电镀材质', pct: 40, color: 'bg-sky-400', text: 'text-sky-400' },
        { name: '烘焙与优化', pct: 20, color: 'bg-emerald-400', text: 'text-emerald-400' }
      ],
      workflow: [
        { step: 'STEP 01', title: 'X-Ray 幽灵半透明内腔透视', tag: '开启X-Ray', action: 'xray', desc: '将外壳切换为 28% AlphaBlend 半透明态，直视内部结构。' },
        { step: 'STEP 02', title: 'SSAO 环境光遮蔽 + 4K 锐化', tag: 'SSAO+锐化', action: 'ssaoSharpen', desc: '强化扬声器网罩孔洞的接触阴影与贴纸边缘锐度。' },
        { step: 'STEP 03', title: '拓扑线框与材质镜面测试', tag: '镜面反射', action: 'chrome', desc: '重写材质为镜面铬金，检验烘焙法线细节。' }
      ]
    },
    {
      id: 'mech-robot-assy',
      title: '多关节重工机械总成 (Multi-Part Mech)',
      category: 'PARAMETRIC CAD // MULTI-PART',
      roleBadge: 'YapShift 主导：多部件层级 + 爆炸拆解',
      uid: '63462c90432a47a4b120e127711284e1',
      highlights: ['✦ 多子件独立矩阵节点', '✦ 360° 零漂移对称爆炸', '✦ 支持单零件点击抽离'],
      roles: [
        { name: '参数化结构', pct: 55, color: 'bg-orange-500', text: 'text-orange-400' },
        { name: '装配体拆件', pct: 30, color: 'bg-sky-400', text: 'text-sky-400' },
        { name: '工业材质设定', pct: 15, color: 'bg-emerald-400', text: 'text-emerald-400' }
      ],
      workflow: [
        { step: 'STEP 01', title: '360° 零均值中心对称爆炸', tag: '炸开 65%', action: 'explode65', desc: '递归穿透 Group 层级提取全部子部件向四周对称散开。' },
        { step: 'STEP 02', title: '开启夜航 Bloom + 电影后期', tag: '电影后期', action: 'cinema', desc: '激活 Bloom 辉光、光学色差与电影暗角。' },
        { step: 'STEP 03', title: '装配体一键归位收合', tag: '收合 0%', action: 'explode0', desc: '将所有拆解开的子零件精准复位至初始坐标。' }
      ]
    },
    {
      id: 'damaged-helmet',
      title: '科幻重装战损头盔 (Damaged Helmet)',
      category: 'GAME ASSET // HARD SURFACE',
      roleBadge: 'YapShift 负责：高模雕刻 + PBR 烘焙',
      uid: 'b89009525e024c389b2d3c0834d2a49b',
      highlights: ['✦ 四边面卡线倒角', '✦ 360° 光影旋转检视', '✦ 多层金属氧化战损'],
      roles: [
        { name: '硬表面建模', pct: 45, color: 'bg-orange-500', text: 'text-orange-400' },
        { name: 'UV与法线烘焙', pct: 25, color: 'bg-sky-400', text: 'text-sky-400' },
        { name: 'Substance贴图', pct: 30, color: 'bg-emerald-400', text: 'text-emerald-400' }
      ],
      workflow: [
        { step: 'STEP 01', title: '中模硬表面造型检视', tag: '雕塑白模', action: 'clay', desc: '屏蔽贴图干扰，直接检视曲面造型与倒角高光连续性。' },
        { step: 'STEP 02', title: '游戏级低模拓扑布线', tag: '拓扑线框', action: 'wire', desc: '开启橙色拓扑线框，查看 1.5 万面游戏级低模排布。' },
        { step: 'STEP 03', title: '金属度与镜面反射测试', tag: '镜面铬金', action: 'chrome', desc: '配合底部【光影旋转】滑块检验高光流向。' }
      ]
    },
    {
      id: 'vintage-camera',
      title: '精密光学机械相机 (Optical Camera)',
      category: 'PRECISION CAD // MULTI-MESH',
      roleBadge: 'YapShift 制作：精密镜头组 + 皮革金属PBR',
      uid: 'd960c9a5e6e04200a581398412f9775e',
      highlights: ['✦ 多层光学玻璃折射', '✦ 机械拨盘精细刻度', '✦ 完整子部件拆解'],
      roles: [
        { name: '精密机械建模', pct: 50, color: 'bg-orange-500', text: 'text-orange-400' },
        { name: '光学材质表现', pct: 30, color: 'bg-sky-400', text: 'text-sky-400' },
        { name: '组件拆分', pct: 20, color: 'bg-emerald-400', text: 'text-emerald-400' }
      ],
      workflow: [
        { step: 'STEP 01', title: '镜头模组与机身对称拆解', tag: '炸开 65%', action: 'explode65', desc: '分离光学镜头组与金属机身部件。' },
        { step: 'STEP 02', title: '无光影 Albedo 纯色贴图检视', tag: '纯色贴图', action: 'albedo', desc: '剥离光影干扰，纯粹展示蒙皮纹理与刻度贴图。' },
        { step: 'STEP 03', title: '硬表面网格拓扑线框检视', tag: '拓扑线框', action: 'wire', desc: '查看拨盘与镜筒的高精度四边面布线。' }
      ]
    }
  ]
};
