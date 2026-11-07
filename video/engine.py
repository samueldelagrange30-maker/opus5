"""Frame composer: world render (with mirror trick for the abandoned city),
props, characters, volumetric light beams, fog, rain, bloom, grading and
palette quantisation."""
import numpy as np
from scipy import ndimage
from core import (W, H, Camera, quantize, bloom, glow, draw_seg3d, clamp, smoothstep,
                  hexc, hash1, hash2, BAYER)
from world import World, Lights, FLOOR, SKY, PORTAL, WALL_L, WALL_R
import puppet

INK = hexc('0b0716')


def mirror_cam(cam):
    return Camera(cam.pos * np.array([-1, 1, 1.0]), yaw=-cam.yaw, pitch=cam.pitch, roll=-cam.roll,
                  f=cam.f, shift=(-cam.shift[0], cam.shift[1]))


class Ctx:
    pass


# ------------------------------------------------------------------ lights
def make_lights(world, st):
    """Scene lights in the A-frame."""
    L = Lights()
    B = world.style == 'B'
    lv = st.get('lamp_level')
    lc = st.get('lamp_col', hexc('ffc890') if not B else hexc('c8fff0'))
    for k in range(len(world.lamps)):
        lvl = 1.0 if lv is None else lv[k]
        if lvl <= 0.01:
            continue
        base, head = world.lamp_pos(k)
        col = lc if np.ndim(lc) == 1 else lc[k]
        L.add(head - np.array([0, 0.3, 0]), col, 2.6 * lvl, 2.4, spot=True, name='lamp%d' % k)
    neon = st.get('neon', 1.0) if not B else st.get('neonB', 0.0)
    if neon > 0.01:
        for s in world.wall_signs:
            sx = -1 if s['side'] == 0 else 1
            L.add([sx * (world.A - 0.45), s['y'], s['z']], s['col'], 1.1 * neon, 1.5)
        for b in world.blades:
            sx = -1 if b['side'] == 0 else 1
            L.add([sx * (world.A - 0.5), b['y'] + b['h'] / 2, b['z']], b['col'], 1.2 * neon, 1.6)
    for ex in st.get('extra_lights', []):
        L.add(*ex)
    return L


# ------------------------------------------------------------------ world pass
def render_world(world, cam, st, mask=None):
    """Render world geometry; returns ctx with lit colour + depth buffers in
    real (possibly mirrored) coordinates."""
    world.state = st
    B = world.style == 'B'
    rc = mirror_cam(cam) if B else cam
    D = rc.rays()
    fwd = rc.fwd
    Lw = make_lights(world, st)
    if mask is None:
        Df = D.reshape(-1, 3)
        idx = None
    else:
        mk = mask[:, ::-1] if B else mask
        idx = np.nonzero(mk.ravel())[0]
        Df = D.reshape(-1, 3)[idx]
    hit = world.trace(rc.pos, Df)
    col, refl = world.shade(hit, rc.f, Lw)
    ctx = Ctx()
    ctx.world, ctx.cam, ctx.st, ctx.B = world, cam, st, B
    ctx.col = np.zeros((H, W, 3))
    ctx.t = np.full((H, W), np.inf)
    ctx.kind = np.full((H, W), SKY, dtype=np.int8)
    ctx.refl = np.zeros((H, W))
    ctx.door = hit.get('door')
    if idx is None:
        ctx.col[:] = col.reshape(H, W, 3)
        ctx.t[:] = hit['t'].reshape(H, W)
        ctx.kind[:] = hit['kind'].reshape(H, W)
        ctx.refl[:] = refl.reshape(H, W)
    else:
        ctx.col.reshape(-1, 3)[idx] = col
        ctx.t.reshape(-1)[idx] = hit['t']
        ctx.kind.reshape(-1)[idx] = hit['kind']
        ctx.refl.reshape(-1)[idx] = refl
    ctx.uv = np.full((H, W, 2), -1.0)
    if hit.get('scr_uv') is not None:
        kk, uu, vv = hit['scr_uv']
        flat = ctx.uv.reshape(-1, 2)
        pix = kk if idx is None else idx[kk]
        flat[pix, 0] = uu
        flat[pix, 1] = vv
    if B:
        for a in ('col', 't', 'kind', 'refl', 'uv'):
            setattr(ctx, a, getattr(ctx, a)[:, ::-1].copy())
    Dreal = cam.rays()
    ctx.D = Dreal
    ctx.zc = ctx.t * np.einsum('hwc,c->hw', Dreal, cam.fwd)
    ctx.lights = Lw.mirrored() if B else Lw
    ctx.emis_extra = np.zeros((H, W, 3))
    return ctx


def rx_(ctx, x):
    return -x if ctx.B else x


# ------------------------------------------------------------------ props
def draw_lamps(ctx):
    w, st, cam = ctx.world, ctx.st, ctx.cam
    lv = st.get('lamp_level')
    B = ctx.B
    lc = st.get('lamp_col', hexc('ffc890') if not B else hexc('c8fff0'))
    pole = np.array([0.07, 0.06, 0.1]) if not B else np.array([0.13, 0.15, 0.15])
    for k in range(len(w.lamps)):
        base, head = w.lamp_pos(k)
        base = base.copy()
        head = head.copy()
        base[0] = rx_(ctx, base[0])
        head[0] = rx_(ctx, head[0])
        cz = cam.to_cam(base)[2]
        if cz < -2 or cz > 75:
            continue
        if w.end_near is not None and base[2] <= w.end_near + 1.0:
            continue
        if w.end_far is not None and base[2] >= w.end_far - 1.0:
            continue
        top = np.array([base[0], 3.65, base[2]])
        draw_seg3d(ctx.col, ctx.zc, cam, base, top, 0.06, pole)
        draw_seg3d(ctx.col, ctx.zc, cam, top, head + np.array([0, 0.1, 0]), 0.045, pole)
        lvl = 1.0 if lv is None else lv[k]
        col = lc if np.ndim(lc) == 1 else lc[k]
        hc = col * (0.3 + 2.2 * lvl) if lvl > 0.01 else np.array([0.12, 0.12, 0.14])
        draw_seg3d(ctx.col, ctx.zc, cam, head + np.array([-0.18, 0, 0]), head + np.array([0.18, 0, 0]),
                   0.07, hc)
        if lvl > 0.01:
            x, y, z = cam.project(head)
            if z > 0.3 and 0 <= int(x) < W and 0 <= int(y) < H and ctx.zc[int(y), int(x)] >= z - 0.4:
                r = 0.16 * cam.f / z
                glow(ctx.emis_extra, x, y, r, col * lvl, 0.7)
                glow(ctx.emis_extra, x, y, r * 3.0, col * lvl, 0.12)


def draw_cables(ctx):
    w, cam = ctx.world, ctx.cam
    c = np.array([0.03, 0.025, 0.05]) if not ctx.B else np.array([0.06, 0.07, 0.07])
    for (z, h, sag) in w.cables:
        if cam.to_cam(np.array([0, h, z]))[2] < -1:
            continue
        xs = np.linspace(-w.A, w.A, 9)
        ys = h - sag * (1 - (xs / w.A) ** 2)
        for i in range(8):
            draw_seg3d(ctx.col, ctx.zc, cam, [xs[i], ys[i], z], [xs[i + 1], ys[i + 1], z], 0.012, c, min_px=0.5)


def volumetrics(ctx, density=0.028):
    """Analytic light cones under the street lamps (real coordinates)."""
    cam = ctx.cam
    O = cam.pos
    D = ctx.D
    tmax = np.where(np.isfinite(ctx.t), ctx.t, 120.0)
    acc = np.zeros((H, W, 3))
    c2 = np.cos(0.55) ** 2
    V = np.array([0, -1.0, 0])
    for it in ctx.lights.items:
        if not it['name'].startswith('lamp') or it['i'] < 0.05:
            continue
        Cp = it['pos'] + np.array([0, 0.25, 0])
        cz = cam.to_cam(Cp)[2]
        if cz < -4 or cz > 60:
            continue
        w0 = O - Cp
        dv = D[..., 1] * -1.0
        w0v = -w0[1]
        dw = np.einsum('hwc,c->hw', D, w0)
        a = dv * dv - c2
        b = 2 * (dv * w0v - c2 * dw)
        cc = w0v * w0v - c2 * (w0 @ w0)
        disc = b * b - 4 * a * cc
        sq = np.sqrt(np.maximum(disc, 0))
        with np.errstate(divide='ignore', invalid='ignore'):
            r1 = (-b - sq) / (2 * a)
            r2 = (-b + sq) / (2 * a)
        lo = np.minimum(r1, r2)
        hi = np.maximum(r1, r2)
        ok = disc > 0
        # a < 0: inside between roots; a > 0: outside roots -> pick the lower-nappe side
        with np.errstate(divide='ignore', invalid='ignore'):
            tg = -w0v / dv          # where w.V == 0
        # lower nappe half-line
        g_lo = np.where(dv > 0, tg, -np.inf)
        g_hi = np.where(dv > 0, np.inf, tg)
        # floor clip
        with np.errstate(divide='ignore', invalid='ignore'):
            tfl = np.where(D[..., 1] < 0, -O[1] / D[..., 1], np.inf)
        L1 = np.where(a < 0, lo, -np.inf)
        H1 = np.where(a < 0, hi, lo)
        L2 = np.where(a < 0, np.inf, hi)
        H2 = np.where(a < 0, -np.inf, np.inf)
        tot = np.zeros((H, W))
        mid = np.zeros((H, W))
        for (l, h_) in ((L1, H1), (L2, H2)):
            lo_ = np.maximum.reduce([l, g_lo, np.zeros_like(l)])
            hi_ = np.minimum.reduce([h_, g_hi, tmax, tfl])
            ln = np.where(ok, np.maximum(hi_ - lo_, 0), 0)
            ln = np.minimum(ln, 8.0)
            tot += ln
            with np.errstate(invalid='ignore'):
                mid = np.where(ln > 0, (lo_ + hi_) * 0.5, mid)
        mid = np.nan_to_num(mid, nan=0.0, posinf=0.0, neginf=0.0)
        Pm = O + D * np.where(tot > 0, mid, 0)[..., None]
        dd = np.linalg.norm(Pm - Cp, axis=-1)
        fall = 1.0 / (1 + (dd / 1.6) ** 2)
        acc += (tot * fall * it['i'] * density)[..., None] * it['col']
    ctx.col += acc


def apply_fog(ctx, fogc, dens, sky_fog=0.0, floor_glow=None):
    t = ctx.t
    fin = np.isfinite(t)
    f = np.where(fin, 1 - np.exp(-np.where(fin, t, 0) * dens), sky_fog)
    ctx.col = ctx.col * (1 - f[..., None]) + np.asarray(fogc) * f[..., None]


# ------------------------------------------------------------------ characters
def _sprite_world(cam, anchor, pts):
    rh = np.array([cam.right[0], 0, cam.right[2]])
    rh /= np.linalg.norm(rh) + 1e-9
    fh = np.array([cam.fwd[0], 0, cam.fwd[2]])
    fh /= np.linalg.norm(fh) + 1e-9
    up = np.array([0, 1.0, 0])
    return anchor + pts[..., 0:1] * rh + pts[..., 1:2] * up + pts[..., 2:3] * fh, (rh, up, fh)


def draw_character(ctx, pose, pos, yaw, face=None, head_look=(0, 0), rim=None, glitch=0.0,
                   reflect=True, fill=0.35, alpha=1.0, clip_portal=None, dark=False, seed=0):
    cam = ctx.cam
    anchor = np.asarray(pos, float)
    ax, ay, zc = cam.project(anchor)
    if zc < 0.3:
        return None
    # horizontal scale from distance, vertical from projected height
    ppu = cam.f / zc
    theta = yaw - cam.yaw
    spr = puppet.raster(pose, theta, ppu, ax, ay, roll=cam.roll, head_look=head_look, face=face,
                        window=(-2, -2, W + 2, H + 2))
    if spr is None:
        return None
    x0, y0, gw, gh = spr['x0'], spr['y0'], spr['w'], spr['h']
    hit = spr['hit']
    # world positions / normals of sprite pixels
    Pl = spr['P'][hit]
    Pw, (rh, up, fh) = _sprite_world(cam, anchor, Pl)
    nl = spr['n'][hit]
    Nw = nl[:, 0:1] * rh + nl[:, 1:2] * up + nl[:, 2:3] * fh
    Ls = ctx.lights.shade(Pw, Nw, wrap=0.35)
    st = ctx.st
    amb = st.get('char_amb', np.array([0.16, 0.13, 0.24]) if not ctx.B else np.array([0.12, 0.15, 0.16]))
    view = -fh
    ndv = np.clip(Nw @ view, 0, 1)
    Ls = Ls + amb + fill * np.clip(Nw @ (view * 0.7 + np.array([0, 0.5, 0])), 0, 1)[:, None] * st.get('fill_col', np.array([0.5, 0.45, 0.6]))
    rimc = rim if rim is not None else st.get('rim', np.array([0.6, 0.3, 0.9]))
    rimt = (1 - ndv) ** 2.2
    Ls = Ls + rimt[:, None] * rimc * 1.3
    if st.get('flash', 0) > 0:
        Ls = Ls + st['flash'] * 1.2
    lum = Ls.mean(1) + 1e-6
    band = np.clip(np.round(lum * 4.0) / 4.0, 0.25, 3.0)
    Ls = Ls * (band / lum)[:, None]
    alb = spr['alb'][hit]
    colp = alb * Ls + spr['emi'][hit]
    if pose.get('sil'):
        colp = alb * Ls * 0.6 + rimt[:, None] ** 1.5 * rimc * 0.7 + spr['emi'][hit]
    img = np.zeros((gh, gw, 3))
    img[hit] = colp
    edge, outline = puppet.edges_and_outline(spr)
    img[edge] *= 0.45
    depth = np.where(hit, zc + spr['z'], np.inf)
    od = np.full((gh, gw), np.inf)
    od[outline] = zc
    ink = INK if not pose.get('sil') else np.array([0.0, 0.0, 0.0])
    if glitch > 0:
        rng = np.random.default_rng(seed)
        rows = rng.random(gh) < glitch * 0.35
        shifts = rng.integers(-int(3 + 10 * glitch), int(4 + 10 * glitch), gh) * rows
        for i in np.nonzero(rows)[0]:
            img[i] = np.roll(img[i], shifts[i], axis=0)
            depth[i] = np.roll(depth[i], shifts[i])
            od[i] = np.roll(od[i], shifts[i])
    # clip to screen
    sx0, sy0 = max(x0, 0), max(y0, 0)
    sx1, sy1 = min(x0 + gw, W), min(y0 + gh, H)
    if sx0 >= sx1 or sy0 >= sy1:
        return spr
    ix0, iy0 = sx0 - x0, sy0 - y0
    ix1, iy1 = ix0 + (sx1 - sx0), iy0 + (sy1 - sy0)
    sub = ctx.col[sy0:sy1, sx0:sx1]
    zsub = ctx.zc[sy0:sy1, sx0:sx1]
    tsub = ctx.t[sy0:sy1, sx0:sx1]
    dd = depth[iy0:iy1, ix0:ix1]
    oo = od[iy0:iy1, ix0:ix1]
    ii_ = img[iy0:iy1, ix0:ix1]
    m = dd < zsub
    mo = (oo < zsub) & ~m
    if clip_portal is not None:
        cp = clip_portal[sy0:sy1, sx0:sx1]
        m &= cp
        mo &= cp
    if alpha >= 1:
        sub[m] = ii_[m]
        sub[mo] = ink
        zsub[m] = dd[m]
        tsub[m] = dd[m]
    else:
        sub[m] = sub[m] * (1 - alpha) + ii_[m] * alpha
        sub[mo] = sub[mo] * (1 - alpha) + ink * alpha
    # wet-floor reflection (vertical flip about the feet line)
    if reflect:
        ayi = int(round(ay))
        rows = np.arange(gh)
        src_y = y0 + rows                       # screen row of sprite row
        dst_y = 2 * ayi - src_y
        for r in range(gh):
            yy = dst_y[r]
            if yy < 0 or yy >= H or src_y[r] > ayi:
                continue
            xs = np.arange(x0, x0 + gw)
            ok = (xs >= 0) & (xs < W)
            xs_ok = xs[ok]
            hrow = hit[r][ok]
            if not hrow.any():
                continue
            fl = (ctx.kind[yy, xs_ok] == FLOOR)
            rf = ctx.refl[yy, xs_ok] * fl * hrow
            if not rf.any():
                continue
            fade = max(0.0, 1 - (ayi - src_y[r]) / (gh * 0.9))
            k = (rf * 0.75 * fade)[:, None]
            ctx.col[yy, xs_ok] = ctx.col[yy, xs_ok] * (1 - k) + img[r][ok] * k
    return spr


def draw_template(ctx, tpl, pos, height, cols, emis_keys=(), flip=False, blink=False):
    """Hand-pixelled sprite placed in 3D and scaled with nearest neighbour."""
    cam = ctx.cam
    ax, ay, zc = cam.project(np.asarray(pos, float))
    if zc < 0.3:
        return
    rows = tpl
    th, tw = len(rows), len(rows[0])
    ppu = cam.f / zc
    hp = height * ppu
    s = hp / th
    if s < 0.35:
        return
    oh, ow = max(1, int(round(th * s))), max(1, int(round(tw * s)))
    x0 = int(round(ax - ow / 2))
    y0 = int(round(ay - oh))
    for i in range(oh):
        yy = y0 + i
        if yy < 0 or yy >= H:
            continue
        si = min(th - 1, int(i / s))
        for j in range(ow):
            xx = x0 + j
            if xx < 0 or xx >= W:
                continue
            sj = min(tw - 1, int(j / s))
            if flip:
                sj = tw - 1 - sj
            ch = rows[si][sj]
            if ch == '.' or ch not in cols:
                continue
            if blink and ch in emis_keys:
                ch = 'k'
            if zc < ctx.zc[yy, xx]:
                ctx.col[yy, xx] = cols[ch]


CAT = [
    '.k......k.',
    '.kk....kk.',
    '.kkkkkkkk.',
    '.kEkkkkEk.',
    '.kkkkkkkk.',
    '..kkkkkk..',
    '..kkkkkk..',
    '.kkkkkkkk.',
    '.kkkkkkkk.',
    'kkkkkkkkkk',
    'kkkkkkkk.k',
    '.kkkkkk..k',
]
SECCAM = [
    'gggggg..',
    'ggggggGR',
    'gggggg..',
    '..kk....',
    '..kk....',
]


# ------------------------------------------------------------------ rain
_RNG = np.random.default_rng(1234)
_DROPS = dict(x=_RNG.random(900) * W, y=_RNG.random(900) * H, layer=_RNG.integers(0, 3, 900),
              ph=_RNG.random(900))


def rain(ctx, t, amount=1.0, cam_dx=0.0):
    if amount <= 0:
        return
    lum = ctx.col.mean(axis=2)
    acc = np.zeros((H, W))
    speeds = np.array([330.0, 520.0, 800.0])
    lens = np.array([3, 5, 9])
    bright = np.array([0.10, 0.17, 0.28])
    n = int(len(_DROPS['x']) * amount)
    for k in range(n):
        L = _DROPS['layer'][k]
        y = (_DROPS['y'][k] + speeds[L] * t) % (H + 20) - 10
        x = (_DROPS['x'][k] - 0.18 * speeds[L] * t - cam_dx * (L + 1) * 0.5) % W
        for s in range(lens[L]):
            yy = int(y + s)
            xx = int(x - s * 0.18)
            if 0 <= yy < H and 0 <= xx < W:
                acc[yy, xx] += bright[L]
    ctx.col += acc[..., None] * (0.35 + 1.6 * lum[..., None]) * np.array([0.7, 0.8, 1.0]) * amount


def rain_fast(ctx, t, amount=1.0):
    """Vectorised rain streaks."""
    if amount <= 0:
        return
    lum = ctx.col.mean(axis=2)
    n = int(len(_DROPS['x']) * amount)
    layer = _DROPS['layer'][:n]
    speeds = np.array([330.0, 520.0, 800.0])[layer]
    lens = np.array([3, 5, 9])[layer]
    bright = np.array([0.08, 0.14, 0.24])[layer]
    y = (_DROPS['y'][:n] + speeds * t) % (H + 20) - 10
    x = (_DROPS['x'][:n] - 0.18 * speeds * t) % W
    acc = np.zeros(H * W)
    for s in range(9):
        m = s < lens
        yy = (y[m] + s).astype(int)
        xx = (x[m] - s * 0.18).astype(int)
        ok = (yy >= 0) & (yy < H) & (xx >= 0) & (xx < W)
        np.add.at(acc, yy[ok] * W + xx[ok], bright[m][ok])
    acc = acc.reshape(H, W)
    ctx.col += acc[..., None] * (0.3 + 1.5 * lum[..., None]) * np.array([0.7, 0.8, 1.0]) * amount


# ------------------------------------------------------------------ post
def post(img, p):
    """Screen-space effects on the float image before quantisation."""
    out = img
    # zoom punch
    zp = p.get('zoom', 1.0)
    if abs(zp - 1.0) > 1e-3:
        yy, xx = np.mgrid[0:H, 0:W]
        cy, cx = p.get('zoom_c', (H / 2, W / 2))
        sy = ((yy + 0.5 - cy) / zp + cy).astype(int).clip(0, H - 1)
        sx = ((xx + 0.5 - cx) / zp + cx).astype(int).clip(0, W - 1)
        out = out[sy, sx]
    # wave warp (decor deformation)
    wa = p.get('warp', 0.0)
    if wa > 0:
        t = p.get('t', 0.0)
        yy = np.arange(H)
        off = (wa * (np.sin(yy * 0.045 + t * 7.0) * 6 + np.sin(yy * 0.13 - t * 11.0) * 2.5)).astype(int)
        xx = (np.arange(W)[None, :] - off[:, None]) % W
        out = out[np.arange(H)[:, None], xx]
        # vertical bend
        xs = np.arange(W)
        offy = (wa * np.sin(xs * 0.05 + t * 5.0) * 5).astype(int)
        yy2 = (np.arange(H)[:, None] - offy[None, :]).clip(0, H - 1)
        out = out[yy2, np.arange(W)[None, :]]
    # whip-pan smear
    hb = int(p.get('hblur', 0))
    if hb > 0:
        acc = np.zeros_like(out)
        ks = range(-hb, hb + 1, max(1, hb // 6))
        for k in ks:
            acc += np.roll(out, k, axis=1)
        out = acc / len(ks)
    # glitch slices
    g = p.get('glitch', 0.0)
    if g > 0:
        rng = np.random.default_rng(p.get('seed', 0))
        out = out.copy()
        nb = int(3 + 14 * g)
        for _ in range(nb):
            y0 = rng.integers(0, H - 4)
            hh = rng.integers(2, int(6 + 30 * g))
            sh = rng.integers(-int(4 + 40 * g), int(5 + 40 * g))
            out[y0:y0 + hh] = np.roll(out[y0:y0 + hh], sh, axis=1)
            if rng.random() < 0.3 * g:
                out[y0:y0 + hh] = out[y0:y0 + hh][..., [2, 0, 1]]
    # chromatic aberration
    ca = int(round(p.get('ca', 0.0)))
    if ca:
        o2 = out.copy()
        o2[..., 0] = np.roll(out[..., 0], ca, axis=1)
        o2[..., 2] = np.roll(out[..., 2], -ca, axis=1)
        out = o2
    # exposure / tint / flash
    out = out * p.get('exposure', 1.0)
    tint = p.get('tint')
    if tint is not None:
        out = out * np.asarray(tint)
    wf = p.get('white', 0.0)
    if wf > 0:
        out = out * (1 - wf) + wf * np.array([1.0, 1.0, 1.0]) * 1.2
    inv = p.get('invert', 0.0)
    if inv > 0:
        out = out * (1 - inv) + (1 - np.clip(out, 0, 1)) * inv * np.array([0.6, 0.9, 1.0])
    # vignette
    vg = p.get('vignette', 0.35)
    if vg > 0:
        yy, xx = np.mgrid[0:H, 0:W]
        r = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2)
        out = out * (1 - vg * np.clip(r - 0.45, 0, 1)[..., None] * 1.6)
    # scanlines (screens / visor)
    sl = p.get('scan', 0.0)
    if sl > 0:
        out = out * (1 - sl * (np.arange(H)[:, None, None] % 2 == 1))
    return out


def finish(ctx, p):
    img = ctx.col + ctx.emis_extra
    img = bloom(img, threshold=p.get('bloom_th', 0.5), strength=p.get('bloom', 0.85))
    img = post(img, p)
    q = quantize(img, dither=p.get('dither_map'), amount=p.get('dither', 0.07))
    return q
