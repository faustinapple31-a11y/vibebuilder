import type { FileIO } from "./types";
import type { ProcessRunner } from "./runner";

/**
 * Runs modelling scripts in Blender, headless: models are made in Blender, never in Roblox Studio.
 * The agent writes `def build():`; everything around it is fixed here: one mesh, the asked height, base on
 * the ground, a palette texture so colours survive the FBX import, the triangle budget, the exports.
 */
export interface BlenderJob {
  /** Absolute paths. */
  glb: string;
  fbx: string;
  preview: string;
  report: string;
  palette: string;
  heightStuds: number;
  maxTriangles: number;
  /** Renders of the finished model from the design's four sides, so the review compares like with like. */
  views?: Partial<Record<ConceptView, string>>;
  /** Black-on-white silhouettes at 64 px (front, right, three-quarter), enlarged side by side: the readability test. */
  silhouette?: string;
}

export interface BlenderReport {
  ok: boolean;
  error?: string;
  triangles?: number;
  /** Width, depth, height in studs. */
  size?: [number, number, number];
  materials?: number;
  /** Edges with one face: a closed model has none. */
  openEdges?: number;
  /** What the build measured on the finished mesh (see modelGateProblems). */
  gates?: MeshGates;
}

/** Measurements of the finished mesh, in studs, after the rescale. Positions are in Roblox axes (front +Y here). */
export interface MeshGates {
  /** Connected pieces of the mesh. */
  islands: number;
  /** Groups of pieces that touch neither the ground nor anything that does. */
  floatingParts: number;
  /** Share of the triangles in floating pieces. */
  floatingShare: number;
  /** Centre of the largest floating group. */
  floatingAt?: [number, number, number];
  /** Share of the surface whose mirror image across the best centre plane lands on the surface (1 = mirror-symmetric). */
  symmetry: number;
  /** Pieces that straddle that plane without being centred on it (by more than 2% of the size) and have no mirror twin. */
  offCentre?: number;
  /** Centre of the largest of them, and how far it is off the plane, in studs. */
  offCentreAt?: [number, number, number];
  offCentreBy?: number;
  /** Footprint of what touches the ground, against the footprint of the whole model (0..1). */
  support: number;
  /** Pieces smaller than 0.4 stud in every direction: they vanish on a phone. */
  dustParts: number;
  /** Share of the triangles spent on those pieces. */
  dustShare: number;
  /** Share of the triangles in the top quarter of the model: the silhouette edge players see against the sky. */
  topShare: number;
  /** Triangles before the budget decimation. */
  rawTriangles?: number;
  /** Fill of each 64 px silhouette (front, right, three-quarter): share of its bounding box that is dark. */
  silhouetteFill?: number[];
}

const ALLOWED_IMPORTS = new Set(["bpy", "bmesh", "math", "mathutils", "random"]);
const FORBIDDEN = [/__/, /\b(open|exec|eval|compile|getattr|setattr|globals|locals|input|breakpoint)\s*\(/, /\bbpy\.(app|path|utils|ops\.(wm|script|preferences|export_\w+|import_\w+|file))\b/, /\.(save|filepath\w*)\b/, /\bsys\b|\bos\b|\bsubprocess\b|\bsocket\b/];

/**
 * The script comes from a model and runs on the client's machine. This refuses what a modelling script never
 * needs. It is a filter, not a sandbox: Blender also runs with --factory-startup and --disable-autoexec.
 */
export function blenderScriptProblem(code: string): string | null {
  for (const m of code.matchAll(/^\s*(?:import|from)\s+([\w.]+)/gm)) {
    if (!ALLOWED_IMPORTS.has(m[1]!.split(".")[0]!)) return `forbidden import: ${m[1]}`;
  }
  for (const rule of FORBIDDEN) {
    const hit = rule.exec(code);
    if (hit) return `forbidden code: ${hit[0]}`;
  }
  return /^def build\(\s*\)\s*:/m.test(code) ? null : "the script must define build()";
}

const j = (v: unknown) => JSON.stringify(v);

/** Imports, the report writer and mat(). The wrapper's own names start with _wf_: an agent's helpers must not shadow them. */
const prelude = (report: string) => `import bpy, bmesh, math, mathutils, random, json, traceback
random.seed(7)
_WF_REPORT = ${j(report)}

def _wf_report(data):
    with open(_WF_REPORT, "w", encoding="utf8") as f:
        json.dump(data, f)

def _wf_backdrop(scene, rgb):
    """Workbench paints the background with world.color: world nodes only reach Cycles and EEVEE.
    The Standard view transform shows the brief's hex colours as they are; the default one dulls them."""
    world = bpy.data.worlds.new("_wf_w")
    world.color = rgb
    scene.world = world
    scene.view_settings.view_transform = "Standard"

def mat(name, color, roughness=0.75, metallic=0.0):
    """A flat material from '#rrggbb'. Every mesh must use materials made here."""
    def lin(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    rgb = [lin(int(color[i:i + 2], 16)) for i in (1, 3, 5)]
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.roughness = roughness
    m.metallic = metallic
    return m
`;

export const CONCEPT_VIEWS = { front: [0, -1, 0.12], right: [1, 0, 0.12], back: [0, 1, 0.12], three_quarter: [0.7, -0.8, 0.4] } as const;
export type ConceptView = keyof typeof CONCEPT_VIEWS;

/** The 3D design: no triangle budget, no export, only renders of the concept from every side. */
export function blenderConceptScript(code: string, renders: Record<ConceptView, string>, report: string): string {
  return `${prelude(report)}
# ---- the design agent's concept
${code}
# ---- end of the concept

def _wf_concept():
    build()
    objs = [o for o in bpy.data.objects if o.type in {"MESH", "CURVE", "META", "SURFACE", "FONT"}]
    if not objs:
        raise RuntimeError("build() created no mesh")
    scene = bpy.context.scene
    deps = bpy.context.evaluated_depsgraph_get()
    lo = mathutils.Vector((1e9, 1e9, 1e9)); hi = -lo
    tris = 0
    for o in objs:
        ev = o.evaluated_get(deps)
        for c in ev.bound_box:
            w = ev.matrix_world @ mathutils.Vector(c)
            lo = mathutils.Vector(map(min, lo, w)); hi = mathutils.Vector(map(max, hi, w))
        me = ev.to_mesh()
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        ev.to_mesh_clear()
    centre = (lo + hi) / 2
    dist = max(hi - lo) * 2.5
    cam = bpy.data.objects.new("_wf_cam", bpy.data.cameras.new("_wf_cam"))
    scene.collection.objects.link(cam)
    cam.data.clip_end = dist * 10
    scene.camera = cam
    _wf_backdrop(scene, (0.8, 0.82, 0.85))
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.image_settings.file_format = "PNG"
    for path, d in _WF_VIEWS:
        cam.location = centre + mathutils.Vector(d).normalized() * dist
        cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
    _wf_report({"ok": True, "triangles": tris, "size": list(hi - lo)})

_WF_VIEWS = ${j((Object.keys(CONCEPT_VIEWS) as ConceptView[]).map((k) => [renders[k], CONCEPT_VIEWS[k]]))}
try:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _wf_concept()
except Exception:
    _wf_report({"ok": False, "error": traceback.format_exc()[-1500:]})
`;
}

const GATES_PY = String.raw`
def _wf_gates(me, h):
    """The mesh gates: floating pieces, mirror symmetry, ground support, dust, where the triangles go."""
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new(); bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    n = len(bm.verts)
    island = [-1] * n
    boxes = []
    for v in bm.verts:
        if island[v.index] >= 0:
            continue
        k = len(boxes); island[v.index] = k; stack = [v]
        lo = list(v.co); hi = list(v.co)
        while stack:
            a = stack.pop()
            for i in range(3):
                lo[i] = min(lo[i], a.co[i]); hi[i] = max(hi[i], a.co[i])
            for e in a.link_edges:
                b = e.other_vert(a)
                if island[b.index] < 0:
                    island[b.index] = k; stack.append(b)
        boxes.append((lo, hi))
    tris = [0] * len(boxes)
    top = 0
    total = 0
    for f in bm.faces:
        t = len(f.verts) - 2
        tris[island[f.verts[0].index]] += t
        total += t
        if f.calc_center_median().z > h * 0.75:
            top += t
    total = max(total, 1)
    # pieces touch when their boxes meet; a group touches the ground when one of its pieces does
    tol = h * 0.01
    parent = list(range(len(boxes)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    order = sorted(range(len(boxes)), key=lambda i: boxes[i][0][0])
    for x, i in enumerate(order):
        lo, hi = boxes[i]
        for j in order[x + 1:]:
            lo2, hi2 = boxes[j]
            if lo2[0] - tol > hi[0]:
                break
            if all(lo[a] - tol <= hi2[a] and lo2[a] - tol <= hi[a] for a in (1, 2)):
                parent[find(i)] = find(j)
    grounded = {find(i) for i, (lo, hi) in enumerate(boxes) if lo[2] <= tol}
    groups = {}
    for i in range(len(boxes)):
        r = find(i)
        if r not in grounded:
            groups.setdefault(r, []).append(i)
    floating_tris = sum(tris[i] for g in groups.values() for i in g)
    floating_at = None
    if groups:
        g = max(groups.values(), key=lambda g: sum(tris[i] for i in g))
        lo = [min(boxes[i][0][a] for i in g) for a in range(3)]
        hi = [max(boxes[i][1][a] for i in g) for a in range(3)]
        floating_at = [(lo[a] + hi[a]) / 2 for a in range(3)]
    dust = [i for i, (lo, hi) in enumerate(boxes) if max(hi[a] - lo[a] for a in range(3)) < 0.4]
    # mirror symmetry: the best plane x = c among the centres of the largest pieces, then the 2% test across it
    tree = BVHTree.FromBMesh(bm)
    size = max(max(b[1][a] for b in boxes) - min(b[0][a] for b in boxes) for a in range(3))
    tol_c = size * 0.02
    def mirror_score(c, step):
        hits = 0; samples = 0
        for i in range(0, n, step):
            co = bm.verts[i].co
            found = tree.find_nearest(mathutils.Vector((2 * c - co.x, co.y, co.z)))
            samples += 1
            if found[0] is not None and found[3] <= tol_c:
                hits += 1
        return hits / max(samples, 1)
    mids = [[(lo[a] + hi[a]) / 2 for a in range(3)] for lo, hi in boxes]
    biggest = sorted(range(len(boxes)), key=lambda i: -tris[i])[:12]
    plane = max({0.0} | {round(mids[i][0], 3) for i in biggest}, key=lambda c: mirror_score(c, max(1, n // 800)))
    symmetry = mirror_score(plane, max(1, n // 3000))
    # a piece meant to be centred straddles the plane; off it by more than 2%, with no mirror twin, it reads lopsided
    off = []
    for i, (lo, hi) in enumerate(boxes):
        dx = mids[i][0] - plane
        if tris[i] < total * 0.01 or abs(dx) <= tol_c or abs(dx) >= (hi[0] - lo[0]) / 2:
            continue
        twin = [2 * plane - mids[i][0], mids[i][1], mids[i][2]]
        if any(j != i and all(abs(mids[j][a] - twin[a]) <= tol_c for a in range(3)) for j in range(len(boxes))):
            continue
        off.append(i)
    off_at = None; off_by = 0.0
    if off:
        k = max(off, key=lambda i: tris[i])
        off_at = mids[k]; off_by = abs(mids[k][0] - plane)
    # what touches the ground, against the whole footprint
    base = [v.co for v in bm.verts if v.co.z <= tol]
    xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]
    foot = max((max(xs) - min(xs)) * (max(ys) - min(ys)), 1e-6)
    support = 0.0
    if base:
        support = min(1.0, (max(c.x for c in base) - min(c.x for c in base)) * (max(c.y for c in base) - min(c.y for c in base)) / foot)
    bm.free()
    return {
        "islands": len(boxes),
        "floatingParts": len(groups),
        "floatingShare": floating_tris / total,
        "floatingAt": floating_at,
        "symmetry": symmetry,
        "offCentre": len(off),
        "offCentreAt": off_at,
        "offCentreBy": off_by,
        "support": support,
        "dustParts": len(dust),
        "dustShare": sum(tris[i] for i in dust) / total,
        "topShare": top / total,
    }

def _wf_avatar(x):
    """A 5-stud grey mannequin standing beside the model, for scale in the review renders only."""
    me = bpy.data.meshes.new("_wf_avatar")
    bm = bmesh.new()
    for cx, sx, sz, cz in ((-0.5, 0.9, 2, 1), (0.5, 0.9, 2, 1), (0, 2, 2, 3), (0, 1.1, 1, 4.5)):
        bmesh.ops.create_cube(bm, size=1.0, matrix=mathutils.Matrix.Translation((cx, 0, cz)) @ mathutils.Matrix.Diagonal((sx, 1, sz, 1)))
    for v in bm.verts:
        v.co.x += x
    bm.to_mesh(me); bm.free()
    me.materials.append(mat("_wf_avatar", "#a0a4aa"))
    o = bpy.data.objects.new("_wf_avatar", me)
    bpy.context.scene.collection.objects.link(o)
    return o

def _wf_aim(cam, centre, d, dist):
    cam.location = centre + mathutils.Vector(d).normalized() * dist
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()

def _wf_silhouettes(scene, cam, centre, dist, views, path):
    """Black on white at 64 px, the size a player reads an object at, enlarged 4 times side by side."""
    shading = scene.display.shading
    shading.light = "FLAT"; shading.color_type = "SINGLE"; shading.single_color = (0, 0, 0)
    shading.show_shadows = False; shading.show_cavity = False
    scene.world.color = (1, 1, 1)
    scene.render.resolution_x = 64; scene.render.resolution_y = 64
    big = 256
    strip = [1.0] * (big * len(views) * big * 4)
    fills = []
    for k, d in enumerate(views):
        _wf_aim(cam, centre, d, dist)
        scene.render.filepath = path + ".part.png"
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path + ".part.png", check_existing=False)
        px = list(img.pixels)
        dark = [[px[(y * 64 + x) * 4] < 0.5 for x in range(64)] for y in range(64)]
        bpy.data.images.remove(img)
        cells = [(x, y) for y in range(64) for x in range(64) if dark[y][x]]
        if cells:
            w = max(c[0] for c in cells) - min(c[0] for c in cells) + 1
            hh = max(c[1] for c in cells) - min(c[1] for c in cells) + 1
            fills.append(len(cells) / (w * hh))
        else:
            fills.append(0.0)
        for y in range(big):
            for x in range(big):
                v = 0.0 if dark[y // 4][x // 4] else 1.0
                o = (y * big * len(views) + k * big + x) * 4
                strip[o:o + 3] = [v, v, v]
    out = bpy.data.images.new("silhouettes", big * len(views), big, alpha=False)
    out.pixels = strip
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()
    return fills
`;

/** The finished model faces +Y: the design's view directions, turned like the model. */
const finalView = (v: ConceptView): [number, number, number] => [-CONCEPT_VIEWS[v][0], -CONCEPT_VIEWS[v][1], CONCEPT_VIEWS[v][2]];

/** The complete Python file Blender runs for the final model. */
export function blenderJobScript(code: string, job: BlenderJob): string {
  const views = (Object.keys(job.views ?? {}) as ConceptView[]).map((v) => [job.views![v], finalView(v)]);
  const silhouettes = (["front", "right", "three_quarter"] as const).map(finalView);
  return `${prelude(job.report)}${GATES_PY}
# ---- the agent's model
${code}
# ---- end of the agent's model

def _wf_finish():
    build()
    meshes = [o for o in bpy.data.objects if o.type in {"MESH", "CURVE", "META", "SURFACE", "FONT"}]
    if not meshes:
        raise RuntimeError("build() created no mesh")
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = "model"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # height, base on the ground, centred; the agent's front is -Y, Roblox prefabs face -Z
    me = obj.data
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    span = max(zs) - min(zs)
    if span <= 0:
        raise RuntimeError("the model has no height")
    s = ${job.heightStuds} / span
    cx = (min(xs) + max(xs)) / 2; cy = (min(ys) + max(ys)) / 2; z0 = min(zs)
    for v in me.vertices:
        v.co = ((v.co.x - cx) * s * -1, (v.co.y - cy) * s * -1, (v.co.z - z0) * s)
    me.update()

    # clean mesh gates: no loose geometry, outward normals, no n-gons
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    open_edges = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    tris = len(bm.faces)
    bm.to_mesh(me); bm.free(); me.update()

    # triangle budget of a Roblox MeshPart
    if tris > ${job.maxTriangles}:
        d = obj.modifiers.new("budget", "DECIMATE")
        d.ratio = ${job.maxTriangles} / tris
        bpy.ops.object.modifier_apply(modifier=d.name)
    gates = _wf_gates(me, ${job.heightStuds})
    gates["rawTriangles"] = tris

    # one palette texture: a material's colour reaches Roblox through an FBX only as a texture
    mats = [m for m in me.materials if m]
    if not mats:
        raise RuntimeError("the model has no material")
    cells = 1
    while cells * cells < len(mats):
        cells *= 2
    cell = 8
    size = cells * cell
    img = bpy.data.images.new("palette", size, size, alpha=False)
    def srgb(c):
        return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    px = [0.0] * (size * size * 4)
    for i, m in enumerate(mats):
        col = [srgb(c) for c in m.diffuse_color[:3]]
        cx0 = (i % cells) * cell; cy0 = (i // cells) * cell
        for y in range(cy0, cy0 + cell):
            for x in range(cx0, cx0 + cell):
                k = (y * size + x) * 4
                px[k:k + 4] = [col[0], col[1], col[2], 1.0]
    img.pixels = px
    img.filepath_raw = ${j(job.palette)}
    img.file_format = "PNG"
    img.save()
    img.pack()
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    uv = me.uv_layers.new(name="UVMap")
    slots = {me.materials[i]: i for i in range(len(me.materials))}
    order = {slots[m]: i for i, m in enumerate(mats)}
    for poly in me.polygons:
        i = order.get(poly.material_index, 0)
        u = ((i % cells) + 0.5) / cells
        w = ((i // cells) + 0.5) / cells
        for li in poly.loop_indices:
            uv.data[li].uv = (u, w)
        poly.material_index = 0
    final = bpy.data.materials.new("palette")
    final.use_nodes = True
    bsdf = next(n for n in final.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    tex = final.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    final.node_tree.links.new(tex.outputs[0], bsdf.inputs[0])
    bsdf.inputs["Roughness"].default_value = 0.8
    me.materials.clear()
    me.materials.append(final)
    for poly in me.polygons:
        poly.use_smooth = False

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=${j(job.glb)}, export_format="GLB", use_selection=True, export_apply=True)
    bpy.ops.export_scene.fbx(filepath=${j(job.fbx)}, use_selection=True, axis_forward="-Z", axis_up="Y", apply_scale_options="FBX_SCALE_ALL", mesh_smooth_type="FACE", path_mode="COPY", embed_textures=True)

    # a three-quarter preview for the review agent
    scene = bpy.context.scene
    h = ${job.heightStuds}
    r = max(obj.dimensions) * 1.9
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    cam.location = (r * 0.55, r * 0.8, h * 0.5 + r * 0.32)  # the front faces +Y once turned for Roblox
    target = mathutils.Vector((0, 0, h * 0.5))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    sun.data.energy = 3
    _wf_backdrop(scene, (0.55, 0.6, 0.66))
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.display.shading.show_shadows = True
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.filepath = ${j(job.preview)}
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)

    # the design's sides beside a 5-stud avatar, then the 64 px silhouettes alone, for the review
    views = ${j(views)}
    cam.data.clip_end = max(obj.dimensions) * 50
    if views:
        avatar = _wf_avatar(-(obj.dimensions.x / 2 + 1.5))
        lo = mathutils.Vector((-(obj.dimensions.x / 2 + 2.5), -obj.dimensions.y / 2, 0))
        hi = mathutils.Vector((obj.dimensions.x / 2, obj.dimensions.y / 2, max(h, 5)))
        scene.render.resolution_x = 512
        scene.render.resolution_y = 512
        for path, d in views:
            _wf_aim(cam, (lo + hi) / 2, d, max(hi - lo) * 2.2)
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(avatar)
    centre = mathutils.Vector((0, 0, h * 0.5))
    dist = max(obj.dimensions) * 2.5
    ${job.silhouette ? `gates["silhouetteFill"] = _wf_silhouettes(scene, cam, centre, dist, ${j(silhouettes)}, ${j(job.silhouette)})` : "pass"}

    bm = bmesh.new(); bm.from_mesh(me); tris = sum(len(f.verts) - 2 for f in bm.faces); bm.free()
    d = obj.dimensions
    _wf_report({"ok": True, "triangles": tris, "size": [d.x, d.y, d.z], "materials": len(mats), "openEdges": open_edges, "gates": gates})

try:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _wf_finish()
except Exception:
    _wf_report({"ok": False, "error": traceback.format_exc()[-1500:]})
`;
}

const BLENDER_DIR = "C:/Program Files/Blender Foundation";
/** Standard installs outside the PATH: macOS app bundle, Linux snap and flatpak. */
const OTHER_BLENDERS = ["/Applications/Blender.app/Contents/MacOS/Blender", "/snap/bin/blender", "/var/lib/flatpak/exports/bin/org.blender.Blender"];

/** Blender on the PATH, else the newest standard Windows install, else a macOS or Linux one. */
export async function findBlender(runner: ProcessRunner, files: FileIO): Promise<string | null> {
  const found = await runner.resolve("blender");
  if (found) return found;
  for (const version of ["5.3", "5.2", "5.1", "5.0", "4.5", "4.4", "4.3", "4.2"]) {
    const exe = `${BLENDER_DIR}/Blender ${version}/blender.exe`;
    if (await files.exists(exe)) return exe;
  }
  for (const exe of OTHER_BLENDERS) if (await files.exists(exe)) return exe;
  return null;
}

async function runBlender(python: string, report: string, blender: string, runner: ProcessRunner, files: FileIO, scriptPath: string, timeoutSecs: number): Promise<BlenderReport> {
  await files.writeText(scriptPath, python);
  await runner.runCapture(blender, ["--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python", scriptPath], undefined, timeoutSecs);
  try {
    return JSON.parse(await files.readText(report)) as BlenderReport;
  } catch {
    return { ok: false, error: "Blender stopped without a report" };
  }
}

/** Runs the final model and returns what the script reported. */
export async function runBlenderJob(code: string, job: BlenderJob, blender: string, runner: ProcessRunner, files: FileIO, scriptPath: string, timeoutSecs = 180): Promise<BlenderReport> {
  const problem = blenderScriptProblem(code);
  return problem ? { ok: false, error: problem } : runBlender(blenderJobScript(code, job), job.report, blender, runner, files, scriptPath, timeoutSecs);
}

/** Renders the 3D design from every side. */
export async function runBlenderConcept(code: string, renders: Record<ConceptView, string>, report: string, blender: string, runner: ProcessRunner, files: FileIO, scriptPath: string, timeoutSecs = 300): Promise<BlenderReport> {
  const problem = blenderScriptProblem(code);
  return problem ? { ok: false, error: problem } : runBlender(blenderConceptScript(code, renders, report), report, blender, runner, files, scriptPath, timeoutSecs);
}
