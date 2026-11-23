"""Packs kit pieces and their textures into a local .rbxlx so Studio can rebuild them with EditableMesh / EditableImage:
the real renderer judges the models, and nothing is uploaded to anybody's account.

  blender -b --factory-startup --python studio_pack.py -- out.rbxlx --pieces house:0-1,round_tree:0-0 [--lod 1] [--tex 256]
"""
import base64
import math
import os
import random
import struct
import sys
import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wf_textures  # noqa: E402
from wf_mesh import DETAIL, lin, use_textures  # noqa: E402
from wf_flora import FLORA  # noqa: E402
from wf_arch import ARCH  # noqa: E402
from wf_props import PROPS  # noqa: E402
import wf_export  # noqa: E402
from wf_families import FAMILIES  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
out = os.path.abspath(args[0])
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
PAL = {k: lin(v) for k, v in {"foliage": "#4c7a34", "foliageAlt": "#6f9440", "wood": "#6b4a2e", "stone": "#8f8d88", "roof": "#7a4632", "wall": "#cbb994", "accent": "#9c2f2a", "ground": "#7a6246", "water": "#3a7a94", "sky": "#a9c8e0"}.items()}
SIZES = {"round_tree": (18, 18, 26), "birch": (12, 12, 28), "pine_tree": (14, 14, 34), "bush": (5, 5, 3.6), "boulder": (7, 6, 5), "house": (19, 18, 20), "house_large": (20, 16, 20), "shop_building": (15, 15, 20), "castle": (60, 60, 50), "skyscraper": (37, 29, 86), "grass": (2.4, 2.4, 1.2), "fern": (3, 3, 1.6)}
bpy.ops.wm.read_factory_settings(use_empty=True)
files = wf_textures.build(opt("--textures", os.path.join(os.path.dirname(out), "..", "textures")))
use_textures(files)
DETAIL.set(int(opt("--lod", "0")))
BUILD = {**FLORA, **ARCH, **PROPS, **FAMILIES.get(opt("--arch", ""), {})}
col = bpy.data.collections.new("split")
bpy.context.scene.collection.children.link(col)
items, used = [], set()


def bake(ob):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 48
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "OPTIX"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type != "CPU"
        sc.cycles.device = "GPU"
    except Exception:
        pass
    wf_export.bake_ao(ob)
    ob.hide_render = True


to_srgb = lambda a: np.where(a <= 0.0031308, a * 12.92, 1.055 * np.maximum(a, 0) ** (1 / 2.4) - 0.055)


def chunks(data):
    b = base64.b64encode(data).decode()
    return [b[i:i + 190000] for i in range(0, len(b), 190000)]


for spec in opt("--pieces", "house:0-0").split(","):
    name, _, rg = spec.partition(":")
    a, _, b = (rg or "0").partition("-")
    for v in range(int(a), int(b or a) + 1):
        ob = BUILD[name](random.Random("%s/%d/7" % (name, v)), PAL, SIZES.get(name, (6, 6, 6)), v).obj("%s_%d" % (name, v))
        if "--ao" in args and name not in ("grass", "flower", "fern"):
            if not ob.data.has_custom_normals and name not in ("boulder",):
                wf_export.refine(ob)
            bake(ob)
        for o, mat in wf_export.split(ob, col, ob.name):
            me = o.data
            me.calc_loop_triangles()
            n = len(me.loops)
            vi = np.empty(n, np.int32)
            me.loops.foreach_get("vertex_index", vi)
            co = np.empty(len(me.vertices) * 3, np.float32)
            me.vertices.foreach_get("co", co)
            co = co.reshape(-1, 3)[vi]
            nr = np.array([c.vector[:] for c in me.corner_normals], np.float32)
            uv = np.empty(n * 2, np.float32)
            me.uv_layers[0].data.foreach_get("uv", uv)
            uv = uv.reshape(-1, 2)
            cl = np.empty(n * 4, np.float32)
            me.color_attributes["Col"].data.foreach_get("color", cl)
            cl = to_srgb(cl.reshape(-1, 4)[:, :3]).astype(np.float32)  # Color3 is sRGB
            row = np.concatenate([np.stack([co[:, 0], co[:, 2], -co[:, 1]], -1), np.stack([nr[:, 0], nr[:, 2], -nr[:, 1]], -1), np.stack([uv[:, 0], 1 - uv[:, 1]], -1), cl], -1).astype(np.float32)
            key = np.round(row, 3)
            _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
            tri = np.empty(len(me.loop_triangles) * 3, np.int32)
            me.loop_triangles.foreach_get("loops", tri)
            t = inv.reshape(-1)[tri].astype(np.uint32)
            items.append((ob.name, mat, struct.pack("<II", len(first), len(t) // 3) + row[first].tobytes() + t.tobytes()))
            used.add(mat)
        print("PACK", ob.name, wf_export.tris(ob.data), flush=True)
px = int(opt("--tex", "256"))
tex = []
for m in sorted(used):
    key = wf_textures.ALIAS.get(m, m)
    if key not in files:
        continue
    for kind, p in files[key].items():
        if kind != "color":
            continue
        if any(t[0] == key and t[1] == kind for t in tex):
            continue
        img = bpy.data.images.load(p)
        size = min(1024, px * 2) if key == "Leaf" else px
        img.scale(size, size)
        arr = np.empty(size * size * 4, np.float32)
        img.pixels.foreach_get(arr)
        arr = arr.reshape(size, size, 4)[::-1]
        if kind != "color":
            arr[..., 3] = 1
        tex.append((key, kind, size, (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes()))
        bpy.data.images.remove(img)
ref = [0]


def item(cls, name, inner="", props=""):
    ref[0] += 1
    return '<Item class="%s" referent="R%d"><Properties><string name="Name">%s</string>%s</Properties>%s</Item>' % (cls, ref[0], name, props, inner)


def value(name, data):
    return item("StringValue", name, "", '<string name="Value">%s</string>' % data)


body = ""
for i, (piece, mat, data) in enumerate(items):
    body += item("Folder", "M%d" % i, value("piece", piece) + value("material", mat) + "".join(value("d%d" % k, c) for k, c in enumerate(chunks(data))))
tx = ""
for key, kind, size, data in tex:
    tx += item("Folder", "%s_%s" % (key, kind), value("size", str(size)) + "".join(value("d%d" % k, c) for k, c in enumerate(chunks(data))))
root = item("Folder", "KitMeshes", body) + item("Folder", "KitTextures", tx)
open(out, "w", encoding="utf8").write('<roblox version="4">' + '<Item class="Workspace" referent="W"><Properties><string name="Name">Workspace</string></Properties></Item><Item class="ServerStorage" referent="S"><Properties><string name="Name">ServerStorage</string></Properties>' + root + "</Item></roblox>")
print("PACK wrote", out, "%.1f MB" % (os.path.getsize(out) / 1e6), len(items), "meshes", len(tex), "maps")
