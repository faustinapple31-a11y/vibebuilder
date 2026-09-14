import type { PropKit } from "@worldforge/core";

export * from "./buildings";
export { WALL_SEGMENT } from "./dressing";
export * as modernProps from "./props-modern";
export * as futureProps from "./props-future";
export * as themedProps from "./props-themed";
export * as kitVegetation from "./vegetation-kits";
export * as kitLandmarks from "./landmarks-kits";

/**
 * Prop kit → prefab ids the generator scatters for that family (existing props included).
 * Order matters a little: the first entries are the "signature" props used more often.
 */
export const PROP_KIT_PREFABS: Record<PropKit, string[]> = {
  village: ["lantern_post", "crate", "barrel", "bench", "signpost", "cart_wheel", "hay_bale", "cart", "stone_wall", "market_stall", "lantern_string", "well", "fence"],
  forest: ["log", "firefly_swarm", "mist_patch", "rock_cluster", "boulder", "fern"],
  ruins: ["ruin_wall", "ruin_arch", "wisp", "boulder", "broken_column", "cobweb_cluster"],
  camp: ["campfire", "tent", "crate", "barrel", "log", "supply_crate", "picnic_table"],
  mine: ["crate", "barrel", "cart", "lantern_post", "pallet_stack", "rock_cluster"],
  farm: ["hay_bale", "cart", "crop_plot", "fence", "cart_wheel", "scarecrow", "wind_pump", "picket_fence"],
  docks: ["barrel", "crate", "dock_post", "rowboat", "anchor", "pallet_stack", "lantern_post"],
  graveyard: ["gravestone", "wisp", "coffin", "dead_tree", "hanging_cage", "mist_patch"],
  urban: ["streetlight", "car", "trash_can", "traffic_light", "bus_stop", "fire_hydrant", "dumpster", "planter", "billboard", "bench", "traffic_cone", "road_barrier"],
  suburban: ["car", "mailbox", "picket_fence", "picnic_table", "bbq_grill", "basketball_hoop", "garden_shed", "streetlight", "trash_can", "planter"],
  apocalypse: ["wrecked_car", "barricade", "tire_pile", "rubble_pile", "burning_barrel", "warning_sign", "supply_crate", "tank_trap", "cable_pole", "dumpster", "road_barrier"],
  scifi: ["sci_crate", "hologram", "energy_pylon", "terminal", "drone", "hover_pad", "sci_pod", "pipe_run", "solar_panel"],
  cyber: ["neon_sign", "vending_machine", "holo_billboard", "cable_pole", "noodle_stand", "drone", "hologram", "trash_can", "dumpster"],
  space: ["rover", "antenna_dish", "solar_panel", "oxygen_tank", "meteorite", "flag_pole", "sci_crate", "radar_dish"],
  western: ["hitching_post", "wagon", "wanted_board", "wind_pump", "barrel", "crate", "hay_bale", "cart_wheel", "torch_post"],
  pirate: ["cannon", "treasure_chest", "dock_post", "rowboat", "anchor", "torch_post", "barrel", "crate"],
  industrial: ["shipping_container", "storage_tank", "pipe_run", "pallet_stack", "forklift", "dumpster", "barrel", "warning_sign", "floodlight"],
  japanese: ["stone_lantern", "small_shrine", "bamboo_fence", "paper_lantern_string", "bench", "crate"],
  egypt: ["sphinx_statue", "sarcophagus", "brazier", "hieroglyph_pillar", "amphora", "crate"],
  greek: ["column", "broken_column", "amphora", "marble_statue", "brazier", "bench"],
  tropical: ["beach_umbrella", "surfboard", "tiki_torch", "hammock", "tiki_statue", "crate", "barrel"],
  arctic: ["snowman", "sled", "ice_spike", "campfire", "log", "crate"],
  candy: ["lollipop", "candy_cane", "gumdrop", "cupcake", "gingerbread_man", "balloon_cluster"],
  underwater: ["clam", "treasure_chest", "anchor", "shipwreck_piece", "bubble_vent", "boulder"],
  jungle: ["totem", "vine_curtain", "giant_leaf", "jungle_drum", "torch_post", "log", "ruin_wall"],
  military: ["sandbag_wall", "tank_trap", "jeep", "radar_dish", "military_tent", "ammo_crate", "barricade", "supply_crate", "warning_sign", "flag_pole"],
  horror: ["coffin", "scarecrow", "jack_o_lantern", "hanging_cage", "cobweb_cluster", "gravestone", "wisp", "dead_tree"],
  sports: ["goal", "bleachers", "floodlight", "basketball_hoop", "bench", "trash_can", "flag_pole"],
  carnival: ["ticket_booth", "balloon_cluster", "popcorn_cart", "bleachers", "lantern_string", "bench"],
  playground: ["swing_set", "slide", "seesaw", "sandbox", "bench", "basketball_hoop", "balloon_cluster", "trash_can"],
};

export { VEGETATION_KIT_SPECIES } from "@worldforge/core";
