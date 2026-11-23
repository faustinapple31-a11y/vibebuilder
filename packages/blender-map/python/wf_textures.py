"""Procedural tileable texture sets, drawn with numpy: colour, normal and roughness for every surface of the kit.

The colour map is a *neutral detail map* (mean close to 1 once decoded): the vertex colours carry the hue, so the same
stone serves a grey castle, a desert temple and a candy wall, in Blender and in Roblox (SurfaceAppearance x vertex
colour). Verified in Studio: a MeshPart TextureID is multiplied by the vertex colours, a SurfaceAppearance ignores them. So the
colour map is what Roblox shows, and the relief is painted into it (cavities darker, edges lighter); the normal and
roughness maps are for MaterialVariants.
"""
import math
import os
import numpy as np

VERSION = 12
LEAF_VERSION = 13
SIZE = 1024


def rng_of(name):
    return np.random.default_rng(abs(hash_name(name)) % (2 ** 32))


def hash_name(s):
    h = 2166136261
    for c in s:
        h = ((h ^ ord(c)) * 16777619) & 0xFFFFFFFF
    return h


def grid(n=SIZE):
    a = (np.arange(n) + 0.5) / n
    return np.meshgrid(a, a)  # u, v in 0..1


def fbm(rng, beta=1.6, lo=1, hi=400, n=SIZE, aniso=(1.0, 1.0)):
    """Periodic noise with a power-law spectrum, normalised to 0..1 (5th to 95th percentile)."""
    f = np.fft.fft2(rng.standard_normal((n, n)))
    k = np.fft.fftfreq(n) * n
    kx, ky = np.meshgrid(k * aniso[0], k * aniso[1])
    r = np.hypot(kx, ky)
    r[0, 0] = 1
    amp = r ** (-beta)
    amp[(r < lo) | (r > hi)] = 0
    amp[0, 0] = 0
    x = np.real(np.fft.ifft2(f * amp))
    a, b = np.percentile(x, (4, 96))
    return np.clip((x - a) / (b - a), -0.2, 1.2)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def blur(x, r):
    n = x.shape[0]
    k = np.fft.fftfreq(n) * n
    kx, ky = np.meshgrid(k, k)
    g = np.exp(-2 * (math.pi * r / n) ** 2 * (kx ** 2 + ky ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(x) * g))


def normal_map(h, strength):
    n = h.shape[0]
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * n / 8 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * n / 8 * strength
    nz = np.ones_like(h)
    l = np.sqrt(dx * dx + dy * dy + 1)
    return np.stack([-dx / l * 0.5 + 0.5, -dy / l * 0.5 + 0.5, nz / l * 0.5 + 0.5], -1)


def voronoi(rng, count, jitter=0.45, aspect=1.0, n=SIZE):
    """Periodic cells on a jittered grid: distance to the border, cell id, offsets to the seed."""
    cols = max(2, int(round(math.sqrt(count * aspect))))
    rows = max(2, int(round(count / cols)))
    px = ((np.arange(cols)[None, :] + 0.5 + rng.uniform(-jitter, jitter, (rows, cols)) + 0.5 * (np.arange(rows)[:, None] % 2)) / cols) % 1
    py = ((np.arange(rows)[:, None] + 0.5 + rng.uniform(-jitter, jitter, (rows, cols))) / rows) % 1
    pts = np.stack([px.ravel(), py.ravel()], -1)
    u, v = grid(n)
    d1 = np.full((n, n), 9.0)
    d2 = np.full((n, n), 9.0)
    ident = np.zeros((n, n), int)
    sx, sy = cols / rows, 1.0
    for i, (x, y) in enumerate(pts):
        dx = np.abs(u - x)
        dx = np.minimum(dx, 1 - dx) * cols
        dy = np.abs(v - y)
        dy = np.minimum(dy, 1 - dy) * rows
        d = np.hypot(dx, dy)
        near = d < d1
        d2 = np.where(near, d1, np.minimum(d2, d))
        ident = np.where(near, i, ident)
        d1 = np.where(near, d, d1)
    return d2 - d1, ident, d1


def pick(rng, ident, lo, hi):
    return rng.uniform(lo, hi, ident.max() + 1)[ident]


def blocks(rng, rows, per_row, joint, n=SIZE, jitter=0.3, courses=None):
    """Courses of stones or bricks: distance to the joint in 0..0.5 of a course, ident, local u."""
    u, v = grid(n)
    cuts = np.cumsum(courses / courses.sum()) if courses is not None else np.arange(1, rows + 1) / rows
    lows = np.concatenate([[0], cuts[:-1]])
    edge = np.zeros((n, n))
    ident = np.zeros((n, n), int)
    local = np.zeros((n, n))
    base = 0
    for r in range(rows):
        mask = (v >= lows[r]) & (v < cuts[r])
        h = cuts[r] - lows[r]
        w = rng.uniform(1 - jitter, 1 + jitter, per_row)
        xs = np.cumsum(w / w.sum())
        off = rng.uniform(0, 1)
        uu = (u + off) % 1
        k = np.searchsorted(xs, uu[mask]).clip(0, per_row - 1)
        x0 = np.concatenate([[0], xs[:-1]])[k]
        x1 = xs[k]
        du = np.minimum(uu[mask] - x0, x1 - uu[mask])
        dv = np.minimum(v[mask] - lows[r], cuts[r] - v[mask])
        edge[mask] = np.minimum(du, dv)
        ident[mask] = base + k
        local[mask] = (uu[mask] - x0) / (x1 - x0)
        base += per_row
    return edge, ident, local


def pack(value, height, rough, strength, tint=None):
    cav = height - blur(height, 7)
    fine = height - blur(height, 2)
    v = np.clip(value * (1 + np.clip(cav * 1.5, -0.22, 0.16) + np.clip(fine * 1.6, -0.12, 0.12)), 0, 1.25)
    col = np.repeat(v[..., None], 3, -1)
    if tint is not None:
        col = col * tint
    return {"color": np.clip(col, 0, 1), "normal": normal_map(height, strength), "rough": np.clip(rough, 0.05, 1)}


def warm(x, amount=0.06):
    """A hue shift that follows a 0..1 field: warm where high, cold where low."""
    t = (x - 0.5) * 1.1 * amount
    return np.stack([1 + t, np.ones_like(t), 1 - t], -1)


# ------------------------------------------------------------------ surfaces
def masonry(rng):
    courses = rng.uniform(0.75, 1.25, 8)
    edge, ident, _ = blocks(rng, 8, 5, 0, courses=courses, jitter=0.4)
    wob = fbm(rng, 1.7, 2, 90) - 0.5
    e = edge + wob * 0.010
    stone = smooth(0.004, 0.022, e)
    grain = fbm(rng, 1.1, 4, 300)
    chips = smooth(0.62, 0.9, fbm(rng, 1.5, 6, 90)) * (1 - smooth(0.02, 0.05, e))
    lift = pick(rng, ident, 0.75, 1.0)
    h = stone * lift * 0.34 + grain * 0.03 * stone - chips * 0.07 + (fbm(rng, 2, 1, 14) - 0.5) * 0.06
    shade = pick(rng, ident, 0.8, 1.08)
    stain = fbm(rng, 1.9, 1, 30, aniso=(1, 0.35))
    val = (0.6 + 0.36 * stone) * shade * (0.88 + grain * 0.18) * (0.9 + stain * 0.16) - chips * 0.08
    return pack(val, h, 0.82 + grain * 0.12, 1.0, warm(pick(rng, ident, 0, 1), 0.05))


def rubble(rng):
    e, ident, d1 = voronoi(rng, 70, 0.36, 1.25)
    e = e + (fbm(rng, 1.6, 3, 120) - 0.5) * 0.14
    stone = smooth(0.05, 0.22, e)
    grain = fbm(rng, 1.1, 5, 300)
    h = stone * 0.4 * pick(rng, ident, 0.75, 1) + grain * 0.03 - 0.10 * d1 * stone
    val = (0.56 + 0.38 * stone) * pick(rng, ident, 0.78, 1.1) * (0.88 + 0.2 * grain)
    return pack(val, h, 0.85 + grain * 0.1, 1.0, warm(pick(rng, ident, 0, 1), 0.06))


def cobble(rng):
    e, ident, d1 = voronoi(rng, 110, 0.3, 1.0)
    e = e + (fbm(rng, 1.7, 3, 90) - 0.5) * 0.1
    stone = smooth(0.06, 0.34, e)
    grain = fbm(rng, 1.0, 6, 300)
    h = stone * 0.6 - 0.15 * d1 * stone + grain * 0.04
    val = (0.55 + 0.4 * stone) * pick(rng, ident, 0.8, 1.1) * (0.9 + 0.15 * grain)
    return pack(val, h, 0.9 - 0.25 * stone, 1.1, warm(pick(rng, ident, 0, 1), 0.05))


def brick(rng):
    edge, ident, _ = blocks(rng, 14, 5, 0, jitter=0.03)
    b = smooth(0.003, 0.010, edge + (fbm(rng, 1.6, 4, 120) - 0.5) * 0.006)
    grain = fbm(rng, 1.0, 5, 300)
    val = (0.62 + 0.36 * b) * np.where(b > 0.5, pick(rng, ident, 0.76, 1.1), 1) * (0.9 + 0.15 * grain)
    return pack(val, b * 0.35 + grain * 0.07, 0.86 + grain * 0.1, 0.9, warm(pick(rng, ident, 0, 1), 0.07))


def plaster(rng):
    broad = fbm(rng, 2.1, 1, 20)
    trowel = fbm(rng, 1.7, 5, 120, aniso=(0.55, 1.2))
    grain = fbm(rng, 0.8, 30, 400)
    u, v = grid()
    crack_f = fbm(rng, 1.9, 2, 26)
    crack = np.exp(-((crack_f - 0.5) / 0.006) ** 2) * smooth(0.55, 0.8, fbm(rng, 2, 1, 8))
    streak = fbm(rng, 1.6, 2, 60, aniso=(1.0, 0.12))
    val = 0.86 + (broad - 0.5) * 0.08 + (trowel - 0.5) * 0.05 + (grain - 0.5) * 0.03 - crack * 0.22 - smooth(0.7, 1.05, streak) * 0.07
    return pack(val, trowel * 0.06 + grain * 0.015 - crack * 0.12, 0.9 + grain * 0.06, 0.8, warm(broad, 0.035))


def planks(rng, boards=6):
    """Boards running along V."""
    u, v = grid()
    w = rng.uniform(0.8, 1.2, boards)
    xs = np.cumsum(w / w.sum())
    k = np.searchsorted(xs, u).clip(0, boards - 1)
    x0 = np.concatenate([[0], xs[:-1]])[k]
    edge = np.minimum(u - x0, xs[k] - u)
    gap = smooth(0.002, 0.008, edge)
    shift = (rng.uniform(0, 1, boards)[k] * SIZE).astype(int)
    fine = fbm(rng, 0.9, 3, 400, aniso=(1.0, 14.0))
    ring = fbm(rng, 1.8, 1, 60, aniso=(1.0, 7.0))
    iy, ix = np.indices((SIZE, SIZE))
    fine, ring = fine[(iy + shift) % SIZE, ix], ring[(iy + shift) % SIZE, ix]
    grain = 0.5 + 0.5 * np.sin(ring * 34)
    knots = np.zeros((SIZE, SIZE))
    for _ in range(5):
        kx, ky, r = rng.uniform(0, 1), rng.uniform(0, 1), rng.uniform(0.012, 0.024)
        dx = np.minimum(np.abs(u - kx), 1 - np.abs(u - kx))
        dy = np.minimum(np.abs(v - ky), 1 - np.abs(v - ky)) * 0.55
        knots = np.maximum(knots, np.exp(-(np.hypot(dx, dy) / r) ** 2))
    val = (0.82 + (grain - 0.5) * 0.14 + (fine - 0.5) * 0.28) * rng.uniform(0.84, 1.08, boards)[k] * (0.45 + 0.55 * gap) - knots * 0.28
    h = gap * 0.35 + fine * 0.14 + grain * 0.05 - knots * 0.05
    return pack(val, h, 0.75 + fine * 0.18, 0.8, warm(rng.uniform(0, 1, boards)[k], 0.05))


def timber(rng):
    """A hewn beam: long grain, splits, adze marks, along V."""
    fine = fbm(rng, 0.9, 3, 400, aniso=(1.0, 16.0))
    broad = fbm(rng, 1.4, 3, 40, aniso=(1.0, 5.0))
    split_f = fbm(rng, 1.5, 2, 60, aniso=(1.0, 12.0))
    split = np.exp(-((split_f - 0.5) / 0.02) ** 2) * smooth(0.5, 0.8, fbm(rng, 2, 1, 10))
    adze = fbm(rng, 1.6, 6, 40, aniso=(1.4, 0.6))
    val = 0.8 + (fine - 0.5) * 0.3 + (broad - 0.5) * 0.16 - split * 0.35 + (adze - 0.5) * 0.08
    return pack(val, fine * 0.14 + adze * 0.12 - split * 0.25, 0.78 + fine * 0.15, 0.85, warm(broad, 0.05))


def bark(rng):
    """Deep vertical plates."""
    f = fbm(rng, 1.5, 3, 60, aniso=(1.0, 3.6))
    ridge = 1 - np.abs(f - 0.5) * 2
    plates = smooth(0.1, 0.75, np.abs(f - 0.5) * 2 + (fbm(rng, 1.4, 5, 120) - 0.5) * 0.3)
    cracks = smooth(0.6, 0.9, 1 - np.abs(fbm(rng, 1.4, 4, 60, aniso=(0.5, 1.0)) - 0.5) * 6)
    fine = fbm(rng, 0.9, 8, 400, aniso=(1.0, 3.0))
    val = 0.5 + 0.42 * plates + (fine - 0.5) * 0.18 - cracks * 0.14
    return pack(val, plates * 0.5 + fine * 0.1 - cracks * 0.1, 0.9 + fine * 0.08, 1.2, warm(fbm(rng, 1.8, 1, 20), 0.05))


def birch_bark(rng):
    u, v = grid()
    val = 0.93 + (fbm(rng, 1.6, 2, 60, aniso=(0.3, 1.0)) - 0.5) * 0.12
    h = np.zeros((SIZE, SIZE))
    for _ in range(46):
        cx, cy = rng.uniform(0, 1), rng.uniform(0, 1)
        w, t = rng.uniform(0.03, 0.16), rng.uniform(0.002, 0.009)
        dx = np.minimum(np.abs(u - cx), 1 - np.abs(u - cx)) / w
        dy = np.minimum(np.abs(v - cy), 1 - np.abs(v - cy)) / t
        mark = np.clip(1.2 - np.hypot(dx, dy), 0, 1) ** 0.5
        val -= mark * rng.uniform(0.45, 0.8)
        h -= mark * 0.2
    for _ in range(5):
        cx, cy, r = rng.uniform(0, 1), rng.uniform(0, 1), rng.uniform(0.04, 0.08)
        dx = np.minimum(np.abs(u - cx), 1 - np.abs(u - cx))
        dy = np.minimum(np.abs(v - cy), 1 - np.abs(v - cy))
        mark = np.clip(1.3 - np.hypot(dx / r, dy / (r * 0.45)), 0, 1)
        val -= smooth(0, 0.5, mark) * 0.7
    return pack(np.clip(val, 0.08, 1), h + fbm(rng, 1.2, 4, 200, aniso=(0.4, 1)) * 0.06, 0.7 + (1 - val) * 0.2, 0.7)


def rock(rng):
    strata = fbm(rng, 1.7, 1, 50, aniso=(0.35, 1.2))
    facets_f, ident, d1 = voronoi(rng, 26, 0.45, 0.8)
    facet = pick(rng, ident, 0, 1)
    crack = np.exp(-((facets_f + (fbm(rng, 1.6, 3, 100) - 0.5) * 0.3) / 0.045) ** 2) * smooth(0.3, 0.7, fbm(rng, 1.9, 1, 14))
    grain = fbm(rng, 1.1, 6, 380)
    pits = smooth(0.72, 0.95, fbm(rng, 1.0, 20, 160))
    val = 0.82 + (strata - 0.5) * 0.26 + (facet - 0.5) * 0.1 + (grain - 0.5) * 0.22 - crack * 0.3 - pits * 0.14
    h = strata * 0.3 + grain * 0.08 - crack * 0.26 - pits * 0.06 + facet * 0.05
    return pack(val, h, 0.82 + grain * 0.14, 1.1, warm(strata, 0.05))


def slate_roof(rng):
    """Split stone tiles in courses."""
    u, v = grid()
    rows, per = 10, 8
    edge, ident, local = blocks(rng, rows, per, 0, jitter=0.22)
    r = (v * rows) % 1
    cut = pick(rng, ident, -0.06, 0.06)
    lap = np.clip(1 - (r + cut), 0, 1)
    side = smooth(0.002, 0.006, edge + (fbm(rng, 1.5, 4, 80) - 0.5) * 0.002)
    grain = fbm(rng, 1.1, 5, 300)
    val = (0.55 + 0.45 * side) * pick(rng, ident, 0.74, 1.08) * (0.62 + 0.42 * smooth(0, 0.3, 1 - r)) * (0.9 + 0.16 * grain)
    return pack(val, (1 - r) * 0.5 * side + grain * 0.07, 0.7 + grain * 0.2, 1.0, warm(pick(rng, ident, 0, 1), 0.05))


def thatch(rng):
    fine = fbm(rng, 0.8, 4, 480, aniso=(1.0, 10.0))
    bunch = fbm(rng, 1.6, 4, 60, aniso=(1.0, 2.2))
    u, v = grid()
    rows = (v * 5 + (bunch - 0.5) * 0.35) % 1
    val = 0.72 + (fine - 0.5) * 0.5 + (bunch - 0.5) * 0.2 - smooth(0.8, 1.0, rows) * 0.3
    return pack(val, fine * 0.25 + bunch * 0.15 + (1 - rows) * 0.2, np.full_like(val, 0.95), 0.9, warm(bunch, 0.08))


def grass_ground(rng):
    blades = fbm(rng, 0.75, 8, 480, aniso=(1.0, 2.4))
    blades2 = fbm(rng, 0.75, 8, 480, aniso=(2.2, 1.0))
    clump = fbm(rng, 1.7, 3, 40)
    mixf = smooth(0.4, 0.6, fbm(rng, 1.6, 4, 40))
    b = blades * mixf + blades2 * (1 - mixf)
    val = 0.74 + (b - 0.5) * 0.46 + (clump - 0.5) * 0.18
    tint = np.stack([1 + (clump - 0.5) * 0.16, np.ones_like(b), 0.92 + (0.5 - clump) * 0.1], -1)
    return pack(val, b * 0.35 + clump * 0.2, np.full_like(b, 0.95), 0.8, tint)


def ground(rng):
    broad = fbm(rng, 1.8, 2, 30)
    grain = fbm(rng, 1.0, 8, 420)
    e, ident, d1 = voronoi(rng, 420, 0.48)
    peb = smooth(0.5, 0.2, d1) * (pick(rng, ident, 0, 1) > 0.72)
    rut = fbm(rng, 1.7, 2, 40, aniso=(1, 0.5))
    val = 0.76 + (broad - 0.5) * 0.2 + (grain - 0.5) * 0.28 + peb * 0.2
    return pack(val, grain * 0.16 + broad * 0.2 + peb * 0.25 + rut * 0.1, 0.92 + grain * 0.06, 0.9, warm(broad, 0.05))


def gravel(rng):
    e, ident, d1 = voronoi(rng, 360, 0.45)
    s = smooth(0.06, 0.34, e)
    grain = fbm(rng, 1.0, 10, 400)
    val = (0.42 + 0.52 * s) * pick(rng, ident, 0.7, 1.12) * (0.92 + 0.12 * grain)
    return pack(val, s * 0.5 - d1 * 0.15 + grain * 0.04, 0.85 + grain * 0.1, 1.0, warm(pick(rng, ident, 0, 1), 0.06))


def forest_floor(rng):
    """Needles, twigs and fallen leaves on dark soil."""
    val = 0.5 + fbm(rng, 1.0, 5, 400) * 0.16
    h = fbm(rng, 1.4, 4, 200) * 0.2
    u, v = grid()
    tint = np.ones((SIZE, SIZE, 3))
    for i in range(420):
        cx, cy, a = rng.uniform(0, 1), rng.uniform(0, 1), rng.uniform(0, math.pi)
        L, w = (rng.uniform(0.012, 0.03), rng.uniform(0.005, 0.011)) if i % 2 else (rng.uniform(0.03, 0.06), 0.0016)
        n = int((L + 0.01) * SIZE)
        ix = np.arange(int(cx * SIZE) - n, int(cx * SIZE) + n + 1)
        iy = np.arange(int(cy * SIZE) - n, int(cy * SIZE) + n + 1)
        gx, gy = np.meshgrid(ix / SIZE - cx, iy / SIZE - cy)
        x, y = gx * math.cos(a) + gy * math.sin(a), -gx * math.sin(a) + gy * math.cos(a)
        k = np.clip(1 - (x / L) ** 2 - (y / w) ** 2, 0, 1)
        mask = smooth(0, 0.3, k)
        sel = np.ix_(iy % SIZE, ix % SIZE)
        c = rng.uniform(0.6, 1.0)
        val[sel] = val[sel] * (1 - mask) + c * mask * (1 - 0.15 * (np.abs(y) < w * 0.12))
        h[sel] = np.maximum(h[sel], mask * 0.35)
        if i % 2:
            col = np.array([1.18, rng.uniform(0.85, 1.0), 0.7])
            tint[sel] = tint[sel] * (1 - mask[..., None]) + col * mask[..., None]
    return pack(val, h, np.full_like(val, 0.93), 0.9, tint)


def sand(rng):
    ripple = fbm(rng, 1.7, 3, 40, aniso=(0.35, 1.1))
    grain = fbm(rng, 0.6, 40, 500)
    val = 0.88 + (ripple - 0.5) * 0.1 + (grain - 0.5) * 0.1
    return pack(val, np.sin(ripple * 22) * 0.04 + grain * 0.05, np.full_like(val, 0.95), 0.8, warm(ripple, 0.03))


def snow(rng):
    soft = fbm(rng, 2.0, 1, 24)
    grain = fbm(rng, 0.5, 60, 500)
    return pack(0.95 + (soft - 0.5) * 0.06 + (grain - 0.5) * 0.03, soft * 0.2 + grain * 0.03, np.full_like(soft, 0.7), 0.6, warm(soft, -0.02))


def metal(rng):
    brush = fbm(rng, 1.2, 4, 400, aniso=(1, 6))
    dent = fbm(rng, 1.9, 3, 30)
    rust = smooth(0.66, 0.95, fbm(rng, 1.7, 2, 60))
    val = 0.86 + (brush - 0.5) * 0.14 + (dent - 0.5) * 0.1 - rust * 0.2
    tint = np.stack([1 + rust * 0.15, 1 - rust * 0.05, 1 - rust * 0.2], -1)
    return pack(val, dent * 0.15 + brush * 0.03 + rust * 0.06, 0.42 + rust * 0.45 + (brush - 0.5) * 0.1, 0.7, tint)


def fabric(rng):
    u, v = grid()
    weave = 0.5 + 0.25 * np.sin(u * math.tau * 96) * np.sign(np.sin(v * math.tau * 48)) + 0.25 * np.sin(v * math.tau * 96)
    fold = fbm(rng, 2.0, 1, 12, aniso=(1.6, 0.5))
    val = 0.82 + (weave - 0.5) * 0.12 + (fold - 0.5) * 0.14 + (fbm(rng, 1, 20, 300) - 0.5) * 0.06
    return pack(val, weave * 0.06 + fold * 0.2, np.full_like(val, 0.95), 0.6)


def concrete(rng):
    broad = fbm(rng, 1.9, 1, 20)
    grain = fbm(rng, 0.9, 20, 400)
    pits = smooth(0.8, 1.0, fbm(rng, 0.9, 24, 120))
    streak = smooth(0.65, 1.0, fbm(rng, 1.5, 2, 60, aniso=(1.0, 0.1)))
    val = 0.85 + (broad - 0.5) * 0.14 + (grain - 0.5) * 0.08 - pits * 0.15 - streak * 0.08
    return pack(val, grain * 0.05 - pits * 0.12 + broad * 0.05, 0.85 + grain * 0.1, 0.7)


def asphalt(rng):
    grain = fbm(rng, 0.5, 40, 480)
    patch = fbm(rng, 1.9, 1, 12)
    crack = np.exp(-((fbm(rng, 1.9, 2, 30) - 0.5) / 0.005) ** 2) * smooth(0.55, 0.8, fbm(rng, 2, 1, 8))
    val = 0.8 + (grain - 0.5) * 0.3 + (patch - 0.5) * 0.14 - crack * 0.3
    return pack(val, grain * 0.14 - crack * 0.2, 0.85 + grain * 0.1, 0.8)


def panel(rng):
    """Manufactured plating: seams, rivets, worn edges (science fiction, industry)."""
    edge, ident, _ = blocks(rng, 4, 3, 0, jitter=0.35)
    seam = smooth(0.003, 0.008, edge)
    bevel = smooth(0.008, 0.02, edge)
    wear = fbm(rng, 1.5, 4, 120)
    scratch = smooth(0.8, 1.0, fbm(rng, 1.1, 10, 400, aniso=(1, 5)))
    val = (0.5 + 0.4 * seam) * pick(rng, ident, 0.88, 1.05) + (1 - bevel) * seam * 0.12 * wear + scratch * 0.06
    return pack(val, seam * 0.3 + bevel * 0.1, 0.45 + wear * 0.2, 0.9)


def smooth_paint(rng):
    soft = fbm(rng, 1.9, 1, 20)
    return pack(0.93 + (soft - 0.5) * 0.07, soft * 0.05, 0.55 + soft * 0.1, 0.4)


SETS = {
    "Slate": masonry, "Rubble": rubble, "Cobblestone": cobble, "Brick": brick, "Concrete": plaster, "WoodPlanks": planks, "Wood": timber, "Bark": bark, "BirchBark": birch_bark,
    "Rock": rock, "Roof": slate_roof, "Thatch": thatch, "Grass": grass_ground, "Ground": ground, "Gravel": gravel, "ForestFloor": forest_floor, "Sand": sand, "Snow": snow,
    "Metal": metal, "Fabric": fabric, "RealConcrete": concrete, "Asphalt": asphalt, "Panel": panel, "SmoothPlastic": smooth_paint,
}
# materials of the pipeline that share a set
ALIAS = {"LeafyGrass": "ForestFloor", "Mud": "Ground", "Basalt": "Rock", "Limestone": "Rock", "Sandstone": "Rock", "Pavement": "RealConcrete", "Ice": "Snow", "CrackedLava": "Rock", "DiamondPlate": "Panel", "CorrodedMetal": "Metal", "Pebble": "Gravel", "Marble": "SmoothPlastic", "Granite": "Rock"}
# studs covered by one tile
TILE = {"Slate": 12, "Rubble": 10, "Cobblestone": 10, "Brick": 8, "Concrete": 12, "WoodPlanks": 6, "Wood": 5, "Bark": 5, "BirchBark": 6, "Rock": 12, "Roof": 10, "Thatch": 8, "Grass": 10, "Ground": 12, "Gravel": 9, "ForestFloor": 11,
        "Sand": 14, "Snow": 16, "Metal": 8, "Fabric": 4, "RealConcrete": 14, "Asphalt": 12, "Panel": 12, "SmoothPlastic": 10}
# light wood and dark stone read as much by their roughness as by their colour; the mean of the neutral map is divided out
NEUTRAL = 0.78


# ------------------------------------------------------------------ foliage atlas
CELLS = ["oak", "beech", "birch", "willow", "spruce", "pine", "bush", "ivy", "fern", "grass", "tallgrass", "daisy", "blossom", "twig", "palm", "clover"]
ATLAS = 4


def leaf_shape(kind, x, y):
    """Signed coverage of one leaf: x along the leaf 0..1, y across (-1..1 of the half length)."""
    t = np.clip(x, 0, 1)
    if kind == "oak":
        w = 0.34 * np.sin(math.pi * t ** 0.8) ** 0.8 * (1 + 0.28 * np.sin(t * 22)) + 0.015
    elif kind == "beech":
        w = 0.30 * np.sin(math.pi * t ** 0.85) ** 0.85
    elif kind == "birch":
        w = 0.36 * (np.sin(math.pi * np.clip(t, 0, 1) ** 0.55)) ** 1.1 * (1 + 0.06 * np.sin(t * 50))
    elif kind == "willow":
        w = 0.09 * np.sin(math.pi * t ** 0.8) ** 0.8
    elif kind == "ivy":
        w = 0.42 * np.abs(np.sin(math.pi * t ** 0.6)) ** 0.7 * (0.75 + 0.35 * np.abs(np.sin(t * 7.5)))
    elif kind == "petal":
        w = 0.26 * np.sin(math.pi * t ** 1.5) ** 0.7
    else:
        w = 0.27 * np.sin(math.pi * t ** 0.8) ** 0.8
    inside = (x > 0) & (x < 1)
    return np.where(inside, w - np.abs(y), -1)


class Cell:
    def __init__(self, n):
        self.n = n
        a = (np.arange(n) + 0.5) / n
        self.u, self.v = np.meshgrid(a, a)  # v up
        self.a = np.zeros((n, n))
        self.c = np.zeros((n, n, 3))
        self.h = np.zeros((n, n))

    def put(self, cov, col, h=0.5):
        m = np.clip(cov, 0, 1)[..., None]
        self.c = self.c * (1 - m) + col * m
        self.h = self.h * (1 - m[..., 0]) + h * m[..., 0]
        self.a = np.maximum(self.a, m[..., 0])

    def leaf(self, kind, p, ang, L, val, rng, tint=(1, 1, 1), fold=0.12):
        dx, dy = self.u - p[0], self.v - p[1]
        c, s = math.cos(ang), math.sin(ang)
        x, y = (dx * c + dy * s) / L, (-dx * s + dy * c) / L
        d = leaf_shape(kind, x, y)
        px = 1.0 / self.n / L
        cov = np.clip(d / px * 0.8 + 0.5, 0, 1)
        if cov.max() <= 0:
            return
        rib = np.exp(-(y / 0.018) ** 2) * (x > 0) * 0.2
        veins = np.exp(-((((x * 7 - np.abs(y) * 5) % 1) - 0.5) / 0.1) ** 2) * 0.06
        side = np.where(y > 0, 1.0, 1.0 - fold)
        shade = val * side * (0.78 + 0.32 * np.clip(x, 0, 1)) + rib * 0.5 - veins
        rim = np.clip(1 - d / 0.05, 0, 1) * 0.08
        col = np.stack([shade * tint[0] + rim, shade * tint[1] + rim * 0.8, shade * tint[2]], -1)
        # a soft contact shadow under the leaf on what is already there
        self.c *= (1 - 0.35 * np.clip(d / px * 0.2 + 1.2, 0, 1) * self.a)[..., None]
        self.put(cov, col, 0.5 + 0.3 * np.clip(x, 0, 1))

    def stroke(self, p, q, w0, w1, col):
        p, q = np.array(p), np.array(q)
        d = q - p
        L2 = (d ** 2).sum() + 1e-9
        t = np.clip(((self.u - p[0]) * d[0] + (self.v - p[1]) * d[1]) / L2, 0, 1)
        dist = np.hypot(self.u - p[0] - t * d[0], self.v - p[1] - t * d[1])
        w = w0 + (w1 - w0) * t
        self.put(np.clip((w - dist) * self.n * 0.8 + 0.5, 0, 1), np.array(col) * (0.85 + 0.3 * t[..., None]), 0.3)


WOODY = (0.42, 0.32, 0.24)


def sprig(cell, rng, kind, count, size, spread=0.42, base=(0.5, 0.04), twig=True):
    """Leaves in layers around a forked twig: the dark ones at the back first."""
    if twig:
        for k in range(5):
            a = math.pi / 2 + rng.uniform(-1.2, 1.2)
            cell.stroke(base, (base[0] + math.cos(a) * 0.4, base[1] + 0.2 + math.sin(a) * 0.45), 0.012, 0.004, WOODY)
    items = []
    for k in range(count):
        r = spread * math.sqrt((k + 0.5) / count)
        a = k * 2.399 + rng.uniform(-0.3, 0.3)
        items.append((0.5 + math.cos(a) * r, 0.5 + math.sin(a) * r, a, r))
    items = [items[i] for i in rng.permutation(count)]
    for j, (x, y, a, r) in enumerate(items):
        t = j / max(1, count - 1)
        ang = a + rng.uniform(-0.7, 0.7)
        L = size * rng.uniform(0.8, 1.2)
        ox, oy = x - math.cos(ang) * L * 0.5, y - math.sin(ang) * L * 0.5
        val = 0.52 + 0.4 * t + rng.uniform(-0.06, 0.06)
        w = rng.uniform(-0.06, 0.1)
        cell.leaf(kind, (ox, oy), ang, L, val, rng, (1 + w, 1, 0.86 - w))


def draw_cell(name, n=512):
    rng = rng_of("leaf" + name)
    c = Cell(n)
    if name == "oak":
        sprig(c, rng, "oak", 120, 0.13, 0.43)
    elif name == "beech":
        sprig(c, rng, "beech", 130, 0.11, 0.43)
    elif name == "birch":
        sprig(c, rng, "birch", 96, 0.105, 0.42)
    elif name == "bush":
        sprig(c, rng, "leaf", 110, 0.115, 0.42, twig=False)
    elif name == "ivy":
        sprig(c, rng, "ivy", 44, 0.17, 0.4, twig=False)
    elif name == "clover":
        sprig(c, rng, "birch", 60, 0.12, 0.42, twig=False)
    elif name == "willow":
        for k in range(5):
            x = 0.12 + k * 0.19 + rng.uniform(-0.03, 0.03)
            pts = [(x + math.sin(t * 3 + k) * 0.025, 0.98 - t * 0.94) for t in np.linspace(0, 1, 12)]
            for p, q in zip(pts, pts[1:]):
                c.stroke(p, q, 0.005, 0.004, WOODY)
            for i, p in enumerate(pts):
                for s in (-1, 1):
                    c.leaf("willow", p, -math.pi / 2 + s * rng.uniform(0.25, 0.7), rng.uniform(0.15, 0.22), 0.62 + 0.35 * rng.random(), rng, (1.04, 1, 0.8))
    elif name in ("spruce", "pine"):
        if name == "spruce":
            c.stroke((0.5, 0.0), (0.5, 0.96), 0.014, 0.004, WOODY)
            subs = []
            for k in range(13):
                y = 0.05 + k * 0.066
                for s in (-1, 1):
                    L = (0.42 * (1 - (k / 13) ** 1.3) + 0.06) * rng.uniform(0.75, 1.1)
                    yy = y + rng.uniform(-0.02, 0.02)
                    subs.append(((0.5, yy), (0.5 + s * L, min(0.97, yy + L * rng.uniform(0.35, 0.62)))))
            subs.append(((0.5, 0.8), (0.5, 0.99)))
        else:
            c.stroke((0.5, 0.0), (0.5, 0.5), 0.016, 0.01, WOODY)
            subs = [((0.5, 0.46), (0.5 + math.cos(a) * 0.2, 0.46 + math.sin(a) * 0.2)) for a in np.linspace(-0.4, math.pi + 0.4, 7)]
        for p, q in subs:
            c.stroke(p, q, 0.006, 0.003, WOODY)
        passes = 3
        for ps in range(passes):
            for p, q in subs:
                p, q = np.array(p), np.array(q)
                L = np.hypot(*(q - p))
                a0 = math.atan2(q[1] - p[1], q[0] - p[0])
                m = max(4, int(L * (34 if name == "spruce" else 60)))
                for k in range(m):
                    t = (k + rng.random()) / m
                    o = p + (q - p) * t
                    for s in (-1, 1):
                        if name == "spruce" and rng.random() < 0.3:
                            continue
                        a = a0 + s * rng.uniform(0.25, 1.15 if name == "spruce" else 1.5)
                        ln = (0.05 if name == "spruce" else 0.2) * rng.uniform(0.5, 1.35)
                        e = o + np.array([math.cos(a), math.sin(a)]) * ln
                        v = 0.4 + 0.2 * ps + rng.uniform(0, 0.16)
                        c.stroke(o, e, 0.0052, 0.002, (v, v * 1.03, v * 0.86))
    elif name == "fern":
        c.stroke((0.5, 0.0), (0.5, 0.97), 0.012, 0.004, (0.5, 0.5, 0.3))
        for k in range(22):
            t = k / 22
            y = 0.05 + t * 0.9
            L = 0.46 * math.sin(math.pi * (0.22 + 0.78 * (1 - t))) ** 0.9 + 0.02
            for s in (-1, 1):
                a = math.pi / 2 - s * 1.12
                steps = max(3, int(L * 26))
                for i in range(steps):
                    f = i / steps
                    p = (0.5 + math.cos(a) * L * f, y + math.sin(a) * L * f)
                    for q in (-1, 1):
                        c.leaf("leaf", p, a + q * 0.95, 0.07 * (1 - f * 0.75), 0.62 + 0.3 * f + 0.08 * rng.random(), rng, (1.02, 1, 0.8))
    elif name in ("grass", "tallgrass"):
        count = 46 if name == "grass" else 26
        for k in range(count):
            x0 = rng.uniform(0.08, 0.92)
            bend = rng.uniform(-0.28, 0.28)
            H = rng.uniform(0.45, 0.95)
            pts = [(x0 + bend * t * t, t * H) for t in np.linspace(0, 1, 8)]
            val = 0.5 + 0.42 * (k / count) + rng.uniform(-0.05, 0.05)
            for i, (p, q) in enumerate(zip(pts, pts[1:])):
                w0, w1 = 0.016 * (1 - i / 8) + 0.002, 0.016 * (1 - (i + 1) / 8) + 0.0015
                g = 0.62 + 0.4 * i / 7
                c.stroke(p, q, w0, w1, (val * g * 1.02, val * g, val * g * 0.72))
            if name == "tallgrass" and k % 2 == 0:
                tip = pts[-1]
                for j in range(9):
                    a = math.pi / 2 + rng.uniform(-0.7, 0.7)
                    o = (tip[0] + rng.uniform(-0.01, 0.01), tip[1] - j * 0.016)
                    c.stroke(o, (o[0] + math.cos(a) * 0.035, o[1] + math.sin(a) * 0.035), 0.005, 0.003, (1.0, 0.9, 0.62))
    elif name == "daisy":
        for k in range(26):
            x0 = rng.uniform(0.1, 0.9)
            c.stroke((x0, 0), (x0 + rng.uniform(-0.1, 0.1), rng.uniform(0.25, 0.6)), 0.006, 0.003, (0.36, 0.5, 0.22))
        for k in range(8):
            p = (0.12 + 0.76 * ((k * 0.618) % 1), rng.uniform(0.38, 0.84))
            c.stroke((p[0] + rng.uniform(-0.06, 0.06), 0), p, 0.007, 0.005, (0.36, 0.5, 0.22))
            petals = int(rng.integers(8, 12))
            for i in range(petals):
                c.leaf("petal", p, i / petals * math.tau + k, 0.11, 0.98, rng, (1, 1, 1), fold=0.06)
            d = np.hypot(c.u - p[0], c.v - p[1])
            c.put(np.clip((0.028 - d) * n * 0.8 + 0.5, 0, 1), np.array([0.95, 0.72, 0.18]))
    elif name == "blossom":
        sprig(c, rng, "leaf", 14, 0.15, 0.36)
        for k in range(34):
            r, a = 0.4 * math.sqrt((k + 0.5) / 34), k * 2.399
            p = (0.5 + math.cos(a) * r, 0.5 + math.sin(a) * r)
            for i in range(5):
                c.leaf("petal", p, i / 5 * math.tau + k, 0.075, 0.82 + 0.18 * rng.random(), rng, (1.02, 0.96, 0.98), fold=0.08)
            d = np.hypot(c.u - p[0], c.v - p[1])
            c.put(np.clip((0.012 - d) * n * 0.8 + 0.5, 0, 1), np.array([0.95, 0.8, 0.4]))
    elif name == "twig":
        def grow(p, a, L, w, depth):
            q = (p[0] + math.cos(a) * L, p[1] + math.sin(a) * L)
            c.stroke(p, q, w, w * 0.6, (0.8, 0.8, 0.78))
            if depth:
                for s in (-1, 1):
                    grow(q, a + s * rng.uniform(0.25, 0.65), L * rng.uniform(0.6, 0.8), w * 0.6, depth - 1)
                grow((p[0] + (q[0] - p[0]) * 0.55, p[1] + (q[1] - p[1]) * 0.55), a + rng.choice([-1, 1]) * rng.uniform(0.5, 0.9), L * 0.55, w * 0.5, depth - 1)
        grow((0.5, 0.0), math.pi / 2, 0.28, 0.016, 4)
    elif name == "palm":
        c.stroke((0.5, 0.0), (0.5, 0.98), 0.014, 0.004, (0.62, 0.6, 0.34))
        for k in range(24):
            t = k / 24
            y = 0.05 + t * 0.86
            L = 0.46 * math.sin(math.pi * (0.14 + 0.8 * (1 - t) ** 0.8)) + 0.03
            for s in (-1, 1):
                a = math.pi / 2 - s * (0.95 - 0.55 * t) + rng.uniform(-0.05, 0.05)
                if y + math.sin(a) * L < 0.98:
                    c.leaf("willow", (0.5, y), a, L * rng.uniform(0.9, 1.02), 0.62 + 0.3 * rng.random(), rng, (1.04, 1, 0.78))
    return c


def atlas(size=2048):
    cell = size // ATLAS
    col = np.zeros((size, size, 3))
    alpha = np.zeros((size, size))
    h = np.zeros((size, size))
    for i, name in enumerate(CELLS):
        c = draw_cell(name, cell)
        gx, gy = i % ATLAS, i // ATLAS
        y0, x0 = gy * cell, gx * cell
        a = c.a.copy()
        # bleed the colour past the edge so mip levels never pull in black
        filled, mask = c.c.copy(), (a > 0.5).astype(float)
        for r in (2, 4, 8, 16, 32):
            w = np.maximum(blur(mask, r), 1e-5)
            soft = np.stack([blur(filled[..., k] * mask, r) / w for k in range(3)], -1)
            filled = np.where((mask > 0.5)[..., None], filled, soft)
            mask = np.maximum(mask, (w > 0.02).astype(float))
        col[y0:y0 + cell, x0:x0 + cell] = np.clip(filled, 0, 1)
        alpha[y0:y0 + cell, x0:x0 + cell] = a
        h[y0:y0 + cell, x0:x0 + cell] = c.h * a
    return {"color": col, "alpha": alpha, "normal": normal_map(h, 0.25), "rough": np.full((size, size), 0.72)}


def cell_uv(name):
    i = CELLS.index(name)
    s = 1 / ATLAS
    return (i % ATLAS) * s, (i // ATLAS) * s, s


# ------------------------------------------------------------------ files
def save(path, arr, alpha=None, data=False):
    import bpy
    n = arr.shape[0]
    img = bpy.data.images.new(os.path.basename(path), n, arr.shape[1], alpha=alpha is not None)
    img.colorspace_settings.name = "Non-Color" if data else "sRGB"
    px = np.ones((n, arr.shape[1], 4), np.float32)
    px[..., :3] = arr if arr.ndim == 3 else arr[..., None]
    if alpha is not None:
        px[..., 3] = alpha
        img.alpha_mode = "CHANNEL_PACKED"
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def build(out, names=None):
    """Writes the sets that are missing; returns {name: {color, normal, rough}} file paths."""
    out = os.path.abspath(out)
    os.makedirs(out, exist_ok=True)
    files = {}
    for name, fn in SETS.items():
        if names is not None and name not in names:
            continue
        paths = {k: os.path.join(out, "%s_%s_v%d.png" % (name.lower(), k, VERSION)) for k in ("color", "normal", "rough")}
        if not all(os.path.exists(p) for p in paths.values()):
            maps = fn(rng_of(name))
            # the mean is set to the neutral level so a vertex colour keeps its brightness
            # and the contrast is squeezed so the brightest stones never clip to white
            lum = maps["color"].mean()
            rel = maps["color"] / lum - 1
            k = min(1.0, (0.99 / NEUTRAL - 1) / max(0.01, np.percentile(rel, 99.3)))
            maps["color"] = np.clip(NEUTRAL * (1 + rel * k), 0.02, 1)
            save(paths["color"], maps["color"], data=False)
            save(paths["normal"], maps["normal"], data=True)
            save(paths["rough"], maps["rough"], data=True)
        files[name] = paths
    leaf = {k: os.path.join(out, "leaf_%s_v%d.png" % (k, LEAF_VERSION)) for k in ("color", "normal", "rough")}
    if not all(os.path.exists(p) for p in leaf.values()):
        a = atlas()
        lum = (a["color"] * a["alpha"][..., None]).sum() / (a["alpha"].sum() * 3)
        save(leaf["color"], np.clip(a["color"] * (0.78 / lum), 0, 1), alpha=a["alpha"])
        save(leaf["normal"], a["normal"], data=True)
        save(leaf["rough"], a["rough"], data=True)
    files["Leaf"] = leaf
    return files


if __name__ == "__main__":
    import sys
    argv = sys.argv[sys.argv.index("--") + 1:]
    for k, v in build(argv[0]).items():
        print("TEX", k, v["color"])
