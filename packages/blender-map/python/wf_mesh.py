"""Mesh builder of the Blender map: faces carry a Roblox material name and vertex colours, no textures.

A kit piece is one object; its materials are Roblox material names (Grass, WoodPlanks, Slate...), so the import can
split it into one MeshPart per material and let Roblox's own material tile over the vertex colours.
Coordinates: Blender, Z up, 1 unit = 1 stud, front of a piece toward +Y (Roblox -Z).
"""
import bmesh
import bpy
import math
from mathutils import Vector, Matrix, noise, Euler


def lin(hexa):
    def f(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    h = hexa.lstrip("#")
    return tuple(f(int(h[i:i + 2], 16)) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def mul(a, k):
    return tuple(max(0.0, min(1.0, x * k)) for x in a)


def vary(rng, c, amount=0.12):
    k = 1 + rng.uniform(-amount, amount)
    w = rng.uniform(-amount, amount) * 0.25
    return (max(0, c[0] * k * (1 + w)), max(0, c[1] * k), max(0, c[2] * k * (1 - w)))


class M:
    def __init__(self):
        self.v, self.f, self.fm, self.fc, self.fs, self.vn = [], [], [], [], [], {}

    def add(self, verts, faces, mat, col, smooth=False, normals=None, xf=None):
        base = len(self.v)
        for i, p in enumerate(verts):
            p = Vector(p)
            if xf is not None:
                p = xf @ p
            self.v.append(p)
            if normals is not None:
                n = Vector(normals[i])
                if xf is not None:
                    n = xf.to_3x3() @ n
                self.vn[base + i] = n.normalized()
        for k, fc in enumerate(faces):
            if normals is not None and len(fc) >= 3:
                # a leaf wound against its own normals renders black: the winding follows the normals
                p, q, r = (self.v[base + fc[i]] for i in (0, 1, 2))
                avg = sum((self.vn[base + i] for i in fc), Vector())
                if (q - p).cross(r - p).dot(avg) < 0:
                    fc = list(fc)[::-1]
            self.f.append([base + i for i in fc])
            self.fm.append(mat)
            self.fs.append(smooth)
            if callable(col):
                self.fc.append([col(self.v[base + i]) for i in fc])
            elif isinstance(col, list):
                self.fc.append([col[k]] * len(fc))
            else:
                self.fc.append([col] * len(fc))

    def merge(self, other, xf=None):
        base = len(self.v)
        for i, p in enumerate(other.v):
            self.v.append(xf @ p if xf is not None else p.copy())
            if i in other.vn:
                n = other.vn[i]
                self.vn[base + i] = (xf.to_3x3() @ n).normalized() if xf is not None else n
        for f, m, c, s in zip(other.f, other.fm, other.fc, other.fs):
            self.f.append([base + i for i in f])
            self.fm.append(m)
            self.fc.append(list(c))
            self.fs.append(s)

    # ---- solids
    def box(self, c, s, mat, col, rot=None, bevel=0.0, jitter=0.0, rng=None, taper=1.0):
        """Chamfered box; `jitter` moves the corners so a row of stones or planks is never a copy of itself."""
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        b = min(bevel, hx * 0.45, hy * 0.45, hz * 0.45)
        xf = Matrix.Translation(Vector(c))
        if rot is not None:
            xf = xf @ Euler([math.radians(r) for r in rot]).to_matrix().to_4x4()
        corners = []
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    k = taper if sz > 0 else 1.0
                    p = Vector((sx * hx * k, sy * hy * k, sz * hz))
                    if jitter and rng:
                        p += Vector([rng.uniform(-jitter, jitter) for _ in range(3)])
                    corners.append(((sx, sy, sz), p))
        if b <= 1e-4:
            vs = [p for _, p in corners]
            fs = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        else:
            vs, idx = [], {}
            for (sx, sy, sz), p in corners:
                for axis, d in (("x", (0, -sy * b, -sz * b)), ("y", (-sx * b, 0, -sz * b)), ("z", (-sx * b, -sy * b, 0))):
                    idx[(sx, sy, sz, axis)] = len(vs)
                    vs.append(p + Vector(d))
            g = lambda sx, sy, sz, a: idx[(sx, sy, sz, a)]
            fs = []
            for sg in (-1, 1):
                fs.append([g(sg, -1, -1, "x"), g(sg, 1, -1, "x"), g(sg, 1, 1, "x"), g(sg, -1, 1, "x")])
                fs.append([g(-1, sg, -1, "y"), g(1, sg, -1, "y"), g(1, sg, 1, "y"), g(-1, sg, 1, "y")])
                fs.append([g(-1, -1, sg, "z"), g(1, -1, sg, "z"), g(1, 1, sg, "z"), g(-1, 1, sg, "z")])
            for a in (-1, 1):
                for c2 in (-1, 1):
                    fs.append([g(a, c2, -1, "x"), g(a, c2, 1, "x"), g(a, c2, 1, "y"), g(a, c2, -1, "y")])
                    fs.append([g(a, -1, c2, "x"), g(a, 1, c2, "x"), g(a, 1, c2, "z"), g(a, -1, c2, "z")])
                    fs.append([g(-1, a, c2, "y"), g(1, a, c2, "y"), g(1, a, c2, "z"), g(-1, a, c2, "z")])
            for sx in (-1, 1):
                for sy in (-1, 1):
                    for sz in (-1, 1):
                        fs.append([g(sx, sy, sz, "x"), g(sx, sy, sz, "y"), g(sx, sy, sz, "z")])
        # a convex solid: every face looks away from its centre
        out = []
        for f in fs:
            n = (vs[f[1]] - vs[f[0]]).cross(vs[f[2]] - vs[f[0]])
            mid = sum((vs[i] for i in f), Vector()) / len(f)
            out.append(list(f) if n.dot(mid) >= 0 else list(f)[::-1])
        self.add(vs, out, mat, col, xf=xf)

    def tube(self, pts, radii, mat, col, n=8, cap=True, smooth=True, wobble=0.0, rng=None):
        """A swept tube through points: trunks, branches, posts, ropes."""
        pts = [Vector(p) for p in pts]
        rings, prev = [], None
        for i, p in enumerate(pts):
            d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            ref = prev if prev is not None else (Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 1, 0)))
            u = (ref - d * ref.dot(d)).normalized()
            w = d.cross(u)
            prev = u
            ring = []
            for k in range(n):
                a = k / n * math.tau
                r = radii[i] * (1 + (rng.uniform(-wobble, wobble) if rng and wobble else 0))
                ring.append(p + (u * math.cos(a) + w * math.sin(a)) * r)
            rings.append(ring)
        vs = [v for r in rings for v in r]
        fs = []
        for i in range(len(rings) - 1):
            for k in range(n):
                a, b = i * n + k, i * n + (k + 1) % n
                fs.append((a, b, b + n, a + n))
        self.add(vs, fs, mat, col, smooth=smooth)
        if cap:
            self.add(rings[0], [tuple(range(n))[::-1]], mat, col)
            self.add(rings[-1], [tuple(range(n))], mat, col)

    def cyl(self, c, r, h, mat, col, n=14, r2=None, smooth=True):
        r2 = r if r2 is None else r2
        self.tube([(c[0], c[1], c[2] - h / 2), (c[0], c[1], c[2] + h / 2)], [r, r2], mat, col, n=n, smooth=smooth)

    def ball(self, c, r, mat, col, sub=2, squash=(1, 1, 1), disp=0.0, seed=0.0, smooth=True, normals_from=None):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1)
        vs = []
        for v in bm.verts:
            p = v.co.copy()
            if disp:
                p *= 1 + noise.noise(p * 1.7 + Vector((seed * 3.1, seed * 1.7, seed))) * disp
            vs.append(Vector((p.x * r * squash[0], p.y * r * squash[1], p.z * r * squash[2])) + Vector(c))
        fs = [[v.index for v in f.verts] for f in bm.faces]
        bm.free()
        nrm = [(p - Vector(normals_from)).normalized() for p in vs] if normals_from is not None else None
        self.add(vs, fs, mat, col, smooth=smooth, normals=nrm)

    # ---- to Blender
    def obj(self, name, collection=None):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(p) for p in self.v], [], self.f)
        names = sorted(set(self.fm))
        for n in names:
            me.materials.append(material(n))
        order = {n: i for i, n in enumerate(names)}
        me.polygons.foreach_set("material_index", [order[m] for m in self.fm])
        me.polygons.foreach_set("use_smooth", self.fs)
        attr = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
        flat = []
        for cs in self.fc:
            for c in cs:
                flat.extend((c[0], c[1], c[2], 1.0))
        attr.data.foreach_set("color", flat)
        me.color_attributes.active_color = attr
        me.update()
        if self.vn:
            out = []
            for poly in me.polygons:
                for li in poly.loop_indices:
                    vi = me.loops[li].vertex_index
                    n = self.vn.get(vi)
                    if n is None:
                        n = me.vertices[vi].normal if poly.use_smooth else poly.normal
                    out.append(tuple(n))
            me.normals_split_custom_set(out)
        ob = bpy.data.objects.new(name, me)
        (collection or bpy.context.scene.collection).objects.link(ob)
        return ob


# roughness, noise scale, bump strength, colour mottling: a stand-in for the Roblox material in the renders
SURFACES = {
    "Grass": (0.95, 9.0, 0.25, 0.22), "LeafyGrass": (0.95, 7.0, 0.3, 0.25), "Ground": (0.95, 4.0, 0.5, 0.25), "Mud": (0.7, 3.0, 0.4, 0.2),
    "Rock": (0.9, 1.6, 0.6, 0.22), "Slate": (0.85, 2.2, 0.45, 0.2), "Cobblestone": (0.85, 2.4, 0.7, 0.22), "Brick": (0.9, 3.0, 0.4, 0.2),
    "Wood": (0.8, 5.0, 0.35, 0.22), "WoodPlanks": (0.75, 5.0, 0.35, 0.22), "Concrete": (0.9, 5.0, 0.15, 0.1), "Sand": (0.95, 10.0, 0.2, 0.12),
    "Metal": (0.45, 6.0, 0.1, 0.1), "Fabric": (0.95, 14.0, 0.15, 0.1), "SmoothPlastic": (0.6, 1.0, 0.0, 0.0), "Snow": (0.8, 6.0, 0.2, 0.06),
    "Basalt": (0.9, 1.6, 0.6, 0.2), "Limestone": (0.9, 3.0, 0.3, 0.14), "Sandstone": (0.9, 3.0, 0.3, 0.16), "Leaf": (0.8, 3.0, 0.0, 0.12),
}


def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    col = nt.nodes.new("ShaderNodeVertexColor")
    col.layer_name = "Col"
    if name in ("Glow", "Neon"):
        nt.links.new(col.outputs[0], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 1.7
        nt.links.new(col.outputs[0], bsdf.inputs["Base Color"])
        return m
    rough, scale, strength, mottle = SURFACES.get(name, (0.85, 4.0, 0.2, 0.12))
    bsdf.inputs["Roughness"].default_value = rough
    if name == "Metal":
        bsdf.inputs["Metallic"].default_value = 0.75
    if name == "Glass":
        bsdf.inputs["Roughness"].default_value = 0.12
        bsdf.inputs["Emission Strength"].default_value = 0.5
        nt.links.new(col.outputs[0], bsdf.inputs["Emission Color"])
        nt.links.new(col.outputs[0], bsdf.inputs["Base Color"])
        return m
    if name == "Water":
        bsdf.inputs["Roughness"].default_value = 0.08
        bsdf.inputs["Alpha"].default_value = 0.8
        nt.links.new(col.outputs[0], bsdf.inputs["Base Color"])
        return m
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = scale * 0.35
    nz.inputs["Detail"].default_value = 6
    nt.links.new(geo.outputs["Position"], nz.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.3
    ramp.inputs["From Max"].default_value = 0.7
    ramp.inputs["To Min"].default_value = 1 - mottle
    ramp.inputs["To Max"].default_value = 1 + mottle
    nt.links.new(nz.outputs[0], ramp.inputs["Value"])
    sc = nt.nodes.new("ShaderNodeVectorMath")
    sc.operation = "SCALE"
    nt.links.new(col.outputs[0], sc.inputs[0])
    nt.links.new(ramp.outputs[0], sc.inputs["Scale"])
    nt.links.new(sc.outputs[0], bsdf.inputs["Base Color"])
    if strength > 0:
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = strength
        bump.inputs["Distance"].default_value = 0.35
        nt.links.new(nz.outputs[0], bump.inputs["Height"])
        nt.links.new(bump.outputs[0], bsdf.inputs["Normal"])
    if name == "Leaf":
        tr = nt.nodes.new("ShaderNodeBsdfTranslucent")
        ms = nt.nodes.new("ShaderNodeMixShader")
        ms.inputs[0].default_value = 0.3
        out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        nt.links.new(sc.outputs[0], tr.inputs["Color"])
        nt.links.new(bsdf.outputs[0], ms.inputs[1])
        nt.links.new(tr.outputs[0], ms.inputs[2])
        nt.links.new(ms.outputs[0], out.inputs[0])
    return m
