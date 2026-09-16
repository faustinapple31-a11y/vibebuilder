---
name: worldforge-qa
description: "Test and fix a WorldForge Roblox project: rbxtsc compiler errors, Roblox Studio runtime errors and console logs, the metrics-based world critique (qa/report.json spec_patch fixes), play-test checklists per genre (survival, obby, tycoon, simulator, battle/rounds, racing, tower defense, farming/mining, RPG), Studio-only QA hooks (ServerStorage.WorldForgeDev), performance budgets. Use when asked to test, debug, review, QA, fix errors, or write qa/report.json."
---

# WorldForge — QA

QA runs in a loop driven by the app: compile → deploy to Studio (Rojo / MCP) → play → read logs and
screenshots → fix → repeat, up to `qa.maxIterations` in `worldforge.json`. As the QA agent you receive
compiler diagnostics, Studio console output and a world critique; you write `qa/report.json`.

## 1. Compile

`npx rbxtsc` must print nothing. Typical roblox-ts errors and their fixes are in the `roblox-ts-pitfalls`
skill (reserved identifiers, `.size()`, `pairs`, unions of literals, remotes typed as `unknown`).
Fix root causes; never wrap errors in `pcall` to hide them, never delete a feature to make an error go away.

## 2. Runtime (Studio)

- Server output prefix `[WorldForge]`: `building world … placements`, `world ready`, `N doors`,
  `N checkpoints`, `genre … systems: …`. Missing lines = the system did not start (check `GameConfig.systems`).
- Common runtime failures: `attempt to index nil` on a zone (the layout did not create it → check the
  archetype and `layout.count`), `WaitForChild` timeouts on remotes (server never created it → `getRemoteEvent`
  in the server module), enemies not chasing (no `Humanoid` / `PrimaryPart`), players spawning in water
  (spawn zone), doors that do not open (`Door` part missing / not named).
- Studio-only hooks: `ServerStorage.WorldForgeDev:Invoke("grantCoins", player, 500)`,
  `("grantItem", player, "wood", 10)`, `("profile", player)`; `ReplicatedStorage.Remotes.ShopBuy:InvokeServer(id)`
  from the client. `Workspace:GetAttribute("WorldReady")` tells whether the world finished building.
- Buildings vs terrain: for every model with attribute `Category = "building"`, raycast the terrain at the pivot and
  at ±40 % of its bounding box; `terrain.Y − pivot.Y` must stay within about −1 … +1.2 studs (the interior floor is
  1.5 studs above the pivot, the foundation 1.1 below). Larger values = houses sinking into / floating over the voxel
  surface → regenerate (the generator flattens a plateau under every slab and the WorldBuilder snaps buildings to the
  highest rendered point of their footprint).
- Meshes: `[WorldForge] … world ready` then no `EditableMesh budget exhausted` / `ApplyMesh failed` warnings on
  the client; MeshParts tagged `WfMesh` must not render as boxes / checkerboards (client rebuild failed).
  Caves: `Zones/cave_chamber` marker sits inside Air voxels (`Terrain:ReadVoxels`).
- Performance: target < 45 k parts, ShadowMap lighting, few PointLights (hundreds of lights with `Future`
  lighting have hung GPUs), `StreamingEnabled` on. The bake stats (`assets/world/WorldBake.json` → `stats`)
  give parts / instances per category.

## 3. Play-test checklist by genre

| Genre | Must work |
|---|---|
| any | spawn on solid ground facing the focal landmark; HUD visible; coins persist after rejoin; shop buys; doors open; weather layer visible when the style has one |
| survival | hunger drains, food restores, enemies spawn at night and chase, melee tool deals damage, crafting consumes items |
| obby / parkour | stage pads register in order, KillBrick resets, respawn at last stage, finish rewards, double-jump only when parkour |
| tycoon | claim plot, buttons purchasable in order, dropper → collector income, cash-out |
| simulator / clicker | collect fills backpack, sell pad converts, upgrades raise values, rebirth resets and multiplies |
| battle / FPS / rounds | lobby → intermission → round → winner, teams spawn apart, kills score, capture point ticks |
| racing | vehicle spawns (V), gates count laps in order, lap / finish rewards |
| tower defense | waves follow the path, towers placed on pads shoot, base HP drops, wave banner updates |
| farming / mining | plant → grow → harvest, node hits → ore, crafting recipes consume/produce |
| RPG / story | NPC talk, quest objectives progress, XP / levels, checkpoints along the road |

## 4. World critique (metrics)

The critic scores composition, lighting, terrain, vegetation, architecture, consistency, atmosphere,
variety and performance. Proposed fixes are `spec_patch` entries (dotted path → value) on
`worlds/main/world.spec.json` or `regenerate` actions — apply them with the `worldforge-world` skill
and keep `locks` in mind. Dressing structures (walls, piers, fields, markings) and layout structures are never
trimmed by the budget; if the parts budget is exceeded, lower vegetation / prop density first.

## 5. Report (`qa/report.json`)

```json
{ "score": 82,
  "scores": { "composition": 8, "lighting": 9, "terrain": 8, "vegetation": 8, "architecture": 8, "assetConsistency": 9, "atmosphere": 8, "variety": 7, "performance": 9 },
  "problems": [ { "id": "p1", "severity": "high", "message": "enemies never chase", "layer": "code", "location": [120, 48, -36] } ],
  "fixes": [
    { "type": "code_fix", "file": "src/systems/Enemies.ts", "description": "PrimaryPart missing on the rig" },
    { "type": "spec_patch", "path": "lighting.brightness", "op": "set", "value": 0.6 },
    { "type": "regenerate", "layers": ["vegetation"], "newSeed": false }
  ] }
```

`score` is /100, axis scores /10 (`layer` ∈ terrain, water, roads, landmarks, buildings, vegetation, props, lighting, code, ui, audio, build, performance, composition); be demanding (a shippable game scores ≥ 8 everywhere). When `roblox-opsec` is installed,
run it on remotes / purchases before the final report; when `roblox-best-practices` is installed, use it as
the code-review rubric.
