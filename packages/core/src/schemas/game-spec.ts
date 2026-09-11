import { z } from "zod";

/**
 * GameSpec — output of the Design Agent. Describes the game, not the world.
 */

export const GAME_GENRES = [
  "survival",
  "adventure",
  "obby",
  "tycoon",
  "simulator",
  "rpg",
  "horror",
  "roleplay",
  "battle",
  "exploration",
  "puzzle",
  "racing",
] as const;
export const GameGenreSchema = z.enum(GAME_GENRES);

export const GAMEPLAY_SYSTEMS = [
  "player_data",
  "currency",
  "inventory",
  "survival_stats",
  "collectibles",
  "quests",
  "npcs",
  "shop",
  "pets",
  "weapons",
  "combat",
  "progression",
  "checkpoints",
  "obby",
  "tycoon",
  "simulator_loop",
  "rounds",
  "rng_rolls",
  "leaderboards",
  "matchmaking",
  "day_night",
  "crafting",
] as const;
export const GameplaySystemIdSchema = z.enum(GAMEPLAY_SYSTEMS);
export type GameplaySystemId = z.infer<typeof GameplaySystemIdSchema>;

export const GameSpecSchema = z.object({
  title: z.string().min(1).default("Untitled Game"),
  tagline: z.string().default(""),
  description: z.string().default(""),
  genre: GameGenreSchema.default("adventure"),
  subGenres: z.array(GameGenreSchema).default([]),
  targetAudience: z.enum(["kids", "teens", "all"]).default("all"),
  coreLoop: z.array(z.string()).default([]),
  systems: z
    .array(
      z.object({
        id: GameplaySystemIdSchema,
        description: z.string().default(""),
        params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).prefault({}),
      }),
    )
    .prefault([{ id: "player_data", description: "Persistent player profile" }]),
  currencies: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        icon: z.string().default("coin"),
        startingAmount: z.number().default(0),
      }),
    )
    .default([]),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        category: z.string().default("misc"),
        rarity: z.enum(["common", "uncommon", "rare", "epic", "legendary"]).default("common"),
        stackable: z.boolean().default(true),
      }),
    )
    .default([]),
  npcs: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        role: z.enum(["merchant", "quest_giver", "guard", "villager", "enemy", "companion"]).default("villager"),
        location: z.string().optional(),
        dialogue: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  quests: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().default(""),
        objective: z.object({
          type: z.enum(["collect", "reach", "talk", "defeat", "survive"]),
          target: z.string(),
          count: z.number().int().min(1).default(1),
        }),
        reward: z.object({ currency: z.string().optional(), amount: z.number().default(0), item: z.string().optional() }).prefault({}),
      }),
    )
    .default([]),
  ui: z
    .object({
      screens: z.array(z.enum(["hud", "inventory", "shop", "settings", "quests", "gamepass_shop", "loading", "menu", "leaderboard"])).default(["hud"]),
      style: z.enum(["stylized", "minimal", "fantasy", "sci-fi", "cartoon"]).default("stylized"),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#b48cff"),
    })
    .prefault({}),
  monetization: z
    .object({
      gamepasses: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().default(""), priceRobux: z.number().int().min(0).default(99) })).default([]),
      developerProducts: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().default(""), priceRobux: z.number().int().min(0).default(49) })).default([]),
    })
    .prefault({}),
  worldBrief: z.string().default(""),
  audioBrief: z.string().default(""),
});

export type GameSpec = z.infer<typeof GameSpecSchema>;
export type GameSpecInput = z.input<typeof GameSpecSchema>;
