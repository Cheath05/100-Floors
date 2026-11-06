// Base room: players walking around one map, simulated by the server at a fixed tick.
// Town, field and boss rooms extend it; combat and mobs arrive in step 2.
import { Room, type Client } from '@colyseus/core';
import {
  MSG,
  PATCH_HZ,
  STARTER_MODELS,
  TICK_HZ,
  animFor,
  cleanName,
  copyMoveState,
  getMap,
  newMoveState,
  sanitizeInput,
  stepMovement,
  type JoinOptions,
  type MapDef,
  type MoveInput,
  type MoveState,
} from '@floors/shared';
import { PlayerState, WorldState } from '../schema';

/** Server-only data kept per connected player. */
interface PlayerSim {
  move: MoveState;
  queue: MoveInput[];
  lastSeq: number;
  /** Server time (ms) of the last input received. */
  lastInputAt: number;
}

/** Inputs applied per player per tick when catching up after jitter. */
const MAX_INPUTS_PER_TICK = 4;
/** Queued inputs beyond this are dropped (oldest first). */
const MAX_QUEUE = 20;
/** With no input for this long, the player keeps falling/stopping on its own. */
const IDLE_AFTER_MS = 300;
const IDLE_INPUT = { dx: 0, dz: 0, jump: false, sprint: false };

export abstract class WorldRoom extends Room<{ state: WorldState }> {
  protected map!: MapDef;
  protected sims = new Map<string, PlayerSim>();
  private joinCount = 0;
  protected abstract mapId: string;

  override maxClients = 16;

  override onCreate(): void {
    this.map = getMap(this.mapId);
    const state = new WorldState();
    state.mapId = this.map.id;
    this.state = state;
    this.patchRate = 1000 / PATCH_HZ;
    this.onMessage(MSG.input, (client: Client, raw: unknown) => this.queueInput(client, raw));
    // Fixed 1/30 s steps from an accumulator, so the simulation never sees a jittery delta.
    this.setFixedTimestep(() => this.tick(), TICK_HZ);
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    const n = this.joinCount++;
    // Spread arrivals around the spawn point so nobody lands inside anyone else.
    const a = n * 2.399963;
    const r = n === 0 ? 0 : 1.2 + 0.5 * Math.sqrt(n);
    const spawn = this.map.spawn;
    const move = newMoveState(spawn.x + Math.sin(a) * r, spawn.z + Math.cos(a) * r, spawn.facing);
    const p = new PlayerState();
    p.name = cleanName(options?.name, `Player${n + 1}`);
    const model = Number(options?.model);
    p.model = Number.isInteger(model) && model >= 0 && model < STARTER_MODELS.length ? model : n % STARTER_MODELS.length;
    this.sims.set(client.sessionId, { move, queue: [], lastSeq: 0, lastInputAt: this.clock.currentTime });
    this.writePlayer(p, move, 0);
    this.state.players.set(client.sessionId, p);
  }

  override onLeave(client: Client): void {
    this.sims.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  private queueInput(client: Client, raw: unknown): void {
    const sim = this.sims.get(client.sessionId);
    const input = sanitizeInput(raw);
    if (!sim || !input || input.seq <= sim.lastSeq) return;
    const lastQueued = sim.queue[sim.queue.length - 1];
    if (lastQueued && input.seq <= lastQueued.seq) return;
    sim.queue.push(input);
    if (sim.queue.length > MAX_QUEUE) sim.queue.splice(0, sim.queue.length - MAX_QUEUE);
    sim.lastInputAt = this.clock.currentTime;
  }

  protected tick(): void {
    const now = this.clock.currentTime;
    for (const [id, sim] of this.sims) {
      let applied = 0;
      while (sim.queue.length && applied < MAX_INPUTS_PER_TICK) {
        const input = sim.queue.shift()!;
        stepMovement(sim.move, input, this.map);
        sim.lastSeq = input.seq;
        applied++;
      }
      if (applied === 0 && now - sim.lastInputAt > IDLE_AFTER_MS) {
        stepMovement(sim.move, { seq: sim.lastSeq, ...IDLE_INPUT }, this.map);
      }
      const p = this.state.players.get(id);
      if (p) this.writePlayer(p, sim.move, sim.lastSeq);
    }
  }

  private writePlayer(p: PlayerState, m: MoveState, lastSeq: number): void {
    p.x = m.x;
    p.y = m.y;
    p.z = m.z;
    p.vx = m.vx;
    p.vy = m.vy;
    p.vz = m.vz;
    p.grounded = m.grounded;
    p.facing = m.facing;
    p.anim = animFor(m);
    p.lastSeq = lastSeq;
  }

  /** Test helper: the server's own copy of a player's movement state. */
  debugMove(sessionId: string): MoveState | null {
    const sim = this.sims.get(sessionId);
    return sim ? copyMoveState(sim.move) : null;
  }
}
