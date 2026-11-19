/**
 * 纯 3D 场景树递归、六向正交朝外爆炸与实时逐帧方框 Hitbox (AABB) 防重叠解算模块 (scene-math.js v13.0)
 * 核心升级：
 *  1. 由外向内“剥洋葱”分段拆解时序 (Outside-In Staggered Schedule)：外层零件率先起步腾出空间，内层零件随后跟进，彻底杜绝中途追尾穿模
 *  2. 实时逐帧方框 Hitbox (AABB) 碰撞解算 (evaluateExplosionFrame)：在 1%~100% 的任意滑块进度下，实时检测并沿正交朝外轴排斥任何重叠的简易方框 Hitbox！
 *  3. 严格限制爆炸方向为【上(+Y)、下(-Y)、左(-X)、右(+X)、前(+Z)、后(-Z)】6 个正交朝外方向
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

  checkBoxHitboxOverlap(posA, halfA, posB, halfB, padding = 1.08) {
    const ox = (halfA[0] + halfB[0]) * padding - Math.abs(posA[0] - posB[0]);
    if (ox <= 0) return null;
    const oy = (halfA[1] + halfB[1]) * padding - Math.abs(posA[1] - posB[1]);
    if (oy <= 0) return null;
    const oz = (halfA[2] + halfB[2]) * padding - Math.abs(posA[2] - posB[2]);
    if (oz <= 0) return null;
    return [ox, oy, oz];
  },

  smoothstep(edge0, edge1, x) {
    if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
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

  buildScheduleAndTargets(extracted, center, baseStep, mode = 'cardinal6') {
    const count = extracted.length;
    const dirs = extracted.map((p, idx) => {
      if (mode === 'axial') {
        const sign = idx % 2 === 0 ? 1 : -1;
        return [sign, 0, 0];
      }
      return p.cardinalAxis.vec.slice();
    });

    const targetDists = new Array(count).fill(0);
    const startTs = new Array(count).fill(0);
    const endTs = new Array(count).fill(1);
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
        const tierRatio = (rank + 1) / len;
        targetDists[item.idx] = baseStep * (0.30 + 0.60 * tierRatio);

        // 由外向内“剥洋葱”分段拆解时序：最外层 t=0.00 先起步，最内层等外层腾出空间后才起步
        const outerRatio = len > 1 ? (len - 1 - rank) / (len - 1) : 0;
        startTs[item.idx] = outerRatio * 0.36;
        endTs[item.idx] = Math.min(1.0, startTs[item.idx] + 0.64);
      });
    });

    return { dirs, targetDists, startTs, endTs };
  },

  evaluateExplosionFrame(parts, percent, pattern = 'radial') {
    const count = parts.length;
    if (count <= 1) return [];

    const globalT = Math.max(0, Math.min(1, (parseFloat(percent) || 0) / 100));
    if (globalT <= 1e-4) {
      return parts.map(p => p.origPos.slice());
    }

    const isAxial = pattern === 'axial';
    const baseStep = parts[0].baseStep || 1;
    const maxClampDist = baseStep * 1.40;

    const dirs = new Array(count);
    const curDists = new Array(count);

    for (let i = 0; i < count; i++) {
      const p = parts[i];
      const sched = isAxial ? p.axialSchedule : p.cardinalSchedule;
      dirs[i] = sched.dir;
      const localProgress = this.smoothstep(sched.startT, sched.endT, globalT);
      curDists[i] = sched.targetDist * localProgress;
    }

    const hitboxStrength = Math.min(1.0, globalT / 0.12);
    const maxIterations = 12;

    for (let iter = 0; iter < maxIterations; iter++) {
      let anyOverlap = false;

      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const posI = [
            parts[i].origPos[0] + dirs[i][0] * curDists[i],
            parts[i].origPos[1] + dirs[i][1] * curDists[i],
            parts[i].origPos[2] + dirs[i][2] * curDists[i]
          ];
          const posJ = [
            parts[j].origPos[0] + dirs[j][0] * curDists[j],
            parts[j].origPos[1] + dirs[j][1] * curDists[j],
            parts[j].origPos[2] + dirs[j][2] * curDists[j]
          ];

          const overlap = this.checkBoxHitboxOverlap(posI, parts[i].boxHalf, posJ, parts[j].boxHalf, 1.08);
          if (!overlap) continue;

          anyOverlap = true;
          const axisI = Math.abs(dirs[i][0]) > 0.5 ? 0 : (Math.abs(dirs[i][1]) > 0.5 ? 1 : 2);
          const axisJ = Math.abs(dirs[j][0]) > 0.5 ? 0 : (Math.abs(dirs[j][1]) > 0.5 ? 1 : 2);

          if (axisI === axisJ) {
            const push = (overlap[axisI] * 0.6 + baseStep * 0.02) * hitboxStrength;
            if (curDists[i] >= curDists[j]) {
              curDists[i] = Math.min(maxClampDist, curDists[i] + push);
            } else {
              curDists[j] = Math.min(maxClampDist, curDists[j] + push);
            }
          } else {
            const pushI = Math.min(overlap[axisI] * 0.45, baseStep * 0.10) * hitboxStrength;
            const pushJ = Math.min(overlap[axisJ] * 0.45, baseStep * 0.10) * hitboxStrength;
            curDists[i] = Math.min(maxClampDist, curDists[i] + pushI);
            curDists[j] = Math.min(maxClampDist, curDists[j] + pushJ);
          }
        }
      }

      if (!anyOverlap) break;
    }

    return parts.map((p, i) => [
      p.origPos[0] + dirs[i][0] * curDists[i],
      p.origPos[1] + dirs[i][1] * curDists[i],
      p.origPos[2] + dirs[i][2] * curDists[i]
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
      strategy = `LIVE-HITBOX 6-WAY (${leafTransforms.length})`;
    } else if (leafTransforms.length === 1) {
      const childrenWithGeo = (leafTransforms[0].children || [])
        .map(ch => typeof ch === 'object' ? (nodeMap[ch.instanceID] || ch) : nodeMap[ch])
        .filter(ch => ch && this.hasGeometryInSubtree(ch, nodeMap));
      if (childrenWithGeo.length > 1) {
        rawNodes = childrenWithGeo;
        strategy = `LIVE-HITBOX GROUP (${childrenWithGeo.length})`;
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

    const avgParentScale = extracted.reduce((acc, p) => acc + p.parentScaleRatio, 0) / count;
    const camStepInLocal = (cameraDistanceScale * 0.35) / (avgParentScale || 1);
    const baseStep = maxLocalSpread > 1e-3
      ? Math.min(maxLocalSpread * 0.38, camStepInLocal * 1.2)
      : camStepInLocal;

    const assignedAxes = this.assignOrthogonalOutwardAxes(extracted, center, maxLocalSpread);
    extracted.forEach((p, idx) => { p.cardinalAxis = assignedAxes[idx]; });

    const cardinalSched = this.buildScheduleAndTargets(extracted, center, baseStep, 'cardinal6');
    const axialSched = this.buildScheduleAndTargets(extracted, center, baseStep, 'axial');

    const parts = extracted.map((p, idx) => {
      const s = p.localScale || [1, 1, 1];
      const norm = Math.cbrt(s[0] * s[1] * s[2]) || 1;
      const unitBox = baseStep * 0.20;
      const boxHalf = [
        unitBox * Math.max(0.55, Math.min(1.5, s[0] / norm)),
        unitBox * Math.max(0.55, Math.min(1.5, s[1] / norm)),
        unitBox * Math.max(0.55, Math.min(1.5, s[2] / norm))
      ];

      const cDir = cardinalSched.dirs[idx];
      const cDist = cardinalSched.targetDists[idx];
      const aDir = axialSched.dirs[idx];
      const aDist = axialSched.targetDists[idx];

      return {
        instanceID: p.instanceID,
        name: `${p.name} [${p.cardinalAxis.id}]`,
        nodeType: p.nodeType,
        origPos: p.origPos,
        baseStep,
        boxHalf,
        cardinalSchedule: {
          dir: cDir,
          targetDist: cDist,
          startT: cardinalSched.startTs[idx],
          endT: cardinalSched.endTs[idx]
        },
        axialSchedule: {
          dir: aDir,
          targetDist: aDist,
          startT: axialSched.startTs[idx],
          endT: axialSched.endTs[idx]
        },
        localRadialVec: [cDir[0] * cDist, cDir[1] * cDist, cDir[2] * cDist],
        visible: true,
        pulsed: false
      };
    });

    return { parts, strategy };
  }
};
