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
| M1 weapons | 1H sword + shield, rapier, dagger, 2H sword, 2H axe, spear, mace; all open from the start (no unlock tree) |
| Team mechanics (wiki pass) | Stagger interrupts (own telegraph color) and boss reads that a Switch resets are in, from M1 |
| Boss retreat | Doors stay open and you can retreat; the boss fully heals once everyone leaves; from F75 the door seals shortly after entry |
| Teleporting | Every opened town is in the gate list for everyone (no need to know the name) |
| Chant | Yes: singing party-buff Extra skill, added in M2 |
| Terms | Keep SAO terms (Col, Sword Skill, Switch, LAB, Extra/Unique Skill, Immortal Object); all UI text in one strings file so a public release can rename them |
| Build location | Built from the local desktop session on the user's Mac (2026-11-05) |
| Workflow | Commit + push to the branch after each M1 step (no PR unless asked); stop after each step to show progress and wait for a go-ahead |

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
  post-motion delay, per-skill cooldown. A short pre-motion glow, then system assist locks movement and performs the
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
  Smithing. Meditation is an Extra skill from an early-floor quest (see Wiki pass).
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
  Corridor (rare; mark a spot, opens a party portal, indigo), Revival (very rare; only inside the
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
- Cursors: players green; monsters red, shaded by relative level (pale pink, red, purple, dark
  crimson, black; details in Wiki pass). Orange "criminal" cursors only if a public PvP mode is ever added.
- Towns are safe zones ("Immortal Object" on hit). Duels: First Strike (first clean hit >= 10% or
  half HP), Half Loss, Total Loss (loser left at 1 HP, never a real death); on timeout more HP wins.
- Hardcore death: avatar shatters into polygons, a soul light lasts 10 s for a Revival crystal, then
  the character is gone and its name is struck through on the memorial with floor and cause.

### HUD & menus (our own drawings, SAO style)
- Top-left plate: square menu chip, name tab, slanted HP bar (green > 50%, yellow 30-50%, red <= 30%)
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

## Wiki pass (2026-11-05): lore checks and additions
Source: swordartonline.fandom.com, read through its MediaWiki API (pages listed at the end). Mechanics
only, written in our own words; the Originality rules still apply, so no SAO names go into code, data
or UI. Tags: [M1] fold into Milestone 1, [M2+] a later milestone, [opt] needs a yes from the user
(see Questions below).

### Confirmed by the wiki
Skill slots (2, then +1 at LV 6, 12, 20 and every 10 after) and the unslot reset unless stored;
proficiency 1000 = Completed; a Mod every 50 proficiency; unique skills grow out of Meditation >= 500,
ten in total, one holder each; Katana from curved-sword training; the rock-breaking fist quest; the
10 s revival window; the gate opens on touch or after 2 h; anti-crystal boss rooms from F74; quarter
floors hardest, multiples of 10 next; the five enhancement stats and "+6 (3S3D)" naming; the three duel
modes; no bows (lore: archery was lost when the floors were torn from the ground).

### Corrections made in this file
- HP bar: yellow at 50%, red at 30% (was 25%).
- Corridor crystal is indigo (was violet).
- Meditation is an Extra skill from an early-floor quest (F6 in lore), not a starting support skill.
- Monster cursor shades extended (see World).

### Combat
- [M1] Per-skill cooldown on top of post-motion delay: a used sword skill greys out on the hotbar while
  the others stay usable.
- [M1] Roster shape per weapon (lore pattern): a 1-hit opener, 2-4 hit combos, a charge with a fixed
  distance and time (e.g. 4 m in 0.4 s), a spin AoE, and a utility skill (weapon-targeting break,
  knock-up, short immobilize). Higher tiers add 5-8 hit skills. Defensive skills too: spinning the
  weapon into a shield against projectiles, a cross-block for dual wield, a turn-around counter.
- [M1] Weapon break: Heaviness and weapon-targeting skills can break a humanoid enemy's weapon. Add
  "breakable boss weapon" to the mechanic library (it pairs with the F1 weapon swap).
- [M1] Status effects to add: Stun (yellow rings over the head) with a chance of Fumble (weapon drops;
  pick it up, or the Quick Change mod re-equips it); Tumble (a humanoid mob falls = burst window);
  Weakness (STR/AGI down, can overload carry weight); Delay (slowed after repeated heavy hits); Silence
  (no spoken commands, so no crystals); Blind; poison in 5 strengths; paralysis strengths, with antidote
  potions giving short immunity. Lore durations run to minutes; ours stay in seconds.
- [M1] Potions heal over time and share a cooldown; crystals act instantly. A crystal can be used on an
  ally by touching them while using it.
- [opt] Interrupts: in the lore's first raid, support parties used delay effects to stop the boss's and
  the guards' attacks. Ours: a third telegraph color marks wind-ups that enough stagger cancels.
- [opt] Boss reads: lore says monster AI learns from whoever fights it and that Switch partly exists to
  confuse that learning. Ours: a boss builds a read on the player holding its focus (parry timing, dodge
  side) and tightens its timings over ~20 s; a Switch resets the read.
- [opt] Limb disabled for a while (lore: a lost limb grows back after 3 min) as a rare boss mechanic.

### Character & skills
- [M2] Meditation: Extra skill from a quest; buff that raises HP regen, shortens debuffs and cancels weak
  paralysis; at 500 it opens the unique-skill gate.
- [opt] Weapon-skill tree: in lore Rapier and Two-Handed Sword only appear after training One-Handed
  Sword. M1 currently opens all 7 weapon types; keep that for playtests unless the user wants the tree.
- [M2+] Composite skills: when two slotted skills both pass hidden thresholds, a combined skill unlocks
  (lore: sword + fist gives hybrid sword skills; crafting pairs give new recipes). Hidden until found.
- [M2+] Unique-skill conditions follow the lore patterns: complete a weapon skill, hold a world record
  (fastest reactions, strongest player), or reach a lifetime counter (10,000 true criticals). Draft for
  our ten, each also needing Meditation >= 500: Twin Fang = reaction-time record on perfect parries;
  Bastion Blade = most boss damage guarded with a shield; Moonlit Iaido = Katana completed; Endless
  Lance = Spear completed; Thousandfold Throw = Throwing completed; Starfall Thrust = 10,000 rapier
  criticals; Titan Grip = 2H sword and 2H axe completed; Mirror Guard = 1,000 perfect parries; Phantom
  Edge = hidden dagger quest; Forgeheart = Smithing completed + a forge quest. (Lore held most unique
  skills back until F90; ours spread out from M2.)
- [M2] More support skills from lore: Picking (locks), Trap Dismantling, Sneaking, Listening, Swimming,
  Extended Weight Limit, Buy/Sell Negotiation, Mixing (potions), Cooking (food buffs), Fishing, Sewing
  (cloth gear, outfits, dyes), Lumber/Carpentry (furniture), Metal Refining, First Aid; armor
  proficiencies (Leather, Light Metal, Heavy Metal, Shield) that gate armor weight.
- [M2] Search sets how far monster cursors show and how many at once, has a Tracking mod (follow a
  named player's footprints) and reveals hiders. Hiding shows a hide-rate meter driven by armor color
  vs surroundings, light, movement, skill level and whether someone is looking your way; your cursor
  disappears while hidden; it fails against monsters that don't hunt by sight.
- [opt] Chant: lore Extra skill that buffs the party by singing (defense, poison/stun resist). A support
  role in a game without magic.

### Items, crafting, economy
- [M1] Forging: furnace, then the hot ingot on the anvil takes N hammer strikes (N grows with weapon type
  and ingot rank; more strikes = stronger); quality has a random spread; the game names the weapon and
  picks its look from the material; appraisal shows the maker's name; weapons smelt back into ingots.
  Player-made gear beats same-level drops on average.
- [M1] Enhancing: pick the stat and the flame takes its color (silver Sharpness, blue Accuracy, green
  Quickness, red Heaviness, its own color for Durability); 10 strikes within 3 minutes or it fails; odds
  fall hard past +4; a failure does nothing, reshuffles the stats, or drops a level; when attempts run
  out the item is an end product and enhancing it again shatters it (the UI warns); items near their cap
  shimmer. Accuracy = the system nudges hits toward weak points (crits).
- [M2] Weapon variety: lore claims thousands of weapons per category, most uniquely named. Ours: a name
  and look generator seeded by material, floor and maker.
- [M1] Crystal scarcity: drops start around F6 at ~0.01% and rise tenfold the next floor; NPC shops sell
  the basic ones; Corridor only from drops, chests or trades.
- [M2] Message crystal: records a short voice or text note that can be left in the world (memorial,
  story beats).
- [M1] Economy anchors for balance-sim (lore): bread 1, an F1 inn night 50, an F1 boar ~30 Col, a strong
  F1 sword ~16,000 just after the floor clears; houses 1-5 million; a guild tower ~1 billion. NPC buy
  prices are fixed, so no inflation; coins of 100, 500 and 1000.
- [M2] Lore items to re-skin: a portable vendor carpet (sell anywhere, not just at the town board); a
  3D map projector for raid briefings; food with buffs (resists, luck, a rare +1 stat drink); quest
  accessories (+1 STR or AGI); a reusable bottle that stores a slotted skill (= our Skill Record crystal).

### World, floors, bosses
- Floor sizes: F1 is ~10 km across and the floors shrink upward to ~3 km (a cone). The outer rim is
  climbable, but a barrier stops you above the highest unlocked floor. Ours scale down but keep the shrink.
- [M1] F1 layout template: a big start town on one edge (~20% of the floor) with the gate; a grassland
  ring (boars, wolves, insects); a choice of two routes (forest or lake) that meet at mountains and
  ruins; the labyrinth on the far edge; a small front-line town near it with an amphitheater for the
  boss strategy meeting; side villages, one with an early weapon quest.
- [M1] Labyrinth: a 100 m tower (lore F1: 20 levels; ours 3 in M1) of mazes, traps, hidden rooms and dead
  ends; safe rooms marked by colored torches in the four corners; mobs respawn after ~5 min; a mid-boss
  guarding a staircase drops its own LAB; the stair walls and the boss-door relief hint at the next
  floor's theme.
- [M1] Field bosses physically block the way from town to labyrinth (cliffs, rivers); one per sub-area;
  they respawn and one party can beat them.
- [M1] Boss room: two doors; the boss is absent or passive until players walk far enough in; torches
  ignite on engage and dim after; a rough entrance means an easier boss, a polished one a deadly boss.
  Doors stay open so a party can retreat; the boss never leaves its room and heals fully once everyone
  is gone. Some fights lock the door by gimmick (flooding, a body blocking it, a puzzle) that someone
  outside can undo. [opt] From F75 the door seals shortly after entry.
- [M1] F1 boss tuning reference (lore): 4 HP bars; 3 guards at the start and 3 more each time a bar
  breaks; a weapon swap in the final bar, opening with a 360-degree spin that stuns; room ~20 x 100 m.
  This matches our F1 archetype.
- [M1] After a first clear, spawns around the next floor's town drop sharply for ~30 min so newcomers
  arrive safely.
- [opt] Teleporting needs the destination town's name: a town shows in the gate list once you've
  visited it or a friend shares it.
- [M3+] Sub-dungeons for mid levels with respawning dungeon bosses; a secret high-level dungeon on F1
  that opens only after a condition on a high floor.
- [M3+] Event bosses on real calendar dates (yearly); the planned Revival-crystal event boss is one.
- [M1] Safe zones: "Inner Area" / "Outer Field" banners when crossing; blocked hits flash a purple
  barrier and still knock back; the zone covers the town all the way up to the floor above.
- [M1] Cursors show when you look at a target or it is in detection range (Search); hidden indoors; NPCs
  green with an NPC tag; passive monsters, NPCs and pets yellow; quest targets get a yellow rim;
  aggressive monsters by level gap: pale pink (trivial, no XP), red (even), purple (above you), dark
  crimson (hopeless), black (worse).
- [M1] Duels: 60 s countdown; the challenged player picks the mode; on timeout HP is compared in steps of
  5, so close fights draw; the result window stays 30 s.

### Quests & social
- [M1] Quest markers: gold "!" becomes "?" while active. Types: collection, elimination, escort, errand
  or investigation (some investigations end in a boss fight). Repeatables have cooldowns; high-value
  quests are one-time; quest maps can be instanced so groups don't block each other; town quest boards;
  weekly hunts.
- [M2-M3] Multi-floor campaign: lore has a long war campaign over floors 3-9 where you back one of two
  factions. Ours: an original two-faction campaign woven into the story, with faction-only rewards (a
  boat for water floors, access rings, the skill-storage bottle).
- [M2] Hidden-quest breadcrumbs: an NPC on a higher floor hints at a secret quest on a lower one; playful
  marks (face paint that stays until you finish).
- [M2+] Generated side quests: a per-floor generator fills the four quest types with folklore-style
  stories to cover 100 floors cheaply; an anti-farming balancer trims XP or spawns in over-farmed spots.
- [M3+] Guilds: formed by a quest (F3 in lore); 3-4 letter tag; emblem next to the HP bar; shared
  storage and a member locator (both off inside dungeons); a small stat bonus when guildmates party; a
  buyable hall; a tax on members' earnings goes to the guild vault.
- [Later] Taming: a small monster rarely takes an interest; feed it its favorite food; pets are weak but
  scout or heal; unfed pets lose affinity and leave; a dead pet leaves a heart that a rare flower can
  revive within 3 days.
- [Later] Player-made sword skills (from the sequel game in lore): record your own combo, accepted only at
  full speed without assist; can be taught to one other player.

### Questions for the user
1. Answered: all 7 weapon types open from the start, no unlock tree.
2. Answered: yes, both stagger interrupts and boss reads (reset by Switch) go in from M1.
3. Answered: yes, bosses heal fully on retreat and doors seal from F75.
4. Answered: no, every opened town is teleportable right away.
5. Answered: yes, Chant comes in M2.
6. Answered: keep SAO's terms for now; all UI text goes in one strings file so they can be renamed if
   the game goes public. (The Originality rules still ban SAO names.)

### Wiki pages read
Skills, Sword Skills, Unique Skills, Extra Skills, Outside System Skill, Original Sword Skill, Last
Attack, Boss, Dungeon, Hidden Dungeon, the castle overview, the 1st- and 74th-floor pages, the F1 boss
page, Teleport Gate, Anti-Criminal Code Effect Area, Color Cursor, Duels, Player Killing, Hit Points,
Status Effect, Potions, Crystals, the revival-item page, Enhancement System, Weapon Crafting System,
Items, Cor, Quest, Martial Arts quest, Guild, Hiding, Tamed Monsters, Beast Tamer, Cardinal System, the
skill-storage bottle page.

## Art & assets
- KayKit CC0 packs from their official GitHub repos: rig + 75 animations, weapons, dungeon and
  nature pieces, skeleton mobs.
- In code: toon/outline shading, procedural anime hair and face decals, armor shells, weapons, crystals,
  creatures with code-driven animation, terrain, sky; jsfxr sound effects.
- Fallback if avatars need to look more anime: VRoid Studio (free) VRM models via @pixiv/three-vrm.

## Milestone 1: Floor 1 playable end to end (build order)
0. SAO wiki access: done (see Wiki pass). Locally its MediaWiki API answers plain requests, e.g.
   `curl "https://swordartonline.fandom.com/api.php?action=parse&page=Sword_Skills&prop=wikitext&format=json"`.
   A cloud session needs that host allowed in its network settings.
1. Scaffold monorepo + tooling, fetch KayKit assets, Three.js scene with toon shading, movement +
   camera, Colyseus rooms, 4 bot clients in sync.
2. Combat core: basic combos, 7 weapon types x 4-5 sword skills, pre-motion / system assist /
   post-motion delay, guard/parry, dodge, throwing picks, hit resolution, status effects, F1 mobs + AI,
   XP/levels, skill slots, proficiency, mods (skill roster shape, cooldowns, status list: Wiki pass).
3. HUD, main menu, character creator (+ Hardcore choice), settings.
4. F1 boss + team systems: telegraphs, phases, adds, weapon-swap twist, Switch, chains/stagger,
   targeting patterns, AI companions + command wheel, crystals, LAB + Congratulations, gate opening,
   death rules + memorial, echo re-fights. **Playtest checkpoint: the 4 of you try the boss arena.**
5. Floor 1 world: town, field + field boss, 3-level labyrinth with traps/chests/mini-boss; loot;
   smithing/enhancement/appraisal, durability/repair, trading, stalls, duels; persistence; all 100
   floors stubbed in floors.ts + docs/floors.md (F1 layout, labyrinth, forge/enhance flow: Wiki pass).
6. Hosting: Dockerfile/compose, `npm run host` (server + Cloudflare quick tunnel, prints the link),
   vm-setup.sh for the Proxmox VM, HOSTING.md (stable link with a domain, optional Cloudflare Access).
Commit after each step to `claude/admiring-allen-o82s38` and push. No PR unless asked.

### Progress
- **Step 1 done (2026-11-05):** npm workspaces (`shared`, `server`, `client`, `tools`), KayKit fetcher
  (pinned commits: Adventurers, Skeletons, Dungeon Remastered; no nature pack on GitHub, so trees and
  rocks are drawn in code), toon scene (3-band ramp, ink outlines, bloom, sky with the floor above),
  third-person camera, WASD/jump/sprint, Colyseus town/field/boss rooms, client prediction +
  reconciliation, 100 ms interpolation, bot clients. 4 real clients stay in sync (test + `npm run bots`).
  Deviations: Colyseus is 0.18 (newer API); movement is a shared pure-TS step on flat ground instead of
  Rapier, so prediction replays exactly (Rapier comes in when terrain/labyrinth geometry needs it);
  TypeScript 6 (Colyseus doesn't support 7 yet); ports 5200/8100.

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
