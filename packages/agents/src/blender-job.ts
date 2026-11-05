import type { FileIO } from "./types";
import type { ProcessRunner } from "./runner";

/**
 * Runs a modelling script in Blender, headless: models are made in Blender, never in Roblox Studio.
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

/** The complete Python file Blender runs. */
export function blenderJobScript(code: string, job: BlenderJob): string {
  const j = (v: unknown) => JSON.stringify(v);
  return `import bpy, bmesh, math, mathutils, random, json, traceback
random.seed(7)
REPORT = ${j(job.report)}

def _report(data):
    with open(REPORT, "w", encoding="utf8") as f:
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

# ---- the agent's model
${code}
# ---- end of the agent's model

def _finish():
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

    # triangle budget of a Roblox MeshPart
    bm = bmesh.new(); bm.from_mesh(me); tris = sum(len(f.verts) - 2 for f in bm.faces); bm.free()
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
    _report({"ok": True, "triangles": tris, "size": [d.x, d.y, d.z], "materials": len(mats)})

try:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _finish()
except Exception:
    _report({"ok": False, "error": traceback.format_exc()[-1500:]})
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

/** Runs one job and returns what the script reported. */
export async function runBlenderJob(code: string, job: BlenderJob, blender: string, runner: ProcessRunner, files: FileIO, scriptPath: string, timeoutSecs = 180): Promise<BlenderReport> {
  const problem = blenderScriptProblem(code);
  if (problem) return { ok: false, error: problem };
  await files.writeText(scriptPath, blenderJobScript(code, job));
  await runner.runCapture(blender, ["--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python", scriptPath], undefined, timeoutSecs);
  try {
    return JSON.parse(await files.readText(job.report)) as BlenderReport;
  } catch {
    return { ok: false, error: "Blender stopped without a report" };
  }
}
