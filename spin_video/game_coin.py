"""FLIP THE COIN : pile ou face, séries et erreur du joueur."""
import math
import numpy as np
from PIL import Image, ImageDraw
from engine import (Fr, P, font, text, rrect, smooth, spin_start, T_BET, T_LAND, NSPIN,
                    RED, BLUE, GOLD, YEL, CYAN, WHITE, ORANGE, BEAT)
import render as R

TITLE, SUBTITLE, OUT = "FLIP THE COIN", "Coin flips, but it's math", "flip_the_coin_tiktok.mp4"
QUESTION, BANK_LABEL, COUNT_LABEL, AXIS_LABEL = "RIGHT OR WRONG?", "CHIPS", "FLIPS", "LAND"
OUTRO_WORD, LIVES0, SEED = "this session's calls", 5, 21

def streak_prob(n, r):
    """P(au moins une série >= r de faces identiques en n lancers)"""
    # dp[l] = proba d'avoir une série courante de longueur l sans jamais atteindre r
    dp = np.zeros(r); dp[1] = 1.0
    for _ in range(n - 1):
        nd = np.zeros(r)
        nd[1] = dp.sum() * 0.5
        nd[2:] = dp[1:-1] * 0.5
        dp = nd
    return 1 - dp.sum()
P410 = streak_prob(10, 4) * 100

def RD(name, call, res, stat, l2, sub, f1, f2, tag, pill_):
    win = call == res
    return dict(name=name, call=call, res=res, stat=stat, l2=l2, sub=sub, f1=f1, f2=f2, tag=tag,
                pill=pill_, win=win, delta=10 if win else -10)

ROUNDS = [
    RD("HEADS", "H", "H", "50.0 %", "HEADS", "1 of 2 faces",
       [("i", "P"), ("r", "(heads) = "), Fr(1, 2), ("r", " = 50 %")],
       [("r", "two faces, equally likely")], "a fair coin has no memory", "+1 POINT PER RIGHT CALL"),
    RD("HEADS", "H", "H", "25.0 %", "H, H IN A ROW", "1 of 4 sequences",
       [("i", "P"), ("r", "(HH) = ("), Fr(1, 2), ("r", ")"), ("sup", "2"), ("r", " = 25 %")],
       [("r", "but  "), ("i", "P"), ("r", "(H | H) = "), Fr(1, 2)], "the past doesn't push the coin",
       "TWO IN A ROW"),
    RD("HEADS", "H", "T", "12.5 %", "H, H, H", "1 of 8 sequences",
       [("i", "P"), ("r", "(HHH) = ("), Fr(1, 2), ("r", ")"), ("sup", "3"), ("r", " = 12.5 %")],
       [("r", "after HH, heads is still 50 %")], "streaks don't break on schedule", "STREAK BROKEN"),
    RD("TAILS", "T", "T", "50.0 %", "TAILS", "1 of 2 faces",
       [("i", "P"), ("r", "(tails) = "), Fr(1, 2), ("r", " = 50 %")],
       [("r", "gambler's fallacy : “tails is due” is false")], "nothing is ever “due”", "BACK ON TRACK"),
    RD("TAILS", "T", "H", "25.0 %", "T, T IN A ROW", "1 of 4 sequences",
       [("i", "P"), ("r", "(TT) = ("), Fr(1, 2), ("r", ")"), ("sup", "2"), ("r", " = 25 %")],
       [("r", "each flip is independent")], "50/50 still loses half the time", "THREE LIVES LEFT"),
    RD("HEADS", "H", "H", f"{P410:.1f} %", "4-STREAK IN 10", "any 4 alike in 10 flips",
       [("i", "P"), ("r", f"(4+ streak in 10 flips) = {P410:.1f} %")],
       [("r", "streaks are normal, not suspicious")], "real randomness looks streaky", "+10 CHIPS"),
    RD("TAILS", "T", "T", "50.0 %", "TAILS", "1 of 2 faces",
       [("i", "E"), ("r", "[flips until heads] = 2")],
       [("r", "Σ "), ("i", "n"), ("r", "·("), Fr(1, 2), ("r", ")"), ("sup", "n"), ("r", " = 2")],
       "waiting time has a formula", "LAST FLIP NEXT"),
    RD("HEADS", "H", "T", "0.39 %", "8 RIGHT CALLS", "1 of 256 sequences",
       [("i", "P"), ("r", "(8/8) = ("), Fr(1, 2), ("r", ")"), ("sup", "8"), ("r", " = "), Fr(1, 256)],
       [("r", "2"), ("sup", "8"), ("r", " = 256 possible sessions")], "perfect runs are 1 in 256", "SO CLOSE."),
]
INTRO = dict(big="2", l1="FACES ON", l2="THE COIN", sm="heads · tails", status="CALL 8 FLIPS",
             f1=[("i", "P"), ("r", "(right call) = "), Fr(1, 2)],
             f2=[("r", "every flip is a note :  "), ("i", "f"), ("sub", "out"), ("r", " = "), ("i", "f"),
                 ("r", "·2"), ("sup", "s")],
             tag="call every flip before it lands")
OUTRO = dict(f2=[("i", "E"), ("r", "[profit] = 80 · ("), Fr(1, 2), ("r", " − "), Fr(1, 2), ("r", ") = 0")],
             f3=[("r", "this run : +20  ⇒  pure variance, no edge")])

CX, CY, CR = 288.0, 352.0, 36.0

def face_img(letter, gold):
    S = int(P(2 * CR)) * 2
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if gold:
        c1, c2, c3 = (250, 204, 70), (214, 160, 30), (150, 100, 10)
    else:
        c1, c2, c3 = (226, 230, 238), (176, 182, 196), (110, 116, 130)
    d.ellipse([0, 0, S - 1, S - 1], fill=c2, outline=c3, width=S // 40)
    m = S * 0.09
    d.ellipse([m, m, S - m, S - m], fill=c1, outline=c3, width=S // 60)
    f = R.ImageFont.truetype(R.FI + "Inter-Black.otf", int(S * 0.5))
    d.text((S / 2, S / 2), letter, font=f, fill=c2, anchor="mm", stroke_width=S // 70, stroke_fill=c3)
    for a in range(0, 360, 15):
        x = S / 2 + (S / 2 - m * 0.5) * math.cos(math.radians(a))
        y = S / 2 + (S / 2 - m * 0.5) * math.sin(math.radians(a))
        d.ellipse([x - S / 120, y - S / 120, x + S / 120, y + S / 120], fill=c3)
    return im.resize((S // 2, S // 2), Image.LANCZOS)

def init(G):
    G["H"] = face_img("H", True)
    G["T"] = face_img("T", False)

def flip_end_angle(k):
    prev = ROUNDS[k - 1]["res"] if k > 0 else "H"
    a0 = 0.0 if prev == "H" else math.pi
    turns = 9 + (k % 3)
    a1 = a0 + turns * 2 * math.pi + (0 if ROUNDS[k]["res"] == prev else math.pi)
    return a0, a1

def coin_state(t, st):
    ph, k = st["phase"], st["k"]
    if ph == "intro" or k < 0:
        return 0.0, 0.0
    if ph == "outro":
        return (0.0 if ROUNDS[-1]["res"] == "H" else math.pi), 0.0
    a0, a1 = flip_end_angle(k)
    if ph == "bet":
        return a0, 0.0
    if ph == "reveal":
        bounce = 6 * abs(math.sin(st["v"] * 14)) * math.exp(-st["v"] * 9)
        return a1, bounce
    u = st["u"]
    ang = a0 + (a1 - a0) * (1 - (1 - u) ** 1.6)
    h = 4 * u * (1 - u) * 34
    return ang, h

def draw_center(L, d, t, st):
    ph, k = st["phase"], st["k"]
    ang, h = coin_state(t, st)
    # appel du joueur
    if k >= 0 and ph in ("bet", "spin", "reveal"):
        call = "HEADS" if ROUNDS[k]["call"] == "H" else "TAILS"
        rrect(d, (240, 262, 336, 278), 3, fill=(40, 50, 46))
        text(d, (288, 270.5), f"YOUR CALL : {call}", font("xb", 8.5), CYAN)
    # ombre
    sc = 1 - h / 120
    d.ellipse([P(CX - CR * sc), P(CY + CR + 8 - 4 * sc), P(CX + CR * sc), P(CY + CR + 8 + 4 * sc)],
              fill=(0, 0, 0, 120))
    c = math.cos(ang)
    face = "H" if c >= 0 else "T"
    hh = max(0.04, abs(c))
    img = G_["H" if face == "H" else "T"]
    w, hgt = img.width, max(2, int(img.height * hh))
    im = img.resize((w, hgt), Image.BICUBIC)
    y = CY - h
    # tranche
    th = P(3.5) * (1 - hh) + P(1.5)
    edge = (150, 100, 10) if face == "H" else (110, 116, 130)
    d.ellipse([P(CX - CR), P(y) - hgt / 2 + th, P(CX + CR), P(y) + hgt / 2 + th], fill=edge)
    L.alpha_composite(im, (int(P(CX) - w / 2), int(P(y) - hgt / 2)))
    ring = st["ring"]
    if ring and ph in ("reveal", "outro"):
        rr = CR + 5
        d.ellipse([P(CX - rr), P(CY - rr), P(CX + rr), P(CY + rr)], outline=ring, width=int(P(2.4)))
    # historique
    done = st["done"]
    for i in range(8):
        x = 198 + i * 22.5
        y0 = 424
        if i < done:
            rd = ROUNDS[i]
            col = (250, 204, 70) if rd["res"] == "H" else (200, 205, 215)
            d.ellipse([P(x - 8), P(y0 - 8), P(x + 8), P(y0 + 8)], fill=col,
                      outline=BLUE if rd["win"] else RED, width=int(P(1.6)))
            text(d, (x, y0 + 0.3), rd["res"], font("black", 9), (90, 70, 20) if rd["res"] == "H" else (70, 74, 86))
        else:
            d.ellipse([P(x - 8), P(y0 - 8), P(x + 8), P(y0 + 8)], outline=(70, 80, 76), width=int(P(1)))
            if i == k and ph in ("bet", "spin"):
                d.ellipse([P(x - 8), P(y0 - 8), P(x + 8), P(y0 + 8)], outline=ORANGE, width=int(P(1.3)))
                text(d, (x, y0 + 0.3), "?", font("black", 9), ORANGE)
    # série en cours
    run, last = 0, None
    for i in range(done):
        r = ROUNDS[i]["res"]
        run = run + 1 if r == last else 1
        last = r
    if done:
        text(d, (288, 447), f"CURRENT STREAK : {run} × {'HEADS' if last == 'H' else 'TAILS'}",
             font("bold", 8), (170, 180, 176))
    else:
        text(d, (288, 447), "HISTORY", font("bold", 8), (170, 180, 176))

G_ = R.G

def audio_round(A, k, rd, st0):
    A.add(A.tone(1320, 0.4, 9, (1, .5, .2)), st0 + T_BET, gain=0.25)           # pichenette
    a0, a1 = flip_end_angle(k)
    ts, te = st0 + T_BET, st0 + T_LAND
    # un « tic » à chaque demi-tour
    prev = None
    for i in range(400):
        u = i / 399
        ang = a0 + (a1 - a0) * (1 - (1 - u) ** 1.6)
        n = int(ang / math.pi)
        if prev is not None and n != prev:
            A.add(A.noise(0.01, 600), ts + u * (te - ts), pan=0.3 * math.sin(i), gain=0.12)
        prev = n
    A.kick(te, 0.5)
    A.add(A.tone(2600, 0.6, 6, (1, .6, .3)), te, gain=0.12)                    # la pièce tinte
    A.add(A.tone(2900, 0.4, 8), te + 0.12, gain=0.07)
