"""What can be measured on a piece, at three distances. The scores are computed in packages/quality/src/visual.ts; here
there are only numbers: nothing is graded by the code that built it."""
import math
import numpy as np
import wf_textures as tex

VEG = ("round_tree", "birch", "pine_tree", "snow_pine", "willow", "dead_tree", "cherry_tree", "palm", "jungle_tree", "baobab", "acacia", "cypress", "bush", "fern", "grass", "flower", "flower_patch", "burnt_tree")
ARCH = ("house", "house_large", "shop_building", "cottage", "castle", "windmill", "apartment_block", "skyscraper", "manor", "chalet", "church", "tower", "well", "gate_tower")


def arrays(ob):
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32)
    me.vertices.foreach_get("co", co)
    me.calc_loop_triangles()
    tri = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get("vertices", tri)
    return co.reshape(n, 3), tri.reshape(-1, 3)


def silhouette(co, tri, px, span, axis=0):
    """Front (axis 0) or side (axis 1) mask, drawn in numpy."""
    mask = np.zeros((px, px), bool)
    sc = px / span
    P = np.stack([co[:, axis] * sc + px / 2, np.maximum(co[:, 2], 0) * sc], -1)
    T = P[tri]
    lo, hi = np.floor(T.min(1)).astype(int), np.ceil(T.max(1)).astype(int)
    for k in range(len(tri)):
        x0, y0 = max(0, lo[k, 0]), max(0, lo[k, 1])
        x1, y1 = min(px - 1, hi[k, 0]), min(px - 1, hi[k, 1])
        if x1 < x0 or y1 < y0:
            continue
        if x1 - x0 <= 1 and y1 - y0 <= 1:
            mask[y0:y1 + 1, x0:x1 + 1] = True
            continue
        p = T[k]
        d = (p[1, 0] - p[0, 0]) * (p[2, 1] - p[0, 1]) - (p[2, 0] - p[0, 0]) * (p[1, 1] - p[0, 1])
        if abs(d) < 1e-9:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        u = ((gx - p[0, 0]) * (p[2, 1] - p[0, 1]) - (p[2, 0] - p[0, 0]) * (gy - p[0, 1])) / d
        w = ((p[1, 0] - p[0, 0]) * (gy - p[0, 1]) - (gx - p[0, 0]) * (p[1, 1] - p[0, 1])) / d
        mask[y0:y1 + 1, x0:x1 + 1] |= (u >= -0.02) & (w >= -0.02) & (u + w <= 1.02)
    return mask


def iou(a, b):
    return float((a & b).sum() / max(1, (a | b).sum()))


def piece_metrics(name, lods):
    ob = lods[0]
    me = ob.data
    co, tri = arrays(ob)
    span = float(max(np.ptp(co[:, 0]), np.ptp(co[:, 1]), co[:, 2].max(), 1.0)) * 1.1
    close = silhouette(co, tri, 160, span)
    per = int((close ^ np.roll(close, 1, 0)).sum() + (close ^ np.roll(close, 1, 1)).sum())
    box = 2 * int(close.any(0).sum() + close.any(1).sum())
    rows, cols = close.any(1).sum(), close.any(0).sum()
    out = {"name": name, "kind": "vegetation" if name.rpartition("_")[0] in VEG else "architecture" if name.rpartition("_")[0] in ARCH else "prop"}
    out["tris"] = len(tri)
    out["size"] = [round(float(v), 2) for v in ob.dimensions]
    out["outline"] = round(per / max(1, box), 3)
    out["fill"] = round(float(close.sum() / max(1, rows * cols)), 3)
    # flat walls: the share of the area in the largest coplanar, axis-aligned plane
    A, B, C = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
    cr = np.cross(B - A, C - A)
    area = np.linalg.norm(cr, axis=1) / 2
    nrm = cr / np.maximum(area[:, None] * 2, 1e-9)
    key = np.round(np.concatenate([nrm, (nrm * A).sum(1, keepdims=True) / 0.35], 1)).astype(int)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    planes = np.bincount(inv.reshape(-1), weights=area)
    out["largestPlane"] = round(float(planes.max() / max(1e-6, area.sum())), 4)
    # detail at three sizes: share of the triangles by the length of their longest edge
    e = np.maximum.reduce([np.linalg.norm(B - A, axis=1), np.linalg.norm(C - B, axis=1), np.linalg.norm(A - C, axis=1)])
    s = span / 1.1
    out["primary"] = round(float((e > s * 0.2).sum()), 1)
    out["secondary"] = round(float(((e > s * 0.04) & (e <= s * 0.2)).mean()), 3)
    out["tertiary"] = round(float((e <= s * 0.04).mean()), 3)
    # surfaces
    mats = [m.name for m in me.materials]
    out["materials"] = len(mats)
    out["textured"] = round(float(np.mean([tex.ALIAS.get(m, m) in tex.SETS or m == "Leaf" for m in mats])), 3)
    n = len(me.loops)
    col = np.empty(n * 4, np.float32)
    me.color_attributes["Col"].data.foreach_get("color", col)
    col = col.reshape(-1, 4)[:, :3]
    out["hues"] = round(float(col.std(0).mean()), 4)
    uv = np.empty(n * 2, np.float32)
    me.uv_layers[0].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    lt = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get("loops", lt)
    U = uv[lt.reshape(-1, 3)]
    ua = np.abs((U[:, 1, 0] - U[:, 0, 0]) * (U[:, 2, 1] - U[:, 0, 1]) - (U[:, 2, 0] - U[:, 0, 0]) * (U[:, 1, 1] - U[:, 0, 1])) / 2
    ok = (area > 0.02) & (ua > 1e-9)
    if ok.any():
        dens = np.sqrt(ua[ok] / area[ok]) * 1024
        w = area[ok] / area[ok].sum()
        o = np.argsort(dens)
        cw = np.cumsum(w[o])
        out["texel"] = round(float(dens[o][np.searchsorted(cw, 0.5)]), 1)
        out["texelSpread"] = round(float(dens[o][min(len(o) - 1, np.searchsorted(cw, 0.9))] / max(1e-3, dens[o][np.searchsorted(cw, 0.1)])), 2)
    else:
        out["texel"], out["texelSpread"] = 0.0, 99.0
    # what is left of it at medium and far distance
    for i, (px, tag) in enumerate(((56, "medium"), (20, "far")), 1):
        if len(lods) > i and lods[i] is not None and len(lods[i].data.polygons):
            c2, t2 = arrays(lods[i])
            out[tag] = round(iou(silhouette(co, tri, px, span), silhouette(c2, t2, px, span)), 3)
            out[tag + "Tris"] = len(t2)
    return out, close


def variants(masks):
    """Mean silhouette difference between the variants of one prefab."""
    d = [1 - iou(masks[i], masks[j]) for i in range(len(masks)) for j in range(i + 1, len(masks))]
    return round(float(np.mean(d)), 3) if d else None


def survey(levels, floating, log=None):
    pieces, groups = [], {}
    for name, lods in levels.items():
        if name == "ramparts" or lods[0] is None or not lods[0].data.polygons:
            continue
        m, mask = piece_metrics(name, lods)
        pieces.append(m)
        groups.setdefault(name.rpartition("_")[0], []).append(mask)
    return {"pieces": pieces, "variants": {k: {"count": len(v), "difference": variants(v)} for k, v in groups.items()}, "floating": len(floating)}
