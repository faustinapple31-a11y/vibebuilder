"""Contact sheet of kit pieces, to judge models one by one without building a map.

  blender -b --factory-startup --python sheet.py -- out.png --pieces round_tree:0-5,pine_tree:0-4 [--palette medieval.json] [--samples 48] [--cols 6]
"""
import bpy
import json
import math
import os
import random
import sys
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wf_textures  # noqa: E402
from wf_mesh import M, lin, mul, use_textures  # noqa: E402
from wf_flora import FLORA  # noqa: E402
from wf_arch import ARCH  # noqa: E402
from wf_props import PROPS  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
out = os.path.abspath(args[0])
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
PALETTE = {"foliage": "#4c7a34", "foliageAlt": "#6f9440", "wood": "#6b4a2e", "stone": "#8f8d88", "roof": "#7a4632", "wall": "#cbb994", "accent": "#9c2f2a", "ground": "#7a6246", "water": "#3a7a94", "sky": "#a9c8e0"}
if "--palette" in args:
    PALETTE.update(json.load(open(opt("--palette", ""), encoding="utf8")))
PAL = {k: lin(v) for k, v in PALETTE.items()}
SIZES = {"round_tree": (18, 18, 26), "birch": (12, 12, 28), "pine_tree": (14, 14, 34), "snow_pine": (14, 14, 32), "willow": (20, 20, 24), "dead_tree": (14, 14, 22), "cherry_tree": (16, 16, 20), "palm": (16, 16, 24), "bush": (5, 5, 3.6), "fern": (3, 3, 1.6),
         "grass": (2.4, 2.4, 1.2), "flower": (2, 2, 1.4), "flower_patch": (6, 6, 1.6), "boulder": (7, 6, 5), "stone": (2, 1.8, 1.2), "rock_cluster": (10, 9, 6), "cliff_block": (14, 11, 16), "house": (19, 18, 20), "house_large": (20, 16, 20), "shop_building": (15, 15, 20),
         "castle": (60, 60, 50), "well": (8, 6, 10), "windmill": (20, 20, 40), "acacia": (20, 20, 18), "baobab": (20, 20, 24), "jungle_tree": (18, 18, 36), "apartment_block": (25, 23, 28), "skyscraper": (37, 29, 86)}
bpy.ops.wm.read_factory_settings(use_empty=True)
use_textures(wf_textures.build(opt("--textures", os.path.join(os.path.dirname(out), "textures"))))
from wf_modern import FAMILIES  # noqa: E402
BUILD = {**FLORA, **ARCH, **PROPS, **FAMILIES.get(opt("--arch", ""), {})}
objs = []
for spec in opt("--pieces", "round_tree:0-5").split(","):
    name, _, rg = spec.partition(":")
    a, _, b = (rg or "0").partition("-")
    for v in range(int(a), int(b or a) + 1):
        rng = random.Random("%s/%d/7" % (name, v))
        ob = BUILD[name](rng, PAL, SIZES.get(name, (6, 6, 6)), v).obj("%s_%d" % (name, v))
        tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        print("PIECE", ob.name, tris, "tris", flush=True)
        objs.append(ob)
cols = int(opt("--cols", "6"))
view = float(opt("--angle", "28"))
sc = bpy.context.scene
x = 0.0
row_z = 0.0
rows = [objs[i:i + cols] for i in range(0, len(objs), cols)]
yaw = math.radians(view)
depth = 0.0
width = 0.0
bounds = []
for r, row in enumerate(rows):
    dims = [max(o.dimensions.x, o.dimensions.y) * 1.12 + 1 for o in row]
    W = sum(dims)
    x = -W / 2
    for o, d in zip(row, dims):
        o.rotation_euler = (0, 0, yaw)
        o.location = (x + d / 2, -depth, 0)
        x += d
    width = max(width, W)
    nxt = max(dims)
    depth += nxt * 1.15 + (max(o.dimensions.z for o in rows[r + 1]) * 0.35 if r + 1 < len(rows) else 0)
g = M()
s = width + depth + 200
g.add([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [(0, 1, 2, 3)], "Grass", mul(PAL["foliage"], 0.9))
g.obj("ground")
w = bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[0].default_value = (0.55, 0.7, 0.9, 1)
bg.inputs[1].default_value = 0.9
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 5.0
sun.data.angle = math.radians(1.5)
sun.data.color = (1, 0.92, 0.8)
sun.rotation_euler = (math.radians(48), 0, math.radians(212 - 180))
sc.collection.objects.link(sun)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.clip_end = 5000
top = max(o.dimensions.z for o in objs)
cam.data.angle = math.radians(34)
front = max(max(o.dimensions.x, o.dimensions.y) for o in objs)
dist = float(opt("--dist", "0")) or max(width * 1.72, (top + depth * 0.5) * 2.1) + front * 0.5
# the front of a piece looks toward +Y
target = Vector((0, -depth / 2 + (max(o.dimensions.y for o in rows[0]) if len(rows) > 1 else 0) * 0.3, top * (0.42 if len(rows) == 1 else 0.3)))
cam.location = target + Vector((0, dist * math.cos(math.radians(14)), dist * math.sin(math.radians(14)) + (depth * 0.25 if len(rows) > 1 else 0)))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
sc.render.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type != "CPU"
    sc.cycles.device = "GPU"
except Exception:
    pass
sc.cycles.samples = int(opt("--samples", "48"))
sc.cycles.use_denoising = True
sc.cycles.transparent_max_bounces = 24
sc.view_settings.view_transform = "AgX"
try:
    sc.view_settings.look = "AgX - Medium High Contrast"
except TypeError:
    pass
sc.render.resolution_x, sc.render.resolution_y = 1800, 900
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print("SHEET", out)
