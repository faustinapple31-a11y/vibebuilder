"""Trees and plants that grow: a branching skeleton per family, foliage cards from the leaf atlas at the twigs.

A crown is never a ball. Each family says how its trunk stands, where branches leave it, at which angle, how long they
get (the envelope) and what hangs from them; the random generator only moves those numbers. Normals of the cards point
away from the crown, so a thousand leaves shade as one soft volume in Cycles and in Roblox alike.
"""
import math
from mathutils import Vector, Matrix, noise
import wf_textures as tex
from wf_mesh import M, DETAIL, mix, mul, vary

UP = Vector((0, 0, 1))
GOLDEN = 2.39996


def card(m, cell, c, axis, side, w, h, col, centre, bend=0.12, soft=0.8, rows=1, droop=0.0):
    """A leaf card: from `c` along `axis` (length h), `side` across (width w), folded along its middle.

    `col` is called with (point, t along the card). `rows` > 1 lets the card curve downward by `droop`.
    """
    axis, side = axis.normalized(), side.normalized()
    if DETAIL.level:  # fewer, larger cards: the crown keeps its outline and its density
        keep, grow = ((2, 1.36), (5, 2.05))[DETAIL.level - 1]
        m.cards = getattr(m, "cards", -1) + 1
        if cell not in ("palm", "fern") and m.cards % keep:
            return
        if cell not in ("palm", "fern", "spruce", "willow"):
            c = c - axis * h * (grow - 1) / 2
            w, h = w * grow, h * grow
        elif cell != "palm":
            w *= 1.25 if DETAIL.level == 1 else 1.8
        rows = 1 if DETAIL.level == 2 else min(rows, 2)
    n = side.cross(axis).normalized()
    u0, v0, s = tex.cell_uv(cell)
    pad = s * 0.012
    vs, uv, ns, cs = [], [], [], []
    for j in range(rows + 1):
        t = j / rows
        base = c + axis * h * t - UP * (droop * t * t * h)
        for i in (-1, 0, 1):
            p = base + side * (i * w / 2) + n * (bend * w * (0.0 if i else 1.0))
            vs.append(p)
            uv.append((u0 + pad + (s - 2 * pad) * (0.5 + i / 2), v0 + pad + (s - 2 * pad) * t))
            away = (p - centre)
            away = away.normalized() if away.length > 1e-4 else n
            ns.append((away * soft + n * (1 - soft) * (1 if n.dot(away) >= 0 else -1) + UP * 0.12).normalized())
            cs.append(col(p, t))
    for j in range(rows):
        for i in range(2):
            q = [j * 3 + i, j * 3 + i + 1, j * 3 + 4 + i, j * 3 + 3 + i]
            b = len(m.v)
            for k in q:
                m.v.append(vs[k])
                m.vn[len(m.v) - 1] = ns[k]
            f = [b, b + 1, b + 2, b + 3]
            avg = sum((ns[k] for k in q), Vector())
            if (vs[q[1]] - vs[q[0]]).cross(vs[q[2]] - vs[q[0]]).dot(avg) < 0:
                f = f[::-1]
                q = q[::-1]
            m.fuv += [None] * (len(m.f) - len(m.fuv))
            m.f.append(f)
            m.fm.append("Leaf")
            m.fs.append(True)
            m.fc.append([cs[k] for k in q])
            m.fuv.append([uv[k] for k in q])


def any_side(d, rng):
    ref = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1)))
    s = d.cross(ref)
    return s.normalized() if s.length > 1e-4 else Vector((1, 0, 0))


def limb(m, rng, a, d, L, r0, r1, mat, col, n=6, sag=0.0, rise=0.0, steps=4, wander=0.12):
    """A branch that bends as it goes; returns its points."""
    pts, rad = [Vector(a)], [r0]
    d = d.normalized()
    p = Vector(a)
    for i in range(steps):
        t = (i + 1) / steps
        d = (d + Vector((rng.gauss(0, wander), rng.gauss(0, wander), rng.gauss(0, wander))) + UP * (rise - sag * t)).normalized()
        p = p + d * (L / steps)
        pts.append(p.copy())
        rad.append(r0 + (r1 - r0) * t)
    m.tube(pts, rad, mat, col, n=n, cap=False)
    return pts


def stem(m, rng, h, r, mat, bark, lean=0.05, flare=1.8, n=10, taper=0.55, roots=5, gnarl=0.08, steps=8):
    """Trunk with a flare that runs into surface roots."""
    pts, rad = [], []
    dx, dy = rng.uniform(-lean, lean) * h, rng.uniform(-lean, lean) * h
    wx, wy = rng.uniform(0, 6), rng.uniform(0, 6)
    for i in range(steps + 1):
        t = i / steps
        pts.append(Vector((dx * t * t + math.sin(wx + t * 5) * gnarl * r * 2 * t, dy * t * t + math.sin(wy + t * 4) * gnarl * r * 2 * t, h * t - 0.7 * (1 - t))))
        rad.append(r * ((1 - taper * t) + (flare - 1) * max(0, 1 - t * 6) ** 2))
    shade = lambda q: mul(bark, 0.62 + 0.42 * min(1, max(0, q.z / (h * 0.5))) + noise.noise(q * 0.7) * 0.12)
    m.tube(pts, rad, mat, shade, n=n, wobble=0.07, rng=rng)
    for k in range(roots):
        a = k / max(1, roots) * math.tau + rng.uniform(-0.35, 0.35)
        e = Vector((math.cos(a), math.sin(a), 0))
        L = r * rng.uniform(2.2, 3.6)
        m.tube([e * r * 0.5 + UP * r * 1.4, e * r * 1.45 + UP * r * 0.3, e * L * 0.75 - UP * 0.08, e * L - UP * 0.6], [r * 0.46, r * 0.36, r * 0.2, r * 0.08], mat, mul(bark, 0.72), n=6, cap=False)
    return pts


def at(pts, t):
    f = t * (len(pts) - 1)
    i = min(len(pts) - 2, int(f))
    return pts[i].lerp(pts[i + 1], f - i)


class Shade:
    """Colour of the foliage: dark inside and below, warm where the sun reaches, every cluster its own hue."""

    def __init__(self, centre, radius, z0, z1, lo, hi):
        self.c, self.r, self.z0, self.z1, self.lo, self.hi = centre, radius, z0, z1, lo, hi

    def of(self, rng, amount=0.13):
        k = 1 + rng.uniform(-amount, amount)
        w = rng.uniform(-amount, amount) * 0.5

        def f(p, t):
            h = min(1, max(0, (p.z - self.z0) / max(0.1, self.z1 - self.z0)))
            q = p - self.c
            d = min(1.1, math.sqrt(q.x * q.x + q.y * q.y + (q.z * 0.9) ** 2) / self.r)
            g = (0.25 + 0.75 * h) * 0.55 + 0.45 * d * d
            c = mix(self.lo, self.hi, min(1, max(0, g)))
            c = mul(c, k * (0.5 + 0.5 * min(1, d * 1.15)))
            return (c[0] * (1 + w), c[1], c[2] * (1 - w))
        return f


def tuft(m, rng, cell, p, out, size, shade, centre, count, spread, soft=0.8, hang=0.0):
    """A handful of cards round a twig end, most of them lying on the surface of the crown."""
    for k in range(count):
        j = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 0.8)))
        if j.length > 1.5:
            j *= 1.5 / j.length  # no cluster ever floats away from its twig
        q = p + j * spread
        n = (out * 1.3 + Vector((rng.gauss(0, 0.55), rng.gauss(0, 0.55), rng.gauss(0.2, 0.45)))).normalized()
        side = any_side(n, rng)
        ax = n.cross(side).normalized()
        if k % 3 == 2:  # some stand up out of the crown and break its outline
            ax, side = (n + UP * 0.2).normalized(), side
        if hang:
            ax = (ax - UP * hang).normalized()
            side = any_side(ax, rng)
        s = size * rng.uniform(0.75, 1.25)
        card(m, cell, q - ax * s * 0.5, ax, side, s, s, shade.of(rng), centre, bend=rng.uniform(0.06, 0.18), soft=soft)


def greens(rng, pal, warm=(0.36, 0.38, 0.06), t=None, amount=0.18, lo=0.36, hi=1.6):
    g = mix(pal["foliage"], pal["foliageAlt"], rng.random() if t is None else t)
    g = vary(rng, g, 0.1)
    return mul(g, lo), mix(mul(g, hi), warm, amount)


def broadleaf(rng, pal, size, cell, *, bare=0.28, n1=9, elev=(0.35, 1.0), env=None, per=5, cards=6, card_size=0.34, bark_mat="Bark", bark=None, girth=0.036, lean=0.05, rise=0.04, sag=0.0, leader=0.9, greens_of=None, spread=0.13, hang=0.0, gnarl=0.08, flare=1.8, blossom=None):
    m = M()
    h = size[2] * rng.uniform(0.94, 1.06)
    R = max(size[0], size[1]) * 0.5 * rng.uniform(0.95, 1.08)
    age = rng.uniform(0.85, 1.2)
    bark = vary(rng, bark or pal["wood"], 0.12)
    r = max(0.4, h * girth * age)
    pts = stem(m, rng, h * leader, r, bark_mat, bark, lean=lean, gnarl=gnarl, flare=flare, n=10)
    lo, hi = greens_of or greens(rng, pal)
    env = env or (lambda t: math.sin(math.pi * (0.18 + 0.82 * t)) ** 0.7)
    cz = h * (bare + (1 - bare) * 0.52)
    centre = Vector((pts[-1].x * 0.6, pts[-1].y * 0.6, cz))
    shade = Shade(centre, max(R, h * (1 - bare) * 0.5), h * bare, h, lo, hi)
    tips = []
    a0 = rng.uniform(0, math.tau)
    for k in range(n1):
        t = (k + rng.uniform(0.1, 0.9)) / n1
        z = (bare + (leader - bare) * t ** 0.9) / leader
        a = a0 + k * GOLDEN + rng.uniform(-0.35, 0.35)
        L = R * env(t) * rng.uniform(0.78, 1.12)
        el = elev[0] + (elev[1] - elev[0]) * t + rng.uniform(-0.15, 0.15)
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
        o = at(pts, min(0.98, z))
        rb = r * (1 - 0.6 * z) * 0.5
        b = limb(m, rng, o, d, L, rb, rb * 0.3, bark_mat, mul(bark, 0.9), n=6, rise=rise, sag=sag)
        tips.append((b[-1], (b[-1] - b[-2]).normalized(), 1.0))
        for j in range(per):
            u = 0.42 + 0.55 * (j + rng.random()) / per
            s = 1 if j % 2 else -1
            bd = (b[-1] - b[0]).normalized()
            sd = (bd.cross(UP).normalized() * s * rng.uniform(0.6, 1.1) + bd * 0.75 + UP * rng.uniform(-0.1, 0.6)).normalized()
            q = limb(m, rng, at(b, u), sd, L * rng.uniform(0.3, 0.5), rb * 0.36, rb * 0.1, bark_mat, mul(bark, 0.85), n=4, steps=2, rise=rise, sag=sag)
            tips.append((q[-1], (q[-1] - q[0]).normalized(), 0.85))
    tips.append((pts[-1] + UP * R * 0.12, UP, 1.0))
    # the heart of the crown: a few dark clusters, so the sky never shows through the middle
    for k in range(7):
        a, z = k * GOLDEN, rng.uniform(0.35, 0.85)
        rr = R * 0.36 * math.sqrt(rng.random())
        q = Vector((centre.x + math.cos(a) * rr, centre.y + math.sin(a) * rr, h * (bare + (1 - bare) * z)))
        tips.append((q, (q - centre).normalized() if (q - centre).length > 0.1 else UP, 0.8))
    cs = R * card_size
    for p, d, k in tips:
        out = ((p - centre).normalized() * 0.8 + d * 0.5).normalized()
        tuft(m, rng, cell, p, out, cs * (0.85 + 0.25 * k), shade, centre, cards, R * spread, hang=hang)
        if blossom and rng.random() < blossom[1]:
            lo2, hi2 = blossom[0]
            sh2 = Shade(centre, shade.r, shade.z0, shade.z1, lo2, hi2)
            tuft(m, rng, "blossom", p + out * cs * 0.12, out, cs * 0.9, sh2, centre, max(2, cards - 2), R * spread, hang=hang)
    return m


def oak(rng, pal, size, variant):
    return broadleaf(rng, pal, size, "oak", bare=0.24, n1=10, elev=(0.1, 1.1), env=lambda t: 0.62 + 0.5 * math.sin(math.pi * (0.12 + 0.7 * t)), girth=0.044, lean=0.05, gnarl=0.2, flare=2.1, leader=0.78, bark=mix(pal["wood"], (0.14, 0.11, 0.08), 0.5))


def beech(rng, pal, size, variant):
    return broadleaf(rng, pal, size, "beech", bare=0.2, n1=12, elev=(0.45, 1.25), env=lambda t: math.sin(math.pi * (0.2 + 0.76 * t)) ** 0.8, card_size=0.31, girth=0.034, gnarl=0.05, leader=0.86, bark_mat="Bark", bark=mix(pal["stone"], pal["wood"], 0.45))


def small_tree(rng, pal, size, variant):
    """An orchard tree: low fork, open crown, sometimes in bloom."""
    s = (size[0] * 0.8, size[1] * 0.8, size[2] * 0.68)
    tint = rng.choice([((0.5, 0.2, 0.26), (0.95, 0.62, 0.68)), ((0.55, 0.5, 0.46), (0.95, 0.92, 0.86)), None])
    return broadleaf(rng, pal, s, "birch", bare=0.3, n1=7, elev=(0.5, 1.0), per=4, card_size=0.4, girth=0.05, lean=0.12, gnarl=0.3, leader=0.62, blossom=(tint, 0.85) if tint else None)


def blossom_tree(rng, pal, size, variant):
    return broadleaf(rng, pal, size, "blossom", bare=0.26, n1=9, elev=(0.3, 0.95), env=lambda t: 0.75 + 0.35 * math.sin(math.pi * t), girth=0.045, lean=0.12, gnarl=0.35, leader=0.66, greens_of=((0.42, 0.14, 0.2), (0.96, 0.6, 0.66)), bark=mix(pal["wood"], (0.1, 0.06, 0.05), 0.5))


def birch(rng, pal, size, variant):
    g = mix(pal["foliageAlt"], (0.34, 0.4, 0.07), 0.35)
    return broadleaf(rng, pal, size, "birch", bare=0.3, n1=16, elev=(0.6, 1.1), env=lambda t: 1.1 - 0.7 * t, per=3, cards=5, card_size=0.42, girth=0.02, lean=0.07, gnarl=0.1, flare=1.4, leader=0.92, rise=0.0, sag=0.35, bark_mat="BirchBark", bark=(0.86, 0.84, 0.79), greens_of=(mul(g, 0.45), mix(mul(g, 1.55), (0.5, 0.5, 0.08), 0.2)), spread=0.17)


def acacia(rng, pal, size, variant):
    return broadleaf(rng, pal, size, "birch", bare=0.55, n1=9, elev=(0.55, 0.35), env=lambda t: 0.8 + 0.3 * t, per=4, cards=4, card_size=0.3, girth=0.034, lean=0.12, gnarl=0.35, leader=0.66, rise=-0.05, spread=0.08)


def baobab(rng, pal, size, variant):
    return broadleaf(rng, pal, size, "beech", bare=0.62, n1=10, elev=(0.35, 1.1), env=lambda t: 0.75 + 0.2 * math.sin(math.pi * t), per=3, cards=3, card_size=0.26, girth=0.11, gnarl=0.03, flare=1.5, leader=0.74, bark=mix(pal["wood"], (0.4, 0.32, 0.26), 0.6))


def jungle(rng, pal, size, variant):
    return broadleaf(rng, pal, size, "beech", bare=0.52, n1=10, elev=(0.35, 0.9), env=lambda t: 0.8 + 0.3 * math.sin(math.pi * t), per=4, cards=5, card_size=0.28, girth=0.034, gnarl=0.12, flare=3.0, leader=0.84)


def willow(rng, pal, size, variant):
    m = M()
    h, R = size[2], max(size[0], size[1]) * 0.55
    bark = vary(rng, mix(pal["wood"], (0.16, 0.14, 0.1), 0.4), 0.1)
    r = h * 0.05
    pts = stem(m, rng, h * 0.5, r, "Bark", bark, lean=0.1, gnarl=0.3, flare=2.0)
    g = mix(pal["foliageAlt"], (0.3, 0.36, 0.1), 0.4)
    lo, hi = mul(g, 0.5), mul(g, 1.6)
    centre = Vector((0, 0, h * 0.55))
    shade = Shade(centre, R * 1.1, h * 0.1, h, lo, hi)
    a0 = rng.uniform(0, 6)
    for k in range(13):
        a = a0 + k * GOLDEN
        t = k / 12
        el = 0.75 + 0.55 * t
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
        b = limb(m, rng, at(pts, 0.62 + 0.36 * t), d, R * rng.uniform(1.05, 1.3), r * 0.42, r * 0.06, "Bark", bark, sag=0.42, steps=6, n=5)
        for j in range(11):
            u = 0.3 + 0.7 * j / 10
            p = at(b, u)
            L = min(p.z - h * rng.uniform(0.06, 0.2), h * rng.uniform(0.3, 0.55))
            if L < 1.5:
                continue
            out = Vector((p.x, p.y, 0)).normalized() if p.xy.length > 0.2 else Vector((1, 0, 0))
            ax = (-UP + out * rng.uniform(0.0, 0.18)).normalized()
            side = (out.cross(UP) + out * rng.uniform(-0.7, 0.7)).normalized()
            s = shade.of(rng, 0.14)
            # the card hangs: its top (v = 1) is at the branch
            card(m, "willow", p + ax * L, -ax, side, L * 0.42, L, lambda q, tt, s=s: s(q, tt), centre, bend=0.06, soft=0.75)
        for u in (0.3, 0.5, 0.7):
            tuft(m, rng, "birch", at(b, u), UP, R * 0.3, shade, centre, 3, R * 0.09)
    return m


def spruce(rng, pal, size, variant, snow=0.0):
    m = M()
    h = size[2] * rng.uniform(0.92, 1.1)
    R = max(size[0], size[1]) * 0.5 * rng.uniform(0.9, 1.08)
    bark = mul(mix(pal["wood"], (0.12, 0.09, 0.07), 0.5), 0.9)
    r = max(0.4, h * 0.021)
    stem(m, rng, h * 0.95, r, "Bark", bark, lean=0.015, taper=0.9, flare=1.7, n=8, gnarl=0.02)
    g = mix(pal["foliage"], (0.025, 0.085, 0.06), 0.5)
    lo, hi = mul(g, 0.42), mix(mul(g, 1.9), (0.16, 0.26, 0.1), 0.3)
    skirt = rng.uniform(0.07, 0.16)
    tiers = max(11, int(h / 1.75))
    white = (0.86, 0.9, 0.95)
    for i in range(tiers):
        t = i / (tiers - 1)
        z = h * (skirt + (0.97 - skirt) * t)
        L0 = R * 1.02 * (1 - t) ** 0.72 + R * 0.17
        n = max(5, int(9 - 4 * t))
        off = i * 1.1 + rng.uniform(-0.2, 0.2)
        for k in range(n):
            if rng.random() < 0.06 and 0.1 < t < 0.8:
                continue
            a = off + k / n * math.tau + rng.uniform(-0.2, 0.2)
            d = Vector((math.cos(a), math.sin(a), 0))
            L = L0 * rng.uniform(0.78, 1.12)
            rise = 0.5 * t - 0.05
            ax = (d + UP * rise).normalized()
            side = d.cross(UP)
            o = UP * (z + rng.uniform(-0.25, 0.25)) + d * r * 0.4
            k2 = 1 + rng.uniform(-0.14, 0.14)
            w = rng.uniform(-0.06, 0.06)

            def col(p, tt, k2=k2, w=w, L=L):
                q = min(1, math.hypot(p.x, p.y) / max(0.5, L))
                c = mix(lo, hi, q ** 1.3 * (0.55 + 0.45 * t) + 0.1 * t)
                c = (c[0] * k2 * (1 + w), c[1] * k2, c[2] * k2 * (1 - w))
                if snow:
                    c = mix(c, white, min(0.92, snow * (0.45 + 0.55 * q) * rng.uniform(0.8, 1.1)))
                return c
            cen = UP * (z - L * 0.75)
            card(m, "spruce", o, ax, side, L * 0.95, L * 1.08, col, cen, bend=-0.12, soft=0.7, rows=2, droop=0.46 - 0.3 * t)
            if k % 2 == 0 or L > R * 0.3:  # a second, steeper card gives the branch its thickness
                card(m, "spruce", o - UP * 0.15, ax, (side * 0.45 + UP * 0.9).normalized(), max(L * 0.6, h * 0.05), L * 0.95, col, cen, bend=0.04, soft=0.6, rows=2, droop=0.42 - 0.28 * t)
    top = mix(hi, white, snow * 0.8)
    for k in range(3):
        card(m, "spruce", UP * h * 0.8, UP, Vector((math.cos(k * 1.05), math.sin(k * 1.05), 0)), h * 0.1, h * 0.22, lambda p, tt: mul(top, 0.6 + 0.4 * tt), UP * h * 0.7)
    return m


def snow_spruce(rng, pal, size, variant):
    return spruce(rng, pal, size, variant, snow=0.75)


def pine(rng, pal, size, variant):
    """Scots pine: a long bare trunk, orange above, flat clouds of needles."""
    m = M()
    h = size[2] * rng.uniform(1.0, 1.15)
    R = max(size[0], size[1]) * 0.5
    low, high = mul(pal["wood"], 0.75), (0.42, 0.2, 0.1)
    r = max(0.45, h * 0.023)
    pts = stem(m, rng, h * 0.9, r, "Bark", mix(low, high, 0.35), lean=0.07, taper=0.6, flare=1.5, n=8, gnarl=0.15)
    g = mix(pal["foliage"], (0.05, 0.13, 0.08), 0.45)
    lo, hi = mul(g, 0.45), mix(mul(g, 1.9), (0.22, 0.28, 0.1), 0.25)
    centre = Vector((pts[-1].x, pts[-1].y, h * 0.68))
    shade = Shade(centre, R * 1.15, h * 0.45, h * 1.02, lo, hi)
    a0 = rng.uniform(0, 6)
    for k in range(15):
        t = k / 14
        z = 0.5 + 0.49 * t
        a = a0 + k * GOLDEN + rng.uniform(-0.3, 0.3)
        el = rng.uniform(0.05, 0.4) + 0.5 * t * t
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
        L = R * (1.02 - 0.55 * t) * rng.uniform(0.75, 1.15)
        b = limb(m, rng, at(pts, z), d, L, r * 0.4, r * 0.1, "Bark", mix(low, high, 0.5), n=5, rise=0.05)
        for u in (0.5, 0.75, 1.0):
            p = at(b, u)
            for j in range(8):
                q = p + Vector((rng.gauss(0, 0.17), rng.gauss(0, 0.17), rng.gauss(0.04, 0.06))) * R
                ax = (Vector((rng.gauss(0, 0.8), rng.gauss(0, 0.8), 0.55)) + d * 0.3).normalized()
                s = R * rng.uniform(0.36, 0.5)
                card(m, "pine", q - ax * s * 0.35, ax, any_side(ax, rng), s, s, shade.of(rng), centre, bend=0.1, soft=0.7)
    for k in range(4):  # dead snags under the crown
        a = rng.uniform(0, 6.28)
        limb(m, rng, at(pts, rng.uniform(0.25, 0.5)), Vector((math.cos(a), math.sin(a), 0.1)), R * rng.uniform(0.15, 0.3), r * 0.18, r * 0.05, "Bark", mul(low, 0.8), n=4, steps=2)
    return m


def dead(rng, pal, size, variant, burnt=False):
    m = M()
    h = size[2]
    bark = (0.03, 0.026, 0.024) if burnt else mul(mix(pal["wood"], (0.34, 0.31, 0.28), 0.6), 0.9)
    r = max(0.45, h * 0.04)
    pts = stem(m, rng, h * 0.72, r, "Bark", bark, lean=0.14, gnarl=0.35, taper=0.7, flare=2.0, n=9)
    col = lambda p, t: mul(bark, 1.1)

    def grow(a, d, L, rr, depth):
        b = limb(m, rng, a, d, L, rr, rr * 0.35, "Bark", bark, n=5, steps=3, wander=0.22, rise=0.04)
        if depth == 0:
            for _ in range(2):
                ax = ((b[-1] - b[0]).normalized() + Vector((rng.gauss(0, 0.4), rng.gauss(0, 0.4), rng.gauss(0.1, 0.3)))).normalized()
                card(m, "twig", at(b, 0.7), ax, any_side(ax, rng), L * 0.9, L * 1.2, col, a, bend=0.02, soft=0.3)
            return
        for j in range(2 + (rng.random() < 0.5)):
            dd = (d + Vector((rng.uniform(-0.9, 0.9), rng.uniform(-0.9, 0.9), rng.uniform(-0.1, 0.7)))).normalized()
            grow(at(b, 0.5 + 0.5 * (j + 1) / 3), dd, L * 0.62, rr * 0.5, depth - 1)

    a0 = rng.uniform(0, 6)
    for k in range(7):
        a = a0 + k * GOLDEN
        el = rng.uniform(0.2, 0.9)
        grow(at(pts, 0.42 + 0.56 * k / 6), Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el))), h * rng.uniform(0.18, 0.28), r * 0.4, 1)
    return m


def burnt(rng, pal, size, variant):
    return dead(rng, pal, size, variant, burnt=True)


def palm(rng, pal, size, variant):
    m = M()
    h, R = size[2] * 0.82, max(size[0], size[1]) * 0.6
    bark = mix(pal["wood"], (0.42, 0.34, 0.24), 0.6)
    r = max(0.45, h * 0.03)
    lean = rng.uniform(0.08, 0.28) * h
    a = rng.uniform(0, 6.28)
    pts = [Vector((math.cos(a) * lean * t * t, math.sin(a) * lean * t * t, h * t - 0.5 * (1 - t))) for t in [i / 10 for i in range(11)]]
    m.tube(pts, [r * (1.5 - 0.6 * i / 10) if i else r * 2 for i in range(11)], "Bark", lambda q: mul(bark, 0.8 + 0.25 * math.sin(q.z * 5)), n=9)
    g = mix(pal["foliage"], (0.2, 0.3, 0.06), 0.35)
    top = pts[-1]
    for k in range(17):
        b = k * GOLDEN
        el = 1.15 - 1.35 * (k / 16)
        d = Vector((math.cos(b) * math.cos(el), math.sin(b) * math.cos(el), math.sin(el)))
        c = vary(rng, g, 0.14)
        L = R * rng.uniform(0.9, 1.15)
        card(m, "palm", top, d, d.cross(UP) if abs(d.z) < 0.98 else Vector((1, 0, 0)), L * 0.42, L, lambda p, t, c=c: mul(c, 0.55 + 0.95 * t), top - UP * L, bend=0.2, soft=0.6, rows=4, droop=0.5)
    for k in range(5):
        b = k * 1.26
        m.ball(top + Vector((math.cos(b) * r * 1.3, math.sin(b) * r * 1.3, -r * 1.1)), r * 0.75, "Bark", (0.2, 0.13, 0.06), sub=2)
    return m


def bush(rng, pal, size, variant):
    m = M()
    R, h = max(size[0], size[1]) * 0.5, max(1.2, size[2])
    lo, hi = greens(rng, pal, lo=0.34, hi=1.5)
    centre = Vector((0, 0, h * 0.3))
    shade = Shade(centre, max(R, h * 0.7), 0, h, lo, hi)
    for k in range(7):
        a = k * GOLDEN
        limb(m, rng, Vector((0, 0, -0.1)), Vector((math.cos(a), math.sin(a), 1.2)), R * 0.8, 0.12, 0.04, "Bark", mul(pal["wood"], 0.7), n=4, steps=2)
    n = 46
    cell = ["bush", "beech", "birch", "bush"][variant % 4]
    for k in range(n):
        z = 1 - 1.15 * (k + 0.5) / n
        rr = math.sqrt(max(0, 1 - z * z))
        a = k * GOLDEN + rng.uniform(-0.2, 0.2)
        d = Vector((math.cos(a) * rr, math.sin(a) * rr, z))
        lump = 0.82 + 0.3 * noise.noise(d * 1.6 + Vector((variant * 4.1, 0, 0)))
        p = Vector((d.x * R * lump, d.y * R * lump, h * 0.36 + d.z * h * 0.58 * lump))
        nrm = (d + Vector((rng.gauss(0, 0.35), rng.gauss(0, 0.35), rng.gauss(0.25, 0.3)))).normalized()
        side = any_side(nrm, rng)
        ax = nrm.cross(side)
        if k % 4 == 0:
            ax = nrm
        s = R * rng.uniform(0.5, 0.75)
        card(m, cell, p - ax * s * 0.5, ax, side, s, s, shade.of(rng), centre, bend=0.14, soft=0.82)
    if variant % 3 == 0:
        tint = rng.choice([((0.5, 0.04, 0.06), (0.85, 0.12, 0.16)), ((0.5, 0.3, 0.4), (0.95, 0.72, 0.8)), ((0.6, 0.55, 0.4), (0.98, 0.95, 0.85)), ((0.2, 0.14, 0.45), (0.5, 0.4, 0.85))])
        sh = Shade(centre, shade.r, 0, h, *tint)
        for _ in range(12):
            d = Vector((rng.gauss(0, 1), rng.gauss(0, 1), abs(rng.gauss(0, 1)))).normalized()
            p = Vector((d.x * R, d.y * R, h * 0.36 + d.z * h * 0.6))
            side = any_side(d, rng)
            card(m, "blossom", p - d.cross(side) * R * 0.16, d.cross(side), side, R * 0.32, R * 0.32, sh.of(rng), centre, soft=0.9)
    return m


def fern(rng, pal, size, variant):
    m = M()
    g = mix(pal["foliage"], (0.08, 0.2, 0.04), 0.4)
    n = 9
    for k in range(n):
        a = k / n * math.tau + rng.uniform(-0.2, 0.2)
        d = Vector((math.cos(a), math.sin(a), rng.uniform(0.75, 1.2))).normalized()
        L = rng.uniform(1.7, 2.6)
        c = vary(rng, g, 0.14)
        card(m, "fern", Vector((0, 0, -0.05)), d, Vector((-math.sin(a), math.cos(a), 0)), L * 0.5, L, lambda p, t, c=c: mul(c, 0.5 + 0.9 * t), Vector((0, 0, -2)), bend=0.1, soft=0.8, rows=3, droop=0.42)
    return m


def grass(rng, pal, size, variant):
    m = M()
    R = max(0.9, max(size[0], size[1]) * 0.5)
    g = mix(mix(pal["foliage"], pal["foliageAlt"], rng.random()), (0.22, 0.28, 0.05), 0.12)
    H = max(0.75, min(1.25, size[2]))
    cell = "tallgrass" if variant % 4 == 3 else "grass"
    n = 7
    for k in range(n):
        a = k / n * math.pi + rng.uniform(-0.25, 0.25)
        o = Vector((rng.uniform(-0.6, 0.6) * R, rng.uniform(-0.6, 0.6) * R, -0.06))
        side = Vector((math.cos(a), math.sin(a), 0))
        ax = (UP + side.cross(UP) * rng.uniform(-0.3, 0.3)).normalized()
        c = vary(rng, g, 0.16)
        s = rng.uniform(0.85, 1.2) * (1.35 if cell == "tallgrass" else 1.0)
        card(m, cell, o, ax, side, R * 1.7, H * s, lambda p, t, c=c: mul(c, 0.78 + 0.55 * t), o - UP * 40, bend=0.1, soft=1.0)
    return m


PETALS = [(0.8, 0.1, 0.12), (0.92, 0.7, 0.08), (0.95, 0.95, 0.92), (0.42, 0.22, 0.72), (0.9, 0.38, 0.55), (0.2, 0.32, 0.8)]


def flower(rng, pal, size, variant):
    m = M()
    petal = PETALS[variant % len(PETALS)]
    green = mul(pal["foliage"], 1.2)
    for k in range(3):
        a = k * 1.05 + rng.uniform(-0.2, 0.2)
        side = Vector((math.cos(a), math.sin(a), 0))
        o = Vector((rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35), -0.05))
        # stems take the green of the meadow, the heads the colour of the flower
        card(m, "grass", o, UP, side, 1.2, rng.uniform(0.6, 0.9), lambda p, t: mul(green, 0.55 + 0.7 * t), o - UP * 40, soft=1.0)
    for k in range(6):
        a, r = rng.uniform(0, 6.28), rng.uniform(0.1, 0.8)
        base = Vector((math.cos(a) * r, math.sin(a) * r, -0.05))
        top = base + Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), rng.uniform(0.8, 1.5)))
        m.tube([base, (base + top) / 2 + Vector((0.04, 0, 0)), top], [0.035, 0.03, 0.025], "Leaf", mul(green, 0.9), n=4, cap=False)
        c = vary(rng, petal, 0.1)
        tilt = Vector((rng.gauss(0, 0.3), rng.gauss(0, 0.3), 1)).normalized()
        u = any_side(tilt, rng)
        w = tilt.cross(u)
        n = 7
        for ring, (L, lift) in enumerate(((0.36, 0.05), (0.24, 0.14))):
            for i in range(n):
                b = (i + ring * 0.5) / n * math.tau
                d = u * math.cos(b) + w * math.sin(b)
                s = tilt.cross(d)
                p0, p1, p2 = top + tilt * 0.02, top + d * L * 0.6 + tilt * lift, top + d * L + tilt * lift * 0.5
                m.add([p0, p1 + s * L * 0.26, p2, p1 - s * L * 0.26], [(0, 1, 2, 3)], "SmoothPlastic", lambda q, c=c, t0=top: mul(c, 0.6 + 0.5 * min(1, (q - t0).length / 0.36)), normals=[tilt] * 4, smooth=True)
        m.ball(top + tilt * 0.08, 0.1, "SmoothPlastic", (0.75, 0.5, 0.06), sub=1, squash=(1, 1, 0.7))
    return m


def flower_patch(rng, pal, size, variant):
    m = M()
    R = max(size[0], size[1]) * 0.45
    for k in range(13):
        a, r = rng.uniform(0, math.tau), R * math.sqrt(rng.random())
        piece = grass(rng, pal, (1.6, 1.6, 1.1), variant) if k > 7 else flower(rng, pal, size, variant if rng.random() < 0.7 else rng.randint(0, 5))
        m.merge(piece, Matrix.Translation((math.cos(a) * r, math.sin(a) * r, 0)))
    return m


def clover(rng, pal, size, variant):
    """Ground cover: flat cards, a little off the soil."""
    m = M()
    g = mix(pal["foliage"], pal["foliageAlt"], rng.random())
    for k in range(9):
        a, r = rng.uniform(0, 6.28), 1.5 * math.sqrt(rng.random())
        o = Vector((math.cos(a) * r, math.sin(a) * r, 0.1 + 0.05 * k / 9))
        n = Vector((rng.gauss(0, 0.16), rng.gauss(0, 0.16), 1)).normalized()
        s = any_side(n, rng)
        L = rng.uniform(1.1, 1.8)
        c = vary(rng, g, 0.16)
        card(m, "clover", o - n.cross(s) * L / 2, n.cross(s), s, L, L, lambda p, t, c=c: mul(c, 0.9), o - UP * 30, bend=0.06, soft=1.0)
    return m


def climbing(m, rng, pal, origin, along, width, height, normal, density=1.0):
    """Ivy on a wall: dense at the foot, thinning into streaks."""
    along, normal = along.normalized(), normal.normalized()
    g = mix(pal["foliage"], (0.05, 0.14, 0.04), 0.4)
    stems = max(2, int(width / 1.6))
    for s in range(stems):
        u = width * (s + rng.uniform(0.2, 0.8)) / stems
        H = height * rng.uniform(0.35, 1.0)
        z = 0.0
        pts = []
        while z < H:
            pts.append(origin + along * u + UP * z + normal * 0.08)
            z += 0.8
            u = min(width, max(0, u + rng.gauss(0, 0.25)))
        if len(pts) > 1:
            m.tube(pts, [0.09 * (1 - 0.7 * i / len(pts)) for i in range(len(pts))], "Bark", mul(pal["wood"], 0.6), n=4, cap=False)
        for i, p in enumerate(pts):
            t = i / max(1, len(pts))
            for _ in range(2 if rng.random() < density * (1.1 - t) else 1):
                L = rng.uniform(1.0, 1.8) * (1.1 - 0.5 * t)
                n = (normal + Vector((rng.gauss(0, 0.2), rng.gauss(0, 0.2), rng.gauss(0.25, 0.2)))).normalized()
                sd = any_side(n, rng)
                q = p + along * rng.gauss(0, 0.45) + UP * rng.gauss(0, 0.3) + normal * rng.uniform(0.06, 0.2)
                c = vary(rng, mul(g, 0.8 + 0.6 * t), 0.2)
                card(m, "ivy", q - n.cross(sd) * L / 2, n.cross(sd), sd, L, L, lambda pp, tt, c=c: c, q - normal * 6, bend=0.12, soft=0.6)


def round_tree(rng, pal, size, variant):
    return (oak, beech, oak, small_tree, beech, oak)[variant % 6](rng, pal, size, variant)


def conifer(rng, pal, size, variant):
    return (spruce, spruce, pine, spruce, pine)[variant % 5](rng, pal, size, variant)


TREES = {
    "round_tree": round_tree, "birch": birch, "pine_tree": conifer, "snow_pine": snow_spruce, "willow": willow, "dead_tree": dead, "burnt_tree": burnt, "cherry_tree": blossom_tree, "palm": palm, "jungle_tree": jungle,
    "baobab": baobab, "acacia": acacia, "cypress": spruce, "bush": bush, "fern": fern, "grass": grass, "flower": flower, "flower_patch": flower_patch,
}
