"""Architecture benchmark: the same 44 buildings before and after, seen from four sides, with measured diversity.

  blender -b --factory-startup --python bench_arch.py -- outdir [--only medieval,desert] [--samples 24] [--no-render]

Diversity of a category = mean over all pairs of 1 - IoU of their front silhouettes (0: one template, above 0.3: different
buildings), plus the spread of height, footprint and roof coverage. `before` uses the builders kept from the previous
generation, so the comparison never goes stale.
"""
import bpy
import json
import math
import os
import random
import sys
import numpy as np
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wf_textures  # noqa: E402
from wf_mesh import lin, mul, use_textures, M  # noqa: E402
import wf_arch  # noqa: E402
import wf_build  # noqa: E402
import wf_city  # noqa: E402
import wf_desert  # noqa: E402
import wf_export  # noqa: E402
import wf_home  # noqa: E402
import wf_medieval  # noqa: E402
import wf_modern  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
OUT = os.path.abspath(args[0])
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
os.makedirs(OUT, exist_ok=True)
PAL = {k: lin(v) for k, v in {"foliage": "#4c7a34", "foliageAlt": "#6f9440", "wood": "#6b4a2e", "stone": "#8f8d88", "roof": "#7a4632", "wall": "#cbb994", "accent": "#9c2f2a", "ground": "#7a6246", "water": "#3a7a94", "sky": "#a9c8e0"}.items()}
H, L, S, A, T = (19, 18, 20), (20, 16, 20), (15, 15, 20), (25, 23, 30), (37, 29, 86)
OLD_HOUSE = wf_build.house
CATS = {
    "medieval": ([(wf_medieval.MEDIEVAL["house"], H, v) for v in range(8)] + [(wf_medieval.MEDIEVAL["house_large"], L, v) for v in range(2)] + [(wf_medieval.MEDIEVAL["shop_building"], S, v) for v in range(2)],
                 [(lambda r, p, s, v: OLD_HOUSE(r, p, s, v, "home"), H, v) for v in range(8)] + [(lambda r, p, s, v: OLD_HOUSE(r, p, s, v, ("inn", "farm")[v]), L, v) for v in range(2)] + [(lambda r, p, s, v: OLD_HOUSE(r, p, s, v, "shop"), S, v) for v in range(2)]),
    "desert": ([(wf_desert.DESERT["house"], H, v) for v in range(8)], [(wf_modern.adobe, H, v) for v in range(8)]),
    "homes": ([(wf_home.home, H, v) for v in range(8)], [(wf_modern.modern_house, H, v) for v in range(8)]),
    "commerce": ([(wf_city.CITY["shop_building"], (18, 17, 22), v) for v in range(3)] + [(wf_city.CITY["apartment_block"], A, v) for v in range(3)], [(lambda r, p, s, v: wf_modern.block(r, p, s, v, "shop"), (18, 17, 22), v) for v in range(3)] + [(lambda r, p, s, v: wf_modern.block(r, p, s, v, "apartment"), A, v) for v in range(3)]),
    "towers": ([(wf_city.tower, T, v) for v in range(6)], [(lambda r, p, s, v: wf_modern.block(r, p, s, v, "tower"), T, v) for v in range(6)]),
    "castles": ([(wf_build.castle, (60, 60, 50), v) for v in range(4)], [(wf_arch.castle, (60, 60, 50), v) for v in range(4)]),
}
only = opt("--only", "").split(",") if opt("--only", "") else list(CATS)


def build(list_, tag):
    out = []
    for i, (fn, size, v) in enumerate(list_):
        out.append(fn(random.Random("%s/%d/7" % (tag, i)), PAL, size, v).obj("%s_%d" % (tag, i)))
    return out


def silhouette(ob, px=160, span=None):
    """Front view mask, drawn triangle by triangle in numpy: no renderer, always the same answer."""
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(n, 3)
    me.calc_loop_triangles()
    tri = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get("vertices", tri)
    tri = tri.reshape(-1, 3)
    mask = np.zeros((px, px), bool)
    sc = px / span
    P = np.stack([co[:, 0] * sc + px / 2, np.maximum(co[:, 2], 0) * sc], -1)
    for a, b, c in tri:
        p = P[[a, b, c]]
        x0, y0 = np.floor(p.min(0)).astype(int)
        x1, y1 = np.ceil(p.max(0)).astype(int)
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(px - 1, x1), min(px - 1, y1)
        if x1 < x0 or y1 < y0:
            continue
        if x1 - x0 <= 1 and y1 - y0 <= 1:
            mask[y0:y1 + 1, x0:x1 + 1] = True
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d = (p[1, 0] - p[0, 0]) * (p[2, 1] - p[0, 1]) - (p[2, 0] - p[0, 0]) * (p[1, 1] - p[0, 1])
        if abs(d) < 1e-9:
            continue
        u = ((gx - p[0, 0]) * (p[2, 1] - p[0, 1]) - (p[2, 0] - p[0, 0]) * (gy - p[0, 1])) / d
        w = ((p[1, 0] - p[0, 0]) * (gy - p[0, 1]) - (gx - p[0, 0]) * (p[1, 1] - p[0, 1])) / d
        mask[y0:y1 + 1, x0:x1 + 1] |= (u >= -0.02) & (w >= -0.02) & (u + w <= 1.02)
    return mask


def measure(objs):
    span = max(max(o.dimensions.x, o.dimensions.z) for o in objs) * 1.1
    masks = [silhouette(o, 160, span) for o in objs]
    div = []
    for i in range(len(masks)):
        for j in range(i + 1, len(masks)):
            div.append(1 - (masks[i] & masks[j]).sum() / max(1, (masks[i] | masks[j]).sum()))
    hs = np.array([o.dimensions.z for o in objs])
    ar = np.array([o.dimensions.x * o.dimensions.y for o in objs])
    mats = [len({m.name for m in o.data.materials}) for o in objs]
    tris = [wf_export.tris(o.data) for o in objs]
    edge = []
    for m in masks:  # how much the outline departs from a box
        per = (m ^ np.roll(m, 1, 0)).sum() + (m ^ np.roll(m, 1, 1)).sum()
        edge.append(per / max(1, 2 * (m.any(0).sum() + m.any(1).sum())))
    return {"diversity": round(float(np.mean(div)), 3), "closest": round(float(np.min(div)), 3), "heightSpread": round(float(hs.std() / hs.mean()), 3), "footprintSpread": round(float(ar.std() / ar.mean()), 3), "outline": round(float(np.mean(edge)), 3), "materials": round(float(np.mean(mats)), 1), "tris": int(np.mean(tris)), "maxTris": int(max(tris))}


def scene_for(objs, view):
    sc = bpy.context.scene
    for o in list(sc.collection.objects):
        if o not in objs and o.type != "MESH":
            bpy.data.objects.remove(o)
    yaw = {"front": 0, "three_quarter": 32, "side": 90, "close": 22}[view]
    cols = max(2, math.ceil(math.sqrt(len(objs) * 1.6)))
    if view == "close":
        cols = 3
        for o in objs[3:]:
            o.hide_render = True
        objs = objs[:3]
    for o in objs:
        o.hide_render = False
    w = max(max(o.dimensions.x, o.dimensions.y) for o in objs) * 1.22
    h = max(o.dimensions.z for o in objs)
    rows = math.ceil(len(objs) / cols)
    for i, o in enumerate(objs):
        o.rotation_euler = (0, 0, math.radians(yaw))
        o.location = ((cols - 1) * w / 2 - (i % cols) * w, -(i // cols) * w * 1.25, 0)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.clip_end = 9000
    cam.data.angle = math.radians(30)
    W = cols * w * 1.04
    depth = (rows - 1) * w * 1.25
    tall = h + depth * 0.42
    dist = max(W / 2 / math.tan(math.radians(15)), tall * 16 / 9 / 2 / math.tan(math.radians(15))) + w * 0.6
    el = math.radians(24 if rows > 1 else 13)
    aim = Vector((0, -depth / 2, h * (0.46 if rows == 1 else 0.36)))
    if view == "close":
        dist *= 0.62
        aim.z = h * 0.4
    cam.location = aim + Vector((0, math.cos(el) * dist, math.sin(el) * dist))
    cam.rotation_euler = (aim - cam.location).to_track_quat("-Z", "Y").to_euler()
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy, sun.data.angle, sun.data.color = 4.2, math.radians(1.5), (1, 0.93, 0.82)
    sun.rotation_euler = (math.radians(48), 0, math.radians(214 - 180))
    sc.collection.objects.link(sun)


use_textures(wf_textures.build(opt("--textures", os.path.join(os.path.dirname(OUT), "textures"))))
report = {}
bpy.ops.wm.read_factory_settings(use_empty=True)
use_textures(wf_textures.build(opt("--textures", os.path.join(os.path.dirname(OUT), "textures"))))
for cat in only:
    new, old = CATS[cat]
    rows = {}
    for tag, list_ in (("before", old), ("after", new)):
        objs = build(list_, "%s_%s" % (cat, tag))
        rows[tag] = measure(objs)
        probs = [p for o in objs for p in wf_export.validate(o.name, o)]
        rows[tag]["problems"] = len(probs)
        if tag == "after":
            rows["issues"] = [p["message"] for p in probs][:10]
            print("BENCH", cat, "diversity %.3f -> %.3f" % (rows["before"]["diversity"], rows["after"]["diversity"]), "closest pair %.3f -> %.3f" % (rows["before"]["closest"], rows["after"]["closest"]), "outline %.2f -> %.2f" % (rows["before"]["outline"], rows["after"]["outline"]), "tris %d -> %d (max %d)" % (rows["before"]["tris"], rows["after"]["tris"], rows["after"]["maxTris"]), "problems", rows["after"]["problems"], flush=True)
        if "--no-render" not in args:
            sc = bpy.context.scene
            if not sc.world:
                w = bpy.data.worlds.new("w")
                sc.world = w
                w.use_nodes = True
                bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
                bg.inputs[0].default_value, bg.inputs[1].default_value = (0.6, 0.72, 0.88, 1), 0.85
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
                sc.cycles.samples = int(opt("--samples", "24"))
                sc.cycles.use_denoising = True
                sc.view_settings.view_transform = "AgX"
                sc.render.resolution_x, sc.render.resolution_y = 1600, 900
                g = M()
                g.add([(-4000, -4000, 0), (4000, -4000, 0), (4000, 4000, 0), (-4000, 4000, 0)], [(0, 1, 2, 3)], "RealConcrete", (0.5, 0.5, 0.49))
                g.obj("ground")
            for view in (("front", "three_quarter", "side", "close") if tag == "after" else ("three_quarter",)):
                scene_for(objs, view)
                sc.render.filepath = os.path.join(OUT, "%s_%s_%s.png" % (cat, tag, view))
                bpy.ops.render.render(write_still=True)
        for o in objs:
            bpy.data.meshes.remove(o.data)
    report[cat] = rows
json.dump(report, open(os.path.join(OUT, "bench.json"), "w"), indent=1)
print("BENCH done", flush=True)
