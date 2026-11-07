/**
 * 纯 3D 场景树递归与零漂移对称爆炸数学模块 (scene-math.js v11.0)
 * 核心升级：
 *  1. 严禁将 worldMatrix 位移误作 localMatrix 初始原点，彻底根除爆炸瞬间模型整体飞出视野中心的 Bug
 *  2. 引入父级矩阵逆变换补偿 (invParent3x3 = L_3x3 * inv(W_3x3))，确保无论父节点存在何种旋转/缩放，世界空间内的爆炸质心 100% 严格锁死在屏幕中心 (Σ ΔP_world = 0)
 */
window.SceneGraphMath = {
  IGNORE_NAME_RE: /^(root|scene|world|ground|floor|plane|shadow|stage|backdrop|camera|light|env|sky|grid|base_plane|shadow_plane|sketchfab_model|gltf_scene)/i,

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

  // 3x3 矩阵求逆 (列主序 4x4 矩阵的左上 3x3 部分)
  invertMat3FromMat4(m) {
    if (!m || m.length < 11) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const a00 = m[0], a01 = m[1], a02 = m[2];
    const a10 = m[4], a11 = m[5], a12 = m[6];
    const a20 = m[8], a21 = m[9], a22 = m[10];

    const b01 = a22 * a11 - a12 * a21;
    const b11 = -a22 * a10 + a12 * a20;
    const b21 = a21 * a10 - a11 * a20;

    const det = a00 * b01 + a01 * b11 + a02 * b21;
    if (Math.abs(det) < 1e-10) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const invDet = 1.0 / det;

    return [
      b01 * invDet,
      (-a22 * a01 + a02 * a21) * invDet,
      (a12 * a01 - a02 * a11) * invDet,
      b11 * invDet,
      (a22 * a00 - a02 * a20) * invDet,
      (-a12 * a00 + a02 * a10) * invDet,
      b21 * invDet,
      (-a21 * a00 + a01 * a20) * invDet,
      (a11 * a00 - a01 * a10) * invDet
    ];
  },

  // 两个列主序 3x3 矩阵相乘: A * B
  multiplyMat3(A, B) {
    const out = new Array(9);
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) {
        out[col * 3 + row] =
          A[0 * 3 + row] * B[col * 3 + 0] +
          A[1 * 3 + row] * B[col * 3 + 1] +
          A[2 * 3 + row] * B[col * 3 + 2];
      }
    }
    return out;
  },

  // 用列主序 3x3 矩阵变换 3D 向量: M * v
  transformVec3(M, v) {
    return [
      M[0] * v[0] + M[3] * v[1] + M[6] * v[2],
      M[1] * v[0] + M[4] * v[1] + M[7] * v[2],
      M[2] * v[0] + M[5] * v[1] + M[8] * v[2]
    ];
  },

  // 提取父节点的逆变换矩阵 inv(P_3x3) = L_3x3 * inv(W_3x3)
  // 使得当 api.translate 修改 L[12..14] 时，世界空间真实位移严格等于 ΔP_world = P_3x3 * Δt_local
  computeInvParentMat3(localMat, worldMat) {
    const L3 = localMat && localMat.length >= 11
      ? [localMat[0], localMat[1], localMat[2], localMat[4], localMat[5], localMat[6], localMat[8], localMat[9], localMat[10]]
      : [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const invW3 = this.invertMat3FromMat4(worldMat);
    return this.multiplyMat3(L3, invW3);
  },

  analyzeAndBuildVectors(nodeMap, cameraDistanceScale = 1.2) {
    if (!nodeMap) return { parts: [], strategy: 'NONE' };
    const allNodes = Object.values(nodeMap);

    // 1. 寻找最深层的有效 MatrixTransform 零件节点
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
      strategy = `MATRIX-PARTS (${leafTransforms.length})`;
    } else if (leafTransforms.length === 1) {
      const childrenWithGeo = (leafTransforms[0].children || [])
        .map(ch => typeof ch === 'object' ? (nodeMap[ch.instanceID] || ch) : nodeMap[ch])
        .filter(ch => ch && this.hasGeometryInSubtree(ch, nodeMap));
      if (childrenWithGeo.length > 1) {
        rawNodes = childrenWithGeo;
        strategy = `GROUP-SUBPARTS (${childrenWithGeo.length})`;
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

    // 2. 提取每个部件的真实局部初始位置 origPos (严禁使用 worldMatrix[12..14] 冒充 localMatrix!)
    const extracted = rawNodes.map(n => {
      const lm = n.localMatrix;
      const wm = n.worldMatrix;
      const origLocalPos = lm ? [lm[12] || 0, lm[13] || 0, lm[14] || 0] : [0, 0, 0];
      const worldPos = wm ? [wm[12] || 0, wm[13] || 0, wm[14] || 0] : origLocalPos.slice();
      const invParent3x3 = this.computeInvParentMat3(lm, wm);

      return {
        instanceID: n.instanceID,
        name: (n.name || `${n.type}_${n.instanceID}`).replace(/_/g, ' '),
        nodeType: n.type,
        origPos: origLocalPos,
        worldPos,
        invParent3x3
      };
    });

    // 3. 在世界空间计算质心与真实分布跨度
    let wcx = 0, wcy = 0, wcz = 0;
    extracted.forEach(p => {
      wcx += p.worldPos[0];
      wcy += p.worldPos[1];
      wcz += p.worldPos[2];
    });
    wcx /= count; wcy /= count; wcz /= count;

    let maxWorldSpread = 0;
    let distinctCount = 0;
    extracted.forEach(p => {
      const d = Math.hypot(p.worldPos[0] - wcx, p.worldPos[1] - wcy, p.worldPos[2] - wcz);
      if (d > maxWorldSpread) maxWorldSpread = d;
      if (d > 1e-3) distinctCount++;
    });

    const worldBaseRadius = cameraDistanceScale;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const rawWorldRadial = [];
    const rawWorldAxial = [];

    // 4. 生成成对镜像的 3D 世界空间方向向量
    extracted.forEach((p, idx) => {
      const dx = p.worldPos[0] - wcx;
      const dy = p.worldPos[1] - wcy;
      const dz = p.worldPos[2] - wcz;
      const dist = Math.hypot(dx, dy, dz);

      const t = (idx + 0.5) / count;
      const fy = 1 - 2 * t;
      const fr = Math.sqrt(Math.max(0, 1 - fy * fy));
      const phi = goldenAngle * idx;
      const fibVec = [Math.cos(phi) * fr, fy, Math.sin(phi) * fr];

      let rx, ry, rz;
      if (distinctCount >= count * 0.6 && dist > maxWorldSpread * 0.08) {
        rx = (dx / dist) * 0.6 + fibVec[0] * 0.4;
        ry = (dy / dist) * 0.6 + fibVec[1] * 0.4;
        rz = (dz / dist) * 0.6 + fibVec[2] * 0.4;
      } else if (idx % 2 === 1 && rawWorldRadial.length > 0) {
        const prev = rawWorldRadial[idx - 1];
        rx = -prev[0]; ry = -prev[1]; rz = -prev[2];
      } else {
        [rx, ry, rz] = fibVec;
      }

      const rLen = Math.hypot(rx, ry, rz) || 1;
      const weight = 0.75 + 0.40 * ((Math.floor(idx / 2) % 3) / 2);
      rawWorldRadial.push([(rx / rLen) * weight, (ry / rLen) * weight, (rz / rLen) * weight]);

      const sign = idx % 2 === 0 ? 1 : -1;
      const tier = Math.floor(idx / 2 + 1) / Math.ceil(count / 2);
      const ax = sign * (0.45 + 0.55 * tier);
      const ay = ((Math.floor(idx / 2) % 3) - 1) * 0.22 * sign;
      const az = (Math.floor(idx / 2) % 2 === 0 ? 0.22 : -0.22) * sign;
      const aLen = Math.hypot(ax, ay, az) || 1;
      rawWorldAxial.push([(ax / aLen) * weight, (ay / aLen) * weight, (az / aLen) * weight]);
    });

    // 5. 在世界空间对带权位移向量执行严格零均值校准 (Σ V_world = [0, 0, 0])
    const zeroBalanceWorldVectors = (vecs) => {
      let mx = 0, my = 0, mz = 0;
      vecs.forEach(v => { mx += v[0]; my += v[1]; mz += v[2]; });
      mx /= count; my /= count; mz /= count;
      return vecs.map(v => [
        (v[0] - mx) * worldBaseRadius,
        (v[1] - my) * worldBaseRadius,
        (v[2] - mz) * worldBaseRadius
      ]);
    };

    const balancedWorldRadial = zeroBalanceWorldVectors(rawWorldRadial);
    const balancedWorldAxial = zeroBalanceWorldVectors(rawWorldAxial);

    // 6. 通过 invParent3x3 转换为每个节点 localMatrix 下的精确位移向量
    const parts = extracted.map((p, idx) => {
      const localRadialFull = this.transformVec3(p.invParent3x3, balancedWorldRadial[idx]);
      const localAxialFull = this.transformVec3(p.invParent3x3, balancedWorldAxial[idx]);
      const rMag = Math.hypot(localRadialFull[0], localRadialFull[1], localRadialFull[2]) || 1;

      return {
        instanceID: p.instanceID,
        name: p.name,
        nodeType: p.nodeType,
        origPos: p.origPos,
        localRadialVec: localRadialFull,
        localAxialVec: localAxialFull,
        radialDir: [localRadialFull[0] / rMag, localRadialFull[1] / rMag, localRadialFull[2] / rMag],
        axialDir: localAxialFull,
        maxDistance: rMag,
        visible: true,
        pulsed: false
      };
    });

    return { parts, strategy };
  }
};
