import { Rng, TERRAIN_MATERIAL_INDEX, deriveSeed, mixHex, type FacilityId, type Placement, type PrefabVariant, type Vec2, type Vec3 } from "@worldforge/core";
import { PartListBuilder } from "@worldforge/prefabs";
import { baseRelief, inBounds, isWaterAt, layerFor, progress, type GenContext, type SettlementSite } from "../context";
import { GROUND_STEP } from "./ground";
import { layoutKeepOut } from "./layout";
import { carveRoad, placeStairs, refreshRoadDistance, routeRoad } from "./roads";
import { levelPad, nearestRoadPoint } from "./urban-plan";

/**
 * Places with a function: a hospital, a runway, a forum, a ski lift. Each one states the lot it needs and the relations it
 * wants (near the main road, at the edge, on high ground, beside its own kind); the lot is chosen by score, levelled,
 * served by a drive, and the place knows what it is (zone `facility`).
 */
interface FacilityDef {
  /** Lot, studs: along the street and away from it. */
  lot: [number, number];
  /** Preferred distance to its settlement, in settlement radii. */
  ring: [number, number];
  /** Wants (+) or avoids (-): the main road, high ground, water, homes. */
  wants?: { road?: number; high?: number; water?: number; homes?: number };
  /** Facilities it stands beside. */
  beside?: FacilityId[];
  build(b: PartListBuilder, k: Kit): void;
  /** Loose props around the building: prefab, offset along and away, turn. */
  dress?: [string, number, number, number][];
  pave?: "asphalt" | "stone" | "grass";
  /** Nothing solid: a runway, a park. */
  open?: boolean;
}

interface Kit {
  wall: string;
  wall2: string;
  roof: string;
  trim: string;
  accent: string;
  stone: string;
  wood: string;
  old: boolean;
  future: boolean;
  solid: Solid;
  top: Solid;
  rng: Rng;
}

type Solid = NonNullable<NonNullable<Parameters<PartListBuilder["box"]>[3]>["material"]>;

const GLASS = { material: "Glass", transparency: 0.35, collide: true, lod: 1 } as const;

/** A building one can enter: four walls with a door in front, windows, a floor, a roof and what its top carries. Front -Z. */
function hall(b: PartListBuilder, k: Kit, x: number, z: number, w: number, d: number, h: number, o: { floors?: number; door?: number; roof?: "flat" | "gable" | "barrel"; wall?: string; windows?: boolean } = {}): void {
  const wall = o.wall ?? k.wall;
  const dw = o.door ?? 6;
  const dh = Math.min(h - 2, o.door && o.door > 10 ? h - 3 : 8);
  const t = 1;
  const S = { material: k.solid, collide: true, lod: 2 } as const;
  b.box([x, 0.3, z], [w + 2, 0.6, d + 2], k.stone, { material: "Concrete", collide: true, lod: 2 });
  for (const s of [-1, 1]) b.box([x + s * (w / 4 + dw / 4), h / 2, z - d / 2], [w / 2 - dw / 2, h, t], wall, S);
  b.box([x, dh + (h - dh) / 2, z - d / 2], [dw, h - dh, t], wall, S);
  b.box([x, h / 2, z + d / 2], [w, h, t], wall, S);
  for (const s of [-1, 1]) b.box([x + (s * w) / 2, h / 2, z], [t, h, d], wall, S);
  b.box([x, 0.65, z], [w - 1, 0.2, d - 1], mixHex(k.stone, "#ffffff", 0.2), { material: "Concrete", collide: true, lod: 0 });
  // corner piers, plinth and cornice: the facade is not a blank box
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([x + (sx * w) / 2, h / 2, z + (sz * d) / 2], [2, h + 0.6, 2], k.trim, { material: k.solid, collide: true, lod: 2 });
  b.box([x, h + 0.3, z], [w + 2.4, 1, d + 2.4], k.trim, { material: k.solid, collide: true, lod: 2 });
  const floors = o.floors ?? Math.max(1, Math.round(h / 9));
  if (o.windows !== false) {
    const n = Math.max(2, Math.floor(w / 7));
    for (let f = 0; f < floors; f++) {
      const y = (h / floors) * (f + 0.55);
      if (f > 0) b.box([x, (h / floors) * f, z], [w + 0.6, 0.6, d + 0.6], k.trim, { material: k.solid, collide: true, lod: 1 });
      for (let i = 0; i < n; i++) {
        const u = -w / 2 + (w * (i + 0.5)) / n;
        const tall = Math.min(5.5, (h / floors) * 0.55);
        if (f > 0 || Math.abs(u) > dw / 2 + 2) b.box([x + u, y, z - d / 2 - 0.3], [3.4, tall, 0.7], "#26323c", GLASS);
        b.box([x + u, y, z + d / 2 + 0.3], [3.4, tall, 0.7], "#26323c", GLASS);
      }
      for (let i = 0; i < Math.max(1, Math.floor(d / 9)); i++) for (const s of [-1, 1]) b.box([x + s * (w / 2 + 0.3), y, z - d / 2 + (d * (i + 0.5)) / Math.max(1, Math.floor(d / 9))], [0.7, Math.min(5, (h / floors) * 0.5), 3.2], "#26323c", GLASS);
    }
  }
  const R = { material: k.top, collide: true, lod: 2 } as const;
  if (o.roof === "gable") {
    const rise = Math.min(w, d) * 0.38;
    for (const s of [-1, 1]) b.wedge([x, h + 0.8 + rise / 2, z + (s * d) / 4], [w + 3, rise, d / 2 + 1.2], k.roof, { ...R, rotation: [0, s > 0 ? 180 : 0, 0] });
  } else if (o.roof === "barrel") {
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * (i + 0.5)) / 7;
      b.box([x + Math.cos(a) * w * 0.5, h + Math.sin(a) * w * 0.26, z], [w * 0.27, 0.8, d + 1.6], k.roof, { ...R, rotation: [0, 0, (Math.atan2(Math.cos(a) * 0.26, -Math.sin(a) * 0.5) * 180) / Math.PI] });
    }
  } else {
    for (const s of [-1, 1]) {
      b.box([x, h + 1.4, z + (s * d) / 2], [w + 1.6, 1.8, 0.8], k.trim, { material: k.solid, collide: true, lod: 1 });
      b.box([x + (s * w) / 2, h + 1.4, z], [0.8, 1.8, d + 1.6], k.trim, { material: k.solid, collide: true, lod: 1 });
    }
    if (!k.old) for (let i = 0; i < 2; i++) b.box([x + (i - 0.5) * w * 0.4, h + 2, z + d * 0.15], [4, 2.6, 3.4], "#8a8d90", { material: "Metal", collide: false, lod: 0 });
  }
}

function sign(b: PartListBuilder, x: number, y: number, z: number, w: number, color: string): void {
  b.box([x, y, z], [w, 2.6, 0.5], color, { material: "SmoothPlastic", collide: false, lod: 0 });
  b.box([x, y, z - 0.35], [w * 0.8, 1, 0.3], "#f4f1e6", { material: "Neon", collide: false, lod: 0 });
}

function columns(b: PartListBuilder, k: Kit, x: number, z: number, w: number, h: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const u = x - w / 2 + (w * i) / Math.max(1, n - 1);
    b.cylinder([u, h / 2, z], 2, h, k.stone, { material: "Marble", collide: true, lod: 1 });
    b.box([u, h + 0.4, z], [3, 0.8, 3], k.trim, { material: "Marble", collide: false, lod: 0 });
    b.box([u, 0.4, z], [3, 0.8, 3], k.trim, { material: "Marble", collide: true, lod: 0 });
  }
}

const DEFS: Record<FacilityId, FacilityDef> = {
  town_hall: { lot: [44, 34], ring: [0.2, 0.6], wants: { road: 1 }, pave: "stone", build: (b, k) => { hall(b, k, 0, 2, 34, 20, 18, { floors: 2, roof: k.old ? "gable" : "flat" }); columns(b, k, 0, -10, 22, 10, 5); b.box([0, 11, -10], [26, 1.4, 4], k.trim, { material: k.solid, collide: true, lod: 2 }); b.box([0, 24, 0], [8, 14, 8], k.wall2, { material: k.solid, collide: true, lod: 2 }); b.box([0, 27, -4.2], [5, 5, 0.4], "#f3ecd8", { collide: false, lod: 0 }); for (const s of [0, 1]) b.wedge([0, 33.4, s ? 2 : -2], [9, 5, 4], k.roof, { material: k.top, collide: true, lod: 2, rotation: [0, s ? 180 : 0, 0] }); } },
  market: { lot: [46, 34], ring: [0.15, 0.6], wants: { road: 0.8, homes: 0.4 }, pave: "stone", build: (b, k) => { for (const sx of [-1, 1]) for (const z of [-9, 0, 9]) b.box([sx * 16, 5, z], [1.6, 10, 1.6], k.wood, { material: "Wood", collide: true, lod: 1 }); for (const s of [-1, 1]) b.wedge([0, 13, s * 6], [38, 6, 12.4], k.roof, { material: k.top, collide: true, lod: 2, rotation: [0, s > 0 ? 180 : 0, 0] }); for (let i = 0; i < 6; i++) { const x = -13 + (i % 3) * 13; const z = i < 3 ? -5 : 5; b.box([x, 1.5, z], [7, 3, 3], k.wood, { material: "WoodPlanks", collide: true, lod: 1 }); for (let j = 0; j < 4; j++) b.sphere([x - 2.4 + j * 1.6, 3.4, z], 1.2, ["#c8402e", "#d9a033", "#5f8f3a", "#b56a3a"][(i + j) % 4]!, { collide: false, lod: 0 }); } }, dress: [["barrel", -20, 6, 0], ["crate", 20, 8, 30], ["crate", 19, -8, 10], ["cart", -21, -8, 60]] },
  school: { lot: [60, 46], ring: [0.4, 0.95], wants: { road: 0.6, homes: 1 }, pave: "stone", build: (b, k) => { hall(b, k, -8, 8, 36, 18, 18, { floors: 2 }); hall(b, k, 20, 2, 14, 30, 10); sign(b, -8, 13.5, -1.6, 18, k.accent); b.cylinder([-26, 9, -14], 0.5, 18, "#c9c9c9", { material: "Metal", collide: true, lod: 0 }); b.box([-23.6, 16, -14], [4.6, 3, 0.2], k.accent, { collide: false, lod: 0 }); }, dress: [["bench", -14, -16, 0], ["bench", -4, -16, 0], ["basketball_hoop", 22, -18, 180], ["trash_can", 6, -14, 0], ["bus_stop", -22, -22, 0]] },
  hospital: { lot: [64, 50], ring: [0.5, 1.15], wants: { road: 1.2 }, pave: "asphalt", build: (b, k) => { hall(b, k, 0, 6, 48, 22, 30, { floors: 3, wall: "#e6e8e8" }); hall(b, k, 0, -11, 20, 12, 10, { wall: "#dfe3e4" }); for (const s of [0, 1]) b.box([0, 24, -5.8], s ? [9, 3, 0.5] : [3, 9, 0.5], "#c8322c", { material: "Neon", collide: false, lod: 0 }); b.box([0, 9.6, -21], [24, 0.8, 10], k.trim, { material: "Metal", collide: true, lod: 1 }); for (const s of [-1, 1]) b.box([s * 10, 4.8, -25], [1, 9.6, 1], k.trim, { material: "Metal", collide: true, lod: 1 }); b.cylinder([14, 31.4, 8], 14, 0.5, "#44484c", { material: "Concrete", collide: true, lod: 1 }); }, dress: [["bench", -22, -18, 0], ["streetlight", 24, -22, 0], ["planter", -16, -20, 0], ["trash_can", 16, -18, 0]] },
  police_station: { lot: [46, 36], ring: [0.3, 0.9], wants: { road: 1 }, pave: "asphalt", build: (b, k) => { hall(b, k, 0, 3, 34, 20, 16, { floors: 2, wall: "#c9ccd2" }); sign(b, 0, 12, -7.8, 16, "#2b4d8f"); b.box([0, 9, -9], [14, 0.8, 5], "#2b4d8f", { collide: true, lod: 1 }); b.cylinder([13, 25, 6], 0.5, 14, "#9aa0a6", { material: "Metal", collide: false, lod: 0 }); }, dress: [["car", -15, -13, 90], ["car", 15, -13, 90], ["road_barrier", 0, -16, 0], ["streetlight", -20, -15, 0]] },
  fire_station: { lot: [48, 38], ring: [0.3, 1], wants: { road: 1.2 }, pave: "asphalt", build: (b, k) => { hall(b, k, -4, 3, 34, 22, 14, { door: 22, wall: "#b8463a" }); hall(b, k, 19, 6, 10, 14, 26, { wall: "#a53d33" }); for (let i = 0; i < 2; i++) b.box([-9 + i * 11, 5, -7.4], [9.4, 9.6, 0.4], "#d8d4cb", { material: "Metal", collide: false, lod: 0 }); sign(b, -4, 12.6, -8.2, 18, "#8f2a22"); }, dress: [["fire_hydrant", 22, -14, 0], ["traffic_cone", -14, -16, 0], ["traffic_cone", 8, -16, 0], ["streetlight", -22, -15, 0]] },
  park: { lot: [56, 48], ring: [0.2, 0.85], wants: { homes: 0.8 }, pave: "grass", open: true, build: (b, k) => { for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.box([Math.cos(a) * 15, 0.12, Math.sin(a) * 15], [8.2, 0.24, 4], mixHex(k.stone, "#d8c8a0", 0.5), { material: "Concrete", collide: true, lod: 1, rotation: [0, 90 - (a * 180) / Math.PI, 0] }); } b.cylinder([0, 0.8, 0], 14, 1.6, k.stone, { material: "Slate", collide: true, lod: 2 }); b.cylinder([0, 1.5, 0], 12, 0.5, "#4f8fb5", { material: "Glass", collide: false, lod: 1 }); b.cylinder([0, 3, 0], 2, 5, k.stone, { material: "Slate", collide: true, lod: 1 }); b.cylinder([0, 5.4, 0], 6, 0.8, k.stone, { material: "Slate", collide: true, lod: 1 }); }, dress: [["bench", -18, 0, 90], ["bench", 18, 0, 270], ["bench", 0, 18, 180], ["bench", 0, -18, 0], ["round_tree", -23, -18, 0], ["round_tree", 22, -19, 0], ["birch", -22, 19, 0], ["round_tree", 23, 18, 0], ["flower_patch", -10, -21, 0], ["flower_patch", 11, 21, 0], ["bush", 24, 2, 0], ["bush", -25, 3, 0]] },
  parking: { lot: [56, 34], ring: [0.5, 1.2], wants: { road: 0.8 }, pave: "asphalt", open: true, build: (b) => { for (let i = 0; i <= 6; i++) for (const s of [-1, 1]) b.box([-24 + i * 8, 0.15, s * 10], [0.4, 0.1, 10], "#e8e6df", { collide: false, lod: 0 }); }, dress: [["car", -20, -10, 0], ["car", -4, -10, 180], ["car", 12, 10, 0], ["car", 20, -10, 0], ["streetlight", -26, 0, 90], ["streetlight", 26, 0, 270]] },
  train_station: { lot: [110, 44], ring: [0.7, 1.3], wants: { road: 0.8 }, pave: "stone", build: (b, k) => { hall(b, k, 0, -10, 40, 14, 16, { floors: 2, roof: k.old ? "gable" : "flat" }); b.box([0, 23, -10], [8, 12, 8], k.wall2, { material: k.solid, collide: true, lod: 2 }); b.box([0, 25, -14.2], [4.6, 4.6, 0.4], "#f3ecd8", { collide: false, lod: 0 }); b.box([0, 1, 4], [104, 2, 8], k.stone, { material: "Concrete", collide: true, lod: 2 }); for (let i = 0; i < 9; i++) b.box([-44 + i * 11, 6.5, 4], [0.8, 9, 0.8], k.trim, { material: "Metal", collide: true, lod: 1 }); b.box([0, 11.4, 4], [100, 0.7, 11], k.roof, { material: k.top, collide: true, lod: 2 }); for (const z of [11, 14.4]) b.box([0, 0.5, z], [108, 0.6, 0.5], "#5c5f63", { material: "Metal", collide: true, lod: 1 }); for (let i = 0; i < 36; i++) b.box([-52.5 + i * 3, 0.15, 12.7], [1.2, 0.3, 7], "#5a4632", { material: "Wood", collide: true, lod: 0 }); }, dress: [["bench", -20, 4, 180], ["bench", 20, 4, 180], ["crate", 34, -8, 20]] },
  terminal: { lot: [120, 54], ring: [0.4, 1.4], wants: { road: 1 }, beside: ["runway", "control_tower"], pave: "asphalt", build: (b, k) => { hall(b, k, 0, 2, 96, 30, 20, { floors: 2, door: 12, wall: "#dfe4e6", roof: "barrel" }); b.box([0, 11, -13.6], [90, 9, 0.6], "#31424e", GLASS); b.box([0, 12.4, -22], [70, 0.8, 14], k.trim, { material: "Metal", collide: true, lod: 2 }); for (let i = 0; i < 6; i++) b.box([-32 + i * 13, 6, -27], [1, 12, 1], k.trim, { material: "Metal", collide: true, lod: 1 }); for (const s of [-1, 1]) { b.box([s * 34, 7, 24], [5, 5, 18], "#c9cfd2", { material: "Metal", collide: true, lod: 2 }); b.cylinder([s * 34, 4, 33], 8, 8, "#b7bdc0", { material: "Metal", collide: true, lod: 1 }); } sign(b, 0, 17.6, -14.6, 34, k.accent); }, dress: [["car", -30, -24, 90], ["car", 24, -24, 90], ["bus_stop", 0, -25, 0], ["streetlight", -44, -24, 0], ["streetlight", 44, -24, 0]] },
  control_tower: { lot: [26, 26], ring: [0.4, 1.5], beside: ["runway", "terminal"], pave: "asphalt", build: (b, k) => { b.box([0, 4, 0], [18, 8, 16], k.wall, { material: k.solid, collide: true, lod: 2 }); b.cylinder([0, 25, 0], 8, 50, "#d3d7d8", { material: "Concrete", collide: true, lod: 2 }); b.cylinder([0, 51, 0], 15, 2, k.trim, { material: "Concrete", collide: true, lod: 2 }); b.cylinder([0, 55, 0], 14, 6, "#2c3b47", GLASS); b.cylinder([0, 58.6, 0], 16, 1.4, k.trim, { material: "Metal", collide: true, lod: 2 }); b.cylinder([0, 65, 0], 0.5, 12, "#b03a2e", { material: "Metal", collide: false, lod: 0 }); } },
  runway: { lot: [330, 46], ring: [0.9, 2.2], wants: { homes: -1 }, pave: "asphalt", open: true, build: (b) => { for (let i = 0; i < 17; i++) b.box([-150 + i * 18.7, 0.16, 0], [10, 0.12, 1.2], "#f2f0ea", { collide: false, lod: 0 }); for (const s of [-1, 1]) for (let i = 0; i < 6; i++) b.box([s * 156, 0.16, -12.5 + i * 5], [12, 0.12, 2.4], "#f2f0ea", { collide: false, lod: 0 }); for (const s of [-1, 1]) { b.box([0, 0.16, s * 19], [320, 0.12, 0.8], "#f2f0ea", { collide: false, lod: 0 }); for (let i = 0; i < 18; i++) b.box([-153 + i * 18, 0.5, s * 21], [0.7, 0.8, 0.7], "#f6d98a", { material: "Neon", collide: false, lod: 0 }); } } },
  hangar: { lot: [56, 50], ring: [0.5, 1.8], beside: ["runway", "hangar", "barracks"], wants: { road: 0.5 }, pave: "asphalt", build: (b, k) => { hall(b, { ...k, solid: "Metal", wall: "#9ba4a8" }, 0, 0, 46, 38, 15, { door: 34, roof: "barrel", windows: false }); for (let i = 0; i < 3; i++) b.box([-11 + i * 11, 1, 6], [6, 2, 6], "#7d6b4c", { material: "WoodPlanks", collide: true, lod: 0 }); }, dress: [["crate", -24, -22, 0], ["barrel", 24, -22, 0]] },
  warehouse: { lot: [54, 44], ring: [0.5, 1.4], wants: { road: 0.8, homes: -0.4 }, beside: ["warehouse", "train_station"], pave: "asphalt", build: (b, k) => { hall(b, k, 0, 2, 44, 30, 15, { door: 14, roof: "gable", wall: k.old ? "#9a5b44" : "#8f979b", windows: !!k.old }); for (let i = 0; i < 3; i++) b.box([-14 + i * 14, 3, 10], [8, 6, 6], ["#8b6a43", "#6f7f88", "#a4573c"][i]!, { material: "WoodPlanks", collide: true, lod: 0 }); b.box([0, 1.2, -16], [20, 2.4, 5], k.stone, { material: "Concrete", collide: true, lod: 1 }); }, dress: [["pallet_stack", -18, -18, 0], ["crate", 16, -18, 20], ["barrel", 21, -16, 0], ["crate", -22, -15, 60]] },
  tank_farm: { lot: [60, 46], ring: [0.8, 1.6], wants: { homes: -1 }, beside: ["power_plant", "runway"], pave: "asphalt", build: (b) => { for (let i = 0; i < 6; i++) { const x = -20 + (i % 3) * 20; const z = i < 3 ? -11 : 11; b.cylinder([x, 7, z], 15, 14, ["#d9dcda", "#c7cbca", "#b9b4a6"][i % 3]!, { material: "Metal", collide: true, lod: 2 }); b.cylinder([x, 14.3, z], 15.4, 0.8, "#8d9396", { material: "Metal", collide: true, lod: 1 }); b.box([x + 7.6, 7, z], [0.4, 14, 1.4], "#6b6f72", { material: "Metal", collide: true, lod: 0 }); } for (const z of [-1.4, 1.4]) b.box([0, 1.4, z], [52, 0.9, 0.9], "#a3402f", { material: "Metal", collide: true, lod: 0 }); for (const s of [-1, 1]) b.box([0, 1, s * 21], [56, 2, 0.8], "#8f9294", { material: "Concrete", collide: true, lod: 1 }); } },
  power_plant: { lot: [80, 60], ring: [0.9, 1.7], wants: { homes: -1, water: 0.6 }, pave: "asphalt", build: (b, k) => { hall(b, k, -14, 4, 42, 28, 24, { floors: 2, wall: k.old ? "#8a4a3a" : "#9aa1a4" }); for (let i = 0; i < 2; i++) { const x = 18 + i * 14; b.cylinder([x, 26, 10], 6.4, 52, k.old ? "#9a5140" : "#c9c9c6", { material: k.old ? "Brick" : "Concrete", collide: true, lod: 2 }); for (const y of [40, 46, 51]) b.cylinder([x, y, 10], 6.8, 1.4, "#b5402f", { collide: false, lod: 1 }); } for (let i = 0; i < 4; i++) { b.box([12 + i * 8, 3, -16], [5, 6, 5], "#7f8a8f", { material: "Metal", collide: true, lod: 1 }); for (let j = 0; j < 3; j++) b.cylinder([10.6 + i * 8 + j * 1.4, 7, -16], 0.6, 2.4, "#c9cdd0", { collide: false, lod: 0 }); } b.box([-8, 9, -13], [2, 2, 14], "#8f8f88", { material: "Metal", collide: true, lod: 1 }); } },
  barracks: { lot: [52, 30], ring: [0.3, 1], beside: ["barracks", "motor_pool"], wants: { road: 0.6 }, pave: "grass", build: (b, k) => { hall(b, k, 0, 2, 44, 16, 11, { roof: "gable", wall: "#7d8468" }); }, dress: [["sandbag_wall", -16, -12, 0], ["flag_pole", 20, -12, 0], ["ammo_crate", 12, -12, 0]] },
  helipad: { lot: [36, 36], ring: [0.5, 1.2], pave: "asphalt", open: true, build: (b) => { b.cylinder([0, 0.4, 0], 28, 0.8, "#4a4e52", { material: "Concrete", collide: true, lod: 2 }); b.cylinder([0, 0.86, 0], 22, 0.1, "#e9d25a", { collide: false, lod: 1 }); b.cylinder([0, 0.92, 0], 20.4, 0.1, "#4a4e52", { collide: false, lod: 1 }); for (const s of [-1, 1]) b.box([s * 4, 1, 0], [1.8, 0.1, 11], "#f2f0ea", { collide: false, lod: 0 }); b.box([0, 1, 0], [8, 0.1, 1.8], "#f2f0ea", { collide: false, lod: 0 }); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.box([Math.cos(a) * 13.4, 1, Math.sin(a) * 13.4], [0.7, 0.8, 0.7], "#f6c44a", { material: "Neon", collide: false, lod: 0 }); } } },
  motor_pool: { lot: [60, 40], ring: [0.4, 1.2], beside: ["barracks", "warehouse"], wants: { road: 0.8 }, pave: "asphalt", build: (b, k) => { for (let i = 0; i <= 4; i++) b.box([-22 + i * 11, 5, 14], [1, 10, 1], k.trim, { material: "Metal", collide: true, lod: 1 }); b.box([0, 5, 18], [46, 10, 1], "#8d9486", { material: "Metal", collide: true, lod: 2 }); b.box([0, 10.6, 12], [48, 0.8, 14], "#6f765f", { material: "Metal", collide: true, lod: 2 }); }, dress: [["jeep", -16, -6, 0], ["jeep", -4, -6, 0], ["jeep", 10, -6, 180], ["tire_pile", 24, 8, 0], ["barrel", -25, 8, 0], ["ammo_crate", 22, -12, 0], ["wrecked_car", -24, -12, 40]] },
  watch_post: { lot: [22, 22], ring: [0.8, 1.6], wants: { high: 1.2, road: 0.3 }, pave: "grass", build: (b, k) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([sx * 3.4, 9, sz * 3.4], [0.9, 18, 0.9], k.wood, { material: "Wood", collide: true, lod: 2 }); for (const y of [6, 12]) for (const s of [-1, 1]) { b.box([0, y, s * 3.4], [8, 0.5, 0.5], k.wood, { material: "Wood", collide: false, lod: 1 }); b.box([s * 3.4, y, 0], [0.5, 0.5, 8], k.wood, { material: "Wood", collide: false, lod: 1 }); } b.box([0, 18.3, 0], [10, 0.8, 10], k.wood, { material: "WoodPlanks", collide: true, lod: 2 }); for (const s of [-1, 1]) { b.box([0, 20.4, s * 4.8], [10, 3, 0.4], k.wood, { material: "WoodPlanks", collide: true, lod: 1 }); b.box([s * 4.8, 20.4, 0], [0.4, 3, 10], k.wood, { material: "WoodPlanks", collide: true, lod: 1 }); } for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([sx * 4.4, 23, sz * 4.4], [0.6, 8, 0.6], k.wood, { material: "Wood", collide: false, lod: 1 }); for (const s of [0, 1]) b.wedge([0, 28, s ? 3 : -3], [12, 2.6, 6], k.roof, { material: k.top, collide: true, lod: 2, rotation: [0, s ? 180 : 0, 0] }); for (let i = 0; i < 12; i++) b.box([0, 1 + i * 1.5, -4.2], [2.2, 0.3, 0.4], k.wood, { material: "Wood", collide: true, lod: 0 }); }, dress: [["sandbag_wall", -8, -8, 20], ["crate", 8, -6, 0]] },
  ski_lift: { lot: [190, 24], ring: [1, 2], wants: { high: 1.6 }, pave: "grass", open: true, build: (b, k) => { for (const s of [-1, 1]) { b.box([s * 88, 4, 0], [14, 8, 14], k.wall, { material: "WoodPlanks", collide: true, lod: 2 }); for (const q of [0, 1]) b.wedge([s * 88, 10, q ? 4 : -4], [16, 4, 8], k.roof, { material: k.top, collide: true, lod: 2, rotation: [0, q ? 180 : 0, 0] }); } for (let i = 0; i < 5; i++) { const x = -60 + i * 30; b.cylinder([x, 11, 0], 1.6, 22, "#5b6166", { material: "Metal", collide: true, lod: 2 }); b.box([x, 22, 0], [1.4, 1.2, 16], "#5b6166", { material: "Metal", collide: false, lod: 1 }); } for (const z of [-7, 7]) { b.box([0, 22.6, z], [176, 0.25, 0.25], "#2e3236", { material: "Metal", collide: false, lod: 1 }); for (let i = 0; i < 8; i++) { const x = -74 + i * 21 + (z > 0 ? 8 : 0); b.box([x, 18.6, z], [0.2, 7.6, 0.2], "#2e3236", { material: "Metal", collide: false, lod: 0 }); b.box([x, 14.6, z], [1.4, 0.4, 5], k.accent, { material: "SmoothPlastic", collide: false, lod: 1 }); b.box([x - 0.7, 16, z], [0.3, 2.6, 5], k.accent, { material: "SmoothPlastic", collide: false, lod: 0 }); } } } },
  forum: { lot: [76, 60], ring: [0, 0.5], wants: { road: 0.6 }, pave: "stone", open: true, build: (b, k) => { for (const s of [-1, 1]) { columns(b, k, 0, s * 26, 64, 12, 11); b.box([0, 13.6, s * 26], [70, 1.6, 4], k.trim, { material: "Marble", collide: true, lod: 2 }); b.wedge([0, 15.2, s * 27.6], [70, 2, 5], k.roof, { material: k.top, collide: false, lod: 1, rotation: [0, s > 0 ? 180 : 0, 0] }); } hall(b, { ...k, solid: "Marble" }, 30, 0, 16, 26, 15, { roof: "gable", windows: false }); b.box([-14, 1.6, 0], [5, 3.2, 5], k.stone, { material: "Marble", collide: true, lod: 2 }); b.cylinder([-14, 9, 0], 2.2, 12, k.trim, { material: "Marble", collide: true, lod: 1 }); b.sphere([-14, 16.2, 0], 2.6, "#c49a3a", { material: "Metal", collide: false, lod: 1 }); }, dress: [["amphora", -26, -14, 0], ["amphora", -28, 12, 0], ["bench", 0, -16, 0], ["bench", 0, 16, 180]] },
  amphitheatre: { lot: [74, 60], ring: [0.5, 1.2], wants: { high: 0.4 }, pave: "stone", open: true, build: (b, k) => { for (let r = 0; r < 6; r++) for (let i = 0; i < 12; i++) { const a = (Math.PI * (i + 0.5)) / 12; const R = 14 + r * 4; b.box([Math.cos(a) * R, 1 + r, Math.sin(a) * R - 8], [(Math.PI * R) / 12 + 0.6, 2 + r * 2, 4.2], mixHex(k.stone, "#ffffff", 0.1 + (r % 2) * 0.08), { material: "Marble", collide: true, lod: r > 3 ? 2 : 1, rotation: [0, 90 - (a * 180) / Math.PI, 0] }); } b.cylinder([0, 0.2, -8], 24, 0.4, "#d9c79b", { material: "Sand", collide: true, lod: 2 }); columns(b, k, 0, -20, 34, 10, 7); b.box([0, 11.4, -20], [40, 1.4, 4], k.trim, { material: "Marble", collide: true, lod: 2 }); } },
  laboratory: { lot: [56, 44], ring: [0.4, 1.2], wants: { road: 0.6 }, pave: "stone", build: (b, k) => { hall(b, k, -6, 2, 36, 24, 14, { wall: "#e3e7ea" }); b.sphere([18, 7, 2], 20, "#cfd6da", { material: "SmoothPlastic", collide: true, lod: 2 }); b.box([-6, 8, -10.6], [32, 4, 0.5], "#2f86a8", { material: "Neon", collide: false, lod: 0 }); b.cylinder([-18, 19, 8], 1, 9, "#9aa5ab", { material: "Metal", collide: false, lod: 0 }); b.sphere([-18, 24, 8], 4, "#e5e9ea", { collide: false, lod: 1 }); }, dress: [["sci_crate", 10, -16, 0], ["antenna_dish", -22, -14, 0]] },
  greenhouse: { lot: [40, 30], ring: [0.4, 1.2], pave: "stone", build: (b, k) => { for (let i = 0; i < 7; i++) { const a = (Math.PI * (i + 0.5)) / 7; b.box([0, 1 + Math.sin(a) * 9, Math.cos(a) * 10], [34, 0.5, 5], "#bfe3df", { ...GLASS, rotation: [(a * 180) / Math.PI - 90, 0, 0] }); } for (let i = 0; i < 6; i++) { b.box([-14 + i * 5.6, 1, 0], [3, 2, 14], "#6b4a2e", { material: "WoodPlanks", collide: true, lod: 1 }); b.box([-14 + i * 5.6, 2.6, 0], [2.8, 1.4, 13.6], ["#4f8a3a", "#6fa04a", "#8a6fb0"][i % 3]!, { material: "Grass", collide: false, lod: 0 }); } for (const s of [-1, 1]) b.box([s * 17, 5, 0], [0.6, 10, 1], k.trim, { material: "Metal", collide: true, lod: 1 }); } },
  landing_pad: { lot: [50, 50], ring: [0.8, 1.6], wants: { homes: -0.5 }, pave: "asphalt", open: true, build: (b, k) => { b.cylinder([0, 1.5, 0], 40, 3, "#5a6066", { material: "Metal", collide: true, lod: 2 }); b.cylinder([0, 3.1, 0], 30, 0.2, "#8e959b", { material: "Metal", collide: true, lod: 1 }); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.box([Math.cos(a) * 18.4, 3.6, Math.sin(a) * 18.4], [1.4, 1.2, 1.4], k.accent, { material: "Neon", collide: false, lod: 0 }); } for (const s of [-1, 1]) b.box([s * 22, 9, 14], [1.6, 18, 1.6], "#8e959b", { material: "Metal", collide: true, lod: 1 }); } },
  shelter: { lot: [24, 22], ring: [1.4, 4], wants: { water: 0.5, homes: -0.6 }, pave: "grass", build: (b, k) => { for (const s of [-1, 1]) b.box([s * 5, 3, 1], [0.8, 6, 0.8], k.wood, { material: "Wood", collide: true, lod: 1 }); b.box([0, 3, 6], [12, 6, 0.8], k.wood, { material: "WoodPlanks", collide: true, lod: 2 }); for (const s of [-1, 1]) b.box([s * 6, 3, 3.4], [0.8, 6, 6], k.wood, { material: "WoodPlanks", collide: true, lod: 2 }); b.box([0, 6.8, 2.6], [14, 0.7, 11], k.roof, { material: k.top, collide: true, lod: 2, rotation: [-12, 0, 0] }); b.box([-3, 1, 4], [4, 1, 3], "#8a6f52", { material: "Fabric", collide: true, lod: 0 }); }, dress: [["campfire", 0, -7, 0], ["log", 6, -8, 40], ["crate", -7, -3, 0]] },
  resource_camp: { lot: [30, 28], ring: [1.6, 5], wants: { homes: -1 }, pave: "grass", build: (b, k) => { for (let i = 0; i < 5; i++) for (let j = 0; j < 3 - Math.floor(i / 2); j++) b.box([-8 + j * 0.2, 0.9 + j * 1.5, -5 + i * 2.4], [10, 1.6, 1.6], k.wood, { material: "Wood", collide: true, lod: 1 }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([7 + sx * 4, 4, sz * 4], [0.7, 8, 0.7], k.wood, { material: "Wood", collide: true, lod: 1 }); b.box([7, 8.2, 0], [11, 0.6, 11], k.roof, { material: k.top, collide: true, lod: 2 }); b.box([7, 1.4, 0], [6, 2.8, 4], "#7a7f84", { material: "Slate", collide: true, lod: 1 }); }, dress: [["crate", 2, 9, 0], ["barrel", -4, 10, 0], ["torch_post", 13, -8, 0]] },
  ruined_block: { lot: [46, 36], ring: [0.2, 0.9], wants: { road: 0.6 }, pave: "stone", build: (b, k) => { const c = mixHex(k.wall, "#6b655d", 0.5); const rows: [number, number, number, number][] = [[-18, -14, 14, 20], [-4, -14, 8, 11], [12, -14, 12, 16], [-18, 14, 10, 9], [4, 14, 16, 14]]; for (const [x, z, w, h] of rows) { b.box([x, h / 2, z], [w, h, 1.4], c, { material: k.solid, collide: true, lod: 2 }); b.box([x + w * 0.3, h * 0.55, z], [3, 4, 2], "#1d1b19", { collide: false, lod: 0 }); } for (const s of [-1, 1]) b.box([s * 21, 6 + (s > 0 ? 3 : 0), 0], [1.4, 12 + (s > 0 ? 6 : 0), 26], c, { material: k.solid, collide: true, lod: 2 }); b.box([-8, 9, 4], [22, 0.8, 16], mixHex(c, "#000000", 0.25), { material: "WoodPlanks", collide: true, lod: 1, rotation: [9, 0, 6] }); for (let i = 0; i < 14; i++) b.box([k.rng.float(-18, 18), k.rng.float(0.4, 1.6), k.rng.float(-11, 11)], [k.rng.float(1.5, 5), k.rng.float(1, 3), k.rng.float(1.5, 4)], mixHex(c, "#3b3733", k.rng.next() * 0.4), { material: k.solid, collide: true, lod: 1, rotation: [k.rng.float(-20, 20), k.rng.float(0, 180), k.rng.float(-20, 20)] }); }, dress: [["rubble_pile", 18, -18, 0], ["rubble_pile", -20, 4, 60], ["burning_barrel", 8, 0, 0], ["barricade", 0, -19, 0]] },
  grandstand: { lot: [70, 30], ring: [0, 9], pave: "stone", build: (b, k) => { for (let r = 0; r < 7; r++) { b.box([0, 1 + r, -8 + r * 3], [64, 2 + r * 2, 3.2], mixHex("#c9ccd0", "#ffffff", (r % 2) * 0.2), { material: "Concrete", collide: true, lod: 2 }); for (let i = 0; i < 21; i++) b.box([-30 + i * 3, 2.8 + r * 2, -8 + r * 3], [1.8, 1.2, 1.4], i % 5 ? k.accent : "#f2f0ea", { collide: false, lod: 0 }); } for (let i = 0; i < 5; i++) b.box([-28 + i * 14, 13, 12], [1, 26, 1], k.trim, { material: "Metal", collide: true, lod: 1 }); b.box([0, 26, 2], [66, 0.8, 24], k.roof, { material: "Metal", collide: true, lod: 2, rotation: [-7, 0, 0] }); } },
};

const WALL_MATERIAL: Record<string, Solid> = { timber_frame: "Concrete", modern_house: "Concrete", apartment_block: "Concrete", industrial_shed: "Brick", bunker: "Concrete", scifi_module: "SmoothPlastic", cyber_block: "Metal", greek_temple: "Marble", egyptian: "Sandstone", desert_adobe: "Concrete", victorian: "Brick", gothic: "Slate", nordic: "WoodPlanks" };


/** The lot a place asks for, and whether it belongs inside the town (a hospital) or outside it (a runway). */
export function facilityLot(id: FacilityId): { lot: [number, number]; central: boolean; ring: number; beside: FacilityId[] } {
  const d = DEFS[id];
  const ring = (d.ring[0] + d.ring[1]) / 2;
  return { lot: d.lot, central: d.lot[0] <= 110 && d.ring[1] < 1.75 && !d.wants?.high && !d.wants?.water, ring: Math.min(1, ring * 0.85), beside: d.beside ?? [] };
}

export function facilityKit(ctx: GenContext, rng: Rng): Kit {
  const p = ctx.style.palette as unknown as Record<string, string>;
  const road = ctx.style.kits.road;
  const future = ["scifi_module", "cyber_block"].includes(ctx.style.architecture.style);
  const old = !future && !["asphalt_road", "concrete_road", "neon_road"].includes(road);
  const wall = p.wall ?? mixHex(p.stone ?? "#8f8d88", "#e8dcc0", 0.6);
  return { wall, wall2: mixHex(wall, "#ffffff", 0.12), roof: p.roof ?? mixHex(p.wood ?? "#6b4a2e", "#7a3a2c", 0.5), trim: mixHex(p.stone ?? "#8f8d88", "#ffffff", 0.18), accent: p.accent ?? "#9c2f2a", stone: p.stone ?? "#8f8d88", wood: p.wood ?? "#6b4a2e", old, future, solid: WALL_MATERIAL[ctx.style.architecture.style] ?? "Concrete", top: old ? "Slate" : "Metal", rng };
}

/** Levels the lot, builds the place and what stands around it, names it, and opens a drive to the nearest road. */
export function buildFacility(ctx: GenContext, kit: Kit, id: FacilityId, at: Vec2, yaw: number, groundY: number, site: SettlementSite | undefined, drive: boolean): void {
  const def = DEFS[id];
  const [lw, ld] = def.lot;
  const rng = kit.rng;
  const road = ctx.style.kits.road;
  const old = kit.old;
  const n = ctx.zones.filter((z) => z.meta?.kind === "facility").length;
  // `n` of a plot points away from the street: the lot's +Z
  const away: Vec2 = [Math.sin(yaw), Math.cos(yaw)];
  const y = id === "ski_lift" ? groundY : levelPad(ctx, { x: at[0], z: at[1], n: away, hx: lw / 2, hz: ld / 2 }, groundY, 12);
  const b = new PartListBuilder();
  def.build(b, kit);
  const variant: PrefabVariant = b.build({ id: `facility_${id}`, prefab: `facility_${id}`, category: "building", sinkDepth: 0, tags: def.open ? ["layout"] : ["interior"] });
  const prefab = `facility_${id}`;
  const list = (ctx.prefabs[prefab] ??= []);
  list.push({ ...variant, id: `${prefab}/${list.length}`, prefab });
  const zone = `facility_${id}_${n}`;
  const pos: Vec3 = [at[0], id === "ski_lift" ? ctx.heights.sample(at[0], at[1]) : y, at[1]];
  const place: Placement = { id: `dress_${zone}`, prefab, variant: list.length - 1, category: "building", position: pos, rotationY: yaw, scale: 1, layer: layerFor(ctx, at[0], at[1], true), zone, importance: 9.6 };
  if (id === "ski_lift") {
    // the line follows the slope: both stations meet the ground
    const u: Vec2 = [Math.cos(yaw), -Math.sin(yaw)];
    const ya = ctx.heights.sample(at[0] - u[0] * 88, at[1] - u[1] * 88);
    const yb = ctx.heights.sample(at[0] + u[0] * 88, at[1] + u[1] * 88);
    const pitch = Math.atan2(yb - ya, 176);
    place.up = [-u[0] * Math.sin(pitch), Math.cos(pitch), -u[1] * Math.sin(pitch)];
    place.position = [at[0], (ya + yb) / 2, at[1]];
    place.fixed = true;
  }
  ctx.placements.push(place);
  ctx.occupants.push({ position: pos, radius: Math.min(lw, ld) * 0.5, kind: "building" });
  const steps = Math.ceil(lw / ld);
  for (let i = 0; i < steps && steps > 1; i++) {
    const u = -lw / 2 + (lw * (i + 0.5)) / steps;
    ctx.occupants.push({ position: [at[0] + u * Math.cos(yaw), y, at[1] - u * Math.sin(yaw)], radius: ld * 0.5, kind: "building" });
  }
  ctx.zones.push({ id: zone, kind: "gameplay", polygon: [], center: at, radius: Math.max(lw, ld) / 2, meta: { kind: "facility", facility: id } });
  const plan = ctx.plan.settlements.find((q) => q.settlement === site?.id);
  plan?.parcels.push({ id: zone, district: site!.id, function: ["barracks", "motor_pool", "helipad", "watch_post"].includes(id) ? "military" : ["warehouse", "tank_farm", "power_plant", "hangar", "resource_camp"].includes(id) ? "craft" : "civic", center: at, rotationY: yaw, frontage: lw, depth: ld, street: "", building: place.id });
  // the ground of the lot
  const mat = def.pave === "asphalt" ? (old ? TERRAIN_MATERIAL_INDEX.Ground : TERRAIN_MATERIAL_INDEX.Asphalt) : def.pave === "stone" ? (old ? TERRAIN_MATERIAL_INDEX.Cobblestone : TERRAIN_MATERIAL_INDEX.Pavement) : -1;
  if (mat >= 0) {
    const cs = ctx.cellSize;
    for (let i = 0; i <= lw / cs; i++) for (let j = 0; j <= ld / cs; j++) {
      const qx = at[0] + (-lw / 2 + i * cs) * Math.cos(yaw) + (-ld / 2 + j * cs) * Math.sin(yaw);
      const qz = at[1] - (-lw / 2 + i * cs) * Math.sin(yaw) + (-ld / 2 + j * cs) * Math.cos(yaw);
      const ix = Math.round((qx - ctx.origin[0]) / cs);
      const iz = Math.round((qz - ctx.origin[1]) / cs);
      if (ix >= 0 && iz >= 0 && ix < ctx.width && iz < ctx.depth) ctx.materials[iz * ctx.width + ix] = mat;
    }
  }
  for (const [prop, u, w, turn] of def.dress ?? []) {
    const vs = ctx.prefabs[prop];
    if (!vs?.length) continue;
    const px = at[0] + u * Math.cos(yaw) + w * Math.sin(yaw);
    const pz = at[1] - u * Math.sin(yaw) + w * Math.cos(yaw);
    if (isWaterAt(ctx, px, pz) || baseRelief(ctx, px, pz, 2) > 3) continue;
    const vi = rng.int(0, vs.length - 1);
    ctx.placements.push({ id: `dress_${zone}_${prop}_${Math.round(u)}_${Math.round(w)}`, prefab: prop, variant: vi, category: vs[vi]!.category, position: [px, ctx.heights.sample(px, pz), pz], rotationY: yaw + (turn * Math.PI) / 180, scale: 1, layer: layerFor(ctx, px, pz, false), zone, importance: 6 });
  }
  if (!drive) return;
  // a drive to the nearest road
  const door: Vec2 = id === "runway" ? [at[0] - away[0] * (ld / 2 + 3), at[1] - away[1] * (ld / 2 + 3)] : [at[0] - away[0] * (ld / 2 + 2), at[1] - away[1] * (ld / 2 + 2)];
  const from = nearestRoadPoint(ctx, door);
  if (from && Math.hypot(from[0] - door[0], from[1] - door[1]) > 9 && Math.hypot(from[0] - door[0], from[1] - door[1]) < 420) {
    const pts = routeRoad(ctx, rng, [from, door], { waterCost: 25 });
    if (pts && pts.length > 2 && !pts.some((q) => isWaterAt(ctx, q[0], q[1]))) {
      const wild = id === "shelter" || id === "resource_camp" || id === "watch_post" || id === "ski_lift";
      const type = wild ? (["snow_path", "sand_path"].includes(road) ? road : "dirt_path") : road;
      const width = wild ? 4 : id === "runway" || id === "terminal" || id === "hangar" ? 12 : 7;
      const rid = `${site?.id ?? "map"}_drive_${zone}`;
      ctx.paths.push({ id: rid, kind: "road", type, points: pts, width });
      carveRoad(ctx, pts, width, type);
      placeStairs(ctx, rid, pts);
      refreshRoadDistance(ctx);
    }
  }
}

export function placeFacilities(ctx: GenContext): void {
  const design = ctx.spec.design;
  if (!design || design.facilities.length === 0 || ctx.islands) return;
  progress(ctx, "facilities", 0);
  const rng = new Rng(deriveSeed(ctx.seed, "facilities"));
  const kit = facilityKit(ctx, rng);
  const main = [...ctx.sites].sort((a, b) => b.radius - a.radius)[0];
  const keepOut = layoutKeepOut(ctx);
  const homes = ctx.placements.filter((q) => q.category === "building" && /house|cottage|apartment|shop/.test(q.prefab)).map((q) => [q.position[0], q.position[2]] as Vec2);
  // what the town already built in its own blocks
  const built = ctx.zones.filter((q) => q.meta?.kind === "facility").map((q) => ({ id: q.meta!.facility as FacilityId, at: q.center as Vec2 }));
  // the largest lots first: a runway has few places to go
  const left = [...design.facilities];
  for (const q of built) if (left.includes(q.id)) left.splice(left.indexOf(q.id), 1);
  const order = left.sort((a, b) => DEFS[b].lot[0] * DEFS[b].lot[1] - DEFS[a].lot[0] * DEFS[a].lot[1]);
  const [sx, , sz] = ctx.spawn.position;
  const look = Math.atan2(ctx.spawn.lookAt[2] - sz, ctx.spawn.lookAt[0] - sx);
  for (const id of order) {
    const def = DEFS[id];
    const site: SettlementSite | undefined = main;
    const c: Vec2 = site ? site.center : keepOut ? keepOut.center : [ctx.origin[0] + ctx.worldW / 2, ctx.origin[1] + ctx.worldD / 2];
    const R = site?.radius ?? (keepOut ? keepOut.radius : Math.min(ctx.worldW, ctx.worldD) * 0.2);
    const [lw, ld] = def.lot;
    let best: { at: Vec2; yaw: number; v: number; y: number } | null = null;
    const tries = id === "runway" || id === "ski_lift" ? 900 : 520;
    // the second half of the search looks further and accepts more earthwork
    for (let k = 0; k < tries * 2 && !(k >= tries && best); k++) {
      const wide = k >= tries ? 1.7 : 1;
      const a = k * 2.39996 + rng.next() * 0.3;
      const ring = keepOut && !site ? 1.05 + rng.next() * 1.2 : def.ring[0] + (def.ring[1] * wide - def.ring[0]) * Math.sqrt(rng.next()) * wide;
      const x = c[0] + Math.cos(a) * ring * R;
      const z = c[1] + Math.sin(a) * ring * R;
      if (!inBounds(ctx, x, z, Math.max(lw, ld) * 0.5 + 30)) continue;
      const rd = ctx.roadDistance.sample(x, z);
      if (rd > 190 * wide && !def.wants?.high && id !== "shelter" && id !== "resource_camp") continue;
      const g = ctx.analysis!.at(x, z);
      if (g.cls === "water" || g.cls === "cliff") continue;
      // the front looks at the street, else at the settlement; a lift climbs the slope, a runway lies along the contour
      const near = nearestRoadPoint(ctx, [x, z]);
      let yaw = near ? Math.atan2(-(near[0] - x), -(near[1] - z)) : Math.atan2(-(c[0] - x), -(c[1] - z));
      const gx = ctx.heights.sample(x + 30, z) - ctx.heights.sample(x - 30, z);
      const gz = ctx.heights.sample(x, z + 30) - ctx.heights.sample(x, z - 30);
      if (id === "ski_lift") yaw = Math.atan2(-gz, gx);
      if (id === "runway") yaw = (k % 4) * (Math.PI / 4);
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const world = (u: number, w: number): Vec2 => [x + u * cos + w * sin, z - u * sin + w * cos];
      // the whole lot: dry, free, and not hanging over a drop
      let lo = Infinity;
      let hi = -Infinity;
      let ok = true;
      const nu = Math.max(3, Math.round(lw / 14));
      const nw = Math.max(3, Math.round(ld / 12));
      for (let i = 0; i <= nu && ok; i++) for (let j = 0; j <= nw && ok; j++) {
        const [qx, qz] = world(-lw / 2 + (lw * i) / nu, -ld / 2 + (ld * j) / nw);
        if (!inBounds(ctx, qx, qz, 20) || isWaterAt(ctx, qx, qz) || ctx.waterDistance.sample(qx, qz) < 8) ok = false;
        else if (ctx.roadDistance.sample(qx, qz) < 1.5) ok = false;
        else if (id !== "ski_lift" && ctx.padMask?.[Math.round((qz - ctx.origin[1]) / ctx.cellSize) * ctx.width + Math.round((qx - ctx.origin[0]) / ctx.cellSize)]) ok = false;
        const y = ctx.heights.sample(qx, qz);
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
      if (!ok) continue;
      const steep = id === "ski_lift" ? 90 : id === "runway" ? 34 : def.open ? 14 : 16;
      if (hi - lo > wide * (ctx.terrainMode === "parts" && id !== "runway" ? Math.max(GROUND_STEP * 1.1, steep * 0.6) : steep)) continue;
      for (const o of ctx.occupants) {
        const dx = o.position[0] - x;
        const dz = o.position[2] - z;
        const u = Math.abs(dx * cos - dz * sin) - lw / 2;
        const w = Math.abs(dx * sin + dz * cos) - ld / 2;
        if (Math.hypot(Math.max(0, u), Math.max(0, w)) < o.radius + (o.kind === "keep" ? 4 : 3)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const fdx = x - sx;
      const fdz = z - sz;
      const ahead = fdx * Math.cos(look) + fdz * Math.sin(look);
      if (ahead > 0 && ahead < 150 && Math.abs(-fdx * Math.sin(look) + fdz * Math.cos(look)) < lw * 0.5 + 8) continue;
      if (Math.hypot(fdx, fdz) < Math.max(lw, ld) * 0.5 + 40) continue;
      let v = g.buildable * 1.4 - (hi - lo) / 12 + rng.next() * 0.3;
      const w = def.wants ?? {};
      v -= (Math.max(0, rd - 14) / 90) * (w.road ?? 0.5);
      if (w.high) v += g.altitude * w.high * 2 + (g.tpi / 20) * w.high;
      if (w.water) v += Math.max(0, 1 - ctx.waterDistance.sample(x, z) / 140) * w.water;
      if (w.homes && homes.length) {
        const dHome = Math.min(...homes.map((q) => Math.hypot(q[0] - x, q[1] - z)));
        v += (w.homes > 0 ? Math.max(0, 1 - dHome / 120) : -Math.max(0, 1 - dHome / 150)) * Math.abs(w.homes);
      }
      for (const q of built) {
        const dd = Math.hypot(q.at[0] - x, q.at[1] - z);
        if (def.beside?.includes(q.id)) v += Math.max(0, 1 - dd / 260) * 1.6;
        else if (q.id === id) v -= Math.max(0, 1 - dd / 200) * 0.8;
      }
      if (!best || v > best.v) best = { at: [x, z], yaw, v, y: (lo + hi) / 2 };
    }
    if (!best) continue;
    const { at, yaw } = best;
    buildFacility(ctx, kit, id, at, yaw, best.y, site, true);
    built.push({ id, at });
  }
  progress(ctx, "facilities", 1);
}
