"""The film: every shot of the 68 s story, as a pure function of time."""
import numpy as np
from scipy import ndimage
from core import (W, H, Camera, hexc, clamp, sstep, lerp, ease_io, ease_in, ease_out,
                  hash1, hash2, quantize, bloom, draw_subtitle, DURATION, BEAT, BAR, DROP, bar_t,
                  PALETTE, smoothstep)
from world import World, Lights
import engine as E
import puppet
from timeline import *

V = 1.25          # walking speed (units / s)
STRIDE = 0.62

WA = World('A')
WB = World('B')
WB.end_near = 2.0
WB.end_far = 80.0
NL = len(WA.lamps)
LAMP_Z = np.array([L['z'] for L in WA.lamps])
B_LAMPS_ORDER = [k for k in range(NL) if 18 <= LAMP_Z[k] <= 63]    # the 8 lamps of S3b
B_REVEAL_LAMP = int(np.argmin(np.abs(LAMP_Z - 68)))
SIL_Z = 66.6
SIL_X = 1.4

FOG_A = np.array([0.11, 0.045, 0.16])
FOG_B = np.array([0.10, 0.13, 0.14])
DOOR_Z = 13.0


# ================================================================ helpers
def walk_phase(pos):
    return pos / STRIDE * np.pi


def flick_on(t, t_on, seed=0):
    """Lamp ignition with a short neon stutter."""
    d = t - t_on
    if d < 0:
        return 0.0
    if d > 0.22:
        return 1.0
    pat = [1, 0, 0.6, 0, 1, 0.2, 1, 1]
    return float(pat[int(d / 0.028) % len(pat)])


def hero_A_pos(s):
    """Hero position on the loop clock s (scene 1 and the final loop)."""
    se, L = -2.5, 1.5
    if s >= se:
        return V * s
    if s >= se - L:
        return V * se - V / (2 * L) * (L * L - (s - se + L) ** 2)
    return V * se - V * L / 2


def hero_A_speed(s):
    se, L = -2.5, 1.5
    if s >= se:
        return V
    if s >= se - L:
        return V * (s - (se - L)) / L
    return 0.0


def cam_s1(s):
    p = hero_A_pos(s)
    x = 0.35 + 0.12 * np.sin(0.8 * s)
    y = 2.05 + 0.04 * np.sin(1.7 * s)
    dist = 3.7
    pitch = -0.13
    roll = 0.012 * np.sin(0.6 * s)
    yaw = 0.025 * np.sin(0.45 * s)
    f = 235.0
    if s > 0:
        k = sstep(0, S1_END, s)
        dist -= 1.15 * k
        y -= 0.32 * k
        pitch += 0.055 * k
        x -= 0.12 * k
    return Camera([x, y, p - dist], yaw=yaw, pitch=pitch, roll=roll, f=f)


def st_A(s, **kw):
    st = dict(t=s, rain=1.0, tower=tower_blink(s), neon=1.0, eye_open=0.12,
              lamp_level=np.ones(NL), ambient=np.array([0.10, 0.075, 0.17]))
    # broken lamp flicker
    lv = st['lamp_level']
    k = int(np.argmin(np.abs(LAMP_Z - 26)))
    lv[k] = 1.0 if hash1(int(s * 11) + 1000, 3) > 0.35 else 0.15
    st['blade_flick'] = {2: 1.0 if hash1(int(s * 9) + 77, 5) > 0.2 else 0.3}
    st.update(kw)
    return st


MOON = ([40.0, 70.0, 140.0], np.array([0.55, 0.7, 0.8]), 0.42, 1000.0)


def st_B(t, **kw):
    st = dict(t=t, rain=0.0, neonB=0.0, lamp_level=np.zeros(NL), power_z=-1e9,
              ambient=np.array([0.12, 0.155, 0.17]), char_amb=np.array([0.13, 0.16, 0.17]),
              rim=np.array([0.35, 0.55, 0.6]), fill_col=np.array([0.45, 0.55, 0.6]),
              extra_lights=[MOON])
    st.update(kw)
    return st


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


# ================================================================ face texture
FACE_LIGHT = None


def face_texture(t, gaze=(0.0, -0.5), blink=0.0, glint=0.0, mouth=0.0, glitch=0.0, size=(90, 160), seed=0):
    tw, th = size
    tex = np.zeros((th, tw, 3))
    yy = np.arange(th)[:, None] / th
    tex[:] = np.array([0.02, 0.05, 0.12]) * (1 - yy[..., None] * 0.5)
    ppu = 300.0 * tw / 90
    ax = tw / 2
    ay = th * 0.43 + 1.60 * ppu
    pose = dict(walk=0.0)
    spr = puppet.raster(pose, np.pi, ppu, ax, ay, head_look=(0.0, 0.0),
                        face=dict(gaze=gaze, blink=blink, glint=glint, mouth=mouth, brow=0.4),
                        window=(0, 0, tw, th))
    if spr is not None:
        hit = spr['hit']
        n = spr['n'][hit]
        key = np.array([-0.5, 0.45, -0.75])
        key /= np.linalg.norm(key)
        rimd = np.array([0.8, 0.2, 0.4])
        L = 0.28 + 1.0 * np.clip(n @ key, 0, 1) + 0.6 * np.clip(n @ rimd, 0, 1) ** 2
        lum = np.round(L * 3) / 3
        col = spr['alb'][hit] * lum[:, None] * np.array([0.85, 1.0, 1.1]) + spr['emi'][hit]
        col += np.clip(n @ rimd, 0, 1)[:, None] ** 3 * np.array([0.9, 0.2, 0.7]) * 0.6
        img = np.zeros((spr['h'], spr['w'], 3))
        img[hit] = col
        edge, outline = puppet.edges_and_outline(spr)
        img[edge] *= 0.4
        x0, y0 = spr['x0'], spr['y0']
        sub = tex[y0:y0 + spr['h'], x0:x0 + spr['w']]
        sub[hit[:sub.shape[0], :sub.shape[1]]] = img[:sub.shape[0], :sub.shape[1]][hit[:sub.shape[0], :sub.shape[1]]]
        sub[outline[:sub.shape[0], :sub.shape[1]]] = np.array([0.0, 0.01, 0.03])
    # scanlines + monitor tint
    tex[1::2] *= 0.82
    tex = tex * np.array([0.8, 1.05, 1.15]) + np.array([0.0, 0.02, 0.04])
    if glitch > 0:
        rng = np.random.default_rng(seed)
        for _ in range(int(2 + glitch * 10)):
            y0 = rng.integers(0, th - 3)
            hh = rng.integers(1, 8)
            tex[y0:y0 + hh] = np.roll(tex[y0:y0 + hh], rng.integers(-12, 12), axis=1)
            if rng.random() < 0.4:
                tex[y0:y0 + hh] = tex[y0:y0 + hh][..., [1, 2, 0]] * 1.3
    return tex * 1.25


# ================================================================ visor & hands
_YY, _XX = np.mgrid[0:H, 0:W]
_U = (_XX + 0.5 - W / 2) / (W / 2)
_Vv = (_YY + 0.5 - H / 2) / (H / 2)
_VD = np.maximum.reduce([np.abs(_U) / 0.93, np.abs(_Vv) / 0.92, (np.abs(_U) * 0.78 + np.abs(_Vv) * 0.66) / 1.0])


def visor(img, t, amt, s_clock=None, box=None, seed=0):
    if amt <= 0:
        return img
    out = img.copy()
    s = 1.0 + (1 - amt) * 0.6
    inside = _VD < s
    outside = ~inside
    tex = 0.025 + 0.015 * ((_XX // 3 + _YY // 3) % 2)
    out[outside] = np.array([0.02, 0.008, 0.03]) + tex[outside, None] * np.array([0.6, 0.3, 0.9])
    edge = (_VD >= s - 0.012) & (_VD < s + 0.004)
    edge2 = (_VD >= s - 0.045) & (_VD < s - 0.037)
    out[edge] = np.array([1.0, 0.12, 0.25]) * 1.2
    out[edge2] = out[edge2] * 0.5 + np.array([0.5, 0.05, 0.15]) * 0.6
    # inner red vignette + scanlines
    vig = clamp((_VD - (s - 0.35)) / 0.35)
    out[inside] = out[inside] * (1 - 0.35 * vig[inside, None]) + (vig[inside, None] * np.array([0.25, 0.0, 0.05]))
    sl = (_YY % 2 == 1) & inside
    out[sl] *= 1 - 0.12 * amt
    # blinking red dot (top-left), rhythm of the radio-mast light
    sc = t if s_clock is None else s_clock
    if tower_blink(sc) > 0 and amt > 0.6:
        cx, cy = int(W * 0.17), int(H * 0.14)
        m = (_XX - cx) ** 2 + (_YY - cy) ** 2 <= 9
        out[m] = np.array([1.0, 0.1, 0.15]) * 1.5
    # tiny signal bars (top-right)
    if amt > 0.6:
        bx, by = int(W * 0.78), int(H * 0.15)
        for k in range(4):
            hgt = 2 + 2 * k
            on = k < 1 + int((t * 3) % 4)
            out[by - hgt:by, bx + k * 3:bx + k * 3 + 2] = np.array([1.0, 0.2, 0.3]) if on else np.array([0.25, 0.05, 0.08])
        # bottom tick ruler
        ry = int(H * 0.86)
        for k in range(-9, 10):
            x = int(W / 2 + k * 6 + (t * 18) % 6)
            if 0 <= x < W:
                hh = 4 if k % 3 == 0 else 2
                out[ry - hh:ry, x] = np.array([0.8, 0.15, 0.25])
    # target brackets
    if box is not None and amt > 0.5:
        x0, y0, x1, y1 = [int(v) for v in box]
        c = np.array([1.0, 0.95, 0.95]) if int(t * 8) % 2 == 0 else np.array([1.0, 0.2, 0.3])
        L = 6
        for (cx, cy, sx, sy) in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
            for k in range(L):
                for (px, py) in ((cx + sx * k, cy), (cx, cy + sy * k)):
                    if 0 <= px < W and 0 <= py < H:
                        out[py, px] = c
    return out


def seg_mask(x0, y0, x1, y1, r0, r1):
    dx, dy = x1 - x0, y1 - y0
    L2 = dx * dx + dy * dy + 1e-9
    s = clamp(((_XX + 0.5 - x0) * dx + (_YY + 0.5 - y0) * dy) / L2)
    px, py = x0 + s * dx, y0 + s * dy
    d = np.hypot(_XX + 0.5 - px, _YY + 0.5 - py)
    return d < (r0 + (r1 - r0) * s)


def hands(img, t, amt, seed=0):
    """The observer's own dark hands rising from the bottom of the frame."""
    if amt <= 0:
        return img
    out = img
    mask = np.zeros((H, W), bool)
    for sgn in (-1, 1):
        base_x = W / 2 + sgn * W * 0.42
        wx = W / 2 + sgn * W * (0.30 - 0.04 * amt)
        wy = H * (1.12 - 0.27 * amt) + 3 * np.sin(t * 2.1 + sgn)
        mask |= seg_mask(base_x, H + 30, wx, wy, 22, 13)
        # palm
        mask |= ((_XX - wx) / 15.0) ** 2 + ((_YY - (wy - 6)) / 13.0) ** 2 < 1
        curl = 0.25 + 0.2 * np.sin(t * 1.3 + sgn * 0.7)
        for k in range(4):
            ang = -np.pi / 2 - sgn * (0.15 + k * 0.28)
            L1 = 24 + 6 * (1 - abs(k - 1.5) / 1.5)
            fx0 = wx + np.cos(ang) * 8
            fy0 = wy - 10 + np.sin(ang) * 3
            fx1 = fx0 + np.cos(ang) * L1
            fy1 = fy0 + np.sin(ang) * L1
            a2 = ang - sgn * curl
            fx2 = fx1 + np.cos(a2) * L1 * 0.7
            fy2 = fy1 + np.sin(a2) * L1 * 0.7
            mask |= seg_mask(fx0, fy0, fx1, fy1, 3.2, 2.6)
            mask |= seg_mask(fx1, fy1, fx2, fy2, 2.6, 1.6)
        # thumb
        mask |= seg_mask(wx - sgn * 10, wy - 2, wx - sgn * 22, wy - 16, 3.5, 2.3)
    up = np.zeros_like(mask)
    up[1:] = mask[:-1]
    rim = mask & ~np.roll(mask, 2, axis=0)
    out = out.copy()
    out[mask] = np.array([0.025, 0.012, 0.04])
    out[rim] = np.array([0.35, 0.25, 0.9])
    edge = mask & ~ndimage.binary_erosion(mask)
    out[edge & ~rim] = np.array([0.12, 0.04, 0.2])
    return out


# ================================================================ world frame
def finish_frame(img_float, p, t):
    img = bloom(img_float, threshold=p.get('bloom_th', 0.5), strength=p.get('bloom', 0.85))
    img = E.post(img, p)
    q = quantize(img, amount=p.get('dither', 0.07))
    return q


def base_world(world, cam, st, mask=None, props=True):
    ctx = E.render_world(world, cam, st, mask=mask)
    if props:
        E.draw_lamps(ctx)
        E.draw_cables(ctx)
    return ctx


def compose_float(ctx, fog, dens, vol=True, rain=0.0, t=0.0):
    if vol:
        E.volumetrics(ctx)
    E.apply_fog(ctx, fog, dens)
    if rain > 0:
        E.rain_fast(ctx, t, rain)
    return ctx.col + ctx.emis_extra


# ----------------------------------------------------------------- scene 1 / loop
def hero_pose_A(s):
    sp = hero_A_speed(s)
    return dict(phase=walk_phase(hero_A_pos(s)), walk=sp / V)


def details_A(ctx, s, t_abs):
    """Hidden details of the first street."""
    # cat on the blade sign (A-frame)
    cols = {'k': np.array([0.01, 0.005, 0.02]), 'E': np.array([1.0, 0.95, 0.3]) * 1.4}
    blink = hash1(int(s * 4) + 5, 2) > 0.9
    E.draw_template(ctx, E.CAT, [2.55, 5.2, 24.0], 0.42, cols, emis_keys=('E',), blink=blink)
    # security camera on the left wall following the hero
    cc = {'g': np.array([0.35, 0.36, 0.45]), 'G': np.array([0.1, 0.1, 0.12]), 'k': np.array([0.06, 0.05, 0.08]),
          'R': np.array([1.0, 0.1, 0.15]) * (1.6 if tower_blink(s + 0.3) else 0.3)}
    E.draw_template(ctx, E.SECCAM, [-2.85, 3.35, 9.5], 0.3, cc, flip=True)


def hidden_watcher(ctx, s, z=40.0, x=0.45):
    ph = (s - 1.6) / 1.8
    if 0 <= ph <= 1:
        gl = 0.6 if (ph < 0.15 or ph > 0.85) else 0.0
        if hash1(int(s * 30), 8) > 0.15:
            E.draw_character(ctx, dict(sil=True, walk=0, eye_lvl=2.5), [x, 0, z], np.pi, reflect=False,
                             glitch=gl, seed=int(s * 30), rim=np.array([0.5, 0.1, 0.3]))


def frame_scene1(t, s, extra=None):
    cam = cam_s1(s)
    st = st_A(s)
    ctx = base_world(WA, cam, st)
    details_A(ctx, s, t)
    hidden_watcher(ctx, s)
    E.draw_character(ctx, hero_pose_A(s), [0, 0, hero_A_pos(s)], 0.0)
    img = compose_float(ctx, FOG_A, 0.03, rain=1.0, t=s)
    p = dict(t=t, vignette=0.4)
    if extra:
        p.update(extra)
    return finish_frame(img, p, t)


# ----------------------------------------------------------------- scene 2
def hero_z_s2(t):
    z0 = V * S1_END
    if t < S1_END + 1.0:
        tau = (t - S1_END) / 1.0
        return z0 + V * (tau - tau * tau / 2)
    zs = z0 + V * 0.5
    if t < 13.0:
        return zs
    if t < 16.4:
        return zs + 2.9 * ease_io((t - 13.0) / 3.4)
    if t < 17.3:
        return zs + 2.9
    return zs + 2.9 + 1.7 * (t - 17.3)


def hero_speed_s2(t):
    dt = 1 / 30
    return (hero_z_s2(t + dt) - hero_z_s2(t - dt)) / (2 * dt)


def door_state(t):
    breath = np.cos(2 * np.pi * (t - HEART0) / (2 * BEAT))
    glow = 0.7 + 0.3 * sstep(5.5, 15.5, t) + 0.25 * max(0, breath)
    wob = 0.3 + 1.2 * sstep(10, 16.4, t)
    morph = max(0.0, (t - 6.2) * 0.34)
    eye = sstep(DETAIL[0], DETAIL[0] + 0.25, t) * (1 - sstep(16.0, 16.5, t))
    d = dict(z=DOOR_Z, x=0.0, w=1.2, h=2.4, t=t, breath=breath, glow=glow, wob=wob, morph=morph,
             phi=0.0, eye=eye, white=0.0)
    if SIL_A[0] <= t < DOOR_OPEN:
        d['glow'] = 0.08
        d['breath'] = 0.0
    if t >= DOOR_OPEN:
        k = (t - DOOR_OPEN) / 0.45
        ph = 1.95 * ease_out(k) + 0.08 * np.sin(min(k, 3) * 7) * np.exp(-max(k - 1, 0) * 3) * (k > 1)
        d['phi'] = ph
        d['white'] = max(0.0, 1.2 * np.exp(-(t - DOOR_OPEN) / 0.35))
        d['glow'] = 1.6
        d['morph'] = 0.0
        d['wob'] = 0.0
        d['breath'] = 0.0
    return d


def door_light(t, d):
    c = 0.5 + 0.5 * np.sin(t * 3.66)
    col = np.array([0.2, 0.95, 1.0]) * c + np.array([1.0, 0.3, 0.85]) * (1 - c)
    inten = 3.2 * d['glow'] * (0.8 + 0.25 * max(0, d['breath']))
    if t >= DOOR_OPEN:
        col = np.array([0.85, 0.95, 1.0])
        inten = 2.0 + 14.0 * np.exp(-(t - DOOR_OPEN) / 0.5)
    return ([0.0, 1.3, DOOR_Z - 0.45], col, inten, 3.2)


def lightning(t):
    d = t - S1_END
    if d < 0 or d > 1.2:
        return 0.0, 0.0
    pat = [1.4, 0.3, 1.1, 0.5, 0.9]
    if d < 0.25:
        f = pat[int(d / 0.05)]
    else:
        f = 0.7 * np.exp(-(d - 0.25) / 0.25)
    bolt = 1.0 if d < 0.2 else 0.0
    return f, bolt


def st_A2(t, **kw):
    """World A after the door appeared (t absolute; clocks continue)."""
    st = st_A(t)
    d = door_state(t)
    st['door'] = d
    fl, bolt = lightning(t)
    st['flash'] = fl
    st['bolt'] = bolt
    if t >= DETAIL[0]:
        st['eye_open'] = 1.0
    if DETAIL[0] <= t < DETAIL[1]:
        st['eye_open'] = 1.0 if hash1(int(t * 20), 2) > 0.3 else 0.2
    dl = door_light(t, d)
    st['extra_lights'] = [dl]
    if SIL_A[0] <= t < DOOR_OPEN:
        st['lamp_level'] = np.full(NL, 0.12)
        st['neon'] = 0.15
    st.update(kw)
    return st


def hero_pose_s2(t, z):
    sp = hero_speed_s2(t)
    return dict(phase=walk_phase(z), walk=min(1.0, sp / V))


def frame_scene2(t):
    z = hero_z_s2(t)
    st = st_A2(t)
    pose = hero_pose_s2(t, z)
    p = dict(t=t, vignette=0.45)
    if t < 8.6:
        k = sstep(S1_END, 8.6, t)
        c1 = cam_s1(S1_END)
        dist = lerp(V * S1_END - c1.pos[2], 2.3, k)
        cam = Camera([lerp(c1.pos[0], 0.5, k), lerp(c1.pos[1], 1.85, k), z - dist],
                     yaw=lerp(c1.yaw, -0.02, k), pitch=lerp(c1.pitch, -0.05, k), roll=c1.roll * (1 - k), f=235)
        ctx = base_world(WA, cam, st)
        details_A(ctx, t, t)
        E.draw_character(ctx, pose, [0, 0, z], 0.0, rim=np.array([0.5, 0.7, 1.0]))
    elif t < 12.6:
        k = (t - 8.6) / 4.0
        cam = Camera([-0.25 + 0.1 * k, 1.42, 10.25 - 0.55 * ease_io(k)], yaw=np.pi + 0.04, pitch=0.03, f=250)
        ctx = base_world(WA, cam, st)
        if DETAIL[0] <= t < DETAIL[1] and hash1(int(t * 30), 3) > 0.12:
            E.draw_character(ctx, dict(sil=True, walk=0, eye_lvl=3.0), [-2.0, 0, -7.5], 0.0, reflect=True,
                             glitch=0.5, seed=int(t * 30), rim=np.array([0.6, 0.1, 0.3]))
        blink = 1.0 if 10.25 < t < 10.36 else 0.0
        look = (0.08 * np.sin(t * 0.9), 0.05)
        E.draw_character(ctx, dict(walk=0.0, phase=0.0, arm_L=(0.05, 0.12, 0.25), arm_R=(0.05, 0.12, 0.25)),
                         [0, 0, z], 0.0, head_look=look,
                         face=dict(gaze=(0.0, 0.05), blink=blink, brow=0.6, mouth=0.15 if t > 11.6 else 0.0),
                         rim=np.array([0.3, 0.3, 0.6]), fill=0.5)
        p['vignette'] = 0.5
    else:
        k = (t - 12.6) / 4.4
        cz = z - 2.45
        cam = Camera([0.55 - 0.15 * k, 1.15, cz], yaw=-0.03, pitch=0.07 + 0.02 * k, roll=0.0, f=225)
        shake = sstep(14.5, 16.6, t) * 0.004
        if t < SIL_A[0]:
            cam = Camera(cam.pos + np.array([np.sin(t * 40) * shake * 10, np.sin(t * 33) * shake * 10, 0]),
                         yaw=cam.yaw + np.sin(t * 37) * shake, pitch=cam.pitch, f=cam.f)
        ctx = base_world(WA, cam, st)
        reach = sstep(15.2, 16.4, t)
        pose2 = dict(pose)
        if reach > 0:
            pose2['arm_R'] = (0.2 + 1.1 * reach, 0.1, 0.2)
        E.draw_character(ctx, pose2, [0, 0, z], 0.0, rim=np.array([0.6, 0.6, 1.0]))
        p['zoom'] = 1.0 + 0.04 * sstep(13, 16.6, t)
        p['zoom_c'] = (H * 0.55, W / 2)
        p['ca'] = 1 if (t > 15.5 and t < SIL_A[0]) else 0
    img = compose_float(ctx, FOG_A, 0.03, rain=1.0, t=t)
    if t < 5.75:
        p['white'] = 0.0
    return finish_frame(img, p, t)


# ----------------------------------------------------------------- scene 3
def lamp_levels_B(t):
    lv = np.zeros(NL)
    for i, k in enumerate(B_LAMPS_ORDER):
        lv[k] = flick_on(t, LAMPS_ON[i], k)
    lv[B_REVEAL_LAMP] = 1.8 * flick_on(t, REVEAL, 99)
    # tension flicker near the end of the build
    if t > 31.4 and t < SIL_B[0]:
        amt = sstep(31.4, SIL_B[0], t)
        for k in range(NL):
            if lv[k] > 0 and hash1(int(t * 24) * 31 + k, 6) < amt * 0.6:
                lv[k] *= 0.2
    if SIL_B[0] <= t < DROP:
        lv[:] = 0
    return lv


def power_z(t):
    zs = [LAMP_Z[k] for i, k in enumerate(B_LAMPS_ORDER) if t >= LAMPS_ON[i] + 0.1]
    if not zs:
        return -1e9
    return max(zs) + 4


def st_B3(t):
    lv = lamp_levels_B(t)
    st = st_B(t, lamp_level=lv, power_z=power_z(t))
    st['neonB'] = sstep(LAMPS_ON[4], LAMPS_ON[4] + 0.3, t) * (0.9 + 0.1 * np.sin(t * 50))
    st['eye_open'] = 1.0
    if SIL_B[0] <= t < DROP:
        st['neonB'] = 0.0
        st['power_z'] = -1e9
        st['ambient'] = np.array([0.03, 0.035, 0.045])
    st['screen'] = dict(level=0, standby=0.0)
    if REVEAL <= t < SIL_B[0]:
        # cold backlight washing the far wall: the silhouette becomes a cut-out
        st['extra_lights'] = [MOON, ([-SIL_X, 3.2, 76.5], np.array([0.75, 0.92, 1.0]),
                                     4.5 * flick_on(t, REVEAL, 5), 5.0)]
    return st


def hero_z_s3(t):
    if t < 19.9:
        return hero_z_s2(t)
    z1 = hero_z_s2(19.9)
    return z1 + 0.68 * ease_out((t - 19.9) / 0.9)


def frame_scene3(t):
    p = dict(t=t, vignette=0.45)
    if t < 19.9:
        return frame_portal(t)
    z = hero_z_s3(t)
    stB = st_B3(t)
    if t < REVEAL:
        k = (t - 19.9) / (REVEAL - 19.9)
        cz = lerp(13.2, 12.7, ease_out(min(1, (t - 19.9) / 1.2)))
        cam = Camera([lerp(0.35, 0.15, k), lerp(1.45, 2.25, ease_io(k)), cz - 0.4 * k],
                     yaw=0.03 * np.sin(t * 0.5), pitch=lerp(-0.02, -0.1, ease_io(k)), f=235)
        look = 0.0
        if 20.8 < t < 22.2:
            look = 0.55 * np.sin((t - 20.8) / 1.4 * np.pi)
        elif 22.6 < t < 24.0:
            look = -0.55 * np.sin((t - 22.6) / 1.4 * np.pi)
        sp = 0.68 / 0.9 * max(0, 1 - (t - 19.9) / 0.9) * 3
        pose = dict(phase=walk_phase(z), walk=min(1, sp / V))
        ctx = base_world(WB, cam, stB)
        E.draw_character(ctx, pose, [0, 0, z], 0.0, head_look=(look, 0.0))
        details_B(ctx, t)
    else:
        # dolly zoom on the distant silhouette
        k = ease_io((t - REVEAL) / (SIL_B[0] - REVEAL))
        z0c = 12.3
        cz = lerp(z0c, 4.6, k)
        f = 235.0 * (z - cz) / (z - z0c)
        cy = 1.9
        alpha = np.arctan2(1.0 - cy, z - cz)
        pitch = alpha + np.arctan(0.11 * H / f)
        cam = Camera([0.5, cy, cz], yaw=0.0, pitch=pitch, f=f)
        ctx = base_world(WB, cam, stB)
        E.draw_character(ctx, dict(walk=0.0, phase=0.0, shrug=0.5 * k), [0, 0, z], 0.0, head_look=(0.0, 0.0))
        lvl = 2.0 + 2.0 * k
        if t < SIL_B[0]:
            E.draw_character(ctx, dict(sil=True, walk=0.0, eye_lvl=lvl, eye_col=np.array([1.0, 0.9, 0.95])),
                             [SIL_X, 0, SIL_Z], np.pi, reflect=False, rim=np.array([0.9, 1.0, 1.0]))
        img = compose_float(ctx, FOG_B, 0.011, rain=0.0, t=t)
        silhouette_eyes(img, cam, [SIL_X, 0, SIL_Z], 1.2 + 1.5 * k if t < SIL_B[0] else 3.0)
        p['ca'] = 1 if t > 31.5 and t < SIL_B[0] else 0
        p['vignette'] = 0.55
        return finish_frame(img, p, t)
        details_B(ctx, t)
        p['ca'] = 1 if t > 31.5 and t < SIL_B[0] else 0
        p['vignette'] = 0.55
    img = compose_float(ctx, FOG_B, 0.026, rain=0.0, t=t)
    if t >= REVEAL and t < REVEAL + 0.12:
        p['white'] = 0.35 * (1 - (t - REVEAL) / 0.12)
    return finish_frame(img, p, t)


def silhouette_eyes(img, cam, pos, lvl):
    for sgn in (-1, 1):
        P = np.array(pos, float) + np.array([sgn * 0.035, 1.84, 0.0])
        x, y, z = cam.project(P)
        if z > 0.3 and 0 <= x < W and 0 <= y < H:
            img[int(y), int(x)] += np.array([1.0, 0.9, 0.95]) * lvl
            E.glow(img, x, y, 1.4, np.array([1.0, 0.25, 0.35]), 0.5 * lvl)


def details_B(ctx, t):
    cols = {'k': np.array([0.01, 0.005, 0.02]), 'E': np.array([1.0, 0.1, 0.15]) * 1.6}
    E.draw_template(ctx, E.CAT, [-2.55, 5.2, 24.0], 0.42, cols, emis_keys=('E',), flip=True)


def frame_portal(t):
    """Door opening: world B seen through the doorway, camera crossing it."""
    z = hero_z_s2(t)
    k = (t - DOOR_OPEN) / (19.9 - DOOR_OPEN)
    cz = lerp(z_cam_open(), 13.2, ease_in(min(1, k)) * 0.6 + 0.4 * k)
    cy = lerp(1.15, 1.45, k)
    cam = Camera([lerp(0.45, 0.32, k), cy, cz], yaw=-0.02, pitch=lerp(0.09, -0.02, k), f=225)
    stB = st_B3(t)
    p = dict(t=t, vignette=0.5)
    pose = dict(phase=walk_phase(z), walk=1.0 if t > 17.3 else 0.0)
    if cz >= DOOR_Z:
        ctx = base_world(WB, cam, stB)
        E.draw_character(ctx, pose, [0, 0, z], 0.0)
        img = compose_float(ctx, FOG_B, 0.026, t=t)
        p['white'] = 0.25 * max(0, 1 - (cz - DOOR_Z) / 0.25)
        return finish_frame(img, p, t)
    stA = st_A2(t)
    ctxA = base_world(WA, cam, stA)
    portal = ctxA.kind == 9
    tp0 = ctxA.t.copy()
    if z < DOOR_Z:
        E.draw_character(ctxA, pose, [0, 0, z], 0.0, rim=np.array([0.9, 0.95, 1.0]))
    imgA = compose_float(ctxA, FOG_A, 0.03, rain=1.0, t=t)
    if portal.any():
        ctxB = base_world(WB, cam, stB, mask=portal)
        if z >= DOOR_Z:
            E.draw_character(ctxB, pose, [0, 0, z], 0.0, clip_portal=portal)
        imgB = compose_float(ctxB, FOG_B, 0.026, vol=False, t=t)
        wl = max(0.0, 1.0 * np.exp(-(t - DOOR_OPEN) / 0.4))
        imgB = imgB * (1 - wl) + wl * np.array([0.9, 1.0, 1.05]) * 1.6
        pvis = portal & (ctxA.t >= tp0 - 1e-6)
        img = np.where(pvis[..., None], imgB, imgA)
        # re-apply the rain in front of the portal
    else:
        img = imgA
    p['ca'] = 1 if t < DOOR_OPEN + 0.3 else 0
    sh = max(0, 1 - (t - DOOR_OPEN) / 0.5)
    p['zoom'] = 1.0 + 0.06 * sh
    p['white'] = 0.5 * max(0, 1 - (t - DOOR_OPEN) / 0.15)
    return finish_frame(img, p, t)


def z_cam_open():
    return hero_z_s2(DOOR_OPEN) - 2.45


# ----------------------------------------------------------------- scene 4
def hero_z_s4(t):
    z0 = hero_z_s3(DROP)
    tt = min(t, SIL_C[0]) - DROP
    return z0 - 0.6 * tt


SIL_X4 = -0.6


def sil_z_s4(t):
    k = (t - DROP) / (SIL_C[0] - DROP)
    zh = hero_z_s4(t)
    return lerp(SIL_Z, zh + 1.6, k ** 0.9)


def red_lamps(t):
    lv = np.zeros(NL)
    for k in range(NL):
        if 3.0 < LAMP_Z[k] < 76:
            lv[k] = 0.85 + 1.0 * kick_env(t)
            if hash1(int(t / (BEAT / 2)) * 13 + k, 21) < 0.18:
                lv[k] = 0.05
    return lv


def st_B4(t):
    bar = int((t - DROP) // BAR)
    lc = np.array([1.0, 0.16, 0.24]) if bar % 2 == 0 else np.array([1.0, 0.25, 0.75])
    st = st_B(t, lamp_level=red_lamps(t), lamp_col=lc, power_z=1e9, neonB=0.6 + 0.6 * kick_env(t),
              win_col=np.array([1.0, 0.3, 0.35]) * (0.5 + 0.5 * kick_env(t)),
              ambient=np.array([0.10, 0.03, 0.06]), rim=np.array([1.0, 0.25, 0.4]),
              char_amb=np.array([0.16, 0.08, 0.12]), fill_col=np.array([0.6, 0.3, 0.4]))
    st['eye_open'] = 1.0
    st['screen'] = dict(level=0, standby=1.0 if int(t * 2) % 2 == 0 else 0.3)
    return st


def frame_scene4(t):
    if t >= SIL_C[0]:
        return frame_screen(t)
    zh = hero_z_s4(t)
    zs = sil_z_s4(t)
    st = st_B4(t)
    shot = 'A'
    t0 = DROP
    for a, b, s in CUTS:
        if a <= t < b:
            shot, t0 = s, a
    ke = kick_env(t)
    se = snare_env(t)
    prog = (t - DROP) / (SIL_C[0] - DROP)
    rng = np.random.default_rng(int(t * 30))
    shake = (0.02 + 0.05 * prog) * ke
    hero_pose = dict(phase=walk_phase(zh / 0.8), walk=0.7, shrug=1.0,
                     arm_L=(0.5 + 0.15 * np.sin(t * 9), 0.35, 1.2), arm_R=(0.6 + 0.15 * np.sin(t * 8), 0.35, 1.1))
    sil_pose = dict(sil=True, run=1.0, phase=walk_phase(-zs * 0.7), eye_lvl=3.0,
                    eye_col=np.array([1.0, 0.3, 0.35]))
    dt = t - t0
    if shot == 'A':
        cam = Camera([0.45 + rng.normal() * shake, 1.55 + rng.normal() * shake, zh - 2.7 + 0.15 * dt],
                     yaw=-0.02 + rng.normal() * shake * 0.3, pitch=0.01, roll=0.05 * np.sin(t * 1.7) * prog,
                     f=220 * (1 + 0.05 * ke))
        ctx = base_world(WB, cam, st)
        E.draw_character(ctx, sil_pose, [SIL_X4, 0, zs], np.pi, reflect=False, rim=np.array([1.6, 0.35, 0.5]),
                         glitch=0.3 * prog, seed=int(t * 30))
        E.draw_character(ctx, hero_pose, [0, 0, zh], 0.0)
    elif shot == 'B':
        cam = Camera([-0.3 + rng.normal() * shake, 1.45, zh + 1.9 + 0.1 * dt], yaw=np.pi + 0.03, pitch=0.03,
                     roll=-0.04 * prog, f=245 * (1 + 0.04 * ke))
        ctx = base_world(WB, cam, st)
        E.draw_character(ctx, hero_pose, [0, 0, zh], 0.0,
                         face=dict(gaze=(0.25 * np.sin(t * 5), 0.1), brow=1.0, mouth=0.6), head_look=(0.1 * np.sin(t * 3), 0.05),
                         fill=0.55)
    else:
        lunge = shot == 'L'
        dist = 3.1 - (2.3 * ease_in((t - t0) / BEAT) if lunge else 0.4 * dt)
        cam = Camera([SIL_X4 + 0.2 + rng.normal() * shake, 1.75, zs - dist], yaw=0.0, pitch=0.06, roll=0.06 * np.sin(t * 2.3),
                     f=230 * (1 + 0.06 * ke))
        ctx = base_world(WB, cam, st)
        sp = dict(sil_pose)
        if lunge:
            sp['arm_L'] = (1.4, 0.5, 0.2)
            sp['arm_R'] = (1.5, 0.5, 0.2)
        E.draw_character(ctx, sp, [SIL_X4, 0, zs], np.pi, reflect=False, rim=np.array([1.6, 0.4, 0.55]),
                         glitch=0.15 + 0.4 * prog, seed=int(t * 30))
    img = compose_float(ctx, np.array([0.16, 0.04, 0.09]), 0.02, t=t)
    p = dict(t=t, vignette=0.5, warp=0.15 + 0.85 * prog * (0.6 + 0.4 * ke),
             ca=int(1 + 2 * ke + 2 * prog), zoom=1 + 0.035 * ke, glitch=0.35 * se + (0.25 if t - t0 < 0.05 else 0),
             seed=int(t * 30))
    if t - t0 < 1 / 30 + 1e-6:
        p['invert'] = 0.5
    return finish_frame(img, p, t)


def st_screen(t):
    st = st_B(t, lamp_level=np.zeros(NL), power_z=1e9, neonB=0.0,
              ambient=np.array([0.04, 0.05, 0.08]), rim=np.array([0.3, 0.9, 1.0]),
              char_amb=np.array([0.08, 0.1, 0.14]), fill_col=np.array([0.3, 0.5, 0.6]))
    for k in range(NL):
        if 3.0 < LAMP_Z[k] < 76:
            st['lamp_level'][k] = 0.25 * (1 if hash1(k, 4) > 0.4 else 0) * (0.6 + 0.4 * snare_env(t))
    st['lamp_col'] = np.array([0.6, 0.9, 1.0])
    st['eye_open'] = 1.0
    return st


def face_params(t):
    gaze = (0.0, -0.55)
    blink = 0.0
    if 48.55 < t < 48.68:
        blink = 1.0
    k = sstep(49.6, 50.8, t)
    gaze = (0.0, lerp(-0.55, 0.0, k))
    if 51.6 < t < 51.72:
        blink = 1.0
    glint = sstep(RISER, ZOOM, t) * 1.5
    glitch = snare_env(t) * 0.8 + sstep(RISER, ZOOM, t) * 0.8
    return dict(gaze=gaze, blink=blink, glint=glint, glitch=glitch)


def frame_screen(t):
    """Silence, turn-around and the giant screen (45.571 .. 54.571)."""
    zh = hero_z_s4(t)
    st = st_screen(t)
    p = dict(t=t, vignette=0.5)
    if t < SCREEN_ON:
        st['screen'] = dict(level=0, standby=1.0)
        st['lamp_level'][:] = 0
        k = sstep(SIL_C[0] + 0.08, SCREEN_ON - 0.02, t)
        cam = Camera([0.3, 1.5, zh + 3.0], yaw=np.pi, pitch=0.0, f=235)
        ctx = base_world(WB, cam, st)
        E.draw_character(ctx, dict(walk=0.0, shrug=0.6), [0, 0, zh], np.pi * k,
                         face=dict(gaze=(0, 0), brow=1.0, mouth=0.3), fill=0.4)
        img = compose_float(ctx, np.array([0.05, 0.06, 0.08]), 0.03, t=t)
        p['glitch'] = 0.8 if t < SIL_C[0] + 0.07 else 0.0
        p['seed'] = int(t * 60)
        return finish_frame(img, p, t)
    on = t - SCREEN_ON
    fp = face_params(t)
    tex = face_texture(t, seed=int(t * 30), **fp)
    lvl = 1.0
    if on < 0.25:
        # CRT power-on: a bright line opening vertically
        k = on / 0.25
        th = tex.shape[0]
        rows = np.abs(np.arange(th) - th / 2) < th / 2 * k ** 2 + 1
        tex = np.where(rows[:, None, None], tex * (0.5 + k) + (1 - k) * 1.5, 0.0)
    st['screen'] = dict(level=lvl, tex=tex, flip=True)
    avg = tex.mean(axis=(0, 1))
    st['extra_lights'] = [MOON, ([0.0, 6.5, 2.7], avg / (avg.max() + 1e-6), 4.8 * min(1, on / 0.2), 8.0)]
    k = ease_io(on / 2.6)
    push = sstep(48.6, ZOOM, t)
    cam = Camera([0.3 - 0.15 * k, 1.5 + 0.7 * k, zh + 3.0 - 0.6 * push], yaw=np.pi + 0.02 * np.sin(t * 0.6),
                 pitch=0.42 * k, roll=0.0, f=235)
    ctx = base_world(WB, cam, st)
    E.draw_character(ctx, dict(walk=0.0, shrug=0.3), [0, 0, zh], np.pi, head_look=(0.0, 0.35 * k),
                     rim=np.array([0.4, 0.95, 1.0]), fill=0.3)
    img = compose_float(ctx, np.array([0.04, 0.06, 0.09]), 0.022, t=t)
    p['glitch'] = 0.4 * snare_env(t) + 0.3 * sstep(RISER, ZOOM, t)
    p['seed'] = int(t * 30)
    p['zoom'] = 1.0 + 0.02 * kick_env(t)
    p['ca'] = int(2 * sstep(RISER, ZOOM, t) + kick_env(t))
    if on < 0.12:
        p['white'] = 0.4 * (1 - on / 0.12)
    return finish_frame(img, p, t)


# ----------------------------------------------------------------- scene 5
ZH5 = None


def zh5():
    return hero_z_s4(SIL_C[0])


def cam_pov(t):
    zh = zh5()
    push = sstep(VISOR, GLITCH_BACK, t)
    tilt = sstep(TURN[0], TURN[1] + 0.3, t)
    return Camera([0.12, 1.95 + 0.02 * np.sin(2 * np.pi * t / 3.4), zh + 2.0 - 0.35 * push],
                  yaw=np.pi + 0.015 * np.sin(t * 0.7), pitch=lerp(0.17, -0.06, tilt),
                  roll=0.01 * np.sin(t * 0.5), f=235)


def pov_theta(t):
    k = ease_io((t - TURN[0]) / (TURN[1] - TURN[0]))
    return np.pi + np.pi * k            # char yaw: facing the screen (pi) -> facing camera (2pi)


def render_pov(t, iters=4):
    """The observer's point of view, with the screen showing itself."""
    zh = zh5()
    cam = cam_pov(t)
    st = st_screen(t)
    st['screen'] = dict(level=1.0, dynamic=True, flip=True)
    st['extra_lights'] = [MOON, ([0.0, 6.5, 2.7], np.array([0.5, 0.85, 1.0]), 6.0, 8.0)]
    ctx = base_world(WB, cam, st)
    yaw = pov_theta(t)
    k = ease_io((t - TURN[0]) / (TURN[1] - TURN[0]))
    face = dict(gaze=(0, 0), brow=0.2, glint=1.2 * k, blink=1.0 if 61.4 < t < 61.52 else 0.0)
    spr = E.draw_character(ctx, dict(walk=0.0, shrug=0.2), [0, 0, zh], yaw, face=face,
                           head_look=(0.0, 0.2 * (1 - k)), rim=np.array([0.4, 0.95, 1.0]), fill=0.45)
    base = compose_float(ctx, np.array([0.04, 0.06, 0.09]), 0.02, t=t)
    uv = ctx.uv
    scr = uv[..., 0] >= 0
    vis_amt = sstep(VISOR, VISOR + 0.5, t)
    hand_amt = sstep(58.0, 59.3, t)
    box = None
    if spr is not None and t > VISOR + 0.4:
        hx, hy, hz = cam.project(np.array([0, 1.62, zh]))
        r = 0.2 * cam.f / hz
        box = (hx - r * 0.9, hy - r * 1.0, hx + r * 0.9, hy + r * 0.9)
    sy = (uv[..., 1] * H).astype(int).clip(0, H - 1)
    sx = (uv[..., 0] * W).astype(int).clip(0, W - 1)
    fogk = np.where(np.isfinite(ctx.t), 1 - np.exp(-np.where(np.isfinite(ctx.t), ctx.t, 0) * 0.02), 0)
    frame = None
    tex = np.zeros((H, W, 3))
    for it in range(iters):
        frame = base.copy()
        src = tex[sy, sx] * 0.92
        led = 1 - 0.25 * ((_YY % 2) == 0)
        frame[scr] = src[scr] * led[scr, None] * (1 - fogk[scr, None]) + np.array([0.04, 0.06, 0.09]) * fogk[scr, None]
        frame = hands(frame, t, hand_amt)
        frame = visor(frame, t, vis_amt, s_clock=t, box=box)
        tex = frame
    return frame


def frame_scene5(t):
    if t < POV:
        # rapid zoom into the giant screen; it now shows the observer's view
        pov = render_pov(t, iters=3)
        pov_img = bloom(pov)
        zh = hero_z_s4(SIL_C[0])
        u = min(1.0, (t - ZOOM) / ((POV - ZOOM) * 0.82))
        k = ease_in(u)
        k2 = ease_io(u)
        start = np.array([0.15, 2.2, zh + 2.4])
        d = 5.0
        end = np.array([0.0, 6.8, 2.0 + d])
        pos = start + (end - start) * k2
        fend = H * d / 9.6
        f = lerp(235.0, fend, k)
        pitch = lerp(0.42, 0.0, k2)
        cam = Camera(pos, yaw=np.pi, pitch=pitch, f=f)
        st = st_screen(t)
        glitch_in = t - ZOOM < 0.1
        st['screen'] = dict(level=1.0, tex=pov_img if not glitch_in else face_texture(t, glitch=1.0, seed=int(t * 60)),
                            flip=True, led=1 - k)
        st['extra_lights'] = [MOON, ([0.0, 6.5, 2.7], np.array([0.5, 0.85, 1.0]), 7.0, 8.0)]
        ctx = base_world(WB, cam, st)
        E.draw_character(ctx, dict(walk=0.0), [0, 0, zh], np.pi, rim=np.array([0.4, 0.95, 1.0]))
        img = compose_float(ctx, np.array([0.04, 0.06, 0.09]), 0.02 * (1 - k), vol=False, t=t)
        p = dict(t=t, vignette=0.4 * (1 - k), zoom=1 + 0.08 * (1 - (t - ZOOM) / 0.15) if t - ZOOM < 0.15 else 1.0,
                 ca=int(3 * (1 - k)), glitch=0.6 if glitch_in else 0.0, seed=int(t * 60))
        return finish_frame(img, p, t)
    if t < GLITCH_BACK:
        img = render_pov(t)
        g = sstep(62.7, GLITCH_BACK, t)
        p = dict(t=t, vignette=0.0, glitch=0.15 * snare_env(t) + 0.9 * g, seed=int(t * 60),
                 ca=int(3 * g), warp=0.6 * g)
        if t - POV < 0.08:
            p['glitch'] = 0.5
        if SIL_D[0] <= t < SIL_D[1]:
            p['exposure'] = 0.85
        return finish_frame(img, p, t)
    return frame_end(t)


def frame_end(t):
    """Back in the first street: the observer stops, the hero walks away."""
    s = t - DURATION
    w = sstep(GLITCH_BACK, LOOP, t)
    p_h = hero_A_pos(s)
    c1 = cam_s1(s)
    # observer camera close to the hero, facing him
    p0 = hero_A_pos(GLITCH_BACK - DURATION)
    cpov = np.array([0.12, 1.95, p0 - 2.2])
    pos = cpov * (1 - w) + c1.pos * w
    cam = Camera(pos, yaw=c1.yaw * w, pitch=lerp(0.02, c1.pitch, w), roll=c1.roll * w, f=235)
    st = st_A(s)
    ctx = base_world(WA, cam, st)
    details_A(ctx, s, t)
    turn = ease_io((t - (GLITCH_BACK + 0.15)) / 0.7)
    yaw = np.pi * (1 - turn) + 2 * np.pi * 0      # facing camera -> facing away
    pose = hero_pose_A(s)
    E.draw_character(ctx, pose, [0, 0, p_h], np.pi * (1 - turn),
                     face=dict(gaze=(0, 0), glint=1.0 * (1 - turn)), fill=lerp(0.45, 0.35, w))
    img = compose_float(ctx, FOG_A, 0.03, rain=1.0, t=s)
    va = 1 - sstep(GLITCH_BACK + 0.4, LOOP - 0.1, t)
    img = hands(img, t, (1 - sstep(GLITCH_BACK, GLITCH_BACK + 1.2, t)))
    img = visor(img, t, va, s_clock=s)
    g = max(0.0, 1 - (t - GLITCH_BACK) / 0.35)
    p = dict(t=t, vignette=0.4 * w, glitch=0.9 * g, seed=int(t * 60), ca=int(3 * g))
    return finish_frame(img, p, t)


# ================================================================ dispatcher
def render_frame(t):
    if t < S1_END:
        q = frame_scene1(t, t)
    elif t < DOOR_OPEN:
        q = frame_scene2(t)
    elif t < DROP:
        q = frame_scene3(t)
    elif t < ZOOM:
        q = frame_scene4(t)
    elif t < LOOP:
        q = frame_scene5(t)
    else:
        q = frame_scene1(t, t - DURATION)
    sub_overlay(q, t)
    return (np.clip(q, 0, 1) * 255).astype(np.uint8)
