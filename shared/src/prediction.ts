// Client-side prediction with server reconciliation. The local player moves at once on every input;
// when the server's authoritative state arrives (stamped with the last input it processed), we
// restart from it and replay the inputs the server hasn't seen yet.
import { copyMoveState, stepMovement, type MoveInput, type MoveState } from './movement';
import type { MapDef } from './maps';

export interface ServerMoveSnapshot extends MoveState {
  lastSeq: number;
}

export class PredictedMover {
  state: MoveState;
  /** State before the latest local step, for render interpolation between ticks. */
  prev: MoveState;
  private pending: MoveInput[] = [];
  private nextSeq = 1;
  /** Largest position error found at a reconcile (metres). Useful for sync checks. */
  maxCorrection = 0;
  lastCorrection = 0;

  constructor(
    private map: MapDef,
    start: MoveState,
  ) {
    this.state = copyMoveState(start);
    this.prev = copyMoveState(start);
  }

  setMap(map: MapDef, start: MoveState): void {
    this.map = map;
    this.state = copyMoveState(start);
    this.prev = copyMoveState(start);
    this.pending = [];
  }

  /** Build and apply the next input locally. Returns it so the caller can send it. */
  applyLocal(dx: number, dz: number, jump: boolean, sprint: boolean): MoveInput {
    const input: MoveInput = { seq: this.nextSeq++, dx, dz, jump, sprint };
    this.prev = copyMoveState(this.state);
    stepMovement(this.state, input, this.map);
    this.pending.push(input);
    if (this.pending.length > 120) this.pending.shift();
    return input;
  }

  /** Server state for this player arrived. */
  reconcile(server: ServerMoveSnapshot): void {
    // Drop inputs the server has processed.
    while (this.pending.length && this.pending[0]!.seq <= server.lastSeq) this.pending.shift();
    const before = this.state;
    const replay = copyMoveState(server);
    for (const input of this.pending) stepMovement(replay, input, this.map);
    const err = Math.hypot(replay.x - before.x, replay.y - before.y, replay.z - before.z);
    this.lastCorrection = err;
    if (err > this.maxCorrection) this.maxCorrection = err;
    // Shift the render-interpolation origin by the same correction so small fixes don't pop.
    this.prev.x += replay.x - before.x;
    this.prev.y += replay.y - before.y;
    this.prev.z += replay.z - before.z;
    this.state = replay;
  }

  get pendingCount(): number {
    return this.pending.length;
  }
}

/** Buffer of timestamped snapshots for drawing remote entities slightly in the past. */
export interface TimedSnapshot {
  t: number;
  x: number;
  y: number;
  z: number;
  facing: number;
  anim: number;
}

export class SnapshotBuffer {
  private snaps: TimedSnapshot[] = [];

  push(s: TimedSnapshot): void {
    const last = this.snaps[this.snaps.length - 1];
    if (last && s.t <= last.t) s.t = last.t + 0.001;
    this.snaps.push(s);
    if (this.snaps.length > 32) this.snaps.shift();
  }

  /** Interpolated snapshot at time t (ms). Holds the last value if t is past the newest. */
  sample(t: number): TimedSnapshot | null {
    const snaps = this.snaps;
    if (snaps.length === 0) return null;
    if (t <= snaps[0]!.t) return snaps[0]!;
    for (let i = snaps.length - 1; i > 0; i--) {
      const a = snaps[i - 1]!;
      const b = snaps[i]!;
      if (t >= a.t) {
        if (t >= b.t) return b;
        const k = (t - a.t) / (b.t - a.t);
        let df = b.facing - a.facing;
        while (df > Math.PI) df -= Math.PI * 2;
        while (df < -Math.PI) df += Math.PI * 2;
        return {
          t,
          x: a.x + (b.x - a.x) * k,
          y: a.y + (b.y - a.y) * k,
          z: a.z + (b.z - a.z) * k,
          facing: a.facing + df * k,
          anim: k < 0.5 ? a.anim : b.anim,
        };
      }
    }
    return snaps[snaps.length - 1]!;
  }
}
