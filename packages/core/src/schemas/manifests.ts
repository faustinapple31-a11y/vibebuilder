import { z } from "zod";

/** Asset Registry entry (local library, open-source/licensed or generated). */
export const ASSET_CATEGORIES = ["vegetation", "rock", "building", "prop", "landmark", "npc", "ui", "audio", "image", "mesh"] as const;
export const AssetCategorySchema = z.enum(ASSET_CATEGORIES);

export const AssetEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: AssetCategorySchema,
  subcategory: z.string().default(""),
  style: z.string().default("stylized_low_poly"),
  biome: z.string().default("any"),
  rarity: z.enum(["common", "uncommon", "rare", "unique"]).default("common"),
  boundingBox: z.tuple([z.number(), z.number(), z.number()]).default([4, 4, 4]),
  scale: z.tuple([z.number(), z.number()]).default([1, 1]),
  rotation: z.enum(["any", "fixed", "y-only"]).default("y-only"),
  materials: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  /** "procedural" (PartList prefab), "file" (rbxmx/obj/glb on disk), "roblox" (asset id), "generated" (AI provider). */
  source: z.enum(["procedural", "file", "roblox", "generated"]).default("procedural"),
  license: z.string().default("CC0"),
  thumbnail: z.string().optional(),
  filePath: z.string().optional(),
  robloxAssetId: z.number().int().optional(),
  favorite: z.boolean().default(false),
  collections: z.array(z.string()).default([]),
});
export type AssetEntry = z.infer<typeof AssetEntrySchema>;

/** Output of the Asset Agent: what the game needs and where it comes from. */
export const AssetManifestSchema = z.object({
  required: z
    .array(
      z.object({
        id: z.string().min(1),
        purpose: z.string().default(""),
        category: AssetCategorySchema,
        resolution: z
          .discriminatedUnion("kind", [
            z.object({ kind: z.literal("prefab"), prefab: z.string() }),
            z.object({ kind: z.literal("registry"), assetId: z.string() }),
            z.object({ kind: z.literal("generate"), provider: z.enum(["image", "mesh", "audio"]), prompt: z.string() }),
            z.object({ kind: z.literal("roblox"), assetId: z.number().int() }),
          ])
          .prefault({ kind: "prefab", prefab: "bush" }),
      }),
    )
    .default([]),
});
export type AssetManifest = z.infer<typeof AssetManifestSchema>;

export const AudioManifestSchema = z.object({
  music: z.array(z.object({ id: z.string(), prompt: z.string(), loop: z.boolean().default(true), file: z.string().optional(), robloxAssetId: z.number().int().optional() })).default([]),
  sfx: z.array(z.object({ id: z.string(), prompt: z.string(), file: z.string().optional(), robloxAssetId: z.number().int().optional() })).default([]),
  ambience: z.array(z.object({ id: z.string(), prompt: z.string(), zone: z.string().optional(), file: z.string().optional(), robloxAssetId: z.number().int().optional() })).default([]),
});
export type AudioManifest = z.infer<typeof AudioManifestSchema>;

/** QA report produced by the quality package and/or QA agent. */
export const QAProblemSchema = z.object({
  id: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  message: z.string(),
  layer: z.enum(["terrain", "water", "roads", "landmarks", "buildings", "vegetation", "props", "lighting", "code", "ui", "audio", "build", "performance", "composition"]).optional(),
  location: z.tuple([z.number(), z.number(), z.number()]).optional(),
});
export type QAProblem = z.infer<typeof QAProblemSchema>;

export const QAFixSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("spec_patch"), path: z.string(), op: z.enum(["set", "add", "remove"]), value: z.unknown().optional() }),
  z.object({ type: z.literal("regenerate"), layers: z.array(z.string()).min(1), newSeed: z.boolean().default(false) }),
  z.object({ type: z.literal("code_fix"), file: z.string(), description: z.string() }),
  z.object({ type: z.literal("manual"), description: z.string() }),
]);
export type QAFix = z.infer<typeof QAFixSchema>;

export const QAScoresSchema = z.object({
  composition: z.number().min(0).max(10),
  lighting: z.number().min(0).max(10),
  terrain: z.number().min(0).max(10),
  vegetation: z.number().min(0).max(10),
  architecture: z.number().min(0).max(10),
  assetConsistency: z.number().min(0).max(10),
  atmosphere: z.number().min(0).max(10),
  variety: z.number().min(0).max(10),
  performance: z.number().min(0).max(10),
});
export type QAScores = z.infer<typeof QAScoresSchema>;

export const QAReportSchema = z.object({
  score: z.number().min(0).max(100),
  scores: QAScoresSchema,
  problems: z.array(QAProblemSchema).default([]),
  fixes: z.array(QAFixSchema).default([]),
  source: z.enum(["metrics", "vision", "combined"]).default("metrics"),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type QAReport = z.infer<typeof QAReportSchema>;
