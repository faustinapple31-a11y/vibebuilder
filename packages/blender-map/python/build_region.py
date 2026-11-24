"""Builds one region of a world: ground, water, roads, everything that stands in it; checks it; exports it.

  blender -b --factory-startup --python build_region.py -- plan.json plan/r0_0.json outdir --cache dir --textures dir [--preview]

Leaves regions/<id>/: region.blend, terrain.glb, roads.glb, water.glb, layout.json, report.json, preview.png. Needs nothing from the other
regions.
"""
import hashlib
import json
import math
import os
import sys
import time
import traceback
import numpy as np
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wf_textures  # noqa: E402
import wf_export  # noqa: E402
import wf_pack  # noqa: E402
import wf_qa  # noqa: E402
import wf_scatter  # noqa: E402
from wf_mesh import lin, use_textures  # noqa: E402
from wf_roads import Roads  # noqa: E402
from wf_terrain import Ground  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
plan = json.load(open(args[0], encoding="utf8"))
region = json.load(open(args[1], encoding="utf8"))
OUT = args[2]
CACHE = opt("--cache", os.path.join(OUT, "cache"))
RID = region["id"]
DIR = os.path.join(OUT, "regions", RID)
os.makedirs(DIR, exist_ok=True)
T0 = time.time()


def say(**k):
    print("WF " + json.dumps(k), flush=True)


def main():
    say(phase="textures", progress=0.02)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    files = wf_textures.build(opt("--textures", os.path.join(CACHE, "textures")))
    use_textures(files)
    coll = {}
    for name in ("terrain", "roads", "pieces", "scatter", "kit"):
        coll[name] = bpy.data.collections.new(name)
        sc.collection.children.link(coll[name])

    # ---- ground
    say(phase="terrain", progress=0.06)
    roads = Roads(plan, region)
    ground = Ground(plan, region, roads).build()
    tiles, tris = ground.tiles(coll["terrain"])
    say(phase="water", progress=0.3)
    water = ground.water(coll["terrain"])
    say(phase="roads", progress=0.34)
    ways = roads.build(ground, coll["roads"])

    # ---- what stands in it: pieces are linked from the kit, never copied
    say(phase="placements", progress=0.44)
    kit, missing = {}, set()
    entries = {e["key"]: e for e in plan["kit"]}

    def mesh_of(key):
        if key in kit:
            return kit[key]
        path = os.path.join(OUT, "kit", key + ".blend")
        kit[key] = None
        if os.path.exists(path):
            with bpy.data.libraries.load(path, link=True) as (src, dst):
                dst.meshes = [src.meshes[0]] if src.meshes else []
            kit[key] = dst.meshes[0] if dst.meshes else None
        else:
            meta = os.path.join(OUT, "kit", key + ".json")
            if not os.path.exists(meta):
                missing.add(key)
        return kit[key]

    layout, floating = [], []
    for p in region["placements"]:
        me = mesh_of(p["key"])
        e = entries[p["key"]]
        x, y, z = p["p"]
        natural = p["cat"] in ("vegetation", "rock")
        on_water = "floating" in e["tags"] or "water" in e["tags"]
        if p.get("fixed") or on_water or "layout" in e["tags"] and p["id"].startswith("layout_"):
            gy = y + (0 if p.get("fixed") else e["sink"] * p["s"] if not on_water else 0)
        elif natural:
            gy = ground.height(x, z) - 0.12
        else:
            gy = y + e["sink"] * p["s"]
            # what stands on a pad stands on the pad the mesh really has
            if p["cat"] not in ("building", "landmark"):
                gy = ground.height(x, z) - 0.04 if abs(ground.height(x, z) - gy) < 4 else gy
        rot = Matrix.Rotation(p["r"], 4, "Z")
        if p.get("up") and (natural or p.get("fixed")):
            u = p["up"]
            if e["prefab"] not in ("round_tree", "birch", "pine_tree", "dead_tree", "snow_pine", "palm", "jungle_tree"):
                rot = Vector((0, 0, 1)).rotation_difference(Vector((u[0], -u[2], u[1]))).to_matrix().to_4x4() @ rot
        if me is not None:
            ob = bpy.data.objects.new(p["id"], me)
            ob.matrix_world = Matrix.Translation((x, -z, gy)) @ rot @ Matrix.Scale(p["s"], 4)
            coll["pieces"].objects.link(ob)
        q = rot.to_quaternion()
        layout.append({"id": p["id"], "key": p["key"], "p": [round(x, 3), round(gy, 3), round(z, 3)], "q": [round(v, 5) for v in (q.x, q.z, -q.y, q.w)], "s": p["s"], "cat": p["cat"], **({"zone": p["zone"]} if p.get("zone") else {})})

    # ---- the small things no plan names: grown with Geometry Nodes on the finished ground
    say(phase="scatter", progress=0.56)
    grown = wf_scatter.grow(plan, region, ground, roads, coll, mesh_of, entries)
    layout += grown

    # ---- checks
    say(phase="checks", progress=0.68)
    problems = wf_qa.inspect(plan, region, ground, tiles, water, ways, coll, layout, entries, kit, missing)

    # ---- export
    say(phase="export", progress=0.78)
    col = bpy.data.collections.new("export")
    sc.collection.children.link(col)
    out_files, mats, packed = [], set(), []

    def export(kind, obs):
        meshes, total = [], 0
        for ob in obs:
            for o, mt in wf_export.split(ob, col, "%s_%s" % (RID, ob.name)):
                meshes.append((o, mt))
                total += wf_export.tris(o.data)
                mats.add(mt)
        if not meshes:
            return
        path = os.path.join(DIR, kind + ".glb")
        wf_export.write_glb(path, [o for o, _ in meshes])
        packed.extend(wf_pack.pack(o, mt) for o, mt in meshes)
        out_files.append({"kind": kind, "file": "regions/%s/%s.glb" % (RID, kind), "tris": total, "bytes": os.path.getsize(path), "meshes": [{"name": o.name, "material": mt, "tris": wf_export.tris(o.data)} for o, mt in meshes]})
        for o, _ in meshes:
            bpy.data.meshes.remove(o.data)
    export("terrain", tiles)
    export("roads", ways)
    export("water", [water] if water else [])
    wf_pack.write(os.path.join(DIR, "ground.wfm"), packed)
    text = json.dumps(layout, separators=(",", ":"))
    open(os.path.join(DIR, "layout.json"), "w").write(text)
    total = sum(f["tris"] for f in out_files)
    by = {}
    for q in layout:
        by[q["cat"]] = by.get(q["cat"], 0) + 1
    report = {"files": out_files, "instances": len(layout), "tris": total, "problems": [dict(p, region=RID) for p in problems], "seams": ground.seams(), "hash": hashlib.sha1((text + json.dumps(out_files)).encode()).hexdigest()[:16], "materials": sorted(mats), "by": by, "grown": len(grown), "seconds": round(time.time() - T0, 1)}
    json.dump(report, open(os.path.join(DIR, "report.json"), "w"))
    if "--preview" in args:
        say(phase="preview", progress=0.9)
        import wf_view
        wf_view.shoot(plan, region, ground, os.path.join(DIR, "preview.png"))
    coll["kit"].hide_render = True
    bpy.data.collections.remove(col)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DIR, "region.blend"), compress=True)
    say(phase="done", progress=1, stats={"instances": len(layout), "tris": total, "problems": len(problems), "grown": len(grown)})


try:
    main()
except Exception as ex:
    print("WFERR %s: %s" % (RID, ex), flush=True)
    traceback.print_exc()
    raise
