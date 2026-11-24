"""Noise of world coordinates, whole arrays at a time. The same point of the world gives the same value in whichever region
it is computed: that is what makes two regions meet."""
import numpy as np


def _hash(ix, iz, seed):
    # integer lattice hash (wraps on 32 bits)
    h = (ix.astype(np.int64) * 374761393 + iz.astype(np.int64) * 668265263 + int(seed) * 144665) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF).astype(np.float64) / 65535.0


def value(x, z, seed=0):
    """Smooth value noise, -1..1."""
    x, z = np.asarray(x, np.float64), np.asarray(z, np.float64)
    ix, iz = np.floor(x).astype(np.int64), np.floor(z).astype(np.int64)
    fx, fz = x - ix, z - iz
    u, v = fx * fx * fx * (fx * (fx * 6 - 15) + 10), fz * fz * fz * (fz * (fz * 6 - 15) + 10)
    a, b = _hash(ix, iz, seed), _hash(ix + 1, iz, seed)
    c, d = _hash(ix, iz + 1, seed), _hash(ix + 1, iz + 1, seed)
    return ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v) * 2 - 1


def fbm(x, z, octaves=4, seed=0, gain=0.5, lac=2.03):
    out, amp, tot = 0.0, 1.0, 0.0
    for k in range(octaves):
        out = out + value(x, z, seed + k * 17) * amp
        tot += amp
        amp *= gain
        x, z = np.asarray(x) * lac + 13.7, np.asarray(z) * lac - 7.3
    return out / tot


def ridged(x, z, octaves=4, seed=0, gain=0.5, lac=2.1):
    out, amp, tot, prev = 0.0, 1.0, 0.0, 1.0
    for k in range(octaves):
        n = 1 - np.abs(value(x, z, seed + k * 31))
        n = n * n
        out = out + n * amp * prev
        prev = n
        tot += amp
        amp *= gain
        x, z = np.asarray(x) * lac + 5.1, np.asarray(z) * lac + 9.7
    return out / tot


def warped(x, z, amount, octaves=4, seed=0):
    """Domain warping: the noise is read where another noise says."""
    return fbm(x + fbm(x, z, 3, seed + 101) * amount, z + fbm(x, z, 3, seed + 211) * amount, octaves, seed)


def smooth(a, b, x):
    t = np.clip((np.asarray(x) - a) / (b - a + 1e-12), 0, 1)
    return t * t * (3 - 2 * t)
