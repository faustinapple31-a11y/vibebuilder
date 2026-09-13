import type { VegetationSpecies } from "../schemas/world-spec";
import type { VegetationKit } from "./types";

/** Vegetation kit → weighted species list (canopy trees first, then undergrowth). */
export const VEGETATION_KIT_SPECIES: Record<VegetationKit, [VegetationSpecies, number][]> = {
  temperate: [["round_tree", 0.4], ["birch", 0.2], ["pine", 0.15], ["bush", 0.15], ["grass", 0.05], ["flower", 0.05]],
  conifer: [["pine", 0.55], ["round_tree", 0.1], ["dead_tree", 0.05], ["log", 0.1], ["bush", 0.1], ["fern", 0.1]],
  mushroom: [["giant_mushroom", 0.25], ["round_tree", 0.2], ["pine", 0.15], ["dead_tree", 0.1], ["small_mushroom", 0.15], ["fern", 0.1], ["bush", 0.05]],
  dead: [["dead_tree", 0.4], ["burnt_tree", 0.2], ["pine", 0.1], ["log", 0.15], ["bush", 0.1], ["grass", 0.05]],
  tropical: [["palm", 0.45], ["round_tree", 0.15], ["jungle_tree", 0.1], ["bush", 0.15], ["fern", 0.1], ["flower", 0.05]],
  jungle: [["jungle_tree", 0.4], ["palm", 0.15], ["round_tree", 0.1], ["fern", 0.15], ["bush", 0.1], ["bamboo", 0.1]],
  desert: [["cactus", 0.5], ["dead_tree", 0.15], ["acacia", 0.1], ["bush", 0.15], ["grass", 0.1]],
  arctic: [["snow_pine", 0.5], ["pine", 0.2], ["dead_tree", 0.1], ["log", 0.1], ["bush", 0.1]],
  alien: [["alien_tree", 0.45], ["giant_mushroom", 0.2], ["small_mushroom", 0.15], ["fern", 0.1], ["bush", 0.1]],
  candy: [["candy_tree", 0.5], ["round_tree", 0.15], ["giant_mushroom", 0.1], ["flower", 0.15], ["bush", 0.1]],
  coral: [["coral", 0.6], ["seaweed", 0.4]],
  bamboo: [["bamboo", 0.45], ["cherry_tree", 0.15], ["pine", 0.15], ["fern", 0.15], ["bush", 0.1]],
  savanna: [["acacia", 0.35], ["baobab", 0.15], ["cypress", 0.15], ["grass", 0.2], ["bush", 0.15]],
  cherry: [["cherry_tree", 0.4], ["pine", 0.15], ["bamboo", 0.15], ["round_tree", 0.1], ["bush", 0.1], ["flower", 0.1]],
  none: [],
};
