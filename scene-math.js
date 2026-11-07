/**
 * 纯 3D 场景树递归与零漂移对称爆炸数学模块 (scene-math.js)
 * 零 DOM 依赖，负责穿透 Group 层级提取真实子部件并计算正负镜像零均值向量
 */
window.SceneGraphMath = {
  hasGeometryInSubtree(node, nodeMap, visited = new Set()) {
    if (!node || visited.has(node.instanceID)) return false;
    visited.add(node.instanceID);
    if (node.type === 'Geometry' || node.type === 'RigGeometry') return true;
    if (!Array.isArray(node.children)) return false;
    return node.children.some(ch => this.hasGeometryInSubtree(nodeMap[ch.instanceID] || ch, nodeMap, visited));
  },

  analyzeAndBuildVectors(nodeMap, cameraDistanceScale = 1.6) {
    if (!nodeMap) return { parts: [], strategy: 'NONE' };
    const allNodes = Object.values(nodeMap);

    // 1. 递归寻找最底层包含 Geometry 的 MatrixTransform
    const leafTransforms = allNodes.filter(n => {
      if (n.type !== 'MatrixTransform' || !this.hasGeometryInSubtree(n, nodeMap)) return false;
      let hasDeeper = false;
      const check = (curr) => {
        if (!curr || !Array.isArray(curr.children)) return;
        for (const ch of curr.children) {
          const obj = nodeMap[ch.instanceID] || ch;
          if (obj.type === 'MatrixTransform' && this.hasGeometryInSubtree(obj, nodeMap)) { hasDeeper = true; return; }
          check(obj);
        }
      };
      check(n);
      return !hasDeeper;
    });

    const allGeometries = allNodes.filter(n => n.type === 'Geometry' || n.type === 'RigGeometry');
    let rawNodes = [];
    let strategy = 'SINGLE-MESH (1)';

    if (leafTransforms.length > 1) {
      rawNodes = leafTransforms;
      strategy = `MATRIX-PARTS (${leafTransforms.length})`;
    } else if (allGeometries.length > 1) {
      rawNodes = allGeometries;
      strategy = `GEOMETRY-MESHES (${allGeometries.length})`;
    } else if (leafTransforms.length === 1) {
      const childrenWithGeo = (leafTransforms[0].children || [])
        .map(ch => nodeMap[ch.instanceID] || ch)
        .filter(ch => this.hasGeometryInSubtree(ch, nodeMap));
      if (childrenWithGeo.length > 1) {
        rawNodes = childrenWithGeo;
        strategy = `GROUP-SUBPARTS (${childrenWithGeo.length})`;
      } else {
        rawNodes = leafTransforms;
      }
    }

    const count = rawNodes.length;
    if (count <= 1) {
      return {
        parts: rawNodes.map(n => ({ instanceID: n.instanceID, name: n.name || 'Merged_Mesh', nodeType: n.type })),
        strategy
      };
    }

    const extracted = rawNodes.map(n => {
      const m = n.localMatrix || n.worldMatrix || [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
      return {
        instanceID: n.instanceID,
        name: n.name || `${n.type}_${n.instanceID}`,
        nodeType: n.type,
        origPos: [m[12] || 0, m[13] || 0, m[14] || 0]
      };
    });

    // 2. 质心与跨度计算
    let cx = 0, cy = 0, cz = 0;
    extracted.forEach(p => { cx += p.origPos[0]; cy += p.origPos[1]; cz += p.origPos[2]; });
    cx /= count; cy /= count; cz /= count;

    let maxSpread = 0, distinct = 0;
    extracted.forEach(p => {
      const d = Math.hypot(p.origPos[0] - cx, p.origPos[1] - cy, p.origPos[2] - cz);
      if (d > maxSpread) maxSpread = d;
      if (d > 1e-3) distinct++;
    });

    const baseScale = maxSpread > 0.05 ? maxSpread * 0.95 : cameraDistanceScale;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const radialDirs = [], axialDirs = [];

    // 3. 成对正负镜像采样 (Paired Antithetic Sampling)
    extracted.forEach((p, idx) => {
      const dx = p.origPos[0] - cx, dy = p.origPos[1] - cy, dz = p.origPos[2] - cz;
      const dist = Math.hypot(dx, dy, dz);
      let rx, ry, rz;

      if (idx % 2 === 1 && radialDirs.length > 0) {
        const prev = radialDirs[idx - 1];
        [rx, ry, rz] = [-prev[0], -prev[1], -prev[2]];
      } else if (distinct >= count * 0.5 && dist > 1e-3) {
        [rx, ry, rz] = [dx / dist, dy / dist, dz / dist];
      } else {
        const t = (idx + 0.5) / count, y = 1 - 2 * t, r = Math.sqrt(Math.max(0, 1 - y * y)), phi = goldenAngle * idx;
        [rx, ry, rz] = [Math.cos(phi) * r, y, Math.sin(phi) * r];
      }
      radialDirs.push([rx, ry, rz]);

      const sign = idx % 2 === 0 ? 1 : -1;
      const tier = Math.floor(idx / 2 + 1) / Math.ceil(count / 2);
      axialDirs.push([sign * (0.4 + 0.6 * tier), ((Math.floor(idx / 2) % 3) - 1) * 0.2 * sign, (Math.floor(idx / 2) % 2 === 0 ? 0.2 : -0.2) * sign]);
    });

    // 4. 严格零均值中心化校准 (Σ v = 0)
    const zeroCenter = (dirs) => {
      let mx = 0, my = 0, mz = 0;
      dirs.forEach(v => { mx += v[0]; my += v[1]; mz += v[2]; });
      mx /= count; my /= count; mz /= count;
      return dirs.map(v => {
        const nx = v[0] - mx, ny = v[1] - my, nz = v[2] - mz;
        const len = Math.hypot(nx, ny, nz) || 1;
        return [nx / len, ny / len, nz / len];
      });
    };

    const centeredRadial = zeroCenter(radialDirs);
    const centeredAxial = zeroCenter(axialDirs);

    const parts = extracted.map((p, idx) => {
      const weight = 0.55 + 0.65 * ((Math.floor(idx / 2) % 4 + 1) / 4);
      return {
        ...p,
        radialDir: centeredRadial[idx],
        axialDir: centeredAxial[idx],
        maxDistance: baseScale * weight,
        visible: true,
        pulsed: false
      };
    });

    return { parts, strategy };
  }
};
