/**
 * 3D 场景树递归与双模式爆炸解算模块 (scene-math.js v18.0)
 * 两种差异鲜明的工程拆解模式：
 *  1. 立体拆解 (cardinal)：严格沿【上/下/左/右/前/后】6向正交朝外紧凑散开 + 简易方框 Hitbox 防重叠
 *  2. 线性排布 (linear)  ：将全部子零件沿单一水平主轴 (X轴) 按顺序排成一字工程队列（跨度 2.2x），直观展示零件清单
 */
window.SceneGraphMath = {
  IGNORE_NAME_RE: /^(root|scene|world|ground|floor|plane|shadow|stage|backdrop|camera|light|env|sky|grid|base_plane|shadow_plane|sketchfab_model|gltf_scene)/i,

  CARDINAL_6_AXES: [
    { id: '+X', vec: [ 1,  0,  0], axisIdx: 0 },
    { id: '-X', vec: [-1,  0,  0], axisIdx: 0 },
    { id: '+Y', vec: [ 0,  1,  0], axisIdx: 1 },
    { id: '-Y', vec: [ 0, -1,  0], axisIdx: 1 },
    { id: '+Z', vec: [ 0,  0,  1], axisIdx: 2 },
    { id: '-Z', vec: [ 0,  0, -1], axisIdx: 2 }
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

  // 模式 1：六向正交紧凑立体拆解 + 简易方框 Hitbox 防重叠
  solveCardinalLayout(extracted, boxHalves, center, maxRadialLimit) {
    const count = extracted.length;
    const dirs = extracted.map(p => p.cardinalAxis.vec.slice());
    const axisIdxOf = extracted.map(p => p.cardinalAxis.axisIdx);
    const targetDists = new Array(count).fill(0);
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
      const len = list.length;
      list.forEach((item, rank) => {
        const tierFrac = len > 1 ? (rank + 1) / len : 0.70;
        targetDists[item.idx] = maxRadialLimit * (0.28 + 0.72 * tierFrac);
      });
    });

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
          const axI = axisIdxOf[i], axJ = axisIdxOf[j];
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

    // 相对轴向视觉对称配平
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

    return extracted.map((p, i) => [
      dirs[i][0] * targetDists[i],
      dirs[i][1] * targetDists[i],
      dirs[i][2] * targetDists[i]
    ]);
  },

  // 模式 2：真正的“工程一字线性排布” —— 所有零件按 X 顺序沿水平单轴等距排开，同时将 Y/Z 归拢到中轴线，效果与立体拆解截然不同！
  solveLinearQueueLayout(extracted, center, maxRadialLimit) {
    const count = extracted.length;
    const order = extracted.map((p, idx) => ({ idx, x: p.origPos[0] }));
    order.sort((a, b) => a.x - b.x);

    // 线性队列总半宽设为立体半径的 2.2 倍，清晰展开每一个零件
    const halfSpan = maxRadialLimit * 2.2;
    const deltas = new Array(count);

    order.forEach((item, rank) => {
      const i = item.idx;
      const u = count > 1 ? (rank / (count - 1)) * 2 - 1 : 0; // 严格分布在 [-1, +1]
      const targetX = center[0] + u * halfSpan;
      // Y 和 Z 向中轴线温和归拢 65%，形成利落的水平零件队列
      const targetY = extracted[i].origPos[1] + (center[1] - extracted[i].origPos[1]) * 0.65;
      const targetZ = extracted[i].origPos[2] + (center[2] - extracted[i].origPos[2]) * 0.65;

      deltas[i] = [
        targetX - extracted[i].origPos[0],
        targetY - extracted[i].origPos[1],
        targetZ - extracted[i].origPos[2]
      ];
    });

    return deltas;
  },

  // 严格从 0 开始的连续平滑求值（0% ~ 100% 全程零跳变）
  evaluateExplosionFrame(parts, percent, mode = 'cardinal') {
    const count = parts.length;
    if (count <= 1) return [];

    const t = Math.max(0, Math.min(1, (parseFloat(percent) || 0) / 100));
    if (t <= 1e-4) return parts.map(p => p.origPos.slice());

    const isLinear = mode === 'linear';
    return parts.map(p => {
      const delta = isLinear ? p.linearDelta : p.cardinalDelta;
      return [
        p.origPos[0] + delta[0] * t,
        p.origPos[1] + delta[1] * t,
        p.origPos[2] + delta[2] * t
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
    let strategy = 'SINGLE MESH';

    if (leafTransforms.length > 1) {
      rawNodes = leafTransforms;
      strategy = `MULTI-PART (${leafTransforms.length})`;
    } else if (leafTransforms.length === 1) {
      const childrenWithGeo = (leafTransforms[0].children || [])
        .map(ch => typeof ch === 'object' ? (nodeMap[ch.instanceID] || ch) : nodeMap[ch])
        .filter(ch => ch && this.hasGeometryInSubtree(ch, nodeMap));
      if (childrenWithGeo.length > 1) {
        rawNodes = childrenWithGeo;
        strategy = `GROUP-PART (${childrenWithGeo.length})`;
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
          origPos: n.localMatrix ? [n.localMatrix[12] || 0, n.localMatrix[13] || 0, n.localMatrix[14] || 0] : [0, 0, 0]
        })),
        strategy
      };
    }

    const extracted = rawNodes.map(n => {
      const lm = n.localMatrix;
      return {
        instanceID: n.instanceID,
        name: (n.name || `Part_${n.instanceID}`).replace(/_/g, ' '),
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

    const cardinalDeltas = this.solveCardinalLayout(extracted, boxHalves, center, maxRadialLimit);
    const linearDeltas = this.solveLinearQueueLayout(extracted, center, maxRadialLimit);

    const parts = extracted.map((p, idx) => ({
      instanceID: p.instanceID,
      name: `${p.name} [${p.cardinalAxis.id}]`,
      origPos: p.origPos,
      cardinalDelta: cardinalDeltas[idx],
      linearDelta: linearDeltas[idx],
      visible: true,
      pulsed: false
    }));

    return { parts, strategy };
  }
};
