// Draw many copies of a model cheaply: merge the template's meshes into one geometry per material,
// then draw every copy of each with a single InstancedMesh. A city of ~170 modular houses (dozens of
// kit pieces each) becomes about a hundred draw calls instead of thousands.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP = ['position', 'normal', 'uv'];

/** Same attribute set and indexing for every part, so they can be merged. */
function normalize(g: THREE.BufferGeometry): THREE.BufferGeometry | null {
  if (!g.getAttribute('position') || !g.getAttribute('normal')) return null;
  const out = new THREE.BufferGeometry();
  for (const name of KEEP) {
    const a = g.getAttribute(name);
    if (a) out.setAttribute(name, a.clone());
  }
  if (!out.getAttribute('uv')) {
    out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(out.getAttribute('position').count * 2), 2));
  }
  const index = g.getIndex();
  if (index) out.setIndex(index.clone());
  else out.setIndex([...Array(out.getAttribute('position').count).keys()]);
  return out;
}

/** The template's meshes, baked into its own space and merged per material. */
export function mergeByMaterial(template: THREE.Object3D): { geometry: THREE.BufferGeometry; material: THREE.Material }[] {
  template.updateMatrixWorld(true);
  const inv = template.matrixWorld.clone().invert();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const m = new THREE.Matrix4();
  template.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    m.multiplyMatrices(inv, mesh.matrixWorld);
    const groups = mesh.geometry.groups.length && Array.isArray(mesh.material) ? mesh.geometry.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
    for (const grp of groups) {
      const material = mats[grp.materialIndex ?? 0];
      if (!material) continue;
      let g = mesh.geometry;
      if (groups.length > 1) {
        // Split a multi-material mesh into one piece per group.
        const src = g.index ? g : (normalize(g) ?? g);
        const idx = src.getIndex()!;
        const end = Math.min(idx.count, grp.start + grp.count);
        g = src.clone();
        g.setIndex(Array.from((idx.array as ArrayLike<number>)).slice(grp.start, end));
        g.clearGroups();
      }
      const part = normalize(g);
      if (!part) continue;
      part.applyMatrix4(m);
      const list = byMat.get(material) ?? [];
      list.push(part);
      byMat.set(material, list);
    }
  });
  const out: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
  for (const [material, parts] of byMat) {
    const geometry = mergeGeometries(parts, false);
    if (geometry) out.push({ geometry, material });
  }
  return out;
}

/** One InstancedMesh per material of `template`, drawn at each of `transforms`. */
export function instances(template: THREE.Object3D, transforms: THREE.Matrix4[], shadows = true): THREE.Group {
  const g = new THREE.Group();
  if (!transforms.length) return g;
  for (const { geometry, material } of mergeByMaterial(template)) {
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    transforms.forEach((t, i) => mesh.setMatrixAt(i, t));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = shadows && !(material as THREE.MeshBasicMaterial).isMeshBasicMaterial && !material.transparent;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

/** Transform for a prop standing at (x, z) turned `rot` around Y. */
export function placeAt(x: number, z: number, rot: number, scale = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(scale, scale, scale));
}
