// Shapes of what travels between client and server, besides the synced state.

/** Options a client sends when joining a room. */
export interface JoinOptions {
  name?: string;
  /** Index into the character model list (temporary until the character creator, step 3). */
  model?: number;
}

/** Character models available before the creator exists. */
/** Starting looks: a VRM avatar plus an outfit (client/src/render/characters.ts maps them). */
export const STARTER_MODELS = ['Vanguard', 'Duelist', 'Wanderer', 'Fencer'] as const;

/** Plain view of a synced player, for code that reads state without the schema classes. */
export interface PlayerView {
  name: string;
  model: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  facing: number;
  anim: number;
  lastSeq: number;
}

export function cleanName(raw: unknown, fallback: string): string {
  const s = typeof raw === 'string' ? raw.replace(/[^\p{L}\p{N} _\-]/gu, '').trim().slice(0, 16) : '';
  return s || fallback;
}
