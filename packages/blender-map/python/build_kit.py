"""Builds one share of a world's kit.

  blender -b --factory-startup --python build_kit.py -- plan.json outdir --part 0 --of 4 --cache dir --textures dir

A piece is made once for a given builder, seed, size, palette and style: the next world that asks for it copies it from the
cache. Each piece leaves: three levels of detail (GLB), a packed copy for the local preview, its .blend, a report.
"""
import hashlib
import json
import os
import shutil
import sys
import time
import traceback
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wf_textures  # noqa: E402
import wf_kit  # noqa: E402
import wf_export  # noqa: E402
import wf_pack  # noqa: E402
from wf_mesh import use_textures, mul  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
plan = json.load(open(args[0], encoding="utf8"))
OUT = args[1]
PART, OF = int(opt("--part", "0")), int(opt("--of", "1"))
CACHE = opt("--cache", os.path.join(OUT, "cache"))
AO = "--no-ao" not in args


def say(**k):
    print("WF " + json.dumps(k), flush=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
files = wf_textures.build(opt("--textures", os.path.join(CACHE, "textures")))
use_textures(files)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.samples = 24
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type != "CPU"
    sc.cycles.device = "GPU"
except Exception:
    pass
build = wf_kit.builders(plan)
kit_dir = os.path.join(OUT, "kit")
os.makedirs(kit_dir, exist_ok=True)
mine = [e for i, e in enumerate(plan["kit"]) if i % OF == PART]
col = bpy.data.collections.new("work")
sc.collection.children.link(col)


def stamp(e):
    """Everything the look of a piece depends on."""
    fallback = e["prefab"] not in build
    data = [wf_kit.KIT_VERSION, wf_textures.VERSION, wf_textures.LEAF_VERSION, e["prefab"], e["variant"], e["min"], e["max"], plan["seed"], plan["palette"], plan["architecture"] if not e["prefab"].startswith("meadow_") else "", round(plan["weathering"], 1), AO, e["parts"] if fallback or getattr(build.get(e["prefab"]), "wants_entry", False) else 0]
    return hashlib.sha1(json.dumps(data, sort_keys=True).encode()).hexdigest()[:20]


def piece(e, folder):
    problems = []
    m, fallback = wf_kit.make(e, plan, build)
    if not m.f:
        return {"key": e["key"], "lods": [None, None, None], "collision": "none", "fallback": fallback, "size": [0, 0, 0], "problems": []}
    ob = m.obj(e["key"], col)
    leafy = all(s.material.name in ("Leaf", "SmoothPlastic", "Glow") for s in ob.material_slots)
    if AO and not leafy and wf_export.tris(ob.data) < 60000:
        wf_export.refine(ob)
        for o in col.objects:
            o.hide_render = o is not ob
        wf_export.bake_ao(ob)
    want = (e["max"][0] - e["min"][0], e["max"][2] - e["min"][2], e["max"][1])
    problems += wf_export.validate(e["key"], ob, None if e["prefab"].startswith("meadow_") else want)
    inverted = wf_export.inverted_share(ob)
    if inverted > 0.06:
        problems.append({"id": "inverted_normals", "severity": "medium", "message": "%s: %d%% of the faces look inward" % (e["key"], round(inverted * 100))})
    levels = [ob]
    for lv in (1, 2):
        m2, _ = wf_kit.make(e, plan, build, lv)
        m2.fc = [[mul(c, 0.86) for c in f] for f in m2.fc]
        levels.append(m2.obj("%s_l%d" % (e["key"], lv), col) if m2.f else None)
    meta = {"key": e["key"], "lods": [], "collision": wf_kit.collision(e, fallback), "fallback": fallback, "size": [round(v, 2) for v in (ob.dimensions.x, ob.dimensions.z, ob.dimensions.y)], "problems": [dict(p, piece=e["key"]) for p in problems]}
    for i, lv in enumerate(levels):
        if lv is None:
            meta["lods"].append(None)
            continue
        parts = wf_export.split(lv, col, "%s_l%d" % (e["key"], i))
        f = os.path.join(folder, "%s_l%d.glb" % (e["key"], i))
        wf_export.write_glb(f, [o for o, _ in parts])
        if i > 0 or wf_export.tris(lv.data) < 9000:
            wf_pack.write(os.path.join(folder, "%s_l%d.wfm" % (e["key"], i)), [wf_pack.pack(o, mt) for o, mt in parts])
        meta["lods"].append({"file": "kit/%s_l%d.glb" % (e["key"], i), "tris": wf_export.tris(lv.data), "bytes": os.path.getsize(f), "meshes": [{"name": o.name, "material": mt, "tris": wf_export.tris(o.data)} for o, mt in parts]})
        for o, _ in parts:
            bpy.data.meshes.remove(o.data)
    tri = [l["tris"] if l else 0 for l in meta["lods"]]
    if tri[0] > 120000:
        meta["problems"].append({"id": "heavy_piece", "severity": "medium", "message": "%s has %d triangles" % (e["key"], tri[0]), "piece": e["key"]})
    if tri[1] and tri[0] > 1500 and tri[1] > tri[0] * 0.9:
        meta["problems"].append({"id": "weak_lod", "severity": "low", "message": "%s keeps %d%% of its triangles at medium distance" % (e["key"], tri[1] * 100 // tri[0]), "piece": e["key"]})
    bpy.data.libraries.write(os.path.join(folder, "%s.blend" % e["key"]), {ob.data}, fake_user=True, compress=True)
    for lv in levels:
        if lv is not None:
            bpy.data.meshes.remove(lv.data)
    return meta


made = cached = 0
t0 = time.time()
for i, e in enumerate(mine):
    say(phase=e["key"], progress=i / max(1, len(mine)))
    folder = os.path.join(CACHE, "pieces", stamp(e))
    done = os.path.join(folder, "meta.json")
    try:
        if not os.path.exists(done):
            os.makedirs(folder, exist_ok=True)
            meta = piece(e, folder)
            json.dump(meta, open(done, "w"))
            made += 1
        else:
            cached += 1
        for f in os.listdir(folder):
            if f != "meta.json":
                dst = os.path.join(kit_dir, f)
                if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(os.path.join(folder, f)):
                    shutil.copy2(os.path.join(folder, f), dst)
        shutil.copy2(done, os.path.join(kit_dir, e["key"] + ".json"))
    except Exception as ex:
        print("WFERR %s: %s" % (e["key"], ex), flush=True)
        traceback.print_exc()
        raise
say(phase="kit", progress=1, stats={"made": made, "cached": cached, "seconds": round(time.time() - t0, 1)})
