import { describe, expect, it } from 'vitest';
import {
  Anim,
  MOVE,
  PredictedMover,
  animFor,
  copyMoveState,
  getMap,
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

  it('cannot leave the map or walk through the gate pillars', () => {
    const out = resolveCollisions(town, 100, 0, MOVE.radius);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(40 - MOVE.radius, 5);
    const pillar = town.circles[0]!;
    const pushed = resolveCollisions(town, pillar.x + 0.1, pillar.z, MOVE.radius);
    expect(Math.hypot(pushed.x - pillar.x, pushed.z - pillar.z)).toBeGreaterThanOrEqual(pillar.r + MOVE.radius - 1e-9);
  });

  it('cannot walk into buildings', () => {
    const b = town.boxes[0]!;
    const s = newMoveState((b.minX + b.maxX) / 2, b.maxZ + 3);
    for (let i = 0; i < 90; i++) stepMovement(s, input(i, 0, -1), town);
    expect(s.z).toBeGreaterThanOrEqual(b.maxZ + MOVE.radius - 1e-6);
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
