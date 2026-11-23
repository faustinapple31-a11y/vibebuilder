"""Buildings outside the timber family: contemporary houses, city blocks, towers, sheds, adobe. Front toward +Y."""
import math
from mathutils import Vector, Matrix
from wf_mesh import M, mix, mul, vary
from wf_arch import GLASS, rotz, wall, beam, chimney, furnish
from wf_build import roof, climbing, lantern, pot, IRON

UP = Vector((0, 0, 1))
FRAME = (0.06, 0.065, 0.07)
PANE = (0.1, 0.16, 0.2)


def pane(m, rng, p, face, w, h, frame=FRAME, lit=0.25, mullions=1, sill=None, transom=True, depth=0.34):
    """Recessed glazing with frame, mullions and sill."""
    W = M()
    on = rng.random() < lit
    W.box((0, -0.05, 0), (w, 0.1, h), "Glow" if on else "Glass", mul((1.0, 0.72, 0.4), 0.55) if on else vary(rng, PANE, 0.15))
    for s in (-1, 1):
        W.box((s * (w / 2 - 0.1), 0.12, 0), (0.22, depth, h), "SmoothPlastic", frame, bevel=0.03)
        W.box((0, 0.12, s * (h / 2 - 0.1)), (w, depth, 0.22), "SmoothPlastic", frame, bevel=0.03)
    for k in range(mullions):
        W.box((-w / 2 + w * (k + 1) / (mullions + 1), 0.1, 0), (0.14, 0.24, h), "SmoothPlastic", frame)
    if transom and h > 3:
        W.box((0, 0.1, h * 0.26), (w, 0.24, 0.14), "SmoothPlastic", frame)
    if sill is not None:
        W.box((0, 0.35, -h / 2 - 0.14), (w + 0.6, 0.75, 0.26), "RealConcrete", sill, bevel=0.06)
        W.box((0, 0.16, h / 2 + 0.2), (w + 0.5, 0.4, 0.4), "RealConcrete", sill, bevel=0.06)
    m.merge(W, Matrix.Translation(Vector(p)) @ rotz(face - 90))


def facade(m, rng, a, b, z0, floors, fh, bays, out, win, frame, sill, wall_mat, wall_col, skip=(), balcony=None, pilaster=None, lit=0.3):
    """Windows on a grid over an existing wall; recesses are suggested by deep frames, balconies and bands are modelled."""
    A, B = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    o = Vector((out[0], out[1], 0)).normalized()
    face = math.degrees(math.atan2(o.y, o.x))
    L = (B - A).length
    d = (B - A).normalized()
    ang = math.degrees(math.atan2(d.y, d.x))
    for f in range(floors):
        z = z0 + f * fh
        for k in range(bays):
            if (f, k) in skip:
                continue
            c = A + d * (L * (k + 0.5) / bays) + o * 0.12 + UP * (z + fh * 0.52)
            pane(m, rng, c, face, min(win[0], L / bays - 0.9), win[1], frame, lit, 1 if win[0] < 3.4 else 2, sill)
            if balcony and (k + f) % balcony == 0 and f > 0:
                q = A + d * (L * (k + 0.5) / bays) + o * 1.5 + UP * z
                w = min(win[0] + 1.6, L / bays - 0.2)
                m.box((q.x, q.y, q.z + 0.1), (w, 3.0, 0.4), "RealConcrete", mul(sill, 0.95), rot=(0, 0, ang), bevel=0.06)
                for s in (-1, 1):
                    r = q + d * s * (w / 2 - 0.1)
                    m.box((r.x, r.y, q.z + 1.6), (0.12, 3.0, 0.14), "Metal", IRON, rot=(0, 0, ang))
                e = q + o * 1.45
                m.box((e.x, e.y, q.z + 3.0), (w, 0.16, 0.16), "Metal", IRON, rot=(0, 0, ang))
                for j in range(max(3, int(w / 0.8))):
                    r = e + d * (-w / 2 + (j + 0.5) * w / max(3, int(w / 0.8)))
                    m.box((r.x, r.y, q.z + 1.6), (0.1, 0.1, 2.8), "Metal", IRON)
    if pilaster:
        for k in range(bays + 1):
            c = A + d * (L * k / bays) + o * 0.12
            m.box((c.x, c.y, z0 + floors * fh / 2), (pilaster, 0.5, floors * fh), wall_mat, mul(wall_col, 1.06), rot=(0, 0, ang), bevel=0.06)


def downpipe(m, x, y, z0, z1, n):
    m.cyl((x + n[0] * 0.3, y + n[1] * 0.3, (z0 + z1) / 2), 0.16, z1 - z0, "Metal", (0.3, 0.31, 0.32), n=7)
    for k in range(3):
        m.cyl((x + n[0] * 0.3, y + n[1] * 0.3, z0 + (z1 - z0) * (k + 0.5) / 3), 0.22, 0.16, "Metal", (0.2, 0.2, 0.21), n=7)


def ac_unit(m, rng, x, y, z, s=1.0):
    m.box((x, y, z + 0.9 * s), (2.6 * s, 2.0 * s, 1.8 * s), "Panel", (0.62, 0.63, 0.63), bevel=0.1)
    m.cyl((x, y, z + 1.85 * s), 0.8 * s, 0.14, "Metal", (0.12, 0.12, 0.13), n=14)
    for k in range(4):
        m.box((x, y - 1.02 * s, z + (0.4 + k * 0.36) * s), (2.2 * s, 0.06, 0.1), "SmoothPlastic", (0.3, 0.3, 0.3))


def rooftop(m, rng, pal, w, d, z, rich=1.0):
    """What every flat roof carries: parapet, stair head, machines, vents, aerial."""
    conc = (0.42, 0.42, 0.41)
    for s in (-1, 1):
        m.box((0, s * (d / 2 - 0.3), z + 0.8), (w, 0.6, 1.6), "RealConcrete", conc, bevel=0.06)
        m.box((s * (w / 2 - 0.3), 0, z + 0.8), (0.6, d, 1.6), "RealConcrete", conc, bevel=0.06)
        m.box((0, s * (d / 2 - 0.3), z + 1.7), (w + 0.4, 1.0, 0.24), "Metal", (0.3, 0.3, 0.31))
        m.box((s * (w / 2 - 0.3), 0, z + 1.7), (1.0, d + 0.4, 0.24), "Metal", (0.3, 0.3, 0.31))
    m.box((0, 0, z + 0.06), (w - 1, d - 1, 0.14), "Gravel", (0.3, 0.29, 0.28))
    m.box((-w * 0.2, -d * 0.2, z + 2.2), (w * 0.26, d * 0.26, 4.4), "RealConcrete", mul(conc, 1.1), bevel=0.1)
    m.box((-w * 0.2, -d * 0.2 + d * 0.131, z + 1.8), (2.2, 0.16, 3.6), "Metal", (0.22, 0.26, 0.3))
    for k in range(int(3 * rich)):
        ac_unit(m, rng, rng.uniform(0, w * 0.34), rng.uniform(-d * 0.34, d * 0.34), z + 0.1, rng.uniform(0.8, 1.2))
    for k in range(int(4 * rich)):
        x, y = rng.uniform(-w * 0.4, w * 0.4), rng.uniform(-d * 0.4, d * 0.4)
        m.cyl((x, y, z + 0.7), 0.3, 1.4, "Metal", (0.4, 0.4, 0.41), n=8)
        m.cyl((x, y, z + 1.5), 0.5, 0.3, "Metal", (0.4, 0.4, 0.41), n=8, r2=0.1)
    if rich > 1:
        m.cyl((w * 0.3, d * 0.3, z + 5), 0.12, 10, "Metal", (0.5, 0.5, 0.5), n=6)
        for k in range(3):
            m.box((w * 0.3, d * 0.3, z + 6 + k), (2.4 - k * 0.5, 0.08, 0.08), "Metal", (0.5, 0.5, 0.5))


def modern_house(rng, pal, size, variant, worn=0.0):
    """A detached house of today: two volumes, real eaves and gutters, big glazing, porch, garage or terrace."""
    m = M()
    W, D = max(14.0, size[0] * 0.86), max(12.0, size[1] * 0.82)
    two = size[2] > 16
    brick = vary(rng, (0.42, 0.2, 0.14), 0.15)
    render = vary(rng, mix(pal["wall"], (0.8, 0.79, 0.76), 0.5), 0.05)
    siding = vary(rng, rng.choice([(0.5, 0.56, 0.6), (0.62, 0.6, 0.52), (0.32, 0.4, 0.42), (0.7, 0.68, 0.62)]), 0.06)
    looks = [("Brick", brick, "WoodPlanks", siding), ("Concrete", render, "Concrete", render), ("WoodPlanks", siding, "WoodPlanks", siding), ("Concrete", render, "WoodPlanks", mul(pal["wood"], 1.6)), ("Brick", brick, "Brick", brick)]
    m0, c0, m1, c1 = looks[variant % len(looks)]
    if worn:
        c0, c1 = mul(mix(c0, (0.3, 0.28, 0.25), worn * 0.5), 0.85), mul(mix(c1, (0.3, 0.28, 0.25), worn * 0.5), 0.85)
    trim = (0.82, 0.82, 0.8) if variant % 2 else FRAME
    base, f1 = 1.0, 9.6
    top = f1 + 7.6 if two else f1
    m.box((0, 0, -1.6), (W + 0.5, D + 0.5, 5.0), "RealConcrete", (0.4, 0.4, 0.39), bevel=0.1)
    m.box((0, 0, base - 0.1), (W - 0.4, D - 0.4, 0.4), "WoodPlanks", mul(pal["wood"], 1.5))
    dw, dh = 3.8, 7.2
    gw, gh = W * 0.3, 5.0
    doorx = -W * 0.06
    holes = [(W / 2 - doorx - dw / 2, W / 2 - doorx + dw / 2, base, base + dh)]
    wall(m, (W / 2, D / 2), (-W / 2, D / 2), base, f1, 0.6, m0, c0, holes)
    wall(m, (-W / 2, -D / 2), (W / 2, -D / 2), base, f1, 0.6, m0, c0)
    for s in (-1, 1):
        wall(m, (s * W / 2, -D / 2), (s * W / 2, D / 2), base, f1, 0.6, m0, c0)
    # door with side light and step
    m.box((doorx - dw / 2 - 0.2, D / 2 + 0.1, base + dh / 2), (0.4, 0.9, dh + 0.4), "SmoothPlastic", trim, bevel=0.04)
    m.box((doorx + dw / 2 + 0.2, D / 2 + 0.1, base + dh / 2), (0.4, 0.9, dh + 0.4), "SmoothPlastic", trim, bevel=0.04)
    m.box((doorx, D / 2 + 0.1, base + dh + 0.2), (dw + 0.8, 0.9, 0.4), "SmoothPlastic", trim, bevel=0.04)
    leaf = M()
    leaf.box((dw / 2, 0, dh / 2), (dw - 0.1, 0.26, dh - 0.1), "WoodPlanks", vary(rng, pal["accent"], 0.1), bevel=0.05)
    for z in (0.28, 0.62):
        leaf.box((dw / 2, 0.16, dh * z), (dw * 0.62, 0.1, dh * 0.22), "SmoothPlastic", mul(pal["accent"], 0.75), bevel=0.06)
    leaf.ball((dw * 0.86, 0.26, dh * 0.46), 0.16, "Metal", (0.6, 0.5, 0.25), sub=2)
    m.merge(leaf, Matrix.Translation((doorx - dw / 2, D / 2, base)) @ rotz(70))
    for k in range(2):
        m.box((doorx, D / 2 + 1.6 + k, base - 0.4 - k * 0.4), (dw + 3 + k, 2.2, 0.45), "RealConcrete", (0.46, 0.46, 0.45), bevel=0.08)
    # windows
    sill = (0.6, 0.6, 0.58)
    pane(m, rng, (W * 0.31, D / 2 + 0.3, base + 4.6), 90, gw, gh, trim, 0.4, 2, sill)
    pane(m, rng, (-W * 0.36, D / 2 + 0.3, base + 4.8), 90, W * 0.2, 4.2, trim, 0.3, 1, sill)
    for s in (-1, 1):
        for y in (-D * 0.24, D * 0.2):
            pane(m, rng, (s * (W / 2 + 0.3), y, base + 4.8), 0 if s > 0 else 180, 3.0, 4.0, trim, 0.3, 1, sill)
    pane(m, rng, (-W * 0.2, -D / 2 - 0.3, base + 4.0), 270, W * 0.4, 6.0, trim, 0.4, 3, None)
    pane(m, rng, (W * 0.28, -D / 2 - 0.3, base + 5.2), 270, 2.6, 2.8, trim, 0.3, 1, sill)
    if two:
        m.box((0, 0, f1 + 0.25), (W + 0.7, D + 0.7, 0.5), "SmoothPlastic", trim, bevel=0.05)
        for s in (-1, 1):
            wall(m, (-W / 2, s * D / 2), (W / 2, s * D / 2), f1 + 0.5, top, 0.6, m1, c1)
            wall(m, (s * W / 2, -D / 2), (s * W / 2, D / 2), f1 + 0.5, top, 0.6, m1, c1)
        for x in (-W * 0.3, 0.02 * W, W * 0.32):
            pane(m, rng, (x, D / 2 + 0.3, f1 + 4.2), 90, 3.2, 4.2, trim, 0.35, 1, sill)
            pane(m, rng, (x, -D / 2 - 0.3, f1 + 4.2), 270, 3.0, 3.8, trim, 0.35, 1, sill)
        for s in (-1, 1):
            pane(m, rng, (s * (W / 2 + 0.3), 0, f1 + 4.2), 0 if s > 0 else 180, 3.0, 3.8, trim, 0.35, 1, sill)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((sx * W / 2, sy * D / 2, (base + top) / 2), (0.75, 0.75, top - base), "SmoothPlastic" if m0 == "WoodPlanks" else m0, trim if m0 == "WoodPlanks" else mul(c0, 1.08), bevel=0.05)
    flat = variant % 5 == 3
    if flat:
        rooftop(m, rng, pal, W + 1, D + 1, top, 0.5)
        ridge = top + 2
    else:
        rc = rng.choice([(0.2, 0.2, 0.22), (0.32, 0.2, 0.16), (0.26, 0.28, 0.3)])
        ridge = roof(m, rng, pal, W, D, top, 0.62, "slate", rc, over=1.5, sag=0.0, flare=0.0, timber=False, wall_mat=m1, wall_col=c1, verge=True)
        for s in (-1, 1):  # gutters and pipes
            m.tube([(-W / 2 - 1.4, s * (D / 2 + 1.55), top - 0.75), (W / 2 + 1.4, s * (D / 2 + 1.55), top - 0.8)], [0.26, 0.26], "Metal", (0.72, 0.72, 0.7), n=7)
            downpipe(m, -W / 2 + 0.6, s * (D / 2 + 0.2), 0, top - 0.6, (0, s))
        chimney(m, rng, {**pal, "stone": brick}, (W * 0.3, -D * 0.14), 2.2, top, ridge + 1.4)
    # porch
    for s in (-1, 1):
        m.box((doorx + s * 3.4, D / 2 + 3.6, 4.4), (0.5, 0.5, 8.8), "SmoothPlastic", (0.84, 0.84, 0.82), bevel=0.05)
    m.box((doorx, D / 2 + 1.9, 8.9), (8.4, 4.4, 0.5), "SmoothPlastic", (0.84, 0.84, 0.82), bevel=0.08)
    m.box((doorx, D / 2 + 1.9, 9.25), (8.7, 4.7, 0.24), "Metal", (0.2, 0.2, 0.22))
    if variant % 2 == 0:  # terrace at the back
        for k in range(9):
            m.box((-W * 0.2, -D / 2 - 0.6 - k * 0.72, 0.45), (W * 0.5, 0.68, 0.24), "WoodPlanks", vary(rng, mul(pal["wood"], 1.5), 0.12))
    m.box((W / 2 + 1.6, -D * 0.1, 0.0), (2.6, 2.0, 0.3), "RealConcrete", (0.4, 0.4, 0.4))
    ac_unit(m, rng, W / 2 + 1.6, -D * 0.1, 0.1, 0.9)
    m.box((doorx + dw / 2 + 1.0, D / 2 + 0.5, base + 5.6), (0.4, 0.4, 0.9), "Glow", (1.0, 0.8, 0.5))
    for s in (-1, 1):
        pot(m, rng, pal, doorx + s * 2.6, D / 2 + 2.6, 0.5)
    if worn > 0.5:
        for k in range(5):
            m.box((rng.uniform(-W * 0.4, W * 0.4), D / 2 + 0.6, base + rng.uniform(3, 6)), (rng.uniform(3, 5), 0.2, 0.7), "WoodPlanks", vary(rng, mul(pal["wood"], 1.1), 0.2), rot=(0, rng.uniform(-18, 18), 0))
        climbing(m, rng, pal, Vector((W / 2 + 0.36, -D / 2, 0)), Vector((0, 1, 0)), D * 0.7, 11, Vector((1, 0, 0)))
    return m


def block(rng, pal, size, variant, kind="apartment"):
    """City building: shop floor, storeys on a grid, cornice, rooftop. `kind` sets proportions and glazing."""
    m = M()
    W, D, H = size[0] * 0.94, size[1] * 0.94, max(18.0, size[2] * 0.96)
    if kind == "tower":
        glassy = variant % 2 == 0
        col = vary(rng, rng.choice([(0.34, 0.36, 0.38), (0.5, 0.48, 0.44), (0.2, 0.24, 0.28)]), 0.06)
        base_h = 12.0
        m.box((0, 0, -1.5), (W + 1, D + 1, 4), "RealConcrete", (0.4, 0.4, 0.4))
        m.box((0, 0, base_h / 2), (W, D, base_h), "RealConcrete", mul(col, 1.2), bevel=0.15)
        n = max(4, int(W / 4.2))
        for s in (-1, 1):
            for k in range(n):
                x = -W / 2 + W * (k + 0.5) / n
                pane(m, rng, (x, s * (D / 2 + 0.1), base_h * 0.48), 90 * s if s > 0 else 270, W / n - 0.7, base_h * 0.72, FRAME, 0.6, 1, None)
        z, w, d = base_h, W * 0.94, D * 0.94
        steps = 2 + variant % 2
        while steps:
            h = (H - base_h) * (0.56 if steps > 1 else 1.0) if steps > 1 else H - z
            m.box((0, 0, z + h / 2), (w, d, h), "Glass" if glassy else "RealConcrete", (0.1, 0.17, 0.22) if glassy else col)
            fh = 4.6
            fl = int(h / fh)
            for f in range(fl + 1):
                zz = z + f * h / fl
                m.box((0, 0, zz), (w + 0.5, d + 0.5, 0.55 if glassy else 1.3), "Panel" if glassy else "RealConcrete", mul(col, 1.1))
            for s in (-1, 1):
                nb = max(5, int(w / 2.6))
                for k in range(nb + 1):
                    m.box((-w / 2 + w * k / nb, s * (d / 2 + 0.16), z + h / 2), (0.3, 0.5, h), "Metal", mul(col, 0.9))
                nb = max(4, int(d / 2.6))
                for k in range(nb + 1):
                    m.box((s * (w / 2 + 0.16), -d / 2 + d * k / nb, z + h / 2), (0.5, 0.3, h), "Panel", mul(col, 0.9))
                if not glassy:
                    pass
            if not glassy:
                m.box((0, 0, z + h / 2), (w + 0.12, d + 0.12, h - 1), "Glass", (0.09, 0.14, 0.18))
            for _ in range(int(fl * 1.5)):  # lit offices
                s = rng.choice((-1, 1))
                f = rng.randrange(fl)
                if rng.random() < 0.5:
                    m.box((rng.uniform(-0.42, 0.42) * w, s * (d / 2 + 0.1), z + (f + 0.5) * h / fl), (2.2, 0.1, h / fl - 1.2), "Glow", (0.8, 0.62, 0.36))
                else:
                    m.box((s * (w / 2 + 0.1), rng.uniform(-0.42, 0.42) * d, z + (f + 0.5) * h / fl), (0.1, 2.2, h / fl - 1.2), "Glow", (0.8, 0.62, 0.36))
            z += h
            rooftop(m, rng, pal, w + 0.5, d + 0.5, z, 0.8 if steps > 1 else 1.4)
            w, d = w * 0.76, d * 0.76
            steps -= 1
        return m
    brick = vary(rng, rng.choice([(0.42, 0.2, 0.14), (0.5, 0.3, 0.2), (0.34, 0.16, 0.13)]), 0.1)
    render = vary(rng, rng.choice([(0.66, 0.62, 0.54), (0.56, 0.6, 0.6), (0.68, 0.54, 0.42)]), 0.06)
    mat, col = [("Brick", brick), ("Concrete", render), ("Brick", brick), ("RealConcrete", (0.52, 0.52, 0.5))][variant % 4]
    stone = (0.62, 0.6, 0.55)
    ground = 9.6
    floors = max(1, int(round((H - ground - 2) / 7.2)))
    fh = (H - ground - 2) / floors
    shop = kind == "shop" or variant % 2 == 0
    m.box((0, 0, -1.6), (W + 0.8, D + 0.8, 4.2), "RealConcrete", (0.36, 0.36, 0.36), bevel=0.1)
    m.box((0, 0, ground + (H - 2 - ground) / 2), (W, D, H - 2 - ground), mat, col)
    dw = 4.4
    wall(m, (W / 2, D / 2), (-W / 2, D / 2), 0.4, ground, 0.8, "RealConcrete" if shop else mat, mul(stone, 0.9) if shop else col, [(W / 2 - dw / 2, W / 2 + dw / 2, 0.5, 8.2)])
    wall(m, (-W / 2, -D / 2), (W / 2, -D / 2), 0.4, ground, 0.8, mat, col)
    for s in (-1, 1):
        wall(m, (s * W / 2, -D / 2), (s * W / 2, D / 2), 0.4, ground, 0.8, mat, col)
    m.box((0, 0, 0.3), (W - 0.6, D - 0.6, 0.5), "RealConcrete", (0.46, 0.45, 0.43))
    m.box((0, 0, ground - 0.2), (W - 0.6, D - 0.6, 0.4), "RealConcrete", (0.6, 0.6, 0.58))
    # entrance
    for s in (-1, 1):
        m.box((s * (dw / 2 + 0.3), D / 2 + 0.2, 4.3), (0.7, 1.2, 8.2), "RealConcrete", stone, bevel=0.08)
    m.box((0, D / 2 + 1.2, 8.7), (dw + 3, 3.4, 0.5), "Metal", (0.2, 0.2, 0.21), bevel=0.06)
    pane(m, rng, (dw * 0.26, D / 2 - 0.1, 4.2), 90, dw * 0.46, 7.4, FRAME, 0.9, 0, None)
    for k in range(2):
        m.box((0, D / 2 + 1.4 + k, 0.3 - k * 0.35), (dw + 2 + k, 2.0, 0.4), "RealConcrete", (0.46, 0.46, 0.45), bevel=0.06)
    side = W / 2 - dw / 2 - 1.4
    for s in (-1, 1):
        x = s * (dw / 2 + 0.9 + side / 2)
        if shop:
            pane(m, rng, (x, D / 2 + 0.45, 4.4), 90, side - 0.4, 6.4, FRAME, 0.9, 2, stone, transom=True)
            c = vary(rng, pal["accent"] if s > 0 else mix(pal["accent"], (0.1, 0.25, 0.3), 0.7), 0.1)
            for k in range(7):
                m.box((x - side / 2 + side * (k + 0.5) / 7, D / 2 + 1.9, 8.2), (side / 7 - 0.02, 3.2, 0.14), "Fabric", c if k % 2 else (0.82, 0.8, 0.74), rot=(-22, 0, 0))
            m.box((x, D / 2 + 0.6, 9.3), (side - 0.4, 0.3, 1.3), "SmoothPlastic", mul(c, 0.8), bevel=0.06)
            m.box((x, D / 2 + 0.8, 9.3), (side * 0.6, 0.1, 0.5), "Glow", (0.95, 0.85, 0.6))
        else:
            pane(m, rng, (x, D / 2 + 0.45, 5), 90, min(side - 1, 5), 4.6, FRAME, 0.5, 1, stone)
    for z in (ground + 0.1, H - 2.0):
        m.box((0, 0, z), (W + 1.0, D + 1.0, 0.7), "RealConcrete", stone, bevel=0.12)
    bw, bd = max(3, int(W / 5.4)), max(2, int(D / 5.4))
    win = (2.8, fh * 0.58)
    pil = 0.9 if variant % 3 == 0 else None
    frame = (0.84, 0.84, 0.82) if mat == "Brick" else FRAME
    facade(m, rng, (W / 2, D / 2), (-W / 2, D / 2), ground + 0.5, floors, fh, bw, (0, 1), win, frame, stone, mat, col, balcony=2 if kind == "apartment" else None, pilaster=pil)
    facade(m, rng, (-W / 2, -D / 2), (W / 2, -D / 2), ground + 0.5, floors, fh, bw, (0, -1), win, frame, stone, mat, col, pilaster=pil)
    for s in (-1, 1):
        facade(m, rng, (s * W / 2, -s * D / 2), (s * W / 2, s * D / 2), ground + 0.5, floors, fh, bd, (s, 0), win, frame, stone, mat, col)
    # cornice, fire escape, wall units, pipes
    n = int(W / 1.6)
    for k in range(n):
        m.box((-W / 2 + W * (k + 0.5) / n, D / 2 + 0.45, H - 2.7), (0.6, 0.7, 0.8), "RealConcrete", stone, bevel=0.08)
    downpipe(m, W / 2 - 0.5, D / 2 + 0.1, 0.5, H - 2.5, (0, 1))
    for _ in range(floors * 2):
        f, k = rng.randrange(floors), rng.randrange(bd)
        s = rng.choice((-1, 1))
        y = -D / 2 + D * (k + 0.5) / bd
        m.box((s * (W / 2 + 0.6), y, ground + 0.5 + f * fh + fh * 0.12), (1.0, 1.7, 1.2), "Panel", (0.66, 0.66, 0.65), bevel=0.08)
    if kind == "apartment" and floors > 1:
        for f in range(floors):
            z = ground + 0.4 + f * fh
            m.box((-W * 0.25, -D / 2 - 1.4, z), (W * 0.3, 2.6, 0.16), "Metal", IRON)
            m.box((-W * 0.25, -D / 2 - 2.6, z + 1.5), (W * 0.3, 0.1, 0.12), "Metal", IRON)
            for k in range(6):
                m.box((-W * 0.25 - W * 0.15 + W * 0.3 * k / 5, -D / 2 - 2.6, z + 0.8), (0.1, 0.1, 1.6), "Metal", IRON)
            if f:
                beam(m, rng, (-W * 0.36, -D / 2 - 1.4, z - fh), (-W * 0.14, -D / 2 - 1.4, z), 0.2, 0.9, IRON)
    rooftop(m, rng, pal, W, D, H - 2, 1.0)
    return m


def shed(rng, pal, size, variant):
    """Industrial hall: steel frame, ribbed cladding, saw-tooth or low gable, roller door, ducts."""
    m = M()
    W, D, H = size[0] * 0.94, size[1] * 0.94, max(13.0, size[2] * 0.7)
    col = vary(rng, rng.choice([(0.42, 0.47, 0.5), (0.5, 0.42, 0.32), (0.4, 0.22, 0.16)]), 0.08)
    m.box((0, 0, -1.4), (W + 0.6, D + 0.6, 4), "RealConcrete", (0.4, 0.4, 0.39))
    dw = W * 0.34
    wall(m, (W / 2, D / 2), (-W / 2, D / 2), 0.5, H, 0.4, "Panel", col, [(W / 2 - dw / 2, W / 2 + dw / 2, 0.5, 9.4)])
    wall(m, (-W / 2, -D / 2), (W / 2, -D / 2), 0.5, H, 0.4, "Panel", col)
    for s in (-1, 1):
        wall(m, (s * W / 2, -D / 2), (s * W / 2, D / 2), 0.5, H, 0.4, "Panel", col)
        for a, b, o in (((-W / 2, s * D / 2), (W / 2, s * D / 2), (0, s)),):
            n = int(W / 0.9)
            for k in range(n):
                x = -W / 2 + W * (k + 0.5) / n
                if s > 0 and abs(x) < dw / 2 + 0.3:
                    continue
                m.box((x, s * (D / 2 + 0.28), H / 2 + 0.4), (0.3, 0.22, H - 0.4), "Panel", mul(col, 0.94))
        n = int(D / 0.9)
        for k in range(n):
            m.box((s * (W / 2 + 0.28), -D / 2 + D * (k + 0.5) / n, H / 2 + 0.4), (0.22, 0.3, H - 0.4), "Panel", mul(col, 0.94))
    for k in range(9):
        m.box((0, D / 2, 5.4 + k * 0.45), (dw, 0.3, 0.42), "Metal", (0.5, 0.5, 0.48), bevel=0.05)
    for s in (-1, 1):
        m.box((s * (dw / 2 + 0.3), D / 2 + 0.3, 5), (0.6, 0.8, 9.6), "Metal", (0.65, 0.52, 0.08), bevel=0.05)
        for z in (H * 0.72,):
            pane(m, rng, (s * W * 0.34, D / 2 + 0.4, z), 90, W * 0.18, 2.4, FRAME, 0.4, 2, None, transom=False)
    roof(m, rng, pal, W, D, H, 0.3, "metal", mul(col, 0.8), over=0.8, sag=0, flare=0, timber=False, wall_mat="Panel", wall_col=col)
    for k in range(3):
        x = -W * 0.3 + k * W * 0.3
        m.cyl((x, 0, H + D * 0.15 + 1.0), 0.9, 2.2, "Metal", (0.5, 0.5, 0.5), n=12)
        m.cyl((x, 0, H + D * 0.15 + 2.4), 1.3, 0.5, "Metal", (0.5, 0.5, 0.5), n=12, r2=0.3)
    m.cyl((W / 2 + 1.6, -D * 0.25, H * 0.75), 1.0, H * 1.5, "Metal", (0.36, 0.3, 0.27), n=14)
    for z in (H * 0.3, H * 0.8, H * 1.3):
        m.cyl((W / 2 + 1.6, -D * 0.25, z), 1.12, 0.3, "Metal", (0.2, 0.2, 0.2), n=14)
    m.tube([(-W / 2 - 1.0, D * 0.3, 0.5), (-W / 2 - 1.0, D * 0.3, H * 0.6), (-W / 2 - 1.0, -D * 0.3, H * 0.6), (-W / 2 - 1.0, -D * 0.3, 0.5)], [0.4] * 4, "Metal", (0.5, 0.46, 0.2), n=8)
    return m


def adobe(rng, pal, size, variant, carved=False):
    """Earth building: battered walls, rounded parapets, projecting roof beams, outside stair, awning, dome or second storey."""
    m = M()
    W, D = size[0] * 0.86, size[1] * 0.86
    H = 9.4
    clay = vary(rng, mix(pal["wall"], (0.66, 0.46, 0.28), 0.5), 0.08)
    mat = "Concrete" if not carved else "Slate"
    if carved:
        clay = vary(rng, mix(pal["wall"], (0.72, 0.58, 0.38), 0.5), 0.06)
    dw, dh = 4.0, 7.2
    m.box((0, 0, -1.6), (W + 1, D + 1, 4), "Rubble", mul(clay, 0.75))
    wall(m, (W / 2, D / 2), (-W / 2, D / 2), 0.4, H, 1.2, mat, clay, [(W / 2 - dw / 2, W / 2 + dw / 2, 0.5, 0.5 + dh)])
    wall(m, (-W / 2, -D / 2), (W / 2, -D / 2), 0.4, H, 1.2, mat, clay)
    for s in (-1, 1):
        wall(m, (s * W / 2, -D / 2), (s * W / 2, D / 2), 0.4, H, 1.2, mat, clay)
    for sx in (-1, 1):
        for sy in (-1, 1):  # battered corners
            m.box((sx * W / 2, sy * D / 2, H / 2), (2.6, 2.6, H + 0.4), mat, mul(clay, 0.98), bevel=0.5, taper=0.72)
    m.box((0, 0, 0.35), (W - 1, D - 1, 0.4), "Ground", mul(clay, 0.7))
    m.box((0, 0, H - 0.5), (W - 0.6, D - 0.6, 0.5), "Concrete", mul(clay, 0.9))
    for s in (-1, 1):
        m.tube([(-W / 2, s * D / 2, H + 0.5), (W / 2, s * D / 2, H + 0.5)], [0.85, 0.85], mat, mul(clay, 1.05), n=10)
        m.tube([(s * W / 2, -D / 2, H + 0.5), (s * W / 2, D / 2, H + 0.5)], [0.85, 0.85], mat, mul(clay, 1.05), n=10)
        n = int(W / 2.4)
        for k in range(n):
            x = -W / 2 + W * (k + 0.5) / n
            if s > 0 and abs(x - W * 0.28) < 3.6:
                continue  # the awning hangs here
            m.tube([(x, s * (D / 2 - 0.6), H - 1.2), (x, s * (D / 2 + 1.6), H - 1.25)], [0.3, 0.28], "Bark", mul(pal["wood"], 1.0), n=7)
    for s in (-1, 1):
        m.box((s * (dw / 2 + 0.35), D / 2 + 0.6, dh / 2 + 0.4), (0.7, 0.7, dh), "Wood", pal["wood"], bevel=0.06)
    m.box((0, D / 2 + 0.6, dh + 0.8), (dw + 2.4, 0.8, 0.7), "Wood", pal["wood"], bevel=0.08)
    m.box((-dw * 0.3, D / 2 + 0.6, dh / 2 + 0.4), (dw * 0.4, 0.2, dh - 0.4), "Fabric", pal["accent"], rot=(0, 0, 8))
    for x in (-W * 0.33, W * 0.33):
        m.box((x, D / 2 + 0.55, 5.4), (2.0, 0.4, 2.6), "SmoothPlastic", (0.03, 0.025, 0.02))
        for k in range(4):
            m.box((x - 0.75 + k * 0.5, D / 2 + 0.75, 5.4), (0.16, 0.16, 2.6), "Wood", pal["wood"])
        m.box((x, D / 2 + 0.75, 6.95), (2.8, 0.5, 0.4), "Wood", pal["wood"], bevel=0.05)
        m.box((x, D / 2 + 0.75, 3.95), (2.8, 0.7, 0.3), mat, mul(clay, 1.1), bevel=0.1)
    if variant % 3 == 0:
        m.ball((W * 0.1, -D * 0.05, H), min(W, D) * 0.3, mat, mul(clay, 1.08), sub=4, squash=(1, 1, 0.85))
        m.tube([(W * 0.1, -D * 0.05, H + min(W, D) * 0.25), (W * 0.1, -D * 0.05, H + min(W, D) * 0.25 + 1.8)], [0.5, 0.06], "Metal", (0.6, 0.45, 0.14), n=8)
    elif variant % 3 == 1:
        u = (W * 0.5, D * 0.6)
        m.box((-W * 0.2, -D * 0.12, H + 3.2), (u[0], u[1], 6.8), mat, mul(clay, 1.03), bevel=0.4, taper=0.96)
        for s in (-1, 1):
            m.tube([(-W * 0.2 - u[0] / 2, -D * 0.12 + s * u[1] / 2, H + 6.6), (-W * 0.2 + u[0] / 2, -D * 0.12 + s * u[1] / 2, H + 6.6)], [0.6, 0.6], mat, mul(clay, 1.05), n=9)
        m.box((-W * 0.2, -D * 0.12 + u[1] / 2, H + 3.2), (2.0, 0.4, 2.8), "SmoothPlastic", (0.03, 0.025, 0.02))
    for k in range(8):  # outside stair
        m.box((W / 2 + 1.6, -D / 2 + 1.2 + k * 1.5, 0.6 + k * 0.6), (2.4, 1.55, 1.4 + k * 1.15), mat, vary(rng, mul(clay, 1.02), 0.04), bevel=0.12)
    n = 6
    for k in range(n):  # cloth awning
        m.box((W * 0.28 - 2.6 + k * 1.05, D / 2 + 2.6, 8.0), (1.04, 4.4, 0.12), "Fabric", pal["accent"] if k % 2 else (0.82, 0.74, 0.58), rot=(-14, 0, 0))
    for s in (-1, 1):
        beam(m, rng, (W * 0.28 + s * 2.9, D / 2 + 4.6, 0), (W * 0.28 + s * 2.9, D / 2 + 4.6, 7.6), 0.3, 0.3, pal["wood"])
    for k in range(3):
        x, y, r = -W * 0.4 + k * 1.5, D / 2 + 2.2, rng.uniform(0.45, 0.75)
        m.tube([(x, y, 0.1), (x, y, r * 1.2), (x, y, r * 2.2), (x, y, r * 2.6)], [r * 0.6, r, r * 0.55, r * 0.7], "Brick", vary(rng, (0.5, 0.22, 0.12), 0.15), n=12)
    return m


MODERN = {
    "house": modern_house, "house_large": modern_house, "shop_building": lambda r, p, s, v: block(r, p, s, v, "shop"), "apartment_block": lambda r, p, s, v: block(r, p, s, v, "apartment"),
    "skyscraper": lambda r, p, s, v: block(r, p, s, v, "tower"), "skyscraper_landmark": lambda r, p, s, v: block(r, p, s, v, "tower"),
}
WORN = {**MODERN, "house": lambda r, p, s, v: modern_house(r, p, s, v, 0.9), "house_large": lambda r, p, s, v: modern_house(r, p, s, v, 0.9)}
SHED = {**MODERN, "house": shed, "house_large": shed}
ADOBE = {"house": adobe, "house_large": adobe, "shop_building": adobe, "cottage": adobe}
CARVED = {k: (lambda r, p, s, v: adobe(r, p, s, v, True)) for k in ADOBE}

# architecture style of the Style Bible -> what its buildings are made by; a style that is absent keeps its own PartList
FAMILIES = {"modern_house": MODERN, "apartment_block": MODERN, "industrial_shed": SHED, "desert_adobe": ADOBE, "egyptian": CARVED}
