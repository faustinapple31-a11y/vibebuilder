"""Contact sheet of kit pieces exactly as the kit builds them.

  blender -b --factory-startup -P kit_sheet.py -- plan.json out.png --only facility_town_hall,car --textures dir [--cols 4] [--level 0]
"""
import json
import math
import os
import sys
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wf_textures  # noqa: E402
import wf_kit  # noqa: E402
from wf_mesh import M, use_textures  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
plan = json.load(open(args[0], encoding="utf8"))
out = os.path.abspath(args[1])
only = [q for q in opt("--only", "").split(",") if q]
cols = int(opt("--cols", "4"))
level = int(opt("--level", "0"))
bpy.ops.wm.read_factory_settings(use_empty=True)
use_textures(wf_textures.build(opt("--textures", os.path.join(os.path.dirname(out), "textures"))))
build = wf_kit.builders(plan)
sc = bpy.context.scene
pieces = [e for e in plan["kit"] if not only or e["prefab"] in only or any(q.endswith("*") and e["prefab"].startswith(q[:-1]) for q in only)]
CELL = 10.0
rows = math.ceil(len(pieces) / cols)
ground = M()
for i, e in enumerate(pieces):
    try:
        m, fb = wf_kit.make(e, plan, build, level)
        ob = m.obj(e["key"])
    except Exception as ex:
        print("SHEETERR", e["key"], repr(ex), flush=True)
        import traceback
        traceback.print_exc()
        continue
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print("PIECE", e["key"], "fallback" if fb else "model", tris, [round(v, 1) for v in ob.dimensions], "wants", [round(e["max"][a] - e["min"][a], 1) for a in (0, 2, 1)], flush=True)
    lo = [min(v.co[a] for v in ob.data.vertices) for a in range(3)]
    hi = [max(v.co[a] for v in ob.data.vertices) for a in range(3)]
    s = min(7.4 / max(hi[0] - lo[0], hi[1] - lo[1], 0.1), 6.6 / max(hi[2], 0.1))
    ob.scale = (s, s, s)
    x, y = (i % cols - (cols - 1) / 2) * CELL, -(i // cols) * CELL * 1.25
    ob.rotation_euler = (0, 0, math.radians(180 + 28))  # the front looks at the camera
    c = Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, 0)) * s
    c.rotate(ob.rotation_euler)
    ob.location = (x - c.x, -y - c.y if False else y * -1 - c.y, 0)
W, D = cols * CELL, rows * CELL * 1.25
ground.add([(-200, -200, -0.02), (200, -200, -0.02), (200, 400, -0.02), (-200, 400, -0.02)], [(0, 1, 2, 3)], "RealConcrete", (0.3, 0.31, 0.28))
ground.obj("ground")
w = bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[0].default_value = (0.55, 0.7, 0.9, 1)
bg.inputs[1].default_value = 0.9
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 4.5
sun.data.angle = math.radians(1.5)
sun.data.color = (1, 0.92, 0.8)
sun.rotation_euler = (math.radians(46), 0, math.radians(-38))
sc.collection.objects.link(sun)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = "ORTHO"
cam.data.ortho_scale = W
cam.data.clip_end = 2000
tilt = math.radians(26)
centre = Vector((0, (rows - 1) * CELL * 1.25 / 2, 2.6))
cam.location = centre + Vector((0, -math.cos(tilt), math.sin(tilt))) * 300
cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
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
sc.cycles.samples = 32
sc.cycles.use_denoising = True
sc.cycles.transparent_max_bounces = 24
sc.view_settings.view_transform = "AgX"
px = int(opt("--px", "420"))
sc.render.resolution_x = cols * px
sc.render.resolution_y = int((rows * CELL * 1.25 * math.sin(tilt) + 7.6) / W * cols * px)
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print("SHEET", out)
