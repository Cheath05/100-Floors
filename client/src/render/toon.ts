// Anime cel shading: a 3-band toon ramp, flat-ish colors, ink outlines (OutlineEffect) and bloom.
import * as THREE from 'three';

let ramp: THREE.DataTexture | null = null;

/** Three-step light ramp: shadow, mid, lit. Nearest filtering keeps the bands crisp. */
export function toonRamp(): THREE.DataTexture {
  if (ramp) return ramp;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

export interface ToonOptions {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  /** Outline thickness for OutlineEffect (0 = none). */
  outline?: number;
  side?: THREE.Side;
}

export function toonMaterial(opts: ToonOptions = {}): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({
    color: opts.color ?? 0xffffff,
    map: opts.map ?? null,
    gradientMap: toonRamp(),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
  setOutline(mat, opts.outline ?? 0.004);
  return mat;
}

/** Per-material outline settings read by OutlineEffect. */
export function setOutline(mat: THREE.Material, thickness: number, color: [number, number, number] = [0.08, 0.06, 0.1]): void {
  mat.userData.outlineParameters = thickness > 0 ? { thickness, color, alpha: 1, visible: true } : { visible: false };
}

/** Swap the standard PBR materials of a loaded model for toon ones, keeping their textures. */
export function toonify(root: THREE.Object3D, outline = 0.0035): void {
  const cache = new Map<THREE.Material, THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const swap = (m: THREE.Material): THREE.Material => {
      let out = cache.get(m);
      if (!out) {
        const src = m as THREE.MeshStandardMaterial;
        out = toonMaterial({ color: src.color, map: src.map, outline });
        cache.set(m, out);
      }
      return out;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}

/** Small canvas noise textures so flat surfaces aren't completely plain. */
export function noiseTexture(base: string, spots: string[], size = 256, count = 1400, seed = 1, repeat = 1): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    g.fillStyle = spots[Math.floor(rnd() * spots.length)]!;
    const r = 1 + rnd() * 3;
    g.globalAlpha = 0.25 + rnd() * 0.5;
    g.beginPath();
    g.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

/** Stone plaza tiles in concentric rings. */
export function plazaTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#b9b1a3';
  g.fillRect(0, 0, size, size);
  const c = size / 2;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let ring = 0; ring < 22; ring++) {
    const r0 = ring * 24;
    const r1 = r0 + 24;
    const n = Math.max(6, Math.floor((Math.PI * 2 * (r0 + 12)) / 28));
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + ring * 0.13;
      const a1 = ((i + 1) / n) * Math.PI * 2 + ring * 0.13;
      const shade = 168 + Math.floor(rnd() * 40);
      g.fillStyle = `rgb(${shade},${shade - 6},${shade - 16})`;
      g.beginPath();
      g.arc(c, c, r1 - 1.5, a0 + 0.012, a1 - 0.012);
      g.arc(c, c, r0 + 1.5, a1 - 0.012, a0 + 0.012, true);
      g.closePath();
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
