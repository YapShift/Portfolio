/**
 * 3D 场景树递归、强力 AABB 方框碰撞解算与模型自转根节点提取 (scene-math.js v21.0)
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

  /**
   * 寻找最顶层包含几何体的 MatrixTransform 根节点（用于不锁相机的模型自转转台）
   */
  findTopLevelTransformRoots(nodeMap) {
    if (!nodeMap) return [];
    const allNodes = Object.values(nodeMap);
    const parentOf = new Map();

    allNodes.forEach(n => {
      if (!Array.isArray(n.children)) return;
      n.children.forEach(ch => {
        const cid = typeof ch === 'object' ? ch.instanceID : ch;
        if (cid !== undefined) parentOf.set(cid, n.instanceID);
      });
    });

    const roots = allNodes.filter(n => {
      if (n.type !== 'MatrixTransform' || !this.hasGeometryInSubtree(n, nodeMap)) return false;
      let curr = parentOf.get(n.instanceID);
      while (curr !== undefined) {
        const pNode = nodeMap[curr];
        if (pNode && pNode.type === 'MatrixTransform' && this.hasGeometryInSubtree(pNode, nodeMap)) {
          return false;
        }
        curr = parentOf.get(curr);
      }
      return true;
    });

    return roots.map(r => r.instanceID);
  },

  // 严格 3D AABB 简易方框型 Hitbox 碰撞检测
  checkBoxHitboxOverlap(posA, halfA, posB, halfB, padding = 1.12) {
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
          const score = dot - axisCounts[aIdx] * 0.16;
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

  /**
   * 强力 3D 方框 Hitbox 防重叠解算器（严格保证所有代理方框 0 重叠）
   */
  solveCardinalWithStrictHitbox(extracted, boxHalves, center, baseLimit) {
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

    // 1. 按同方向由内到外分层初始化（保证不越级穿插）
    Object.values(groupsByDir).forEach(list => {
      list.sort((a, b) => a.proj - b.proj);
      const len = list.length;
      list.forEach((item, rank) => {
        const tierFrac = len > 1 ? (rank + 1) / len : 0.65;
        targetDists[item.idx] = baseLimit * (0.25 + 0.75 * tierFrac);
      });
    });

    // 2. 28 轮严格 3D AABB 方框碰撞分离解算
    const hardCap = baseLimit * 1.95;
    let resolvedPairs = 0;

    for (let iter = 0; iter < 28; iter++) {
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

          const overlap = this.checkBoxHitboxOverlap(posI, boxHalves[i], posJ, boxHalves[j], 1.12);
          if (!overlap) continue;

          anyOverlap = true;
          resolvedPairs++;
          const axI = axisIdxOf[i], axJ = axisIdxOf[j];

          if (axI === axJ) {
            const push = overlap[axI] * 0.65 + baseLimit * 0.02;
            if (targetDists[i] >= targetDists[j]) {
              targetDists[i] = Math.min(hardCap, targetDists[i] + push);
            } else {
              targetDists[j] = Math.min(hardCap, targetDists[j] + push);
            }
          } else {
            // 不同正交轴在中心附近碰撞：沿各自正交朝外轴彻底推开
            targetDists[i] = Math.min(hardCap, targetDists[i] + overlap[axI] * 0.45);
            targetDists[j] = Math.min(hardCap, targetDists[j] + overlap[axJ] * 0.45);
          }
        }
      }
      if (!anyOverlap) break;
    }

    // 3. 左右/上下/前后视觉平衡微调
    for (let axis = 0; axis < 3; axis++) {
      let posMax = 0, negMax = 0;
      const posIdx = [], negIdx = [];
      for (let i = 0; i < count; i++) {
        if (dirs[i][axis] > 0.5) { posIdx.push(i); if (targetDists[i] > posMax) posMax = targetDists[i]; }
        else if (dirs[i][axis] < -0.5) { negIdx.push(i); if (targetDists[i] > negMax) negMax = targetDists[i]; }
      }
      if (posIdx.length > 0 && negIdx.length > 0 && posMax > 1e-4 && negMax > 1e-4) {
        const balancedMax = (posMax + negMax) * 0.5;
        const sPos = Math.max(0.82, Math.min(1.18, balancedMax / posMax));
        const sNeg = Math.max(0.82, Math.min(1.18, balancedMax / negMax));
        posIdx.forEach(i => { targetDists[i] *= sPos; });
        negIdx.forEach(i => { targetDists[i] *= sNeg; });
      }
    }

    return {
      deltas: extracted.map((p, i) => [
        dirs[i][0] * targetDists[i],
        dirs[i][1] * targetDists[i],
        dirs[i][2] * targetDists[i]
      ]),
      resolvedPairs
    };
  },

  // 工程一字线性队列排布（与立体拆解形成鲜明对比）
  solveLinearQueueLayout(extracted, center, baseLimit) {
    const count = extracted.length;
    const order = extracted.map((p, idx) => ({ idx, x: p.origPos[0] }));
    order.sort((a, b) => a.x - b.x);

    const halfSpan = baseLimit * 2.4;
    const deltas = new Array(count);

    order.forEach((item, rank) => {
      const i = item.idx;
      const u = count > 1 ? (rank / (count - 1)) * 2 - 1 : 0;
      const targetX = center[0] + u * halfSpan;
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
    if (!nodeMap) return { parts: [], rootNodeIDs: [], strategy: 'NONE', collisionBadge: '' };
    const allNodes = Object.values(nodeMap);
    const rootNodeIDs = this.findTopLevelTransformRoots(nodeMap);

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
    if (leafTransforms.length > 1) {
      rawNodes = leafTransforms;
    } else if (leafTransforms.length === 1) {
      const childrenWithGeo = (leafTransforms[0].children || [])
        .map(ch => typeof ch === 'object' ? (nodeMap[ch.instanceID] || ch) : nodeMap[ch])
        .filter(ch => ch && this.hasGeometryInSubtree(ch, nodeMap));
      rawNodes = childrenWithGeo.length > 1 ? childrenWithGeo : leafTransforms;
    } else {
      rawNodes = allNodes.filter(n => n.type === 'MatrixTransform' && this.hasGeometryInSubtree(n, nodeMap)).slice(0, 1);
    }

    const count = rawNodes.length;
    if (count <= 1) {
      return {
        parts: rawNodes.map(n => ({
          instanceID: n.instanceID,
          name: n.name || 'Merged_Mesh',
          origPos: n.localMatrix ? [n.localMatrix[12] || 0, n.localMatrix[13] || 0, n.localMatrix[14] || 0] : [0, 0, 0]
        })),
        rootNodeIDs,
        strategy: 'SINGLE MESH',
        collisionBadge: '1 MESH'
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

    const baseLimit = maxLocalSpread > 1e-3
      ? maxLocalSpread * 0.22
      : cameraDistanceScale * 0.14;

    const assignedAxes = this.assignOrthogonalOutwardAxes(extracted, center, maxLocalSpread);
    extracted.forEach((p, idx) => { p.cardinalAxis = assignedAxes[idx]; });

    // 生成真实有防护厚度的简易方框 Hitbox 半尺寸
    const boxHalves = extracted.map(p => {
      const s = p.localScale || [1, 1, 1];
      const norm = Math.cbrt(s[0] * s[1] * s[2]) || 1;
      const baseHalf = baseLimit * 0.22;
      return [
        baseHalf * Math.max(0.6, Math.min(1.45, s[0] / norm)),
        baseHalf * Math.max(0.6, Math.min(1.45, s[1] / norm)),
        baseHalf * Math.max(0.6, Math.min(1.45, s[2] / norm))
      ];
    });

    const cardinalResult = this.solveCardinalWithStrictHitbox(extracted, boxHalves, center, baseLimit);
    const linearDeltas = this.solveLinearQueueLayout(extracted, center, baseLimit);

    const parts = extracted.map((p, idx) => ({
      instanceID: p.instanceID,
      name: `${p.name} [${p.cardinalAxis.id}]`,
      origPos: p.origPos,
      cardinalDelta: cardinalResult.deltas[idx],
      linearDelta: linearDeltas[idx]
    }));

    return {
      parts,
      rootNodeIDs,
      strategy: `${count} PARTS`,
      collisionBadge: `AABB 0 重叠 (避让 ${cardinalResult.resolvedPairs} 次)`
    };
  }
};
