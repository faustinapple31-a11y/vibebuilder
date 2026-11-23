"""Architecture library: roofs that sag and flare, framed walls, dormers, wings, porches, towers with machicolations.

Houses and castles are assembled from these modules; what a building *does* (home, shop, inn, smithy, farm, hall)
decides which ones it gets. Detail that a texture carries (masonry, tiles, planks) is not modelled: geometry goes to the
silhouette and to what catches the light. Front toward +Y. Houses can be entered.
"""
import math
from mathutils import Vector, Matrix, noise
from wf_mesh import M, mix, mul, vary
from wf_arch import GLASS, rotz, wall, beam, stone_course, window, door, chimney, furnish, flag, banner
from wf_trees import climbing

UP = Vector((0, 0, 1))
IRON = (0.035, 0.035, 0.04)


# ------------------------------------------------------------------ roofs
def roof(m, rng, pal, w, d, z, pitch, kind="tile", col=None, over=1.5, sag=0.35, flare=0.55, x=0.0, y=0.0, axis="x", gables=True, wall_mat="Concrete", wall_col=None, timber=True, verge=True, hip=0.0):
    """Gable roof with a sagging ridge and flared eaves, laid in courses; `hip` (0..1) clips the gables. Returns the ridge height."""
    R = M()
    half, L = d / 2 + over, w + over * 2
    h = half * pitch
    base = z - over * pitch + 0.1
    col = col or pal["roof"]
    mat = {"tile": "Roof", "slate": "Roof", "thatch": "Thatch", "plank": "WoodPlanks", "metal": "Panel"}.get(kind, "Roof")
    thick = 0.85 if kind == "thatch" else 0.3

    def point(u, v, s, lift=0.0):
        """u along the ridge (-1..1), v from the ridge (0) to the eave (1)."""
        cut = hip * 0.5 * (1 - v) * L * 0.24
        px = u * (L / 2 - cut)
        dip = -sag * (1 - u * u) * (1 - v * 0.55)
        fl = flare * max(0.0, (v - 0.66) / 0.34) ** 2
        n = Vector((0, s * h, half)).normalized()
        return Vector((px, s * half * v, base + h * (1 - v) + dip + fl)) + n * lift

    slope = math.hypot(half, h)
    rows = max(4, int(slope / (1.05 if kind != "thatch" else 1.8)))
    segs = max(4, int(L / 2.6))
    for s in (-1, 1):
        for r in range(rows):
            v0, v1 = r / rows, (r + 1) / rows
            for k in range(segs):
                u0, u1 = -1 + 2 * k / segs, -1 + 2 * (k + 1) / segs
                j = rng.uniform(-0.05, 0.05)
                l0, l1 = 0.04, (0.2 if kind != "thatch" else 0.28) + j
                o = 0.22 / rows
                A, B, C, D = point(u0, max(0, v0 - o), s, l0), point(u1, max(0, v0 - o), s, l0), point(u1, v1 + o * 0.5, s, l1), point(u0, v1 + o * 0.5, s, l1)
                low = [C - Vector((0, 0, 0.2)), D - Vector((0, 0, 0.2))]
                c = vary(rng, mul(col, 0.9 + 0.2 * noise.noise(Vector((u0 * 3, v0 * 5, s * 7)))), 0.06)
                if kind == "slate" and rng.random() < 0.12:
                    c = mul(c, 0.8)
                q = [(0, 1, 2, 3), (3, 2, 4, 5)]
                if (B - A).cross(D - A).z < 0:
                    q = [f[::-1] for f in q]
                ua, ub = u0 * L / 2 + r * 3.37, u1 * L / 2 + r * 3.37
                uv = [(ua, rows - r + 1.1), (ub, rows - r + 1.1), (ub, rows - r), (ua, rows - r), (ub, rows - r - 0.15), (ua, rows - r - 0.15)]
                if kind == "plank":
                    uv = [(b, a) for a, b in uv]
                m_c = lambda p, c=c: c
                R.add([A, B, C, D, *low], q, mat, m_c, uv=uv)
        # underside and eave board
        under = [-1 + 2 * k / 5 for k in range(6)]
        for u0, u1 in zip(under, under[1:]):  # it sags with the ridge, or it would show through the tiles
            for v0, v1 in ((0, 0.4), (0.4, 0.75), (0.75, 1)):
                q = [point(u0, v0, s, -thick), point(u1, v0, s, -thick), point(u1, v1, s, -thick), point(u0, v1, s, -thick)]
                f = (0, 1, 2, 3) if (q[1] - q[0]).cross(q[3] - q[0]).z < 0 else (3, 2, 1, 0)
                R.add(q, [f], "WoodPlanks", mul(pal["wood"], 0.55))
        e0, e1 = point(-1, 1, s, -thick * 0.45), point(1, 1, s, -thick * 0.45)
        if kind == "thatch":
            R.tube([e0, (e0 + e1) / 2, e1], [0.5, 0.52, 0.5], "Thatch", mul(col, 0.8), n=6)
        else:
            beam(R, rng, e0, e1, 0.24, thick + 0.12, pal["wood"])
            n = int(L / 2.0)
            for k in range(n):  # rafter ends under the eave
                u = -1 + 2 * (k + 0.5) / n
                p, q = point(u, 0.72, s, -thick - 0.2), point(u, 1.0, s, -thick - 0.12)
                beam(R, rng, p, q, 0.28, 0.34, mul(pal["wood"], 0.85))
        if verge:
            for e in (-1, 1):
                prev = None
                for i in range(6):
                    p = point(e, i / 5, s, 0.06)
                    if prev is not None:
                        beam(R, rng, prev, p, 0.3, 0.62 if kind != "thatch" else 0.9, mul(pal["wood"], 0.95) if kind != "thatch" else mul(col, 0.8))
                    prev = p
    # ridge: half-round tiles, or a tied bundle of straw
    n = max(4, int(L / 1.5))
    ridge_pts = [point(-1 + 2 * k / n, 0, 1, 0.12) for k in range(n + 1)]
    for a, b in zip(ridge_pts, ridge_pts[1:]):
        if kind == "thatch":
            R.tube([a, b], [0.55, 0.55], "Thatch", vary(rng, mul(col, 0.85), 0.08), n=7)
        else:
            R.tube([a + Vector((0, 0, -0.08)), b], [0.36, 0.4], mat, vary(rng, mul(col, 0.82), 0.1), n=7)
    for e in (-1, 1):  # finials
        p = point(e, 0, 1, 0.1)
        if kind in ("tile", "slate") and verge:
            R.tube([p - Vector((0, 0, 0.4)), p + Vector((0, 0, 1.0)), p + Vector((0, 0, 1.5))], [0.18, 0.16, 0.02], "Wood", pal["wood"], n=6)
    if gables:
        wc = wall_col or pal["wall"]
        for e in (-1, 1):
            gx = w / 2 + 0.02
            top = z + d / 2 * pitch - 0.25
            tri = [Vector((e * gx, -d / 2, z - 0.1)), Vector((e * gx, d / 2, z - 0.1)), Vector((e * gx, 0, top))]
            R.add(tri, [(0, 1, 2) if e > 0 else (2, 1, 0)], wall_mat, wc)
            R.add([p - Vector((e * 0.4, 0, 0)) for p in tri], [(2, 1, 0) if e > 0 else (0, 1, 2)], wall_mat, mul(wc, 0.8))
            if timber:
                fx = e * (gx + 0.16)
                beam(R, rng, (fx, -d / 2 - 0.1, z + 0.1), (fx, d / 2 + 0.1, z + 0.1), 0.55, 0.6, pal["wood"])
                beam(R, rng, (fx, 0, z), (fx, 0, top - 0.4), 0.5, 0.5, pal["wood"])
                ch = d * 0.26 * pitch
                beam(R, rng, (fx, -d * 0.24, z + ch), (fx, d * 0.24, z + ch), 0.42, 0.46, pal["wood"])
                for s in (-1, 1):
                    beam(R, rng, (fx, s * d * 0.24, z + 0.2), (fx, s * d * 0.24, z + ch), 0.42, 0.42, pal["wood"])
                    beam(R, rng, (fx, s * d * 0.06, z + ch), (fx, s * d * 0.2, z + ch + d * 0.05 * pitch), 0.3, 0.32, pal["wood"])
                    beam(R, rng, (fx, s * d * 0.42, z + 0.3), (fx, s * d * 0.28, z + ch * 0.75), 0.3, 0.32, pal["wood"])
    m.merge(R, Matrix.Translation((x, y, 0)) @ (rotz(90) if axis == "y" else Matrix()))
    return base + h


def dormer(m, rng, pal, p, w, h, depth, kind, col, plaster):
    """A small gabled window on a front slope: `p` is the middle of its sill, face toward +Y."""
    D = M()
    wood = pal["wood"]
    for s in (-1, 1):
        D.box((s * w / 2, -depth / 2, h / 2), (0.35, depth, h), "Concrete", plaster)
        beam(D, rng, (s * w / 2, 0.08, 0), (s * w / 2, 0.08, h), 0.42, 0.42, wood)
    D.box((0, -0.1, h / 2), (w, 0.3, h), "Concrete", plaster)
    beam(D, rng, (-w / 2, 0.1, 0.1), (w / 2, 0.1, 0.1), 0.4, 0.4, wood)
    window(D, rng, pal, (0, 0.12, h * 0.5), 90, w * 0.5, h * 0.58, shutters=False, box=True)
    roof(D, rng, pal, depth + 0.4, w, h, 0.95, kind, col, over=0.5, sag=0.06, flare=0.15, axis="y", y=-depth / 2, timber=False, wall_col=plaster)
    m.merge(D, Matrix.Translation(Vector(p)))


def panel(m, rng, pal, a, b, z0, z1, out, pattern, wood):
    """One bay of timber framing between two ground points, proud of the wall by `out`."""
    a, b = Vector((a[0], a[1], 0)) + out, Vector((b[0], b[1], 0)) + out
    lo, hi = UP * (z0 + 0.4), UP * (z1 - 0.4)
    mid = (a + b) / 2
    t, dd = 0.4, 0.3
    if pattern == "x":
        beam(m, rng, a + lo, b + hi, t, dd, wood)
        beam(m, rng, b + lo + out * 0.2, a + hi + out * 0.2, t, dd, wood)
    elif pattern == "brace":
        beam(m, rng, a + lo, a.lerp(b, 0.8) + hi, t, dd, wood)
    elif pattern == "brace2":
        beam(m, rng, b + lo, b.lerp(a, 0.8) + hi, t, dd, wood)
    elif pattern == "chevron":
        beam(m, rng, a + lo, mid + UP * ((z0 + z1) / 2), t, dd, wood)
        beam(m, rng, b + lo, mid + UP * ((z0 + z1) / 2), t, dd, wood)
        beam(m, rng, mid + UP * ((z0 + z1) / 2), mid + hi, t, dd, wood)
    elif pattern == "k":
        beam(m, rng, a + lo, b + UP * ((z0 + z1) / 2), t, dd, wood)
        beam(m, rng, a + hi, b + UP * ((z0 + z1) / 2), t, dd, wood)
    elif pattern == "post":
        beam(m, rng, mid + lo, mid + hi, t, dd, wood)
    elif pattern == "brick":
        d = b - a
        ang = math.degrees(math.atan2(d.y, d.x))
        m.box((mid.x - out.x * 0.4, mid.y - out.y * 0.4, (z0 + z1) / 2), (d.length - 0.5, 0.34, z1 - z0 - 0.8), "Brick", vary(rng, (0.3, 0.13, 0.085), 0.12), rot=(0, 0, ang))
        beam(m, rng, a + lo, b + hi, t * 0.9, dd, wood)


def frame(m, rng, pal, a, b, z0, z1, wood, bays, patterns, out, windows=(), win=(2.1, 2.7), shutters=True, box=True):
    """A framed wall face: sill, plate, posts, then each bay is a window or a brace pattern."""
    A, B = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    o = Vector(out).normalized()
    face = math.degrees(math.atan2(o.y, o.x))
    beam(m, rng, A + o * 0.14 + UP * (z0 + 0.25), B + o * 0.14 + UP * (z0 + 0.25), 0.62, 0.6, wood)
    beam(m, rng, A + o * 0.14 + UP * (z1 - 0.25), B + o * 0.14 + UP * (z1 - 0.25), 0.62, 0.6, wood)
    for k in range(bays + 1):
        p = A.lerp(B, k / bays)
        beam(m, rng, p + o * 0.18 + UP * z0, p + o * 0.18 + UP * z1, 0.6 if k in (0, bays) else 0.5, 0.6 if k in (0, bays) else 0.5, wood)
    for k in range(bays):
        p, q = A.lerp(B, (k + 0.07) / bays), A.lerp(B, (k + 0.93) / bays)
        mid = (p + q) / 2
        if k in windows:
            zc = z0 + (z1 - z0) * 0.56
            beam(m, rng, p + o * 0.2 + UP * (zc - win[1] / 2 - 0.5), q + o * 0.2 + UP * (zc - win[1] / 2 - 0.5), 0.36, 0.36, wood)
            window(m, rng, pal, mid + o * 0.2 + UP * zc, face, *win, shutters=shutters and (q - p).length > win[0] * 1.9, box=box)
        elif patterns:
            panel(m, rng, pal, p, q, z0, z1, o * 0.2, patterns[k % len(patterns)], wood)


def quoins(m, rng, pal, x, y, z0, z1, col, size=1.5):
    """Alternating corner stones."""
    z, k = z0, 0
    while z < z1 - 0.3:
        h = min(z1 - z, rng.uniform(0.95, 1.25))
        a, b = (size * 1.25, size * 0.85) if k % 2 else (size * 0.85, size * 1.25)
        m.box((x, y, z + h / 2), (a, b, h - 0.06), "Rock", vary(rng, mul(col, 1.08), 0.1), bevel=0.12, jitter=0.03, rng=rng)
        z += h
        k += 1


def woodpile(m, rng, pal, x, y, z, w, rows=4, face=0):
    W = M()
    for r in range(rows):
        n = int(w / 0.8) - r % 2
        for k in range(n):
            W.tube([(-w / 2 + 0.45 + k * 0.8 + (r % 2) * 0.4, -0.9 + rng.uniform(-0.1, 0.1), 0.38 + r * 0.68), (-w / 2 + 0.45 + k * 0.8 + (r % 2) * 0.4, 0.9 + rng.uniform(-0.1, 0.1), 0.38 + r * 0.68)], [0.38, 0.38], "Bark", vary(rng, mul(pal["wood"], 0.9), 0.15), n=7)
    for s in (-1, 1):
        W.box((s * (w / 2 + 0.2), 0, rows * 0.4), (0.25, 0.25, rows * 0.85), "Wood", pal["wood"])
    m.merge(W, Matrix.Translation((x, y, z)) @ rotz(face))


def pot(m, rng, pal, x, y, z):
    m.tube([(x, y, z), (x, y, z + 0.9), (x, y, z + 1.05)], [0.42, 0.62, 0.66], "Brick", (0.4, 0.16, 0.09), n=9)
    for k in range(6):
        m.ball((x + rng.uniform(-0.35, 0.35), y + rng.uniform(-0.35, 0.35), z + 1.2 + rng.uniform(0, 0.4)), rng.uniform(0.2, 0.32), "Grass", vary(rng, pal["foliage"], 0.2), sub=1)
        m.ball((x + rng.uniform(-0.45, 0.45), y + rng.uniform(-0.45, 0.45), z + 1.5 + rng.uniform(0, 0.4)), 0.15, "SmoothPlastic", vary(rng, rng.choice([(0.8, 0.12, 0.16), (0.9, 0.6, 0.1), (0.85, 0.4, 0.6)]), 0.1), sub=1)


def sign(m, rng, pal, p, emblem, col):
    """A board hanging from a wrought bracket, its emblem in relief."""
    x, y, z = p
    beam(m, rng, (x, y, z), (x, y + 3.0, z), 0.2, 0.2, IRON)
    m.tube([(x, y + 0.2, z - 1.4), (x, y + 1.0, z - 0.6), (x, y + 2.2, z - 0.1)], [0.09, 0.09, 0.07], "Metal", IRON, n=5)
    for dy in (1.1, 2.6):
        m.cyl((x, y + dy, z - 0.45), 0.04, 0.8, "Metal", IRON, n=5)
    m.box((x, y + 1.85, z - 1.95), (0.26, 2.3, 2.1), "WoodPlanks", mul(pal["wood"], 1.2), bevel=0.1)
    for s in (-1, 1):
        if emblem == "bread":
            m.ball((x + s * 0.16, y + 1.85, z - 1.95), 0.75, "SmoothPlastic", (0.75, 0.45, 0.16), sub=2, squash=(0.25, 1, 0.55))
        elif emblem == "mug":
            m.cyl((x + s * 0.18, y + 1.8, z - 2.0), 0.5, 1.1, "SmoothPlastic", (0.8, 0.58, 0.2), n=10)
            m.ball((x + s * 0.18, y + 1.8, z - 1.4), 0.5, "SmoothPlastic", (0.92, 0.9, 0.84), sub=2, squash=(1, 1, 0.4))
        elif emblem == "anvil":
            m.box((x + s * 0.18, y + 1.85, z - 1.7), (0.2, 1.4, 0.42), "Metal", (0.2, 0.2, 0.22), bevel=0.06)
            m.box((x + s * 0.18, y + 1.85, z - 2.25), (0.2, 0.6, 0.8), "Metal", (0.2, 0.2, 0.22), taper=0.7)
        else:
            m.ball((x + s * 0.16, y + 1.85, z - 1.95), 0.6, "SmoothPlastic", col, sub=2, squash=(0.25, 1, 1))


def lantern(m, p, s=1.0):
    x, y, z = p
    m.box((x, y, z), (0.62 * s, 0.62 * s, 0.9 * s), "Glow", GLASS)
    for a in (-1, 1):
        for b in (-1, 1):
            m.box((x + a * 0.32 * s, y + b * 0.32 * s, z), (0.1 * s, 0.1 * s, 1.0 * s), "Metal", IRON)
    m.box((x, y, z + 0.62 * s), (0.95 * s, 0.95 * s, 0.34 * s), "Metal", IRON, taper=0.3)
    m.box((x, y, z - 0.52 * s), (0.8 * s, 0.8 * s, 0.14 * s), "Metal", IRON)


# ------------------------------------------------------------------ houses
# an architecture style of the Style Bible, said in the vocabulary of the house builder
LOOKS = {
    "timber_frame": {}, "medieval_cottage": {"lower": ["rubble", "plaster"], "roof": ["thatch", "tile", "thatch"]},
    "gothic": {"lower": ["masonry"], "upper": "masonry", "roof": ["slate"], "pitch": 1.45, "shutter": (0.05, 0.05, 0.06), "dull": 0.6},
    "nordic": {"lower": ["rubble", "plank"], "upper": "plank", "roof": ["plank", "thatch"], "pitch": 1.25, "shutter": (0.12, 0.2, 0.24)},
    "stone_hut": {"lower": ["rubble"], "upper": "rubble", "roof": ["thatch"], "pitch": 1.1, "single": True},
    "victorian": {"lower": ["brick"], "upper": "brick", "roof": ["slate"], "pitch": 1.25, "shutter": (0.1, 0.12, 0.14)},
    "shack": {"lower": ["plank"], "upper": "plank", "roof": ["plank", "metal"], "pitch": 0.7, "single": True, "dull": 0.8},
    "western_facade": {"lower": ["plank"], "upper": "plank", "roof": ["plank"], "pitch": 0.6, "false_front": True},
}
LOOK = {"now": {}}


TINTS = [(1, 1, 1), (1.02, 0.9, 0.7), (1.0, 0.82, 0.72), (0.84, 0.9, 0.78), (1.08, 1.06, 1.0), (0.82, 0.86, 0.92)]
SHUTTERS = [None, (0.1, 0.2, 0.13), (0.1, 0.17, 0.28), (0.3, 0.19, 0.1), (0.34, 0.28, 0.14)]


def house(rng, pal, size, variant, fn="home"):
    m = M()
    W, D = max(13.0, size[0] * 0.84), max(11.5, size[1] * 0.8)
    two = size[2] > 15 or W > 16
    if fn == "home" and variant % 5 == 3:
        two = False  # a cottage, low under a thatch
    wood = vary(rng, pal["wood"], 0.12)
    tint = TINTS[variant % len(TINTS)]
    plaster = vary(rng, tuple(min(0.9, a * b) for a, b in zip(pal["wall"], tint)), 0.05)
    local = dict(pal)
    local["wood"] = wood
    sh = SHUTTERS[(variant * 2 + (3 if fn != "home" else 0)) % len(SHUTTERS)]
    local["accent"] = sh or pal["accent"]
    pal = local
    stone = vary(rng, pal["stone"], 0.06)
    look = LOOK["now"]
    if look.get("shutter"):
        pal["accent"] = look["shutter"]
    if look.get("single"):
        two = False
    lower = ("plaster", "rubble", "masonry", "plaster", "rubble")[variant % 5] if fn != "smith" else "masonry"
    kind = "thatch" if (fn in ("home", "farm") and variant % 5 == 3) or (fn == "farm" and variant % 2) else ("slate" if variant % 4 == 2 else "tile")
    rcol = {"thatch": (0.5, 0.37, 0.18), "slate": mix(mul(pal["stone"], 0.62), pal["roof"], 0.25), "tile": vary(rng, pal["roof"], 0.14)}[kind]
    wing = two and (fn in ("inn", "hall") or variant % 3 == 1)
    y0 = -1.0 if wing else 0.0
    base, f1 = 1.5, 9.6
    if look.get("lower"):
        lower = look["lower"][variant % len(look["lower"])]
    if look.get("roof"):
        kind = look["roof"][variant % len(look["roof"])]
        rcol = {"thatch": (0.46, 0.35, 0.18), "slate": mix(mul(pal["stone"], 0.5), pal["roof"], 0.2), "plank": mul(wood, 1.05), "metal": (0.34, 0.3, 0.28)}.get(kind, rcol)
    brick = vary(rng, (0.4, 0.18, 0.12), 0.14)
    boards = vary(rng, mul(mix(wood, (0.4, 0.38, 0.35), look.get("dull", 0.0) * 0.6), 1.25), 0.1)
    skins = {"plaster": ("Concrete", plaster), "rubble": ("Rubble", stone), "masonry": ("Slate", mul(stone, 1.05)), "brick": ("Brick", brick), "plank": ("WoodPlanks", boards)}
    g_mat, g_col = skins[lower]
    u_kind = look.get("upper")
    u_mat, u_col = skins[u_kind or "plaster"]
    B = M()

    # plinth: battered courses, then the floor
    for k in range(2):
        for a, b in (((-W / 2, -D / 2), (W / 2, -D / 2)), ((W / 2, -D / 2), (W / 2, D / 2)), ((W / 2, D / 2), (-W / 2, D / 2)), ((-W / 2, D / 2), (-W / 2, -D / 2))):
            stone_course(B, rng, a, b, -0.4 + k * 0.95, 0.98, 1.3 - k * 0.2, mul(stone, 0.95), 2.2, mat="Rock")
    B.box((0, 0, -2.6), (W + 0.8, D + 0.8, 5.2), "Rubble", mul(stone, 0.85))
    B.box((0, 0, base - 0.3), (W - 0.4, D - 0.4, 0.6), "WoodPlanks", mul(wood, 1.25))
    # ground floor with a real door and window openings
    dw, dh, win = 4.2, 7.4, (2.2, 2.9)
    wx = W * 0.31
    shop = fn in ("shop", "inn")
    openings = [(W / 2 - dw / 2, W / 2 + dw / 2, base, base + dh)]
    big = (W * 0.3, 3.8) if shop else win
    for s in (-1, 1):
        u = W / 2 + s * wx
        openings.append((u - big[0] / 2, u + big[0] / 2, base + 2.6, base + 2.6 + big[1]))
    wall(B, (W / 2, D / 2), (-W / 2, D / 2), base, f1, 0.6, g_mat, g_col, openings)
    wall(B, (-W / 2, -D / 2), (W / 2, -D / 2), base, f1, 0.6, g_mat, g_col)
    for s in (-1, 1):
        wall(B, (s * W / 2, -D / 2), (s * W / 2, D / 2), base, f1, 0.6, g_mat, g_col)
    door(B, rng, pal, (0, D / 2 + 0.12, base), 90, dw, dh)
    for s in (-1, 1):
        window(B, rng, pal, (s * wx, D / 2 + 0.22, base + 2.6 + big[1] / 2), 90, *big, shutters=not shop, box=not shop)
        if shop:  # counter under the window
            B.box((s * wx, D / 2 + 1.1, base + 2.35), (big[0] + 1.0, 1.7, 0.28), "WoodPlanks", mul(wood, 1.3), bevel=0.06)
            for k in (-1, 1):
                beam(B, rng, (s * wx + k * big[0] * 0.45, D / 2 + 0.4, base + 1.0), (s * wx + k * big[0] * 0.45, D / 2 + 1.6, base + 2.2), 0.24, 0.24, wood)
            for _ in range(6):
                B.ball((s * wx + rng.uniform(-0.42, 0.42) * big[0], D / 2 + 1.1 + rng.uniform(-0.45, 0.45), base + 2.72), rng.uniform(0.24, 0.36), "SmoothPlastic", vary(rng, rng.choice([(0.7, 0.1, 0.06), (0.82, 0.5, 0.1), (0.3, 0.45, 0.1), (0.72, 0.46, 0.2)]), 0.12), sub=2, squash=(1, 1, 0.85))
    furnish(B, rng, pal, W, D, base)
    if lower == "plaster":
        bays = max(3, int(D / 4.5))
        for s in (-1, 1):
            frame(B, rng, pal, (s * W / 2, -D / 2), (s * W / 2, D / 2), base, f1, wood, bays, ["brace", "post", "brace2"], (s, 0, 0), windows=(bays // 2,), box=False)
        n = max(3, int(W / 4.6))
        frame(B, rng, pal, (W / 2, -D / 2), (-W / 2, -D / 2), base, f1, wood, n, ["brace", "brick" if variant % 2 else "post", "brace2"], (0, -1, 0), windows=(n // 2,), box=False)
        for s in (-1, 1):
            beam(B, rng, (s * W / 2, D / 2 + 0.16, base), (s * W / 2, D / 2 + 0.16, f1), 0.7, 0.7, wood)
            beam(B, rng, (s * (dw / 2 + 1.1), D / 2 + 0.16, base), (s * (dw / 2 + 1.1), D / 2 + 0.16, f1), 0.5, 0.5, wood)
        beam(B, rng, (-W / 2, D / 2 + 0.16, f1 - 0.25), (W / 2, D / 2 + 0.16, f1 - 0.25), 0.6, 0.6, wood)
    else:
        for sx in (-1, 1):
            for sy in (-1, 1):
                quoins(B, rng, pal, sx * (W / 2 - 0.1), sy * (D / 2 - 0.1), base - 0.1, f1, stone)
        for s in (-1, 1):
            window(B, rng, pal, (s * (W / 2 + 0.25), D * 0.05, base + 4.6), 0 if s > 0 else 180, *win, box=False)
            window(B, rng, pal, (s * W * 0.26, -D / 2 - 0.25, base + 4.6), 270, *win, box=False)
        for a, b in (((-W / 2, D / 2 + 0.2), (W / 2, D / 2 + 0.2)), ((-W / 2, -D / 2 - 0.2), (W / 2, -D / 2 - 0.2))):
            beam(B, rng, (*a, f1 - 0.2), (*b, f1 - 0.2), 0.55, 0.6, wood)
    # upper floor: jettied on carved brackets, every bay its own pattern
    w, d, top = W, D, f1
    if two:
        jet = 1.0 if lower == "plaster" or variant % 2 else 0.35
        f2 = f1 + 7.4
        w, d = W + jet * 2, D + jet * 2
        B.box((0, 0, f1 + 0.1), (w - 0.1, d - 0.1, 0.5), "WoodPlanks", mul(wood, 0.85))
        n = max(4, int(w / 2.4))
        if jet > 0.5:
            for k in range(n):
                x = -w / 2 + 1.0 + k * (w - 2.0) / (n - 1)
                for sy in (-1, 1):
                    B.box((x, sy * (d / 2 - 0.5), f1 - 0.22), (0.5, 1.9, 0.6), "Wood", vary(rng, wood, 0.12), bevel=0.1)
                    if k % 2 == 0:
                        beam(B, rng, (x, sy * (D / 2 + 0.1), f1 - 2.2), (x, sy * (d / 2 + 0.1), f1 - 0.4), 0.4, 0.4, wood)
        for sy in (-1, 1):
            wall(B, (-w / 2, sy * d / 2), (w / 2, sy * d / 2), f1 + 0.3, f2, 0.5, u_mat, u_col)
        for sx in (-1, 1):
            wall(B, (sx * w / 2, -d / 2), (sx * w / 2, d / 2), f1 + 0.3, f2, 0.5, u_mat, u_col)
            if u_kind in ("masonry", "rubble", "brick"):
                for sy in (-1, 1):
                    quoins(B, rng, pal, sx * (w / 2 - 0.1), sy * (d / 2 - 0.1), f1 + 0.4, f2, stone)
        n = max(3, int(w / 4.4))
        pats = [["x", "chevron", "brace"], ["k", "post", "x"], ["brace", "brick", "brace2"], ["chevron", "chevron", "post"]][variant % 4] if not u_kind else []
        balcony = fn in ("inn", "hall") or (fn == "shop" and variant % 2 == 0)
        wins = tuple(k for k in range(n) if (k + variant) % 2 == 0)
        frame(B, rng, pal, (w / 2, d / 2), (-w / 2, d / 2), f1 + 0.35, f2, wood, n, pats, (0, 1, 0), windows=wins, box=not balcony)
        frame(B, rng, pal, (-w / 2, -d / 2), (w / 2, -d / 2), f1 + 0.35, f2, wood, n, pats[::-1], (0, -1, 0), windows=(n // 2,), box=False)
        bays = max(3, int(d / 4.4))
        for s in (-1, 1):
            frame(B, rng, pal, (s * w / 2, -d / 2 * s), (s * w / 2, d / 2 * s), f1 + 0.35, f2, wood, bays, pats, (s, 0, 0), windows=(bays // 2,), box=False)
        if balcony:
            bl = w * 0.86
            for k in range(6):
                B.box((0, d / 2 + 0.5 + k * 0.5, f1 + 0.45), (bl, 0.48, 0.22), "WoodPlanks", vary(rng, mul(wood, 1.15), 0.12))
            for k in range(5):
                x = -bl / 2 + bl * k / 4
                beam(B, rng, (x, d / 2 + 0.2, f1 - 1.6), (x, d / 2 + 3.0, f1 + 0.2), 0.36, 0.36, wood)
                beam(B, rng, (x, d / 2 + 3.1, f1 + 0.4), (x, d / 2 + 3.1, f1 + 3.4), 0.34, 0.34, wood)
            beam(B, rng, (-bl / 2, d / 2 + 3.1, f1 + 3.3), (bl / 2, d / 2 + 3.1, f1 + 3.3), 0.36, 0.3, wood)
            beam(B, rng, (-bl / 2, d / 2 + 3.1, f1 + 1.2), (bl / 2, d / 2 + 3.1, f1 + 1.2), 0.24, 0.2, wood)
            for k in range(int(bl / 0.8)):
                B.box((-bl / 2 + 0.4 + k * 0.8, d / 2 + 3.1, f1 + 2.2), (0.3, 0.12, 2.0), "WoodPlanks", vary(rng, mul(pal["accent"], 1.0), 0.1), bevel=0.04)
        top = f2
    pitch = look.get("pitch", 0) * rng.uniform(0.95, 1.05) or (rng.uniform(1.0, 1.2) if kind == "thatch" else rng.uniform(0.92, 1.1))
    ridge = roof(B, rng, pal, w, d, top, pitch, kind, rcol, over=1.7 if kind != "thatch" else 2.0, sag=rng.uniform(0.25, 0.6), wall_mat=u_mat, wall_col=u_col, timber=not u_kind or u_kind == "plank", hip=0.0)
    if look.get("false_front"):
        fh = ridge - top + 2.2
        B.box((0, d / 2 + 0.5, top + fh / 2 - 1.2), (w + 1.2, 0.5, fh), "WoodPlanks", boards)
        B.box((0, d / 2 + 0.6, top + fh - 1.1), (w + 2.0, 0.9, 0.6), "Wood", wood, bevel=0.08)
        B.box((0, d / 2 + 0.85, top + fh * 0.5 - 0.8), (w * 0.66, 0.2, 1.8), "WoodPlanks", pal["accent"], bevel=0.06)
    if wing:
        side = 1 if variant % 2 else -1
        ww, wd = w * 0.42, 3.4
        cx = side * (w / 2 - ww / 2)
        wz0 = f1 if fn != "hall" else base
        wall(B, (cx - ww / 2, d / 2 + wd), (cx + ww / 2, d / 2 + wd), f1 + 0.3, top, 0.5, u_mat, u_col)
        for s in (-1, 1):
            wall(B, (cx + s * ww / 2, d / 2 - 0.2), (cx + s * ww / 2, d / 2 + wd), f1 + 0.3, top, 0.5, u_mat, u_col)
            beam(B, rng, (cx + s * (ww / 2 - 0.4), d / 2 + wd - 0.4, -0.4), (cx + s * (ww / 2 - 0.4), d / 2 + wd - 0.4, f1), 0.8, 0.8, wood)
            B.box((cx + s * (ww / 2 - 0.4), d / 2 + wd - 0.4, 0.2), (1.4, 1.4, 1.2), "Rock", stone, bevel=0.15)
            beam(B, rng, (cx + s * (ww / 2 - 0.4), d / 2 + wd - 0.4, f1 - 2.4), (cx + s * (ww / 2 - 2.2), d / 2 + wd - 0.4, f1 - 0.2), 0.4, 0.4, wood)
        B.box((cx, d / 2 + wd / 2, f1 + 0.1), (ww, wd + 0.4, 0.5), "WoodPlanks", mul(wood, 0.8))
        frame(B, rng, pal, (cx + ww / 2, d / 2 + wd), (cx - ww / 2, d / 2 + wd), f1 + 0.35, top, wood, 3 if ww > 8 else 2, ["x", "brace"] if not u_kind else [], (0, 1, 0), windows=(1,) if ww > 8 else (0,), shutters=False)
        roof(B, rng, pal, wd + d * 0.5, ww, top, pitch, kind, rcol, over=1.0, sag=0.1, axis="y", x=cx, y=d / 2 + wd / 2 - d * 0.25, wall_mat=u_mat, wall_col=u_col)
    elif kind != "thatch" and (two or variant % 2 == 0):
        k = 2 if w > 17 else 1
        for i in range(k):
            x = (i - (k - 1) / 2) * w * 0.46 + (0 if k > 1 else w * 0.16 * (1 if variant % 2 else -1))
            dormer(B, rng, pal, (x, d * 0.34, top + d * 0.15 * pitch - 0.4), 3.6, 3.2, d * 0.3, kind, rcol, plaster)
    chimney(B, rng, pal, (w * 0.3 * (1 if variant % 2 else -1), -d * 0.16), 2.5, top, ridge + 2.0)
    if fn in ("inn", "smith", "hall"):
        chimney(B, rng, pal, (-w * 0.3 * (1 if variant % 2 else -1), -d * 0.22), 2.2, top, ridge + 1.2)
    front = d / 2 if two else D / 2
    # what the door says about the house
    if fn == "home" and variant % 3 != 1:
        for s in (-1, 1):
            beam(B, rng, (s * 2.9, D / 2 + 3.0, 0.2), (s * 2.9, D / 2 + 3.0, base + 7.6), 0.5, 0.5, wood)
            beam(B, rng, (s * 2.9, D / 2 + 3.0, base + 6.0), (s * 1.4, D / 2 + 3.0, base + 7.6), 0.32, 0.32, wood)
            B.box((s * 2.9, D / 2 + 3.0, 0.3), (1.0, 1.0, 1.0), "Rock", stone, bevel=0.12)
        roof(B, rng, pal, 4.2, 5.8, base + 7.5, 0.7, "tile" if kind == "thatch" else kind, rcol, over=0.5, sag=0.05, flare=0.1, axis="y", y=D / 2 + 1.7, timber=False, wall_col=plaster)
    if fn == "shop":
        aw = W * 0.92
        n = max(6, int(aw / 1.3))
        for k in range(n):
            c = pal["accent"] if k % 2 else (0.8, 0.76, 0.66)
            B.box((-aw / 2 + aw * (k + 0.5) / n, D / 2 + 2.4, f1 - 1.5), (aw / n - 0.02, 4.4, 0.16), "Fabric", vary(rng, c, 0.05), rot=(-17, 0, 0))
            B.box((-aw / 2 + aw * (k + 0.5) / n, D / 2 + 4.52, f1 - 2.55), (aw / n - 0.06, 0.1, 0.9), "Fabric", vary(rng, c, 0.05), bevel=0.02)
        for s in (-1, 1):
            beam(B, rng, (s * (aw / 2 - 0.3), D / 2 + 4.4, 0), (s * (aw / 2 - 0.3), D / 2 + 4.4, f1 - 2.2), 0.36, 0.36, wood)
        sign(B, rng, pal, (W / 2 + 0.2, D / 2 - 0.4, f1 + 3.0), ("bread", "mug", "coin")[variant % 3], pal["accent"])
    if fn == "inn":
        sign(B, rng, pal, (-W / 2 + 0.6, D / 2 + 0.6, f1 - 0.6), "mug", pal["accent"])
        for s in (-1, 1):
            B.box((s * W * 0.32, D / 2 + 4.0, 0.9), (3.0, 1.0, 0.2), "WoodPlanks", mul(wood, 1.2), bevel=0.05)
            for k in (-1, 1):
                B.box((s * W * 0.32 + k * 1.1, D / 2 + 4.0, 0.4), (0.25, 0.8, 0.9), "Wood", wood)
    if fn == "smith":
        # open forge under a lean-to
        sx = W / 2
        for y in (-D * 0.36, D * 0.36):
            beam(B, rng, (sx + 5.4, y, -0.2), (sx + 5.4, y, 7.4), 0.6, 0.6, wood)
            beam(B, rng, (sx + 0.2, y, 8.8), (sx + 6.2, y, 7.2), 0.4, 0.4, wood)
        for k in range(9):
            y = -D * 0.46 + D * 0.92 * (k + 0.5) / 9
            B.box((sx + 3.1, y, 8.2), (6.8, D * 0.92 / 9 - 0.04, 0.24), "WoodPlanks", vary(rng, mul(wood, 1.1), 0.12), rot=(0, 14, 0))
        B.box((sx + 3.0, -D * 0.2, 1.3), (3.2, 3.2, 2.6), "Rubble", stone, bevel=0.15)
        B.box((sx + 3.0, -D * 0.2, 2.75), (2.2, 2.2, 0.3), "Glow", (1.0, 0.32, 0.06))
        B.box((sx + 3.0, D * 0.2, 1.0), (1.0, 1.0, 2.0), "Wood", wood)
        B.box((sx + 3.0, D * 0.2, 2.3), (0.8, 2.2, 0.6), "Metal", (0.16, 0.16, 0.18), bevel=0.1)
        sign(B, rng, pal, (-W / 2 + 0.8, D / 2 + 0.4, f1 - 0.8), "anvil", pal["accent"])
    if fn == "farm":
        # a timber barn bay against the side
        sx = -W / 2
        bw = 6.0
        for y in (-D * 0.4, D * 0.4):
            beam(B, rng, (sx - bw, y, -0.3), (sx - bw, y, 6.2), 0.6, 0.6, wood)
        for k in range(8):
            y = -D * 0.4 + D * 0.8 * (k + 0.5) / 8
            B.box((sx - bw, y, 3.0), (0.25, D * 0.8 / 8 - 0.05, 6.4), "WoodPlanks", vary(rng, mul(wood, 1.15), 0.14))
        n = 8
        for k in range(n):
            y = -D * 0.46 + D * 0.92 * (k + 0.5) / n
            B.box((sx - bw / 2, y, 7.5), (bw + 1.6, D * 0.92 / n - 0.03, 0.26), "Thatch" if kind == "thatch" else "WoodPlanks", vary(rng, rcol if kind == "thatch" else mul(wood, 1.05), 0.1), rot=(0, -18, 0))
        for k in range(5):
            B.box((sx - bw / 2 + rng.uniform(-1.5, 1.5), rng.uniform(-D * 0.3, D * 0.3), 0.9 + (k // 3) * 1.6), (2.2, 1.5, 1.5), "Thatch", vary(rng, (0.62, 0.47, 0.2), 0.1), rot=(0, 0, rng.uniform(-20, 20)), bevel=0.15)
    # life around the walls
    if variant % 2 == 0 or fn == "farm":
        woodpile(B, rng, pal, -W * 0.2, -D / 2 - 1.5, -0.1, 5.0, 4)
    if variant % 3 != 2:
        climbing(B, rng, pal, Vector((W / 2 + 0.34, -D / 2 + 0.4, 0.2)), Vector((0, 1, 0)), D * rng.uniform(0.35, 0.6), rng.uniform(6, 11), Vector((1, 0, 0)))
    if variant % 4 == 0:
        climbing(B, rng, pal, Vector((-W / 2 + 0.2, D / 2 + 0.34, 0.2)), Vector((1, 0, 0)), W * 0.18, 7, Vector((0, 1, 0)))
    for s in (-1, 1):
        if rng.random() < 0.75 and fn in ("home", "inn"):
            pot(B, rng, pal, s * (dw / 2 + 1.3), D / 2 + 1.7, 0.0)
    beam(B, rng, (dw / 2 + 1.2, D / 2 + 0.3, base + 6.9), (dw / 2 + 1.2, D / 2 + 1.5, base + 6.9), 0.18, 0.18, IRON)
    lantern(B, (dw / 2 + 1.2, D / 2 + 1.4, base + 6.1))
    m.merge(B, Matrix.Translation((0, y0, 0)))
    return m


# ------------------------------------------------------------------ fortification
def loop_window(m, p, face, col, h=3.4):
    """Cross-shaped arrow loop in a splayed stone surround."""
    L = M()
    L.box((0, 0.02, 0), (0.42, 0.3, h), "SmoothPlastic", (0.01, 0.01, 0.014))
    L.box((0, 0.02, h * 0.1), (1.35, 0.3, 0.42), "SmoothPlastic", (0.01, 0.01, 0.014))
    for s in (-1, 1):
        L.box((s * 0.62, 0.06, -h * 0.28), (0.7, 0.5, h * 0.5), "Rock", mul(col, 1.1), bevel=0.1)
        L.box((s * 0.62, 0.06, h * 0.38), (0.7, 0.5, h * 0.34), "Rock", mul(col, 1.1), bevel=0.1)
        L.box((s * 1.05, 0.06, h * 0.1), (0.5, 0.5, 0.75), "Rock", mul(col, 1.1), bevel=0.1)
    L.box((0, 0.08, h * 0.5 + 0.28), (2.0, 0.6, 0.5), "Rock", mul(col, 1.15), bevel=0.1)
    L.box((0, 0.1, -h * 0.5 - 0.22), (2.0, 0.7, 0.36), "Rock", mul(col, 1.15), bevel=0.1)
    m.merge(L, Matrix.Translation(Vector(p)) @ rotz(face - 90))


def merlons(m, rng, a, b, z, col, w=2.2, gap=1.5, h=2.4, t=1.2, loops=True):
    a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    L = (b - a).length
    if L < 1.5:
        return
    n = max(1, int(round(L / (w + gap))))
    d = (b - a).normalized()
    ang = math.degrees(math.atan2(d.y, d.x))
    mid = (a + b) / 2
    m.box((mid.x, mid.y, z + 0.5), (L, t, 1.0), "Slate", col, rot=(0, 0, ang))
    for k in range(n):
        c = a + d * ((k + 0.5) * L / n)
        ww = L / n - gap
        broken = rng.random() < 0.05
        hh = h * (0.55 if broken else 1)
        m.box((c.x, c.y, z + 1.0 + hh / 2), (ww, t, hh), "Slate", vary(rng, col, 0.06), rot=(0, 0, ang), bevel=0.06)
        if not broken:
            m.box((c.x, c.y, z + 1.0 + hh + 0.16), (ww + 0.3, t + 0.36, 0.34), "Rock", vary(rng, mul(col, 1.12), 0.06), rot=(0, 0, ang), bevel=0.1)
            m.box((c.x, c.y, z + 1.0 + hh + 0.42), (ww * 0.7, t * 0.6, 0.3), "Rock", vary(rng, mul(col, 1.1), 0.06), rot=(0, 0, ang), taper=0.4)
        if loops and k % 2 == 0 and not broken:
            nrm = Vector((-d.y, d.x, 0))
            for s in (-1, 1):
                q = c + nrm * s * (t / 2)
                m.box((q.x, q.y, z + 1.0 + hh * 0.5), (0.28, 0.12, hh * 0.6), "SmoothPlastic", (0.012, 0.012, 0.016), rot=(0, 0, ang))


def curtain(m, rng, pal, a, b, z0, z1, t, col, faces=(-1, 1), machic=True, loops=0, buttress=0):
    """Curtain wall: battered talus, string courses, machicolations on arched corbels, wall-walk."""
    A, B = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    L = (B - A).length
    d = (B - A).normalized()
    n = Vector((-d.y, d.x, 0))
    ang = math.degrees(math.atan2(d.y, d.x))
    mid = (A + B) / 2
    H = z1 - z0
    shade = lambda q: mul(col, 0.72 + 0.32 * min(1, max(0, (q.z - z0) / (H * 0.5))) + noise.noise(q * 0.16) * 0.1)
    m.box((mid.x, mid.y, (z0 + z1) / 2), (L, t, H), "Slate", shade, rot=(0, 0, ang))
    m.box((mid.x, mid.y, z1 + 0.06), (L, t - 0.6, 0.16), "Cobblestone", mul(col, 0.8), rot=(0, 0, ang))
    for s in faces:
        f = mid + n * s * (t / 2)
        m.box((f.x, f.y, z0 + 2.2), (L, 2.2, 4.4), "Rubble", lambda q: mul(col, 0.62 + 0.06 * (q.z - z0)), rot=(0, 0, ang), taper=0.82)
        m.box((f.x + n.x * s * 0.1, f.y + n.y * s * 0.1, z0 + 4.5), (L, 0.9, 0.5), "Rock", mul(col, 1.05), rot=(0, 0, ang), bevel=0.14)
        if machic:
            k = max(2, int(L / 2.3))
            for i in range(k + 1):
                c = A + d * (i * L / k) + n * s * (t / 2 + 0.35)
                for step, (out, hh) in enumerate(((0.5, 0.7), (0.9, 0.7), (1.3, 0.6))):
                    q = A + d * (i * L / k) + n * s * (t / 2 + out / 2)
                    m.box((q.x, q.y, z1 - 2.5 + step * 0.66), (0.7, out, hh), "Rock", vary(rng, col, 0.08), rot=(0, 0, ang), bevel=0.1)
            for i in range(k):  # little arches between the corbels
                c = A + d * ((i + 0.5) * L / k) + n * s * (t / 2 + 0.62)
                m.box((c.x, c.y, z1 - 0.78), (L / k - 0.5, 1.0, 0.36), "Rock", mul(col, 0.8), rot=(0, 0, ang), bevel=0.1)
            f2 = mid + n * s * (t / 2 + 0.62)
            m.box((f2.x, f2.y, z1 - 0.3), (L, 1.4, 0.75), "Slate", mul(col, 1.05), rot=(0, 0, ang), bevel=0.1)
        for i in range(loops):
            c = A + d * ((i + 0.5) * L / loops) + n * s * (t / 2 + 0.05)
            loop_window(m, (c.x, c.y, z0 + H * 0.56), math.degrees(math.atan2(n.y * s, n.x * s)), col)
        for i in range(buttress):
            c = A + d * ((i + 0.5) * L / buttress) + n * s * (t / 2 + 0.9)
            m.box((c.x, c.y, z0 + H * 0.36), (2.0, 2.4, H * 0.72), "Slate", mul(col, 0.95), rot=(0, 0, ang), bevel=0.12)
            m.box((c.x, c.y, z0 + H * 0.72 + 0.6), (2.2, 2.2, 1.4), "Rock", mul(col, 1.08), rot=(0, 0, ang), taper=0.3)


def spire(m, rng, pal, c, r, h, col, n=20, flare=0.16, dormers=0):
    """Conical roof in tiled rings, flared at the eave, with a finial."""
    x, y, z = c
    rows = max(6, int(h / 1.15))
    prof = lambda t: r * ((1 - t) + flare * max(0, (0.22 - t) / 0.22) ** 2)
    for i in range(rows):
        t0, t1 = i / rows, (i + 1.12) / rows
        r0, r1 = prof(t0) + 0.2, max(0.06, prof(min(1, t1)) + 0.04)
        z0, z1 = z + h * t0 - (flare * r * 0.25 if i == 0 else 0), z + h * min(1, t1)
        for k in range(n):
            a0, a1 = k / n * math.tau, (k + 1) / n * math.tau
            p = [Vector((x + math.cos(a0) * r0, y + math.sin(a0) * r0, z0)), Vector((x + math.cos(a1) * r0, y + math.sin(a1) * r0, z0)), Vector((x + math.cos(a1) * r1, y + math.sin(a1) * r1, z1)), Vector((x + math.cos(a0) * r1, y + math.sin(a0) * r1, z1))]
            low = [q + Vector((0, 0, -0.2)) for q in p[:2]]
            w = math.tau * r0 / n
            u0 = k * w + i * 2.1
            m.add(p + low, [(0, 1, 2, 3), (4, 5, 1, 0)], "Roof", vary(rng, mul(col, 0.92 + 0.16 * t0), 0.06), smooth=False, uv=[(u0, i), (u0 + w, i), (u0 + w, i + 1.1), (u0, i + 1.1), (u0, i - 0.15), (u0 + w, i - 0.15)])
    m.tube([(x, y, z - 0.1), (x, y, z + 0.05)], [r * 1.12, r * 1.12], "WoodPlanks", mul(pal["wood"], 0.6), n=n, smooth=False)
    for k in range(n):
        a = (k + 0.5) / n * math.tau
        m.box((x + math.cos(a) * r * 1.0, y + math.sin(a) * r * 1.0, z - 0.3), (1.1, 0.28, 0.34), "Wood", mul(pal["wood"], 0.85), rot=(0, 0, math.degrees(a)))
    m.tube([(x, y, z + h - 0.6), (x, y, z + h + 0.7), (x, y, z + h + 1.1)], [0.3, 0.2, 0.1], "Metal", (0.2, 0.2, 0.21), n=8)
    m.ball((x, y, z + h + 1.3), 0.36, "Metal", (0.62, 0.44, 0.1), sub=2)
    for k in range(dormers):
        a = k / dormers * math.tau + 0.5
        rr = prof(0.28)
        D = M()
        dormer(D, rng, pal, (0, 0, 0), 2.4, 2.4, 2.4, "tile", col, mul(pal["wall"], 0.95))
        m.merge(D, Matrix.Translation((x + math.cos(a) * rr, y + math.sin(a) * rr, z + h * 0.2)) @ rotz(math.degrees(a) - 90))


def tower(m, rng, pal, c, r, h, col, roof_kind="spire", n=24, levels=3, z0=-2.0, peak=2.25):
    """Round tower: battered foot, string courses, loops, machicolated crown, then battlements or a spire behind them."""
    x, y = c
    shade = lambda q: mul(col, 0.7 + 0.34 * min(1, max(0, (q.z - z0) / (h * 0.55))) + noise.noise(q * 0.14) * 0.12)
    m.tube([(x, y, z0), (x, y, 1.0), (x, y, 4.2), (x, y, h - 2.4)], [r * 1.28, r * 1.16, r, r * 0.98], "Slate", shade, n=n, smooth=False)
    m.tube([(x, y, z0), (x, y, 2.6), (x, y, 4.3)], [r * 1.31, r * 1.14, r * 1.02], "Rubble", lambda q: mul(col, 0.62 + 0.05 * max(0, q.z)), n=n, smooth=False, cap=False)
    for z in [4.4] + [h * (0.4 + 0.3 * k) for k in range(max(0, levels - 2))]:
        m.tube([(x, y, z - 0.3), (x, y, z - 0.1), (x, y, z + 0.2), (x, y, z + 0.34)], [r + 0.02, r + 0.42, r + 0.42, r + 0.02], "Rock", mul(col, 1.08), n=n, smooth=False, cap=False)
    k = n
    for i in range(k):
        a = i / k * math.tau
        for step, (out, hh) in enumerate(((0.55, 0.75), (1.0, 0.75), (1.45, 0.7))):
            m.box((x + math.cos(a) * (r - 0.2 + out / 2), y + math.sin(a) * (r - 0.2 + out / 2), h - 3.2 + step * 0.72), (out + 0.4, 0.72, hh), "Rock", vary(rng, col, 0.08), rot=(0, 0, math.degrees(a)), bevel=0.1)
    R = r + 1.25
    m.tube([(x, y, h - 1.2), (x, y, h - 1.0), (x, y, h + 0.2)], [R - 0.3, R, R], "Slate", mul(col, 1.0), n=n, smooth=False)
    m.tube([(x, y, h + 0.1), (x, y, h + 0.45)], [R + 0.22, R + 0.22], "Rock", mul(col, 1.1), n=n, smooth=False, cap=False)
    m.tube([(x, y, h + 0.2), (x, y, h + 0.3)], [R - 0.2, R - 0.2], "Cobblestone", mul(col, 0.8), n=n)
    mer = max(8, int(R * math.tau / 3.7))
    for i in range(mer):
        a = (i + 0.5) / mer * math.tau
        ww = R * math.tau / mer * 0.6
        px, py = x + math.cos(a) * (R - 0.45), y + math.sin(a) * (R - 0.45)
        m.box((px, py, h + 1.55), (1.0, ww, 2.4), "Slate", vary(rng, col, 0.06), rot=(0, 0, math.degrees(a)), bevel=0.08)
        m.box((px, py, h + 2.9), (1.4, ww + 0.36, 0.34), "Rock", vary(rng, mul(col, 1.1), 0.06), rot=(0, 0, math.degrees(a)), bevel=0.1)
    m.tube([(x, y, h), (x, y, h + 0.95)], [R - 0.05, R - 0.05], "Slate", col, n=n, smooth=False, cap=False)
    for lv in range(levels):
        z = 6.5 + (h - 13) * (lv + 0.3) / max(1, levels)
        for i in range(3):
            a = i / 3 * math.tau + lv * 0.7 + 0.5
            loop_window(m, (x + math.cos(a) * (r * 0.985), y + math.sin(a) * (r * 0.985), z), math.degrees(a), col, h=2.8)
    if roof_kind == "spire":
        # a drum set back behind the battlements carries the roof
        m.tube([(x, y, h), (x, y, h + 4.2)], [r * 0.78, r * 0.78], "Slate", mul(col, 1.02), n=n, smooth=False)
        for i in range(5):
            a = i / 5 * math.tau + 0.2
            m.box((x + math.cos(a) * r * 0.78, y + math.sin(a) * r * 0.78, h + 2.4), (0.4, 0.9, 1.9), "Glow", mul(GLASS, 0.5), rot=(0, 0, math.degrees(a)))
        spire(m, rng, pal, (x, y, h + 4.2), r * 0.95, r * peak, pal["roof"], n=n - 4)
        flag(m, rng, pal, (x, y, h + 4.2 + r * peak + 1.0), h=4.6, w=3.8)
    return h


def portcullis(m, rng, x, y, w, z0, z1):
    for k in range(int(w / 1.1) + 1):
        px = x - w / 2 + k * w / int(w / 1.1)
        m.box((px, y, (z0 + z1) / 2), (0.34, 0.34, z1 - z0), "Metal", IRON)
        m.box((px, y, z0 - 0.4), (0.3, 0.3, 0.9), "Metal", IRON, rot=(180, 0, 0), taper=0.1)
    z = z0 + 0.5
    while z < z1:
        m.box((x, y, z), (w, 0.24, 0.34), "Metal", IRON)
        z += 1.3


def gate_leaf(m, rng, pal, hinge, w, h, angle):
    G = M()
    for k in range(6):
        G.box((w * (k + 0.5) / 6, 0, h / 2), (w / 6 - 0.04, 0.5, h), "WoodPlanks", vary(rng, pal["wood"], 0.14), bevel=0.05)
    for z in (h * 0.18, h * 0.5, h * 0.82):
        G.box((w / 2, 0.28, z), (w * 0.96, 0.14, 0.5), "Metal", IRON, bevel=0.04)
        G.box((w / 2, -0.28, z), (w * 0.96, 0.14, 0.5), "Metal", IRON, bevel=0.04)
        for k in range(5):
            G.ball((w * (k + 0.5) / 5, 0.36, z), 0.14, "Metal", (0.12, 0.12, 0.13), sub=1)
    beam(G, rng, (0.2, -0.3, 0.4), (w - 0.2, -0.3, h * 0.82), 0.4, 0.2, pal["wood"])
    m.merge(G, Matrix.Translation(Vector(hinge)) @ rotz(angle))


def arch(m, rng, x, y, z, r, depth, col, n=11, w=1.4):
    for k in range(n):
        a = math.pi * (k + 0.5) / n
        key = 1.3 if k == n // 2 else 1.0
        m.box((x + math.cos(a) * r, y, z + math.sin(a) * r), (w * key, depth * (1.06 if key > 1 else 1), r * math.pi / n * 0.97), "Rock", vary(rng, mul(col, 1.1), 0.1), rot=(0, -math.degrees(a), 0), bevel=0.12)


def square_tower(m, rng, pal, c, r, h, col, roofed=False):
    """Square tower with pilaster buttresses, string courses and stepped corbels."""
    x, y = c
    m.box((x, y, (h - 12) / 2), (r * 2, r * 2, h + 12), "Slate", lambda q: mul(col, 0.74 + 0.3 * min(1, max(0, q.z / (h * 0.6)))))
    m.box((x, y, 0.4), (r * 2 + 2.4, r * 2 + 2.4, 6.4), "Rubble", mul(col, 0.78), taper=0.88)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((x + sx * r, y + sy * r, h / 2 - 1), (2.2, 2.2, h + 1), "Slate", mul(col, 1.03), bevel=0.15)
    for z in (h * 0.36, h * 0.68):
        m.box((x, y, z), (r * 2 + 0.8, r * 2 + 0.8, 0.5), "Rock", mul(col, 1.1), bevel=0.12)
    for a, b in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
        A, B = Vector((x + a[0] * r, y + a[1] * r, 0)), Vector((x + b[0] * r, y + b[1] * r, 0))
        dv = (B - A).normalized()
        nv = Vector((dv.y, -dv.x, 0))
        ang = math.degrees(math.atan2(dv.y, dv.x))
        for i in range(5):
            q = A.lerp(B, (i + 0.5) / 5)
            for step, out in enumerate((0.5, 1.0)):
                p = q + nv * (out / 2)
                m.box((p.x, p.y, h - 1.9 + step * 0.8), (0.75, out + 0.3, 0.8), "Rock", vary(rng, col, 0.08), rot=(0, 0, ang), bevel=0.1)
        q = (A + B) / 2 + nv * 0.6
        m.box((q.x, q.y, h), (r * 2 + 2.2, 1.4, 0.8), "Slate", mul(col, 1.04), rot=(0, 0, ang))
        merlons(m, rng, A + nv * 0.8 - dv * 0.6, B + nv * 0.8 + dv * 0.6, h + 0.2, col, loops=False)
        for z in (h * 0.24 + 3, h * 0.54):
            f = (A + B) / 2 + nv * 0.05
            loop_window(m, (f.x, f.y, z), math.degrees(math.atan2(nv.y, nv.x)), col, h=2.8)
    if roofed:
        roof(m, rng, pal, r * 2 - 1.6, r * 2 - 1.6, h + 0.8, 1.2, "tile", pal["roof"], over=0.3, sag=0.1, x=x, y=y, timber=False, wall_mat="Slate", wall_col=col)
    return h


def castle(rng, pal, size, variant):
    """Stronghold: talus, curtain walls with machicolations, four corner towers, twin-towered gatehouse, keep, hall and chapel."""
    m = M()
    # four ways of holding a hill: concentric, round donjon, square Norman keep, residence with steep roofs
    plan = ("concentric", "donjon", "norman", "chateau")[variant % 4]
    pal = dict(pal)
    col = vary(rng, mul(pal["stone"], {"concentric": 1.12, "donjon": 1.0, "norman": 1.18, "chateau": 1.45}[plan]), 0.04)
    if plan == "chateau":
        pal["roof"] = mix(mul(pal["stone"], 0.5), (0.12, 0.16, 0.24), 0.6)
    H, wh, th, kh, t = {"concentric": (26.0, 16.0, 25.0, 33.0, 4.0), "donjon": (26.0, 13.0, 19.0, 46.0, 4.0), "norman": (25.0, 14.5, 21.0, 40.0, 4.4), "chateau": (26.0, 11.0, 22.0, 26.0, 3.4)}[plan]
    m.box((0, 0, -0.45), (H * 2, H * 2, 1.6), "Cobblestone", mul(pal["stone"], 0.72))
    m.box((0, 0, -6.5), (H * 2 + 5.6, H * 2 + 5.6, 11.6), "Rubble", mul(col, 0.66), taper=0.95)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.tube([(sx * H, sy * H, -12), (sx * H, sy * H, -1)], [9.4, 8.2], "Rubble", mul(col, 0.62), n=24, smooth=False)
    curtain(m, rng, pal, (-H, -H), (H, -H), -1.5, wh, t, col, loops=3, buttress=2)
    for s in (-1, 1):
        curtain(m, rng, pal, (s * H, -H), (s * H, H), -1.5, wh, t, col, loops=3, buttress=2)
        curtain(m, rng, pal, (s * 10, H), (s * H, H), -1.5, wh, t, col, loops=1)
        merlons(m, rng, (s * (H + 2.1), -H + 8), (s * (H + 2.1), H - 8), wh, col)
        merlons(m, rng, (s * 13, H + 2.1), (s * (H - 7.6), H + 2.1), wh, col)
    merlons(m, rng, (-H + 8, -H - 2.1), (H - 8, -H - 2.1), wh, col)
    heights = [th, th + 4, th + 1.5, th + 7]
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        if plan == "norman":
            square_tower(m, rng, pal, (sx * H, sy * H), 6.0, heights[i], col, roofed=i == 3)
        elif plan == "donjon":
            tower(m, rng, pal, (sx * H, sy * H), 6.0, th + (i % 2) * 2, col, "flat", n=24)
        elif plan == "chateau":
            tower(m, rng, pal, (sx * H, sy * H), 5.2, heights[(i + 1) % 4], col, "spire", n=20, peak=3.4)
        else:
            tower(m, rng, pal, (sx * H, sy * H), 6.6, heights[(i + 2) % 4], col, "spire" if i != 1 else "flat", n=24)
    # gatehouse: twin towers, double arch, portcullis, gate leaves, bridge with chains
    gh = wh + 7
    for s in (-1, 1):
        if plan == "norman":
            square_tower(m, rng, pal, (s * 9.4, H + 1.6), 4.4, gh, col)
        else:
            tower(m, rng, pal, (s * 9.2, H + 1.6), 4.6, gh, col, "flat" if plan == "donjon" else "spire", n=20, levels=2, peak=3.0 if plan == "chateau" else 2.25)
        banner(m, rng, pal, (s * 9.2, H + 6.35, gh - 5), 90, 2.8, 8.5)
    m.box((0, H + 1.2, 14.5), (11, 7.4, 8.6), "Slate", col, bevel=0.1)
    merlons(m, rng, (-4.6, H + 4.7), (4.6, H + 4.7), 18.6, col, w=1.7, gap=1.2, loops=False)
    for k in range(5):
        m.box((-4 + k * 2, H + 5.2, 17.6), (0.8, 1.2, 1.2), "Rock", vary(rng, col, 0.08), bevel=0.12)
    for s in (-1, 1):
        m.box((s * 4.7, H + 1.4, 5.0), (1.8, 7.0, 11), "Slate", mul(col, 0.98), bevel=0.1)
        gate_leaf(m, rng, pal, (s * 3.8, H - 0.6, 0.5), 3.7, 9.4, 90 + s * 14 if s > 0 else 90 - 14)
    arch(m, rng, 0, H + 4.7, 7.4, 4.3, 1.2, col)
    arch(m, rng, 0, H + 2.0, 7.2, 4.2, 5.4, mul(col, 0.9))
    portcullis(m, rng, 0, H + 3.4, 7.4, 8.4, 12.6)
    S = M()
    S.box((0, 0, 0), (3.4, 0.4, 3.6), "Rock", mul(col, 1.15), bevel=0.14)
    S.box((0, 0.24, 0.1), (2.2, 0.16, 2.4), "SmoothPlastic", pal["accent"], bevel=0.1)
    S.box((0, 0.34, 0.1), (0.5, 0.1, 2.4), "Metal", (0.7, 0.5, 0.12))
    m.merge(S, Matrix.Translation((0, H + 5.0, 14.8)))
    for k in range(10):
        m.box((0, H + 6.2 + k * 1.28, 0.2), (8.6, 1.22, 0.5), "WoodPlanks", vary(rng, pal["wood"], 0.14), bevel=0.06)
    for s in (-1, 1):
        beam(m, rng, (s * 4.0, H + 5.6, -0.15), (s * 4.0, H + 18.6, -0.15), 0.6, 0.7, pal["wood"])
        m.tube([(s * 4.0, H + 5.2, 11.4), (s * 4.0, H + 11.5, 5.6), (s * 4.0, H + 17.8, 0.5)], [0.16, 0.16, 0.16], "Metal", IRON, n=6)
    if plan in ("concentric", "norman"):
        kw, ky = (19.0 if plan == "concentric" else 24.0), -9.5
        shade = lambda q: mul(col, 0.8 + 0.26 * min(1, max(0, q.z / kh)) + noise.noise(q * 0.15) * 0.1)
        m.box((0, ky, kh / 2 - 0.5), (kw, kw, kh + 1), "Slate", shade)
        m.box((0, ky, 2.2), (kw + 2.4, kw + 2.4, 5.2), "Rubble", mul(col, 0.8), taper=0.9)
        for z in (kh * 0.36, kh * 0.68):
            m.box((0, ky, z), (kw + 0.7, kw + 0.7, 0.55), "Rock", mul(col, 1.1), bevel=0.14)
        for a, b in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
            A, B = Vector((a[0] * kw / 2, ky + a[1] * kw / 2, 0)), Vector((b[0] * kw / 2, ky + b[1] * kw / 2, 0))
            dv = (B - A).normalized()
            nv = Vector((dv.y, -dv.x, 0))
            ang = math.degrees(math.atan2(dv.y, dv.x))
            for i in range(9):
                c = A.lerp(B, (i + 0.5) / 9)
                for step, out in enumerate((0.5, 0.95, 1.4)):
                    q = c + nv * (out / 2)
                    m.box((q.x, q.y, kh - 2.5 + step * 0.7), (0.75, out + 0.3, 0.72), "Rock", vary(rng, col, 0.08), rot=(0, 0, ang), bevel=0.1)
            q = (A + B) / 2 + nv * 0.75
            m.box((q.x, q.y, kh - 0.2), (kw + 1.5, 1.5, 0.9), "Slate", mul(col, 1.04), rot=(0, 0, ang))
            merlons(m, rng, A + nv * 0.95 + dv * 3, B + nv * 0.95 - dv * 3, kh, col, loops=False)
        for sx in (-1, 1):
            for sy in (-1, 1):  # bartizans
                bx, by = sx * (kw / 2 + 0.2), ky + sy * (kw / 2 + 0.2)
                m.tube([(bx, by, kh - 9), (bx, by, kh - 6), (bx, by, kh + 4.4)], [0.5, 2.5, 2.5], "Slate", col, n=14, smooth=False)
                m.tube([(bx, by, kh - 6.2), (bx, by, kh - 5.8)], [2.8, 2.8], "Rock", mul(col, 1.1), n=14, smooth=False)
                for k in range(3):
                    a = math.atan2(sy, sx) + (k - 1) * 0.8
                    m.box((bx + math.cos(a) * 2.45, by + math.sin(a) * 2.45, kh + 1.4), (0.3, 0.5, 2.2), "SmoothPlastic", (0.012, 0.012, 0.016), rot=(0, 0, math.degrees(a)))
                if plan == "concentric":
                    spire(m, rng, pal, (bx, by, kh + 4.4), 2.9, 6.8, pal["roof"], n=14)
                else:
                    for k in range(6):
                        a = k / 6 * math.tau
                        m.box((bx + math.cos(a) * 2.3, by + math.sin(a) * 2.3, kh + 5.4), (0.8, 1.2, 1.8), "Slate", col, rot=(0, 0, math.degrees(a)), bevel=0.06)
        if plan == "norman":  # a timber hoarding hangs from the top of the keep
            for s in (-1, 1):
                m.box((0, ky + s * (kw / 2 + 1.9), kh - 4.4), (kw + 5.6, 2.4, 4.4), "WoodPlanks", vary(rng, pal["wood"], 0.1))
                m.box((s * (kw / 2 + 1.9), ky, kh - 4.4), (2.4, kw + 1.4, 4.4), "WoodPlanks", vary(rng, pal["wood"], 0.1))
                for k in range(8):
                    x = -kw / 2 + kw * (k + 0.5) / 8
                    beam(m, rng, (x, ky + s * kw / 2, kh - 9.4), (x, ky + s * (kw / 2 + 2.6), kh - 6.8), 0.5, 0.5, pal["wood"])
                    beam(m, rng, (s * kw / 2, ky + x, kh - 9.4), (s * (kw / 2 + 2.6), ky + x, kh - 6.8), 0.5, 0.5, pal["wood"])
        roof(m, rng, pal, kw - 4.4, kw - 4.4, kh + 1.2, 1.15, "tile", pal["roof"], over=0.4, sag=0.25, axis="y", y=ky, timber=False, wall_mat="Slate", wall_col=col)
        flag(m, rng, pal, (0, ky, kh + 1.2 + (kw - 4.4) * 0.58), h=7, w=5.2)
        for z in (kh * 0.22 + 3, kh * 0.52, kh * 0.83):
            for x in (-5.6, 0, 5.6):
                if z < 12 and x == 0:
                    continue
                yy = ky + kw / 2 + 0.1
                m.box((x, yy, z), (1.5, 0.3, 4.2), "Glow", mul(GLASS, 0.55))
                for s in (-1, 1):
                    m.box((x + s * 0.95, yy + 0.1, z), (0.45, 0.6, 4.4), "Rock", mul(col, 1.15), bevel=0.1)
                m.box((x, yy + 0.16, z), (0.16, 0.3, 4.2), "Metal", IRON)
                for q in (-0.9, 0.5):
                    m.box((x, yy + 0.16, z + q), (1.5, 0.3, 0.14), "Metal", IRON)
                arch(m, rng, x, yy + 0.1, z + 2.0, 0.95, 0.7, col, n=5, w=0.5)
                m.box((x, yy + 0.25, z - 2.35), (2.6, 0.9, 0.4), "Rock", mul(col, 1.15), bevel=0.1)
        door(m, rng, pal, (0, ky + kw / 2 + 1.1, 0.5), 90, 5.0, 8.6, ajar=55)
        arch(m, rng, 0, ky + kw / 2 + 1.0, 8.8, 2.9, 1.0, col, n=9)
        for s in (-1, 1):
            banner(m, rng, pal, (s * 2.8, ky + kw / 2 + 0.6, kh * 0.78), 90, 2.2, 9)
            lantern(m, (s * 4.0, ky + kw / 2 + 1.6, 7.4), 1.3)
    elif plan == "donjon":  # one great round tower, its own ditch and forebuilding
        ky = -8.0
        m.tube([(0, ky, -0.2), (0, ky, 3.0), (0, ky, 5.0)], [14.0, 12.4, 10.6], "Rubble", mul(col, 0.8), n=28, smooth=False)
        tower(m, rng, pal, (0, ky), 10.0, kh, col, "flat", n=30, levels=5, z0=0)
        tower(m, rng, pal, (7.4, ky + 6.0), 3.0, kh + 9, col, "spire", n=16, levels=3, z0=0, peak=2.6)
        m.box((0, ky + 12.5, 4.0), (8.0, 8.0, 8.0), "Slate", mul(col, 1.02), bevel=0.12)
        roof(m, rng, pal, 8.4, 8.4, 8.0, 1.0, "tile", pal["roof"], over=0.6, sag=0.1, axis="y", y=ky + 12.5, timber=False, wall_mat="Slate", wall_col=col)
        door(m, rng, pal, (0, ky + 16.6, 0.4), 90, 4.4, 7.0, ajar=55)
        for s in (-1, 1):
            banner(m, rng, pal, (s * 4.6, ky + 9.4, kh * 0.66), 90, 2.4, 11)
    else:  # chateau: three wings round a court of honour, steep slates, tall dormers
        wings = (((0, -16.0), 34.0, 12.0, "x"), ((-17.0, -1.0), 22.0, 10.0, "y"), ((17.0, -1.0), 22.0, 10.0, "y"))
        for (cx, cy), L, Dp, ax in wings:
            w, d = (L, Dp) if ax == "x" else (Dp, L)
            m.box((cx, cy, 9.0), (w, d, 18.0), "Slate", lambda q: mul(col, 0.86 + 0.16 * min(1, q.z / 18)))
            for z in (0.8, 8.8, 17.6):
                m.box((cx, cy, z), (w + 0.7, d + 0.7, 0.6), "Rock", mul(col, 1.08), bevel=0.12)
            roof(m, rng, pal, L, Dp, 18.0, 1.7, "slate", pal["roof"], over=0.7, sag=0.1, flare=0.5, axis=ax, x=cx, y=cy, timber=False, wall_mat="Slate", wall_col=col)
            n = 6 if ax == "x" else 4
            for k in range(n):
                u = -L / 2 + L * (k + 0.5) / n
                for z in (4.6, 13.2):
                    if ax == "x":
                        window(m, rng, pal, (cx + u, cy + Dp / 2 + 0.3, z), 90, 1.8, 4.2, shutters=False, box=False)
                    else:
                        s = -1 if cx > 0 else 1
                        window(m, rng, pal, (cx + s * (Dp / 2 + 0.3), cy + u, z), 0 if s > 0 else 180, 1.8, 4.2, shutters=False, box=False)
                if ax == "x" and k % 2 == 0:
                    dormer(m, rng, pal, (cx + u, cy + Dp * 0.46, 18.4), 3.0, 4.4, 3.4, "slate", pal["roof"], mul(col, 1.05))
            chimney(m, rng, {**pal, "stone": mul(col, 0.9)}, (cx + (L * 0.34 if ax == "x" else 0), cy + (0 if ax == "x" else L * 0.3)), 2.6, 22, 32)
        for s in (-1, 1):  # stair towers in the corners of the court
            tower(m, rng, pal, (s * 12.4, -10.0), 3.4, 27.0, col, "spire", n=16, levels=3, z0=0, peak=3.2)
        door(m, rng, pal, (0, -9.8, 0.5), 90, 5.0, 8.6, ajar=55)
        for s in (-1, 1):
            banner(m, rng, pal, (s * 5.4, -9.6, 16.0), 90, 2.2, 8)
    # great hall against the west wall, chapel against the east, both half-timbered above stone
    for s, length, fn in (() if plan == "chateau" else ((-1, 20.0, "hall"), (1, 15.0, "chapel"))):
        hx, hy, hw = s * 18.2, 2.0, 9.0
        m.box((hx, hy, 3.8), (hw, length, 8.4), "Slate", mul(col, 1.02))
        roof(m, rng, pal, length, hw, 8.0, 1.1, "tile", mul(pal["roof"], 0.9), over=0.9, sag=0.3, axis="y", x=hx, y=hy, wall_mat="Slate" if fn == "chapel" else "Concrete", wall_col=mul(col, 1.0) if fn == "chapel" else pal["wall"], timber=fn == "hall")
        ix = hx - s * (hw / 2 + 0.05)
        for k in range(3):
            yy = hy - length * 0.32 + k * length * 0.32
            window(m, rng, pal, (ix, yy, 4.6), 180 if s > 0 else 0, 1.6, 3.2, shutters=False, box=False)
    # courtyard: well, stalls, wood, straw
    m.tube([(8, 10, -0.2), (8, 10, 2.4)], [2.3, 2.1], "Rubble", mul(col, 0.95), n=14, smooth=False)
    m.cyl((8, 10, 2.1), 1.6, 0.2, "Water", mul(pal["water"], 0.6), n=14)
    for s in (-1, 1):
        beam(m, rng, (8 + s * 2.0, 10, 1), (8 + s * 2.0, 10, 7), 0.4, 0.4, pal["wood"])
    roof(m, rng, pal, 4.6, 3.4, 6.6, 0.9, "tile", pal["roof"], over=0.6, sag=0.05, flare=0.1, x=8, y=10, timber=False, gables=False)
    woodpile(m, rng, pal, -10, 16, 0.4, 5, 4, 20)
    for k in range(7):
        bx, by = rng.uniform(-13, -6), rng.uniform(6, 21)
        if k % 2:
            m.tube([(bx, by, 0.3), (bx, by, 1.6), (bx, by, 2.9)], [0.95, 1.15, 0.95], "WoodPlanks", vary(rng, pal["wood"], 0.15), n=12)
            for z in (0.8, 2.4):
                m.tube([(bx, by, z - 0.12), (bx, by, z + 0.12)], [1.12, 1.12], "Metal", IRON, n=12, cap=False)
        else:
            m.box((bx, by, 1.3), (2.1, 2.1, 2.0), "WoodPlanks", vary(rng, pal["wood"], 0.15), rot=(0, 0, rng.uniform(0, 90)), bevel=0.1)
    climbing(m, rng, pal, Vector((H + t / 2 + 0.2, -H + 10, -0.5)), Vector((0, 1, 0)), 12, 12, Vector((1, 0, 0)))
    climbing(m, rng, pal, Vector((-H + 9, H + t / 2 + 0.25, -0.5)), Vector((1, 0, 0)), 7, 9, Vector((0, 1, 0)))
    return m


def gate_tower(rng, pal, size, variant):
    m = M()
    tower(m, rng, pal, (0, 0), max(4.0, max(size[0], size[1]) * 0.36), max(16, size[2] * 0.62), pal["stone"], "spire", n=18, levels=2)
    return m


def ramparts(rng, pal, runs, ground):
    """Continuous town walls that follow the ground: stepped bay by bay, a tower at every end and every fifth bay."""
    m = M()
    col = mul(pal["stone"], 1.08)
    for pts in runs:
        dense = [Vector(pts[0])]
        for a, b in zip(pts, pts[1:]):
            a, b = Vector(a), Vector(b)
            k = max(1, int((b - a).length / 14))
            dense += [a + (b - a) * (i + 1) / k for i in range(k)]
        for i, (a, b) in enumerate(zip(dense, dense[1:])):
            g = [ground(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) for t in (0, 0.25, 0.5, 0.75, 1)]
            z0, z1 = min(g) - 3.0, max(max(g) + 7.5, sum(g) / 5 + 10.5)
            d = (b - a).normalized() * 0.5
            curtain(m, rng, pal, a - d, b + d, z0, z1, 3.0, col, loops=1 if i % 2 == 0 else 0)
            n = Vector((-(b - a).y, (b - a).x)).normalized() * 1.9
            merlons(m, rng, a + n, b + n, z1, col, w=1.9, gap=1.4, h=1.9, t=0.9, loops=False)
        ends = [dense[0], dense[-1]] + [dense[i] for i in range(5, len(dense) - 3, 6)]
        for p in ends:
            t = M()
            tower(t, rng, pal, (0, 0), 4.4, 17, col, "spire" if rng.random() < 0.55 else "flat", n=18, levels=1, z0=-9)
            m.merge(t, Matrix.Translation((p.x, p.y, ground(p.x, p.y))))
    return m


HOME = lambda r, p, s, v: house(r, p, s, v, "home")
BUILDINGS = {
    "house": HOME, "cottage": HOME, "chalet": HOME,
    "house_large": lambda r, p, s, v: house(r, p, s, v, ("inn", "farm", "hall", "smith")[v % 4]),
    "shop_building": lambda r, p, s, v: house(r, p, s, v, "shop"),
    "castle": castle, "gate_tower": gate_tower,
}
