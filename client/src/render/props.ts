// Our Blender map models: props (art/props -> /models/props.glb: lamp post, fountain, boss-hall
// pillar) and the city pieces (art/city -> /models/city.glb: wall, tower, gatehouse, Hall of
// Remembrance). Glow materials become unlit (so bloom catches them), water gets a gentle animated
// sheen, and empties in the models mark where effects go.
import * as THREE from 'three';
import { model } from './assets';

const FILES = {
  Lamp: '/models/props.glb',
  Fountain: '/models/props.glb',
  BossPillar: '/models/props.glb',
  CityWall: '/models/city.glb',
  CityTower: '/models/city.glb',
  CityGate: '/models/city.glb',
  MemorialHall: '/models/city.glb',
} as const;
export type PropName = keyof typeof FILES;

const glowWarm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.05, 0.55) });

/** Shared clock for every animated prop material. */
export const propTime = { value: 0 };

let water: THREE.MeshStandardMaterial | null = null;
function waterMaterial(): THREE.MeshStandardMaterial {
  if (water) return water;
  const mat = new THREE.MeshStandardMaterial({ color: '#2a6f8a', roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.55, depthWrite: false });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = propTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    // Light streaks that slide down the falling sheets and ripple across the pools.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vWPos;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float a = atan(vWPos.z, vWPos.x);
         float fall = sin(vWPos.y * 14.0 + uTime * 7.0 + sin(a * 9.0) * 2.0);
         float ripple = sin(length(vWPos.xz) * 9.0 - uTime * 2.5);
         totalEmissiveRadiance += vec3(0.25, 0.45, 0.55) * smoothstep(0.75, 1.0, max(fall, ripple)) * 0.6;`,
      );
  };
  water = mat;
  return mat;
}

const prepared = new Map<string, Promise<THREE.Object3D>>();
function library(url: string): Promise<THREE.Object3D> {
  const cached = prepared.get(url);
  if (cached) return cached;
  const p = model(url).then((root) => {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const name = (m.material as THREE.Material).name;
      if (name === 'GlowWarm') {
        m.material = glowWarm;
        m.castShadow = false;
      } else if (name === 'Water') {
        m.material = waterMaterial();
        m.castShadow = false;
      }
    });
    return root;
  });
  prepared.set(url, p);
  return p;
}

/** A fresh copy of one prop, with its root at the origin. */
export async function prop(name: PropName): Promise<THREE.Object3D> {
  const src = (await library(FILES[name])).getObjectByName(name);
  if (!src) throw new Error(`${FILES[name]} has no ${name}`);
  const o = src.clone();
  o.position.set(0, 0, 0);
  o.rotation.set(0, 0, 0);
  return o;
}

/** Position of a marker empty inside a prop copy, in the prop's own frame. */
export function marker(propRoot: THREE.Object3D, name: string): THREE.Vector3 {
  const m = propRoot.getObjectByName(name);
  if (!m) throw new Error(`prop has no ${name}`);
  return m.position.clone();
}
