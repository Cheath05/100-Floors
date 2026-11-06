import { describe, expect, it } from 'vitest';
import {
  Anim,
  MOVE,
  PredictedMover,
  animFor,
  copyMoveState,
  CITY,
  getMap,
  groundHeight,
  newMoveState,
  resolveCollisions,
  sanitizeInput,
  stepMovement,
  type MoveInput,
} from '@floors/shared';

const field = getMap('field');
const town = getMap('town');

function input(seq: number, dx: number, dz: number, jump = false, sprint = false): MoveInput {
  return { seq, dx, dz, jump, sprint };
}

describe('movement', () => {
  it('reaches run speed and sprint speed', () => {
    const s = newMoveState(0, 0);
    for (let i = 0; i < 30; i++) stepMovement(s, input(i, 0, 1), field);
    expect(Math.hypot(s.vx, s.vz)).toBeCloseTo(MOVE.runSpeed, 3);
    for (let i = 0; i < 30; i++) stepMovement(s, input(i, 0, 1, false, true), field);
    expect(Math.hypot(s.vx, s.vz)).toBeCloseTo(MOVE.sprintSpeed, 3);
    expect(animFor(s)).toBe(Anim.Sprint);
  });

  it('jumps and lands', () => {
    const s = newMoveState(0, 0);
    stepMovement(s, input(1, 0, 0, true), field);
    expect(s.grounded).toBe(false);
    let peak = 0;
    for (let i = 0; i < 60 && !s.grounded; i++) {
      stepMovement(s, input(i, 0, 0), field);
      peak = Math.max(peak, s.y);
    }
    expect(s.grounded).toBe(true);
    expect(s.y).toBe(0);
    expect(peak).toBeGreaterThan(1.2);
  });

  it('turns toward the movement direction', () => {
    const s = newMoveState(0, 0, 0);
    for (let i = 0; i < 30; i++) stepMovement(s, input(i, 1, 0), field);
    expect(s.facing).toBeCloseTo(Math.PI / 2, 3);
  });

  it('cannot leave the map or walk through a fountain', () => {
    const out = resolveCollisions(town, 100, 0, MOVE.radius);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(CITY.boundR - MOVE.radius, 5);
    const fountain = town.circles[0]!;
    const pushed = resolveCollisions(town, fountain.x + 0.1, fountain.z, MOVE.radius);
    expect(Math.hypot(pushed.x - fountain.x, pushed.z - fountain.z)).toBeGreaterThanOrEqual(fountain.r + MOVE.radius - 1e-9);
  });

  it('cannot walk into the gate obelisks', () => {
    // The front-right obelisk footing; walk at it from the plaza in front.
    const b = town.boxes.find((x) => x.minX > 0 && x.minZ > 0 && !x.rot)!;
    const s = newMoveState((b.minX + b.maxX) / 2, b.maxZ + 3);
    for (let i = 0; i < 90; i++) stepMovement(s, input(i, 0, -1), town);
    expect(s.z).toBeGreaterThanOrEqual(b.maxZ + MOVE.radius - 1e-6);
  });

  it('cannot walk into rotated buildings', () => {
    // The house nearest the plaza that is turned well off the axes; nothing stands in front of it.
    const dist = (x: (typeof town.boxes)[number]) => Math.hypot((x.minX + x.maxX) / 2, (x.minZ + x.maxZ) / 2);
    const b = town.boxes.filter((x) => x.rot && Math.abs(Math.sin(2 * x.rot)) > 0.5).sort((p, q) => dist(p) - dist(q))[0]!;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const half = (b.maxX - b.minX) / 2;
    // Walk from the plaza straight at the house centre.
    const d = Math.hypot(cx, cz);
    const s = newMoveState((cx / d) * (d - half - 4), (cz / d) * (d - half - 4));
    for (let i = 0; i < 120; i++) stepMovement(s, input(i, cx / d, cz / d), town);
    // The house front is square to the plaza, so we stop one radius short of it.
    expect(Math.hypot(s.x - cx, s.z - cz)).toBeCloseTo(half + MOVE.radius, 2);
  });

  it('walks up the gate steps and back down', () => {
    expect(groundHeight(town, 0, 0)).toBeCloseTo(0.96, 9);
    const s = newMoveState(0, 8);
    for (let i = 0; i < 90; i++) stepMovement(s, input(i, 0, -1), town);
    // Up three 0.32 m steps onto the deck, stopped by the back wall.
    expect(s.grounded).toBe(true);
    expect(s.y).toBeCloseTo(0.96, 9);
    expect(s.z).toBeLessThan(-1.5);
    for (let i = 0; i < 90; i++) stepMovement(s, input(i, 1, 0), town);
    expect(s.y).toBe(0);
    expect(s.grounded).toBe(true);
  });

  it('cannot walk up a ledge taller than a step', () => {
    const map = { ...field, platforms: [{ minX: -2, maxX: 2, minZ: -2, maxZ: 2, top: 1 }] };
    const s = newMoveState(0, 5);
    for (let i = 0; i < 60; i++) stepMovement(s, input(i, 0, -1), map);
    expect(s.z).toBeGreaterThan(2);
    expect(s.y).toBe(0);
    // ...but can jump onto it.
    stepMovement(s, input(60, 0, -1, true), map);
    for (let i = 0; i < 60 && !s.grounded; i++) stepMovement(s, input(61 + i, 0, -1), map);
    expect(s.grounded).toBe(true);
    expect(s.y).toBe(1);
  });

  it('is deterministic', () => {
    const a = newMoveState(1, 2);
    const b = copyMoveState(a);
    const inputs = Array.from({ length: 200 }, (_, i) => input(i, Math.sin(i * 0.3), Math.cos(i * 0.17), i % 37 === 0, i % 5 === 0));
    for (const i of inputs) stepMovement(a, i, field);
    for (const i of inputs) stepMovement(b, i, field);
    expect(a).toEqual(b);
  });

  it('sanitizes inputs', () => {
    expect(sanitizeInput(null)).toBeNull();
    expect(sanitizeInput({ seq: 'x', dx: 0, dz: 0 })).toBeNull();
    const big = sanitizeInput({ seq: 3, dx: 30, dz: 40, jump: 'yes' })!;
    expect(Math.hypot(big.dx, big.dz)).toBeCloseTo(1, 9);
    expect(big.jump).toBe(false);
  });
});

describe('prediction', () => {
  it('replays unacknowledged inputs on top of the server state', () => {
    const mover = new PredictedMover(field, newMoveState());
    const server = newMoveState();
    for (let i = 0; i < 10; i++) mover.applyLocal(0, 1, false, false);
    // The server has applied the first 6.
    for (let i = 1; i <= 6; i++) stepMovement(server, input(i, 0, 1), field);
    const predicted = copyMoveState(mover.state);
    mover.reconcile({ ...server, lastSeq: 6 });
    expect(mover.pendingCount).toBe(4);
    expect(mover.state.z).toBeCloseTo(predicted.z, 9);
    expect(mover.lastCorrection).toBeLessThan(1e-9);
  });

  it('corrects when the server disagrees', () => {
    const mover = new PredictedMover(field, newMoveState());
    for (let i = 0; i < 5; i++) mover.applyLocal(1, 0, false, false);
    mover.reconcile({ ...newMoveState(0, 5), lastSeq: 5 });
    expect(mover.state.z).toBe(5);
    expect(mover.lastCorrection).toBeGreaterThan(4);
  });
});
