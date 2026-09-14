---
name: worldforge-gameplay
description: "Implement or change gameplay in a WorldForge roblox-ts project: systems under src/systems (PlayerData, Combat, Enemies, Checkpoints/obby, Progression/quests, Tycoon, Simulator, Rounds/teams, Racing, TowerDefense, Economy: farming/mining/crafting/pets/housing/trading, Modes, Doors), GameConfig in src/shared/config.ts, typed remotes in src/shared/net.ts, zone markers (src/shared/zones.ts), server-authoritative patterns, Studio QA hooks. Use when asked to add a mechanic, a game mode, enemies, quests, an economy, rounds, vehicles, tools, or to fix a system. Pair with roblox-best-practices and roblox-opsec when they are installed."
---

# WorldForge — gameplay systems

Everything runs from `src/server/main.server.ts`: the world is built (`WorldBuilder.buildWorld`), then
every system's `start()` is called. A system is a module in `src/systems/` whose `start()` returns
immediately unless its id is in `GameConfig.systems` (from `design/game.spec.json`). Ids:

`player_data, currency, inventory, survival_stats, collectibles, quests, npcs, shop, pets, weapons, combat,
progression, checkpoints, obby, tycoon, simulator_loop, rounds, rng_rolls, leaderboards, matchmaking, day_night,
crafting, enemies, racing, tower_defense, farming, mining, building, jobs, sports, puzzle, story, clicker,
parkour, minigames, trading, housing, vehicles, teams, capture_points, abilities, rhythm` (GameSpec enum).

## Building blocks

- **GameConfig** (`src/shared/config.ts`, generated): `genre`, `systems[]`, `leaderstats[]`, `camera`,
  `layout`, `currency`, and one tunables block per system (`combat`, `enemies`, `rounds`, `obby`, `tycoon`,
  `simulator`, `racing`, `towerDefense`, `farming`, `mining`, `pets`, `progression`, `dayNight`, `sports`, `puzzle`).
  Put every new tunable there (the design agent regenerates the file from the GameSpec, so also add the
  field to `design/game.spec.json` when it is a design decision).
- **PlayerData** (`src/systems/PlayerData.ts`): `getProfile`, `getStat/setStat/addStat` (numeric stats,
  mirrored to `leaderstats` listed in `GameConfig.leaderstats`), `addCoins`, `addItem/hasItem`,
  `multiplierFor(player, "coins")` (gamepass / pet multipliers), `replicate` (→ `StatsChanged`), `save`.
  Autosaves to DataStore; Studio-only QA hook `ServerStorage.WorldForgeDev:Invoke("grantCoins"|"grantItem"|"profile", player, …)`.
- **Remotes** (`src/shared/net.ts`): `getRemoteEvent(Remotes.X)` on the server creates it under
  `ReplicatedStorage/Remotes`; `waitRemoteEvent` on the client. Existing: `StatsChanged, Notify, WorldProgress,
  ShopState, ShopBuy, ShopPromptRobux, NpcTalk, PlaySfx, HudValue(key,label,value), Action(name, …args),
  RoundState(msg), Fx(kind, position)`. Client → server requests go through **`Action`** with a name each
  system validates (`"melee"`, `"spawn_vehicle"`, `"collect"`, `"sell"`, `"upgrade"`, `"rebirth"`, `"hatch"`,
  `"ability"`, `"build"`, …). Add a new remote name to `Remotes` rather than creating instances ad hoc.
- **Zones** (`src/shared/zones.ts`): `findZones({kind, prefix, metaKind})`, `findZone(id)`,
  `sortedZones("obby_stage_", "stage")`, `zoneModel(z)`, `spawnPoint(z)`. Markers live in
  `Workspace.World.Zones` with attributes `Kind`, `Radius` and the generator's meta (`stage`, `plot`,
  `team`, `index`, `kind: "plaza" | "docks" | "walls" | "graveyard"`, `archetype`). Anchor spawns, pads, gates
  and props on zones — never on hard-coded coordinates.
- **Combat**: `Combat.damage(humanoid, amount, attacker?, knockback?)` (server, tags the killer with a
  `creator` ObjectValue so kills / rewards / team scores work everywhere). `Enemies.spawnAt(position, {health,
  speed, name})` spawns an R15 rig with wander / chase / pathfinding. `Progression.grantXp`,
  `Progression.progressQuest(player, objectiveType, target, n)`. `Rounds.addScore(key)`, `Rounds.currentPhase()`.
  `Racing.spawnVehicle(player, cframe)`.
- **Doors**: any part named `Door` in the world gets a ProximityPrompt + swing (Doors system) — name a
  door leaf `Door` in a new building prefab and it works.
- **Client** (`src/client/main.client.ts`): HUD wiring, hotkeys (V vehicle, P hatch, Q/F abilities,
  Shift sprint, R rebirth, double-jump parkour, click build), weather layer (`client/Weather.ts`).

## Adding a system (checklist)

1. `src/systems/MySystem.ts` with `export function start(): void { if (!GameConfig.systems.includes("my_id")) return; … }`.
2. Wait for the world: `while (Workspace.GetAttribute("WorldReady") !== true) task.wait(1);` inside `task.spawn`.
3. Handle players already present: `Players.PlayerAdded.Connect(setup); for (const p of Players.GetPlayers()) setup(p);`
   and characters already spawned (`if (player.Character) onCharacter(player.Character)`).
4. Tunables in `GameConfig`; rewards through `PlayerData.addCoins` / `addStat`; feedback through `Notify`,
   `HudValue`, `PlaySfx`, `Fx`.
5. Register in `src/server/main.server.ts` (`MySystem.start()`), add the id to `design/game.spec.json` systems
   and to the interpreter's `GameConfig.systems`.
6. `npx rbxtsc` → 0 errors. Then play-test in Studio (see `worldforge-qa`).

## Server-authoritative rules (non-negotiable)

- Never trust `Action` arguments: type-check (`typeIs`), clamp, rate-limit per player (`os.clock()` debounce),
  verify distance / ownership / cooldown on the server.
- Currency, inventory, damage, purchases (`ProcessReceipt`) and progression change only on the server.
- Client-only effects (particles, sounds, camera) go through `Fx` / `PlaySfx`, never through server loops.
- Long-lived loops use `task.spawn` + `task.wait`; disconnect connections on `PlayerRemoving` / `Destroying`.
- When `roblox-opsec` is installed, run it on remotes / economy code before publishing; when
  `roblox-best-practices` is installed, follow it for module layout, naming, memory and networking.

## Genre patterns already implemented (reuse before rewriting)

| Genre | Systems | Layout zones |
|---|---|---|
| survival / zombie | survival_stats, combat, enemies, crafting, day_night | settlement zones (enemies spawn on the outskirts, meta `enemy_spawn`) |
| obby / parkour | checkpoints, obby, parkour | `obby_stage_N` (meta `stage`), `KillBrick` parts |
| tycoon | tycoon, currency | `tycoon_plot_N`, `tycoon_path_N`, `tycoon_hub` |
| simulator / clicker | simulator_loop, pets, progression | plaza zone (meta `plaza`) → sell / upgrade / rebirth pads |
| battle / FPS / arena | rounds, teams, combat, weapons, capture_points | `arena_spawn_<team>`, `arena_center` (capture point) |
| racing | racing, vehicles, checkpoints | `race_start`, `race_cp_N` |
| tower defense | tower_defense, currency | `td_waypoint_N`, `td_pad_N_l/r`, `td_base`, `td_spawn` |
| farming / mining / pets / housing | farming, mining, crafting, trading, pets, housing, jobs | plots / nodes created by Economy around the plaza and fields |
| RPG / story | quests, npcs, combat, enemies, progression, story | `story_checkpoint_N`, settlements, landmarks |
| sports / puzzle / minigames | sports, puzzle, minigames, rounds | `goal_home` / `goal_away`, `dungeon_room_N`, `lobby_portal_N` |
