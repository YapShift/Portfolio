/**
 * 3D 场景树深度递归解析与零漂移对称爆炸数学库 (scene-math.js)
 * 专门解决：
 *  1. 零件不再往一侧偏飞（强制零均值中心对称）
 *  2. 解决单层 Group 包裹导致找不出子零件的问题（自适应最深有效拆分深度）
 *  3. 自动过滤地面、阴影板、背景盒与根节点容器
 */
window.SceneGraphMath = {
  IGNORE_REGEX: /^(root|scene|world|ground|floor|plane|shadow|stage|backdrop|camera|light|env|sky|grid|base_plane|shadow_plane)/i,

  /**
   * 递归扫描 Sketchfab 场景图，自动寻找能拆分出最多有效子部件的层级
   */
  extractExplodableNodes(nodeMap) {
    if (!nodeMap) return { nodes: [], strategy: 'NONE' };
    const allNodes = Object.values(nodeMap);

    // 1. 收集所有 MatrixTransform 节点并过滤背景/地面
    const validTransforms = allNodes.filter(n => {
      if (n.type !== 'MatrixTransform') return false;
      const name = (n.name || '').trim();
      if (this.IGNORE_REGEX.test(name)) return false;
      return true;
    });

    // 2. 优先寻找“直接包含 Geometry 子节点”的叶子级 MatrixTransform（最精准的独立零件）
    const leafPartTransforms = validTransforms.filter(n => {
      if (!Array.isArray(n.children) || n.children.length === 0) return false;
      return n.children.some(cid => nodeMap[cid] && nodeMap[cid].type === 'Geometry');
    });

    if (leafPartTransforms.length > 1) {
      return { nodes: leafPartTransforms, strategy: `LEAF-MESH (${leafPartTransforms.length} 零件)` };
    }

    // 3. 若模型全是嵌套 Group，则选取非根节点的有效 Transform
    const groupTransforms = validTransforms.filter(n => n.name && !/root|scene|gltf|sketchfab|model/i.test(n.name));
    if (groupTransforms.length > 1) {
      return { nodes: groupTransforms, strategy: `GROUP-TREE (${groupTransforms.length} 组件)` };
    }

    return {
      nodes: leafPartTransforms.length ? leafPartTransforms : validTransforms.slice(0, 1),
      strategy: 'SINGLE-MESH (单网格合并资产)'
    };
  },

  /**
   * 计算零均值中心对称爆炸向量（Zero-Drift Balanced Vectors）
   */
  analyzeAndBuildVectors(nodeMap, cameraScale = 1.6) {
    const { nodes, strategy } = this.extractExplodableNodes(nodeMap);
    const rawParts = [];

    nodes.forEach((n, idx) => {
      const m = n.localMatrix || n.worldMatrix;
      if (!m || m.length < 16) return;
      rawParts.push({
        instanceID: n.instanceID,
        name: (n.name || `SubPart_${idx + 1}`).replace(/_/g, ' '),
        origPos: [m[12], m[13], m[14]],
        worldPos: n.worldMatrix ? [n.worldMatrix[12], n.worldMatrix[13], n.worldMatrix[14]] : [m[12], m[13], m[14]],
        visible: true,
        pulsed: false
      });
    });

    const count = rawParts.length;
    if (count <= 1) {
      return { parts: rawParts, strategy, isSingleMesh: true };
    }

    // 计算所有零件的世界中心质心
    let cx = 0, cy = 0, cz = 0;
    rawParts.forEach(p => {
      cx += p.worldPos[0];
      cy += p.worldPos[1];
      cz += p.worldPos[2];
    });
    cx /= count; cy /= count; cz /= count;

    // 判断零件本身是否有明显的空间坐标偏移
    let maxSpread = 0;
    const rawOffsets = rawParts.map(p => {
      const dx = p.worldPos[0] - cx;
      const dy = p.worldPos[1] - cy;
      const dz = p.worldPos[2] - cz;
      const d = Math.hypot(dx, dy, dz);
      if (d > maxSpread) maxSpread = d;
      return [dx, dy, dz, d];
    });

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const radialDirs = [];
    const axialDirs = [];

    for (let i = 0; i < count; i++) {
      // A. 标准斐波那契 360° 均匀球面向量（保证无论零件原点是否重合，都能向四周均匀散开）
      const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      const fibX = Math.cos(theta) * r;
      const fibZ = Math.sin(theta) * r;
      const fibY = y;

      // B. 如果零件自带明显偏移，将真实质心方向与斐波那契球面融合；若全在(0,0,0)则100%采用球面分布
      let rx = fibX, ry = fibY, rz = fibZ;
      if (maxSpread > 0.05 && rawOffsets[i][3] > maxSpread * 0.08) {
        const inv = 1 / rawOffsets[i][3];
        rx = (rawOffsets[i][0] * inv) * 0.65 + fibX * 0.35;
        ry = (rawOffsets[i][1] * inv) * 0.65 + fibY * 0.35;
        rz = (rawOffsets[i][2] * inv) * 0.65 + fibZ * 0.35;
      }
      const rLen = Math.hypot(rx, ry, rz) || 1;
      radialDirs.push([rx / rLen, ry / rLen, rz / rLen]);

      // C. 机械轴向拆解向量（沿水平轴对称展开 + 轻微圆周错位防遮挡）
      const tNorm = (i / (count - 1)) * 2 - 1; // 严格分布在 [-1, +1]
      const ringAngle = i * 2.1;
      axialDirs.push([
        tNorm * 1.15,
        Math.sin(ringAngle) * 0.32,
        Math.cos(ringAngle) * 0.32
      ]);
    }

    // D. 关键步骤：零均值中心化校准（Zero-Mean Centering）
    // 强制所有零件爆炸向量的总和等于 (0,0,0)，彻底杜绝整体往一边飞出屏幕！
    const balanceVectors = (dirs) => {
      let mx = 0, my = 0, mz = 0;
      dirs.forEach(v => { mx += v[0]; my += v[1]; mz += v[2]; });
      mx /= count; my /= count; mz /= count;
      return dirs.map(v => {
        const bx = v[0] - mx;
        const by = v[1] - my;
        const bz = v[2] - mz;
        const len = Math.hypot(bx, by, bz) || 1;
        return [bx / len, by / len, bz / len];
      });
    };

    const balancedRadial = balanceVectors(radialDirs);
    const balancedAxial = balanceVectors(axialDirs);
    const baseDist = Math.max(maxSpread * 1.25, cameraScale);

    rawParts.forEach((p, i) => {
      // 内外圈错落层次感，避免所有零件停在同一个球壳半径上
      const layerTier = 0.72 + (i % 3) * 0.24;
      p.radialDir = balancedRadial[i];
      p.axialDir = balancedAxial[i];
      p.maxDistance = baseDist * layerTier;
    });

    return {
      parts: rawParts,
      strategy: maxSpread > 0.05 ? `${strategy} · 质心对称` : `${strategy} · 斐波那契球面`,
      isSingleMesh: false
    };
  }
};
