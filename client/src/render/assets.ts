// Shared loaders for the world art: Poly Haven PBR textures and models, the Quaternius village kit
// (modular houses) and our own Blender models in /models. Downloaded packs live in /assets
// (npm run fetch-lookdev-assets); our models are committed in client/public/models.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
export const PH = '/assets/polyhaven';

/** A Poly Haven PBR material (diffuse, normal, AO/roughness/metal) tiled `repeat` times per UV unit. */
export function pbr(name: string, repeat: number | [number, number]): THREE.MeshStandardMaterial {
  const [rx, ry] = typeof repeat === 'number' ? [repeat, repeat] : repeat;
  // One texture object per material so each can have its own repeat (the browser caches the image).
  const load = (suffix: string, srgb: boolean) => {
    const t = texLoader.load(`${PH}/textures/${name}_${suffix}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const arm = load('arm', false);
  return new THREE.MeshStandardMaterial({ map: load('diff', true), normalMap: load('nor', false), aoMap: arm, roughnessMap: arm, metalnessMap: arm });
}

export function shadows<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) m.castShadow = m.receiveShadow = true;
  });
  return o;
}

const modelCache = new Map<string, Promise<THREE.Object3D>>();
/** Load a glTF once; every call returns a fresh clone (geometry and materials are shared). */
export function model(url: string): Promise<THREE.Object3D> {
  let p = modelCache.get(url);
  if (!p) {
    p = gltfLoader.loadAsync(url).then((g) => shadows(g.scene));
    modelCache.set(url, p);
  }
  return p.then((s) => s.clone());
}

/** A Poly Haven model (rocks, plants) at 1k. */
export function polyModel(name: string): Promise<THREE.Object3D> {
  return model(`${PH}/models/${name}/${name}_1k.gltf`);
}

// ---- Village kit (Quaternius, CC0) houses ---------------------------------------------------

function kitPiece(name: string, parent: THREE.Object3D, x: number, y: number, z: number, rotY = 0): Promise<void> {
  return model(`/assets/village/${name}.gltf`).then((o) => {
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    parent.add(o);
  });
}

export type HouseStyle = 'plaster' | 'brick';

/**
 * A house from modular pieces, `size` metres square (4 or 6), `floors` storeys of 3.12 m plus its
 * roof. The door is on the +Z side. Resolves once every piece has loaded.
 */
export async function villageHouse(size: 4 | 6, style: HouseStyle, seed: number, floors = 2): Promise<THREE.Group> {
  const g = new THREE.Group();
  const half = size / 2;
  const H = 3.12;
  const jobs: Promise<void>[] = [];
  const sides = [
    { dx: 0, dz: 1, rot: 0 },
    { dx: 1, dz: 0, rot: Math.PI / 2 },
    { dx: 0, dz: -1, rot: Math.PI },
    { dx: -1, dz: 0, rot: -Math.PI / 2 },
  ];
  const segs = size / 2;
  for (let f = 0; f < floors; f++) {
    sides.forEach((s, si) => {
      for (let i = 0; i < segs; i++) {
        const along = -half + 1 + i * 2;
        const px = s.dx !== 0 ? s.dx * half : along;
        const pz = s.dz !== 0 ? s.dz * half : along;
        let piece: string;
        const ground = f === 0;
        if (ground && si === 0 && i === Math.floor(segs / 2)) piece = style === 'brick' ? 'Wall_UnevenBrick_Door_Round' : 'Wall_Plaster_Door_Round';
        else if (ground) piece = style === 'brick' ? ((i + seed) % 2 ? 'Wall_UnevenBrick_Window_Wide_Round' : 'Wall_UnevenBrick_Straight') : (i + seed) % 2 ? 'Wall_Plaster_Window_Wide_Round' : 'Wall_Plaster_Straight';
        else piece = (i + si + seed) % 2 ? 'Wall_Plaster_Window_Wide_Flat' : 'Wall_Plaster_WoodGrid';
        jobs.push(kitPiece(piece, g, px, f * H, pz, s.rot));
      }
    });
    for (const [cx, cz] of [
      [half, half],
      [half, -half],
      [-half, half],
      [-half, -half],
    ] as const) {
      jobs.push(kitPiece(style === 'brick' && f === 0 ? 'Corner_Exterior_Brick' : 'Corner_Exterior_Wood', g, cx, f * H, cz, Math.atan2(cx, cz) - Math.PI / 4));
    }
  }
  jobs.push(kitPiece(size === 4 ? 'Roof_RoundTiles_4x4' : 'Roof_RoundTiles_6x6', g, 0, floors * H, 0, 0));
  const gable = size === 4 ? 'Roof_Front_Brick4' : 'Roof_Front_Brick6';
  jobs.push(kitPiece(gable, g, 0, floors * H, half, 0));
  jobs.push(kitPiece(gable, g, 0, floors * H, -half, Math.PI));
  jobs.push(kitPiece('Prop_Chimney', g, half - 0.8, floors * H + 1.2, -half + 1, 0));
  await Promise.all(jobs);
  return g;
}
