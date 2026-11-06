// Character movement shared by the server (authoritative) and the client (prediction). It must give
// the same answer on both sides for the same inputs, so it is a pure function of (state, input, map)
// with a fixed time step and no randomness.
import { TICK_DT } from './constants';
import type { MapDef } from './maps';

export const MOVE = {
  radius: 0.4,
  runSpeed: 5.5,
  sprintSpeed: 8.5,
  /** Below this ground speed the walk animation plays instead of the run. */
  walkAnimSpeed: 3.2,
  groundAccel: 45,
  groundDecel: 30,
  airAccel: 10,
  gravity: 24,
  jumpSpeed: 8.2,
  /** Radians per second the character turns toward its movement direction. */
  turnRate: 14,
} as const;

export interface MoveState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  /** Facing angle: direction (sin f, cos f) on the XZ plane. */
  facing: number;
}

/** One tick of player input. dx/dz is the wished world-space direction, length <= 1. */
export interface MoveInput {
  seq: number;
  dx: number;
  dz: number;
  jump: boolean;
  sprint: boolean;
}

export const Anim = {
  Idle: 0,
  Walk: 1,
  Run: 2,
  Sprint: 3,
  Air: 4,
} as const;
export type Anim = (typeof Anim)[keyof typeof Anim];

export function newMoveState(x = 0, z = 0, facing = 0): MoveState {
  return { x, y: 0, z, vx: 0, vy: 0, vz: 0, grounded: true, facing };
}

export function copyMoveState(s: MoveState): MoveState {
  return { x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, grounded: s.grounded, facing: s.facing };
}

/** Clamp an untrusted input to valid ranges (server side). */
export function sanitizeInput(raw: unknown): MoveInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const seq = Number(r.seq);
  let dx = Number(r.dx);
  let dz = Number(r.dz);
  if (!Number.isFinite(seq) || !Number.isFinite(dx) || !Number.isFinite(dz)) return null;
  const len = Math.hypot(dx, dz);
  if (len > 1) {
    dx /= len;
    dz /= len;
  }
  return { seq: Math.floor(seq), dx, dz, jump: r.jump === true, sprint: r.sprint === true };
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function approach(v: number, target: number, maxStep: number): number {
  if (v < target) return Math.min(v + maxStep, target);
  return Math.max(v - maxStep, target);
}

/** Push a circle at (x, z) out of the map's colliders and bounds. Returns the corrected position. */
export function resolveCollisions(map: MapDef, x: number, z: number, radius: number): { x: number; z: number } {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of map.circles) {
      const ox = x - c.x;
      const oz = z - c.z;
      const min = c.r + radius;
      const d2 = ox * ox + oz * oz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2);
        if (d < 1e-6) {
          x = c.x + min;
        } else {
          x = c.x + (ox / d) * min;
          z = c.z + (oz / d) * min;
        }
      }
    }
    for (const b of map.boxes) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const ox = x - cx;
      const oz = z - cz;
      const d2 = ox * ox + oz * oz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        x = cx + (ox / d) * radius;
        z = cz + (oz / d) * radius;
      } else {
        // Centre inside the box: leave by the nearest side.
        const left = x - b.minX;
        const right = b.maxX - x;
        const back = z - b.minZ;
        const front = b.maxZ - z;
        const m = Math.min(left, right, back, front);
        if (m === left) x = b.minX - radius;
        else if (m === right) x = b.maxX + radius;
        else if (m === back) z = b.minZ - radius;
        else z = b.maxZ + radius;
      }
    }
  }
  const bounds = map.bounds;
  if (bounds.kind === 'circle') {
    const max = bounds.r - radius;
    const d = Math.hypot(x, z);
    if (d > max) {
      x = (x / d) * max;
      z = (z / d) * max;
    }
  } else {
    x = Math.max(-bounds.halfX + radius, Math.min(bounds.halfX - radius, x));
    z = Math.max(-bounds.halfZ + radius, Math.min(bounds.halfZ - radius, z));
  }
  return { x, z };
}

/** Advance one fixed tick. Mutates and returns `s`. */
export function stepMovement(s: MoveState, input: MoveInput, map: MapDef, dt: number = TICK_DT): MoveState {
  const len = Math.hypot(input.dx, input.dz);
  const dirX = len > 1e-4 ? input.dx / Math.max(len, 1) : 0;
  const dirZ = len > 1e-4 ? input.dz / Math.max(len, 1) : 0;
  const speed = input.sprint ? MOVE.sprintSpeed : MOVE.runSpeed;
  const targetVx = dirX * speed;
  const targetVz = dirZ * speed;

  if (s.grounded) {
    const accel = len > 1e-4 ? MOVE.groundAccel : MOVE.groundDecel;
    s.vx = approach(s.vx, targetVx, accel * dt);
    s.vz = approach(s.vz, targetVz, accel * dt);
    if (input.jump) {
      s.vy = MOVE.jumpSpeed;
      s.grounded = false;
    }
  } else {
    s.vx = approach(s.vx, targetVx, MOVE.airAccel * dt);
    s.vz = approach(s.vz, targetVz, MOVE.airAccel * dt);
  }

  if (!s.grounded) {
    s.vy -= MOVE.gravity * dt;
    s.y += s.vy * dt;
    if (s.y <= 0) {
      s.y = 0;
      s.vy = 0;
      s.grounded = true;
    }
  }

  const moved = resolveCollisions(map, s.x + s.vx * dt, s.z + s.vz * dt, MOVE.radius);
  // Lose the velocity that went into walls, so sliding along them feels right.
  if (dt > 0) {
    s.vx = (moved.x - s.x) / dt;
    s.vz = (moved.z - s.z) / dt;
  }
  s.x = moved.x;
  s.z = moved.z;

  if (len > 1e-4) {
    const want = Math.atan2(dirX, dirZ);
    const diff = wrapAngle(want - s.facing);
    const maxTurn = MOVE.turnRate * dt;
    s.facing = wrapAngle(s.facing + Math.max(-maxTurn, Math.min(maxTurn, diff)));
  }
  return s;
}

export function animFor(s: MoveState): Anim {
  if (!s.grounded) return Anim.Air;
  const speed = Math.hypot(s.vx, s.vz);
  if (speed < 0.3) return Anim.Idle;
  if (speed < MOVE.walkAnimSpeed) return Anim.Walk;
  if (speed > MOVE.runSpeed + 0.5) return Anim.Sprint;
  return Anim.Run;
}
