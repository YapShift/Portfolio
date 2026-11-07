/**
 * 纯 3D 场景树递归、六向正交朝外爆炸与简易方框 Hitbox (AABB) 防重叠解算模块 (scene-math.js v12.0)
 * 核心特性：
 *  1. 严格限制爆炸方向为【上(+Y)、下(-Y)、左(-X)、右(+X)、前(+Z)、后(-Z)】6 个正交朝外方向
 *  2. 为每个子部件自动生成简易方框型代理碰撞盒 (3D Proxy Box Hitbox / AABB)
 *  3. 内置多轮 AABB 方框碰撞检测与朝外排斥解算器 (Box-Box Intersection & Outward MTD Solver)，确保爆炸后零件互不穿插重叠
 *  4. 温和紧凑的爆炸幅度控制 + 对称质心校准，绝不飞散出界
 */
window.SceneGraphMath = {
  IGNORE_NAME_RE: /^(root|scene|world|ground|floor|plane|shadow|stage|backdrop|camera|light|env|sky|grid|base_plane|shadow_plane|sketchfab_model|gltf_scene)/i,

  // 严格定义的 6 个正交朝外标准方向（右、左、上、下、前、后）
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

  // 从 4x4 矩阵提取各轴缩放尺寸 [sx, sy, sz]
  extractMatrixScale(m) {
    if (!m || m.length < 11) return [1, 1, 1];
    const sx = Math.hypot(m[0], m[1], m[2]) || 1;
    const sy = Math.hypot(m[4], m[5], m[6]) || 1;
    const sz = Math.hypot(m[8], m[9], m[10]) || 1;
    return [sx, sy, sz];
  },

  // 检测两个 3D 简易方框型 Hitbox (AABB) 是否发生重叠，并返回各轴重叠深度
  checkBoxHitboxOverlap(posA, halfA, posB, halfB, padding = 1.08) {
    const ox = (halfA[0] + halfB[0]) * padding - Math.abs(posA[0] - posB[0]);
    if (ox <= 0) return null;
    const oy = (halfA[1] + halfB[1]) * padding - Math.abs(posA[1] - posB[1]);
    if (oy <= 0) return null;
    const oz = (halfA[2] + halfB[2]) * padding - Math.abs(posA[2] - posB[2]);
    if (oz <= 0) return null;
    return [ox, oy, oz];
  },

  /**
   * 为所有部件分配严格的【上下左右前后】6向正交朝外方向
   * 若部件自带空间偏移，则顺应其离中心最显著的外推正交轴；同时自动均衡各轴负载
   */
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
          const crowdPenalty = axisCounts[aIdx] * 0.22;
          const score = dot - crowdPenalty;
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
   * 简易方框型 Hitbox (AABB) 防重叠解算器：
   * 零件仅沿其被分配的正交朝外轴 (上下左右前后) 移动，若检测到两个方框 Hitbox 重叠，
   * 自动将外侧零件沿其正交朝外方向继续推开最小分离距离 (MTD)，确保爆炸后零件间无穿插重叠
   */
  solveOrthogonalHitboxExplosion(extracted, center, baseStep, mode = 'cardinal6') {
    const count = extracted.length;
    const boxHalves = extracted.map(p => {
      const s = p.localScale || [1, 1, 1];
      const norm = Math.cbrt(s[0] * s[1] * s[2]) || 1;
      const rx = Math.max(0.55, Math.min(1.6, s[0] / norm));
      const ry = Math.max(0.55, Math.min(1.6, s[1] / norm));
      const rz = Math.max(0.55, Math.min(1.6, s[2] / norm));
      const unitBox = baseStep * 0.22;
      return [unitBox * rx, unitBox * ry, unitBox * rz];
    });

    const dirs = extracted.map((p, idx) => {
      if (mode === 'axial') {
        const sign = idx % 2 === 0 ? 1 : -1;
        return [sign, 0, 0];
      }
      return p.cardinalAxis.vec.slice();
    });

    const distances = new Array(count).fill(0);
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
      list.forEach((item, rank) => {
        const tierRatio = (rank + 1) / list.length;
        distances[item.idx] = baseStep * (0.32 + 0.58 * tierRatio);
      });
    });

    const maxIterations = 18;
    const maxClampDist = baseStep * 1.35;

    for (let iter = 0; iter < maxIterations; iter++) {
      let anyOverlap = false;

      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const posI = [
            extracted[i].origPos[0] + dirs[i][0] * distances[i],
            extracted[i].origPos[1] + dirs[i][1] * distances[i],
            extracted[i].origPos[2] + dirs[i][2] * distances[i]
          ];
          const posJ = [
            extracted[j].origPos[0] + dirs[j][0] * distances[j],
            extracted[j].origPos[1] + dirs[j][1] * distances[j],
            extracted[j].origPos[2] + dirs[j][2] * distances[j]
          ];

          const overlap = this.checkBoxHitboxOverlap(posI, boxHalves[i], posJ, boxHalves[j], 1.10);
          if (!overlap) continue;

          anyOverlap = true;
          const axisI = Math.abs(dirs[i][0]) > 0.5 ? 0 : (Math.abs(dirs[i][1]) > 0.5 ? 1 : 2);
          const axisJ = Math.abs(dirs[j][0]) > 0.5 ? 0 : (Math.abs(dirs[j][1]) > 0.5 ? 1 : 2);

          if (axisI === axisJ) {
            const push = overlap[axisI] * 0.55 + baseStep * 0.04;
            if (distances[i] >= distances[j]) {
              distances[i] = Math.min(maxClampDist, distances[i] + push);
            } else {
              distances[j] = Math.min(maxClampDist, distances[j] + push);
            }
          } else {
            const pushI = Math.min(overlap[axisI] * 0.45, baseStep * 0.12);
            const pushJ = Math.min(overlap[axisJ] * 0.45, baseStep * 0.12);
            distances[i] = Math.min(maxClampDist, distances[i] + pushI);
            distances[j] = Math.min(maxClampDist, distances[j] + pushJ);
          }
        }
      }

      if (!anyOverlap) break;
    }

    for (let axis = 0; axis < 3; axis++) {
      const posIndices = [];
      const negIndices = [];
      let posSum = 0, negSum = 0;

      for (let i = 0; i < count; i++) {
        if (dirs[i][axis] > 0.5) { posIndices.push(i); posSum += distances[i]; }
        else if (dirs[i][axis] < -0.5) { negIndices.push(i); negSum += distances[i]; }
      }

      if (posIndices.length > 0 && negIndices.length > 0 && posSum > 1e-5 && negSum > 1e-5) {
        const targetAvg = (posSum + negSum) * 0.5;
        const scalePos = Math.max(0.75, Math.min(1.25, targetAvg / posSum));
        const scaleNeg = Math.max(0.75, Math.min(1.25, targetAvg / negSum));
        posIndices.forEach(i => { distances[i] = Math.min(maxClampDist, distances[i] * scalePos); });
        negIndices.forEach(i => { distances[i] = Math.min(maxClampDist, distances[i] * scaleNeg); });
      }
    }

    return extracted.map((p, idx) => [
      dirs[idx][0] * distances[idx],
      dirs[idx][1] * distances[idx],
      dirs[idx][2] * distances[idx]
    ]);
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
      strategy = `6-WAY ORTHO + HITBOX (${leafTransforms.length})`;
    } else if (leafTransforms.length === 1) {
      const childrenWithGeo = (leafTransforms[0].children || [])
        .map(ch => typeof ch === 'object' ? (nodeMap[ch.instanceID] || ch) : nodeMap[ch])
        .filter(ch => ch && this.hasGeometryInSubtree(ch, nodeMap));
      if (childrenWithGeo.length > 1) {
        rawNodes = childrenWithGeo;
        strategy = `6-WAY GROUP + HITBOX (${childrenWithGeo.length})`;
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
    extracted.forEach(p => {
      cx += p.origPos[0];
      cy += p.origPos[1];
      cz += p.origPos[2];
    });
    cx /= count; cy /= count; cz /= count;
    const center = [cx, cy, cz];

    let maxLocalSpread = 0;
    extracted.forEach(p => {
      const d = Math.hypot(p.origPos[0] - cx, p.origPos[1] - cy, p.origPos[2] - cz);
      if (d > maxLocalSpread) maxLocalSpread = d;
    });

    const avgParentScale = extracted.reduce((acc, p) => acc + p.parentScaleRatio, 0) / count;
    const camStepInLocal = (cameraDistanceScale * 0.35) / (avgParentScale || 1);
    const baseStep = maxLocalSpread > 1e-3
      ? Math.min(maxLocalSpread * 0.38, camStepInLocal * 1.2)
      : camStepInLocal;

    const assignedAxes = this.assignOrthogonalOutwardAxes(extracted, center, maxLocalSpread);
    extracted.forEach((p, idx) => {
      p.cardinalAxis = assignedAxes[idx];
    });

    const cardinalDisplacements = this.solveOrthogonalHitboxExplosion(extracted, center, baseStep, 'cardinal6');
    const axialDisplacements = this.solveOrthogonalHitboxExplosion(extracted, center, baseStep, 'axial');

    const parts = extracted.map((p, idx) => {
      const cVec = cardinalDisplacements[idx];
      const aVec = axialDisplacements[idx];
      const cMag = Math.hypot(cVec[0], cVec[1], cVec[2]) || 1;

      return {
        instanceID: p.instanceID,
        name: `${p.name} [${p.cardinalAxis.id}]`,
        nodeType: p.nodeType,
        origPos: p.origPos,
        cardinalLabel: p.cardinalAxis.label,
        localRadialVec: cVec,
        localAxialVec: aVec,
        radialDir: [cVec[0] / cMag, cVec[1] / cMag, cVec[2] / cMag],
        axialDir: aVec,
        maxDistance: cMag,
        visible: true,
        pulsed: false
      };
    });

    return { parts, strategy };
  }
};
