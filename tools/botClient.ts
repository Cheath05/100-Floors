// A headless player: joins a room with the real client SDK, predicts its own movement like the
// browser client does, and wanders around. Used by `npm run bots` and the sync tests.
import { Callbacks, Client, type Room } from '@colyseus/sdk';
import {
  MSG,
  PredictedMover,
  TICK_DT,
  getMap,
  newMoveState,
  type JoinOptions,
  type PlayerView,
} from '@floors/shared';

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

export interface BotOptions {
  endpoint: string;
  roomName: string;
  name: string;
  seed: number;
  /** Join a specific room id instead of joinOrCreate. */
  roomId?: string;
}

export class Bot {
  room!: Room;
  mover!: PredictedMover;
  private timer: ReturnType<typeof setInterval> | null = null;
  private rand: () => number;
  private dir = { x: 0, z: 0 };
  private sprint = false;
  private nextTurnAt = 0;
  private wandering = true;
  private lastTick = 0;
  private acc = 0;
  inputsSent = 0;
  reconciles = 0;

  constructor(private opts: BotOptions) {
    this.rand = rng(opts.seed);
  }

  async connect(): Promise<void> {
    const client = new Client(this.opts.endpoint);
    const join: JoinOptions = { name: this.opts.name };
    this.room = this.opts.roomId
      ? await client.joinById(this.opts.roomId, join)
      : await client.joinOrCreate(this.opts.roomName, join);
    await new Promise<void>((resolve) => {
      const done = (): boolean => {
        const me = this.self();
        if (!me) return false;
        const map = getMap(this.room.state.mapId);
        this.mover = new PredictedMover(map, { ...newMoveState(), ...me });
        resolve();
        return true;
      };
      if (done()) return;
      const onChange = () => {
        if (done()) this.room.onStateChange.remove(onChange);
      };
      this.room.onStateChange(onChange);
    });
    const cb = Callbacks.get(this.room);
    cb.onAdd('players', (player: unknown, key: unknown) => {
      if (key !== this.room.sessionId) return;
      cb.onChange(player as object, () => {
        const p = player as PlayerView;
        this.mover.reconcile({ ...p });
        this.reconciles++;
      });
    });
  }

  self(): PlayerView | undefined {
    return this.room.state?.players?.get(this.room.sessionId) as PlayerView | undefined;
  }

  /** Start sending one input per tick (30 Hz). */
  start(): void {
    this.lastTick = performance.now();
    this.timer = setInterval(() => this.pump(), 10);
  }

  /** Stop wandering but keep sending (idle) inputs so the server stays in step. */
  standStill(): void {
    this.wandering = false;
  }

  private pump(): void {
    const now = performance.now();
    this.acc += (now - this.lastTick) / 1000;
    this.lastTick = now;
    let steps = 0;
    while (this.acc >= TICK_DT && steps < 5) {
      this.acc -= TICK_DT;
      steps++;
      this.step(now);
    }
  }

  private step(now: number): void {
    let jump = false;
    if (this.wandering) {
      if (now >= this.nextTurnAt) {
        const a = this.rand() * Math.PI * 2;
        const stop = this.rand() < 0.15;
        this.dir = stop ? { x: 0, z: 0 } : { x: Math.sin(a), z: Math.cos(a) };
        this.sprint = this.rand() < 0.3;
        this.nextTurnAt = now + 400 + this.rand() * 1200;
      }
      jump = this.rand() < 0.02;
    } else {
      this.dir = { x: 0, z: 0 };
      this.sprint = false;
    }
    const input = this.mover.applyLocal(this.dir.x, this.dir.z, jump, this.sprint);
    this.room.send(MSG.input, input);
    this.inputsSent++;
  }

  async leave(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.room.leave(true);
  }
}

export interface SyncReport {
  bots: number;
  inputsSent: number;
  /** Largest prediction correction any bot needed (m). ~0 means prediction matches the server. */
  maxCorrection: number;
  /** After everyone stops: largest gap between a bot's own prediction and the server's state for it. */
  maxSelfError: number;
  /** After everyone stops: largest disagreement between two bots about where a player is. */
  maxViewDisagreement: number;
  ok: boolean;
}

/** Run `count` bots in one room for `seconds`, let them settle, and compare what everyone sees. */
export async function runSyncCheck(endpoint: string, roomName: string, count: number, seconds: number): Promise<SyncReport> {
  const bots: Bot[] = [];
  const first = new Bot({ endpoint, roomName, name: 'Bot1', seed: 1 });
  await first.connect();
  bots.push(first);
  for (let i = 1; i < count; i++) {
    const bot = new Bot({ endpoint, roomName, name: `Bot${i + 1}`, seed: i + 1, roomId: first.room.roomId });
    await bot.connect();
    bots.push(bot);
  }
  for (const b of bots) b.start();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  for (const b of bots) b.standStill();
  await new Promise((r) => setTimeout(r, 1500));

  let maxSelfError = 0;
  for (const b of bots) {
    const me = b.self()!;
    const s = b.mover.state;
    maxSelfError = Math.max(maxSelfError, Math.hypot(me.x - s.x, me.y - s.y, me.z - s.z));
  }
  let maxViewDisagreement = 0;
  for (const subject of bots) {
    const id = subject.room.sessionId;
    const truth = subject.mover.state;
    for (const viewer of bots) {
      const seen = viewer.room.state.players.get(id) as PlayerView | undefined;
      if (!seen) {
        maxViewDisagreement = Infinity;
        continue;
      }
      maxViewDisagreement = Math.max(maxViewDisagreement, Math.hypot(seen.x - truth.x, seen.y - truth.y, seen.z - truth.z));
    }
  }
  const report: SyncReport = {
    bots: count,
    inputsSent: bots.reduce((n, b) => n + b.inputsSent, 0),
    maxCorrection: Math.max(...bots.map((b) => b.mover.maxCorrection)),
    maxSelfError,
    maxViewDisagreement,
    ok: maxSelfError < 0.01 && maxViewDisagreement < 0.01,
  };
  await Promise.all(bots.map((b) => b.leave()));
  return report;
}
