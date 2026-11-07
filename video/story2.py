"""Part 2: « Chaque silhouette… portait son visage. »  Every shot as a pure
function of time, built on the same engine as part 1."""
import numpy as np
from core import (W, H, Camera, hexc, clamp, sstep, lerp, ease_io, ease_in, ease_out, hash1,
                  draw_subtitle, DURATION, BEAT, BAR, DROP, bar_t)
from world import World
import engine as E
from story import (visor, hands, finish_frame, base_world, compose_float, flick_on, walk_phase, MOON,
                   FOG_A, FOG_B, details_A, NL, LAMP_Z, WA)
from timeline2 import *

V = 1.25
D0 = 2.6                      # distance at which he stops in front of the observer
WB2 = World('B')              # dead mirror city seen through the doors (no end walls)
RED = np.array([1.0, 0.16, 0.24])


# ================================================================ hero motion
def obs_dist(s):
    """Distance hero <-> observer on the loop clock (he walks toward us)."""
    L = 1.0
    if s >= STOP_S:
        return D0
    if s >= STOP_S - L:
        return D0 + V / (2 * L) * (STOP_S - s) ** 2
    return D0 + V * L / 2 + V * (STOP_S - L - s)


def obs_speed(s):
    L = 1.0
    if s >= STOP_S:
        return 0.0
    if s >= STOP_S - L:
        return V * (STOP_S - s) / L
    return V


def run_speed(t):
    return 4.2 * sstep(RUN0, RUN0 + 0.5, t) * (1 - sstep(8.15, 8.9, t))


_TT = np.arange(S1_END, 9.5, 0.001)
_ZZ = obs_dist(S1_END) + np.concatenate([[0], np.cumsum(np.array([run_speed(x) for x in _TT[:-1]]) * 0.001)])
ZSTOP = float(_ZZ[-1])
DOOR0 = round(ZSTOP + 5.5, 2)
DOOR_KS = list(range(-4, 5))
DOOR_Z = {k: DOOR0 + 12.0 * k for k in DOOR_KS}
Z_TRAP = DOOR0 - 12 * 3 - 6.0          # midway between two doors, far behind
X_RUN0, X_TRAP = 1.5, 0.9


def hero_z(t):
    if t < S1_END:
        return obs_dist(t)
    if t < 9.5:
        return float(np.interp(t, _TT, _ZZ))
    if t < DROP:
        return ZSTOP
    if t < SIL_C[0]:
        return lerp(ZSTOP, Z_TRAP, (t - DROP) / (SIL_C[0] - DROP))
    return Z_TRAP


def hero_x(t):
    if t < DROP:
        return 0.0
    k = (t - DROP) / (SIL_C[0] - DROP)
    if t < DROP + 0.6:
        return lerp(0.0, X_RUN0, sstep(DROP, DROP + 0.6, t))
    return lerp(X_RUN0, X_TRAP, sstep(0.6, 1.0, k))


# ================================================================ world state
def lamp_pass_time(k):
    zk = LAMP_Z[k]
    if zk <= 1.0 or zk >= ZSTOP - 0.5:
        return None
    i = np.searchsorted(_ZZ, zk + 0.6)
    return float(_TT[min(i, len(_TT) - 1)])


PASS = {k: lamp_pass_time(k) for k in range(NL)}


def door_list(t, open_=False, tint=None, glow_mul=1.0):
    breath = np.cos(2 * np.pi * (t - HEART0) / (2 * BEAT))
    doors = []
    for k in DOOR_KS:
        t_app = DOOR_AHEAD if k >= 0 else DOOR_BEHIND
        if t < t_app:
            continue
        age = t - t_app
        glow = (0.75 + 0.3 * sstep(9, 16, t) + 0.25 * max(0, breath)) * glow_mul
        if age < 0.12:
            glow *= 2.5 if int(age * 60) % 2 == 0 else 0.2
        d = dict(z=DOOR_Z[k], x=0.0, w=1.2, h=2.4, t=t + k * 0.37, breath=breath, glow=glow,
                 wob=0.3 + 1.0 * sstep(11, 16.4, t), morph=max(0.0, (t - 9.0) * 0.3), phi=0.0,
                 eye=sstep(12.0, 12.5, t), white=0.0)
        if SIL_A[0] <= t < DOOR_OPEN:
            d.update(glow=0.08, breath=0.0)
        if open_:
            kk = (t - DOOR_OPEN) / 0.45
            d['phi'] = 1.95 * ease_out(kk)
            d['white'] = max(0.0, 1.2 * np.exp(-(t - DOOR_OPEN) / 0.35))
            d.update(glow=1.5, morph=0.0, wob=0.0, breath=0.0)
        if tint is not None:
            d['tint'] = tint
        doors.append(d)
    return doors


def door_lights(t, doors, cam_z, col=None, inten=2.4):
    out = []
    c = 0.5 + 0.5 * np.sin(t * 3.66)
    base = np.array([0.2, 0.95, 1.0]) * c + np.array([1.0, 0.3, 0.85]) * (1 - c) if col is None else col
    for d in doors:
        if abs(d['z'] - cam_z) > 40:
            continue
        i = inten * d['glow'] * (0.8 + 0.25 * max(0, d['breath']))
        if d.get('white', 0) > 0:
            i += 10 * d['white']
            cc = np.array([0.85, 0.95, 1.0])
        else:
            cc = base
        out.append(([0.0, 1.3, d['z']], cc, i, 3.0))
    return out


def st_A2(t, s=None, **kw):
    s = t if s is None else s
    from story import st_A
    st = st_A(s)
    lv = st['lamp_level']
    if t >= S1_END and t < DROP:
        for k in range(NL):
            pt = PASS[k]
            if pt is not None and t >= pt:
                d = t - pt
                lv[k] = 0.0 if d > 0.18 else (1.6 if int(d * 40) % 2 == 0 else 0.0)
    st.update(kw)
    return st


def st_B2(t):
    return dict(t=t, rain=0.0, neonB=0.0, lamp_level=np.zeros(NL), power_z=-1e9,
                ambient=np.array([0.12, 0.155, 0.17]), extra_lights=[MOON])


# ================================================================ drawing helpers
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


def face_toward(pos, target):
    return float(np.arctan2(target[0] - pos[0], target[2] - pos[2]))


def eye_dots(img, cam, pos, yaw, lvl=1.5, height=1.874, col=(1.0, 0.25, 0.32)):
    r = np.array([np.cos(yaw), 0, -np.sin(yaw)])
    f = np.array([np.sin(yaw), 0, np.cos(yaw)])
    for sgn in (-1, 1):
        P = np.asarray(pos, float) + np.array([0, height, 0]) + r * sgn * 0.038 + f * 0.09
        x, y, z = cam.project(P)
        if z > 0.5 and 0 <= x < W and 0 <= y < H:
            img[int(y), int(x)] += np.array([1.0, 0.85, 0.9]) * lvl * 0.6
            E.glow(img, x, y, max(1.0, 0.03 * cam.f / z), np.array(col), 0.35 * lvl)


def sil(ctx, pos, yaw, lvl=2.4, run=0.0, phase=0.0, glitch=0.0, seed=0, rim=None, walk=0.0, arms=None,
        clip=None):
    pose = dict(sil=True, run=run, walk=walk, phase=phase, eye_lvl=lvl, eye_col=np.array([1.0, 0.25, 0.32]))
    if arms:
        pose['arm_L'], pose['arm_R'] = arms
    return E.draw_character(ctx, pose, pos, yaw, reflect=True, glitch=glitch, seed=seed,
                            rim=rim if rim is not None else np.array([0.9, 0.25, 0.45]), clip_portal=clip)


# ================================================================ scene 1 / loop tail
def cam_obs(s):
    push = 0.55 * sstep(0, S1_END, s) if s > 0 else 0.0
    return Camera([0.25 + 0.03 * np.sin(0.37 * s), 1.95 + 0.02 * np.sin(2 * np.pi * s / 3.4), push],
                  yaw=0.012 * np.sin(0.3 * s), pitch=-0.09 + (0.02 * sstep(0, S1_END, s) if s > 0 else 0.0),
                  roll=0.008 * np.sin(0.5 * s), f=235)


def draw_hero_s1(ctx, s, extra_face=None):
    z = obs_dist(s)
    sp = obs_speed(s)
    look = sstep(STOP_S - 0.4, STOP_S + 0.4, s)
    face = dict(gaze=(0.0, 0.25 * look), brow=0.25, blink=1.0 if 4.25 < s < 4.36 else 0.0)
    if extra_face:
        face.update(extra_face)
    return E.draw_character(ctx, dict(phase=walk_phase(z), walk=sp / V), [0.0, 0, z], np.pi,
                            face=face, head_look=(0.0, 0.16 * look), fill=0.6)


def frame_obs(t, s):
    """The observer's view of the street: scene 1, and the final loop tail."""
    cam = cam_obs(s)
    st = st_A2(t, s)
    ctx = base_world(WA, cam, st)
    details_A(ctx, s, t)
    # hidden detail: far away, the previous him walks away from us
    if 0.5 < s < 4.6:
        zp = 40.0 + V * (s - 0.5)
        E.draw_character(ctx, dict(phase=walk_phase(zp), walk=1.0), [-0.6, 0, zp], 0.0, reflect=False)
    draw_hero_s1(ctx, s)
    img = compose_float(ctx, FOG_A, 0.03, rain=1.0, t=s)
    p = dict(t=t, vignette=0.4)
    if t >= POV2:
        va = 1 - sstep(VFADE[0], VFADE[1] - 0.1, t)
        ha = 1 - sstep(VFADE[0] - 0.4, VFADE[0] + 1.0, t)
        img = hands(img, t, ha * sstep(POV2, POV2 + 1.2, t))
        box = None
        if va > 0.5:
            z = obs_dist(s)
            hx, hy, hz = cam.project(np.array([0.0, 1.62, z]))
            r = max(4, 0.17 * cam.f / hz)
            box = (hx - r, hy - r, hx + r, hy + r)
        img = visor(img, t, va, s_clock=s, box=box)
        p['vignette'] = 0.4 * (1 - va)
        if t - POV2 < 0.12:
            p['glitch'] = 0.8
            p['seed'] = int(t * 60)
    return finish_frame(img, p, t)


# ================================================================ scene 2
def frame_s2(t):
    z = hero_z(t)
    doors = door_list(t)
    p = dict(t=t, vignette=0.45)
    turn = ease_io((t - S1_END) / 0.35)
    yaw = np.pi + np.pi * turn
    run_amt = run_speed(t) / 4.2
    pose = dict(phase=walk_phase(z * 0.8), walk=0.0 if run_amt > 0.15 else min(1, run_speed(t) / V),
                run=run_amt)
    if t < DOOR_AHEAD:
        c0 = cam_obs(S1_END)
        k = sstep(5.6, 6.5, t)
        cz = lerp(c0.pos[2], z - 3.3, k)
        bob = 0.025 * abs(np.sin(walk_phase(z * 0.8))) * k
        cam = Camera([lerp(c0.pos[0], 0.45, k), lerp(1.95, 1.25, sstep(5.6, 6.6, t)) + bob, cz],
                     yaw=c0.yaw * (1 - k), pitch=lerp(-0.01, 0.03, k), roll=0.03 * np.sin(t * 2.2) * k, f=lerp(235, 222, k))
        st = st_A2(t, extra_lights=door_lights(t, doors, cz))
        st['doors'] = doors
        ctx = base_world(WA, cam, st)
        details_A(ctx, t, t)
        E.draw_character(ctx, pose, [0, 0, z], yaw, face=dict(brow=0.8, mouth=0.3), fill=0.45)
        if t - S1_END < 0.12:
            p['hblur'] = int(14 * (1 - (t - S1_END) / 0.12))
    elif t < TURN_BACK:
        cz = z - 3.3 + 0.3 * sstep(8.6, 9.5, t)
        cam = Camera([0.45, lerp(1.25, 1.4, sstep(8.6, 9.6, t)), cz], yaw=-0.02, pitch=0.035, f=222)
        st = st_A2(t, extra_lights=door_lights(t, doors, cz))
        st['doors'] = doors
        ctx = base_world(WA, cam, st)
        details_A(ctx, t, t)
        E.draw_character(ctx, pose, [0, 0, z], 0.0)
        if t - DOOR_AHEAD < 0.1:
            p['glitch'] = 0.7
            p['seed'] = int(t * 60)
            p['ca'] = 2
    elif t < CRANE:
        k = (t - TURN_BACK) / (CRANE - TURN_BACK)
        cam = Camera([-0.35, 1.5, ZSTOP + 2.35 - 0.3 * k], yaw=np.pi + 0.03, pitch=0.05, f=240)
        st = st_A2(t, extra_lights=door_lights(t, doors, cam.pos[2]))
        st['doors'] = doors
        ctx = base_world(WA, cam, st)
        yaw = ease_io((t - TURN_BACK) / 0.4) * np.pi
        if DETAIL[0] <= t < DETAIL[1] and hash1(int(t * 30), 7) > 0.15:
            zr = ROOF_Z
            hr_, _ = WA.height_at(0, np.array([zr]))
            E.draw_character(ctx, dict(sil=True, walk=0, eye_lvl=3.0), [-2.75, float(hr_[0]), zr], 0.0,
                             reflect=False, glitch=0.4, seed=int(t * 30), rim=np.array([0.6, 0.15, 0.3]))
        E.draw_character(ctx, dict(walk=0.0, shrug=0.4), [0, 0, z], yaw,
                         face=dict(gaze=(0.15 * np.sin(t * 2), 0.0), brow=1.0, mouth=0.35), fill=0.5)
        if abs(t - DOOR_BEHIND) < 0.05:
            p['glitch'] = 0.6
            p['seed'] = int(t * 60)
    else:
        k = ease_io((t - CRANE) / 4.2)
        cam = Camera([lerp(0.55, 0.1, k), lerp(1.6, 5.4, k), lerp(ZSTOP - 3.0, ZSTOP - 8.5, k)],
                     yaw=0.02 * np.sin(t * 0.4), pitch=lerp(0.0, -0.30, k), roll=0.02 * np.sin(t * 0.6),
                     f=lerp(225, 205, k))
        st = st_A2(t, extra_lights=door_lights(t, doors, cam.pos[2]))
        st['doors'] = doors
        if SIL_A[0] <= t:
            st['lamp_level'] = st['lamp_level'] * 0.12
            st['neon'] = 0.15
        ctx = base_world(WA, cam, st)
        yaw = np.pi + np.pi * sstep(12.8, 13.6, t)
        E.draw_character(ctx, dict(walk=0.0, shrug=0.3), [0, 0, z], yaw, head_look=(0.5 * np.sin(t * 1.4) * (t < 12.8), 0.0))
        p['zoom'] = 1.0 + 0.03 * sstep(14.5, SIL_A[0], t)
    img = compose_float(ctx, FOG_A, 0.03, rain=1.0, t=t)
    return finish_frame(img, p, t)


def _pick_roof():
    best, bz = 1e9, 4.0
    for z in np.arange(0.0, 9.0, 0.25):
        h, _ = WA.height_at(0, np.array([z]))
        if h[0] < best:
            best, bz = h[0], float(z)
    return bz


ROOF_Z = _pick_roof()


# ================================================================ scene 3
def sil_positions(t):
    """Silhouettes standing in front of their doors (scene 3)."""
    out = []
    # the one that walks out of the first door
    if t >= EMERGE:
        zz = max(DOOR0 - 0.8, DOOR0 + 1.6 - 0.95 * (t - EMERGE))
        out.append(dict(k=0, x=0.0, z=zz, t_app=EMERGE, walking=zz > DOOR0 - 0.8 + 1e-3))
    order = [1, 2, 3, 4, -1, -2, -3, -4]
    xs = {1: 1.8, 2: -1.7, 3: 2.2, 4: -2.0, -1: -1.8, -2: 1.7, -3: -2.2, -4: 2.0}
    for i, k in enumerate(order):
        if t >= APPEAR[i]:
            if k > 0:
                out.append(dict(k=k, x=xs[k], z=DOOR_Z[k] - 0.8, t_app=APPEAR[i], walking=False))
            else:
                out.append(dict(k=k, x=xs[k], z=DOOR_Z[k] + 0.8, t_app=APPEAR[i], walking=False))
    if t >= REVEAL:
        tt = t - REVEAL
        for o in out:
            if o['k'] >= 0:
                o['z'] -= (0.45 + 0.12 * o['k']) * tt + 0.05 * o['k'] * tt * tt
                o['walking'] = True
    return out


def draw_sils_s3(ctx, img_post, t, cam, portal=None, ctxB=None):
    zh = ZSTOP
    for o in sil_positions(t):
        pos = [o['x'], 0, o['z']]
        yaw = face_toward(pos, [0, 0, zh])
        age = t - o['t_app']
        gl = 0.8 if age < 0.15 else (0.1 if t >= REVEAL else 0.0)
        lvl = 2.2 + (1.5 if t >= REVEAL else 0.0) + (2.0 * np.exp(-age / 0.2))
        ph = walk_phase(o['z']) if o['walking'] else 0.0
        if age < 0.15 and int(age * 60) % 2 == 1:
            continue
        if o['k'] == 0 and o['z'] > DOOR0 and ctxB is not None:
            sil(ctxB, pos, yaw, lvl, walk=1.0, phase=ph, clip=portal)
        else:
            sil(ctx, pos, yaw, lvl, walk=1.0 if o['walking'] else 0.0, phase=ph, glitch=gl, seed=int(t * 30))
        img_post.append((pos, yaw, lvl))


def frame_s3(t):
    zh = ZSTOP
    doors = door_list(t, open_=t < SLAM, tint=None)
    if t >= SLAM:
        doors = door_list(t, open_=False)
        for d in doors:
            d.update(glow=0.06, phi=0.0, tint=np.array([0.22, 0.06, 0.1]))
    p = dict(t=t, vignette=0.45)
    yaw_h = 0.0
    if t < bar_t(-8):
        k = (t - DOOR_OPEN) / (bar_t(-8) - DOOR_OPEN)
        cam = Camera([lerp(0.45, 0.35, k), lerp(1.35, 1.45, k), lerp(zh - 3.0, zh - 2.4, ease_io(k))],
                     yaw=-0.02, pitch=0.05, f=225)
    elif t < CUT_3C:
        k = (t - bar_t(-8)) / (CUT_3C - bar_t(-8))
        cam = Camera([-2.1, 1.6 + 0.5 * k, zh - 4.0 - 0.6 * k], yaw=0.25, pitch=-0.02, f=250)
    elif t < REVEAL:
        k = (t - CUT_3C) / (REVEAL - CUT_3C)
        cam = Camera([2.1, 1.6 + 0.5 * k, zh + 4.0 + 0.4 * k], yaw=np.pi + 0.25, pitch=-0.02, f=250)
        yaw_h = ease_io((t - 23.6) / 0.6) * np.pi
    else:
        yaw_h = np.pi
        k = ease_io((t - REVEAL) / (SIL_B[0] - REVEAL))
        z0c = zh - 2.8
        cz = lerp(z0c, zh - 5.2, k)
        f = 235.0 * (zh - cz) / (zh - z0c)
        cy = 1.75
        alpha = np.arctan2(1.05 - cy, zh - cz)
        cam = Camera([0.6, cy, cz], yaw=0.0, pitch=alpha + np.arctan(0.1 * H / f), f=f)
    stA = st_A2(t, extra_lights=door_lights(t, doors, cam.pos[2]))
    stA['doors'] = doors
    if t >= SLAM:
        stA['lamp_level'] = np.zeros(NL)
        stA['neon'] = 0.0
        stA['ambient'] = np.array([0.03, 0.025, 0.05])
    ctxA = base_world(WA, cam, stA)
    portal = ctxA.kind == 9
    tp0 = ctxA.t.copy()
    E.draw_character(ctxA, dict(walk=0.0, shrug=0.25 + 0.5 * (t >= REVEAL)), [0, 0, zh], yaw_h,
                     face=dict(gaze=(0, 0.05), brow=0.8, mouth=0.2), fill=0.5,
                     rim=np.array([0.8, 0.9, 1.0]) if t < bar_t(-8) else None)
    eyes = []
    ctxB = None
    if portal.any() and t < SLAM:
        ctxB = base_world(WB2, cam, st_B2(t), mask=portal)
    if t < SLAM:
        draw_sils_s3(ctxA, eyes, t, cam, portal, ctxB)
    imgA = compose_float(ctxA, FOG_A, 0.03, rain=1.0, t=t)
    if ctxB is not None:
        imgB = compose_float(ctxB, FOG_B, 0.024, vol=False, t=t)
        wl = max(0.0, np.exp(-(t - DOOR_OPEN) / 0.4))
        imgB = imgB * (1 - wl) + wl * np.array([0.9, 1.0, 1.05]) * 1.6
        pvis = portal & (ctxA.t >= tp0 - 1e-6)
        img = np.where(pvis[..., None], imgB, imgA)
    else:
        img = imgA
    if t >= SLAM:
        for o in sil_positions(SLAM - 0.01):
            pos = [o['x'], 0, o['z']]
            eye_dots(img, cam, pos, face_toward(pos, [0, 0, zh]), 2.2)
    else:
        for (pos, yaw, lvl) in eyes:
            eye_dots(img, cam, pos, yaw, 0.6 + 0.25 * (lvl - 2.2))
    if t - DOOR_OPEN < 0.15:
        p['white'] = 0.5 * (1 - (t - DOOR_OPEN) / 0.15)
        p['zoom'] = 1.05
    if abs(t - CUT_3C) < 0.04 or abs(t - bar_t(-8)) < 0.04:
        p['glitch'] = 0.4
        p['seed'] = int(t * 60)
    if REVEAL <= t < REVEAL + 0.1:
        p['white'] = 0.3
        p['ca'] = 2
    if 31.4 < t < SIL_B[0]:
        p['ca'] = 1
    return finish_frame(img, p, t)


# ================================================================ scene 4
def chase_groups(t):
    prog = (t - DROP) / (SIL_C[0] - DROP)
    zh = hero_z(t)
    back, front = [], []
    gb = 9.0 - 6.6 * prog
    for i, (dx, dz) in enumerate(((0.2, 0.0), (1.9, 1.6), (-0.8, 3.1), (1.1, 4.8))):
        back.append(([dx, 0, zh + gb + dz], 0.0))
    if t > bar_t(2):
        gf = 16.0 - 13.6 * prog
        for i, (dx, dz) in enumerate(((1.5, 0.0), (-0.4, 1.7), (2.2, 3.0), (0.4, 4.4))):
            front.append(([dx, 0, zh - gf - dz], 0.0))
    return back, front


def st_chase(t):
    st = st_A2(t)
    bar = int((t - DROP) // BAR)
    st['lamp_col'] = RED if bar % 2 == 0 else np.array([1.0, 0.25, 0.75])
    ke = kick_env(t)
    lv = np.zeros(NL)
    for k in range(NL):
        lv[k] = 0.55 + 0.75 * ke
        if hash1(int(t / (BEAT / 2)) * 13 + k, 21) < 0.18:
            lv[k] = 0.05
    st['lamp_level'] = lv
    st['ambient'] = np.array([0.12, 0.04, 0.08])
    st['char_amb'] = np.array([0.16, 0.08, 0.12])
    st['rim'] = np.array([1.0, 0.25, 0.4])
    st['fill_col'] = np.array([0.6, 0.3, 0.4])
    st['neon'] = 0.7 + 0.5 * ke
    doors = door_list(t, tint=np.array([1.0, 0.25, 0.3]), glow_mul=0.6 + 0.8 * ke)
    st['doors'] = doors
    return st, doors


def frame_s4(t):
    if t >= SIL_C[0]:
        return frame_ring(t)
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
    st, doors = st_chase(t)
    back, front = chase_groups(t)
    hero_pose = dict(phase=walk_phase(-zh * 0.7), run=1.0)
    eyes = []
    if shot == 'A':
        cam = Camera([xh + 0.35 + rng.normal() * shake, 1.45 + rng.normal() * shake, zh - 2.9 - 0.1 * dt],
                     yaw=0.02, pitch=0.04, roll=0.05 * np.sin(t * 1.7) * prog, f=220 * (1 + 0.05 * ke))
        st['extra_lights'] = door_lights(t, doors, cam.pos[2], col=RED, inten=1.5)
        ctx = base_world(WA, cam, st)
        for pos, _ in back:
            sil(ctx, pos, np.pi, 3.0, run=1.0, phase=walk_phase(-pos[2] * 0.7), glitch=0.2 * prog, seed=int(t * 30))
            eyes.append((pos, np.pi))
        E.draw_character(ctx, hero_pose, [xh, 0, zh], np.pi, face=dict(brow=1.0, mouth=0.6), fill=0.5)
    elif shot in ('B', 'L'):
        if shot == 'B':
            cam = Camera([xh + 0.75 + rng.normal() * shake, 1.55, zh + 2.6 - 0.1 * dt], yaw=np.pi + 0.2, pitch=0.03,
                         roll=-0.04 * prog, f=235 * (1 + 0.04 * ke))
        else:
            cam = Camera([xh + rng.normal() * shake, 1.62, zh - 0.35], yaw=np.pi + 0.05 * np.sin(t * 9), pitch=0.02,
                         roll=0.05 * np.sin(t * 7), f=225 * (1 + 0.04 * ke))
        st['extra_lights'] = door_lights(t, doors, cam.pos[2], col=RED, inten=1.5)
        ctx = base_world(WA, cam, st)
        for j, (pos, _) in enumerate(front):
            pp = list(pos)
            arms = None
            if shot == 'L':
                pp[2] += 2.2 * ease_in((t - t0) / BEAT)
                arms = ((1.4, 0.5, 0.2), (1.5, 0.5, 0.2))
            sil(ctx, pp, 0.0, 3.0, run=1.0, phase=walk_phase(pp[2] * 0.7), glitch=0.2 * prog, seed=int(t * 30) + j,
                arms=arms)
            eyes.append((pp, 0.0))
        if shot == 'B':
            E.draw_character(ctx, hero_pose, [xh, 0, zh], np.pi)
    else:
        pos = back[1][0]
        cam = Camera([pos[0] + 0.25 + rng.normal() * shake, 1.75, pos[2] - 3.1 + 0.4 * dt], yaw=-0.06, pitch=0.06,
                     roll=0.06 * np.sin(t * 2.3), f=230 * (1 + 0.06 * ke))
        st['extra_lights'] = door_lights(t, doors, cam.pos[2], col=RED, inten=1.5)
        ctx = base_world(WA, cam, st)
        for j, (pp, _) in enumerate(back):
            sil(ctx, pp, np.pi, 3.0, run=1.0, phase=walk_phase(-pp[2] * 0.7), glitch=0.15 + 0.4 * prog,
                seed=int(t * 30) + j, rim=np.array([1.6, 0.4, 0.55]))
            eyes.append((pp, np.pi))
    img = compose_float(ctx, np.array([0.16, 0.04, 0.09]), 0.022, rain=1.0, t=t)
    for pos, yaw in eyes:
        eye_dots(img, cam, pos, yaw, 1.2)
    p = dict(t=t, vignette=0.5, warp=0.15 + 0.85 * prog * (0.6 + 0.4 * ke),
             ca=int(1 + 2 * ke + 2 * prog), zoom=1 + 0.035 * ke, glitch=0.35 * se + (0.25 if dt < 0.05 else 0),
             seed=int(t * 30))
    if dt < 1 / 30 + 1e-6:
        p['invert'] = 0.5
    return finish_frame(img, p, t)


# ================================================================ the ring of faces
G0 = np.array([X_TRAP, 0.0, Z_TRAP - 1.25])
RING_ANG = np.radians([55, 105, 150, -150, -105, -55, 180])
RING = [np.array([X_TRAP + 1.75 * np.sin(a), 0.0, Z_TRAP - 1.75 * np.cos(a)]) for a in RING_ANG]
HERO5 = np.array([X_TRAP, 0.0, Z_TRAP])


def st_ring(t):
    st = st_A2(t)
    lv = np.zeros(NL)
    near = [k for k in range(NL) if abs(LAMP_Z[k] - Z_TRAP) < 9]
    se = snare_env(t)
    for k in near:
        lv[k] = 0.0 if abs(LAMP_Z[k] - Z_TRAP) < 3 else 0.7 + 0.5 * se
    st['lamp_level'] = lv
    st['lamp_col'] = RED
    st['ambient'] = np.array([0.10, 0.03, 0.06])
    st['char_amb'] = np.array([0.20, 0.10, 0.14])
    st['rim'] = np.array([1.0, 0.3, 0.45])
    st['fill_col'] = np.array([0.7, 0.35, 0.45])
    st['neon'] = 0.35
    st['flash'] = 0.35 * se
    doors = door_list(t, tint=np.array([1.0, 0.2, 0.25]), glow_mul=0.5)
    st['doors'] = doors
    # key light between the hero and the first ghost: it reveals the faces
    st['key'] = ([X_TRAP + 0.25, 1.9, Z_TRAP - 0.55], np.array([1.0, 0.45, 0.55]), 1.4 + 0.6 * se, 1.6)
    return st, doors


G0_HEAD = G0 + np.array([0.0, 1.58, 0.05])


def aim_cam(pos, target, f=235.0, roll=0.0):
    pos = np.asarray(pos, float)
    target = np.asarray(target, float)
    yaw = face_toward(pos, target)
    pitch = np.arctan2(target[1] - pos[1], np.hypot(target[0] - pos[0], target[2] - pos[2]))
    return Camera(pos, yaw=yaw, pitch=pitch, roll=roll, f=f)


def ghost_pose(extra=None):
    p = dict(walk=0.0, ghost=1.0, eye_lvl=2.4)
    if extra:
        p.update(extra)
    return p


def draw_ring(ctx, t, cam, ghosts=True, skip_g0=False, look_cam=0.0, g0_arm=0.0):
    eyes = []
    members = [] if skip_g0 else [G0]
    members = members + RING
    for i, pos in enumerate(members):
        yaw_h = face_toward(pos, HERO5)
        yaw_c = face_toward(pos, cam.pos)
        yaw = yaw_h + (np.angle(np.exp(1j * (yaw_c - yaw_h)))) * look_cam
        if ghosts:
            ex = None
            if i == 0 and not skip_g0 and g0_arm > 0:
                ex = dict(arm_R=(0.3 + 1.2 * g0_arm, 0.1, 0.3 - 0.2 * g0_arm))
            gl = 0.25 if hash1(int(t * 20) + i * 7, 5) > 0.9 else 0.0
            E.draw_character(ctx, ghost_pose(ex), pos, yaw, face=dict(brow=0.1),
                             head_look=(0.15 * np.sin(i + t * 0.3), -0.08), glitch=gl, seed=int(t * 30) + i,
                             rim=np.array([1.2, 0.25, 0.4]), fill=0.4)
        else:
            sil(ctx, pos, yaw, 2.6)
        eyes.append((pos, yaw))
    return eyes


def frame_ring(t):
    """Silence, the ring, the faces, the eye, the transformation."""
    st, doors = st_ring(t)
    p = dict(t=t, vignette=0.5)
    hero_face = dict(gaze=(0, 0.05), brow=1.0, mouth=0.5)
    hero_extra = {}
    look_cam = 0.0
    skip_g0 = False
    g0_arm = 0.0
    ghosts = True
    hero_yaw = np.pi
    head = (0.0, 0.0)
    if t < FACE_ON:
        ghosts = False
        st['lamp_level'] = np.zeros(NL)
        st['flash'] = 0.0
        cam = Camera([X_TRAP + 1.2, 3.4, Z_TRAP + 3.8], yaw=np.pi - 0.25, pitch=-0.52, f=225)
        if t < SIL_C[0] + 0.07:
            p['glitch'] = 0.8
            p['seed'] = int(t * 60)
    elif t < D2:
        k = ease_io((t - FACE_ON) / (D2 - FACE_ON))
        cam = aim_cam([1.62, 1.66, Z_TRAP + 0.75 - 0.25 * k], G0_HEAD, f=lerp(300, 345, k))
        if t - FACE_ON < 0.12:
            st['flash'] = 1.2 * (1 - (t - FACE_ON) / 0.12)
    elif t < D3:
        k = ease_io((t - D2) / (D3 - D2))
        cam = aim_cam([lerp(-1.9, -1.2, k), 1.0, Z_TRAP - 3.1 + 0.3 * k], HERO5 + np.array([0, 1.25, 1.0]), f=210)
    elif t < D4:
        k = (t - D3) / (D4 - D3)
        cam = Camera([X_TRAP + 0.06, 1.62, Z_TRAP - 0.8 - 0.1 * k], yaw=0.0, pitch=0.0, f=290)
        hero_face = dict(gaze=(0.12 * np.sin(t * 6), 0.0), brow=1.0, mouth=0.7, glint=1.2)
    elif t < ZOOM:
        k = (t - D4) / (ZOOM - D4)
        cam = aim_cam([1.62, 1.66, Z_TRAP + 0.55 - 0.15 * k], G0_HEAD, f=330)
        g0_arm = ease_io(k)
        p['glitch'] = 0.25 * k
        p['seed'] = int(t * 30)
        p['ca'] = int(2 * k)
    elif t < TRANS[0]:
        # rapid zoom into the ghost's eye (curved path around the hero's head)
        u = min(1.0, (t - ZOOM) / ((TRANS[0] - ZOOM) * 0.85))
        k = ease_in(u)
        eye = G0 + np.array([0.04, 1.606, 0.12])
        P0 = np.array([1.62, 1.66, Z_TRAP + 0.4])
        P2 = eye + np.array([0, 0, 0.22])
        P1 = np.array([1.75, 1.7, Z_TRAP - 0.45])
        pos = (1 - k) ** 2 * P0 + 2 * (1 - k) * k * P1 + k * k * P2
        aim = G0_HEAD * (1 - k) + eye * k
        cam = aim_cam(pos, aim, f=lerp(330, 1250, k ** 1.5))
        g0_arm = 1.0
        p['ca'] = int(3 * k)
        if u >= 1.0:
            p['white'] = 0.35
            p['tint'] = np.array([1.0, 0.5, 0.55])
    else:
        # transformation and the final stare
        skip_g0 = True
        k = ease_io((t - TRANS[0]) / (SIL_D[0] - TRANS[0]))
        kk = sstep(HIT, SIL_D[0], t)
        cam = Camera([X_TRAP - 0.15, lerp(1.3, 1.58, kk), lerp(Z_TRAP - 2.3, Z_TRAP - 1.25, kk)],
                     yaw=0.03 * np.sin(t), pitch=lerp(0.0, -0.01, kk), roll=0.015 * np.sin(t * 0.8),
                     f=lerp(235, 255, kk))
        drain = 1.95 * ease_io((t - TRANS[0]) / (TRANS[1] - TRANS[0]))
        hero_extra = dict(drain=drain) if t < HIT else dict(ghost=1.0, eye_lvl=2.6 + 1.5 * kk)
        hero_face = dict(gaze=(0, 0.1 * kk), brow=0.2)
        head = (0.0, 0.12 * kk)
        look_cam = sstep(HIT + 0.4, SIL_D[0], t)
        if t < TRANS[0] + 0.08:
            p['glitch'] = 0.7
            p['seed'] = int(t * 60)
            p['white'] = 0.4
        if HIT <= t < HIT + 0.1:
            p['white'] = 0.3
            p['ca'] = 2
        if t >= SIL_D[0]:
            p['exposure'] = 0.75
        p['glitch'] = p.get('glitch', 0) + 0.25 * snare_env(t) + 0.2 * sstep(58.8, SIL_D[0], t)
        p['seed'] = int(t * 30)
    st['extra_lights'] = door_lights(t, doors, cam.pos[2], col=RED, inten=1.0) + ([st['key']] if ghosts else [])
    ctx = base_world(WA, cam, st)
    eyes = draw_ring(ctx, t, cam, ghosts=ghosts, skip_g0=skip_g0, look_cam=look_cam, g0_arm=g0_arm)
    pose = dict(walk=0.0, shrug=0.5)
    pose.update(hero_extra)
    E.draw_character(ctx, pose, HERO5, hero_yaw, face=hero_face, head_look=head, fill=0.45,
                     rim=np.array([1.0, 0.3, 0.45]))
    img = compose_float(ctx, np.array([0.12, 0.03, 0.07]), 0.02, rain=1.0, t=t)
    if not ghosts:
        for pos, yaw in eyes:
            eye_dots(img, cam, pos, yaw, 1.8)
    return finish_frame(img, p, t)


# ================================================================ dispatcher
def render_frame(t):
    if t < S1_END:
        q = frame_obs(t, t)
    elif t < DOOR_OPEN:
        q = frame_s2(t)
    elif t < DROP:
        q = frame_s3(t)
    elif t < POV2:
        q = frame_s4(t)
    else:
        q = frame_obs(t, t - DURATION)
    sub_overlay(q, t)
    return (np.clip(q, 0, 1) * 255).astype(np.uint8)
