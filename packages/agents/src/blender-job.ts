import type { FileIO } from "./types";
import type { ProcessRunner } from "./runner";

/**
 * Runs a design script in Blender, headless: models are made in Blender, never in Roblox Studio.
 * The agent writes `def build():`, a high-detail design with no triangle budget. Everything after it is fixed
 * here and costs seconds, not minutes: a closed low-poly shell from a voxel remesh, then the design's colours
 * and relief baked onto it, so the game model keeps the detail within the Roblox triangle limit.
 * Measured on 5 Nov 2026: a 269,184-triangle dragon became 18,900 triangles and two textures in 25 seconds.
 * The full design is kept too: `<textures>_design.glb` and `<textures>_design.png`.
 */
export interface BlenderJob {
  /** Absolute paths. */
  glb: string;
  fbx: string;
  preview: string;
  report: string;
  /** Prefix of the baked textures: `<prefix>_albedo.png`, `_normal.png`, `_surface.png` (roughness and metalness). */
  textures: string;
  heightStuds: number;
  maxTriangles: number;
  /** Becomes the MeshPart's name: a GLB otherwise arrives as a Model called `Scene`. */
  name: string;
  /** Final texture side in pixels. */
  texture: number;
}

/**
 * What a model may cost in a Roblox game. 20,000 triangles is a hard limit per mesh, not a target: a prop placed
 * many times has to be far lighter, and texture memory goes with pixel count, four times for a doubled side.
 * Baked at twice the size and reduced, so the small texture stays clean.
 */
export function modelBudget(category = "prop"): { maxTriangles: number; texture: number } {
  if (category === "landmark") return { maxTriangles: 20000, texture: 1024 };
  if (category === "building") return { maxTriangles: 12000, texture: 1024 };
  if (category === "vegetation" || category === "rock") return { maxTriangles: 3000, texture: 512 };
  return { maxTriangles: 8000, texture: 512 };
}

export interface BlenderReport {
  ok: boolean;
  error?: string;
  /** Triangles of the design. */
  designTriangles?: number;
  /** Triangles of the game model. */
  triangles?: number;
  /** Width, depth, height in studs. */
  size?: [number, number, number];
  /** Edges with one face: a closed model has none. */
  openEdges?: number;
  texture?: number;
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

/** The complete Python file Blender runs. The wrapper's own names start with _wf_: an agent's helpers must not shadow them. */
export function blenderJobScript(code: string, job: BlenderJob, opts: { voxels?: number } = {}): string {
  const voxels = opts.voxels ?? 300;
  const texture = job.texture * 2;
  return `import bpy, bmesh, math, mathutils, random, json, traceback
random.seed(7)
_WF_REPORT = ${j(job.report)}
_WF_HEIGHT = ${job.heightStuds}

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

# ---- the agent's design
${code}
# ---- end of the design

def _wf_finish():
    build()
    objs = [o for o in bpy.data.objects if o.type in {"MESH", "CURVE", "META", "SURFACE", "FONT"}]
    if not objs:
        raise RuntimeError("build() created no mesh")
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    hi = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me = hi.data
    if not me.materials:
        raise RuntimeError("the model has no material")

    # height, base on the ground, centred; the agent's front is -Y, Roblox prefabs face -Z
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    span = max(zs) - min(zs)
    if span <= 0:
        raise RuntimeError("the model has no height")
    H = _WF_HEIGHT
    s = H / span
    cx = (min(xs) + max(xs)) / 2; cy = (min(ys) + max(ys)) / 2; z0 = min(zs)
    for v in me.vertices:
        v.co = ((v.co.x - cx) * -s, (v.co.y - cy) * -s, (v.co.z - z0) * s)
    me.update()
    design_tris = sum(len(p.vertices) - 2 for p in me.polygons)
    for m in me.materials:
        if not m:
            continue
        m.use_nodes = True
        b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        b.inputs[0].default_value = m.diffuse_color
        b.inputs["Roughness"].default_value = m.roughness
        b.inputs["Metallic"].default_value = m.metallic

    # the full design stays available: a render and a master GLB, next to the game model
    scene = bpy.context.scene
    dmax = max(hi.dimensions)
    cam = bpy.data.objects.new("_wf_cam", bpy.data.cameras.new("_wf_cam"))
    scene.collection.objects.link(cam)
    cam.location = (dmax * 1.0, dmax * 1.5, H * 0.5 + dmax * 0.6)
    target = mathutils.Vector((0, 0, H * 0.4))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    world = bpy.data.worlds.new("_wf_w")
    world.use_nodes = True
    next(n for n in world.node_tree.nodes if n.type == "BACKGROUND").inputs[0].default_value = (0.5, 0.55, 0.62, 1)
    scene.world = world
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = ${j(job.textures)} + "_design.png"
    bpy.ops.render.render(write_still=True)
    bpy.ops.object.select_all(action="DESELECT")
    hi.select_set(True); bpy.context.view_layer.objects.active = hi
    bpy.ops.export_scene.gltf(filepath=${j(job.textures)} + "_design.glb", export_format="GLB", use_selection=True, export_apply=True)

    # the game shell: closed by construction, inside the triangle limit
    lo = hi.copy(); lo.data = hi.data.copy(); lo.name = "model"
    bpy.context.scene.collection.objects.link(lo)
    bpy.ops.object.select_all(action="DESELECT")
    lo.select_set(True); bpy.context.view_layer.objects.active = lo
    r = lo.modifiers.new("remesh", "REMESH")
    r.mode = "VOXEL"; r.voxel_size = H / ${voxels}; r.use_smooth_shade = False
    bpy.ops.object.modifier_apply(modifier=r.name)
    tris = sum(len(p.vertices) - 2 for p in lo.data.polygons)
    if tris > ${job.maxTriangles} * 0.95:
        d = lo.modifiers.new("budget", "DECIMATE"); d.ratio = ${job.maxTriangles} * 0.95 / tris
        bpy.ops.object.modifier_apply(modifier=d.name)
    lo.data.materials.clear()
    while lo.data.uv_layers:
        lo.data.uv_layers.remove(lo.data.uv_layers[0])
    lo.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(85), island_margin=0.0015)
    bpy.ops.object.mode_set(mode="OBJECT")

    # the design's colours and relief, baked onto the shell
    final = bpy.data.materials.new("baked")
    final.use_nodes = True
    nt = final.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.8
    albedo = bpy.data.images.new("albedo", ${texture}, ${texture}, alpha=False)
    normal = bpy.data.images.new("normal", ${texture}, ${texture}, alpha=False)
    normal.colorspace_settings.name = "Non-Color"
    surface = bpy.data.images.new("surface", ${texture}, ${texture}, alpha=False)
    surface.colorspace_settings.name = "Non-Color"
    ta = nt.nodes.new("ShaderNodeTexImage"); ta.image = albedo
    tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = normal
    ts = nt.nodes.new("ShaderNodeTexImage"); ts.image = surface
    split = nt.nodes.new("ShaderNodeSeparateColor")
    nm = nt.nodes.new("ShaderNodeNormalMap")
    lo.data.materials.append(final)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 8
    scene.cycles.use_denoising = False
    bake = scene.render.bake
    bake.use_selected_to_active = True
    bake.cage_extrusion = H * 0.012
    bake.max_ray_distance = H * 0.04
    bake.margin = 3
    bake.use_pass_direct = False
    bake.use_pass_indirect = False
    bake.use_pass_color = True
    bpy.ops.object.select_all(action="DESELECT")
    hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
    # a metal has no diffuse colour: baked as it is, gold comes out black. Colour first, with metal off,
    # then roughness and metalness as glTF stores them (green, blue), through the emission pass.
    design_mats = [m for m in me.materials if m]
    nodes = {m: next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED") for m in design_mats}
    for b in nodes.values():
        b.inputs["Metallic"].default_value = 0.0
    nt.nodes.active = ta
    bpy.ops.object.bake(type="DIFFUSE")
    nt.nodes.active = tn
    bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT")
    for m, b in nodes.items():
        b.inputs["Emission Color"].default_value = (0.0, m.roughness, m.metallic, 1.0)
        b.inputs["Emission Strength"].default_value = 1.0
    nt.nodes.active = ts
    bpy.ops.object.bake(type="EMIT")
    for img, path in ((albedo, ${j(job.textures)} + "_albedo.png"), (normal, ${j(job.textures)} + "_normal.png"), (surface, ${j(job.textures)} + "_surface.png")):
        img.scale(${job.texture}, ${job.texture})
        img.filepath_raw = path; img.file_format = "PNG"; img.save(); img.pack()
    nt.links.new(ta.outputs[0], bsdf.inputs[0])
    nt.links.new(ts.outputs[0], split.inputs[0])
    nt.links.new(split.outputs[1], bsdf.inputs["Roughness"])
    nt.links.new(split.outputs[2], bsdf.inputs["Metallic"])
    nt.links.new(tn.outputs[0], nm.inputs["Color"])
    nt.links.new(nm.outputs[0], bsdf.inputs["Normal"])
    bpy.data.objects.remove(hi)
    lo.name = ${j(job.name)}
    lo.data.name = ${j(job.name)}
    scene.name = ${j(job.name)}

    # mesh gates, then the exports (the origin is already bottom centre: it becomes the MeshPart pivot)
    bm = bmesh.new(); bm.from_mesh(lo.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    open_edges = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    tris = len(bm.faces)
    bm.to_mesh(lo.data); bm.free(); lo.data.update()
    lo.select_set(True); bpy.context.view_layer.objects.active = lo
    bpy.ops.object.shade_smooth()
    bpy.ops.export_scene.gltf(filepath=${j(job.glb)}, export_format="GLB", use_selection=True, export_apply=True)
    bpy.ops.export_scene.fbx(filepath=${j(job.fbx)}, use_selection=True, axis_forward="-Z", axis_up="Y", apply_scale_options="FBX_SCALE_UNITS", add_leaf_bones=False, bake_anim=False, mesh_smooth_type="FACE", path_mode="COPY", embed_textures=True)

    # the front three-quarter preview
    sun = bpy.data.objects.new("_wf_sun", bpy.data.lights.new("_wf_sun", "SUN"))
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), 0, math.radians(150))
    sun.data.energy = 3
    scene.cycles.samples = 24
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.filepath = ${j(job.preview)}
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    d = lo.dimensions
    _wf_report({"ok": True, "designTriangles": design_tris, "triangles": tris, "size": [d.x, d.y, d.z], "openEdges": open_edges, "texture": ${job.texture}})

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

/** Runs one job and returns what the script reported. */
export async function runBlenderJob(code: string, job: BlenderJob, blender: string, runner: ProcessRunner, files: FileIO, scriptPath: string, timeoutSecs = 240): Promise<BlenderReport> {
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
