/**
 * Native Three.js Scene Normalization & Real Box3 AABB Explosion Solver (scene-math.js)
 * Extracts true world-space bounding boxes for every mesh part and computes
 * collision-free Radial 3D and Main-Axis Linear explosion vectors in local parent space.
 */
import * as THREE from 'three';

export const SceneGraphMath = {
  /**
   * Center and scale a loaded GLTF scene into a normalized 2.0-unit bounding sphere
   * so camera framing, lighting, and explosion scales stay consistent across all models.
   */
  normalizeModel(gltfScene) {
    const spinPivot = new THREE.Group();
    spinPivot.name = 'SpinPivot';

    const modelWrap = new THREE.Group();
    modelWrap.name = 'NormalizedWrap';
    modelWrap.add(gltfScene);
    spinPivot.add(modelWrap);

    spinPivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltfScene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2.0 / maxDim;

    modelWrap.scale.setScalar(scale);
    modelWrap.position.copy(center).multiplyScalar(-scale);
    spinPivot.updateMatrixWorld(true);

    const normBox = new THREE.Box3().setFromObject(spinPivot);
    const normSphere = normBox.getBoundingSphere(new THREE.Sphere());
    return { spinPivot, normBox, normSphere };
  },

  /**
   * Count total triangles and vertices across all meshes in a root group.
   */
  measureGeometryStats(root) {
    let tris = 0;
    let verts = 0;
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      const pos = obj.geometry.attributes.position;
      if (pos) verts += pos.count;
      if (obj.geometry.index) {
        tris += obj.geometry.index.count / 3;
      } else if (pos) {
        tris += pos.count / 3;
      }
    });
    return { tris: Math.round(tris), verts: Math.round(verts) };
  },

  /**
   * Convert a world-space displacement vector into a node's parent local space.
   */
  worldDeltaToLocalDelta(node, worldDelta) {
    if (!node.parent) return worldDelta.clone();
    const invParentRotScale = new THREE.Matrix4().copy(node.parent.matrixWorld).invert();
    // Apply only the 3x3 linear part (ignore translation)
    const e = invParentRotScale.elements;
    return new THREE.Vector3(
      e[0] * worldDelta.x + e[4] * worldDelta.y + e[8]  * worldDelta.z,
      e[1] * worldDelta.x + e[5] * worldDelta.y + e[9]  * worldDelta.z,
      e[2] * worldDelta.x + e[6] * worldDelta.y + e[10] * worldDelta.z
    );
  },

  checkAABBOverlap(posA, halfA, posB, halfB, padding) {
    const ox = (halfA.x + halfB.x) * padding - Math.abs(posA.x - posB.x);
    if (ox <= 0) return null;
    const oy = (halfA.y + halfB.y) * padding - Math.abs(posA.y - posB.y);
    if (oy <= 0) return null;
    const oz = (halfA.z + halfB.z) * padding - Math.abs(posA.z - posB.z);
    if (oz <= 0) return null;
    return [ox, oy, oz];
  },

  /**
   * Real Box3 AABB collision-resolved Radial 3D explosion solver.
   */
  solveRadialExplosion(items, assemblyCenter, expCfg) {
    const count = items.length;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const natBlend = expCfg.naturalDirectionBlend;
    const fibBlend = 1 - natBlend;

    let maxSpread = 0;
    items.forEach(it => {
      const d = it.worldCenter.distanceTo(assemblyCenter);
      if (d > maxSpread) maxSpread = d;
    });

    const dirs = [];
    const dists = [];
    const baseR = expCfg.baseSpreadRadius;

    items.forEach((it, idx) => {
      const diff = it.worldCenter.clone().sub(assemblyCenter);
      const d = diff.length();

      const t = (idx + 0.5) / count;
      const fy = 1 - 2 * t;
      const fr = Math.sqrt(Math.max(0, 1 - fy * fy));
      const phi = goldenAngle * idx;
      const fib = new THREE.Vector3(Math.cos(phi) * fr, fy, Math.sin(phi) * fr);

      if (maxSpread > 1e-4 && d > maxSpread * 0.05) {
        const dir = diff.normalize().multiplyScalar(natBlend).addScaledVector(fib, fibBlend).normalize();
        dirs.push(dir);
        dists.push(baseR * (0.28 + 0.72 * (d / maxSpread)));
      } else {
        dirs.push(fib);
        dists.push(baseR * (0.40 + 0.60 * ((idx % 3) / 2)));
      }
    });

    const hardCap = baseR * expCfg.radialHardCapMultiplier;
    let resolvedPairs = 0;

    for (let iter = 0; iter < expCfg.solverIterations; iter++) {
      let anyOverlap = false;
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const posI = items[i].worldCenter.clone().addScaledVector(dirs[i], dists[i]);
          const posJ = items[j].worldCenter.clone().addScaledVector(dirs[j], dists[j]);
          const ov = this.checkAABBOverlap(posI, items[i].halfSize, posJ, items[j].halfSize, expCfg.hitboxPadding);
          if (!ov) continue;

          anyOverlap = true;
          resolvedPairs++;
          const push = Math.min(ov[0], ov[1], ov[2]) * 0.52;
          if (dists[i] >= dists[j]) dists[i] = Math.min(hardCap, dists[i] + push);
          else dists[j] = Math.min(hardCap, dists[j] + push);
        }
      }
      if (!anyOverlap) break;
    }

    // Enforce zero-mean displacement so overall assembly stays centered
    const mean = new THREE.Vector3();
    const rawDeltas = items.map((_, i) => {
      const v = dirs[i].clone().multiplyScalar(dists[i]);
      mean.add(v);
      return v;
    });
    mean.divideScalar(count);

    return {
      worldDeltas: rawDeltas.map(v => v.sub(mean)),
      resolvedPairs
    };
  },

  /**
   * Main-Axis Linear Queue solver using real Box3 extents along the longest axis.
   */
  solveLinearExplosion(items, assemblyCenter, assemblySize, expCfg) {
    const count = items.length;
    let axis = 'x';
    if (assemblySize.y >= assemblySize.x && assemblySize.y >= assemblySize.z) axis = 'y';
    if (assemblySize.z >= assemblySize.x && assemblySize.z >= assemblySize.y) axis = 'z';

    const sorted = items.map((it, idx) => ({ idx, val: it.worldCenter[axis], half: it.halfSize[axis] }));
    sorted.sort((a, b) => a.val - b.val);

    // Compute collision-free sequential positions along the primary axis
    const gap = Math.max(0.06, (assemblySize[axis] / count) * expCfg.linearGapMultiplier);
    const axisPositions = new Array(count);
    let cursor = 0;

    sorted.forEach((entry, rank) => {
      if (rank === 0) {
        axisPositions[entry.idx] = 0;
        cursor = entry.half;
      } else {
        const pos = cursor + gap + entry.half;
        axisPositions[entry.idx] = pos;
        cursor = pos + entry.half;
      }
    });

    // Center the entire queue around assemblyCenter[axis]
    let minA = Infinity, maxA = -Infinity;
    sorted.forEach(entry => {
      const p = axisPositions[entry.idx];
      if (p - entry.half < minA) minA = p - entry.half;
      if (p + entry.half > maxA) maxA = p + entry.half;
    });
    const shift = assemblyCenter[axis] - (minA + maxA) * 0.5;

    return items.map((it, idx) => {
      const delta = new THREE.Vector3();
      ['x', 'y', 'z'].forEach(k => {
        if (k === axis) {
          delta[k] = (axisPositions[idx] + shift) - it.worldCenter[k];
        } else {
          delta[k] = (assemblyCenter[k] - it.worldCenter[k]) * expCfg.linearOffAxisPull;
        }
      });
      return delta;
    });
  },

  /**
   * Extract all visible Mesh parts from a normalized model and precompute
   * real Box3 Radial & Linear explosion vectors.
   */
  analyzeModelParts(spinPivot) {
    const expCfg = window.PortfolioConfig.explosion;
    spinPivot.updateMatrixWorld(true);

    const meshes = [];
    spinPivot.traverse((obj) => {
      if (obj.isMesh && obj.geometry) meshes.push(obj);
    });

    if (meshes.length <= 1) {
      return {
        parts: meshes.map((m, idx) => ({
          mesh: m,
          name: (m.name || `Merged_Mesh_${idx + 1}`).replace(/_/g, ' '),
          origPos: m.position.clone(),
          radialDelta: new THREE.Vector3(),
          linearDelta: new THREE.Vector3()
        })),
        collisionBadge: 'SINGLE MESH'
      };
    }

    const assemblyBox = new THREE.Box3().setFromObject(spinPivot);
    const assemblyCenter = assemblyBox.getCenter(new THREE.Vector3());
    const assemblySize = assemblyBox.getSize(new THREE.Vector3());

    const items = meshes.map((m, idx) => {
      const box = new THREE.Box3().setFromObject(m);
      const worldCenter = box.getCenter(new THREE.Vector3());
      const halfSize = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      // Guard ultra-thin planes from zero-thickness AABB collapse
      halfSize.x = Math.max(halfSize.x, 0.015);
      halfSize.y = Math.max(halfSize.y, 0.015);
      halfSize.z = Math.max(halfSize.z, 0.015);

      return {
        mesh: m,
        name: (m.name || `Part_${idx + 1}`).replace(/_/g, ' '),
        origPos: m.position.clone(),
        worldCenter,
        halfSize
      };
    });

    const radialRes = this.solveRadialExplosion(items, assemblyCenter, expCfg);
    const linearWorldDeltas = this.solveLinearExplosion(items, assemblyCenter, assemblySize, expCfg);

    const parts = items.map((it, idx) => ({
      mesh: it.mesh,
      name: it.name,
      origPos: it.origPos,
      radialDelta: this.worldDeltaToLocalDelta(it.mesh, radialRes.worldDeltas[idx]),
      linearDelta: this.worldDeltaToLocalDelta(it.mesh, linearWorldDeltas[idx])
    }));

    return {
      parts,
      collisionBadge: `BOX3 · ${radialRes.resolvedPairs} RESOLVED`
    };
  }
};
