/**
 * 3D 场景树递归、六向正交朝外爆炸与零跳变紧凑平衡解算模块 (scene-math.js v16.0)
 * 核心升级：
 *  1. 彻底移除易放大 100 倍的 avgParentScale 除法，最大展开半径直接锁死在模型真实跨度的 18% (紧凑密集，完美落在中央 HUD 圆环内)
 *  2. 彻底消除 0% -> 1% 的瞬间阶跃跳变：全程采用从 0 严格连续出发的平滑映射，配合 WebGL 原生 GPU 缓动过渡，极度丝滑
 *  3. 严格限制爆炸方向为【右(+X)、左(-X)、上(+Y)、下(-Y)、前(+Z)、后(-Z)】6 个正交朝外方向 + 简易方框 Hitbox 防重叠
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

  checkBoxHitboxOverlap(posA, halfA, posB, halfB, padding = 1.04) {
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

      if (maxSpread > 1e-3 && dist > maxSpread * 0.04) {
        const rel = [dx / dist, dy / dist, dz / dist];
        let bestAxis = 0;
        let bestScore = -Infinity;

        this.CARDINAL_6_AXES.forEach((ax, aIdx) => {
          const dot = rel[0] * ax.vec[0] + rel[1] * ax.vec[1] + rel[2] * ax.vec[2];
          const score = dot - axisCounts[aIdx] * 0.14;
          if (dot > 0.02 && score > bestScore) {
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

  solveCompactHitboxLayout(extracted, boxHalves, center, maxRadialLimit, mode = 'cardinal6') {
    const count = extracted.length;
    const dirs = extracted.map((p, idx) => {
      if (mode === 'axial') {
        const sign = idx % 2 === 0 ? 1 : -1;
        return [sign, 0, 0];
      }
      return p.cardinalAxis.vec.slice();
    });

    const axisIdxOf = dirs.map(d => (Math.abs(d[0]) > 0.5 ? 0 : (Math.abs(d[1]) > 0.5 ? 1 : 2)));
    const targetDists = new Array(count).fill(0);
    const groupsByDir = {};

    extracted.forEach((p, idx) => {
      const key = dirs[idx].join(',');
      if (!groupsByDir[key]) groupsByDir[key] = [];
      const rel = [p.origPos[0] - center[0], p.origPos[1] - center[1], p.origPos[2] - center[2]];
      const proj = rel[0] * dirs[idx][0] + rel[1] * dirs[idx][1] + rel[2] * dirs[idx][2];
      groupsByDir[key].push({ idx, proj });
    });

    // 1. 紧凑分层：按碰撞箱厚度排布，严格压缩在 maxRadialLimit 以内
    Object.values(groupsByDir).forEach(list => {
      list.sort((a, b) => a.proj - b.proj);
      const len = list.length;
      list.forEach((item, rank) => {
        const i = item.idx;
        const tierFrac = len > 1 ? (rank + 1) / len : 0.70;
        targetDists[i] = maxRadialLimit * (0.28 + 0.72 * tierFrac);
      });
    });

    // 2. 轻量 3D 方框 Hitbox (AABB) 防重叠微调
    for (let iter = 0; iter < 12; iter++) {
      let anyOverlap = false;
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const posI = [
            extracted[i].origPos[0] + dirs[i][0] * targetDists[i],
            extracted[i].origPos[1] + dirs[i][1] * targetDists[i],
            extracted[i].origPos[2] + dirs[i][2] * targetDists[i]
          ];
          const posJ = [
            extracted[j].origPos[0] + dirs[j][0] * targetDists[j],
            extracted[j].origPos[1] + dirs[j][1] * targetDists[j],
            extracted[j].origPos[2] + dirs[j][2] * targetDists[j]
          ];

          const overlap = this.checkBoxHitboxOverlap(posI, boxHalves[i], posJ, boxHalves[j], 1.04);
          if (!overlap) continue;

          anyOverlap = true;
          const axI = axisIdxOf[i];
          const axJ = axisIdxOf[j];
          if (axI === axJ) {
            const push = overlap[axI] * 0.40;
            if (targetDists[i] >= targetDists[j]) targetDists[i] = Math.min(maxRadialLimit * 1.15, targetDists[i] + push);
            else targetDists[j] = Math.min(maxRadialLimit * 1.15, targetDists[j] + push);
          } else {
            targetDists[i] = Math.min(maxRadialLimit * 1.15, targetDists[i] + overlap[axI] * 0.22);
            targetDists[j] = Math.min(maxRadialLimit * 1.15, targetDists[j] + overlap[axJ] * 0.22);
          }
        }
      }
      if (!anyOverlap) break;
    }

    // 3. 左右/上下/前后视觉对称配平
    for (let axis = 0; axis < 3; axis++) {
      let posMax = 0, negMax = 0;
      const posIdx = [], negIdx = [];
      for (let i = 0; i < count; i++) {
        if (dirs[i][axis] > 0.5) { posIdx.push(i); if (targetDists[i] > posMax) posMax = targetDists[i]; }
        else if (dirs[i][axis] < -0.5) { negIdx.push(i); if (targetDists[i] > negMax) negMax = targetDists[i]; }
      }
      if (posIdx.length > 0 && negIdx.length > 0 && posMax > 1e-4 && negMax > 1e-4) {
        const balancedMax = (posMax + negMax) * 0.5;
        const sPos = Math.max(0.75, Math.min(1.25, balancedMax / posMax));
        const sNeg = Math.max(0.75, Math.min(1.25, balancedMax / negMax));
        posIdx.forEach(i => { targetDists[i] *= sPos; });
        negIdx.forEach(i => { targetDists[i] *= sNeg; });
      }
    }

    return { dirs, targetDists };
  },

  /**
   * 严格从 0 开始的纯连续平滑求值（0% -> 1% 零跳变！）
   */
  evaluateExplosionFrame(parts, percent, pattern = 'radial') {
    const count = parts.length;
    if (count <= 1) return [];

    const t = Math.max(0, Math.min(1, (parseFloat(percent) || 0) / 100));
    if (t <= 1e-4) return parts.map(p => p.origPos.slice());

    const isAxial = pattern === 'axial';
    return parts.map(p => {
      const cfg = isAxial ? p.axialTight : p.cardinalTight;
      const d = cfg.minDist * t;
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
      strategy = `V16-COMPACT 6-WAY (${leafTransforms.length})`;
    } else if (leafTransforms.length === 1) {
      const childrenWithGeo = (leafTransforms[0].children || [])
        .map(ch => typeof ch === 'object' ? (nodeMap[ch.instanceID] || ch) : nodeMap[ch])
        .filter(ch => ch && this.hasGeometryInSubtree(ch, nodeMap));
      if (childrenWithGeo.length > 1) {
        rawNodes = childrenWithGeo;
        strategy = `V16-COMPACT GROUP (${childrenWithGeo.length})`;
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
      return {
        instanceID: n.instanceID,
        name: (n.name || `${n.type}_${n.instanceID}`).replace(/_/g, ' '),
        nodeType: n.type,
        origPos: lm ? [lm[12] || 0, lm[13] || 0, lm[14] || 0] : [0, 0, 0],
        localScale: this.extractMatrixScale(lm)
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

    // 最大展开半径直接锁死在模型真实跨度的 18%（想更紧凑可改 0.14，想稍大可改 0.24）
    const maxRadialLimit = maxLocalSpread > 1e-3
      ? maxLocalSpread * 0.18
      : cameraDistanceScale * 0.12;

    const assignedAxes = this.assignOrthogonalOutwardAxes(extracted, center, maxLocalSpread);
    extracted.forEach((p, idx) => { p.cardinalAxis = assignedAxes[idx]; });

    const boxHalves = extracted.map(p => {
      const s = p.localScale || [1, 1, 1];
      const norm = Math.cbrt(s[0] * s[1] * s[2]) || 1;
      const baseHalf = maxRadialLimit * 0.12;
      return [
        baseHalf * Math.max(0.55, Math.min(1.4, s[0] / norm)),
        baseHalf * Math.max(0.55, Math.min(1.4, s[1] / norm)),
        baseHalf * Math.max(0.55, Math.min(1.4, s[2] / norm))
      ];
    });

    const cardinalTight = this.solveCompactHitboxLayout(extracted, boxHalves, center, maxRadialLimit, 'cardinal6');
    const axialTight = this.solveCompactHitboxLayout(extracted, boxHalves, center, maxRadialLimit, 'axial');

    const parts = extracted.map((p, idx) => {
      const cDir = cardinalTight.dirs[idx];
      const cDist = cardinalTight.targetDists[idx];
      const aDir = axialTight.dirs[idx];
      const aDist = axialTight.targetDists[idx];

      return {
        instanceID: p.instanceID,
        name: `${p.name} [${p.cardinalAxis.id}]`,
        nodeType: p.nodeType,
        origPos: p.origPos,
        boxHalf: boxHalves[idx],
        cardinalTight: { dir: cDir, minDist: cDist },
        axialTight: { dir: aDir, minDist: aDist },
        localRadialVec: [cDir[0] * cDist, cDir[1] * cDist, cDir[2] * cDist],
        visible: true,
        pulsed: false
      };
    });

    return { parts, strategy };
  }
};
