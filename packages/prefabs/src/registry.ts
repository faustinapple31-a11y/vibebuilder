import { Rng, deriveSeed, type PrefabCategory, type PrefabVariant, type StyleBible } from "@worldforge/core";
import type { PrefabContext } from "./builder";
import * as veg from "./vegetation";
import * as rocks from "./rocks";
import * as arch from "./architecture";
import * as props from "./props";
import * as lm from "./landmarks";
import { house, houseApartment, houseLarge, houseShop, houseTower } from "./kits/buildings";
import * as mp from "./kits/props-modern";
import * as fp from "./kits/props-future";
import * as tp from "./kits/props-themed";
import * as kv from "./kits/vegetation-kits";
import * as kl from "./kits/landmarks-kits";
import * as kw from "./kits/dressing";
import * as ki from "./kits/islands";
import { buildMeshLibrary } from "./meshes/library";

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
  def("plank_bridge", "building", ki.plankBridge, 7, 60, ["bridge", "floating"]),
  def("stairs", "path", ki.stairs, 7, 20, ["floating", "stairs"]),
  def("spawn_plaza", "prop", ki.spawnPlaza, 2, 30, ["layout", "spawn"]),
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

  // ---- universal buildings (kit = style.architecture.style, walk-in interiors)
  def("house", "building", (ctx, v) => house(ctx, v), 10, 90, ["building", "interior"]),
  def("house_large", "building", houseLarge, 6, 130, ["building", "interior"]),
  def("shop_building", "building", houseShop, 6, 95, ["building", "interior", "shop"]),
  def("apartment_block", "building", houseApartment, 6, 160, ["building", "interior", "urban"]),
  def("skyscraper", "building", houseTower, 4, 220, ["building", "urban", "tower"]),
  // ---- vegetation kits
  def("jungle_tree", "vegetation", kv.jungleTree, 10, 18, ["tree", "jungle"]),
  def("baobab", "vegetation", kv.baobab, 6, 16, ["tree", "savanna"]),
  def("acacia", "vegetation", kv.acacia, 8, 10, ["tree", "savanna"]),
  def("alien_tree", "vegetation", kv.alienTree, 10, 16, ["tree", "alien", "glow"]),
  def("bamboo", "vegetation", kv.bamboo, 8, 24, ["tree", "bamboo"]),
  def("cherry_tree", "vegetation", kv.cherryTree, 8, 14, ["tree", "cherry"]),
  def("burnt_tree", "vegetation", kv.burntTree, 8, 10, ["tree", "dead"]),
  def("candy_tree", "vegetation", kv.candyTree, 8, 12, ["tree", "candy"]),
  def("coral", "vegetation", kv.coral, 10, 10, ["coral", "underwater"]),
  def("seaweed", "vegetation", kv.seaweed, 8, 12, ["underwater", "undergrowth"]),
  def("snow_pine", "vegetation", kv.snowPine, 10, 18, ["tree", "conifer", "arctic"]),
  def("cypress", "vegetation", kv.cypress, 6, 8, ["tree"]),
  // ---- modern / apocalypse / industrial / military props
  def("car", "prop", (ctx, v) => mp.car(ctx, v), 8, 22, ["urban", "suburban", "vehicle"]),
  def("wrecked_car", "prop", mp.wreckedCar, 8, 28, ["apocalypse", "vehicle"]),
  def("streetlight", "prop", mp.streetlight, 4, 5, ["urban", "light"]),
  def("traffic_light", "prop", mp.trafficLight, 4, 6, ["urban"]),
  def("trash_can", "prop", mp.trashCan, 4, 3, ["urban"]),
  def("bus_stop", "prop", mp.busStop, 3, 10, ["urban"]),
  def("fire_hydrant", "prop", mp.fireHydrant, 4, 4, ["urban"]),
  def("dumpster", "prop", mp.dumpster, 4, 5, ["urban", "industrial"]),
  def("road_barrier", "prop", mp.roadBarrier, 6, 7, ["urban", "military"]),
  def("traffic_cone", "prop", mp.trafficCone, 4, 3, ["urban"]),
  def("billboard", "prop", mp.billboard, 4, 9, ["urban"]),
  def("planter", "prop", mp.planter, 6, 6, ["urban"]),
  def("mailbox", "prop", mp.mailbox, 4, 4, ["suburban"]),
  def("picket_fence", "prop", mp.picketFence, 4, 18, ["suburban", "wall"]),
  def("picnic_table", "prop", mp.picnicTable, 4, 7, ["suburban", "camp"]),
  def("bbq_grill", "prop", mp.bbqGrill, 3, 7, ["suburban"]),
  def("basketball_hoop", "prop", mp.basketballHoop, 3, 5, ["suburban", "sports"]),
  def("garden_shed", "prop", mp.gardenShed, 4, 6, ["suburban", "farm"]),
  def("barricade", "prop", mp.barricade, 6, 16, ["apocalypse", "military", "wall"]),
  def("tire_pile", "prop", mp.tirePile, 6, 7, ["apocalypse"]),
  def("rubble_pile", "prop", mp.rubblePile, 8, 9, ["apocalypse", "ruins"]),
  def("burning_barrel", "prop", mp.burningBarrel, 4, 5, ["apocalypse", "light"]),
  def("warning_sign", "prop", mp.warningSign, 4, 3, ["apocalypse", "military"]),
  def("supply_crate", "prop", mp.supplyCrate, 6, 4, ["apocalypse", "military", "camp"]),
  def("shipping_container", "prop", mp.shippingContainer, 6, 10, ["industrial", "docks"]),
  def("storage_tank", "prop", mp.storageTank, 4, 8, ["industrial"]),
  def("pipe_run", "prop", mp.pipeRun, 4, 10, ["industrial", "scifi"]),
  def("pallet_stack", "prop", mp.palletStack, 6, 12, ["industrial", "docks"]),
  def("forklift", "prop", mp.forklift, 3, 12, ["industrial", "vehicle"]),
  def("sandbag_wall", "prop", mp.sandbagWall, 4, 18, ["military", "wall"]),
  def("tank_trap", "prop", mp.tankTrap, 4, 3, ["military", "apocalypse"]),
  def("jeep", "prop", mp.jeep, 4, 10, ["military", "vehicle"]),
  def("radar_dish", "prop", mp.radarDish, 3, 5, ["military", "space"]),
  def("military_tent", "prop", mp.militaryTent, 4, 8, ["military", "camp"]),
  def("ammo_crate", "prop", mp.ammoCrate, 4, 4, ["military", "camp"]),
  // ---- sci-fi / cyber / space props
  def("sci_crate", "prop", fp.sciCrate, 6, 5, ["scifi", "space"]),
  def("hologram", "prop", fp.hologram, 6, 5, ["scifi", "cyber", "glow"]),
  def("energy_pylon", "prop", fp.energyPylon, 4, 8, ["scifi", "glow"]),
  def("terminal", "prop", fp.terminal, 4, 6, ["scifi", "cyber"]),
  def("drone", "prop", fp.drone, 6, 12, ["scifi", "cyber", "floating"]),
  def("hover_pad", "prop", fp.hoverPad, 3, 7, ["scifi", "space"]),
  def("sci_pod", "prop", fp.pod, 4, 5, ["scifi", "space"]),
  def("neon_sign", "prop", fp.neonSign, 8, 6, ["cyber", "urban", "light"]),
  def("vending_machine", "prop", fp.vendingMachine, 4, 13, ["cyber", "urban"]),
  def("holo_billboard", "prop", fp.holoBillboard, 4, 7, ["cyber", "light"]),
  def("cable_pole", "prop", fp.cablePole, 4, 10, ["cyber", "urban", "apocalypse"]),
  def("noodle_stand", "prop", fp.noodleStand, 3, 14, ["cyber", "market"]),
  def("rover", "prop", fp.rover, 3, 11, ["space", "vehicle"]),
  def("antenna_dish", "prop", fp.antennaDish, 4, 4, ["space", "scifi"]),
  def("solar_panel", "prop", fp.solarPanel, 4, 7, ["space", "scifi"]),
  def("oxygen_tank", "prop", fp.oxygenTank, 4, 9, ["space"]),
  def("meteorite", "prop", fp.meteorite, 6, 4, ["space", "rock"]),
  def("flag_pole", "prop", fp.flagPole, 3, 4, ["space", "military", "sports"]),
  // ---- themed props
  def("hitching_post", "prop", tp.hitchingPost, 4, 4, ["western"]),
  def("wagon", "prop", tp.wagon, 4, 12, ["western", "farm"]),
  def("wanted_board", "prop", tp.wantedBoard, 3, 6, ["western"]),
  def("wind_pump", "prop", tp.windPump, 3, 17, ["western", "farm"]),
  def("cannon", "prop", tp.cannon, 4, 10, ["pirate"]),
  def("treasure_chest", "prop", tp.treasureChest, 6, 8, ["pirate", "underwater", "collectible"]),
  def("dock_post", "prop", tp.dockPost, 6, 4, ["docks", "pirate"]),
  def("rowboat", "prop", tp.rowboat, 4, 7, ["docks", "pirate", "water"]),
  def("anchor", "prop", tp.anchor, 3, 6, ["pirate", "docks"]),
  def("torch_post", "prop", tp.torchPost, 4, 3, ["pirate", "tropical", "jungle", "light"]),
  def("stone_lantern", "prop", tp.stoneLantern, 6, 12, ["japanese", "light"]),
  def("small_shrine", "prop", tp.smallShrine, 4, 8, ["japanese"]),
  def("bamboo_fence", "prop", tp.bambooFence, 4, 12, ["japanese", "wall"]),
  def("paper_lantern_string", "prop", tp.paperLanternString, 4, 15, ["japanese", "light"]),
  def("sphinx_statue", "prop", tp.sphinxStatue, 3, 8, ["egypt", "statue"]),
  def("sarcophagus", "prop", tp.sarcophagus, 4, 8, ["egypt"]),
  def("brazier", "prop", tp.brazier, 4, 4, ["egypt", "greek", "light"]),
  def("hieroglyph_pillar", "prop", tp.hieroglyphPillar, 4, 7, ["egypt"]),
  def("column", "prop", (ctx, v) => tp.column(ctx, v), 6, 9, ["greek"]),
  def("broken_column", "prop", tp.brokenColumn, 6, 9, ["greek", "ruins"]),
  def("amphora", "prop", tp.amphora, 6, 5, ["greek"]),
  def("marble_statue", "prop", tp.marbleStatue, 4, 7, ["greek", "statue"]),
  def("beach_umbrella", "prop", tp.beachUmbrella, 6, 5, ["tropical"]),
  def("surfboard", "prop", tp.surfboard, 6, 3, ["tropical"]),
  def("tiki_torch", "prop", tp.tikiTorch, 4, 3, ["tropical", "light"]),
  def("hammock", "prop", tp.hammock, 4, 5, ["tropical", "camp"]),
  def("tiki_statue", "prop", tp.tikiStatue, 4, 6, ["tropical", "jungle", "statue"]),
  def("snowman", "prop", tp.snowman, 4, 11, ["arctic"]),
  def("sled", "prop", tp.sled, 4, 10, ["arctic"]),
  def("ice_spike", "prop", tp.iceSpike, 8, 6, ["arctic", "glow"]),
  def("lollipop", "prop", tp.lollipop, 8, 4, ["candy"]),
  def("candy_cane", "prop", tp.candyCane, 6, 9, ["candy"]),
  def("gumdrop", "prop", tp.gumdrop, 8, 4, ["candy"]),
  def("cupcake", "prop", tp.cupcake, 4, 5, ["candy"]),
  def("gingerbread_man", "prop", tp.gingerbreadMan, 4, 11, ["candy", "statue"]),
  def("clam", "prop", tp.clam, 6, 4, ["underwater"]),
  def("shipwreck_piece", "prop", tp.shipwreckPiece, 6, 7, ["underwater", "pirate", "ruins"]),
  def("bubble_vent", "prop", tp.bubbleVent, 4, 2, ["underwater", "ambience"]),
  def("totem", "prop", tp.totem, 4, 14, ["jungle", "statue"]),
  def("vine_curtain", "prop", tp.vineCurtain, 6, 15, ["jungle", "floating"]),
  def("giant_leaf", "prop", tp.giantLeaf, 8, 6, ["jungle", "undergrowth"]),
  def("jungle_drum", "prop", tp.junglerum, 3, 8, ["jungle", "camp"]),
  def("coffin", "prop", tp.coffin, 6, 6, ["horror", "graveyard"]),
  def("scarecrow", "prop", tp.scarecrow, 4, 10, ["horror", "farm"]),
  def("jack_o_lantern", "prop", tp.jackOLantern, 8, 5, ["horror", "light"]),
  def("hanging_cage", "prop", tp.hangingCage, 3, 12, ["horror"]),
  def("cobweb_cluster", "prop", tp.cobwebCluster, 6, 3, ["horror", "floating"]),
  def("goal", "prop", tp.goal, 3, 6, ["sports"]),
  def("bleachers", "prop", tp.bleachers, 3, 12, ["sports", "carnival"]),
  def("floodlight", "prop", tp.floodlight, 3, 5, ["sports", "industrial", "light"]),
  def("ticket_booth", "prop", tp.ticketBooth, 3, 10, ["carnival"]),
  def("balloon_cluster", "prop", tp.balloonCluster, 6, 13, ["carnival", "playground"]),
  def("popcorn_cart", "prop", tp.popcornCart, 3, 9, ["carnival"]),
  def("swing_set", "prop", tp.swingSet, 3, 11, ["playground"]),
  def("slide", "prop", tp.slide, 3, 9, ["playground"]),
  def("seesaw", "prop", tp.seesaw, 3, 4, ["playground"]),
  def("sandbox", "prop", tp.sandbox, 3, 7, ["playground"]),
  // ---- landmarks for every style
  def("crashed_plane", "landmark", kl.crashedPlane, 3, 70, ["landmark", "apocalypse", "vehicle"]),
  def("radio_tower", "landmark", kl.radioTower, 3, 45, ["landmark", "tower", "industrial"]),
  def("skyscraper_landmark", "landmark", kl.skyscraperLandmark, 3, 260, ["landmark", "urban"]),
  def("skyscraper_ruin", "landmark", kl.skyscraperRuin, 3, 40, ["landmark", "ruins", "urban"]),
  def("water_tower", "landmark", kl.waterTower, 3, 28, ["landmark", "western", "industrial"]),
  def("pyramid", "landmark", kl.pyramid, 3, 18, ["landmark", "egypt"]),
  def("colosseum", "landmark", kl.colosseum, 2, 170, ["landmark", "greek", "arena"]),
  def("torii_gate", "landmark", kl.toriiGate, 3, 12, ["landmark", "japanese"]),
  def("lighthouse", "landmark", kl.lighthouse, 3, 22, ["landmark", "tropical", "pirate"]),
  def("pirate_ship", "landmark", kl.pirateShip, 3, 50, ["landmark", "pirate", "water"]),
  def("rocket", "landmark", kl.rocket, 3, 26, ["landmark", "space"]),
  def("ufo", "landmark", kl.ufo, 3, 30, ["landmark", "space", "alien"]),
  def("dome_base", "landmark", kl.domeBase, 3, 30, ["landmark", "space", "scifi"]),
  def("crystal_spire", "landmark", kl.crystalSpire, 4, 18, ["landmark", "alien", "glow"]),
  def("ferris_wheel", "landmark", kl.ferrisWheel, 2, 70, ["landmark", "carnival"]),
  def("stadium", "landmark", kl.stadium, 2, 60, ["landmark", "sports"]),
  def("fountain", "landmark", kl.fountain, 4, 14, ["landmark", "urban", "greek"]),
  def("obelisk", "landmark", kl.obelisk, 3, 14, ["landmark", "egypt"]),
  def("waterfall_cliff", "landmark", kl.waterfallCliff, 3, 22, ["landmark", "water"]),
  def("gas_station", "landmark", kl.gasStation, 3, 34, ["landmark", "urban", "apocalypse"]),
  def("church", "landmark", kl.church, 3, 50, ["landmark", "village", "interior"]),
  def("barn", "landmark", kl.barn, 3, 40, ["landmark", "farm", "interior"]),
  def("cave_entrance", "landmark", kl.caveEntrance, 3, 24, ["landmark", "cave", "rock"]),
  // ---- settlement dressing (walls & gates per wall kit, piers, fields)
  def("town_wall", "prop", kw.townWall, 4, 14, ["wall", "settlement_wall"]),
  def("gate_tower", "prop", kw.gateTower, 2, 20, ["wall", "gate", "tower"]),
  def("pier", "prop", kw.pier, 2, 40, ["docks", "water"]),
  def("farm_field", "prop", kw.farmField, 4, 75, ["farm", "field"]),
  def("road_stripe", "path", kw.roadStripe, 2, 1, ["road", "marking"]),
  def("crosswalk", "path", kw.crosswalk, 1, 6, ["road", "marking"]),
  def("kerb", "path", kw.kerb, 3, 1, ["road", "kerb"]),
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
  const meshes = buildMeshLibrary(style, seed);
  for (let i = 0; i < n; i++) {
    const rng = new Rng(deriveSeed(seed, `${prefabId}#${i}`));
    out.push(d.build({ rng, style, meshes }, i));
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
