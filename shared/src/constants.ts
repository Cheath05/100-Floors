/** Server simulation rate. Clients send one input per tick at the same rate. */
export const TICK_HZ = 30;
export const TICK_DT = 1 / TICK_HZ;
/** How often the server sends state patches. */
export const PATCH_HZ = 20;
/** Remote entities are drawn this far in the past so there are always two snapshots to blend. */
export const INTERP_DELAY_MS = 100;

/** Ports for this project (War game uses 5190/8090, Soccer-Game 5173/8000/8765). */
export const SERVER_PORT = 8100;
export const CLIENT_DEV_PORT = 5200;

export const MAX_PARTY_HUMANS = 4;

/** Room names registered on the server. */
export const ROOM = {
  town: 'town',
  field: 'field',
  boss: 'boss',
} as const;
export type RoomName = (typeof ROOM)[keyof typeof ROOM];

/** Client -> server message types. */
export const MSG = {
  input: 'input',
} as const;
