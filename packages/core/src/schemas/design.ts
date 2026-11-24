import { z } from "zod";

/**
 * The design of a world, decided before anything is generated: what kind of place it is, how big, how it is laid out, what
 * it must contain. The generator reads it, the critic checks the finished map against it. Optional: older specs have none.
 */
export const ENVIRONMENTS = ["urban", "suburban", "rural", "industrial", "agricultural", "coastal", "island", "tropical", "desert", "arctic", "alpine", "mountain", "forest", "jungle", "wetland", "underground", "underwater", "volcanic", "alien", "space", "post_apocalyptic", "historical", "military", "scientific", "fantasy", "abstract"] as const;
export const WORLD_SCALES = ["arena", "neighbourhood", "settlement", "town", "city", "metropolis", "region", "island", "archipelago", "massive"] as const;
export const MORPHOLOGIES = ["organic", "grid", "radial", "linear", "compound", "dispersed"] as const;
export const DENSITIES = ["very_dense", "dense", "medium", "sparse", "open", "wilderness"] as const;

/** Places with a function of their own, built on a lot and served by a road. */
export const FACILITIES = [
  "town_hall", "market", "school", "hospital", "police_station", "fire_station", "park", "parking", "train_station", "terminal", "control_tower", "runway", "hangar", "warehouse", "tank_farm", "power_plant", "barracks", "helipad", "motor_pool", "watch_post", "ski_lift", "forum", "amphitheatre", "laboratory", "greenhouse", "landing_pad", "shelter", "resource_camp", "ruined_block", "grandstand",
] as const;
export type FacilityId = (typeof FACILITIES)[number];

/** Something the request promises, checked on the map that was actually built. */
export const ExpectationSchema = z.object({
  kind: z.enum(["style", "genre", "layout", "settlement", "settlements", "buildings", "landmark", "biome", "feature", "water", "facility", "prefab", "relief", "flat"]),
  any: z.array(z.string()).default([]),
  min: z.number().default(1),
  label: z.string(),
});
export type Expectation = z.infer<typeof ExpectationSchema>;

export const DesignSchema = z.object({
  setting: z.string().min(1),
  environment: z.enum(ENVIRONMENTS),
  scale: z.enum(WORLD_SCALES).default("settlement"),
  morphology: z.enum(MORPHOLOGIES).default("organic"),
  density: z.enum(DENSITIES).default("medium"),
  camera: z.enum(["first_person", "third_person", "top_down", "isometric", "fixed", "racing", "strategy"]).default("third_person"),
  players: z.number().int().min(1).max(200).default(12),
  /** 0 closed and tight, 1 open country. */
  openness: z.number().min(0).max(1).default(0.5),
  verticality: z.number().min(0).max(1).default(0.3),
  /** Places to find off the roads: viewpoints and hidden spots. */
  discoveries: z.number().int().min(0).max(12).default(2),
  facilities: z.array(z.enum(FACILITIES)).default([]),
  expects: z.array(ExpectationSchema).default([]),
});
export type WorldDesign = z.infer<typeof DesignSchema>;
