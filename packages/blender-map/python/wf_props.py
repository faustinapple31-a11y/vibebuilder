"""Village props, and the fallback that turns any PartList prefab into a bevelled model."""
import math
from mathutils import Vector, Matrix
from wf_mesh import M, lin, mix, mul, vary
from wf_arch import beam, rotz, stone_course, GLASS

IRON = (0.03, 0.03, 0.035)


def barrel(rng, pal, size, variant):
    m = M()
    r, h = max(size[0], size[1]) * 0.45, size[2]
    n = 14
    for k in range(n):
        a0, a1 = k / n * math.tau, (k + 0.94) / n * math.tau
        vs = []
        for t, f in ((0, 0.82), (0.25, 0.97), (0.5, 1.02), (0.75, 0.97), (1, 0.82)):
            for a in (a0, a1):
                vs.append(Vector((math.cos(a) * r * f, math.sin(a) * r * f, h * t)))
        m.add(vs, [(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2) for i in range(4)], "WoodPlanks", vary(rng, pal["wood"], 0.2))
    m.tube([(0, 0, 0.05), (0, 0, h / 2), (0, 0, h - 0.06)], [r * 0.78, r * 0.97, r * 0.78], "WoodPlanks", mul(pal["wood"], 0.45), n=n)
    for t, f in ((0.14, 0.92), (0.34, 1.03), (0.66, 1.03), (0.86, 0.92)):
        m.tube([(0, 0, h * t - 0.11), (0, 0, h * t + 0.11)], [r * f + 0.05] * 2, "Metal", IRON, n=n, cap=False)
    m.cyl((0, 0, h - 0.12), r * 0.8, 0.1, "WoodPlanks", mul(pal["wood"], 1.2), n=n)
    return m


def crate(rng, pal, size, variant):
    m = M()
    x, y, z = size
    w = vary(rng, mul(pal["wood"], 1.25), 0.08)
    m.box((0, 0, z / 2), (x * 0.92, y * 0.92, z * 0.94), "WoodPlanks", mul(w, 0.55))
    for s in (-1, 1):
        for k in range(4):
            zz = z * (k + 0.5) / 4
            m.box((0, s * y * 0.47, zz), (x * 0.94, 0.14, z / 4 - 0.07), "WoodPlanks", vary(rng, w, 0.15), bevel=0.03)
            m.box((s * x * 0.47, 0, zz), (0.14, y * 0.94, z / 4 - 0.07), "WoodPlanks", vary(rng, w, 0.15), bevel=0.03)
            m.box((x * (k - 1.5) / 4, 0, z * 0.97), (x / 4 - 0.07, y * 0.94, 0.14), "WoodPlanks", vary(rng, w, 0.15), bevel=0.03)
        for t in (-1, 1):
            m.box((s * x * 0.46, t * y * 0.46, z / 2), (0.32, 0.32, z), "Wood", mul(pal["wood"], 0.9), bevel=0.05)
            m.box((s * x * 0.46, 0, z / 2 + t * z * 0.46), (0.34, y, 0.3), "Wood", mul(pal["wood"], 0.9), bevel=0.05)
            m.box((0, s * y * 0.48, z / 2 + t * z * 0.46), (x, 0.34, 0.3), "Wood", mul(pal["wood"], 0.9), bevel=0.05)
        beam(m, rng, (-x * 0.42, s * y * 0.5, z * 0.1), (x * 0.42, s * y * 0.5, z * 0.9), 0.24, 0.16, pal["wood"])
    return m


def lantern_post(rng, pal, size, variant):
    m = M()
    h = size[2] * 0.95
    w = pal["wood"]
    for k in range(6):
        a = k / 6 * math.tau
        m.box((math.cos(a) * 0.75, math.sin(a) * 0.75, 0.2), (0.75, 0.7, 0.8), "Slate", vary(rng, pal["stone"], 0.16), rot=(0, 0, math.degrees(a)), bevel=0.1)
    m.box((0, 0, h / 2), (0.62, 0.62, h), "Wood", vary(rng, w, 0.1), bevel=0.08, taper=0.8)
    beam(m, rng, (0, -0.4, h - 0.6), (0, 2.2, h - 0.6), 0.36, 0.36, w)
    beam(m, rng, (0, 0, h - 2.6), (0, 1.6, h - 0.8), 0.28, 0.28, w)
    m.cyl((0, 1.9, h - 1.05), 0.04, 0.6, "Metal", IRON, n=5)
    c = Vector((0, 1.9, h - 2.0))
    m.box(c, (0.75, 0.75, 1.1), "Glow", GLASS)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box(c + Vector((sx * 0.4, sy * 0.4, 0)), (0.1, 0.1, 1.2), "Metal", IRON)
    m.box(c + Vector((0, 0, -0.62)), (1.0, 1.0, 0.14), "Metal", IRON)
    m.box(c + Vector((0, 0, 0.72)), (1.1, 1.1, 0.35), "Metal", IRON, taper=0.35)
    return m


def fence(rng, pal, size, variant, picket=False):
    m = M()
    long_x = size[0] >= size[1]
    L, h = max(size[0], size[1]), size[2]
    w = (0.7, 0.67, 0.6) if picket else vary(rng, pal["wood"], 0.1)
    n = max(2, int(L / 4) + 1)
    for k in range(n):
        x = -L / 2 + L * k / (n - 1)
        m.box((x, 0, h * 0.5), (0.5, 0.5, h + 0.6), "Wood", vary(rng, w, 0.15), rot=(rng.uniform(-3, 3), rng.uniform(-3, 3), 0), bevel=0.08, taper=0.85)
    for z in (h * 0.32, h * 0.72):
        for k in range(n - 1):
            x0, x1 = -L / 2 + L * k / (n - 1), -L / 2 + L * (k + 1) / (n - 1)
            beam(m, rng, (x0 - 0.3, 0.2, z + rng.uniform(-0.15, 0.15)), (x1 + 0.3, 0.2, z + rng.uniform(-0.15, 0.15)), 0.18, 0.42, w)
    if picket:
        for k in range(int(L / 0.75)):
            m.box((-L / 2 + 0.4 + k * 0.75, 0.34, h * 0.48), (0.46, 0.14, h * 0.92), "WoodPlanks", vary(rng, w, 0.08), bevel=0.04, taper=0.9)
    if not long_x:
        r = M()
        r.merge(m, rotz(90))
        return r
    return m


def hay_bale(rng, pal, size, variant):
    m = M()
    r, L = size[2] * 0.48, max(size[0], size[1]) * 0.9
    hay = (0.5, 0.36, 0.1)
    m.tube([(-L / 2, 0, r), (0, 0, r), (L / 2, 0, r)], [r, r * 1.03, r], "Fabric", lambda q: mul(hay, 0.75 + 0.3 * q.z / (2 * r)), n=16)
    for s in (-1, 1):
        for k in range(4):
            m.tube([(s * (L / 2 + 0.02), 0, r), (s * (L / 2 + 0.06), 0, r)], [r * (0.95 - k * 0.24), r * (0.9 - k * 0.24)], "Fabric", vary(rng, mul(hay, 1.1 if k % 2 else 0.85), 0.05), n=14)
        m.tube([(s * L * 0.25 - 0.06, 0, r), (s * L * 0.25 + 0.06, 0, r)], [r * 1.04] * 2, "Fabric", (0.25, 0.17, 0.07), n=16, cap=False)
    for _ in range(40):
        a, x = rng.uniform(0, math.tau), rng.uniform(-L / 2, L / 2)
        p = Vector((x, math.cos(a) * r, r + math.sin(a) * r))
        m.box(p, (rng.uniform(0.4, 0.9), 0.05, 0.05), "Fabric", vary(rng, hay, 0.2), rot=(rng.uniform(0, 90), rng.uniform(-30, 30), rng.uniform(-40, 40)))
    return m


def bench(rng, pal, size, variant):
    m = M()
    L = max(size[0], size[1])
    for k in range(3):
        m.box((0, -0.7 + k * 0.7, 1.9), (L, 0.62, 0.22), "WoodPlanks", vary(rng, mul(pal["wood"], 1.2), 0.14), bevel=0.05)
    for k in range(2):
        m.box((0, -1.1, 2.8 + k * 0.8), (L, 0.2, 0.62), "WoodPlanks", vary(rng, mul(pal["wood"], 1.2), 0.14), bevel=0.05)
    for s in (-1, 1):
        m.box((s * L * 0.38, 0, 0.9), (0.4, 1.9, 1.8), "Wood", mul(pal["wood"], 0.85), bevel=0.08)
        m.box((s * L * 0.38, -1.2, 2.4), (0.36, 0.3, 3.0), "Wood", mul(pal["wood"], 0.85), bevel=0.06)
    return m


def cart(rng, pal, size, variant):
    m = M()
    L, W = max(size[0], size[1]) * 0.62, 4.2
    for k in range(5):
        m.box((0, -W / 2 + W * (k + 0.5) / 5, 2.6), (L, W / 5 - 0.06, 0.24), "WoodPlanks", vary(rng, pal["wood"], 0.16), bevel=0.04)
    for s in (-1, 1):
        for k in range(2):
            m.box((0, s * W / 2, 3.1 + k * 0.8), (L, 0.2, 0.7), "WoodPlanks", vary(rng, pal["wood"], 0.16), bevel=0.04)
        for k in range(3):
            m.box((-L * 0.4 + k * L * 0.4, s * (W / 2 + 0.16), 3.4), (0.3, 0.2, 1.9), "Wood", pal["wood"])
        beam(m, rng, (L / 2 - 0.5, s * 1.2, 2.5), (L / 2 + 4.2, s * 1.0, 1.6), 0.32, 0.32, pal["wood"])
        wheel(m, rng, pal, Vector((-L * 0.08, s * (W / 2 + 0.6), 2.0)), 2.0)
    beam(m, rng, (-L * 0.08, -W / 2 - 0.8, 2.0), (-L * 0.08, W / 2 + 0.8, 2.0), 0.34, 0.34, pal["wood"])
    for _ in range(16):
        m.ball((rng.uniform(-L * 0.4, L * 0.4), rng.uniform(-1.5, 1.5), 3.2 + rng.uniform(0, 0.8)), rng.uniform(0.4, 0.75), "Fabric", vary(rng, (0.5, 0.36, 0.1), 0.15), sub=1)
    return m


def wheel(m, rng, pal, c, r):
    W = M()
    n = 16
    for k in range(n):
        a = (k + 0.5) / n * math.tau
        W.box((math.cos(a) * r, 0, math.sin(a) * r), (0.42, 0.36, r * math.tau / n * 1.03), "Wood", vary(rng, pal["wood"], 0.12), rot=(0, -math.degrees(a), 0))
    for k in range(8):
        a = k / 8 * math.tau
        beam(W, rng, (0, 0, 0), (math.cos(a) * r * 0.95, 0, math.sin(a) * r * 0.95), 0.22, 0.2, pal["wood"])
    W.ball((0, 0, 0), 0.42, "Wood", mul(pal["wood"], 0.7), sub=1)
    m.merge(W, Matrix.Translation(c))


def signpost(rng, pal, size, variant):
    m = M()
    h = size[2]
    m.box((0, 0, h / 2), (0.55, 0.55, h), "Wood", pal["wood"], bevel=0.08, taper=0.8)
    for k, (z, a) in enumerate(((h * 0.86, 12), (h * 0.66, -24), (h * 0.46, 40))):
        S = M()
        S.box((1.4, 0.36, 0), (3.6, 0.2, 0.95), "WoodPlanks", vary(rng, mul(pal["wood"], 1.3), 0.12), bevel=0.05)
        S.add([Vector((3.2, 0.26, -0.48)), Vector((3.95, 0.36, 0)), Vector((3.2, 0.46, -0.48)), Vector((3.2, 0.26, 0.48)), Vector((3.2, 0.46, 0.48))], [(0, 1, 3), (2, 4, 1), (3, 1, 4), (0, 2, 1)], "WoodPlanks", mul(pal["wood"], 1.25))
        S.box((1.3, 0.48, 0), (2.4, 0.04, 0.14), "WoodPlanks", (0.05, 0.035, 0.02))
        m.merge(S, Matrix.Translation((0, 0, z)) @ rotz(a + (180 if k == 1 else 0)))
    return m


def plaza(rng, pal, size, variant):
    """Arrival plaza: rings of paving stones around a compass rose."""
    m = M()
    R = max(size[0], size[1]) * 0.46
    m.cyl((0, 0, -0.5), R, 1.4, "Slate", mul(pal["stone"], 0.6), n=48)
    r, row = 2.0, 0
    while r < R - 0.6:
        w = rng.uniform(1.4, 1.9)
        n = max(8, int(math.tau * r / 2.0))
        for k in range(n):
            a = (k + row * 0.5) / n * math.tau
            m.box((math.cos(a) * (r + w / 2), math.sin(a) * (r + w / 2), 0.24 + rng.uniform(-0.03, 0.04)), (w - 0.12, (r + w / 2) * math.tau / n - 0.12, 0.4), "Slate", vary(rng, mul(pal["stone"], 1.08 if row % 3 else 0.85), 0.14), rot=(0, 0, math.degrees(a)), bevel=0.08)
        r += w
        row += 1
    n = int(math.tau * R / 2.4)
    for k in range(n):
        a = k / n * math.tau
        m.box((math.cos(a) * R, math.sin(a) * R, 0.45), (1.3, R * math.tau / n - 0.1, 1.1), "Slate", vary(rng, mul(pal["stone"], 0.95), 0.14), rot=(0, 0, math.degrees(a)), bevel=0.14, jitter=0.03, rng=rng)
    for k in range(8):
        a = k / 8 * math.tau
        L = 7.0 if k % 2 == 0 else 4.2
        d, s = Vector((math.cos(a), math.sin(a), 0)), Vector((-math.sin(a), math.cos(a), 0))
        up = Vector((0, 0, 0.5))
        c = pal["accent"] if k % 2 == 0 else (0.72, 0.66, 0.5)
        m.add([up, d * 1.6 + s * 0.8 + up, d * L + up], [(0, 2, 1)], "Slate", vary(rng, mul(c, 1.1), 0.05))
        m.add([up, d * 1.6 - s * 0.8 + up, d * L + up], [(0, 1, 2)], "Slate", vary(rng, mul(c, 0.7), 0.05))
    m.cyl((0, 0, 0.4), 1.1, 0.4, "Metal", (0.5, 0.36, 0.1), n=16)
    return m


def field(rng, pal, size, variant):
    """Ploughed rows with a crop, a low fence round them."""
    m = M()
    x, y = size[0] * 0.95, size[1] * 0.95
    soil = (0.09, 0.055, 0.03)
    m.box((0, 0, 0.05), (x, y, 0.7), "Ground", soil)
    rows = max(3, int(y / 2.2))
    crop = variant % 3
    for r in range(rows):
        yy = -y / 2 + y * (r + 0.5) / rows
        m.tube([(-x / 2 + 0.4, yy, 0.35), (x / 2 - 0.4, yy, 0.35)], [0.7, 0.7], "Ground", vary(rng, mul(soil, 1.3), 0.1), n=7)
        k = 0.0
        while k < x - 2:
            p = Vector((-x / 2 + 1 + k, yy + rng.uniform(-0.15, 0.15), 0.95))
            if crop == 0:
                for _ in range(5):
                    q = p + Vector((rng.uniform(-0.4, 0.4), rng.uniform(-0.3, 0.3), 0))
                    m.box(q + Vector((0, 0, 0.9)), (0.06, 0.06, 1.9), "Leaf", (0.5, 0.38, 0.1), rot=(rng.uniform(-9, 9), rng.uniform(-9, 9), 0))
                    m.box(q + Vector((0, 0, 1.95)), (0.18, 0.18, 0.6), "Leaf", (0.62, 0.45, 0.1), rot=(rng.uniform(-9, 9), rng.uniform(-9, 9), 0))
            elif crop == 1:
                m.ball(p + Vector((0, 0, 0.2)), 0.6, "Leaf", vary(rng, mul(pal["foliage"], 1.4), 0.15), sub=1, squash=(1, 1, 0.75), disp=0.3)
            else:
                m.ball(p + Vector((0, 0, 0.1)), rng.uniform(0.4, 0.65), "SmoothPlastic", vary(rng, (0.75, 0.25, 0.03), 0.12), sub=2, squash=(1, 1, 0.75))
                m.ball(p + Vector((0.6, 0.2, 0.2)), 0.35, "Leaf", vary(rng, pal["foliage"], 0.2), sub=1)
            k += 1.5
    return m


def scarecrow(rng, pal, size, variant):
    m = M()
    w = pal["wood"]
    beam(m, rng, (0, 0, -0.3), (0, 0, 6.4), 0.35, 0.35, w)
    beam(m, rng, (-2.6, 0, 4.4), (2.6, 0, 4.4), 0.3, 0.3, w)
    m.box((0, 0, 3.6), (2.0, 1.0, 2.6), "Fabric", (0.32, 0.12, 0.07), bevel=0.2, taper=0.9)
    for s in (-1, 1):
        m.box((s * 1.6, 0, 4.4), (1.8, 0.8, 0.8), "Fabric", vary(rng, (0.32, 0.12, 0.07), 0.1), bevel=0.15)
        for _ in range(6):
            m.box((s * 2.6 + rng.uniform(-0.1, 0.3) * s, rng.uniform(-0.3, 0.3), 4.4 + rng.uniform(-0.3, 0.3)), (0.8, 0.06, 0.06), "Fabric", (0.5, 0.36, 0.1), rot=(0, rng.uniform(-30, 30), rng.uniform(-30, 30)))
    m.ball((0, 0, 5.8), 0.85, "Fabric", (0.55, 0.42, 0.25), sub=2)
    m.cyl((0, 0, 6.3), 1.5, 0.16, "Fabric", (0.28, 0.2, 0.1), n=14)
    m.cyl((0, 0, 6.9), 0.85, 1.2, "Fabric", (0.28, 0.2, 0.1), n=12, r2=0.45)
    for s in (-1, 1):
        m.ball((s * 0.3, 0.78, 5.95), 0.12, "SmoothPlastic", (0.01, 0.01, 0.01), sub=1)
    return m


def cart_wheel(rng, pal, size, variant):
    m = M()
    r = max(size) * 0.46
    wheel(m, rng, pal, Vector((0, 0, r)), r)
    out = M()
    out.merge(m, Matrix.Rotation(math.radians(14), 4, "X"))
    return out


def pallet_stack(rng, pal, size, variant):
    m = M()
    x, y = size[0] * 0.9, size[1] * 0.9
    for lvl in range(max(2, int(size[2] / 0.9))):
        z = lvl * 0.9
        rot = rng.uniform(-5, 5)
        P = M()
        for k in range(3):
            P.box((0, -y / 2 + y * (k + 0.5) / 3, z + 0.25), (x, 0.4, 0.45), "Wood", vary(rng, pal["wood"], 0.15), bevel=0.04)
        for k in range(6):
            P.box((-x / 2 + x * (k + 0.5) / 6, 0, z + 0.58), (x / 6 - 0.14, y, 0.18), "WoodPlanks", vary(rng, mul(pal["wood"], 1.25), 0.18), bevel=0.03)
        m.merge(P, rotz(rot))
    return m


PROPS = {
    "cart_wheel": cart_wheel, "pallet_stack": pallet_stack,
    "barrel": barrel, "crate": crate, "lantern_post": lantern_post, "fence": fence, "picket_fence": lambda r, p, s, v: fence(r, p, s, v, picket=True),
    "hay_bale": hay_bale, "bench": bench, "cart": cart, "signpost": signpost, "spawn_plaza": plaza, "farm_field": field, "crop_plot": field, "scarecrow": scarecrow,
}

MATERIALS = {"Plastic": "SmoothPlastic", "Grass": "Leaf", "LeafyGrass": "Leaf", "Marble": "Concrete", "Granite": "Rock", "Pebble": "Cobblestone", "CorrodedMetal": "Metal", "DiamondPlate": "Metal", "Foil": "Metal", "Neon": "Glow"}


def from_parts(rng, parts):
    """Any PartList prefab as a bevelled model: the floor under which no prefab of any style falls."""
    m = M()
    to_b = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    for p in parts:
        if p.get("transparency", 0) >= 0.95:
            continue
        sx, sy, sz = p["size"]
        mat = MATERIALS.get(p.get("material", "Plastic"), p.get("material", "SmoothPlastic"))
        col = vary(rng, lin(p["color"]), 0.06)
        rx, ry, rz = [math.radians(a) for a in p.get("rotation", (0, 0, 0))]
        rot = Matrix.Rotation(rx, 4, "X") @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rz, 4, "Z")
        xf = to_b @ Matrix.Translation(Vector(p["position"])) @ rot
        piece = M()
        small = min(sx, sy, sz)
        shape = p["shape"]
        if shape == "sphere" or shape == "mesh":
            piece.ball((0, 0, 0), 0.5, mat, col, sub=3 if max(sx, sy, sz) > 4 else 2, squash=(sx, sy, sz), disp=0.12 if shape == "mesh" else 0.0, seed=rng.random() * 9)
        elif shape == "cylinder":
            q = M()
            q.cyl((0, 0, 0), 0.5, 1.0, mat, col, n=14)
            piece.merge(q, Matrix.Diagonal((sx, sy, sz, 1)) @ Matrix.Rotation(math.radians(-90), 4, "X"))
        elif shape in ("wedge", "cornerWedge"):
            a, b, c = sx / 2, sy / 2, sz / 2
            if shape == "wedge":
                vs = [(-a, -b, -c), (a, -b, -c), (a, -b, c), (-a, -b, c), (a, b, c), (-a, b, c)]
                fs = [(0, 1, 2, 3), (3, 2, 4, 5), (1, 0, 5, 4), (0, 3, 5), (1, 4, 2)]
            else:
                vs = [(-a, -b, -c), (a, -b, -c), (a, -b, c), (-a, -b, c), (a, b, -c)]
                fs = [(0, 1, 2, 3), (0, 4, 1), (1, 4, 2), (2, 4, 3), (3, 4, 0)]
            mid = sum((Vector(v) for v in vs), Vector()) / len(vs)
            good = []
            for f in fs:
                n = (Vector(vs[f[1]]) - Vector(vs[f[0]])).cross(Vector(vs[f[2]]) - Vector(vs[f[0]]))
                good.append(f if n.dot(Vector(vs[f[0]]) - mid) >= 0 else f[::-1])
            piece.add(vs, good, mat, col)
        else:
            piece.box((0, 0, 0), (sx, sy, sz), mat, col, bevel=min(0.12, small * 0.16))
        m.merge(piece, xf)
    return m
