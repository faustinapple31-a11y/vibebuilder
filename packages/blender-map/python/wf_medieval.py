"""Medieval houses from a configuration, not from a template.

A house is one to three volumes; each has its own plan, storeys, skins and roof. `configure` draws a coherent
configuration from the seed (family, then structure, facade, roof, materials, details, with weights that depend on one
another); `house` builds it. Two houses of a street share a vocabulary, never a silhouette.
"""
import math
from mathutils import Vector, Matrix
from wf_mesh import M, mix, mul, vary
from wf_arch import GLASS, rotz, wall, beam, stone_course, window, door, chimney, furnish
from wf_build import IRON, LOOK, SHUTTERS, TINTS, frame, lantern, pot, quoins, sign, woodpile, dormer
from wf_roof import roof
from wf_trees import climbing

UP = Vector((0, 0, 1))
FAMILIES = ["gable_front", "eaves_front", "merchant", "tall", "saltbox", "ell", "courtyard", "stair", "tower", "cottage", "cross", "longhouse"]
WEIGHTS = {
    "home": [3, 3, 0.6, 1.4, 1.6, 2.2, 0.4, 1.6, 0.7, 2.2, 1.2, 0.8],
    "shop": [2, 1, 3, 2, 0.3, 0.8, 0, 0.8, 0, 0, 0.8, 0],
    "inn": [0.4, 1, 2, 0.4, 0.2, 2.4, 2.4, 1.2, 0.4, 0, 1.6, 0.6],
    "hall": [0, 1, 1.4, 0, 0, 1.4, 1.2, 0.4, 1.2, 0, 2.4, 1.6],
    "farm": [0.2, 1, 0, 0, 2, 2, 2.2, 0.4, 0, 1.4, 0.6, 2.8],
    "smith": [0.8, 1.4, 0, 0, 2.2, 1.6, 0, 0.4, 0, 0.8, 0, 1.2],
}


def choose(rng, items, weights):
    t = rng.random() * sum(weights)
    for it, w in zip(items, weights):
        t -= w
        if t <= 0:
            return it
    return items[-1]


def configure(rng, size, variant, fn, force=None):
    """Every choice that makes one house differ from the next, each conditioned by those before it."""
    look = LOOK["now"]
    # neighbours in a street carry consecutive variants: the family cycles through a shuffled order, then is weighted
    w = WEIGHTS[fn]
    order = [f for f, k in zip(FAMILIES, w) if k > 0.5]
    step = next(k for k in (5, 7, 3, 1) if math.gcd(k, len(order)) == 1)
    fam = force or order[(variant * step + 1) % len(order)]
    if look.get("single") and fam in ("tall", "merchant", "tower", "stair"):
        fam = "cottage"
    W, D = max(13.0, size[0] * 0.84), max(11.5, size[1] * 0.8)
    c = {"fam": fam, "fn": fn, "look": look}
    c["roof"] = choose(rng, ["tile", "slate", "thatch"], {"cottage": [1, 0.5, 2.4], "longhouse": [1, 0.4, 2], "tall": [2, 1.4, 0], "merchant": [2.2, 1.4, 0], "tower": [1.4, 2, 0]}.get(fam, [2.4, 1, 0.8]))
    c["lower"] = choose(rng, ["plaster", "rubble", "masonry", "brick"], {"tower": [0, 1.4, 2, 0], "merchant": [0.6, 0.5, 2, 1], "cottage": [2, 2, 0, 0.2], "stair": [0, 2, 1.4, 0.4]}.get(fam, [2, 1.8, 1, 0.5]))
    c["upper"] = look.get("upper") or choose(rng, ["plaster", "plank", "brick"], [4, 0.9 if fn in ("farm", "smith") else 0.4, 0.5])
    if look.get("lower"):
        c["lower"] = look["lower"][variant % len(look["lower"])]
    if look.get("roof"):
        c["roof"] = look["roof"][variant % len(look["roof"])]
    c["storey"] = rng.uniform(7.6, 8.6)
    c["jet"] = rng.choice([0.0, 0.5, 0.9, 1.3]) if c["upper"] == "plaster" else 0.0
    c["pitch"] = look.get("pitch", 0) * rng.uniform(0.94, 1.06) or (rng.uniform(1.05, 1.3) if c["roof"] == "thatch" else rng.uniform(0.85, 1.25))
    c["sag"] = rng.uniform(0.15, 0.65)
    c["hip"] = choose(rng, [0, 0.34, 0.55], [3, 1, 0.8]) if fam in ("cottage", "eaves_front", "longhouse", "courtyard") else 0
    c["bay"] = rng.uniform(3.7, 5.2)
    c["braces"] = rng.choice([["x", "brace"], ["chevron", "post"], ["k", "brace2", "post"], ["brace", "brace2"], ["brick", "brace", "x"], ["post"], ["chevron", "x", "brick"], ["brace", "post", "brace2"]])
    c["win"] = rng.choice([(2.0, 2.6), (2.4, 3.0), (1.7, 3.0), (2.8, 2.4)])
    c["shutters"] = rng.random() < 0.7
    c["boxes"] = rng.random() < 0.6
    c["dormers"] = 0 if c["roof"] == "thatch" else choose(rng, [0, 1, 2, 3], [1.4, 1.4, 1, 0.3])
    c["chimneys"] = choose(rng, [1, 2], [2.4, 1])
    c["ivy"] = rng.random() < 0.5
    c["tint"] = rng.choice(TINTS)
    c["shutter_col"] = rng.choice(SHUTTERS)
    c["door_x"] = rng.choice([0, 0, -0.2, 0.22])
    c["W"], c["D"] = W, D
    c["mirror"] = 1 if rng.random() < 0.5 else -1
    return c


class Build:
    def __init__(self, rng, pal, c):
        self.m, self.rng, self.c = M(), rng, c
        pal = dict(pal)
        pal["wood"] = vary(rng, pal["wood"], 0.16)
        look = c["look"]
        pal["accent"] = look.get("shutter") or c["shutter_col"] or pal["accent"]
        self.pal = pal
        wood = pal["wood"]
        stone = vary(rng, pal["stone"], 0.08)
        plaster = vary(rng, tuple(min(0.9, a * b) for a, b in zip(pal["wall"], c["tint"])), 0.05)
        boards = vary(rng, mul(mix(wood, (0.4, 0.38, 0.35), look.get("dull", 0.0) * 0.6), 1.25), 0.1)
        self.stone, self.plaster = stone, plaster
        self.skins = {"plaster": ("Concrete", plaster), "rubble": ("Rubble", stone), "masonry": ("Slate", mul(stone, 1.06)), "brick": ("Brick", vary(rng, (0.4, 0.19, 0.13), 0.14)), "plank": ("WoodPlanks", boards)}
        self.rcol = {"thatch": vary(rng, (0.48, 0.36, 0.18), 0.12), "slate": mix(mul(pal["stone"], 0.6), pal["roof"], rng.uniform(0.1, 0.35)), "tile": vary(rng, pal["roof"], 0.18), "plank": mul(wood, 1.05), "metal": (0.34, 0.3, 0.28)}[c["roof"]]
        self.n = 0

    def skin(self, kind):
        return self.skins[kind]

    def plinth(self, x0, x1, y0, y1, h=1.5):
        m, rng = self.m, self.rng
        W, D, cx, cy = x1 - x0, y1 - y0, (x0 + x1) / 2, (y0 + y1) / 2
        B = M()
        for k in range(2):
            for a, b in (((-W / 2, -D / 2), (W / 2, -D / 2)), ((W / 2, -D / 2), (W / 2, D / 2)), ((W / 2, D / 2), (-W / 2, D / 2)), ((-W / 2, D / 2), (-W / 2, -D / 2))):
                stone_course(B, rng, a, b, -0.4 + k * 0.95, 0.98, 1.2 - k * 0.2, mul(self.stone, 0.95), 2.3, mat="Rock")
        B.box((0, 0, -2.6), (W + 0.7, D + 0.7, 5.2), "Rubble", mul(self.stone, 0.85))
        B.box((0, 0, h - 0.3), (W - 0.4, D - 0.4, 0.6), "WoodPlanks", mul(self.pal["wood"], 1.25))
        m.merge(B, Matrix.Translation((cx, cy, 0)))

    def storey(self, x0, x1, y0, y1, z0, z1, skin, faces="NSEW", doors=(), wins=True, big=False, open_front=False, floor=True):
        """One storey: four walls with their own skin, framing where it is plaster or plank, windows on the structural bays."""
        m, rng, c, pal = self.m, self.rng, self.c, self.pal
        mat, col = self.skin(skin)
        framed = skin == "plaster" and c["look"].get("upper") in (None, "plaster")
        wood = pal["wood"]
        sides = {"N": ((x1, y1), (x0, y1), (0, 1)), "S": ((x0, y0), (x1, y0), (0, -1)), "E": ((x1, y0), (x1, y1), (1, 0)), "W": ((x0, y1), (x0, y0), (-1, 0))}
        if floor:
            m.box(((x0 + x1) / 2, (y0 + y1) / 2, z0 - 0.1), (x1 - x0 - 0.1, y1 - y0 - 0.1, 0.45), "WoodPlanks", mul(wood, 0.9))
        for key in faces:
            a, b, o = sides[key]
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            holes, dws = [], []
            for dk, du, dw, dh in doors:
                if dk == key:
                    holes.append((L * du - dw / 2, L * du + dw / 2, z0, z0 + dh))
                    dws.append((du, dw, dh))
            bays = max(2, int(round(L / c["bay"])))
            spots = []
            for k in range(bays):
                u = (k + 0.5) / bays
                if any(abs(u - du) * L < dw / 2 + c["win"][0] * 0.75 for du, dw, dh in dws):
                    continue
                spots.append(u)
            pick = []
            if wins and spots:
                front = key == "N"
                for i, u in enumerate(spots):
                    if front or (key == "S" and i % 2 == 0) or (key in "EW" and (len(spots) < 3 or i % 2 == 1)):
                        pick.append(u)
            ww, wh = (min(L / bays - 1.0, 4.6), 3.8) if big and key == "N" else c["win"]
            zc = z0 + (z1 - z0) * (0.5 if not big else 0.48)
            for u in pick:
                holes.append((L * u - ww / 2, L * u + ww / 2, zc - wh / 2, zc + wh / 2))
            wall(m, a, b, z0, z1, 0.55, mat, col, holes)
            A, B2, O = Vector((*a, 0)), Vector((*b, 0)), Vector((*o, 0))
            face = math.degrees(math.atan2(o[1], o[0]))
            for u in pick:
                p = A.lerp(B2, u) + O * 0.22 + UP * zc
                window(m, rng, pal, p, face, ww, wh, shutters=c["shutters"] and not big and L / bays > ww * 1.95, box=c["boxes"] and key == "N" and not big)
            if framed:
                beam(m, rng, A + O * 0.15 + UP * (z0 + 0.25), B2 + O * 0.15 + UP * (z0 + 0.25), 0.6, 0.6, wood) if not dws else None
                beam(m, rng, A + O * 0.15 + UP * (z1 - 0.25), B2 + O * 0.15 + UP * (z1 - 0.25), 0.6, 0.6, wood)
                from wf_build import panel
                for k in range(bays + 1):
                    u = k / bays
                    if any(abs(u - du) * L < dw / 2 + 0.4 for du, dw, dh in dws):
                        continue
                    p = A.lerp(B2, u)
                    beam(m, rng, p + O * 0.18 + UP * z0, p + O * 0.18 + UP * z1, 0.6 if k in (0, bays) else 0.46, 0.6, wood)
                for k in range(bays):
                    u = (k + 0.5) / bays
                    p, q = A.lerp(B2, (k + 0.07) / bays), A.lerp(B2, (k + 0.93) / bays)
                    if u in pick:
                        zs = zc - wh / 2 - 0.55
                        if zs > z0 + 1.2:
                            beam(m, rng, p + O * 0.2 + UP * zs, q + O * 0.2 + UP * zs, 0.34, 0.36, wood)
                            if len(c["braces"]) > 1:
                                panel(m, rng, pal, p, q, z0, zs + 0.2, O * 0.2, "x" if c["braces"][0] == "x" else "post", wood)
                    elif not any(abs(u - du) * L < dw / 2 + 0.8 for du, dw, dh in dws):
                        panel(m, rng, pal, p, q, z0, z1, O * 0.2, c["braces"][(k + self.n) % len(c["braces"])], wood)
                self.n += 1
            else:
                if skin == "plank":
                    for k in range(bays + 1):
                        p = A.lerp(B2, k / bays)
                        if not any(abs(k / bays - du) * L < dw / 2 + 0.3 for du, dw, dh in dws):
                            beam(m, rng, p + O * 0.3 + UP * z0, p + O * 0.3 + UP * z1, 0.4, 0.22, mul(wood, 0.9))
                for u in pick:  # stone or brick: dressed surround
                    p = A.lerp(B2, u)
                    if skin in ("rubble", "masonry", "brick"):
                        t = Vector((-O.y, O.x, 0))
                        ang = math.degrees(math.atan2(t.y, t.x))
                        for zz, hh in ((zc + wh / 2 + 0.5, 0.8), (zc - wh / 2 - 0.55, 0.45)):
                            q = p + O * 0.3 + UP * zz
                            m.box(q, (ww + 1.4, 0.8, hh), "Rock", mul(self.stone, 1.12), rot=(0, 0, ang), bevel=0.1)
            for du, dw, dh in dws:
                door(m, rng, pal, A.lerp(B2, du) + O * 0.12 + UP * z0, face, dw, dh)
        if skin in ("rubble", "masonry", "brick") and len(faces) == 4:
            for sx in (x0, x1):
                for sy in (y0, y1):
                    quoins(m, rng, pal, sx, sy, z0 - 0.1, z1, self.stone, 1.4)

    def jetty(self, x0, x1, y0, y1, z, jet, sides="N"):
        m, rng, wood = self.m, self.rng, self.pal["wood"]
        n = max(3, int((x1 - x0) / 2.4))
        for s in sides:
            y, sg = (y1, 1) if s == "N" else (y0, -1)
            for k in range(n):
                x = x0 + 0.8 + k * (x1 - x0 - 1.6) / (n - 1)
                m.box((x, y - sg * 0.2, z - 0.3), (0.5, jet * 2 + 1.4, 0.6), "Wood", vary(rng, wood, 0.12), bevel=0.1)
                if k % 2 == 0 and jet > 0.6:
                    beam(m, rng, (x, y - sg * jet, z - 2.2), (x, y - sg * 0.1, z - 0.5), 0.4, 0.4, wood)
            beam(m, rng, (x0, y, z - 0.1), (x1, y, z - 0.1), 0.5, 0.6, wood)

    def top(self, x0, x1, y0, y1, z, **kw):
        c = self.c
        axis = kw.pop("axis", "x")
        W, D = (x1 - x0, y1 - y0) if axis == "x" else (y1 - y0, x1 - x0)
        mat, col = self.skin(c["upper"] if c["upper"] in ("plank", "masonry", "rubble", "brick") else "plaster")
        args = dict(shape="gable", over=2.0 if c["roof"] == "thatch" else 1.6, sag=c["sag"], hip=c["hip"], wall_mat=mat, wall_col=col, timber=c["upper"] in ("plaster", "plank"), x=(x0 + x1) / 2, y=(y0 + y1) / 2, axis=axis)
        pitch = kw.pop("pitch", c["pitch"])
        args.update(kw)
        return roof(self.m, self.rng, self.pal, W, D, z, pitch, c["roof"], self.rcol, **args)

    def lean_to(self, x0, x1, y0, y1, zh, zl, side, open_side=True):
        """A shed roof from zh (against the house) down to zl, on posts."""
        m, rng, wood = self.m, self.rng, self.pal["wood"]
        dx, dy = {"E": (1, 0), "W": (-1, 0), "N": (0, 1), "S": (0, -1)}[side]
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        along = (y1 - y0) if dx else (x1 - x0)
        depth = (x1 - x0) if dx else (y1 - y0)
        n = max(4, int(along / 1.2))
        tilt = math.degrees(math.atan2(zh - zl, depth))
        mat = {"thatch": "Thatch", "plank": "WoodPlanks"}.get(self.c["roof"], "Roof")
        for k in range(n):
            o = -along / 2 + along * (k + 0.5) / n
            p = (cx, cy + o, (zh + zl) / 2) if dx else (cx + o, cy, (zh + zl) / 2)
            s = (math.hypot(depth, zh - zl) + 1.2, along / n + 0.02, 0.36) if dx else (along / n + 0.02, math.hypot(depth, zh - zl) + 1.2, 0.36)
            m.box(p, s, mat, vary(rng, self.rcol, 0.08), rot=(0, dx * tilt, 0) if dx else (-dy * tilt, 0, 0))
        for k in range(max(2, int(along / 6) + 1)):
            t = k / max(1, int(along / 6))
            q = Vector((x1 - 0.4 if dx > 0 else x0 + 0.4, y0 + 0.5 + (along - 1) * t, 0)) if dx else Vector((x0 + 0.5 + (along - 1) * t, y1 - 0.4 if dy > 0 else y0 + 0.4, 0))
            m.box((q.x, q.y, 0.2), (1.0, 1.0, 1.0), "Rock", self.stone, bevel=0.14)
            beam(m, rng, q + UP * 0.5, q + UP * (zl + 0.1), 0.5, 0.5, wood)

    def stair(self, x, y, z0, z1, along, width=2.6, side="stone"):
        """Straight outside stair rising along (dx, dy)."""
        m, rng = self.m, self.rng
        n = max(4, int((z1 - z0) / 0.95))
        step = 1.15
        d = Vector((along[0], along[1], 0))
        ang = math.degrees(math.atan2(d.y, d.x))
        for k in range(n):
            p = Vector((x, y, 0)) + d * (k + 0.5) * step
            zt = z0 + (z1 - z0) * (k + 1) / n
            if side == "stone":
                m.box((p.x, p.y, (zt - 0.6) / 2), (step + 0.04, width, zt + 0.6), "Rubble", vary(rng, self.stone, 0.05), rot=(0, 0, ang))
                m.box((p.x, p.y, zt - 0.1), (step + 0.16, width + 0.2, 0.26), "Rock", vary(rng, mul(self.stone, 1.1), 0.06), rot=(0, 0, ang), bevel=0.06)
            else:
                m.box((p.x, p.y, zt - 0.1), (step + 0.1, width, 0.24), "WoodPlanks", vary(rng, mul(self.pal["wood"], 1.15), 0.1), rot=(0, 0, ang), bevel=0.04)
        t = Vector((-d.y, d.x, 0))
        for s in ((1,) if side == "stone" else (-1, 1)):
            a = Vector((x, y, z0 + 2.4)) + t * s * (width / 2 - 0.1)
            b = Vector((x, y, z1 + 2.6)) + d * n * step + t * s * (width / 2 - 0.1)
            beam(m, rng, a, b, 0.24, 0.24, self.pal["wood"])
            for k in range(0, n + 1, 2):
                q = a.lerp(b, k / n)
                beam(m, rng, q - UP * 2.6, q, 0.22, 0.22, self.pal["wood"])
        if side != "stone":
            for s in (-1, 1):
                beam(m, rng, Vector((x, y, z0 - 0.3)) + t * s * (width / 2), Vector((x, y, z1 - 0.3)) + d * n * step + t * s * (width / 2), 0.5, 0.24, self.pal["wood"])
        return Vector((x, y, 0)) + d * n * step

    def gallery(self, x0, x1, y, z, depth=3.0, facing=1):
        m, rng, wood = self.m, self.rng, self.pal["wood"]
        n = max(2, int((x1 - x0) / 4.5))
        for k in range(int(depth / 0.55)):
            m.box(((x0 + x1) / 2, y + facing * (0.3 + k * 0.55), z), (x1 - x0, 0.52, 0.24), "WoodPlanks", vary(rng, mul(wood, 1.15), 0.1))
        for k in range(n + 1):
            x = x0 + (x1 - x0) * k / n
            beam(m, rng, (x, y + facing * 0.1, z - 2.4), (x, y + facing * depth, z - 0.2), 0.36, 0.36, wood)
            beam(m, rng, (x, y + facing * depth, z), (x, y + facing * depth, z + 3.2), 0.36, 0.36, wood)
        for zz, t in ((3.1, 0.34), (0.8, 0.24)):
            beam(m, rng, (x0, y + facing * depth, z + zz), (x1, y + facing * depth, z + zz), t, t, wood)
        for k in range(int((x1 - x0) / 0.8)):
            m.box((x0 + 0.4 + k * 0.8, y + facing * depth, z + 1.9), (0.3, 0.12, 2.2), "WoodPlanks", vary(rng, self.pal["accent"] if self.c["shutters"] else mul(wood, 1.1), 0.08))


def house(rng, pal, size, variant, fn="home", force=None):
    c = configure(rng, size, variant, fn, force)
    b = Build(rng, pal, c)
    m, pal = b.m, b.pal
    W, D, fam, S = c["W"], c["D"], c["fam"], c["storey"]
    base = 1.5
    z1 = base + S
    z2 = z1 + S * 0.92
    jet = c["jet"]
    dx = 0.5 + c["door_x"] * 0.8
    door_n = ("N", dx, 4.0, 7.2)
    big = fn in ("shop", "inn")
    lower, upper = c["lower"], c["upper"]
    chim = []
    front = D / 2
    if fam == "gable_front":  # narrow, gable to the street, two storeys and a garret
        w, d = W * 0.78, D * 1.02
        b.plinth(-w / 2, w / 2, -d / 2, d / 2)
        b.storey(-w / 2, w / 2, -d / 2, d / 2, base, z1, lower, doors=(door_n,), big=big, floor=False)
        furnish(m, rng, pal, w, d, base)
        b.jetty(-w / 2, w / 2, -d / 2, d / 2 + jet, z1, jet, "N")
        b.storey(-w / 2, w / 2, -d / 2, d / 2 + jet, z1 + 0.3, z2, upper)
        ridge = b.top(-w / 2, w / 2, -d / 2, d / 2 + jet, z2, axis="y", pitch=max(1.0, c["pitch"]))
        window(m, rng, pal, (0, d / 2 + jet + 0.3, z2 + 2.6), 90, 1.8, 2.2, shutters=False, box=False)
        chim = [(w * 0.28, -d * 0.2, z2, ridge)]
        front, W = d / 2, w
    elif fam == "eaves_front":
        b.plinth(-W / 2, W / 2, -D / 2, D / 2)
        b.storey(-W / 2, W / 2, -D / 2, D / 2, base, z1, lower, doors=(door_n,), big=big, floor=False)
        furnish(m, rng, pal, W, D, base)
        b.jetty(-W / 2 - jet * 0.3, W / 2 + jet * 0.3, -D / 2 - jet, D / 2 + jet, z1, jet, "NS")
        b.storey(-W / 2 - jet * 0.3, W / 2 + jet * 0.3, -D / 2 - jet, D / 2 + jet, z1 + 0.3, z2, upper)
        ridge = b.top(-W / 2 - jet * 0.3, W / 2 + jet * 0.3, -D / 2 - jet, D / 2 + jet, z2)
        for i in range(min(c["dormers"], int(W / 7))):
            n = min(c["dormers"], int(W / 7))
            dormer(m, rng, pal, ((i - (n - 1) / 2) * W / (n + 0.4), D * 0.34 + jet, z2 + D * 0.15 * c["pitch"] - 0.4), 3.4, 3.0, D * 0.3, c["roof"], b.rcol, b.plaster)
        chim = [(W * 0.3 * c["mirror"], -D * 0.18, z2, ridge)] + ([(-W * 0.32 * c["mirror"], -D * 0.1, z2, ridge)] if c["chimneys"] > 1 else [])
    elif fam == "merchant":  # wide, arcade on the street, three storeys, twin gables
        w, d = W * 1.12, D * 0.96
        b.plinth(-w / 2, w / 2, -d / 2, d / 2 - 2.6)
        b.storey(-w / 2, w / 2, -d / 2, d / 2 - 2.6, base, z1, lower, doors=(("N", 0.5, 4.0, 7.2),), big=True, floor=False)
        furnish(m, rng, pal, w, d - 3, base)
        n = 4
        for k in range(n + 1):
            x = -w / 2 + 0.6 + (w - 1.2) * k / n
            m.box((x, d / 2 - 0.4, 0.4), (1.4, 1.4, 1.4), "Rock", b.stone, bevel=0.15)
            m.box((x, d / 2 - 0.4, z1 / 2 + 0.4), (0.9, 0.9, z1 - 1.4), "Wood" if lower == "plaster" else "Slate", pal["wood"] if lower == "plaster" else mul(b.stone, 1.08), bevel=0.12)
            for s in (-1, 1):
                if 0 <= k + s <= n:
                    beam(m, rng, (x, d / 2 - 0.4, z1 - 2.6), (x + s * 1.9, d / 2 - 0.4, z1 - 0.4), 0.42, 0.42, pal["wood"])
        b.storey(-w / 2, w / 2, -d / 2, d / 2, z1 + 0.2, z2, upper)
        z3 = z2 + S * 0.86
        j = max(0.5, jet)
        b.jetty(-w / 2, w / 2, -d / 2, d / 2 + j, z2, j, "N")
        b.storey(-w / 2, w / 2, -d / 2, d / 2 + j, z2 + 0.3, z3, "plaster" if upper == "plaster" else upper)
        ridge = b.top(-w / 2, w / 2, -d / 2, d / 2 + j, z3, hip=0.3)
        for s in (-1, 1):
            b.top(s * w * 0.25 - w * 0.2, s * w * 0.25 + w * 0.2, 0, d / 2 + j + 0.5, z3, axis="y", over=0.9, sag=0.05, hip=0)
            window(m, rng, pal, (s * w * 0.25, d / 2 + j + 0.9, z3 + 2.0), 90, 1.8, 2.2, shutters=False, box=False)
        chim = [(w * 0.4, -d * 0.2, z3, ridge), (-w * 0.4, -d * 0.2, z3, ridge)]
        front, W = d / 2, w
    elif fam == "tall":  # three storeys on a small plot, each one jettied
        w, d = W * 0.7, D * 0.9
        b.plinth(-w / 2, w / 2, -d / 2, d / 2)
        b.storey(-w / 2, w / 2, -d / 2, d / 2, base, z1, lower, doors=(("N", 0.5, 3.8, 7.0),), big=big, floor=False)
        furnish(m, rng, pal, w, d, base)
        j = max(0.5, jet)
        b.jetty(-w / 2 - j * 0.4, w / 2 + j * 0.4, -d / 2, d / 2 + j, z1, j, "N")
        b.storey(-w / 2 - j * 0.4, w / 2 + j * 0.4, -d / 2, d / 2 + j, z1 + 0.3, z2, upper)
        z3 = z2 + S * 0.84
        b.jetty(-w / 2 - j * 0.8, w / 2 + j * 0.8, -d / 2, d / 2 + j * 1.8, z2, j, "N")
        b.storey(-w / 2 - j * 0.8, w / 2 + j * 0.8, -d / 2, d / 2 + j * 1.8, z2 + 0.3, z3, upper)
        ridge = b.top(-w / 2 - j * 0.8, w / 2 + j * 0.8, -d / 2, d / 2 + j * 1.8, z3, axis="y", pitch=max(1.15, c["pitch"]), hip=c["hip"] * 0.6)
        window(m, rng, pal, (0, d / 2 + j * 1.8 + 0.3, z3 + 2.6), 90, 1.8, 2.4, shutters=False, box=False)
        chim = [(w * 0.3, -d * 0.24, z3, ridge)]
        front, W = d / 2, w
    elif fam == "saltbox":  # long rear slope almost to the ground
        b.plinth(-W / 2, W / 2, -D / 2, D / 2)
        mid = D * 0.06
        b.storey(-W / 2, W / 2, -D / 2, D / 2, base, z1, lower, doors=(door_n,), big=big, floor=False)
        furnish(m, rng, pal, W, D, base)
        b.storey(-W / 2, W / 2, mid, D / 2 + jet, z1 + 0.3, z2, upper)
        wall(m, (-W / 2, -D / 2), (W / 2, -D / 2), base, z1, 0.5, *b.skin(lower))
        top = b.top(-W / 2, W / 2, mid, D / 2 + jet, z2, cat=1.0)
        # the catslide: a slab of roof from the rear eave down over the outshot
        zl = z1 - 0.6
        dep = (mid + D / 2) + 1.6
        tilt = math.degrees(math.atan2(z2 - zl, dep))
        n = int(W / 1.4)
        mat = {"thatch": "Thatch", "plank": "WoodPlanks"}.get(c["roof"], "Roof")
        for k in range(n):
            m.box((-W / 2 - 1.2 + (W + 2.4) * (k + 0.5) / n, mid - dep / 2 + 0.2, (z2 + zl) / 2 + 0.2), ((W + 2.4) / n + 0.02, math.hypot(dep, z2 - zl) + 0.6, 0.45), mat, vary(rng, b.rcol, 0.07), rot=(tilt, 0, 0))
        for s in (-1, 1):
            x = s * W / 2
            tri = [Vector((x, -D / 2, z1 - 0.1)), Vector((x, mid, z1 - 0.1)), Vector((x, mid, z2 - 0.1))]
            m.add(tri, [(0, 1, 2) if s > 0 else (2, 1, 0)], *b.skin("plank" if upper == "plank" else "plaster"))
            m.add([p - Vector((s * 0.3, 0, 0)) for p in tri], [(2, 1, 0) if s > 0 else (0, 1, 2)], *b.skin("plaster"))
        chim = [(W * 0.22 * c["mirror"], mid + D * 0.12, z2, top)]
    elif fam in ("ell", "cross"):
        wx = W * (0.44 if fam == "ell" else 0.4)
        s = c["mirror"]
        wx0 = (s * W / 2 - wx if s > 0 else -W / 2) if fam == "ell" else -wx / 2
        wing = 4.4 if fam == "ell" else 3.2
        yb = D / 2 - 1.8
        b.plinth(-W / 2, W / 2, -D / 2, yb)
        b.plinth(wx0, wx0 + wx, yb - 0.5, yb + wing)
        free = 0.28 if (fam == "ell" and s > 0) else 0.72
        doors = (("N", free, 4.0, 7.2),) if fam == "ell" else ()
        b.storey(-W / 2, W / 2, -D / 2, yb, base, z1, lower, doors=doors, big=False, floor=False)
        furnish(m, rng, pal, W, yb + D / 2, base)
        b.storey(wx0, wx0 + wx, yb, yb + wing, base, z1, lower, faces="NEW", doors=() if fam == "ell" else (("N", 0.5, 4.0, 7.2),), floor=False)
        b.storey(-W / 2, W / 2, -D / 2, yb, z1 + 0.2, z2, upper)
        b.jetty(wx0, wx0 + wx, yb, yb + wing + jet, z1, jet, "N")
        b.storey(wx0, wx0 + wx, yb, yb + wing + jet, z1 + 0.3, z2 + (0.8 if fam == "cross" else 0), upper, faces="NEW")
        ridge = b.top(-W / 2, W / 2, -D / 2, yb, z2)
        b.top(wx0, wx0 + wx, -D * 0.1, yb + wing + jet, z2 + (0.8 if fam == "cross" else 0), axis="y", over=1.1, sag=0.1, hip=0)
        window(m, rng, pal, (wx0 + wx / 2, yb + wing + jet + 0.3, z2 + 2.4), 90, 1.7, 2.1, shutters=False, box=False)
        if fam == "ell":
            lx0, lx1 = (-W / 2 + 0.5, wx0) if s > 0 else (wx0 + wx, W / 2 - 0.5)
            b.lean_to(lx0, lx1, yb, yb + 3.4, z1 - 0.4, z1 - 2.0, "N")
        chim = [(-s * W * 0.3, -D * 0.12, z2, ridge)] + ([(s * W * 0.26, -D * 0.24, z2, ridge)] if c["chimneys"] > 1 else [])
        front = yb + wing
    elif fam == "courtyard":  # three low wings round a yard, gate in the fourth side
        w, d, t = W * 1.16, D * 1.24, 5.4
        zl = base + S * 0.86
        b.plinth(-w / 2, w / 2, -d / 2, -d / 2 + t + 1.2)
        b.storey(-w / 2, w / 2, -d / 2, -d / 2 + t + 1.2, base, zl, lower, doors=(("N", 0.5, 3.8, 6.6),), floor=False)
        zt = zl + S * 0.8
        b.storey(-w / 2 + 1, w / 2 - 1, -d / 2, -d / 2 + t + 1.2, zl + 0.2, zt, upper)
        ridge = b.top(-w / 2 + 1, w / 2 - 1, -d / 2, -d / 2 + t + 1.2, zt, hip=0.3, over=1.2)
        b.gallery(-w / 2 + t, w / 2 - t, -d / 2 + t + 1.2, zl + 0.3, 2.4)
        for s in (-1, 1):
            xa, xb = (w / 2 - t, w / 2) if s > 0 else (-w / 2, -w / 2 + t)
            b.plinth(xa, xb, -d / 2 + t, d / 2)
            b.storey(xa, xb, -d / 2 + t, d / 2, base, zl, "plank" if fn == "farm" and s < 0 else lower, faces="NEW" if True else "", floor=False)
            wall(m, (xa, d / 2), (xb, d / 2), base, zl, 0.4, *b.skin(lower))
            b.top(xa, xb, -d / 2 + t - 1, d / 2, zl, axis="y", over=1.0, hip=0.4 if c["roof"] == "thatch" else 0, pitch=0.95)
        gx = w / 2 - t
        for s in (-1, 1):
            m.box((s * (gx + 3.0) / 2 * 1.02, d / 2 - 0.6, 2.4), (gx - 3.0, 1.0, 5.2), "Rubble", b.stone)
            m.box((s * 2.9, d / 2 - 0.6, 3.6), (1.2, 1.4, 7.6), "Rock", mul(b.stone, 1.08), bevel=0.15)
        beam(m, rng, (-3.4, d / 2 - 0.6, 7.6), (3.4, d / 2 - 0.6, 7.6), 0.8, 0.8, pal["wood"])
        roof(m, rng, pal, 7.4, 2.2, 8.0, 0.8, c["roof"], b.rcol, over=0.6, sag=0.05, flare=0.1, y=d / 2 - 0.6, timber=False, gables=False)
        m.box((0, 0.6, -0.2), (gx * 2, d - t * 2 + 3, 0.5), "Cobblestone", mul(b.stone, 0.8))
        chim = [(w * 0.3, -d / 2 + t * 0.4, zt, ridge)]
        front, W, D = d / 2, w, d
    elif fam == "stair":  # stone ground floor for stock, living floor reached by an outside stair
        b.plinth(-W / 2, W / 2, -D / 2, D / 2)
        b.storey(-W / 2, W / 2, -D / 2, D / 2, base, z1, lower, doors=(("W", 0.5, 4.4, 7.0),), wins=False, floor=False)
        up = Vector((W * 0.22, D / 2, 0))
        b.storey(-W / 2, W / 2, -D / 2, D / 2, z1 + 0.2, z2, upper, doors=(("N", 0.22, 3.4, 6.2),))
        ridge = b.top(-W / 2, W / 2, -D / 2, D / 2, z2, hip=c["hip"])
        x_door = W / 2 - W * 0.22
        n = max(4, int((z1 - 0.2) / 0.95))
        start = x_door - n * 1.15 - 1.4
        b.stair(max(start, -W / 2 - 3), D / 2 + 1.7, 0.0, z1 + 0.3, (1, 0), 2.8, "stone")
        m.box((x_door + 0.4, D / 2 + 1.7, (z1 + 0.3) / 2), (4.6, 3.0, z1 + 0.3), "Rubble", b.stone)
        roof(m, rng, pal, 5.2, 3.6, z1 + 7.6, 0.6, c["roof"], b.rcol, over=0.5, sag=0.05, flare=0.1, x=x_door + 0.4, y=D / 2 + 1.7, timber=False, wall_col=b.plaster)
        for sx in (-2.0, 2.4):
            beam(m, rng, (x_door + 0.4 + sx, D / 2 + 3.0, z1 + 0.3), (x_door + 0.4 + sx, D / 2 + 3.0, z1 + 7.6), 0.4, 0.4, pal["wood"])
        chim = [(-W * 0.34, -D * 0.1, z2, ridge)]
        m_up = up
        front = D / 2 + 3
    elif fam == "tower":  # a house with a stair tower
        b.plinth(-W / 2, W / 2, -D / 2, D / 2)
        b.storey(-W / 2, W / 2, -D / 2, D / 2, base, z1, lower, doors=(("N", 0.5 - 0.16 * c["mirror"], 4.0, 7.2),), floor=False)
        furnish(m, rng, pal, W, D, base)
        b.storey(-W / 2, W / 2, -D / 2, D / 2, z1 + 0.2, z2, upper)
        ridge = b.top(-W / 2, W / 2, -D / 2, D / 2, z2)
        tx, ty, tr = -c["mirror"] * (W / 2 - 1.0), D / 2 - 0.2, 3.6
        hT = z2 + S * 0.9
        m.tube([(tx, ty, -2), (tx, ty, 1.2), (tx, ty, 2.0), (tx, ty, hT)], [tr * 1.16, tr * 1.1, tr, tr * 0.98], b.skin("masonry")[0], lambda q: mul(b.stone, 0.8 + 0.2 * min(1, max(0, q.z / 18))), n=16, smooth=False)
        for z in (z1, z2):
            m.tube([(tx, ty, z - 0.3), (tx, ty, z), (tx, ty, z + 0.3)], [tr, tr + 0.35, tr], "Rock", mul(b.stone, 1.1), n=16, smooth=False, cap=False)
        for k, z in enumerate((5, 11, 17, hT - 2.6)):
            if z < hT - 1:
                a = 0.9 + k * 0.8
                window(m, rng, pal, (tx + math.cos(a) * tr, ty + math.sin(a) * tr, z), math.degrees(a), 1.3, 2.2, shutters=False, box=False)
        from wf_build import spire
        spire(m, rng, pal, (tx, ty, hT), tr * 1.22, tr * 2.4, b.rcol if c["roof"] != "thatch" else pal["roof"], n=16)
        chim = [(c["mirror"] * W * 0.3, -D * 0.16, z2, ridge)]
        front = D / 2
    elif fam == "longhouse":
        w, d = W * 1.2, D * 0.82
        b.plinth(-w / 2, w / 2, -d / 2, d / 2)
        b.storey(-w / 2, w / 2, -d / 2, d / 2, base, z1, lower, doors=(("N", 0.32, 3.8, 6.0),), floor=False)
        furnish(m, rng, pal, w, d, base)
        ridge = b.top(-w / 2, w / 2, -d / 2, d / 2, z1, pitch=max(1.1, c["pitch"]), hip=0.5 if c["roof"] == "thatch" else 0.0)
        b.lean_to(w * 0.06, w / 2, d / 2, d / 2 + 4.4, z1 - 0.4, z1 - 3.0, "N")
        chim = [(-w * 0.12, 0, z1, ridge)]
        front, W, D = d / 2, w, d
    else:  # cottage
        b.plinth(-W / 2, W / 2, -D / 2, D / 2)
        b.storey(-W / 2, W / 2, -D / 2, D / 2, base, z1 - 0.6, lower, doors=(("N", dx, 3.8, 6.0),), floor=False)
        furnish(m, rng, pal, W, D, base)
        ridge = b.top(-W / 2, W / 2, -D / 2, D / 2, z1 - 0.6, pitch=max(1.1, c["pitch"]), hip=c["hip"] or 0.34)
        if c["roof"] != "thatch" or rng.random() < 0.6:
            dormer(m, rng, pal, (W * 0.2 * c["mirror"], D * 0.3, z1 - 0.6 + D * 0.2 * c["pitch"] - 0.6), 3.4, 2.8, D * 0.3, c["roof"], b.rcol, b.plaster)
        if rng.random() < 0.6:
            s = c["mirror"]
            x0, x1 = (W / 2, W / 2 + 4.6) if s > 0 else (-W / 2 - 4.6, -W / 2)
            b.lean_to(x0, x1, -D * 0.4, D * 0.3, z1 - 1.2, z1 - 4.0, "E" if s > 0 else "W")
            woodpile(m, rng, pal, (x0 + x1) / 2, -D * 0.2, 0, 3.4, 3, 90)
        chim = [(-W * 0.28 * c["mirror"], -D * 0.1, z1, ridge)]
    for x, y, z, r in chim:
        chimney(m, rng, {**pal, "stone": b.skins["brick"][1] if lower == "brick" else pal["stone"]}, (x, y), rng.uniform(2.1, 2.7), z - 0.6, r + rng.uniform(1.2, 2.4))

    # ---- what the house does, at its door
    if fn == "shop":
        aw = W * 0.86
        n = max(6, int(aw / 1.3))
        if fam != "merchant":
            for k in range(n):
                col = pal["accent"] if k % 2 else (0.8, 0.76, 0.66)
                m.box((-aw / 2 + aw * (k + 0.5) / n, front + 2.3, z1 - 1.4), (aw / n - 0.02, 4.2, 0.16), "Fabric", vary(rng, col, 0.05), rot=(-17, 0, 0))
                m.box((-aw / 2 + aw * (k + 0.5) / n, front + 4.32, z1 - 2.4), (aw / n - 0.06, 0.1, 0.8), "Fabric", vary(rng, col, 0.05), bevel=0.02)
            for s in (-1, 1):
                beam(m, rng, (s * (aw / 2 - 0.3), front + 4.2, 0), (s * (aw / 2 - 0.3), front + 4.2, z1 - 2.2), 0.36, 0.36, pal["wood"])
        for s in (-1, 1):
            x = s * W * 0.3
            m.box((x, front + (1.3 if fam != "merchant" else -1.2), base + 2.2), (W * 0.24, 1.7, 0.28), "WoodPlanks", mul(pal["wood"], 1.3), bevel=0.06)
            m.box((x, front + (1.3 if fam != "merchant" else -1.2), base + 0.8), (W * 0.2, 1.2, 2.6), "WoodPlanks", vary(rng, mul(pal["wood"], 1.0), 0.1))
            for _ in range(6):
                m.ball((x + rng.uniform(-0.1, 0.1) * W, front + (1.3 if fam != "merchant" else -1.2) + rng.uniform(-0.5, 0.5), base + 2.6), rng.uniform(0.24, 0.36), "SmoothPlastic", vary(rng, rng.choice([(0.7, 0.1, 0.06), (0.82, 0.5, 0.1), (0.3, 0.45, 0.1), (0.72, 0.46, 0.2)]), 0.12), sub=2, squash=(1, 1, 0.85))
        sign(m, rng, pal, (W / 2 - 0.4, front + 0.3, z1 + 2.6), rng.choice(["bread", "mug", "coin"]), pal["accent"])
    if fn == "inn":
        sign(m, rng, pal, (-W / 2 + 0.8, front + 0.4, z1 - 0.4), "mug", pal["accent"])
        for s in (-1, 1):
            m.box((s * W * 0.36, front + 4.6, 1.0), (3.2, 1.0, 0.2), "WoodPlanks", mul(pal["wood"], 1.2), bevel=0.05)
            for k in (-1, 1):
                m.box((s * W * 0.36 + k * 1.2, front + 4.6, 0.45), (0.25, 0.8, 0.95), "Wood", pal["wood"])
    if fn == "smith":
        s = c["mirror"]
        x0, x1 = (W / 2, W / 2 + 6.2) if s > 0 else (-W / 2 - 6.2, -W / 2)
        b.lean_to(x0, x1, -D * 0.42, D * 0.42, z1 - 0.8, z1 - 2.8, "E" if s > 0 else "W")
        fx = (x0 + x1) / 2
        m.box((fx, -D * 0.2, 1.3), (3.2, 3.2, 2.6), "Rubble", b.stone, bevel=0.15)
        m.box((fx, -D * 0.2, 2.75), (2.2, 2.2, 0.3), "Glow", (1.0, 0.32, 0.06))
        m.box((fx, D * 0.18, 1.0), (1.0, 1.0, 2.0), "Wood", pal["wood"])
        m.box((fx, D * 0.18, 2.3), (0.8, 2.2, 0.6), "Metal", (0.16, 0.16, 0.18), bevel=0.1)
        sign(m, rng, pal, (-s * (W / 2 - 1), front + 0.3, z1 - 0.8), "anvil", pal["accent"])
    if fn == "farm":
        for k in range(4):
            m.box((W / 2 + 1.6 + rng.uniform(-0.3, 0.6), -D * 0.3 + k * 2.0, 0.8 + (k % 2) * 0.1), (2.3, 1.6, 1.6), "Thatch", vary(rng, (0.62, 0.47, 0.2), 0.1), rot=(0, 0, rng.uniform(-14, 14)), bevel=0.15)
    if rng.random() < 0.5 and fam not in ("courtyard", "longhouse"):
        woodpile(m, rng, pal, -W * 0.2, -D / 2 - 1.6, -0.1, 4.6, 3 + variant % 2)
    if c["ivy"] and fam not in ("courtyard",):
        climbing(m, rng, pal, Vector((W / 2 + 0.36, -D / 2 + 0.4, 0.2)), Vector((0, 1, 0)), D * rng.uniform(0.35, 0.6), rng.uniform(6, 12), Vector((1, 0, 0)))
    if fam not in ("courtyard", "merchant"):
        x = W * (dx - 0.5) * (-1 if fam in () else 1)
        for s in (-1, 1):
            if rng.random() < 0.6 and fn in ("home", "inn"):
                pot(m, rng, pal, -x + s * 3.6, front + 1.7, 0.0)
    lantern(m, (W * 0.5 - 0.8, front + 0.9, base + 6.0))
    beam(m, rng, (W * 0.5 - 0.8, front + 0.1, base + 6.8), (W * 0.5 - 0.8, front + 1.0, base + 6.8), 0.16, 0.16, IRON)
    return m


MEDIEVAL = {
    "house": lambda r, p, s, v: house(r, p, s, v, "home"), "cottage": lambda r, p, s, v: house(r, p, s, v, "home", "cottage"), "chalet": lambda r, p, s, v: house(r, p, s, v, "home", "eaves_front"),
    "house_large": lambda r, p, s, v: house(r, p, s, v, ("inn", "farm", "hall", "smith")[v % 4]), "shop_building": lambda r, p, s, v: house(r, p, s, v, "shop"),
}
