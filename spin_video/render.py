#!/usr/bin/env python3
"""Rendu d'une vidéo TikTok (1080x1920, 30 fps, 68 s) « TOURNE LA ROUE » :
roulette + maths + sonification. Usage : python3 render.py OUT.mp4"""
import math, os, sys, subprocess, wave
from multiprocessing import Pool
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FPS = 30
W, H = 1080, 1920
SS = 2                              # supersampling
K = W * SS / 576.0                  # coord. de design (576 de large) -> pixels SS
INTRO, SPIN_LEN, NSPIN, OUTRO = 3.0, 7.5, 8, 5.0
DURATION = INTRO + SPIN_LEN * NSPIN + OUTRO          # 68 s
NFRAMES = int(round(DURATION * FPS))
T_BET, T_LAND = 0.7, 5.0            # phases dans un tour

FI = "/usr/share/fonts/opentype/inter/"
FD = "/usr/share/fonts/truetype/dejavu/"
_fc = {}
def font(name, size):
    key = (name, size)
    if key not in _fc:
        path = {"black": FI + "Inter-Black.otf", "xb": FI + "Inter-ExtraBold.otf",
                "bold": FI + "Inter-Bold.otf", "semi": FI + "Inter-SemiBold.otf",
                "med": FI + "Inter-Medium.otf", "serif": FD + "DejaVuSerif.ttf",
                "mono": FD + "DejaVuSansMono-Bold.ttf"}[name]
        _fc[key] = ImageFont.truetype(path, max(1, int(round(size * K))))
    return _fc[key]

def P(x):
    return x * K

# ---------------------------------------------------------------- roulette
ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
         5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
REDS = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}
STEP = 2 * math.pi / 37
def pocket_angle(n):
    return ORDER.index(n) * STEP
def num_color(n):
    if n == 0:
        return (34, 150, 80)
    return (214, 40, 57) if n in REDS else (24, 24, 28)

RED = (232, 57, 72); BLUE = (55, 112, 235); GOLD = (214, 166, 44)
YEL = (246, 199, 68); CYAN = (110, 235, 245); WHITE = (255, 255, 255)
GREEN = (74, 201, 118); ORANGE = (244, 160, 60); LAV = (186, 176, 255)

# ---------------------------------------------------------------- scénario
STAKE = 10
def F(a, b):
    return ("f", a, b)
SPINS = [
    dict(name="NOIR", cells=[n for n in range(1, 37) if n not in REDS], pay=1, res=22,
         stat="48,6 %", sub="18 cases sur 37",
         f1=[("i", "P"), ("r", "(noir) = "), F("18", "37"), ("r", " = 48,6 %")],
         f2=[("r", "18 rouges, 18 noirs, 1 zéro vert")],
         tag="rouge ou noir : jamais 50/50", pill="UN POINT PAR BONNE RÉPONSE"),
    dict(name="IMPAIR", cells=[n for n in range(1, 37) if n % 2], pay=1, res=0,
         stat="48,6 %", sub="18 cases sur 37",
         f1=[("i", "P"), ("r", "(impair) = "), F("18", "37"), ("r", " = 48,6 %")],
         f2=[("i", "E"), ("r", " = "), F("18", "37"), ("r", "(+1) + "), F("19", "37"),
             ("r", "(−1) = −"), F("1", "37")],
         tag="le zéro n'est ni pair ni impair", pill="ZÉRO. LA BANQUE GAGNE."),
    dict(name="13 À 24", cells=list(range(13, 25)), pay=2, res=17,
         stat="32,4 %", sub="12 cases sur 37",
         f1=[("i", "P"), ("r", "(13–24) = "), F("12", "37"), ("r", " = 32,4 %")],
         f2=[("r", "paie 2:1 :  "), F("12", "37"), ("r", "·2 − "), F("25", "37"),
             ("r", " = −"), F("1", "37")],
         tag="autre forme, même avantage", pill="+20 JETONS"),
    dict(name="CHEVAL 8/11", cells=[8, 11], pay=17, res=10,
         stat="5,4 %", sub="2 cases sur 37",
         f1=[("i", "P"), ("r", "(cheval) = "), F("2", "37"), ("r", " = 5,4 %")],
         f2=[("r", "paie 17:1 :  "), F("2", "37"), ("r", "·17 − "), F("35", "37"),
             ("r", " = −"), F("1", "37")],
         tag="gros gain, même −1/37", pill="UNE CASE À CÔTÉ"),
    dict(name="SIXAIN 25–30", cells=list(range(25, 31)), pay=5, res=26,
         stat="16,2 %", sub="6 cases sur 37",
         f1=[("i", "P"), ("r", "(sixain) = "), F("6", "37"), ("r", " = 16,2 %")],
         f2=[("r", "paie 5:1 :  "), F("6", "37"), ("r", "·5 − "), F("31", "37"),
             ("r", " = −"), F("1", "37")],
         tag="l'avantage ne bouge jamais", pill="+50 JETONS"),
    dict(name="COLONNE 3", cells=list(range(3, 37, 3)), pay=2, res=14,
         stat="32,4 %", sub="12 cases sur 37",
         f1=[("i", "P"), ("r", "(col 3) = "), F("12", "37"), ("r", " = 32,4 %")],
         f2=[("r", "3, 6, 9, …, 36 :  "), ("i", "n"), ("r", " ≡ 0 (mod 3)")],
         tag="une colonne, c'est juste mod 3", pill="PLUS QUE DEUX VIES"),
    dict(name="19 À 36", cells=list(range(19, 37)), pay=1, res=31,
         stat="48,6 %", sub="18 cases sur 37",
         f1=[("i", "P"), ("r", "(19–36) = "), F("18", "37"), ("r", " = 48,6 %")],
         f2=[("i", "P"), ("r", "(A | B) = "), ("i", "P"), ("r", "(A)  : tirages indépendants")],
         tag="la roue n'a aucune mémoire", pill="DERNIER TOUR ENSUITE"),
    dict(name="LE 13", cells=[13], pay=35, res=36,
         stat="2,7 %", sub="1 case sur 37",
         f1=[("i", "P"), ("r", "(13) = "), F("1", "37"), ("r", " = 2,7 %")],
         f2=[("r", "paie 35:1 :  "), F("1", "37"), ("r", "·35 − "), F("36", "37"),
             ("r", " = −"), F("1", "37")],
         tag="le 36 est juste à côté du 13", pill="SI PRÈS DU BUT."),
]
LIVES0 = 5
for s in SPINS:
    s["win"] = s["res"] in s["cells"]
    s["delta"] = STAKE * s["pay"] if s["win"] else -STAKE
    s["zero"] = s["res"] == 0
bank = [100]
for s in SPINS:
    bank.append(bank[-1] + s["delta"])
WINS = sum(s["win"] for s in SPINS)

def spin_start(k):
    return INTRO + k * SPIN_LEN

# ---------------------------------------------------------------- mouvement roue / bille
WHEEL_C = (288, 330)
R_TRACK, R_POCKET = 69.0, 55.0
BOOST = 9.0
def ease_out(u):
    u = min(max(u, 0.0), 1.0)
    return 1 - (1 - u) ** 2.4
def wheel_angle(t):
    a = 0.35 * t
    for k in range(NSPIN):
        s0 = spin_start(k) + T_BET
        if t > s0:
            a += BOOST * ease_out((t - s0) / (T_LAND - T_BET + 1.5))
    return a

def ball_state(t):
    """renvoie (angle absolu, rayon)"""
    k = None
    for i in range(NSPIN):
        if t >= spin_start(i) + T_BET:
            k = i
    if k is None:
        return 0.0, R_TRACK
    s = SPINS[k]
    t0 = spin_start(k) + T_BET
    tl = spin_start(k) + T_LAND
    land = wheel_angle(tl) + pocket_angle(s["res"])
    if t >= tl:
        return wheel_angle(t) + pocket_angle(s["res"]), R_POCKET
    u = (t - t0) / (tl - t0)
    phi = land + 34.0 * (1 - u) ** 2.6        # sens antihoraire, décélère
    if u < 0.72:
        r = R_TRACK
    else:
        v = (u - 0.72) / 0.28
        r = R_TRACK + (R_POCKET - R_TRACK) * v + 4.0 * math.sin(v * math.pi * 3) * (1 - v)
    return phi, r

# ---------------------------------------------------------------- éléments pré-rendus
def make_wheel():
    R = 80
    sz = int(P(2 * R + 4))
    big = sz * 2
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = big / 2
    sc = big / (2 * R + 4)
    def circ(r, fill, outline=None, w=0):
        d.ellipse([c - r * sc, c - r * sc, c + r * sc, c + r * sc], fill=fill,
                  outline=outline, width=int(w * sc))
    circ(79, (92, 52, 30))
    circ(76.5, (60, 32, 18))
    # anneau des numéros
    for i, n in enumerate(ORDER):
        a0 = math.degrees(i * STEP - STEP / 2) - 90
        a1 = math.degrees(i * STEP + STEP / 2) - 90
        d.pieslice([c - 75 * sc, c - 75 * sc, c + 75 * sc, c + 75 * sc], a0, a1,
                   fill=num_color(n), outline=(200, 170, 110), width=max(1, int(0.5 * sc)))
    circ(61, (40, 26, 18))
    for i, n in enumerate(ORDER):   # cases pour la bille
        a0 = math.degrees(i * STEP - STEP / 2) - 90
        a1 = math.degrees(i * STEP + STEP / 2) - 90
        col = tuple(int(v * 0.55) for v in num_color(n))
        d.pieslice([c - 60 * sc, c - 60 * sc, c + 60 * sc, c + 60 * sc], a0, a1,
                   fill=col, outline=(170, 140, 90), width=max(1, int(0.4 * sc)))
    # cône central
    for r in range(48, 0, -1):
        f = r / 48
        col = (int(120 - 40 * f), int(78 - 30 * f), int(45 - 18 * f))
        circ(r, col)
    circ(48, None, (190, 150, 90), 0.8)
    # tourelle
    g = (222, 186, 110)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        x1, y1 = c + 24 * sc * math.cos(a), c + 24 * sc * math.sin(a)
        d.line([c, c, x1, y1], fill=g, width=int(2.4 * sc))
        d.ellipse([x1 - 3 * sc, y1 - 3 * sc, x1 + 3 * sc, y1 + 3 * sc], fill=g)
    circ(9, g)
    circ(5, (250, 230, 170))
    # numéros
    fnt = ImageFont.truetype(FI + "Inter-Bold.otf", int(7.2 * sc))
    for i, n in enumerate(ORDER):
        a = i * STEP
        t = Image.new("RGBA", (int(16 * sc), int(12 * sc)), (0, 0, 0, 0))
        td = ImageDraw.Draw(t)
        td.text((t.width / 2, t.height / 2), str(n), font=fnt, fill=WHITE, anchor="mm")
        t = t.rotate(-math.degrees(a), resample=Image.BICUBIC, expand=True)
        x = c + 68.5 * sc * math.sin(a)
        y = c - 68.5 * sc * math.cos(a)
        img.alpha_composite(t, (int(x - t.width / 2), int(y - t.height / 2)))
    return img.resize((sz, sz), Image.LANCZOS)

def make_banner(text):
    w, h = P(456), P(62)
    pad = int(P(12))
    img = Image.new("RGBA", (int(w) + 2 * pad, int(h) + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([pad, pad, pad + w, pad + h], radius=P(6), fill=RED)
    d.text((pad + w / 2, pad + h / 2 + P(1)), text, font=font("black", 34), fill=WHITE, anchor="mm")
    return img.rotate(1.6, resample=Image.BICUBIC, expand=True)

def make_bg(color):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W / 2, H * 0.40
    d = np.sqrt(((xx - cx) / (W * 0.85)) ** 2 + ((yy - cy) / (H * 0.62)) ** 2)
    f = np.clip(1 - d, 0, 1) ** 1.3
    base = np.array([7, 9, 9], np.float32)
    col = np.array(color, np.float32)
    return base + (col - base) * f[..., None]

G = {}
def init_worker():
    G["wheel"] = make_wheel()
    G["banner"] = make_banner("TOURNE LA ROUE")
    G["bg_n"] = make_bg((22, 38, 30))
    G["bg_w"] = make_bg((20, 38, 78))
    G["bg_l"] = make_bg((84, 16, 22))
    rng = np.random.default_rng(7)
    G["noise"] = [np.cumsum(rng.normal(0, 1, 400)) for _ in range(NSPIN + 1)]

# ---------------------------------------------------------------- helpers de dessin
def text(d, xy, s, f, fill, anchor="mm"):
    d.text((P(xy[0]), P(xy[1])), s, font=f, fill=fill, anchor=anchor)

def rrect(d, box, r, fill=None, outline=None, w=1):
    d.rounded_rectangle([P(box[0]), P(box[1]), P(box[2]), P(box[3])], radius=P(r),
                        fill=fill, outline=outline, width=max(1, int(P(w))) if outline else 0)

def pill(d, cx, cy, s, f, bg, fg, padx=10, h=26, r=5):
    tw = d.textlength(s, font=f) / K
    rrect(d, (cx - tw / 2 - padx, cy - h / 2, cx + tw / 2 + padx, cy + h / 2), r, fill=bg)
    text(d, (cx, cy + 0.5), s, f, fg)

def italic_token(s, f, fill):
    asc, desc = f.getmetrics()
    w = int(f.getlength(s)) + int(asc * 0.4)
    h = asc + desc
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((int(asc * 0.15), 0), s, font=f, fill=fill)
    sh = 0.2
    return im.transform((w, h), Image.AFFINE, (1, sh, -sh * h * 0.75, 0, 1, 0),
                        resample=Image.BICUBIC)

def formula(layer, cx, cy, toks, size, fill):
    """dessine une ligne de formule centrée en (cx, cy) (coord. design)."""
    d = ImageDraw.Draw(layer)
    fb = font("serif", size); fs = font("serif", size * 0.62)
    items = []
    for t in toks:
        if t[0] == "f":
            w = max(fs.getlength(t[1]), fs.getlength(t[2])) + P(size * 0.25)
        elif t[0] == "sup" or t[0] == "sub":
            w = fs.getlength(t[1]) + P(1)
        elif t[0] == "i":
            w = fb.getlength(t[1]) + P(size * 0.08)
        else:
            w = fb.getlength(t[1])
        items.append((t, w))
    total = sum(w for _, w in items)
    x = P(cx) - total / 2
    y = P(cy)
    asc = fb.getmetrics()[0]
    for t, w in items:
        if t[0] == "r":
            d.text((x, y), t[1], font=fb, fill=fill, anchor="lm")
        elif t[0] == "i":
            im = italic_token(t[1], fb, fill)
            layer.alpha_composite(im, (int(x - asc * 0.1), int(y - asc * 0.72)))
        elif t[0] == "sup":
            d.text((x, y - P(size * 0.42)), t[1], font=fs, fill=fill, anchor="lm")
        elif t[0] == "sub":
            d.text((x, y + P(size * 0.25)), t[1], font=fs, fill=fill, anchor="lm")
        elif t[0] == "f":
            mx = x + w / 2
            d.text((mx, y - P(size * 0.06)), t[1], font=fs, fill=fill, anchor="mb")
            d.line([x + P(size * 0.08), y + P(size * 0.06), x + w - P(size * 0.08), y + P(size * 0.06)],
                   fill=fill, width=max(1, int(P(0.9))))
            d.text((mx, y + P(size * 0.14)), t[1 + 1], font=fs, fill=fill, anchor="mt")
        x += w

def table_cell(n):
    """case n -> box (coord. design)"""
    x0, y0, cw, ch = 199.0, 418.0, 15.8, 13.2
    if n == 0:
        return (186.5, y0, 197.5, y0 + 3 * ch - 1)
    col = (n - 1) // 3
    row = 2 - (n - 1) % 3
    return (x0 + col * cw, y0 + row * ch, x0 + col * cw + cw - 1.6, y0 + row * ch + ch - 1.6)

def check(d, cx, cy, s, col):
    d.line([P(cx - s * .45), P(cy), P(cx - s * .12), P(cy + s * .35), P(cx + s * .45), P(cy - s * .35)],
           fill=col, width=int(P(1.6)), joint="curve")

def cross(d, cx, cy, s, col):
    a = s * 0.33
    d.line([P(cx - a), P(cy - a), P(cx + a), P(cy + a)], fill=col, width=int(P(1.6)))
    d.line([P(cx - a), P(cy + a), P(cx + a), P(cy - a)], fill=col, width=int(P(1.6)))

def smooth(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)

# ---------------------------------------------------------------- tracé du graphe
GX0, GX1, GDROP, GAXIS = 60.0, 528.0, 285.0, 605.0
def fy(level):          # F1..F5 -> y
    return 654 - (level - 1) * 31

def pre_curve(k, u):
    """points du tracé jaune pendant le tour k (u = avancement 0..1)"""
    nz = G["noise"][k]
    n = max(2, int(200 * u))
    pts = []
    for i in range(n):
        v = i / 199
        x = GX0 + 6 + (GDROP - GX0 - 6) * v
        y = fy(3.55) + nz[i] * 1.1 - 6 * math.sin(v * 9 + k)
        y = min(max(y, fy(4.6)), fy(2.6))
        pts.append((x, y))
    return pts

def post_curve(k, win, v):
    nz = G["noise"][k + 1]
    n = max(2, int(80 * v))
    y0 = pre_curve(k, 1.0)[-1][1]
    pts = []
    for i in range(n):
        w = i / 79
        x = GDROP + 82 * w
        if win:
            y = y0 + (fy(4.55) - y0) * smooth(w * 1.4) + nz[i] * 0.7
        else:
            saw = ((i * 0.37) % 1.0) * 10 - 5
            y = y0 + (fy(1.55) - y0) * smooth(w * 2.2) + saw * min(1, w * 4)
        pts.append((x, y))
    return pts

def draw_curve(d, pts, col, width=2.0):
    if len(pts) < 2:
        return
    d.line([(P(x), P(y)) for x, y in pts], fill=col, width=int(P(width)), joint="curve")

def glow_dot(layer, x, y, col, r=5.5):
    g = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    for rr, a in ((r * 2.2, 40), (r * 1.6, 70)):
        gd.ellipse([P(x - rr), P(y - rr), P(x + rr), P(y + rr)], fill=col + (a,))
    layer.alpha_composite(g)
    d = ImageDraw.Draw(layer)
    d.ellipse([P(x - r), P(y - r), P(x + r), P(y + r)], fill=col)
    d.ellipse([P(x - r * .45), P(y - r * .45), P(x + r * .45), P(y + r * .45)], fill=(255, 250, 225))

# ---------------------------------------------------------------- état à l'instant t
def state(t):
    st = dict(phase="intro", k=-1, u=0.0, v=0.0)
    if t >= INTRO + NSPIN * SPIN_LEN:
        st.update(phase="outro", v=t - (INTRO + NSPIN * SPIN_LEN), k=NSPIN - 1)
    elif t >= INTRO:
        k = int((t - INTRO) // SPIN_LEN)
        lt = t - spin_start(k)
        st["k"] = k
        if lt < T_BET:
            st.update(phase="bet", v=lt)
        elif lt < T_LAND:
            st.update(phase="spin", u=(lt - T_BET) / (T_LAND - T_BET), v=lt)
        else:
            st.update(phase="reveal", v=lt - T_LAND)
    return st

def render(fi):
    t = fi / FPS
    st = state(t)
    ph, k = st["phase"], st["k"]
    s = SPINS[k] if k >= 0 else None

    # résultats déjà connus
    done = k if ph in ("bet", "spin") else (k + 1 if ph == "reveal" else (NSPIN if ph == "outro" else 0))
    losses = sum(1 for i in range(done) if not SPINS[i]["win"])
    lives = LIVES0 - losses
    cur_bank = bank[done]

    # ---- fond (1x)
    tw = tl = 0.0
    if ph == "reveal":
        a = min(1.0, st["v"] / 0.25) * (1 - 0.35 * smooth((st["v"] - 1.2) / 1.3))
        if s["win"]:
            tw = a
        else:
            tl = a
    elif ph == "bet" and k > 0:
        prev = SPINS[k - 1]
        a = 0.65 * (1 - smooth(st["v"] / T_BET))
        tw, tl = (a, 0) if prev["win"] else (0, a)
    elif ph == "outro":
        tw = 0.5 * smooth(st["v"] / 1.0)
    bg = G["bg_n"] * (1 - tw - tl) + G["bg_w"] * tw + G["bg_l"] * tl
    base = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8), "RGB").convert("RGBA")

    # ---- calque UI (SSx)
    L = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(L)

    # légère secousse à l'atterrissage
    shake = 0.0
    if ph == "reveal" and st["v"] < 0.35:
        shake = math.sin(st["v"] * 70) * 3.0 * (1 - st["v"] / 0.35)

    # bannière
    b = G["banner"]
    L.alpha_composite(b, (int(P(288) - b.width / 2), int(P(189) - b.height / 2)))

    # sous-titre / pastille
    if ph == "reveal" and st["v"] > 0.15:
        pill(d, 288, 233, s["pill"], font("xb", 11.5), RED, WHITE, padx=8, h=19, r=3)
    elif ph == "outro":
        pill(d, 288, 233, "COMMENTE TON SCORE /8", font("xb", 12), RED, WHITE, padx=8, h=20, r=3)
    else:
        pill(d, 288, 236, "La roulette, version maths", font("bold", 15.5), WHITE, (10, 10, 10),
             padx=9, h=27, r=3)

    # panneau central
    rrect(d, (180, 253 + 0, 395, 465), 6, fill=(24, 36, 31, 235), outline=(62, 80, 72), w=1)

    # roue
    cx, cy = WHEEL_C[0] + shake, WHEEL_C[1]
    wa = wheel_angle(t)
    wimg = G["wheel"].rotate(-math.degrees(wa), resample=Image.BICUBIC)
    L.alpha_composite(wimg, (int(P(cx) - wimg.width / 2), int(P(cy) - wimg.height / 2)))
    ring = None
    if ph == "reveal":
        ring = BLUE if s["win"] else RED
    elif ph == "outro":
        ring = GOLD
    if ring:
        for rr, wdt, a in ((82, 6, 70), (80.5, 2.6, 255)):
            g = Image.new("RGBA", L.size, (0, 0, 0, 0))
            ImageDraw.Draw(g).ellipse([P(cx - rr), P(cy - rr), P(cx + rr), P(cy + rr)],
                                      outline=ring + (a,), width=int(P(wdt)))
            L.alpha_composite(g)
    # bille
    phi, r = ball_state(t)
    bx, by = cx + r * math.sin(phi), cy - r * math.cos(phi)
    d.ellipse([P(bx - 4.3), P(by - 4.3), P(bx + 4.3), P(by + 4.3)], fill=(235, 235, 235),
              outline=(120, 120, 120), width=int(P(0.6)))
    d.ellipse([P(bx - 2.2), P(by - 2.9), P(bx + 0.2), P(by - 0.6)], fill=WHITE)
    # badge du résultat
    show_n = None
    if ph == "reveal":
        show_n, pop = s["res"], min(1.0, st["v"] / 0.18)
    elif ph == "outro":
        show_n, pop = SPINS[-1]["res"], 1.0
    if show_n is not None:
        rr = 17 * (0.6 + 0.4 * pop + 0.12 * math.sin(min(1, st["v"] / 0.3) * math.pi) * (ph == "reveal"))
        d.ellipse([P(cx - rr), P(cy - rr), P(cx + rr), P(cy + rr)], fill=num_color(show_n),
                  outline=WHITE, width=int(P(1.6)))
        text(d, (cx, cy), str(show_n), font("xb", 15 * rr / 17), WHITE)

    # tapis
    cells = s["cells"] if (s and ph != "intro") else None
    if ph == "outro":
        cells = None
    for n in range(37):
        bx0, by0, bx1, by1 = table_cell(n)
        col = num_color(n) if n else (30, 130, 70)
        if n and n not in REDS:
            col = (36, 38, 42)
        if cells is not None and n not in cells:
            col = tuple(int(c * 0.42 + 16) for c in col)
        rrect(d, (bx0, by0, bx1, by1), 1.5, fill=col)
        if n:
            text(d, ((bx0 + bx1) / 2, (by0 + by1) / 2 + 0.3), str(n), font("bold", 6.6),
                 (255, 255, 255) if (cells is None or n in cells) else (150, 150, 150))
        else:
            text(d, ((bx0 + bx1) / 2, (by0 + by1) / 2), "0", font("bold", 7), WHITE)
        if cells is not None and n in cells:
            appear = smooth((st["v"] if ph == "bet" else 1) / 0.4)
            if appear > 0.05:
                rrect(d, (bx0 - .6, by0 - .6, bx1 + .6, by1 + .6), 1.8, outline=CYAN + (int(255 * appear),), w=1.1)
    marker = None
    if ph == "reveal":
        marker = s["res"]
    if marker is not None:
        bx0, by0, bx1, by1 = table_cell(marker)
        mx, my = (bx0 + bx1) / 2, (by0 + by1) / 2
        rad = 6.2
        d.ellipse([P(mx - rad), P(my - rad), P(mx + rad), P(my + rad)], fill=YEL, outline=(40, 30, 0),
                  width=int(P(0.7)))
        text(d, (mx, my + 0.3), str(marker), font("xb", 6.4), (20, 20, 20))

    # pastille de statut
    if ph == "intro":
        pill_txt, pc = "PLACE 8 MISES", (50, 58, 56)
        pc_box = (201, 469, 375, 497)
    elif ph in ("bet", "spin"):
        pill_txt, pc = f"#{k + 1}/8  {s['name']} : GAGNÉ OU PERDU ?", (50, 58, 56)
    elif ph == "reveal":
        if s["win"]:
            pill_txt, pc = f"#{k + 1}/8  GAGNÉ +{s['delta']}", BLUE
        elif s["zero"]:
            pill_txt, pc = f"#{k + 1}/8  ZÉRO −{STAKE}", RED
        else:
            pill_txt, pc = f"#{k + 1}/8  PERDU −{STAKE}", RED
    else:
        pill_txt, pc = "SESSION TERMINÉE", GOLD
    fpill = font("xb", 12.5)
    tw_ = d.textlength(pill_txt, font=fpill) / K
    half = max(87, tw_ / 2 + 12)
    rrect(d, (288 - half, 469, 288 + half, 497), 5, fill=pc)
    text(d, (288, 483.5), pill_txt, fpill, WHITE)
    # barre de progression
    rrect(d, (205, 502, 371, 505), 1.5, fill=(48, 56, 54))
    if ph == "spin":
        rrect(d, (205, 502, 205 + 166 * st["u"], 505), 1.5, fill=ORANGE)
    elif ph == "bet":
        rrect(d, (205, 502, 205 + 6, 505), 1.5, fill=ORANGE)

    # ---- colonne gauche
    lab = font("bold", 10)
    text(d, (95, 282), "VIES", lab, (225, 230, 228))
    lv_disp = lives
    for i in range(LIVES0):
        x0 = 95 - (LIVES0 * 15 + (LIVES0 - 1) * 3) / 2 + i * 18
        on = i < lv_disp
        flash = ph == "reveal" and not s["win"] and i == lives and st["v"] < 0.8 and int(st["v"] * 10) % 2 == 0
        col = GREEN if on else ((232, 57, 72) if flash else (44, 54, 50))
        rrect(d, (x0, 296, x0 + 15, 305), 2, fill=col)
    text(d, (95, 328), "BANQUE", lab, (225, 230, 228))
    rrect(d, (63, 340, 127, 372), 4, fill=(12, 6, 8), outline=(70, 30, 34), w=1)
    disp = cur_bank
    if ph == "reveal":
        disp = round(bank[k] + (bank[k + 1] - bank[k]) * smooth(st["v"] / 0.6))
    fm = font("mono", 23)
    text(d, (95, 357), "888", fm, (52, 14, 16))
    text(d, (95, 357), f"{disp:>3d}".replace(" ", "!").replace("!", " "), fm, (255, 52, 58))
    text(d, (95, 391), "TOURS", lab, (225, 230, 228))
    for i in range(8):
        x0 = 61 + (i % 4) * 17.5
        y0 = 402 + (i // 4) * 17.5
        box = (x0, y0, x0 + 13, y0 + 13)
        if i < done:
            win = SPINS[i]["win"]
            rrect(d, box, 2, fill=BLUE if win else RED)
            (check if win else cross)(d, x0 + 6.5, y0 + 6.5, 10, WHITE)
        elif i == k and ph in ("bet", "spin"):
            rrect(d, box, 2, fill=(30, 36, 34), outline=ORANGE, w=1.2)
        else:
            rrect(d, box, 2, fill=(30, 36, 34), outline=(64, 72, 70), w=1)

    # ---- colonne droite
    if ph == "intro":
        big, l1, l2, sm, bc = "37", "CASES SUR", "LA ROUE", "18 rouges · 18 noirs · 1 zéro", ORANGE
    elif ph == "outro":
        big, l1, l2, sm, bc = f"{WINS}/8", "TON", "SCORE", f"banque 100 → {bank[-1]}", YEL
    else:
        pct = float(s["stat"].split()[0].replace(",", "."))
        big, l1, l2, sm = s["stat"], "CHANCE :", s["name"], s["sub"]
        bc = LAV if pct > 40 else ORANGE
        if ph == "bet":       # le chiffre défile
            tt = smooth(st["v"] / 0.55)
            big = f"{pct * tt:.1f} %".replace(".", ",")
    text(d, (482, 313), big, font("xb", 27), bc)
    text(d, (482, 345), l1, font("bold", 10.5), WHITE)
    text(d, (482, 359), l2, font("bold", 10.5), WHITE)
    text(d, (482, 385), sm, font("med", 8), (150, 160, 156))

    # ---- graphe
    grid = (34, 46, 42, 255)
    for gx in np.arange(GX0, GX1 + 1, 22):
        d.line([P(gx), P(520), P(gx), P(665)], fill=grid, width=int(P(0.5)))
    for gy in np.arange(522, 666, 22):
        d.line([P(GX0 - 10), P(gy), P(GX1 + 10), P(gy)], fill=grid, width=int(P(0.5)))
    for i, lbl in enumerate(["F1", "F2", "F3", "F4", "F5"]):
        text(d, (40, fy(i + 1)), lbl, font("bold", 8), (130, 140, 136))
    axc = (175, 185, 190)
    d.line([P(GX0), P(GAXIS), P(GX1), P(GAXIS)], fill=axc, width=int(P(1)))
    d.polygon([(P(GX1 + 1), P(GAXIS)), (P(GX1 - 7), P(GAXIS - 4)), (P(GX1 - 7), P(GAXIS + 4))], fill=axc)
    d.line([P(GDROP), P(665), P(GDROP), P(522)], fill=axc, width=int(P(1)))
    d.polygon([(P(GDROP), P(518)), (P(GDROP - 4), P(526)), (P(GDROP + 4), P(526))], fill=axc)
    text(d, (GDROP, 512), "CHUTE", font("bold", 7.5), (140, 150, 146))
    for tx in np.arange(70, 515, 6.3):
        d.line([P(tx), P(660), P(tx), P(665)], fill=(90, 100, 96), width=int(P(0.7)))

    if ph == "intro":
        bob = math.sin(t * 4) * 2
        glow_dot(L, 65, fy(3.2) + bob, YEL)
    elif ph == "bet":
        glow_dot(L, 65, fy(3.55), YEL)
    elif ph == "spin":
        pts = pre_curve(k, st["u"])
        draw_curve(d, pts, YEL)
        glow_dot(L, pts[-1][0], pts[-1][1], YEL)
    elif ph == "reveal":
        col = CYAN if s["win"] else RED
        pts = pre_curve(k, 1.0)
        draw_curve(d, pts, col)
        v = smooth(st["v"] / 0.7)
        post = post_curve(k, s["win"], v)
        draw_curve(d, post, col, 2.2)
        glow_dot(L, post[-1][0], post[-1][1], col)
        if st["v"] > 0.5:
            a = int(255 * smooth((st["v"] - 0.5) / 0.3))
            y0 = pts[-1][1]
            if s["win"]:
                d.line([P(292), P(GAXIS - 4), P(292), P(fy(3.9))], fill=CYAN + (a,), width=int(P(1)))
                text(d, (300, fy(3.5)), "+24  (s = +2)", font("semi", 8), CYAN + (a,), "lm")
            else:
                text(d, (300, fy(2.25)), "−36  (s = −3)", font("semi", 8), (255, 120, 120, a), "lm")
            if not s["win"]:
                big_t = "ZÉRO" if s["zero"] else "PERDU"
                sc = 1 + 0.25 * (1 - smooth((st["v"] - 0.5) / 0.25))
                text(d, (420, 556), big_t, font("black", 31 * sc), RED + (a,))
            else:
                sc = 1 + 0.25 * (1 - smooth((st["v"] - 0.5) / 0.25))
                text(d, (430, 556), f"+{s['delta']}", font("black", 31 * sc), CYAN + (a,))
    elif ph == "outro":
        # tracé final de la session (banque)
        v = smooth(st["v"] / 1.6)
        pts = []
        n = int(160 * v) + 2
        for i in range(n):
            w = i / 160
            j = w * NSPIN
            a = int(min(j, NSPIN - 1))
            fr = j - a
            bnk = bank[a] + (bank[a + 1] - bank[a]) * smooth(fr * 2)
            y = fy(3.4) - (bnk - 100) * 0.42 + G["noise"][0][i] * 0.5
            pts.append((GX0 + 30 + (GDROP - GX0 - 30) * w, y))
        draw_curve(d, pts, YEL, 2.2)
        glow_dot(L, pts[-1][0], pts[-1][1], YEL)

    # ---- formules
    if ph == "intro":
        f1 = [("i", "P"), ("r", "(gagner) = "), F("# cases couvertes", "37")]
        f2 = [("r", "chaque tour est une note :  "), ("i", "f"), ("sub", "out"), ("r", " = "),
              ("i", "f"), ("r", "·2"), ("sup", "s")]
        f3 = None
        tag = "devine chaque tour avant qu'il tombe"
    elif ph == "outro":
        bits = "".join("1" if x["win"] else "0" for x in SPINS)
        f1 = [("r", f"{bits} = tes 8 tours")]
        f2 = [("i", "E"), ("r", "[gain] = 80 · (−"), F("1", "37"), ("r", ") ≈ −2,16")]
        f3 = [("r", f"cette partie : +{bank[-1] - 100}  ⇒  de la chance, pas un avantage")]
        tag = "commente ton score /8"
    else:
        f1, f2, tag = s["f1"], s["f2"], s["tag"]
        if ph == "reveal" and st["v"] > 0.3:
            if s["win"]:
                f3 = [("i", "s"), ("r", " = +2 :  4"), ("i", "f"), ("r", "  GAGNÉ (cloche de verre)")]
            else:
                f3 = [("i", "s"), ("r", " = −3 :  "), ("i", "f"), ("r", "/8  "),
                      ("r", "ZÉRO" if s["zero"] else "PERDU"), ("r", " (basse dent de scie)")]
        else:
            f3 = [("i", "f"), ("sub", "out"), ("r", " = "), ("i", "f"), ("r", "·2"), ("sup", "s"),
                  ("r", ",   "), ("i", "s"), ("r", " = ?")]
    formula(L, 288, 706, f1, 19, (245, 245, 245))
    formula(L, 288, 744, f2, 12.5, (205, 210, 208))
    if f3:
        formula(L, 288, 771, f3, 12.5, (205, 210, 208))
    pill(d, 288, 808, tag, font("bold", 14), YEL, (12, 12, 12), padx=8, h=24, r=3)

    # flash d'ouverture
    if t < 0.4:
        fl = Image.new("RGBA", L.size, (0, 0, 0, int(255 * (1 - t / 0.4))))
        L.alpha_composite(fl)

    small = L.reduce(SS)
    base.alpha_composite(small)
    return base.convert("RGB").tobytes()

# ---------------------------------------------------------------- audio
SR = 44100
def synth_audio(path):
    n = int(DURATION * SR) + SR
    out = np.zeros((n, 2), np.float32)
    rng = np.random.default_rng(3)
    def add(sig, t0, pan=0.0, gain=1.0):
        i0 = int(t0 * SR)
        i1 = min(n, i0 + len(sig))
        if i1 <= i0:
            return
        s = sig[: i1 - i0] * gain
        out[i0:i1, 0] += s * (1 - max(0, pan))
        out[i0:i1, 1] += s * (1 + min(0, pan))
    def tone(f, dur, decay=6.0, harm=(1.0,), att=0.004):
        tt = np.arange(int(dur * SR)) / SR
        sig = sum(a * np.sin(2 * np.pi * f * (i + 1) * tt) for i, a in enumerate(harm))
        env = np.exp(-tt * decay) * np.minimum(1, tt / att)
        return (sig * env).astype(np.float32)
    def bell(f, dur=2.2):
        tt = np.arange(int(dur * SR)) / SR
        parts = [(1, 1.0, 2.2), (2.76, 0.5, 3.5), (5.4, 0.28, 5), (8.93, 0.15, 7)]
        sig = sum(a * np.sin(2 * np.pi * f * m * tt) * np.exp(-tt * dcy) for m, a, dcy in parts)
        return (sig * np.minimum(1, tt / 0.002)).astype(np.float32)
    def saw_drop(f0, f1, dur):
        tt = np.arange(int(dur * SR)) / SR
        f = f0 * (f1 / f0) ** (tt / dur)
        ph = np.cumsum(f) / SR
        sig = 2 * (ph % 1) - 1
        k = 12
        sig = np.convolve(sig, np.ones(k) / k, mode="same")
        env = np.minimum(1, tt / 0.01) * np.exp(-tt * 1.6)
        return (sig * env).astype(np.float32)
    def click(dur=0.012):
        tt = np.arange(int(dur * SR)) / SR
        z = rng.normal(0, 1, len(tt)) * np.exp(-tt * 500)
        z = np.diff(z, prepend=0)
        return z.astype(np.float32)
    def kick(t0, g=0.5):
        tt = np.arange(int(0.35 * SR)) / SR
        f = 45 + 90 * np.exp(-tt * 30)
        sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9)
        add(sig.astype(np.float32), t0, gain=g)

    # nappe de fond
    tt = np.arange(n) / SR
    pad = (0.5 * np.sin(2 * np.pi * 110 * tt) + 0.3 * np.sin(2 * np.pi * 164.8 * tt + 1)
           + 0.2 * np.sin(2 * np.pi * 220.5 * tt)) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.11 * tt))
    out[:, 0] += pad * 0.035
    out[:, 1] += pad * 0.035

    PENTA = [220.0, 261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0, 880.0]
    # intro
    for i, f in enumerate([440, 523.3, 659.3, 880]):
        add(tone(f, 0.6, 7, (1, .3, .1)), 0.25 + i * 0.12, pan=(i - 1.5) * 0.3, gain=0.22)
    add(bell(1760), 1.0, gain=0.10)

    for k, s in enumerate(SPINS):
        st0 = spin_start(k)
        add(tone(660, 0.25, 18, (1, .4)), st0 + 0.05, gain=0.15)       # pose de la mise
        add(tone(990, 0.25, 18, (1, .4)), st0 + 0.15, gain=0.12)
        ts = st0 + T_BET
        te = st0 + T_LAND
        tcur = ts
        i = 0
        while tcur < te - 0.05:
            u = (tcur - ts) / (te - ts)
            # note qui suit le tracé
            q = G_noise_level(k, u)
            f = PENTA[int(np.clip(q, 0, len(PENTA) - 1))]
            add(tone(f, 0.18, 22, (1, .25, .08)), tcur, pan=math.sin(i * 1.3) * 0.4, gain=0.13)
            add(click(), tcur, pan=math.sin(i * 2.1) * 0.6, gain=0.25)
            tcur += 0.06 + 0.34 * u ** 1.8
            i += 1
        b = 0
        while ts + b * 0.5 < te:
            kick(ts + b * 0.5, 0.25 + 0.25 * b / 9)
            b += 1
        add(click(0.03), te, gain=0.7)                                 # la bille tombe
        kick(te, 0.6)
        if s["win"]:
            for j, f in enumerate([880, 1108.7, 1318.5, 1760]):
                add(tone(f, 0.5, 8, (1, .2)), te + 0.04 + j * 0.06, pan=(j - 1.5) * .35, gain=0.13)
            add(bell(1760), te + 0.05, gain=0.22)
            add(bell(2637), te + 0.30, gain=0.10)
        else:
            add(saw_drop(220, 41, 1.6), te + 0.02, gain=0.30)
            nz = rng.normal(0, 1, int(0.5 * SR)).astype(np.float32)
            nz = np.convolve(nz, np.ones(30) / 30, mode="same") * np.exp(-np.arange(len(nz)) / SR * 6)
            add(nz, te, gain=0.5)

    # outro : la session jouée comme une mélodie binaire
    to = INTRO + NSPIN * SPIN_LEN
    for i, x in enumerate(SPINS):
        f = 880 if x["win"] else 330
        add(tone(f, 0.4, 9, (1, .3, .1)), to + 0.3 + i * 0.16, pan=(i - 3.5) * 0.12, gain=0.18)
    for f in (440, 554.4, 659.3, 880):
        add(tone(f, 2.5, 1.4, (1, .3, .1), att=0.02), to + 1.75, gain=0.10)
    add(bell(1760, 3.0), to + 1.75, gain=0.15)

    out = out[: int(DURATION * SR)]
    fade = int(0.6 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    out /= np.max(np.abs(out)) / 0.89
    pcm = (out * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())

def G_noise_level(k, u):
    """hauteur du tracé (0..10) pour la note jouée"""
    nz = G["noise"][k]
    i = min(199, int(199 * u))
    y = fy(3.55) + nz[i] * 1.1 - 6 * math.sin(u * 9 + k)
    y = min(max(y, fy(4.6)), fy(2.6))
    return (fy(2.6) - y) / (fy(2.6) - fy(4.6)) * 9 + 1

# ---------------------------------------------------------------- main
def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "tourne_la_roue.mp4"
    init_worker()
    if len(sys.argv) > 2 and sys.argv[2] == "--preview":
        for tt in map(float, sys.argv[3:]):
            Image.frombytes("RGB", (W, H), render(int(tt * FPS))).save(f"/tmp/prev_{tt:05.1f}.png")
        return
    wav = "/tmp/spin_audio.wav"
    synth_audio(wav)
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "18",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
           "-t", f"{DURATION:.3f}", out]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(os.cpu_count(), initializer=init_worker) as pool:
        for i, fr in enumerate(pool.imap(render, range(NFRAMES), chunksize=4)):
            ff.stdin.write(fr)
            if i % 150 == 0:
                print(f"frame {i}/{NFRAMES}", flush=True)
    ff.stdin.close()
    ff.wait()
    print("ok", out)

if __name__ == "__main__":
    main()
