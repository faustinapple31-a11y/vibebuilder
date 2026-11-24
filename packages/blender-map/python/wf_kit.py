"""Which builder makes a piece, and the pieces no placement names (grass, ferns, pebbles, outcrops)."""
import random
from wf_mesh import DETAIL, lin
from wf_flora import FLORA, outcrop
from wf_arch import ARCH
from wf_props import PROPS
import wf_sense
import wf_build
from wf_families import FAMILIES, WORN
try:
    from wf_places import PLACES
except ImportError:
    PLACES = {}

KIT_VERSION = 7
HOUSES = ("house", "house_large", "shop_building", "cottage", "chalet", "manor")
SCATTER = {"meadow_grass": FLORA["grass"], "meadow_fern": FLORA["fern"], "meadow_pebble": FLORA["stone"], "meadow_outcrop": outcrop}
TREES = ("round_tree", "birch", "pine_tree", "snow_pine", "dead_tree", "willow", "palm", "jungle_tree", "cherry_tree", "acacia", "baobab", "cypress", "burnt_tree", "bamboo", "alien_tree", "giant_mushroom", "candy_tree", "giant_tree")


def builders(plan):
    arch = plan["architecture"]
    b = {**FLORA, **ARCH, **PROPS, **PLACES, **SCATTER}
    if arch in FAMILIES:
        b.update(WORN if arch == "modern_house" and plan["weathering"] > 0.6 else FAMILIES[arch])
    elif arch in wf_build.LOOKS:
        wf_build.LOOK["now"] = wf_build.LOOKS[arch]
    else:
        # a style without houses of its own takes the family nearest to it, never a stack of boxes
        near = {"greek_temple": "desert_adobe", "cyber_block": "apartment_block", "scifi_module": "industrial_shed", "bunker": "industrial_shed", "tropical_hut": "shack", "japanese": "timber_frame", "elven": "timber_frame", "ruined": "stone_hut", "igloo": "stone_hut", "brick_rowhouse": "modern_house"}.get(arch, "timber_frame")
        if near in FAMILIES:
            b.update(FAMILIES[near])
        else:
            wf_build.LOOK["now"] = wf_build.LOOKS[near]
    return b


def make(entry, plan, build, level=0):
    """The mesh of a piece at a level of detail; the same seed at every level, so the silhouette stays."""
    pal = {k: lin(v) for k, v in plan["palette"].items()}
    lo, hi = entry["min"], entry["max"]
    size = (hi[0] - lo[0], hi[2] - lo[2], max(0.5, hi[1]))
    rng = random.Random("%s/%d/%d" % (entry["prefab"], entry["variant"], plan["seed"]))
    if level:
        DETAIL.set(level, max(size))
    try:
        if entry["prefab"] in build:
            fn = build[entry["prefab"]]
            return (fn(rng, pal, size, entry["variant"], entry) if getattr(fn, "wants_entry", False) else fn(rng, pal, size, entry["variant"])), False
        return wf_sense.build(rng, pal, entry), True
    finally:
        DETAIL.set(0)


def collision(entry, fallback):
    """How a piece is touched: its own shape, a trunk, a box, or not at all."""
    if entry["prefab"] in TREES:
        return "trunk"
    if entry["category"] in ("building", "landmark") or "interior" in entry["tags"]:
        return "precise"
    if not entry["boxes"] or entry["prefab"].startswith("meadow_"):
        return "none" if entry["prefab"] != "meadow_outcrop" else "hull"
    if entry["category"] == "rock":
        return "hull"
    return "box"
