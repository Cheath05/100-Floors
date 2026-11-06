// Joins a room and keeps the client's view of it: the predicted local player and interpolation
// buffers for everyone else.
import { Callbacks, Client, type Room } from '@colyseus/sdk';
import {
  MSG,
  PredictedMover,
  SERVER_PORT,
  SnapshotBuffer,
  getMap,
  newMoveState,
  type JoinOptions,
  type MapDef,
  type MoveInput,
  type PlayerView,
} from '@floors/shared';

export interface RemotePlayer {
  id: string;
  name: string;
  model: number;
  buffer: SnapshotBuffer;
}

export interface ConnectionEvents {
  onPlayerAdded(p: RemotePlayer, isLocal: boolean): void;
  onPlayerRemoved(id: string): void;
  onDisconnected(code: number): void;
}

export function serverEndpoint(): string {
  const url = new URL(location.href);
  const override = url.searchParams.get('server');
  if (override) return override;
  // In dev the page comes from Vite (5200) and the game server runs separately.
  if (import.meta.env.DEV) return `${location.protocol}//${location.hostname}:${SERVER_PORT}`;
  return location.origin;
}

export class Connection {
  room!: Room;
  map!: MapDef;
  mover!: PredictedMover;
  readonly players = new Map<string, RemotePlayer>();
  ping = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private events: ConnectionEvents) {}

  get sessionId(): string {
    return this.room.sessionId;
  }

  async join(roomName: string, options: JoinOptions): Promise<void> {
    const client = new Client(serverEndpoint());
    this.room = await client.joinOrCreate(roomName, options);
    await this.waitForSelf();
    const cb = Callbacks.get(this.room);
    cb.onAdd('players', (player: unknown, key: unknown) => {
      const id = String(key);
      const p = player as PlayerView;
      const remote: RemotePlayer = { id, name: p.name, model: p.model, buffer: new SnapshotBuffer() };
      this.players.set(id, remote);
      const isLocal = id === this.room.sessionId;
      const record = () => {
        if (isLocal) {
          this.mover.reconcile({ ...p });
        } else {
          remote.buffer.push({ t: performance.now(), x: p.x, y: p.y, z: p.z, facing: p.facing, anim: p.anim });
        }
      };
      record();
      cb.onChange(player as object, record);
      this.events.onPlayerAdded(remote, isLocal);
    });
    cb.onRemove('players', (_player: unknown, key: unknown) => {
      this.players.delete(String(key));
      this.events.onPlayerRemoved(String(key));
    });
    this.room.onLeave((code: number) => this.events.onDisconnected(code));
    this.pingTimer = setInterval(() => this.room.ping((ms: number) => (this.ping = ms)), 2000);
  }

  private waitForSelf(): Promise<void> {
    return new Promise((resolve) => {
      const ready = (): boolean => {
        const me = this.room.state?.players?.get(this.room.sessionId) as PlayerView | undefined;
        if (!me) return false;
        this.map = getMap(this.room.state.mapId);
        this.mover = new PredictedMover(this.map, { ...newMoveState(), ...me });
        resolve();
        return true;
      };
      if (ready()) return;
      const onChange = () => {
        if (ready()) this.room.onStateChange.remove(onChange);
      };
      this.room.onStateChange(onChange);
    });
  }

  sendInput(input: MoveInput): void {
    this.room.send(MSG.input, input);
  }

  async leave(): Promise<void> {
    if (this.pingTimer) clearInterval(this.pingTimer);
    await this.room?.leave(true);
  }
}
