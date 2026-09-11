import { z } from "zod";
import { LocksSchema, StylePresetIdSchema } from "./world-spec";

/** `worldforge.json` at the root of every generated Roblox project. */
export const ProjectMetaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().default("0.1.0"),
  createdAt: z.string(),
  updatedAt: z.string(),
  stylePreset: StylePresetIdSchema.default("stylized_mystical"),
  currentWorld: z.string().default("main"),
  worldVersion: z.string().default("v0.0"),
  locks: LocksSchema.prefault({}),
  roblox: z
    .object({
      universeId: z.number().int().optional(),
      placeId: z.number().int().optional(),
      lastPublishedVersion: z.number().int().optional(),
      lastPublishedAt: z.string().optional(),
    })
    .prefault({}),
  agents: z
    .object({
      defaultProvider: z.string().default("claude-code"),
      roleProviders: z.record(z.string(), z.string()).prefault({}),
      permissionMode: z.enum(["safe", "acceptEdits", "bypass"]).default("acceptEdits"),
      runtime: z.enum(["host", "docker", "wsl"]).default("host"),
    })
    .prefault({}),
  qa: z
    .object({
      maxIterations: z.union([z.literal(3), z.literal(5), z.literal(10)]).default(3),
      autoFix: z.boolean().default(true),
      useVision: z.boolean().default(true),
      stopOnScore: z.number().min(0).max(100).default(85),
    })
    .prefault({}),
});
export type ProjectMeta = z.infer<typeof ProjectMetaSchema>;
