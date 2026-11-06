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
  - `client/`: Vite + Three.js. `render/` (scene/lighting/post, world builder, asset loaders,
    gate, Blender props, grass, dressing, characters, camera), `net/` (join, prediction,
    interpolation), `input/`, `ui/`.
  - `tools/`: asset fetcher, bot clients (`botClient.ts`), dev launcher.
  - `tests/`: Vitest (movement, prediction, 4 real clients against an in-process server).

## Commands

- `npm run dev`: server on :8100 + client on http://localhost:5200.
- `npm run fetch-assets`: downloads the CC0 KayKit packs (pinned commits) into
  `client/public/assets/kaykit/` (gitignored, ~47 MB).
- `npm run fetch-lookdev-assets`: downloads the world and look-test art (VRM characters, Quaternius
  animations + village kit, Poly Haven textures/models/sky; ~160 MB, gitignored, hashes pinned).
  The game's world needs it too now.
- `npm test`, `npm run typecheck`, `npm run check` (both).
- `npm run bots -- [count] [seconds] [room]`: headless players against a running server; prints
  whether every client agrees on positions.
- `npm start`: builds the client and serves everything from the game server on :8100.
- URL options: `?name=X&room=field&auto` skips the start panel; `?server=http://host:port`;
  `?ao=0` turns ambient occlusion off. In dev, `window.__game` holds `{ kit, cam, conn }`.

## Art style

- The game world uses the look-test style: PBR materials, HDRI sky, neutral tone mapping, AO,
  bloom and a light grade (`render/scene.ts`); `render/world.ts` builds each map from its
  `MapDef` with our Blender models (gate, lamp, fountain, boss pillar), village-kit houses,
  ez-tree trees, Poly Haven rocks/plants and instanced grass. Repeated models (houses, wall,
  towers, lamps) are drawn with `render/instancing.ts`. Players are VRM anime avatars
  (`render/characters.ts`: VRoid samples + our outfits from `outfits.ts`, katana, UAL animations
  retargeted by `retarget.ts`); the four starting looks are `STARTER_MODELS`.
- The town is an original walled starting city (`CITY` in `shared/src/maps.ts`): central gate
  plaza, four avenues to gatehouses, a ring road, ~170 houses facing their streets, and the Hall of
  Remembrance (the memorial) behind the gate. SAO-inspired in scale and feel only: never copy the
  anime/games' actual town layout, buildings or names.
- http://localhost:5200/lookdev.html (`client/src/lookdev/`) is the style test bed: VRM anime
  characters (`@pixiv/three-vrm`, MToon) with Quaternius animations retargeted in `retarget.ts`,
  original outfits/armor in `outfits.ts`, street dressing from `render/dressing.ts`.
  URL options: `?view=gate`, `?tm=agx|aces`, `?ao=0`, `?grass=N`, `?ceiling=1`, `?clips=A,B,C`.
- Blender 5.2 with the official Blender Lab MCP (`blender` server, Blender add-on on localhost:9876)
  and the VRM add-on is installed. Use it to model props/armor. Our models are built by scripts:
  `art/blender_kit.py` (shared materials + bmesh helpers), `art/gate/build_gate.py` (teleport gate)
  `art/props/build_props.py` (lamp, fountain, boss pillar) and `art/city/build_city.py` (wall,
  tower, gatehouse, Hall of Remembrance). Each saves its .blend next to it
  and exports a GLB to `client/public/models/`; textures are in `art/textures` (1k colour, 512
  normal). Keep GLBs under 2 MB. `client/public/assets/` is only for downloaded packs (gitignored).
- Material names are a contract with the client: `Glow*` become unlit glows, `Water` gets the
  animated water shader; empties (`Gate_Orb`, `Gate_Runes`, `Lamp_Light`, `Pillar_Flame`) mark
  where code adds effects.
- Map colliders in `shared/src/maps.ts` must match the models: houses are 4 or 6 m square
  (rotated boxes), the gate dais is three 0.32 m `platforms` you walk up (`MOVE.stepUp`).
- Characters still need proper avatars (VRoid Studio); code-built armor is a stopgap.

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
