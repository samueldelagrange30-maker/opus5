"""Core helpers: resolution, timing, hashing/noise, palette quantisation,
camera maths, 3D line drawing, bloom and the pixel font."""
import os
import numpy as np
from scipy import ndimage

# ---------------------------------------------------------------- constants
W, H = 270, 480          # internal pixel-art resolution (9:16)
SCALE = 4                # 270x480 -> 1080x1920
FPS = 30
DURATION = 68.0
NFRAMES = int(round(DURATION * FPS))

BPM = 140.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
DROP = 34.0              # first bar of the 140 BPM section


def bar_t(n, beat=0.0):
    """Absolute time of bar n (+beat) of the 140 BPM grid anchored on DROP."""
    return DROP + n * BAR + beat * BEAT


# ---------------------------------------------------------------- utils
def clamp(x, a=0.0, b=1.0):
    return np.minimum(np.maximum(x, a), b)


def smoothstep(e0, e1, x):
    t = clamp((x - e0) / (e1 - e0 + 1e-9))
    return t * t * (3 - 2 * t)


def sstep(e0, e1, x):
    """Scalar smoothstep."""
    if e1 == e0:
        return 1.0 if x >= e1 else 0.0
    t = min(max((x - e0) / (e1 - e0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def ease_in(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * t


def ease_out(t):
    t = min(max(t, 0.0), 1.0)
    return 1 - (1 - t) ** 3


def ease_io(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255.0


# ---------------------------------------------------------------- hashing
_M = np.uint64(0xFFFFFFFF)


def hash2(ix, iz, seed=0):
    ix = np.asarray(ix).astype(np.int64).astype(np.uint64)
    iz = np.asarray(iz).astype(np.int64).astype(np.uint64)
    h = (ix * np.uint64(374761393) + iz * np.uint64(668265263)
         + np.uint64((seed * 2654435761) & 0xFFFFFFFF)) & _M
    h = ((h ^ (h >> np.uint64(13))) * np.uint64(1274126177)) & _M
    h = h ^ (h >> np.uint64(16))
    return (h & _M).astype(np.float64) / 4294967296.0


def hash1(i, seed=0):
    return hash2(i, 0, seed)


def vnoise(x, z, seed=0):
    ix = np.floor(x)
    iz = np.floor(z)
    fx = x - ix
    fz = z - iz
    a = hash2(ix, iz, seed)
    b = hash2(ix + 1, iz, seed)
    c = hash2(ix, iz + 1, seed)
    d = hash2(ix + 1, iz + 1, seed)
    ux = fx * fx * (3 - 2 * fx)
    uz = fz * fz * (3 - 2 * fz)
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz


def fbm(x, z, seed=0, octaves=3):
    s = 0.0
    amp = 0.5
    for o in range(octaves):
        s = s + amp * vnoise(x, z, seed + o * 17)
        x = x * 2.03
        z = z * 2.03
        amp *= 0.5
    return s / (1 - 0.5 ** octaves)


# ---------------------------------------------------------------- palette
PALETTE_HEX = [
    # deep purple / ink ramp
    '05030a', '0b0716', '130d24', '1c1433', '261b44', '322457', '3f2f6b', '4f3f80',
    # blue-grey ramp
    '1a2236', '253250', '33456b', '4a5f8a', '6b80a8', '95a8c8', 'c3d0e6', 'eef3ff', 'ffffff',
    # magenta / pink
    '3a0c3a', '5e1257', '8a1a78', 'b8229a', 'e33cba', 'ff6fd6', 'ffb0ec',
    # violet
    '2a0f5c', '42178a', '6025c0', '8a4cf0', 'b48cff',
    # blue
    '0d1f5c', '15308f', '2050d0', '3d82ff', '82b8ff',
    # cyan / teal
    '082f3a', '0c4c5a', '0f7380', '14a3a8', '22d3d0', '6ff5ee', 'c4fff8',
    # green
    '0b3a22', '14612f', '22943e', '45c95a', '9bff8a',
    # red
    '2e0610', '520a1a', '800f25', 'b81630', 'ee2440', 'ff6a6a', 'ffb3a8',
    # orange / amber
    '3d1605', '6b2808', 'a3420c', 'd96614', 'ff9524', 'ffc35a',
    # yellow
    '6b5a10', 'b8a020', 'ffe45c', 'fff6b0',
    # skin / warm browns
    '2a1410', '4a2418', '7a4028', 'b06a44', 'e09a6a', 'f6c79a',
    # cold desaturated (abandoned city)
    '2c3a40', '3e5258', '5a7378', '86a0a0', 'b4c8c4',
]
PALETTE = np.array([hexc(h) for h in PALETTE_HEX], dtype=np.float32)

_LUT_BITS = 6
_LUT_N = 1 << _LUT_BITS
_LUT_PATH = os.path.join(os.path.dirname(__file__), '.cache_lut.npy')


def _build_lut():
    g = (np.arange(_LUT_N, dtype=np.float32) + 0.5) / _LUT_N
    r, gg, b = np.meshgrid(g, g, g, indexing='ij')
    cols = np.stack([r, gg, b], -1).reshape(-1, 3)
    best = np.zeros(len(cols), dtype=np.int32)
    bestd = np.full(len(cols), 1e9, dtype=np.float32)
    for k, p in enumerate(PALETTE):
        rm = (cols[:, 0] + p[0]) * 0.5
        dr = cols[:, 0] - p[0]
        dg = cols[:, 1] - p[1]
        db = cols[:, 2] - p[2]
        d = (2 + rm) * dr * dr + 4 * dg * dg + (3 - rm) * db * db
        m = d < bestd
        bestd[m] = d[m]
        best[m] = k
    return best.astype(np.uint8)


def get_lut():
    key = len(PALETTE_HEX) * 1000 + int(PALETTE.sum() * 1000)
    if os.path.exists(_LUT_PATH):
        d = np.load(_LUT_PATH, allow_pickle=True).item()
        if d.get('key') == key:
            return d['lut']
    lut = _build_lut()
    np.save(_LUT_PATH, {'key': key, 'lut': lut}, allow_pickle=True)
    return lut


_LUT = None
_BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]],
                   dtype=np.float32) / 16.0 - 0.5 + 1 / 32
BAYER = np.tile(_BAYER4, (H // 4 + 1, W // 4 + 1))[:H, :W]


def quantize(img, dither=None, amount=0.075):
    """Map a float RGB image onto the fixed palette with ordered dithering."""
    global _LUT
    if _LUT is None:
        _LUT = get_lut()
    h, w = img.shape[:2]
    bay = BAYER[:h, :w] if (h <= H and w <= W) else np.tile(_BAYER4, (h // 4 + 1, w // 4 + 1))[:h, :w]
    d = bay * amount
    if dither is not None:
        d = d * dither
    x = clamp(img + d[..., None], 0.0, 0.99999)
    q = (x * _LUT_N).astype(np.int32)
    idx = _LUT[(q[..., 0] << (2 * _LUT_BITS)) | (q[..., 1] << _LUT_BITS) | q[..., 2]]
    return PALETTE[idx]


# ---------------------------------------------------------------- camera
class Camera:
    def __init__(self, pos, yaw=0.0, pitch=0.0, roll=0.0, f=230.0, shift=(0.0, 0.0)):
        self.pos = np.array(pos, dtype=np.float64)
        self.yaw, self.pitch, self.roll, self.f = yaw, pitch, roll, f
        self.shift = shift
        cy, sy = np.cos(yaw), np.sin(yaw)
        cp, sp = np.cos(pitch), np.sin(pitch)
        cr, sr = np.cos(roll), np.sin(roll)
        Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
        Rx = np.array([[1, 0, 0], [0, cp, sp], [0, -sp, cp]])
        Rz = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
        self.M = Ry @ Rx @ Rz
        self.right = self.M[:, 0]
        self.up = self.M[:, 1]
        self.fwd = self.M[:, 2]

    def rays(self, w=W, h=H):
        j = np.arange(w) + 0.5 - w / 2 - self.shift[0]
        i = np.arange(h) + 0.5 - h / 2 - self.shift[1]
        xc = np.broadcast_to(j[None, :] / self.f, (h, w))
        yc = np.broadcast_to(-i[:, None] / self.f, (h, w))
        d = (xc[..., None] * self.right + yc[..., None] * self.up + self.fwd)
        d = d / np.linalg.norm(d, axis=-1, keepdims=True)
        return d

    def to_cam(self, P):
        P = np.asarray(P, dtype=np.float64)
        return (P - self.pos) @ self.M   # columns: right, up, fwd components

    def project(self, P, w=W, h=H):
        c = self.to_cam(P)
        z = c[..., 2]
        zs = np.where(np.abs(z) < 1e-6, 1e-6, z)
        x = w / 2 + self.shift[0] + self.f * c[..., 0] / zs
        y = h / 2 + self.shift[1] - self.f * c[..., 1] / zs
        return x, y, z


# ---------------------------------------------------------------- drawing
def draw_seg3d(col, zbuf, cam, P0, P1, r_world, color, alpha=1.0, emis=None, emisbuf=None,
               min_px=0.6, maxlen_px=4000):
    """Draw a 3D capsule segment with depth test into col/zbuf (in place)."""
    P0 = np.asarray(P0, float)
    P1 = np.asarray(P1, float)
    c0 = cam.to_cam(P0)
    c1 = cam.to_cam(P1)
    near = 0.15
    if c0[2] < near and c1[2] < near:
        return
    if c0[2] < near:
        k = (near - c0[2]) / (c1[2] - c0[2])
        c0 = c0 + (c1 - c0) * k
    elif c1[2] < near:
        k = (near - c1[2]) / (c0[2] - c1[2])
        c1 = c1 + (c0 - c1) * k

    def proj(c):
        return (W / 2 + cam.shift[0] + cam.f * c[0] / c[2] - 0.5,
                H / 2 + cam.shift[1] - cam.f * c[1] / c[2] - 0.5)
    x0, y0 = proj(c0)
    x1, y1 = proj(c1)
    r0 = max(min_px, r_world * cam.f / c0[2])
    r1 = max(min_px, r_world * cam.f / c1[2])
    rr = max(r0, r1)
    xa, xb = int(np.floor(min(x0, x1) - rr - 1)), int(np.ceil(max(x0, x1) + rr + 1))
    ya, yb = int(np.floor(min(y0, y1) - rr - 1)), int(np.ceil(max(y0, y1) + rr + 1))
    xa, ya = max(xa, 0), max(ya, 0)
    xb, yb = min(xb, W - 1), min(yb, H - 1)
    if xa > xb or ya > yb:
        return
    if (xb - xa) * (yb - ya) > maxlen_px * 60:
        pass
    jj, ii = np.meshgrid(np.arange(xa, xb + 1), np.arange(ya, yb + 1))
    dx, dy = x1 - x0, y1 - y0
    L2 = dx * dx + dy * dy + 1e-9
    s = clamp(((jj - x0) * dx + (ii - y0) * dy) / L2)
    px = x0 + s * dx
    py = y0 + s * dy
    dist = np.sqrt((jj - px) ** 2 + (ii - py) ** 2)
    rad = r0 + (r1 - r0) * s
    zz = c0[2] + (c1[2] - c0[2]) * s
    m = (dist <= rad) & (zz < zbuf[ya:yb + 1, xa:xb + 1])
    if not m.any():
        return
    sub = col[ya:yb + 1, xa:xb + 1]
    color = np.asarray(color, float)
    if alpha >= 1.0:
        sub[m] = color
    else:
        sub[m] = sub[m] * (1 - alpha) + color * alpha
    zsub = zbuf[ya:yb + 1, xa:xb + 1]
    if alpha >= 0.99:
        zsub[m] = zz[m]
    if emis is not None and emisbuf is not None:
        emisbuf[ya:yb + 1, xa:xb + 1][m] = emis


def glow(img, x, y, radius, color, strength=1.0, stretch=1.0, mask=None):
    """Additive soft glow centred at (x, y) pixel coordinates."""
    if radius <= 0.3:
        return
    R = int(min(radius * 3.2 * max(stretch, 1.0), 400))
    xa, xb = int(x - R / max(stretch, 1.0)) - 1, int(x + R / max(stretch, 1.0)) + 2
    ya, yb = int(y - R) - 1, int(y + R) + 2
    xa, ya = max(xa, 0), max(ya, 0)
    xb, yb = min(xb, img.shape[1]), min(yb, img.shape[0])
    if xa >= xb or ya >= yb:
        return
    jj, ii = np.meshgrid(np.arange(xa, xb) + 0.5, np.arange(ya, yb) + 0.5)
    d2 = ((jj - x) ** 2 + ((ii - y) / stretch) ** 2) / (radius * radius)
    g = np.exp(-d2) * strength
    if mask is not None:
        g = g * mask[ya:yb, xa:xb]
    img[ya:yb, xa:xb] += g[..., None] * np.asarray(color, float)


def bloom(img, threshold=0.55, strength=0.9):
    b = np.maximum(img - threshold, 0.0)
    small = b.reshape(H // 2, 2, W // 2, 2, 3).mean(axis=(1, 3))
    g1 = ndimage.gaussian_filter(small, sigma=(2.0, 2.0, 0))
    g2 = ndimage.gaussian_filter(small, sigma=(7.0, 7.0, 0))
    g = g1 * 0.6 + g2 * 0.8
    up = np.repeat(np.repeat(g, 2, axis=0), 2, axis=1)
    return img + up * strength


# ---------------------------------------------------------------- pixel font
# 10 rows per glyph: rows 0-1 accents, caps rows 1-7, x-height rows 3-7,
# descenders rows 8-9.
_G = {}


def _glyph(ch, rows, top=0):
    w = max(len(r) for r in rows)
    g = np.zeros((10, w), dtype=bool)
    for k, r in enumerate(rows):
        for c, v in enumerate(r):
            if v == '#':
                g[top + k, c] = True
    _G[ch] = g


# lower-case (x-height rows 3..7)
_glyph('a', ['.##.', '...#', '.###', '#..#', '.###'], 3)
_glyph('b', ['#...', '#...', '###.', '#..#', '#..#', '#..#', '###.'], 1)
_glyph('c', ['.###', '#...', '#...', '#...', '.###'], 3)
_glyph('d', ['...#', '...#', '.###', '#..#', '#..#', '#..#', '.###'], 1)
_glyph('e', ['.##.', '#..#', '####', '#...', '.###'], 3)
_glyph('g', ['.###', '#..#', '#..#', '#..#', '.###', '...#', '###.'], 3)
_glyph('h', ['#...', '#...', '###.', '#..#', '#..#', '#..#', '#..#'], 1)
_glyph('i', ['#', '.', '#', '#', '#', '#', '#'], 1)
_glyph('j', ['.#', '..', '.#', '.#', '.#', '.#', '.#', '.#', '#.'], 1)
_glyph('l', ['#.', '#.', '#.', '#.', '#.', '#.', '.#'], 1)
_glyph('m', ['####.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'], 3)
_glyph('n', ['###.', '#..#', '#..#', '#..#', '#..#'], 3)
_glyph('o', ['.##.', '#..#', '#..#', '#..#', '.##.'], 3)
_glyph('p', ['###.', '#..#', '#..#', '#..#', '###.', '#...', '#...'], 3)
_glyph('q', ['.###', '#..#', '#..#', '#..#', '.###', '...#', '...#'], 3)
_glyph('r', ['#.##', '##..', '#...', '#...', '#...'], 3)
_glyph('s', ['.###', '#...', '.##.', '...#', '###.'], 3)
_glyph('t', ['.#.', '.#.', '###', '.#.', '.#.', '.#.', '..#'], 1)
_glyph('u', ['#..#', '#..#', '#..#', '#..#', '.###'], 3)
_glyph('v', ['#...#', '#...#', '.#.#.', '.#.#.', '..#..'], 3)
# accented
_glyph('é', ['..#.', '.#..', '....', '.##.', '#..#', '####', '#...', '.###'], 0)
_glyph('è', ['.#..', '..#.', '....', '.##.', '#..#', '####', '#...', '.###'], 0)
_glyph('ô', ['.##.', '#..#', '....', '.##.', '#..#', '#..#', '#..#', '.##.'], 0)
_glyph('û', ['.##.', '#..#', '....', '#..#', '#..#', '#..#', '#..#', '.###'], 0)
# capitals (rows 1..7)
_glyph('I', ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'], 1)
_glyph('P', ['###.', '#..#', '#..#', '###.', '#...', '#...', '#...'], 1)
_glyph('E', ['####', '#...', '#...', '###.', '#...', '#...', '####'], 1)
_glyph('M', ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'], 1)
_glyph('C', ['.###', '#...', '#...', '#...', '#...', '#...', '.###'], 1)
_glyph('f', ['.##', '#..', '###', '#..', '#..', '#..', '#..'], 1)
_glyph('à', ['.#..', '..#.', '....', '.##.', '...#', '.###', '#..#', '.###'], 0)
_glyph('ê', ['.##.', '#..#', '....', '.##.', '#..#', '####', '#...', '.###'], 0)
_glyph('-', ['###'], 5)
_glyph('D', ['###.', '#..#', '#..#', '#..#', '#..#', '#..#', '###.'], 1)
_glyph('A', ['.##.', '#..#', '#..#', '####', '#..#', '#..#', '#..#'], 1)
_glyph('y', ['#..#', '#..#', '#..#', '#..#', '.###', '...#', '###.'], 3)
# punctuation
_glyph("'", ['#', '#'], 1)
_glyph(',', ['.#', '.#', '#.'], 6)
_glyph('.', ['#'], 7)
_glyph('…', ['#.#.#'], 7)
_glyph('?', ['.##.', '#..#', '...#', '..#.', '..#.', '....', '..#.'], 1)
SPACE_W = 3
FONT_PX = 2              # one font pixel = 2 internal pixels (8 output pixels)


def text_width(line):
    w = 0
    for k, ch in enumerate(line):
        if ch == ' ':
            w += SPACE_W
        else:
            w += _G[ch].shape[1]
        if k < len(line) - 1:
            w += 1
    return w


def _line_mask(line):
    wd = text_width(line)
    m = np.zeros((10, wd), dtype=bool)
    x = 0
    for k, ch in enumerate(line):
        if ch == ' ':
            x += SPACE_W + 1
            continue
        g = _G[ch]
        m[:, x:x + g.shape[1]] |= g
        x += g.shape[1] + 1
    return m


def draw_subtitle(img, lines, nchars=None, center_y=360, jitter=0, alpha=1.0):
    """Draw centred white pixel text with black outline (font pixel = FONT_PX)."""
    if alpha <= 0:
        return
    line_h = 12
    total = len(lines) * line_h - 2
    top = center_y / FONT_PX - total / 2
    budget = nchars if nchars is not None else 10 ** 6
    fw, fh = W // FONT_PX, H // FONT_PX
    glyph = np.zeros((fh, fw), dtype=bool)
    for li, line in enumerate(lines):
        if budget <= 0:
            break
        shown = line[:max(0, budget)]
        budget -= len(line)
        if not shown.strip():
            continue
        m = _line_mask(shown)
        full_w = text_width(line)
        x0 = int(round(fw / 2 - full_w / 2))
        y0 = int(round(top + li * line_h))
        x1 = min(fw, x0 + m.shape[1])
        glyph[y0:y0 + 10, x0:x1] |= m[:, :x1 - x0]
    outline = ndimage.binary_dilation(glyph, structure=np.ones((3, 3), bool))
    shadow = np.zeros_like(outline)
    shadow[1:, 1:] = outline[:-1, :-1]
    big = lambda a: np.repeat(np.repeat(a, FONT_PX, 0), FONT_PX, 1)
    G, O, S = big(glyph), big(outline), big(shadow)
    if jitter:
        G = np.roll(G, jitter, axis=1)
        O = np.roll(O, jitter, axis=1)
        S = np.roll(S, jitter, axis=1)
    black = PALETTE[0]
    if alpha >= 1:
        img[S & ~O] = img[S & ~O] * 0.35
        img[O] = black
        img[G] = 1.0
    else:
        img[O] = img[O] * (1 - alpha) + black * alpha
        img[G] = img[G] * (1 - alpha) + alpha
