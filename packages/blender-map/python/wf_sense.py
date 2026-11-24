"""Reads what a list of parts means and models the meaning: a wall becomes masonry, a pair of wedges a tiled roof, a
panel planks, a drum a welded tank, a slab flagstones. Sizes and places are those of the parts, so what one touches in
the game is what one sees. Runs of parts named by the plan (`modules`: a hall, a sign) are modelled as a whole.

Local frame of a part here: X along, Y toward the front (Roblox -Z), Z up."""
import math
import bmesh
from mathutils import Vector, Matrix, noise
from wf_mesh import DETAIL, M, lin, mix, mul, vary
from wf_arch import rotz
from wf_roof import roof
from wf_city import Face
from wf_flora import FLORA
from wf_hall import hall, sign

TO_B = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
BACK = TO_B.inverted()
MAT = {"Plastic": "SmoothPlastic", "Grass": "Leaf", "LeafyGrass": "Leaf", "Marble": "Marble", "Granite": "Rock", "Pebble": "Cobblestone", "CorrodedMetal": "Metal", "DiamondPlate": "Metal", "Foil": "Metal", "Neon": "Glow", "ForceField": "Glow", "Rubber": "SmoothPlastic", "Concrete": "RealConcrete"}
STONE = ("Slate", "Rock", "Granite", "Basalt", "Limestone", "Sandstone", "Cobblestone", "Pebble", "CrackedLava")
STEEL = (0.3, 0.31, 0.32)
DARK = (0.1, 0.1, 0.11)


def frame_of(p):
    rx, ry, rz = [math.radians(a) for a in p.get("rotation", (0, 0, 0))]
    rot = Matrix.Rotation(rx, 4, "X") @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rz, 4, "Z")
    return TO_B @ Matrix.Translation(Vector(p["position"])) @ rot @ BACK


def oriented(s):
    """(thin, across, along): the axes of a box from its smallest side to its largest."""
    return sorted(range(3), key=lambda q: s[q])


def put(m, axes, size, pos, mat, col, **k):
    s, c = [0, 0, 0], [0, 0, 0]
    for a, v, p in zip(axes, size, pos):
        s[a], c[a] = v, p
    m.box(c, s, mat, col, **k)


# ------------------------------------------------------------------ boxes
def rough(m, rng, s, mat, col, cut=0.16, amp=0.09):
    """A quarried or weathered block: rounded unevenly, faces not flat, edges broken."""
    w, d, h = s
    small = min(s)
    if DETAIL.level or small < 0.5:
        m.box((0, 0, 0), s, mat, col, bevel=small * cut, jitter=small * 0.06, rng=rng)
        return
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=4 if max(s) > 4 else 2, use_grid_fill=True)
    off = Vector((rng.uniform(-50, 50), rng.uniform(-50, 50), rng.uniform(-50, 50)))
    vs = []
    k = 7.0
    for v in bm.verts:
        q = v.co
        n = (abs(q.x) ** k + abs(q.y) ** k + abs(q.z) ** k) ** (1 / k)
        q = q / max(n, 1e-6)
        p = Vector((q.x * w / 2, q.y * d / 2, q.z * h / 2))
        f = noise.noise(p * (1.6 / max(1.0, small)) + off) * amp * small + noise.noise(p * 0.9 + off * 2) * amp * 0.35 * small
        vs.append(p + p.normalized() * (f - amp * 0.3 * small))
    fs = [[v.index for v in f.verts] for f in bm.faces]
    bm.free()
    m.add(vs, fs, mat, lambda q: mul(col, 0.84 + 0.2 * (q.z / h + 0.5) + 0.22 * noise.noise(q * 0.7 + off)), smooth=True)


def masonry(m, rng, s, mat, col, brick=False):
    """A wall laid in courses; the core carries the texture, stones stand proud of it."""
    w, d, h = s
    along_x = w >= d
    L, t = (w, d) if along_x else (d, w)
    q = M()
    q.box((0, 0, 0), (L - 0.06, t * 0.94, h - 0.04), mat, mul(col, 0.92), bevel=0.06)
    rows = max(1, int(h / 1.15))
    rh = h / rows
    for r in range(rows):
        z = -h / 2 + r * rh
        u = rng.uniform(0, 0.8) - L / 2
        while u < L / 2 - 0.5:
            b = rng.uniform(1.1, 2.3)
            if u + b > L / 2:
                break
            if rng.random() < (0.3 if not brick else 0.1):
                for sg in (-1, 1):
                    if rng.random() < 0.7:
                        q.box((u + b / 2, sg * t * 0.46, z + rh / 2), (b - 0.08, t * 0.12 + 0.12, rh - 0.1), mat, vary(rng, col, 0.16), bevel=0.08, jitter=0.03, rng=rng)
            u += b
    n = max(1, round(L / 1.7))
    for i in range(n):  # coping
        q.box((-L / 2 + L * (i + 0.5) / n, 0, h / 2 - 0.12), (L / n - 0.06, t + 0.16, 0.42), mat, vary(rng, mul(col, 1.06), 0.12), bevel=0.1, jitter=0.03, rng=rng)
    m.merge(q, Matrix() if along_x else rotz(90))


def planks(m, rng, s, col, mat="WoodPlanks"):
    """A panel of boards along its longest side; battens behind when it is thin and wide."""
    ax = oriented(s)
    thin, across, along = ax
    n = max(1, min(14, round(s[across] / 0.95)))
    for i in range(n):
        put(m, ax, (max(0.1, s[thin] * rng.uniform(0.86, 1.0)), s[across] / n - 0.05, s[along] - (rng.uniform(0, 0.12) if s[along] > 3 else 0)), (0, -s[across] / 2 + s[across] * (i + 0.5) / n, 0), mat, vary(rng, col, 0.16), bevel=min(0.06, s[thin] * 0.2), jitter=0.012, rng=rng)
    if s[thin] < 0.7 and s[along] > 3 and s[across] > 2.4:
        for e in (-0.36, 0.36):
            put(m, ax, (s[thin] + 0.22, s[across] * 0.98, 0.42), (0, 0, e * s[along]), "Wood", vary(rng, mul(col, 0.8), 0.1), bevel=0.04)


def crate(m, rng, s, col):
    w, d, h = s
    m.box((0, 0, 0), (w - 0.24, d - 0.24, h - 0.24), "WoodPlanks", mul(col, 0.72))
    e = min(0.42, min(s) * 0.16)
    for a in range(3):
        b, c = [q for q in range(3) if q != a]
        for x in (-1, 1):
            for y in (-1, 1):
                put(m, (a, b, c), (s[a] - (0 if a == 0 else e * 1.6), e, e), (0, x * (s[b] - e) / 2, y * (s[c] - e) / 2), "Wood", vary(rng, mul(col, 0.94), 0.12), bevel=e * 0.18)
    for sg in (-1, 1):  # boards on the sides and a brace
        n = max(3, round(h / 0.9))
        for i in range(n):
            z = -h / 2 + h * (i + 0.5) / n
            m.box((0, sg * (d / 2 - 0.1), z), (w - e * 1.2, 0.12, h / n - 0.06), "WoodPlanks", vary(rng, col, 0.16), bevel=0.03)
            m.box((sg * (w / 2 - 0.1), 0, z), (0.12, d - e * 1.2, h / n - 0.06), "WoodPlanks", vary(rng, col, 0.16), bevel=0.03)
        L = math.hypot(w - e * 2, h - e * 2)
        m.box((0, sg * (d / 2 - 0.02), 0), (L, 0.14, e), "Wood", vary(rng, mul(col, 0.9), 0.1), rot=(0, -math.degrees(math.atan2(h - e * 2, w - e * 2)) * sg, 0), bevel=0.04)


def flags(m, rng, s, mat, col):
    """A slab or a floor: big pieces with open joints, or one poured plate with a worn edge."""
    w, d, h = s
    if w * d > 46 and max(w, d) < 60 and mat not in ("Metal", "SmoothPlastic", "Sand", "Ground", "Asphalt", "RealConcrete"):
        m.box((0, 0, -h * 0.1), (w - 0.1, d - 0.1, h * 0.8), mat, mul(col, 0.7))
        nx, ny = max(1, round(w / 4.2)), max(1, round(d / 3.4))
        for j in range(ny):
            x = -w / 2
            k = nx + (j % 2)
            for i in range(k):
                b = w / nx * (0.5 if (j % 2 and i in (0, k - 1)) else 1.0)
                m.box((x + b / 2, -d / 2 + d * (j + 0.5) / ny, h * 0.02), (b - 0.07, d / ny - 0.07, h * 0.96), mat, vary(rng, col, 0.11), bevel=min(0.08, h * 0.2))
                x += b
    else:
        m.box((0, 0, 0), s, mat, col, bevel=min(0.14, h * 0.24))
        if mat == "RealConcrete" and w * d > 80 and not DETAIL.level:
            for i in range(1, max(1, int(w / 9))):
                m.box((-w / 2 + w * i / int(w / 9), 0, h / 2 - 0.02), (0.14, d - 0.4, 0.06), mat, mul(col, 0.66))


def around(m, rng, w, d, inset):
    """The four faces of a mass, a little inside its edges."""
    x, y = w / 2, d / 2
    return (Face(m, rng, (x - inset, y), (-x + inset, y), (0, 1)), Face(m, rng, (-x + inset, -y), (x - inset, -y), (0, -1)), Face(m, rng, (x, -y + inset), (x, y - inset), (1, 0)), Face(m, rng, (-x, y - inset), (-x, -y + inset), (-1, 0)))


def volume(m, rng, s, mat, col):
    """A built mass: plinth, corner piers, bands and a coping instead of six flat faces."""
    w, d, h = s
    m.box((0, 0, 0), (w - 0.3, d - 0.3, h), mat, col, bevel=0.08)
    m.box((0, 0, -h / 2 + min(0.7, h * 0.1)), (w, d, min(1.4, h * 0.2)), mat, mul(col, 0.78), bevel=0.08)
    m.box((0, 0, h / 2 - 0.25), (w + 0.3, d + 0.3, 0.5), mat, mul(col, 1.1), bevel=0.08)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((sx * (w / 2 - 0.35), sy * (d / 2 - 0.35), 0), (0.8, 0.8, h - 0.1), mat, mul(col, 1.05), bevel=0.08)
    for f in around(m, rng, w - 0.3, d - 0.3, 0.75):
        n = max(1, round(f.L / 6))
        for i in range(1, n):
            f.box(f.L * i / n, 0, 0.16, h - 1.6, 0.06, mat, mul(col, 0.72), 0.0)


def metal(m, rng, s, col, worn=False):
    """Sheet and section: bars keep their section, plates get a folded edge and ribs, cabinets their panels."""
    w, d, h = s
    a = sorted(s)
    tone = (lambda k: mul(col, k)) if not worn else (lambda k: (lambda q: mul(mix(col, (0.24, 0.1, 0.05), max(0.0, min(1.0, 0.45 + 0.9 * noise.noise(q * 0.8)))), k)))
    m.box((0, 0, 0), s, "Metal", tone(1.0), bevel=min(0.16, a[0] * 0.2))
    if a[1] < 1.6 or a[2] < 2.0:
        return
    ax = oriented(s)
    thin, across, along = ax
    if s[thin] < 1.2:
        n = max(1, int(s[along] / 3.2))
        for i in range(n + 1):
            put(m, ax, (s[thin] + 0.18, s[across], 0.24), (0, 0, -s[along] / 2 + 0.16 + (s[along] - 0.32) * i / n), "Metal", tone(0.8), bevel=0.04)
        return
    for f in around(m, rng, w, d, 0.1):
        n = max(1, round(f.L / 3.4))
        for i in range(n):
            f.box(f.L * (i + 0.5) / n, 0, f.L / n - 0.3, h - 0.5, 0.1, "Metal", tone(1.06), 0.0, 0.04)
    m.box((0, 0, h / 2), (w + 0.2, d + 0.2, 0.24), "Metal", tone(0.8), bevel=0.05)


def glass(m, rng, s, col, frame=DARK):
    ax = oriented(s)
    thin, across, along = ax
    if s[thin] > 2.4:  # a volume of glass: edges and mullions
        m.box((0, 0, 0), [v - 0.16 for v in s], "Glass", col)
        for a in range(3):
            b, c = [q for q in range(3) if q != a]
            n = max(1, round(s[b] / 4)) if a == 2 else 1
            for x in range(n + 1):
                for y in (-1, 1):
                    put(m, (a, b, c), (s[a], 0.24, 0.24), (0, -s[b] / 2 + s[b] * x / n, y * s[c] / 2), "Metal", frame)
        return
    lit = rng.random() < 0.12
    put(m, ax, (max(0.1, s[thin] * 0.4), s[across] - 0.2, s[along] - 0.2), (0, 0, 0), "Glow" if lit else "Glass", mul((0.85, 0.66, 0.4), 0.6) if lit else col)
    for a, b in ((across, along), (along, across)):
        n = max(1, round(s[b] / 3.6))
        for i in range(n + 1):
            edge = i in (0, n)
            put(m, (thin, a, b), (s[thin] + (0.12 if edge else 0.0), s[a], 0.26 if edge else 0.14), (0, 0, -s[b] / 2 + 0.1 + (s[b] - 0.2) * i / n), "Metal", frame, bevel=0.03)


def bags(m, rng, s, col):
    w, d, h = s
    along_x = w >= d
    L, t = (w, d) if along_x else (d, w)
    q = M()
    rows = max(1, round(h / 0.75))
    rh = h / rows
    deep = max(1, round(t / 1.3))
    for r in range(rows):
        n = max(1, round(L / 1.9))
        for k in range(deep):
            for i in range(n):
                x = -L / 2 + L * (i + 0.5 + (0.25 if r % 2 else -0.25) * (n > 1)) / n
                q.ball((min(L / 2 - 0.6, max(-L / 2 + 0.6, x)), -t / 2 + t * (k + 0.5) / deep + rng.uniform(-0.06, 0.06), -h / 2 + rh * (r + 0.5)), 1, "Fabric", vary(rng, col, 0.13), sub=2, squash=(L / n * 0.55, t / deep * 0.56, rh * 0.62), disp=0.16, seed=rng.random() * 40)
    m.merge(q, Matrix() if along_x else rotz(90))


def greenery(m, rng, pal, s, col):
    """Planted: foliage filling the box."""
    w, d, h = s
    p = {**pal, "foliage": col, "foliageAlt": mix(col, pal["foliageAlt"], 0.4)}
    n = max(1, min(6, round(max(w, d) / max(1.6, min(w, d)))))
    for i in range(n):
        b = FLORA["bush"](rng, p, (4, 4, 3), rng.randrange(6))
        lo = [min(v[a] for v in b.v) for a in range(3)]
        hi = [max(v[a] for v in b.v) for a in range(3)]
        lw, ld = (w / n, d) if w >= d else (w, d / n)
        off = (-w / 2 + w * (i + 0.5) / n, 0) if w >= d else (0, -d / 2 + d * (i + 0.5) / n)
        m.merge(b, Matrix.Translation((off[0], off[1], -h / 2)) @ Matrix.Diagonal((lw * 1.12 / (hi[0] - lo[0]), ld * 1.12 / (hi[1] - lo[1]), h * 1.1 / (hi[2] - lo[2]), 1)) @ Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2])))


def neon(m, rng, s, col):
    ax = oriented(s)
    m.box((0, 0, 0), s, "Glow", col, bevel=min(0.08, s[ax[0]] * 0.2))
    if s[ax[1]] > 0.9 and s[ax[0]] < 0.9:  # its housing
        put(m, ax, (s[ax[0]] * 0.7, s[ax[1]] + 0.22, s[ax[2]] + 0.22), (0, 0, 0), "Metal", (0.07, 0.07, 0.08), bevel=0.04)


def box(m, rng, pal, p, s, col, up):
    raw = p.get("material", "Plastic")
    mat = MAT.get(raw, raw)
    w, d, h = s
    a = sorted(s)
    if raw == "Glass" or (p.get("transparency", 0) > 0.25 and raw == "SmoothPlastic"):
        return glass(m, rng, s, mix(col, (0.06, 0.1, 0.13), 0.5))
    if mat == "Glow":
        return neon(m, rng, s, col)
    if mat == "Leaf":
        return greenery(m, rng, pal, s, col) if a[1] > 0.7 and a[0] > 0.25 else m.box((0, 0, 0), s, "Leaf", col, bevel=a[0] * 0.2)
    if raw in ("Wood", "WoodPlanks"):
        if a[2] > a[1] * 3.0 and a[1] < 2.2:
            m.box((0, 0, 0), s, "Wood", vary(rng, col, 0.08), bevel=min(0.14, a[0] * 0.18), jitter=min(0.04, a[0] * 0.06), rng=rng)
            if up and h == a[2] and a[0] > 0.5 and h > 4:  # a post has a foot
                m.box((0, 0, -h / 2 + 0.3), (w + 0.2, d + 0.2, 0.6), "Wood", mul(col, 0.7), bevel=0.06)
            return None
        if a[0] >= a[1] * 0.42 and a[0] > 1.2 and a[2] < a[0] * 2.8:
            return crate(m, rng, s, col)
        return planks(m, rng, s, col)
    if raw in STONE:
        if up and h > 1.4 and max(w, d) > 2.2 * min(w, d) and max(w, d) > 3.4 and min(w, d) < 2.6 and abs(p["rotation"][0]) + abs(p["rotation"][2]) < 1.5:
            return masonry(m, rng, s, mat if raw != "Rock" else "Slate", col)
        if h < 1.3 and w > 2.5 and d > 2.5 and up:
            return flags(m, rng, s, mat, col)
        return rough(m, rng, s, mat, col)
    if raw == "Brick" and h > 1.2:
        if min(w, d) < 2.4 and max(w, d) > 3:
            return masonry(m, rng, s, "Brick", col, True)
        return volume(m, rng, s, "Brick", col)
    if raw in ("Metal", "CorrodedMetal", "DiamondPlate", "Foil"):
        return metal(m, rng, s, col, raw == "CorrodedMetal")
    if raw == "Fabric":
        if up and 0.7 < min(w, d) < 2.6 and max(w, d) > 2.4 and 0.6 < h < 3.4 and col[0] > col[2] * 1.15 and max(col) < 0.4:
            return bags(m, rng, s, col)
        return m.box((0, 0, 0), s, "Fabric", vary(rng, col, 0.06), bevel=min(0.4, a[0] * 0.36))
    if up and h < 1.4 and w > 3 and d > 3:
        return flags(m, rng, s, mat, col)
    if up and a[0] > 2.6 and h > 2.6 and mat in ("RealConcrete", "SmoothPlastic", "Marble"):
        return volume(m, rng, s, mat, col)
    if mat == "Marble" and a[0] > 0.8:
        m.box((0, 0, 0), s, mat, col, bevel=min(0.14, a[0] * 0.14))
        return m.box((0, 0, h / 2 - min(0.2, h * 0.1)), (w + 0.18, d + 0.18, min(0.3, h * 0.14)), mat, mul(col, 1.06), bevel=0.06) if up else None
    m.box((0, 0, 0), s, mat, col, bevel=min(0.16, a[0] * 0.2))
    if a[0] > 1.0 and a[1] > 2.4 and not DETAIL.level:  # a seam, so that a moulded thing reads as made of pieces
        m.box((0, 0, h * 0.18), (w + 0.04, d + 0.04, 0.07), mat, mul(col, 0.6))
    return None


# ------------------------------------------------------------------ cylinders
def lathe(m, profile, mat, col, n=18):
    """(radius, z) pairs, bottom to top."""
    if DETAIL.level:
        n = max(6, n // 2)
    vs, fs = [], []
    for r, z in profile:
        for k in range(n):
            t = k / n * math.tau
            vs.append(Vector((math.cos(t) * r, math.sin(t) * r, z)))
    for i in range(len(profile) - 1):
        for k in range(n):
            a, b = i * n + k, i * n + (k + 1) % n
            fs.append((a, b, b + n, a + n))
    m.add(vs, fs, mat, col, smooth=True)
    for i, flip in ((0, True), (len(profile) - 1, False)):
        if profile[i][0] > 0.02:
            m.add([vs[i * n + k] for k in range(n)], [tuple(range(n))[::-1] if flip else tuple(range(n))], mat, col)


def ladder(m, p, h, face=0.0):
    q = M()
    for s in (-1, 1):
        q.box((s * 0.6, 0.25, h / 2), (0.12, 0.12, h), "Metal", STEEL)
    for i in range(int(h / 0.9)):
        q.box((0, 0.25, 0.6 + i * 0.9), (1.2, 0.1, 0.1), "Metal", STEEL)
    for i in range(max(0, int((h - 6) / 2.4))):  # cage
        z = 6 + i * 2.4
        q.tube([(math.sin(t) * 0.95, 0.3 + math.cos(t) * 0.95, z) for t in [k / 6 * math.pi - math.pi / 2 for k in range(7)]], [0.05] * 7, "Metal", STEEL, n=4)
    m.merge(q, Matrix.Translation(Vector(p)) @ rotz(face - 90))


def rail(m, r, z, n=20, col=STEEL):
    pts = [(math.cos(k / n * math.tau) * r, math.sin(k / n * math.tau) * r) for k in range(n + 1)]
    for dz in (1.6, 3.0):
        m.tube([(x, y, z + dz) for x, y in pts], [0.07] * (n + 1), "Metal", col, n=4, cap=False)
    for x, y in pts[:-1]:
        m.box((x, y, z + 1.5), (0.1, 0.1, 3.0), "Metal", col)


def tank(m, rng, r, h, col):
    zs = -h / 2
    lathe(m, [(r * 1.02, zs), (r * 1.02, zs + 0.5), (r, zs + 0.6), (r, h / 2 - 0.4), (r * 1.015, h / 2 - 0.35), (r * 1.015, h / 2), (r * 0.7, h / 2 + r * 0.1), (0.4, h / 2 + r * 0.16)], "Panel" if r > 3 else "Metal", lambda q: mix(col, (0.26, 0.15, 0.09), max(0.0, min(0.5, 0.5 * noise.noise(q * Vector((0.5, 0.5, 0.12))) + 0.12 * (1 - (q.z - zs) / h)))), 28)
    n = max(2, int(h / 3.2))
    for i in range(1, n):
        z = zs + h * i / n
        m.tube([(0, 0, z - 0.07), (0, 0, z + 0.07)], [r * 1.012] * 2, "Metal", mul(col, 0.8), n=28, cap=False)
    if h > 8 and r > 3:
        ladder(m, (0, r, zs), h + 1.5, 90)
        rail(m, r * 0.96, h / 2, 22)
        m.cyl((r * 0.4, -r * 0.3, h / 2 + r * 0.14), 0.7, 1.4, "Metal", mul(col, 0.7), n=12)
        c, s = math.cos(0.6), math.sin(0.6)
        m.tube([(c * r, s * r, zs + 1.2), (c * (r + 1.6), s * (r + 1.6), zs + 1.2), (c * (r + 1.6), s * (r + 1.6), zs + 0.1)], [0.36] * 3, "Metal", (0.4, 0.12, 0.08), n=8)


def column(m, rng, r, h, col, mat="Marble"):
    """Fluted shaft with entasis between a base and a capital."""
    zs = -h / 2
    b, c = min(0.9, h * 0.07), min(1.2, h * 0.09)
    m.box((0, 0, zs + b * 0.25), (r * 2.5, r * 2.5, b * 0.5), mat, mul(col, 0.94), bevel=0.06)
    lathe(m, [(r * 1.2, zs + b * 0.5), (r * 1.24, zs + b * 0.7), (r * 1.06, zs + b)], mat, col, 18)
    n, rows = 36, 5
    z0, z1 = zs + b, h / 2 - c
    if DETAIL.level:
        m.cyl((0, 0, (z0 + z1) / 2), r * 0.95, z1 - z0, mat, col, n=10)
    else:
        vs, fs = [], []
        for i in range(rows + 1):
            t = i / rows
            rr = r * (1.0 - 0.14 * t + 0.05 * math.sin(math.pi * t))
            for k in range(n):
                f = 1 - (0.06 if k % 3 == 1 else 0)
                a = k / n * math.tau
                vs.append(Vector((math.cos(a) * rr * f, math.sin(a) * rr * f, z0 + (z1 - z0) * t)))
        for i in range(rows):
            for k in range(n):
                a, e = i * n + k, i * n + (k + 1) % n
                fs.append((a, e, e + n, a + n))
        m.add(vs, fs, mat, lambda q: mul(col, 0.9 + 0.12 * noise.noise(q * 0.8)), smooth=False)
    lathe(m, [(r * 0.9, z1), (r * 0.98, z1 + c * 0.16), (r * 0.9, z1 + c * 0.24), (r * 1.3, z1 + c * 0.62)], mat, col, 18)
    m.box((0, 0, h / 2 - c * 0.19), (r * 2.7, r * 2.7, c * 0.38), mat, mul(col, 1.04), bevel=0.06)


def tyre(m, rng, r, t, hub=(0.3, 0.3, 0.31)):
    """A wheel lying flat: tread blocks, sidewall, hub."""
    q = 12 if not DETAIL.level else 6
    n = 22 if not DETAIL.level else 10
    prof = [(r - t * 0.45 + math.cos(k / q * math.tau) * t * 0.45, math.sin(k / q * math.tau) * t * 0.5) for k in range(q)]
    vs, fs = [], []
    for i in range(n):
        b = i / n * math.tau
        for x, z in prof:
            vs.append(Vector((math.cos(b) * x, math.sin(b) * x, z)))
    for i in range(n):
        for k in range(q):
            a, e = i * q + k, i * q + (k + 1) % q
            a2, e2 = ((i + 1) % n) * q + k, ((i + 1) % n) * q + (k + 1) % q
            fs.append((a, a2, e2, e))
    m.add(vs, fs, "SmoothPlastic", (0.03, 0.03, 0.032), smooth=True)
    m.cyl((0, 0, 0), r - t * 0.62, t * 0.6, "Metal", hub, n=14)
    m.cyl((0, 0, 0), r * 0.2, t * 0.78, "Metal", mul(hub, 0.7), n=10)
    if not DETAIL.level:
        for i in range(5):
            b = i / 5 * math.tau
            m.box((math.cos(b) * r * 0.36, math.sin(b) * r * 0.36, 0), (r * 0.3, r * 0.14, t * 0.72), "Metal", mul(hub, 1.25), rot=(0, 0, math.degrees(b)))
        for i in range(n):
            b = (i + 0.5) / n * math.tau
            m.box((math.cos(b) * r * 0.99, math.sin(b) * r * 0.99, 0), (0.1, r * 0.2, t * 0.7), "SmoothPlastic", (0.024, 0.024, 0.026), rot=(0, 0, math.degrees(b)))


def logs(m, rng, r, h, col):
    q = [(rng.uniform(-0.04, 0.04) * r, rng.uniform(-0.04, 0.04) * r, -h / 2 + h * i / 5) for i in range(6)]
    m.tube(q, [r * rng.uniform(0.92, 1.04) for _ in q], "Bark" if r > 0.5 else "Wood", lambda p: mul(col, 0.85 + 0.25 * noise.noise(p * 1.3)), n=12, wobble=0.05, rng=rng)
    if r > 0.5:
        for s in (-1, 1):
            m.cyl((0, 0, s * (h / 2 + 0.01)), r * 0.9, 0.05, "Wood", mix(mul(col, 1.9), (0.5, 0.36, 0.2), 0.5), n=12)


def drum_wall(k, rng, r, h, mat, col):
    k.cyl((0, 0, -0.02), r * 0.9, h, mat, mul(col, 0.8), n=24)
    n = max(8, round(r * math.tau / 2.0))
    rows = max(1, round(h / 1.1))
    for j in range(rows):
        for i in range(n):
            a = (i + 0.5 * (j % 2)) / n * math.tau
            k.box((math.cos(a) * r * 0.94, math.sin(a) * r * 0.94, -h / 2 + h * (j + 0.5) / rows), (max(0.5, r * 0.16), r * math.tau / n - 0.06, h / rows - 0.05), mat, vary(rng, col, 0.15), rot=(0, 0, math.degrees(a)), bevel=0.1, jitter=0.03, rng=rng)


def shaft(k, r, h, mat, col):
    """A chimney: a spread foot, a taper, a lip, the marks of its formwork."""
    lathe(k, [(r * 1.25, -h / 2), (r * 1.2, -h / 2 + h * 0.05), (r * 1.02, -h / 2 + h * 0.06), (r * 0.98, 0), (r * 0.9, h / 2 - 1), (r * 0.98, h / 2 - 0.8), (r * 0.98, h / 2)], mat, lambda q: mul(col, 0.88 + 0.16 * noise.noise(q * Vector((0.5, 0.5, 0.1)))), 26)
    for i in range(1, int(h / 7)):
        z = -h / 2 + i * 7
        k.tube([(0, 0, z - 0.12), (0, 0, z + 0.12)], [r * (1.0 - (z + h / 2) / h * 0.1) + 0.06] * 2, mat, mul(col, 0.8), n=26, cap=False)
    ladder(k, (0, r * 0.98, -h / 2), h, 90)


def cylinder(m, rng, pal, p, s, col, up):
    raw = p.get("material", "Plastic")
    mat = MAT.get(raw, raw)
    r, h = min(s[0], s[1]) / 2, s[2]
    k = M()
    if raw == "Glass":
        k.cyl((0, 0, 0), r * 0.97, h - 0.1, "Glass", mix(col, (0.06, 0.1, 0.13), 0.5), n=24)
        n = max(6, round(r * math.tau / 3.2))
        if h > 1.2:
            for i in range(n):
                a = i / n * math.tau
                k.box((math.cos(a) * r, math.sin(a) * r, 0), (0.22, 0.22, h), "Metal", DARK, rot=(0, 0, math.degrees(a)))
            for z in (-h / 2, h / 2):
                k.tube([(0, 0, z - 0.16), (0, 0, z + 0.16)], [r * 1.02] * 2, "Metal", DARK, n=24)
    elif mat == "Glow":
        k.cyl((0, 0, 0), r, h, "Glow", col, n=14)
    elif raw == "Rubber" and h < r * 2.2:
        tyre(k, rng, r, h)
    elif mat == "Leaf":
        greenery(k, rng, pal, s, col) if r > 0.6 and h > 0.5 else k.cyl((0, 0, 0), r, h, "Leaf", col, n=8)
    elif raw in ("Wood", "WoodPlanks"):
        logs(k, rng, r, h, col)
    elif raw in ("Metal", "CorrodedMetal", "DiamondPlate", "Foil") and r > 2.2 and h > 3 and up:
        tank(k, rng, r, h, col)
    elif raw in ("Marble", "Limestone", "Sandstone") and h > r * 4 and r > 0.4 and up:
        column(k, rng, r, h, col, mat)
    elif raw in STONE and h < r * 1.4 and r > 1.5 and up:
        drum_wall(k, rng, r, h, mat, col)
    elif raw in STONE:
        lathe(k, [(r * 1.04, -h / 2), (r, -h * 0.2), (r * 0.97, h * 0.2), (r * 0.92, h / 2)], mat, lambda q: mul(col, 0.85 + 0.25 * noise.noise(q * 0.8)), 14)
    elif mat in ("RealConcrete", "Brick") and h > r * 5 and r > 1.5:
        shaft(k, r, h, mat, col)
    elif h < 0.35:
        k.cyl((0, 0, 0), r, h, mat, col, n=max(16, int(r * 3)))
    else:
        c = min(0.2, r * 0.2, h * 0.2)
        lathe(k, [(r - c, -h / 2), (r, -h / 2 + c), (r, h / 2 - c), (r - c, h / 2)], mat, col, 10 if r < 0.4 else 20 if r < 4 else 32)
        if mat == "Metal" and r > 0.4 and h > r * 5:  # flanges of a pipe
            n = max(2, int(h / 5))
            for i in range(n + 1):
                k.cyl((0, 0, -h / 2 + 0.2 + (h - 0.4) * i / n), r * 1.22, 0.26, "Metal", mul(col, 0.75), n=14)
    m.merge(k, Matrix.Diagonal((s[0] / (r * 2), s[1] / (r * 2), 1, 1)))


def sphere(m, rng, pal, p, s, col):
    raw = p.get("material", "Plastic")
    mat = MAT.get(raw, raw)
    r = max(s) / 2
    if mat == "Leaf" and r > 0.5:
        return greenery(m, rng, pal, s, col)
    if p["shape"] == "mesh" and raw in STONE + ("Concrete",):
        return m.merge(FLORA["boulder"](rng, {**pal, "stone": col}, (s[0], s[1], s[2]), rng.randrange(5)), Matrix.Translation((0, 0, -s[2] / 2)))
    sub = 4 if r > 4 else 3 if r > 1.2 else 2
    m.ball((0, 0, 0), 0.5, mat, col, sub=sub, squash=s, disp=0.12 if p["shape"] == "mesh" else 0.0, seed=rng.random() * 9)
    if r > 3 and mat in ("Metal", "SmoothPlastic", "Glass", "RealConcrete"):  # seams of a dome
        ring = [j / 24 * math.tau for j in range(25)]
        for k in range(6):
            a = k / 6 * math.pi
            m.tube([(math.cos(a) * math.sin(t) * s[0] / 2 * 1.004, math.sin(a) * math.sin(t) * s[1] / 2 * 1.004, math.cos(t) * s[2] / 2 * 1.004) for t in ring], [0.1] * 25, "Metal", mul(col, 0.55), n=4, cap=False)
        for z in (-0.5, 0.0, 0.5):
            c = math.sqrt(1 - z * z)
            m.tube([(math.cos(t) * c * s[0] / 2 * 1.004, math.sin(t) * c * s[1] / 2 * 1.004, z * s[2] / 2) for t in ring], [0.1] * 25, "Metal", mul(col, 0.55), n=4, cap=False)
    return None


def solid(m, vs, fs, mat, col):
    vs = [Vector(v) for v in vs]
    mid = sum(vs, Vector()) / len(vs)
    good = []
    for f in fs:
        n = (vs[f[1]] - vs[f[0]]).cross(vs[f[2]] - vs[f[0]])
        good.append(f if n.dot(vs[f[0]] - mid) >= 0 else f[::-1])
    m.add(vs, good, mat, col)


def wedge(m, rng, pal, p, s, col):
    raw = p.get("material", "Plastic")
    mat = MAT.get(raw, raw)
    a, b, c = s[0] / 2, s[1] / 2, s[2] / 2
    if p["shape"] == "wedge":  # high toward -Y (Roblox +Z)
        solid(m, [(-a, b, -c), (a, b, -c), (a, -b, -c), (-a, -b, -c), (a, -b, c), (-a, -b, c)], [(0, 1, 2, 3), (3, 2, 4, 5), (1, 0, 5, 4), (0, 3, 5), (1, 4, 2)], mat, col)
    else:
        solid(m, [(-a, b, -c), (a, b, -c), (a, -b, -c), (-a, -b, -c), (a, -b, c)], [(0, 1, 2, 3), (0, 4, 1), (1, 4, 2), (2, 4, 3), (3, 4, 0)], mat, col)


# ------------------------------------------------------------------ roofs
KIND = {"WoodPlanks": "plank", "Wood": "plank", "Metal": "metal", "CorrodedMetal": "metal", "Grass": "thatch", "LeafyGrass": "thatch", "Slate": "slate"}


def pair_roofs(parts):
    """Two wedges back to back are one roof: (part, part, gap) by index."""
    out, used = [], set()
    for i, p in enumerate(parts):
        if p["shape"] != "wedge" or i in used or abs(p["rotation"][0]) + abs(p["rotation"][2]) > 0.5:
            continue
        for j in range(i + 1, len(parts)):
            q = parts[j]
            if j in used or q["shape"] != "wedge" or q["material"] != p["material"]:
                continue
            if any(abs(a - b) > 0.06 for a, b in zip(p["size"], q["size"])) or abs(p["position"][1] - q["position"][1]) > 0.1 or abs((p["rotation"][1] - q["rotation"][1]) % 360 - 180) > 1:
                continue
            dx, dz = q["position"][0] - p["position"][0], q["position"][2] - p["position"][2]
            gap = math.hypot(dx, dz)
            if gap < 0.5 or gap > p["size"][2] * 1.35 or p["size"][1] < 1.2 or p["size"][2] < 1.6:
                continue
            a = math.radians(p["rotation"][1])
            if abs(dx * math.cos(a) - dz * math.sin(a)) > 0.3:
                continue
            out.append((i, j, gap))
            used |= {i, j}
            break
    return out, used


def make_roof(m, rng, pal, p, q, gap):
    col = lin(p["color"])
    w, rise, run = p["size"]
    cx, cz = (p["position"][0] + q["position"][0]) / 2, (p["position"][2] + q["position"][2]) / 2
    half = gap / 2 + run / 2
    z = p["position"][1] - rise / 2
    over = min(1.2, half * 0.14, w * 0.06)
    kind = KIND.get(p["material"], "tile")
    k = M()
    pitch = rise / half
    rustic = kind in ("plank", "thatch")
    roof(k, rng, pal, w - over * 2, (half - over) * 2, z + over * pitch - 0.2, pitch, kind, col, over=over, sag=0.12 if half > 4 else 0.0, flare=0.2 if half > 4 else 0.0, wall_mat="WoodPlanks" if rustic else "Concrete", wall_col=mul(pal["wood"], 0.9) if rustic else mul(pal["wall"], 0.95), timber=kind in ("tile", "plank") and half > 5)
    m.merge(k, Matrix.Translation((cx, -cz, 0)) @ rotz(p["rotation"][1]))


MODULES = {"hall": hall, "sign": sign}


def build(rng, pal, entry):
    m = M()
    parts = entry["parts"]
    taken = set()
    for mod in entry.get("modules", ()):
        if mod["kind"] in MODULES:
            MODULES[mod["kind"]](m, rng, pal, mod["data"])
            taken.update(range(mod["from"], mod["to"]))
    rest = [p for i, p in enumerate(parts) if i not in taken and p.get("transparency", 0) < 0.95]
    roofs, used = pair_roofs(rest)
    for i, j, gap in roofs:
        make_roof(m, rng, pal, rest[i], rest[j], gap)
    for i, p in enumerate(rest):
        if i in used:
            continue
        xf = frame_of(p)
        up = xf.to_3x3().col[2].z > 0.985
        sx, sy, sz = p["size"]
        s = (sx, sz, sy)
        col = vary(rng, lin(p["color"]), 0.06)
        k = M()
        shape = p["shape"]
        if shape in ("sphere", "mesh"):
            sphere(k, rng, pal, p, s, col)
        elif shape == "cylinder":
            cylinder(k, rng, pal, p, s, col, up)
        elif shape in ("wedge", "cornerWedge"):
            wedge(k, rng, pal, p, s, col)
        else:
            box(k, rng, pal, p, s, col, up)
        m.merge(k, xf)
    return m
