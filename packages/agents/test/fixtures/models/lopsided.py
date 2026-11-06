# A street lantern whose head sits 0.45 stud off its post: the off-centre gate.
def part(name, verts_fn, color):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts_fn(bm)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(mat(name, color))
    return o

def cone(bm, r1, r2, depth, x, z):
    bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=r1, radius2=r2, depth=depth,
                          matrix=mathutils.Matrix.Translation((x, 0, z)))

def build():
    part("base", lambda bm: cone(bm, 1.0, 0.9, 0.6, 0, 0.3), "#8a8780")
    part("post", lambda bm: cone(bm, 0.25, 0.18, 6, 0.0, 3.3), "#2f3236")
    # the lantern head is meant to be centred but sits off to one side
    part("head", lambda bm: cone(bm, 0.7, 0.7, 1.0, 0.45, 6.6), "#ffc56e")
    part("cap", lambda bm: cone(bm, 0.9, 0.05, 0.8, 0.45, 7.5), "#2f3236")
