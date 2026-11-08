"""Part 3: « La lumière rouge ».  The red light blinking at the end of the
street since part 1 was the camera indicator of the viewer's screen."""
import numpy as np
from scipy import ndimage
from core import (W, H, Camera, hexc, clamp, sstep, lerp, ease_io, ease_in, ease_out, hash1,
                  bloom, quantize, draw_subtitle, DURATION, BEAT, BAR, DROP, bar_t)
from world import World, FLOOR, END_F
import engine as E
import puppet
from story import (base_world, flick_on, walk_phase, details_A, NL, LAMP_Z, FOG_A, seg_mask, _XX, _YY)
from story import st_A as _st_A
from story2 import ghost_pose, face_toward, aim_cam, eye_dots
from timeline3 import *

V = 1.25
CAM1 = np.array([0.3, 1.85, -3.8])
H_X = 0.75
LIGHT_Y = 14.0
Z_END0 = 58.0
WA3 = World('A')
RED = np.array([1.0, 0.16, 0.24])
CYAN = np.array([0.4, 0.85, 1.0])


# ================================================================ motion
def h1(s):
    """Hero position on the loop clock: walks in from behind the camera."""
    z0, L = -5.0, 0.8
    tw = STOP1 - L
    if s <= tw:
        return z0 + V * s
    if s < STOP1:
        u = s - tw
        return z0 + V * tw + V * (u - u * u / (2 * L))
    return z0 + V * tw + V * L / 2


def h1_speed(s):
    L = 0.8
    tw = STOP1 - L
    if s <= tw:
        return V
    if s < STOP1:
        return V * (1 - (s - tw) / L)
    return 0.0


Z_STOP1 = h1(STOP1)


def walk2_speed(t):
    return V * sstep(WALK2, WALK2 + 0.6, t) * (1 - sstep(STOP2 - 0.8, STOP2, t))


_TT = np.arange(S1_END, STOP2 + 0.5, 0.001)
_ZZ = Z_STOP1 + np.concatenate([[0], np.cumsum(np.array([walk2_speed(x) for x in _TT[:-1]]) * 0.001)])
Z3 = float(_ZZ[-1])
Z_END3 = Z_END0 + (Z3 - Z_STOP1)
Z_G = Z_END3 - 3.0
DOOR = dict(z=Z_STOP1 + 6.5, x=-0.75)


def hero_z(t):
    if t < S1_END:
        return h1(t)
    if t < STOP2 + 0.5:
        return float(np.interp(t, _TT, _ZZ))
    if t < DROP:
        return Z3
    if t < SIL_C[0]:
        u = (t - DROP) / (SIL_C[0] - DROP)
        f = u - np.sin(2 * np.pi * u) / (2 * np.pi)
        return Z3 + (Z_G - Z3) * f
    if t < D4:
        return Z_G
    return Z_G + 2.45 * ease_io((t - D4) / (PRESS - D4))


def hero_x(t):
    if t < DROP:
        return H_X
    return lerp(H_X, 0.0, sstep(DROP, SIL_C[0], t))


def z_end(t):
    if t < WALK2:
        return Z_END0
    if t < DROP:
        return Z_END0 + (hero_z(t) - Z_STOP1)
    return Z_END3


RUNWAY_K = sorted([k for k in range(NL) if Z3 + 1.0 < LAMP_Z[k] < Z3 + 47.0], key=lambda k: LAMP_Z[k])[:8]
COPIES = []
for i, k in enumerate(RUNWAY_K):
    sx = -1 if WA3.lamps[k]['side'] == 0 else 1
    COPIES.append(dict(i=i, k=k, pos=np.array([sx * 2.15, 0.0, LAMP_Z[k] + 0.35]), side=sx))


# ================================================================ world helpers
def glass_state(t, s=None, light=None, reveal=0.0, face=0.0, scale=1.0, blink=0.0, ripples=()):
    s = t if s is None else s
    lv = tower_blink(s) if light is None else light
    return dict(reveal=reveal, face=face, scale=scale, blink=blink, light=lv, light_y=LIGHT_Y,
                ripples=list(ripples), el0=0.47)


def world3(cam, st, t, outside=False):
    st['no_mast'] = True
    st['tower'] = 0.0
    if outside:
        WA3.end_far = None
        st.pop('glass', None)
    else:
        WA3.end_far = z_end(t)
    ctx = base_world(WA3, cam, st)
    if not outside:
        g = ctx.kind == END_F
        ctx.t[g] = np.inf
        ctx.zc[g] = np.inf
    return ctx


def compose3(ctx, t, rain=1.0, fog=FOG_A, dens=0.03, vol=True):
    if vol:
        E.volumetrics(ctx)
    E.apply_fog(ctx, fog, dens)
    if rain > 0:
        E.rain_fast(ctx, t, rain, splash=True)
    return ctx.col + ctx.emis_extra


def red_glow(img, cam, t, lvl, zend=None):
    P = np.array([0.0, LIGHT_Y, z_end(t) if zend is None else zend])
    x, y, z = cam.project(P)
    if z > 0.5 and -20 <= x < W + 20 and -20 <= y < H + 20:
        r = max(2.2, 0.35 * cam.f / z)
        E.glow(img, x, y, r, RED, 0.9 * (0.25 + lvl))
        E.glow(img, x, y, r * 4, RED, 0.18 * (0.25 + lvl))
        if 0 <= int(x) < W and 0 <= int(y) < H:
            img[int(y), int(x)] += np.array([1.0, 0.3, 0.3]) * (0.4 + 1.5 * lvl)


def finish3(img, p, t, overlay=None):
    img = bloom(img, threshold=p.get('bloom_th', 0.5), strength=p.get('bloom', 0.85))
    img = E.post(img, p)
    if overlay is not None:
        img = overlay(img)
    return quantize(img, amount=p.get('dither', 0.07))


def ghost(ctx, pos, yaw, t, extra=None, glitch=0.0, seed=0, lvl=2.4, rim=None):
    ex = dict(breath=t * 2.1 + pos[2], eye_lvl=lvl)
    if extra:
        ex.update(extra)
    return E.draw_character(ctx, ghost_pose(ex), pos, yaw, face=dict(brow=0.1), glitch=glitch, seed=seed,
                            rim=rim if rim is not None else np.array([1.0, 0.3, 0.45]), fill=0.35)


def ghost_eyes(img, cam, pos, yaw, lvl=1.2):
    eye_dots(img, cam, pos, yaw, lvl, height=1.605)


# ================================================================ cracks in the viewer's screen
def make_crack(cx, cy, seed, size):
    rng = np.random.default_rng(seed)
    nr = int(rng.integers(10, 15))
    rays = []
    for a in np.sort(rng.uniform(0, 2 * np.pi, nr)):
        pts = [(cx, cy, 0.0)]
        ang, r = a, 0.0
        L = size * rng.uniform(0.55, 1.0)
        while r < L:
            st = rng.uniform(4, 9)
            ang += rng.normal(0, 0.16)
            r += st
            pts.append((cx + r * np.cos(ang), cy + r * np.sin(ang), r))
        rays.append(pts)
    rings = []
    for frac in (0.14, 0.3, 0.5):
        rk = size * frac
        for i in range(nr):
            p1, p2 = rays[i], rays[(i + 1) % nr]
            a = min(p1, key=lambda q: abs(q[2] - rk))
            b = min(p2, key=lambda q: abs(q[2] - rk))
            if abs(a[2] - rk) < 6 and abs(b[2] - rk) < 6 and rng.random() < 0.8:
                mx = (a[0] + b[0]) / 2 + rng.normal(0, 2)
                my = (a[1] + b[1]) / 2 + rng.normal(0, 2)
                rings.append(((a[0], a[1]), (mx, my), (b[0], b[1]), rk))
    return dict(rays=rays, rings=rings, size=size, cx=cx, cy=cy)


def _line(mask, x0, y0, x1, y1):
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 1.5) + 1
    xs = np.linspace(x0, x1, n).astype(int)
    ys = np.linspace(y0, y1, n).astype(int)
    ok = (xs >= 0) & (xs < W) & (ys >= 0) & (ys < H)
    mask[ys[ok], xs[ok]] = True


def draw_cracks(img, cracks, alpha=1.0, glow_k=1.0):
    if alpha <= 0 or not cracks:
        return img
    mask = np.zeros((H, W), bool)
    core = np.zeros((H, W), bool)
    for (c, prog) in cracks:
        lim = c['size'] * ease_out(prog)
        for pts in c['rays']:
            for (a, b) in zip(pts[:-1], pts[1:]):
                if b[2] > lim:
                    break
                _line(mask, a[0], a[1], b[0], b[1])
        for (a, m, b, rk) in c['rings']:
            if rk < lim:
                _line(mask, a[0], a[1], m[0], m[1])
                _line(mask, m[0], m[1], b[0], b[1])
        rr = (_XX - c['cx']) ** 2 + (_YY - c['cy']) ** 2 < (0.022 * c['size'] * min(1, prog * 3)) ** 2
        core |= rr
    border = ndimage.binary_dilation(mask) & ~mask
    out = img.copy()
    if glow_k > 0:
        g = ndimage.gaussian_filter(mask.astype(float), 2.0) * 1.6 * glow_k
        out += g[..., None] * np.array([0.35, 0.8, 1.0]) * alpha
    out[border] = out[border] * (1 - 0.7 * alpha)
    out[mask] = out[mask] * (1 - alpha) + np.array([1.05, 1.1, 1.15]) * alpha
    out[core] = out[core] * (1 - alpha) + np.array([0.9, 1.0, 1.05]) * alpha
    return out


CRACK1 = None
CRACK2 = None


def hand_through(img, t, cx, cy):
    """His hand coming out of the screen."""
    k = ease_in((t - HAND[0]) / (HAND[1] - HAND[0]))
    if k <= 0:
        return img
    S = 30 + 560 * k
    cx = lerp(cx, W / 2, k)
    cy = lerp(cy, H * 0.55, k)
    out = img.copy()
    rng = np.random.default_rng(5)
    # shards flying toward us
    for i in range(46):
        a = rng.uniform(0, 2 * np.pi)
        d = (20 + 700 * k) * rng.uniform(0.3, 1.0)
        px, py = cx + np.cos(a) * d, cy + np.sin(a) * d
        sz = (2 + 9 * k) * rng.uniform(0.5, 1.2)
        m = (np.abs(_XX - px) + np.abs(_YY - py) * 0.7) < sz
        out[m] = np.array([0.85, 1.0, 1.05]) * rng.uniform(0.6, 1.3)
    sleeve = seg_mask(cx - S * 0.1, cy + S * 1.4, cx, cy + S * 0.25, S * 0.32, S * 0.26)
    lit_s = clamp(0.5 + (_XX - cx) / (S * 0.6))
    palm = ((_XX - cx) / (S * 0.3)) ** 2 + ((_YY - cy) / (S * 0.33)) ** 2 < 1
    fingers = np.zeros((H, W), bool)
    for j, ang in enumerate((-2.0, -1.7, -1.42, -1.15)):
        L = S * (0.42 + 0.08 * (1 - abs(j - 1.5) / 1.5))
        x0, y0 = cx + np.cos(ang) * S * 0.22, cy + np.sin(ang) * S * 0.22
        fingers |= seg_mask(x0, y0, x0 + np.cos(ang) * L, y0 + np.sin(ang) * L, S * 0.065, S * 0.055)
    fingers |= seg_mask(cx + S * 0.24, cy + S * 0.05, cx + S * 0.52, cy - S * 0.2, S * 0.075, S * 0.06)
    hand = palm | fingers
    sl = sleeve & ~hand
    out[sl] = np.array([0.85, 0.38, 0.08]) * (0.55 + 0.5 * lit_s[sl])[:, None]
    lit = clamp(1.0 - (_YY - (cy - S * 0.6)) / (S * 1.6))
    skin = np.array([0.86, 0.57, 0.41])
    out[hand] = skin * (0.55 + 0.6 * lit[hand, None])
    edge = (hand | sleeve) & ~ndimage.binary_erosion(hand | sleeve, iterations=2)
    out[edge] = np.array([0.04, 0.03, 0.06])
    return out


# ================================================================ scene 1 + loop tail
def cam1(s):
    push = 0.4 * sstep(0, S1_END, s) if s > 0 else 0.0
    return Camera(CAM1 + np.array([0.03 * np.sin(0.37 * s), 0.015 * np.sin(2 * np.pi * s / 3.4), push]),
                  yaw=0.01 * np.sin(0.3 * s), pitch=-0.05 + (0.02 * sstep(0, S1_END, s) if s > 0 else 0.0),
                  roll=0.006 * np.sin(0.5 * s), f=235)


def st_world(t, s, **kw):
    st = _st_A(s)
    st.update(kw)
    return st


def frame_obs(t, s):
    cam = cam1(s)
    g = glass_state(t, s)
    p = dict(t=t, vignette=0.4)
    st = st_world(t, s, glass=g)
    if 2.4 <= s < 2.47:
        # hidden detail: lightning, and for two frames the face is there
        g.update(reveal=0.35, face=0.7)
        st['flash'] = 0.25
    ctx = world3(cam, st, t)
    details_A(ctx, s, t)
    z = h1(s)
    if s > 0:
        look = sstep(STOP1 - 0.2, STOP1 + 0.6, s)
        E.draw_character(ctx, dict(phase=walk_phase(z), walk=h1_speed(s) / V, breath=s * 2.2), [H_X, 0, z], 0.0,
                         head_look=(0.05 * look, 0.28 * look))
    img = compose3(ctx, s)
    red_glow(img, cam, t, tower_blink(s))
    overlay = None
    if t >= POV2:
        # he got out: the street is empty, our screen is still cracked
        if REFLECT[0] <= t < REFLECT[1]:
            img = reflection_behind(img, ctx, t)
        a = 1 - sstep(POV2, HEAL[0], t)
        cr = [(CRACK1, 1.0), (CRACK2, 1.0)]
        overlay = lambda im: draw_cracks(im, cr, alpha=0.85 * a, glow_k=0.4 * a)
        if HEAL[0] <= t < HEAL[1]:
            p['glitch'] = 0.7
            p['seed'] = int(t * 60)
        if t - POV2 < 0.1:
            p['white'] = 0.5
    return finish3(img, p, t, overlay)


def reflection_behind(img, ctx, t):
    """Hidden: in the puddle at the bottom, the reflection of someone standing
    where you are."""
    k = sstep(REFLECT[0], REFLECT[0] + 0.6, t) * (1 - sstep(REFLECT[1] - 0.5, REFLECT[1], t))
    spr = puppet.raster(dict(walk=0.0, breath=t * 2), np.pi, 52.0, W * 0.5, H + 60, face=dict(gaze=(0, -0.3)),
                        window=(0, 0, W, H + 140))
    if spr is None:
        return img
    out = img.copy()
    hit = spr['hit'][::-1]
    col = spr['alb'][::-1] * 0.5
    y0 = H - 92
    x0 = spr['x0']
    hh = min(hit.shape[0], H - y0)
    for r in range(hh):
        yy = y0 + r
        xs = np.arange(x0, x0 + hit.shape[1])
        okx = (xs >= 0) & (xs < W)
        m = hit[r][okx] & (ctx.kind[yy, xs[okx]] == FLOOR)
        rf = ctx.refl[yy, xs[okx]][m]
        xx = xs[okx][m]
        a = (0.55 * rf * k * (1 - r / hh))[:, None]
        out[yy, xx] = out[yy, xx] * (1 - a) + col[r][okx][m] * a
    return out


# ================================================================ scene 2
def door_state(t):
    br = np.cos(2 * np.pi * (t - 6.0) / (2 * BEAT))
    phi = 0.38 * sstep(DOOR_CRACK[0], DOOR_CRACK[0] + 0.5, t) * (1 - sstep(DOOR_CRACK[1], DOOR_CRACK[1] + 0.4, t))
    d = dict(z=DOOR['z'], x=DOOR['x'], w=1.2, h=2.4, t=t, breath=br, glow=0.8 + 0.3 * max(0, br) + 1.2 * phi,
             wob=0.4, morph=max(0.0, (t - 9.0) * 0.3), phi=phi, eye=sstep(10.2, 10.6, t), white=0.6 * phi)
    if t < DOOR_APPEAR or t >= DOOR_GONE:
        d['visible'] = False
    elif t - DOOR_APPEAR < 0.12 or t > DOOR_GONE - 0.15:
        d['glow'] *= 2.5 if int(t * 60) % 2 == 0 else 0.1
    return d


def frame_s2(t):
    z = hero_z(t)
    xh = H_X
    sp = walk2_speed(t)
    pose = dict(phase=walk_phase(z), walk=sp / V, breath=t * 2.2)
    d = door_state(t)
    lights = []
    if d.get('visible', True):
        c = 0.5 + 0.5 * np.sin(t * 3.66)
        lights.append(([d['x'], 1.3, d['z'] - 0.2], np.array([0.2, 0.95, 1.0]) * c + np.array([1.0, 0.3, 0.85]) * (1 - c),
                       2.6 * d['glow'], 3.0))
    p = dict(t=t, vignette=0.42)
    if t < DOOR_APPEAR:
        c0 = cam1(S1_END)
        k = sstep(WALK2, WALK2 + 1.2, t)
        cz = lerp(c0.pos[2], z - 3.1, k)
        cam = Camera([lerp(c0.pos[0], 0.2, k), lerp(c0.pos[1], 1.6, k), cz], yaw=c0.yaw * (1 - k),
                     pitch=lerp(c0.pitch, -0.02, k), f=lerp(235, 228, k))
        face = None
    elif t < 12.6:
        k = (t - DOOR_APPEAR) / (12.6 - DOOR_APPEAR)
        cam = Camera([-2.3, 1.35, z - 1.2], yaw=0.9 - 0.15 * k, pitch=0.02, roll=0.01 * np.sin(t), f=225)
        face = dict(gaze=(0.0, 0.1), brow=0.6)
    else:
        cam = Camera([0.4, 1.55, z + 2.6], yaw=np.pi - 0.05, pitch=0.03, f=240)
        face = dict(gaze=(0.0, 0.05), brow=0.75, mouth=0.05)
    st = st_world(t, t, glass=glass_state(t), extra_lights=lights, doors=[d])
    if SIL_A[0] <= t:
        st['lamp_level'] = st['lamp_level'] * 0.5
    ctx = world3(cam, st, t)
    details_A(ctx, t, t)
    eyes = []
    if ROOF[0] <= t < ROOF[1] and t >= 12.6:
        for j, (sx, dz) in enumerate(((-1, -9.0), (1, -12.5), (-1, -16.0))):
            zr = z + dz
            hr_, _ = WA3.height_at(0 if sx < 0 else 1, np.array([zr]))
            pos = [sx * 2.75, float(hr_[0]), zr]
            if hash1(int(t * 30) + j, 3) > 0.1:
                ghost(ctx, pos, face_toward(pos, [xh, 0, z]), t, glitch=0.3, seed=int(t * 30) + j)
                eyes.append((pos, face_toward(pos, [xh, 0, z])))
    E.draw_character(ctx, pose, [xh, 0, z], 0.0, face=face, head_look=(0.0, 0.08), fill=0.45)
    img = compose3(ctx, t)
    for pos, yw in eyes:
        eye_dots(img, cam, pos, yw, 1.0, height=pos[1] + 1.605)
    red_glow(img, cam, t, tower_blink(t))
    if abs(t - DOOR_APPEAR) < 0.05 or abs(t - 12.6) < 0.04:
        p['glitch'] = 0.5
        p['seed'] = int(t * 60)
    if t >= SIL_A[0]:
        p['exposure'] = 0.8
    p['zoom'] = 1.0 + 0.03 * sstep(14.0, SIL_A[0], t) if t >= 12.6 else 1.0
    return finish3(img, p, t)


# ================================================================ scene 3
def runway_levels(t):
    lv = np.zeros(NL)
    for i, k in enumerate(RUNWAY_K):
        lv[k] = 1.15 * flick_on(t, RUNWAY[i], k)
    if 31.4 < t < SIL_B[0]:
        amt = sstep(31.4, SIL_B[0], t)
        for k in RUNWAY_K:
            if hash1(int(t * 24) * 31 + k, 6) < amt * 0.6:
                lv[k] *= 0.2
    if t >= SIL_B[0]:
        lv[:] = 0
    return lv


def copy_yaw(c, t, cam_pos, hero_pos):
    i = c['i']
    t_on = RUNWAY[i]
    center = np.pi / 2 if c['side'] < 0 else -np.pi / 2
    k1 = ease_io((t - t_on - 0.3) / 0.45)
    yaw = center + np.angle(np.exp(1j * (0.0 - center))) * k1
    if t >= REVEAL:
        tc = face_toward(c['pos'], cam_pos)
        k2 = ease_io((t - REVEAL) / 0.15)
        yaw = yaw + np.angle(np.exp(1j * (tc - yaw))) * k2
    return yaw


def st_dark(t, **kw):
    st = st_world(t, t, glass=glass_state(t, light=1.0))
    st['lamp_level'] = np.zeros(NL)
    st['neon'] = 0.08
    st['win_level'] = 0.05
    st['ambient'] = np.array([0.08, 0.025, 0.04])
    st['char_amb'] = np.array([0.12, 0.06, 0.08])
    st['rim'] = np.array([1.0, 0.25, 0.3])
    st['lamp_col'] = hexc('e8f4ff')
    st['extra_lights'] = [([0.0, LIGHT_Y, z_end(t) - 2.0], RED, 3.0, 40.0)]
    st.update(kw)
    return st


def frame_s3(t):
    zh = Z3
    hero = np.array([H_X, 0, zh])
    p = dict(t=t, vignette=0.45)
    st = st_dark(t, lamp_level=runway_levels(t))
    if t < RUNWAY[0]:
        k = (t - LIGHTS_OUT) / (RUNWAY[0] - LIGHTS_OUT)
        cam = Camera([0.55, 1.2, zh - 2.6 + 0.4 * ease_io(k)], yaw=-0.03, pitch=0.06, f=230)
        if t - LIGHTS_OUT < 0.1:
            p['white'] = 0.3
    elif t < REVEAL:
        k = ease_io((t - RUNWAY[0]) / (REVEAL - RUNWAY[0]))
        cam = Camera([lerp(0.5, 0.25, k), lerp(1.4, 3.0, k), lerp(zh - 3.0, zh - 4.4, k)], yaw=-0.02,
                     pitch=lerp(0.0, -0.11, k), f=230)
    else:
        k = ease_io((t - REVEAL) / (SIL_B[0] - REVEAL))
        z0c = zh - 2.6
        cz = lerp(z0c, zh - 6.2, k)
        f = 235.0 * (zh - cz) / (zh - z0c)
        cy = 1.7
        alpha = np.arctan2(1.05 - cy, zh - cz)
        cam = Camera([0.3, cy, cz], yaw=0.0, pitch=alpha + np.arctan(0.12 * H / f), f=f)
        p['vignette'] = 0.55
    ctx = world3(cam, st, t)
    eyes = []
    for c in COPIES:
        if t < RUNWAY[c['i']]:
            continue
        age = t - RUNWAY[c['i']]
        if age < 0.15 and int(age * 60) % 2 == 1:
            continue
        yaw = copy_yaw(c, t, cam.pos, hero)
        lvl = 2.4 + (2.0 if t >= REVEAL else 0.0)
        if t < SIL_B[0]:
            ghost(ctx, c['pos'], yaw, t, lvl=lvl, glitch=0.6 if age < 0.15 else 0.0, seed=int(t * 30) + c['i'])
        eyes.append((c['pos'], yaw))
    E.draw_character(ctx, dict(walk=0.0, breath=t * 2.4, shrug=0.3 * (t > REVEAL)), hero, 0.0, head_look=(0.0, 0.1))
    img = compose3(ctx, t, dens=0.028)
    for pos, yw in eyes:
        ghost_eyes(img, cam, pos, yw, 1.6 if t >= SIL_B[0] else 0.5)
    red_glow(img, cam, t, 1.0 + (0.4 * np.sin(t * 6) if t > 31 else 0))
    if REVEAL <= t < REVEAL + 0.1:
        p['white'] = 0.3
        p['ca'] = 2
    if 31.4 < t < SIL_B[0]:
        p['ca'] = 1
    if t >= SIL_B[0]:
        p['exposure'] = 0.8
    return finish3(img, p, t)


# ================================================================ scene 4: the sprint
_BLOCKS = []
_rng = np.random.default_rng(99)
for i in range(110):
    t0 = bar_t(1) + i * (SIL_C[0] - bar_t(1)) / 110
    bw, bh = int(_rng.integers(8, 30)), int(_rng.integers(8, 26))
    bx = int(_rng.integers(0, W - bw))
    by = int(_rng.integers(0, int(H * 0.6)))
    if 85 < bx < 160 and by > 150:
        bx = (bx + 110) % (W - bw)
    _BLOCKS.append((bx, by, bw, bh, t0, float(_rng.uniform(150, 420))))

_STILLS = {}


def still(i):
    if i not in _STILLS:
        import story
        import story2
        fns = [lambda: story.frame_screen(49.0), lambda: story.frame_scene3(31.0),
               lambda: story2.frame_ring(50.3), lambda: story2.frame_s2(13.5)]
        _STILLS[i] = fns[i]()
    return _STILLS[i]


def st_sprint(t):
    st = st_world(t, t, glass=glass_state(t, light=1.0))
    ke = kick_env(t)
    bar = int((t - DROP) // BAR)
    lv = np.zeros(NL)
    for k in range(NL):
        lv[k] = 0.55 + 0.75 * ke
        if hash1(int(t / (BEAT / 2)) * 13 + k, 21) < 0.2:
            lv[k] = 0.05
    st['lamp_level'] = lv
    st['lamp_col'] = RED if bar % 2 == 0 else np.array([1.0, 0.25, 0.75])
    st['ambient'] = np.array([0.12, 0.04, 0.08])
    st['char_amb'] = np.array([0.16, 0.08, 0.12])
    st['rim'] = np.array([1.0, 0.25, 0.4])
    st['fill_col'] = np.array([0.6, 0.3, 0.4])
    st['neon'] = 0.7 + 0.5 * ke
    st['win_level'] = 0.4 + 0.6 * ke
    return st


def frame_s4(t):
    if t >= SIL_C[0]:
        return frame_glass(t)
    for i, ts in enumerate(FLASH_STILLS):
        if ts <= t < ts + 2 / 30 + 1e-6:
            img = still(i)
            p = dict(t=t, glitch=0.6, seed=int(t * 60), ca=3, invert=0.25 if i % 2 else 0.0, vignette=0.0)
            return quantize(E.post(img, p))
    zh = hero_z(t)
    xh = hero_x(t)
    shot, t0 = 'A', DROP
    for a, b, s in CUTS:
        if a <= t < b:
            shot, t0 = s, a
    ke = kick_env(t)
    se = snare_env(t)
    prog = (t - DROP) / (SIL_C[0] - DROP)
    rng = np.random.default_rng(int(t * 30))
    shake = (0.02 + 0.05 * prog) * ke
    dt = t - t0
    st = st_sprint(t)
    pose = dict(phase=walk_phase(zh * 0.7), run=1.0)
    if shot in ('A', 'L'):
        cam = Camera([xh + 0.3 + rng.normal() * shake, 1.5 + rng.normal() * shake, zh - 3.0],
                     yaw=-0.02, pitch=0.03, roll=0.05 * np.sin(t * 1.7) * prog, f=220 * (1 + 0.05 * ke))
    elif shot == 'B':
        cam = Camera([xh + 0.4 + rng.normal() * shake, 1.5, zh + 2.6], yaw=np.pi + 0.06, pitch=0.03,
                     roll=-0.04 * prog, f=235 * (1 + 0.04 * ke))
    else:
        cam = Camera([-2.5, 1.3 + rng.normal() * shake, zh + 0.2], yaw=np.pi / 2, pitch=0.0, f=215 * (1 + 0.04 * ke))
    ctx = world3(cam, st, t)
    eyes = []
    for c in COPIES:
        pos = c['pos'].copy()
        dz = pos[2] - zh
        yaw = face_toward(pos, [xh, 0, zh])
        reach = clamp(1 - abs(dz) / 3.0)
        extra = None
        if reach > 0:
            extra = dict(arm_R=(0.3 + 1.2 * reach, 0.2, 0.2), arm_L=(0.3 + 1.1 * reach, 0.2, 0.25))
        if shot == 'L' and 0 < dz < 9:
            pos[0] *= 1 - 0.6 * ease_in((t - t0) / BEAT)
        ghost(ctx, pos, yaw, t, extra=extra, glitch=0.15 + 0.3 * prog, seed=int(t * 30) + c['i'])
        eyes.append((pos, yaw))
    E.draw_character(ctx, pose, [xh, 0, zh], 0.0, face=dict(brow=0.9, mouth=0.4), fill=0.5)
    img = compose3(ctx, t, fog=np.array([0.16, 0.04, 0.09]), dens=0.022)
    for pos, yw in eyes:
        ghost_eyes(img, cam, pos, yw, 0.8)
    red_glow(img, cam, t, 1.0 + 0.5 * ke)
    p = dict(t=t, vignette=0.5, warp=0.15 + 0.8 * prog * (0.6 + 0.4 * ke), ca=int(1 + 2 * ke + 2 * prog),
             zoom=1 + 0.035 * ke, glitch=0.35 * se + (0.25 if dt < 0.05 else 0), seed=int(t * 30),
             crumble=dict(t=t, blocks=[b for b in _BLOCKS if b[4] <= t]))
    if dt < 1 / 30 + 1e-6:
        p['invert'] = 0.5
    return finish3(img, p, t)


# ================================================================ the glass, the face
def face_params(t):
    lvl = sstep(FACE_ON + 0.2, FACE_ON + 1.6, t)
    blink = 1.0 if 48.55 < t < 48.68 or 51.9 < t < 52.0 else 0.0
    scale = 1.0 + 0.22 * sstep(D4, ZOOM, t)
    return lvl, blink, scale


def frame_glass(t):
    p = dict(t=t, vignette=0.45)
    lvl, blink, scale = face_params(t)
    rev = 0.0 if t < FACE_ON else sstep(FACE_ON, FACE_ON + 0.35, t)
    ripples = []
    if t >= PRESS:
        ripples = [(0.22, 1.55, t - PRESS)]
    g = glass_state(t, light=1.0, reveal=rev, face=lvl, scale=scale, blink=blink, ripples=ripples)
    st = st_world(t, t, glass=g)
    st['lamp_level'] = np.zeros(NL)
    near = [k for k in range(NL) if Z_G - 14 < LAMP_Z[k] < Z_G - 1]
    for k in near:
        st['lamp_level'][k] = 0.35 * rev
    st['lamp_col'] = hexc('bfefff')
    st['neon'] = 0.15
    st['win_level'] = 0.15
    st['ambient'] = np.array([0.05, 0.06, 0.09])
    st['char_amb'] = np.array([0.1, 0.12, 0.16])
    st['rim'] = np.array([0.4, 0.85, 1.0])
    st['fill_col'] = np.array([0.4, 0.6, 0.7])
    st['extra_lights'] = [([0.0, 9.0, Z_END3 - 1.5], CYAN, 3.2 * lvl, 9.0),
                          ([0.0, LIGHT_Y, Z_END3 - 1.0], RED, 2.0, 25.0)]
    zh = hero_z(t)
    hero = [0.0, 0, zh]
    hero_pose = dict(walk=0.0, breath=t * 2.6)
    face = dict(gaze=(0, 0.3), brow=0.7, glint=1.0)
    head = (0.0, 0.32)
    hero_yaw = 0.0
    if t < FACE_ON:
        cam = Camera([0.35, 1.0, zh - 2.2], yaw=0.0, pitch=0.12, f=220)
        if t < SIL_C[0] + 0.07:
            p['glitch'] = 0.8
            p['seed'] = int(t * 60)
        p['exposure'] = 0.85
    elif t < D2:
        k = ease_io((t - FACE_ON) / 2.6)
        cam = Camera([0.35 - 0.2 * k, lerp(1.0, 0.8, k), zh - 2.2 - 0.3 * k], yaw=0.0, pitch=lerp(0.12, 0.62, k),
                     f=lerp(220, 205, k))
        if t - FACE_ON < 0.12:
            p['white'] = 0.35 * (1 - (t - FACE_ON) / 0.12)
    elif t < D3:
        k = (t - D2) / (D3 - D2)
        cam = Camera([0.0, 1.7, zh], yaw=0.0, pitch=0.47 * scale + 0.07 * scale, f=lerp(640, 720, k))
    elif t < D4:
        k = (t - D3) / (D4 - D3)
        cam = Camera([0.05, 1.5, zh + 0.95], yaw=np.pi, pitch=0.2, f=lerp(270, 290, k))
        face = dict(gaze=(0.0, 0.4), brow=0.5, glint=1.2)
        head = (0.0, 0.4)
        st['extra_lights'][0] = ([0.0, 9.0, Z_END3 - 1.5], CYAN, 2.0 * lvl, 9.0)
    else:
        k = (t - D4) / (ZOOM - D4)
        cam = Camera([-1.9, 1.5, Z_END3 - 2.3], yaw=0.62, pitch=0.16, f=220)
        press = sstep(PRESS - 0.5, PRESS, t)
        hero_pose.update(arm_R=(0.2 + 1.3 * press, 0.05, 0.25 - 0.2 * press), walk=0.5 * (1 - press),
                         phase=walk_phase(zh))
        face = dict(gaze=(0, 0.3), brow=0.3, glint=1.2)
    ctx = world3(cam, st, t)
    E.draw_character(ctx, hero_pose, hero, hero_yaw, face=face, head_look=head, fill=0.4,
                     rim=np.array([0.4, 0.85, 1.0]))
    img = compose3(ctx, t, dens=0.02, vol=False)
    red_glow(img, cam, t, 1.0)
    p['glitch'] = p.get('glitch', 0) + 0.3 * snare_env(t) * (t >= FACE_ON)
    p['seed'] = int(t * 30)
    p['zoom'] = 1.0 + 0.02 * kick_env(t)
    if t >= D4:
        p['ca'] = int(2 * sstep(D4, ZOOM, t))
    return finish3(img, p, t)


# ================================================================ scene 5: through the glass
OUT_CAM = np.array([0.05, 1.62, Z_END3 + 0.45])
HERO5 = np.array([0.05, 0.0, Z_END3 - 0.5])


def punch_arm(t):
    """Arm pose of the hero behind the glass: hand pressed, pulled back, punches."""
    pressed = (1.5, 0.05, 0.05)
    back = (-0.25, 0.15, 1.9)
    if t < 56.7:
        return pressed
    if t < PUNCH1 - 0.07:
        k = ease_io((t - 56.7) / (PUNCH1 - 0.07 - 56.7))
    elif t < PUNCH1:
        k = 1 - (t - (PUNCH1 - 0.07)) / 0.07
    elif t < 57.55:
        k = 0.0
    elif t < PUNCH2 - 0.06:
        k = ease_io((t - 57.55) / (PUNCH2 - 0.06 - 57.55))
    elif t < PUNCH2:
        k = 1 - (t - (PUNCH2 - 0.06)) / 0.06
    else:
        k = 0.0
    return tuple(lerp(np.array(pressed), np.array(back), k))


def fist_screen(cam, arm):
    prims, head_c, hr, Hh = puppet.build(dict(walk=0.0, arm_R=arm))
    caps = [pr for pr in prims if pr[0] == 'sph' and pr[3] == puppet.SKIN and pr[2] < 0.06]
    if not caps:
        return W / 2, H / 2
    hand = max(caps, key=lambda pr: pr[1][2])[1]
    # hero faces +z (yaw 0); local -> world
    Pw = HERO5 + hand
    x, y, z = cam.project(Pw)
    return float(x), float(y)


def frame_s5(t):
    global CRACK1, CRACK2
    p = dict(t=t, vignette=0.3)
    if t < THROUGH[1]:
        # through the glass
        u = ease_io((t - THROUGH[0]) / (THROUGH[1] - THROUGH[0]))
        P0 = np.array([-1.9, 1.5, Z_END3 - 2.3])
        P1 = np.array([-1.5, 1.55, Z_END3 + 0.5])
        P2 = OUT_CAM
        pos = (1 - u) ** 2 * P0 + 2 * (1 - u) * u * P1 + u * u * P2
        tgt = HERO5 + np.array([0.0, 1.45, 0.0])
        yaw = face_toward(pos, tgt)
        cam = Camera(pos, yaw=yaw, pitch=lerp(0.16, 0.0, u), f=lerp(220, 235, u))
        outside = pos[2] > Z_END3
        lvl, blink, scale = face_params(t)
        g = glass_state(t, light=1.0, reveal=1.0, face=lvl, scale=scale, ripples=[(0.22, 1.55, t - PRESS)])
        st = st_glass_light(t, g)
        ctx = world3(cam, st, t, outside=outside)
        E.draw_character(ctx, dict(walk=0.0, arm_R=(1.5, 0.05, 0.05), breath=t * 2.6), HERO5, 0.0,
                         face=dict(gaze=(0, 0), brow=0.3), fill=0.45, rim=np.array([0.4, 0.85, 1.0]))
        img = compose3(ctx, t, dens=0.02, vol=False)
        if not outside:
            red_glow(img, cam, t, 1.0)
        if abs(pos[2] - Z_END3) < 0.25:
            p['glitch'] = 0.8
            p['seed'] = int(t * 60)
            p['white'] = 0.25
        p['ca'] = 2
        return finish3(img, p, t)
    cam = Camera(OUT_CAM + np.array([0.0, 0.01 * np.sin(t * 2.1), 0.0]), yaw=np.pi, pitch=0.0, f=235)
    if t >= SIL_D[0]:
        base = np.full((H, W, 3), 0.75 * (1 - (t - SIL_D[0]) / 0.3) + 0.2) * np.array([0.9, 0.97, 1.0])
        cr = [(CRACK1, 1.0), (CRACK2, 1.0)]
        img = draw_cracks(base, cr, alpha=1.0, glow_k=0.0)
        img[draw_cracks(np.zeros((H, W, 3)), cr, 1.0, 0.0).mean(2) > 0.5] = np.array([0.15, 0.2, 0.3])
        return quantize(img)
    arm = punch_arm(t)
    st = st_glass_light(t, None)
    ctx = world3(cam, st, t, outside=True)
    eyes = []
    for c in COPIES:
        yaw = face_toward(c['pos'], cam.pos)
        ghost(ctx, c['pos'], yaw, t, lvl=3.0)
        eyes.append((c['pos'], yaw))
    E.draw_character(ctx, dict(walk=0.0, arm_R=arm, breath=t * 3.0, shrug=0.2), HERO5, 0.0,
                     face=dict(gaze=(0, 0), brow=0.9 if t > 56.7 else 0.3, mouth=0.2 if t > PUNCH1 else 0.0, glint=0.8),
                     fill=0.6, rim=np.array([0.4, 0.85, 1.0]))
    img = compose3(ctx, t, dens=0.02)
    for pos, yw in eyes:
        ghost_eyes(img, cam, pos, yw, 0.7)
    # the glass we are looking through: our own screen
    sheen = ((_XX * 0.35 + _YY * 0.2 + t * 3) % 60) < 2
    img[sheen] += 0.025
    if CRACK1 is None:
        fx, fy = fist_screen(cam, (1.5, 0.05, 0.05))
        CRACK1 = make_crack(fx, fy, 11, 140)
        CRACK2 = make_crack(fx * 0.5 + W * 0.25, fy * 0.6 + H * 0.2, 23, 330)
    cracks = []
    if t >= PUNCH1:
        cracks.append((CRACK1, (t - PUNCH1) / 0.3))
    if t >= PUNCH2:
        cracks.append((CRACK2, (t - PUNCH2) / 0.35))
    if t < PUNCH1:
        # glowing palm print
        fx, fy = fist_screen(cam, (1.5, 0.05, 0.05))
        r2 = (_XX - fx) ** 2 + (_YY - fy) ** 2
        ring = np.abs(np.sqrt(r2) - ((t - PRESS) * 40) % 30) < 1.0
        img[ring & (r2 < 900)] += CYAN * 0.4
    for tp in (PUNCH1, PUNCH2):
        if tp <= t < tp + 0.1:
            p['white'] = 0.45 * (1 - (t - tp) / 0.1)
            p['zoom'] = 1.04
    if HAND[0] - 0.3 <= t:
        p['white'] = max(p.get('white', 0), 0.9 * sstep(HAND[1] - 0.25, SIL_D[0], t))
    p['glitch'] = 0.2 * snare_env(t) + (0.4 if PUNCH2 <= t < PUNCH2 + 0.1 else 0)
    p['seed'] = int(t * 60)

    def overlay(im):
        im = draw_cracks(im, cracks)
        if t >= HAND[0]:
            im = hand_through(im, t, CRACK2['cx'], CRACK2['cy'])
        return im
    return finish3(img, p, t, overlay)


def st_glass_light(t, g):
    st = st_world(t, t, glass=g) if g is not None else st_world(t, t)
    st['lamp_level'] = np.zeros(NL)
    for k in RUNWAY_K:
        st['lamp_level'][k] = 0.6
    st['lamp_col'] = hexc('bfefff')
    st['neon'] = 0.2
    st['win_level'] = 0.2
    st['ambient'] = np.array([0.05, 0.06, 0.09])
    st['char_amb'] = np.array([0.1, 0.12, 0.16])
    st['fill_col'] = np.array([0.45, 0.65, 0.75])
    st['extra_lights'] = [([0.0, 3.0, Z_END3 + 2.5], CYAN, 1.3, 5.0)]
    return st


# ================================================================ dispatcher
def sub_overlay(img, t):
    for (a, b, lines) in SUBS:
        if a <= t < b:
            n = int((t - a) * TYPE_CPS) + 1
            jit = 0
            if b - t < 0.12:
                jit = int(hash1(int(t * 60), 9) * 6 - 3)
            if t - a < 0.06:
                jit = int(hash1(int(t * 60), 4) * 4 - 2)
            draw_subtitle(img, lines, nchars=n, center_y=352, jitter=jit)


def render_frame(t):
    global CRACK1, CRACK2
    if CRACK1 is None:
        cam = Camera(OUT_CAM, yaw=np.pi, pitch=0.0, f=235)
        fx, fy = fist_screen(cam, (1.5, 0.05, 0.05))
        CRACK1 = make_crack(fx, fy, 11, 140)
        CRACK2 = make_crack(fx * 0.5 + W * 0.25, fy * 0.6 + H * 0.2, 23, 330)
    if t < S1_END:
        q = frame_obs(t, t)
    elif t < LIGHTS_OUT:
        q = frame_s2(t)
    elif t < DROP:
        q = frame_s3(t)
    elif t < ZOOM:
        q = frame_s4(t)
    elif t < POV2:
        q = frame_s5(t)
    else:
        q = frame_obs(t, t - DURATION)
    sub_overlay(q, t)
    return (np.clip(q, 0, 1) * 255).astype(np.uint8)
