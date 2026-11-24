"""One picture of a region, lit like the game: sky, sun behind the viewer, AgX."""
import math
import bpy
from mathutils import Vector


def light(plan):
    sc = bpy.context.scene
    L = plan["lighting"]
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    sky = nt.nodes.new("ShaderNodeTexSky")
    for kind in ("MULTIPLE_SCATTERING", "NISHITA"):
        try:
            sky.sky_type = kind
            break
        except TypeError:
            continue
    clock = L.get("clockTime", 14)
    elev = max(0.12, math.sin(math.pi * max(0.08, min(0.92, (clock - 5.5) / 13))))
    sky.sun_elevation = math.radians(14 + 36 * elev)
    sky.sun_rotation = math.radians(215)
    sky.sun_intensity = 0.2
    nt.links.new(sky.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 0.16
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sc.collection.objects.link(sun)
    sun.data.energy = 3.0
    sun.data.angle = math.radians(1.2)
    sun.data.color = (1.0, 0.92, 0.8)
    sun.rotation_euler = (math.radians(90 - (14 + 36 * elev)), 0, math.radians(35))
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass


def engine(samples):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.transparent_max_bounces = 16
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "OPTIX"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type != "CPU"
        sc.cycles.device = "GPU"
    except Exception:
        pass


def camera(eye, at, fov=55):
    sc = bpy.context.scene
    cam = bpy.data.objects.get("cam") or bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.clip_end = 8000
    cam.location = eye
    cam.rotation_euler = (Vector(at) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
    cam.data.angle = math.radians(fov)


def shoot(plan, region, ground, path, samples=24):
    sc = bpy.context.scene
    light(plan)
    engine(samples)
    x0, z0, x1, z1 = region["rect"]
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    aim = (cx, cz)
    best = max(plan["settlements"], key=lambda s: -math.hypot(s["center"][0] - cx, s["center"][1] - cz), default=None)
    if best and x0 - 60 < best["center"][0] < x1 + 60 and z0 - 60 < best["center"][1] < z1 + 60:
        aim = (min(max(best["center"][0], x0 + 60), x1 - 60), min(max(best["center"][1], z0 + 60), z1 - 60))
    gy = ground.height(*aim)
    span = max(x1 - x0, z1 - z0)
    eye = Vector((aim[0] - span * 0.26, -(aim[1] - span * 0.34) - span * 0.68 * 0 - span * 0.0, gy + span * 0.2))
    eye.y = -(aim[1]) - span * 0.36
    camera(eye, (aim[0], -aim[1], gy + 6), 58)
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
