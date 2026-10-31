#!/usr/bin/env python3
"""Vidéo TikTok « SPIN THE SLOTS » (1080x1920, 30 fps, 68 s) : machine à sous + maths.
Réutilise les helpers de render.py. Usage : python3 slots.py OUT.mp4 [--preview t1 t2 ...]"""
import math, os, sys, subprocess
from multiprocessing import Pool
import numpy as np
from PIL import Image, ImageDraw
import render as R
from render import (FPS, W, H, SS, K, INTRO, SPIN_LEN, NSPIN, DURATION, NFRAMES, T_BET, T_LAND,
                    BEAT, P, font, text, rrect, pill, formula, check, cross, smooth, fy,
                    pre_curve, post_curve, draw_curve, glow_dot, make_banner, make_bg,
                    RED, BLUE, GOLD, YEL, CYAN, WHITE, GREEN, ORANGE, LAV, GX0, GX1, GDROP, GAXIS)

# ---------------------------------------------------------------- machine
STRIP = ["C", "L", "BE", "C", "BA", "L", "C", "D", "BE", "L",
         "C", "BA", "BE", "L", "C", "S7", "BE", "BA", "L", "C"]          # 20 crans
STRIPS = [STRIP[7 * r % 20:] + STRIP[:7 * r % 20] for r in range(3)]
NSTOP = 20
PITCH = 46.0                     # hauteur d'un symbole (coord. design)
WIN_Y0, WIN_Y1 = 262.0, 402.0
MID_Y = (WIN_Y0 + WIN_Y1) / 2
REEL_X = [191 + r * 65 for r in range(3)]
REEL_W = 61.0
STOP_GAP = 0.6
STAKE = 10
PAYTABLE = [("S7", 500), ("D", 200), ("BA", 40), ("BE", 20), ("L", 8), ("C", 8)]

def F(a, b):
    return ("f", a, b)

ROUNDS = [
    dict(name="ANY WIN", res=["C", "L", "BE"], stat="11.7 %", l1="CHANCE OF", sub="938 of 8000 combos",
         f1=[("i", "P"), ("r", "(any win) = "), F("938", "8000"), ("r", " = 11.7 %")],
         f2=[("r", "20 stops per reel :  20"), ("sup", "3"), ("r", " = 8000 outcomes")],
         tag="7 in 8 pulls pay nothing", pill="+1 POINT PER RIGHT GUESS", hl="all"),
    dict(name="CHERRY", res=["C", "C", "BA"], stat="30.0 %", l1="CHANCE OF", sub="6 of 20 stops",
         f1=[("i", "P"), ("r", "(cherry) = "), F("6", "20"), ("r", " = 30 %")],
         f2=[("i", "P"), ("r", "(A∩B∩C) = "), ("i", "P"), ("r", "(A)·"), ("i", "P"), ("r", "(B)·"),
             ("i", "P"), ("r", "(C)")],
         tag="each reel spins on its own", pill="+20 CREDITS", hl="CC"),
    dict(name="3 CHERRIES", res=["BA", "C", "C"], stat="2.7 %", l1="CHANCE OF", sub="216 of 8000 combos",
         f1=[("i", "P"), ("r", "(3 cherries) = ("), F("6", "20"), ("r", ")"), ("sup", "3"), ("r", " = 2.7 %")],
         f2=[("r", "pairs only pay from the left reel")],
         tag="two cherries, wrong reels", pill="WRONG REELS", hl="C"),
    dict(name="777", res=["S7", "S7", "BA"], stat="0.01 %", l1="CHANCE OF", sub="1 of 8000 combos",
         f1=[("i", "P"), ("r", "(777) = ("), F("1", "20"), ("r", ")"), ("sup", "3"), ("r", " = "),
             F("1", "8000")],
         f2=[("r", "pays ×500 :  "), F("500", "8000"), ("r", " = 0.0625 per pull")],
         tag="near misses are part of the design", pill="SO CLOSE?", hl="S7"),
    dict(name="3 LEMONS", res=["L", "L", "L"], stat="1.6 %", l1="CHANCE OF", sub="125 of 8000 combos",
         f1=[("i", "P"), ("r", "(3 lemons) = ("), F("5", "20"), ("r", ")"), ("sup", "3"), ("r", " = 1.6 %")],
         f2=[("r", "pays ×8 :  "), F("125", "8000"), ("r", "·8 = 0.125 per pull")],
         tag="rare wins pay more, not better", pill="+70 CREDITS", hl="L"),
    dict(name="RTP", res=["BE", "D", "L"], stat="91.3 %", l1="RETURN TO", sub="7300 of 8000 credits back",
         f1=[("r", "RTP = Σ "), ("i", "p"), ("r", "·payout = "), F("7300", "8000"), ("r", " = 91.3 %")],
         f2=[("r", "house edge = 1 − RTP = 8.75 %")],
         tag="the house keeps 8.75 % of every bet", pill="TWO LIVES LEFT", hl="all"),
    dict(name="CHERRY PAIR", res=["C", "C", "BE"], stat="6.3 %", l1="CHANCE OF", sub="504 of 8000 combos",
         f1=[("i", "P"), ("r", "(C C _) = "), F("6", "20"), ("r", "·"), F("6", "20"), ("r", "·"),
             F("14", "20"), ("r", " = 6.3 %")],
         f2=[("r", "pays ×3 :  "), F("504", "8000"), ("r", "·3 = 0.19 per pull")],
         tag="small wins keep you pulling", pill="LAST PULL NEXT", hl="CC"),
    dict(name="3 BELLS", res=["BE", "BE", "S7"], stat="0.8 %", l1="CHANCE OF", sub="64 of 8000 combos",
         f1=[("i", "P"), ("r", "(3 bells) = ("), F("4", "20"), ("r", ")"), ("sup", "3"), ("r", " = 0.8 %")],
         f2=[("r", "pays ×20 :  "), F("64", "8000"), ("r", "·20 = 0.16 per pull")],
         tag="the 3rd reel decides everything", pill="SO CLOSE.", hl="BE"),
]

def payout(res):
    a, b, c = res
    if a == b == c:
        return dict(PAYTABLE)[a], a
    if a == "C" and b == "C":
        return 3, "CC"
    return 0, None
for rd in ROUNDS:
    m, key = payout(rd["res"])
    rd["mult"], rd["key"] = m, key
    rd["win"] = m > 0
    rd["delta"] = STAKE * m - STAKE if m else -STAKE
    rd["zero"] = False
bank = [100]
for rd in ROUNDS:
    bank.append(bank[-1] + rd["delta"])
WINS = sum(rd["win"] for rd in ROUNDS)
LIVES0 = 6

def spin_start(k):
    return INTRO + k * SPIN_LEN

# ---------------------------------------------------------------- mouvement des rouleaux
PLAN = [[None] * NSPIN for _ in range(3)]
for r in range(3):
    p = float(3 + 5 * r)
    for k, rd in enumerate(ROUNDS):
        idxs = [i for i, s in enumerate(STRIPS[r]) if s == rd["res"][r]]
        best = min(idxs, key=lambda i: (i - p) % NSTOP)
        end = p + ((best - p) % NSTOP) + NSTOP * (2 + r)
        PLAN[r][k] = (p, end)
        p = end

def stop_time(k, r):
    return spin_start(k) + T_LAND - (2 - r) * STOP_GAP

def reel_pos(r, t):
    """(position en crans, vitesse crans/s)"""
    pos = PLAN[r][0][0]
    for k in range(NSPIN):
        t0 = spin_start(k) + T_BET
        if t < t0:
            break
        a, b = PLAN[r][k]
        ts = stop_time(k, r)
        if t < ts:
            u = (t - t0) / (ts - t0)
            e = 1 - (1 - u) ** 1.35
            v = (b - a) * 1.35 * (1 - u) ** 0.35 / (ts - t0)
            return a + (b - a) * e, v
        tau = t - ts
        pos = b
        if tau < 0.3:
            pos = b + 0.16 * math.sin(math.pi * tau / 0.3) * (1 - tau / 0.3)
    return pos, 0.0

# ---------------------------------------------------------------- symboles
def draw_symbol(name, S):
    big = S * 4
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    u = big / 100.0
    def E(x0, y0, x1, y1, **kw):
        d.ellipse([x0 * u, y0 * u, x1 * u, y1 * u], **kw)
    if name == "S7":
        f = R.ImageFont.truetype(R.FI + "Inter-Black.otf", int(92 * u))
        d.text((50 * u, 52 * u), "7", font=f, fill=(232, 38, 52), anchor="mm",
               stroke_width=int(5 * u), stroke_fill=(110, 10, 18))
    elif name == "BA":
        d.rounded_rectangle([8 * u, 30 * u, 92 * u, 70 * u], radius=6 * u, fill=(24, 24, 30),
                            outline=(226, 178, 60), width=int(5 * u))
        f = R.ImageFont.truetype(R.FI + "Inter-Black.otf", int(28 * u))
        d.text((50 * u, 51 * u), "BAR", font=f, fill=WHITE, anchor="mm")
    elif name == "C":
        g = (52, 160, 70)
        d.line([34 * u, 62 * u, 52 * u, 16 * u], fill=g, width=int(5 * u))
        d.line([68 * u, 58 * u, 52 * u, 16 * u], fill=g, width=int(5 * u))
        E(52, 8, 82, 26, fill=(70, 185, 80))
        for cx, cy in ((32, 68), (68, 64)):
            E(cx - 18, cy - 18, cx + 18, cy + 18, fill=(214, 28, 48), outline=(120, 10, 25), width=int(2.5 * u))
            E(cx - 10, cy - 11, cx - 3, cy - 4, fill=(255, 190, 200))
    elif name == "L":
        E(8, 44, 22, 58, fill=(240, 200, 40))
        E(78, 42, 92, 56, fill=(240, 200, 40))
        E(14, 26, 86, 74, fill=(252, 220, 60), outline=(196, 150, 20), width=int(3 * u))
        E(28, 34, 46, 44, fill=(255, 245, 170))
    elif name == "BE":
        gold, dark = (248, 196, 50), (170, 118, 10)
        d.ellipse([46 * u, 6 * u, 56 * u, 16 * u], fill=gold, outline=dark, width=int(2 * u))
        d.chord([22 * u, 12 * u, 80 * u, 70 * u], 180, 360, fill=gold, outline=dark, width=int(3 * u))
        d.polygon([(22 * u, 41 * u), (80 * u, 41 * u), (90 * u, 74 * u), (12 * u, 74 * u)], fill=gold)
        d.line([(22 * u, 41 * u), (12 * u, 74 * u)], fill=dark, width=int(3 * u))
        d.line([(80 * u, 41 * u), (90 * u, 74 * u)], fill=dark, width=int(3 * u))
        d.rounded_rectangle([8 * u, 72 * u, 94 * u, 82 * u], radius=4 * u, fill=(230, 170, 30), outline=dark,
                            width=int(3 * u))
        E(43, 80, 59, 94, fill=(200, 140, 20), outline=dark, width=int(2 * u))
        E(32, 26, 42, 52, fill=(255, 236, 150))
    elif name == "D":
        pts = [(18, 36), (32, 18), (68, 18), (82, 36), (50, 86)]
        d.polygon([(x * u, y * u) for x, y in pts], fill=(90, 214, 245), outline=(20, 110, 160))
        fac = (40, 150, 200)
        for a, b in [((18, 36), (82, 36)), ((32, 18), (40, 36)), ((68, 18), (60, 36)), ((50, 18), (40, 36)),
                     ((50, 18), (60, 36)), ((40, 36), (50, 86)), ((60, 36), (50, 86))]:
            d.line([(a[0] * u, a[1] * u), (b[0] * u, b[1] * u)], fill=fac, width=int(2.5 * u))
        d.polygon([(34 * u, 22 * u), (44 * u, 22 * u), (38 * u, 33 * u)], fill=(220, 250, 255))
    return im.resize((S, S), Image.LANCZOS)

SYMS = ["S7", "BA", "C", "L", "BE", "D"]
G = R.G

def init_worker():
    G["banner"] = make_banner("SPIN THE SLOTS")
    G["bg_n"] = make_bg((22, 38, 30))
    G["bg_w"] = make_bg((20, 38, 78))
    G["bg_l"] = make_bg((84, 16, 22))
    rng = np.random.default_rng(11)
    G["noise"] = [np.cumsum(rng.normal(0, 1, 400)) for _ in range(NSPIN + 1)]
    sz = int(P(40))
    G["sym"] = {s: draw_symbol(s, sz) for s in SYMS}
    G["icon"] = {s: draw_symbol(s, int(P(11))) for s in SYMS}
    # fond du rouleau (crème + ombres haut/bas)
    rw, rh = int(P(REEL_W)), int(P(WIN_Y1 - WIN_Y0))
    y = np.linspace(-1, 1, rh)[:, None]
    shade = np.clip(np.abs(y) ** 2.2, 0, 1)
    base = np.array([238, 233, 222], np.float32)
    col = base * (1 - 0.75 * shade)
    arr = np.repeat(col[:, None, :], rw, axis=1).reshape(rh, rw, 3)
    xg = np.linspace(-1, 1, rw)[None, :, None]
    arr = arr * (1 - 0.18 * xg ** 2)
    G["reel_bg"] = np.dstack([arr, np.full((rh, rw), 255, np.float32)])
    G["shade"] = shade.reshape(rh, 1)

def reel_column(r, t):
    pos, vel = reel_pos(r, t)
    rw, rh = int(P(REEL_W)), int(P(WIN_Y1 - WIN_Y0))
    col = Image.fromarray(G["reel_bg"].astype(np.uint8), "RGBA")
    mid = (WIN_Y1 - WIN_Y0) / 2
    base_i = int(math.floor(pos))
    for i in range(base_i - 3, base_i + 4):
        y = mid - (i - pos) * PITCH
        sym = G["sym"][STRIPS[r][i % NSTOP]]
        col.alpha_composite(sym, (int((rw - sym.width) / 2), int(P(y) - sym.height / 2)))
    arr = np.asarray(col).astype(np.float32)
    if vel > 2.0:
        spread = min(P(PITCH) * 0.9, vel / FPS * P(PITCH) * 0.6)
        n = 7
        acc = np.zeros_like(arr)
        for j in range(n):
            acc += np.roll(arr, int(spread * (j / (n - 1) - 0.5)), axis=0)
        arr = acc / n
    # ombre haut/bas par-dessus les symboles
    arr[..., :3] *= (1 - 0.7 * G["shade"])[:, :, None]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA"), vel

# ---------------------------------------------------------------- état
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

def paytable_box(i):
    row, c = divmod(i, 4)
    x0 = 186 + c * 51
    y0 = 409 + row * 26
    return (x0, y0, x0 + 49, y0 + 23)

PT_ENTRIES = [("S7", "×500"), ("D", "×200"), ("BA", "×40"), ("BE", "×20"),
              ("L", "×8"), ("C", "×8"), ("CC", "×3"), (None, "else ×0")]

def render(fi):
    t = fi / FPS
    st = state(t)
    ph, k = st["phase"], st["k"]
    s = ROUNDS[k] if k >= 0 else None
    done = k if ph in ("bet", "spin") else (k + 1 if ph == "reveal" else (NSPIN if ph == "outro" else 0))
    losses = sum(1 for i in range(done) if not ROUNDS[i]["win"])
    lives = LIVES0 - losses

    # ---- fond
    tw = tl = 0.0
    if ph == "reveal":
        a = min(1.0, st["v"] / 0.25) * (1 - 0.35 * smooth((st["v"] - 1.2) / 1.3))
        tw, tl = (a, 0.0) if s["win"] else (0.0, a)
    elif ph == "bet" and k > 0:
        a = 0.65 * (1 - smooth(st["v"] / T_BET))
        tw, tl = (a, 0) if ROUNDS[k - 1]["win"] else (0, a)
    elif ph == "outro":
        tw = 0.5 * smooth(st["v"] / 1.0)
    bg = G["bg_n"] * (1 - tw - tl) + G["bg_w"] * tw + G["bg_l"] * tl
    base = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8), "RGB").convert("RGBA")

    L = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(L)
    shake = 0.0
    if ph == "spin":
        for r in range(3):
            dt = t - stop_time(k, r)
            if 0 <= dt < 0.15:
                shake = math.sin(dt * 90) * 1.6 * (1 - dt / 0.15)

    b = G["banner"]
    L.alpha_composite(b, (int(P(288) - b.width / 2), int(P(189) - b.height / 2)))
    if ph == "reveal" and st["v"] > 0.15:
        pill(d, 288, 233, s["pill"], font("xb", 11.5), RED, WHITE, padx=8, h=19, r=3)
    elif ph == "outro":
        pill(d, 288, 233, "COMMENT YOUR SCORE /8", font("xb", 12), RED, WHITE, padx=8, h=20, r=3)
    else:
        pill(d, 288, 236, "Slots, but it's math", font("bold", 15.5), WHITE, (10, 10, 10), padx=9, h=27, r=3)

    # ---- machine
    rrect(d, (180, 253, 395, 465), 6, fill=(24, 36, 31, 235), outline=(62, 80, 72), w=1)
    ring = None
    if ph == "reveal":
        ring = BLUE if s["win"] else RED
    elif ph == "outro":
        ring = GOLD
    fx0, fy0, fx1, fy1 = 186, WIN_Y0 - 5, 389, WIN_Y1 + 5
    rrect(d, (fx0 + shake, fy0, fx1 + shake, fy1), 5, fill=(14, 16, 18), outline=ring or (120, 96, 50),
          w=2.4 if ring else 1.6)
    if ring:
        g = Image.new("RGBA", L.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).rounded_rectangle([P(fx0 - 3), P(fy0 - 3), P(fx1 + 3), P(fy1 + 3)], radius=P(7),
                                            outline=ring + (80,), width=int(P(5)))
        L.alpha_composite(g)
    for r in range(3):
        colimg, _ = reel_column(r, t)
        L.alpha_composite(colimg, (int(P(REEL_X[r] + shake)), int(P(WIN_Y0))))
    # cadres des symboles gagnants / perdants sur la ligne
    if ph in ("reveal", "outro"):
        rd = s if ph == "reveal" else ROUNDS[-1]
        if ph == "reveal":
            a = int(255 * smooth(st["v"] / 0.2))
            n_hl = 3 if (rd["win"] and rd["key"] != "CC") else (2 if rd["win"] else 3)
            c = (CYAN if rd["win"] else (255, 70, 80)) + (a,)
            for r in range(n_hl):
                x0 = REEL_X[r]
                rrect(d, (x0 + 2, MID_Y - 22, x0 + REEL_W - 2, MID_Y + 22), 4, outline=c, w=1.8)
    # ligne de paiement
    pl = RED if ph != "reveal" else (CYAN if s["win"] else RED)
    d.line([P(186), P(MID_Y), P(389), P(MID_Y)], fill=pl + (110,), width=int(P(1.2)))
    for xx, sgn in ((186, 1), (389, -1)):
        d.polygon([(P(xx), P(MID_Y - 5)), (P(xx), P(MID_Y + 5)), (P(xx + 6 * sgn), P(MID_Y))], fill=pl)

    # levier
    pull = 0.0
    if ph == "bet":
        pull = math.sin(math.pi * min(1, st["v"] / T_BET))
    kx = 404
    ky = 268 + 74 * pull
    d.rounded_rectangle([P(399), P(322), P(409), P(348)], radius=P(2), fill=(80, 86, 90))
    d.line([P(404), P(335), P(kx), P(ky)], fill=(190, 196, 200), width=int(P(3)))
    d.ellipse([P(kx - 7), P(ky - 7), P(kx + 7), P(ky + 7)], fill=RED, outline=(120, 20, 30), width=int(P(1)))
    d.ellipse([P(kx - 4), P(ky - 5), P(kx - 1), P(ky - 2)], fill=(255, 170, 170))

    # table des gains
    hl = s["hl"] if (s and ph in ("bet", "spin", "reveal")) else None
    for i, (key, lab) in enumerate(PT_ENTRIES):
        x0, y0, x1, y1 = paytable_box(i)
        active = hl is None or hl == "all" or hl == key or (hl == "C" and key == "C") or \
            (hl == "CC" and key in ("CC", "C"))
        won = ph == "reveal" and s["win"] and s["key"] == key
        fill = (40, 50, 46) if active else (26, 32, 30)
        rrect(d, (x0, y0, x1, y1), 2.5, fill=fill)
        if won:
            rrect(d, (x0 - .5, y0 - .5, x1 + .5, y1 + .5), 3, fill=YEL)
        elif hl and hl != "all" and active and ph != "outro":
            rrect(d, (x0 - .5, y0 - .5, x1 + .5, y1 + .5), 3, outline=CYAN, w=1.0)
        if key is None:
            text(d, ((x0 + x1) / 2, (y0 + y1) / 2), lab, font("bold", 7), (120, 130, 126))
            continue
        icons = ["C", "C", None] if key == "CC" else [key] * 3
        for j, ic in enumerate(icons):
            cxp = x0 + 6.5 + j * 9.5
            if ic:
                im = G["icon"][ic]
                if not active:
                    im = im.copy(); im.putalpha(im.getchannel("A").point(lambda v: v * 0.4))
                L.alpha_composite(im, (int(P(cxp) - im.width / 2), int(P((y0 + y1) / 2) - im.height / 2)))
            else:
                text(d, (cxp, (y0 + y1) / 2), "–", font("bold", 7), (150, 160, 156))
        tc = (20, 20, 20) if won else (WHITE if active else (110, 118, 115))
        text(d, (x1 - 2.5, (y0 + y1) / 2 + 0.3), lab, font("xb", 7), tc, "rm")

    # statut
    if ph == "intro":
        pill_txt, pc = "PULL 8 TIMES", (50, 58, 56)
    elif ph in ("bet", "spin"):
        pill_txt, pc = f"#{k + 1}/8  {s['name']} : WIN OR LOSE?", (50, 58, 56)
    elif ph == "reveal":
        pill_txt, pc = (f"#{k + 1}/8  WIN +{s['delta']}", BLUE) if s["win"] else \
            (f"#{k + 1}/8  LOST −{STAKE}", RED)
    else:
        pill_txt, pc = "SESSION OVER", GOLD
    fpill = font("xb", 12.5)
    half = max(87, d.textlength(pill_txt, font=fpill) / K / 2 + 12)
    rrect(d, (288 - half, 469, 288 + half, 497), 5, fill=pc)
    text(d, (288, 483.5), pill_txt, fpill, WHITE)
    rrect(d, (205, 502, 371, 505), 1.5, fill=(48, 56, 54))
    if ph == "spin":
        rrect(d, (205, 502, 205 + 166 * st["u"], 505), 1.5, fill=ORANGE)

    # ---- colonne gauche
    lab = font("bold", 10)
    text(d, (95, 282), "LIVES", lab, (225, 230, 228))
    bw, gap = 12, 2.6
    tot = LIVES0 * bw + (LIVES0 - 1) * gap
    for i in range(LIVES0):
        x0 = 95 - tot / 2 + i * (bw + gap)
        flash = ph == "reveal" and not s["win"] and i == lives and st["v"] < 0.8 and int(st["v"] * 10) % 2 == 0
        col = GREEN if i < lives else (RED if flash else (44, 54, 50))
        rrect(d, (x0, 296, x0 + bw, 305), 2, fill=col)
    text(d, (95, 328), "CREDITS", lab, (225, 230, 228))
    rrect(d, (63, 340, 127, 372), 4, fill=(12, 6, 8), outline=(70, 30, 34), w=1)
    disp = bank[done]
    if ph == "reveal":
        disp = round(bank[k] + (bank[k + 1] - bank[k]) * smooth(st["v"] / 0.6))
    fm = font("mono", 23)
    text(d, (95, 357), "888", fm, (52, 14, 16))
    text(d, (95, 357), f"{disp:>3d}", fm, (255, 52, 58))
    text(d, (95, 391), "PULLS", lab, (225, 230, 228))
    for i in range(8):
        x0 = 61 + (i % 4) * 17.5
        y0 = 402 + (i // 4) * 17.5
        box = (x0, y0, x0 + 13, y0 + 13)
        if i < done:
            win = ROUNDS[i]["win"]
            rrect(d, box, 2, fill=BLUE if win else RED)
            (check if win else cross)(d, x0 + 6.5, y0 + 6.5, 10, WHITE)
        elif i == k and ph in ("bet", "spin"):
            rrect(d, box, 2, fill=(30, 36, 34), outline=ORANGE, w=1.2)
        else:
            rrect(d, box, 2, fill=(30, 36, 34), outline=(64, 72, 70), w=1)

    # ---- colonne droite
    if ph == "intro":
        big, l1, l2, sm, bc = "8000", "COMBOS ON", "3 REELS", "20 × 20 × 20 stops", ORANGE
    elif ph == "outro":
        big, l1, l2, sm, bc = f"{WINS}/8", "YOUR", "SCORE", f"credits 100 → {bank[-1]}", YEL
    else:
        pct = float(s["stat"].split()[0])
        big, l1, l2, sm = s["stat"], s["l1"], (s["name"] if s["name"] != "RTP" else "PLAYER"), s["sub"]
        bc = LAV if pct > 40 else ORANGE
        if ph == "bet":
            tt = smooth(st["v"] / 0.55)
            dec = 2 if pct < 0.1 else 1
            big = f"{pct * tt:.{dec}f} %"
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
    text(d, (GDROP, 512), "STOP", font("bold", 7.5), (140, 150, 146))
    for tx in np.arange(70, 515, 6.3):
        d.line([P(tx), P(660), P(tx), P(665)], fill=(90, 100, 96), width=int(P(0.7)))

    if ph == "intro":
        glow_dot(L, 65, fy(3.2) + math.sin(t * 4) * 2, YEL)
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
        post = post_curve(k, s["win"], smooth(st["v"] / 0.7))
        draw_curve(d, post, col, 2.2)
        glow_dot(L, post[-1][0], post[-1][1], col)
        if st["v"] > 0.5:
            a = int(255 * smooth((st["v"] - 0.5) / 0.3))
            sc = 1 + 0.25 * (1 - smooth((st["v"] - 0.5) / 0.25))
            if s["win"]:
                d.line([P(292), P(GAXIS - 4), P(292), P(fy(3.9))], fill=CYAN + (a,), width=int(P(1)))
                text(d, (300, fy(3.5)), "+24  (s = +2)", font("semi", 8), CYAN + (a,), "lm")
                text(d, (430, 556), f"+{s['delta']}", font("black", 31 * sc), CYAN + (a,))
            else:
                text(d, (300, fy(2.25)), "−36  (s = −3)", font("semi", 8), (255, 120, 120, a), "lm")
                text(d, (420, 556), "LOST", font("black", 31 * sc), RED + (a,))
    elif ph == "outro":
        v = smooth(st["v"] / 1.6)
        pts = []
        for i in range(int(160 * v) + 2):
            w = i / 160
            j = w * NSPIN
            a = int(min(j, NSPIN - 1))
            bnk = bank[a] + (bank[a + 1] - bank[a]) * smooth((j - a) * 2)
            pts.append((GX0 + 30 + (GDROP - GX0 - 30) * w, fy(3.4) - (bnk - 100) * 0.42 + G["noise"][0][i] * 0.5))
        draw_curve(d, pts, YEL, 2.2)
        glow_dot(L, pts[-1][0], pts[-1][1], YEL)

    # ---- pièces sur un gain
    if ph == "reveal" and s["win"] and st["v"] < 2.4:
        rng = np.random.default_rng(100 + k)
        n = 10 + int(s["delta"] / 4)
        for c in range(n):
            vx = rng.uniform(-70, 70); vy = rng.uniform(-170, -90); t0c = rng.uniform(0, 0.4)
            tt = st["v"] - t0c
            if tt < 0:
                continue
            x = 288 + vx * tt
            y = 455 + vy * tt + 240 * tt * tt
            if y > 700:
                continue
            wdt = 5.5 * abs(math.cos(tt * 9 + c))
            d.ellipse([P(x - wdt - .6), P(y - 5.5), P(x + wdt + .6), P(y + 5.5)], fill=(250, 205, 60),
                      outline=(170, 120, 10), width=int(P(0.8)))

    # ---- formules
    if ph == "intro":
        f1 = [("i", "P"), ("r", "(win) = "), F("# winning combos", "8000")]
        f2 = [("r", "every pull is a note :  "), ("i", "f"), ("sub", "out"), ("r", " = "), ("i", "f"),
              ("r", "·2"), ("sup", "s")]
        f3, tag = None, "guess every pull before it stops"
    elif ph == "outro":
        bits = "".join("1" if x["win"] else "0" for x in ROUNDS)
        f1 = [("r", f"{bits} = this session's pulls")]
        f2 = [("i", "E"), ("r", "[profit] = 80 · (−0.0875) = −7.00")]
        f3 = [("r", f"this run : +{bank[-1] - 100}  ⇒  luck, not edge")]
        tag = "comment your score /8"
    else:
        f1, f2, tag = s["f1"], s["f2"], s["tag"]
        if ph == "reveal" and st["v"] > 0.3:
            if s["win"]:
                f3 = [("i", "s"), ("r", " = +2 :  4"), ("i", "f"), ("r", "  WIN (glass bell)")]
            else:
                f3 = [("i", "s"), ("r", " = −3 :  "), ("i", "f"), ("r", "/8  LOST (sub saw)")]
        else:
            f3 = [("i", "f"), ("sub", "out"), ("r", " = "), ("i", "f"), ("r", "·2"), ("sup", "s"),
                  ("r", ",   "), ("i", "s"), ("r", " = ?")]
    formula(L, 288, 706, f1, 19, (245, 245, 245))
    formula(L, 288, 744, f2, 12.5, (205, 210, 208))
    if f3:
        formula(L, 288, 771, f3, 12.5, (205, 210, 208))
    pill(d, 288, 808, tag, font("bold", 14), YEL, (12, 12, 12), padx=8, h=24, r=3)

    if t < 0.4:
        L.alpha_composite(Image.new("RGBA", L.size, (0, 0, 0, int(255 * (1 - t / 0.4)))))
    base.alpha_composite(L.reduce(SS))
    return base.convert("RGB").tobytes()

# ---------------------------------------------------------------- audio
SR = 44100
def synth_audio(path):
    import wave
    n = int(DURATION * SR) + SR
    out = np.zeros((n, 2), np.float32)
    rng = np.random.default_rng(5)
    def add(sig, t0, pan=0.0, gain=1.0):
        i0 = int(t0 * SR); i1 = min(n, i0 + len(sig))
        if i1 <= i0:
            return
        x = sig[: i1 - i0] * gain
        out[i0:i1, 0] += x * (1 - max(0, pan)); out[i0:i1, 1] += x * (1 + min(0, pan))
    def tone(f, dur, decay=6.0, harm=(1.0,), att=0.004):
        tt = np.arange(int(dur * SR)) / SR
        sig = sum(a * np.sin(2 * np.pi * f * (i + 1) * tt) for i, a in enumerate(harm))
        return (sig * np.exp(-tt * decay) * np.minimum(1, tt / att)).astype(np.float32)
    def bell(f, dur=2.2):
        tt = np.arange(int(dur * SR)) / SR
        sig = sum(a * np.sin(2 * np.pi * f * m * tt) * np.exp(-tt * dc)
                  for m, a, dc in [(1, 1.0, 2.2), (2.76, .5, 3.5), (5.4, .28, 5), (8.93, .15, 7)])
        return (sig * np.minimum(1, tt / 0.002)).astype(np.float32)
    def saw_drop(f0, f1, dur):
        tt = np.arange(int(dur * SR)) / SR
        ph = np.cumsum(f0 * (f1 / f0) ** (tt / dur)) / SR
        sig = np.convolve(2 * (ph % 1) - 1, np.ones(12) / 12, mode="same")
        return (sig * np.minimum(1, tt / 0.01) * np.exp(-tt * 1.6)).astype(np.float32)
    def noise(dur, dec, smoothn=1):
        tt = np.arange(int(dur * SR)) / SR
        z = rng.normal(0, 1, len(tt))
        if smoothn > 1:
            z = np.convolve(z, np.ones(smoothn) / smoothn, mode="same")
        else:
            z = np.diff(z, prepend=0)
        return (z * np.exp(-tt * dec)).astype(np.float32)
    def kick(t0, g=0.5):
        tt = np.arange(int(0.35 * SR)) / SR
        f = 45 + 90 * np.exp(-tt * 30)
        add((np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9)).astype(np.float32), t0, gain=g)

    tt = np.arange(n) / SR
    pad = (0.5 * np.sin(2 * np.pi * 110 * tt) + 0.3 * np.sin(2 * np.pi * 164.8 * tt + 1)
           + 0.2 * np.sin(2 * np.pi * 220.5 * tt)) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.42 * tt))
    out[:, 0] += pad * 0.035; out[:, 1] += pad * 0.035
    tb, j = 0.0, 0
    while tb < DURATION - 1.0:
        kick(tb, 0.32)
        add(noise(0.05, 90), tb + BEAT / 2, pan=0.25, gain=0.10)
        if j % 2 == 1:
            add(noise(0.18, 22) + tone(190, 0.18, 30) * 0.6, tb, gain=0.16)
        tb += BEAT; j += 1

    for i, f in enumerate([440, 523.3, 659.3, 880]):
        add(tone(f, 0.6, 7, (1, .3, .1)), 0.25 + i * BEAT / 4, pan=(i - 1.5) * 0.3, gain=0.22)
    add(bell(1760), 1.0, gain=0.10)

    PENTA = [220.0, 261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0, 880.0]
    for k, rd in enumerate(ROUNDS):
        st0 = spin_start(k)
        for c in range(9):                                   # cliquetis du levier
            add(noise(0.015, 400), st0 + 0.05 + c * 0.05, gain=0.30)
        add(tone(70, 0.3, 12), st0 + 0.5, gain=0.5)
        ts = st0 + T_BET
        tc, i = ts, 0
        while tc < stop_time(k, 2):                           # rouleaux qui défilent
            moving = sum(tc < stop_time(k, r) for r in range(3))
            add(noise(0.012, 500), tc, pan=math.sin(i * 1.7) * 0.5, gain=0.07 * moving)
            tc += 0.035; i += 1
        tn = ts
        while tn < stop_time(k, 2) - 0.1:                    # notes qui suivent le tracé
            u = (tn - ts) / (T_LAND - T_BET)
            q = R.G_noise_level(k, u)
            add(tone(PENTA[int(np.clip(q, 0, 10))], 0.18, 22, (1, .25, .08)), tn, gain=0.11)
            tn += BEAT / 2
        for r in range(3):                                   # arrêt de chaque rouleau
            t_s = stop_time(k, r)
            kick(t_s, 0.45)
            add(noise(0.04, 120), t_s, pan=(r - 1) * 0.5, gain=0.5)
            add(tone([440, 554.4, 659.3][r], 0.35, 10, (1, .4, .1)), t_s, pan=(r - 1) * 0.5, gain=0.16)
        te = st0 + T_LAND
        if rd["win"]:
            add(bell(1760), te + 0.05, gain=0.22)
            for c in range(10 + rd["delta"] // 5):            # pluie de pièces
                add(bell(rng.uniform(2500, 4200), 0.5), te + 0.1 + rng.uniform(0, 1.6),
                    pan=rng.uniform(-0.7, 0.7), gain=0.05)
        else:
            add(saw_drop(220, 41, 1.6), te + 0.02, gain=0.30)
            add(noise(0.5, 6, 30), te, gain=0.5)

    to = INTRO + NSPIN * SPIN_LEN
    for i, x in enumerate(ROUNDS):
        add(tone(880 if x["win"] else 330, 0.4, 9, (1, .3, .1)), to + 0.3 + i * BEAT / 2,
            pan=(i - 3.5) * 0.12, gain=0.18)
    for f in (440, 554.4, 659.3, 880):
        add(tone(f, 2.5, 1.4, (1, .3, .1), att=0.02), to + 1.75, gain=0.10)
    add(bell(1760, 3.0), to + 1.75, gain=0.15)

    out = out[: int(DURATION * SR)]
    fade = int(0.6 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    out /= np.max(np.abs(out)) / 0.89
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((out * 32767).astype(np.int16).tobytes())

def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "spin_the_slots_tiktok.mp4"
    init_worker()
    if len(sys.argv) > 2 and sys.argv[2] == "--preview":
        for tt in map(float, sys.argv[3:]):
            Image.frombytes("RGB", (W, H), render(int(tt * FPS))).save(f"/tmp/slot_{tt:05.1f}.png")
        return
    wav = "/tmp/slots_audio.wav"
    synth_audio(wav)
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "18",
           "-pix_fmt", "yuv420p", "-af", R.AUDIO_FX, "-ar", "44100", "-c:a", "aac", "-b:a", "192k",
           "-movflags", "+faststart", "-t", f"{DURATION:.3f}", out]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(os.cpu_count(), initializer=init_worker) as pool:
        for i, fr in enumerate(pool.imap(render, range(NFRAMES), chunksize=4)):
            ff.stdin.write(fr)
            if i % 300 == 0:
                print(f"frame {i}/{NFRAMES}", flush=True)
    ff.stdin.close(); ff.wait()
    print("ok", out)

if __name__ == "__main__":
    main()
