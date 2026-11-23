"""City buildings from a facade grammar.

A facade is a grid of bays and storeys; a rhythm says which bay is solid, glazed, recessed, balconied or a pier, and
changes with the storey (base, shaft, mechanical floor, crown). A massing says how the volumes step, shift and taper.
Family x rhythm x massing x crown x materials, each conditioned by the others: no two towers share a silhouette.
"""
import math
from mathutils import Vector, Matrix
from wf_mesh import M, mix, mul, vary
from wf_arch import rotz, wall, beam
from wf_build import IRON, climbing, pot
from wf_modern import FRAME, PANE, ac_unit, downpipe, pane, rooftop

UP = Vector((0, 0, 1))
GLASSES = [(0.08, 0.13, 0.17), (0.06, 0.12, 0.13), (0.12, 0.13, 0.14), (0.05, 0.09, 0.15), (0.14, 0.12, 0.1)]
STONES = [(0.62, 0.58, 0.5), (0.7, 0.66, 0.6), (0.46, 0.42, 0.38), (0.55, 0.46, 0.38)]
BRICKS = [(0.42, 0.2, 0.14), (0.5, 0.3, 0.2), (0.34, 0.16, 0.13), (0.56, 0.42, 0.32)]
METALS = [(0.2, 0.21, 0.22), (0.5, 0.5, 0.5), (0.3, 0.24, 0.18), (0.16, 0.18, 0.2)]
LIT = (0.85, 0.66, 0.4)


class Face:
    """One side of a volume: u along it, z up, n out."""

    def __init__(self, m, rng, a, b, out):
        self.m, self.rng = m, rng
        self.a, self.b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
        self.L = (self.b - self.a).length
        self.d = (self.b - self.a).normalized()
        self.o = Vector((out[0], out[1], 0)).normalized()
        self.ang = math.degrees(math.atan2(self.d.y, self.d.x))

    def box(self, u, z, w, h, depth, mat, col, off=0.0, bevel=0.0):
        c = self.a + self.d * u + self.o * (off + depth / 2) + UP * z
        self.m.box(c, (w, depth, h), mat, col, rot=(0, 0, self.ang), bevel=bevel)

    def glass(self, u, z, w, h, col, off=0.02, lit=0.14):
        on = self.rng.random() < lit
        self.box(u, z, w, h, 0.12, "Glow" if on else "Glass", mul(LIT, self.rng.uniform(0.5, 0.8)) if on else vary(self.rng, col, 0.1), off)


def faces(m, rng, x0, x1, y0, y1):
    return [Face(m, rng, (x1, y1), (x0, y1), (0, 1)), Face(m, rng, (x0, y0), (x1, y0), (0, -1)), Face(m, rng, (x1, y0), (x1, y1), (1, 0)), Face(m, rng, (x0, y1), (x0, y0), (-1, 0))]


def skin(f, z0, z1, fh, style, s):
    """Covers one face between two heights in the manner of `style`."""
    rng = f.rng
    fl = max(1, int(round((z1 - z0) / fh)))
    fh = (z1 - z0) / fl
    glass, frame, solid, smat = s["glass"], s["frame"], s["solid"], s["mat"]
    if style == "curtain":  # glass wall: mullions, spandrels, a deeper fin every few bays
        nb = max(3, int(f.L / s["bay"]))
        f.box(f.L / 2, (z0 + z1) / 2, f.L, z1 - z0, 0.1, "Glass", glass, 0.0)
        for k in range(nb + 1):
            deep = k % s["fin"] == 0
            f.box(f.L * k / nb, (z0 + z1) / 2, 0.32 if deep else 0.16, z1 - z0, 0.6 if deep else 0.24, "Metal", frame, 0.06)
        for j in range(fl + 1):
            f.box(f.L / 2, z0 + j * fh, f.L, 0.9 if j % s["band"] == 0 else 0.34, 0.2, "Panel" if j % s["band"] == 0 else "Metal", frame if j % s["band"] else mul(frame, 1.3), 0.05)
        for j in range(fl):
            for k in range(nb):
                if rng.random() < 0.1:
                    f.box(f.L * (k + 0.5) / nb, z0 + (j + 0.5) * fh, f.L / nb - 0.3, fh - 0.7, 0.06, "Glow", mul(LIT, rng.uniform(0.35, 0.75)), 0.1)
    elif style == "punched":  # solid wall, deep-set windows in groups
        nb = max(2, int(f.L / s["bay"]))
        bw = f.L / nb
        group = s["fin"]
        for j in range(fl):
            zc = z0 + (j + 0.52) * fh
            for k in range(nb):
                if (k % (group + 1)) == group and nb > 3:
                    continue
                w = bw * s["open"]
                h = fh * s["tall"]
                f.glass(f.L * (k + 0.5) / nb, zc, w, h, glass, 0.02)
                u = f.L * (k + 0.5) / nb
                for sg in (-1, 1):
                    f.box(u + sg * (w / 2 + 0.16), zc, 0.32, h + 0.6, 0.42, smat, mul(solid, 1.12), 0.0, 0.04)
                f.box(u, zc - h / 2 - 0.2, w + 0.8, 0.36, 0.62, "RealConcrete", s["trim"], 0.0, 0.05)
                f.box(u, zc + h / 2 + 0.22, w + 0.7, 0.4, 0.46, smat, mul(solid, 1.12), 0.0, 0.05)
                f.box(u, zc, 0.14, h, 0.2, "SmoothPlastic", frame, 0.06)
                f.box(u, zc + h * 0.2, w, 0.14, 0.2, "SmoothPlastic", frame, 0.06)
            if j % s["band"] == 0 and j:
                f.box(f.L / 2, z0 + j * fh, f.L + 0.3, 0.6, 0.4, "RealConcrete", s["trim"], 0.0, 0.08)
    elif style == "ribbon":  # bands of window and wall
        for j in range(fl):
            zc = z0 + (j + 0.56) * fh
            f.box(f.L / 2, zc, f.L - 0.5, fh * 0.5, 0.1, "Glass", glass, 0.02)
            nb = max(3, int(f.L / 2.4))
            for k in range(nb + 1):
                f.box(0.25 + (f.L - 0.5) * k / nb, zc, 0.16, fh * 0.5, 0.2, "Metal", frame, 0.04)
            f.box(f.L / 2, zc + fh * 0.28, f.L, 0.2, 0.7, smat, mul(solid, 1.1), 0.0, 0.04)
            f.box(f.L / 2, zc - fh * 0.28, f.L, 0.24, 0.4, smat, mul(solid, 1.06), 0.0, 0.04)
            for _ in range(int(f.L / 10)):
                f.box(rng.uniform(1, max(1.2, f.L - 1)), zc, 1.8, fh * 0.46, 0.06, "Glow", mul(LIT, rng.uniform(0.4, 0.8)), 0.09)
    elif style == "grid":  # exposed concrete frame, glass set back
        nb = max(2, int(f.L / s["bay"]))
        f.box(f.L / 2, (z0 + z1) / 2, f.L - 0.4, z1 - z0, 0.08, "Glass", glass, 0.0)
        for k in range(nb + 1):
            f.box(f.L * k / nb, (z0 + z1) / 2, 0.9, z1 - z0, 1.1, smat, solid, 0.0, 0.1)
        for j in range(fl + 1):
            f.box(f.L / 2, z0 + j * fh, f.L, 0.8, 0.95, smat, mul(solid, 1.06), 0.0, 0.08)
        for j in range(fl):
            for k in range(nb):
                u = f.L * (k + 0.5) / nb
                f.box(u, z0 + (j + 0.5) * fh, 0.16, fh - 0.8, 0.2, "Metal", frame, 0.06)
                if rng.random() < 0.16:
                    f.box(u, z0 + (j + 0.3) * fh, f.L / nb - 1.0, fh * 0.34, 0.16, "Panel", mix(solid, s["accent"], 0.6), 0.06)
                elif rng.random() < 0.12:
                    f.box(u - f.L / nb * 0.2, z0 + (j + 0.5) * fh, f.L / nb * 0.4, fh - 1.0, 0.06, "Glow", mul(LIT, 0.6), 0.1)
    elif style == "balcony":  # homes: slab edges, loggias, rails, the rhythm slides from storey to storey
        nb = max(2, int(f.L / s["bay"]))
        bw = f.L / nb
        for j in range(fl):
            zf = z0 + j * fh
            for k in range(nb):
                u = f.L * (k + 0.5) / nb
                kind = s["rhythm"][(k + (j // 2) * s["shift"]) % len(s["rhythm"])]
                if kind == "b":
                    f.glass(u, zf + fh * 0.48, bw * 0.78, fh * 0.8, glass, 0.02, 0.22)
                    f.box(u, zf + 0.1, bw * 0.96, 0.4, 2.4, "RealConcrete", s["trim"], 0.0, 0.05)
                    if s["rail"] == "glass":
                        f.box(u, zf + 1.6, bw * 0.92, 2.2, 0.1, "Glass", mul(glass, 1.6), 2.3)
                    else:
                        for q in range(max(4, int(bw / 0.7))):
                            f.box(u - bw * 0.46 + bw * 0.92 * q / max(4, int(bw / 0.7)), zf + 1.6, 0.1, 2.4, 0.1, "Metal", frame, 2.3)
                    f.box(u, zf + 2.85, bw * 0.94, 0.14, 0.18, "Metal", frame, 2.26)
                    for sg in (-1, 1):
                        f.box(u + sg * bw * 0.46, zf + 1.6, 0.1, 2.4, 2.3, "Glass" if s["rail"] == "glass" else "Metal", mul(glass, 1.6) if s["rail"] == "glass" else frame, 0.05) if s["rail"] == "glass" else None
                    f.box(u, zf + fh * 0.48, 0.14, fh * 0.8, 0.2, "SmoothPlastic", frame, 0.06)
                elif kind == "w":
                    f.glass(u, zf + fh * 0.55, bw * 0.5, fh * 0.5, glass, 0.02, 0.2)
                    f.box(u, zf + fh * 0.28, bw * 0.62, 0.26, 0.5, "RealConcrete", s["trim"], 0.0, 0.04)
                    f.box(u, zf + fh * 0.55, 0.12, fh * 0.5, 0.18, "SmoothPlastic", frame, 0.06)
                else:
                    f.box(u, zf + fh * 0.5, bw * 0.7, fh, 0.24, "Panel" if s["panel"] else "WoodPlanks", mix(solid, s["accent"], 0.35) if s["panel"] else (0.36, 0.24, 0.15), 0.0)
            f.box(f.L / 2, zf, f.L + 0.2, 0.4, 0.34, "RealConcrete", s["trim"], 0.0, 0.04)
    elif style == "pier":  # masonry piers running the full height, recessed windows and spandrels between
        nb = max(2, int(f.L / s["bay"]))
        bw = f.L / nb
        for k in range(nb + 1):
            main = k % 2 == 0
            f.box(f.L * k / nb, (z0 + z1) / 2, 1.2 if main else 0.6, z1 - z0, 0.9 if main else 0.55, smat, mul(solid, 1.06), 0.0, 0.08)
        for j in range(fl):
            for k in range(nb):
                u = f.L * (k + 0.5) / nb
                f.glass(u, z0 + (j + 0.6) * fh, bw - 1.1, fh * 0.62, glass, 0.02)
                f.box(u, z0 + (j + 0.14) * fh, bw - 0.9, fh * 0.28, 0.3, "Metal" if s["panel"] else smat, frame if s["panel"] else mul(solid, 0.86), 0.0, 0.04)
                f.box(u, z0 + (j + 0.6) * fh, 0.14, fh * 0.62, 0.2, "SmoothPlastic", frame, 0.06)


def louvres(m, rng, x0, x1, y0, y1, z0, z1, col):
    """A mechanical floor: the break in the shaft."""
    m.box(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0 - 1.4, y1 - y0 - 1.4, z1 - z0), "Panel", mul(col, 0.5))
    for f in faces(m, rng, x0 + 0.5, x1 - 0.5, y0 + 0.5, y1 - 0.5):
        n = max(4, int((z1 - z0) / 0.5))
        for k in range(n):
            f.box(f.L / 2, z0 + (z1 - z0) * (k + 0.5) / n, f.L, 0.16, 0.4, "Metal", col, -0.1)


def crown(m, rng, pal, kind, x0, x1, y0, y1, z, s):
    cx, cy, w, d = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0
    B = M()
    frame = s["frame"]
    if kind == "plant":
        rooftop(B, rng, pal, w, d, 0, 1.4)
    elif kind == "screen":  # the facade runs past the roof
        rooftop(B, rng, pal, w - 2.4, d - 2.4, 0, 0.8)
        for f in faces(B, rng, -w / 2, w / 2, -d / 2, d / 2):
            n = max(4, int(f.L / s["bay"]))
            for k in range(n + 1):
                f.box(f.L * k / n, 3.4, 0.36, 7.0, 0.5, "Metal", frame, -0.3)
            for zz in (2.4, 6.8):
                f.box(f.L / 2, zz, f.L, 0.4, 0.4, "Metal", frame, -0.3)
    elif kind == "spire":
        hh, ww, dd = 0.0, w, d
        for k in range(4):
            ww, dd = ww * 0.66, dd * 0.66
            h = 7.0 - k * 1.1
            B.box((0, 0, hh + h / 2), (ww, dd, h), s["mat"], mul(s["solid"], 1.05), bevel=0.2)
            for f in faces(B, rng, -ww / 2, ww / 2, -dd / 2, dd / 2):
                n = max(2, int(f.L / 2.4))
                for q in range(n):
                    f.box(f.L * (q + 0.5) / n, hh + h * 0.46, 0.9, h * 0.62, 0.1, "Glow" if k == 1 else "Glass", mul(LIT, 0.6) if k == 1 else s["glass"], 0.02)
                f.box(f.L / 2, hh + h, f.L + 0.5, 0.5, 0.5, "RealConcrete", s["trim"], -0.1, 0.06)
            hh += h
        B.tube([(0, 0, hh), (0, 0, hh + 6), (0, 0, hh + 20)], [1.2, 0.5, 0.08], "Metal", (0.62, 0.6, 0.56), n=8)
    elif kind == "wedge":  # a sloping glass top
        a = 11.0
        vs = [(-w / 2, -d / 2, 0), (w / 2, -d / 2, 0), (w / 2, d / 2, 0), (-w / 2, d / 2, 0), (-w / 2, -d / 2, a), (w / 2, -d / 2, a), (w / 2, d / 2, 1.0), (-w / 2, d / 2, 1.0)]
        B.add([Vector(v) for v in vs], [(3, 2, 6, 7), (0, 4, 5, 1), (0, 3, 7, 4), (1, 5, 6, 2), (4, 7, 6, 5)], "Glass", s["glass"])
        n = max(4, int(w / s["bay"]))
        for k in range(n + 1):
            x = -w / 2 + w * k / n
            beam(B, rng, (x, -d / 2, a + 0.1), (x, d / 2, 1.1), 0.24, 0.3, frame)
            B.box((x, -d / 2, a / 2), (0.24, 0.4, a), "Metal", frame)
        for k in range(6):
            t = k / 5
            B.box((0, -d / 2 + d * t, a + 0.12 + (1 - a) * t), (w, 0.26, 0.24), "Metal", frame)
    elif kind == "helipad":
        rooftop(B, rng, pal, w, d, 0, 0.7)
        r = min(w, d) * 0.36
        for k in range(8):
            a = k / 8 * math.tau
            beam(B, rng, (math.cos(a) * r * 0.5, math.sin(a) * r * 0.5, 0.2), (math.cos(a) * r * 0.9, math.sin(a) * r * 0.9, 5.2), 0.3, 0.3, frame)
        B.cyl((0, 0, 5.5), r, 0.6, "Asphalt", (0.14, 0.14, 0.15), n=28)
        B.tube([(0, 0, 5.82), (0, 0, 5.86)], [r * 0.82, r * 0.82], "SmoothPlastic", (0.8, 0.62, 0.08), n=28)
        B.tube([(0, 0, 5.84), (0, 0, 5.9)], [r * 0.74, r * 0.74], "Asphalt", (0.14, 0.14, 0.15), n=28)
        for x in (-r * 0.22, r * 0.22):
            B.box((x, 0, 5.95), (0.5, r * 0.8, 0.06), "SmoothPlastic", (0.85, 0.85, 0.82))
        B.box((0, 0, 5.95), (r * 0.44, 0.5, 0.06), "SmoothPlastic", (0.85, 0.85, 0.82))
    else:  # garden
        rooftop(B, rng, pal, w, d, 0, 0.4)
        for k in range(5):
            x, y = rng.uniform(-w * 0.34, w * 0.34), rng.uniform(-d * 0.3, d * 0.34)
            B.box((x, y, 0.8), (3.4, 1.6, 1.4), "WoodPlanks", (0.34, 0.23, 0.14), bevel=0.08)
            for _ in range(5):
                B.ball((x + rng.uniform(-1.4, 1.4), y + rng.uniform(-0.5, 0.5), 1.9 + rng.uniform(0, 0.5)), rng.uniform(0.5, 0.9), "Grass", vary(rng, pal["foliage"], 0.2), sub=2, disp=0.3, seed=rng.random() * 9)
        for sx in (-1, 1):
            for sy in (-1, 1):
                B.box((sx * w * 0.2, sy * d * 0.16, 2.4), (0.3, 0.3, 4.8), "Metal", frame)
        for k in range(7):
            B.box((0, -d * 0.18 + k * d * 0.06, 4.9), (w * 0.48, 0.3, 0.24), "WoodPlanks", (0.36, 0.24, 0.15))
    m.merge(B, Matrix.Translation((cx, cy, z)))


def street_level(m, rng, pal, x0, x1, y0, y1, h, s, kind):
    """The base of a city building: lobby, shops, arcade or plinth. The front is open to walk in."""
    w, d = x1 - x0, y1 - y0
    cx = (x0 + x1) / 2
    stone = s["trim"]
    m.box((cx, (y0 + y1) / 2, -1.6), (w + 0.8, d + 0.8, 4.2), "RealConcrete", (0.36, 0.36, 0.36), bevel=0.1)
    m.box((cx, (y0 + y1) / 2, 0.3), (w - 0.6, d - 0.6, 0.5), "RealConcrete", (0.5, 0.49, 0.47))
    m.box((cx, (y0 + y1) / 2, h - 0.3), (w - 0.4, d - 0.4, 0.6), "RealConcrete", (0.6, 0.6, 0.58))
    dw = 5.0
    back = y1 - (2.8 if kind == "arcade" else 0)
    wall(m, (x1, back), (x0, back), 0.4, h, 0.8, "RealConcrete" if kind != "brick" else s["mat"], mul(stone, 0.92) if kind != "brick" else s["solid"], [(w / 2 - dw / 2, w / 2 + dw / 2, 0.5, 8.0)])
    wall(m, (x0, y0), (x1, y0), 0.4, h, 0.8, s["mat"], s["solid"])
    for x, sg in ((x0, -1), (x1, 1)):
        wall(m, (x, y0), (x, back), 0.4, h, 0.8, s["mat"], s["solid"])
    side = w / 2 - dw / 2 - 1.2
    if kind == "arcade":
        n = max(3, int(w / 6))
        for k in range(n + 1):
            x = x0 + 0.7 + (w - 1.4) * k / n
            m.box((x, y1 - 0.6, h / 2), (1.3, 1.3, h), "RealConcrete", stone, bevel=0.12)
        m.box((cx, y1 - 1.5, h - 0.5), (w, 3.0, 1.0), "RealConcrete", mul(stone, 1.04), bevel=0.08)
    for sg in (-1, 1):
        x = cx + sg * (dw / 2 + 0.7 + side / 2)
        if side < 2:
            continue
        pane(m, rng, (x, back + 0.45, h * 0.47), 90, side - 0.3, h * 0.68, s["frame"], 0.85, 2, stone)
        if kind == "shops":
            c = vary(rng, pal["accent"] if sg > 0 else rng.choice([(0.1, 0.25, 0.3), (0.12, 0.3, 0.16), (0.36, 0.2, 0.08), (0.3, 0.1, 0.2)]), 0.12)
            if rng.random() < 0.6:
                q = max(4, int(side / 1.1))
                for k in range(q):
                    m.box((x - side / 2 + side * (k + 0.5) / q, y1 + 1.8, h * 0.8), (side / q - 0.02, 3.2, 0.14), "Fabric", c if k % 2 else (0.82, 0.8, 0.74), rot=(-22, 0, 0))
            m.box((x, y1 + 0.5, h - 0.9), (side - 0.2, 0.3, 1.3), "SmoothPlastic", mul(c, 0.7), bevel=0.06)
            m.box((x, y1 + 0.72, h - 0.9), (side * 0.6, 0.12, 0.5), "Glow", (0.95, 0.85, 0.6))
    for sg in (-1, 1):
        m.box((cx + sg * (dw / 2 + 0.3), back + 0.3, 4.2), (0.7, 1.2, 8.0), "RealConcrete", stone, bevel=0.08)
    m.box((cx, back + 1.4, 8.5), (dw + 3.4, 3.8, 0.5), "Metal", s["frame"], bevel=0.06)
    pane(m, rng, (cx + dw * 0.26, back - 0.1, 4.2), 90, dw * 0.46, 7.2, s["frame"], 0.9, 0, None)
    for k in range(2):
        m.box((cx, back + 1.6 + k, 0.3 - k * 0.35), (dw + 2 + k, 2.0, 0.4), "RealConcrete", (0.46, 0.46, 0.45), bevel=0.06)
    n = max(2, int(d / 6))
    for x, o in ((x0, -1), (x1, 1)):
        for k in range(n):
            y = y0 + (back - y0) * (k + 0.5) / n
            pane(m, rng, (x + o * 0.45, y, h * 0.5), 0 if o > 0 else 180, min(3.2, d / n - 1.2), h * 0.5, s["frame"], 0.5, 1, stone)
    m.box((cx, (y0 + y1) / 2, h), (w + 0.7, d + 0.7, 0.6), "RealConcrete", stone, bevel=0.1)


def palette_of(rng, pal, family):
    glass = rng.choice(GLASSES)
    frame = rng.choice(METALS)
    s = {"glass": glass, "frame": frame, "trim": vary(rng, rng.choice(STONES), 0.06), "accent": pal["accent"], "bay": rng.uniform(2.2, 3.4), "fin": rng.choice([2, 3, 4]), "band": rng.choice([1, 3, 4, 5]), "open": rng.uniform(0.5, 0.72), "tall": rng.uniform(0.5, 0.7),
         "rhythm": rng.choice(["bwb", "bbw", "bwwb", "wbsb", "bsbw", "bbs"]), "shift": rng.choice([0, 0, 1]), "rail": rng.choice(["glass", "bar"]), "panel": rng.random() < 0.5}
    mat, col = {"office": ("Panel", vary(rng, frame, 0.1)), "deco": ("Slate", vary(rng, rng.choice(STONES), 0.08)), "brick": ("Brick", vary(rng, rng.choice(BRICKS), 0.1)), "concrete": ("RealConcrete", vary(rng, (0.52, 0.51, 0.48), 0.1)), "render": ("Concrete", vary(rng, rng.choice([(0.66, 0.62, 0.54), (0.56, 0.6, 0.6), (0.68, 0.54, 0.42), (0.74, 0.72, 0.68)]), 0.06)), "home": ("Concrete", vary(rng, rng.choice([(0.72, 0.7, 0.66), (0.6, 0.56, 0.5), (0.5, 0.52, 0.54)]), 0.06))}[family]
    s["mat"], s["solid"] = mat, col
    return s


def volume(m, rng, pal, x0, x1, y0, y1, z0, z1, fh, style, s, core=None):
    m.box(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0), core or s["mat"], s["solid"])
    fs = faces(m, rng, x0, x1, y0, y1)
    for i, f in enumerate(fs):
        st = style if isinstance(style, str) else style[i % len(style)]
        skin(f, z0, z1, fh, st, s)


TOWERS = ["slab", "setback", "deco", "twin", "podium", "residential", "brutal", "shifted"]


def tower(rng, pal, size, variant):
    m = M()
    W, D, H = size[0] * 0.94, size[1] * 0.94, max(40.0, size[2] * rng.uniform(0.82, 1.08))
    kind = TOWERS[(variant * 3 + 1) % len(TOWERS)]
    fam = {"deco": "deco", "brutal": "concrete", "residential": "home"}.get(kind, rng.choice(["office", "office", "concrete", "deco"]))
    s = palette_of(rng, pal, fam)
    fh = rng.uniform(4.2, 5.0)
    gh = rng.uniform(10.0, 13.0)
    x, y = W / 2, D / 2
    base_kind = rng.choice(["arcade", "shops", "lobby"])
    if kind in ("slab", "shifted"):
        street_level(m, rng, pal, -x, x, -y, y, gh, s, base_kind)
        style = ["curtain", "curtain", "ribbon", "ribbon"] if kind == "slab" else "curtain"
        if kind == "slab":
            d2 = y * 0.8
            mid = gh + (H - gh) * rng.uniform(0.5, 0.68)
            volume(m, rng, pal, -x * 0.96, x * 0.96, -d2, d2, gh, mid, fh, style, s)
            louvres(m, rng, -x * 0.96, x * 0.96, -d2, d2, mid, mid + 4.4, s["frame"])
            volume(m, rng, pal, -x * 0.96, x * 0.96, -d2, d2, mid + 4.4, H, fh, style, s)
            for sg in (-1, 1):  # solid cores at the ends
                m.box((sg * x * 0.98, 0, (gh + H) / 2 + 2), (2.4, d2 * 1.1, H - gh + 4), "RealConcrete", s["trim"], bevel=0.15)
            crown(m, rng, pal, rng.choice(["screen", "plant", "helipad"]), -x * 0.96, x * 0.96, -d2, d2, H, s)
        else:  # boxes that slide over each other
            n = 4
            z = gh
            for k in range(n):
                h = (H - gh) / n
                ox, oy = rng.uniform(-0.08, 0.08) * W, rng.uniform(-0.07, 0.07) * D
                k2 = 0.86 - 0.03 * k
                volume(m, rng, pal, -x * k2 + ox, x * k2 + ox, -y * k2 + oy, y * k2 + oy, z, z + h - 1.2, fh, rng.choice(["curtain", "grid", "curtain", "ribbon"]), s)
                m.box((ox * 0.5, oy * 0.5, z + h - 0.6), (W * 0.62, D * 0.62, 1.2), "Panel", mul(s["frame"], 0.7))
                z += h
            crown(m, rng, pal, rng.choice(["garden", "plant", "screen"]), -x * k2 + ox, x * k2 + ox, -y * k2 + oy, y * k2 + oy, z - 1.2, s)
    elif kind in ("setback", "deco"):
        street_level(m, rng, pal, -x, x, -y, y, gh, s, "lobby" if kind == "deco" else base_kind)
        z, k2 = gh, 0.96
        n = 3 + variant % 2
        for k in range(n):
            h = (H - gh) * (0.42, 0.26, 0.2, 0.12)[k] / sum((0.42, 0.26, 0.2, 0.12)[:n])
            volume(m, rng, pal, -x * k2, x * k2, -y * k2, y * k2, z, z + h, fh, "pier" if kind == "deco" else ("curtain" if k else "grid"), s)
            z += h
            if k < n - 1:
                for f in faces(m, rng, -x * k2, x * k2, -y * k2, y * k2):
                    f.box(f.L / 2, z + 0.5, f.L + 0.3, 1.2, 0.5, "RealConcrete", s["trim"], -0.3, 0.1)
                m.box((0, 0, z + 0.1), (W * k2 - 1, D * k2 - 1, 0.2), "Gravel", (0.3, 0.29, 0.28))
                k2 *= rng.uniform(0.74, 0.84)
        crown(m, rng, pal, "spire" if kind == "deco" else rng.choice(["wedge", "screen", "helipad"]), -x * k2, x * k2, -y * k2, y * k2, z, s)
    elif kind == "twin":
        street_level(m, rng, pal, -x, x, -y, y, gh, s, base_kind)
        w2 = W * 0.4
        for sg, hh in ((-1, H), (1, H * rng.uniform(0.7, 0.88))):
            cx = sg * (x - w2 / 2)
            volume(m, rng, pal, cx - w2 / 2, cx + w2 / 2, -y * 0.9, y * 0.9, gh, hh, fh, "curtain" if sg < 0 else "grid", s)
            crown(m, rng, pal, "wedge" if sg < 0 else "plant", cx - w2 / 2, cx + w2 / 2, -y * 0.9, y * 0.9, hh, s)
        zb = gh + (H - gh) * 0.46
        volume(m, rng, pal, -x + w2 - 0.5, x - w2 + 0.5, -y * 0.4, y * 0.4, zb, zb + 8.5, fh, "curtain", s)
        m.box((0, 0, zb - 0.5), (W - w2 * 2 + 1, D * 0.46, 1.0), "Panel", s["frame"])
    elif kind == "podium":
        ph = gh + fh * 3
        street_level(m, rng, pal, -x, x, -y, y, gh, s, "shops")
        volume(m, rng, pal, -x, x, -y, y, gh, ph, fh, "grid", s)
        m.box((0, 0, ph + 0.1), (W - 1, D - 1, 0.2), "Gravel", (0.3, 0.29, 0.28))
        for k in range(6):
            px, py = rng.uniform(-x * 0.9, x * 0.9), y * rng.uniform(0.72, 0.92)
            m.box((px, py, ph + 0.8), (2.6, 1.4, 1.4), "WoodPlanks", (0.34, 0.23, 0.14), bevel=0.08)
            m.ball((px, py, ph + 2.0), 1.1, "Grass", vary(rng, pal["foliage"], 0.2), sub=2, disp=0.3, seed=k)
        ox = rng.choice([-1, 1]) * W * 0.12
        k2 = 0.66
        for q in range(8):
            a = q / 8 * math.tau
            m.box((ox + math.cos(a) * x * k2 * 0.8, math.sin(a) * y * k2 * 0.7 - D * 0.08, ph + 2.6), (1.2, 1.2, 5.2), "RealConcrete", s["trim"])
        volume(m, rng, pal, -x * k2 + ox, x * k2 + ox, -y * 0.9, y * 0.6, ph + 5, H, fh, rng.choice(["curtain", "pier"]), s)
        crown(m, rng, pal, rng.choice(["screen", "wedge", "helipad"]), -x * k2 + ox, x * k2 + ox, -y * 0.9, y * 0.6, H, s)
    elif kind == "residential":
        street_level(m, rng, pal, -x, x, -y, y, gh, s, "shops")
        volume(m, rng, pal, -x * 0.92, x * 0.92, -y * 0.86, y * 0.86, gh, H * 0.86, 6.4, "balcony", s)
        m.box((0, 0, H * 0.86), (W * 0.96, D * 0.9, 0.8), "RealConcrete", s["trim"], bevel=0.1)
        volume(m, rng, pal, -x * 0.66, x * 0.66, -y * 0.6, y * 0.6, H * 0.86, H * 0.86 + 12.8, 6.4, "curtain", s)
        crown(m, rng, pal, "garden", -x * 0.66, x * 0.66, -y * 0.6, y * 0.6, H * 0.86 + 12.8, s)
    else:  # brutal
        street_level(m, rng, pal, -x, x, -y, y, gh, s, "arcade")
        volume(m, rng, pal, -x * 0.9, x * 0.9, -y * 0.9, y * 0.9, gh, H * 0.72, 5.6, ["grid", "grid", "punched", "punched"], s)
        louvres(m, rng, -x * 0.9, x * 0.9, -y * 0.9, y * 0.9, H * 0.72, H * 0.72 + 4.6, s["frame"])
        volume(m, rng, pal, -x * 0.98, x * 0.98, -y * 0.98, y * 0.98, H * 0.72 + 4.6, H, 5.6, "grid", s)
        for sx in (-1, 1):
            for sy in (-1, 1):
                m.box((sx * x * 0.94, sy * y * 0.94, H / 2 + 2), (4.2, 4.2, H + 4), "RealConcrete", mul(s["solid"], 0.96), bevel=0.25)
        crown(m, rng, pal, "plant", -x * 0.8, x * 0.8, -y * 0.8, y * 0.8, H, s)
    return m


def midrise(rng, pal, size, variant, shop=False):
    """Four to eight storeys: warehouse, walk-up, render block, modern flats, corner building."""
    m = M()
    W, D = size[0] * 0.94, size[1] * 0.94
    H = max(16.0 if shop else 24.0, size[2] * rng.uniform(0.86, 1.12))
    if shop:
        H = min(H, 24)
    kind = ["warehouse", "walkup", "flats", "office", "corner", "terrace"][(variant * 5 + 1) % 6]
    s = palette_of(rng, pal, {"warehouse": "brick", "walkup": rng.choice(["brick", "render"]), "flats": "home", "office": "office", "corner": "render", "terrace": "home"}[kind])
    s["bay"] = rng.uniform(3.8, 5.6)
    gh = rng.uniform(9.0, 10.4)
    x, y = W / 2, D / 2
    street_level(m, rng, pal, -x, x, -y, y, gh, s, "shops" if shop or variant % 2 == 0 else ("brick" if s["mat"] == "Brick" else "lobby"))
    fh = rng.uniform(6.0, 7.0)
    style = {"warehouse": "pier", "walkup": "punched", "flats": "balcony", "office": "ribbon", "corner": "punched", "terrace": "balcony"}[kind]
    top = gh + max(1, round((H - gh) / fh)) * fh
    if kind == "terrace" and top - gh > fh * 2:
        z, yy = gh, y
        n = int((top - gh) / fh)
        for k in range(n):
            volume(m, rng, pal, -x, x, -y, yy, z, z + fh, fh, "balcony", s)
            z += fh
            if k % 2 and yy > 0:
                m.box((0, (yy + yy - D * 0.2) / 2, z + 0.1), (W - 0.6, D * 0.2, 0.2), "WoodPlanks", (0.4, 0.3, 0.2))
                yy -= D * 0.2
        crown(m, rng, pal, "garden", -x, x, -y, yy, z, s)
    elif kind == "corner":  # a turret at the street corner
        volume(m, rng, pal, -x, x, -y, y, gh, top, fh, style, s)
        sg = 1 if variant % 2 else -1
        r = min(W, D) * 0.17
        m.tube([(sg * x * 0.92, y * 0.92, gh - 1.4), (sg * x * 0.92, y * 0.92, gh + 0.6), (sg * x * 0.92, y * 0.92, top + 3)], [r * 0.5, r, r], s["mat"], s["solid"], n=14, smooth=False)
        n = int((top + 3 - gh) / fh)
        for j in range(n):
            for k in range(5):
                a = math.atan2(1, sg) + (k - 2) * 0.55
                p = (sg * x * 0.92 + math.cos(a) * r, y * 0.92 + math.sin(a) * r, gh + (j + 0.55) * fh)
                pane(m, rng, p, math.degrees(a), r * 0.42, fh * 0.55, s["frame"], 0.3, 0, s["trim"])
        from wf_build import spire
        spire(m, rng, pal, (sg * x * 0.92, y * 0.92, top + 3), r * 1.2, r * 2.0, (0.26, 0.34, 0.32), n=14)
        rooftop(m, rng, pal, W, D, top, 0.8)
    else:
        volume(m, rng, pal, -x, x, -y, y, gh, top, fh, style, s)
        if kind == "warehouse":
            for f in faces(m, rng, -x, x, -y, y):
                n = int(f.L / 1.5)
                for k in range(n):
                    f.box(f.L * (k + 0.5) / n, top - 0.4, 0.7, 0.9, 0.7, "Brick", mul(s["solid"], 1.1), 0.0, 0.06)
                f.box(f.L / 2, top + 0.3, f.L + 1.2, 0.6, 1.0, "RealConcrete", s["trim"], -0.2, 0.1)
            if rng.random() < 0.6:  # water tank
                for k in range(4):
                    a = k * math.pi / 2 + 0.78
                    beam(m, rng, (x * 0.5 + math.cos(a) * 2.2, -y * 0.4 + math.sin(a) * 2.2, top), (x * 0.5 + math.cos(a) * 1.8, -y * 0.4 + math.sin(a) * 1.8, top + 5), 0.3, 0.3, IRON)
                m.cyl((x * 0.5, -y * 0.4, top + 8), 2.8, 6.0, "WoodPlanks", (0.4, 0.28, 0.18), n=16)
                m.cyl((x * 0.5, -y * 0.4, top + 11.8), 3.1, 1.8, "Metal", (0.3, 0.3, 0.31), n=16, r2=0.2)
        rooftop(m, rng, pal, W, D, top, 1.0)
        if kind == "walkup":
            for j in range(int((top - gh) / fh)):
                z = gh + 0.4 + j * fh
                m.box((W * 0.24, y + 1.3, z), (W * 0.3, 2.5, 0.16), "Metal", IRON)
                m.box((W * 0.24, y + 2.5, z + 2.6), (W * 0.3, 0.1, 0.12), "Metal", IRON)
                for k in range(7):
                    m.box((W * 0.24 - W * 0.15 + W * 0.3 * k / 6, y + 2.5, z + 1.3), (0.08, 0.08, 2.6), "Metal", IRON)
                if j:
                    beam(m, rng, (W * 0.12, y + 1.3, z - fh), (W * 0.34, y + 1.3, z), 0.2, 0.9, IRON)
        if kind == "office":
            m.box((0, 0, top + 0.6), (W + 2.4, D + 2.4, 0.5), "Panel", s["frame"], bevel=0.08)
    for _ in range(int((top - gh) / fh) * 2):
        sg = rng.choice((-1, 1))
        m.box((sg * (x + 0.7), rng.uniform(-y * 0.8, y * 0.4), gh + rng.randrange(max(1, int((top - gh) / fh))) * fh + 0.9), (1.0, 1.7, 1.2), "Panel", (0.66, 0.66, 0.65), bevel=0.08)
    downpipe(m, x - 0.4, y + 0.1, 0.5, top - 0.5, (0, 1))
    return m


CITY = {"apartment_block": lambda r, p, s, v: midrise(r, p, s, v), "shop_building": lambda r, p, s, v: midrise(r, p, s, v, True), "skyscraper": tower, "skyscraper_landmark": tower}
