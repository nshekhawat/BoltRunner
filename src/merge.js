// Draw-call collapse for static geometry. Everything under `root` that never moves relative to it is merged into one mesh per material
// (plus one back-face outline mesh when an outline material is given). Named meshes (spin / flap / roll / plume / flicker / fall …),
// meshes flagged userData.noMerge or userData.keep, multi-material meshes and meshes that parent other objects stay as they are, so
// per-part animation keeps working. Source geometries are never uploaded to the GPU, so they need no disposal; they are unreferenced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), KEEP = ['position', 'normal', 'uv'];
function normalise(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups(); return g;
}
export function mergeStatic(root, outlineMat = null, outlineScale = 1.06) {
  root.updateMatrixWorld(true); _inv.copy(root.matrixWorld).invert();
  const byMat = new Map(), outline = [], victims = [];
  root.traverse(o => {
    if (!o.isMesh || o.name || o.userData.noMerge || o.userData.keep || o.isInstancedMesh || o.isSprite || Array.isArray(o.material) || o.children.length) return;
    _m.multiplyMatrices(_inv, o.matrixWorld);
    const local = normalise(o.geometry);
    if (outlineMat && !o.userData.noOutline) outline.push(local.clone().scale(outlineScale, outlineScale, outlineScale).applyMatrix4(_m));
    local.applyMatrix4(_m);
    let e = byMat.get(o.material); if (!e) byMat.set(o.material, e = { list: [], cast: false, recv: false });
    e.list.push(local); e.cast ||= o.castShadow; e.recv ||= o.receiveShadow; victims.push(o);
  });
  if (victims.length < 2 && !outline.length) return root; // nothing to gain
  for (const v of victims) v.removeFromParent();
  for (const [mat, e] of byMat) { const m = new THREE.Mesh(e.list.length === 1 ? e.list[0] : mergeGeometries(e.list, false), mat); m.castShadow = e.cast; m.receiveShadow = e.recv; m.userData.merged = true; root.add(m); }
  if (outline.length) { const m = new THREE.Mesh(outline.length === 1 ? outline[0] : mergeGeometries(outline, false), outlineMat); m.userData.noOutline = true; m.userData.outline = true; m.userData.merged = true; root.add(m); }
  return root;
}
