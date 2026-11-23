"""From Blender to Roblox: levels of detail, one mesh per material under the triangle limit, GLB files, a manifest, and
the checks a piece must pass before it leaves. Textures are exported once; the GLB files carry none (one
TextureID per material is set by the importer), so a hundred pieces share twenty images.
"""
import bpy
import json
import math
import os
from mathutils import Vector
import wf_textures as tex

LIMIT = 20000  # triangles of one MeshPart
DOUBLE = {"Leaf", "Fabric"}
UNTEXTURED = {"Glow", "Neon", "Glass", "Water"}


def tris(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


# ------------------------------------------------------------------ occlusion
def bake_ao(ob, floor=0.4, distance=6.0):
    """Occlusion into the vertex colours, ground included: Roblox has no ambient occlusion of its own, so what is not in
    the colours is not in the game. The mesh is refined first where a face is too large to hold a gradient."""
    import array
    sc = bpy.context.scene
    if not sc.world:
        sc.world = bpy.data.worlds.new("w")
    sc.world.light_settings.distance = distance
    me = ob.data
    ao = me.color_attributes.new("AO", "FLOAT_COLOR", "CORNER")
    me.color_attributes.active_color = ao
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    g = bpy.data.meshes.new("ao_ground")
    r = max(ob.dimensions) * 2 + 10
    g.from_pydata([(-r, -r, 0), (r, -r, 0), (r, r, 0), (-r, r, 0)], [], [(0, 1, 2, 3)])
    go = bpy.data.objects.new("ao_ground", g)
    sc.collection.objects.link(go)
    go.location = (ob.location.x, ob.location.y, 0)
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    bpy.data.meshes.remove(g)
    n = len(me.loops) * 4
    a, c = array.array("f", [0.0]) * n, array.array("f", [0.0]) * n
    ao.data.foreach_get("color", a)
    me.color_attributes["Col"].data.foreach_get("color", c)
    leaf = {i for i, m in enumerate(me.materials) if m.name in ("Leaf", "Glow", "Water")}
    skip = set()
    for p in me.polygons:
        if p.material_index in leaf:
            skip.update(p.loop_indices)
    for i in range(0, n, 4):
        if i // 4 in skip:
            continue
        k = floor + (1 - floor) * min(1.0, a[i] * 1.12)
        c[i] *= k
        c[i + 1] *= k
        c[i + 2] *= k
    me.color_attributes["Col"].data.foreach_set("color", c)
    me.color_attributes.remove(me.color_attributes["AO"])
    me.color_attributes.active_color = me.color_attributes["Col"]


def refine(ob, size=3.2):
    """Cuts the large faces: an occlusion gradient needs vertices, and a wall of one quad has none in its middle."""
    import bmesh
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    for _ in range(2):
        long = [e for e in bm.edges if e.calc_length() > size * 1.7 and not any(me.materials[f.material_index].name in ("Leaf", "Glow", "Water", "Glass") for f in e.link_faces)]
        if not long or len(bm.faces) > 60000:
            break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(me)
    bm.free()
    me.update()


# ------------------------------------------------------------------ checks
def validate(name, ob, expected=None, landscape=False):
    """Everything measurable that makes a mesh break or look broken in Roblox. Returns a list of problems."""
    me, out = ob.data, []
    bad = sum(1 for v in me.vertices if not all(math.isfinite(c) for c in v.co))
    if bad:
        out.append({"id": "nan_vertices", "severity": "high", "message": "%s: %d vertices are not finite" % (name, bad)})
    flat = sum(1 for p in me.polygons if p.area < 1e-7)
    if flat > max(4, len(me.polygons) * 0.01):
        out.append({"id": "degenerate_faces", "severity": "low", "message": "%s: %d faces have no area" % (name, flat)})
    if not me.uv_layers:
        out.append({"id": "no_uv", "severity": "high", "message": "%s has no UV map" % name})
    else:
        uv = me.uv_layers[0].data
        if any(not math.isfinite(d.uv[0]) or not math.isfinite(d.uv[1]) for d in uv):
            out.append({"id": "bad_uv", "severity": "high", "message": "%s: UVs are not finite" % name})
    if "Col" not in me.color_attributes:
        out.append({"id": "no_colour", "severity": "high", "message": "%s has no vertex colours" % name})
    for m in me.materials:
        if not m:
            out.append({"id": "no_material", "severity": "high", "message": "%s has an empty material slot" % name})
        elif tex.ALIAS.get(m.name, m.name) not in tex.SETS and m.name not in UNTEXTURED and m.name != "Leaf":
            out.append({"id": "unknown_material", "severity": "medium", "message": "%s: no texture set for %s" % (name, m.name)})
    d = ob.dimensions
    if expected and not landscape:
        for axis, want, got in (("wide", max(expected[0], expected[1]), max(d.x, d.y)), ("tall", expected[2], d.z)):
            if want > 3 and not 0.4 < got / want < 2.4:
                out.append({"id": "proportion", "severity": "medium", "message": "%s is %.0f studs %s where the layout expects %.0f" % (name, got, axis, want)})
    if max(d) > 2048:
        out.append({"id": "too_big", "severity": "high", "message": "%s spans %.0f studs, a MeshPart stops at 2048" % (name, max(d))})
    return out


# ------------------------------------------------------------------ one mesh per material
def split(ob, collection, name):
    """Copies of `ob` with one material each, cut again where a part passes the triangle limit."""
    me = ob.data
    parts = {}
    for p in me.polygons:
        parts.setdefault(me.materials[p.material_index].name, []).append(p.index)
    col = me.color_attributes["Col"].data
    uv = me.uv_layers[0].data
    made = []
    for mat, polys in parts.items():
        chunks, cur, n = [], [], 0
        for i in polys:
            k = len(me.polygons[i].vertices) - 2
            if n + k > LIMIT:
                chunks.append(cur)
                cur, n = [], 0
            cur.append(i)
            n += k
        chunks.append(cur)
        for c, ids in enumerate(chunks):
            key = "%s__%s%s" % (name, mat, "" if len(chunks) == 1 else ".%d" % (c + 1))
            vmap, verts, faces, cols, uvs, nrm, smooth = {}, [], [], [], [], [], []
            cn = me.corner_normals
            for i in ids:
                p = me.polygons[i]
                f = []
                for li in p.loop_indices:
                    v = me.loops[li].vertex_index
                    if v not in vmap:
                        vmap[v] = len(verts)
                        verts.append(me.vertices[v].co[:])
                    f.append(vmap[v])
                    cols.extend(col[li].color[:])
                    uvs.extend(uv[li].uv[:])
                    nrm.append(cn[li].vector[:])
                faces.append(f)
                smooth.append(p.use_smooth)
            nm = bpy.data.meshes.new(key)
            nm.from_pydata(verts, [], faces)
            nm.materials.append(bpy.data.materials[mat])
            nm.polygons.foreach_set("use_smooth", smooth)
            a = nm.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
            a.data.foreach_set("color", cols)
            nm.color_attributes.active_color = a
            nm.color_attributes.render_color_index = 0
            l = nm.uv_layers.new(name="UVMap")
            l.data.foreach_set("uv", uvs)
            nm.update()
            nm.normals_split_custom_set(nrm)
            o = bpy.data.objects.new(key, nm)
            collection.objects.link(o)
            made.append((o, mat))
    return made


def budget(man):
    """Triangles by zone (128 studs) at the level each instance would use, and the zones over what a phone takes."""
    zones, total = {}, 0
    for p in man["layout"]:
        e = man["pieces"].get(p["piece"])
        if not e:
            continue
        lod = e["lods"][min(p.get("lod", 0), len(e["lods"]) - 1)] or e["lods"][0]
        x, _, z = p["position"]
        k = "%d,%d" % (x // 128, z // 128)
        zones[k] = zones.get(k, 0) + lod["tris"]
        total += lod["tris"]
    heavy = sorted(((v, k) for k, v in zones.items() if v > 400000), reverse=True)
    return {"tris": total, "zones": len(zones), "worst": max(zones.values(), default=0), "heavy": [{"zone": k, "tris": v} for v, k in heavy]}


def write_glb(path, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=False, export_normals=True, export_tangents=False, export_texcoords=True, export_image_format="NONE", export_animations=False, export_cameras=False, export_lights=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    if "export_vertex_color" in props:
        kw["export_vertex_color"] = "ACTIVE"
        if "export_all_vertex_colors" in props:
            kw["export_all_vertex_colors"] = False
        if "export_active_vertex_color_when_no_material" in props:
            kw["export_active_vertex_color_when_no_material"] = True
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in props})


def export(out, levels, terrain, layout, files, expected, log):
    """`levels`: {piece: [lod0, lod1, lod2 objects]}. Writes kit/*.glb, terrain/*.glb, textures/*.png and manifest.json."""
    kit_dir, ter_dir, tex_dir = (os.path.join(out, d) for d in ("kit", "terrain", "textures"))
    for d in (kit_dir, ter_dir, tex_dir):
        os.makedirs(d, exist_ok=True)
    col = bpy.data.collections.new("export")
    bpy.context.scene.collection.children.link(col)
    manifest = {"pieces": {}, "terrain": {}, "materials": {}, "problems": [], "layout": layout}
    used = set()
    for name, lods in levels.items():
        entry = {"lods": []}
        manifest["problems"] += validate(name, lods[0], expected.get(name))
        for i, ob in enumerate(lods):
            if ob is None or not ob.data.polygons:
                entry["lods"].append(None)
                continue
            parts = split(ob, col, "%s_l%d" % (name, i))
            path = os.path.join(kit_dir, "%s_l%d.glb" % (name, i))
            write_glb(path, [o for o, _ in parts])
            entry["lods"].append({"file": "kit/" + os.path.basename(path), "tris": tris(ob.data), "bytes": os.path.getsize(path), "meshes": [{"name": o.name, "material": m, "tris": tris(o.data)} for o, m in parts]})
            used |= {m for _, m in parts}
            for o, _ in parts:
                bpy.data.meshes.remove(o.data)
        manifest["pieces"][name] = entry
    log("kit exported: %d pieces" % len(levels))
    for ob in terrain:
        manifest["problems"] += validate(ob.name, ob, landscape=True)
        parts = split(ob, col, ob.name)
        path = os.path.join(ter_dir, ob.name + ".glb")
        write_glb(path, [o for o, _ in parts])
        manifest["terrain"][ob.name] = {"file": "terrain/" + os.path.basename(path), "tris": tris(ob.data), "bytes": os.path.getsize(path), "meshes": [{"name": o.name, "material": m, "tris": tris(o.data)} for o, m in parts]}
        used |= {m for _, m in parts}
        for o, _ in parts:
            bpy.data.meshes.remove(o.data)
    manifest["budget"] = budget(manifest)
    for m in sorted(used):
        key = tex.ALIAS.get(m, m)
        info = {"doubleSided": m in DOUBLE, "tile": tex.TILE.get(key)}
        if m in ("Glow", "Neon"):
            info["roblox"] = "Neon"
        elif m in ("Glass", "Water"):
            info["roblox"] = "Glass"
        elif key in files:
            info["maps"] = {}
            for kind, src in files[key].items():
                dst = os.path.join(tex_dir, "%s_%s.png" % (key.lower(), kind))
                img = bpy.data.images.load(src)
                if img.size[0] > 1024:  # what Roblox keeps of an uploaded image
                    img.scale(1024, 1024)
                img.filepath_raw = dst
                img.file_format = "PNG"
                img.save()
                bpy.data.images.remove(img)
                info["maps"][kind] = "textures/" + os.path.basename(dst)
            # how a MeshPart must be set for the vertex colours to show (a SurfaceAppearance would ignore them)
            info["meshPart"] = {"TextureID": info["maps"]["color"], "Color": [255, 255, 255], "Material": "Plastic", "Transparency": 0.02 if m == "Leaf" else 0, "DoubleSided": m in DOUBLE}
        manifest["materials"][m] = info
    json.dump(manifest, open(os.path.join(out, "manifest.json"), "w"))
    log("exported %d terrain chunks, %d materials, %d problems" % (len(terrain), len(used), len(manifest["problems"])))
    return manifest
