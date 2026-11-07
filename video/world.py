"""Pseudo-3D pixel-art street: an analytic ray caster (floor, two facades,
optional end walls, blade signs, a breathing door) with dynamic lights,
wet-floor reflections and procedural facades.

Everything is expressed in the "A-frame".  The mirrored city (world B) is
rendered by mirroring the camera, rendering in the A-frame and flipping the
image horizontally (see scenes.render_world)."""
import numpy as np
from core import (W, H, hexc, hash2, hash1, vnoise, fbm, clamp, smoothstep, PALETTE)

SKY, FLOOR, WALL_L, WALL_R, END_N, END_F, SIGN, DOOR_FRAME, DOOR_PANEL, PORTAL = range(10)

C = hexc


# ------------------------------------------------------------------ lights
class Lights:
    def __init__(self):
        self.items = []

    def add(self, pos, col, inten, rad, spot=False, name=''):
        self.items.append(dict(pos=np.asarray(pos, float), col=np.asarray(col, float),
                               i=float(inten), r=float(rad), spot=spot, name=name))

    def mirrored(self):
        L = Lights()
        for it in self.items:
            d = dict(it)
            d['pos'] = it['pos'] * np.array([-1, 1, 1.0])
            L.items.append(d)
        return L

    def shade(self, P, N, wrap=0.0):
        out = np.zeros_like(P)
        for it in self.items:
            if it['i'] <= 0.002:
                continue
            v = it['pos'] - P
            d2 = np.einsum('ij,ij->i', v, v) + 1e-6
            d = np.sqrt(d2)
            ndl = (np.einsum('ij,ij->i', N, v) / d + wrap) / (1 + wrap)
            ndl = np.clip(ndl, 0, 1)
            r = it['r']
            att = it['i'] / (1 + d2 / (r * r))
            att *= 1 - smoothstep(r * 3.0, r * 4.2, d)
            if it['spot']:
                att *= 0.18 + 0.82 * smoothstep(0.35, 0.82, v[:, 1] / d)
            out += it['col'] * (ndl * att)[:, None]
        return out


# ------------------------------------------------------------------ helpers
def poly_dist(u, v, pts, closed=True):
    pts = list(pts)
    if closed:
        pts = pts + [pts[0]]
    d = np.full(u.shape, 1e9)
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        dx, dy = x1 - x0, y1 - y0
        L2 = dx * dx + dy * dy + 1e-12
        s = clamp(((u - x0) * dx + (v - y0) * dy) / L2)
        px, py = x0 + s * dx, y0 + s * dy
        d = np.minimum(d, np.hypot(u - px, v - py))
    return d


def circle_pts(cx, cy, r, n=20, a0=0, a1=2 * np.pi, ry=None):
    ry = r if ry is None else ry
    a = np.linspace(a0, a1, n)
    return [(cx + r * np.cos(x), cy + ry * np.sin(x)) for x in a]


def symbol_dist(sym, u, v, open_=1.0):
    """Distance (in symbol units, ~[-1,1] box) to the neon strokes of a symbol."""
    if sym == 'eye':
        o = max(open_, 0.05)
        top = [(x, 0.55 * o * (1 - x * x)) for x in np.linspace(-1, 1, 15)]
        bot = [(x, -0.55 * o * (1 - x * x)) for x in np.linspace(1, -1, 15)]
        d = poly_dist(u, v, top + bot, True)
        if o > 0.3:
            pr = 0.26 * min(1, o)
            d = np.minimum(d, np.abs(np.hypot(u, v) - pr * 0.6))
            d = np.minimum(d, np.hypot(u, v) - pr * 0.25 + 0.0)
        return d
    if sym == 'tri':
        return poly_dist(u, v, [(0, 0.9), (0.85, -0.6), (-0.85, -0.6)])
    if sym == 'arrow':
        d = poly_dist(u, v, [(-0.9, 0), (0.7, 0)], False)
        return np.minimum(d, poly_dist(u, v, [(0.2, 0.5), (0.8, 0), (0.2, -0.5)], False))
    if sym == 'moon':
        d1 = poly_dist(u, v, circle_pts(0, 0, 0.8, 24, 0.9, 2 * np.pi - 0.9), False)
        d2 = poly_dist(u, v, circle_pts(0.38, 0, 0.55, 18, 1.75, 2 * np.pi - 1.75), False)
        return np.minimum(d1, d2)
    if sym == 'diamond':
        d = poly_dist(u, v, [(0, 0.9), (0.6, 0), (0, -0.9), (-0.6, 0)])
        return np.minimum(d, poly_dist(u, v, [(0, 0.4), (0.25, 0), (0, -0.4), (-0.25, 0)]))
    if sym == 'bolt':
        return poly_dist(u, v, [(0.3, 0.95), (-0.35, 0.05), (0.2, 0.05), (-0.3, -0.95)], False)
    if sym == 'ring':
        r = np.hypot(u, v)
        return np.minimum(np.abs(r - 0.8), np.abs(r - 0.4))
    if sym == 'door':
        return poly_dist(u, v, [(-0.45, -0.9), (-0.45, 0.4)] + circle_pts(0, 0.4, 0.45, 12, np.pi, 0) +
                         [(0.45, -0.9)], False)
    return np.full(u.shape, 9.0)


# ------------------------------------------------------------------ world
WALL_A = ['322457', '261b44', '3f2f6b', '253250', '33456b', '1c1433', '2a0f5c', '1a2236']
WALL_B = ['2c3a40', '3e5258', '33456b', '2c3a40', '5a7378', '253250', '3e5258', '1a2236']
WIN_A = ['ffc35a', '6ff5ee', 'ff6fd6', 'ffc35a', 'c3d0e6', 'ff9524', '82b8ff']
SHOP_A = ['ff6fd6', '22d3d0', 'ff9524', '8a4cf0', 'ee2440', '45c95a', '3d82ff']


class World:
    def __init__(self, style='A', seed=11):
        self.style = style
        self.A = 3.0
        self.walk = 0.95
        rng = np.random.default_rng(seed)
        self.fac = []
        for side in (0, 1):
            edges = [-90.0]
            while edges[-1] < 170:
                edges.append(edges[-1] + rng.uniform(4.0, 8.5))
            n = len(edges) - 1
            f = dict(z0=np.array(edges[:-1]), z1=np.array(edges[1:]))
            f['edges'] = np.array(edges)
            f['h'] = rng.uniform(6.5, 15.0, n)
            ci = rng.integers(0, len(WALL_A), n)
            f['colA'] = np.array([C(WALL_A[k]) for k in ci])
            f['colB'] = np.array([C(WALL_B[k]) for k in ci])
            f['sx'] = rng.uniform(0.95, 1.45, n)
            f['sy'] = rng.uniform(1.05, 1.3, n)
            f['lit'] = rng.uniform(0.08, 0.42, n)
            f['tint'] = np.array([C(WIN_A[k]) for k in rng.integers(0, len(WIN_A), n)])
            f['shop'] = rng.integers(0, 3, n)
            f['shopc'] = np.array([C(SHOP_A[k]) for k in rng.integers(0, len(SHOP_A), n)])
            f['pipe'] = rng.random(n) < 0.45
            f['fire'] = rng.random(n) < 0.3
            f['trim'] = rng.random(n) < 0.35
            f['trimc'] = np.array([C(SHOP_A[k]) for k in rng.integers(0, len(SHOP_A), n)])
            f['seed'] = rng.integers(0, 10000, n)
            self.fac.append(f)
        # ---- story-driven props (A-frame) -------------------------------
        # neon symbols painted on walls
        self.wall_signs = [
            dict(side=0, z=5.5, y=4.6, s=0.75, sym='eye', col=C('ff4fb0') if False else C('ff6fd6')),
            dict(side=1, z=11.0, y=3.6, s=0.55, sym='arrow', col=C('6ff5ee')),
            dict(side=0, z=22.0, y=5.5, s=0.6, sym='moon', col=C('ffc35a')),
            dict(side=1, z=28.5, y=4.2, s=0.6, sym='tri', col=C('ff6fd6')),
            dict(side=0, z=37.0, y=3.8, s=0.55, sym='diamond', col=C('22d3d0')),
            dict(side=1, z=-6.0, y=4.0, s=0.6, sym='bolt', col=C('ffe45c')),
            dict(side=0, z=-14.0, y=5.0, s=0.6, sym='ring', col=C('3d82ff')),
            dict(side=1, z=46.0, y=5.2, s=0.7, sym='eye', col=C('ee2440')),
        ]
        # perpendicular blade signs
        self.blades = [
            dict(side=1, z=3.0, y=2.6, w=1.0, h=1.9, sym='diamond', col=C('22d3d0')),
            dict(side=0, z=13.5, y=3.0, w=1.0, h=1.7, sym='door', col=C('ff6fd6')),
            dict(side=1, z=24.0, y=3.4, w=1.0, h=1.8, sym='ring', col=C('ff9524')),
            dict(side=0, z=33.0, y=2.8, w=1.0, h=1.8, sym='arrow', col=C('8a4cf0')),
            dict(side=1, z=-9.0, y=3.0, w=1.0, h=1.8, sym='tri', col=C('45c95a')),
            dict(side=0, z=52.0, y=3.2, w=1.0, h=1.8, sym='moon', col=C('3d82ff')),
        ]
        # lamps (side, z)
        self.lamps = [dict(side=(k % 2), z=-28.0 + 6.0 * k) for k in range(26)]
        # cables (z, height, sag)
        self.cables = [(z, rng.uniform(5.2, 7.5), rng.uniform(0.4, 1.0)) for z in np.arange(-40, 120, 7.3)]
        self.end_near = None
        self.end_far = None
        self.screen_rect = (-2.7, 2.7, 2.0, 11.6)
        self.state = {}

    # --------------------------------------------------------------- facade
    def height_at(self, side, Z):
        f = self.fac[side]
        idx = np.clip(np.searchsorted(f['edges'], Z) - 1, 0, len(f['h']) - 1)
        return f['h'][idx], idx

    def lamp_pos(self, k):
        L = self.lamps[k]
        sx = -1 if L['side'] == 0 else 1
        x = sx * (self.A - 0.35)
        return np.array([x, 0.0, L['z']]), np.array([x - sx * 0.75, 3.55, L['z']])

    # --------------------------------------------------------------- trace
    def trace(self, O, D, with_door=True):
        n = len(D)
        dx, dy, dz = D[:, 0], D[:, 1], D[:, 2]
        A = self.A
        t = np.full(n, np.inf)
        kind = np.full(n, SKY, dtype=np.int8)
        aux = np.zeros(n)           # sign index etc.
        with np.errstate(divide='ignore', invalid='ignore'):
            tf = np.where(dy < -1e-7, -O[1] / dy, np.inf)
            m = tf < t
            t[m] = tf[m]
            kind[m] = FLOOR
            for side, sgn in ((0, -1), (1, 1)):
                tw = np.where(dx * sgn > 1e-7, (sgn * A - O[0]) / dx, np.inf)
                yw = O[1] + tw * dy
                zw = O[2] + tw * dz
                hw, _ = self.height_at(side, np.where(np.isfinite(zw), zw, 0))
                ok = (tw < t) & (yw < hw) & (yw > -0.01)
                t[ok] = tw[ok]
                kind[ok] = WALL_L if side == 0 else WALL_R
            if self.end_near is not None:
                tn = np.where(dz < -1e-7, (self.end_near - O[2]) / dz, np.inf)
                xn = O[0] + tn * dx
                yn = O[1] + tn * dy
                ok = (tn < t) & (np.abs(xn) <= A) & (yn < 15.5) & (yn > -0.01)
                t[ok] = tn[ok]
                kind[ok] = END_N
            if self.end_far is not None:
                tn = np.where(dz > 1e-7, (self.end_far - O[2]) / dz, np.inf)
                xn = O[0] + tn * dx
                yn = O[1] + tn * dy
                ok = (tn < t) & (np.abs(xn) <= A) & (yn < 17.0) & (yn > -0.01)
                t[ok] = tn[ok]
                kind[ok] = END_F
            for bi, b in enumerate(self.blades):
                ts = np.where(np.abs(dz) > 1e-7, (b['z'] - O[2]) / dz, np.inf)
                ts = np.where(ts > 0.05, ts, np.inf)
                xs = O[0] + ts * dx
                ys = O[1] + ts * dy
                if b['side'] == 0:
                    inx = (xs > -A) & (xs < -A + b['w'])
                else:
                    inx = (xs < A) & (xs > A - b['w'])
                ok = (ts < t) & inx & (ys > b['y']) & (ys < b['y'] + b['h'])
                t[ok] = ts[ok]
                kind[ok] = SIGN
                aux[ok] = bi
        doors = []
        if with_door:
            if self.state.get('door') is not None:
                doors.append(self.state['door'])
            doors += list(self.state.get('doors', []))
        dlist = []
        did = np.full(n, -1, dtype=np.int16)
        for i, door in enumerate(doors):
            if not door.get('visible', True):
                continue
            t_b = t.copy()
            k_b = kind.copy()
            res = self._door_hit(O, D, t, kind, door)
            ch = (t != t_b) | (kind != k_b)
            did[ch] = len(dlist)
            dlist.append((door, res))
        P = O[None, :] + D * np.where(np.isfinite(t), t, 0)[:, None]
        return dict(t=t, kind=kind, aux=aux, P=P, D=D, door=dlist[0][1] if dlist else None,
                    doors=dlist, did=did)

    # --------------------------------------------------------------- door
    def door_shape(self, u, v, door, grow=0.0):
        """Inside test for the (breathing, morphing) door opening."""
        tt = door['t']
        br = door.get('breath', 0.0)
        hw = door['w'] / 2 * (1 + 0.07 * br) + grow
        hw_v = hw * (1 + door.get('wob', 0.0) * 0.06 * np.sin(v * 6.0 + tt * 5.0))
        hg = door['h'] * (1 + 0.05 * br) + grow
        m = door.get('morph', 0.0) % 3.0
        un = clamp(np.abs(u) / np.maximum(hw_v, 1e-3), 0, 1)
        flat = hg
        arch = hg - 0.35 + 0.55 * np.sqrt(np.maximum(0, 1 - un * un))
        point = hg - 0.25 + 0.75 * (1 - un)
        k = m - np.floor(m)
        k = k * k * (3 - 2 * k)
        seq = [flat, arch, point, flat]
        i = int(np.floor(m))
        top = seq[i] * (1 - k) + seq[i + 1] * k
        top = top + grow * 0.0
        return (np.abs(u) < hw_v) & (v > -0.01) & (v < top), hw_v, top

    def _door_hit(self, O, D, t, kind, door):
        dx, dy, dz = D[:, 0], D[:, 1], D[:, 2]
        zd, xd = door['z'], door['x']
        with np.errstate(divide='ignore', invalid='ignore'):
            tp = np.where(np.abs(dz) > 1e-7, (zd - O[2]) / dz, np.inf)
        tp = np.where(tp > 0.02, tp, np.inf)
        u = O[0] + tp * dx - xd
        v = O[1] + tp * dy
        inner, hw, top = self.door_shape(u, v, door)
        outer, _, _ = self.door_shape(u, v, door, grow=0.16)
        frame = outer & ~inner & (tp < t)
        hole = inner & (tp < t)
        # panel (rotates around hinge at u = -hw0)
        phi = door.get('phi', 0.0)
        hw0 = door['w'] / 2 * (1 + 0.07 * door.get('breath', 0.0))
        Hx, Hz = xd - hw0, zd
        e = np.array([np.cos(phi), np.sin(phi)])       # along panel (x,z)
        nrm = np.array([-np.sin(phi), np.cos(phi)])
        den = dx * nrm[0] + dz * nrm[1]
        with np.errstate(divide='ignore', invalid='ignore'):
            tpan = np.where(np.abs(den) > 1e-7, ((Hx - O[0]) * nrm[0] + (Hz - O[2]) * nrm[1]) / den, np.inf)
        tpan = np.where(tpan > 0.02, tpan, np.inf)
        qx = O[0] + tpan * dx - Hx
        qz = O[2] + tpan * dz - Hz
        a = qx * e[0] + qz * e[1]
        pv = O[1] + tpan * dy
        pin, _, _ = self.door_shape(a - hw0, pv, door)
        pin &= (a >= 0) & (a <= 2 * hw0)
        panel = pin & (tpan < t)
        res = dict(tp=tp, u=u, v=v, frame=frame, hole=hole, panel=panel, tpan=tpan,
                   pa=a / (2 * hw0), pv=pv / door['h'], front=den > 0)
        # panel in front of everything along the ray
        pf = panel & (~frame | (tpan < tp))
        pf &= ~(hole & (tpan > tp + 1e-4)) | panel
        kind[frame & ~(panel & (tpan < tp))] = DOOR_FRAME
        t[frame & ~(panel & (tpan < tp))] = tp[frame & ~(panel & (tpan < tp))]
        ph = panel & ((tpan <= tp + 1e-4) | hole)
        kind[ph] = DOOR_PANEL
        t[ph] = tpan[ph]
        portal = hole & ~ph
        kind[portal] = PORTAL
        t[portal] = tp[portal]
        return res

    # --------------------------------------------------------------- shading
    def shade(self, hit, cam_f, lights, reflect=True, depth=0):
        st = self.state
        styleB = self.style == 'B'
        t, kind, P, D = hit['t'], hit['kind'], hit['P'], hit['D']
        n = len(t)
        alb = np.zeros((n, 3))
        emi = np.zeros((n, 3))
        nrm = np.zeros((n, 3))
        refl = np.zeros(n)
        fp = np.where(np.isfinite(t), t, 1e3) / cam_f

        # ---------------- walls
        for side, kd in ((0, WALL_L), (1, WALL_R)):
            m = np.nonzero(kind == kd)[0]
            if len(m) == 0:
                continue
            a, e = self._wall(side, P[m, 2], P[m, 1], fp[m], styleB)
            alb[m] = a
            emi[m] = e
            nrm[m] = (1, 0, 0) if side == 0 else (-1, 0, 0)
        # ---------------- end walls
        for kd, nz in ((END_N, 1.0), (END_F, -1.0)):
            m = np.nonzero(kind == kd)[0]
            if len(m) == 0:
                continue
            self._scr_uv = None
            a, e = self._endwall(P[m, 0], P[m, 1], fp[m], styleB, near=(kd == END_N))
            if depth == 0 and self._scr_uv is not None:
                kk, uu, vv = self._scr_uv
                hit['scr_uv'] = (m[kk], uu, vv)
            alb[m] = a
            emi[m] = e
            nrm[m] = (0, 0, nz)
        # ---------------- blade signs
        m = np.nonzero(kind == SIGN)[0]
        if len(m):
            a, e = self._blade(hit['aux'][m].astype(int), P[m], styleB)
            alb[m] = a
            emi[m] = e
            nrm[m, 2] = -np.sign(D[m, 2])
        # ---------------- floor
        m = np.nonzero(kind == FLOOR)[0]
        if len(m):
            a, e, r = self._floor(P[m, 0], P[m, 2], fp[m], styleB)
            alb[m] = a
            emi[m] = e
            refl[m] = r
            nrm[m] = (0, 1, 0)
        # ---------------- sky
        m = np.nonzero(kind == SKY)[0]
        if len(m):
            emi[m] = self._sky(D[m], styleB)
        # ---------------- door
        if hit.get('doors'):
            for i, (door, dres) in enumerate(hit['doors']):
                self._door_shade(hit, alb, emi, nrm, door, dres, hit['did'] == i)

        # ---------------- lighting
        amb = st.get('ambient', np.array([0.10, 0.08, 0.17]) if not styleB else np.array([0.07, 0.09, 0.10]))
        lit = np.zeros((n, 3))
        geo = (kind != SKY) & (kind != PORTAL)
        g = np.nonzero(geo)[0]
        if len(g):
            Pg = P[g] + nrm[g] * 0.02
            L = lights.shade(Pg, nrm[g])
            hemi = 0.75 + 0.25 * nrm[g, 1:2]
            lit[g] = alb[g] * (amb * hemi + L)
        col = lit + emi
        flash = st.get('flash', 0.0)
        if flash > 0:
            col[g] += alb[g] * flash * np.array([0.75, 0.8, 1.0]) * 1.4

        # ---------------- wet-floor reflections
        if reflect and depth == 0:
            fm = np.nonzero((kind == FLOOR) & (refl > 0.02))[0]
            if len(fm):
                Rd = D[fm].copy()
                Rd[:, 1] = -Rd[:, 1]
                # rain ripples perturb the reflection
                if st.get('rain', 0) > 0:
                    tt = st['t']
                    jit = (vnoise(P[fm, 0] * 9 + tt * 3.1, P[fm, 2] * 9, 5) - 0.5) * 0.035 * st['rain']
                    Rd[:, 0] += jit
                    Rd[:, 2] += jit * 0.5
                Rd /= np.linalg.norm(Rd, axis=1, keepdims=True)
                O2 = P[fm].copy()
                O2[:, 1] = 0.001
                rhit = self._trace_multi(O2, Rd)
                rcol = self.shade(rhit, cam_f, lights, reflect=False, depth=1)
                fres = 0.55 + 0.45 * (1 - np.abs(D[fm, 1])) ** 4
                rr = (refl[fm] * fres)[:, None]
                col[fm] = col[fm] * (1 - rr * 0.6) + rcol * rr
        if depth == 0:
            return col, refl
        return col

    def _trace_multi(self, O, D):
        """Trace with per-ray origins (for reflections)."""
        n = len(D)
        dx, dy, dz = D[:, 0], D[:, 1], D[:, 2]
        A = self.A
        t = np.full(n, np.inf)
        kind = np.full(n, SKY, dtype=np.int8)
        aux = np.zeros(n)
        with np.errstate(divide='ignore', invalid='ignore'):
            for side, sgn in ((0, -1), (1, 1)):
                tw = np.where(dx * sgn > 1e-7, (sgn * A - O[:, 0]) / dx, np.inf)
                yw = O[:, 1] + tw * dy
                zw = O[:, 2] + tw * dz
                hw, _ = self.height_at(side, np.where(np.isfinite(zw), zw, 0))
                ok = (tw < t) & (yw < hw)
                t[ok] = tw[ok]
                kind[ok] = WALL_L if side == 0 else WALL_R
            for kd, ze, sg in ((END_N, self.end_near, -1), (END_F, self.end_far, 1)):
                if ze is None:
                    continue
                tn = np.where(dz * sg > 1e-7, (ze - O[:, 2]) / dz, np.inf)
                xn = O[:, 0] + tn * dx
                yn = O[:, 1] + tn * dy
                ok = (tn < t) & (np.abs(xn) <= A) & (yn < 16)
                t[ok] = tn[ok]
                kind[ok] = kd
            for bi, b in enumerate(self.blades):
                ts = np.where(np.abs(dz) > 1e-7, (b['z'] - O[:, 2]) / dz, np.inf)
                ts = np.where(ts > 0.01, ts, np.inf)
                xs = O[:, 0] + ts * dx
                ys = O[:, 1] + ts * dy
                inx = ((xs > -A) & (xs < -A + b['w'])) if b['side'] == 0 else ((xs < A) & (xs > A - b['w']))
                ok = (ts < t) & inx & (ys > b['y']) & (ys < b['y'] + b['h'])
                t[ok] = ts[ok]
                kind[ok] = SIGN
                aux[ok] = bi
        P = O + D * np.where(np.isfinite(t), t, 0)[:, None]
        return dict(t=t, kind=kind, aux=aux, P=P, D=D, door=None, doors=[])

    # --------------------------------------------------------------- facades
    def _wall(self, side, Z, Y, fp, styleB):
        st = self.state
        f = self.fac[side]
        b = np.clip(np.searchsorted(f['edges'], Z) - 1, 0, len(f['h']) - 1)
        u = Z - f['z0'][b]
        bw = f['z1'][b] - f['z0'][b]
        h = f['h'][b]
        base = (f['colB'] if styleB else f['colA'])[b].copy()
        seed = f['seed'][b]
        n = len(Z)
        emi = np.zeros((n, 3))
        grime = 0.82 + 0.3 * vnoise(Z * 1.7, Y * 2.3, 3 + side)
        if styleB:
            grime *= 0.85 + 0.25 * vnoise(Z * 0.6, Y * 0.5, 9)
            stain = vnoise(Z * 0.9, Y * 3.0, 21) > 0.7
            grime = np.where(stain & (Y < h * 0.7), grime * 0.7, grime)
        alb = base * grime[:, None]
        alb *= (0.65 + 0.35 * clamp(Y / 4.0))[:, None]
        # building seams
        seam = (u < 0.07) | (u > bw - 0.07)
        alb[seam] *= 0.45
        # floors / windows
        sx, sy = f['sx'][b], f['sy'][b]
        gf = 1.75
        fl = (Y - gf) / sy
        row = np.floor(fl)
        fv = fl - row
        ncol = np.floor((bw - 0.6) / sx)
        off = (bw - ncol * sx) / 2
        cu = (u - off) / sx
        col_i = np.floor(cu)
        fu = cu - col_i
        upper = (Y > gf) & (Y < h - 0.55)
        ledge = upper & (fv < 0.06)
        ledge_sh = upper & (fv >= 0.06) & (fv < 0.11)
        alb[ledge] = alb[ledge] * 1.45 + 0.02
        alb[ledge_sh] *= 0.55
        inwin = upper & (fu > 0.22) & (fu < 0.78) & (fv > 0.3) & (fv < 0.86) & (col_i >= 0) & (col_i < ncol)
        # window frame band
        fr_u = np.minimum(fu - 0.22, 0.78 - fu) * sx
        fr_v = np.minimum(fv - 0.3, 0.86 - fv) * sy
        frame = inwin & ((fr_u < 0.045) | (fr_v < 0.045))
        glass = inwin & ~frame
        hsh = hash2(col_i + seed * 31, row + side * 101, 7)
        hsh2 = hash2(col_i + seed * 17, row, 13)
        detail = 1 - smoothstep(0.10, 0.28, fp)
        alb[frame] *= 0.5
        if not styleB:
            lit = glass & (hsh < f['lit'][b])
            dark = glass & ~lit
            tint = f['tint'][b]
            fl_ = 0.75 + 0.25 * hsh2
            # flicker of a few windows
            tt = st.get('t', 0)
            flick = (hsh2 > 0.93) & (np.sin(tt * 23 + hsh * 50) > 0.6)
            k = np.nonzero(lit)[0]
            wcol = tint[k] * (fl_[k] * np.where(flick[k], 0.25, 1.0))[:, None]
            # blinds / curtains silhouette
            blind = ((fu[k] - 0.22) / 0.56 < 0.32) & (hsh2[k] > 0.5)
            wcol[blind] *= 0.45
            stripes = (np.floor((fv[k] - 0.3) * sy[k] * 14) % 2 == 0) & (hsh2[k] < 0.2)
            wcol[stripes] *= 0.6
            emi[k] = wcol * 0.9
            alb[k] = 0.0
            kd = np.nonzero(dark)[0]
            refl_streak = ((fu[kd] + fv[kd] * 0.6) % 1.0) < 0.18
            alb[kd] = np.array([0.05, 0.06, 0.12]) + np.where(refl_streak, 0.07, 0.0)[:, None]
            emi[kd] = np.array([0.012, 0.015, 0.04])
        else:
            power = st.get('power_z', -1e9)
            lit = glass & (hsh < f['lit'][b] * 0.55) & (Z < power) & (hsh2 > 0.25)
            broken = glass & (hsh2 < 0.42) & ~lit
            boarded = glass & (hsh2 >= 0.42) & (hsh2 < 0.55) & ~lit
            dirty = glass & ~lit & ~broken & ~boarded
            k = np.nonzero(lit)[0]
            emi[k] = st.get('win_col', np.array([0.75, 0.95, 0.85])) * (0.55 + 0.4 * hsh[k])[:, None] * st.get('win_level', 1.0)
            alb[k] = 0
            kb = np.nonzero(broken)[0]
            jag = vnoise(Z[kb] * 14, Y[kb] * 14, 4) > 0.45
            alb[kb] = np.where(jag[:, None], np.array([0.01, 0.012, 0.015]), np.array([0.2, 0.26, 0.28]))
            kw = np.nonzero(boarded)[0]
            plank = (np.floor(Y[kw] * 9) % 2 == 0)
            alb[kw] = np.where(plank[:, None], np.array([0.30, 0.24, 0.18]), np.array([0.18, 0.14, 0.11]))
            kd = np.nonzero(dirty)[0]
            alb[kd] = np.array([0.16, 0.2, 0.21]) * (0.8 + 0.4 * vnoise(Z[kd] * 5, Y[kd] * 5, 2))[:, None]
        # far: blend windows to an average (anti-alias)
        far = detail < 0.999
        if far.any():
            avg = base * 0.7
            alb[far] = alb[far] * detail[far, None] + avg[far] * (1 - detail[far, None])
            if not styleB:
                emi[far] = emi[far] * detail[far, None] + (f['tint'][b][far] * f['lit'][b][far, None] * 0.18) * (1 - detail[far, None])
        # sills
        sill = upper & (fv >= 0.86) & (fv < 0.9) & (fu > 0.18) & (fu < 0.82) & (col_i >= 0) & (col_i < ncol)
        alb[sill] = alb[sill] * 1.8 + 0.03
        # pipes
        pm = f['pipe'][b] & (np.abs(u - 0.3) < 0.055) & (Y < h - 0.3)
        alb[pm] = np.array([0.22, 0.2, 0.3]) if not styleB else np.array([0.32, 0.22, 0.16])
        pm2 = pm & (np.abs(u - 0.3) < 0.02)
        alb[pm2] *= 1.6
        # fire escapes
        fe = f['fire'][b] & upper & (u > 1.0) & (u < bw - 1.0)
        plat = fe & (fv < 0.04)
        rail = fe & (fv > 0.38) & (fv < 0.41)
        bars = fe & (fv > 0.04) & (fv < 0.4) & ((u * 3.0) % 1.0 < 0.12)
        stair = fe & (np.abs(((u - 1.0) / (bw - 2.0) * 1.0) - fv) < 0.03)
        esc = plat | rail | bars | stair
        alb[esc] = np.array([0.04, 0.035, 0.06]) if not styleB else np.array([0.12, 0.09, 0.07])
        # ground floor
        gfm = Y < gf
        shop = f['shop'][b]
        if gfm.any():
            k = np.nonzero(gfm)[0]
            uu, yy, bb, ww = u[k], Y[k], b[k], bw[k]
            s = shop[k]
            a = alb[k]
            e = emi[k]
            # base band
            a[yy < 0.12] *= 0.4
            # shop window
            m1 = (s == 1) & (uu > 0.5) & (uu < ww - 1.6) & (yy > 0.3) & (yy < 1.45)
            if not styleB:
                sc = f['shopc'][bb]
                shelf = ((yy - 0.3) * 4.0) % 1.0 < 0.12
                glowv = (0.55 + 0.45 * (1 - (yy - 0.3) / 1.15))
                e1 = sc * glowv[:, None] * 0.75
                e1[shelf] *= 0.4
                e[m1] = e1[m1]
                a[m1] = 0
            else:
                plank = (np.floor(yy * 7 + np.floor(uu * 0.7)) % 2 == 0)
                a[m1] = np.where(plank[m1, None], np.array([0.30, 0.24, 0.18]), np.array([0.17, 0.13, 0.1]))
            fr1 = (s == 1) & (uu > 0.42) & (uu < ww - 1.52) & (yy > 0.22) & (yy < 1.53) & ~m1
            a[fr1] = np.array([0.05, 0.04, 0.08])
            # door of shop
            m2 = (s == 1) & (uu > ww - 1.3) & (uu < ww - 0.5) & (yy < 1.5)
            a[m2] = np.array([0.06, 0.05, 0.09])
            # rolling shutter
            m3 = (s == 0) & (uu > 0.4) & (uu < ww - 0.4) & (yy < 1.5)
            stripe = (yy * 10) % 1.0 < 0.35
            shc = np.array([0.30, 0.31, 0.42]) if not styleB else np.array([0.36, 0.30, 0.25])
            a3 = np.where(stripe[:, None], shc * 0.6, shc)
            if styleB:
                rust = vnoise(uu * 4, yy * 6, 8) > 0.6
                a3[rust] = np.array([0.35, 0.18, 0.1])
            a[m3] = a3[m3]
            top3 = (s == 0) & (uu > 0.3) & (uu < ww - 0.3) & (yy > 1.5) & (yy < 1.62)
            a[top3] = np.array([0.08, 0.07, 0.12])
            # door + lit box
            m4 = (s == 2) & (np.abs(uu - ww * 0.5) < 0.45) & (yy < 1.45)
            a[m4] = np.array([0.08, 0.06, 0.1])
            m5 = (s == 2) & (np.abs(uu - ww * 0.5) < 0.3) & (yy > 1.52) & (yy < 1.68)
            if not styleB:
                e[m5] = np.array([1.0, 0.85, 0.5]) * 0.9
            alb[k] = a
            emi[k] = e
        # roof cornice + neon trims
        corn = (Y > h - 0.35)
        alb[corn] = alb[corn] * 1.25 + 0.02
        top = Y > h - 0.1
        alb[top] *= 0.35
        if not styleB:
            tr = f['trim'][b] & (Y > h - 0.28) & (Y < h - 0.2)
            emi[tr] = f['trimc'][b][tr] * 1.0 * st.get('neon', 1.0)
        # painted neon symbols
        for sgn in self.wall_signs:
            if sgn['side'] != side:
                continue
            s = sgn['s']
            m = np.nonzero((np.abs(Z - sgn['z']) < s * 1.15) & (np.abs(Y - sgn['y']) < s * 1.15))[0]
            if len(m) == 0:
                continue
            uu = (Z[m] - sgn['z']) / s
            vv = (Y[m] - sgn['y']) / s
            if side == 0:
                uu = -uu
            lvl = st.get('sign_level', {}).get(id(sgn), st.get('neon', 1.0))
            op = st.get('eye_open', 1.0) if sgn['sym'] == 'eye' else 1.0
            d = symbol_dist(sgn['sym'], uu, vv, op)
            th = 0.075
            core = d < th
            col = sgn['col'] * (1.6 if not styleB else 0.0)
            if styleB:
                lvl = st.get('neonB', 0.0)
                col = sgn['col'] * 1.6
            e = np.zeros((len(m), 3))
            e[core] = col * lvl
            e[d < th * 0.45] = (col * 0.5 + 0.9) * lvl
            emi[m] += e
            # dead neon tubes visible when off
            alb[m[core]] = alb[m[core]] * 0.5 + 0.08
        return alb, emi

    def _endwall(self, X, Y, fp, styleB, near=True):
        st = self.state
        n = len(X)
        base = np.array([0.18, 0.2, 0.24]) if styleB else np.array([0.15, 0.12, 0.25])
        alb = np.tile(base, (n, 1)) * (0.8 + 0.3 * vnoise(X * 2, Y * 2, 31))[:, None]
        emi = np.zeros((n, 3))
        fl = (Y - 1.8) / 1.2
        row = np.floor(fl)
        fv = fl - row
        cu = (X + 3.0) / 1.0
        ci = np.floor(cu)
        fu = cu - ci
        win = (Y > 1.8) & (fu > 0.25) & (fu < 0.75) & (fv > 0.3) & (fv < 0.85)
        alb[win] = np.array([0.03, 0.035, 0.05])
        hh = hash2(ci, row, 99)
        if styleB:
            power = st.get('power_z', -1e9)
            if (near and power > 50) or (not near and power > 70):
                lw = win & (hh < 0.25)
                emi[lw] = np.array([0.7, 0.9, 0.8]) * 0.6
        alb[Y < 1.6] = alb[Y < 1.6] * 0.6
        if near and self.end_near is not None:
            x0, x1, y0, y1 = self.screen_rect
            bez = (X > x0 - 0.25) & (X < x1 + 0.25) & (Y > y0 - 0.25) & (Y < y1 + 0.25)
            alb[bez] = np.array([0.02, 0.02, 0.03])
            inside = (X > x0) & (X < x1) & (Y > y0) & (Y < y1)
            scr = st.get('screen')
            k = np.nonzero(inside)[0]
            if scr is not None and scr.get('dynamic'):
                uu = (X[k] - x0) / (x1 - x0)
                if not scr.get('flip', True):
                    uu = 1 - uu
                vv = (y1 - Y[k]) / (y1 - y0)
                alb[k] = 0
                emi[k] = 0
                self._scr_uv = (k, uu, vv)
            elif scr is None or scr.get('level', 0) <= 0:
                # dead screen: dark glass with a faint diagonal sheen
                sheen = ((X[k] * 0.4 + Y[k] * 0.25) % 1.0) < 0.06
                alb[k] = np.array([0.02, 0.025, 0.035])
                emi[k] = np.where(sheen[:, None], np.array([0.03, 0.04, 0.05]), np.array([0.005, 0.006, 0.01]))
                if scr is not None and scr.get('standby', 0) > 0:
                    # tiny standby LED (hidden detail)
                    led = (np.abs(X[k] - (x1 - 0.25)) < 0.09) & (np.abs(Y[k] - (y0 + 0.2)) < 0.09)
                    emi[k[led]] = np.array([1.0, 0.1, 0.15]) * scr['standby']
            else:
                tex = scr['tex']
                th_, tw_ = tex.shape[:2]
                uu = (X[k] - x0) / (x1 - x0)
                if scr.get('flip', True):
                    pass
                else:
                    uu = 1 - uu
                vv = (y1 - Y[k]) / (y1 - y0)
                ti = np.clip((vv * th_).astype(int), 0, th_ - 1)
                tj = np.clip((uu * tw_).astype(int), 0, tw_ - 1)
                c = tex[ti, tj]
                # LED grid structure
                gu = (uu * tw_) % 1.0
                gv = (vv * th_) % 1.0
                led = 1.0 - 0.45 * scr.get('led', 1.0) * ((gu < 0.16) | (gv < 0.16))
                led = np.where(fp[k] < (x1 - x0) / tw_ * 0.7, led, 1.0)
                alb[k] = 0
                emi[k] = c * (led * scr['level'])[:, None]
        return alb, emi

    def _blade(self, bi, P, styleB):
        st = self.state
        n = len(bi)
        alb = np.zeros((n, 3))
        emi = np.zeros((n, 3))
        for k in np.unique(bi):
            b = self.blades[k]
            m = np.nonzero(bi == k)[0]
            X, Y = P[m, 0], P[m, 1]
            A = self.A
            uu = (X + A) if b['side'] == 0 else (A - X)
            uu = uu / b['w']
            vv = (Y - b['y']) / b['h']
            a = np.tile(np.array([0.05, 0.04, 0.08]) if not styleB else np.array([0.12, 0.13, 0.13]), (len(m), 1))
            # bracket near wall
            a[uu < 0.08] = np.array([0.1, 0.1, 0.14])
            border = (np.minimum(np.minimum(uu - 0.12, 0.95 - uu), np.minimum(vv - 0.05, 0.95 - vv)) < 0.045) & \
                     (uu > 0.12) & (uu < 0.95) & (vv > 0.05) & (vv < 0.95)
            su = (uu - 0.535) / 0.38
            sv = (vv - 0.5) / 0.38 * (b['h'] / b['w'])
            sv = sv / (b['h'] / b['w'])
            d = symbol_dist(b['sym'], su * 1.0, sv * (b['h'] / b['w']) * 0.55, 1.0)
            core = d < 0.11
            lvl = st.get('neon', 1.0) if not styleB else st.get('neonB', 0.0)
            flick = st.get('blade_flick', {}).get(k, 1.0)
            e = np.zeros((len(m), 3))
            e[border] = b['col'] * 1.2 * lvl * flick
            e[core] = b['col'] * 1.7 * lvl * flick
            e[core & (d < 0.05)] = (b['col'] * 0.5 + 0.9) * lvl * flick
            a[border | core] = a[border | core] + 0.12
            alb[m] = a
            emi[m] = e
        return alb, emi

    def _floor(self, X, Z, fp, styleB):
        st = self.state
        n = len(X)
        A, wk = self.A, self.walk
        ax = np.abs(X)
        road = ax < A - wk
        alb = np.zeros((n, 3))
        emi = np.zeros((n, 3))
        refl = np.zeros(n)
        detail = 1 - smoothstep(0.06, 0.2, fp)
        if not styleB:
            asphalt = np.array([0.15, 0.13, 0.21])
            sidew = np.array([0.24, 0.22, 0.32])
        else:
            asphalt = np.array([0.22, 0.24, 0.24])
            sidew = np.array([0.34, 0.36, 0.35])
        nz = vnoise(X * 4.0, Z * 4.0, 1)
        alb[road] = asphalt * (0.75 + 0.5 * nz[road])[:, None]
        # sidewalk tiles
        sw = ~road
        tz = (Z / 0.6) % 1.0
        tx = ((ax - (A - wk)) / 0.475) % 1.0
        grout = ((tz < 0.07) | (tx < 0.07)) & sw & (detail > 0.3)
        alb[sw] = sidew * (0.85 + 0.3 * hash2(np.floor(Z / 0.6), np.floor(ax / 0.475), 4)[sw])[:, None]
        alb[grout] *= 0.6
        curb = (ax > A - wk - 0.09) & (ax < A - wk + 0.05)
        alb[curb] = sidew * 1.5
        gutter = (ax > A - wk - 0.25) & (ax <= A - wk - 0.09)
        alb[gutter] *= 0.55
        # centre dashes
        dash = (np.abs(X) < 0.07) & ((Z / 3.0) % 1.0 < 0.45)
        alb[dash] = np.array([0.6, 0.55, 0.42]) * (0.55 if styleB else 0.8)
        # manholes
        for mz, mx in ((9.0, 0.9), (27.0, -0.8), (51.0, 0.7), (-8.0, -0.9)):
            r = np.hypot(X - mx, Z - mz)
            ring = (r < 0.42) & (r > 0.34)
            alb[ring] *= 0.45
            grid = (r < 0.34) & (((X - mx) * 8) % 1.0 < 0.3)
            alb[grid] *= 0.7
        if not styleB:
            refl[road] = 0.32
            refl[sw] = 0.16
            pud = fbm(X * 0.55 + 3.1, Z * 0.32, 77) > 0.6
            pud &= road | (ax < A - 0.2)
            alb[pud] *= 0.35
            refl[pud] = 0.95
            # rain splash sparkle on puddles
            if st.get('rain', 0) > 0:
                tt = st['t']
                cell_x = np.floor(X * 3.0)
                cell_z = np.floor(Z * 3.0)
                ph = hash2(cell_x, cell_z, 41)
                age = (tt * 1.3 + ph * 7.0) % 1.0
                cx = (cell_x + 0.5) / 3.0
                cz = (cell_z + 0.5) / 3.0
                rr = np.hypot(X - cx, (Z - cz))
                ring = pud & (np.abs(rr - age * 0.16) < 0.018) & (age < 0.6) & (detail > 0.5)
                emi[ring] += np.array([0.10, 0.12, 0.2]) * st['rain']
        else:
            # dust, cracks and debris
            crack = np.abs(vnoise(X * 1.5, Z * 1.5, 61) - 0.5) < 0.018
            alb[crack & road] *= 0.45
            deb = (hash2(np.floor(X * 6), np.floor(Z * 6), 62) > 0.985) & (detail > 0.4)
            alb[deb] = np.array([0.55, 0.55, 0.5])
            weed = (ax > A - wk - 0.2) & (ax < A - wk + 0.1) & (hash2(np.floor(Z * 8), 1, 63) > 0.8)
            alb[weed] = np.array([0.12, 0.3, 0.15])
            refl[:] = 0.03
        return alb, emi, refl

    def _sky(self, D, styleB):
        st = self.state
        n = len(D)
        el = np.arcsin(clamp(D[:, 1], -1, 1))
        az = np.arctan2(D[:, 0], D[:, 2])
        if not styleB:
            hor = np.array([0.30, 0.07, 0.30])
            mid = np.array([0.12, 0.05, 0.22])
            zen = np.array([0.03, 0.02, 0.07])
        else:
            hor = np.array([0.18, 0.24, 0.25])
            mid = np.array([0.07, 0.10, 0.12])
            zen = np.array([0.02, 0.03, 0.045])
        k1 = clamp(el / 0.25)[:, None]
        k2 = clamp((el - 0.25) / 0.6)[:, None]
        col = hor * (1 - k1) + mid * k1
        col = col * (1 - k2) + zen * k2
        # distant skyline
        bins = np.floor(az / 0.03)
        hb = 0.025 + 0.16 * hash1(bins, 5) ** 2
        tower = el < hb
        tc = np.array([0.06, 0.035, 0.11]) if not styleB else np.array([0.08, 0.1, 0.11])
        col[tower] = tc
        if not styleB:
            wx = np.floor(az / 0.006)
            wy = np.floor(el / 0.006)
            dots = tower & (hash2(wx, wy, 6) > 0.86) & ((az / 0.006) % 1 < 0.6) & ((el / 0.006) % 1 < 0.6)
            dc = np.where((hash2(wx, wy, 8) > 0.5)[:, None], np.array([0.9, 0.7, 0.4]), np.array([0.4, 0.9, 1.0]))
            col[dots] = dc[dots] * 0.55
        # radio tower with blinking red light, straight down the street
        at = 0.0
        da = np.abs(np.angle(np.exp(1j * (az - at))))
        etop = 0.205
        mast = (da < 0.0035 + 0.006 * clamp((etop - el) / etop)) & (el < etop) & (el > 0)
        lattice = mast & ((((el * 400).astype(int) + (az * 900).astype(int)) % 3) != 0)
        col[lattice] = np.array([0.02, 0.015, 0.04])
        tl = st.get('tower', 0.0)
        bulb = (da < 0.005) & (np.abs(el - (etop + 0.004)) < 0.005)
        col[bulb] = np.array([1.0, 0.1, 0.12]) * (0.25 + 1.6 * tl) if not styleB else np.array([0.2, 0.05, 0.05])
        # stars in the dead city
        if styleB:
            sx_ = np.floor(az / 0.004)
            sy_ = np.floor(el / 0.004)
            star = (el > 0.15) & (hash2(sx_, sy_, 3) > 0.993)
            col[star] = np.array([0.7, 0.8, 0.85])
        # lightning
        lb = st.get('bolt', 0.0)
        if lb > 0:
            col = col + np.array([0.5, 0.45, 0.8]) * lb * 0.6
            e = el
            xb = 0.06 + 0.035 * np.sin(e * 55) + 0.02 * np.sin(e * 130 + 1)
            bolt = (np.abs(az - xb) < 0.004) & (el > 0.08) & (el < 0.6)
            col[bolt] = np.array([1.0, 1.0, 1.0]) * (1 + lb)
        return col * st.get('sky_level', 1.0)

    # --------------------------------------------------------------- door shade
    def _door_shade(self, hit, alb, emi, nrm, door, dres, sel):
        st = self.state
        kind = hit['kind']
        tt = door['t']
        glowl = door.get('glow', 1.0)
        tint = np.asarray(door.get('tint', (1.0, 1.0, 1.0)), float)
        mf = np.nonzero((kind == DOOR_FRAME) & sel)[0]
        if len(mf):
            u = dres['u'][mf]
            v = dres['v'][mf]
            alb[mf] = np.array([0.1, 0.08, 0.15])
            nrm[mf] = (0, 0, -1)
            inner, hw, top = self.door_shape(u, v, door, grow=0.035)
            edge = ~inner
            ph = (v * 1.3 - tt * 1.7) % 1.0
            c1 = np.array([0.25, 1.0, 0.95])
            c2 = np.array([1.0, 0.35, 0.85])
            cc = c1 * (1 - ph[:, None]) + c2 * ph[:, None]
            outer, _, _ = self.door_shape(u, v, door, grow=0.12)
            neon = inner | ~outer
            e = np.where(neon[:, None], cc * (1.2 + 0.8 * glowl), cc * 0.15 * glowl)
            emi[mf] = e * tint
        mp = np.nonzero((kind == DOOR_PANEL) & sel)[0]
        if len(mp):
            a = dres['pa'][mp]
            v = dres['pv'][mp]
            nrm[mp] = (0, 0, -1)
            uu = (a - 0.5) * 2
            vv = (v - 0.5) * 2
            r = np.maximum(np.abs(uu) * 1.0, np.abs(vv) * 0.55)
            rings = ((r * 4.0 - tt * 1.2) % 1.0)
            band = rings < 0.35
            base = np.array([0.08, 0.02, 0.2])
            cA = np.array([0.15, 0.9, 1.0])
            cB = np.array([0.95, 0.25, 0.85])
            mix = (0.5 + 0.5 * np.sin(tt * 3.66 + r * 3.0))[:, None]
            cc = cA * mix + cB * (1 - mix)
            e = base + np.where(band[:, None], cc * 0.9, cc * 0.28)
            # sparkles
            sp = hash2(np.floor(uu * 18), np.floor(vv * 30) + np.floor(tt * 12) * 7, 5) > 0.96
            e[sp] = np.array([1.0, 1.0, 1.0])
            # eye glyph in the centre
            d = symbol_dist('eye', uu * 1.6, (vv + 0.05) * 1.6 * 1.9, door.get('eye', 0.0))
            e[(d < 0.12) & (door.get('eye', 0.0) > 0.05)] = np.array([1.0, 0.95, 1.0])
            back = ~dres['front'][mp]
            e[back] *= 0.25
            alb[mp] = 0.0
            emi[mp] = (e * glowl * (1 + door.get('white', 0.0) * 2) + door.get('white', 0.0) * 1.5) * tint
