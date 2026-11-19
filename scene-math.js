/**
 * 3D 场景树递归、六向正交朝外爆炸与紧凑 Hitbox 驱动解算模块 (scene-math.js v14.0)
 * 核心特性：
 *  1. 严格限制爆炸角度为【右(+X)、左(-X)、上(+Y)、下(-Y)、前(+Z)、后(-Z)】6 个正交朝外方向
 *  2. 展开距离严格由各零件简易方框 Hitbox (AABB) 尺寸决定，保留高密集装配感，不飞散
 *  3. 1% 起步即进入“方框 Hitbox 零重叠最小紧凑态 (1.00x)”，1%~100% 平滑线性外扩 (1.00x -> 1.65x)，全程 0 突变、0 穿模
 */
window.SceneGraphMath = {
  IGNORE_NAME_RE: /^(root|scene|world|ground|floor|plane|shadow|stage|backdrop|camera|light|env|sky|grid|base_plane|shadow_plane|sketchfab_model|gltf_scene)/i,

  CARDINAL_6_AXES: [
    { id: '+X', label: '右(+X)', vec: [ 1,  0,  0], axisIdx: 0, sign:  1 },
    { id: '-X', label: '左(-X)', vec: [-1,  0,  0], axisIdx: 0, sign: -1 },
    { id: '+Y', label: '上(+Y)', vec: [ 0,  1,  0], axisIdx: 1, sign:  1 },
    { id: '-Y', label: '下(-Y)', vec: [ 0, -1,  0], axisIdx: 1, sign: -1 },
    { id: '+Z', label: '前(+Z)', vec: [ 0,  0,  1], axisIdx: 2, sign:  1 },
    { id: '-Z', label: '后(-Z)', vec: [ 0,  0, -1], axisIdx: 2, sign: -1 }
  ],

  hasGeometryInSubtree(node, nodeMap, visited = new Set()) {
    if (!node || visited.has(node.instanceID)) return false;
    visited.add(node.instanceID);
    if (node.type === 'Geometry' || node.type === 'RigGeometry') return true;
    if (!Array.isArray(node.children)) return false;
    return node.children.some(ch => {
      const childObj = typeof ch === 'object' ? (nodeMap[ch.instanceID] || ch) : nodeMap[ch];
      return this.hasGeometryInSubtree(childObj, nodeMap, visited);
    });
  },

  extractMatrixScale(m) {
    if (!m || m.length < 11) return [1, 1, 1];
    return [
      Math.hypot(m[0], m[1], m[2]) || 1,
      Math.hypot(m[4], m[5], m[6]) || 1,
      Math.hypot(m[8], m[9], m[10]) || 1
    ];
  },

  // 3D 简易方框型 Hitbox (AABB) 重叠检测（padding=1.06 仅留 6% 紧凑间隙）
  checkBoxHitboxOverlap(posA, halfA, posB, halfB, padding = 1.06) {
    const ox = (halfA[0] + halfB[0]) * padding - Math.abs(posA[0] - posB[0]);
    if (ox <= 0) return null;
    const oy = (halfA[1] + halfB[1]) * padding - Math.abs(posA[1] - posB[1]);
    if (oy <= 0) return null;
    const oz = (halfA[2] + halfB[2]) * padding - Math.abs(posA[2] - posB[2]);
    if (oz <= 0) return null;
    return [ox, oy, oz];
  },

  assignOrthogonalOutwardAxes(extracted, center, maxSpread) {
    const count = extracted.length;
    const axisCounts = [0, 0, 0, 0, 0, 0];
    const assignments = new Array(count);

    extracted.forEach((p, idx) => {
      const dx = p.origPos[0] - center[0];
      const dy = p.origPos[1] - center[1];
      const dz = p.origPos[2] - center[2];
      const dist = Math.hypot(dx, dy, dz);

      if (maxSpread > 1e-3 && dist > maxSpread * 0.05) {
        const rel = [dx / dist, dy / dist, dz / dist];
        let bestAxis = 0;
        let bestScore = -Infinity;

        this.CARDINAL_6_AXES.forEach((ax, aIdx) => {
          const dot = rel[0] * ax.vec[0] + rel[1] * ax.vec[1] + rel[2] * ax.vec[2];
          const score = dot - axisCounts[aIdx] * 0.22;
          if (dot > 0.05 && score > bestScore) {
            bestScore = score;
            bestAxis = aIdx;
          }
        });

        assignments[idx] = this.CARDINAL_6_AXES[bestAxis];
        axisCounts[bestAxis]++;
      } else {
        const aIdx = idx % 6;
        assignments[idx] = this.CARDINAL_6_AXES[aIdx];
        axisCounts[aIdx]++;
      }
    });

    return assignments;
  },

  /**
   * 严格根据简易方框型 Hitbox (AABB) 大小，解算每个零件的“最小无重叠紧凑分离距离 (minClearDist)”
   * 该状态直接作为 1% 时的初始分开状态，保留最大密集感，绝不隔开太远！
   */
  solveTightHitboxClearance(extracted, boxHalves, center, mode = 'cardinal6') {
    const count = extracted.length;
    const dirs = extracted.map((p, idx) => {
      if (mode === 'axial') {
        const sign = idx % 2 === 0 ? 1 : -1;
        return [sign, 0, 0];
      }
      return p.cardinalAxis.vec.slice();
    });

    const axisIdxOf = dirs.map(d => (Math.abs(d[0]) > 0.5 ? 0 : (Math.abs(d[1]) > 0.5 ? 1 : 2)));

    // 1. 按同方向由内到外排序，初始位移严格等于自身方框 Hitbox 在该轴上的半厚度（刚好让出中心）
    const minDists = new Array(count).fill(0);
    const groupsByDir = {};

    extracted.forEach((p, idx) => {
      const key = dirs[idx].join(',');
      if (!groupsByDir[key]) groupsByDir[key] = [];
      const rel = [p.origPos[0] - center[0], p.origPos[1] - center[1], p.origPos[2] - center[2]];
      const proj = rel[0] * dirs[idx][0] + rel[1] * dirs[idx][1] + rel[2] * dirs[idx][2];
      groupsByDir[key].push({ idx, proj });
    });

    Object.values(groupsByDir).forEach(list => {
      list.sort((a, b) => a.proj - b.proj);
      let cursor = 0;
      list.forEach((item, rank) => {
        const i = item.idx;
        const h = boxHalves[i][axisIdxOf[i]];
        // 紧贴上一个零件的方框外沿 + 极小安全间隙，严格按碰撞箱厚度排布
        if (rank === 0) {
          minDists[i] = h * 0.85;
          cursor = minDists[i] + h * 1.06;
        } else {
          minDists[i] = cursor + h * 1.06;
          cursor = minDists[i] + h * 1.06;
        }
      });
    });

    // 2. 全局 3D 简易方框 Hitbox (AABB) 碰撞收敛检测：
    //    确保不同正交轴（例如 +X 和 +Y）在中心附近也不会互相重叠，推开量严格等于重叠深度
    const maxIterations = 24;
    for (let iter = 0; iter < maxIterations; iter++) {
      let anyOverlap = false;

      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const posI = [
            extracted[i].origPos[0] + dirs[i][0] * minDists[i],
            extracted[i].origPos[1] + dirs[i][1] * minDists[i],
            extracted[i].origPos[2] + dirs[i][2] * minDists[i]
          ];
          const posJ = [
            extracted[j].origPos[0] + dirs[j][0] * minDists[j],
            extracted[j].origPos[1] + dirs[j][1] * minDists[j],
            extracted[j].origPos[2] + dirs[j][2] * minDists[j]
          ];

          const overlap = this.checkBoxHitboxOverlap(posI, boxHalves[i], posJ, boxHalves[j], 1.06);
          if (!overlap) continue;

          anyOverlap = true;
          const axI = axisIdxOf[i];
          const axJ = axisIdxOf[j];

          if (axI === axJ) {
            const push = overlap[axI] * 0.55;
            if (minDists[i] >= minDists[j]) minDists[i] += push;
            else minDists[j] += push;
          } else {
            // 不同轴擦碰：各自只沿自己的正交朝外轴推开刚好不重叠的最小量
            minDists[i] += overlap[axI] * 0.35;
            minDists[j] += overlap[axJ] * 0.35;
          }
        }
      }

      if (!anyOverlap) break;
    }

    return { dirs, minDists };
  },

  /**
   * 丝滑逐帧位置求值：
   *  - 0%        -> 完全闭合 (origPos)
   *  - 1%        -> 立刻分开到 Hitbox 最小无重叠紧凑态 (1.00x minClearDist)
   *  - 1% ~ 100% -> 纯线性平滑外扩 (1.00x -> 1.65x)，全程 0 突变、0 重叠、高密集感！
   */
  evaluateExplosionFrame(parts, percent, pattern = 'radial') {
    const count = parts.length;
    if (count <= 1) return [];

    const pVal = Math.max(0, Math.min(100, parseFloat(percent) || 0));
    if (pVal <= 0.01) {
      return parts.map(p => p.origPos.slice());
    }

    const isAxial = pattern === 'axial';
    // 1% 时 u=0 (scale=1.00，刚好按 Hitbox 分开)；100% 时 u=1 (scale=1.65，紧凑外扩)
    const u = Math.max(0, (pVal - 1) / 99);
    const scale = 1.0 + 0.65 * u;

    return parts.map(p => {
      const cfg = isAxial ? p.axialTight : p.cardinalTight;
      const d = cfg.minDist * scale;
      return [
        p.origPos[0] + cfg.dir[0] * d,
        p.origPos[1] + cfg.dir[1] * d,
        p.origPos[2] + cfg.dir[2] * d
      ];
    });
  },

  analyzeAndBuildVectors(nodeMap, cameraDistanceScale = 1.0) {
    if (!nodeMap) return { parts: [], strategy: 'NONE' };
    const allNodes = Object.values(nodeMap);

    const leafTransforms = allNodes.filter(n => {
      if (n.type !== 'MatrixTransform' || !this.hasGeometryInSubtree(n, nodeMap)) return false;
      const name = (n.name || '').trim();
      if (this.IGNORE_NAME_RE.test(name)) return false;

      let hasDeeperTransform = false;
      const checkDeeper = (curr, visited = new Set()) => {
        if (!curr || visited.has(curr.instanceID) || !Array.isArray(curr.children)) return;
        visited.add(curr.instanceID);
        for (const ch of curr.children) {
          const obj = typeof ch === 'object' ? (nodeMap[ch.instanceID] || ch) : nodeMap[ch];
          if (!obj) continue;
          if (obj.type === 'MatrixTransform' && this.hasGeometryInSubtree(obj, nodeMap)) {
            hasDeeperTransform = true;
            return;
          }
          checkDeeper(obj, visited);
        }
      };
      checkDeeper(n);
      return !hasDeeperTransform;
    });

    let rawNodes = [];
    let strategy = 'SINGLE-MESH (1)';

    if (leafTransforms.length > 1) {
      rawNodes = leafTransforms;
      strategy = `TIGHT-HITBOX 6-WAY (${leafTransforms.length})`;
    } else if (leafTransforms.length === 1) {
      const childrenWithGeo = (leafTransforms[0].children || [])
        .map(ch => typeof ch === 'object' ? (nodeMap[ch.instanceID] || ch) : nodeMap[ch])
        .filter(ch => ch && this.hasGeometryInSubtree(ch, nodeMap));
      if (childrenWithGeo.length > 1) {
        rawNodes = childrenWithGeo;
        strategy = `TIGHT-HITBOX GROUP (${childrenWithGeo.length})`;
      } else {
        rawNodes = leafTransforms;
      }
    } else {
      const fallbackTransforms = allNodes.filter(n => n.type === 'MatrixTransform' && this.hasGeometryInSubtree(n, nodeMap));
      rawNodes = fallbackTransforms.slice(0, 1);
    }

    const count = rawNodes.length;
    if (count <= 1) {
      return {
        parts: rawNodes.map(n => ({
          instanceID: n.instanceID,
          name: n.name || 'Merged_Mesh',
          nodeType: n.type,
          origPos: n.localMatrix ? [n.localMatrix[12] || 0, n.localMatrix[13] || 0, n.localMatrix[14] || 0] : [0, 0, 0]
        })),
        strategy
      };
    }

    const extracted = rawNodes.map(n => {
      const lm = n.localMatrix;
      const wm = n.worldMatrix;
      const origLocalPos = lm ? [lm[12] || 0, lm[13] || 0, lm[14] || 0] : [0, 0, 0];
      const localScale = this.extractMatrixScale(lm);
      const worldScale = this.extractMatrixScale(wm);
      const parentScaleRatio = Math.max(1e-4, ((worldScale[0] / localScale[0]) + (worldScale[1] / localScale[1]) + (worldScale[2] / localScale[2])) / 3);

      return {
        instanceID: n.instanceID,
        name: (n.name || `${n.type}_${n.instanceID}`).replace(/_/g, ' '),
        nodeType: n.type,
        origPos: origLocalPos,
        localScale,
        parentScaleRatio
      };
    });

    let cx = 0, cy = 0, cz = 0;
    extracted.forEach(p => { cx += p.origPos[0]; cy += p.origPos[1]; cz += p.origPos[2]; });
    cx /= count; cy /= count; cz /= count;
    const center = [cx, cy, cz];

    let maxLocalSpread = 0;
    extracted.forEach(p => {
      const d = Math.hypot(p.origPos[0] - cx, p.origPos[1] - cy, p.origPos[2] - cz);
      if (d > maxLocalSpread) maxLocalSpread = d;
    });

    // 紧凑参考单元尺寸（专门压小以生成贴身的简易方框 Hitbox，保持高密集感）
    const avgParentScale = extracted.reduce((acc, p) => acc + p.parentScaleRatio, 0) / count;
    const camRefUnit = (cameraDistanceScale * 0.22) / (avgParentScale || 1);
    const refUnit = maxLocalSpread > 1e-3
      ? Math.min(maxLocalSpread * 0.22, camRefUnit)
      : camRefUnit;

    const assignedAxes = this.assignOrthogonalOutwardAxes(extracted, center, maxLocalSpread);
    extracted.forEach((p, idx) => { p.cardinalAxis = assignedAxes[idx]; });

    // 按各零件自身局部矩阵比例生成紧贴的简易方框 Hitbox 半尺寸 [hx, hy, hz]
    const boxHalves = extracted.map(p => {
      const s = p.localScale || [1, 1, 1];
      const norm = Math.cbrt(s[0] * s[1] * s[2]) || 1;
      const baseHalf = refUnit * 0.36;
      return [
        baseHalf * Math.max(0.55, Math.min(1.45, s[0] / norm)),
        baseHalf * Math.max(0.55, Math.min(1.45, s[1] / norm)),
        baseHalf * Math.max(0.55, Math.min(1.45, s[2] / norm))
      ];
    });

    // 严格由简易方框 Hitbox 解算最小紧凑分离距离
    const cardinalTight = this.solveTightHitboxClearance(extracted, boxHalves, center, 'cardinal6');
    const axialTight = this.solveTightHitboxClearance(extracted, boxHalves, center, 'axial');

    const parts = extracted.map((p, idx) => {
      const cDir = cardinalTight.dirs[idx];
      const cDist = cardinalTight.minDists[idx];
      const aDir = axialTight.dirs[idx];
      const aDist = axialTight.minDists[idx];

      return {
        instanceID: p.instanceID,
        name: `${p.name} [${p.cardinalAxis.id}]`,
        nodeType: p.nodeType,
        origPos: p.origPos,
        boxHalf: boxHalves[idx],
        cardinalTight: { dir: cDir, minDist: cDist },
        axialTight: { dir: aDir, minDist: aDist },
        localRadialVec: [cDir[0] * cDist * 1.4, cDir[1] * cDist * 1.4, cDir[2] * cDist * 1.4],
        visible: true,
        pulsed: false
      };
    });

    return { parts, strategy };
  }
};
