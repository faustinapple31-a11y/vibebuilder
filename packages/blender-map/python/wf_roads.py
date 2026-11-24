"""Roads as they are built: a crowned carriageway, kerbs and pavements along the streets, markings, crossings; worn verges
on a track. A road is cut into regions at fixed stations of its own length, so the two sides of a border meet."""
import math
import numpy as np
from mathutils import Vector
from wf_mesh import M, lin, mix, mul, vary
import wf_noise as N

ASPHALT = (0.085, 0.085, 0.09)
KINDS = {
    "asphalt_road": ("Asphalt", ASPHALT, "paved"), "neon_road": ("Asphalt", (0.05, 0.05, 0.065), "paved"), "concrete_road": ("RealConcrete", (0.34, 0.34, 0.33), "paved"),
    "cobblestone_road": ("Cobblestone", None, "stone"), "brick_road": ("Brick", (0.34, 0.17, 0.12), "stone"), "stone_path": ("Rubble", None, "stone"), "metal_walkway": ("Panel", (0.3, 0.32, 0.34), "paved"),
    "wooden_walkway": ("WoodPlanks", None, "stone"), "dirt_path": ("Ground", None, "track"), "dirt": ("Ground", None, "track"), "sand_path": ("Sand", (0.5, 0.4, 0.25), "track"), "snow_path": ("Snow", (0.62, 0.66, 0.72), "track"),
}
WALK = 4.6  # width of a pavement
KERB = 0.42


class Roads:
    def __init__(self, plan, region):
        self.plan, self.region = plan, region
        self.roads = [p for p in region["paths"] if p["kind"] == "road" and p["id"] != "race_track"] + [p for p in region["paths"] if p["id"] == "race_track"]
        self.lines = []
        for p in self.roads:
            pts = np.array(p["points"], np.float64)
            seg = np.hypot(*np.diff(pts, axis=0).T)
            keep = np.concatenate([[True], seg > 1e-4])
            pts = pts[keep]
            if len(pts) < 2:
                self.lines.append(None)
                continue
            seg = np.hypot(*np.diff(pts, axis=0).T)
            s = np.concatenate([[0], np.cumsum(seg)])
            n = max(2, int(math.ceil(s[-1] / 3.0)) + 1)
            at = np.linspace(0, s[-1], n)
            x, z = np.interp(at, s, pts[:, 0]), np.interp(at, s, pts[:, 1])
            # corners of the plan are rounded a little, ends stay where they are
            for _ in range(2):
                x[1:-1] = (x[:-2] + 2 * x[1:-1] + x[2:]) / 4
                z[1:-1] = (z[:-2] + 2 * z[1:-1] + z[2:]) / 4
            tx, tz = np.gradient(x), np.gradient(z)
            l = np.hypot(tx, tz) + 1e-9
            self.lines.append({"x": x, "z": z, "s": at, "tx": tx / l, "tz": tz / l, "w": p["width"], "road": p})
        self.grid = {}
        for k, ln in enumerate(self.lines):
            if ln is None:
                continue
            for i in range(len(ln["x"])):
                self.grid.setdefault((int(ln["x"][i] // 32), int(ln["z"][i] // 32)), []).append((k, i))

    def distance(self, X, Z):
        """Distance to the edge of the nearest road (negative on it), up to 40 studs."""
        out = np.full(X.shape, 99.0)
        x0, z0 = X[0, 0], Z[0, 0]
        step = X[0, 1] - X[0, 0]
        for ln in self.lines:
            if ln is None:
                continue
            reach = ln["w"] / 2 + 40
            for i in range(len(ln["x"]) - 1):
                ax, az, bx, bz = ln["x"][i], ln["z"][i], ln["x"][i + 1], ln["z"][i + 1]
                i0, i1 = int((min(ax, bx) - reach - x0) / step), int((max(ax, bx) + reach - x0) / step) + 2
                j0, j1 = int((min(az, bz) - reach - z0) / step), int((max(az, bz) + reach - z0) / step) + 2
                i0, j0, i1, j1 = max(0, i0), max(0, j0), min(X.shape[1], i1), min(X.shape[0], j1)
                if i0 >= i1 or j0 >= j1:
                    continue
                xx, zz = X[j0:j1, i0:i1], Z[j0:j1, i0:i1]
                dx, dz = bx - ax, bz - az
                t = np.clip(((xx - ax) * dx + (zz - az) * dz) / (dx * dx + dz * dz + 1e-9), 0, 1)
                d = np.hypot(xx - ax - t * dx, zz - az - t * dz) - ln["w"] / 2
                out[j0:j1, i0:i1] = np.minimum(out[j0:j1, i0:i1], d)
        return out

    def other(self, k, x, z, reach=24):
        """Distance to the edge of the nearest road other than road k."""
        best = 99.0
        bx, bz = int(x // 32), int(z // 32)
        for gx in (bx - 1, bx, bx + 1):
            for gz in (bz - 1, bz, bz + 1):
                for q, i in self.grid.get((gx, gz), ()):
                    if q == k:
                        continue
                    ln = self.lines[q]
                    d = math.hypot(ln["x"][i] - x, ln["z"][i] - z) - ln["w"] / 2
                    if d < best:
                        best = d
        return best

    def build(self, ground, collection):
        """One object per kind of surface; returns them with their triangle count."""
        pal = {k: lin(v) for k, v in self.plan["palette"].items()}
        x0, z0, x1, z1 = self.region["rect"]
        inside = lambda x, z: x0 <= x < x1 and z0 <= z < z1
        seed = int(self.plan["seed"]) % 9973
        city = self.plan["architecture"] in ("modern_house", "apartment_block", "cyber_block", "industrial_shed", "scifi_module")
        surf, walk, marks = M(), M(), M()
        order = sorted(range(len(self.lines)), key=lambda k: (-(self.lines[k]["w"] if self.lines[k] else 0), self.roads[k]["id"]))
        rank = {k: r for r, k in enumerate(order)}
        wet = ground.WATER
        for k, ln in enumerate(self.lines):
            if ln is None:
                continue
            road = ln["road"]
            mat, col, kind = KINDS.get(road["type"], ("Ground", None, "track"))
            col = col or (mul(pal["stone"], 0.85) if kind == "stone" and mat != "WoodPlanks" else mul(pal["wood"], 1.2) if mat == "WoodPlanks" else mix(pal["ground"], (0.32, 0.25, 0.16), 0.55))
            x, z, tx, tz, w = ln["x"], ln["z"], ln["tx"], ln["tz"], ln["w"]
            nx, nz = -tz, tx
            n = len(x)
            half = w / 2
            # height of the axis: the ground of the plan, smoothed along the way
            hy = ground.linear(x, z)
            for _ in range(2):
                hy[1:-1] = (hy[:-2] + 2 * hy[1:-1] + hy[2:]) / 4
            lift = 0.05 + 0.028 * (len(order) - rank[k]) / max(1, len(order)) * 4
            # a bridge carries the road where there is water under it
            drowned = np.array([not math.isnan(float(ground.cell(wet, np.array(a), np.array(b)))) for a, b in zip(x, z)])
            if kind == "track":
                jl = N.fbm(x / 7 + seed, z / 7, 3, seed + 1) * 0.28 + 1
                jr = N.fbm(x / 7 - seed, z / 7, 3, seed + 2) * 0.28 + 1
                prof = [(-1.0, -0.16), (-0.62, 0.02), (-0.3, -0.07), (0.0, 0.05), (0.3, -0.07), (0.62, 0.02), (1.0, -0.16)]  # two ruts
            else:
                jl = jr = np.ones(n)
                prof = [(-1.0, -0.05), (-0.5, 0.06), (0.0, 0.12), (0.5, 0.06), (1.0, -0.05)]
            cols = len(prof)
            rows = []
            for i in range(n):
                row = []
                for u, dy in prof:
                    r = half * u * (jl[i] if u < 0 else jr[i])
                    row.append(Vector((x[i] + nx[i] * r, -(z[i] + nz[i] * r), hy[i] + lift + dy)))
                rows.append(row)
            for i in range(n - 1):
                mx, mz = (x[i] + x[i + 1]) / 2, (z[i] + z[i + 1]) / 2
                if not inside(mx, mz) or (drowned[i] and drowned[i + 1]):
                    continue
                for c in range(cols - 1):
                    q = [rows[i][c], rows[i + 1][c], rows[i + 1][c + 1], rows[i][c + 1]]
                    if (q[1] - q[0]).cross(q[2] - q[0]).z < 0:
                        q = q[::-1]
                    u0, u1 = half * prof[c][0], half * prof[c + 1][0]
                    uv = [((p.x - x[0]) * 0 + 0, 0) for p in q]
                    uv = []
                    for p in q:
                        # along the road and across it: the grain of the surface turns with the way
                        a = ln["s"][i] if min((p - rows[i][g]).length for g in (c, c + 1)) < 1e-4 else ln["s"][i + 1]
                        b = u0 if min((p - rows[g][c]).length for g in (i, i + 1)) < 1e-4 else u1
                        uv.append((a, b))
                    edge = abs(prof[c][0] + prof[c + 1][0]) / 2
                    tint = 0.9 + 0.16 * float(N.fbm(np.array(mx / 23.0), np.array(mz / 23.0), 3, seed + 5))
                    wear = 1.0 if kind == "paved" else 1.0 - 0.16 * edge
                    surf.add(q, [(0, 1, 2, 3)], mat, mul(col, tint * wear), smooth=True, uv=uv)
            # skirts close the edge of a raised surface
            if kind != "track":
                for i in range(n - 1):
                    mx, mz = (x[i] + x[i + 1]) / 2, (z[i] + z[i + 1]) / 2
                    if not inside(mx, mz) or (drowned[i] and drowned[i + 1]):
                        continue
                    for c, sg in ((0, -1), (cols - 1, 1)):
                        a, b = rows[i][c], rows[i + 1][c]
                        q = [a, b, b - Vector((0, 0, 0.9)), a - Vector((0, 0, 0.9))]
                        nrm = (q[1] - q[0]).cross(q[2] - q[0])
                        if nrm.x * nx[i] * sg - nrm.y * nz[i] * sg < 0:
                            q = q[::-1]
                        surf.add(q, [(0, 1, 2, 3)], mat, mul(col, 0.75))
            street = road["street"] and kind != "track"
            paved = kind == "paved" and w >= 7
            if street and (city or kind == "stone"):
                self.pavements(walk, ln, k, hy, lift, ground, pal, inside, drowned, city)
            if paved and road["type"] != "metal_walkway":
                self.markings(marks, ln, k, hy, lift, inside, drowned, road["type"])
        out = []
        for name, m in (("roads", surf), ("pavements", walk), ("markings", marks)):
            if m.f:
                out.append(m.obj(name, collection))
        return out

    def pavements(self, m, ln, k, hy, lift, ground, pal, inside, drowned, city):
        x, z, tx, tz, half = ln["x"], ln["z"], ln["tx"], ln["tz"], ln["w"] / 2
        nx, nz = -tz, tx
        mat, col = ("RealConcrete", (0.36, 0.355, 0.34)) if city else ("Slate", mul(pal["stone"], 0.8))
        kcol = (0.44, 0.435, 0.42) if city else mul(pal["stone"], 0.95)
        n = len(x)
        for sg in (-1, 1):
            # the pavement stops where another road comes in
            free = np.array([self.other(k, x[i] + nx[i] * sg * (half + 2.2), z[i] + nz[i] * sg * (half + 2.2)) > 1.2 and not drowned[i] for i in range(n)])
            for i in range(n - 1):
                if not (free[i] and free[i + 1]) or not inside((x[i] + x[i + 1]) / 2, (z[i] + z[i + 1]) / 2):
                    continue
                P = lambda j, r, y: Vector((x[j] + nx[j] * sg * r, -(z[j] + nz[j] * sg * r), y))
                top0, top1 = hy[i] + lift + KERB, hy[i + 1] + lift + KERB
                road0, road1 = hy[i] + lift - 0.4, hy[i + 1] + lift - 0.4
                a, b, w2 = half - 0.05, half + 0.55, half + WALK
                g0 = float(ground.linear(np.array(x[i] + nx[i] * sg * w2), np.array(z[i] + nz[i] * sg * w2))) - 1.2
                g1 = float(ground.linear(np.array(x[i + 1] + nx[i + 1] * sg * w2), np.array(z[i + 1] + nz[i + 1] * sg * w2))) - 1.2
                s0, s1 = ln["s"][i], ln["s"][i + 1]
                quads = [
                    ([P(i, a, road0), P(i + 1, a, road1), P(i + 1, a, top1), P(i, a, top0)], "RealConcrete" if city else "Slate", kcol, None),
                    ([P(i, a, top0), P(i + 1, a, top1), P(i + 1, b, top1 + 0.02), P(i, b, top0 + 0.02)], "RealConcrete" if city else "Slate", kcol, None),
                    ([P(i, b, top0 + 0.02), P(i + 1, b, top1 + 0.02), P(i + 1, w2, top1 + 0.06), P(i, w2, top0 + 0.06)], mat, col, [(s0, 0), (s1, 0), (s1, WALK), (s0, WALK)]),
                    ([P(i, w2, top0 + 0.06), P(i + 1, w2, top1 + 0.06), P(i + 1, w2, min(g1, top1)), P(i, w2, min(g0, top0))], "RealConcrete" if city else "Slate", mul(kcol, 0.85), None),
                ]
                for qi, (q, mt, c, uv) in enumerate(quads):
                    nrm = (q[1] - q[0]).cross(q[2] - q[0])
                    up = nrm.z if qi in (1, 2) else (-(nrm.x * nx[i] - nrm.y * nz[i]) * sg if qi == 0 else (nrm.x * nx[i] - nrm.y * nz[i]) * sg)
                    if up < 0:
                        q = q[::-1]
                        uv = uv[::-1] if uv else None
                    m.add(q, [(0, 1, 2, 3)], mt, mul(c, 0.94 + 0.12 * ((i * 37) % 10) / 10), uv=uv)
                # the joint between two flags
                if i % 2 == 0:
                    j0, j1 = P(i, b, top0 + 0.05), P(i, w2, top0 + 0.09)
                    t = Vector((tx[i], -tz[i], 0)) * 0.07
                    q = [j0 - t, j0 + t, j1 + t, j1 - t]
                    if (q[1] - q[0]).cross(q[2] - q[0]).z < 0:
                        q = q[::-1]
                    m.add(q, [(0, 1, 2, 3)], mt, mul(col, 0.55))

    def markings(self, m, ln, k, hy, lift, inside, drowned, kind):
        x, z, tx, tz, w = ln["x"], ln["z"], ln["tx"], ln["tz"], ln["w"]
        nx, nz = -tz, tx
        n = len(x)
        cross = np.array([self.other(k, x[i], z[i]) for i in range(n)])
        white, yellow = (0.62, 0.62, 0.6), (0.6, 0.44, 0.08)
        mat = "Glow" if kind == "neon_road" else "SmoothPlastic"
        if kind == "neon_road":
            white, yellow = (0.1, 0.7, 0.9), (0.9, 0.1, 0.7)

        def stripe(i, t0, t1, r0, r1, col):
            j = min(i + 1, n - 1)
            at = lambda t, r: Vector(((x[i] + (x[j] - x[i]) * t) + nx[i] * r, -((z[i] + (z[j] - z[i]) * t) + nz[i] * r), (hy[i] + (hy[j] - hy[i]) * t) + lift + 0.14 - 0.1 * (abs(r) / (w / 2)) + 0.03))
            q = [at(t0, r0), at(t1, r0), at(t1, r1), at(t0, r1)]
            if (q[1] - q[0]).cross(q[2] - q[0]).z < 0:
                q = q[::-1]
            m.add(q, [(0, 1, 2, 3)], mat, col)
        for i in range(n - 1):
            if not inside((x[i] + x[i + 1]) / 2, (z[i] + z[i + 1]) / 2) or drowned[i] or drowned[i + 1]:
                continue
            if cross[i] < 1.5:
                continue
            if cross[i] > 7 and i % 3 == 0:
                stripe(i, 0.0, 1.0, -0.16, 0.16, yellow if w > 13 else white)
            if w > 13 and cross[i] > 7:
                for sg in (-1, 1):
                    stripe(i, 0.0, 1.02, sg * (w / 2 - 0.9) - 0.12, sg * (w / 2 - 0.9) + 0.12, white)
            # zebra where a street meets another
            if w >= 9 and ln["road"]["street"] and 2.2 < cross[i] <= 5.2 and (i == 0 or not 2.2 < cross[i - 1] <= 5.2 or cross[i] > cross[i - 1]):
                bars = max(4, int((w - 2) / 1.7))
                for b in range(bars):
                    r = -w / 2 + 1 + (b + 0.5) * (w - 2) / bars
                    stripe(i, 0.0, 1.0, r - 0.42, r + 0.42, white)
