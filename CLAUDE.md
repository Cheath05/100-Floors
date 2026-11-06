# 100 Floors

An SAO-inspired co-op action RPG in the browser for the user and 3 friends: a 100-floor tower climb with
team boss fights. Three.js client, authoritative Colyseus server, TypeScript everywhere.

## Where things are

- **Plan:** `docs/PLAN.md` is the approved design (Decisions table = the user's answers; "Wiki pass"
  = lore checks). Milestone 1 build order is at the bottom of it.
- **Repo:** github.com/Cheath05/100-Floors. Work happens on branch `claude/admiring-allen-o82s38`;
  commit and push after each M1 step, no PR unless asked. Stop after each step to show progress.
- **Workspaces** (npm, imported as TypeScript source):
  - `shared/`: pure rules and data used by both sides: movement, prediction, maps, protocol.
    No DOM, no Node APIs, no randomness outside seeded generators.
  - `server/`: Colyseus 0.18 rooms (`TownRoom`, `FieldRoom`, `BossRoom` on a shared `WorldRoom`),
    fixed 30 Hz tick, 20 Hz patches. `startServer()` in `src/index.ts`; `src/main.ts` runs it.
  - `client/`: Vite + Three.js. `render/` (toon materials, outlines, bloom, world, characters,
    camera), `net/` (join, prediction, interpolation), `input/`, `ui/`.
  - `tools/`: asset fetcher, bot clients (`botClient.ts`), dev launcher.
  - `tests/`: Vitest (movement, prediction, 4 real clients against an in-process server).

## Commands

- `npm run dev`: server on :8100 + client on http://localhost:5200.
- `npm run fetch-assets`: downloads the CC0 KayKit packs (pinned commits) into
  `client/public/assets/kaykit/` (gitignored, ~47 MB).
- `npm test`, `npm run typecheck`, `npm run check` (both).
- `npm run bots -- [count] [seconds] [room]`: headless players against a running server; prints
  whether every client agrees on positions.
- `npm start`: builds the client and serves everything from the game server on :8100.
- URL options: `?name=X&room=field&auto` skips the start panel; `?server=http://host:port`.

## Rules that must hold

- **Same movement on both sides.** `shared/src/movement.ts` is run by the server and replayed by
  client prediction; keep it a pure function of (state, input, map) with a fixed dt.
- **Server is authoritative.** Clients only send inputs (`MSG.input`); never trust client positions.
- **Originality:** mechanics follow SAO, but no SAO/Aincrad/character/boss names in code, data or UI
  (SAO's generic terms like Col, Sword Skill, Switch are fine; all UI text should end up in one
  strings file).
- **Ports:** this game uses 5200 and 8100 (server env var `GAME_PORT`, not `PORT`). War game uses
  5190/8090, Soccer-Game 5173/8000/8765; never touch those projects.
- **This Mac has 8 GB of RAM:** run heavy checks one at a time; Vitest uses at most 2 workers.
- Colyseus 0.18 APIs differ from older docs: `this.state = ...`, `this.patchRate = ...`,
  `setFixedTimestep()`, schemas via `schema({...}, 'Name')` with `t.*` builders, client
  `Callbacks.get(room)`, `room.onStateChange(cb)` / `.remove(cb)`.
