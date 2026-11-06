// Synced room state. Clients decode it through Colyseus' reflection, so they don't import this file.
import { schema, t, type SchemaType } from '@colyseus/schema';

export const PlayerState = schema(
  {
    name: t.string(),
    model: t.uint8(),
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    vx: t.float32(),
    vy: t.float32(),
    vz: t.float32(),
    grounded: t.boolean(),
    facing: t.float32(),
    anim: t.uint8(),
    /** Last input sequence number the server applied for this player. */
    lastSeq: t.uint32(),
  },
  'PlayerState',
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const WorldState = schema(
  {
    mapId: t.string(),
    players: t.map(PlayerState),
  },
  'WorldState',
);
export type WorldState = SchemaType<typeof WorldState>;
