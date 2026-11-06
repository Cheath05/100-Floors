# 100 Floors — SAO-inspired co-op action RPG (web) — Plan

## Context
The user wants a game heavily inspired by Sword Art Online for themselves + 3 friends, maybe public later:
a 100-floor tower climb with team-focused boss fights, sword skills, Extra/Unique skills, a Last Attack
Bonus, SAO-style HP/level/menu UI, crystals, and lots of gear. They will give ideas and playtest; Claude
writes all code, data and content. Repo `cheath05/100-floors` is empty (README only). Work goes on branch
`claude/admiring-allen-o82s38`. This plan fixes the whole design and details Milestone 1 (Floor 1
playable end to end). Floors 2-100 then come through the same data pipeline. The plan is saved
in the repo as `docs/PLAN.md` so a local Claude Code session can pick it up.

## Decisions (from Q&A)
| Area | Decision |
|---|---|
| Platform | Web: TypeScript, Three.js client, Node + Colyseus authoritative server |
| Devices / camera | Windows + Mac browsers, keyboard + mouse (gamepad later); third-person camera |
| Death | Per character: Hardcore (10 s revive window, then permanent, name struck on memorial) or Normal (respawn at inn, lose some XP/Col) |
| Sword skills | Hotkeys; system-assist auto-motion with colored light trail; post-motion delay scales with skill tier |
| Builds | SAO skill slots, no classes; proficiency 0-1000; STR/AGI points |
| Range | Melee + throwing picks only. No magic, no bows |
| Team play | Switch & guard break, telegraphs & phases, skill chains. No taunt tanking |
| Party | 1-4 humans + AI companions up to 6 (Attack / Defend / Switch / Heal commands) |
| Last Attack Bonus | First world kill drops a one-of-a-kind LAB item and opens the floor; later "echo" re-fights give normal loot + a lesser LAB |
| Unique skills | One holder per world, max one per player. Extra skills open to everyone |
| Art | Anime cel-shaded: toon ramp, ink outlines, bloom on skills, polygon-shatter death |
| Floors | Data-driven definitions + biome kits + fixed seeds + hand-placed landmarks |
| Early systems | Smithing & enhancement, durability & repair, trading & player stalls; PvP = duels only |
| Story / length | Original "trapped in the game" premise + antagonist, twist on F100; ~50-80 h full clear |
| Characters | Anime creator (hair, colors, face, body, outfit); gear visible and dyeable |
| Hosting | Like the user's War game: one command starts server + Cloudflare quick tunnel and prints a link. Long-term on their Proxmox Ubuntu VM (a stable address needs a domain on Cloudflare) |
| M1 weapons | 1H sword + shield, rapier, dagger, 2H sword, 2H axe, spear, mace |

## Originality rules
- Mechanics follow SAO closely; names, characters, bosses, story and UI art are our own.
- No SAO / Aincrad / character / boss names anywhere in code, data or UI. Canon bosses are archetype
  inspiration only (see Content). Working title "100 Floors"; world name chosen with the user in M2.

## Architecture (npm workspaces monorepo)
```
shared/   pure TS rules + data used by both sides (unit-tested)
  data/        weapons, swordSkills, skills (support/extra/unique), items, mobs,
               bosses/f001.ts..., floors.ts (all 100 entries), mechanics registry
  combat/      damage, hit arcs/capsules, parry, switch, chain, stagger, status effects
  progression/ XP curve, skill slots, proficiency + mods, enhancement, durability
  protocol.ts, schema/ (Colyseus state), rng.ts (seeded)
server/   Node 22 + Colyseus; 30 Hz sim, 20 Hz patches; serves the built client (one port)
  rooms/       TownRoom (safe zone, shops, trade, duels), FieldRoom (field + labyrinth),
               BossRoom (instanced raid)
  sim/         movement (Rapier), combat, mob AI, boss brain (phase machine + mechanic
               scheduler), companion AI (same input API as players)
  persistence/ SQLite via built-in node:sqlite: accounts, characters, inventory,
               world_state, unique_holders, memorial, market
client/   Vite + Three.js
  net/         Colyseus SDK, local prediction + reconciliation, 100 ms interpolation
  render/      toon materials, inverted-hull outlines, bloom, sky showing the floor above,
               characters (KayKit rig + procedural anime hair/face/gear), creatures
               (procedural kit), weapons (procedural), vfx
  ui/          HTML/CSS HUD, menus, character creator;  input/;  audio/ (jsfxr SFX)
tools/    fetch-assets (KayKit CC0 packs from GitHub), floor-validate, balance-sim
          (headless bot raids), floor-bible (writes docs/floors.md)
tests/    Vitest (shared + server sim), Playwright e2e (4 browser clients)
deploy/   Dockerfile, docker-compose.yml, host.sh (quick tunnel), vm-setup.sh, HOSTING.md
```
npm libs: three, colyseus (server + SDK), @dimforge/rapier3d-compat, recast-navigation, jsfxr,
@fontsource angular UI font, vitest, Playwright (`npx playwright install chromium` where needed).

## Game systems (SAO lore -> our implementation)
### Combat
- Controls: WASD, mouse camera, Space jump, Shift sprint, C dodge (2 charges), LMB basic combo,
  RMB guard / timed parry, 1-6 sword skills, Q Switch, Z throwing pick, 7-9 crystals,
  V companion commands, F interact, Tab menu.
- Sword skills are data: strikes (blade arc, plane, lunge, timing), damage, hits, light color,
  post-motion delay. A short pre-motion glow, then system assist locks movement and performs the
  motion; the server resolves hits on the same arcs. 4-5 skills per weapon type in M1, unlocked at
  proficiency milestones.
- Guard / parry: hold to block (shields far stronger); tap within ~150 ms of impact = parry.
  Blue-glowing boss attacks are breakable: a parry = Guard Break, the boss staggers and a Switch
  window opens. Red-glowing attacks must be dodged.
- Switch: teammates get a "SWITCH!" prompt; whoever steps in (Q or a sword skill) gets bonus
  damage/stagger and the parrier's delay is cancelled as they back out. Q also calls a manual swap.
- Skill chains: sword skills from different members landing within ~1.5 s build CHAIN xN
  (damage + stagger multiplier). Full stagger meter = boss DOWN, a group burst window. Self-chaining
  ("skill connect") only through a late mod or unique skill.
- Bosses pick targets by pattern (nearest, farthest, top recent damage, marked player with an
  overhead marker), so everyone parries and dodges.
- Telegraphs: filling ground decals (circle/cone/line/donut), stack/spread markers, adds, a phase
  change at each HP bar, enrage on the last bar.
- Status effects: poison, paralysis, bleed, stun, slow, armor break.
- Durability: weapons wear on hits/blocks, armor on hits taken; at 0 the item is Broken
  (no sword skills, big penalty) until repaired.

### Character & progression
- STR (damage, carry, equip requirements, guard) and AGI (speed, dodge recovery, crit); 3 points per
  level; HP from level + gear. Safety-margin rule: aim for level about floor + 10.
- Skill slots: 2 at start, +1 at LV 6, 12, 20, then every 10 levels (lore). Proficiency 0-1000
  ("Completed") through use. Weapon skills grant a Mod pick every 50 proficiency (delay down, crit
  up, chain window up...). Unslotting a skill resets it unless stored with a rare Skill Record crystal.
- Support skills: Parry, Battle Healing, Sprint, Acrobatics, Search, Hiding, Throwing, Appraisal,
  Smithing, Meditation.
- Extra skills (M2+, anyone): hidden quests/conditions, e.g. a boulder-breaking fist quest, Katana
  from curved-sword mastery.
- Unique skills (M2+, 10 total): gate = Meditation >= 500 (wiki lore) + a secret condition
  (reaction-speed record, hidden quest, or a tiny luck roll). Draft: Twin Fang (dual wield, fastest
  reactions), Bastion Blade (sword + shield aegis), Phantom Edge (dagger blink), Moonlit Iaido (katana
  counters), Endless Lance (spear chains), Titan Grip (two-handers in one hand), Thousandfold Throw,
  Mirror Guard (reflect on perfect parry), Forgeheart (crafting), Starfall Thrust (rapier meteor dash).

### Items, gear, economy
- Slots: main hand, off hand (shield), head, body, legs, hands, feet, 2 rings, necklace. All visible
  on the avatar and dyeable. Rarity Common to Legendary, plus LAB Unique (one of a kind).
- Crystals: glowing faceted gems; raise one and say/press its command; it shatters into light.
  Healing (full heal, pink), Antidote (green), Teleport (to an unlocked town's gate plaza, blue),
  Corridor (rare; mark a spot, opens a party portal, violet), Revival (very rare; only inside the
  10 s window, prismatic). Potions are cheap and heal over time. Anti-crystal zones: traps, and every
  boss room from F74 on (lore).
- Smithing & enhancement: forge from ingots + monster materials; enhance Sharpness (Toughness for
  blunt), Quickness, Accuracy, Heaviness (boosts guard break / armor break vs bosses), Durability.
  Each weapon has limited attempts and failures use them up. Names like "+6 (3S3D)"; the breakdown is
  hidden until Appraised (lore).
- Repair at an NPC or player smith. Trade window with two-step confirm. Player stalls as a town
  consignment board. Currency: Col.

### World & social
- Floor = main town (Teleport Gate in the central plaza, inn, shops, smith, info broker, memorial,
  stall board) + fields + dungeons + Labyrinth tower with the boss room on top guarding the stairs.
- First kill: "Congratulations!" banner and LAB toast. The clearing party opens the next town's gate
  by touching it, or it opens for everyone after a delay (lore: 2 h; ours: configurable, default 5 min).
- Info broker sells boss intel; some rumors are deliberately wrong (F1 weapon-swap twist).
- Cursors: players green; monsters red, shaded by relative level (pale = weak, deep crimson = far
  stronger). Orange "criminal" cursors only if a public PvP mode is ever added.
- Towns are safe zones ("Immortal Object" on hit). Duels: First Strike (first clean hit >= 10% or
  half HP), Half Loss, Total Loss (loser left at 1 HP, never a real death); on timeout more HP wins.
- Hardcore death: avatar shatters into polygons, a soul light lasts 10 s for a Revival crystal, then
  the character is gone and its name is struck through on the memorial with floor and cause.

### HUD & menus (our own drawings, SAO style)
- Top-left plate: square menu chip, name tab, slanted HP bar (green > 50%, yellow 25-50%, red < 25%)
  with a white damage trail; under it "HP cur / max" and "LV n" chips; buff icons; party bars below.
- Mobs: floating name + slim bar. Bosses: name with a red diamond cursor and layered stacked bars
  floating beside them (like the reference screenshots) + optional top-center bar; CHAIN / BREAK /
  SWITCH callouts.
- Hotbar: bottom-center slanted translucent slots with delay sweeps.
- Main menu (Tab): a column of round icons drops down with a chime beside translucent panels: Status
  (3D equipment doll), Equipment, Items, Skills (slots, proficiency, mods, hotbar), Party (companions
  and commands), Messages/Friends, Map, Quests, Settings, Log Out. The game keeps running.
- Character creator in a dark "calibration" space: body type, height, procedural hairstyle,
  hair/eye/skin colors, face preset, outfit + dye, name, Hardcore toggle with a warning.

## Content pipeline for 100 floors
- Each floor is one data entry: name, town, biome kit + palette, layout seed, landmarks, mob roster
  (3-6 from a family + level band), field boss, labyrinth config (levels, traps, mini-boss), floor
  boss, quests, secrets (Extra/Unique hints), music mood.
- Boss = creature-kit archetype (biped, quadruped, serpent/centipede, golem, treant, flyer, construct,
  hydra...) + HP bar count + phases + mechanics from a shared library (~20 by M2, ~40 by M3: cleave,
  slam, charge, leap, spin, volley, adds, weapon swap, enrage, stack/spread, tether, petrify gaze, weak
  points, breakable shield, grab-and-free, flooding hazards, linked twins, mirror clones, anti-crystal,
  durability corrosion...) + 1 signature mechanic + LAB item + intel rumors.
- Difficulty follows lore: floors divisible by 10 hard; quarter floors (25/50/75/100) hardest.
- 10 biome bands: grassland/ruins, forests/canals, snow peaks, lost woods/marsh, crystal
  caves/clockwork, volcanic/dragons, lakes/coral/storms, haunted/bone wastes, celestial/mirror,
  crimson palace.
- Archetype seeds (original designs): F1 beast warchief who swaps weapons on his last bar + guard
  adds; F2 bull-king trio; F3 corrupted treant; F4 sea serpent in a flooding chamber (teammates open
  sluices); F5 hollow colossus with weak points; F6 shifting puzzle cube; F10 samurai lord; F25
  two-headed giant; F40 prison warden who cages players; F50 six-armed metal statue; F74 goat-headed
  greatsword demon (anti-crystal begins); F75 bone-centipede reaper; F91 chaos drake; F100 the
  antagonist + story twist. Every other floor is invented.
- Tools: floor-validate (refs resolve, difficulty curve), balance-sim (bot party clear time and wipe
  rate per floor), floor-bible (docs/floors.md for the user to review and react to).

## Art & assets
- KayKit CC0 packs from their official GitHub repos: rig + 75 animations, weapons, dungeon and
  nature pieces, skeleton mobs.
- In code: toon/outline shading, procedural anime hair and face decals, armor shells, weapons, crystals,
  creatures with code-driven animation, terrain, sky; jsfxr sound effects.
- Fallback if avatars need to look more anime: VRoid Studio (free) VRM models via @pixiv/three-vrm.

## Milestone 1: Floor 1 playable end to end (build order)
0. Make sure the SAO wiki (swordartonline.fandom.com) can be read for lore checks while writing data.
   A local session can open it directly; a cloud session needs that host allowed in its network settings.
1. Scaffold monorepo + tooling, fetch KayKit assets, Three.js scene with toon shading, movement +
   camera, Colyseus rooms, 4 bot clients in sync.
2. Combat core: basic combos, 7 weapon types x 4-5 sword skills, pre-motion / system assist /
   post-motion delay, guard/parry, dodge, throwing picks, hit resolution, status effects, F1 mobs + AI,
   XP/levels, skill slots, proficiency, mods.
3. HUD, main menu, character creator (+ Hardcore choice), settings.
4. F1 boss + team systems: telegraphs, phases, adds, weapon-swap twist, Switch, chains/stagger,
   targeting patterns, AI companions + command wheel, crystals, LAB + Congratulations, gate opening,
   death rules + memorial, echo re-fights. **Playtest checkpoint: the 4 of you try the boss arena.**
5. Floor 1 world: town, field + field boss, 3-level labyrinth with traps/chests/mini-boss; loot;
   smithing/enhancement/appraisal, durability/repair, trading, stalls, duels; persistence; all 100
   floors stubbed in floors.ts + docs/floors.md.
6. Hosting: Dockerfile/compose, `npm run host` (server + Cloudflare quick tunnel, prints the link),
   vm-setup.sh for the Proxmox VM, HOSTING.md (stable link with a domain, optional Cloudflare Access).
Commit after each step to `claude/admiring-allen-o82s38` and push. No PR unless asked.

## Roadmap after M1
- M2 Floors 2-10: 3 biome kits, mechanic library ~20, Extra skills, first Unique-skill quests, story
  chapter 1 + world naming, recruitable companions, map/quest log, curved sword + 1H axe (+ Katana extra).
- M3 Floors 11-25 (quarter boss, anti-crystal traps, Corridor-crystal play, event boss that drops
  Revival crystals); M4 26-50; M5 51-75 (anti-crystal boss rooms from 74); M6 76-100 + ending.
- Later options: housing, cooking, fishing, taming, guilds, gamepad, voice commands ("Heal!",
  "Teleport: <town>") via the browser speech API, public mode (accounts at scale, moderation, PvP).

## Verification
- `npm test` (Vitest): formulas, sword-skill timelines/arcs, parry windows, Switch/chain/stagger,
  slots/proficiency/mods, enhancement attempts/odds, durability, trade atomicity, duel modes, Hardcore
  10 s window, LAB + unique-skill exclusivity, floor data validation.
- `npm run sim -- --floor 1 --party 4`: headless bot raid clears the F1 boss inside the target time at
  ~LV 10, wipes when underleveled, gives the LAB to the last hitter, opens F2.
- `npm run e2e` (Playwright, 4 browser clients): log in, create characters, party up, fight the boss;
  screenshots of HUD, menu, boss bars, crystals, death shatter; zero console errors.
- Live: `npm run dev` and open it in a browser for a quick look; then `npm run host` on the PC or VM
  for the real 4-player test.

## Risks
- Anime-quality avatars from procedural parts is the hardest art problem (VRoid fallback above).
- 100 floors depends on the data pipeline; M1 proves it on Floor 1 and stubs the rest.
- Hosting runs on the user's own PC or Proxmox VM: `npm run host` for a quick Cloudflare link (as with
  their War game), Docker + cloudflared for an always-on server. A fixed address needs a domain on
  Cloudflare.

## Handoff to a local session
- Machine needs: git, Node 22+, Claude Code signed in with the same claude.ai account; later Docker
  (VM) and cloudflared (share links).
- Either run `claude --teleport session_01JSoVUdWp8PmepxqFGg75Kf` from a clean clone of
  `cheath05/100-floors` (checks out the branch and brings the whole Q&A conversation), or pull branch
  `claude/admiring-allen-o82s38` and tell the new session: "Read docs/PLAN.md and start Milestone 1."
- The Decisions table captures every Q&A answer, so this plan stands on its own.
