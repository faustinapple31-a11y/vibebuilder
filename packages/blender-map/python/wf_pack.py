"""Compact copies of the meshes for the local preview in Studio (EditableMesh: nothing is uploaded): positions on 16 bits,
normals and colours on 8, UVs on 16. One JSON per piece."""
import base64
import json
import struct
import numpy as np

to_srgb = lambda a: np.where(a <= 0.0031308, a * 12.92, 1.055 * np.maximum(a, 0) ** (1 / 2.4) - 0.055)


def pack(ob, mat):
    """One single-material mesh, welded, in Roblox axes."""
    me = ob.data
    me.calc_loop_triangles()
    n = len(me.loops)
    vi = np.empty(n, np.int32)
    me.loops.foreach_get("vertex_index", vi)
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)[vi]
    nr = np.empty(n * 3, np.float32)
    me.corner_normals.foreach_get("vector", nr)
    nr = nr.reshape(-1, 3)
    uv = np.empty(n * 2, np.float32)
    me.uv_layers[0].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    cl = np.empty(n * 4, np.float32)
    me.color_attributes["Col"].data.foreach_get("color", cl)
    cl = np.clip(to_srgb(cl.reshape(-1, 4)[:, :3]), 0, 1)
    pos = np.stack([co[:, 0], co[:, 2], -co[:, 1]], -1)
    nrm = np.stack([nr[:, 0], nr[:, 2], -nr[:, 1]], -1)
    lo, hi = pos.min(0), pos.max(0)
    span = np.maximum(hi - lo, 1e-3)
    P = np.round((pos - lo) / span * 65535).astype(np.uint16)
    N = np.clip(np.round(nrm * 127), -127, 127).astype(np.int8)
    # tiles repeat: each mesh starts near zero so 16 bits are enough
    off = np.floor(uv.min(0))
    UV = uv - off
    ks = max(1.0, float(UV.max()))
    U = np.round(UV / ks * 65535).astype(np.uint16)
    C = np.round(cl * 255).astype(np.uint8)
    key = np.concatenate([P.astype(np.int32), N.astype(np.int32), U.astype(np.int32), C.astype(np.int32)], -1)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    tri = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get("loops", tri)
    t = inv.reshape(-1)[tri].reshape(-1, 3)
    t = t[(t[:, 0] != t[:, 1]) & (t[:, 1] != t[:, 2]) & (t[:, 0] != t[:, 2])]
    rec = np.zeros(len(first), dtype=[("p", "<u2", 3), ("n", "i1", 3), ("c", "u1", 3), ("u", "<u2", 2)])
    rec["p"], rec["n"], rec["c"], rec["u"] = P[first], N[first], C[first], U[first]
    idx = t.astype(np.uint16 if len(first) < 65536 else np.uint32)
    blob = rec.tobytes() + idx.tobytes()
    return {"name": ob.name, "mat": mat, "v": len(first), "t": len(t), "lo": [round(float(v), 4) for v in lo], "span": [round(float(v), 4) for v in span], "uv": [round(float(off[0]), 3), round(float(off[1]), 3), round(ks, 4)], "wide": idx.dtype == np.uint32, "data": base64.b64encode(blob).decode()}


def write(path, meshes):
    json.dump({"meshes": meshes}, open(path, "w"), separators=(",", ":"))
    return struct.calcsize("<I")
