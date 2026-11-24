import { Rng, deriveSeed, mixHex, type Placement, type PrefabVariant, type Vec2 } from "@worldforge/core";
import { PartListBuilder } from "@worldforge/prefabs";
import { baseRelief, biomeAt, distanceToEdge, inBounds, isWaterAt, layerFor, progress, type GenContext } from "../context";
import { facilityKit } from "./facilities";
import { layoutKeepOut } from "./layout";
import { carveRoad, placeStairs, refreshRoadDistance, routeRoad } from "./roads";
import { levelPad, nearestRoadPoint } from "./urban-plan";

/**
 * Nothing on the map is far from something. Where the land is empty for too long, it gets a small place that this country
 * would have there: a mine under a slope, a jetty on a shore, a stone circle on a height, a sawmill in a wood, a relay on
 * a ridge. Found by looking for the emptiest point again and again, so the rhythm of the map is even without being regular.
 */
type Age = "old" | "modern" | "future" | "any";
type Site = "slope" | "shore" | "height" | "wood" | "open" | "dry" | "any";

interface PlaceDef {
  id: string;
  age: Age;
  site: Site;
  /** Worlds it belongs to; empty = all. */
  env?: string[];
  not?: string[];
  radius: number;
  build?(b: PartListBuilder, k: ReturnType<typeof facilityKit>): void;
  /** Props round it: prefab, forward offset, side offset, turn in degrees. */
  props: [string, number, number, number][];
  trail?: boolean;
}

const WOOD = { material: "Wood", collide: true, lod: 2 } as const;
const PLANK = { material: "WoodPlanks", collide: true, lod: 2 } as const;
const ROCK = { material: "Slate", collide: true, lod: 2 } as const;
const STEEL = { material: "Metal", collide: true, lod: 2 } as const;
type B = PartListBuilder;

function hut(b: B, w: string, r: string): void {
  b.box([0, 0.4, 0], [15, 0.8, 13], "#7d766c", { ...ROCK, lod: 1 });
  for (const s of [-1, 1]) b.box([s * 6.5, 4.6, 1], [1, 8, 10], w, PLANK);
  b.box([0, 4.6, 5.8], [14, 8, 1], w, PLANK);
  for (const s of [-1, 1]) b.box([s * 4.6, 4.6, -3.6], [4.8, 8, 1], w, PLANK);
  b.box([0, 7.6, -3.6], [4.4, 2, 1], w, PLANK);
  for (const s of [-1, 1]) b.wedge([0, 11, 1 + s * 3.3], [17, 5, 6.8], r, { ...PLANK, rotation: [0, s > 0 ? 180 : 0, 0] });
  for (const s of [-1, 1]) b.box([s * 6.4, 4, -6], [0.8, 8, 0.8], w, WOOD);
  b.box([0, 8.2, -5.2], [15, 0.5, 4.4], r, { ...PLANK, rotation: [10, 0, 0] });
  b.box([4.6, 12, 3], [2, 6, 2], "#7d766c", { ...ROCK, lod: 1 });
  b.box([-3, 5, 6.4], [3, 2.6, 0.4], "#2a333a", { material: "Glass", collide: false, lod: 0 });
}

const PLACES: PlaceDef[] = [
  // ---- what any age leaves behind
  { id: "standing_stones", age: "old", site: "height", radius: 18, props: [["campfire", 0, 0, 0]], build: (b, k) => { for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const h = k.rng.float(6, 10); if (i === 4) continue; b.box([Math.cos(a) * 13, h / 2 - 0.5, Math.sin(a) * 13], [3.4, h, 2.2], mixHex(k.stone, "#5f6258", k.rng.next() * 0.5), { ...ROCK, rotation: [k.rng.float(-6, 6), 90 - (a * 180) / Math.PI, k.rng.float(-5, 5)] }); } for (const a of [0.35, 2.4]) b.box([Math.cos(a) * 13, 9.4, Math.sin(a) * 13], [9, 1.6, 2.6], k.stone, { ...ROCK, rotation: [0, 90 - (a * 180) / Math.PI, 0] }); } },
  { id: "hermit_hut", age: "old", site: "wood", radius: 14, trail: true, props: [["campfire", -10, 3, 0], ["barrel", -5, 7, 0], ["log", 6, -9, 30], ["crate", -4, -8, 10]], build: (b, k) => hut(b, k.wood, k.roof) },
  { id: "wayside_shrine", age: "old", site: "open", radius: 10, trail: true, props: [["lantern_post", -5, 5, 0], ["bench", -6, -5, 0], ["flower_patch", 4, 5, 0]], build: (b, k) => { b.box([0, 0.5, 0], [8, 1, 7], k.stone, ROCK); b.box([0, 1.3, 0.6], [5.6, 0.8, 4.6], k.stone, ROCK); for (const s of [-1, 1]) b.box([s * 2.2, 4.6, 0.6], [0.8, 6, 0.8], k.wood, WOOD); b.box([0, 4.2, 2.2], [4.8, 5, 0.6], k.stone, ROCK); for (const s of [-1, 1]) b.wedge([0, 8.8, 0.6 + s * 1.7], [6.4, 2.6, 3.4], k.roof, { ...PLANK, rotation: [0, s > 0 ? 180 : 0, 0] }); b.box([0, 3.4, 1.4], [1.6, 3, 1], k.trim, { material: "Marble", collide: true, lod: 1 }); } },
  { id: "ruined_keep", age: "old", site: "height", radius: 22, props: [["ruin_wall", 18, 15, 40], ["boulder", -12, 12, 0], ["treasure_chest", 2, 3, 20], ["dead_tree", 15, -12, 0]], build: (b, k) => { const c = mixHex(k.stone, "#6c6a60", 0.35); const hs = [17, 12, 6, 14, 9, 4]; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const h = hs[i % 6]!; if (i === 7) continue; b.box([Math.cos(a) * 9, h / 2 - 0.5, Math.sin(a) * 9], [6, h, 2], mixHex(c, "#000000", (i % 3) * 0.07), { ...ROCK, rotation: [0, 90 - (a * 180) / Math.PI, 0] }); } for (let i = 0; i < 8; i++) b.box([k.rng.float(-13, 13), 0.6, k.rng.float(-13, 13)], [k.rng.float(1.5, 3.4), k.rng.float(1, 2.2), k.rng.float(1.5, 3)], c, { ...ROCK, lod: 1, rotation: [0, k.rng.float(0, 180), k.rng.float(-15, 15)] }); b.box([0, 0.3, 0], [15, 0.6, 15], mixHex(c, "#3d3a34", 0.3), { ...ROCK, lod: 1 }); } },
  { id: "old_mine", age: "any", site: "slope", radius: 18, trail: true, props: [["crate", -12, 6, 10], ["barrel", -11, -7, 0], ["cart", -14, 2, 60], ["torch_post", -7, 6, 0], ["torch_post", -7, -6, 0]], build: (b, k) => { for (const s of [-1, 1]) b.box([s * 4.4, 4.5, -2], [1.6, 9, 1.6], k.wood, WOOD); b.box([0, 9.4, -2], [11.6, 1.6, 2], k.wood, WOOD); b.box([0, 4.6, 1.6], [8, 8.4, 1], "#14110e", { material: "Slate", collide: true, lod: 2 }); for (const s of [-1, 1]) for (let i = 0; i < 3; i++) b.box([s * (7 + i * 1.6), 3.4 - i * 0.6, 1 + i], [5, 8 - i * 1.6, 7], mixHex(k.stone, "#4d4a44", i * 0.2), { ...ROCK, rotation: [0, s * 18, s * (8 + i * 5)] }); b.box([0, 11.6, 3], [18, 5, 8], mixHex(k.stone, "#4d4a44", 0.2), { ...ROCK, rotation: [-10, 0, 0] }); for (const s of [-1, 1]) b.box([s * 1.6, 0.4, -8], [0.5, 0.5, 14], "#6a6d70", { ...STEEL, lod: 1 }); for (let i = 0; i < 6; i++) b.box([0, 0.2, -3 - i * 2.2], [5, 0.3, 0.9], k.wood, { ...WOOD, lod: 0 }); b.box([4.6, 1.8, -12], [5, 3.6, 4], "#57504a", { ...ROCK, lod: 1 }); } },
  { id: "quarry", age: "any", site: "slope", radius: 22, trail: true, not: ["space", "alien"], props: [["cart", -8, 12, 20], ["crate", -12, -8, 0], ["stone", 4, -14, 0], ["rock_cluster", 12, 10, 0]], build: (b, k) => { for (let i = 0; i < 4; i++) b.box([0, 1.4 + i * 2.8, 4 + i * 3], [30 - i * 5, 2.8, 10], mixHex(k.stone, i % 2 ? "#ffffff" : "#8a857a", 0.18), ROCK); for (let i = 0; i < 7; i++) b.box([k.rng.float(-13, 13), 1.4, k.rng.float(-12, -4)], [k.rng.float(3, 5), 2.8, k.rng.float(2.5, 4)], mixHex(k.stone, "#ffffff", 0.22), { ...ROCK, lod: 1, rotation: [0, k.rng.float(0, 90), 0] }); b.box([-13, 8, 0], [1.2, 16, 1.2], k.wood, WOOD); b.box([-8, 15.4, 0], [14, 1, 1], k.wood, { ...WOOD, rotation: [0, 0, 8] }); b.box([-2, 9, 0], [0.3, 12, 0.3], "#2e2a26", { material: "Metal", collide: false, lod: 0 }); } },
  { id: "log_yard", age: "any", site: "wood", radius: 18, trail: true, not: ["urban", "space"], props: [["log", -10, 10, 20], ["log", -8, -11, 70], ["cart", 12, -8, 30], ["crate", -12, 0, 0]], build: (b, k) => { for (const [x, z, n] of [[-7, 3, 4], [7, 5, 3]] as const) for (let r = 0; r < n; r++) for (let i = 0; i < n - r; i++) b.cylinder([x, 1 + r * 1.8, z - n + i * 2.1 + r], 2, 11, mixHex(k.wood, "#3b2a1c", (i + r) * 0.06), { ...WOOD, rotation: [0, 0, 90] }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([sx * 6, 4, -9 + sz * 4], [0.9, 8, 0.9], k.wood, WOOD); b.box([0, 8.4, -9], [15, 0.7, 11], k.roof, { ...PLANK, rotation: [8, 0, 0] }); b.box([0, 2.2, -9], [11, 0.8, 3], k.wood, PLANK); b.cylinder([0, 3.2, -9], 5, 0.4, "#b9bdc0", { material: "Metal", collide: false, lod: 1, rotation: [90, 0, 0] }); } },
  { id: "jetty", age: "any", site: "shore", radius: 16, trail: true, props: [["barrel", 6, 5, 0], ["crate", 7, -5, 20], ["lantern_post", 3, 4, 0]], build: (b, k) => { b.box([0, 1.6, -10], [5, 0.6, 28], k.wood, PLANK); for (let i = 0; i < 5; i++) for (const s of [-1, 1]) b.cylinder([s * 2.4, -1.5, 2 - i * 6], 0.9, 9, mixHex(k.wood, "#000000", 0.25), WOOD); b.box([0, 1.6, -23], [12, 0.6, 5], k.wood, PLANK); b.box([0, 0.8, 8], [11, 1.6, 9], mixHex(k.wood, "#777777", 0.3), PLANK); for (const s of [-1, 1]) b.box([s * 4.8, 5, 9], [0.7, 7, 7], k.wood, PLANK); b.box([0, 5, 12.2], [10, 7, 0.7], k.wood, PLANK); for (const s of [-1, 1]) b.wedge([0, 10, 9 + s * 2.4], [12, 3.4, 5], k.roof, { ...PLANK, rotation: [0, s > 0 ? 180 : 0, 0] }); } },
  { id: "sheepfold", age: "old", site: "open", radius: 18, trail: true, not: ["desert", "arctic", "space", "jungle"], props: [["hay_bale", 4, 4, 0], ["hay_bale", 6, 1, 40], ["cart", -12, 10, 70], ["barrel", 2, -6, 0]], build: (b, k) => { for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; if (i === 3) continue; b.box([Math.cos(a) * 12, 1.6, Math.sin(a) * 12], [6.6, 3.2, 1.6], mixHex(k.stone, "#6e6a5f", (i % 3) * 0.12), { ...ROCK, rotation: [0, 90 - (a * 180) / Math.PI, 0] }); } b.box([0, 3, 7], [12, 6, 0.8], k.wood, PLANK); for (const s of [-1, 1]) b.box([s * 5.6, 3, 4.4], [0.8, 6, 5.6], k.wood, PLANK); b.box([0, 6.6, 4], [14, 0.7, 8], k.roof, { ...PLANK, rotation: [-12, 0, 0] }); } },
  { id: "orchard", age: "any", site: "open", radius: 26, trail: true, not: ["desert", "arctic", "space", "jungle", "alien", "underground"], props: [["round_tree", -14, -12, 0], ["round_tree", -14, 0, 50], ["round_tree", -14, 12, 90], ["round_tree", 0, -12, 20], ["round_tree", 0, 12, 70], ["round_tree", 14, -12, 30], ["round_tree", 14, 0, 10], ["round_tree", 14, 12, 60], ["crate", 3, 2, 0], ["cart", -4, 5, 30], ["hay_bale", 5, -4, 0]], build: (b, k) => { for (let s = 0; s < 4; s++) { const a = (s * Math.PI) / 2; for (let i = 0; i < 5; i++) { if (s === 0 && i === 2) continue; const u = -18 + i * 9; const x = Math.cos(a) * 22 - Math.sin(a) * u; const z = Math.sin(a) * 22 + Math.cos(a) * u; b.box([x, 1.8, z], [0.7, 3.6, 0.7], k.wood, WOOD); for (const y of [1.2, 2.6]) b.box([x - Math.sin(a) * 4.5, y, z + Math.cos(a) * 4.5], [s % 2 ? 9 : 0.4, 0.5, s % 2 ? 0.4 : 9], k.wood, { material: "Wood", collide: false, lod: 1 }); } } } },
  { id: "graves", age: "old", site: "open", radius: 14, props: [["gravestone", -4, -5, 0], ["gravestone", -4, 0, 5], ["gravestone", -4, 5, -5], ["gravestone", 3, -4, 0], ["gravestone", 3, 2, 8], ["dead_tree", 8, 6, 0], ["lantern_post", -9, 7, 0]], build: (b, k) => { for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; if (i === 5) continue; b.box([Math.cos(a) * 11, 1, Math.sin(a) * 11], [7, 2, 1], mixHex(k.stone, "#5d5c55", 0.3), { ...ROCK, rotation: [0, 90 - (a * 180) / Math.PI, 0] }); } b.box([9, 3, -5], [5, 6, 5], k.stone, ROCK); for (const s of [0, 1]) b.wedge([9, 7.4, s ? -3.6 : -6.4], [6, 2.8, 2.8], k.roof, { ...ROCK, rotation: [0, s ? 180 : 0, 0] }); } },
  { id: "bandit_camp", age: "old", site: "wood", radius: 16, trail: true, not: ["arctic"], props: [["tent", 7, -7, 40], ["tent", 8, 6, 120], ["campfire", 0, 0, 0], ["crate", -7, 5, 0], ["barrel", -8, 3, 0], ["log", -4, -7, 60]], build: (b, k) => { for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; if (i === 8 || i === 9) continue; b.cylinder([Math.cos(a) * 14, 3, Math.sin(a) * 14], 1.4, 7 + (i % 3), k.wood, WOOD); } b.box([-14, 9.6, 0], [2, 0.8, 9], k.wood, WOOD); } },
  // ---- deserts and warm shores
  { id: "caravan_rest", age: "old", site: "dry", env: ["desert"], radius: 16, trail: true, props: [["tent", 6, -7, 20], ["tent", 8, 5, 90], ["campfire", 0, 0, 0], ["palm", -9, 8, 0], ["palm", 10, 11, 0], ["crate", -6, -6, 0], ["amphora", -7, 3, 0]], build: (b) => { b.cylinder([-9, 0.5, -4], 8, 0.6, "#4f8fb5", { material: "Glass", collide: false, lod: 1 }); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.box([-9 + Math.cos(a) * 4.6, 0.8, -4 + Math.sin(a) * 4.6], [3.6, 1.6, 1.2], "#b59b6e", { material: "Sandstone", collide: true, lod: 1, rotation: [0, 90 - (a * 180) / Math.PI, 0] }); } } },
  { id: "beach_shelter", age: "any", site: "shore", env: ["island", "tropical", "coastal"], radius: 13, trail: true, props: [["campfire", -7, 4, 0], ["log", -8, -3, 20], ["palm", 8, 8, 0], ["crate", 4, -6, 0]], build: (b, k) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cylinder([sx * 5, 4, sz * 4], 0.9, 8, k.wood, WOOD); b.box([0, 1.6, 0], [12, 0.6, 10], k.wood, PLANK); for (const s of [-1, 1]) b.wedge([0, 9.6, s * 2.8], [14, 3.6, 5.8], "#a8894f", { material: "Grass", collide: true, lod: 2, rotation: [0, s > 0 ? 180 : 0, 0] }); } },
  // ---- today
  { id: "relay", age: "modern", site: "height", radius: 14, trail: true, props: [["crate", -6, 5, 0]], build: (b, k) => { b.box([0, 0.4, 0], [16, 0.8, 14], "#8d8f90", { material: "Concrete", collide: true, lod: 2 }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([sx * 2, 18, sz * 2 + 2], [0.7, 36, 0.7], "#b9402f", { ...STEEL, rotation: [sz * -2, 0, sx * 2] }); for (let i = 0; i < 7; i++) b.box([0, 4 + i * 5, 2], [5 - i * 0.4, 0.5, 5 - i * 0.4], i % 2 ? "#e6e4de" : "#b9402f", { ...STEEL, lod: 1 }); for (const a of [0, 2.1, 4.2]) b.cylinder([Math.cos(a) * 2.4, 30, 2 + Math.sin(a) * 2.4], 3.4, 1, "#e6e4de", { material: "Metal", collide: false, lod: 1, rotation: [90, 90 - (a * 180) / Math.PI, 0] }); b.box([-4, 3, -3], [6, 5.4, 5], k.wall, { material: "Concrete", collide: true, lod: 2 }); for (let i = 0; i < 4; i++) { const s = i < 2 ? -1 : 1; b.box(i % 2 ? [s * 8, 2.6, 0] : [0, 2.6, s * 7], i % 2 ? [0.2, 5, 14] : [16, 5, 0.2], "#9aa0a4", { material: "Metal", collide: true, lod: 1, transparency: 0.4 }); } } },
  { id: "rest_stop", age: "modern", site: "open", radius: 20, trail: true, not: ["space"], props: [["car", -8, -8, 90], ["picnic_table", 8, 6, 20], ["picnic_table", 9, -3, 80], ["trash_can", 4, 9, 0], ["streetlight", -12, 10, 90], ["vending_machine", 4, -5, 0]], build: (b, k) => { b.box([-6, 0.2, 0], [16, 0.4, 26], "#4c4f52", { material: "Asphalt", collide: true, lod: 2 }); b.box([7, 3.6, -8], [9, 7.2, 8], k.wall, { material: "Concrete", collide: true, lod: 2 }); b.box([7, 7.6, -8], [11, 0.8, 10], k.trim, { material: "Concrete", collide: true, lod: 2 }); for (const s of [-1, 1]) b.box([7 + s * 2.4, 3, -12.2], [2.6, 5.4, 0.4], s > 0 ? "#34567a" : "#7a3444", { material: "Metal", collide: false, lod: 0 }); for (let i = 0; i < 5; i++) b.box([-6, 0.45, -10 + i * 5], [14, 0.1, 0.4], "#e8e6df", { collide: false, lod: 0 }); } },
  { id: "pumping_station", age: "modern", site: "shore", radius: 15, trail: true, props: [["barrel", -6, 6, 0], ["crate", 6, 7, 0]], build: (b, k) => { b.box([0, 4, 3], [14, 8, 10], k.wall, { material: "Brick", collide: true, lod: 2 }); b.box([0, 8.4, 3], [16, 0.8, 12], "#6d7276", { ...STEEL }); for (const s of [-1, 1]) { b.cylinder([s * 4, 2, -8], 2, 16, "#8a9498", { ...STEEL, rotation: [90, 0, 0] }); b.cylinder([s * 4, 3.6, -2], 3, 3, "#b9402f", { ...STEEL, lod: 1 }); } b.box([0, 4, -2.2], [4, 6, 0.4], "#3d4a52", { material: "Metal", collide: false, lod: 0 }); } },
  { id: "checkpoint", age: "modern", site: "open", env: ["military", "post_apocalyptic"], radius: 18, trail: true, props: [["sandbag_wall", -8, 8, 0], ["sandbag_wall", -8, -8, 0], ["tank_trap", -13, 4, 20], ["tank_trap", -13, -4, 60], ["ammo_crate", 5, 6, 0], ["jeep", 8, -7, 20], ["flag_pole", 3, 9, 0], ["burning_barrel", -3, -9, 0]], build: (b) => { b.box([4, 4, 0], [9, 8, 9], "#77785f", { material: "Concrete", collide: true, lod: 2 }); b.box([4, 8.6, 0], [11, 1, 11], "#62634f", { material: "Concrete", collide: true, lod: 2 }); b.box([-0.7, 5.4, 0], [0.5, 2, 6], "#14160f", { collide: false, lod: 0 }); b.box([-9, 3, -4], [1.2, 6, 1.2], "#b03a2e", { ...STEEL }); b.box([-9, 4, 3], [0.6, 0.6, 14], "#e8e4d8", { ...STEEL, lod: 1 }); } },
  { id: "trench_line", age: "modern", site: "height", env: ["military"], radius: 24, props: [["ammo_crate", 3, 4, 0], ["barricade", -10, -9, 20], ["tank_trap", -15, 6, 0], ["rubble_pile", 10, 8, 0]], build: (b) => { for (let i = 0; i < 10; i++) { const x = -20 + i * 4.4; const z = Math.sin(i * 1.1) * 4; b.box([x, 1.2, z - 2.8], [4.8, 2.4, 1.8], "#8a7a56", { material: "Fabric", collide: true, lod: 2, rotation: [0, Math.cos(i * 1.1) * -38, 0] }); b.box([x, 0.9, z + 3], [4.8, 1.8, 1.6], "#7d6f4e", { material: "Fabric", collide: true, lod: 1, rotation: [0, Math.cos(i * 1.1) * -38, 0] }); } b.box([0, 3, 7], [10, 6, 7], "#6f705c", { material: "Concrete", collide: true, lod: 2 }); b.box([0, 6.6, 7], [12, 1.2, 9], "#5f604e", { material: "Concrete", collide: true, lod: 2 }); } },
  { id: "crashed_truck", age: "modern", site: "any", env: ["post_apocalyptic", "military"], radius: 13, props: [["wrecked_car", 6, 5, 60], ["tire_pile", -5, 6, 0], ["supply_crate", -6, -4, 20], ["rubble_pile", 3, -7, 0]], build: (b) => { b.box([0, 3.6, 2], [7, 5, 14], "#6b6f57", { ...STEEL, rotation: [0, 14, 12] }); b.box([1, 3, -8], [6.6, 4.4, 5], "#5d604c", { ...STEEL, rotation: [6, 20, 10] }); for (const [x, z] of [[-3.4, -6], [3.6, -7], [-3, 6], [4, 5]] as const) b.cylinder([x, 1.4, z], 2.8, 1.2, "#1d1d1d", { material: "Rubber", collide: true, lod: 1, rotation: [0, 14, 90] }); } },
  { id: "gas_stop", age: "modern", site: "open", env: ["urban", "suburban", "coastal", "rural", "agricultural"], radius: 22, trail: true, props: [["car", -10, -5, 0], ["car", -12, 9, 90], ["trash_can", 6, 10, 0], ["vending_machine", 9, 4, 270], ["streetlight", -16, 14, 90]], build: (b, k) => { b.box([-4, 0.2, 0], [26, 0.4, 32], "#55585b", { material: "Concrete", collide: true, lod: 2 }); for (const s of [-1, 1]) b.box([-6, 6, s * 7], [1, 12, 1], "#d8dadb", { ...STEEL }); b.box([-6, 12.6, 0], [14, 1.4, 24], k.accent, { ...STEEL }); for (const s of [-1, 1]) { b.box([-6, 2.4, s * 5], [1.8, 4.4, 2.6], "#e8e6df", { ...STEEL, lod: 1 }); b.box([-6, 0.6, s * 5], [4, 0.5, 6], "#8f9294", { material: "Concrete", collide: true, lod: 1 }); } b.box([11, 4, 0], [10, 8, 20], k.wall, { material: "Concrete", collide: true, lod: 2 }); b.box([5.8, 4, 0], [0.5, 5, 15], "#2c3b47", { material: "Glass", collide: true, transparency: 0.3, lod: 1 }); b.box([11, 8.6, 0], [12, 1, 22], k.trim, { material: "Concrete", collide: true, lod: 2 }); } },
  // ---- tomorrow, elsewhere
  { id: "beacon", age: "future", site: "height", radius: 12, trail: true, props: [["sci_crate", -6, 4, 0], ["energy_pylon", 6, -5, 0]], build: (b, k) => { b.cylinder([0, 0.8, 0], 14, 1.6, "#5a6066", { ...STEEL }); b.cylinder([0, 11, 0], 2.4, 20, "#b9c2c8", { ...STEEL }); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; b.box([Math.cos(a) * 4, 4, Math.sin(a) * 4], [1, 9, 1], "#7d868c", { ...STEEL, rotation: [Math.sin(a) * 24, 0, -Math.cos(a) * 24] }); } b.sphere([0, 22, 0], 4, k.accent, { material: "Neon", collide: false, lod: 1, light: { type: "point", color: k.accent, brightness: 1.4, range: 40 } }); } },
  { id: "drill_rig", age: "future", site: "any", radius: 16, trail: true, props: [["sci_crate", 8, 6, 0], ["storage_tank", 10, -8, 0], ["barrel", -8, 7, 0]], build: (b) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([sx * 5, 9, sz * 5], [1.2, 19, 1.2], "#a87f3a", { ...STEEL, rotation: [sz * -11, 0, sx * 11] }); b.box([0, 8, 0], [10, 0.8, 10], "#6b7076", { ...STEEL }); b.cylinder([0, 6, 0], 2.4, 14, "#4d5257", { ...STEEL }); b.box([0, 18, 0], [6, 3, 6], "#7d868c", { ...STEEL }); b.box([9, 2.4, 2], [6, 4.8, 8], "#8b9399", { ...STEEL }); } },
  { id: "lost_probe", age: "future", site: "open", env: ["space", "alien", "scientific"], radius: 12, props: [["meteorite", 9, 5, 0], ["sci_crate", -6, 5, 30], ["antenna_dish", 5, -7, 0]], build: (b, k) => { b.sphere([0, 2.6, 0], 7, "#aab2b8", { ...STEEL }); b.box([0, 3, 5], [16, 0.5, 5], "#27406b", { material: "Glass", collide: true, lod: 1, rotation: [24, 10, 12] }); b.box([-2, 4, -5], [12, 0.5, 4], "#27406b", { material: "Glass", collide: true, lod: 1, rotation: [-30, -14, 22] }); b.cylinder([2, 7, 0], 0.5, 8, k.accent, { ...STEEL, lod: 1, rotation: [0, 0, 24] }); } },
  { id: "crystal_circle", age: "any", site: "any", env: ["fantasy", "alien"], radius: 14, props: [["crystal_cluster", 8, 0, 0], ["crystal_cluster", -6, 6, 60], ["crystal_cluster", -5, -7, 120], ["wisp", 0, 3, 0]], build: (b, k) => { for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; b.box([Math.cos(a) * 11, 0.7, Math.sin(a) * 11], [4, 1.4, 2.4], mixHex(k.stone, "#3a3d48", 0.4), { ...ROCK, rotation: [0, 90 - (a * 180) / Math.PI, 0] }); } b.box([0, 0.6, 0], [6, 1.2, 6], mixHex(k.stone, "#3a3d48", 0.4), { ...ROCK, rotation: [0, 45, 0] }); b.box([0, 4, 0], [2, 6, 2], k.accent, { material: "Neon", collide: true, lod: 1, transparency: 0.15, rotation: [0, 30, 8], light: { type: "point", color: k.accent, brightness: 1, range: 26 } }); } },
];

/** Prefabs the places are dressed with. */
export const PLACE_PROPS = [...new Set(PLACES.flatMap((p) => p.props.map((q) => q[0])))];

/** Every place in a style, for the model sheets. */
export function placeLibrary(style: GenContext["style"], seed: number): PrefabVariant[] {
  const kit = facilityKit({ style }, new Rng(seed));
  return PLACES.map((p) => {
    const b = new PartListBuilder();
    p.build?.(b, kit);
    return b.build({ id: `place_${p.id}/0`, prefab: `place_${p.id}`, category: "building", sinkDepth: 0.3, tags: ["layout"] });
  });
}

export function placePlaces(ctx: GenContext): void {
  const design = ctx.spec.design;
  if (!design || ["arena"].includes(design.scale) || design.environment === "abstract" || design.discoveries === 0) return;
  progress(ctx, "places", 0);
  const rng = new Rng(deriveSeed(ctx.seed, "places"));
  const kit = facilityKit(ctx, rng);
  const age: Age = kit.future ? "future" : kit.old ? "old" : "modern";
  const pool = PLACES.filter((p) => (p.age === "any" || p.age === age) && (!p.env || p.env.includes(design.environment)) && !p.not?.includes(design.environment) && !(ctx.islands && (p.site === "shore" || p.site === "slope")));
  // how far one walks before something happens
  const gap = ctx.islands ? 150 : design.density === "wilderness" ? 250 : design.density === "open" ? 290 : design.density === "very_dense" ? 330 : 270;
  const cell = 24;
  const w = Math.ceil(ctx.worldW / cell);
  const d = Math.ceil(ctx.worldD / cell);
  const far = new Float32Array(w * d).fill(1e9);
  const at = (i: number): Vec2 => [ctx.origin[0] + ((i % w) + 0.5) * cell, ctx.origin[1] + (Math.floor(i / w) + 0.5) * cell];
  const mark = (x: number, z: number, r: number) => {
    const k = Math.ceil((gap * 1.5 + r) / cell);
    const cx = Math.floor((x - ctx.origin[0]) / cell);
    const cz = Math.floor((z - ctx.origin[1]) / cell);
    for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx++) {
      const gx = cx + dx;
      const gz = cz + dz;
      if (gx < 0 || gz < 0 || gx >= w || gz >= d) continue;
      const i = gz * w + gx;
      const q = at(i);
      far[i] = Math.min(far[i]!, Math.max(0, Math.hypot(q[0] - x, q[1] - z) - r));
    }
  };
  for (const s of ctx.sites) mark(s.center[0], s.center[1], s.radius);
  for (const l of ctx.landmarks) mark(l.position[0], l.position[2], 30);
  for (const z of ctx.zones) if (z.kind === "gameplay") mark(z.center[0], z.center[1], z.radius);
  mark(ctx.spawn.position[0], ctx.spawn.position[2], 60);
  const keep = layoutKeepOut(ctx);
  if (keep) mark(keep.center[0], keep.center[1], keep.radius + 60);
  // ground where nothing stands: sea, cliffs and the border belong to nobody
  const margin = Math.max(50, Math.min(ctx.worldW, ctx.worldD) * 0.05);
  for (let i = 0; i < far.length; i++) {
    const q = at(i);
    if (distanceToEdge(ctx, q[0], q[1]) < margin || isWaterAt(ctx, q[0], q[1])) far[i] = -1;
  }
  const used = new Map<string, number>();
  const refused = new Set<number>();
  const variants = new Map<string, number>();
  let n = 0;
  for (;;) {
    let worst = -1;
    for (let i = 0; i < far.length; i++) if (!refused.has(i) && far[i]! > gap && (worst < 0 || far[i]! > far[worst]!)) worst = i;
    if (worst < 0) break;
    const c = at(worst);
    // the best spot for each kind of place around the empty point
    let best: { def: PlaceDef; at: Vec2; yaw: number; v: number } | null = null;
    for (let k = 0; k < 70; k++) {
      const a = k * 2.39996;
      const r = gap * 0.42 * Math.sqrt(k / 70);
      const x = c[0] + Math.cos(a) * r;
      const z = c[1] + Math.sin(a) * r;
      if (ctx.islands && (ctx.plateau?.sample(x, z) ?? 0) < -0.5) continue;
      if (!inBounds(ctx, x, z, 40) || isWaterAt(ctx, x, z) || ctx.roadDistance.sample(x, z) < 16) continue;
      const g = ctx.analysis!.at(x, z);
      if (g.cls === "cliff" || g.cls === "water" || g.slope > 0.5) continue;
      const wd = ctx.waterDistance.sample(x, z);
      const biome = biomeAt(ctx, x, z);
      const wooded = /forest|jungle|grove/.test(biome);
      for (const def of pool) {
        if (def.site === "shore" ? wd > 26 || wd < 6 : wd < def.radius + 6) continue;
        // on a mesa the whole place stands on one level, back from the edge
        if (ctx.plateau) {
          const level = ctx.plateau.sample(x, z);
          if ([0, 1, 2, 3, 4, 5, 6, 7].some((q) => Math.abs(ctx.plateau!.sample(x + Math.cos(q * 0.785) * (def.radius + 5), z + Math.sin(q * 0.785) * (def.radius + 5)) - level) > 0.1)) continue;
        }
        if (baseRelief(ctx, x, z, def.radius * 0.8) > (def.site === "slope" ? 16 : def.site === "height" ? 11 : 8)) continue;
        if (ctx.occupants.some((o) => Math.hypot(o.position[0] - x, o.position[2] - z) < o.radius + def.radius + 4)) continue;
        let v = rng.next() * 0.5 - (used.get(def.id) ?? 0) * 0.9;
        if (def.site === "height") v += Math.min(1.2, Math.max(-0.8, g.tpi / 10));
        else if (def.site === "slope") v += Math.min(1, g.slope * 4) - 0.2;
        else if (def.site === "shore") v += 1.1;
        else if (def.site === "wood") v += wooded ? 0.8 : -0.5;
        else if (def.site === "open") v += wooded ? -0.4 : 0.4;
        else if (def.site === "dry") v += biome === "desert" ? 0.8 : -1;
        if (def.env) v += 0.45;
        if (best && v <= best.v) continue;
        // a mine opens down the slope, a jetty toward the water, the rest toward the nearest road
        const e = 14;
        const gx = ctx.heights.sample(x + e, z) - ctx.heights.sample(x - e, z);
        const gz = ctx.heights.sample(x, z + e) - ctx.heights.sample(x, z - e);
        const wx = ctx.waterDistance.sample(x + e, z) - ctx.waterDistance.sample(x - e, z);
        const wz = ctx.waterDistance.sample(x, z + e) - ctx.waterDistance.sample(x, z - e);
        const road = nearestRoadPoint(ctx, [x, z]);
        const front: Vec2 = def.site === "slope" ? [-gx, -gz] : def.site === "shore" ? [-wx, -wz] : road ? [road[0] - x, road[1] - z] : [c[0] - x, c[1] - z];
        best = { def, at: [x, z], yaw: Math.atan2(-front[0], -front[1]), v };
      }
    }
    if (!best) {
      refused.add(worst);
      // the cells round a spot where nothing fits are not tried one by one
      for (const i of [worst - 1, worst + 1, worst - w, worst + w]) refused.add(i);
      continue;
    }
    const { def, at: p, yaw } = best;
    used.set(def.id, (used.get(def.id) ?? 0) + 1);
    const zone = `place_${def.id}_${n++}`;
    const fwd: Vec2 = [-Math.sin(yaw), -Math.cos(yaw)];
    const y = def.site === "shore" ? ctx.heights.sample(p[0], p[1]) : levelPad(ctx, { x: p[0], z: p[1], n: [-fwd[0], -fwd[1]], hx: def.radius * 0.95, hz: def.radius * 0.95 }, ctx.heights.sample(p[0], p[1]), 10);
    if (def.build) {
      // up to three builds of each kind, shared: same models, less to load
      const prefab = `place_${def.id}`;
      const made = variants.get(prefab) ?? 0;
      const list = (ctx.prefabs[prefab] ??= []);
      let vi = rng.int(0, 2);
      if (made < 3) {
        const b = new PartListBuilder();
        def.build(b, kit);
        const v = b.build({ id: `${prefab}/${list.length}`, prefab, category: "building", sinkDepth: 0.3, tags: def.site === "shore" ? ["layout", "water"] : ["layout"] });
        vi = list.length;
        list.push(v);
        variants.set(prefab, made + 1);
      }
      const place: Placement = { id: `dress_${zone}`, prefab, variant: Math.min(vi, list.length - 1), category: "building", position: [p[0], y, p[1]], rotationY: yaw, scale: 1, layer: layerFor(ctx, p[0], p[1], true), zone, importance: 9.2 };
      ctx.placements.push(place);
    }
    for (const [prop, f, s, turn] of def.props) {
      const vs = ctx.prefabs[prop];
      if (!vs?.length) continue;
      // (forward is -Z of the place, side its +X)
      const x = p[0] - fwd[0] * f + Math.cos(yaw) * s;
      const z = p[1] - fwd[1] * f - Math.sin(yaw) * s;
      if (isWaterAt(ctx, x, z) || baseRelief(ctx, x, z, /wall|arch/.test(prop) ? 6 : 2) > (/wall|arch/.test(prop) ? 2.4 : 3.2) || (ctx.plateau && Math.abs(ctx.plateau.sample(x, z) - ctx.plateau.sample(p[0], p[1])) > 0.1)) continue;
      const vi = rng.int(0, vs.length - 1);
      ctx.placements.push({ id: `dress_${zone}_${prop}_${f}_${s}`, prefab: prop, variant: vi, category: vs[vi]!.category, position: [x, ctx.heights.sample(x, z), z], rotationY: yaw + (turn * Math.PI) / 180, scale: 1, layer: layerFor(ctx, x, z, false), zone, importance: 6 });
    }
    ctx.occupants.push({ position: [p[0], y, p[1]], radius: def.radius, kind: "building" });
    ctx.zones.push({ id: zone, kind: "gameplay", polygon: [], center: p, radius: def.radius, meta: { kind: "place", place: def.id } });
    mark(p[0], p[1], def.radius);
    if (def.trail) {
      const from = nearestRoadPoint(ctx, p);
      const door: Vec2 = [p[0] + fwd[0] * (def.radius + 2) * (def.site === "shore" ? -1 : 1), p[1] + fwd[1] * (def.radius + 2) * (def.site === "shore" ? -1 : 1)];
      if (from && Math.hypot(from[0] - door[0], from[1] - door[1]) < 420) {
        const pts = routeRoad(ctx, rng, [from, door], { waterCost: 60 });
        const crossing = pts?.some((q) => ctx.occupants.some((o) => o.kind === "building" && Math.hypot(o.position[0] - q[0], o.position[2] - q[1]) < o.radius * 0.95 + 1));
        if (pts && pts.length > 3 && !crossing && !pts.some((q) => isWaterAt(ctx, q[0], q[1]))) {
          const type = ["snow_path", "sand_path"].includes(ctx.style.kits.road) ? ctx.style.kits.road : "dirt_path";
          const id = `trail_${zone}`;
          ctx.paths.push({ id, kind: "road", type, points: pts, width: 4 });
          carveRoad(ctx, pts, 4, type);
          placeStairs(ctx, id, pts);
        }
      }
    }
  }
  refreshRoadDistance(ctx);
  progress(ctx, "places", 1);
}
