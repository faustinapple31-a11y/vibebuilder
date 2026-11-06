# The chest with a gem hovering above the lid: the floating gate.
def box(name, size, loc, color, bevel=0.04):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
        v.co += mathutils.Vector(loc)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(mat(name, color))
    if bevel:
        m = o.modifiers.new("b", "BEVEL"); m.width = bevel; m.segments = 2
    return o

def cyl(name, r, depth, loc, rot, color):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=r, radius2=r, depth=depth)
    M = mathutils.Matrix.Translation(loc) @ mathutils.Euler(rot).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(mat(name, color))
    return o

def build():
    box("body", (3, 2, 1.4), (0, 0, 0.9), "#6b4226")
    cyl("lid", 1.0, 3.0, (0, 0, 1.6), (0, math.pi / 2, 0), "#8a5a33")
    for x in (-1.0, 1.0):
        box("band%s" % x, (0.2, 2.1, 1.5), (x, 0, 0.9), "#3a3a40", 0.02)
    box("lock", (0.5, 0.15, 0.6), (0, -1.05, 1.3), "#e0b040", 0.02)
    for x in (-1.3, 1.3):
        for y in (-0.8, 0.8):
            box("foot", (0.35, 0.35, 0.3), (x, y, 0.15), "#3a3a40", 0.02)

base_build = build
def build():
    base_build()
    cyl("gem", 0.3, 0.3, (0, -1.0, 3.4), (math.pi / 2, 0, 0), "#c8324a")
