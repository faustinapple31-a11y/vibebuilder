"""The gate a region passes before it leaves Blender: geometry, UVs, materials, what floats, what is buried, what overlaps,
what is missing. `critical` stops the world from being called finished."""
import math
import numpy as np
import bpy
from mathutils import Vector
import wf_export


def p(id_, sev, msg, pos=None, piece=None):
    d = {"id": id_, "severity": sev, "message": msg}
    if pos is not None:
        d["position"] = [round(float(v), 1) for v in pos]
    if piece:
        d["piece"] = piece
    return d


def mesh_checks(ob, landscape):
    out = []
    for q in wf_export.validate(ob.name, ob, None, landscape=landscape):
        if q["id"] in ("nan_vertices", "no_uv", "bad_uv", "no_material"):
            q["severity"] = "critical"
        out.append(q)
    me = ob.data
    n = len(me.polygons)
    if n == 0:
        out.append(p("empty_mesh", "critical", "%s has no faces" % ob.name))
        return out
    if landscape:
        nz = np.empty(n * 3, np.float32)
        me.polygons.foreach_get("normal", nz)
        down = float((nz.reshape(-1, 3)[:, 2] < -0.05).mean())
        if down > 0.004:
            out.append(p("inverted_ground", "critical" if down > 0.05 else "high", "%s: %.1f%% of the ground faces down" % (ob.name, down * 100)))
    # doubled faces: the same three vertices twice
    me.calc_loop_triangles()
    t = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get("vertices", t)
    t = np.sort(t.reshape(-1, 3), axis=1)
    twice = len(t) - len(np.unique(t, axis=0))
    if twice > 2:
        out.append(p("doubled_faces", "low", "%s: %d faces lie on one another" % (ob.name, twice)))
    return out


def boxes(layout, entries, sizes, kinds):
    out = []
    for q in layout:
        if q["cat"] not in kinds or q["key"] not in entries:
            continue
        e = entries[q["key"]]
        s = q["s"]
        a = 2 * math.atan2(q["q"][1], q["q"][3])
        lo, hi = e["min"], e["max"]
        cx, cz = (lo[0] + hi[0]) / 2 * s, (lo[2] + hi[2]) / 2 * s
        c, sn = math.cos(a), math.sin(a)
        out.append((q, q["p"][0] + cx * c + cz * sn, q["p"][2] - cx * sn + cz * c, (hi[0] - lo[0]) / 2 * s, (hi[2] - lo[2]) / 2 * s, a, hi[1] * s))
    return out


def penetration(a, b):
    best = 1e9
    for f in (a, b):
        for ax, az in ((math.cos(f[5]), -math.sin(f[5])), (math.sin(f[5]), math.cos(f[5]))):
            reach = lambda q: abs(math.cos(q[5]) * ax - math.sin(q[5]) * az) * q[3] + abs(math.sin(q[5]) * ax + math.cos(q[5]) * az) * q[4]
            gap = abs((a[1] - b[1]) * ax + (a[2] - b[2]) * az) - reach(a) * 0.86 - reach(b) * 0.86
            if gap >= 0:
                return 0.0
            best = min(best, -gap)
    return best


def inspect(plan, region, ground, tiles, water, ways, coll, layout, entries, kit, missing):
    out = []
    if not np.isfinite(ground.Hf).all():
        out.append(p("broken_ground", "critical", "the ground of %s is not finite" % region["id"]))
    for ob in tiles:
        out += mesh_checks(ob, True)
    for ob in ways:
        out += mesh_checks(ob, True)
    if water:
        out += mesh_checks(water, True)
    if not tiles:
        out.append(p("no_ground", "critical", "%s has no ground" % region["id"]))
    for key in sorted(missing):
        n = sum(1 for q in layout if q["key"] == key)
        out.append(p("missing_piece", "critical", "%s is placed %d times and was not built" % (key, n), piece=key))
    # what floats, what is buried (measured on the mesh, not on the plan)
    hang, sunk = [], []
    for q, x, z, hx, hz, a, top in boxes(layout, entries, None, ("building", "landmark", "prop")):
        e = entries[q["key"]]
        if "floating" in e["tags"] or "water" in e["tags"] or q["id"].startswith("layout_") or "bridge" in q["key"] or "lantern_string" in q["key"] or "wisp" in q["key"] or "cloud" in q["key"] or "mist" in q["key"] or "ski_lift" in q["key"]:
            continue
        r = 0.8
        pts = [(x + (u * hx * math.cos(a) + w * hz * math.sin(a)) * r, z + (-u * hx * math.sin(a) + w * hz * math.cos(a)) * r) for u, w in ((-1, -1), (1, -1), (-1, 1), (1, 1), (0, 0))]
        g = ground.heights([c[0] for c in pts], [c[1] for c in pts])
        base = q["p"][1] + min(0.0, e["min"][1]) * q["s"] - e["sink"] * q["s"] * 0
        air = float(q["p"][1] - g.min())
        low = base - float(g.min())
        if low > (2.2 if q["cat"] != "prop" else 1.2) and air > 2.2:
            hang.append((low, q, x, z))
        if float(g.min()) - q["p"][1] > max(3.5, (e["max"][1]) * q["s"] * 0.55):
            sunk.append((float(g.min()) - q["p"][1], q, x, z))
    for v, q, x, z in sorted(hang, key=lambda t: -t[0])[:12]:
        out.append(p("floating", "high" if v > 6 else "medium", "%s stands %.1f studs above the ground" % (q["id"], v), (x, z), q["key"]))
    for v, q, x, z in sorted(sunk, key=lambda t: -t[0])[:12]:
        out.append(p("buried", "high", "%s is %.1f studs under the ground" % (q["id"], v), (x, z), q["key"]))
    # buildings through one another
    bs = [b for b in boxes(layout, entries, None, ("building", "landmark")) if not b[0]["id"].startswith("layout_")]
    grid = {}
    for k, b in enumerate(bs):
        grid.setdefault((int(b[1] // 80), int(b[2] // 80)), []).append(k)
    hits = []
    for k, b in enumerate(bs):
        for gx in (-1, 0, 1):
            for gz in (-1, 0, 1):
                for q in grid.get((int(b[1] // 80) + gx, int(b[2] // 80) + gz), ()):
                    if q <= k or b[0].get("zone") and b[0].get("zone") == bs[q][0].get("zone") and ("place_" in b[0]["key"] or "facility_" in b[0]["key"] or "place_" in bs[q][0]["key"] or "ruin" in b[0]["key"]):
                        continue
                    if abs(b[0]["p"][1] - bs[q][0]["p"][1]) > max(b[6], bs[q][6]):
                        continue
                    d = penetration(b, bs[q])
                    if d > 1.5:
                        hits.append((d, b, bs[q]))
    for d, a, b in sorted(hits, key=lambda t: -t[0])[:12]:
        out.append(p("overlap", "high" if d > 5 else "medium", "%s and %s run %.1f studs into each other" % (a[0]["id"], b[0]["id"], d), (a[1], a[2]), a[0]["key"]))
    # trees in houses, anything in the road
    walls = {}
    for b in bs:
        walls.setdefault((int(b[1] // 64), int(b[2] // 64)), []).append(b)
    inside = 0
    for q in layout:
        if q["cat"] != "vegetation" or entries.get(q["key"], {}).get("max", [0, 0, 0])[1] * q["s"] < 6:
            continue
        for gx in (-1, 0, 1):
            for gz in (-1, 0, 1):
                for b in walls.get((int(q["p"][0] // 64) + gx, int(q["p"][2] // 64) + gz), ()):
                    dx, dz = q["p"][0] - b[1], q["p"][2] - b[2]
                    u = dx * math.cos(b[5]) - dz * math.sin(b[5])
                    w = dx * math.sin(b[5]) + dz * math.cos(b[5])
                    if abs(u) < b[3] * 0.8 and abs(w) < b[4] * 0.8:
                        inside += 1
    if inside:
        out.append(p("tree_in_building", "medium" if inside < 4 else "high", "%d trees grow through buildings" % inside))
    # scale and pivots
    for q in layout:
        if not 0.05 < q["s"] < 12 or any(not math.isfinite(v) for v in q["p"]):
            out.append(p("bad_transform", "critical", "%s has a broken transform" % q["id"]))
    ids = [q["id"] for q in layout]
    if len(set(ids)) != len(ids):
        out.append(p("duplicate_ids", "high", "%d ids are used twice" % (len(ids) - len(set(ids)))))
    x0, z0, x1, z1 = region["rect"]
    away = sum(1 for q in layout if not (x0 - 4 <= q["p"][0] <= x1 + 6 and z0 - 4 <= q["p"][2] <= z1 + 6))
    if away:
        out.append(p("outside_region", "high", "%d pieces are outside their region" % away))
    return out
