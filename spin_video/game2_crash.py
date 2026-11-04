"""CASH OUT : jeu « crash », courbe exponentielle, P(atteindre x) = 0.97 / x."""
import math
from PIL import ImageDraw
from engine2 import (Fr, P, GP, font, text, rrect, smooth, T_BET, T_LAND, SPIN_LEN, BEAT, NSPIN,
                     glow_circle, glow_rrect, glow_text, paste_emoji, pop,
                     RED, BLUE, GOLD, YEL, CYAN, WHITE, ORANGE, GREEN)

TITLE, SUBTITLE, OUT = "CASH OUT", "Crash games, but it's math", "cash_out_tiktok.mp4"
QUESTION, BANK_LABEL, COUNT_LABEL, AXIS_LABEL = "CASH OUT OR CRASH?", "CHIPS", "ROUNDS", "CRASH"
OUTRO_WORD, LIVES0, SEED = "this session's rounds", 5, 71
HOOK = ["ONLY 1 % REACH 100×", "ONLY 0.4 % GUESS 8/8", "CAN YOU?"]

def RD(target, crash, f2, tag, pill_, **kw):
    p = 0.97 / target * 100
    win = crash >= target
    dec = 2 if p < 1 else 1
    d = dict(name=f"{target:g}× TARGET", target=target, crash=crash, stat=f"{p:.{dec}f} %", l1="CHANCE TO",
             l2=f"REACH {target:g}×", sub=f"0.97 / {target:g}",
             f1=[("i", "P"), ("r", f"(crash ≥ {target:g}×) = "), Fr("0.97", f"{target:g}"), ("r", f" = {p:.{dec}f} %")],
             f2=f2, tag=tag, pill=pill_, win=win, delta=int(round(10 * (target - 1))) if win else -10,
             stamp_lose="CRASHED", lose_word="CRASHED")
    d.update(kw)
    return d

ROUNDS = [
    RD(2.0, 3.41, [("r", "pays 2× :  0.485·2 − 1 = −3 %")], "the curve is pure exponential", "+10 CHIPS"),
    RD(1.5, 1.12, [("r", "pays 1.5× :  0.647·1.5 − 1 = −3 %")], "safe targets still bleed 3 %", "CRASHED EARLY"),
    RD(5.0, 6.80, [("r", "pays 5× :  0.194·5 − 1 = −3 %")], "same edge, bigger swings", "+40 CHIPS"),
    RD(10.0, 2.05, [("i", "P"), ("r", "(crash ≥ "), ("i", "x"), ("r", ") = "), Fr("0.97", "x")],
       "1 in 10 rounds reach 10×", "NOT EVEN CLOSE"),
    RD(1.2, 1.00, [("r", "3 % of rounds crash at 1.00×")], "instant crash = the house edge", "INSTANT CRASH",
       stamp_lose="1.00×"),
    RD(3.0, 4.20, [("r", "median crash :  0.97 / "), ("i", "x"), ("r", " = ½  ⇒  "), ("i", "x"), ("r", " ≈ 1.94×")],
       "half of all rounds die before 2×", "+20 CHIPS"),
    RD(100.0, 1.87, [("r", "pays 100× :  0.0097·100 − 1 = −3 %")], "the dream target has the same edge",
       "LAST ROUND NEXT"),
    RD(2.0, 2.01, [("r", "won by 0.01×")], "every target : E = 0.97 − 1", "BY 0.01×!"),
]
INTRO = dict(big="0.97/x", l1="CHANCE TO", l2="REACH x", sm="3 % house edge", status="8 ROUNDS · 8 TARGETS",
             f1=[("i", "P"), ("r", "(crash ≥ "), ("i", "x"), ("r", ") = "), Fr("0.97", "x")],
             f2=[("r", "every round is a note :  "), ("i", "f"), ("sub", "out"), ("r", " = "), ("i", "f"),
                 ("r", "·2"), ("sup", "s")],
             tag="cash out or crash? call it")
OUTRO = dict(f2=[("i", "E"), ("r", "[profit] = 80 · (−3 %) = −2.40")],
             f3=[("r", "this run : +40  ⇒  luck, not edge")])

CX0, CX1, CY0, CY1 = 196.0, 382.0, 266.0, 404.0

def init(G):
    pass

def flight(rd, u):
    """multiplicateur à l'avancement u (0..1) — atteint le point de crash en u = 1"""
    c = rd["crash"]
    if c <= 1.0:
        return 1.0
    return c ** u

def ymap(m, ymax):
    return CY1 - 6 - (math.log(m) / math.log(ymax)) * (CY1 - CY0 - 34)

def draw_center(L, d, GL, t, st):
    ph, k = st["phase"], st["k"]
    rd = ROUNDS[k] if k >= 0 else None
    if ph == "outro":
        rd = ROUNDS[-1]
    # grille du graphique
    for gy in range(int(CY0 + 10), int(CY1), 22):
        d.line([P(CX0), P(gy), P(CX1), P(gy)], fill=(34, 44, 54), width=int(P(0.5)))
    d.line([P(CX0), P(CY1), P(CX1), P(CY1)], fill=(120, 130, 140), width=int(P(1)))
    d.line([P(CX0), P(CY0 + 8), P(CX0), P(CY1)], fill=(120, 130, 140), width=int(P(1)))
    text(d, (CX1 - 2, CY1 - 6), "log scale", font("med", 6), (110, 120, 130), "rm")
    if rd is None:
        paste_emoji(L, "🚀", 220, CY1 - 14, 20)
        text(d, (300, 318), "1.00×", font("black", 26), WHITE)
        return
    ymax = max(rd["crash"], rd["target"]) * 1.35
    tgt_y = ymap(rd["target"], ymax)
    # ligne d'objectif
    if tgt_y > CY0:
        for x in range(int(CX0), int(CX1), 8):
            d.line([P(x), P(tgt_y), P(x + 4), P(tgt_y)], fill=CYAN, width=int(P(1)))
        text(d, (CX1 - 2, tgt_y - 6), f"CASH OUT {rd['target']:g}×", font("xb", 6.5), CYAN, "rm")
    else:
        text(d, (CX1 - 2, CY0 + 14), f"↑ TARGET {rd['target']:g}× (off chart)", font("xb", 6.5), CYAN, "rm")
    if ph == "bet":
        u, alive = 0.0, True
    elif ph == "spin":
        u, alive = st["u"], True
    else:
        u, alive = 1.0, False
    # courbe
    n = max(2, int(120 * u) + 1)
    pts = []
    for i in range(n):
        uu = u * i / (n - 1)
        m = flight(rd, uu)
        pts.append((CX0 + 4 + (CX1 - CX0 - 26) * uu, ymap(m, ymax)))
    m = flight(rd, u)
    cashed = rd["win"] and m >= rd["target"] - 1e-9
    col = (120, 255, 170) if cashed else (YEL if alive else RED)
    if len(pts) >= 2:
        poly = [(P(x), P(y)) for x, y in pts] + [(P(pts[-1][0]), P(CY1)), (P(pts[0][0]), P(CY1))]
        d.polygon(poly, fill=col + (40,))
        d.line([(P(x), P(y)) for x, y in pts], fill=col, width=int(P(2.4)), joint="curve")
        ImageDraw.Draw(GL).line([(GP(x), GP(y)) for x, y in pts], fill=col + (170,), width=4)
    hx, hy = pts[-1]
    # point d'encaissement
    if rd["win"]:
        tu = math.log(rd["target"]) / math.log(rd["crash"]) if rd["crash"] > 1 else 1
        if u >= tu:
            cx_ = CX0 + 4 + (CX1 - CX0 - 26) * tu
            glow_circle(GL, cx_, tgt_y, 8, (120, 255, 170), 230)
            d.ellipse([P(cx_ - 4), P(tgt_y - 4), P(cx_ + 4), P(tgt_y + 4)], fill=(120, 255, 170))
            v = (u - tu) * (T_LAND - T_BET) if ph == "spin" else 2.0
            sc = pop(v, 0.25, 0.2)
            if sc > 0:
                rrect(d, (cx_ - 34 * sc, tgt_y - 26 * sc, cx_ + 34 * sc, tgt_y - 12 * sc), 4,
                      fill=(40, 170, 100))
                text(d, (cx_, tgt_y - 18.7 * sc), f"CASHED ✓ {rd['target']:g}×", font("xb", 6.5 * sc), WHITE)
    # fusée ou explosion
    if alive:
        if len(pts) >= 2:
            (x0, y0), (x1, y1) = pts[max(0, len(pts) - 4)], pts[-1]
            ang = math.degrees(math.atan2(-(y1 - y0), max(0.1, x1 - x0)))
        else:
            ang = 0
        shake = 1.2 * math.sin(t * 90) if ph == "spin" else 0
        glow_circle(GL, hx - 6, hy + 6, 9, ORANGE, 160)
        paste_emoji(L, "🚀", hx + shake, hy - 2, 20, rot=ang - 45)
    else:
        v = st["v"] if ph == "reveal" else 3.0
        sc = 0.3 + 1.2 * smooth(v / 0.18) - 0.3 * smooth((v - 0.18) / 0.4)
        glow_circle(GL, hx, hy, 22 * sc, ORANGE, 220 * (1 - smooth((v - 0.5) / 1)))
        paste_emoji(L, "💥", hx, hy, 26, scale=sc, alpha=1 - smooth((v - 1.2) / 0.6) * 0.6)
    # multiplicateur géant
    mtxt = f"{m:.2f}×"
    mc = (120, 255, 170) if cashed else (WHITE if alive else RED)
    if ph == "bet" and rd["crash"] <= 1.0:
        pass
    text(d, (262, 296), mtxt, font("black", 24), mc)
    glow_text(GL, (262, 296), mtxt, 24, mc, 120)
    if not alive:
        text(d, (262, 316), f"CRASHED @ {rd['crash']:.2f}×", font("xb", 8), (255, 120, 120))
    elif ph == "spin" and rd["crash"] <= 1.0:
        dots = "." * (1 + int(t * 4) % 3)
        text(d, (262, 316), f"LAUNCHING{dots}", font("xb", 8), (200, 210, 220))
    # historique des crashs
    done = st["done"]
    text(d, (196, 424), "LAST CRASHES", font("bold", 6.5), (140, 150, 160), "lm")
    for i in range(min(done, 8)):
        c = ROUNDS[i]["crash"]
        x0 = 196 + i * 23.5
        cc = (40, 160, 100) if c >= 2 else (190, 50, 64)
        rrect(d, (x0, 432, x0 + 21.5, 446), 3, fill=cc)
        text(d, (x0 + 10.75, 439.3), f"{c:.2f}", font("xb", 6), WHITE)
    text(d, (288, 456), "P(reach x) = 0.97 / x", font("semi", 6.8), (170, 180, 190))

def audio_round(A, k, rd, st0):
    import numpy as np
    ts, te = st0 + T_BET, st0 + T_LAND
    SR = 44100
    nn = int((te - ts) * SR)
    tt = np.arange(nn) / SR
    u = tt / (te - ts)
    c = max(rd["crash"], 1.0001)
    m = c ** u if rd["crash"] > 1 else np.ones(nn)
    f = 90 * m ** 0.6
    hum = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.5 + np.sin(2 * np.pi * np.cumsum(f * 2.01) / SR) * 0.25
    rumble = A.rng.normal(0, 1, nn).astype(np.float32)
    rumble = np.convolve(rumble, np.ones(40) / 40, mode="same")
    env = np.minimum(1, tt / 0.3) * (0.5 + 0.5 * u)
    A.add(((hum + rumble * 2.2) * env).astype(np.float32), ts, gain=0.10)
    if rd["win"]:
        tu = math.log(rd["target"]) / math.log(rd["crash"])
        tc = ts + tu * (te - ts)
        A.add(A.bell(2093, 1.2), tc, gain=0.2)
        A.add(A.tone(1568, 0.3, 10, (1, .4)), tc, gain=0.15)
    A.add(A.noise(1.0, 3.5, 3), te, gain=0.55)
