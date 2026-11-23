"""Roofs, apart from what they cover. One function lays courses over any profile: gable, hip, half-hip, mansard, catslide,
pavilion; it knows its thickness, its eaves, its ridge, its drainage, and never leaves a gap over the wall under it."""
import math
from mathutils import Vector, Matrix, noise
from wf_mesh import M, mix, mul, vary
from wf_arch import rotz, beam, wall

MATS = {"tile": "Roof", "slate": "Roof", "thatch": "Thatch", "plank": "WoodPlanks", "metal": "Panel"}


def profile(kind, v):
    """Height kept (1 at the ridge, 0 at the eave) at fraction v of the way out."""
    if kind == "mansard":  # shallow above, steep below
        return 1 - v * 0.42 / 0.6 if v < 0.6 else 0.58 * (1 - (v - 0.6) / 0.4)
    if kind == "bell":  # kicks out at the eave
        return (1 - v) ** 1.18
    return 1 - v


def roof(m, rng, pal, w, d, z, pitch, kind="tile", col=None, *, shape="gable", over=1.5, sag=0.35, flare=0.5, hip=0.0, cat=1.0, x=0.0, y=0.0, axis="x", gables=True, wall_mat="Concrete", wall_col=None, timber=True, gutter=False, lower=0.0):
    """`hip` 0..1: 0 a gable, 1 a full hip, between a clipped gable. `cat` > 1 draws the front slope out and down (catslide)."""
    R = M()
    col = col or pal["roof"]
    mat = MATS.get(kind, "Roof")
    thick = 0.85 if kind == "thatch" else 0.34
    half = d / 2 + over
    L = w + over * 2
    h = half * pitch
    base = z - over * pitch + 0.3 + sag * 0.5  # the wall plate stays under the tiles even where the ridge sags
    run = {1: half * cat, -1: half}
    top = base + h

    def point(u, v, s, lift=0.0):
        """u along the ridge (-1..1), v from the ridge (0) to the eave (1), s the side."""
        cut = hip * min(half, L * 0.45) * (1 - v)
        px = u * (L / 2 - cut)
        dip = -sag * (1 - u * u) * (1 - v * 0.6)
        hs = h * (run[s] / half)
        zz = top - hs * (1 - profile(shape, v))
        fl = flare * max(0.0, (v - 0.68) / 0.32) ** 2
        n = Vector((0, s * hs, run[s])).normalized()
        return Vector((px, s * run[s] * v, zz + dip + fl)) + n * lift

    def strip(pts_a, pts_b, v_row, ulen, jitter=True):
        """One course segment: a quad and its lip."""
        A, B = pts_a
        D, C = pts_b
        low = [C - Vector((0, 0, 0.2)), D - Vector((0, 0, 0.2))]
        c = vary(rng, mul(col, 0.9 + 0.2 * noise.noise(Vector((A.x * 0.12, A.y * 0.12, A.z * 0.2)))), 0.06)
        q = [(0, 1, 2, 3), (3, 2, 4, 5)]
        if (B - A).cross(D - A).z < 0:
            q = [f[::-1] for f in q]
        u0, u1 = ulen
        uv = [(u0, v_row + 1.1), (u1, v_row + 1.1), (u1, v_row), (u0, v_row), (u1, v_row - 0.15), (u0, v_row - 0.15)]
        if kind == "plank":
            uv = [(b, a) for a, b in uv]
        R.add([A, B, C, D, *low], q, mat, c, uv=uv)

    segs = max(3, int(L / 2.8))
    for s in (-1, 1):
        slope = math.hypot(run[s], h * run[s] / half)
        rows = max(4, int(slope / (1.08 if kind != "thatch" else 1.9)))
        for r in range(rows):
            v0, v1 = max(0, r / rows - 0.22 / rows), (r + 1) / rows + 0.1 / rows
            for k in range(segs):
                u0, u1 = -1 + 2 * k / segs, -1 + 2 * (k + 1) / segs
                l1 = (0.2 if kind != "thatch" else 0.3) + rng.uniform(-0.05, 0.05)
                strip((point(u0, v0, s, 0.04), point(u1, v0, s, 0.04)), (point(u0, v1, s, l1), point(u1, v1, s, l1)), rows - r, (u0 * L / 2 + r * 3.37, u1 * L / 2 + r * 3.37))
        us = [-1 + 2 * k / 5 for k in range(6)]
        for u0, u1 in zip(us, us[1:]):
            for v0, v1 in ((0, 0.4), (0.4, 0.75), (0.75, 1)):
                q = [point(u0, v0, s, -thick), point(u1, v0, s, -thick), point(u1, v1, s, -thick), point(u0, v1, s, -thick)]
                R.add(q, [(0, 1, 2, 3) if (q[1] - q[0]).cross(q[3] - q[0]).z < 0 else (3, 2, 1, 0)], "WoodPlanks", mul(pal["wood"], 0.55))
        e0, e1 = point(-1, 1, s, -thick * 0.45), point(1, 1, s, -thick * 0.45)
        if kind == "thatch":
            R.tube([e0, (e0 + e1) / 2, e1], [0.5, 0.52, 0.5], "Thatch", mul(col, 0.8), n=6)
        else:
            beam(R, rng, e0, e1, 0.24, thick + 0.12, pal["wood"])
            if gutter:
                g0, g1 = point(-1, 1.02, s, -0.1), point(1, 1.02, s, -0.1)
                R.tube([g0, g1], [0.24, 0.24], "Metal", (0.5, 0.5, 0.5), n=6)
            else:
                n = int(L / 2.2)
                for k in range(n):
                    u = -1 + 2 * (k + 0.5) / n
                    beam(R, rng, point(u, 0.76, s, -thick - 0.2), point(u, 1.0, s, -thick - 0.12), 0.28, 0.34, mul(pal["wood"], 0.85))
    if hip > 0.02:  # the end slopes
        for e in (-1, 1):
            ridge = point(e, 0, 1)
            vend = 1.0
            rows = max(3, int(math.hypot(half, h) * 0.95 / 1.08))
            for r in range(rows):
                t0, t1 = max(0, r / rows - 0.2 / rows), (r + 1) / rows + 0.08 / rows
                if t1 > 1.02:
                    t1 = 1.02
                a0, b0 = point(e, t0, -1, 0.05), point(e, t0, 1, 0.05)
                a1, b1 = point(e, t1, -1, 0.2), point(e, t1, 1, 0.2)
                n = max(1, int((b1 - a1).length / 2.8))
                for k in range(n):
                    f0, f1 = k / n, (k + 1) / n
                    strip((a0.lerp(b0, f0), a0.lerp(b0, f1)), (a1.lerp(b1, f0), a1.lerp(b1, f1)), rows - r, (f0 * (b1 - a1).length, f1 * (b1 - a1).length))
            for s in (-1, 1):  # hip tiles
                prev = None
                for i in range(7):
                    p = point(e, i / 6, s, 0.16)
                    if prev is not None:
                        R.tube([prev, p], [0.34, 0.34], mat, vary(rng, mul(col, 0.82), 0.08), n=6)
                    prev = p
            e0, e1 = point(e, vend, -1, -thick * 0.45), point(e, vend, 1, -thick * 0.45)
            if hip > 0.02:
                beam(R, rng, e0, e1, 0.24, thick + 0.12, pal["wood"])
                R.add([e0, e1, ridge - Vector((0, 0, thick))], [(0, 1, 2), (2, 1, 0)], "WoodPlanks", mul(pal["wood"], 0.5))
    if hip <= 0.02:
        for e in (-1, 1):
            for s in (-1, 1):
                prev = None
                for i in range(7):
                    p = point(e, i / 6, s, 0.06)
                    if prev is not None:
                        beam(R, rng, prev, p, 0.3, 0.62 if kind != "thatch" else 0.9, mul(pal["wood"], 0.95) if kind != "thatch" else mul(col, 0.8))
                    prev = p
    n = max(4, int(L / 1.6))
    line = [point(-1 + 2 * k / n, 0, 1, 0.12) for k in range(n + 1)]
    for a, b in zip(line, line[1:]):
        if (b - a).length < 0.05:
            continue
        if kind == "thatch":
            R.tube([a, b], [0.55, 0.55], "Thatch", vary(rng, mul(col, 0.85), 0.08), n=7)
        else:
            R.tube([a + Vector((0, 0, -0.08)), b], [0.36, 0.4], mat, vary(rng, mul(col, 0.82), 0.1), n=7)
    if kind in ("tile", "slate") and flare > 0.2:
        for e in (-1, 1):
            p = point(e, 0, 1, 0.1)
            R.tube([p - Vector((0, 0, 0.4)), p + Vector((0, 0, 1.0)), p + Vector((0, 0, 1.5))], [0.18, 0.16, 0.02], "Wood", pal["wood"], n=6)
    if gables and hip <= 0.02:
        wc = wall_col or pal["wall"]
        for e in (-1, 1):
            gx = w / 2 + 0.02
            vs, back = [], []
            m_h = lambda yy: top - h * (1 - profile(shape, min(1, abs(yy) / half))) - 0.3
            steps = 9
            ys = [-d / 2 + d * i / (steps - 1) for i in range(steps)]
            for yy in ys:
                vs.append(Vector((e * gx, yy, z - 0.1)))
                vs.append(Vector((e * gx, yy, max(z - 0.05, m_h(yy)))))
            fs = []
            for i in range(steps - 1):
                f = (i * 2, i * 2 + 2, i * 2 + 3, i * 2 + 1)
                fs.append(f if e > 0 else f[::-1])
            R.add(vs, fs, wall_mat, wc)
            R.add([p - Vector((e * 0.4, 0, 0)) for p in vs], [f[::-1] for f in fs], wall_mat, mul(wc, 0.8))
            if timber:
                fx = e * (gx + 0.16)
                peak = m_h(0)
                beam(R, rng, (fx, -d / 2 - 0.1, z + 0.1), (fx, d / 2 + 0.1, z + 0.1), 0.55, 0.6, pal["wood"])
                beam(R, rng, (fx, 0, z), (fx, 0, peak - 0.3), 0.5, 0.5, pal["wood"])
                ch = (peak - z) * 0.5
                beam(R, rng, (fx, -d * 0.24, z + ch), (fx, d * 0.24, z + ch), 0.42, 0.46, pal["wood"])
                for s in (-1, 1):
                    beam(R, rng, (fx, s * d * 0.24, z + 0.2), (fx, s * d * 0.24, z + ch), 0.42, 0.42, pal["wood"])
                    beam(R, rng, (fx, s * d * 0.42, z + 0.3), (fx, s * d * 0.28, z + ch * 0.75), 0.3, 0.32, pal["wood"])
    m.merge(R, Matrix.Translation((x, y, 0)) @ (rotz(90) if axis == "y" else Matrix()))
    return top


def dome(m, rng, c, r, mat, col, n=20, rows=8, squash=0.9, finial=True):
    x, y, z = c
    ring = lambda t: (math.cos(t) * r, math.sin(t) * r * squash)
    prev = None
    for i in range(rows + 1):
        t = i / rows * math.pi / 2
        rr, zz = ring(t)
        cur = [Vector((x + math.cos(a / n * math.tau) * rr, y + math.sin(a / n * math.tau) * rr, z + zz)) for a in range(n)]
        if prev:
            vs = prev + cur
            m.add(vs, [(k, (k + 1) % n, n + (k + 1) % n, n + k) for k in range(n)], mat, vary(rng, col, 0.02), smooth=True)
        prev = cur
    m.tube([(x, y, z - 0.5), (x, y, z - 0.1), (x, y, z + 0.15)], [r * 1.06, r * 1.08, r * 1.0], mat, mul(col, 1.05), n=n, smooth=False)
    if finial:
        top = z + r * squash
        m.tube([(x, y, top - 0.2), (x, y, top + 0.7), (x, y, top + 1.4), (x, y, top + 2.4)], [0.5, 0.2, 0.3, 0.03], "Metal", (0.6, 0.45, 0.14), n=8)
