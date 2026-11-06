// Collision layouts for the step-1 test areas. The client builds visuals from the same data so what
// you see matches what you bump into. Real floors come from the floor data pipeline later.

export interface CircleCollider {
  x: number;
  z: number;
  r: number;
}

/** Axis-aligned box on the ground plane (height only matters for visuals). */
export interface BoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  h: number;
}

export type Bounds = { kind: 'circle'; r: number } | { kind: 'rect'; halfX: number; halfZ: number };

export type PropKind = 'gate' | 'building' | 'lamp' | 'tree' | 'rock' | 'pillar' | 'fountain';

export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  /** Rotation around Y in radians. */
  rot: number;
  /** Uniform-ish size hint for the renderer. */
  size: number;
  /** Seed for procedural variation. */
  seed: number;
  /** Footprint width for box-shaped props (buildings). */
  w?: number;
}

export interface MapDef {
  id: string;
  title: string;
  bounds: Bounds;
  circles: CircleCollider[];
  boxes: BoxCollider[];
  props: Prop[];
  spawn: { x: number; z: number; facing: number };
  /** Inside a town's safe zone ("Inner Area"). */
  safeZone: boolean;
  ground: 'plaza' | 'grass' | 'stone';
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTown(): MapDef {
  const props: Prop[] = [];
  const circles: CircleCollider[] = [];
  const boxes: BoxCollider[] = [];
  // Teleport gate in the middle of the plaza: two pillars and an arch.
  props.push({ kind: 'gate', x: 0, z: 0, rot: 0, size: 1, seed: 1 });
  circles.push({ x: -2.4, z: 0, r: 0.75 }, { x: 2.4, z: 0, r: 0.75 });
  // Fountains either side of the gate.
  for (const fx of [-11, 11]) {
    props.push({ kind: 'fountain', x: fx, z: -6, rot: 0, size: 1, seed: fx });
    circles.push({ x: fx, z: -6, r: 2.2 });
  }
  // Ring of lamps around the plaza.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const x = Math.sin(a) * 17;
    const z = Math.cos(a) * 17;
    props.push({ kind: 'lamp', x, z, rot: a, size: 1, seed: i });
    circles.push({ x, z, r: 0.25 });
  }
  // Ring of buildings, with four street gaps (N, E, S, W).
  const r = rng(42);
  const ringR = 31;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const deg = (a * 180) / Math.PI;
    const nearStreet = [0, 90, 180, 270, 360].some((d) => Math.abs(deg - d) < 12);
    if (nearStreet) continue;
    const x = Math.sin(a) * ringR;
    const z = Math.cos(a) * ringR;
    const w = 5 + r() * 2;
    const h = 5 + r() * 4;
    props.push({ kind: 'building', x, z, rot: a, size: h, seed: i * 7 + 3, w });
    // Box collider: buildings are drawn square-ish, so use their footprint radius as a box.
    boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - w / 2, maxZ: z + w / 2, h });
  }
  return {
    id: 'town',
    title: 'Town of the First Floor (test plaza)',
    bounds: { kind: 'circle', r: 40 },
    circles,
    boxes,
    props,
    spawn: { x: 0, z: 8, facing: Math.PI },
    safeZone: true,
    ground: 'plaza',
  };
}

function buildField(): MapDef {
  const props: Prop[] = [];
  const circles: CircleCollider[] = [];
  const r = rng(7);
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2;
    const d = 14 + r() * 62;
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const isTree = r() < 0.7;
    const size = isTree ? 0.8 + r() * 0.8 : 0.6 + r() * 1.4;
    props.push({ kind: isTree ? 'tree' : 'rock', x, z, rot: r() * Math.PI * 2, size, seed: i });
    circles.push({ x, z, r: isTree ? 0.45 * size : 0.9 * size });
  }
  return {
    id: 'field',
    title: 'Grassland (test field)',
    bounds: { kind: 'circle', r: 80 },
    circles,
    boxes: [],
    props,
    spawn: { x: 0, z: 0, facing: 0 },
    safeZone: false,
    ground: 'grass',
  };
}

function buildBossRoom(): MapDef {
  const props: Prop[] = [];
  const circles: CircleCollider[] = [];
  // Two rows of pillars down a long hall; the lore's first boss room is 20 m x 100 m.
  for (let i = 0; i < 6; i++) {
    const z = -25 + i * 10;
    for (const x of [-9, 9]) {
      props.push({ kind: 'pillar', x, z, rot: 0, size: 1, seed: i });
      circles.push({ x, z, r: 0.9 });
    }
  }
  return {
    id: 'boss',
    title: 'Boss room (test arena)',
    bounds: { kind: 'rect', halfX: 12, halfZ: 32 },
    circles,
    boxes: [],
    props,
    spawn: { x: 0, z: 28, facing: Math.PI },
    safeZone: false,
    ground: 'stone',
  };
}

export const MAPS: Record<string, MapDef> = {
  town: buildTown(),
  field: buildField(),
  boss: buildBossRoom(),
};

export function getMap(id: string): MapDef {
  const map = MAPS[id];
  if (!map) throw new Error(`unknown map ${id}`);
  return map;
}
