"""ROLL THE DICE : deux dés, distribution des sommes."""
import math
import numpy as np
from PIL import Image, ImageDraw
from engine import (Fr, P, font, text, rrect, smooth, T_BET, T_LAND, FPS,
                    RED, BLUE, GOLD, YEL, CYAN, WHITE, ORANGE)
import render as R

TITLE, SUBTITLE, OUT = "ROLL THE DICE", "Dice, but it's math", "roll_the_dice_tiktok.mp4"
QUESTION, BANK_LABEL, COUNT_LABEL, AXIS_LABEL = "WIN OR LOSE?", "CHIPS", "ROLLS", "LAND"
OUTRO_WORD, LIVES0, SEED = "this session's rolls", 5, 33
WAYS = {s: 6 - abs(s - 7) for s in range(2, 13)}

def RD(name, sums, pay, dice, stat, sub, f1, f2, tag, pill_, hard=False):
    tot = sum(dice)
    win = (dice[0] == dice[1]) if name == "DOUBLES" else (tot in sums and (not hard or dice[0] == dice[1]))
    return dict(name=name, sums=sums, dice=dice, stat=stat, sub=sub, f1=f1, f2=f2, tag=tag, pill=pill_,
                win=win, delta=10 * pay if win else -10)

ROUNDS = [
    RD("SEVEN", {7}, 4, (3, 4), "16.7 %", "6 of 36 combos",
       [("i", "P"), ("r", "(7) = "), Fr(6, 36), ("r", " = 16.7 %")],
       [("r", "1+6, 2+5, 3+4, 4+3, 5+2, 6+1")], "7 is the most common sum", "+40 CHIPS"),
    RD("DOUBLES", set(), 4, (3, 5), "16.7 %", "6 of 36 combos",
       [("i", "P"), ("r", "(doubles) = "), Fr(6, 36), ("r", " = 16.7 %")],
       [("r", "pays 4:1 :  "), Fr(6, 36), ("r", "·5 − 1 = −"), Fr(1, 6)],
       "same odds as a seven", "NO DOUBLES"),
    RD("OVER 7", {8, 9, 10, 11, 12}, 1, (6, 4), "41.7 %", "15 of 36 combos",
       [("i", "P"), ("r", "(8 to 12) = "), Fr(15, 36), ("r", " = 41.7 %")],
       [("r", "pays 1:1 :  "), Fr(15, 36), ("r", " − "), Fr(21, 36), ("r", " = −"), Fr(1, 6)],
       "7 itself is the house's friend", "+10 CHIPS"),
    RD("SNAKE EYES", {2}, 30, (1, 2), "2.8 %", "1 of 36 combos",
       [("i", "P"), ("r", "(1+1) = "), Fr(1, 36), ("r", " = 2.8 %")],
       [("r", "pays 30:1 :  "), Fr(31, 36), ("r", " − 1 = −"), Fr(5, 36)],
       "one pip away", "ONE PIP AWAY"),
    RD("UNDER 7", {2, 3, 4, 5, 6}, 1, (1, 3), "41.7 %", "15 of 36 combos",
       [("i", "P"), ("r", "(2 to 6) = "), Fr(15, 36), ("r", " = 41.7 %")],
       [("i", "P"), ("r", "(under 7) = "), ("i", "P"), ("r", "(over 7) by symmetry")],
       "the dice are symmetric around 7", "+10 CHIPS"),
    RD("6 OR 8", {6, 8}, 2, (4, 5), "27.8 %", "10 of 36 combos",
       [("i", "P"), ("r", "(6 or 8) = "), Fr(10, 36), ("r", " = 27.8 %")],
       [("r", "pays 2:1 :  "), Fr(10, 36), ("r", "·3 − 1 = −"), Fr(1, 6)],
       "9 sits right between them", "TWO LIVES LEFT"),
    RD("FIELD", {2, 3, 4, 9, 10, 11, 12}, 1, (5, 6), "44.4 %", "16 of 36 combos",
       [("i", "P"), ("r", "(field) = "), Fr(16, 36), ("r", " = 44.4 %")],
       [("r", "7 numbers, but only "), Fr(16, 36), ("r", " :  edge −"), Fr(1, 9)],
       "the field looks big, it isn't", "LAST ROLL NEXT"),
    RD("HARD 8", {8}, 30, (6, 2), "2.8 %", "1 of 36 combos",
       [("i", "P"), ("r", "(4+4) = "), Fr(1, 36), ("r", " = 2.8 %")],
       [("r", "8 has 5 combos, only 1 is “hard”")], "easy 8, not hard 8", "SO CLOSE.", hard=True),
]
INTRO = dict(big="36", l1="COMBOS ON", l2="TWO DICE", sm="6 × 6 faces", status="ROLL 8 TIMES",
             f1=[("i", "P"), ("r", "(sum) = "), Fr("# combos", 36)],
             f2=[("r", "every roll is a note :  "), ("i", "f"), ("sub", "out"), ("r", " = "), ("i", "f"),
                 ("r", "·2"), ("sup", "s")],
             tag="call every roll before it stops")
OUTRO = dict(f2=[("i", "E"), ("r", "[profit] = 10 · Σ edge ≈ −12.2")],
             f3=[("r", "this run : +30  ⇒  luck, not edge")])

PIPS = {1: [(0, 0)], 2: [(-1, -1), (1, 1)], 3: [(-1, -1), (0, 0), (1, 1)],
        4: [(-1, -1), (1, -1), (-1, 1), (1, 1)], 5: [(-1, -1), (1, -1), (0, 0), (-1, 1), (1, 1)],
        6: [(-1, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (1, 1)]}
DS = 52.0

def die_img(n):
    S = int(P(DS)) * 3
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([S * .03, S * .03, S * .97, S * .97], radius=S * 0.18, fill=(246, 244, 240),
                        outline=(170, 165, 158), width=S // 40)
    d.rounded_rectangle([S * .03, S * .75, S * .97, S * .97], radius=S * 0.18, fill=(222, 218, 210))
    d.rounded_rectangle([S * .03, S * .03, S * .97, S * .88], radius=S * 0.18, fill=(246, 244, 240))
    for px, py in PIPS[n]:
        cx, cy = S / 2 + px * S * 0.25, S * 0.46 + py * S * 0.23
        r = S * 0.075
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(214, 34, 50) if n == 1 else (24, 24, 28))
    return im.resize((S // 3, S // 3), Image.LANCZOS)

def init(G):
    G["die"] = {n: die_img(n) for n in range(1, 7)}

G_ = R.G
POS = [(248.0, 338.0), (328.0, 338.0)]

def die_state(t, st, j):
    ph, k = st["phase"], st["k"]
    if k < 0:
        return (4 if j == 0 else 3), 0.0, 0.0, 0.0
    if ph == "outro":
        return ROUNDS[-1]["dice"][j], 0.0, 0.0, 0.0
    if ph == "bet":
        f = ROUNDS[k - 1]["dice"][j] if k > 0 else (4 if j == 0 else 3)
        return f, 0.0, 0.0, 0.0
    if ph == "reveal":
        return ROUNDS[k]["dice"][j], 0.0, 0.0, 0.0
    u = st["u"]
    final = ROUNDS[k]["dice"][j]
    if u > 0.86:
        face = final
    else:
        rng = np.random.default_rng(int(t * 12) * 7 + j + 100 * k)
        face = int(rng.integers(1, 7))
    # trois rebonds décroissants
    nb = 4
    seg = min(nb - 1, int(u * nb))
    v = u * nb - seg
    hgt = 52 * (0.5 ** seg) * 4 * v * (1 - v) * (1 if u < 0.95 else 0)
    rot = 900 * (1 - u) ** 2 * (1 if j == 0 else -1.2)
    dx = (1 - u) * (-30 if j == 0 else 30) * math.sin(u * 7)
    return face, hgt, rot, dx

def draw_center(L, d, t, st):
    ph, k = st["phase"], st["k"]
    s = ROUNDS[k] if k >= 0 else None
    for j in range(2):
        face, hgt, rot, dx = die_state(t, st, j)
        x, y = POS[j][0] + dx, POS[j][1] - hgt
        sc = 1 - hgt / 160
        d.ellipse([P(x - 20 * sc), P(POS[j][1] + 26), P(x + 20 * sc), P(POS[j][1] + 33)], fill=(0, 0, 0, 110))
        im = G_["die"][face]
        if abs(rot) > 0.5:
            im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
        L.alpha_composite(im, (int(P(x) - im.width / 2), int(P(y) - im.height / 2)))
        if st["ring"] and ph in ("reveal", "outro"):
            rrect(d, (x - 29, y - 29, x + 29, y + 29), 8, outline=st["ring"], w=2.2)
    if ph in ("reveal", "outro"):
        dice = s["dice"] if ph == "reveal" else ROUNDS[-1]["dice"]
        a = 1.0 if ph == "outro" else smooth(st["v"] / 0.2)
        text(d, (288, 279), f"{dice[0]} + {dice[1]} = {sum(dice)}", font("xb", 12), (255, 255, 255, int(255 * a)))
    # histogramme des sommes
    sums = s["sums"] if (s and ph in ("bet", "spin", "reveal")) else None
    landed = s["dice"] if ph == "reveal" else None
    for i, sm in enumerate(range(2, 13)):
        x0 = 190 + i * 18
        hb = WAYS[sm] * 5.2
        active = sums is None or sm in sums or (s and s["name"] == "DOUBLES" and sm % 2 == 0)
        col = (60, 72, 68)
        if sums is not None and active:
            col = (70, 170, 190)
        if landed and sum(landed) == sm:
            col = YEL
        if sums is not None and not active:
            col = (40, 48, 45)
        rrect(d, (x0, 446 - hb, x0 + 15, 446), 1.5, fill=col)
        text(d, (x0 + 7.5, 454), str(sm), font("bold", 7), WHITE if active else (110, 118, 115))
        if sums is None or active:
            text(d, (x0 + 7.5, 446 - hb - 5), str(WAYS[sm]), font("semi", 5.5), (150, 160, 156))

def audio_round(A, k, rd, st0):
    ts, te = st0 + T_BET, st0 + T_LAND
    for c in range(14):                                       # secousse dans la main
        A.add(A.noise(0.012, 500), st0 + 0.05 + c * 0.045, pan=0.2 * math.sin(c), gain=0.25)
    for seg in range(4):                                      # rebonds
        tb = ts + (seg + 1) / 4 * (te - ts) * 0.95
        for j in range(2):
            A.add(A.noise(0.03, 160), tb + j * 0.03, pan=(j - 0.5) * 0.6, gain=0.55 * (0.7 ** seg))
            A.add(A.tone(700 + 120 * j, 0.06, 60), tb + j * 0.03, gain=0.12 * (0.7 ** seg))
    A.kick(te, 0.4)
