"""A public building one can enter, from the plan's own words (width, depth, storeys, door, roof, age): pierced walls,
framed openings, plinth, bands, cornice, and a real roof. Front toward +Y."""
import math
from mathutils import Vector, Matrix, noise
from wf_mesh import M, lin, mix, mul, vary
from wf_arch import rotz, wall, window
from wf_roof import roof
from wf_city import Face, skin
from wf_modern import pane, rooftop

DARK = (0.1, 0.1, 0.11)
GLASSY = (0.07, 0.11, 0.14)
MAT = {"Concrete": "RealConcrete", "Plastic": "SmoothPlastic", "Granite": "Rock"}


def openings(d, fl, fh, dw, dz1):
    w, dp = d["w"], d["d"]
    holes = {"f": [], "b": [], "l": [], "r": []}
    if not d["windows"] or (d["future"] and not d["old"]):
        return holes
    nb, ns = max(2, int(w / 7)), max(1, int(dp / 9))
    ww, wh = min(3.4, w / nb - 1.6), min(5.4, fh * 0.56)
    for f in range(fl):
        z = fh * (f + 0.55)
        for i in range(nb):
            u = w * (i + 0.5) / nb
            q = (u - ww / 2, u + ww / 2, z - wh / 2, z + wh / 2)
            holes["b"].append(q)
            if not (q[0] < w / 2 + dw / 2 + 0.6 and q[1] > w / 2 - dw / 2 - 0.6 and q[2] < dz1 + 1.4):
                holes["f"].append(q)
        for i in range(ns):
            u = dp * (i + 0.5) / ns
            for k in "lr":
                holes[k].append((u - 1.6, u + 1.6, z - wh / 2, z + wh / 2))
    return holes


def big_door(q, rng, pal, Y, dw, dz1):
    for s in (-1, 1):
        q.box((s * (dw / 2 + 0.35), Y + 0.4, dz1 / 2), (0.7, 1.0, dz1), "Metal", (0.2, 0.2, 0.21), bevel=0.06)
        for i in range(int(dz1 / 1.6)):
            q.box((s * (dw / 2 + 0.35), Y + 0.92, 0.8 + i * 1.6), (0.72, 0.08, 0.8), "SmoothPlastic", (0.75, 0.55, 0.06) if i % 2 else (0.04, 0.04, 0.04))
    q.box((0, Y + 0.5, dz1 + 0.7), (dw + 2, 1.6, 1.5), "Metal", (0.34, 0.35, 0.36), bevel=0.12)
    for i in range(4):  # the shutter, rolled up but for its foot
        q.box((0, Y + 0.1, dz1 - 0.3 - i * 0.6), (dw, 0.24, 0.54), "Metal", (0.44, 0.45, 0.46), bevel=0.06)
    for i in range(2):
        q.box(((i - 0.5) * dw * 0.5, Y + 1.2, dz1 + 2.2), (2.2, 1.4, 0.4), "Metal", DARK, bevel=0.1)
        q.box(((i - 0.5) * dw * 0.5, Y + 1.3, dz1 + 1.98), (1.6, 1.0, 0.12), "Glow", (0.9, 0.8, 0.55))


def front_door(q, rng, pal, Y, dw, dz1, old, trim, stone):
    fr = pal["wood"] if old else DARK
    for s in (-1, 1):
        q.box((s * (dw / 2 + 0.3), Y + 0.4, dz1 / 2), (0.7, 1.3, dz1), "Slate" if old else "Metal", trim if old else fr, bevel=0.08)
        leaf = M()
        lw = dw * 0.46
        if old:
            for k in range(4):
                leaf.box((lw * (k + 0.5) / 4, 0, dz1 / 2), (lw / 4 - 0.04, 0.26, dz1 - 0.3), "WoodPlanks", vary(rng, mul(fr, 1.1), 0.16), bevel=0.04)
            for z in (dz1 * 0.2, dz1 * 0.78):
                leaf.box((lw / 2, 0.16, z), (lw * 0.92, 0.1, 0.34), "Metal", (0.03, 0.03, 0.035))
        else:
            leaf.box((lw / 2, 0, dz1 / 2), (lw - 0.1, 0.1, dz1 - 0.4), "Glass", GLASSY)
            for x in (0.1, lw - 0.1):
                leaf.box((x, 0, dz1 / 2), (0.2, 0.2, dz1 - 0.2), "Metal", fr)
            for z in (0.25, dz1 - 0.25):
                leaf.box((lw / 2, 0, z), (lw, 0.2, 0.3), "Metal", fr)
            leaf.box((lw - 0.4, 0.2, dz1 * 0.45), (0.1, 0.1, 2.2), "Metal", (0.6, 0.6, 0.6))
        # open inwards, hinged on the jamb
        m = Matrix.Translation((s * dw / 2, Y - 0.3, 0)) @ (rotz(-80) if s < 0 else Matrix.Diagonal((-1, 1, 1, 1)) @ rotz(-80))
        if s > 0:  # a mirror turns the faces inside out
            leaf.f = [f[::-1] for f in leaf.f]
            leaf.fc = [c[::-1] for c in leaf.fc]
            leaf.fuv = [t[::-1] if t else None for t in leaf.fuv]
        q.merge(leaf, m)
    q.box((0, Y + 0.45, dz1 + 0.4), (dw + 2.2, 1.6, 0.9), "Slate" if old else "Metal", trim if old else fr, bevel=0.1)
    if not old:
        q.box((0, Y + 2.2, dz1 + 1.0), (dw + 4, 4.4, 0.35), "Metal", mul(fr, 1.6), bevel=0.06)
        for s in (-1, 1):
            q.tube([(s * (dw / 2 + 1.4), Y + 3.8, dz1 + 1.1), (s * (dw / 2 + 1.4), Y + 0.5, dz1 + 3.4)], [0.08, 0.08], "Metal", fr, n=5)
        q.box((0, Y + 2.2, dz1 + 0.78), (dw, 0.5, 0.1), "Glow", (0.9, 0.82, 0.62))
    for i in range(2):
        q.box((0, Y + 1.6 + i, 0.45 - i * 0.3), (dw + 3 + i * 1.4, 1.2, 0.5), "Slate" if old else "RealConcrete", mul(stone, 1.05), bevel=0.08)


def vault(q, rng, pal, w, dp, h, mat, wallc, rc):
    X, Y = w / 2, dp / 2
    n, H, L = 14, w * 0.26, dp + 2.4
    prof = [(-math.cos(math.pi * i / n) * (X + 0.8), math.sin(math.pi * i / n) * H) for i in range(n + 1)]
    for (x0, z0), (x1, z1) in zip(prof, prof[1:]):
        out = Vector((x0 + x1, 0, (z0 + z1) * (X / H)))
        for lift, sg in ((0.5, 1), (0.1, -1)):
            k = 1.0 if sg > 0 else 0.975
            vs = [Vector((x0 * k, -L / 2, h + lift + z0)), Vector((x1 * k, -L / 2, h + lift + z1)), Vector((x1 * k, L / 2, h + lift + z1)), Vector((x0 * k, L / 2, h + lift + z0))]
            nrm = (vs[1] - vs[0]).cross(vs[2] - vs[0])
            q.add(vs, [(0, 1, 2, 3) if nrm.dot(out) * sg > 0 else (3, 2, 1, 0)], "Panel", rc if sg > 0 else mul(rc, 0.7))
    ribs = int(L / 4)
    for j in range(ribs + 1):
        y = -L / 2 + 0.2 + (L - 0.4) * j / ribs
        q.tube([(x * 1.005, y, h + 0.55 + z) for x, z in prof], [0.16] * (n + 1), "Metal", mul(rc, 0.75), n=4)
    for e in (-1, 1):
        pts = [Vector((x * 0.97, e * Y, h + 0.2 + z)) for x, z in prof]
        c = Vector((0, e * Y, h + 0.2))
        for a, b in zip(pts, pts[1:]):
            for side in (1, -1):
                off = Vector((0, 0.2 * side * e, 0))
                t = [c + off, a + off, b + off]
                nrm = (t[1] - t[0]).cross(t[2] - t[0])
                q.add(t, [(0, 1, 2) if nrm.y * e * side > 0 else (2, 1, 0)], "Panel" if mat == "Metal" else mat, mul(wallc, 0.95))
        q.box((0, e * (Y + 0.3), h + H * 0.5), (w * 0.4, 0.2, H * 0.34), "Glass", GLASSY)
        for i in range(5):
            q.box((-w * 0.2 + w * 0.1 * i, e * (Y + 0.36), h + H * 0.5), (0.2, 0.24, H * 0.36), "Metal", DARK)


def hall(m, rng, pal, d):
    w, dp, h = d["w"], d["d"], d["h"]
    wallc, trim, stone, rc = (lin(d[k]) for k in ("wall", "trim", "stone", "roofColor"))
    fl = max(1, int(d["floors"]))
    fh = h / fl
    dw = d["door"]
    dz1 = max(2, min(h - 2, h - 3 if dw > 10 else 8))
    old, future = d["old"], d["future"] and not d["old"]
    mat = MAT.get(d["solid"], d["solid"])
    if old and mat in ("RealConcrete", "SmoothPlastic"):
        mat = "Concrete"
    footing = "Slate" if old else "RealConcrete"
    q = M()
    X, Y = w / 2, dp / 2
    nb, ns = max(2, int(w / 7)), max(1, int(dp / 9))
    q.box((0, 0, 0.3), (w + 2, dp + 2, 0.6), footing, stone, bevel=0.12)
    q.box((0, 0, -1.2), (w + 1.4, dp + 1.4, 2.6), footing, mul(stone, 0.7))
    q.box((0, 0, 0.66), (w - 1, dp - 1, 0.2), "WoodPlanks" if old else "RealConcrete", mul(pal["wood"], 1.1) if old else mul(stone, 1.2))
    holes = openings(d, fl, fh, dw, dz1)
    door = (w / 2 - dw / 2, w / 2 + dw / 2, 0.0, dz1)
    sides = {"f": ((X, Y), (-X, Y), (0, 1), holes["f"] + [door]), "b": ((-X, -Y), (X, -Y), (0, -1), holes["b"]), "r": ((X, -Y), (X, Y), (1, 0), holes["r"]), "l": ((-X, Y), (-X, -Y), (-1, 0), holes["l"])}
    for k, (a, b, o, hs) in sides.items():
        wall(q, a, b, 0.0, h, 1.0, mat, lambda p, c=wallc: mul(c, 0.84 + 0.18 * min(1, max(0, p.z / h)) + 0.08 * noise.noise(p * 0.3)), hs)
        face = math.degrees(math.atan2(o[1], o[0]))
        f = Face(q, rng, a, b, o)
        O = Vector((*o, 0))
        for (u0, u1, z0, z1) in hs:
            if (u0, u1, z0, z1) == door:
                continue
            c = f.a + f.d * ((u0 + u1) / 2) + O * 0.3 + Vector((0, 0, (z0 + z1) / 2))
            ww, hh = u1 - u0, z1 - z0
            if old:
                window(q, rng, pal, c, face, ww - 0.5, hh - 0.5, False, False)
                f.box((u0 + u1) / 2, z1 + 0.3, ww + 0.9, 0.7, 0.4, "Slate", trim, 0.4, 0.1)
                f.box((u0 + u1) / 2, z0 - 0.3, ww + 1.1, 0.5, 0.6, "Slate", mul(trim, 0.95), 0.4, 0.08)
                for s in (u0 - 0.2, u1 + 0.2):
                    f.box(s, (z0 + z1) / 2, 0.5, hh, 0.3, "Slate", vary(rng, trim, 0.06), 0.4, 0.06)
            else:
                pane(q, rng, c, face, ww, hh, DARK, 0.2, 1, trim, True, 0.5)
        runs = [(f.L / 2, f.L + 1.0)] if k != "f" else [((f.L - dw) / 4 - 0.4, (f.L - dw) / 2), (f.L - (f.L - dw) / 4 + 0.4, (f.L - dw) / 2)]
        for u, L in runs:
            f.box(u, 1.2, L, 1.4, 0.35, footing, mul(stone, 0.9), 0.5, 0.1)
        for i in range(1, fl):
            f.box(f.L / 2, fh * i, f.L + 0.8, 0.5, 0.35, mat if old else "RealConcrete", trim, 0.5, 0.08)
        if not old and not future:
            n = nb if k in "fb" else ns
            for i in range(n + 1):
                u = f.L * i / n
                if not (k == "f" and abs(u - f.L / 2) < dw / 2 + 0.5):
                    f.box(u, h / 2, 0.7, h, 0.3, mat, mul(wallc, 1.06), 0.5, 0.06)
            if mat == "Metal":
                for i in range(int(f.L / 1.6)):
                    u = (i + 0.5) * f.L / int(f.L / 1.6)
                    if not (k == "f" and abs(u - f.L / 2) < dw / 2 + 1):
                        f.box(u, h / 2, 0.34, h, 0.16, "Metal", mul(wallc, 0.92), 0.5)
        if future:
            s = {"glass": GLASSY, "frame": (0.16, 0.18, 0.2), "solid": wallc, "mat": "Panel", "bay": 4.5, "fin": 3, "band": 1, "open": 0.6, "tall": 0.6, "trim": trim, "accent": pal["accent"]}
            if k != "f":
                skin(f, 1.2, h - 0.5, fh, "curtain" if d["windows"] else "grid", s)
            f.box(f.L / 2, h - 0.9, f.L, 0.24, 0.3, "Glow", pal["accent"], 0.7)
        f.box(f.L / 2, h + 0.1, f.L + 1.8, 0.8, 0.9, mat if old else "RealConcrete", trim, 0.2, 0.1)
        if old:  # dentils under the cornice
            n = int(f.L / 1.4)
            for i in range(n):
                f.box((i + 0.5) * f.L / n, h - 0.55, 0.6, 0.5, 0.5, mat, mul(trim, 0.95), 0.5, 0.05)
    for sx in (-1, 1):
        for sy in (-1, 1):
            if old:
                n = int(h / 1.5)
                for i in range(n):
                    b = 2.2 if i % 2 else 1.6
                    q.box((sx * (X - b / 2 + 0.62), sy * (Y - (3.8 - b) / 2 + 0.62), h * (i + 0.5) / n), (b, 3.8 - b, h / n - 0.05), "Slate", vary(rng, trim, 0.1), bevel=0.08)
            else:
                q.box((sx * X, sy * Y, h / 2), (1.8, 1.8, h + 0.2), mat, trim, bevel=0.1)
    if dw > 10:
        big_door(q, rng, pal, Y, dw, dz1)
    else:
        front_door(q, rng, pal, Y, dw, dz1, old, trim, stone)
    nd = max(1, int(dp / 14))
    for sx in ((-1, 1) if w > 24 else ()):
        for i in range(nd):
            q.box((sx * w * 0.24, -Y + dp * (i + 0.5) / nd, h / 2), (1.0, 1.0, h), "Wood" if old else "RealConcrete", pal["wood"] if old else mul(wallc, 0.9), bevel=0.08)
    nl = max(1, int(w / 12))
    for i in range(nl):
        q.box((-X + w * (i + 0.5) / nl, 0, h - 1.4), (3, 0.6, 0.24), "Glow", (0.9, 0.8, 0.58))
    if d["roof"] == "gable":
        q.box((0, 0, h - 0.2), (w - 0.6, dp - 0.6, 0.4), "WoodPlanks", mul(pal["wood"], 0.8))
        rise = min(w, dp) * 0.38
        kind = {"Metal": "metal", "WoodPlanks": "plank", "Wood": "plank"}.get(d["top"], "metal" if mat == "Metal" else "tile")
        roof(q, rng, pal, w, dp, h + 0.3, rise / (dp / 2 + 1.2), kind, rc, over=1.4, sag=0.15 if old else 0.0, flare=0.3 if old else 0.0, wall_mat=mat, wall_col=mul(wallc, 0.96), timber=old and mat == "Concrete", gutter=not old)
        if not old:
            n = max(1, int(w / 16))
            for i in range(n):
                x = -X + w * (i + 0.5) / n
                q.cyl((x, 0, h + rise + 1.2), 0.9, 1.2, "Metal", (0.45, 0.46, 0.47), n=12)
                q.cyl((x, 0, h + rise + 2.0), 1.3, 0.5, "Metal", (0.4, 0.41, 0.42), n=12, r2=0.4)
    elif d["roof"] == "barrel":
        vault(q, rng, pal, w, dp, h, mat, wallc, rc)
    else:
        q.box((0, 0, h - 0.1), (w - 0.6, dp - 0.6, 0.6), "RealConcrete", (0.4, 0.4, 0.39))
        if old:  # a balustrade
            for a, b, o, hs in sides.values():
                f = Face(q, rng, a, b, o)
                n = int(f.L / 1.3)
                for i in range(n):
                    f.box(f.L * (i + 0.5) / n, h + 1.3, 0.5, 1.5, 0.5, mat, mul(trim, 1.02), -0.1, 0.1)
                f.box(f.L / 2, h + 2.2, f.L + 1.2, 0.4, 0.8, mat, trim, -0.2, 0.08)
        else:
            parapet(q, w + 0.8, dp + 0.8, h + 0.2) if d.get("bare") else rooftop(q, rng, pal, w + 0.8, dp + 0.8, h + 0.2, 1.1)
    m.merge(q, Matrix.Translation((d["x"], -d["z"], 0)))


FONT = {"A": "757755", "B": "656656", "C": "744447", "D": "655556", "E": "746447", "F": "746444", "G": "744557", "H": "557555", "I": "722227", "K": "556655", "L": "444447", "M": "577555", "N": "577755", "O": "755557", "P": "757444", "R": "756655", "S": "743117", "T": "722222", "U": "555557", "V": "555552"}


def letters(m, text, w, h, mat, col, depth=0.2):
    """Raised letters facing +Y, centred, on a grid of three by six."""
    cw = w / (len(text) * 4 - 1)
    ch = h / 6
    for i, c in enumerate(text):
        for r, bits in enumerate(FONT.get(c, "000000")):
            row = [k for k in range(3) if int(bits) & (4 >> k)]
            while row:  # joined strokes
                n = 1
                while n < len(row) and row[n] == row[0] + n:
                    n += 1
                x = w / 2 - (i * 4 + row[0] + n / 2) * cw
                m.box((x, 0, h / 2 - (r + 0.5) * ch), (cw * n, depth, ch * 1.02), mat, col)
                row = row[n:]


def sign(m, rng, pal, d):
    w, col = d["w"], lin(d["color"])
    q = M()
    q.box((0, 0, 0), (w, 0.6, 2.6), "Metal", col, bevel=0.1)
    q.box((0, -0.1, 0), (w + 0.3, 0.5, 2.9), "Metal", mul(col, 0.4), bevel=0.06)
    k = M()
    text = str(d.get("text", "")).upper()
    letters(k, text, min(w * 0.84, len(text) * 1.5), 1.5, "Glow", (0.86, 0.82, 0.7))
    q.merge(k, Matrix.Translation((0, 0.4, 0)))
    m.merge(q, Matrix.Translation((d["x"], -d["z"], d["y"])))


def parapet(q, w, d, z):
    for s in (-1, 1):
        q.box((0, s * (d / 2 - 0.3), z + 0.8), (w, 0.6, 1.6), "RealConcrete", (0.42, 0.42, 0.41), bevel=0.06)
        q.box((s * (w / 2 - 0.3), 0, z + 0.8), (0.6, d, 1.6), "RealConcrete", (0.42, 0.42, 0.41), bevel=0.06)
        q.box((0, s * (d / 2 - 0.3), z + 1.7), (w + 0.4, 1.0, 0.24), "Metal", (0.3, 0.3, 0.31))
        q.box((s * (w / 2 - 0.3), 0, z + 1.7), (1.0, d + 0.4, 0.24), "Metal", (0.3, 0.3, 0.31))
    q.box((0, 0, z + 0.06), (w - 1, d - 1, 0.14), "Gravel", (0.3, 0.29, 0.28))
