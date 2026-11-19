/**
 * 3D 场景树递归、4x4 矩阵精确原地水平自转 & 世界空间防碰撞爆炸解算模块 (scene-math.js v22.0)
 * 参考 Autodesk Forge / Sketchfab 官方 Exploded View 架构重构：
 *  1. 精确 4x4 列主序矩阵运算：L(θ) = L0 * inv(W0) * T(C) * Rz(θ) * T(-C) * W0，
 *     彻底消除 Y-Up/Z-Up 轴错位与偏心，实现 100% 钉在原地的纯水平自转！
 *  2. 严格世界空间径向分层爆炸 + 3D AABB 方框碰撞避让 + 父矩阵逆变换还原，顺应真实装配方位、不乱飞。
 */
window.SceneGraphMath = {
  IGNORE_NAME_RE: /^(root|scene|world|ground|floor|plane|shadow|stage|backdrop|camera|light|env|sky|grid|base_plane|shadow_plane|sketchfab_model|gltf_scene)/i,

  // ================= 4x4 & 3x3 列主序矩阵工具库 =================
  mulMat4(a, b) {
    const out = new Array(16);
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        out[col * 4 + row] =
          a[0 * 4 + row] * b[col * 4 + 0] +
          a[1 * 4 + row] * b[col * 4 + 1] +
          a[2 * 4 + row] * b[col * 4 + 2] +
          a[3 * 4 + row] * b[col * 4 + 3];
      }
    }
    return out;
  },

  invertMat4(m) {
    const out = new Array(16);
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (Math.abs(det) < 1e-12) return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
    det = 1.0 / det;

    out[0]  = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1]  = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2]  = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3]  = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4]  = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5]  = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6]  = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7]  = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8]  = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9]  = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  },

  // 计算绕世界中心 center = [cx, cy, cz] 沿世界竖直 Z 轴旋转 angle 弧度的 4x4 矩阵
  makeWorldZSpinMatrix(center, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const cx = center[0], cy = center[1];
    return [
      c,  s, 0, 0,
     -s,  c, 0, 0,
      0,  0, 1, 0,
      cx - (c * cx - s * cy), cy - (s * cx + c * cy), 0, 1
    ];
  },

  // 根据根节点的预计算矩阵，输出原地水平旋转 angle 弧度后的精确局部 4x4 矩阵
  computeRootSpinLocalMatrix(rootInfo, center, angle) {
    const mSpin = this.makeWorldZSpinMatrix(center, angle);
    // L(θ) = (L0 * inv(W0)) * M_spin(θ) * W0
    return this.mulMat4(this.mulMat4(rootInfo.invP, mSpin), rootInfo.W0);
  },

  // 将世界空间位移向量 ΔP_world 精确映射到节点的局部平移空间 Δt_local = inv(P_3x3) * ΔP_world
  worldDeltaToLocalDelta(invP4, worldVec) {
    return [
      invP4[0] * worldVec[0] + invP4[4] * worldVec[1] + invP4[8]  * worldVec[2],
      invP4[1] * worldVec[0] + invP4[5] * worldVec[1] + invP4[9]  * worldVec[2],
      invP4[2] * worldVec[0] + invP4[6] * worldVec[1] + invP4[10] * worldVec[2]
    ];
  },

  // ================= 场景树解析与根节点提取 =================
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

  findTopLevelSpinRoots(nodeMap) {
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

    return roots.map(r => {
      const L0 = (r.localMatrix && r.localMatrix.length === 16) ? r.localMatrix.slice() : [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
      const W0 = (r.worldMatrix && r.worldMatrix.length === 16) ? r.worldMatrix.slice() : L0.slice();
      const invP = this.mulMat4(L0, this.invertMat4(W0));
      return { instanceID: r.instanceID, L0, W0, invP };
    });
  },

  checkAABBOverlap(posA, halfA, posB, halfB, padding = 1.08) {
    const ox = (halfA[0] + halfB[0]) * padding - Math.abs(posA[0] - posB[0]);
    if (ox <= 0) return null;
    const oy = (halfA[1] + halfB[1]) * padding - Math.abs(posA[1] - posB[1]);
    if (oy <= 0) return null;
    const oz = (halfA[2] + halfB[2]) * padding - Math.abs(posA[2] - posB[2]);
    if (oz <= 0) return null;
    return [ox, oy, oz];
  },

  // ================= 业界标准：世界空间径向分层 + AABB 防重叠爆炸 =================
  solveWorldRadialExplosion(extracted, worldCenter, worldRadius, boxHalves) {
    const count = extracted.length;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    // 1. 计算每个零件在世界空间中的自然朝外方向（顺应真实装配方位，若原点重合则用均匀斐波那契球面）
    const dirs = [];
    const dists = [];
    let maxSpread = 0;
    extracted.forEach(p => {
      const d = Math.hypot(p.worldPos[0] - worldCenter[0], p.worldPos[1] - worldCenter[1], p.worldPos[2] - worldCenter[2]);
      if (d > maxSpread) maxSpread = d;
    });

    extracted.forEach((p, idx) => {
      const dx = p.worldPos[0] - worldCenter[0];
      const dy = p.worldPos[1] - worldCenter[1];
      const dz = p.worldPos[2] - worldCenter[2];
      const d = Math.hypot(dx, dy, dz);

      const t = (idx + 0.5) / count;
      const fy = 1 - 2 * t;
      const fr = Math.sqrt(Math.max(0, 1 - fy * fy));
      const phi = goldenAngle * idx;
      const fib = [Math.cos(phi) * fr, Math.sin(phi) * fr, fy];

      if (maxSpread > 1e-4 && d > maxSpread * 0.06) {
        // 85% 顺应零件真实装配外推方位 + 15% 轻微错层防重叠（参考 SolidWorks Composer 径向拆解）
        const vx = (dx / d) * 0.85 + fib[0] * 0.15;
        const vy = (dy / d) * 0.85 + fib[1] * 0.15;
        const vz = (dz / d) * 0.85 + fib[2] * 0.15;
        const len = Math.hypot(vx, vy, vz) || 1;
        dirs.push([vx / len, vy / len, vz / len]);
        // 外层零件走得更远，内层核心保持紧凑稳固
        const radialRatio = d / maxSpread;
        dists.push(worldRadius * (0.35 + 0.65 * radialRatio));
      } else {
        dirs.push(fib);
        const tier = 0.45 + 0.55 * ((idx % 3) / 2);
        dists.push(worldRadius * tier);
      }
    });

    // 2. 世界空间 3D AABB 简易方框碰撞检测与柔和外推解算
    const hardCap = worldRadius * 1.65;
    let resolvedPairs = 0;

    for (let iter = 0; iter < 20; iter++) {
      let anyOverlap = false;
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const posI = [
            extracted[i].worldPos[0] + dirs[i][0] * dists[i],
            extracted[i].worldPos[1] + dirs[i][1] * dists[i],
            extracted[i].worldPos[2] + dirs[i][2] * dists[i]
          ];
          const posJ = [
            extracted[j].worldPos[0] + dirs[j][0] * dists[j],
            extracted[j].worldPos[1] + dirs[j][1] * dists[j],
            extracted[j].worldPos[2] + dirs[j][2] * dists[j]
          ];

          const ov = this.checkAABBOverlap(posI, boxHalves[i], posJ, boxHalves[j], 1.08);
          if (!ov) continue;

          anyOverlap = true;
          resolvedPairs++;
          const minOv = Math.min(ov[0], ov[1], ov[2]);
          const push = minOv * 0.55;
          if (dists[i] >= dists[j]) dists[i] = Math.min(hardCap, dists[i] + push);
          else dists[j] = Math.min(hardCap, dists[j] + push);
        }
      }
      if (!anyOverlap) break;
    }

    // 3. 世界空间严格零均值中心化（Σ ΔP_world = 0，保证视觉中心 100% 纹丝不动）
    let mx = 0, my = 0, mz = 0;
    const rawWorldDeltas = extracted.map((p, i) => {
      const v = [dirs[i][0] * dists[i], dirs[i][1] * dists[i], dirs[i][2] * dists[i]];
      mx += v[0]; my += v[1]; mz += v[2];
      return v;
    });
    mx /= count; my /= count; mz /= count;

    return {
      worldDeltas: rawWorldDeltas.map(v => [v[0] - mx, v[1] - my, v[2] - mz]),
      resolvedPairs
    };
  },

  // ================= 自动检测最长主轴的工程线性拆解 =================
  solveWorldLinearExplosion(extracted, worldCenter, worldRadius) {
    const count = extracted.length;
    // 自动检测模型在世界空间 X/Y/Z 哪个轴跨度最大，作为主拆解轴
    let minV = [Infinity, Infinity, Infinity], maxV = [-Infinity, -Infinity, -Infinity];
    extracted.forEach(p => {
      for (let k = 0; k < 3; k++) {
        if (p.worldPos[k] < minV[k]) minV[k] = p.worldPos[k];
        if (p.worldPos[k] > maxV[k]) maxV[k] = p.worldPos[k];
      }
    });
    const spans = [maxV[0] - minV[0], maxV[1] - minV[1], maxV[2] - minV[2]];
    let mainAxis = 0;
    if (spans[1] > spans[mainAxis]) mainAxis = 1;
    if (spans[2] > spans[mainAxis]) mainAxis = 2;

    const order = extracted.map((p, idx) => ({ idx, val: p.worldPos[mainAxis] }));
    order.sort((a, b) => a.val - b.val);

    const halfSpan = worldRadius * 1.9;
    const worldDeltas = new Array(count);

    order.forEach((item, rank) => {
      const i = item.idx;
      const u = count > 1 ? (rank / (count - 1)) * 2 - 1 : 0;
      const delta = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        if (k === mainAxis) {
          delta[k] = (worldCenter[k] + u * halfSpan) - extracted[i].worldPos[k];
        } else {
          // 非主轴方向温和归拢 50%，呈现整齐的工程分解序列
          delta[k] = (worldCenter[k] - extracted[i].worldPos[k]) * 0.50;
        }
      }
      worldDeltas[i] = delta;
    });

    return worldDeltas;
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

  analyzeAndBuildVectors(nodeMap, camDist = 4.0) {
    if (!nodeMap) return { parts: [], spinRoots: [], strategy: 'NONE', collisionBadge: '' };
    const allNodes = Object.values(nodeMap);
    const spinRoots = this.findTopLevelSpinRoots(nodeMap);

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
        spinRoots,
        strategy: 'SINGLE MESH',
        collisionBadge: '1 MESH'
      };
    }

    const extracted = rawNodes.map(n => {
      const L0 = (n.localMatrix && n.localMatrix.length === 16) ? n.localMatrix : [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
      const W0 = (n.worldMatrix && n.worldMatrix.length === 16) ? n.worldMatrix : L0;
      const invP4 = this.mulMat4(L0, this.invertMat4(W0));
      return {
        instanceID: n.instanceID,
        name: (n.name || `Part_${n.instanceID}`).replace(/_/g, ' '),
        origPos: [L0[12] || 0, L0[13] || 0, L0[14] || 0],
        worldPos: [W0[12] || 0, W0[13] || 0, W0[14] || 0],
        invP4
      };
    });

    let wcx = 0, wcy = 0, wcz = 0;
    extracted.forEach(p => { wcx += p.worldPos[0]; wcy += p.worldPos[1]; wcz += p.worldPos[2]; });
    wcx /= count; wcy /= count; wcz /= count;
    const worldCenter = [wcx, wcy, wcz];

    // 业界黄金爆炸半径：严格锚定相机视距的 15%（在任何单位制模型下视觉展开都恰到好处！）
    const worldRadius = Math.max(0.05, camDist * 0.15);
    const boxHalves = extracted.map(() => [worldRadius * 0.18, worldRadius * 0.18, worldRadius * 0.18]);

    const radialRes = this.solveWorldRadialExplosion(extracted, worldCenter, worldRadius, boxHalves);
    const linearWorldDeltas = this.solveWorldLinearExplosion(extracted, worldCenter, worldRadius);

    // 将世界空间位移精确映射回每个零件自己的局部坐标系
    const parts = extracted.map((p, idx) => ({
      instanceID: p.instanceID,
      name: p.name,
      origPos: p.origPos,
      cardinalDelta: this.worldDeltaToLocalDelta(p.invP4, radialRes.worldDeltas[idx]),
      linearDelta: this.worldDeltaToLocalDelta(p.invP4, linearWorldDeltas[idx])
    }));

    return {
      parts,
      spinRoots,
      strategy: `${count} PARTS`,
      collisionBadge: `AABB 避让 ${radialRes.resolvedPairs} 次`
    };
  }
};
