"""MINES : grille 5x5, mines cachées, loi hypergéométrique."""
import math
import numpy as np
from math import comb
from engine2 import (Fr, P, GP, font, text, rrect, smooth, T_BET, T_LAND, BEAT,
                     glow_circle, glow_rrect, glow_text, paste_emoji, pop,
                     RED, BLUE, GOLD, YEL, CYAN, WHITE, ORANGE, GREEN)

TITLE, SUBTITLE, OUT = "DODGE THE MINES", "Mines, but it's math", "dodge_the_mines_tiktok.mp4"
QUESTION, BANK_LABEL, COUNT_LABEL, AXIS_LABEL = "SAFE OR BOOM?", "CHIPS", "BOARDS", "PICK"
OUTRO_WORD, LIVES0, SEED = "this session's boards", 5, 72
HOOK = ["3 MINES. 25 TILES.", "ONLY 0.4 % GUESS 8/8", "CAN YOU?"]

def RD(M, N, lose_at, f1extra, f2, tag, pill_, seed):
    p = comb(25 - M, N) / comb(25, N)
    mult = 0.97 / p
    win = lose_at is None
    rng = np.random.default_rng(seed)
    tiles = list(range(25))
    rng.shuffle(tiles)
    mines = set(tiles[:M])
    safe = [x for x in tiles[M:]]
    rng.shuffle(safe)
    if win:
        picks = safe[:N]
    else:
        picks = safe[:lose_at - 1] + [sorted(mines)[0]]
    pct = p * 100
    return dict(name=f"{M} MINE{'S' if M > 1 else ''} · {N} PICK{'S' if N > 1 else ''}", M=M, N=N,
                mines=mines, picks=picks, win=win, mult=mult,
                delta=int(round(10 * (mult - 1))) if win else -10,
                stat=f"{pct:.1f} %", l1="CHANCE ALL", l2="PICKS ARE SAFE", sub=f"pays {mult:.2f}×",
                f1=f1extra(pct), f2=f2, tag=tag, pill=pill_, stamp_lose="BOOM", lose_word="BOOM",
                stamp_win=f"SAFE +{int(round(10 * (mult - 1)))}")

ROUNDS = [
    RD(3, 1, None, lambda p: [("i", "P"), ("r", "(safe) = "), Fr(22, 25), ("r", f" = {p:.1f} %")],
       [("r", "pays 0.97 / 0.88 = 1.10×")], "one pick, three mines : easy", "+1 CHIP", 1),
    RD(3, 3, None, lambda p: [("i", "P"), ("r", " = "), Fr(22, 25), ("r", "·"), Fr(21, 24), ("r", "·"), Fr(20, 23),
                              ("r", f" = {p:.1f} %")],
       [("r", "each safe pick makes the next one harder")], "odds shrink pick by pick", "+4 CHIPS", 2),
    RD(3, 5, 4, lambda p: [("i", "P"), ("r", "(5 safe) = "), Fr("C(22,5)", "C(25,5)"), ("r", f" = {p:.1f} %")],
       [("r", "hypergeometric :  no tile is picked twice")], "5 picks ≈ a coin flip", "4TH PICK BOOM", 3),
    RD(5, 3, 2, lambda p: [("i", "P"), ("r", "(3 safe) = "), Fr("C(20,3)", "C(25,3)"), ("r", f" = {p:.1f} %")],
       [("r", "2 more mines = 2 fewer picks for the same odds")], "more mines, same 50/50", "2ND PICK BOOM", 4),
    RD(1, 10, None, lambda p: [("i", "P"), ("r", "(10 safe) = "), Fr(15, 25), ("r", f" = {p:.0f} %")],
       [("r", "1 mine :  "), ("i", "P"), ("r", " = (25 − "), ("i", "N"), ("r", ") / 25")],
       "one mine is still a trap", "+6 CHIPS", 5),
    RD(10, 2, None, lambda p: [("i", "P"), ("r", "(2 safe) = "), Fr("C(15,2)", "C(25,2)"), ("r", f" = {p:.0f} %")],
       [("r", "pays 0.97 / 0.35 = 2.77×")], "big risk, same 3 % edge", "+18 CHIPS", 6),
    RD(3, 8, 8, lambda p: [("i", "P"), ("r", "(8 safe) = "), Fr("C(22,8)", "C(25,8)"), ("r", f" = {p:.1f} %")],
       [("r", "the 8th pick alone :  "), Fr(15, 18), ("r", " safe")], "greed meets the last pick",
       "ONE PICK TOO MANY", 7),
    RD(24, 1, 1, lambda p: [("i", "P"), ("r", "(safe | 24 mines) = "), Fr(1, 25), ("r", " = 4 %")],
       [("r", "pays 24.25× :  0.04 · 24.25 = 0.97")], "every bet returns 97 %", "1 IN 25", 8),
]
INTRO = dict(big="25", l1="TILES,", l2="HIDDEN MINES", sm="pay = 0.97 / P(safe)", status="8 BOARDS",
             f1=[("i", "P"), ("r", "("), ("i", "N"), ("r", " safe) = "), Fr("C(25 − M, N)", "C(25, N)")],
             f2=[("r", "every pick is a note :  "), ("i", "f"), ("sub", "out"), ("r", " = "), ("i", "f"),
                 ("r", "·2"), ("sup", "s")],
             tag="safe or boom? call it")
OUTRO = dict(f2=[("i", "E"), ("r", "[profit] = 80 · (−3 %) = −2.40")],
             f3=[("r", "this run : −11  ⇒  variance, not skill")])

TS, GAP = 24.0, 3.0
GX, GY = 288 - (5 * TS + 4 * GAP) / 2, 264.0

def init(G):
    pass

def tile_box(i):
    r, c = divmod(i, 5)
    x0 = GX + c * (TS + GAP)
    y0 = GY + r * (TS + GAP)
    return (x0, y0, x0 + TS, y0 + TS)

def pick_times(rd):
    """instants (relatifs au début de la manche) de chaque choix ; le dernier = T_LAND"""
    n = len(rd["picks"])
    if n == 1:
        return [T_LAND]
    first, last_prior = T_BET + 0.5, T_LAND - 1.0
    ts = [first + (last_prior - first) * i / max(1, n - 2) for i in range(n - 1)] if n > 2 else [first + 0.6]
    return ts + [T_LAND]

def draw_center(L, d, GL, t, st):
    ph, k = st["phase"], st["k"]
    rd = ROUNDS[k] if k >= 0 else None
    if ph == "outro":
        rd = ROUNDS[-1]
    lt = st["lt"] if ph in ("bet", "spin", "reveal") else 99.0
    times = pick_times(rd) if rd else []
    revealed = {}
    cursor = None
    if rd is not None:
        for j, (tile, tp) in enumerate(zip(rd["picks"], times)):
            if lt >= tp:
                revealed[tile] = lt - tp
            elif cursor is None and lt >= tp - 0.35:
                cursor = tile
    show_all = ph == "outro" or (ph == "reveal" and st["v"] > 0.55)
    for i in range(25):
        x0, y0, x1, y1 = tile_box(i)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        if rd is not None and i in revealed:
            age = revealed[i]
            is_mine = i in rd["mines"]
            fl = min(1.0, age / 0.12)
            w = TS * abs(math.cos(fl * math.pi / 2)) if fl < 1 else 0
            if fl < 0.5:
                rrect(d, (cx - (TS / 2) * (1 - fl * 2), y0, cx + (TS / 2) * (1 - fl * 2), y1), 4, fill=(56, 70, 92))
                continue
            sc = 0.5 + 0.5 * (fl - 0.5) * 2
            if is_mine:
                rrect(d, (x0, y0, x1, y1), 4, fill=(190, 40, 56))
                glow_rrect(GL, (x0, y0, x1, y1), 4, RED, 220)
                paste_emoji(L, "💣", cx, cy, 16, scale=sc)
                if age < 0.9:
                    paste_emoji(L, "💥", cx, cy, 30, scale=pop(age, 0.2, 0.3) * (1 - smooth((age - 0.4) / 0.5)) + 0.01,
                                alpha=1 - smooth((age - 0.4) / 0.5))
            else:
                rrect(d, (x0, y0, x1, y1), 4, fill=(26, 110, 84))
                glow_rrect(GL, (x0, y0, x1, y1), 4, (80, 255, 190), 120 * (1 - smooth(age / 1.0)) + 40)
                paste_emoji(L, "💎", cx, cy, 15, scale=sc * pop(age, 0.3, 0.25))
        else:
            hidden_col = (52, 64, 84)
            rrect(d, (x0, y0 + 1.5, x1, y1 + 1.5), 4, fill=(26, 32, 44))
            rrect(d, (x0, y0, x1, y1), 4, fill=hidden_col, outline=(84, 100, 124), w=0.8)
            if rd is not None and show_all and i in rd["mines"]:
                paste_emoji(L, "💣", cx, cy, 13, alpha=0.55)
            if cursor == i:
                pulse = 0.5 + 0.5 * math.sin(t * 30)
                rrect(d, (x0 - 1, y0 - 1, x1 + 1, y1 + 1), 4.5, outline=CYAN, w=1.6)
                glow_rrect(GL, (x0, y0, x1, y1), 4, CYAN, 120 + 100 * pulse, w=3)
    # chaîne des probabilités pas à pas
    if rd is None:
        text(d, (288, 418), "PICK TILES · AVOID MINES", font("xb", 7.5), (170, 180, 190))
        return
    M, N = rd["M"], rd["N"]
    text(d, (288, 411), f"{M} MINE{'S' if M > 1 else ''} · {25 - M} SAFE · {N} PICK{'S' if N > 1 else ''}",
         font("xb", 7.5), (200, 210, 220))
    nb = min(N, 10)
    bw = min(34.0, 196.0 / nb)
    x_start = 288 - nb * bw / 2
    for j in range(nb):
        x0 = x_start + j * bw
        safe_left = 25 - M - j
        tot = 25 - j
        picked = len(revealed) > j
        tile = rd["picks"][j] if j < len(rd["picks"]) else None
        boom = picked and tile in rd["mines"]
        col = (40, 50, 62)
        if picked:
            col = (190, 40, 56) if boom else (26, 110, 84)
        elif j >= len(rd["picks"]):
            col = (30, 36, 44)
        rrect(d, (x0 + 1, 422, x0 + bw - 1, 446), 3, fill=col)
        fs = 6.6 if bw > 24 else 5.2
        text(d, (x0 + bw / 2, 429.5), str(safe_left), font("xb", fs), WHITE)
        d.line([P(x0 + bw * 0.25), P(434), P(x0 + bw * 0.75), P(434)], fill=(200, 210, 220), width=int(P(0.6)))
        text(d, (x0 + bw / 2, 439.5), str(tot), font("xb", fs), (200, 210, 220))
    text(d, (288, 455), "P(all safe) = product of each pick", font("semi", 6.5), (150, 160, 170))

def audio_round(A, k, rd, st0):
    times = pick_times(rd)
    for j, tp in enumerate(times):
        tt = st0 + tp
        A.add(A.noise(0.02, 300), tt - 0.02, gain=0.3)
        tile = rd["picks"][j]
        if tile in rd["mines"]:
            A.add(A.noise(0.5, 4, 3), tt - 0.5, gain=0.06)          # mèche
        elif j < len(times) - 1:
            A.add(A.tone(880 * 2 ** (j / 12 * 2), 0.35, 9, (1, .5, .2)), tt, gain=0.14)
            A.add(A.bell(2637 * 2 ** (j / 12 * 2), 0.5), tt, gain=0.04)
