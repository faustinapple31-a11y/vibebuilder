import { z } from "zod";

/**
 * GameSpec — output of the Design Agent. Describes the game, not the world.
 */

export const GAME_GENRES = [
  "survival",
  "adventure",
  "rpg",
  "dungeon_crawler",
  "obby",
  "parkour",
  "tycoon",
  "simulator",
  "clicker",
  "pet_collecting",
  "horror",
  "roleplay",
  "hangout",
  "battle",
  "battle_royale",
  "fps",
  "tower_defense",
  "racing",
  "sports",
  "fighting",
  "puzzle",
  "story",
  "sandbox",
  "farming",
  "mining",
  "minigames",
  "strategy",
  "rhythm",
  "exploration",
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
  "enemies",
  "racing",
  "tower_defense",
  "farming",
  "mining",
  "building",
  "jobs",
  "sports",
  "puzzle",
  "story",
  "clicker",
  "parkour",
  "minigames",
  "trading",
  "housing",
  "vehicles",
  "teams",
  "capture_points",
  "abilities",
  "rhythm",
] as const;
export const GameplaySystemIdSchema = z.enum(GAMEPLAY_SYSTEMS);
export type GameplaySystemId = z.infer<typeof GameplaySystemIdSchema>;

export const ShopEffectSchema = z.object({
  /** multiplier: stat × value permanently · buff: stat × value for durationSeconds · grant_coins: +value coins · cosmetic: flag only */
  type: z.enum(["multiplier", "buff", "grant_coins", "grant_item", "cosmetic"]).default("cosmetic"),
  stat: z.string().optional(),
  value: z.number().default(2),
  durationSeconds: z.number().int().min(0).default(0),
  item: z.string().optional(),
});
export type ShopEffect = z.infer<typeof ShopEffectSchema>;

export const ShopItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  section: z.string().default("upgrades"),
  /** Coins price (in-game currency). */
  price: z.number().int().min(0).default(100),
  /** Consumables can be bought repeatedly ("You have: N"); upgrades are owned once. */
  consumable: z.boolean().default(false),
  effect: ShopEffectSchema.prefault({}),
  /** Decal asset id for the card icon (optional; the UI falls back to a styled glyph). */
  iconAssetId: z.number().int().optional(),
  /** Card tint. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
export type ShopItem = z.infer<typeof ShopItemSchema>;

/** One-time discounted pack of catalog items ("Starter Pack"): items are granted, the pack is owned once. */
export const ShopBundleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default("One-time offer — everything you need to start strong!"),
  items: z.array(z.object({ itemId: z.string().min(1), count: z.number().int().min(1).default(1) })).min(1),
  /** Coins price of the pack. */
  price: z.number().int().min(0),
  /** Shown struck through next to the price (defaults to the sum of the items). */
  originalPrice: z.number().int().min(0).optional(),
  /** Sticker text ("-97%", "HOT"); defaults to the computed discount. */
  badge: z.string().max(12).optional(),
});
export type ShopBundle = z.infer<typeof ShopBundleSchema>;

/** Procedural animation: keyframes of joint rotations (degrees, Euler XYZ) on an R15 rig. */
export const AnimSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Loop for idles, one-shot for emotes/attacks. */
  loop: z.boolean().default(false),
  priority: z.enum(["Idle", "Movement", "Action"]).default("Action"),
  durationSeconds: z.number().min(0.1).max(30).default(1.5),
  keyframes: z
    .array(
      z.object({
        /** 0..1 of the duration */
        t: z.number().min(0).max(1),
        /** joint name → [rx, ry, rz] degrees; R15 joints: LeftShoulder, RightShoulder, LeftElbow, RightElbow, Neck, Waist, LeftHip, RightHip, LeftKnee, RightKnee, Root */
        joints: z.record(z.string(), z.tuple([z.number(), z.number(), z.number()])),
      }),
    )
    .min(2),
});
export type AnimSpec = z.infer<typeof AnimSpecSchema>;

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
        role: z.enum(["merchant", "quest_giver", "guard", "villager", "enemy", "companion", "zombie", "monster", "boss", "animal", "shopkeeper", "trainer"]).default("villager"),
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
          type: z.enum(["collect", "reach", "talk", "defeat", "survive", "build", "escape", "win_rounds", "score", "craft", "deliver"]),
          target: z.string(),
          count: z.number().int().min(1).default(1),
        }),
        reward: z.object({ currency: z.string().optional(), amount: z.number().default(0), item: z.string().optional() }).prefault({}),
      }),
    )
    .default([]),
  ui: z
    .object({
      screens: z.array(z.enum(["hud", "inventory", "shop", "settings", "quests", "gamepass_shop", "loading", "menu", "leaderboard", "crafting", "teams", "round_status", "minimap"])).default(["hud"]),
      style: z.enum(["stylized", "minimal", "fantasy", "sci-fi", "cartoon", "horror", "modern", "retro", "military", "candy"]).default("stylized"),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#b48cff"),
    })
    .prefault({}),
  monetization: z
    .object({
      gamepasses: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().default(""), priceRobux: z.number().int().min(0).default(99), robloxId: z.number().int().optional(), iconAssetId: z.number().int().optional(), effect: ShopEffectSchema.optional() })).default([]),
      developerProducts: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().default(""), priceRobux: z.number().int().min(0).default(49), robloxId: z.number().int().optional(), iconAssetId: z.number().int().optional(), effect: ShopEffectSchema.optional() })).default([]),
    })
    .prefault({}),
  /** In-game shop (coins economy): upgrades, potions, consumables. Robux items come from `monetization`. */
  shop: z
    .object({
      title: z.string().default("Shop"),
      sections: z.array(z.object({ id: z.string(), title: z.string() })).default([
        { id: "upgrades", title: "Upgrades" },
        { id: "potions", title: "Potions" },
      ]),
      items: z.array(ShopItemSchema).default([]),
      bundles: z.array(ShopBundleSchema).default([]),
      /** Big banner at the top of the shop: a consumable buff with a headline ("BOOST Server Luck!"). */
      featured: z.object({ itemId: z.string().min(1), headline: z.string().max(40), note: z.string().max(60).default("") }).optional(),
    })
    .prefault({}),
  /** Character animations used by NPCs / emotes (Roblox catalog ids or procedural presets). */
  animations: z
    .object({
      npcIdle: z.string().default("rbxassetid://507766666"),
      npcWalk: z.string().default("rbxassetid://507777826"),
      greet: z.string().default("rbxassetid://507770239"),
      emotes: z.array(z.object({ id: z.string(), name: z.string(), animationId: z.string() })).default([]),
      /** Procedural keyframe animations built in-game (see template shared/anim). */
      custom: z.array(AnimSpecSchema).default([]),
    })
    .prefault({}),
  /** Music & sounds wired into the game (Roblox audio asset ids). */
  audio: z
    .object({
      ambientMusic: z.string().optional(),
      zoneAmbience: z.array(z.object({ zone: z.string(), soundId: z.string(), volume: z.number().min(0).max(2).default(0.5) })).default([]),
      sfx: z.object({ collect: z.string().optional(), purchase: z.string().optional(), error: z.string().optional(), notify: z.string().optional() }).prefault({}),
      musicVolume: z.number().min(0).max(2).default(0.35),
    })
    .prefault({}),
  worldBrief: z.string().default(""),
  audioBrief: z.string().default(""),
});

export type GameSpec = z.infer<typeof GameSpecSchema>;
export type GameSpecInput = z.input<typeof GameSpecSchema>;
