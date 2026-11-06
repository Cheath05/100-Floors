// Builds the visible world for a map from the same data the server collides with, in the look-test
// style: Poly Haven PBR ground, our Blender models (teleport gate, lamps, fountains, boss pillars,
// city wall/towers/gatehouses, Hall of Remembrance), village-kit houses (instanced), ez-tree trees,
// Poly Haven rocks and instanced grass. Models stream in after
// buildWorld() returns; until then the ground is already there.
import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';
import { CITY, type MapDef, type Prop } from '@floors/shared';
import { gltfLoader, pbr, polyModel, shadows, villageHouse, type HouseStyle } from './assets';
import { teleportGate, type Gate } from './gate';
import { createGrass } from './grass';
import { instances, placeAt } from './instancing';
import { marker, prop, propTime, type PropName } from './props';

export interface WorldView {
  group: THREE.Group;
  /** Resolves when every model has loaded. */
  ready: Promise<void>;
  update(time: number): void;
  dispose(): void;
}

function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function flatOnGround<T extends THREE.Mesh>(m: T, y: number): T {
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

/** A PBR material whose texture repeats every `metres` on a surface `w` x `h` metres. */
function tiled(name: string, w: number, h: number, metres: number): THREE.MeshStandardMaterial {
  return pbr(name, [w / metres, h / metres]);
}

// ---- Trees -------------------------------------------------------------------------------------

const TREE_PRESETS = ['Oak Large', 'Ash Large', 'Oak Medium', 'Pine Large', 'Aspen Medium', 'Oak Large'];
let treeVariants: { tree: Tree; height: number }[] | null = null;

/** A handful of generated trees; placements copy their meshes instead of generating each one. */
function variants(): { tree: Tree; height: number }[] {
  if (treeVariants) return treeVariants;
  treeVariants = TREE_PRESETS.map((preset, i) => {
    const tree = new Tree();
    tree.loadPreset(preset);
    tree.options.seed = 1000 + i * 17;
    tree.generate();
    shadows(tree);
    const box = new THREE.Box3().setFromObject(tree);
    return { tree, height: box.max.y - box.min.y };
  });
  return treeVariants;
}

function treeAt(x: number, z: number, height: number, rot: number, pick: number): THREE.Group {
  const v = variants()[pick % TREE_PRESETS.length]!;
  const g = new THREE.Group();
  for (const c of v.tree.children) g.add(c.clone());
  g.scale.setScalar(height / v.height);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  return g;
}

// ---- Shared pieces -------------------------------------------------------------------------------

function grassGround(group: THREE.Group): void {
  // leafy_grass is mostly fallen leaves; tint it green so open ground reads as meadow.
  const mat = pbr('leafy_grass', 280);
  mat.color.set('#9cc472');
  group.add(flatOnGround(new THREE.Mesh(new THREE.CircleGeometry(560, 96), mat), 0));
}

/** Distant ring of trees outside the walkable area, so the map edge reads as forest. */
function forestEdge(group: THREE.Group, inner: number, outer: number, count: number, seed: number): void {
  const r = seeded(seed);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + r() * 0.2;
    const d = inner + r() * (outer - inner);
    group.add(treeAt(Math.sin(a) * d, Math.cos(a) * d, 10 + r() * 7, r() * Math.PI * 2, i));
  }
}

// ---- Maps ----------------------------------------------------------------------------------------

function buildTown(map: MapDef, group: THREE.Group, jobs: Promise<unknown>[], animated: { update(t: number): void }[]): void {
  const { plazaR, avenueHalf, ringRoad, wallR } = CITY;
  grassGround(group);
  // City ground: mossy cobbles between the houses, dressed cobblestone on every street.
  group.add(flatOnGround(new THREE.Mesh(new THREE.CircleGeometry(wallR + 1, 128), pbr('mossy_cobblestone', 64)), 0.006));
  group.add(flatOnGround(new THREE.Mesh(new THREE.CircleGeometry(plazaR, 96), pbr('cobblestone_floor_01', 16)), 0.012));
  group.add(flatOnGround(new THREE.Mesh(new THREE.RingGeometry(ringRoad.inner, ringRoad.outer, 160), pbr('cobblestone_floor_01', 68)), 0.01));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(plazaR, 0.18, 6, 128), pbr('castle_brick_07', 36));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.04;
  rim.scale.z = 0.5;
  rim.receiveShadow = true;
  group.add(rim);
  const len = wallR - plazaR + 4;
  for (let i = 0; i < 4; i++) {
    const street = new THREE.Mesh(new THREE.PlaneGeometry(avenueHalf * 2, len), tiled('cobblestone_floor_01', avenueHalf * 2, len, 1.8));
    flatOnGround(street, 0.011);
    const a = (i * Math.PI) / 2;
    street.rotation.z = a;
    const mid = plazaR + len / 2 - 2;
    street.position.set(Math.sin(a) * mid, 0.011, Math.cos(a) * mid);
    group.add(street);
  }

  // Meadow and woods outside the wall.
  const grass = createGrass({ count: 50000, innerRadius: wallR + 4, outerRadius: 150, seed: 3 });
  group.add(grass.mesh);
  animated.push(grass);
  forestEdge(group, wallR + 14, wallR + 60, 44, 5);

  const by = (kind: Prop['kind']) => map.props.filter((p) => p.kind === kind);
  jobs.push(...by('gate').map((p) => addGate(p, group, animated)));
  jobs.push(...by('fountain').map((p) => place('Fountain', p, group)));
  jobs.push(...by('hall').map((p) => place('MemorialHall', p, group)));
  jobs.push(...by('cityGate').map((p) => place('CityGate', p, group)));
  // Repeated pieces are instanced: one draw call per material for all copies.
  const many = async (name: PropName, props: Prop[]) => {
    const template = await prop(name);
    group.add(instances(template, props.map((p) => placeAt(p.x, p.z, p.rot))));
  };
  jobs.push(many('Lamp', by('lamp')), many('CityWall', by('cityWall')), many('CityTower', by('cityTower')));
  jobs.push(addHouses(by('building'), group));
}

function buildField(map: MapDef, group: THREE.Group, jobs: Promise<unknown>[], animated: { update(t: number): void }[]): void {
  grassGround(group);
  const solid = map.props.filter((p) => p.kind === 'tree' || p.kind === 'rock');
  const grass = createGrass({
    count: 90000,
    innerRadius: 0,
    outerRadius: 90,
    seed: 3,
    allow: (x, z) => solid.every((p) => Math.hypot(x - p.x, z - p.z) > (p.kind === 'rock' ? 1.0 : 0.6) * p.size),
  });
  group.add(grass.mesh);
  animated.push(grass);
  for (const p of map.props) {
    // Collider radius is 0.45 * size for trees; the trunk of a 9-15 m tree is about that wide.
    if (p.kind === 'tree') group.add(treeAt(p.x, p.z, 7 + p.size * 5, p.rot, p.seed));
    else if (p.kind === 'rock') jobs.push(addRock(p, group));
  }
  forestEdge(group, 86, 120, 40, 9);
  // Small plants: no collision, kept off the trees and rocks.
  jobs.push(scatterPlants(group, solid, 'fern_02', 70, [1.5, 2.5], 7), scatterPlants(group, solid, 'grass_medium_01', 110, [1.4, 2.4], 9));
}

function buildBossRoom(map: MapDef, group: THREE.Group, jobs: Promise<unknown>[], animated: { update(t: number): void }[]): void {
  const b = map.bounds.kind === 'rect' ? map.bounds : { halfX: 30, halfZ: 30 };
  const W = b.halfX * 2;
  const D = b.halfZ * 2;
  const H = 14;
  group.add(flatOnGround(new THREE.Mesh(new THREE.PlaneGeometry(W, D), tiled('granite_tile', W, D, 3)), 0));
  // Brick walls (texture tiled per wall so bricks keep one size) and a dark vaulted ceiling.
  const walls: [number, number, number, number][] = [
    [0, -b.halfZ - 0.5, W + 2, 0],
    [0, b.halfZ + 0.5, W + 2, Math.PI],
    [-b.halfX - 0.5, 0, D, Math.PI / 2],
    [b.halfX + 0.5, 0, D, -Math.PI / 2],
  ];
  for (const [x, z, len, rot] of walls) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, H), tiled('castle_brick_07', len, H, 3));
    wall.position.set(x, H / 2, z);
    wall.rotation.y = rot;
    wall.receiveShadow = true;
    group.add(wall);
  }
  const ceilingMat = tiled('castle_brick_07', W + 2, D + 2, 4);
  ceilingMat.color.set('#55505e');
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W + 2, D + 2), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  group.add(ceiling);

  map.props.forEach((p, i) => {
    if (p.kind !== 'pillar') return;
    jobs.push(
      // The brazier is on the pillar's +X side; turn the right-hand row to face the aisle too.
      place('BossPillar', { ...p, rot: p.x > 0 ? Math.PI : 0 }, group).then((pillar) => {
        const at = pillar.localToWorld(marker(pillar, 'Pillar_Flame'));
        const flame = brazierFlame(i);
        flame.position.copy(at);
        group.add(flame);
        animated.push(flame.userData as { update(t: number): void });
        // Light every other brazier; fragment cost grows with each point light.
        if (i % 2 === 0) {
          const light = new THREE.PointLight('#ff9a4a', 30, 18, 1.6);
          light.position.copy(at).add(new THREE.Vector3(0, 0.4, 0));
          group.add(light);
          const base = light.intensity;
          animated.push({ update: (t) => (light.intensity = base * (0.85 + 0.15 * Math.sin(t * 9 + i) * Math.sin(t * 5.3 + i * 2))) });
        }
      }),
    );
  });
}

// ---- Props -----------------------------------------------------------------------------------

async function place(name: PropName, p: Prop, group: THREE.Group): Promise<THREE.Object3D> {
  const o = await prop(name);
  o.position.set(p.x, 0, p.z);
  o.rotation.y = p.rot;
  group.add(o);
  o.updateMatrixWorld(true);
  return o;
}

async function addGate(p: Prop, group: THREE.Group, animated: { update(t: number): void }[]): Promise<void> {
  const gate: Gate = await teleportGate(gltfLoader);
  gate.group.position.set(p.x, 0, p.z);
  gate.group.rotation.y = p.rot;
  group.add(gate.group);
  animated.push(gate);
}

/** Houses come in a few variants (size, style, storeys, window pattern); each is built once and instanced. */
async function addHouses(houses: Prop[], group: THREE.Group): Promise<void> {
  const variants = new Map<string, { size: 4 | 6; style: HouseStyle; seed: number; floors: number; at: THREE.Matrix4[] }>();
  for (const p of houses) {
    const size = p.w === 4 ? 4 : 6;
    const style: HouseStyle = p.seed % 3 === 0 ? 'brick' : 'plaster';
    const seed = p.seed % 2;
    const floors = p.size >= 3 ? 3 : 2;
    const key = `${size}-${style}-${seed}-${floors}`;
    const v = variants.get(key) ?? { size, style, seed, floors, at: [] };
    v.at.push(placeAt(p.x, p.z, p.rot));
    variants.set(key, v);
  }
  await Promise.all(
    [...variants.values()].map(async (v) => {
      const template = await villageHouse(v.size, v.style, v.seed, v.floors);
      group.add(instances(template, v.at));
    }),
  );
}

const ROCKS = ['boulder_01', 'rock_moss_set_01'];
async function addRock(p: Prop, group: THREE.Group): Promise<void> {
  const rock = await polyModel(ROCKS[p.seed % ROCKS.length]!);
  const box = new THREE.Box3().setFromObject(rock);
  const footprint = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  // Match the collider (radius 0.9 * size) with a little overhang.
  rock.scale.setScalar((0.9 * p.size * 2.2) / footprint);
  rock.position.set(p.x, 0, p.z);
  rock.rotation.y = p.rot;
  group.add(rock);
}

async function scatterPlants(group: THREE.Group, avoid: Prop[], name: string, count: number, scale: [number, number], seed: number): Promise<void> {
  const r = seeded(seed);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const d = 6 + r() * 70;
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const s = scale[0] + r() * (scale[1] - scale[0]);
    const rot = r() * Math.PI * 2;
    if (avoid.some((p) => Math.hypot(x - p.x, z - p.z) < p.size * 1.2 + 0.5)) continue;
    const o = await polyModel(name);
    o.position.set(x, 0, z);
    o.rotation.y = rot;
    o.scale.setScalar(s);
    group.add(o);
  }
}

// ---- Effects -----------------------------------------------------------------------------------

let flameTexture: THREE.CanvasTexture | null = null;
function flameMap(): THREE.CanvasTexture {
  if (flameTexture) return flameTexture;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 92, 2, 32, 80, 52);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.25, 'rgba(255,170,60,0.95)');
  grad.addColorStop(0.6, 'rgba(230,80,20,0.45)');
  grad.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(32, 2);
  g.bezierCurveTo(60, 60, 64, 110, 32, 126);
  g.bezierCurveTo(0, 110, 4, 60, 32, 2);
  g.fill();
  flameTexture = new THREE.CanvasTexture(c);
  flameTexture.colorSpace = THREE.SRGBColorSpace;
  return flameTexture;
}

/** A flickering fire sprite for a brazier; userData.update animates it. */
function brazierFlame(seed: number): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({ map: flameMap(), color: new THREE.Color(2.2, 1.6, 1.1), blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.center.set(0.5, 0.05);
  s.scale.set(0.45, 0.9, 1);
  s.userData = {
    update(t: number) {
      const f = 0.9 + 0.1 * Math.sin(t * 13 + seed) + 0.06 * Math.sin(t * 29 + seed * 3);
      s.scale.set(0.45 * (2 - f), 0.9 * f, 1);
    },
  };
  return s;
}

// ---- Entry -------------------------------------------------------------------------------------

export function buildWorld(map: MapDef): WorldView {
  const group = new THREE.Group();
  const jobs: Promise<unknown>[] = [];
  const animated: { update(t: number): void }[] = [];
  if (map.ground === 'stone') buildBossRoom(map, group, jobs, animated);
  else {
    if (map.ground === 'plaza') buildTown(map, group, jobs, animated);
    else buildField(map, group, jobs, animated);
    // Placed trees share the variants' materials, so animating the variants sways them all.
    animated.push({ update: (t) => variants().forEach((v) => v.tree.update(t)) });
  }
  const ready = Promise.allSettled(jobs).then((results) => {
    for (const r of results) if (r.status === 'rejected') console.warn('world model failed to load (run npm run fetch-lookdev-assets?)', r.reason);
  });

  return {
    group,
    ready,
    update(time) {
      propTime.value = time;
      for (const a of animated) a.update(time);
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    },
  };
}
