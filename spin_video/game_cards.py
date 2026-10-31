"""HIGHER OR LOWER : cartes, en comptant celles déjà sorties."""
import math
from PIL import Image, ImageDraw, ImageFont
from engine import (Fr, P, font, text, rrect, smooth, T_BET, T_LAND,
                    RED, BLUE, GOLD, YEL, CYAN, WHITE, ORANGE)
import render as R

TITLE, SUBTITLE, OUT = "HIGHER OR LOWER", "Cards, but it's math", "higher_or_lower_tiktok.mp4"
QUESTION, BANK_LABEL, COUNT_LABEL, AXIS_LABEL = "RIGHT OR WRONG?", "CHIPS", "CALLS", "FLIP"
OUTRO_WORD, LIVES0, SEED = "this session's calls", 5, 55
RN = {11: "J", 12: "Q", 13: "K", 14: "A"}
def rname(r):
    return RN.get(r, str(r))
SUITS = {"S": "♠", "H": "♥", "D": "♦", "C": "♣"}

CARDS = [(7, "H"), (13, "S"), (4, "D"), (2, "C"), (9, "S"), (11, "D"), (5, "H"), (5, "C"), (12, "H")]
CALLS = ["H", "L", "H", "H", "L", "L", "H", "H"]

def probs(k):
    seen = CARDS[:k + 1]
    cur = CARDS[k][0]
    left = 52 - len(seen)
    cnt = {r: 4 for r in range(2, 15)}
    for r, _ in seen:
        cnt[r] -= 1
    hi = sum(c for r, c in cnt.items() if r > cur)
    lo = sum(c for r, c in cnt.items() if r < cur)
    tie = cnt[cur]
    return hi, lo, tie, left, cnt

EXTRA = [
    ([("r", "higher than 7 : 8 … A  →  7 ranks × 4")], "middle cards are the hardest call", "+1 POINT PER RIGHT CALL"),
    ([("r", "seen cards leave the deck : 50 left")], "count what's already gone", "COUNTING PAYS"),
    ([("r", "higher than 4 : 10 ranks, minus seen")], "likely is not certain", "UPSET"),
    ([("r", "only the other 2s can't beat a 2")], "low cards make easy calls", "+10 CHIPS"),
    ([("r", "9 → lower : 2 to 8 = 7 ranks")], "close calls are coin flips", "COIN FLIP LOST"),
    ([("r", "ties count as a loss")], "high cards : call lower", "TWO LIVES LEFT"),
    (None, "ties are the hidden house edge", "A TIE LOSES"),
    ([("i", "E"), ("r", "[score] = Σ "), ("i", "P"), ("r", "(right call)")], "always call the bigger side",
     "STRONG FINISH"),
]

ROUNDS = []
EXP = 0.0
for k in range(8):
    hi, lo, tie, left, cnt = probs(k)
    call = CALLS[k]
    good = hi if call == "H" else lo
    pct = good / left * 100
    EXP += good / left
    nxt = CARDS[k + 1][0]
    cur = CARDS[k][0]
    win = (nxt > cur) if call == "H" else (nxt < cur)
    word = "higher" if call == "H" else "lower"
    f2, tag, pl = EXTRA[k]
    if f2 is None:
        f2 = [("i", "P"), ("r", "(tie) = "), Fr(tie, left), ("r", f" = {tie / left * 100:.1f} %")]
    ROUNDS.append(dict(
        name=("HIGHER" if call == "H" else "LOWER") + f" THAN {rname(cur)}", call=call,
        stat=f"{pct:.1f} %", l1="CHANCE IT'S", l2=word.upper(), sub=f"{good} of {left} cards",
        f1=[("i", "P"), ("r", f"({word}) = "), Fr(good, left), ("r", f" = {pct:.1f} %")],
        f2=f2, tag=tag, pill=pl, win=win, delta=10 if win else -10,
        big="TIE" if nxt == cur else "LOST"))
INTRO = dict(big="52", l1="CARDS IN", l2="THE DECK", sm="13 ranks × 4 suits", status="CALL 8 CARDS",
             f1=[("i", "P"), ("r", "(higher) = "), Fr("# higher cards", "cards left")],
             f2=[("r", "every card is a note :  "), ("i", "f"), ("sub", "out"), ("r", " = "), ("i", "f"),
                 ("r", "·2"), ("sup", "s")],
             tag="call every card before it flips")
OUTRO = dict(f2=[("i", "E"), ("r", f"[score] = Σ p ≈ {EXP:.2f} / 8")],
             f3=[("r", "this run : 5/8  ⇒  a bit under expected")])

CW, CH = 58.0, 82.0
POS_L, POS_R, CY = 238.0, 338.0, 333.0

def card_img(card):
    S = 4
    w, h = int(P(CW)) * S // 2 * 2, int(P(CH)) * S // 2 * 2
    w, h = int(P(CW) * 1.5), int(P(CH) * 1.5)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    u = w / 100
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=8 * u, fill=(250, 250, 248), outline=(180, 180, 180),
                        width=int(1.5 * u))
    if card is None:                                            # dos de carte
        d.rounded_rectangle([6 * u, 6 * u, w - 6 * u, h - 6 * u], radius=6 * u, fill=(190, 36, 52))
        for i in range(-12, 24):
            x = i * 9 * u
            d.line([x, 6 * u, x + h, 6 * u + h], fill=(220, 70, 85), width=int(1.6 * u))
            d.line([x + h, 6 * u, x, 6 * u + h], fill=(220, 70, 85), width=int(1.6 * u))
        mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask).rounded_rectangle([6 * u, 6 * u, w - 6 * u, h - 6 * u], radius=6 * u, fill=255)
        bg = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        bg.paste(im, (0, 0))
        base = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        bd = ImageDraw.Draw(base)
        bd.rounded_rectangle([0, 0, w - 1, h - 1], radius=8 * u, fill=(250, 250, 248), outline=(180, 180, 180),
                             width=int(1.5 * u))
        base.paste(im, (0, 0), mask)
        ImageDraw.Draw(base).rounded_rectangle([6 * u, 6 * u, w - 6 * u, h - 6 * u], radius=6 * u,
                                               outline=(250, 240, 240), width=int(2 * u))
        return base
    r, s = card
    col = (210, 30, 45) if s in "HD" else (20, 20, 26)
    fb = ImageFont.truetype(R.FI + "Inter-Black.otf", int(26 * u))
    fs = ImageFont.truetype(R.FD + "DejaVuSans.ttf", int(20 * u))
    fbig = ImageFont.truetype(R.FD + "DejaVuSans.ttf", int(70 * u))
    d.text((14 * u, 18 * u), rname(r), font=fb, fill=col, anchor="mm")
    d.text((14 * u, 38 * u), SUITS[s], font=fs, fill=col, anchor="mm")
    d.text((w - 14 * u, h - 18 * u), rname(r), font=fb, fill=col, anchor="mm")
    d.text((w - 14 * u, h - 38 * u), SUITS[s], font=fs, fill=col, anchor="mm")
    d.text((w / 2, h / 2 + 4 * u), SUITS[s], font=fbig, fill=col, anchor="mm")
    return im

def init(G):
    G["back"] = card_img(None).resize((int(P(CW)), int(P(CH))), Image.LANCZOS)
    G["cards"] = {c: card_img(c).resize((int(P(CW)), int(P(CH))), Image.LANCZOS) for c in CARDS}

G_ = R.G

def paste_card(L, img, x, y, sx=1.0, lift=0.0):
    w = max(2, int(img.width * abs(sx)))
    im = img.resize((w, img.height), Image.BICUBIC) if w != img.width else img
    L.alpha_composite(im, (int(P(x) - w / 2), int(P(y - lift) - im.height / 2)))

def draw_center(L, d, t, st):
    ph, k = st["phase"], st["k"]
    kk = max(k, 0)
    s = ROUNDS[k] if k >= 0 else None
    # carte de gauche (carte actuelle) — glisse depuis la droite pendant la mise
    if ph == "bet" and k > 0:
        v = smooth(st["v"] / 0.55)
        x = POS_R + (POS_L - POS_R) * v
        paste_card(L, G_["cards"][CARDS[k]], x, CY)
        if v < 1:
            pass
    elif ph == "outro":
        paste_card(L, G_["cards"][CARDS[-2]], POS_L, CY)
    else:
        paste_card(L, G_["cards"][CARDS[kk]], POS_L, CY)
    # carte de droite
    if ph == "intro":
        paste_card(L, G_["back"], POS_R, CY)
    elif ph == "bet":
        a = smooth((st["v"] - 0.3) / 0.4)
        if a > 0:
            paste_card(L, G_["back"], POS_R, CY + (1 - a) * 30)
    elif ph == "spin":
        u = st["u"]
        if u < 0.86:
            wob = math.sin(u * 40) * 1.5 * u
            paste_card(L, G_["back"], POS_R + wob, CY, lift=4 * math.sin(u * 6) ** 2)
        else:
            f = (u - 0.86) / 0.14
            c = math.cos(math.pi * f)
            img = G_["back"] if c > 0 else G_["cards"][CARDS[k + 1]]
            paste_card(L, img, POS_R, CY, sx=max(0.03, abs(c)), lift=8 * math.sin(math.pi * f))
    elif ph in ("reveal", "outro"):
        nk = CARDS[k + 1] if ph == "reveal" else CARDS[-1]
        paste_card(L, G_["cards"][nk], POS_R, CY)
        if st["ring"]:
            rrect(d, (POS_R - CW / 2 - 3, CY - CH / 2 - 3, POS_R + CW / 2 + 3, CY + CH / 2 + 3), 6,
                  outline=st["ring"], w=2.2)
    # flèche d'appel
    if s and ph in ("bet", "spin", "reveal"):
        up = s["call"] == "H"
        col = CYAN
        ay = CY - 6
        if up:
            d.polygon([(P(288), P(ay - 12)), (P(280), P(ay)), (P(296), P(ay))], fill=col)
            d.rectangle([P(285), P(ay), P(291), P(ay + 10)], fill=col)
        else:
            d.polygon([(P(288), P(ay + 12)), (P(280), P(ay)), (P(296), P(ay))], fill=col)
            d.rectangle([P(285), P(ay - 10), P(291), P(ay)], fill=col)
        text(d, (288, CY + 18), "HIGHER" if up else "LOWER", font("xb", 7.5), col)
    # échelle des rangs + cartes restantes
    if s and ph in ("bet", "spin", "reveal"):
        hi, lo, tie, left, cnt = probs(k)
        cur = CARDS[k][0]
    else:
        cur = None
        cnt = {r: 4 for r in range(2, 15)}
        if ph == "outro":
            for r, _ in CARDS:
                cnt[r] -= 1
    landed = CARDS[k + 1][0] if ph == "reveal" else None
    for i, r in enumerate(range(2, 15)):
        x0 = 189 + i * 15.4
        col = (44, 54, 50)
        if cur is not None:
            good = (r > cur) if s["call"] == "H" else (r < cur)
            if good:
                col = (50, 130, 150)
            if r == cur:
                col = (120, 50, 58)
        if landed == r:
            col = YEL
        rrect(d, (x0, 420, x0 + 13.6, 436), 2, fill=col)
        text(d, (x0 + 6.8, 428.3), rname(r), font("xb", 7), (20, 20, 20) if landed == r else WHITE)
        for j in range(4):
            on = j < cnt[r]
            d.ellipse([P(x0 + 1.8 + j * 2.8), P(441), P(x0 + 3.8 + j * 2.8), P(443)],
                      fill=(200, 205, 205) if on else (60, 66, 64))
        if r == cur:
            rrect(d, (x0 - .6, 419.4, x0 + 14.2, 436.6), 2.2, outline=WHITE, w=0.9)
    text(d, (288, 453), "CARDS LEFT PER RANK", font("bold", 6.5), (140, 150, 146))

def audio_round(A, k, rd, st0):
    ts, te = st0 + T_BET, st0 + T_LAND
    for c in range(6):                                          # glissement de carte
        A.add(A.noise(0.03, 60, 4), st0 + 0.05 + c * 0.04, gain=0.08)
    A.add(A.noise(0.05, 50, 3), st0 + 0.35, gain=0.2)
    tf = ts + 0.86 * (te - ts)
    A.add(A.noise(0.08, 40, 2), tf, gain=0.35)                  # retournement
    A.kick(te, 0.4)
