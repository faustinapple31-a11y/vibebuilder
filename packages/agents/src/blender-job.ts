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
    world = bpy.data.worlds.new("_wf_w")
    world.use_nodes = True
    next(n for n in world.node_tree.nodes if n.type == "BACKGROUND").inputs[0].default_value = (0.8, 0.82, 0.85, 1)
    scene.world = world
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

/** The complete Python file Blender runs for the final model. */
export function blenderJobScript(code: string, job: BlenderJob): string {
  return `${prelude(job.report)}
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
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    next(n for n in world.node_tree.nodes if n.type == "BACKGROUND").inputs[0].default_value = (0.55, 0.6, 0.66, 1)
    scene.world = world
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.display.shading.show_shadows = True
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.filepath = ${j(job.preview)}
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)

    bm = bmesh.new(); bm.from_mesh(me); tris = sum(len(f.verts) - 2 for f in bm.faces); bm.free()
    d = obj.dimensions
    _wf_report({"ok": True, "triangles": tris, "size": [d.x, d.y, d.z], "materials": len(mats), "openEdges": open_edges})

try:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _wf_finish()
except Exception:
    _wf_report({"ok": False, "error": traceback.format_exc()[-1500:]})
`;
}

const BLENDER_DIR = "C:/Program Files/Blender Foundation";

/** Blender on the PATH, else the newest standard Windows install. */
export async function findBlender(runner: ProcessRunner, files: FileIO): Promise<string | null> {
  const found = await runner.resolve("blender");
  if (found) return found;
  for (const version of ["5.3", "5.2", "5.1", "5.0", "4.5", "4.4", "4.3", "4.2"]) {
    const exe = `${BLENDER_DIR}/Blender ${version}/blender.exe`;
    if (await files.exists(exe)) return exe;
  }
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
