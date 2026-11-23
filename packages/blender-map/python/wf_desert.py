"""Desert architecture: thick earth walls, small recessed openings, courts, terraces, domes, wind towers, arcades.

Every element has a job: roof beams carry the terrace and show through the wall, spouts drain it, stairs reach it,
parapets guard it, the court brings light in. Configurations are drawn per family, like the medieval houses.
"""
import math
from mathutils import Vector, Matrix
from wf_mesh import M, mix, mul, vary
from wf_arch import rotz, beam, wall
from wf_build import lantern
from wf_roof import dome

UP = Vector((0, 0, 1))
DARK = (0.03, 0.025, 0.02)
FAMILIES = ["cube", "court", "terrace", "domed", "windtower", "arcade", "kasbah", "longroom"]


class Earth:
    def __init__(self, rng, pal, carved=False):
        self.m, self.rng, self.pal = M(), rng, dict(pal)
        base = rng.choice([(0.66, 0.46, 0.28), (0.74, 0.58, 0.4), (0.6, 0.38, 0.24), (0.78, 0.68, 0.54), (0.7, 0.5, 0.34)])
        self.clay = vary(rng, mix(pal["wall"], base, 0.6), 0.06)
        self.mat = "Slate" if carved else "Concrete"
        self.trim = mul(self.clay, 1.14) if rng.random() < 0.6 else mix(self.clay, (0.82, 0.8, 0.74), 0.7)
        self.paint = rng.choice([pal["accent"], (0.08, 0.26, 0.42), (0.1, 0.36, 0.34), mul(pal["wood"], 1.2)])
        self.foot = "Rubble" if rng.random() < 0.6 else self.mat

    def shade(self, z0, z1):
        return lambda q: mul(self.clay, 0.78 + 0.26 * min(1, max(0, (q.z - z0) / max(1, z1 - z0))))

    def arch_opening(self, p, face, w, h, deep=0.5, door=False, lattice=False):
        """Recessed opening with a pointed or round head: dark reveal, trim, shutters or lattice."""
        A, rng = M(), self.rng
        n = 8
        pointed = rng.random() < 0.5
        pts = [(-w / 2, 0), (w / 2, 0), (w / 2, h - w / 2)]
        for k in range(1, n):
            a = math.pi * k / n
            pts.append((math.cos(a) * w / 2, h - w / 2 + math.sin(a) * w / 2 * (1.25 if pointed else 1.0)))
        pts.append((-w / 2, h - w / 2))
        A.add([Vector((x, 0.03, z)) for x, z in pts], [tuple(range(len(pts)))[::-1]], "SmoothPlastic", DARK)
        for a, b in zip(pts[2:], pts[3:]):  # voussoirs
            p0, p1 = Vector((a[0], 0, a[1])), Vector((b[0], 0, b[1]))
            mid = (p0 + p1) / 2
            ang = math.degrees(math.atan2(p1.z - p0.z, p1.x - p0.x))
            out = Vector((mid.x, 0, mid.z - (h - w / 2)))
            out = out.normalized() * 0.28 if out.length > 0.01 else Vector((0, 0, 0.28))
            A.box(mid + out + Vector((0, 0.12, 0)), ((p1 - p0).length * 1.12, 0.5, 0.62), self.mat, vary(rng, self.trim, 0.05), rot=(0, -ang, 0), bevel=0.08)
        for s in (-1, 1):
            A.box((s * (w / 2 + 0.28), 0.12, (h - w / 2) / 2), (0.56, 0.5, h - w / 2), self.mat, vary(rng, self.trim, 0.04), bevel=0.08)
        if door:
            D = M()
            for k in range(4):
                D.box((w * 0.5 * (k + 0.5) / 4, 0, (h - w * 0.3) / 2), (w * 0.5 / 4 - 0.03, 0.24, h - w * 0.3), "WoodPlanks", vary(rng, self.paint, 0.1), bevel=0.04)
            for z in (0.22, 0.55, 0.82):
                D.box((w * 0.25, 0.14, (h - w * 0.3) * z), (w * 0.46, 0.08, 0.3), "Metal", (0.1, 0.08, 0.05))
                for k in range(3):
                    D.ball((w * 0.5 * (k + 0.5) / 3, 0.2, (h - w * 0.3) * z), 0.1, "Metal", (0.5, 0.38, 0.14), sub=1)
            A.merge(D, Matrix.Translation((-w / 2, 0.1, 0)) @ rotz(64))
            for k in range(2):
                A.box((0, 0.9 + k * 0.8, -0.25 - k * 0.35), (w + 1.2 + k * 0.6, 1.4, 0.5), "Rock", vary(rng, mul(self.clay, 0.95), 0.06), bevel=0.1)
        elif lattice:
            k = max(3, int(w / 0.42))
            for i in range(k):
                A.box((-w / 2 + w * (i + 0.5) / k, 0.16, h * 0.45), (0.12, 0.12, h * 0.86), "Wood", self.paint)
            for i in range(max(3, int(h / 0.5))):
                A.box((0, 0.16, 0.2 + i * 0.5), (w, 0.12, 0.12), "Wood", self.paint)
            A.box((0, 0.3, -0.18), (w + 0.9, 0.8, 0.3), self.mat, self.trim, bevel=0.08)
        self.m.merge(A, Matrix.Translation(Vector(p)) @ rotz(face - 90))

    def small_window(self, p, face, w=1.4, h=1.8):
        W = M()
        W.box((0, -0.05, 0), (w, 0.2, h), "SmoothPlastic", DARK)
        for k in range(3):
            W.box((-w / 2 + w * (k + 0.5) / 3, 0.08, 0), (0.12, 0.12, h), "Wood", self.pal["wood"])
        W.box((0, 0.2, h / 2 + 0.25), (w + 1.0, 0.5, 0.45), "Wood", mul(self.pal["wood"], 1.05), bevel=0.06)
        W.box((0, 0.2, -h / 2 - 0.15), (w + 0.6, 0.5, 0.3), self.mat, self.trim, bevel=0.08)
        self.m.merge(W, Matrix.Translation(Vector(p)) @ rotz(face - 90))

    def block(self, x0, x1, y0, y1, z0, z1, *, batter=0.95, parapet="round", beams="NS", spouts=True, solid=True, doors=()):
        """One volume: battered walls, rounded corners, roof terrace, parapet, beam ends, spouts."""
        m, rng = self.m, self.rng
        cx, cy, W, D, H = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, z1 - z0
        if solid:
            m.box((cx, cy, (z0 + z1) / 2), (W, D, H), self.mat, self.shade(z0, z1), bevel=0.35, taper=batter)
        else:
            t = 1.3
            for a, b, holes in (((x1, y1), (x0, y1), [(W * u - w / 2, W * u + w / 2, z0, z0 + h) for k, u, w, h in doors if k == "N"]), ((x0, y0), (x1, y0), []), ((x1, y0), (x1, y1), []), ((x0, y1), (x0, y0), [])):
                wall(m, a, b, z0, z1, t, self.mat, self.clay, holes)
            for px in (x0, x1):
                for py in (y0, y1):
                    m.box((px, py, (z0 + z1) / 2), (2.2, 2.2, H + 0.2), self.mat, self.shade(z0, z1), bevel=0.5, taper=0.82)
            m.box((cx, cy, z0 + 0.1), (W - 0.6, D - 0.6, 0.3), "Ground", mul(self.clay, 0.7))
            m.box((cx, cy, z1 - 0.5), (W - 0.6, D - 0.6, 0.5), "Concrete", mul(self.clay, 0.9))
            for k in range(int(W / 1.6)):
                m.tube([(x0 + 0.8 + k * 1.6, y0 + 0.4, z1 - 0.95), (x0 + 0.8 + k * 1.6, y1 - 0.4, z1 - 0.95)], [0.2, 0.2], "Bark", self.pal["wood"], n=5)
        k = batter if solid else 1.0
        hw, hd = W / 2 * k, D / 2 * k
        ph = 1.3
        if parapet == "round":
            for s in (-1, 1):
                m.tube([(cx - hw, cy + s * (hd - 0.3), z1 + 0.45), (cx + hw, cy + s * (hd - 0.3), z1 + 0.45)], [0.72, 0.72], self.mat, mul(self.clay, 1.05), n=9)
                m.tube([(cx + s * (hw - 0.3), cy - hd, z1 + 0.45), (cx + s * (hw - 0.3), cy + hd, z1 + 0.45)], [0.72, 0.72], self.mat, mul(self.clay, 1.05), n=9)
        else:
            for s in (-1, 1):
                m.box((cx, cy + s * (hd - 0.35), z1 + ph / 2), (hw * 2, 0.7, ph), self.mat, mul(self.clay, 1.03), bevel=0.12)
                m.box((cx + s * (hw - 0.35), cy, z1 + ph / 2), (0.7, hd * 2, ph), self.mat, mul(self.clay, 1.03), bevel=0.12)
                if parapet == "merlon":
                    for n, L, f in ((max(3, int(hw * 2 / 2.4)), hw * 2, lambda o: (cx + o, cy + s * (hd - 0.35))), (max(3, int(hd * 2 / 2.4)), hd * 2, lambda o: (cx + s * (hw - 0.35), cy + o))):
                        for i in range(n):
                            px, py = f(-L / 2 + L * (i + 0.5) / n)
                            for st, sc in enumerate((1.2, 0.8, 0.4)):
                                m.box((px, py, z1 + ph + 0.2 + st * 0.4), (sc, sc, 0.42), self.mat, self.trim, bevel=0.06)
        for key in beams:
            s = 1 if key == "N" else -1
            n = max(2, int(W / 2.2))
            for i in range(n):
                x = x0 + W * (i + 0.5) / n
                m.tube([(x, cy + s * (D / 2 - 0.8), z1 - 1.0), (x, cy + s * (D / 2 + rng.uniform(0.9, 1.4)), z1 - 1.05)], [0.28, 0.26], "Bark", vary(rng, self.pal["wood"], 0.1), n=7)
        if spouts:
            for s in (-1, 1):
                m.box((cx + s * W * 0.3, cy - D / 2 - 0.5, z1 + 0.25), (0.5, 1.6, 0.4), "Wood", mul(self.pal["wood"], 0.9), rot=(8, 0, 0))

    def stair(self, x, y, z0, z1, dx, dy, w=2.4):
        m, rng = self.m, self.rng
        n = max(4, int((z1 - z0) / 0.85))
        d = Vector((dx, dy, 0))
        ang = math.degrees(math.atan2(dy, dx))
        for k in range(n):
            p = Vector((x, y, 0)) + d * (k + 0.5) * 1.05
            zt = z0 + (z1 - z0) * (k + 1) / n
            m.box((p.x, p.y, (zt + z0 - 0.6) / 2), (1.1, w, zt - z0 + 0.6), self.mat, vary(rng, self.clay, 0.03), rot=(0, 0, ang), bevel=0.06)

    def awning(self, x0, x1, y, z, depth, post=True):
        m, rng = self.m, self.rng
        n = max(4, int((x1 - x0) / 1.0))
        stripe = rng.random() < 0.6
        for k in range(n):
            c = self.paint if (k % 2 or not stripe) else (0.82, 0.74, 0.58)
            sag = math.sin(math.pi * (k + 0.5) / n) * 0.25
            m.box((x0 + (x1 - x0) * (k + 0.5) / n, y + depth / 2, z - 0.4 - sag), ((x1 - x0) / n + 0.01, depth + 0.3, 0.12), "Fabric", vary(rng, c, 0.05), rot=(-11, 0, 0))
        if post:
            for x in (x0 + 0.2, x1 - 0.2):
                beam(m, rng, (x, y + depth, -0.2), (x, y + depth, z - 0.8), 0.3, 0.3, self.pal["wood"])

    def jars(self, x, y, n=3):
        for k in range(n):
            r = self.rng.uniform(0.4, 0.75)
            px, py = x + k * 1.4 + self.rng.uniform(-0.2, 0.2), y + self.rng.uniform(-0.3, 0.3)
            self.m.tube([(px, py, 0.05), (px, py, r * 1.2), (px, py, r * 2.2), (px, py, r * 2.6)], [r * 0.6, r, r * 0.5, r * 0.68], "Brick", vary(self.rng, (0.5, 0.22, 0.12), 0.18), n=11)

    def arcade(self, x0, x1, y, z0, h, bays, depth=0.9):
        """A row of arches on columns, front face at y."""
        m, rng = self.m, self.rng
        w = (x1 - x0) / bays
        for k in range(bays + 1):
            x = x0 + w * k
            m.tube([(x, y, z0), (x, y, z0 + 0.5), (x, y, z0 + 0.7), (x, y, z0 + h * 0.58), (x, y, z0 + h * 0.64)], [0.7, 0.7, 0.46, 0.42, 0.72], "Slate" if self.mat == "Slate" else "Rock", self.trim, n=10)
        for k in range(bays):
            c = x0 + w * (k + 0.5)
            r = w / 2 - 0.3
            n = 9
            for i in range(n):
                a = math.pi * (i + 0.5) / n
                m.box((c + math.cos(a) * r, y, z0 + h * 0.64 + math.sin(a) * r * 0.8), (0.7, depth, r * math.pi / n * 1.12), self.mat, vary(rng, self.trim, 0.05), rot=(0, -math.degrees(a), 0), bevel=0.06)
                top = z0 + h
                zz = z0 + h * 0.64 + math.sin(a) * (r + 0.3) * 0.8
                if top > zz:
                    m.box((c + math.cos(a) * r, y, (top + zz) / 2), (r * 2 / n * 1.5, depth * 0.8, top - zz), self.mat, self.clay)
        m.box(((x0 + x1) / 2, y, z0 + h + 0.3), (x1 - x0 + 1.2, depth + 0.5, 0.7), self.mat, mul(self.clay, 1.06), bevel=0.12)


def building(rng, pal, size, variant, carved=False, fn="home"):
    e = Earth(rng, pal, carved)
    m = e.m
    W, D = size[0] * 0.88, size[1] * 0.88
    fam = FAMILIES[(variant * 3 + 1) % len(FAMILIES)] if fn == "home" else {"shop": "arcade", "large": ["kasbah", "court", "windtower", "terrace"][variant % 4]}[fn]
    H = rng.uniform(8.6, 10.2)
    para = "merlon" if carved else rng.choice(["round", "flat", "flat", "merlon"])
    m.box((0, 0, -1.8), (W + 1.2, D + 1.2, 4), e.foot, mul(e.clay, 0.75), bevel=0.2)
    doorw, doorh = 3.8, 7.0
    ux = rng.choice([0.5, 0.36, 0.64])
    x_door = W / 2 - W * ux

    def door(y, x=x_door):
        e.arch_opening((x, y + 0.7, 0.4), 90, doorw, doorh, door=True)

    if fam == "cube":
        e.block(-W / 2, W / 2, -D / 2, D / 2, 0.2, H, solid=False, parapet=para, doors=(("N", ux, doorw - 0.2, doorh - 0.6),))
        door(D / 2)
        for x in (-W * 0.34, W * 0.34):
            if abs(x - x_door) > 3.4:
                e.small_window((x, D / 2 + 0.72, H * 0.6), 90)
        e.stair(W / 2 + 1.4, -D / 2 + 0.6, 0, H, 0, 1)
        e.awning(x_door + 2.6, x_door + 2.6 + W * 0.34, D / 2 + 0.6, 8.4, 4.2)
        if variant % 2:
            e.block(-W * 0.42, W * 0.02, -D * 0.42, D * 0.1, H, H + 5.6, batter=0.97, parapet="flat", spouts=False)
            e.small_window((-W * 0.2, D * 0.1 + 0.1, H + 2.9), 90)
    elif fam == "court":
        w, d, t = W * 1.18, D * 1.18, 5.2
        m.box((0, 0, -0.1), (w - t, d - t, 0.5), "Cobblestone", mul(e.clay, 0.8))
        for x0, x1, y0, y1, hh in ((-w / 2, w / 2, -d / 2, -d / 2 + t, H + 1.4), (-w / 2, -w / 2 + t, -d / 2 + t, d / 2, H - 0.6), (w / 2 - t, w / 2, -d / 2 + t, d / 2, H - 0.6)):
            e.block(x0, x1, y0, y1, 0, hh, parapet=para, batter=0.97, beams="N" if y1 < 0 else "", spouts=y1 < 0)
        gx = w / 2 - t
        wall(m, (gx, d / 2 - 0.6), (-gx, d / 2 - 0.6), -0.2, H - 1.6, 1.2, e.mat, e.clay, [(gx - 2.0, gx + 2.0, -0.2, 7.0)])
        e.arch_opening((0, d / 2 + 0.06, 0.1), 90, 4.2, 7.4, door=True)
        e.arcade(-gx, gx, -d / 2 + t + 2.4, 0.1, 6.6, 3)
        m.box((0, -d / 2 + t + 1.2, 6.9), (gx * 2, 2.8, 0.5), "Wood", mul(pal["wood"], 1.1))
        m.tube([(0, 1.2, 0), (0, 1.2, 1.4)], [1.7, 1.6], "Rock", e.trim, n=12, smooth=False)
        m.cyl((0, 1.2, 1.2), 1.3, 0.2, "Water", pal["water"], n=12)
        for s in (-1, 1):
            e.small_window((s * (w / 2 - t / 2), d / 2 + 0.1, H * 0.55), 90, 1.4, 2.0)
            e.arch_opening((s * gx, -0.5, 0.3), 180 if s > 0 else 0, 2.4, 5.0)
    elif fam == "terrace":  # three setbacks, each roof is the terrace of the next
        z, w, d, yb = 0.0, W * 1.06, D, -D / 2
        for lv in range(3):
            hh = H * (1.0, 0.84, 0.72)[lv]
            if lv == 0:
                e.block(-w / 2, w / 2, yb, yb + d, 0.2, hh, solid=False, parapet=para, doors=(("N", ux, doorw - 0.2, doorh - 0.6),))
                door(yb + d, w / 2 - w * ux)
                z = hh
            else:
                w *= 0.78
                d *= 0.66
                off = (variant % 3 - 1) * W * 0.08
                e.block(-w / 2 + off, w / 2 + off, yb, yb + d, z, z + hh, parapet=para, batter=0.97)
                for x in (-w * 0.28, w * 0.28):
                    e.arch_opening((x + off, yb + d + 0.02, z + 1.2), 90, 1.8, 3.8, lattice=True)
                z += hh
        e.stair(-W * 0.52 - 1.5, yb + 0.5, 0, H, 0, 1)
        e.awning(-W * 0.4, W * 0.1, yb + D * 0.68, H + 7.0, 4.4)
    elif fam == "domed":
        e.block(-W / 2, W / 2, -D / 2, D / 2, 0.2, H, solid=False, parapet=para, doors=(("N", ux, doorw - 0.2, doorh - 0.6),))
        door(D / 2)
        r = min(W, D) * rng.uniform(0.26, 0.34)
        ox = -math.copysign(W * 0.12, x_door) if x_door else W * 0.06
        m.tube([(ox, -D * 0.06, H - 0.4), (ox, -D * 0.06, H + 2.0)], [r * 1.08, r * 1.08], e.mat, mul(e.clay, 1.04), n=16, smooth=False)
        for k in range(8):
            a = k / 8 * math.tau
            m.box((ox + math.cos(a) * r * 1.07, -D * 0.06 + math.sin(a) * r * 1.07, H + 0.9), (0.2, 0.7, 1.2), "SmoothPlastic", DARK, rot=(0, 0, math.degrees(a)))
        dome(m, rng, (ox, -D * 0.06, H + 2.0), r, "Concrete", mix(e.trim, e.paint, 0.0 if rng.random() < 0.6 else 0.75))
        if rng.random() < 0.5:
            for s in (-1, 1):
                dome(m, rng, (s * W * 0.36, D * 0.3, H + 0.5), r * 0.42, "Concrete", e.trim, n=14, rows=6, finial=False)
        for x in (-W * 0.35, W * 0.35):
            if abs(x - x_door) > 3.2:
                e.arch_opening((x, D / 2 + 0.68, 3.0), 90, 1.8, 3.6, lattice=True)
    elif fam == "windtower":
        e.block(-W / 2, W / 2, -D / 2, D / 2, 0.2, H, solid=False, parapet=para, doors=(("N", ux, doorw - 0.2, doorh - 0.6),))
        door(D / 2)
        s = -1 if x_door > 0 else 1
        tx, ty = s * W * 0.3, -D * 0.2
        th = H * 1.3
        e.block(tx - 2.6, tx + 2.6, ty - 2.6, ty + 2.6, H, H + th, batter=0.94, parapet="none_", beams="", spouts=False)
        for k in range(4):  # the slots that catch the wind
            a = k * 90
            for j in range(3):
                q = Vector((tx, ty, H + th * 0.72)) + Matrix.Rotation(math.radians(a), 3, "Z") @ Vector(((j - 1) * 1.3, 2.46, 0))
                m.box(q, (0.7, 0.3, th * 0.36), "SmoothPlastic", DARK, rot=(0, 0, a))
            for hh in (0.46, 0.96):
                q = Vector((tx, ty, H + th * hh))
                m.box(q, (5.5, 5.5, 0.35), e.mat, e.trim, bevel=0.08)
        for j in range(3):
            m.tube([(tx - 3.6, ty - 1 + j, H + th * 0.9), (tx + 3.6, ty - 1 + j, H + th * 0.9)], [0.16, 0.16], "Bark", pal["wood"], n=5)
        e.arch_opening((-s * W * 0.28 if abs(-s * W * 0.28 - x_door) > 3 else s * W * 0.34, D / 2 + 0.68, 2.8), 90, 2.2, 4.4, lattice=True)
        e.stair(-s * (W / 2 + 1.4), -D / 2 + 0.6, 0, H, 0, 1)
    elif fam == "arcade":
        d0 = D * 0.66
        e.block(-W / 2, W / 2, -D / 2, -D / 2 + d0, 0.2, H, solid=False, parapet=para, doors=(("N", 0.5, doorw - 0.2, doorh - 0.6),))
        e.arch_opening((0, -D / 2 + d0 + 0.7, 0.4), 90, doorw, doorh, door=True)
        e.arcade(-W / 2 + 0.6, W / 2 - 0.6, D / 2 - 0.4, 0.2, H - 1.6, 3)
        m.box((0, -D / 2 + d0 + (D - d0) / 2, H - 0.9), (W, D - d0 + 0.6, 0.7), e.mat, mul(e.clay, 1.02), bevel=0.1)
        e.block(-W * 0.34, W * 0.34, -D / 2, -D / 2 + d0 * 0.7, H, H + 5.8, batter=0.97, parapet=para, spouts=False)
        for x in (-W * 0.2, 0, W * 0.2):
            e.arch_opening((x, -D / 2 + d0 * 0.7 + 0.02, H + 1.0), 90, 1.6, 3.2, lattice=True)
        for s in (-1, 1):
            e.jars(s * W * 0.3 - 1, -D / 2 + d0 + 2.4, 2)
            m.box((s * W * 0.3, D / 2 + 1.4, 1.2), (W * 0.24, 1.8, 0.3), "WoodPlanks", mul(pal["wood"], 1.3), bevel=0.06)
            for _ in range(7):
                m.ball((s * W * 0.3 + rng.uniform(-0.1, 0.1) * W, D / 2 + 1.4 + rng.uniform(-0.5, 0.5), 1.6), 0.32, "SmoothPlastic", vary(rng, rng.choice([(0.8, 0.4, 0.08), (0.7, 0.12, 0.08), (0.6, 0.5, 0.12)]), 0.15), sub=2)
        e.awning(-W * 0.46, W * 0.46, D / 2, H - 1.2, 4.6)
    elif fam == "kasbah":  # a fortified house with corner towers
        w, d = W * 0.94, D * 0.94
        e.block(-w / 2, w / 2, -d / 2, d / 2, 0.2, H * 1.5, batter=0.96, parapet="merlon", beams="")
        for sx in (-1, 1):
            for sy in (-1, 1):
                hh = H * rng.uniform(1.9, 2.15)
                cx, cy = sx * (w / 2 - 0.6), sy * (d / 2 - 0.6)
                e.block(cx - 2.4, cx + 2.4, cy - 2.4, cy + 2.4, 0, hh, batter=0.84, parapet="merlon", beams="", spouts=False)
                for k in range(3):  # pierced bands
                    for j in range(3):
                        q = Vector((cx, cy, hh * 0.62 + k * 1.1))
                        m.box((cx + (j - 1) * 1.0, cy + sy * 2.12 * 1.0, q.z), (0.4, 0.3, 0.6), "SmoothPlastic", DARK)
        e.arch_opening((0, d / 2 + 0.1, 0.2), 90, 4.4, 8.6, door=True)
        for x in (-w * 0.24, w * 0.24):
            for z in (6.0, 10.8):
                e.small_window((x, d / 2 - 0.1, z), 90, 1.2, 1.8)
        for k in range(5):
            m.box((-w * 0.2 + k * w * 0.1, d / 2 - 0.08, H * 1.3), (w * 0.05, 0.3, w * 0.05), e.mat, e.trim, rot=(0, 45, 0))
    else:  # longroom: a row of barrel vaults
        w, d = W * 1.16, D * 0.8
        bays = 3
        bw = w / bays
        e.block(-w / 2, w / 2, -d / 2, d / 2, 0.2, H * 0.72, solid=False, parapet="none_", beams="", spouts=False, doors=(("N", 0.5, doorw - 0.2, 6.0),))
        for k in range(bays):
            x = -w / 2 + bw * (k + 0.5)
            n = 10
            for i in range(n):
                a = math.pi * (i + 0.5) / n
                m.box((x + math.cos(a) * bw * 0.48, 0, H * 0.72 + math.sin(a) * bw * 0.4), (0.7, d + 0.8, bw * 0.48 * math.pi / n * 1.16), "Concrete", vary(rng, mul(e.clay, 1.06), 0.02), rot=(0, -math.degrees(a), 0))
            for s in (-1, 1):
                pts = [Vector((x + math.cos(math.pi * i / 10) * bw * 0.48, s * d / 2, H * 0.72 + math.sin(math.pi * i / 10) * bw * 0.4)) for i in range(11)]
                m.add(pts, [tuple(range(11)) if s < 0 else tuple(range(11))[::-1]], e.mat, e.clay)
                m.add([p - Vector((0, s * 0.5, 0)) for p in pts], [tuple(range(11))[::-1] if s < 0 else tuple(range(11))], e.mat, e.clay)
            if k != 1:
                e.arch_opening((x, d / 2 + 0.68, 2.2), 90, 2.0, 4.0, lattice=True)
        e.arch_opening((0, d / 2 + 0.7, 0.4), 90, doorw, 6.4, door=True)
        e.awning(-2.8, 2.8, d / 2 + 0.6, 8.0, 3.8)
    # courtyards and roofs are lived on
    e.jars(-W * 0.42, D / 2 + 2.2, rng.randint(2, 4))
    if fam in ("cube", "domed", "windtower", "arcade") and rng.random() < 0.7:
        for k in range(3):
            m.box((W * 0.2 + k * 0.2, -D * 0.28 + k * 1.7, H + 0.7), (2.6, 1.5, 0.22), "Fabric", vary(rng, rng.choice([e.paint, (0.7, 0.5, 0.2), (0.6, 0.2, 0.15)]), 0.1), rot=(0, 0, rng.uniform(-8, 8)))
    lantern(m, (x_door + 2.9, D / 2 + 1.1 if fam not in ("court", "kasbah", "longroom") else D / 2 + 1.4, 6.0), 0.9)
    return m


DESERT = {k: (lambda r, p, s, v, f=f: building(r, p, s, v, False, f)) for k, f in (("house", "home"), ("cottage", "home"), ("house_large", "large"), ("shop_building", "shop"))}
CARVED = {k: (lambda r, p, s, v, f=f: building(r, p, s, v, True, f)) for k, f in (("house", "home"), ("cottage", "home"), ("house_large", "large"), ("shop_building", "shop"))}
