"""Buildings and landmarks: stone by stone, plank by plank, shingle by shingle. Front toward +Y. Houses can be entered."""
import math
from mathutils import Vector, Matrix, noise
from wf_mesh import M, mix, mul, vary

GLASS = (1.0, 0.62, 0.22)


def rotz(deg):
    return Matrix.Rotation(math.radians(deg), 4, "Z")


def wall(m, a, b, z0, z1, t, mat, col, holes=()):
    """A wall between two ground points with rectangular holes (u0, u1, z0, z1), u along the wall."""
    a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    L = (b - a).length
    ang = math.degrees(math.atan2((b - a).y, (b - a).x))
    us = sorted({0, L, *[h[0] for h in holes], *[h[1] for h in holes]})
    zs = sorted({z0, z1, *[h[2] for h in holes], *[h[3] for h in holes]})
    for i in range(len(us) - 1):
        run = None
        for k in range(len(zs) - 1):
            u, z = (us[i] + us[i + 1]) / 2, (zs[k] + zs[k + 1]) / 2
            solid = not any(h[0] < u < h[1] and h[2] < z < h[3] for h in holes)
            if solid and run is None:
                run = zs[k]
            if run is not None and (not solid or k == len(zs) - 2):
                top = zs[k + 1] if solid else zs[k]
                c = a + (b - a).normalized() * u
                m.box((c.x, c.y, (run + top) / 2), (us[i + 1] - us[i], t, top - run), mat, col, rot=(0, 0, ang))
                run = None


def beam(m, rng, a, b, w, d, col):
    a, b = Vector(a), Vector(b)
    v = b - a
    mid = (a + b) / 2
    q = v.to_track_quat("Z", "Y").to_euler()
    m.box(mid, (w, d, v.length + 0.05), "Wood", vary(rng, col, 0.14), rot=[math.degrees(x) for x in q], bevel=0.06, jitter=0.015, rng=rng)


def stone_course(m, rng, a, b, z0, h, depth, col, length=1.6, mat="Slate", gap=0.06, proud=0.0):
    """One row of individual stones along a line."""
    a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    L = (b - a).length
    d = (b - a).normalized()
    ang = math.degrees(math.atan2(d.y, d.x))
    u = 0.0
    while u < L - 0.2:
        s = min(L - u, length * rng.uniform(0.65, 1.4))
        if L - u - s < 0.5:
            s = L - u
        c = a + d * (u + s / 2)
        m.box((c.x, c.y, z0 + h / 2), (s - gap, depth + rng.uniform(-0.05, 0.08) + proud, h - gap), mat, vary(rng, col, 0.17), rot=(0, 0, ang), bevel=0.09, jitter=0.03, rng=rng)
        u += s


def shingle_slope(m, rng, p0, along, down, L, S, col, row=1.15, width=1.25):
    """Overlapping shingles on a slope: p0 is the ridge corner, `along` the ridge direction, `down` the slope direction."""
    along, down = Vector(along).normalized(), Vector(down).normalized()
    n = along.cross(down)
    if n.z < 0:
        n = -n
    rows = max(3, int(S / row))
    step = S / rows
    for r in range(rows):
        u = -rng.uniform(0, 0.6)
        while u < L:
            w = width * rng.uniform(0.75, 1.25)
            u1, u2 = max(0, u), min(L, u + w)
            if u2 - u1 > 0.15:
                s0, s1 = step * r - 0.12, step * (r + 1) + step * 0.28 + rng.uniform(-0.09, 0.09)
                lift0, lift1 = 0.05, 0.2 + rng.uniform(0, 0.06)
                g = 0.03
                A = p0 + along * (u1 + g) + down * s0 + n * lift0
                B = p0 + along * (u2 - g) + down * s0 + n * lift0
                C = p0 + along * (u2 - g) + down * s1 + n * lift1
                D = p0 + along * (u1 + g) + down * s1 + n * lift1
                t = n * 0.13
                c = vary(rng, mul(col, 0.82 + 0.3 * noise.noise(Vector((u * 0.2, r * 0.35, L)))), 0.16)
                vs = [A, B, C, D, A - t, B - t, C - t, D - t]
                fs = [(0, 1, 2, 3), (3, 2, 6, 7), (0, 3, 7, 4), (2, 1, 5, 6)]
                if (B - A).cross(D - A).dot(n) < 0:
                    fs = [f[::-1] for f in fs]
                m.add(vs, fs, "WoodPlanks", c)
            u += w


def gable(m, rng, pal, w, d, z, pitch, over=1.3, col=None, x=0.0, y=0.0, axis="x", timber=True):
    """Gable roof, ridge along the axis: shingles on both slopes, ridge cap, barge boards. Returns the ridge height."""
    col = col or pal["roof"]
    R = M()
    half = d / 2 + over
    h = half * pitch
    L = w + over * 2
    base = z - over * pitch
    slope = math.hypot(half, h)
    for s in (-1, 1):
        shingle_slope(R, rng, Vector((-L / 2, 0, base + h)), (1, 0, 0), (0, s * half, -h), L, slope, col)
        under = [Vector((-L / 2, 0, base + h - 0.12)), Vector((L / 2, 0, base + h - 0.12)), Vector((L / 2, s * half, base - 0.12)), Vector((-L / 2, s * half, base - 0.12))]
        R.add(under, [(0, 1, 2, 3) if s > 0 else (3, 2, 1, 0)], "WoodPlanks", mul(pal["wood"], 0.6))
        R.add([p + Vector((0, 0, 0.1)) for p in under], [(3, 2, 1, 0) if s > 0 else (0, 1, 2, 3)], "WoodPlanks", mul(col, 0.6))
    for k in range(int(L / 1.5)):
        u = -L / 2 + (k + 0.5) * L / int(L / 1.5)
        for s in (-1, 1):
            R.box((u, s * 0.36, base + h + 0.14), (L / int(L / 1.5) + 0.12, 0.95, 0.16), "WoodPlanks", vary(rng, mul(col, 0.85), 0.12), rot=(s * -math.degrees(math.atan(pitch)) * 0.95, 0, 0), bevel=0.04)
    gx0 = w / 2 + 0.26
    for e in (-1, 1):
        for s in (-1, 1):
            beam(R, rng, (e * (L / 2 + 0.02), 0, base + h - 0.05), (e * (L / 2 + 0.02), s * (half + 0.15), base - 0.12), 0.32, 0.55, pal["wood"])
        if timber:
            beam(R, rng, (e * (gx0 + 0.1), -d / 2, z + 0.15), (e * (gx0 + 0.1), d / 2, z + 0.15), 0.6, 0.6, pal["wood"])
            beam(R, rng, (e * (gx0 + 0.1), 0, z), (e * (gx0 + 0.1), 0, base + h - 0.5), 0.5, 0.5, pal["wood"])
            for s in (-1, 1):
                beam(R, rng, (e * (gx0 + 0.12), s * d * 0.25, z + 0.3), (e * (gx0 + 0.12), s * d * 0.25, z + d * 0.25 * pitch - 0.3), 0.42, 0.42, pal["wood"])
                beam(R, rng, (e * (gx0 + 0.14), 0, z + d * 0.12), (e * (gx0 + 0.14), s * d * 0.25, z + d * 0.25 * pitch - 0.4), 0.36, 0.36, pal["wood"])
    # gable walls
    for e in (-1, 1):
        gx = w / 2 + 0.26
        tri = [Vector((e * gx, -d / 2 - 0.2, z - 0.1)), Vector((e * gx, d / 2 + 0.2, z - 0.1)), Vector((e * gx, 0, z + d / 2 * pitch - 0.05))]
        R.add(tri, [(0, 1, 2) if e > 0 else (2, 1, 0)], "Concrete", pal["wall"])
        R.add([p - Vector((e * 0.3, 0, 0)) for p in tri], [(2, 1, 0) if e > 0 else (0, 1, 2)], "Concrete", mul(pal["wall"], 0.8))
    xf = Matrix.Translation((x, y, 0)) @ (rotz(90) if axis == "y" else Matrix())
    m.merge(R, xf)
    return base + h


def window(m, rng, pal, p, face, w=2.2, h=2.8, shutters=True, box=True):
    """Framed window with mullions, warm glass, shutters and a flower box. `face` is the wall's outward angle in degrees."""
    W = M()
    wood = pal["wood"]
    W.box((0, 0.02, 0), (w, 0.12, h), "Glow", mul(GLASS, 0.55))
    for s in (-1, 1):
        W.box((s * (w / 2 + 0.12), 0.16, 0), (0.28, 0.5, h + 0.5), "Wood", vary(rng, wood, 0.1), bevel=0.05)
        W.box((0, 0.16, s * (h / 2 + 0.12)), (w + 0.5, 0.5, 0.28), "Wood", vary(rng, wood, 0.1), bevel=0.05)
    W.box((0, 0.14, 0), (0.13, 0.2, h), "Wood", mul(wood, 0.9))
    W.box((0, 0.14, h * 0.12), (w, 0.2, 0.13), "Wood", mul(wood, 0.9))
    W.box((0, 0.4, -h / 2 - 0.3), (w + 0.9, 0.8, 0.22), "Wood", vary(rng, wood, 0.1), bevel=0.05)
    if shutters:
        c = vary(rng, pal["accent"], 0.12)
        for s in (-1, 1):
            sw = w * 0.48
            for k in range(3):
                W.box((s * (w / 2 + 0.3 + sw * (k + 0.5) / 3), 0.24, 0), (sw / 3 - 0.04, 0.14, h + 0.1), "WoodPlanks", vary(rng, c, 0.12), bevel=0.03)
            for z in (-h * 0.3, h * 0.3):
                W.box((s * (w / 2 + 0.3 + sw / 2), 0.34, z), (sw, 0.08, 0.2), "WoodPlanks", mul(c, 0.7))
    if box:
        W.box((0, 0.75, -h / 2 - 0.55), (w + 0.2, 0.8, 0.6), "WoodPlanks", vary(rng, mul(wood, 1.15), 0.1), bevel=0.06)
        W.box((0, 0.75, -h / 2 - 0.28), (w, 0.6, 0.1), "Ground", (0.06, 0.04, 0.025))
        for k in range(9):
            q = Vector((rng.uniform(-w / 2, w / 2) * 0.9, 0.75 + rng.uniform(-0.25, 0.3), -h / 2 - 0.05 + rng.uniform(-0.05, 0.25)))
            W.ball(q, rng.uniform(0.14, 0.24), "Leaf", vary(rng, pal["foliage"], 0.2), sub=1) if k % 2 else W.ball(q, 0.15, "SmoothPlastic", vary(rng, rng.choice([(0.7, 0.05, 0.1), (0.8, 0.5, 0.1), (0.75, 0.3, 0.5)]), 0.1), sub=1)
    m.merge(W, Matrix.Translation(Vector(p)) @ rotz(face - 90))


def door(m, rng, pal, p, face, w=4.2, h=7.6, ajar=72):
    """Arched frame with a plank door left open: the house can be entered."""
    D = M()
    wood = pal["wood"]
    for s in (-1, 1):
        for k in range(5):
            D.box((s * (w / 2 + 0.35), 0.1, h * (k + 0.5) / 5), (0.75 + rng.uniform(-0.1, 0.15), 0.8, h / 5 - 0.06), "Slate", vary(rng, pal["stone"], 0.15), bevel=0.1, jitter=0.03, rng=rng)
    for k in range(5):
        t = (k - 2) / 2
        D.box((t * w * 0.46, 0.12, h + 0.42 - abs(t) * 0.2), (w * 0.27, 0.85, 0.85), "Slate", vary(rng, pal["stone"], 0.15), rot=(0, t * 11, 0), bevel=0.1)
    leaf = M()
    for k in range(5):
        leaf.box((w * (k + 0.5) / 5, 0, h / 2), (w / 5 - 0.05, 0.28, h - 0.1), "WoodPlanks", vary(rng, mul(wood, 1.1), 0.18), bevel=0.05)
    for z in (h * 0.2, h * 0.78):
        leaf.box((w * 0.5, 0.17, z), (w * 0.92, 0.1, 0.36), "Metal", (0.03, 0.03, 0.035), bevel=0.04)
    leaf.ball((w * 0.86, 0.26, h * 0.46), 0.17, "Metal", (0.06, 0.05, 0.04), sub=1)
    D.merge(leaf, Matrix.Translation((-w / 2, 0.05, 0)) @ rotz(ajar))
    for k in range(2):
        D.box((0, 1.1 + k * 0.9, -0.35 - k * 0.5), (w + 1.6 + k, 1.2, 0.6), "Slate", vary(rng, pal["stone"], 0.1), bevel=0.12)
    m.merge(D, Matrix.Translation(Vector(p)) @ rotz(face - 90))


def chimney(m, rng, pal, p, w, z0, z1):
    z = z0
    while z < z1:
        h = rng.uniform(0.65, 0.95)
        for s in (-1, 1):
            m.box((p[0] + s * w / 4, p[1], z + h / 2), (w / 2 - 0.05, w + rng.uniform(-0.1, 0.12), h - 0.05), "Slate", vary(rng, mul(pal["stone"], 0.9), 0.18), bevel=0.1, jitter=0.03, rng=rng)
        z += h
    m.box((p[0], p[1], z + 0.2), (w + 0.6, w + 0.6, 0.45), "Slate", mul(pal["stone"], 0.75), bevel=0.12)
    for s in (-1, 1):
        m.cyl((p[0] + s * w * 0.22, p[1], z + 0.9), 0.36, 1.1, "Brick", (0.32, 0.11, 0.06), n=8, r2=0.3)


def furnish(m, rng, pal, w, d, z):
    wood = pal["wood"]
    m.box((-w * 0.24, -d * 0.12, z + 2.4), (4.2, 2.6, 0.3), "WoodPlanks", mul(wood, 1.2), bevel=0.06)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((-w * 0.24 + sx * 1.8, -d * 0.12 + sy * 1.0, z + 1.2), (0.35, 0.35, 2.4), "Wood", wood)
    for s in (-1, 1):
        m.box((-w * 0.24 + s * 1.1, -d * 0.12 + 2.2, z + 1.4), (1.5, 1.5, 0.25), "WoodPlanks", mul(wood, 1.1), bevel=0.05)
        m.box((-w * 0.24 + s * 1.1, -d * 0.12 + 2.2, z + 0.7), (0.9, 0.9, 1.4), "Wood", mul(wood, 0.9))
    bx, by = w * 0.3, -d * 0.28
    m.box((bx, by, z + 0.8), (3.2, 5.0, 0.9), "WoodPlanks", mul(wood, 1.05), bevel=0.08)
    m.box((bx, by, z + 1.5), (3.0, 4.8, 0.6), "Fabric", (0.62, 0.55, 0.42), bevel=0.2)
    m.box((bx, by + 0.7, z + 1.75), (3.15, 3.2, 0.45), "Fabric", mul(pal["accent"], 0.9), bevel=0.15)
    m.box((bx, by - 1.8, z + 1.9), (2.2, 1.0, 0.5), "Fabric", (0.7, 0.66, 0.58), bevel=0.2)
    m.cyl((-w * 0.24, -d * 0.12, z + 2.9), 0.16, 0.7, "SmoothPlastic", (0.75, 0.7, 0.55), n=8)
    m.ball((-w * 0.24, -d * 0.12, z + 3.4), 0.16, "Glow", GLASS, sub=1)


def house(rng, pal, size, variant, shop=False):
    """Timber-framed house: stone base, jettied upper floor, shingled gable, chimney, windows with shutters and flowers."""
    m = M()
    w, d = max(13, size[0] * 0.86), max(12, size[1] * 0.86)
    two = size[2] > 15 or w > 16
    stone_c = vary(rng, pal["stone"], 0.06)
    plaster = vary(rng, pal["wall"], 0.06)
    wood = vary(rng, pal["wood"], 0.08)
    base, f1 = 1.6, 9.8
    # foundation: two courses of stones all round, floor inside
    for (a, b) in (((-w / 2, -d / 2), (w / 2, -d / 2)), ((w / 2, -d / 2), (w / 2, d / 2)), ((w / 2, d / 2), (-w / 2, d / 2)), ((-w / 2, d / 2), (-w / 2, -d / 2))):
        for k in range(3):
            stone_course(m, rng, a, b, -1.2 + k * 0.93, 0.95, 1.1, stone_c, 1.9)
        mid = (Vector(a) + Vector(b)) / 2
        m.box((mid.x, mid.y, -3.6), (abs(a[0] - b[0]) + 1.0, abs(a[1] - b[1]) + 1.0, 5), "Slate", mul(stone_c, 0.8))
    m.box((0, 0, base - 0.35), (w - 0.4, d - 0.4, 0.5), "WoodPlanks", mul(wood, 1.15))
    for k in range(int(w / 1.1)):
        m.box((-w / 2 + 0.6 + k * 1.1, 0, base - 0.06), (1.04, d - 0.8, 0.14), "WoodPlanks", vary(rng, mul(wood, 1.3), 0.15))
    # ground floor walls: door hole in front, window holes
    dw, dh = 4.2, 7.6
    win = (2.2, 2.8)
    front_holes = [(w / 2 - dw / 2, w / 2 + dw / 2, base, base + dh)]
    wx = w * 0.32
    for s in (-1, 1):
        u = w / 2 + s * wx
        front_holes.append((u - win[0] / 2, u + win[0] / 2, base + 3.2, base + 3.2 + win[1]))
    wall(m, (w / 2, d / 2), (-w / 2, d / 2), base, f1, 0.55, "Concrete", plaster, front_holes)
    wall(m, (-w / 2, -d / 2), (w / 2, -d / 2), base, f1, 0.55, "Concrete", plaster)
    for s in (-1, 1):
        wall(m, (s * w / 2, -d / 2), (s * w / 2, d / 2), base, f1, 0.55, "Concrete", plaster)
    door(m, rng, pal, (0, d / 2 + 0.1, base), 90, dw, dh)
    for s in (-1, 1):
        window(m, rng, pal, (s * wx, d / 2 + 0.2, base + 3.2 + win[1] / 2), 90, *win)
        window(m, rng, pal, (s * (w / 2 + 0.2), 0, base + 4.6), 0 if s > 0 else 180, *win, box=False)
    for s in (-1, 1):
        window(m, rng, pal, (s * w * 0.26, -d / 2 - 0.2, base + 4.6), 270, *win, box=s > 0)
    beam(m, rng, (0, -d / 2 - 0.16, base), (0, -d / 2 - 0.16, f1), 0.6, 0.6, wood)
    for s in (-1, 1):
        beam(m, rng, (s * 0.3, -d / 2 - 0.24, f1 - 3.2), (s * w * 0.11, -d / 2 - 0.24, f1 - 0.5), 0.4, 0.34, wood)
        for e in (-1, 1):
            beam(m, rng, (s * (w / 2 + 0.18), e * d * 0.24, base), (s * (w / 2 + 0.18), e * d * 0.24, f1), 0.5, 0.5, wood)
            beam(m, rng, (s * (w / 2 + 0.24), e * d * 0.26, base + 2.6), (s * (w / 2 + 0.24), e * (d / 2 - 0.4), f1 - 0.4), 0.34, 0.36, wood)
    # ivy climbing one corner
    if variant % 2 == 0:
        for _ in range(70):
            z = base + abs(rng.gauss(0, 3.4))
            if z < f1 - 0.4:
                k = rng.uniform(0, max(0.6, 3.6 - (z - base) * 0.35))
                p = Vector((-w / 2 - 0.4, d / 2 - k, z)) if rng.random() < 0.5 else Vector((-w / 2 + k, d / 2 + 0.4, z))
                m.ball(p, rng.uniform(0.22, 0.42), "Leaf", vary(rng, mul(pal["foliage"], 1.1), 0.25), sub=1, disp=0.4, seed=rng.random() * 9)
    # timber frame: posts, sill, rail, braces
    for sx in (-1, 1):
        for sy in (-1, 1):
            beam(m, rng, (sx * w / 2, sy * d / 2, base - 0.2), (sx * w / 2, sy * d / 2, f1), 0.8, 0.8, wood)
            beam(m, rng, (sx * (w / 2 - 0.2), sy * (d / 2 + 0.24), base + 0.4), (sx * (w / 2 - 2.0), sy * (d / 2 + 0.24), f1 - 2.6), 0.42, 0.34, wood)
    for sy in (-1, 1):
        beam(m, rng, (-w / 2, sy * d / 2, f1 - 0.25), (w / 2, sy * d / 2, f1 - 0.25), 0.7, 0.7, wood)
        beam(m, rng, (-w / 2, sy * (d / 2 + 0.2), base + 0.1), (w / 2, sy * (d / 2 + 0.2), base + 0.1), 0.5, 0.5, wood) if sy < 0 else None
    for sx in (-1, 1):
        beam(m, rng, (sx * w / 2, -d / 2, f1 - 0.25), (sx * w / 2, d / 2, f1 - 0.25), 0.7, 0.7, wood)
        beam(m, rng, (sx * (w / 2 + 0.22), -d / 2, base + 2.4), (sx * (w / 2 + 0.22), d / 2, base + 2.4), 0.45, 0.45, wood)
        beam(m, rng, (sx * (w / 2 + 0.2), -d / 2, base + 0.1), (sx * (w / 2 + 0.2), d / 2, base + 0.1), 0.5, 0.5, wood)
    furnish(m, rng, pal, w, d, base)
    top, jet = f1, 0.0
    if two:
        jet = 1.1
        f2 = f1 + 7.6
        W, D = w + jet * 2, d + jet * 2
        for k in range(int(W / 2.2)):
            x = -W / 2 + 1.1 + k * (W - 2.2) / max(1, int(W / 2.2) - 1)
            for sy in (-1, 1):
                m.box((x, sy * (d / 2 + jet * 0.6), f1 - 0.25), (0.55, jet * 2 + 0.9, 0.65), "Wood", vary(rng, wood, 0.12), bevel=0.07)
        m.box((0, 0, f1 + 0.2), (W - 0.1, D - 0.1, 0.45), "WoodPlanks", mul(wood, 0.9))
        for sy in (-1, 1):
            wall(m, (-W / 2, sy * D / 2), (W / 2, sy * D / 2), f1 + 0.4, f2, 0.5, "Concrete", plaster)
            beam(m, rng, (-W / 2, sy * D / 2, f1 + 0.5), (W / 2, sy * D / 2, f1 + 0.5), 0.8, 0.8, wood)
            beam(m, rng, (-W / 2, sy * D / 2, f2 - 0.2), (W / 2, sy * D / 2, f2 - 0.2), 0.7, 0.7, wood)
            n = max(2, int(W / 5.5))
            for k in range(n + 1):
                x = -W / 2 + W * k / n
                beam(m, rng, (x, sy * (D / 2 + 0.14), f1 + 0.6), (x, sy * (D / 2 + 0.14), f2 - 0.2), 0.55, 0.55, wood)
            for k in range(n):
                x0, x1 = -W / 2 + W * k / n, -W / 2 + W * (k + 1) / n
                if (k + variant + (sy > 0)) % 2 == 0:
                    window(m, rng, pal, ((x0 + x1) / 2, sy * (D / 2 + 0.2), f1 + 4.2), 90 if sy > 0 else 270, 2.0, 2.6, shutters=W / n > 5.2, box=sy > 0)
                else:
                    beam(m, rng, (x0 + 0.2, sy * (D / 2 + 0.2), f1 + 0.9), (x1 - 0.2, sy * (D / 2 + 0.2), f2 - 0.6), 0.4, 0.3, wood)
                    beam(m, rng, (x1 - 0.2, sy * (D / 2 + 0.22), f1 + 0.9), (x0 + 0.2, sy * (D / 2 + 0.22), f2 - 0.6), 0.4, 0.3, wood)
        for sx in (-1, 1):
            wall(m, (sx * W / 2, -D / 2), (sx * W / 2, D / 2), f1 + 0.4, f2, 0.5, "Concrete", plaster)
            window(m, rng, pal, (sx * (W / 2 + 0.2), 0, f1 + 4.2), 0 if sx > 0 else 180, 2.0, 2.6, box=False)
            beam(m, rng, (sx * (W / 2 + 0.1), -D / 2, f1 + 0.5), (sx * (W / 2 + 0.1), D / 2, f1 + 0.5), 0.8, 0.8, wood)
            for e in (-1, 1):
                beam(m, rng, (sx * (W / 2 + 0.22), e * D * 0.24, f2 - 0.5), (sx * (W / 2 + 0.22), e * (D / 2 - 0.3), f1 + 1.0), 0.34, 0.36, wood)
            for y in (-D / 2, -D * 0.22, D * 0.22, D / 2):
                beam(m, rng, (sx * (W / 2 + 0.14), y, f1 + 0.5), (sx * (W / 2 + 0.14), y, f2), 0.5, 0.5, wood)
        w, d, top = W, D, f2
    ridge = gable(m, rng, pal, w, d, top, rng.uniform(0.95, 1.15), col=vary(rng, pal["roof"], 0.1))
    chimney(m, rng, pal, (w * 0.28 * (1 if variant % 2 else -1), -d * 0.2), 2.4, top, ridge + 1.8)
    # lantern by the door
    lx, ly = dw / 2 + 1.5, size[1] * 0.43 + 0.6
    m.box((lx, ly - 0.2, base + 6.6), (0.2, 1.3, 0.2), "Metal", (0.03, 0.03, 0.035))
    m.box((lx, ly + 0.3, base + 5.8), (0.7, 0.7, 1.0), "Glow", GLASS)
    m.box((lx, ly + 0.3, base + 6.4), (0.95, 0.95, 0.2), "Metal", (0.03, 0.03, 0.035))
    if shop:
        W2 = size[0] * 0.8
        for k in range(int(W2 / 1.3)):
            c = pal["accent"] if k % 2 else (0.75, 0.7, 0.6)
            m.box((-W2 / 2 + 0.65 + k * 1.3, size[1] * 0.43 + 2.6, base + 8.2), (1.28, 4.6, 0.16), "Fabric", vary(rng, c, 0.06), rot=(-16, 0, 0))
        for s in (-1, 1):
            m.box((s * (W2 / 2 - 0.4), size[1] * 0.43 + 4.4, base + 3.4), (0.4, 0.4, 7.4), "Wood", wood, bevel=0.06)
            m.box((s * W2 * 0.3, size[1] * 0.43 + 3.2, base + 0.9), (W2 * 0.26, 1.8, 1.8), "WoodPlanks", vary(rng, mul(wood, 1.2), 0.1), bevel=0.06)
            for _ in range(7):
                m.ball((s * W2 * 0.3 + rng.uniform(-1.4, 1.4), size[1] * 0.43 + 3.2 + rng.uniform(-0.6, 0.6), base + 2.0), 0.34, "SmoothPlastic", vary(rng, rng.choice([(0.6, 0.06, 0.04), (0.75, 0.4, 0.05), (0.25, 0.4, 0.06)]), 0.15), sub=1)
    return m


# ------------------------------------------------------------------ fortification
def crenels(m, rng, a, b, z, col, w=2.0, gap=1.6, h=2.3, t=1.4):
    a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    L = (b - a).length
    n = max(1, int(L / (w + gap)))
    d = (b - a).normalized()
    ang = math.degrees(math.atan2(d.y, d.x))
    for k in range(n):
        if rng.random() < 0.06:
            continue
        c = a + d * ((k + 0.5) * L / n)
        m.box((c.x, c.y, z + h / 2), (w, t, h), "Slate", vary(rng, col, 0.12), rot=(0, 0, ang), bevel=0.14, jitter=0.04, rng=rng)
        m.box((c.x, c.y, z + h + 0.12), (w + 0.35, t + 0.35, 0.3), "Slate", vary(rng, mul(col, 1.1), 0.1), rot=(0, 0, ang), bevel=0.1)


def masonry(m, rng, a, b, z0, z1, t, col, density=0.16, corbel=True):
    """Curtain wall: battered foot, scattered proud stones, string course, corbels under the walk."""
    A, B = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    L = (B - A).length
    d = (B - A).normalized()
    n = Vector((-d.y, d.x, 0))
    ang = math.degrees(math.atan2(d.y, d.x))
    mid = (A + B) / 2
    m.box((mid.x, mid.y, (z0 + z1) / 2), (L, t, z1 - z0), "Slate", lambda q: mul(col, 0.78 + 0.26 * min(1, (q.z - z0) / (z1 - z0))), rot=(0, 0, ang))
    for s in (-1, 1):
        f = mid + n * s * (t / 2)
        m.box((f.x, f.y, z0 + 1.3), (L + 0.1, 1.4, 2.8), "Slate", mul(col, 0.75), rot=(0, 0, ang), taper=0.93)
        rows = int((z1 - z0 - 3) / 1.25)
        for r in range(rows):
            u = rng.uniform(0, 2)
            while u < L - 2:
                s2 = rng.uniform(1.3, 2.6)
                if rng.random() < density:
                    c = A + d * (u + s2 / 2) + n * s * (t / 2 + 0.06)
                    m.box((c.x, c.y, z0 + 3.2 + r * 1.25), (s2 - 0.12, 0.34, 1.08), "Slate", vary(rng, mul(col, 0.95), 0.2), rot=(0, 0, ang), bevel=0.11, jitter=0.03, rng=rng)
                u += s2
        c = mid + n * s * (t / 2 + 0.22)
        m.box((c.x, c.y, z1 - 2.1), (L, 0.6, 0.5), "Slate", mul(col, 1.1), rot=(0, 0, ang), bevel=0.1)
        if corbel:
            k = int(L / 1.9)
            for i in range(k):
                c = A + d * ((i + 0.5) * L / k) + n * s * (t / 2 + 0.35)
                m.box((c.x, c.y, z1 - 1.2), (0.75, 1.0, 1.0), "Slate", vary(rng, col, 0.12), rot=(0, 0, ang), bevel=0.12)
            c = mid + n * s * (t / 2 + 0.45)
            m.box((c.x, c.y, z1 - 0.35), (L, 1.1, 0.7), "Slate", mul(col, 1.05), rot=(0, 0, ang), bevel=0.1)


def round_tower(m, rng, pal, c, r, h, col, roof=True, n=20):
    x, y = c
    m.tube([(x, y, -1.5), (x, y, 2.4), (x, y, 3.2), (x, y, h)], [r * 1.14, r * 1.06, r, r * 0.97], "Slate", lambda q: mul(col, 0.76 + 0.28 * min(1, max(0, q.z / h)) + noise.noise(q * 0.35) * 0.1), n=n, smooth=False)
    rows = int(h / 1.3)
    for i in range(rows):
        z = 3.5 + i * 1.3
        if z > h - 3:
            break
        for k in range(n):
            if rng.random() < 0.15:
                a = (k + 0.5) / n * math.tau
                rr = r * math.cos(math.pi / n) + 0.05
                m.box((x + math.cos(a) * rr, y + math.sin(a) * rr, z), (0.36, 2 * r * math.sin(math.pi / n) - 0.15, 1.1), "Slate", vary(rng, mul(col, 0.95), 0.2), rot=(0, 0, math.degrees(a)), bevel=0.1)
    k = n + 4
    for i in range(k):
        a = i / k * math.tau
        m.box((x + math.cos(a) * (r + 0.35), y + math.sin(a) * (r + 0.35), h - 1.2), (1.1, 0.8, 1.3), "Slate", vary(rng, col, 0.12), rot=(0, 0, math.degrees(a)), bevel=0.12)
    m.tube([(x, y, h - 0.6), (x, y, h + 0.5)], [r + 1.0, r + 1.0], "Slate", mul(col, 1.06), n=n, smooth=False)
    k = int(n * 0.6)
    for i in range(k):
        a = i / k * math.tau
        m.box((x + math.cos(a) * (r + 0.5), y + math.sin(a) * (r + 0.5), h + 1.5), (1.0, 1.9, 2.2), "Slate", vary(rng, col, 0.12), rot=(0, 0, math.degrees(a)), bevel=0.13, jitter=0.04, rng=rng)
    for i in range(4):
        a = i / 4 * math.tau + 0.4
        for z in (h * 0.38, h * 0.68):
            m.box((x + math.cos(a) * r * 1.0, y + math.sin(a) * r * 1.0, z), (0.5, 0.7, 3.2), "SmoothPlastic", (0.012, 0.012, 0.016), rot=(0, 0, math.degrees(a)))
            m.box((x + math.cos(a) * r * 1.0, y + math.sin(a) * r * 1.0, z - 1.9), (0.8, 1.6, 0.4), "Slate", mul(col, 1.1), rot=(0, 0, math.degrees(a)), bevel=0.1)
    if roof:
        cone(m, rng, (x, y, h + 0.6), r + 0.9, r * 2.3, pal["roof"])
        flag(m, rng, pal, (x, y, h + 0.6 + r * 2.3))


def cone(m, rng, c, r, h, col):
    """Conical roof in rings of shingles."""
    x, y, z = c
    m.tube([(x, y, z), (x, y, z + h)], [r * 0.95, 0.12], "WoodPlanks", mul(col, 0.6), n=18, cap=False)
    rows = max(5, int(h / 1.5))
    for i in range(rows):
        t0, t1 = i / rows, (i + 1.35) / rows
        r0, r1 = r * (1 - t0) + 0.18, max(0.05, r * (1 - min(1, t1)))
        n = max(7, int(r0 * 5.2))
        for k in range(n):
            a0 = (k + (i % 2) * 0.5 + 0.03) / n * math.tau
            a1 = a0 + math.tau / n * 0.94
            dz = rng.uniform(-0.1, 0.06)
            z0, z1 = z + h * t0 + dz, z + h * min(1, t1)
            p = [Vector((x + math.cos(a0) * r0, y + math.sin(a0) * r0, z0)), Vector((x + math.cos(a1) * r0, y + math.sin(a1) * r0, z0)), Vector((x + math.cos(a1) * r1, y + math.sin(a1) * r1, z1)), Vector((x + math.cos(a0) * r1, y + math.sin(a0) * r1, z1))]
            low = [q + Vector((0, 0, -0.16)) for q in p[:2]]
            m.add(p + low, [(0, 1, 2, 3), (4, 5, 1, 0)], "WoodPlanks", vary(rng, col, 0.17))


def flag(m, rng, pal, p, h=6.0, w=4.4):
    x, y, z = p
    m.cyl((x, y, z + h / 2), 0.14, h, "Wood", pal["wood"], n=6)
    m.ball((x, y, z + h + 0.15), 0.28, "Metal", (0.6, 0.42, 0.08), sub=1)
    vs, fs = [], []
    k = 7
    for i in range(k + 1):
        t = i / k
        wave = math.sin(t * 5.2) * 0.4 * t
        for s in (0, 1):
            vs.append(Vector((x + w * t, y + wave, z + h - 0.3 - 2.6 * s * (1 - 0.15 * t) - 0.3 * t)))
    for i in range(k):
        f = (i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
        fs += [f, f[::-1]]
    m.add(vs, fs, "Fabric", lambda q: mix(pal["accent"], mul(pal["accent"], 0.6), 0.5 + 0.5 * math.sin(q.x * 2)), smooth=False)


def banner(m, rng, pal, p, face, w=3.0, h=8.0):
    B = M()
    B.box((0, 0.25, 0.1), (w + 1, 0.22, 0.22), "Wood", pal["wood"])
    vs = [Vector((-w / 2, 0.22, 0)), Vector((w / 2, 0.22, 0)), Vector((w / 2, 0.3, -h)), Vector((0, 0.3, -h - 1.2)), Vector((-w / 2, 0.3, -h))]
    B.add(vs, [(4, 3, 2, 1, 0), (0, 1, 2, 3, 4)], "Fabric", lambda q: mul(pal["accent"], 1.0 + 0.04 * q.z))
    B.box((0, 0.3, -h * 0.45), (w * 0.45, 0.06, w * 0.45), "Fabric", (0.8, 0.55, 0.12), rot=(0, 45, 0))
    m.merge(B, Matrix.Translation(Vector(p)) @ rotz(face - 90))


def castle(rng, pal, size, variant):
    """Stronghold with courtyard: curtain walls, four round towers, gatehouse, keep with hall roof and turret."""
    m = M()
    col = vary(rng, mul(pal["stone"], 1.08), 0.04)
    H = 26.0
    wh, th, kh = 17.0, 27.0, 36.0
    m.box((0, 0, -0.4), (H * 2, H * 2, 1.6), "Cobblestone", mul(pal["stone"], 0.75))
    m.box((0, 0, -7), (H * 2 + 4.4, H * 2 + 4.4, 11.4), "Slate", mul(col, 0.7), taper=0.97)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.cyl((sx * H, sy * H, -6.5), 7.6, 11, "Slate", mul(col, 0.66), n=20, smooth=False)
    masonry(m, rng, (-H, -H), (H, -H), -1.5, wh, 4.2, col)
    for s in (-1, 1):
        masonry(m, rng, (s * H, -H), (s * H, H), -1.5, wh, 4.2, col)
        masonry(m, rng, (s * 6.5, H), (s * H, H), -1.5, wh, 4.2, col)
        crenels(m, rng, (s * (H + 1.6), -H + 7), (s * (H + 1.6), H - 7), wh, col)
        crenels(m, rng, (s * 9, H + 1.6), (s * (H - 7), H + 1.6), wh, col)
    crenels(m, rng, (-H + 7, -H - 1.6), (H - 7, -H - 1.6), wh, col)
    for sx in (-1, 1):
        for sy in (-1, 1):
            round_tower(m, rng, pal, (sx * H, sy * H), 6.6, th + (sx * sy) * 1.5, col)
    # gatehouse
    gh = wh + 6
    for s in (-1, 1):
        round_tower(m, rng, pal, (s * 8.6, H + 1.5), 4.4, gh, col, roof=False, n=16)
        banner(m, rng, pal, (s * 8.6, H + 5.9, gh - 4), 90)
    masonry(m, rng, (-5, H + 1), (5, H + 1), 11.5, gh - 1, 6.0, col, corbel=False)
    crenels(m, rng, (-4.6, H + 4), (4.6, H + 4), gh - 1, col, w=1.6, gap=1.2)
    for k in range(9):
        a = math.pi * (k + 0.5) / 9
        m.box((math.cos(a) * 5.0, H + 3.6, 9.2 + math.sin(a) * 3.2), (1.5, 2.4, 1.2), "Slate", vary(rng, mul(col, 1.08), 0.14), rot=(0, 90 - math.degrees(a), 0), bevel=0.14)
    for k in range(7):
        m.box((-4.2 + k * 1.4, H + 1.4, 10.2), (0.34, 0.34, 4.6), "Metal", (0.03, 0.03, 0.035))
        m.box((-4.2 + k * 1.4, H + 1.4, 7.7), (0.3, 0.3, 0.6), "Metal", (0.03, 0.03, 0.035), taper=0.2)
    for z in (8.6, 10.2, 11.8):
        m.box((0, H + 1.4, z), (10, 0.3, 0.3), "Metal", (0.03, 0.03, 0.035))
    for k in range(8):
        m.box((-4.6 + k * 1.3, H + 9.2, 0.25), (1.22, 13, 0.5), "WoodPlanks", vary(rng, pal["wood"], 0.15), bevel=0.06)
    for s in (-1, 1):
        beam(m, rng, (s * 5, H + 3.5, 12), (s * 5, H + 15, 0.6), 0.22, 0.22, (0.03, 0.03, 0.035))
    # keep
    kw, ky = 20.0, -8.0
    for a, b in (((-kw / 2, ky - kw / 2), (kw / 2, ky - kw / 2)), ((kw / 2, ky - kw / 2), (kw / 2, ky + kw / 2)), ((kw / 2, ky + kw / 2), (-kw / 2, ky + kw / 2)), ((-kw / 2, ky + kw / 2), (-kw / 2, ky - kw / 2))):
        masonry(m, rng, a, b, 0, kh, 2.4, mul(col, 1.05), density=0.12)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((sx * kw / 2, ky + sy * kw / 2, kh / 2), (3.6, 3.6, kh), "Slate", lambda q: mul(col, 0.85 + 0.2 * q.z / kh), bevel=0.3)
        crenels(m, rng, (sx * (kw / 2 + 0.9), ky - kw / 2), (sx * (kw / 2 + 0.9), ky + kw / 2), kh, col)
    for sy in (-1, 1):
        crenels(m, rng, (-kw / 2, ky + sy * (kw / 2 + 0.9)), (kw / 2, ky + sy * (kw / 2 + 0.9)), kh, col)
    gable(m, rng, pal, kw - 4, kw - 5, kh, 0.95, over=0.3, y=ky, axis="y", timber=False)
    for z in (kh * 0.38, kh * 0.62, kh * 0.85):
        for x in (-6, 0, 6):
            window(m, rng, pal, (x, ky + kw / 2 + 1.35, z), 90, 1.8, 3.6, shutters=False, box=False)
    door(m, rng, pal, (0, ky + kw / 2 + 1.3, 0.6), 90, 5.0, 8.4, ajar=50)
    for s in (-1, 1):
        banner(m, rng, pal, (s * 3.2, ky + kw / 2 + 1.5, kh * 0.8), 90, 2.2, 10)
    round_tower(m, rng, pal, (kw / 2 + 0.5, ky - kw / 2), 4.2, kh + 11, col, n=16)
    # courtyard life
    for k in range(9):
        m.box((rng.uniform(-18, 18), rng.uniform(8, 20), 1.2), (2.2, 2.2, 2.2), "WoodPlanks", vary(rng, pal["wood"], 0.15), rot=(0, 0, rng.uniform(0, 90)), bevel=0.1) if k < 4 else m.cyl((rng.uniform(-19, 19), rng.uniform(6, 20), 1.6), 1.0, 2.6, "WoodPlanks", vary(rng, pal["wood"], 0.15), n=10)
    return m


def town_wall(rng, pal, size, variant):
    m = M()
    L = max(size[0], size[1])
    t = max(2.0, min(size[0], size[1]) * 0.7)
    h = size[2] * 0.82
    masonry(m, rng, (-L / 2, 0), (L / 2, 0), -0.6, h, t, pal["stone"], density=0.2)
    m.box((0, 0, -4), (L, t * 1.15, 8), "Slate", mul(pal["stone"], 0.7))
    for s in (-1, 1):
        crenels(m, rng, (-L / 2 + 0.3, s * (t / 2 + 0.2)), (L / 2 - 0.3, s * (t / 2 + 0.2)), h, pal["stone"], w=1.6, gap=1.3, h=1.8, t=0.9)
    if size[0] < size[1]:
        r = M()
        r.merge(m, rotz(90))
        return r
    return m


def gate_tower(rng, pal, size, variant):
    m = M()
    r = max(size[0], size[1]) * 0.36
    round_tower(m, rng, pal, (0, 0), r, size[2] * 0.62, pal["stone"], n=16)
    return m


def stone_wall(rng, pal, size, variant):
    m = M()
    long_x = size[0] >= size[1]
    L = max(size[0], size[1])
    t = min(size[0], size[1]) * 0.8
    z = -0.5
    while z < size[2] * 0.92:
        h = rng.uniform(0.6, 0.95)
        stone_course(m, rng, (-L / 2, 0), (L / 2 - (0.7 if z > size[2] * 0.6 and variant % 2 else 0), 0), z, h, t * rng.uniform(0.85, 1.05), mix(pal["stone"], mul(pal["foliage"], 0.8), 0.16 if z > 0.5 else 0.05), 1.5)
        z += h
    if not long_x:
        r = M()
        r.merge(m, rotz(90))
        return r
    return m


def well(rng, pal, size, variant):
    m = M()
    r = max(size[0], size[1]) * 0.36
    for row in range(4):
        n = 13
        for k in range(n):
            a = (k + row * 0.5) / n * math.tau
            m.box((math.cos(a) * r, math.sin(a) * r, row * 0.95 + 0.1), (1.2, r * math.tau / n * 0.95, 0.92), "Slate", vary(rng, pal["stone"], 0.17), rot=(0, 0, math.degrees(a)), bevel=0.11, jitter=0.03, rng=rng)
    m.cyl((0, 0, 1.6), r - 0.5, 0.2, "Water", mul(pal["water"], 0.6), n=16)
    m.tube([(0, 0, -0.5), (0, 0, 1.5)], [r - 0.4, r - 0.4], "Slate", mul(pal["stone"], 0.3), n=16)
    for s in (-1, 1):
        beam(m, rng, (s * r, 0, 2.5), (s * r, 0, 8.6), 0.6, 0.6, pal["wood"])
        beam(m, rng, (s * r, 0, 6.6), (s * (r - 1.6), 0, 8.4), 0.35, 0.35, pal["wood"])
    beam(m, rng, (-r - 0.4, 0, 6.4), (r + 0.4, 0, 6.4), 0.5, 0.5, pal["wood"])
    gable(m, rng, pal, r * 2 + 0.6, r * 1.3, 8.4, 0.9, over=0.9, timber=False)
    m.cyl((0.4, 0, 4.0), 0.05, 4.4, "Fabric", (0.4, 0.3, 0.18), n=5)
    m.cyl((0.4, 0, 1.9 + 1.4), 0.55, 1.0, "WoodPlanks", mul(pal["wood"], 1.2), n=10, r2=0.68)
    return m


def windmill(rng, pal, size, variant):
    m = M()
    h = size[2] * 0.62
    r = max(5.0, h * 0.26)
    m.tube([(0, 0, -1.5), (0, 0, 3), (0, 0, h)], [r * 1.25, r * 1.1, r * 0.78], "Slate", lambda q: mul(pal["wall"], 0.8 + 0.25 * max(0, q.z / h)), n=18, smooth=False)
    for row in range(3):
        n = 20
        for k in range(n):
            a = (k + row * 0.5) / n * math.tau
            m.box((math.cos(a) * r * 1.2, math.sin(a) * r * 1.2, -0.4 + row * 1.2), (0.8, r * 1.2 * math.tau / n * 0.95, 1.15), "Slate", vary(rng, pal["stone"], 0.16), rot=(0, 0, math.degrees(a)), bevel=0.12)
    for z in (h * 0.45, h * 0.72):
        m.tube([(0, 0, z), (0, 0, z + 0.7)], [r * (1.12 - 0.36 * z / h) + 0.1] * 2, "Wood", pal["wood"], n=18, smooth=False)
    door(m, rng, pal, (0, r * 1.16, 0.2), 90, 3.6, 7.0)
    for a, z in ((20, h * 0.36), (160, h * 0.36), (200, h * 0.6), (340, h * 0.6)):
        rr = r * (1.1 - 0.34 * z / h)
        window(m, rng, pal, (math.cos(math.radians(a)) * rr, math.sin(math.radians(a)) * rr, z), a, 1.7, 2.3, box=False)
    cone(m, rng, (0, 0, h - 0.3), r * 0.98, r * 1.35, pal["roof"])
    hub = Vector((0, r * 0.95, h + r * 0.25))
    m.tube([(0, 0, hub.z), hub + Vector((0, 1.2, 0))], [0.7, 0.6], "Wood", pal["wood"], n=8)
    m.ball(hub + Vector((0, 1.2, 0)), 1.0, "Wood", mul(pal["wood"], 0.8), sub=2)
    span = size[2] * 0.4
    for k in range(4):
        S = M()
        beam(S, rng, (0, 0, 0), (0, 0, span), 0.5, 0.35, pal["wood"])
        for i in range(8):
            S.box((1.5, 0, span * (0.22 + i * 0.1)), (3.2, 0.14, 0.18), "Wood", pal["wood"])
        S.add([Vector((0.2, -0.1, span * 0.2)), Vector((3.0, -0.1, span * 0.2)), Vector((3.0, 0.25, span * 0.96)), Vector((0.2, -0.1, span * 0.96))], [(0, 1, 2, 3)], "Fabric", (0.72, 0.66, 0.54))
        S.add([Vector((0.2, -0.16, span * 0.2)), Vector((3.0, -0.16, span * 0.2)), Vector((3.0, 0.19, span * 0.96)), Vector((0.2, -0.16, span * 0.96))], [(3, 2, 1, 0)], "Fabric", (0.66, 0.6, 0.5))
        m.merge(S, Matrix.Translation(hub + Vector((0, 1.3, 0))) @ Matrix.Rotation(k * math.pi / 2 + 0.4, 4, "Y"))
    return m


def ramparts(rng, pal, runs, ground):
    """Continuous walls that follow the ground: `runs` are lists of (x, y) points, stepped bay by bay, towers at their ends."""
    m = M()
    col = mul(pal["stone"], 1.04)
    for pts in runs:
        dense = [Vector(pts[0])]
        for a, b in zip(pts, pts[1:]):
            a, b = Vector(a), Vector(b)
            k = max(1, int((b - a).length / 11))
            dense += [a + (b - a) * (i + 1) / k for i in range(k)]
        for a, b in zip(dense, dense[1:]):
            g = [ground(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) for t in (0, 0.25, 0.5, 0.75, 1)]
            z0, z1 = min(g) - 3.0, max(max(g) + 7.5, sum(g) / 5 + 10.5)
            d = (b - a).normalized() * 0.5
            masonry(m, rng, a - d, b + d, z0, z1, 3.0, col, density=0.2)
            n = Vector((-(b - a).y, (b - a).x)).normalized() * 1.5
            crenels(m, rng, a + n, b + n, z1, col, w=1.7, gap=1.4, h=1.9, t=0.9)
        for p in (dense[0], dense[-1]):
            t = M()
            round_tower(t, rng, pal, (0, 0), 4.6, 18, col, n=16)
            t.box((0, 0, -4), (9.4, 9.4, 8), "Slate", mul(col, 0.66))
            m.merge(t, Matrix.Translation((p.x, p.y, ground(p.x, p.y))))
    return m


ARCH = {
    "house": house, "house_large": house, "cottage": house, "shop_building": lambda r, p, s, v: house(r, p, s, v, shop=True), "castle": castle,
    "town_wall": town_wall, "gate_tower": gate_tower, "stone_wall": stone_wall, "well": well, "windmill": windmill,
}

from wf_build import BUILDINGS, ramparts  # noqa: E402,F401
ARCH.update(BUILDINGS)

from wf_medieval import MEDIEVAL  # noqa: E402
ARCH.update(MEDIEVAL)
