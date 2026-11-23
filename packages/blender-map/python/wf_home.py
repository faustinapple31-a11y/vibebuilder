"""Homes of today: eight massings (gabled, cross-gabled, L ranch, split level, cube villa, A-frame, townhouse, bungalow),
each with its own skins, glazing, porch and garage. Front toward +Y; the door is a real opening."""
import math
from mathutils import Vector, Matrix
from wf_mesh import M, mix, mul, vary
from wf_arch import rotz, wall, beam, chimney
from wf_build import IRON, climbing, pot
from wf_modern import FRAME, ac_unit, downpipe, modern_house, pane, rooftop
from wf_roof import roof

MASSINGS = ["gabled", "cross", "ell", "split", "cube", "aframe", "townhouse", "bungalow"]
SIDINGS = [(0.5, 0.56, 0.6), (0.66, 0.62, 0.54), (0.3, 0.38, 0.42), (0.74, 0.72, 0.66), (0.52, 0.34, 0.26), (0.42, 0.46, 0.36), (0.8, 0.79, 0.76)]


class Home:
    def __init__(self, rng, pal, worn):
        self.m, self.rng, self.pal, self.worn = M(), rng, pal, worn
        w = lambda c: mul(mix(c, (0.3, 0.28, 0.25), worn * 0.5), 1 - 0.15 * worn)
        brick, render, board = ("Brick", w(vary(rng, rng.choice([(0.42, 0.2, 0.14), (0.5, 0.32, 0.22), (0.36, 0.3, 0.28)]), 0.1))), ("Concrete", w(vary(rng, mix(pal["wall"], (0.82, 0.8, 0.77), 0.6), 0.05))), ("WoodPlanks", w(vary(rng, rng.choice(SIDINGS), 0.06)))
        stone, timber = ("Rubble", w(vary(rng, mul(pal["stone"], 1.05), 0.08))), ("WoodPlanks", w(vary(rng, (0.5, 0.33, 0.2), 0.12)))
        self.low, self.high = rng.choice([(brick, board), (render, render), (board, board), (stone, board), (render, timber), (brick, brick), (stone, render), (board, render)])
        self.trim = rng.choice([(0.84, 0.84, 0.82), FRAME, (0.2, 0.24, 0.26)])
        self.rcol = rng.choice([(0.2, 0.2, 0.22), (0.34, 0.2, 0.15), (0.26, 0.28, 0.3), (0.3, 0.26, 0.22)])
        self.rkind = rng.choice(["slate", "slate", "tile", "metal"])
        self.door_col = vary(rng, rng.choice([pal["accent"], (0.1, 0.22, 0.34), (0.12, 0.26, 0.18), (0.5, 0.34, 0.1), (0.1, 0.1, 0.11)]), 0.08)
        self.lit = 0.1 if worn else 0.35

    def block(self, x0, x1, y0, y1, z0, z1, skin, doors=(), floor=True):
        m = self.m
        mat, col = skin
        holes = [((x1 - x0) * u - w / 2, (x1 - x0) * u + w / 2, z0, z0 + h) for u, w, h in doors]
        wall(m, (x1, y1), (x0, y1), z0, z1, 0.6, mat, col, holes)
        wall(m, (x0, y0), (x1, y0), z0, z1, 0.6, mat, col)
        for x in (x0, x1):
            wall(m, (x, y0), (x, y1), z0, z1, 0.6, mat, col)
        for x in (x0, x1):
            for y in (y0, y1):
                m.box((x, y, (z0 + z1) / 2), (0.75, 0.75, z1 - z0), "SmoothPlastic" if mat == "WoodPlanks" else mat, self.trim if mat == "WoodPlanks" else mul(col, 1.08), bevel=0.05)
        if floor:
            m.box(((x0 + x1) / 2, (y0 + y1) / 2, z0 + 0.1), (x1 - x0 - 0.3, y1 - y0 - 0.3, 0.4), "WoodPlanks", mul(self.pal["wood"], 1.5))
        m.box(((x0 + x1) / 2, (y0 + y1) / 2, z0 - 2.0), (x1 - x0 + 0.5, y1 - y0 + 0.5, 4.0), "RealConcrete", (0.42, 0.42, 0.41)) if z0 < 3 else None

    def win(self, x, y, z, face, w, h, mull=1):
        self.m  # frames follow the house
        pane(self.m, self.rng, (x, y, z), face, w, h, self.trim, self.lit, mull, (0.62, 0.62, 0.6))

    def door(self, x, y, z, w=3.8, h=7.2, step=True):
        m, t = self.m, self.trim
        for s in (-1, 1):
            m.box((x + s * (w / 2 + 0.2), y + 0.1, z + h / 2), (0.4, 0.9, h + 0.4), "SmoothPlastic", t, bevel=0.04)
        m.box((x, y + 0.1, z + h + 0.2), (w + 0.8, 0.9, 0.4), "SmoothPlastic", t, bevel=0.04)
        leaf = M()
        leaf.box((w / 2, 0, h / 2), (w - 0.1, 0.26, h - 0.1), "WoodPlanks", self.door_col, bevel=0.05)
        for zz in (0.28, 0.66):
            leaf.box((w / 2, 0.16, h * zz), (w * 0.62, 0.1, h * 0.24), "SmoothPlastic", mul(self.door_col, 0.75), bevel=0.06)
        leaf.ball((w * 0.86, 0.26, h * 0.46), 0.16, "Metal", (0.6, 0.5, 0.25), sub=2)
        m.merge(leaf, Matrix.Translation((x - w / 2, y, z)) @ rotz(68))
        if step:
            for k in range(2):
                m.box((x, y + 1.5 + k, z - 0.35 - k * 0.4), (w + 2.6 + k, 2.0, 0.45), "RealConcrete", (0.46, 0.46, 0.45), bevel=0.08)
        m.box((x + w / 2 + 0.9, y + 0.5, z + 5.6), (0.4, 0.4, 0.9), "Glow", (1.0, 0.8, 0.5))

    def garage(self, x, y, z, w=8.4, h=7.0):
        m = self.m
        m.box((x, y + 0.35, z + h + 0.25), (w + 1.0, 0.5, 0.5), "SmoothPlastic", self.trim, bevel=0.05)
        for k in range(5):
            m.box((x, y + 0.36, z + h * (k + 0.5) / 5), (w, 0.2, h / 5 - 0.08), "Panel", (0.72, 0.72, 0.7), bevel=0.05)
        for k in range(4):
            m.box((x - w * 0.36 + k * w * 0.24, y + 0.5, z + h * 0.9), (w * 0.18, 0.08, h * 0.1), "Glass", (0.1, 0.14, 0.18))
        m.box((x, y + 4.6, -0.12), (w + 0.6, 8.4, 0.3), "RealConcrete", (0.5, 0.5, 0.49))

    def porch(self, x0, x1, y, depth, z, gable=False):
        m = self.m
        m.box(((x0 + x1) / 2, y + depth / 2, 0.5), (x1 - x0, depth, 0.8), "WoodPlanks", mul(self.pal["wood"], 1.5), bevel=0.06)
        n = max(2, int((x1 - x0) / 6) + 1)
        for k in range(n):
            x = x0 + 0.5 + (x1 - x0 - 1) * k / (n - 1)
            m.box((x, y + depth - 0.5, z / 2 + 0.4), (0.55, 0.55, z - 0.8), "SmoothPlastic", (0.84, 0.84, 0.82), bevel=0.05)
            m.box((x, y + depth - 0.5, 1.3), (0.95, 0.95, 0.9), self.low[0], self.low[1], bevel=0.05)
        for k in range(n - 1):
            a, b = x0 + 0.5 + (x1 - x0 - 1) * k / (n - 1), x0 + 0.5 + (x1 - x0 - 1) * (k + 1) / (n - 1)
            if abs((a + b) / 2 - (x0 + x1) / 2) < 2.4 and n > 2:
                continue
            m.box(((a + b) / 2, y + depth - 0.5, 3.1), (b - a, 0.16, 0.2), "SmoothPlastic", (0.84, 0.84, 0.82))
            for q in range(int((b - a) / 0.6)):
                m.box((a + 0.3 + q * 0.6, y + depth - 0.5, 2.0), (0.14, 0.12, 2.2), "SmoothPlastic", (0.84, 0.84, 0.82))
        if gable:
            roof(m, self.rng, self.pal, depth + 0.6, x1 - x0, z, 0.6, self.rkind, self.rcol, over=0.6, sag=0, flare=0, axis="y", x=(x0 + x1) / 2, y=y + depth / 2, timber=False, wall_mat=self.high[0], wall_col=self.high[1])
        else:
            m.box(((x0 + x1) / 2, y + depth / 2 + 0.2, z + 0.5), (x1 - x0 + 1.0, depth + 1.0, 0.4), "Panel" if self.rkind == "metal" else "Roof", self.rcol, rot=(-8, 0, 0))

    def top(self, x0, x1, y0, y1, z, axis="x", pitch=0.62, **kw):
        W, D = (x1 - x0, y1 - y0) if axis == "x" else (y1 - y0, x1 - x0)
        return roof(self.m, self.rng, self.pal, W, D, z, pitch, self.rkind, self.rcol, over=1.5, sag=0.0, flare=0.0, timber=False, gutter=True, wall_mat=self.high[0], wall_col=self.high[1], axis=axis, x=(x0 + x1) / 2, y=(y0 + y1) / 2, **kw)


def home(rng, pal, size, variant, worn=0.0):
    h = Home(rng, pal, worn)
    m = h.m
    kind = MASSINGS[(variant * 3 + 1) % len(MASSINGS)]
    W, D = max(16.0, size[0] * 0.92), max(13.0, size[1] * 0.86)
    b, f1 = 1.0, 9.4
    f2 = f1 + 7.6
    x, y = W / 2, D / 2
    if kind in ("gabled", "townhouse"):
        if kind == "townhouse":
            x, W = W * 0.34, W * 0.68
        u = 0.32 if kind == "townhouse" else 0.5
        h.block(-x, x, -y, y, b, f1, h.low, ((u, 3.6, 7.0),))
        h.door(x - W * u, y, b)
        h.win(-x * 0.42, y + 0.3, b + 4.6, 90, W * 0.36, 5.2, 2)
        if kind == "gabled":
            h.win(x * 0.6, y + 0.3, b + 4.8, 90, W * 0.2, 4.4)
        h.block(-x, x, -y, y, f1 + 0.4, f2, h.high)
        for k in (-0.5, 0.5) if kind == "townhouse" else (-0.62, 0, 0.62):
            h.win(x * k, y + 0.3, f1 + 4.3, 90, 3.0, 4.4)
            h.win(x * k, -y - 0.3, f1 + 4.3, 270, 2.8, 3.8)
        top = f2
        if kind == "townhouse":
            f3 = f2 + 7.2
            h.block(-x, x, -y, y, f2 + 0.3, f3, h.high)
            m.box((-x * 0.1, y + 1.0, f2 + 0.6), (W * 0.62, 2.0, 0.6), h.low[0], h.low[1], bevel=0.08)
            m.box((-x * 0.1, y + 1.0, f2 + 3.8), (W * 0.58, 1.9, 5.8), "SmoothPlastic", h.trim, bevel=0.1)
            h.win(-x * 0.1, y + 2.1, f2 + 3.9, 90, W * 0.46, 4.4, 2)
            h.win(x * 0.6, y + 0.3, f2 + 4.0, 90, 2.2, 3.8, 0)
            top = f3
            h.top(-x, x, -y, y, top, axis="y", pitch=0.9)
        else:
            h.top(-x, x, -y, y, top, pitch=rng.uniform(0.55, 0.85))
            h.porch(-x * 0.5, x * 0.5, y, 4.2, 8.6, gable=True)
            chimney(m, rng, {**pal, "stone": (0.42, 0.22, 0.16)}, (x * 0.6, -y * 0.3), 2.2, top - 1, top + D * 0.5)
        for s in (-1, 1):
            downpipe(m, s * (x - 0.5), y + 0.2, 0, top - 0.6, (0, 1))
    elif kind == "cross":  # a gabled front volume runs through the main roof, wrap porch
        h.block(-x, x, -y, y * 0.6, b, f1, h.low)
        h.block(-x, x, -y, y * 0.6, f1 + 0.4, f2, h.high)
        w2 = W * 0.44
        s = 1 if variant % 2 else -1
        cx = s * (x - w2 / 2)
        h.block(cx - w2 / 2, cx + w2 / 2, y * 0.5, y + 1.6, b, f1, h.low)
        h.block(cx - w2 / 2, cx + w2 / 2, y * 0.5, y + 1.6, f1 + 0.4, f2, h.high)
        h.win(cx, y + 1.9, b + 4.4, 90, w2 * 0.6, 5.4, 2)
        h.win(cx, y + 1.9, f1 + 4.2, 90, w2 * 0.5, 4.4, 1)
        dx = -s * x * 0.4
        wall(m, (-s * x, y * 0.6), (-s * x * 0.0, y * 0.6), b, b, 0.1, *h.low) if False else None
        h.door(dx, y * 0.6 + 0.2, b)
        m.box((dx, y * 0.6 + 0.05, b + 3.6), (3.4, 0.7, 7.0), "SmoothPlastic", (0.03, 0.03, 0.03))
        h.win(-s * x * 0.82, y * 0.6 + 0.3, b + 4.6, 90, 2.6, 4.2)
        for k in (0.2, 0.75):
            h.win(-s * x * k, y * 0.6 + 0.3, f1 + 4.2, 90, 2.8, 4.0)
        h.top(-x, x, -y, y * 0.6, f2, pitch=0.7)
        h.top(cx - w2 / 2, cx + w2 / 2, -y * 0.2, y + 1.6, f2, axis="y", pitch=0.85)
        a0, a1 = (-x, cx - w2 / 2) if s > 0 else (cx + w2 / 2, x)
        h.porch(a0, a1, y * 0.6, 4.6, 8.4)
    elif kind == "ell":  # single storey ranch with garage wing
        w2 = W * 0.46
        s = 1 if variant % 2 else -1
        h.block(-x, x, -y, y * 0.4, b, f1, h.low, ((0.5 + s * 0.16, 3.6, 7.0),))
        h.door(-s * W * 0.16, y * 0.4, b)
        h.win(-s * x * 0.74, y * 0.4 + 0.3, b + 4.4, 90, W * 0.26, 5.0, 2)
        cx = s * (x - w2 / 2)
        h.block(cx - w2 / 2, cx + w2 / 2, y * 0.3, y + 3.4, b - 0.6, f1 - 0.4, h.high if h.high[0] != "WoodPlanks" else h.low)
        h.garage(cx, y + 3.4, b - 0.6, w2 * 0.74)
        h.top(-x, x, -y, y * 0.4, f1, pitch=0.5, hip=1.0)
        h.top(cx - w2 / 2, cx + w2 / 2, -y * 0.3, y + 3.4, f1 - 0.4, axis="y", pitch=0.55)
        h.porch(-s * x if s > 0 else cx + w2 / 2, cx - w2 / 2 if s > 0 else x, y * 0.4, 3.6, 8.0)
        chimney(m, rng, pal, (-s * x * 0.6, -y * 0.4), 2.4, f1, f1 + 6)
    elif kind == "split":  # two volumes half a storey apart, mono-pitch roofs facing each other
        xm = x * 0.1 * (1 if variant % 2 else -1)
        h.block(-x, xm, -y, y * 0.8, b, f1 + 3.4, h.low, ((0.72, 3.6, 7.0),))
        h.door(-x + (xm + x) * 0.28, y * 0.8, b)
        h.win(xm - 3.2, y * 0.8 + 0.3, b + 5.6, 90, 4.4, 8.4, 1)
        h.block(xm, x, -y * 0.8, y, b, f2 - 1.0, h.high)
        h.garage((xm + x) / 2, y, b - 0.3, min(8.4, (x - xm) * 0.74))
        h.win((xm + x) / 2, y + 0.3, f1 + 2.6, 90, (x - xm) * 0.66, 4.6, 2)
        for x0, x1, y0, y1, z, t in ((-x, xm, -y, y * 0.8, f1 + 3.4, 11), (xm, x, -y * 0.8, y, f2 - 1.0, -11)):
            m.box(((x0 + x1) / 2, (y0 + y1) / 2, z + (x1 - x0) * 0.1 + 0.3), (x1 - x0 + 2.4, y1 - y0 + 2.8, 0.7), "Panel" if h.rkind == "metal" else "Roof", h.rcol, rot=(0, t, 0))
            for yy in (y0, y1):
                hh = (x1 - x0) * math.tan(math.radians(11))
                tri = [Vector((x0, yy, z - 0.1)), Vector((x1, yy, z - 0.1)), Vector((x0 if t > 0 else x1, yy, z + hh))]
                skin = h.low if x0 == -x else h.high
                m.add(tri, [(0, 1, 2), (2, 1, 0)], *skin)
        ac_unit(m, rng, -x - 1.8, -y * 0.3, 0.1, 0.9)
    elif kind == "cube":  # flat-roofed villa, upper box cantilevered, big glass, terrace
        h.block(-x * 0.9, x * 0.8, -y, y * 0.7, b, f1, h.low, ((0.8, 3.6, 7.2),))
        h.door(x * 0.8 - 1.7 * x * 0.8, y * 0.7, b)
        h.win(x * 0.3, y * 0.7 + 0.3, b + 4.2, 90, W * 0.42, 7.2, 3)
        off = x * 0.16 * (1 if variant % 2 else -1)
        h.block(-x * 0.7 + off, x * 0.95 + off, -y * 0.8, y + 1.4, f1 + 0.5, f2, h.high)
        h.win(off + x * 0.1, y + 1.7, f1 + 4.2, 90, W * 0.56, 5.4, 4)
        m.box((off + x * 0.12, y * 0.3, f1 + 0.2), (W * 0.83, D * 1.16, 0.6), "RealConcrete", (0.72, 0.72, 0.7), bevel=0.08)
        m.box((off + x * 0.125, y * 0.1 + 0.7, f2 + 0.2), (W * 0.86, D * 0.9 + 2.6, 0.8), "RealConcrete", (0.72, 0.72, 0.7), bevel=0.1)
        R = M()
        rooftop(R, rng, pal, W * 0.8, D * 0.86, 0, 0.4)
        m.merge(R, Matrix.Translation((off + x * 0.125, y * 0.1 + 0.7, f2 + 0.5)))
        m.box((-x * 0.7, y * 0.2, f1 + 0.2), (W * 0.2, D * 0.8, 0.4), "WoodPlanks", (0.44, 0.32, 0.22))
        for k in range(9):
            m.box((x * 0.86, y * 0.1 - 2.4 + k * 0.6, f1 / 2 + 0.5), (0.3, 0.24, f1 - 1.4), "WoodPlanks", (0.46, 0.32, 0.2))
    elif kind == "aframe":
        h.block(-x * 0.2, x * 0.2, -y, y, b, f1, h.low) if False else None
        hh, xb = 21.0, x * 0.86
        m.box((0, 0, 0.2), (xb * 2 + 1.0, D + 4.4, 1.2), "WoodPlanks", mul(pal["wood"], 1.4), bevel=0.08)
        for s in (-1, 1):
            a = math.degrees(math.atan2(hh, xb))
            m.box((s * xb / 2, 0, hh / 2 + 0.6), (math.hypot(hh, xb) + 1.6, D + 2.4, 0.7), "Panel" if h.rkind == "metal" else "Roof", h.rcol, rot=(0, s * a, 0))
            yy = s * (y - 0.4)
            tri = [Vector((-xb + 0.4, yy, 0.8)), Vector((xb - 0.4, yy, 0.8)), Vector((0, yy, hh - 0.4))]
            if s < 0:
                m.add(tri, [(0, 1, 2), (2, 1, 0)], *h.high)
        yy = y - 0.4
        wall(m, (xb * 0.82, yy), (-xb * 0.82, yy), 0.8, 8.6, 0.5, *h.high, [(xb * 0.82 - 1.9, xb * 0.82 + 1.9, 0.8, 7.8)])
        h.door(0, yy, 0.8, step=False)
        for s in (-1, 1):
            h.win(s * xb * 0.5, yy + 0.3, 4.6, 90, xb * 0.34, 5.6, 1)
        m.box((0, yy, 8.9), (xb * 1.24, 0.8, 0.6), "Wood", pal["wood"])
        top = [Vector((-xb * 0.56, yy - 0.1, 9.2)), Vector((xb * 0.56, yy - 0.1, 9.2)), Vector((0, yy - 0.1, hh - 1.4))]
        m.add(top, [(0, 1, 2), (2, 1, 0)], "Glass", (0.1, 0.16, 0.2))
        for k in (-0.3, 0, 0.3):
            beam(m, rng, (xb * k, yy, 9.2), (xb * k * 0.1, yy, hh - 1.6 if k == 0 else hh * 0.74), 0.3, 0.4, pal["wood"])
        for s in (-1, 1):
            beam(m, rng, (s * xb, y + 0.8, 0.6), (0, y + 0.8, hh + 0.6), 0.5, 0.6, pal["wood"])
        m.box((0, y + 3.2, 0.4), (xb * 2, 5.0, 0.6), "WoodPlanks", mul(pal["wood"], 1.5))
        chimney(m, rng, pal, (xb * 0.3, -y * 0.2), 2.2, hh * 0.5, hh + 1.6)
    else:  # bungalow: deep hipped roof, full-width porch
        h.block(-x, x, -y, y * 0.6, b, f1, h.low, ((0.5, 3.6, 7.0),))
        h.door(0, y * 0.6, b)
        for s in (-1, 1):
            h.win(s * x * 0.58, y * 0.6 + 0.3, b + 4.6, 90, W * 0.24, 4.8, 2)
        h.top(-x, x, -y, y * 0.6 + 4.0, f1, pitch=0.58, hip=1.0)
        h.porch(-x, x, y * 0.6, 4.4, 8.6)
        from wf_build import dormer
        dormer(m, rng, pal, (0, y * 0.3, f1 + D * 0.16), 5.0, 3.2, 4.0, "slate", h.rcol, h.high[1])
    for s in (-1, 1):
        for yy in (-0.4, 0.2):
            if kind in ("gabled", "cross", "bungalow", "ell"):
                h.win(s * (x + 0.3), yy * D, b + 4.8, 0 if s > 0 else 180, 2.8, 4.0)
    if kind not in ("aframe",):
        h.win(-x * 0.4, -y - 0.3, b + 4.4, 270, W * 0.3, 6.0, 2)
    for s in (-1, 1):
        if rng.random() < 0.6:
            pot(m, rng, pal, s * 3.4, y + (2.4 if kind != "aframe" else 3), 0.4)
    if worn > 0.5:
        for k in range(5):
            m.box((rng.uniform(-x * 0.8, x * 0.8), y + 0.6, b + rng.uniform(3, 6)), (rng.uniform(3, 5), 0.2, 0.7), "WoodPlanks", vary(rng, mul(pal["wood"], 1.1), 0.2), rot=(0, rng.uniform(-18, 18), 0))
        climbing(m, rng, pal, Vector((x + 0.36, -y, 0)), Vector((0, 1, 0)), D * 0.7, 11, Vector((1, 0, 0)))
    return m


HOMES = {"house": home, "house_large": home}
WORN_HOMES = {k: (lambda r, p, s, v: home(r, p, s, v, 0.9)) for k in HOMES}
