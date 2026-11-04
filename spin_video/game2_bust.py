"""HIT OR BUST : blackjack, probabilité de dépasser 21 en tirant une carte."""
import math
from PIL import Image
from engine2 import (Fr, P, GP, font, text, rrect, smooth, T_BET, T_LAND, BEAT,
                     glow_circle, glow_rrect, glow_text, paste_emoji, pop,
                     RED, BLUE, GOLD, YEL, CYAN, WHITE, ORANGE, GREEN)
import game_cards as GC

TITLE, SUBTITLE, OUT = "HIT OR BUST", "Blackjack, but it's math", "hit_or_bust_tiktok.mp4"
QUESTION, BANK_LABEL, COUNT_LABEL, AXIS_LABEL = "SAFE OR BUST?", "CHIPS", "HITS", "FLIP"
OUTRO_WORD, LIVES0, SEED = "this session's hits", 5, 73
HOOK = ["WOULD YOU HIT ON 16?", "ONLY 0.4 % GUESS 8/8", "CAN YOU?"]

def val(r):
    return 11 if r == 14 else (10 if r >= 10 else r)

def total(cards):
    s = sum(val(r) for r, _ in cards)
    aces = sum(1 for r, _ in cards if r == 14)
    while s > 21 and aces:
        s -= 10; aces -= 1
    return s

def soft(cards):
    s = sum(val(r) for r, _ in cards)
    return any(r == 14 for r, _ in cards) and s <= 21

def safe_cards(hand):
    """nombre de cartes (sur 52) qui ne font pas sauter la main"""
    n = 0
    for r in range(2, 15):
        if total(hand + [(r, "S")]) <= 21:
            n += 16 if r == 10 else (0 if r in (11, 12, 13) else 4)
    return n

def RD(hand, hit, f2, tag, pill_):
    T = total(hand)
    sf = safe_cards(hand)
    pct = sf / 52 * 100
    newT = total(hand + [hit])
    win = newT <= 21
    label = f"SOFT {T}" if soft(hand) else str(T)
    return dict(name=f"HIT ON {label}", hand=hand, hit=hit, T=T, newT=newT, soft=soft(hand),
                stat=f"{pct:.1f} %", l1="CHANCE TO", l2="SURVIVE A HIT", sub=f"{sf} of 52 cards",
                f1=[("i", "P"), ("r", f"(safe | {label.lower()}) = "), Fr(sf, 52), ("r", f" = {pct:.1f} %")],
                f2=f2, tag=tag, pill=pill_, win=win, delta=10 if win else -10,
                stamp_lose="BUST", lose_word="BUST", stamp_win=f"{newT} · SAFE")

ROUNDS = [
    RD([(7, "C"), (5, "D")], (9, "H"), [("r", "only 10-value cards bust a 12 :  16 of 52")],
       "12 is safer than it feels", "+1 POINT PER RIGHT CALL"),
    RD([(10, "S"), (3, "H")], (13, "D"), [("r", "busts on 9, 10, J, Q, K")], "every point adds 4 bust cards",
       "BUSTED ON A KING"),
    RD([(9, "D"), (5, "C")], (4, "S"), [("r", "bust cards = 4·("), ("i", "T"), ("r", " − 8)  for "),
                                       ("i", "T"), ("r", " ≥ 12")], "a linear rule hides in the deck", "+10 CHIPS"),
    RD([(8, "H"), (7, "S")], (6, "D"), [("r", "15 : first total where a hit busts > 50 %")],
       "past 14, the odds flip", "PERFECT 21"),
    RD([(10, "C"), (6, "H")], (12, "S"), [("i", "P"), ("r", "(bust | 16) = "), Fr(32, 52), ("r", " = 61.5 %")],
       "16 is the worst hand in the game", "TWO LIVES LEFT"),
    RD([(14, "S"), (6, "D")], (10, "H"), [("r", "an ace counts 1 or 11 :  soft hands can't bust")],
       "soft 17 : a free hit", "FREE HIT"),
    RD([(10, "D"), (8, "C")], (3, "H"), [("r", "only A, 2 or 3 save an 18")], "a 1 in 4 shot that paid",
       "LUCKY THREE"),
    RD([(10, "H"), (9, "S")], (5, "C"), [("r", "bust cards = 4·(19 − 8) = 44")], "never hit on 19", "BUST."),
]
INTRO = dict(big="21", l1="GO OVER", l2="= BUST", sm="J · Q · K count 10", status="8 HITS",
             f1=[("i", "P"), ("r", "(bust | "), ("i", "T"), ("r", ") = "), Fr("4·(T − 8)", 52)],
             f2=[("r", "every hit is a note :  "), ("i", "f"), ("sub", "out"), ("r", " = "), ("i", "f"),
                 ("r", "·2"), ("sup", "s")],
             tag="safe or bust? call it")
OUTRO = dict(f2=[("i", "E"), ("r", "[safe hits] = Σ "), ("i", "P"), ("r", "(safe) ≈ 4.08 / 8")],
             f3=[("r", "this run : 5/8 survived  ⇒  a bit lucky")])

CW, CH = 46.0, 64.0
CY = 344.0
DECK = (360.0, 296.0)

def init(G):
    cards = set()
    for rd in ROUNDS:
        cards.update(rd["hand"]); cards.add(rd["hit"])
    big = {c: GC.card_img(c) for c in cards}
    G["c2"] = {c: im.resize((int(P(CW)), int(P(CH))), Image.LANCZOS) for c, im in big.items()}
    G["back2"] = GC.card_img(None).resize((int(P(CW)), int(P(CH))), Image.LANCZOS)

import render as R
G_ = R.G

def put(L, img, x, y, sx=1.0, rot=0.0, lift=0.0):
    w = max(2, int(img.width * abs(sx)))
    im = img.resize((w, img.height), Image.BICUBIC) if w != img.width else img
    if rot:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    L.alpha_composite(im, (int(P(x) - im.width / 2), int(P(y - lift) - im.height / 2)))

def draw_center(L, d, GL, t, st):
    ph, k = st["phase"], st["k"]
    rd = ROUNDS[k] if k >= 0 else None
    if ph == "outro":
        rd = ROUNDS[-1]
    # sabot
    for i in range(4):
        put(L, G_["back2"], DECK[0] + i * 0.8, DECK[1] - i * 0.8, rot=0)
    if rd is None:
        text(d, (262, 300), "HIT = DRAW ONE CARD", font("xb", 9), (200, 210, 220))
        return
    lt = st["lt"] if ph in ("bet", "spin", "reveal") else 99
    pos = [(224.0, CY), (252.0, CY + 3)]
    for i, c in enumerate(rd["hand"]):
        a = smooth((lt - 0.05 - i * 0.15) / 0.3)
        x = DECK[0] + (pos[i][0] - DECK[0]) * a
        y = DECK[1] + (pos[i][1] - DECK[1]) * a
        img = G_["c2"][c] if a > 0.6 else G_["back2"]
        bust_shake = 0
        if ph == "reveal" and not rd["win"]:
            bust_shake = 2.5 * math.sin(st["v"] * 60) * math.exp(-st["v"] * 5)
        put(L, img, x + bust_shake, y, rot=(-8 + 8 * i) * a)
    # carte tirée
    hx = 312.0
    if ph == "bet":
        pass
    elif ph == "spin":
        u = st["u"]
        a = smooth(u / 0.14)
        x = DECK[0] + (hx - DECK[0]) * a
        y = DECK[1] + (CY - DECK[1]) * a
        if u < 0.9:
            wob = math.sin(u * 50) * 1.2 * u
            put(L, G_["back2"], x + wob, y, rot=6 * (1 - a), lift=3 * math.sin(u * 7) ** 2)
            glow_rrect(GL, (x - CW / 2, y - CH / 2, x + CW / 2, y + CH / 2), 4, ORANGE, 90 * u)
        else:
            f = (u - 0.9) / 0.1
            c = math.cos(math.pi * f)
            img = G_["back2"] if c > 0 else G_["c2"][rd["hit"]]
            put(L, img, hx, CY, sx=max(0.03, abs(c)), lift=6 * math.sin(math.pi * f))
    else:
        put(L, G_["c2"][rd["hit"]], hx, CY)
        if st["ring"]:
            rrect(d, (hx - CW / 2 - 2, CY - CH / 2 - 2, hx + CW / 2 + 2, CY + CH / 2 + 2), 5,
                  outline=st["ring"], w=2)
            glow_rrect(GL, (hx - CW / 2, CY - CH / 2, hx + CW / 2, CY + CH / 2), 5, st["ring"], 200, w=4)
    # total
    revealed = ph in ("reveal", "outro")
    T = rd["newT"] if revealed else rd["T"]
    lab = ("SOFT " if rd["soft"] and not revealed else "") + str(T)
    colT = WHITE
    if revealed:
        colT = (120, 255, 170) if rd["win"] else (255, 90, 100)
        if not rd["win"]:
            lab = f"{T}  BUST"
    sc = pop(st["v"], 0.3, 0.25) if ph == "reveal" else 1.0
    text(d, (238, 279), "TOTAL", font("bold", 7), (150, 160, 170))
    text(d, (238, 294), lab, font("black", 16 * sc), colT)
    glow_text(GL, (238, 294), lab, 16 * sc, colT, 110)
    # échelle des cartes sûres / qui font sauter
    hand = rd["hand"]
    ranks = [14, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    names = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10+"]
    landed = None
    if revealed:
        hr = rd["hit"][0]
        landed = 10 if hr >= 10 else hr
    for i, (r, nm) in enumerate(zip(ranks, names)):
        x0 = 190 + i * 19.6
        ok = total(hand + [(r, "S")]) <= 21
        col = (30, 120, 84) if ok else (150, 40, 54)
        if landed == r:
            col = YEL
        rrect(d, (x0, 410, x0 + 17.6, 428), 2.5, fill=col)
        text(d, (x0 + 8.8, 419.3), nm, font("xb", 6.8 if len(nm) < 3 else 5.8),
             (20, 20, 20) if landed == r else WHITE)
        text(d, (x0 + 8.8, 436), "16" if r == 10 else "4", font("bold", 6), (160, 170, 180))
    safe = safe_cards(hand)
    text(d, (288, 451), f"SAFE {safe} · BUST {52 - safe}  (cards out of 52)", font("xb", 6.8),
         (190, 200, 210))

def audio_round(A, k, rd, st0):
    for i in range(2):
        A.add(A.noise(0.08, 40, 3), st0 + 0.05 + i * 0.15, gain=0.3)
    A.add(A.noise(0.12, 30, 3), st0 + T_BET + 0.02, gain=0.3)
    A.add(A.noise(0.08, 45, 2), st0 + T_BET + 0.9 * (T_LAND - T_BET), gain=0.35)
