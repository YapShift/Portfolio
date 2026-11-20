/**
 * 3D Scene Graph Traversal, In-Place World-Z Spin & AABB Explosion Solver (scene-math.js)
 * Guarantees 100% geometry coverage for hover picking and zero-filter isolation.
 */
window.SceneGraphMath = {
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

  computeRootSpinLocalMatrix(rootInfo, center, angle, extraLocalOffset = null) {
    const mSpin = this.makeWorldZSpinMatrix(center, angle);
    let baseLocal = rootInfo.L0;
    if (extraLocalOffset) {
      baseLocal = rootInfo.L0.slice();
      baseLocal[12] += extraLocalOffset[0];
      baseLocal[13] += extraLocalOffset[1];
      baseLocal[14] += extraLocalOffset[2];
    }
    const currentWorld = extraLocalOffset ? this.mulMat4(rootInfo.P, baseLocal) : rootInfo.W0;
    return this.mulMat4(this.mulMat4(rootInfo.invP, mSpin), currentWorld);
  },

  worldDeltaToLocalDelta(invP4, worldVec) {
    return [
      invP4[0] * worldVec[0] + invP4[4] * worldVec[1] + invP4[8]  * worldVec[2],
      invP4[1] * worldVec[0] + invP4[5] * worldVec[1] + invP4[9]  * worldVec[2],
      invP4[2] * worldVec[0] + invP4[6] * worldVec[1] + invP4[10] * worldVec[2]
    ];
  },

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

  collectSubtreeGeometryIDs(node, nodeMap, out = [], visited = new Set()) {
    if (!node || visited.has(node.instanceID)) return out;
    visited.add(node.instanceID);
    if (node.type === 'Geometry' || node.type === 'RigGeometry') {
      out.push(node.instanceID);
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(ch => {
        const obj = typeof ch === 'object' ? (nodeMap[ch.instanceID] || ch) : nodeMap[ch];
        this.collectSubtreeGeometryIDs(obj, nodeMap, out, visited);
      });
    }
    return out;
  },

  buildParentLookup(allNodes) {
    const parentOf = new Map();
    allNodes.forEach(n => {
      if (!Array.isArray(n.children)) return;
      n.children.forEach(ch => {
        const cid = typeof ch === 'object' ? ch.instanceID : ch;
        if (cid !== undefined) parentOf.set(cid, n.instanceID);
      });
    });
    return parentOf;
  },

  /**
   * Map every node ID in each part's subtree AND ancestor chain (if unambiguous)
   * so Sketchfab hover/click picking always resolves to a valid part index.
   */
  buildNodeToPartIndex(rawNodes, nodeMap, parentOf) {
    const map = {};
    const markSubtree = (node, partIdx, visited = new Set()) => {
      if (!node || visited.has(node.instanceID)) return;
      visited.add(node.instanceID);
      map[node.instanceID] = partIdx;
      if (!Array.isArray(node.children)) return;
      node.children.forEach(ch => {
        const obj = typeof ch === 'object' ? (nodeMap[ch.instanceID] || ch) : nodeMap[ch];
        markSubtree(obj, partIdx, visited);
      });
    };

    rawNodes.forEach((n, idx) => markSubtree(n, idx));

    // Also allow resolving any node whose parent chain leads into a mapped part
    Object.values(nodeMap).forEach(node => {
      if (map[node.instanceID] !== undefined) return;
      let curr = parentOf.get(node.instanceID);
      while (curr !== undefined) {
        if (map[curr] !== undefined) {
          map[node.instanceID] = map[curr];
          break;
        }
        curr = parentOf.get(curr);
      }
    });

    return map;
  },

  findTopLevelSpinRoots(allNodes, nodeMap, parentOf) {
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
      const P = this.mulMat4(W0, this.invertMat4(L0));
      const invP = this.mulMat4(L0, this.invertMat4(W0));
      return { instanceID: r.instanceID, L0, W0, P, invP, partIdx: null };
    });
  },

  checkAABBOverlap(posA, halfA, posB, halfB, padding) {
    const ox = (halfA[0] + halfB[0]) * padding - Math.abs(posA[0] - posB[0]);
    if (ox <= 0) return null;
    const oy = (halfA[1] + halfB[1]) * padding - Math.abs(posA[1] - posB[1]);
    if (oy <= 0) return null;
    const oz = (halfA[2] + halfB[2]) * padding - Math.abs(posA[2] - posB[2]);
    if (oz <= 0) return null;
    return [ox, oy, oz];
  },

  solveWorldRadialExplosion(extracted, worldCenter, worldRadius, boxHalves, expCfg) {
    const count = extracted.length;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const dirs = [];
    const dists = [];
    const natBlend = expCfg.naturalDirectionBlend;
    const fibBlend = 1 - natBlend;

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
        const vx = (dx / d) * natBlend + fib[0] * fibBlend;
        const vy = (dy / d) * natBlend + fib[1] * fibBlend;
        const vz = (dz / d) * natBlend + fib[2] * fibBlend;
        const len = Math.hypot(vx, vy, vz) || 1;
        dirs.push([vx / len, vy / len, vz / len]);
        dists.push(worldRadius * (0.30 + 0.70 * (d / maxSpread)));
      } else {
        dirs.push(fib);
        dists.push(worldRadius * (0.42 + 0.58 * ((idx % 3) / 2)));
      }
    });

    const hardCap = worldRadius * expCfg.radialHardCapMultiplier;
    let resolvedPairs = 0;

    for (let iter = 0; iter < expCfg.solverIterations; iter++) {
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

          const ov = this.checkAABBOverlap(posI, boxHalves[i], posJ, boxHalves[j], expCfg.hitboxPadding);
          if (!ov) continue;

          anyOverlap = true;
          resolvedPairs++;
          const push = Math.min(ov[0], ov[1], ov[2]) * 0.50;
          if (dists[i] >= dists[j]) dists[i] = Math.min(hardCap, dists[i] + push);
          else dists[j] = Math.min(hardCap, dists[j] + push);
        }
      }
      if (!anyOverlap) break;
    }

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

  solveWorldLinearExplosion(extracted, worldCenter, worldRadius, expCfg) {
    const count = extracted.length;
    const minV = [Infinity, Infinity, Infinity];
    const maxV = [-Infinity, -Infinity, -Infinity];

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

    const halfSpan = worldRadius * expCfg.linearHalfSpanMultiplier;
    const worldDeltas = new Array(count);

    order.forEach((item, rank) => {
      const i = item.idx;
      const u = count > 1 ? (rank / (count - 1)) * 2 - 1 : 0;
      const delta = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        if (k === mainAxis) {
          delta[k] = (worldCenter[k] + u * halfSpan) - extracted[i].worldPos[k];
        } else {
          delta[k] = (worldCenter[k] - extracted[i].worldPos[k]) * expCfg.linearOffAxisPull;
        }
      }
      worldDeltas[i] = delta;
    });

    return worldDeltas;
  },

  getPartLocalOffset(part, percent, mode = 'radial') {
    const t = Math.max(0, Math.min(1, (parseFloat(percent) || 0) / 100));
    if (t <= 1e-4) return [0, 0, 0];
    const delta = mode === 'linear' ? part.linearDelta : part.radialDelta;
    return [delta[0] * t, delta[1] * t, delta[2] * t];
  },

  evaluateExplosionFrame(parts, percent, mode = 'radial') {
    if (parts.length <= 1) return [];
    const t = Math.max(0, Math.min(1, (parseFloat(percent) || 0) / 100));
    if (t <= 1e-4) return parts.map(p => p.origPos.slice());

    const isLinear = mode === 'linear';
    return parts.map(p => {
      const delta = isLinear ? p.linearDelta : p.radialDelta;
      return [
        p.origPos[0] + delta[0] * t,
        p.origPos[1] + delta[1] * t,
        p.origPos[2] + delta[2] * t
      ];
    });
  },

  analyzeAndBuildVectors(nodeMap, camDist = 4.0) {
    const expCfg = window.PortfolioConfig.explosion;
    if (!nodeMap) {
      return { parts: [], spinRoots: [], nodeToPartIndex: {}, allGeometryIDs: [], collisionBadge: '' };
    }
    const allNodes = Object.values(nodeMap);
    const parentOf = this.buildParentLookup(allNodes);
    const spinRoots = this.findTopLevelSpinRoots(allNodes, nodeMap, parentOf);

    const allGeometries = allNodes.filter(n => n.type === 'Geometry' || n.type === 'RigGeometry');
    const allGeometryIDs = allGeometries.map(n => n.instanceID);

    const leafTransforms = allNodes.filter(n => {
      if (n.type !== 'MatrixTransform' || !this.hasGeometryInSubtree(n, nodeMap)) return false;

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
      rawNodes = leafTransforms.slice();
    } else if (leafTransforms.length === 1) {
      const childrenWithGeo = (leafTransforms[0].children || [])
        .map(ch => typeof ch === 'object' ? (nodeMap[ch.instanceID] || ch) : nodeMap[ch])
        .filter(ch => ch && this.hasGeometryInSubtree(ch, nodeMap));
      rawNodes = childrenWithGeo.length > 1 ? childrenWithGeo : leafTransforms.slice();
    } else {
      rawNodes = allNodes.filter(n => n.type === 'MatrixTransform' && this.hasGeometryInSubtree(n, nodeMap)).slice(0, 1);
    }

    // Recover any direct/orphan geometry not covered by rawNodes so 100% of meshes are interactive
    if (rawNodes.length > 1) {
      const coveredGeos = new Set();
      rawNodes.forEach(n => this.collectSubtreeGeometryIDs(n, nodeMap).forEach(gid => coveredGeos.add(gid)));
      allGeometries.forEach(geoNode => {
        if (!coveredGeos.has(geoNode.instanceID)) {
          rawNodes.push(geoNode);
          coveredGeos.add(geoNode.instanceID);
        }
      });
    }

    const nodeToPartIndex = this.buildNodeToPartIndex(rawNodes, nodeMap, parentOf);
    const count = rawNodes.length;

    const partIdMap = new Map(rawNodes.map((n, idx) => [n.instanceID, idx]));
    spinRoots.forEach(r => {
      if (partIdMap.has(r.instanceID)) r.partIdx = partIdMap.get(r.instanceID);
    });

    if (count <= 1) {
      return {
        parts: rawNodes.map(n => ({
          instanceID: n.instanceID,
          name: (n.name || 'Merged_Mesh').replace(/_/g, ' '),
          origPos: n.localMatrix ? [n.localMatrix[12] || 0, n.localMatrix[13] || 0, n.localMatrix[14] || 0] : [0, 0, 0],
          geoIDs: this.collectSubtreeGeometryIDs(n, nodeMap)
        })),
        spinRoots,
        nodeToPartIndex,
        allGeometryIDs,
        collisionBadge: 'SINGLE MESH'
      };
    }

    const extracted = rawNodes.map((n, idx) => {
      const L0 = (n.localMatrix && n.localMatrix.length === 16) ? n.localMatrix : [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
      const W0 = (n.worldMatrix && n.worldMatrix.length === 16) ? n.worldMatrix : L0;
      const invP4 = this.mulMat4(L0, this.invertMat4(W0));
      return {
        instanceID: n.instanceID,
        name: (n.name || `Part_${idx + 1}`).replace(/_/g, ' '),
        origPos: [L0[12] || 0, L0[13] || 0, L0[14] || 0],
        worldPos: [W0[12] || 0, W0[13] || 0, W0[14] || 0],
        geoIDs: this.collectSubtreeGeometryIDs(n, nodeMap),
        invP4
      };
    });

    let wcx = 0, wcy = 0, wcz = 0;
    extracted.forEach(p => { wcx += p.worldPos[0]; wcy += p.worldPos[1]; wcz += p.worldPos[2]; });
    wcx /= count; wcy /= count; wcz /= count;
    const worldCenter = [wcx, wcy, wcz];

    const worldRadius = Math.max(expCfg.minWorldRadius, camDist * expCfg.worldRadiusRatio);
    const halfExt = worldRadius * expCfg.hitboxHalfSizeRatio;
    const boxHalves = extracted.map(() => [halfExt, halfExt, halfExt]);

    const radialRes = this.solveWorldRadialExplosion(extracted, worldCenter, worldRadius, boxHalves, expCfg);
    const linearWorldDeltas = this.solveWorldLinearExplosion(extracted, worldCenter, worldRadius, expCfg);

    const parts = extracted.map((p, idx) => ({
      instanceID: p.instanceID,
      name: p.name,
      origPos: p.origPos,
      worldPos: p.worldPos,
      geoIDs: p.geoIDs,
      isSpinRoot: partIdMap.has(p.instanceID) && spinRoots.some(r => r.instanceID === p.instanceID),
      radialDelta: this.worldDeltaToLocalDelta(p.invP4, radialRes.worldDeltas[idx]),
      linearDelta: this.worldDeltaToLocalDelta(p.invP4, linearWorldDeltas[idx])
    }));

    return {
      parts,
      spinRoots,
      nodeToPartIndex,
      allGeometryIDs,
      collisionBadge: `AABB · ${radialRes.resolvedPairs} RESOLVED`
    };
  }
};
