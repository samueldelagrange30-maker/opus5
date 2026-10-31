"""DROP THE BALL : planche de Galton, loi binomiale, triangle de Pascal."""
import math
import numpy as np
from math import comb
from engine import (Fr, P, font, text, rrect, smooth, T_BET, T_LAND,
                    RED, BLUE, GOLD, YEL, CYAN, WHITE, ORANGE)
import render as R

TITLE, SUBTITLE, OUT = "DROP THE BALL", "Galton board, but it's math", "drop_the_ball_tiktok.mp4"
QUESTION, BANK_LABEL, COUNT_LABEL, AXIS_LABEL = "PROFIT OR NOT?", "CHIPS", "DROPS", "LAND"
OUTRO_WORD, LIVES0, SEED = "this session's drops", 6, 44
ROWS = 8
MULT = [10, 3, 1.5, 0.5, 0.3, 0.5, 1.5, 3, 10]
MLAB = ["10×", "3×", "1.5×", "0.5×", "0.3×", "0.5×", "1.5×", "3×", "10×"]

def RD(name, hl, res, stat, l2, sub, f1, f2, tag, pill_):
    m = MULT[res]
    return dict(name=name, hl=hl, res=res, stat=stat, l2=l2, sub=sub, f1=f1, f2=f2, tag=tag, pill=pill_,
                win=m > 1, delta=int(round(10 * m - 10)))

def C(n, k):
    return [("r", "C("), ("r", f"{n},{k}"), ("r", ")")]

ROUNDS = [
    RD("MIDDLE", {4}, 4, "27.3 %", "THE MIDDLE", "70 of 256 paths",
       [("i", "P"), ("r", "(middle) = "), Fr("C(8,4)", "2⁸"), ("r", " = "), Fr(70, 256), ("r", " = 27.3 %")],
       [("r", "the middle pays 0.3× : you get 3 back")], "the likeliest slot pays least", "+1 POINT PER RIGHT CALL"),
    RD("EDGE 10×", {0, 8}, 7, "0.78 %", "A 10× EDGE", "2 of 256 paths",
       [("i", "P"), ("r", "(10×) = "), Fr(2, 256), ("r", " = 0.78 %")],
       [("r", "8 bounces the same way :  ("), Fr(1, 2), ("r", ")"), ("sup", "8")],
       "close to the edge, not on it", "+20 CHIPS"),
    RD("SLOT 3", {3}, 3, "21.9 %", "SLOT 3", "56 of 256 paths",
       [("i", "P"), ("r", "(slot 3) = "), Fr("C(8,3)", 256), ("r", " = 21.9 %")],
       [("r", "C(8,3) = "), Fr("8!", "3!·5!"), ("r", " = 56 paths")], "Pascal's triangle decides",
       "HALF BACK"),
    RD("BELL CURVE", {3, 4, 5}, 2, "71.1 %", "SLOTS 3 TO 5", "182 of 256 paths",
       [("i", "P"), ("r", "(3 to 5) = "), Fr(182, 256), ("r", " = 71.1 %")],
       [("r", "binomial(8, ½) : most balls stay central")], "a bell curve made of pegs", "+5 CHIPS"),
    RD("3× OR MORE", {0, 1, 7, 8}, 5, "7.0 %", "3× OR MORE", "18 of 256 paths",
       [("i", "P"), ("r", "(≥ 3×) = "), Fr("2·(1 + 8)", 256), ("r", " = 7.0 %")],
       [("r", "big multipliers live at the edges")], "the edges are where the money isn't",
       "BACK TO THE MIDDLE"),
    RD("RTP", set(range(9)), 4, "89.5 %", "PLAYER", "229 of 256 back",
       [("r", "RTP = Σ "), ("i", "p"), ("r", "·mult = "), Fr(229, 256), ("r", " = 89.5 %")],
       [("r", "house edge = 1 − RTP = 10.5 %")], "the board keeps 10.5 % of every drop", "TWO LIVES LEFT"),
    RD("FAR LEFT", {0}, 0, "0.39 %", "SLOT 0", "1 of 256 paths",
       [("i", "P"), ("r", "(slot 0) = ("), Fr(1, 2), ("r", ")"), ("sup", "8"), ("r", " = "), Fr(1, 256)],
       [("i", "E"), ("r", "[slot] = 8·½ = 4,   σ = √2")], "1 in 256 happens sometimes", "+90 CHIPS!"),
    RD("ONE PATH", {4}, 4, "0.39 %", "THIS EXACT PATH", "1 of 256 paths",
       [("i", "P"), ("r", "(one path) = ("), Fr(1, 2), ("r", ")"), ("sup", "8"), ("r", " = 0.39 %")],
       [("r", "2"), ("sup", "8"), ("r", " = 256 paths, all equally rare")], "every path is a 1 in 256",
       "SO CLOSE."),
]
ROUNDS[0]["l1"] = "CHANCE OF"
ROUNDS[5]["l1"] = "RETURN TO"
INTRO = dict(big="256", l1="PATHS TO", l2="THE BOTTOM", sm="8 rows · 2 ways each", status="DROP 8 BALLS",
             f1=[("i", "P"), ("r", "(slot "), ("i", "k"), ("r", ") = "), Fr("C(8, k)", "256")],
             f2=[("r", "every drop is a note :  "), ("i", "f"), ("sub", "out"), ("r", " = "), ("i", "f"),
                 ("r", "·2"), ("sup", "s")],
             tag="call every drop before it lands")
OUTRO = dict(f2=[("i", "E"), ("r", "[profit] = 80 · ("), Fr(229, 256), ("r", " − 1) = −8.44")],
             f3=[("r", "this run : +84  ⇒  luck, not edge")])

SP = 20.0
X0 = 288.0
Y_ROW0, DY = 276.0, 15.5
Y_SLOT = 412.0

def path_for(k):
    rng = np.random.default_rng(500 + k)
    res = ROUNDS[k]["res"]
    steps = [1] * res + [0] * (ROWS - res)
    rng.shuffle(steps)
    return steps

PATHS = [path_for(k) for k in range(len(ROUNDS))]

def waypoints(k):
    """positions (x, y) : départ, chaque clou (bille posée dessus), fente"""
    pts = [(X0, 258.0)]
    rights = 0
    for r in range(ROWS):
        pts.append((X0 + (rights - r / 2) * SP, Y_ROW0 + r * DY - 6))
        rights += PATHS[k][r]
    pts.append((X0 + (rights - ROWS / 2) * SP, Y_SLOT))
    return pts

def ball_pos(k, u):
    pts = waypoints(k)
    n = len(pts) - 1
    f = min(u, 0.9999) * n
    i = int(f)
    v = f - i
    (x0, y0), (x1, y1) = pts[i], pts[i + 1]
    x = x0 + (x1 - x0) * smooth(v)
    y = y0 + (y1 - y0) * v * v - 7 * math.sin(math.pi * v) * (i > 0)
    return x, y, i, v

def init(G):
    pass

def draw_center(L, d, t, st):
    ph, k = st["phase"], st["k"]
    s = ROUNDS[k] if k >= 0 else None
    hit_row, hit_age = -1, 9
    if ph == "spin":
        bx, by, seg, v = ball_pos(k, st["u"])
        hit_row, hit_age = seg - 1, v
    # clous
    for r in range(ROWS):
        y = Y_ROW0 + r * DY
        for j in range(-1, r + 2):
            x = X0 + (j - r / 2) * SP
            if x < 190 or x > 386:
                continue
            col = (150, 160, 170)
            rr = 2.4
            if ph == "spin" and r == hit_row and hit_age < 0.5:
                rights = sum(PATHS[k][:r])
                if abs(x - (X0 + (rights - r / 2) * SP)) < 1:
                    col, rr = YEL, 3.4
            d.ellipse([P(x - rr), P(y - rr), P(x + rr), P(y + rr)], fill=col)
    # fentes
    hl = s["hl"] if (s and ph in ("bet", "spin", "reveal")) else None
    for i in range(9):
        x = X0 + (i - 4) * SP
        m = MULT[i]
        col = (214, 50, 66) if m >= 3 else ((230, 140, 50) if m > 1 else (70, 82, 78))
        if hl is not None and i not in hl:
            col = tuple(int(c * 0.45 + 14) for c in col)
        won = ph == "reveal" and s["res"] == i
        if won:
            col = YEL
        rrect(d, (x - 9, 404, x + 9, 422), 2.5, fill=col)
        text(d, (x, 413.3), MLAB[i], font("xb", 5.6 if len(MLAB[i]) > 3 else 6.4),
             (20, 20, 20) if won else WHITE)
        if hl is not None and i in hl and len(hl) < 9 and not won:
            rrect(d, (x - 9.6, 403.4, x + 9.6, 422.6), 2.8, outline=CYAN, w=1.0)
        # triangle de Pascal : nombre de chemins
        text(d, (x, 431), str(comb(8, i)), font("bold", 6.5), (170, 180, 176))
        bh = comb(8, i) / 70 * 14
        rrect(d, (x - 6, 456 - bh, x + 6, 456), 1, fill=(70, 170, 190) if (hl and i in hl) else (60, 72, 68))
    # bille
    if ph == "spin":
        bx, by, _, _ = ball_pos(k, st["u"])
    elif ph in ("reveal", "outro"):
        kk = k if ph == "reveal" else len(ROUNDS) - 1
        bx, by = waypoints(kk)[-1]
        by += 0 if ph == "outro" else -4 * abs(math.sin(st["v"] * 12)) * math.exp(-st["v"] * 6)
    else:
        bx, by = X0, 258.0
    R.glow_dot(L, bx, by, (255, 255, 255) if ph != "reveal" else (st["ring"] or WHITE), r=4.6)

def audio_round(A, k, rd, st0):
    ts, te = st0 + T_BET, st0 + T_LAND
    pts = waypoints(k)
    n = len(pts) - 1
    for i in range(1, n + 1):
        tt = ts + (i / n) * (te - ts)
        x = pts[i][0]
        f = 523.3 * 2 ** ((x - X0) / SP / 6)
        if i < n:
            A.add(A.noise(0.012, 500), tt, pan=(x - X0) / 100, gain=0.35)
            A.add(A.tone(f * 2, 0.15, 25, (1, .3)), tt, pan=(x - X0) / 100, gain=0.14)
        else:
            A.add(A.noise(0.04, 120), tt, gain=0.5)
            A.kick(tt, 0.4)
