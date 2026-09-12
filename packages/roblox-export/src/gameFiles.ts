import type { GameSpec } from "@worldforge/core";

/**
 * GameSpec → generated roblox-ts data modules (shop catalog, monetization, animations, audio, NPCs).
 * The runtime systems in the template read these files; agents may still edit them by hand.
 */
export interface GeneratedGameFile {
  path: string;
  content: string;
}

const j = (v: unknown) => JSON.stringify(v);
const effectTs = (e: { type: string; stat?: string; value: number; durationSeconds: number; item?: string }) =>
  `{ type: ${j(e.type)}${e.stat ? `, stat: ${j(e.stat)}` : ""}, value: ${e.value}, durationSeconds: ${e.durationSeconds}${e.item ? `, item: ${j(e.item)}` : ""} }`;

export function buildCatalogTs(game: GameSpec): string {
  const items = game.shop.items.map(
    (i) =>
      `\t\t{ id: ${j(i.id)}, name: ${j(i.name)}, description: ${j(i.description)}, section: ${j(i.section)}, price: ${i.price}, consumable: ${i.consumable}, effect: ${effectTs(i.effect)}${i.iconAssetId ? `, iconAssetId: ${i.iconAssetId}` : ""}${i.color ? `, color: ${j(i.color)}` : ""} },`,
  );
  const robux = [
    ...game.monetization.gamepasses.map((g) => ({ ...g, kind: "gamepass" as const })),
    ...game.monetization.developerProducts.map((d) => ({ ...d, kind: "product" as const })),
  ].map(
    (r) =>
      `\t\t{ id: ${j(r.id)}, name: ${j(r.name)}, description: ${j(r.description)}, priceRobux: ${r.priceRobux}, robloxId: ${r.robloxId ?? 0}, kind: ${j(r.kind)}${r.iconAssetId ? `, iconAssetId: ${r.iconAssetId}` : ""}${r.effect ? `, effect: ${effectTs(r.effect)}` : ""} },`,
  );
  return `/**
 * Shop & monetization catalog — generated from design/game.spec.json by WorldForge (editable).
 * Coins items are bought with the in-game currency; Robux items reference game passes / developer
 * products created through Open Cloud (ids filled in by the app after creation).
 */
export type ShopEffectType = "multiplier" | "buff" | "grant_coins" | "grant_item" | "cosmetic";

export interface ShopEffect {
\ttype: ShopEffectType;
\tstat?: string;
\tvalue: number;
\tdurationSeconds: number;
\titem?: string;
}

export interface ShopItem {
\tid: string;
\tname: string;
\tdescription: string;
\tsection: string;
\tprice: number;
\tconsumable: boolean;
\teffect: ShopEffect;
\ticonAssetId?: number;
\tcolor?: string;
}

export interface RobuxItem {
\tid: string;
\tname: string;
\tdescription: string;
\tpriceRobux: number;
\t/** Game pass id or developer product id on Roblox (0 = not created yet). */
\trobloxId: number;
\tkind: "gamepass" | "product";
\ticonAssetId?: number;
\teffect?: ShopEffect;
}

export const ShopCatalog = {
\ttitle: ${j(game.shop.title)},
\tsections: ${j(game.shop.sections)} as { id: string; title: string }[],
\titems: [
${items.join("\n")}
\t] as ShopItem[],
\trobux: [
${robux.join("\n")}
\t] as RobuxItem[],
} as const;
`;
}

export function buildAnimationsTs(game: GameSpec): string {
  const a = game.animations;
  return `/**
 * Animations — generated from design/game.spec.json by WorldForge (editable).
 * Catalog ids are Roblox-owned R15 animations (usable in any experience); \`custom\` entries are procedural
 * keyframe animations built at runtime by shared/anim/keyframes.ts.
 */
export interface AnimKeyframe {
\tt: number;
\tjoints: Record<string, [number, number, number]>;
}

export interface AnimSpec {
\tid: string;
\tname: string;
\tloop: boolean;
\tpriority: "Idle" | "Movement" | "Action";
\tdurationSeconds: number;
\tkeyframes: AnimKeyframe[];
}

export const AnimationConfig = {
\tnpcIdle: ${j(a.npcIdle)},
\tnpcWalk: ${j(a.npcWalk)},
\tgreet: ${j(a.greet)},
\temotes: ${j(a.emotes)} as { id: string; name: string; animationId: string }[],
\tcustom: ${JSON.stringify(a.custom, null, "\t").replace(/\n/g, "\n\t")} as AnimSpec[],
} as const;
`;
}

export function buildAudioTs(game: GameSpec): string {
  const a = game.audio;
  const sfx = {
    collect: a.sfx.collect ?? "rbxasset://sounds/electronicpingshort.wav",
    purchase: a.sfx.purchase ?? "rbxasset://sounds/button.wav",
    error: a.sfx.error ?? "rbxasset://sounds/uuhhh.mp3",
    notify: a.sfx.notify ?? "rbxasset://sounds/clickfast.wav",
  };
  return `/**
 * Audio wiring — generated from design/game.spec.json by WorldForge (editable).
 * Ids are \`rbxassetid://…\` (uploaded through Open Cloud from the app, or free Creator Store audio);
 * the defaults are Roblox built-in \`rbxasset://sounds/*\` files that always exist.
 */
export const AudioConfig = {
\tambientMusic: ${j(a.ambientMusic ?? "")},
\tmusicVolume: ${a.musicVolume},
\tzoneAmbience: ${j(a.zoneAmbience)} as { zone: string; soundId: string; volume: number }[],
\tsfx: ${j(sfx)} as { collect?: string; purchase?: string; error?: string; notify?: string },
} as const;
`;
}

export function buildNpcsTs(game: GameSpec): string {
  const npcs = game.npcs.map((n) => ({ id: n.id, name: n.name, role: n.role, location: n.location ?? "village", dialogue: n.dialogue }));
  return `/** NPC roster — generated from design/game.spec.json by WorldForge (editable). */
export const NpcConfig = {
\tnpcs: ${JSON.stringify(npcs, null, "\t").replace(/\n/g, "\n\t")} as { id: string; name: string; role: string; location?: string; dialogue: string[] }[],
} as const;
`;
}

/** All data modules derived from the GameSpec (config.ts is produced by the agents package). */
export function buildGameFiles(game: GameSpec): GeneratedGameFile[] {
  return [
    { path: "src/shared/catalog.ts", content: buildCatalogTs(game) },
    { path: "src/shared/animations.ts", content: buildAnimationsTs(game) },
    { path: "src/shared/audio.ts", content: buildAudioTs(game) },
    { path: "src/shared/npcs.ts", content: buildNpcsTs(game) },
  ];
}

/** Starter content for a new GameSpec: a real shop, a VIP pass, two products, three villagers. */
export function defaultGameContent(): Pick<GameSpec, "shop" | "monetization" | "npcs" | "animations" | "audio"> {
  return {
    shop: {
      title: "Shop",
      sections: [
        { id: "upgrades", title: "Upgrades" },
        { id: "potions", title: "Potions" },
      ],
      items: [
        { id: "x2_coins", name: "x2 Coins", description: "Permanently DOUBLE all the coins you earn!", section: "upgrades", price: 250, consumable: false, effect: { type: "multiplier", stat: "coins", value: 2, durationSeconds: 0 }, color: "#c9a24a" },
        { id: "x2_food", name: "x2 Food", description: "Permanently DOUBLE the food you collect!", section: "upgrades", price: 180, consumable: false, effect: { type: "multiplier", stat: "food", value: 2, durationSeconds: 0 }, color: "#d9743a" },
        { id: "fast_hands", name: "Fast Hands", description: "Collect twice as fast!", section: "upgrades", price: 320, consumable: false, effect: { type: "multiplier", stat: "speed", value: 2, durationSeconds: 0 }, color: "#5b4a8f" },
        { id: "luck_boost", name: "Luck Boost", description: "Doubles ALL your luck for 15 minutes — rarer finds and drops.", section: "potions", price: 32, consumable: true, effect: { type: "buff", stat: "luck", value: 2, durationSeconds: 900 }, color: "#4a9a4a" },
        { id: "ultra_luck", name: "Ultra Luck Boost", description: "Quadruples ALL your luck (x4) for 10 minutes — the strongest luck surge.", section: "potions", price: 60, consumable: true, effect: { type: "buff", stat: "luck", value: 4, durationSeconds: 600 }, color: "#8a3fbf" },
      ],
    },
    monetization: {
      gamepasses: [{ id: "vip", name: "VIP", description: "VIP tag, +25% coins and a golden lantern.", priceRobux: 199, effect: { type: "multiplier", stat: "coins", value: 1.25, durationSeconds: 0 } }],
      developerProducts: [
        { id: "coins_1000", name: "1,000 coins", description: "A pouch of 1,000 coins.", priceRobux: 99, effect: { type: "grant_coins", value: 1000, durationSeconds: 0 } },
        { id: "gem_pack", name: "Gem pack", description: "A pack of rare gems.", priceRobux: 49, effect: { type: "grant_coins", value: 400, durationSeconds: 0 } },
      ],
    },
    npcs: [
      { id: "elder", name: "Elder Maren", role: "quest_giver", location: "village", dialogue: ["The mushrooms glow brighter every night… something stirs in the old ruins.", "Bring me twenty glowing caps and I will tell you about the giant tree."] },
      { id: "merchant", name: "Tobin the Trader", role: "merchant", location: "village", dialogue: ["Potions, charms, lanterns — take a look at the shop!", "Luck potions are on sale tonight."] },
      { id: "villager", name: "Pip", role: "villager", location: "village", dialogue: ["Don't wander past the stone walls after dark.", "I saw lights dancing over the lake!"] },
    ],
    animations: {
      npcIdle: "rbxassetid://507766666",
      npcWalk: "rbxassetid://507777826",
      greet: "rbxassetid://507770239",
      emotes: [
        { id: "wave", name: "Wave", animationId: "rbxassetid://507770239" },
        { id: "cheer", name: "Cheer", animationId: "rbxassetid://507770677" },
        { id: "dance", name: "Dance", animationId: "rbxassetid://507771019" },
        { id: "laugh", name: "Laugh", animationId: "rbxassetid://507770818" },
        { id: "point", name: "Point", animationId: "rbxassetid://507770453" },
      ],
      custom: [
        {
          id: "lantern_raise",
          name: "Raise lantern",
          loop: false,
          priority: "Action",
          durationSeconds: 1.6,
          keyframes: [
            { t: 0, joints: { RightShoulder: [0, 0, 0] } },
            { t: 0.4, joints: { RightShoulder: [0, 0, 150], Neck: [10, 0, 0] } },
            { t: 0.7, joints: { RightShoulder: [0, 0, 150], Neck: [10, 0, 0] } },
            { t: 1, joints: { RightShoulder: [0, 0, 0], Neck: [0, 0, 0] } },
          ],
        },
      ],
    },
    audio: { ambientMusic: undefined, zoneAmbience: [], sfx: {}, musicVolume: 0.35 },
  };
}
