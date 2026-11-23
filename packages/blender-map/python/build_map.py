"""Builds a whole WorldForge map in Blender from scene.json.

  blender -b --factory-startup --python build_map.py -- scene.json outdir [--views spawn,landmark,village,wide] [--samples 48]

Writes map.blend, the renders, kit.glb (each piece once), terrain.glb (chunks) and layout.json (where pieces go).
"""
import bpy
import json
import math
import os
import random
import sys
import time
from mathutils import Vector, Matrix, Quaternion, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wf_mesh import M, lin, mix, mul, vary, material  # noqa: E402
from wf_flora import FLORA, outcrop  # noqa: E402
from wf_arch import ARCH, ramparts  # noqa: E402
from wf_props import PROPS, from_parts  # noqa: E402

T0 = time.time()


def log(s):
    print("WF %.1fs %s" % (time.time() - T0, s), flush=True)


args = sys.argv[sys.argv.index("--") + 1:]
scene = json.load(open(args[0], encoding="utf8"))
OUT = args[1]
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
PAL = {k: lin(v) for k, v in scene["palette"].items()}
T = scene["terrain"]
W, D, CS = T["width"], T["depth"], T["cellSize"]
OX, OZ = T["origin"]
H, MAT, WATER = T["heights"], T["materials"], T["water"]
NAMES = scene["materialNames"]


def height(x, z):
    fx, fz = (x - OX) / CS, (z - OZ) / CS
    x0, z0 = max(0, min(W - 2, int(fx))), max(0, min(D - 2, int(fz)))
    tx, tz = max(0, min(1, fx - x0)), max(0, min(1, fz - z0))
    i = z0 * W + x0
    return (H[i] * (1 - tx) + H[i + 1] * tx) * (1 - tz) + (H[i + W] * (1 - tx) + H[i + W + 1] * tx) * tz


# the first view: nothing of the ground stands between the spawn and the foot of the focal
if scene.get("focal"):
    (ax, ay, az), (bx, by, bz) = scene["spawn"]["position"], scene["focal"]
    L2 = (bx - ax) ** 2 + (bz - az) ** 2
    for j in range(D):
        for i in range(W):
            x, z = OX + i * CS, OZ + j * CS
            t = ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / max(1, L2)
            if not 0.06 < t < 1:
                continue
            off = math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az))
            wide = 26 + 30 * t
            if off > wide * 1.8:
                continue
            line = ay + 3.5 + (by + 1.0 - ay - 3.5) * t
            k = j * W + i
            if H[k] > line:
                f = min(1.0, max(0.0, (wide * 1.8 - off) / (wide * 0.8)))
                f = f * f * (3 - 2 * f)
                H[k] += (line - H[k]) * f

# ---------------------------------------------------------------- paths
BUCKET = 32
paths = {}
for p in scene["paths"]:
    pts = p["points"]
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / 2))
        for k in range(n):
            x, z = a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n
            paths.setdefault((int(x // BUCKET), int(z // BUCKET)), []).append((x, z, p["width"]))


def path_dist(x, z):
    """Distance to the nearest path edge: negative on the path."""
    best = 1e9
    bx, bz = int(x // BUCKET), int(z // BUCKET)
    for ix in (bx - 1, bx, bx + 1):
        for iz in (bz - 1, bz, bz + 1):
            for px, pz, w in paths.get((ix, iz), ()):
                d = math.hypot(x - px, z - pz) - w / 2
                if d < best:
                    best = d
    return best


# ---------------------------------------------------------------- terrain
BASE = {"Grass": PAL["foliage"], "LeafyGrass": PAL["foliageAlt"], "Ground": PAL["ground"], "Mud": mul(PAL["ground"], 0.7), "Rock": mix(mul(PAL["stone"], 0.62), PAL["ground"], 0.22), "Slate": mul(PAL["stone"], 0.5),
        "Sand": (0.55, 0.43, 0.25), "Snow": (0.8, 0.83, 0.88), "Cobblestone": mul(PAL["stone"], 0.9), "Basalt": (0.06, 0.055, 0.06), "Limestone": (0.55, 0.5, 0.4), "Sandstone": (0.5, 0.33, 0.18),
        "Ice": (0.5, 0.68, 0.8), "Asphalt": (0.06, 0.06, 0.065), "Pavement": (0.3, 0.3, 0.3), "CrackedLava": (0.6, 0.1, 0.02), "Concrete": (0.4, 0.4, 0.4)}
ROAD = mix(PAL["ground"], (0.32, 0.25, 0.16), 0.6)
DRY = PAL["foliage"][1] < 0.02 or "desert" in scene.get("style", "") or "volcan" in scene.get("prompt", "")
kept = [(s[0], s[1], s[2]) for s in scene["flat"]]


def ground(x, z):
    """Height, Roblox material and colour of one terrain point."""
    y = height(x, z)
    e = 2.5
    nx, nz = height(x - e, z) - height(x + e, z), height(x, z - e) - height(x, z + e)
    slope = math.hypot(nx, nz) / (2 * e)
    d = path_dist(x, z)
    cx, cz = int(round((x - OX) / CS)), int(round((z - OZ) / CS))
    i = max(0, min(D - 1, cz)) * W + max(0, min(W - 1, cx))
    name = NAMES[MAT[i]]
    if name in ("Limestone", "Basalt", "Slate") and not DRY:
        name = "Rock"  # strata bands of the stepped ground: on a smooth slope they read as white patches
    n1 = noise.noise(Vector((x * 0.018, z * 0.018, 3)))
    n2 = noise.noise(Vector((x * 0.09, z * 0.09, 7)))
    n3 = noise.noise(Vector((x * 0.4, z * 0.4, 1)))
    soft = name in ("Grass", "LeafyGrass", "Ground", "Mud")
    flat = min((math.hypot(x - fx, z - fz) - r for fx, fz, r in kept), default=99)
    rough = 0 if (d < 3 or flat < 2) else min(1, max(d - 3, 0) / 10, max(flat - 2, 0) / 10)
    if name in ("Rock", "Slate", "Basalt") or slope > 0.75:
        y += rough * (n2 * 2.2 + n3 * 1.3) * min(1, slope + 0.4)
    else:
        y += rough * (n2 * 0.5 + n3 * 0.15)
    if soft:
        base = mix(PAL["foliage"], PAL["foliageAlt"], 0.5 + n1 * 0.9)
        base = mix(base, (0.22, 0.24, 0.05), max(0, n2) * 0.35)
        c, m = mul(base, 1.0 + n3 * 0.12), "Grass"
        if slope > 0.62:
            k = min(1, (slope - 0.62) / 0.35)
            c = mix(c, mul(mix(PAL["stone"], PAL["ground"], 0.4 + n2 * 0.35), 0.75), k)
            if slope > 0.85:
                m = "Rock"
    else:
        c, m = mul(BASE.get(name, PAL["stone"]), 0.8 + n2 * 0.22 + n3 * 0.1), ("Rock" if name in ("Slate",) else name)
        if name in ("Rock", "Slate") and slope < 0.55:
            k = min(1, max(0, (0.6 - slope) * 3.2 + n2 * 0.5))
            c, m = mix(c, mul(mix(PAL["foliage"], PAL["foliageAlt"], 0.5 + n1), 0.95), k), ("Grass" if k > 0.5 else "Rock")
        elif m == "Rock":
            band = 0.5 + 0.5 * math.sin(y * 0.55 + n1 * 5)
            c = mul(c, 0.8 + 0.3 * band)
    edge = d + n2 * 1.6 + n3 * 0.7
    if edge < 2.2:
        k = max(0, min(1, (2.2 - edge) / 2.2))
        c = mix(c, mul(ROAD, 1 + n3 * 0.2 + n2 * 0.1), k)
        if edge < 0.7:
            m = "Ground"
        if d < 0:
            y -= 0.18 * min(1, -d)
    return y, m, c


terrain_col = bpy.data.collections.new("terrain")
sc.collection.children.link(terrain_col)
CHUNK = 32  # cells
hot = set()
for p in scene["paths"]:
    for x, z in p["points"]:
        hot.add((int((x - OX) / CS) // CHUNK, int((z - OZ) / CS) // CHUNK))
for x, z, r in kept:
    for dx in (-r - 30, 0, r + 30):
        for dz in (-r - 30, 0, r + 30):
            hot.add((int((x + dx - OX) / CS) // CHUNK, int((z + dz - OZ) / CS) // CHUNK))
cache = {}


def gp(x, z):
    k = (round(x * 4), round(z * 4))
    if k not in cache:
        cache[k] = ground(x, z)
    return cache[k]


tris = 0
for cz in range(math.ceil((D - 1) / CHUNK)):
    for cx in range(math.ceil((W - 1) / CHUNK)):
        step = CS / 2 if (cx, cz) in hot else CS
        x0, z0 = OX + cx * CHUNK * CS, OZ + cz * CHUNK * CS
        x1, z1 = min(OX + (W - 1) * CS, x0 + CHUNK * CS), min(OZ + (D - 1) * CS, z0 + CHUNK * CS)
        nx, nz = int(round((x1 - x0) / step)), int(round((z1 - z0) / step))
        if nx < 1 or nz < 1:
            continue
        m = M()
        data = [[gp(x0 + i * step, z0 + j * step) for i in range(nx + 1)] for j in range(nz + 1)]
        idx = {}
        for j in range(nz + 1):
            for i in range(nx + 1):
                idx[(i, j)] = len(m.v)
                m.v.append(Vector((x0 + i * step, -(z0 + j * step), data[j][i][0])))
        for j in range(nz):
            for i in range(nx):
                q = [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
                mats = [data[b][a][1] for a, b in q]
                pick = max(set(mats), key=mats.count)
                m.f.append([idx[c] for c in q])
                m.fm.append(pick)
                m.fc.append([data[b][a][2] for a, b in q])
                m.fs.append(True)
        # skirts hide the seam between chunks of different density
        rims = [[(i, 0) for i in range(nx + 1)], [(i, nz) for i in range(nx, -1, -1)], [(0, j) for j in range(nz, -1, -1)], [(nx, j) for j in range(nz + 1)]]
        for rim in rims:
            for a, b in zip(rim, rim[1:]):
                va, vb = m.v[idx[a]], m.v[idx[b]]
                k = len(m.v)
                m.v += [va - Vector((0, 0, 5)), vb - Vector((0, 0, 5))]
                f = [idx[a], idx[b], k + 1, k]
                m.f.append(f)
                m.fm.append(data[a[1]][a[0]][1])
                m.fc.append([mul(data[a[1]][a[0]][2], 0.7)] * 4)
                m.fs.append(False)
        m.obj("terrain_%02d_%02d" % (cx, cz), terrain_col)
        tris += len(m.f) * 2
log("terrain %d tris" % tris)

# water
if any(w is not None for w in WATER):
    m = M()
    for j in range(D - 1):
        for i in range(W - 1):
            w = WATER[j * W + i]
            if w is None:
                continue
            x, z = OX + i * CS, OZ + j * CS
            n = len(m.v)
            for a, b in ((-0.5, -0.5), (-0.5, 1.5), (1.5, 1.5), (1.5, -0.5)):
                m.v.append(Vector((x + a * CS, -(z + b * CS), w)))
            m.f.append([n, n + 1, n + 2, n + 3])
            m.fm.append("Water")
            m.fc.append([PAL["water"]] * 4)
            m.fs.append(True)
    m.obj("water", terrain_col)

# ---------------------------------------------------------------- kit
kit_col = bpy.data.collections.new("kit")
sc.collection.children.link(kit_col)
BUILD = {**FLORA, **ARCH, **PROPS}
kit, fallback = {}, set()
MAXV = {"grass": 4, "flower": 6, "bush": 5, "boulder": 6, "stone": 4, "birch": 5, "round_tree": 6, "pine_tree": 5}


def piece(prefab, variant):
    variant = variant % MAXV.get(prefab, 99)
    key = "%s_%d" % (prefab, variant)
    if key in kit:
        return kit[key]
    info = scene["prefabs"][prefab]
    info = info[min(variant, len(info) - 1)]
    lo, hi = info["min"], info["max"]
    size = (hi[0] - lo[0], hi[2] - lo[2], max(0.5, hi[1]))
    rng = random.Random("%s/%d/%d" % (prefab, variant, scene["seed"]))
    if prefab in BUILD:
        m = BUILD[prefab](rng, PAL, size, variant)
    else:
        fallback.add(prefab)
        m = from_parts(rng, info["parts"])
    if not m.f:
        kit[key] = None
        return None
    ob = m.obj(key, kit_col)
    kit[key] = ob
    return ob


def contact_shade(ob):
    """Ambient occlusion into the vertex colours: the depth a flat-coloured kit lacks."""
    me = ob.data
    ao = me.color_attributes.new("AO", "FLOAT_COLOR", "CORNER")
    me.color_attributes.active_color = ao
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    n = len(me.loops) * 4
    import array
    a, c = array.array("f", [0.0]) * n, array.array("f", [0.0]) * n
    ao.data.foreach_get("color", a)
    me.color_attributes["Col"].data.foreach_get("color", c)
    for i in range(0, n, 4):
        k = 0.42 + 0.58 * min(1.0, a[i] * 1.15)
        c[i] *= k
        c[i + 1] *= k
        c[i + 2] *= k
    me.color_attributes["Col"].data.foreach_set("color", c)
    me.color_attributes.remove(me.color_attributes["AO"])
    me.color_attributes.active_color = me.color_attributes["Col"]


walls = [p for p in scene["placements"] if p["prefab"] == "town_wall"]
if len(walls) > 4 and scene.get("village"):
    vx, vz = scene["village"]["center"]
    ring = sorted(((math.atan2(p["position"][2] - vz, p["position"][0] - vx), p["position"][0], p["position"][2]) for p in walls))
    runs, cur = [], [ring[0]]
    for a, b in zip(ring, ring[1:] + [ring[0]]):
        gap = math.hypot(a[1] - b[1], a[2] - b[2])
        crossed = any(path_dist(a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t) < 4 for t in (0.1, 0.3, 0.5, 0.7, 0.9))
        if gap < 46 and not crossed and b is not ring[0]:
            cur.append(b)
        else:
            runs.append(cur)
            cur = [b]
    runs = [r for r in runs if len(r) >= 2]
    if runs:
        ob = ramparts(random.Random(scene["seed"]), PAL, [[(q[1], -q[2]) for q in r] for r in runs], lambda x, y: height(x, -y)).obj("ramparts", kit_col)
        kit["ramparts"] = ob
    scene["placements"] = [p for p in scene["placements"] if p["prefab"] not in ("town_wall", "gate_tower")]
for p in scene["placements"]:
    piece(p["prefab"], p["variant"])
log("kit %d pieces, fallback: %s" % (len(kit), ", ".join(sorted(fallback))))
sc.render.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type != "CPU"
    sc.cycles.device = "GPU"
except Exception as ex:
    log("cpu: %s" % ex)
sc.cycles.samples = 32
world = bpy.data.worlds.new("w")
sc.world = world
world.light_settings.distance = 6
terrain_col.hide_render = True
for ob in kit.values():
    # leaves carry their own gradient: baked occlusion only turns their hidden sides black
    if ob and not all(s.material.name in ("Leaf", "SmoothPlastic") for s in ob.material_slots):
        for o2 in kit_col.objects:
            o2.hide_render = o2 is not ob
        contact_shade(ob)
for o2 in kit_col.objects:
    o2.hide_render = False
terrain_col.hide_render = False
log("ambient occlusion")

# ---------------------------------------------------------------- placements
place_col = bpy.data.collections.new("placements")
sc.collection.children.link(place_col)
layout = []
for p in scene["placements"]:
    ob = piece(p["prefab"], p["variant"])
    if not ob:
        continue
    x, y, z = p["position"]
    info = scene["prefabs"][p["prefab"]]
    sink = info[min(p["variant"], len(info) - 1)]["sink"] * p["scale"]
    natural = p["category"] in ("vegetation", "rock")
    gy = height(x, z) - (0.1 if natural else 0.0) if natural else y + sink
    rot = Matrix.Rotation(p["rotationY"], 4, "Z")
    if p.get("up") and natural and p["prefab"] not in ("round_tree", "birch", "pine_tree", "dead_tree"):
        u = p["up"]
        rot = Vector((0, 0, 1)).rotation_difference(Vector((u[0], -u[2], u[1]))).to_matrix().to_4x4() @ rot
    s = p["scale"]
    if p["prefab"] in ("castle",):
        s = s * 1.0
    inst = bpy.data.objects.new(p["id"], ob.data)
    inst.matrix_world = Matrix.Translation((x, -z, gy)) @ rot @ Matrix.Scale(s, 4)
    place_col.objects.link(inst)
    q = rot.to_quaternion()
    layout.append({"id": p["id"], "piece": ob.name, "position": [x, gy, z], "quaternion": [q.x, q.z, -q.y, q.w], "scale": s, "category": p["category"], "zone": p.get("zone")})

if kit.get("ramparts"):
    inst = bpy.data.objects.new("ramparts_0", kit["ramparts"].data)
    place_col.objects.link(inst)
    layout.append({"id": "ramparts_0", "piece": "ramparts", "position": [0, 0, 0], "quaternion": [0, 0, 0, 1], "scale": 1, "category": "building"})

# a meadow under the trees: far more grass than the layout carries, thinned with distance from where players walk
rng = random.Random(scene["seed"])
tufts = [piece("grass", v) or None for v in range(4)] if "grass" in scene["prefabs"] else []
tufts = [t for t in tufts if t]
blocked = [(p["position"][0], p["position"][2], p["block"]) for p in scene["placements"] if p.get("block", 0) > 2.5]
bg = {}
for x, z, r in blocked:
    bg.setdefault((int(x // 64), int(z // 64)), []).append((x, z, r))
extra = 0
sx, sz = scene["spawn"]["position"][0], scene["spawn"]["position"][2]
if tufts:
    for _ in range(140000):
        if extra >= 9000:
            break
        x, z = OX + rng.random() * (W - 1) * CS, OZ + rng.random() * (D - 1) * CS
        d = path_dist(x, z)
        near = min(max(d, 0), math.hypot(x - sx, z - sz) * 0.5, *[max(0, math.hypot(x - a, z - b) - c) for a, b, c in kept], 999)
        if d < 1.2 or rng.random() > math.exp(-near / 45) + 0.06:
            continue
        y, m, _c = gp(round(x / 2) * 2, round(z / 2) * 2)
        if m != "Grass" or noise.noise(Vector((x * 0.05, z * 0.05, 9))) < -0.12:
            continue
        if any(math.hypot(x - a, z - b) < c for a, b, c in bg.get((int(x // 64), int(z // 64)), ())):
            continue
        t = rng.choice(tufts)
        s = rng.uniform(0.7, 1.35)
        r = rng.uniform(0, 6.28)
        inst = bpy.data.objects.new("meadow_%d" % extra, t.data)
        inst.matrix_world = Matrix.Translation((x, -z, height(x, z) - 0.05)) @ Matrix.Rotation(r, 4, "Z") @ Matrix.Scale(s, 4)
        place_col.objects.link(inst)
        layout.append({"id": "meadow_%d" % extra, "piece": t.name, "position": [x, height(x, z) - 0.05, z], "quaternion": [0, math.sin(r / 2), 0, math.cos(r / 2)], "scale": s, "category": "vegetation"})
        extra += 1


def scatter(name, obs, count, accept, scale, sink=0.05, tilt=0.0):
    """Small pieces the layout does not carry: ferns in the woods, pebbles by the paths."""
    done = 0
    for _ in range(count * 40):
        if done >= count:
            break
        x, z = OX + rng.random() * (W - 1) * CS, OZ + rng.random() * (D - 1) * CS
        if not accept(x, z) or any(math.hypot(x - a, z - b) < c for a, b, c in bg.get((int(x // 64), int(z // 64)), ())):
            continue
        t, s, r = rng.choice(obs), rng.uniform(*scale), rng.uniform(0, 6.28)
        y = height(x, z) - sink
        inst = bpy.data.objects.new("%s_%d" % (name, done), t.data)
        inst.matrix_world = Matrix.Translation((x, -z, y)) @ Matrix.Rotation(r, 4, "Z") @ Matrix.Scale(s, 4)
        place_col.objects.link(inst)
        layout.append({"id": "%s_%d" % (name, done), "piece": t.name, "position": [x, y, z], "quaternion": [0, math.sin(r / 2), 0, math.cos(r / 2)], "scale": s, "category": "vegetation"})
        done += 1
    return done


trees = {}
for p in scene["placements"]:
    if p["prefab"] in ("round_tree", "birch", "pine_tree"):
        trees.setdefault((int(p["position"][0] // 32), int(p["position"][2] // 32)), []).append((p["position"][0], p["position"][2]))


def under_trees(x, z):
    k = (int(x // 32), int(z // 32))
    return any(math.hypot(x - a, z - b) < 13 for i in (-1, 0, 1) for j in (-1, 0, 1) for a, b in trees.get((k[0] + i, k[1] + j), ())) and path_dist(x, z) > 2 and gp(round(x / 2) * 2, round(z / 2) * 2)[1] == "Grass"


made = lambda key, fn, size: [o for o in (extra_piece(key, fn, size, v) for v in range(4))]


def extra_piece(key, fn, size, v):
    name = "%s_%d" % (key, v)
    if name not in kit:
        kit[name] = fn(random.Random("%s/%d" % (name, scene["seed"])), PAL, size, v).obj(name, kit_col)
    return kit[name]


green_world = any(k in scene["prefabs"] for k in ("round_tree", "birch", "pine_tree"))
nf = scatter("fern", made("fern", FLORA["fern"], (3, 3, 1.5)), 900, under_trees, (0.7, 1.4)) if green_world else 0
np_ = scatter("pebble", made("pebble", FLORA["stone"], (1.2, 1.0, 0.8)), 700, lambda x, z: -0.5 < path_dist(x, z) < 4, (0.35, 1.1), sink=0.12)
rocks = made("outcrop", outcrop, (14, 11, 9))


def steep(x, z):
    e = 3
    sl = math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e)
    return sl > 0.75 and path_dist(x, z) > 9 and all(math.hypot(x - a, z - b) > c + 14 for a, b, c in kept) and off_view(x, z)


def off_view(x, z):
    if not scene.get("focal"):
        return True
    (ax, ay, az), (bx, by, bz) = scene["spawn"]["position"], scene["focal"]
    t = ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / max(1, (bx - ax) ** 2 + (bz - az) ** 2)
    return not (0 < t < 1 and math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az)) < 24)


no = scatter("outcrop", rocks, 420, steep, (0.5, 1.5), sink=1.2)
log("outcrops %d" % no)

# ---------------------------------------------------------------- horizon: ridges beyond the playable square, so the map never ends on nothing
m = M()
cxm, czm, half = OX + W * CS / 2, OZ + D * CS / 2, W * CS / 2
avg = sum(H) / len(H)
N, rings = 128, [(0.985, 0.0), (1.12, 0.05), (1.3, 0.2), (1.55, 0.12), (1.9, 0.42), (2.4, 0.2), (3.2, 0.6), (4.4, 0.1)]
grid = []
for rr, hh in rings:
    row = []
    for k in range(N):
        a = k / N * math.tau
        u, v = math.cos(a), math.sin(a)
        sq = 1 / max(abs(u), abs(v))
        f = sq * min(1, 1.0) * (1 if rr < 1.2 else 1 - 0.12 * min(1, rr - 1.2))
        x, z = cxm + u * f * half * rr, czm + v * f * half * rr
        if rr < 1:
            y = height(x, z) - 4
        else:
            y = avg - 14 + half * hh * (0.55 + 0.75 * noise.noise(Vector((x * 0.0024, z * 0.0024, 5)))) + 16 * noise.noise(Vector((x * 0.012, z * 0.012, 2)))
        row.append(Vector((x, -z, y)))
    grid.append(row)
for r in grid:
    m.v += r
for i in range(len(rings) - 1):
    for k in range(N):
        a, b = i * N + k, i * N + (k + 1) % N
        m.f.append([a, b, b + N, a + N])
        t = min(1, i / 5)
        c = mix(mul(mix(PAL["foliage"], PAL["foliageAlt"], 0.4), 0.8), mix(PAL["sky"], (0.3, 0.38, 0.45), 0.4), t * 0.7)
        m.fm.append("Grass")
        m.fc.append([vary(rng, c, 0.05)] * 4)
        m.fs.append(True)
for i, f in enumerate(m.f):
    if (m.v[f[1]] - m.v[f[0]]).cross(m.v[f[2]] - m.v[f[0]]).z < 0:
        m.f[i] = f[::-1]
hz = m.obj("horizon", terrain_col)
hz.visible_shadow = False

log("placements %d (meadow %d, ferns %d, pebbles %d)" % (len(layout), extra, nf, np_))
kit_col.hide_render = True

# ---------------------------------------------------------------- light
L = scene["lighting"]
world.use_nodes = True
nt = world.node_tree
bgn = next(n for n in nt.nodes if n.type == "BACKGROUND")
sky = nt.nodes.new("ShaderNodeTexSky")
for kind in ("MULTIPLE_SCATTERING", "NISHITA"):
    try:
        sky.sky_type = kind
        break
    except TypeError:
        continue
clock = L.get("clockTime", 15)
elev = max(0.12, math.sin(math.pi * max(0.08, min(0.92, (clock - 5.5) / 13))))
sky.sun_elevation = math.radians(12 + 38 * elev)
sky.sun_rotation = math.radians(215)
sky.sun_intensity = 0.2
nt.links.new(sky.outputs[0], bgn.inputs[0])
bgn.inputs[1].default_value = 0.16
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sc.collection.objects.link(sun)
sun.data.energy = 3.0
sun.data.angle = math.radians(1.2)
sun.data.color = (1.0, 0.9, 0.74)
sun.rotation_euler = (math.radians(90 - (12 + 38 * elev)), 0, math.radians(215 - 180))
sc.view_settings.view_transform = "AgX"
try:
    sc.view_settings.look = "AgX - Medium High Contrast"
except TypeError:
    pass
sc.view_settings.exposure = 0.0

# ---------------------------------------------------------------- views
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.clip_end = 6000
sc.render.resolution_x, sc.render.resolution_y = 1600, 900
sc.cycles.samples = int(opt("--samples", "48"))
sc.cycles.use_denoising = True
sc.render.image_settings.file_format = "PNG"
V = lambda p: Vector((p[0], -p[2], p[1]))


def shoot(name, eye, at, fov=62):
    cam.location = eye
    cam.rotation_euler = (at - eye).to_track_quat("-Z", "Y").to_euler()
    cam.data.angle = math.radians(fov)
    for o in place_col.objects:
        o.hide_render = False
        if not o.name.startswith(("castle", "landmark", "ramparts", "spawn")) and max(o.dimensions) > 3 and not any(s.material and s.material.name == "Concrete" for s in o.material_slots):
            c = o.matrix_world.translation + Vector((0, 0, o.dimensions.z * 0.5))
            if (c - eye).length < max(o.dimensions) * 0.5 + 5:
                o.hide_render = True
    sc.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)
    log("render " + name)


sp, la = scene["spawn"]["position"], scene["spawn"]["lookAt"]
eye = Vector((sp[0], -sp[2], height(sp[0], sp[2]) + 7.5))
back = (V(sp) - V(la)).normalized()
back.z = 0
wanted = opt("--views", "spawn,landmark,village,wide").split(",")
focal = scene.get("focal")
if "spawn" in wanted:
    at = V(la)
    at.z = max(at.z + 14, eye.z - 2)
    shoot("spawn", eye + back * 14 + Vector((0, 0, 3)), at, 68)
if focal and "landmark" in wanted:
    f = V(focal)
    d = (V(sp) - f)
    d.z = 0
    d = Matrix.Rotation(0.5, 3, "Z") @ d.normalized()
    e = f + d * 105
    e.z = max(height(e.x, -e.y) + 22, f.z + 26)
    shoot("landmark", e, f + Vector((0, 0, 14)), 50)
vil = scene.get("village")
if vil and "village" in wanted:
    c = Vector((vil["center"][0], -vil["center"][1], height(vil["center"][0], vil["center"][1])))
    r = vil["radius"]
    e = c + Vector((-r * 0.95, -r * 0.95, 0))
    e.z = max(height(e.x, -e.y) + 26, c.z + r * 0.62)
    shoot("village", e, c + Vector((0, 0, 8)), 55)
    a = vil.get("street")
    if a:
        e = Vector((a[0][0], -a[0][1], height(*a[0]) + 6.5))
        shoot("street", e, Vector((a[1][0], -a[1][1], height(*a[1]) + 8)), 70)
if "wide" in wanted:
    span = W * CS
    cx, cz = OX + span / 2, OZ + span / 2
    shoot("wide", Vector((cx - span * 0.42, -(cz - span * 0.42) * 1.0 - 0, max(H) + span * 0.2)), Vector((cx + span * 0.05, -cz - span * 0.02, sum(H) / len(H))), 58)
# ---------------------------------------------------------------- checks: Roblox culls back faces, and nothing may float
for o in place_col.objects:
    o.hide_render = False
floating = []
for p in scene["placements"]:
    o = place_col.objects.get(p["id"])
    if not o or p["category"] in ("vegetation",):
        continue
    x, y, z = p["position"]
    low = min((o.matrix_world @ Vector(c)).z for c in o.bound_box)
    r = min(8, max(o.dimensions.x, o.dimensions.y) * 0.4)
    g = min(height(x + math.cos(a) * r, z + math.sin(a) * r) for a in (0, 1.57, 3.14, 4.71))
    if low - g > 1.0:
        floating.append((p["id"], round(low - g, 1)))


def wound_inside(ob):
    """Share of faces seen from behind: a ray from just outside each face toward it should meet that face's front."""
    me, bad, total = ob.data, 0, 0
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromPolygons([v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    for poly in me.polygons:
        if me.materials[poly.material_index].name in ("Leaf", "Fabric"):
            continue
        n, c = poly.normal, poly.center
        hits, o = 0, c + n * 0.004
        for _ in range(24):
            h = tree.ray_cast(o, n)
            if h[0] is None:
                break
            hits += 1
            o = h[0] + n * 0.004
        hits_back, o = 0, c - n * 0.004
        for _ in range(24):
            h = tree.ray_cast(o, -n)
            if h[0] is None:
                break
            hits_back += 1
            o = h[0] - n * 0.004
        total += 1
        if hits % 2 == 1 and hits_back % 2 == 0:
            bad += 1
    return bad, total


inverted = {}
for k, o in kit.items():
    if o and len(o.data.polygons) < 9000:
        b, t = wound_inside(o)
        if t and b / t > 0.03:
            inverted[k] = "%d/%d" % (b, t)
log("check: floating %s" % floating[:20])
log("check: inverted %s" % inverted)
# contact sheet of the kit: red = a face seen from behind
if "--sheet" in args:
    names = [k for k, o in sorted(kit.items()) if o and k != "ramparts" and (k.endswith("_0") or k.endswith("_1"))]
    red = bpy.data.materials.new("backface")
    red.use_nodes = True
    nt2 = red.node_tree
    b2 = next(n for n in nt2.nodes if n.type == "BSDF_PRINCIPLED")
    g2, vc, mx = nt2.nodes.new("ShaderNodeNewGeometry"), nt2.nodes.new("ShaderNodeVertexColor"), nt2.nodes.new("ShaderNodeMix")
    vc.layer_name = "Col"
    mx.data_type = "RGBA"
    cols = [s for s in mx.inputs if s.type == "RGBA"]
    nt2.links.new(g2.outputs["Backfacing"], mx.inputs[0])
    nt2.links.new(vc.outputs[0], cols[0])
    cols[1].default_value = (1, 0, 0.6, 1)
    nt2.links.new([o for o in mx.outputs if o.type == "RGBA"][0], b2.inputs["Base Color"])
    place_col.hide_render = True
    terrain_col.hide_render = True
    sheet = bpy.data.collections.new("sheet")
    sc.collection.children.link(sheet)
    cols_n = 9
    for i, k in enumerate(names):
        o = bpy.data.objects.new("s_" + k, kit[k].data)
        d = max(kit[k].dimensions) or 1
        o.scale = [9 / d] * 3
        o.location = ((i % cols_n) * 11, -(i // cols_n) * 13, 0)
        sheet.objects.link(o)
    bpy.context.view_layer.material_override = red if opt("--sheet", "plain") == "back" else None
    rows_n = math.ceil(len(names) / cols_n)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = cols_n * 11.6
    mid = Vector(((cols_n - 1) * 5.5, -(rows_n - 1) * 6.5, 3))
    cam.location = mid + Vector((0, 160, 110))
    cam.rotation_euler = (mid - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.resolution_x, sc.render.resolution_y = 2000, int(2000 * (rows_n * 9.0 + 6) / (cols_n * 11.6))
    sc.render.filepath = os.path.join(OUT, "sheet.png")
    sun.rotation_euler = (math.radians(40), 0, math.radians(150))
    bgn.inputs[1].default_value = 0.4
    bpy.ops.render.render(write_still=True)
    log("sheet: " + " ".join(names))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "map.blend"), compress=True)
json.dump({"pieces": sorted(k for k, o in kit.items() if o), "layout": layout, "fallback": sorted(fallback)}, open(os.path.join(OUT, "layout.json"), "w"))
tri = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
report = {"terrainTris": tris, "kit": {k: tri(o) for k, o in kit.items() if o}, "instances": len(layout)}
report["floating"], report["inverted"] = floating, inverted
report["sceneTris"] = tris + sum(report["kit"][l["piece"]] for l in layout)
json.dump(report, open(os.path.join(OUT, "report.json"), "w"), indent=1)
log("done")
