"""Procedural pixel-art characters: an analytic 3D puppet (spheres,
ellipsoids, capsules) ray-cast orthographically straight onto the pixel
grid, then lit by the scene lights, cel-banded and outlined."""
import numpy as np
from scipy import ndimage
from core import hexc, clamp, W, H, hash2
from world import symbol_dist

SKIN, HAIR, JACKET, PANTS, SHOE, SOLE, SIL, HOOD, NOSE, SILEYE = range(10)

MAT = {
    SKIN: hexc('d99068'), HAIR: hexc('1c1433'), JACKET: hexc('e06a18'), PANTS: hexc('2b2a52'),
    SHOE: hexc('dfe6f5'), SOLE: hexc('22d3d0'), SIL: hexc('07040d'), HOOD: hexc('a3420c'),
    NOSE: hexc('d99068'), SILEYE: hexc('ffffff'),
}


def rx(v, a):
    c, s = np.cos(a), np.sin(a)
    x, y, z = v
    return np.array([x, y * c - z * s, y * s + z * c])


def rz(v, a):
    c, s = np.cos(a), np.sin(a)
    x, y, z = v
    return np.array([x * c - y * s, x * s + y * c, z])


def limb_dir(fwd, side_splay=0.0):
    """Unit vector pointing 'down' a limb rotated forward by fwd (around x) and
    outwards by side_splay (around z)."""
    d = np.array([0.0, -1.0, 0.0])
    d = rx(d, -fwd)            # positive fwd -> towards +z
    d = rz(d, side_splay)
    return d


def build(p):
    """Return the primitive list for a pose dictionary p."""
    sil = p.get('sil', False)
    Hh = 2.05 if sil else 1.75
    s = Hh / 1.75
    ph = p.get('phase', 0.0)
    wa = p.get('walk', 0.0)
    ra = p.get('run', 0.0)
    lean = p.get('lean', 0.0) + 0.25 * ra
    amp = 0.42 * wa + 0.85 * ra
    bob = (0.022 * wa + 0.05 * ra) * np.abs(np.cos(ph))
    crouch = p.get('crouch', 0.0)
    pelvis = np.array([0.0, 0.95 * s + bob - crouch * 0.12, 0.0])
    up = rx(np.array([0, 1.0, 0]), lean)
    chest = pelvis + up * 0.36 * s
    neck = chest + up * 0.16 * s
    shrug = p.get('shrug', 0.0)
    head_c = neck + np.array([0, 0.13 * s, 0.015 * s]) + up * 0.0
    hr = 0.112 * s if not sil else 0.10 * s
    prims = []

    def cap(a, b, r, m):
        prims.append(('cap', np.array(a, float), np.array(b, float), r, m))

    def sph(c, r, m):
        prims.append(('sph', np.array(c, float), r, m))

    def ell(c, rad, m):
        prims.append(('ell', np.array(c, float), np.array(rad, float), m))

    # ---- legs
    kb = 0.75 * wa + 1.3 * ra
    for side, sgn in (('L', -1), ('R', 1)):
        phl = ph + (0 if side == 'L' else np.pi)
        a = amp * np.sin(phl) + p.get('leg_' + side, 0.0)
        b = kb * max(0.0, np.cos(phl)) ** 1.5 + 0.08 + crouch * 0.6
        hip = pelvis + np.array([sgn * 0.09 * s, -0.03 * s, 0])
        knee = hip + limb_dir(a, sgn * 0.03) * 0.43 * s
        ankle = knee + limb_dir(a - b, sgn * 0.01) * 0.43 * s
        toe = ankle + np.array([0, -0.035 * s, 0.12 * s])
        if sil:
            cap(hip, knee, 0.06 * s, SIL)
            cap(knee, ankle, 0.045 * s, SIL)
            cap(ankle, toe, 0.04 * s, SIL)
        else:
            cap(hip, knee, 0.072, PANTS)
            cap(knee, ankle, 0.06, PANTS)
            ell((ankle + toe) / 2 + np.array([0, -0.005, 0.0]), (0.062, 0.05, 0.11), SHOE)
            ell((ankle + toe) / 2 + np.array([0, -0.04, 0.0]), (0.064, 0.022, 0.115), SOLE)
    # ---- torso
    if sil:
        ell(pelvis + up * 0.2 * s, (0.17 * s, 0.33 * s, 0.11 * s), SIL)
        # long coat flaring down to the knees
        coat_c = pelvis + np.array([0, -0.18 * s, 0])
        ell(coat_c, (0.2 * s, 0.32 * s, 0.13 * s), SIL)
        cap(chest + np.array([-0.17 * s, 0.07 * s, 0]), chest + np.array([0.17 * s, 0.07 * s, 0]), 0.07 * s, SIL)
        cap(chest, head_c, 0.045 * s, SIL)
    else:
        ell(pelvis + up * 0.21, (0.185, 0.27, 0.125), JACKET)
        ell(pelvis + np.array([0, 0.0, 0]), (0.155, 0.11, 0.11), PANTS)
        cap(chest + np.array([-0.17, 0.08 + shrug * 0.04, 0]), chest + np.array([0.17, 0.08 + shrug * 0.04, 0]), 0.075, JACKET)
        ell(neck + np.array([0, -0.02, -0.075]), (0.135, 0.07, 0.075), HOOD)
        cap(neck - up * 0.03, head_c - up * 0.05, 0.045, SKIN)
    # ---- arms
    for side, sgn in (('L', -1), ('R', 1)):
        phl = ph + (np.pi if side == 'L' else 0)
        arm = p.get('arm_' + side)
        if arm is None:
            fa = (0.35 * wa + 0.9 * ra) * np.sin(phl)
            el = 0.25 + 0.35 * wa + 1.2 * ra
            spl = 0.12 + 0.1 * ra
        else:
            fa, spl, el = arm
        sh = chest + np.array([sgn * (0.2 * s), 0.07 * s + shrug * 0.04, 0])
        elb = sh + limb_dir(fa, sgn * spl) * 0.28 * s
        wr = elb + limb_dir(fa + el, sgn * spl * 0.6) * 0.27 * s
        if sil:
            cap(sh, elb, 0.045 * s, SIL)
            cap(elb, wr, 0.038 * s, SIL)
            # long fingers
            cap(wr, wr + limb_dir(fa + el, sgn * spl * 0.6) * 0.12 * s, 0.025 * s, SIL)
        else:
            cap(sh, elb, 0.058, JACKET)
            cap(elb, wr, 0.05, JACKET)
            sph(wr + limb_dir(fa + el, 0) * 0.045, 0.045, SKIN)
    # ---- head
    if sil:
        sph(head_c, hr, SIL)
        ell(head_c + np.array([0, 0.03 * s, -0.02 * s]), (hr * 1.08, hr * 1.12, hr * 1.05), SIL)
    else:
        sph(head_c, hr, SKIN)
        ell(head_c + np.array([0, 0.03, -0.03]), (hr * 1.07, hr * 1.06, hr * 1.02), HAIR)
        # cowlick tufts (signature silhouette)
        sph(head_c + np.array([0.03, hr * 1.02, -0.05]), 0.035, HAIR)
        sph(head_c + np.array([-0.045, hr * 0.95, -0.075]), 0.03, HAIR)
        sph(head_c + np.array([0.0, hr * 0.7, -0.115]), 0.04, HAIR)
        sph(head_c + np.array([0, -hr * 0.12, hr * 0.98]), hr * 0.17, NOSE)
    return prims, head_c, hr, Hh


# ------------------------------------------------------------------ ray tests
def _sph(x, y, c, r):
    dx = x - c[0]
    dy = y - c[1]
    h = r * r - dx * dx - dy * dy
    ok = h > 0
    z = c[2] - np.sqrt(np.maximum(h, 0))
    n = np.stack([dx, dy, z - c[2]], -1) / r
    return np.where(ok, z, np.inf), n


def _ell(x, y, c, rad, Rt):
    # ray o=(x,y,-10) d=(0,0,1); transform into ellipsoid unit-sphere space
    o = np.stack([x - c[0], y - c[1], np.full_like(x, -10.0 - c[2])], -1) @ Rt.T / rad
    d = (Rt @ np.array([0, 0, 1.0])) / rad
    a = d @ d
    b = o @ d
    cc = np.einsum('ij,ij->i', o, o) - 1
    h = b * b - a * cc
    ok = h > 0
    tt = (-b - np.sqrt(np.maximum(h, 0))) / a
    p = o + tt[:, None] * d
    n = (p / rad) @ Rt
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
    z = -10.0 + tt
    return np.where(ok, z, np.inf), n


def _cap(x, y, pa, pb, r):
    ro = np.stack([x, y, np.full_like(x, -10.0)], -1)
    rd = np.array([0, 0, 1.0])
    ba = pb - pa
    oa = ro - pa
    baba = ba @ ba
    bard = ba @ rd
    baoa = oa @ ba
    rdoa = oa @ rd
    oaoa = np.einsum('ij,ij->i', oa, oa)
    a = baba - bard * bard
    b = baba * rdoa - baoa * bard
    c = baba * oaoa - baoa * baoa - r * r * baba
    h = b * b - a * c
    t = np.full(len(x), np.inf)
    ok = h >= 0
    with np.errstate(divide='ignore', invalid='ignore'):
        tb = (-b - np.sqrt(np.maximum(h, 0))) / (a if abs(a) > 1e-12 else 1e-12)
    yy = baoa + tb * bard
    body = ok & (yy > 0) & (yy < baba)
    t[body] = tb[body]
    # caps
    for end, sel in ((pa, yy <= 0), (pb, yy >= baba)):
        oc = ro - end
        b2 = oc @ rd
        c2 = np.einsum('ij,ij->i', oc, oc) - r * r
        h2 = b2 * b2 - c2
        m = ok & sel & (h2 > 0)
        tc = -b2 - np.sqrt(np.maximum(h2, 0))
        t[m] = np.minimum(t[m], tc[m])
    p = ro + np.where(np.isfinite(t), t, 0)[:, None] * rd
    s = clamp(((p - pa) @ ba) / baba)
    q = pa + s[:, None] * ba
    n = (p - q) / r
    return np.where(np.isfinite(t), -10.0 + t, np.inf), n


def _roty(v, th):
    c, s = np.cos(th), np.sin(th)
    v = np.asarray(v, float)
    return np.array([v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c])


def raster(pose, theta, ppu, ax, ay, roll=0.0, head_look=(0.0, 0.0), face=None,
           extent=None, window=None):
    """Ray-cast the puppet on an integer pixel grid.  (ax, ay) = screen position
    of the feet, ppu = pixels per world unit.  Returns a dict or None."""
    prims, head_c, hr, Hh = build(pose)
    ext = extent or (0.75 * Hh / 1.75, Hh + 0.15)
    x0 = int(np.floor(ax - ext[0] * ppu)) - 2
    x1 = int(np.ceil(ax + ext[0] * ppu)) + 2
    y0 = int(np.floor(ay - ext[1] * ppu)) - 2
    y1 = int(np.ceil(ay + 0.12 * ppu)) + 2
    if window is not None:
        x0, y0 = max(x0, window[0]), max(y0, window[1])
        x1, y1 = min(x1, window[2]), min(y1, window[3])
    gw, gh = x1 - x0, y1 - y0
    if gw <= 2 or gh <= 2 or gw * gh > 2_500_000:
        return None
    jj, ii = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
    lx = (jj - ax) / ppu
    ly = (ay - ii) / ppu
    if roll:
        c, s = np.cos(-roll), np.sin(-roll)
        lx, ly = lx * c - ly * s, lx * s + ly * c
    x = lx.ravel()
    y = ly.ravel()
    n = len(x)
    zbest = np.full(n, np.inf)
    nb = np.zeros((n, 3))
    mb = np.full(n, -1, dtype=np.int16)
    c_t, s_t = np.cos(theta), np.sin(theta)
    Rt = np.array([[c_t, 0, s_t], [0, 1, 0], [-s_t, 0, c_t]])   # local -> cam
    for pr in prims:
        if pr[0] == 'sph':
            c = _roty(pr[1], theta)
            # quick bbox reject
            z, nn = _sph(x, y, c, pr[2])
            m = pr[3]
        elif pr[0] == 'ell':
            c = _roty(pr[1], theta)
            z, nn = _ell(x, y, c, pr[2], Rt.T)
            m = pr[3]
        else:
            z, nn = _cap(x, y, _roty(pr[1], theta), _roty(pr[2], theta), pr[3])
            m = pr[4]
        better = z < zbest
        if better.any():
            zbest[better] = z[better]
            nb[better] = nn[better]
            mb[better] = m
    hit = np.isfinite(zbest)
    if not hit.any():
        return None
    # local (character) coordinates of each hit point for material detail
    P = np.stack([x, y, np.where(hit, zbest, 0)], -1)
    Pl = P @ Rt          # cam -> local (Rt orthonormal: local = Rt^T cam -> row form P @ Rt)
    alb = np.zeros((n, 3))
    emi = np.zeros((n, 3))
    for k, col in MAT.items():
        alb[mb == k] = col
    hc = head_c
    # ---- head details
    hm = (mb == SKIN) | (mb == HAIR)
    if hm.any():
        q = (Pl[hm] - hc) / hr
        yaw, pit = head_look
        cy, sy = np.cos(-yaw), np.sin(-yaw)
        q = np.stack([q[:, 0] * cy + q[:, 2] * sy, q[:, 1], -q[:, 0] * sy + q[:, 2] * cy], -1)
        cp, sp = np.cos(-pit), np.sin(-pit)
        q = np.stack([q[:, 0], q[:, 1] * cp - q[:, 2] * sp, q[:, 1] * sp + q[:, 2] * cp], -1)
        mloc = mb[hm]
        a = alb[hm]
        e = emi[hm]
        on_head = np.linalg.norm(q, axis=1) < 1.25
        hairline = 0.4 + 0.07 * np.sin(q[:, 0] * 17)
        is_hair = (q[:, 2] < -0.1) | (q[:, 1] > hairline) | ((np.abs(q[:, 0]) > 0.8) & (q[:, 1] > -0.05))
        skin_here = (mloc == SKIN) & on_head & (np.linalg.norm(q, axis=1) < 1.05)
        a[skin_here & is_hair] = MAT[HAIR]
        face_m = skin_here & ~is_hair & (q[:, 2] > 0.2)
        fd = face or {}
        blink = fd.get('blink', 0.0)
        gx, gy = fd.get('gaze', (0.0, 0.0))
        for sgn in (-1, 1):
            ex = q[:, 0] - sgn * 0.36
            ey = q[:, 1] - 0.05
            eh = 0.115 * (1 - blink) + 0.012
            eye = face_m & ((ex / 0.165) ** 2 + (ey / eh) ** 2 < 1)
            a[eye] = hexc('eef3ff')
            ir = eye & ((ex - gx * 0.07) ** 2 + (ey - gy * 0.05) ** 2 < 0.085 ** 2)
            a[ir] = hexc('130d24')
            if fd.get('glint', 0) > 0:
                gl = eye & ((ex - gx * 0.07 + 0.03) ** 2 + (ey - gy * 0.05 - 0.035) ** 2 < 0.03 ** 2)
                e[gl] = np.array([1.0, 0.15, 0.2]) * fd['glint']
            if blink > 0.6:
                lid = face_m & (np.abs(ey) < 0.03) & (np.abs(ex) < 0.16)
                a[lid] = hexc('7a4028')
            brow = face_m & (((q[:, 0] - sgn * 0.36) / 0.18) ** 2 + ((q[:, 1] - 0.27 - fd.get('brow', 0.0) * 0.06) / 0.045) ** 2 < 1)
            a[brow] = MAT[HAIR]
        mo = fd.get('mouth', 0.0)
        mouth = face_m & (np.abs(q[:, 0]) < 0.15 - mo * 0.04) & (np.abs(q[:, 1] + 0.43) < 0.03 + mo * 0.05)
        a[mouth] = hexc('4a2418')
        alb[hm] = a
        emi[hm] = e
    # ---- jacket details
    jm = mb == JACKET
    if jm.any():
        pl = Pl[jm]
        a = alb[jm]
        e = emi[jm]
        zip_ = (np.abs(pl[:, 0]) < 0.014) & (pl[:, 2] > 0) & (pl[:, 1] < 1.33)
        a[zip_] = hexc('ffc35a')
        hem = (pl[:, 1] < 0.86)
        a[hem] = a[hem] * 0.7
        # reflective eye patch on the back (hidden detail)
        bk = pl[:, 2] < -0.02
        uu = pl[:, 0] / 0.085
        vv = (pl[:, 1] - 1.2) / 0.085
        d = symbol_dist('eye', uu, vv * 1.6, 1.0)
        patch = bk & (d < 0.16) & (np.abs(uu) < 1.2) & (np.abs(vv) < 1.2)
        a[patch] = hexc('c4fff8')
        e[patch] = hexc('22d3d0') * 0.25
        alb[jm] = a
        emi[jm] = e
    if pose.get('sil'):
        # glowing eyes
        hs = mb == SIL
        q = (Pl - hc) / hr
        for sgn in (-1, 1):
            ey_ = hs & (np.abs(q[:, 0] - sgn * 0.33) < 0.16) & (np.abs(q[:, 1] - 0.05) < 0.09) & (q[:, 2] > 0.5)
            emi[ey_] = pose.get('eye_col', np.array([1.0, 0.95, 1.0])) * pose.get('eye_lvl', 1.6)
    return dict(x0=x0, y0=y0, w=gw, h=gh, hit=hit.reshape(gh, gw), z=zbest.reshape(gh, gw),
                n=nb.reshape(gh, gw, 3), alb=alb.reshape(gh, gw, 3), emi=emi.reshape(gh, gw, 3),
                mat=mb.reshape(gh, gw), P=P.reshape(gh, gw, 3), Hh=Hh)


def edges_and_outline(spr):
    hit = spr['hit']
    z = np.where(hit, spr['z'], 1e3)
    # internal depth edges
    edge = np.zeros_like(hit)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        zn = np.roll(np.roll(z, dy, 0), dx, 1)
        edge |= hit & (z - zn > 0.07)
    outline = ndimage.binary_dilation(hit, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], bool)) & ~hit
    return edge, outline
