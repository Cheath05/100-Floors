// Collision layouts for the step-1 test areas. The client builds visuals from the same data so what
// you see matches what you bump into. Real floors come from the floor data pipeline later.

export interface CircleCollider {
  x: number;
  z: number;
  r: number;
}

/**
 * Box on the ground plane that blocks movement at any height. min/max are its extents before
 * `rot` (radians around Y, same sense as three.js rotation.y) turns it about its centre.
 */
export interface BoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  h: number;
  rot?: number;
}

/** Walkable raised floor (a step or dais), axis-aligned. Characters stand on it at height `top`. */
export interface Platform {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
}

export type Bounds = { kind: 'circle'; r: number } | { kind: 'rect'; halfX: number; halfZ: number };

export type PropKind =
  | 'gate'
  | 'building'
  | 'lamp'
  | 'tree'
  | 'rock'
  | 'pillar'
  | 'fountain'
  | 'cityWall'
  | 'cityTower'
  | 'cityGate'
  | 'hall';

export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  /** Rotation around Y in radians. */
  rot: number;
  /** Uniform-ish size hint for the renderer (for buildings: the number of storeys). */
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
  platforms: Platform[];
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

/** Box centred on (x, z) with full widths w x d. */
function boxAt(x: number, z: number, w: number, d: number, h: number, rot = 0): BoxCollider {
  return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h, ...(rot ? { rot } : {}) };
}

/**
 * The teleport gate model (art/gate): a three-step dais (11 x 9, 0.32 m per step) with obelisks on
 * 1.8 m footings at the corners and a low wall with corner posts across the back. Front faces +Z.
 */
const GATE = {
  tiers: [
    [11, 9],
    [9.4, 7.6],
    [7.8, 6.2],
  ] as const,
  tierH: 0.32,
  obelisk: { x: 4.55, z: 3.55, w: 1.8 },
  wall: { z: -2.6, w: 5.7, d: 0.8, h: 2.64 },
};

function addGate(x: number, z: number, props: Prop[], boxes: BoxCollider[], platforms: Platform[]): void {
  props.push({ kind: 'gate', x, z, rot: 0, size: 1, seed: 1 });
  GATE.tiers.forEach(([w, d], i) => {
    platforms.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: GATE.tierH * (i + 1) });
  });
  const o = GATE.obelisk;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxes.push(boxAt(x + sx * o.x, z + sz * o.z, o.w, o.w, 7.3));
  const wl = GATE.wall;
  boxes.push(boxAt(x, z + wl.z, wl.w, wl.d, wl.h));
}

/**
 * The starting city (original design): a round walled city about 190 m across. The teleport gate
 * stands in a central plaza; four avenues run out to gatehouses in the city wall, crossed by a
 * ring road; the Hall of Remembrance (the memorial) closes the view up the avenue behind the gate.
 * Houses line every street, turned to face it. All sizes match the models in art/.
 */
export const CITY = {
  plazaR: 27,
  /** Half width of the four avenues (along the X and Z axes). */
  avenueHalf: 5,
  ringRoad: { inner: 54.5, outer: 61.5 },
  wallR: 96,
  /** Characters stay inside this radius (the wall's inner face is at ~94.5). */
  boundR: 92,
  hall: { z: -76 },
  storey: 3.12,
};

/** House footprint plus a little for the corner posts and eaves. */
const HOUSE_PAD = 0.3;

function addHall(z0: number, props: Prop[], circles: CircleCollider[], platforms: Platform[]): void {
  props.push({ kind: 'hall', x: 0, z: z0, rot: 0, size: 1, seed: 1 });
  // Three 0.3 m podium steps all round (art/city: x +-13.6, z -15..16 for the lowest).
  [
    [13.6, -15, 16],
    [13.0, -14.4, 15.4],
    [12.4, -13.8, 14.8],
  ].forEach(([hx, a, b], i) => platforms.push({ minX: -hx!, maxX: hx!, minZ: z0 + a!, maxZ: z0 + b!, top: 0.3 * (i + 1) }));
  // Rotunda (radius 10.5 at its base moulding) and the six portico columns.
  circles.push({ x: 0, z: z0 - 3, r: 10.6 });
  for (const x of [-7, -4.2, -1.4, 1.4, 4.2, 7]) circles.push({ x, z: z0 + 10, r: 0.8 });
}

function addCityWall(props: Prop[]): void {
  const R = CITY.wallR;
  const gateAngles = [0, 90, 180, 270];
  for (const deg of gateAngles) {
    const a = (deg * Math.PI) / 180;
    props.push({ kind: 'cityGate', x: Math.sin(a) * R, z: Math.cos(a) * R, rot: a + Math.PI, size: 1, seed: deg });
  }
  for (let deg = 30; deg < 360; deg += 30) {
    if (deg % 90 === 0) continue;
    const a = (deg * Math.PI) / 180;
    props.push({ kind: 'cityTower', x: Math.sin(a) * R, z: Math.cos(a) * R, rot: 0, size: 1, seed: deg });
  }
  // 10 m wall stretches every 6 degrees (a 10 m chord at this radius), leaving the gatehouses clear.
  for (let deg = 3; deg < 360; deg += 6) {
    if (gateAngles.some((g) => Math.abs(((deg - g + 540) % 360) - 180) < 6)) continue;
    const a = (deg * Math.PI) / 180;
    props.push({ kind: 'cityWall', x: Math.sin(a) * R, z: Math.cos(a) * R, rot: a + Math.PI, size: 1, seed: deg });
  }
}

interface HouseSpot {
  x: number;
  z: number;
  w: number;
  /** Facing: the house's door side (+Z) points along (sin rot, cos rot). */
  rot: number;
}

/** Footprint corners of a house (with padding), in world X/Z. */
function corners(h: HouseSpot): [number, number][] {
  const e = (h.w + HOUSE_PAD) / 2;
  const c = Math.cos(h.rot);
  const s = Math.sin(h.rot);
  return [
    [-e, -e],
    [e, -e],
    [e, e],
    [-e, e],
  ].map(([lx, lz]) => [h.x + lx! * c + lz! * s, h.z - lx! * s + lz! * c] as [number, number]);
}

/** Separating-axis test for two square footprints, with a clearance gap between them. */
function overlaps(a: HouseSpot, b: HouseSpot, gap: number): boolean {
  const ca = corners(a);
  const cb = corners(b);
  for (const rot of [a.rot, b.rot]) {
    for (const [ax, az] of [
      [Math.cos(rot), -Math.sin(rot)],
      [Math.sin(rot), Math.cos(rot)],
    ] as const) {
      const pa = ca.map(([x, z]) => x * ax + z * az);
      const pb = cb.map(([x, z]) => x * ax + z * az);
      if (Math.max(...pa) + gap < Math.min(...pb) || Math.max(...pb) + gap < Math.min(...pa)) return false;
    }
  }
  return true;
}

/** Where houses may stand: off the streets, out of the plaza and hall grounds, inside the wall. */
function houseFits(h: HouseSpot, placed: HouseSpot[]): boolean {
  const cs = corners(h);
  const xs = cs.map((c) => c[0]);
  const zs = cs.map((c) => c[1]);
  // Corner and edge-midpoint radii bound the footprint's distance from the centre.
  const pts = [...cs, ...cs.map((c, i) => [(c[0] + cs[(i + 1) % 4]![0]) / 2, (c[1] + cs[(i + 1) % 4]![1]) / 2] as [number, number])];
  const radii = pts.map(([x, z]) => Math.hypot(x, z));
  const rMin = Math.min(...radii);
  const rMax = Math.max(...radii);
  if (rMin < CITY.plazaR + 3 || rMax > CITY.boundR - 1.5) return false;
  const kerb = CITY.avenueHalf + 0.4;
  const crosses = (lo: number, hi: number) => lo < kerb && hi > -kerb;
  if (crosses(Math.min(...xs), Math.max(...xs)) || crosses(Math.min(...zs), Math.max(...zs))) return false;
  if (rMax > CITY.ringRoad.inner - 0.3 && rMin < CITY.ringRoad.outer + 0.3) return false;
  if (Math.min(...xs) < 17 && Math.max(...xs) > -17 && Math.min(...zs) < CITY.hall.z + 19) return false;
  return placed.every((o) => !overlaps(o, h, 0.8));
}

function cityHouses(seed: number): HouseSpot[] {
  const r = rng(seed);
  const placed: HouseSpot[] = [];
  const width = () => (r() < 0.45 ? 4 : 6);
  // Along both sides of each avenue, fronts to the street.
  for (let ai = 0; ai < 4; ai++) {
    const a = (ai * Math.PI) / 2;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    for (const side of [-1, 1]) {
      const px = dz * side;
      const pz = -dx * side;
      let t = CITY.plazaR + 4;
      while (t < CITY.boundR) {
        const w = width();
        const off = CITY.avenueHalf + 0.6 + w / 2;
        const h = { x: dx * (t + w / 2) + px * off, z: dz * (t + w / 2) + pz * off, w, rot: Math.atan2(-px, -pz) };
        if (houseFits(h, placed)) placed.push(h);
        t += w + 1 + r() * 1.5;
      }
    }
  }
  // Rings of houses: round the plaza, both sides of the ring road and along the wall street.
  const rings: [number, 1 | -1][] = [
    [CITY.plazaR + 4, -1],
    [CITY.ringRoad.inner - 0.6, 1],
    [CITY.ringRoad.outer + 0.6, -1],
    [CITY.boundR - 8.5, -1],
  ];
  for (const [edge, face] of rings) {
    let arc = 0;
    while (arc < Math.PI * 2 * edge) {
      const w = width();
      // `edge` is the street-side face: the house centre is half a width behind it.
      const rc = edge - (face === 1 ? w / 2 : -w / 2);
      const a = (arc + w / 2) / edge;
      const h = { x: Math.sin(a) * rc, z: Math.cos(a) * rc, w, rot: face === 1 ? a : a + Math.PI };
      if (houseFits(h, placed)) placed.push(h);
      arc += w + 1 + r() * 1.5;
    }
  }
  return placed;
}

function buildTown(): MapDef {
  const props: Prop[] = [];
  const circles: CircleCollider[] = [];
  const boxes: BoxCollider[] = [];
  const platforms: Platform[] = [];
  // Teleport gate in the middle of the plaza, fountains either side, a ring of lamps.
  addGate(0, 0, props, boxes, platforms);
  for (const fx of [-11, 11]) {
    props.push({ kind: 'fountain', x: fx, z: -6, rot: 0, size: 1, seed: fx });
    circles.push({ x: fx, z: -6, r: 2.2 });
  }
  const lamp = (x: number, z: number, rot: number, seed: number) => {
    props.push({ kind: 'lamp', x, z, rot, size: 1, seed });
    circles.push({ x, z, r: 0.25 });
  };
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    lamp(Math.sin(a) * 17, Math.cos(a) * 17, a, i);
  }
  // Lamps down both kerbs of every avenue.
  for (let ai = 0; ai < 4; ai++) {
    const a = (ai * Math.PI) / 2;
    for (let t = CITY.plazaR + 6, k = 0; t < CITY.boundR - 4; t += 13, k++) {
      if (ai === 2 && t > -CITY.hall.z - 22) break; // the hall's podium
      const side = k % 2 ? 1 : -1;
      const off = CITY.avenueHalf - 0.4;
      lamp(Math.sin(a) * t + Math.cos(a) * off * side, Math.cos(a) * t - Math.sin(a) * off * side, a, 100 + ai * 20 + k);
    }
  }
  addHall(CITY.hall.z, props, circles, platforms);
  addCityWall(props);
  cityHouses(42).forEach((h, i) => {
    const storeys = i % 3 === 0 ? 3 : 2;
    props.push({ kind: 'building', x: h.x, z: h.z, rot: h.rot, size: storeys, seed: i * 7 + 3, w: h.w });
    boxes.push(boxAt(h.x, h.z, h.w + HOUSE_PAD, h.w + HOUSE_PAD, storeys * CITY.storey + 2.5, h.rot));
  });
  return {
    id: 'town',
    title: 'Town of the First Floor',
    bounds: { kind: 'circle', r: CITY.boundR },
    circles,
    boxes,
    platforms,
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
    platforms: [],
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
    platforms: [],
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
