# 100 Floors

An SAO-inspired co-op action RPG for the browser: climb a 100-floor tower with up to 3 friends, team
boss fights, sword skills, Switch, Last Attack Bonus. Three.js client, authoritative Colyseus server.

Design and roadmap: [docs/PLAN.md](docs/PLAN.md).

## Run it

Needs Node 22 or newer.

```bash
npm install
npm run fetch-assets   # downloads the free KayKit art packs (~47 MB)
npm run dev            # game server on :8100, client on http://localhost:5200
```

- `npm start` builds the client and serves the whole game from http://localhost:8100.
- `npm run check` runs the typecheck and tests.
- `npm run bots -- 3 20 town` adds 3 wandering bot players to a running server.

Controls: WASD move, mouse look (click the game first), Space jump, Shift sprint, wheel zoom, Esc
frees the mouse.

## Credits

Characters, weapons and dungeon pieces: KayKit packs by Kay Lousberg (www.kaylousberg.com), CC0.
