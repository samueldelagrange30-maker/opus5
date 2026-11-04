"""PICK 6 : loterie 6/49, combinaisons et loi hypergéométrique."""
import math
from math import comb
import numpy as np
from engine2 import (Fr, P, GP, font, text, rrect, smooth, T_BET, T_LAND, BEAT,
                     glow_circle, glow_rrect, glow_text, paste_emoji, pop,
                     RED, BLUE, GOLD, YEL, CYAN, WHITE, ORANGE, GREEN)

TITLE, SUBTITLE, OUT = "PICK 6", "Lottery, but it's math", "pick_6_tiktok.mp4"
QUESTION, BANK_LABEL, COUNT_LABEL, AXIS_LABEL = "HIT OR MISS?", "CHIPS", "DRAWS", "DRAW"
OUTRO_WORD, LIVES0, SEED = "this session's draws", 5, 74
HOOK = ["1 IN 13,983,816", "ONLY 0.4 % GUESS 8/8", "CAN YOU?"]
TICKET = [7, 13, 21, 28, 35, 42]
TOT = comb(49, 6)
PK = [comb(6, k) * comb(43, 6 - k) / TOT for k in range(7)]

def RD(name, draw, win, stat, sub, f1, f2, tag, pill_, l2=None):
    return dict(name=name, draw=draw, win=win, delta=10 if win else -10, stat=stat, sub=sub,
                l1="CHANCE OF", l2=l2 or name, f1=f1, f2=f2, tag=tag, pill=pill_,
                stamp_lose="MISS", lose_word="MISS", stamp_win="HIT +10")

def matches(draw):
    return sum(1 for b in draw if b in TICKET)

ROUNDS = [
    RD("ANY MATCH", [3, 17, 21, 30, 38, 46], True, f"{(1 - PK[0]) * 100:.1f} %", "≥ 1 of your 6",
       [("i", "P"), ("r", "(≥ 1) = 1 − "), Fr("C(43,6)", "C(49,6)"), ("r", f" = {(1 - PK[0]) * 100:.1f} %")],
       [("r", "C(49,6) = 13,983,816 possible draws")], "matching one ball is easy", "+1 POINT PER RIGHT CALL"),
    RD("2+ MATCHES", [5, 13, 19, 26, 33, 47], False, f"{(1 - PK[0] - PK[1]) * 100:.1f} %", "≥ 2 of your 6",
       [("i", "P"), ("r", "(≥ 2) = 1 − "), ("i", "P"), ("r", "(0) − "), ("i", "P"),
        ("r", f"(1) = {(1 - PK[0] - PK[1]) * 100:.1f} %")],
       [("i", "P"), ("r", "(1 match) = "), Fr("6·C(43,5)", "C(49,6)"), ("r", f" = {PK[1] * 100:.1f} %")],
       "one match is the most common result", "JUST ONE"),
    RD("NO MATCH", [2, 11, 18, 24, 39, 45], True, f"{PK[0] * 100:.1f} %", "0 of your 6",
       [("i", "P"), ("r", "(0) = "), Fr("C(43,6)", "C(49,6)"), ("r", f" = {PK[0] * 100:.1f} %")],
       [("r", "almost half of all draws : nothing")], "zero is a 44 % event", "CALLED THE MISS"),
    RD("BALL 7", [8, 15, 22, 29, 36, 44], False, f"{6 / 49 * 100:.1f} %", "6 of 49 balls",
       [("i", "P"), ("r", "(7 is drawn) = "), Fr(6, 49), ("r", f" = {6 / 49 * 100:.1f} %")],
       [("r", "lucky numbers have no extra luck")], "7 is just another ball", "NO LUCKY 7", l2="BALL 7 DRAWN"),
    RD("EVEN FIRST", [16, 4, 27, 33, 41, 9], True, f"{24 / 49 * 100:.1f} %", "24 of 49 balls",
       [("i", "P"), ("r", "(1st ball even) = "), Fr(24, 49), ("r", f" = {24 / 49 * 100:.1f} %")],
       [("r", "24 even, 25 odd")], "odd has one extra ball", "+10 CHIPS", l2="AN EVEN 1ST BALL"),
    RD("BACK-TO-BACK", [6, 31, 32, 40, 12, 25], True, f"{(1 - comb(44, 6) / TOT) * 100:.1f} %", "e.g. 31 & 32",
       [("i", "P"), ("r", "(2 consecutive) = 1 − "), Fr("C(44,6)", "C(49,6)"),
        ("r", f" = {(1 - comb(44, 6) / TOT) * 100:.1f} %")],
       [("r", "people avoid 31-32, the drum doesn't")], "patterns are normal", "TWO LIVES LEFT",
       l2="2 CONSECUTIVE BALLS"),
    RD("3+ MATCHES", [7, 20, 34, 43, 1, 10], False, f"{sum(PK[3:]) * 100:.2f} %", "≈ 1 in 54",
       [("i", "P"), ("r", "(≥ 3) = Σ "), Fr("C(6,k)·C(43,6−k)", "C(49,6)"), ("r", f" = {sum(PK[3:]) * 100:.2f} %")],
       [("i", "P"), ("r", "(exactly 3) ≈ 1 in 57")], "the first real prize is rare", "LAST DRAW NEXT"),
    RD("JACKPOT", [13, 21, 28, 35, 42, 44], False, f"{PK[6] * 100:.6f} %", "1 in 13,983,816",
       [("i", "P"), ("r", "(6/6) = "), Fr(1, "13,983,816")],
       [("r", "5 of 6 :  "), Fr(258, "13,983,816"), ("r", " ≈ 1 in 54,201")], "5 of 6… and still no jackpot",
       "5 OUT OF 6!", l2="ALL 6 NUMBERS"),
]
INTRO = dict(big="6/49", l1="PICK 6", l2="FROM 49", sm="13,983,816 draws", status="8 DRAWS",
             f1=[("i", "P"), ("r", "("), ("i", "k"), ("r", " matches) = "), Fr("C(6,k)·C(43,6−k)", "C(49,6)")],
             f2=[("r", "every draw is a note :  "), ("i", "f"), ("sub", "out"), ("r", " = "), ("i", "f"),
                 ("r", "·2"), ("sup", "s")],
             tag="hit or miss? call it")
OUTRO = dict(f2=[("r", "most lotteries pay back ≈ 50 % of tickets")],
             f3=[("r", "this run : ±0  ⇒  even, by pure luck")])

DRUM = (240.0, 316.0, 46.0)
TRAY_Y = 392.0
BALL_R = 9.5

def ball_color(n):
    return [(250, 200, 50), (60, 140, 240), (230, 60, 70), (60, 190, 110), (170, 90, 230)][min(4, (n - 1) // 10)]

def init(G):
    rng = np.random.default_rng(5)
    G["drum_balls"] = [(int(rng.integers(1, 50)), rng.uniform(0, 6.28), rng.uniform(1.5, 3.5),
                        rng.uniform(0, 6.28), rng.uniform(1.5, 3.5)) for _ in range(16)]

def ball(d, GL, x, y, n, r=BALL_R, glow=False, dim=1.0):
    c = tuple(int(v * dim) for v in ball_color(n))
    if glow:
        glow_circle(GL, x, y, r * 1.8, YEL, 220)
    d.ellipse([P(x - r), P(y - r), P(x + r), P(y + r)], fill=c, outline=(20, 20, 26), width=int(P(0.6)))
    d.ellipse([P(x - r * .62), P(y - r * .62), P(x + r * .62), P(y + r * .62)], fill=(250, 250, 248))
    text(d, (x, y + 0.3), str(n), font("black", r * 0.85), (20, 20, 26))
    d.ellipse([P(x - r * .55), P(y - r * .75), P(x - r * .2), P(y - r * .45)], fill=(255, 255, 255, 160))

def ball_times():
    return [T_BET + (0.15 + j * 0.17) * (T_LAND - T_BET) for j in range(6)]

def slot_x(j):
    return 200 + j * 24.0

def draw_center(L, d, GL, t, st):
    ph, k = st["phase"], st["k"]
    rd = ROUNDS[k] if k >= 0 else None
    if ph == "outro":
        rd = ROUNDS[-1]
    lt = st["lt"] if ph in ("bet", "spin", "reveal") else 99
    cx, cy, R0 = DRUM
    # boulier
    d.ellipse([P(cx - R0), P(cy - R0), P(cx + R0), P(cy + R0)], fill=(30, 44, 60, 200), outline=(150, 180, 210),
              width=int(P(1.6)))
    spinning = ph == "spin"
    energy = 1.0 if spinning else 0.15
    for i, (n, p1, f1, p2, f2) in enumerate(G_["drum_balls"]):
        tt = t * energy
        rr = R0 - 12
        x = cx + rr * 0.85 * math.sin(f1 * tt + p1) * (0.6 + 0.4 * math.cos(tt * 0.7 + i))
        y = cy + rr * 0.85 * math.cos(f2 * tt + p2) * (0.6 + 0.4 * math.sin(tt * 0.9 + i)) if spinning else \
            cy + rr * 0.55 + (i % 4) * -6 + math.sin(i) * 3
        if not spinning:
            x = cx - 28 + (i % 6) * 11 + (i // 6) * 5
            y = cy + R0 - 13 - (i // 6) * 9
        ball(d, GL, x, y, n, r=7.5, dim=0.9)
    # tube de sortie
    rrect(d, (cx + R0 - 6, cy + 18, cx + R0 + 22, cy + 30), 3, fill=(40, 56, 74), outline=(120, 150, 180), w=0.8)
    # ticket
    tx0, ty0 = 304.0, 262.0
    rrect(d, (tx0, ty0, tx0 + 80, ty0 + 112), 5, fill=(246, 240, 226), outline=(200, 180, 140), w=1)
    text(d, (tx0 + 40, ty0 + 10), "YOUR TICKET", font("black", 7), (150, 40, 50))
    drawn = []
    if rd is not None:
        for j, tb in enumerate(ball_times()):
            if lt >= tb:
                drawn.append((rd["draw"][j], lt - tb))
    drawn_nums = {n for n, _ in drawn}
    for i, n in enumerate(TICKET):
        x = tx0 + 20 + (i % 2) * 40
        y = ty0 + 30 + (i // 2) * 28
        hit = n in drawn_nums
        if hit:
            glow_circle(GL, x, y, 15, YEL, 230)
            d.ellipse([P(x - 12), P(y - 12), P(x + 12), P(y + 12)], fill=YEL, outline=(150, 100, 10),
                      width=int(P(1.2)))
        else:
            d.ellipse([P(x - 12), P(y - 12), P(x + 12), P(y + 12)], outline=(190, 170, 140), width=int(P(1)))
        text(d, (x, y + 0.4), str(n), font("black", 11), (60, 40, 20) if not hit else (40, 20, 0))
    # plateau des boules tirées
    rrect(d, (188, TRAY_Y - 13, 344, TRAY_Y + 13), 6, fill=(16, 22, 30), outline=(70, 90, 110), w=0.8)
    for j in range(6):
        d.ellipse([P(slot_x(j) - 9), P(TRAY_Y - 9), P(slot_x(j) + 9), P(TRAY_Y + 9)], fill=(26, 34, 44))
    for j, (n, age) in enumerate(drawn):
        a = smooth(age / 0.25)
        sx, sy = cx + R0 + 16, cy + 24
        x = sx + (slot_x(j) - sx) * a
        y = sy + (TRAY_Y - sy) * a - 18 * math.sin(math.pi * a)
        bounce = 2.5 * abs(math.sin(age * 18)) * math.exp(-age * 7) if a >= 1 else 0
        ball(d, GL, x, y - bounce, n, glow=(n in TICKET and a >= 1))
    # histogramme P(k correspondances)
    m = sum(1 for n in drawn_nums if n in TICKET)
    text(d, (188, 414), "MATCHES", font("xb", 6.5), (160, 170, 180), "lm")
    text(d, (238, 414), str(m), font("black", 9), YEL if m else WHITE, "lm")
    for kk in range(7):
        x0 = 196 + kk * 27
        hgt = max(1.2, math.log10(PK[kk] * 1e7 + 1) / 7 * 26)
        col = (70, 170, 190) if kk != m else YEL
        rrect(d, (x0, 450 - hgt, x0 + 20, 450), 1.5, fill=col)
        text(d, (x0 + 10, 456), f"{kk}", font("bold", 6), (170, 180, 190))
    text(d, (378, 414), "log scale", font("med", 5.5), (110, 120, 130), "rm")

import render as R
G_ = R.G

def audio_round(A, k, rd, st0):
    import numpy as np
    ts, te = st0 + T_BET, st0 + T_LAND
    for i in range(int((te - ts) / 0.07)):                      # boules qui s'entrechoquent
        A.add(A.noise(0.01, 700), ts + i * 0.07 + A.rng.uniform(0, 0.04), pan=A.rng.uniform(-0.5, 0.5),
              gain=0.10)
    for j, tb in enumerate(ball_times()):
        n = rd["draw"][j]
        tt = st0 + tb
        A.add(A.noise(0.04, 80, 2), tt, gain=0.3)
        A.add(A.tone(523.3 * 2 ** (j / 6), 0.25, 12, (1, .3)), tt, gain=0.12)
        if n in TICKET and j < 5:
            A.add(A.bell(1760 * 2 ** (j / 12), 1.0), tt + 0.05, gain=0.15)
