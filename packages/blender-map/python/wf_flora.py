"""Trees, bushes, grass, flowers and rocks. Every builder: (rng, palette, size (x, y, z in studs), variant) -> M."""
import bmesh
import math
from mathutils import Vector, Matrix, noise
from wf_mesh import M, mix, mul, vary


def fib(n):
    g = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        z = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(1 - z * z)
        yield Vector((math.cos(g * i) * r, math.sin(g * i) * r, z))


def tuft(m, rng, p, nrm, size, col, centre, points=3):
    """A folded star of leaves lying on the crown; its normals point away from the crown so the crown shades as one volume."""
    n = nrm.normalized()
    ref = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
    u = n.cross(ref).normalized()
    w = n.cross(u)
    a0 = rng.uniform(0, math.tau)
    vs = [p + n * size * 0.2]
    k = points * 2
    for i in range(k):
        a = a0 + i / k * math.tau
        r = size * (1.0 if i % 2 == 0 else 0.42) * rng.uniform(0.8, 1.15)
        vs.append(p + (u * math.cos(a) + w * math.sin(a)) * r - n * size * (0.12 if i % 2 == 0 else 0.0))
    fs = [(0, i + 1, (i + 1) % k + 1) for i in range(k)]
    nr = [((v - centre).normalized() * 0.75 + n * 0.25) for v in vs]
    tip = mul(col, 1.15)
    o = vs[0].copy()
    m.add(vs, fs, "Leaf", lambda q: mix(col, tip, min(1, (q - o).length / size)), smooth=True, normals=nr)


def crown(m, rng, blobs, lo, hi, size, per_area=0.55):
    centre = sum((b[0] * b[1] for b in blobs), Vector()) / sum(b[1] for b in blobs)
    z0 = min(b[0].z - b[1] for b in blobs)
    z1 = max(b[0].z + b[1] for b in blobs)
    shade = lambda q: mix(lo, hi, max(0, min(1, (q.z - z0) / (z1 - z0))) ** 0.8)
    for i, (c, r) in enumerate(blobs):
        m.ball(c, r * 0.9, "Leaf", lambda q: mul(shade(q), 0.72), sub=2, disp=0.16, seed=i + rng.random() * 9, normals_from=centre)
        n = max(10, int(per_area * 4 * math.pi * r * r / (size * size)))
        for d in fib(n):
            d = (d + Vector([rng.gauss(0, 0.12) for _ in range(3)])).normalized()
            p = c + Vector((d.x, d.y, d.z * 0.92)) * r * rng.uniform(0.86, 1.02)
            if any(j != i and (p - c2).length < r2 * 0.82 for j, (c2, r2) in enumerate(blobs)):
                continue
            tilt = d + Vector((0, 0, 0.35)) + Vector([rng.gauss(0, 0.2) for _ in range(3)])
            tuft(m, rng, p, tilt, size * rng.uniform(0.8, 1.25), vary(rng, shade(p), 0.13), centre)


def trunk(m, rng, h, r, bark, lean=0.06, flare=1.7, n=9):
    pts, rad = [], []
    steps = 6
    dx, dy = rng.uniform(-lean, lean) * h, rng.uniform(-lean, lean) * h
    for i in range(steps + 1):
        t = i / steps
        pts.append(Vector((dx * t * t + rng.uniform(-0.1, 0.1) * r, dy * t * t + rng.uniform(-0.1, 0.1) * r, h * t - 0.6 * (1 - t))))
        rad.append(r * ((1 - 0.55 * t) + (flare - 1) * max(0, 1 - t * 5) ** 2))
    m.tube(pts, rad, "Wood", lambda q: mul(bark, 0.7 + 0.35 * min(1, max(0, q.z / h)) + noise.noise(q * 0.9) * 0.12), n=n, wobble=0.08, rng=rng)
    for k in range(5):
        a = k / 5 * math.tau + rng.uniform(-0.3, 0.3)
        e = Vector((math.cos(a), math.sin(a), 0))
        up = Vector((0, 0, 1))
        m.tube([e * r * 0.6 + up * r * 1.2, e * r * 1.5 + up * 0.25, e * r * 2.4 - up * 0.5], [r * 0.42, r * 0.34, r * 0.12], "Wood", mul(bark, 0.75), n=5, cap=False)
    return pts


def branch(m, rng, a, b, r, bark):
    mid = (a + b) / 2 + Vector((rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), rng.uniform(0.1, 0.7)))
    m.tube([a, mid, b], [r, r * 0.75, r * 0.35], "Wood", mul(bark, 0.95), n=5, cap=False)


def round_tree(rng, pal, size, variant):
    m = M()
    h = size[2]
    bark = vary(rng, pal["wood"], 0.1)
    green = mix(pal["foliage"], pal["foliageAlt"], rng.random())
    lo, hi = mul(green, 0.5), mix(mul(green, 1.55), (0.42, 0.45, 0.08), 0.2)
    th = h * 0.5
    R = max(size[0], size[1]) * 0.5
    pts = trunk(m, rng, th, max(0.55, h * 0.035), bark)
    top = pts[-1]
    blobs = [(top + Vector((0, 0, h * 0.2)), R * 0.62)]
    for k in range(5):
        a = k / 5 * math.tau + rng.uniform(-0.35, 0.35)
        c = top + Vector((math.cos(a) * R * 0.55, math.sin(a) * R * 0.55, h * rng.uniform(0.0, 0.2)))
        blobs.append((c, R * rng.uniform(0.36, 0.5)))
        branch(m, rng, pts[-2], c, h * 0.014, bark)
    crown(m, rng, blobs, lo, hi, max(0.6, R * 0.105), per_area=0.5)
    return m


def birch(rng, pal, size, variant):
    m = M()
    h = size[2]
    R = max(size[0], size[1]) * 0.5
    bark, dark = (0.78, 0.76, 0.7), (0.05, 0.045, 0.04)
    r = max(0.34, h * 0.02)
    bend = rng.uniform(-0.05, 0.05) * h
    pts = []
    for i in range(8):
        t = i / 7
        pts.append(Vector((bend * t * t, rng.uniform(-0.05, 0.05), h * 0.8 * t - 0.5 * (1 - t))))
    m.tube(pts, [r * (1.35 - 0.9 * i / 7) for i in range(8)], "Wood", lambda q: mul(bark, 0.85 + noise.noise(q * 1.3) * 0.2), n=8, wobble=0.05, rng=rng)
    for _ in range(11):
        z = rng.uniform(0.04, 0.72) * h
        t = z / (h * 0.8)
        rr = r * (1.35 - 0.9 * t) * 1.03
        a, arc = rng.uniform(0, math.tau), rng.uniform(0.6, 1.6)
        base = Vector((bend * t * t, 0, z))
        vs = []
        for i in range(5):
            b = a + arc * i / 4
            for s in (0, 1):
                vs.append(base + Vector((math.cos(b) * rr, math.sin(b) * rr, s * rng.uniform(0.12, 0.3))))
        m.add(vs, [(i * 2, i * 2 + 2, i * 2 + 3, i * 2 + 1) for i in range(4)], "Wood", dark)
    green = mix(pal["foliageAlt"], (0.36, 0.42, 0.08), 0.35)
    blobs = []
    for k in range(10):
        t = 0.36 + k * 0.06
        a = k * 2.4 + rng.uniform(-0.4, 0.4)
        rr = R * rng.uniform(0.34, 0.5) * (1.15 - abs(t - 0.62))
        c = Vector((bend * t * t + math.cos(a) * R * 0.42, math.sin(a) * R * 0.42, h * t + h * rng.uniform(0.02, 0.1)))
        blobs.append((c, rr))
        branch(m, rng, Vector((bend * t * t, 0, h * (t - 0.08))), c, h * 0.008, bark)
    blobs.append((Vector((bend, 0, h * 0.9)), R * 0.34))
    crown(m, rng, blobs, mul(green, 0.6), mix(mul(green, 1.5), (0.5, 0.5, 0.08), 0.2), max(0.5, R * 0.115), per_area=0.5)
    return m


def pine_tree(rng, pal, size, variant):
    m = M()
    h = size[2]
    R = max(size[0], size[1]) * 0.5
    bark = mul(pal["wood"], 0.8)
    trunk(m, rng, h * 0.92, max(0.4, h * 0.02), bark, lean=0.015, flare=1.6, n=8)
    green = mix(pal["foliage"], (0.03, 0.09, 0.06), 0.45)
    tiers = max(7, int(h / 3.6))
    for i in range(tiers):
        t = i / (tiers - 1)
        z = h * (0.16 + 0.8 * t)
        rr = R * (1 - t) ** 0.85 + R * 0.07
        n = max(6, int(8 + 10 * (1 - t)))
        for layer in range(2):
            for k in range(n):
                a = (k + layer * 0.5 + rng.uniform(-0.18, 0.18)) / n * math.tau
                L = rr * rng.uniform(0.82, 1.12) * (1 - 0.22 * layer)
                d = Vector((math.cos(a), math.sin(a), 0))
                s = Vector((-d.y, d.x, 0))
                w = L * 0.24 + 0.25
                z2 = z + layer * h * 0.03
                droop = L * rng.uniform(0.32, 0.5)
                up = Vector((0, 0, 1))
                vs = [up * (z2 + L * 0.16), d * L * 0.55 + s * w + up * (z2 + L * 0.02), d * L * 0.55 + up * (z2 + L * 0.02 + w * 0.28), d * L * 0.55 - s * w + up * (z2 + L * 0.02), d * L + up * (z2 - droop)]
                low = vary(rng, mul(green, 0.55 + 0.35 * t), 0.1)
                tip = vary(rng, mix(mul(green, 1.9), (0.2, 0.3, 0.12), 0.25), 0.12)
                cen = up * (z2 - L * 0.4)
                m.add(vs, [(0, 1, 2), (0, 2, 3), (1, 4, 2), (2, 4, 3)], "Leaf", lambda q, a1=low, b1=tip, LL=L: mix(a1, b1, min(1, math.hypot(q.x, q.y) / LL) ** 1.6), smooth=True, normals=[(v - cen).normalized() + up * 0.3 for v in vs])
    return m


def dead_tree(rng, pal, size, variant):
    m = M()
    h = size[2]
    bark = mul(mix(pal["wood"], (0.2, 0.18, 0.16), 0.5), 0.8)
    pts = trunk(m, rng, h * 0.75, max(0.5, h * 0.04), bark, lean=0.12)

    def grow(a, d, L, r, depth):
        b = a + d * L
        m.tube([a, (a + b) / 2 + Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 0.05)) * L, b], [r, r * 0.7, r * 0.4], "Wood", bark, n=5, cap=False)
        if depth:
            for _ in range(2 + (rng.random() < 0.4)):
                grow(b, (d + Vector((rng.uniform(-0.9, 0.9), rng.uniform(-0.9, 0.9), rng.uniform(-0.1, 0.7)))).normalized(), L * 0.62, r * 0.5, depth - 1)

    for k in range(5):
        grow(pts[3 + k % 3], Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0.3, 1))).normalized(), h * 0.22, h * 0.016, 2)
    return m


def bush(rng, pal, size, variant):
    m = M()
    R = max(size[0], size[1]) * 0.5
    h = size[2]
    green = mix(pal["foliage"], pal["foliageAlt"], rng.random())
    blobs = []
    for k in range(4):
        a = k * 1.7 + rng.uniform(-0.5, 0.5)
        rr = R * rng.uniform(0.4, 0.58)
        blobs.append((Vector((math.cos(a) * R * 0.42, math.sin(a) * R * 0.42, rr * 0.75)), rr))
    blobs.append((Vector((0, 0, h * 0.5)), R * 0.55))
    crown(m, rng, blobs, mul(green, 0.5), mul(green, 1.5), max(0.28, R * 0.13), per_area=0.5)
    if variant % 3 == 0:
        berry = rng.choice([(0.55, 0.03, 0.05), (0.75, 0.25, 0.35), (0.8, 0.75, 0.6)])
        for _ in range(14):
            c, r = rng.choice(blobs)
            d = Vector((rng.gauss(0, 1), rng.gauss(0, 1), abs(rng.gauss(0, 1)))).normalized()
            m.ball(c + d * r * 1.05, 0.13, "SmoothPlastic", berry, sub=1)
    return m


def blade(m, rng, p, h, w, col, lean):
    a = rng.uniform(0, math.tau)
    s = Vector((math.cos(a), math.sin(a), 0)) * w
    l = Vector((math.cos(a + 1.5), math.sin(a + 1.5), 0)) * lean
    up = Vector((0, 0, 1))
    vs = [p - s, p + s, p + l * 0.35 + s * 0.7 + up * h * 0.55, p + l * 0.35 - s * 0.7 + up * h * 0.55, p + l + up * h]
    z0 = p.z
    m.add(vs, [(0, 1, 2, 3), (3, 2, 4)], "Leaf", lambda q: mul(col, 0.55 + 0.85 * max(0, (q.z - z0) / h)), smooth=True, normals=[(0, 0, 1)] * 5)


def grass(rng, pal, size, variant):
    m = M()
    R = max(0.9, max(size[0], size[1]) * 0.5)
    green = mix(mix(pal["foliage"], pal["foliageAlt"], rng.random()), (0.22, 0.28, 0.05), 0.25)
    for _ in range(34):
        a, r = rng.uniform(0, math.tau), R * 1.25 * math.sqrt(rng.random())
        blade(m, rng, Vector((math.cos(a) * r, math.sin(a) * r, -0.05)), rng.uniform(0.4, 1.0) * max(0.8, min(1.35, size[2])), rng.uniform(0.05, 0.1), vary(rng, green, 0.2), rng.uniform(0.2, 0.75))
    return m


PETALS = [(0.75, 0.08, 0.1), (0.85, 0.62, 0.06), (0.8, 0.8, 0.78), (0.35, 0.18, 0.6), (0.8, 0.3, 0.45), (0.15, 0.25, 0.65)]


def flower(rng, pal, size, variant):
    m = M()
    petal = PETALS[variant % len(PETALS)]
    green = mul(pal["foliage"], 1.1)
    up = Vector((0, 0, 1))
    for _ in range(5):
        a, r = rng.uniform(0, math.tau), rng.uniform(0, 0.7)
        p = Vector((math.cos(a) * r, math.sin(a) * r, 0))
        top = p + Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), rng.uniform(0.8, 1.5)))
        m.tube([p, (p + top) / 2, top], [0.035, 0.03, 0.025], "Leaf", green, n=4, cap=False)
        c = vary(rng, petal, 0.12)
        for k in range(6):
            b = k / 6 * math.tau
            d = Vector((math.cos(b), math.sin(b), 0))
            s = Vector((-d.y, d.x, 0))
            m.add([top, top + d * 0.16 + s * 0.09 + up * 0.07, top + d * 0.32 + up * 0.04, top + d * 0.16 - s * 0.09 + up * 0.07], [(0, 1, 2, 3)], "Leaf", c, normals=[(0, 0, 1)] * 4, smooth=True)
        m.ball(top + up * 0.04, 0.08, "SmoothPlastic", (0.7, 0.45, 0.05), sub=1)
        for _ in range(2):
            blade(m, rng, p, rng.uniform(0.3, 0.6), 0.07, green, 0.3)
    return m


def flower_patch(rng, pal, size, variant):
    m = M()
    R = max(size[0], size[1]) * 0.45
    for k in range(13):
        a, r = rng.uniform(0, math.tau), R * math.sqrt(rng.random())
        piece = grass(rng, pal, (1.4, 1.4, 1.1), variant) if k > 8 else flower(rng, pal, size, variant if rng.random() < 0.7 else rng.randint(0, 5))
        m.merge(piece, Matrix.Translation((math.cos(a) * r, math.sin(a) * r, 0)))
    return m


def log(rng, pal, size, variant):
    m = M()
    L = max(size[0], size[1])
    r = size[2] * 0.42
    bark = pal["wood"]
    moss = (0.08, 0.16, 0.03)
    m.tube([(-L / 2, 0, r * 0.8), (0, rng.uniform(-0.2, 0.2), r * 0.86), (L / 2, 0, r * 0.8)], [r, r * 0.95, r * 0.86], "Wood", lambda q: mix(mul(bark, 0.8 + noise.noise(q * 1.4) * 0.25), moss, max(0, min(0.75, (q.z - r * 1.2) * 0.9 + noise.noise(q) * 0.4))), n=10, wobble=0.07, rng=rng, cap=False)
    for s in (-1, 1):
        m.tube([(s * L / 2, 0, r * 0.8), (s * (L / 2 + 0.03), 0, r * 0.8)], [r * 0.9, r * 0.86], "Wood", (0.42, 0.29, 0.16), n=10)
    for _ in range(3):
        m.ball((rng.uniform(-0.4, 0.4) * L, rng.uniform(-0.3, 0.3) * r, r * 1.6), 0.22, "SmoothPlastic", (0.5, 0.13, 0.07), sub=1, squash=(1, 1, 0.55))
    return m


def rock(rng, pal, size, variant, moss=True, cuts=11):
    """An icosphere chiselled by planes: flat broken faces, moss on what looks up."""
    m = M()
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1)
    planes = [(Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0.1, 0.8))).normalized(), rng.uniform(0.6, 0.86)) for _ in range(cuts)]
    vs = []
    for v in bm.verts:
        p = v.co.copy()
        for n, d in planes:
            k = p.dot(n) - d
            if k > 0:
                p -= n * k
        p *= 1 + noise.noise(p * 3.1 + Vector((variant, 0, 0))) * 0.05
        vs.append(Vector((p.x * size[0] * 0.6, p.y * size[1] * 0.6, p.z * size[2] * 0.62 + size[2] * 0.42)))
    fs = [[v.index for v in f.verts] for f in bm.faces]
    bm.free()
    base = vary(rng, pal["stone"], 0.12)
    cols = []
    for f in fs:
        n = (vs[f[1]] - vs[f[0]]).cross(vs[f[2]] - vs[f[0]]).normalized()
        mid = (vs[f[0]] + vs[f[1]] + vs[f[2]]) / 3
        c = mul(base, 0.72 + 0.3 * max(0, n.z) + noise.noise(mid * 0.8) * 0.16)
        if moss and n.z > 0.45 and noise.noise(mid * 0.5 + Vector((variant * 3, 0, 0))) > -0.05:
            c = mix(c, mul(pal["foliage"], 0.85), min(0.8, (n.z - 0.4) * 1.5))
        cols.append(mul(c, 0.7 + 0.3 * min(1, max(0, mid.z / (size[2] * 0.3)))))
    m.add(vs, fs, "Rock", cols)
    return m


def rock_cluster(rng, pal, size, variant):
    m = M()
    for k in range(5):
        a = k * 1.3 + rng.uniform(-0.4, 0.4)
        s = rng.uniform(0.35, 0.62) if k else 0.75
        r = 0.36 if k else 0
        m.merge(rock(rng, pal, (size[0] * s, size[1] * s, size[2] * s), variant + k), Matrix.Translation((math.cos(a) * size[0] * r, math.sin(a) * size[1] * r, 0)) @ Matrix.Rotation(rng.uniform(0, 6), 4, "Z"))
    return m


def fern(rng, pal, size, variant):
    m = M()
    green = mul(mix(pal["foliage"], (0.06, 0.2, 0.04), 0.4), 1.1)
    up = Vector((0, 0, 1))
    for k in range(9):
        a = k / 9 * math.tau + rng.uniform(-0.2, 0.2)
        d = Vector((math.cos(a), math.sin(a), 0))
        s = Vector((-d.y, d.x, 0))
        L = rng.uniform(1.4, 2.1)
        prev = None
        for i in range(7):
            t = i / 6
            p = d * L * t + up * (1.2 * math.sin(t * 2.4) * (1 - 0.25 * t) + 0.05)
            w = 0.42 * math.sin(math.pi * min(1, t * 0.9 + 0.1))
            row = [p - s * w, p + up * 0.04, p + s * w]
            if prev:
                m.add(prev + row, [(0, 1, 4, 3), (1, 2, 5, 4)], "Leaf", mul(vary(rng, green, 0.12), 0.75 + 0.5 * t), smooth=True, normals=[(0, 0, 1)] * 6)
            prev = row
    return m


def outcrop(rng, pal, size, variant):
    """Broken strata for steep ground: tilted slabs of chiselled rock, mossy on top."""
    m = M()
    for k in range(6):
        a = k * 1.05 + rng.uniform(-0.3, 0.3)
        s = (size[0] * rng.uniform(0.4, 0.62), size[1] * rng.uniform(0.3, 0.5), size[2] * rng.uniform(0.45, 0.95))
        xf = Matrix.Translation((math.cos(a) * size[0] * 0.3, math.sin(a) * size[1] * 0.28, -size[2] * 0.25)) @ Matrix.Rotation(rng.uniform(-0.25, 0.25), 4, "X") @ Matrix.Rotation(rng.uniform(0, 3.1), 4, "Z")
        m.merge(rock(rng, pal, s, variant * 7 + k, cuts=13), xf)
    return m


def crystals(rng, pal, size, variant):
    m = M()
    c = rng.choice([(0.12, 0.5, 0.62), (0.4, 0.14, 0.6), (0.16, 0.55, 0.25)])
    m.merge(rock(rng, pal, (size[0], size[1], size[2] * 0.35), variant))
    for k in range(7):
        a = k * 0.9 + rng.uniform(-0.3, 0.3)
        h = size[2] * rng.uniform(0.45, 1.0) * (1 if k else 1.1)
        r = h * 0.13
        p = Vector((math.cos(a), math.sin(a), 0)) * size[0] * (0.22 if k else 0)
        d = (Vector((math.cos(a), math.sin(a), 0)) * (0.4 if k else 0) + Vector((0, 0, 1))).normalized()
        m.tube([p, p + d * h * 0.75, p + d * h], [r * 0.85, r, 0.02], "Glass", lambda q: mix(mul(c, 0.5), mul(c, 1.6), min(1, max(0, q.z / h))), n=6, smooth=False, cap=False)
    return m


FLORA = {
    "fern": fern,
    "round_tree": round_tree, "birch": birch, "pine_tree": pine_tree, "snow_pine": pine_tree, "dead_tree": dead_tree, "burnt_tree": dead_tree,
    "bush": bush, "grass": grass, "flower": flower, "flower_patch": flower_patch, "log": log, "boulder": rock, "rock_cluster": rock_cluster,
    "stone": lambda r, p, s, v: rock(r, p, s, v, cuts=8), "cliff_block": lambda r, p, s, v: rock(r, p, s, v, cuts=16), "crystal_cluster": crystals,
}
