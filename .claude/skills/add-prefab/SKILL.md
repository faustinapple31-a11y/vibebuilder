---
name: add-prefab
description: "Create or fix a procedural prefab in WorldForge (packages/prefabs): PartListBuilder primitives (box, sphere, cylinder, wedge, segment, beam, chain, gableRoof, pyramidRoof, cornerWedge, effect), style-driven colors and materials, LOD tiers, collision, sinkDepth / footprint, registry definition, prop kit mapping, tags the generator understands (light, seat, wall, floating, water, layout, ambience, glow, vehicle, market, statue, tower, docks, field, marking), the connectivity test. Use when asked to add a prop, building, vegetation, landmark, wall kit, or when parts float / clip / look wrong in Studio."
---

# Add / fix a prefab

Prefabs are pure functions `(ctx: PrefabContext, variant: number) => PrefabVariant` built with
`PartListBuilder` (`packages/prefabs/src/builder.ts`). Origin = ground level under the prefab, **front = −Z**,
units = studs, `rotation` = Euler XYZ degrees (`CFrame.Angles` order; verified in Studio: `WedgePart` is
high at +Z / low at −Z, `CornerWedgePart` apex above the (+X, −Z) corner).

## Rules

1. **Connected by construction**: every visible part must touch the ground (`min.y ≤ 0.6`) or another part
   of the same prefab (AABB overlap within 0.35 studs). Use `segment(from, to)` / `beam` / `chain` for anything
   between two points (trunks, branches, ropes, rafters); overlap joints by a few tenths of a stud.
   `npx vitest run packages/prefabs/test/connectivity.test.ts` runs every prefab in all 34 styles — it must stay green.
2. **Style-driven**: colors from `ctx.style.palette` (`jitterHex` / `mixHex` / `lightenHex` for variation),
   materials from `ctx.style.materials`; hard-code only universal colors (rust, white lines, neon signs).
   Use `ctx.rng` for every random choice (deterministic per seed / variant).
3. **LOD**: `lod: 2` = silhouette parts (must exist alone: main volumes), `1` = simple, `0` = full detail
   (small trims). Background placements spawn the simple tier.
4. **Collision**: `collide: true` only for walkable / blocking volumes; foliage, trims, signs, glow bits are
   `collide: false`. Light sources: `light: { type: "point", color, brightness, range }`; particles:
   `effect: { kind: fireflies | spores | embers | smoke | sparkle | mist, rate?, size?, color? }`.
5. **Build**: `b.build({ id: \`${prefab}/${variant}\`, prefab, category, sinkDepth, footprintRadius?, tags })`.
   `sinkDepth` = how deep the base is buried (0.3 props, 1.0 buildings, 0 for floating / piers).
   Categories: vegetation, rock, building, prop, landmark, path, water, npc — budgets are per category
   (`packages/world-gen/src/pipeline/optimize.ts`), so use `prop` for many small things.
6. **Named parts** the runtime reacts to: `Door` (swings open), `KillBrick` (obby), `Seat` semantics come
   from tags, not names.

## Mesh parts

`b.mesh(key, data, position, color, { scale, fallback, material, rotation, lod, collide })` adds a part of
shape `mesh` referencing a triangle soup (`MeshData`, built with `MeshBuilder` in `meshes/mesh-builder.ts`:
icosphere → `displace` → `scale` → `flattenBelow` → `centred()`). Use the shared library
(`ctx.meshes`, ids in `meshes/library.ts`) rather than new geometry per variant: a Roblox client holds only
~6 EditableMeshes, so unique meshes are a per-bake budget. `size` = scaled bounds; `meshFallback` picks the
primitive used when meshes are unavailable. Bounds / connectivity treat a mesh part as its box.

## Tags the generator reads

| tag | effect |
|---|---|
| `light` | placed roadside by `kit-props`, around landmark grounds; `maxLights` cap |
| `vehicle`, `market` | roadside-big slots near settlements |
| `wall` | tangent to houses (kit props) / settlement ring (`settlement_wall`) |
| `water` | shore placement; `floating` sits on the water surface and is never terrain-snapped |
| `statue`, `tower` | plaza / focal spots |
| `ambience`, `glow` | scattered in fitting biomes, never tilted with the slope |
| `layout` | gameplay structure: never trimmed, never snapped, exempt from spawn clearing |
| `docks`, `field`, `marking`, `kerb`, `gate` | dressing stage placements (`dress_*` ids, never trimmed) |
| `interior` | building has walk-in interiors (critic counts them) |

## Register

- `packages/prefabs/src/registry.ts`: `def(id, category, builder, variants, approxParts, tags)`.
- Prop kits: `PROP_KIT_PREFABS` in `packages/prefabs/src/kits/index.ts` (order = signature first).
- Vegetation species: `SPECIES_PREFAB` (`packages/world-gen/src/pipeline/vegetation.ts`) + `VEGETATION_SPECIES`.
- Landmarks: `LANDMARK_PREFAB` (`packages/world-gen/src/pipeline/landmarks.ts`) with `height` / `footprint`, + `LANDMARK_TYPES`.
- Buildings: `prefabMix` per settlement type (`packages/world-gen/src/pipeline/buildings.ts`).
- Always-available base prefabs: the list in `requiredPrefabs` (`packages/world-gen/src/generator.ts`).

## Verify

`npx tsc -b tsconfig.json`, connectivity test, then look at it: the viewer (Toolbox tab renders any prefab)
or Studio through `studio-verify`. For buildings check the door opening, floor slabs, stairs and that
furniture does not block the door.
