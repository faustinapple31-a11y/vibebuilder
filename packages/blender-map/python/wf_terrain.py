"""The ground of one region, built as a mesh: the planner's relief refined with domain-warped noise, thermal and hydraulic
erosion, banks and cliffs; tiles of 128 studs, decimated inside, exact on their borders.

What a point on the border of a region is depends on its world position and on the planner's heights alone (erosion fades
to nothing there), so two regions built by two processes meet without a crack.
"""
import math
import numpy as np
import bpy
from mathutils import Vector
from wf_mesh import M, lin, mix, mul
import wf_noise as N

STEP = 2.0
TILE = 128.0
GREENS = ("Grass", "LeafyGrass", "Ground", "Mud")


class Ground:
    """Fields of one region on a grid of STEP studs, margin included."""

    def __init__(self, plan, region, roads):
        g = region["grid"]
        cs = plan["cellSize"]
        self.plan, self.region, self.roads = plan, region, roads
        self.rect = region["rect"]
        self.cs = cs
        self.gx0, self.gz0, self.gw, self.gd = g["x0"], g["z0"], g["w"], g["d"]
        self.H = np.array(g["heights"], np.float64).reshape(self.gd, self.gw)
        self.MAT = np.array(g["materials"], np.int32).reshape(self.gd, self.gw)
        self.WATER = np.array([np.nan if v is None else v for v in g["water"]], np.float64).reshape(self.gd, self.gw)
        self.pad = 32  # fine cells kept round the region for slopes and erosion
        x0, z0, x1, z1 = self.rect
        self.nx, self.nz = int(round((x1 - x0) / STEP)), int(round((z1 - z0) / STEP))
        xs = x0 + (np.arange(-self.pad, self.nx + self.pad + 1)) * STEP
        zs = z0 + (np.arange(-self.pad, self.nz + self.pad + 1)) * STEP
        self.X, self.Z = np.meshgrid(xs, zs)
        self.seed = int(plan["seed"]) % 100000

    # ---- reading the planner's grid
    def coarse(self, x, z):
        """Catmull-Rom over the planner's cells: no facets of four studs in the slopes."""
        fx = np.clip((x - self.gx0) / self.cs, 0, self.gw - 1.0001)
        fz = np.clip((z - self.gz0) / self.cs, 0, self.gd - 1.0001)
        ix, iz = np.floor(fx).astype(int), np.floor(fz).astype(int)
        tx, tz = fx - ix, fz - iz

        def w(t):
            return (-0.5 * t + t * t - 0.5 * t ** 3, 1 - 2.5 * t * t + 1.5 * t ** 3, 0.5 * t + 2 * t * t - 1.5 * t ** 3, -0.5 * t * t + 0.5 * t ** 3)
        wx, wz = w(tx), w(tz)
        out = np.zeros_like(fx)
        for j in range(4):
            jj = np.clip(iz + j - 1, 0, self.gd - 1)
            row = np.zeros_like(fx)
            for i in range(4):
                row += self.H[jj, np.clip(ix + i - 1, 0, self.gw - 1)] * wx[i]
            out += row * wz[j]
        return out

    def linear(self, x, z):
        fx = np.clip((x - self.gx0) / self.cs, 0, self.gw - 1.0001)
        fz = np.clip((z - self.gz0) / self.cs, 0, self.gd - 1.0001)
        ix, iz = np.floor(fx).astype(int), np.floor(fz).astype(int)
        tx, tz = fx - ix, fz - iz
        H = self.H
        return (H[iz, ix] * (1 - tx) + H[iz, ix + 1] * tx) * (1 - tz) + (H[iz + 1, ix] * (1 - tx) + H[iz + 1, ix + 1] * tx) * tz

    def cell(self, field, x, z):
        i = np.clip(np.round((x - self.gx0) / self.cs).astype(int), 0, self.gw - 1)
        j = np.clip(np.round((z - self.gz0) / self.cs).astype(int), 0, self.gd - 1)
        return field[j, i]

    # ---- building the fields
    def build(self):
        X, Z = self.X, self.Z
        self.road = self.roads.distance(X, Z)  # distance to the edge of the nearest way, negative on it
        # what is level stays level: places, houses, roads
        level = np.full(X.shape, 99.0)
        for x, z, r in self.region["flat"]:
            level = np.minimum(level, np.hypot(X - x, Z - z) - r)
        for x, z, r in self.region["blocks"]:
            level = np.minimum(level, np.hypot(X - x, Z - z) - r * 1.15)
        self.level = level
        base_l, base_c = self.linear(X, Z), self.coarse(X, Z)
        calm = N.smooth(2, 16, np.minimum(self.road, level))  # 0 on roads and pads, 1 in the wild
        h = base_l + (base_c - base_l) * calm
        wet = ~np.isnan(self.cell(self.WATER, X, Z))
        names = np.array(self.plan["materialNames"])
        mat = self.cell(self.MAT, X, Z)
        rocky = np.isin(names[mat], ("Rock", "Slate", "Basalt", "Limestone", "Sandstone"))
        gz, gx = np.gradient(h, STEP)
        slope = np.hypot(gx, gz)
        s = self.seed
        # relief a walker sees: ledges on the cliffs, swells in the fields, dunes in the sand
        cliff = N.smooth(0.5, 1.1, slope)
        ledge = (N.ridged(X / 46, Z / 46, 5, s + 3) - 0.42) * 7.5 + N.warped(X / 17, Z / 17, 0.8, 4, s + 9) * 2.4
        swell = N.warped(X / 38, Z / 38, 0.7, 4, s + 21) * 0.75 + N.fbm(X / 9, Z / 9, 3, s + 33) * 0.2
        sandy = np.isin(names[mat], ("Sand",))
        dune = (1 - np.abs(N.warped(X / 62 + Z / 130, Z / 44, 0.5, 3, s + 55))) * 2.2 - 1.1
        rough = np.where(sandy, dune * (1 - cliff) + ledge * 0.4 * cliff, swell * (1 - cliff) + ledge * cliff * np.where(rocky, 1.0, 0.75))
        shore = self.shore(X, Z)
        rough = rough * N.smooth(1, 9, shore)
        h = h + rough * calm
        # erosion inside, nothing on the border of the region
        x0, z0, x1, z1 = self.rect
        edge = np.minimum(np.minimum(X - x0, x1 - X), np.minimum(Z - z0, z1 - Z))
        inside = N.smooth(4, 40, edge) * calm * N.smooth(2, 14, shore)
        h = h + (self.erode(h) - h) * inside
        # under a carriageway the ground makes room for the road itself
        h = np.where(self.road < -0.6, h - 0.45 * N.smooth(0.6, 1.8, -self.road), h)
        self.Hf, self.shoreD, self.wetf = h, shore, wet
        gz, gx = np.gradient(h, STEP)
        self.slope = np.hypot(gx, gz)
        self.calm = calm
        return self

    def shore(self, X, Z):
        """Distance to the water's edge, about, both ways."""
        wet = ~np.isnan(self.WATER)
        if not wet.any():
            return np.full(X.shape, 99.0)
        d = np.where(wet, 0.0, 1e3)
        for _ in range(8):  # eight cells = 32 studs is as far as anything looks
            m = d.copy()
            m[1:] = np.minimum(m[1:], d[:-1] + self.cs)
            m[:-1] = np.minimum(m[:-1], d[1:] + self.cs)
            m[:, 1:] = np.minimum(m[:, 1:], d[:, :-1] + self.cs)
            m[:, :-1] = np.minimum(m[:, :-1], d[:, 1:] + self.cs)
            d = m
        fx = np.clip((X - self.gx0) / self.cs, 0, self.gw - 1.0001)
        fz = np.clip((Z - self.gz0) / self.cs, 0, self.gd - 1.0001)
        ix, iz = np.floor(fx).astype(int), np.floor(fz).astype(int)
        tx, tz = fx - ix, fz - iz
        d = np.minimum(d, 99)
        return (d[iz, ix] * (1 - tx) + d[iz, ix + 1] * tx) * (1 - tz) + (d[iz + 1, ix] * (1 - tx) + d[iz + 1, ix + 1] * tx) * tz

    def erode(self, h0, rain=70, talus=24):
        """Virtual pipes: water runs, takes ground where it is fast, leaves it where it slows; then scree settles."""
        h = h0.copy()
        w = np.zeros_like(h)
        sed = np.zeros_like(h)
        fl = [np.zeros_like(h) for _ in range(4)]
        hard = 0.55 + 0.45 * N.fbm(self.X / 30, self.Z / 30, 3, self.seed + 77)
        for it in range(rain):
            w += 0.012 * (0.6 + 0.4 * ((it * 7919) % 5) / 4)
            t = h + w
            for k, (dz, dx) in enumerate(((0, 1), (0, -1), (1, 0), (-1, 0))):
                d = t - np.roll(t, (-dz, -dx), (0, 1))
                fl[k] = np.maximum(0, fl[k] * 0.86 + d * 0.16)
            fl[0][:, -1] = fl[1][:, 0] = fl[2][-1] = fl[3][0] = 0
            out = sum(fl)
            k = np.minimum(1, w / (out + 1e-9))
            for q in range(4):
                fl[q] *= k
            out = out * k
            inn = np.roll(fl[0], 1, 1) + np.roll(fl[1], -1, 1) + np.roll(fl[2], 1, 0) + np.roll(fl[3], -1, 0)
            w = np.maximum(0, w + inn - out)
            gz, gx = np.gradient(h, STEP)
            slope = np.sqrt(gx * gx + gz * gz)
            v = np.minimum(1.2, (inn + out) / 2 / (w + 0.02))
            cap = np.minimum(0.5, v * np.maximum(0.03, slope) * 0.55)
            take = np.where(cap > sed, (cap - sed) * 0.28 * hard, 0)
            drop = np.where(cap <= sed, (sed - cap) * 0.3, 0)
            h += drop - take
            sed += take - drop
            # sediment goes with the water
            share = lambda f: f / (w + out + 1e-6)
            moved = [np.minimum(sed * 0.24, sed * share(f)) for f in fl]
            sed = sed - sum(moved) + np.roll(moved[0], 1, 1) + np.roll(moved[1], -1, 1) + np.roll(moved[2], 1, 0) + np.roll(moved[3], -1, 0)
            w *= 0.965
        h += sed * 0.6
        limit = STEP * 1.35  # about 53 degrees: what is steeper and loose comes down
        loose = 1 - N.smooth(1.5, 2.2, np.hypot(*np.gradient(h0, STEP)))
        for _ in range(talus):
            for dz, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
                d = h - np.roll(h, (-dz, -dx), (0, 1))
                m = np.maximum(0, d - limit) * 0.18 * loose
                h = h - m + np.roll(m, (dz, dx), (0, 1))
        return np.clip(h, h0 - 5.5, h0 + 3.5)

    # ---- reading the result
    def height(self, x, z):
        x0, z0 = self.X[0, 0], self.Z[0, 0]
        h, w = self.Hf.shape
        fx, fz = min(max((x - x0) / STEP, 0), w - 1.001), min(max((z - z0) / STEP, 0), h - 1.001)
        i, j = int(fx), int(fz)
        tx, tz = fx - i, fz - j
        H = self.Hf
        return float((H[j, i] * (1 - tx) + H[j, i + 1] * tx) * (1 - tz) + (H[j + 1, i] * (1 - tx) + H[j + 1, i + 1] * tx) * tz)

    def heights(self, xs, zs):
        x0, z0 = self.X[0, 0], self.Z[0, 0]
        h, w = self.Hf.shape
        fx, fz = np.clip((np.asarray(xs) - x0) / STEP, 0, w - 1.001), np.clip((np.asarray(zs) - z0) / STEP, 0, h - 1.001)
        i, j = fx.astype(int), fz.astype(int)
        tx, tz = fx - i, fz - j
        H = self.Hf
        return (H[j, i] * (1 - tx) + H[j, i + 1] * tx) * (1 - tz) + (H[j + 1, i] * (1 - tx) + H[j + 1, i + 1] * tx) * tz

    # ---- what the ground looks like
    def paint(self):
        """Material index and linear colour of every fine vertex."""
        pal = {k: np.array(lin(v)) for k, v in self.plan["palette"].items()}
        X, Z, s = self.X, self.Z, self.seed
        names = list(self.plan["materialNames"])
        # borders of two materials are ragged, not squares of four studs
        jx = N.warped(X / 11, Z / 11, 0.6, 3, s + 5) * 5.5
        jz = N.warped(X / 11 + 40, Z / 11 - 17, 0.6, 3, s + 6) * 5.5
        mat = np.array(names, dtype=object)[self.cell(self.MAT, X + jx, Z + jz)]
        n1, n2, n3 = N.fbm(X / 60, Z / 60, 3, s + 41), N.fbm(X / 12, Z / 12, 3, s + 42), N.fbm(X / 2.7, Z / 2.7, 2, s + 43)
        mixv = lambda a, b, t: a + (b - a) * np.clip(t, 0, 1)[..., None]
        fo, fa, st, gr = pal["foliage"], pal["foliageAlt"], pal["stone"], pal["ground"]
        base = {"Grass": fo, "LeafyGrass": fa, "Ground": gr, "Mud": gr * 0.7, "Rock": (st * 0.62) * 0.78 + gr * 0.22, "Slate": st * 0.5, "Sand": np.array([0.55, 0.43, 0.25]), "Snow": np.array([0.8, 0.83, 0.88]), "Cobblestone": st * 0.9, "Basalt": np.array([0.06, 0.055, 0.06]),
                "Limestone": np.array([0.55, 0.5, 0.4]), "Sandstone": np.array([0.5, 0.33, 0.18]), "Ice": np.array([0.5, 0.68, 0.8]), "Asphalt": np.array([0.09, 0.09, 0.095]), "Pavement": np.array([0.3, 0.3, 0.3]), "CrackedLava": np.array([0.3, 0.06, 0.02]), "Concrete": np.array([0.4, 0.4, 0.4]), "Water": gr * 0.5, "Brick": np.array([0.4, 0.2, 0.14]), "Salt": np.array([0.75, 0.74, 0.72]), "Glacier": np.array([0.6, 0.74, 0.84]), "WoodPlanks": pal["wood"], "Air": gr}
        col = np.zeros(X.shape + (3,))
        out = np.empty(X.shape, object)
        dry = fo[1] < 0.02
        for name in set(mat.ravel()):
            m = mat == name
            c = np.broadcast_to(base.get(name, st), col.shape)
            k = (0.86 + n2 * 0.2 + n3 * 0.12)[..., None]
            if name in GREENS and not (name in ("Ground", "Mud") and dry):
                g = mixv(np.broadcast_to(fo, col.shape), np.broadcast_to(fa, col.shape), 0.5 + n1 * 0.9)
                g = mixv(g, np.broadcast_to(np.array([0.24, 0.24, 0.07]), col.shape), np.maximum(0, n2) * 0.4)
                if name in ("Ground", "Mud"):
                    g = mixv(g, c, 0.55 + n2 * 0.4)
                c = g
                k = (1 + n3 * 0.14 + n2 * 0.06)[..., None]
            col[m] = (c * k)[m]
            out[m] = {"LeafyGrass": "Grass", "Mud": "Ground", "Slate": "Rock", "Air": "Ground", "Water": "Ground", "Limestone": "Rock" if not dry else "Limestone", "Asphalt": "Asphalt", "Pavement": "RealConcrete", "Concrete": "RealConcrete", "Cobblestone": "Cobblestone", "Ice": "Snow", "Glacier": "Snow", "Salt": "Sand", "Brick": "Brick", "WoodPlanks": "WoodPlanks"}.get(name, name)
        # rock shows where the ground is too steep to hold earth, strata in it
        steep = N.smooth(0.72, 1.05, self.slope + n2 * 0.16)
        band = 0.5 + 0.5 * np.sin(self.Hf * 0.62 + n1 * 5 + n2 * 1.5)
        snowy = np.isin(out, ("Snow",))
        rock = np.broadcast_to(base["Basalt"] if "Basalt" in set(mat.ravel()) and self.plan["environment"] == "volcanic" else base["Rock"] * 1.15, col.shape) * (0.72 + 0.36 * band + n3 * 0.12)[..., None]
        if self.plan["environment"] == "desert" or dry:
            rock = np.broadcast_to(base["Sandstone"], col.shape) * (0.7 + 0.4 * band + n3 * 0.1)[..., None]
        soft = ~np.isin(out, ("Asphalt", "RealConcrete", "Cobblestone"))
        k = np.where(soft, steep, 0) * np.where(snowy, 0.8, 1)
        col = col * (1 - k[..., None]) + rock * k[..., None]
        out[(k > 0.55)] = "Rock"
        # scree and bare earth at the foot of slopes
        foot = N.smooth(0.42, 0.62, self.slope + n2 * 0.14) * (1 - steep) * soft * ~snowy
        col = col * (1 - 0.55 * foot[..., None]) + np.broadcast_to(gr * 0.85, col.shape) * (0.55 * foot[..., None])
        # banks: wet sand and pebbles, darker toward the water
        bank = (1 - N.smooth(0, 7, self.shoreD + n2 * 2)) * soft * ~snowy
        col = col * (1 - 0.6 * bank[..., None]) + np.broadcast_to(np.array([0.3, 0.25, 0.17]) * 0.75, col.shape) * (0.6 * bank[..., None])
        out[(bank > 0.62) & soft & (k < 0.5)] = "Gravel"
        # the edge of a way is worn
        worn = (1 - N.smooth(-0.5, 3.2, self.road + n2 * 1.8)) * soft * ~snowy
        col = col * (1 - 0.6 * worn[..., None]) + np.broadcast_to(gr * 0.9, col.shape) * (0.6 * worn[..., None])
        return out, np.clip(col, 0.004, 0.95)

    def tiles(self, collection, decimate=0.42):
        """One object per 128 studs; everything but the rim is decimated, the rim of every tile is kept point for point."""
        mats, cols = self.paint()
        p = self.pad
        x0, z0, x1, z1 = self.rect
        made, tris = [], 0
        n = int(TILE / STEP)
        for tz in range(0, self.nz, n):
            for tx in range(0, self.nx, n):
                wx, wz = min(n, self.nx - tx), min(n, self.nz - tz)
                if wx < 1 or wz < 1:
                    continue
                j0, i0 = p + tz, p + tx
                H = self.Hf[j0:j0 + wz + 1, i0:i0 + wx + 1]
                X = self.X[j0:j0 + wz + 1, i0:i0 + wx + 1]
                Z = self.Z[j0:j0 + wz + 1, i0:i0 + wx + 1]
                C = cols[j0:j0 + wz + 1, i0:i0 + wx + 1]
                Mt = mats[j0:j0 + wz + 1, i0:i0 + wx + 1]
                # drowned ground deep under the water is never seen
                water = self.cell(self.WATER, X, Z)
                if np.nanmin(np.where(np.isnan(water), -1e9, water) - H) > 26:
                    continue
                verts = np.stack([X, -Z, H], -1).reshape(-1, 3)
                me = bpy.data.meshes.new("terrain_%d_%d" % (tx // n, tz // n))
                idx = np.arange((wx + 1) * (wz + 1)).reshape(wz + 1, wx + 1)
                a, b, c, d = idx[:-1, :-1], idx[1:, :-1], idx[1:, 1:], idx[:-1, 1:]
                # the diagonal follows the ground: no saw teeth on a ridge
                flip = np.abs(H[:-1, :-1] - H[1:, 1:]) > np.abs(H[1:, :-1] - H[:-1, 1:])
                t1 = np.where(flip[..., None], np.stack([a, b, d], -1), np.stack([a, b, c], -1)).reshape(-1, 3)
                t2 = np.where(flip[..., None], np.stack([b, c, d], -1), np.stack([a, c, d], -1)).reshape(-1, 3)
                faces = np.concatenate([t1, t2])
                me.from_pydata(verts.tolist(), [], faces.tolist())
                ob = bpy.data.objects.new(me.name, me)
                collection.objects.link(ob)
                attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
                flat = np.ones((len(verts), 4), np.float32)
                flat[:, :3] = C.reshape(-1, 3)
                attr.data.foreach_set("color", flat.ravel())
                # material of each vertex travels through the decimation as a number
                order = sorted(set(Mt.ravel()))
                code = me.attributes.new("mat", "FLOAT", "POINT")
                num = {m: i for i, m in enumerate(order)}
                code.data.foreach_set("value", np.array([num[m] for m in Mt.ravel()], np.float32))
                if decimate < 1:
                    vg = ob.vertex_groups.new(name="inner")
                    rim = np.zeros((wz + 1, wx + 1), bool)
                    rim[0] = rim[-1] = True
                    rim[:, 0] = rim[:, -1] = True
                    vg.add([int(v) for v in idx[~rim].ravel()], 1.0, "ADD")
                    mod = ob.modifiers.new("d", "DECIMATE")
                    mod.ratio = decimate
                    mod.vertex_group = "inner"
                    mod.vertex_group_factor = 1.0
                    dg = bpy.context.evaluated_depsgraph_get()
                    nm = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
                    ob.modifiers.clear()
                    ob.data = nm
                    bpy.data.meshes.remove(me)
                    nm.name = ob.name
                    ob.vertex_groups.clear()
                    me = nm
                tris += self.finish(ob, order)
                made.append(ob)
        return made, tris

    def finish(self, ob, order):
        """Materials by face, corner colours with their gain, UVs in tiles of the world, smooth normals from the field."""
        from wf_mesh import GAIN, material
        import wf_textures as tex
        me = ob.data
        nv, np_ = len(me.vertices), len(me.polygons)
        loops = np.empty(len(me.loops), np.int32)
        me.loops.foreach_get("vertex_index", loops)
        co = np.empty(nv * 3, np.float32)
        me.vertices.foreach_get("co", co)
        co = co.reshape(nv, 3)
        code = np.empty(nv, np.float32)
        me.attributes["mat"].data.foreach_get("value", code)
        cv = np.empty(nv * 4, np.float32)
        me.color_attributes["Col"].data.foreach_get("color", cv)
        cv = cv.reshape(nv, 4)
        tri = loops.reshape(-1, 3)
        face = np.round(np.median(code[tri], axis=1)).astype(int).clip(0, len(order) - 1)
        for m in order:
            me.materials.append(material(m))
        me.polygons.foreach_set("material_index", face.astype(np.int32))
        me.polygons.foreach_set("use_smooth", np.ones(np_, bool))
        me.color_attributes.remove(me.color_attributes["Col"])
        me.attributes.remove(me.attributes["mat"])
        a = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
        cc = cv[loops]
        cc[:, :3] = np.minimum(1, cc[:, :3] * GAIN)
        a.data.foreach_set("color", cc.astype(np.float32).ravel())
        me.color_attributes.active_color = a
        tiles = np.array([tex.TILE.get(tex.ALIAS.get(m, m), 10) for m in order], np.float32)
        uv = co[loops][:, :2] / tiles[np.repeat(face, 3)][:, None]
        # on a cliff the texture hangs from the top instead of being stretched down
        nrm = np.cross(co[tri[:, 1]] - co[tri[:, 0]], co[tri[:, 2]] - co[tri[:, 0]])
        nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
        steep = np.repeat(np.abs(nrm[:, 2]) < 0.6, 3)
        side = np.repeat(np.abs(nrm[:, 0]) > np.abs(nrm[:, 1]), 3)
        hang = np.where(side[:, None], co[loops][:, [1, 2]], co[loops][:, [0, 2]]) / tiles[np.repeat(face, 3)][:, None]
        uv = np.where(steep[:, None], hang, uv)
        me.uv_layers.new(name="UVMap").data.foreach_set("uv", uv.astype(np.float32).ravel())
        # normals from the fine field: the same on both sides of a tile and of a region
        gz, gx = np.gradient(self.Hf, STEP)
        xs, zs = co[:, 0], -co[:, 1]
        i = np.clip(np.round((xs - self.X[0, 0]) / STEP).astype(int), 0, self.Hf.shape[1] - 1)
        j = np.clip(np.round((zs - self.Z[0, 0]) / STEP).astype(int), 0, self.Hf.shape[0] - 1)
        n = np.stack([-gx[j, i], gz[j, i], np.ones(nv)], -1)
        n /= np.linalg.norm(n, axis=1, keepdims=True)
        me.update()
        me.normals_split_custom_set_from_vertices(n.tolist())
        return np_

    def seams(self):
        p = self.pad
        H = self.Hf[p:p + self.nz + 1, p:p + self.nx + 1]
        r = lambda a: [round(float(v), 3) for v in a]
        return {"west": r(H[:, 0]), "east": r(H[:, -1]), "north": r(H[0]), "south": r(H[-1])}

    def water(self, collection):
        """Water surface: cells of the planner, welded, reaching under the banks."""
        x0, z0, x1, z1 = self.rect
        wet = ~np.isnan(self.WATER)
        if not wet.any():
            return None
        pal = lin(self.plan["palette"]["water"])
        grow = wet.copy()
        grow[1:] |= wet[:-1]
        grow[:-1] |= wet[1:]
        grow[:, 1:] |= wet[:, :-1]
        grow[:, :-1] |= wet[:, 1:]
        level = np.where(wet, self.WATER, 0.0)
        cnt = wet.astype(float)
        for _ in range(3):  # the level of a bank cell is its wet neighbours'
            s, c = level * (cnt > 0), (cnt > 0).astype(float)
            ls, lc = s.copy(), c.copy()
            for dz, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                ls += np.roll(s, (dz, dx), (0, 1))
                lc += np.roll(c, (dz, dx), (0, 1))
            level = np.where(cnt > 0, level, np.where(lc > 0, ls / np.maximum(lc, 1), 0))
            cnt = np.where(cnt > 0, cnt, (lc > 0).astype(float))
        m = M()
        ids = {}

        def vert(j, i):
            if (j, i) not in ids:
                ids[(j, i)] = len(m.v)
                m.v.append(Vector((self.gx0 + i * self.cs, -(self.gz0 + j * self.cs), level[j, i] - 0.15)))
            return ids[(j, i)]
        for j in range(self.gd - 1):
            for i in range(self.gw - 1):
                x, z = self.gx0 + (i + 0.5) * self.cs, self.gz0 + (j + 0.5) * self.cs
                if not (x0 <= x < x1 and z0 <= z < z1) or not (grow[j, i] or grow[j + 1, i] or grow[j, i + 1] or grow[j + 1, i + 1]):
                    continue
                if not (cnt[j, i] and cnt[j + 1, i] and cnt[j, i + 1] and cnt[j + 1, i + 1]):
                    continue
                m.f.append([vert(j, i), vert(j + 1, i), vert(j + 1, i + 1), vert(j, i + 1)])
                m.fm.append("Water")
                m.fc.append([pal] * 4)
                m.fs.append(True)
        if not m.f:
            return None
        ob = m.obj("water", collection)
        # flat water needs few triangles: merge what is level
        mod = ob.modifiers.new("d", "DECIMATE")
        mod.decimate_type = "DISSOLVE"
        mod.angle_limit = math.radians(0.6)
        dg = bpy.context.evaluated_depsgraph_get()
        nm = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        ob.modifiers.clear()
        old = ob.data
        ob.data = nm
        bpy.data.meshes.remove(old)
        return ob
