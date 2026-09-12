import { Rng, deriveSeed, type PrefabCategory, type PrefabVariant, type StyleBible } from "@worldforge/core";
import type { PrefabContext } from "./builder";
import * as veg from "./vegetation";
import * as rocks from "./rocks";
import * as arch from "./architecture";
import * as props from "./props";
import * as lm from "./landmarks";

export type PrefabBuilder = (ctx: PrefabContext, variant: number) => PrefabVariant;

export interface PrefabDefinition {
  id: string;
  category: PrefabCategory;
  build: PrefabBuilder;
  /** Default number of variants generated per bake. */
  variants: number;
  tags: string[];
  /** Rough parts per variant, used for budgets before building. */
  approxParts: number;
}

const def = (id: string, category: PrefabCategory, build: PrefabBuilder, variants: number, approxParts: number, tags: string[] = []): PrefabDefinition => ({ id, category, build, variants, approxParts, tags });

export const PREFAB_DEFINITIONS: PrefabDefinition[] = [
  // vegetation
  def("pine_tree", "vegetation", veg.pineTree, 12, 14, ["tree", "conifer"]),
  def("round_tree", "vegetation", veg.roundTree, 12, 14, ["tree", "deciduous"]),
  def("dead_tree", "vegetation", veg.deadTree, 10, 14, ["tree", "dead"]),
  def("willow", "vegetation", veg.willowTree, 8, 12, ["tree"]),
  def("birch", "vegetation", veg.birchTree, 8, 9, ["tree"]),
  def("giant_mushroom", "vegetation", veg.giantMushroom, 12, 16, ["mushroom", "giant"]),
  def("small_mushroom", "vegetation", veg.smallMushroom, 10, 6, ["mushroom"]),
  def("bush", "vegetation", veg.bush, 10, 3, ["bush"]),
  def("fern", "vegetation", veg.fern, 8, 6, ["undergrowth"]),
  def("grass", "vegetation", veg.grassTuft, 8, 4, ["undergrowth"]),
  def("flower", "vegetation", veg.flower, 8, 4, ["undergrowth"]),
  def("log", "vegetation", veg.fallenLog, 8, 3, ["forest"]),
  def("cactus", "vegetation", veg.cactus, 6, 5, ["desert"]),
  def("palm", "vegetation", veg.palmTree, 8, 10, ["tropical"]),
  // rocks
  def("boulder", "rock", rocks.boulder, 12, 5, ["rock"]),
  def("rock_cluster", "rock", rocks.rockCluster, 8, 14, ["rock"]),
  def("stone", "rock", rocks.stone, 8, 2, ["rock"]),
  def("cliff_block", "rock", rocks.cliffBlock, 8, 4, ["rock", "cliff"]),
  def("crystal_cluster", "rock", rocks.crystalCluster, 8, 12, ["rock", "crystal", "glow"]),
  // architecture
  def("cottage", "building", arch.cottage, 10, 60, ["building"]),
  def("ruin_wall", "building", arch.ruinWall, 8, 12, ["ruins"]),
  def("ruin_arch", "building", arch.ruinArch, 6, 8, ["ruins"]),
  def("watchtower", "building", arch.watchtower, 4, 20, ["tower"]),
  def("well", "building", arch.well, 4, 9, ["village"]),
  def("bridge", "building", arch.bridge, 4, 30, ["bridge"]),
  def("fence", "prop", arch.fence, 8, 4, ["village"]),
  def("stone_path_slab", "path", arch.stonePathSlab, 10, 3, ["path"]),
  // props
  def("lantern_post", "prop", props.lanternPost, 6, 5, ["village", "light"]),
  def("crate", "prop", props.crate, 8, 4, ["village", "camp"]),
  def("barrel", "prop", props.barrel, 8, 3, ["village", "camp"]),
  def("bench", "prop", props.bench, 6, 4, ["village"]),
  def("signpost", "prop", props.signpost, 6, 5, ["village", "path"]),
  def("campfire", "prop", props.campfire, 6, 12, ["camp"]),
  def("cart_wheel", "prop", props.cartWheel, 4, 2, ["village", "farm"]),
  def("gravestone", "prop", props.gravestone, 8, 3, ["graveyard"]),
  def("wisp", "prop", props.wisp, 4, 4, ["glow", "graveyard", "ruins"]),
  def("tent", "prop", props.tent, 6, 12, ["camp"]),
  def("hay_bale", "prop", props.hayBale, 6, 2, ["village", "farm"]),
  def("cart", "prop", props.cart, 4, 14, ["village", "farm"]),
  def("firefly_swarm", "prop", props.fireflySwarm, 4, 2, ["ambience", "glow"]),
  def("reeds", "vegetation", props.reeds, 8, 9, ["undergrowth", "water"]),
  def("lily_pad", "vegetation", props.lilyPad, 6, 4, ["water", "floating"]),
  def("stone_wall", "prop", props.stoneWall, 8, 7, ["village", "wall"]),
  def("market_stall", "prop", props.marketStall, 6, 22, ["village", "market"]),
  def("lantern_string", "prop", props.lanternString, 4, 20, ["village", "light"]),
  def("waterfall", "prop", props.waterfall, 4, 7, ["water", "ambience"]),
  def("crop_plot", "prop", props.cropPlot, 6, 30, ["village", "farm"]),
  def("flower_patch", "vegetation", props.flowerPatch, 8, 20, ["undergrowth", "flower"]),
  def("mist_patch", "prop", props.mistPatch, 4, 1, ["ambience"]),
  // landmarks
  def("giant_tree", "landmark", lm.giantTree, 4, 30, ["landmark"]),
  def("ancient_ruins", "landmark", lm.ancientRuins, 4, 45, ["landmark", "ruins"]),
  def("tower", "landmark", lm.ruinedTower, 4, 25, ["landmark", "tower"]),
  def("portal", "landmark", lm.portal, 4, 16, ["landmark"]),
  def("statue", "landmark", lm.statue, 4, 10, ["landmark"]),
  def("windmill", "landmark", lm.windmill, 4, 16, ["landmark"]),
  def("temple", "landmark", lm.temple, 4, 30, ["landmark"]),
];

export const PREFAB_INDEX: Record<string, PrefabDefinition> = Object.fromEntries(PREFAB_DEFINITIONS.map((d) => [d.id, d]));

export function getPrefabDefinition(id: string): PrefabDefinition {
  const d = PREFAB_INDEX[id];
  if (!d) throw new Error(`Unknown prefab "${id}"`);
  return d;
}

/** Deterministically build N variants of a prefab for a style and seed. */
export function buildPrefabVariants(prefabId: string, style: StyleBible, seed: number, count?: number): PrefabVariant[] {
  const d = getPrefabDefinition(prefabId);
  const n = count ?? d.variants;
  const out: PrefabVariant[] = [];
  for (let i = 0; i < n; i++) {
    const rng = new Rng(deriveSeed(seed, `${prefabId}#${i}`));
    out.push(d.build({ rng, style }, i));
  }
  return out;
}

/** Build a library of prefab variants for a set of prefab ids. */
export function buildPrefabLibrary(prefabIds: string[], style: StyleBible, seed: number, variantCounts: Record<string, number> = {}): Record<string, PrefabVariant[]> {
  const lib: Record<string, PrefabVariant[]> = {};
  for (const id of new Set(prefabIds)) {
    lib[id] = buildPrefabVariants(id, style, seed, variantCounts[id]);
  }
  return lib;
}
