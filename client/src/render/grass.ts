// Instanced grass blades with a wind sway, for lush fields around the town.
import * as THREE from 'three';

export interface GrassOptions {
  count: number;
  innerRadius: number;
  outerRadius: number;
  /** Return false to keep a spot clear (houses, paths). */
  allow?: (x: number, z: number) => boolean;
  seed?: number;
}

function bladeGeometry(): THREE.BufferGeometry {
  // A tapered blade: 3 segments, bending slightly forward.
  const w = 0.05;
  const h = 1;
  const pos = [-w, 0, 0, w, 0, 0, -w * 0.75, h * 0.4, 0.02, w * 0.75, h * 0.4, 0.02, -w * 0.4, h * 0.75, 0.06, w * 0.4, h * 0.75, 0.06, 0, h, 0.12];
  const idx = [0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Point normals up so blades light like a lawn rather than flat cards.
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0.25);
  return g;
}

export function createGrass(opts: GrassOptions): { mesh: THREE.InstancedMesh; update(t: number): void } {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide, vertexColors: false });
  const uniforms = { uTime: { value: 0 } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
         float sway = sin(uTime * 1.6 + wp.x * 0.35 + wp.z * 0.27) * 0.5 + sin(uTime * 2.7 + wp.x * 0.9) * 0.2;
         float k = position.y * position.y;
         transformed.x += sway * 0.22 * k;
         transformed.z += sway * 0.12 * k;`,
      );
  };
  const mesh = new THREE.InstancedMesh(bladeGeometry(), mat, opts.count);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const e = new THREE.Euler();
  const color = new THREE.Color();
  const base = new THREE.Color('#2c5418');
  const tip = new THREE.Color('#5f8f2c');
  let seed = opts.seed ?? 1;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  let placed = 0;
  let guard = 0;
  while (placed < opts.count && guard++ < opts.count * 4) {
    const a = rnd() * Math.PI * 2;
    // Uniform over the ring's area.
    const r = Math.sqrt(opts.innerRadius ** 2 + rnd() * (opts.outerRadius ** 2 - opts.innerRadius ** 2));
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (opts.allow && !opts.allow(x, z)) continue;
    const height = 0.22 + rnd() * 0.3;
    p.set(x, 0, z);
    e.set((rnd() - 0.5) * 0.4, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.4);
    q.setFromEuler(e);
    s.set(1.2 + rnd() * 0.8, height, 1);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    color.copy(base).lerp(tip, rnd());
    mesh.setColorAt(placed, color);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  return {
    mesh,
    update(t) {
      uniforms.uTime.value = t;
    },
  };
}
