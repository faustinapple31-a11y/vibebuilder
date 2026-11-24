"""Grass, ferns, pebbles and outcrops, grown with Geometry Nodes on the finished ground: a density field computed from the
plan (near the ways, under the trees, on the steep slopes) drives Distribute Points on Faces; the instances are read back."""
import math
import numpy as np
import bpy
from mathutils import Matrix
import wf_noise as N


def field(ground, step=4.0):
    x0, z0, x1, z1 = ground.rect
    xs, zs = np.arange(x0, x1 + 0.01, step), np.arange(z0, z1 + 0.01, step)
    X, Z = np.meshgrid(xs, zs)
    H = ground.heights(X, Z)
    i = np.clip(((X - ground.X[0, 0]) / 2).astype(int), 0, ground.Hf.shape[1] - 1)
    j = np.clip(((Z - ground.Z[0, 0]) / 2).astype(int), 0, ground.Hf.shape[0] - 1)
    return X, Z, H, i, j


def nodes(name, collection, seed, scale, align):
    """A node group: points on faces by the attribute `density`, a random piece of the collection on each."""
    ng = bpy.data.node_groups.new(name, "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    new = ng.nodes.new
    gin, gout = new("NodeGroupInput"), new("NodeGroupOutput")
    att = new("GeometryNodeInputNamedAttribute")
    att.data_type = "FLOAT"
    att.inputs["Name"].default_value = "density"
    dist = new("GeometryNodeDistributePointsOnFaces")
    dist.inputs["Seed"].default_value = seed
    dens = next(s for s in dist.inputs if s.name == "Density" and s.enabled)
    info = new("GeometryNodeCollectionInfo")
    info.inputs["Collection"].default_value = collection
    info.inputs["Separate Children"].default_value = True
    info.inputs["Reset Children"].default_value = True
    inst = new("GeometryNodeInstanceOnPoints")
    inst.inputs["Pick Instance"].default_value = True
    rnd = new("FunctionNodeRandomValue")
    rnd.data_type = "FLOAT_VECTOR"
    vecs = [s for s in rnd.inputs if s.type == "VECTOR"]
    vecs[0].default_value = (0, 0, 0)
    vecs[1].default_value = (0, 0, math.tau)
    sz = new("FunctionNodeRandomValue")
    sz.data_type = "FLOAT"
    fl = [s for s in sz.inputs if s.type == "VALUE" and s.enabled]
    fl[0].default_value, fl[1].default_value = scale
    seeds = [s for s in sz.inputs if s.name == "Seed"]
    if seeds:
        seeds[0].default_value = seed + 5
    link = ng.links.new
    link(gin.outputs[0], dist.inputs["Mesh"])
    link(next(s for s in att.outputs if s.enabled), dens)
    link(dist.outputs["Points"], inst.inputs["Points"])
    link(info.outputs[0], inst.inputs["Instance"])
    link(next(s for s in rnd.outputs if s.enabled), inst.inputs["Rotation"])
    link(next(s for s in sz.outputs if s.enabled), inst.inputs["Scale"])
    link(inst.outputs[0], gout.inputs[0])
    return ng


def grow(plan, region, ground, roads, coll, mesh_of, entries):
    X, Z, H, gi, gj = field(ground)
    slope, shore, road, level = ground.slope[gj, gi], ground.shoreD[gj, gi], ground.road[gj, gi], ground.level[gj, gi]
    mats, _ = ground.paint_cache if hasattr(ground, "paint_cache") else (None, None)
    if mats is None:
        mats, cols = ground.paint()
        ground.paint_cache = (mats, cols)
    M = mats[gj, gi]
    s = ground.seed
    clump = N.fbm(X / 34, Z / 34, 3, s + 71) + 0.35 * N.fbm(X / 9, Z / 9, 2, s + 72)
    # trees, to know what is under them
    tree = np.full(X.shape, 99.0)
    for p in region["placements"]:
        if p["key"].rsplit("_", 1)[0] in ("round_tree", "birch", "pine_tree", "willow", "jungle_tree", "snow_pine"):
            i0, j0 = int((p["p"][0] - region["rect"][0]) / 4), int((p["p"][2] - region["rect"][1]) / 4)
            a, b, c, d = max(0, j0 - 4), min(X.shape[0], j0 + 5), max(0, i0 - 4), min(X.shape[1], i0 + 5)
            if a < b and c < d:
                tree[a:b, c:d] = np.minimum(tree[a:b, c:d], np.hypot(X[a:b, c:d] - p["p"][0], Z[a:b, c:d] - p["p"][2]))
    dry = N.smooth(1.0, 4.0, shore) * N.smooth(0.8, 2.5, road)
    wet = ~np.isnan(ground.cell(ground.WATER, X, Z))
    grass = (M == "Grass")
    near = np.exp(-np.maximum(0, np.minimum(road, np.maximum(level, 0) + 4)) / 70)  # thick where people walk, thin in the wild
    fields = {
        "meadow_grass": np.where(grass & ~wet, dry * np.clip(clump + 0.35, 0, 1) * (0.1 + 0.9 * near), 0) * 0.05,
        "meadow_fern": np.where(grass & ~wet, dry * (1 - N.smooth(6, 15, tree)) * (0.3 + 0.7 * np.clip(clump + 0.2, 0, 1)), 0) * 0.02,
        "meadow_pebble": np.where(~wet, (1 - N.smooth(0.5, 5, np.abs(road - 0.6))) * 0.5 + (1 - N.smooth(0, 7, np.abs(shore - 2))) * 0.9 + N.smooth(0.4, 0.7, slope) * 0.4, 0) * 0.014 * N.smooth(-0.6, 0.4, road),
        "meadow_outcrop": np.where(~wet & (level > 24) & (road > 10), N.smooth(0.75, 1.05, slope) * (0.4 + 0.6 * np.clip(clump, 0, 1)), 0) * 0.0016,
    }
    fields["meadow_grass"] *= N.smooth(-1, 3, level)
    fields["meadow_fern"] *= N.smooth(0, 4, level)
    layout = []
    nz, nx = X.shape
    idx = np.arange(nx * nz).reshape(nz, nx)
    faces = np.stack([idx[:-1, :-1], idx[1:, :-1], idx[1:, 1:], idx[:-1, 1:]], -1).reshape(-1, 4)
    verts = np.stack([X, -Z, H], -1).reshape(-1, 3)
    for k, (name, dens) in enumerate(fields.items()):
        keys = [key for key, e in entries.items() if e["prefab"] == name]
        if not keys or dens.max() <= 0:
            continue
        src = bpy.data.collections.new("src_" + name)
        bpy.context.scene.collection.children.link(src)
        by = {}
        for key in keys:
            me = mesh_of(key)
            if me is None:
                continue
            o = bpy.data.objects.new("src_" + key, me)
            src.objects.link(o)
            by[o.name] = key
        if not by:
            continue
        me = bpy.data.meshes.new("emit_" + name)
        me.from_pydata(verts.tolist(), [], faces.tolist())
        a = me.attributes.new("density", "FLOAT", "POINT")
        a.data.foreach_set("value", dens.astype(np.float32).ravel())
        em = bpy.data.objects.new("emit_" + name, me)
        coll["scatter"].objects.link(em)
        scale = {"meadow_grass": (0.5, 1.0), "meadow_fern": (0.7, 1.4), "meadow_pebble": (0.35, 1.1), "meadow_outcrop": (0.5, 1.5)}[name]
        mod = em.modifiers.new("grow", "NODES")
        mod.node_group = nodes("grow_" + name, src, (int(plan["seed"]) + hash_id(region["id"]) + k * 97) % 100000, scale, name == "meadow_outcrop")
        dg = bpy.context.evaluated_depsgraph_get()
        sink = {"meadow_grass": 0.05, "meadow_fern": 0.05, "meadow_pebble": 0.12, "meadow_outcrop": 1.2}[name]
        n = 0
        for it in dg.object_instances:
            if not it.is_instance or it.parent is None or it.parent.original is not em:
                continue
            key = by.get(it.instance_object.original.name)
            if not key:
                continue
            m = it.matrix_world
            loc, q, sc = m.decompose()
            x, z = loc.x, -loc.y
            layout.append({"id": "%s_%s_%d" % (region["id"], name[7:], n), "key": key, "p": [round(x, 2), round(ground.height(x, z) - sink, 2), round(z, 2)], "q": [round(v, 4) for v in (q.x, q.z, -q.y, q.w)], "s": round(sc.x, 3), "cat": "rock" if name in ("meadow_outcrop", "meadow_pebble") else "vegetation"})
            n += 1
        src.hide_render = True
    return layout


def hash_id(s):
    h = 2166136261
    for c in s:
        h = ((h ^ ord(c)) * 16777619) & 0xFFFFFFFF
    return h % 65536
