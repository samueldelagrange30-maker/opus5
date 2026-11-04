"""SCRATCH IT : carte à gratter, gains et taux de redistribution."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from engine2 import (Fr, P, GP, K, font, text, rrect, smooth, T_BET, T_LAND, BEAT,
                     glow_circle, glow_rrect, glow_text, paste_emoji, pop, emoji,
                     RED, BLUE, GOLD, YEL, CYAN, WHITE, ORANGE, GREEN)
import render as R

TITLE, SUBTITLE, OUT = "SCRATCH IT", "Scratch cards, but it's math", "scratch_it_tiktok.mp4"
QUESTION, BANK_LABEL, COUNT_LABEL, AXIS_LABEL = "WIN OR LOSE?", "CHIPS", "CARDS", "SCRATCH"
OUTRO_WORD, LIVES0, SEED = "this session's cards", 6, 75
HOOK = ["52 % COMES BACK", "ONLY 0.4 % GUESS 8/8", "CAN YOU?"]
PRIZES = [("🎁", 1, "1/8"), ("🍀", 2, "1/10"), ("⭐", 5, "1/40"), ("💰", 20, "1/400"), ("💎", 100, "1/5000")]
PMULT = {e: m for e, m, _ in PRIZES}

def RD(name, grid, last, stat, l2, sub, f1, f2, tag, pill_, focus, l1="CHANCE OF"):
    cnt = {}
    for e in grid:
        cnt[e] = cnt.get(e, 0) + 1
    triples = [e for e, c in cnt.items() if c >= 3]
    assert len(triples) <= 1 and all(c <= 3 for c in cnt.values()), (name, cnt)
    win = bool(triples)
    mult = PMULT[triples[0]] if win else 0
    pair = [e for e, c in cnt.items() if c == 2 and e in PMULT]
    return dict(name=name, grid=grid, last=last, win=win, mult=mult, sym=triples[0] if win else None,
                pair=pair[0] if (pair and not win) else None, delta=10 * mult - 10 if win else -10,
                stat=stat, l1=l1, l2=l2, sub=sub, f1=f1, f2=f2, tag=tag, pill=pill_, focus=focus,
                stamp_win=("MONEY BACK" if mult == 1 else f"{mult}× WIN"), stamp_lose="NO WIN", lose_word="LOST")

ROUNDS = [
    RD("ANY WIN", list("🍋🍀⭐") + ["💰", "🍒", "🍀", "🎁", "🔔", "💎"], 4, "25.3 %", "ANY WIN", "1 in 3.95 cards",
       [("i", "P"), ("r", "(win) = Σ "), ("i", "p"), ("sub", "prize"), ("r", " = 25.3 %")],
       [Fr(1, 8), ("r", " + "), Fr(1, 10), ("r", " + "), Fr(1, 40), ("r", " + "), Fr(1, 400), ("r", " + "),
        Fr(1, 5000)], "3 in 4 cards are losers", "+1 POINT PER RIGHT CALL", "all"),
    RD("2× PRIZE", ["🍀", "⭐", "🍀", "🍒", "🍀", "💰", "🔔", "🎁", "🍋"], 4, "10.0 %", "THE 2× PRIZE",
       "1 in 10 cards", [("i", "P"), ("r", "(2×) = "), Fr(1, 10), ("r", " = 10 %")],
       [("r", "you paid 10, you get 20 back")], "the most common real win", "+10 CHIPS", "🍀"),
    RD("JACKPOT", ["💎", "🍋", "🎁", "⭐", "💎", "🍒", "🍀", "🔔", "💰"], 8, "0.02 %", "THE 100× JACKPOT",
       "1 in 5,000 cards", [("i", "P"), ("r", "(jackpot) = "), Fr(1, 5000), ("r", " = 0.02 %")],
       [("r", "a near miss feels close, the odds don't care")], "two diamonds = still a loser", "SO CLOSE?", "💎"),
    RD("MONEY BACK", ["🎁", "🍒", "⭐", "🍋", "🎁", "💎", "🔔", "💰", "🎁"], 8, "12.5 %", "A 1× REFUND",
       "1 in 8 cards", [("i", "P"), ("r", "(1×) = "), Fr(1, 8), ("r", " = 12.5 %")],
       [("r", "half of all “wins” just return your 10")], "a refund dressed up as a win", "WIN +0 ?!", "🎁"),
    RD("5× PRIZE", ["⭐", "🍀", "🍒", "🔔", "⭐", "🎁", "💰", "🍋", "💎"], 8, "2.5 %", "THE 5× PRIZE",
       "1 in 40 cards", [("i", "P"), ("r", "(5×) = "), Fr(1, 40), ("r", " = 2.5 %")],
       [("r", "pays 5× :  "), Fr(1, 40), ("r", "·5 = 0.125 back per card")], "two stars, no prize",
       "NEAR MISS", "⭐"),
    RD("RTP", ["🍒", "💰", "🍋", "🎁", "🔔", "🍀", "⭐", "💎", "🍒"], 8, "52.0 %", "PLAYER", "52 of every 100 back",
       [("r", "RTP = Σ "), ("i", "p"), ("r", "·prize = 52 %")],
       [Fr(1, 8), ("r", " + "), Fr(2, 10), ("r", " + "), Fr(5, 40), ("r", " + "), Fr(20, 400), ("r", " + "),
        Fr(100, 5000), ("r", " = 0.52")], "48 % of every card stays with the seller", "TWO LIVES LEFT", "all",
       l1="RETURN TO"),
    RD("ANY WIN", ["⭐", "🍋", "💎", "🍀", "⭐", "🔔", "🎁", "🍒", "⭐"], 8, "25.3 %", "ANY WIN", "1 in 3.95 cards",
       [("i", "P"), ("r", "(win) = 25.3 %")], [("r", "on average : 1 win every ≈ 4 cards")],
       "wins come at random, not on schedule", "+40 CHIPS", "all"),
    RD("20× PRIZE", ["💰", "🍀", "🔔", "🍋", "🎁", "💰", "🍒", "⭐", "💎"], 8, "0.25 %", "THE 20× PRIZE",
       "1 in 400 cards", [("i", "P"), ("r", "(20×) = "), Fr(1, 400), ("r", " = 0.25 %")],
       [("i", "E"), ("r", "[card] = 10 · 0.52 = 5.20")], "you pay 10 for 5.20 of value", "SO CLOSE.", "💰"),
]
INTRO = dict(big="52 %", l1="COMES", l2="BACK", sm="the other 48 % doesn't", status="8 CARDS",
             f1=[("r", "RTP = Σ "), ("i", "p"), ("sub", "prize"), ("r", " · prize")],
             f2=[("r", "every card is a note :  "), ("i", "f"), ("sub", "out"), ("r", " = "), ("i", "f"),
                 ("r", "·2"), ("sup", "s")],
             tag="win or lose? call it")
OUTRO = dict(f2=[("i", "E"), ("r", "[profit] = 80 · (0.52 − 1) = −38.40")],
             f3=[("r", "this run : ±0  ⇒  way luckier than average")])

GX0, GY0, CWD, CHT, GAP = 196.0, 263.0, 59.0, 42.0, 4.0

def cell_box(i):
    r, c = divmod(i, 3)
    x0 = GX0 + c * (CWD + GAP)
    y0 = GY0 + r * (CHT + GAP)
    return (x0, y0, x0 + CWD, y0 + CHT)

GW = 3 * CWD + 2 * GAP
GH = 3 * CHT + 2 * GAP

def init(G):
    w, h = int(P(GW)), int(P(GH))
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    base = 170 + 40 * np.sin((xx + yy) / w * 9) + 25 * np.sin(xx / w * 31)
    shine = np.exp(-((xx - yy * 0.8 - w * 0.3) / (w * 0.08)) ** 2) * 60
    v = np.clip(base + shine, 0, 255)
    foil = np.dstack([v * 0.96, v * 0.98, v * 1.02, np.full_like(v, 255)]).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(foil, "RGBA")
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(R.FI + "Inter-Black.otf", int(P(13)))
    for i in range(9):
        x0, y0, x1, y1 = cell_box(i)
        cx, cy = P((x0 + x1) / 2 - GX0), P((y0 + y1) / 2 - GY0)
        d.text((cx, cy), "?", font=f, fill=(120, 124, 134, 255), anchor="mm")
    G["foil"] = im
    G["cell_order"] = {}

def order_for(rd):
    last = rd["last"]
    rest = [i for i in range(9) if i != last]
    return rest + [last]

def scratch_mask(rd, u):
    """masque (255 = feuille encore là) pour l'avancement u du grattage"""
    w, h = int(P(GW)), int(P(GH))
    m = Image.new("L", (w, h), 255)
    d = ImageDraw.Draw(m)
    order = order_for(rd)
    # 8 premières cases sur u ∈ [0.03, 0.8], la dernière sur [0.8, 1.0]
    spans = [(0.03 + j * (0.77 / 8), 0.03 + (j + 1) * (0.77 / 8)) for j in range(8)] + [(0.8, 1.0)]
    brush = int(P(10))
    head = None
    for j, cell in enumerate(order):
        a0, a1 = spans[j]
        if u <= a0:
            break
        f = min(1.0, (u - a0) / (a1 - a0))
        x0, y0, x1, y1 = cell_box(cell)
        x0, x1, y0, y1 = x0 - GX0, x1 - GX0, y0 - GY0, y1 - GY0
        if f >= 1:
            d.rectangle([P(x0), P(y0), P(x1), P(y1)], fill=0)
            continue
        # zigzag : 4 passes horizontales
        pts = []
        npass = 4
        for p in range(npass):
            yy = y0 + 6 + (y1 - y0 - 12) * p / (npass - 1)
            xs = (x0 + 5, x1 - 5) if p % 2 == 0 else (x1 - 5, x0 + 5)
            pts += [(xs[0], yy), (xs[1], yy)]
        seg_total = len(pts) - 1
        pos = f * seg_total
        drawn = [pts[0]]
        for s in range(int(pos)):
            drawn.append(pts[s + 1])
        i0 = int(pos)
        if i0 < seg_total:
            fr = pos - i0
            (ax, ay), (bx, by) = pts[i0], pts[i0 + 1]
            drawn.append((ax + (bx - ax) * fr, ay + (by - ay) * fr))
        d.line([(P(x), P(y)) for x, y in drawn], fill=0, width=brush * 2, joint="curve")
        for x, y in drawn:
            d.ellipse([P(x) - brush, P(y) - brush, P(x) + brush, P(y) + brush], fill=0)
        head = (drawn[-1][0] + GX0, drawn[-1][1] + GY0)
    return m, head

def draw_center(L, d, GL, t, st):
    ph, k = st["phase"], st["k"]
    rd = ROUNDS[k] if k >= 0 else None
    if ph == "outro":
        rd = ROUNDS[-1]
    rrect(d, (GX0 - 5, GY0 - 5, GX0 + GW + 5, GY0 + GH + 5), 6, fill=(250, 214, 80), outline=(170, 120, 20), w=1)
    for i in range(9):
        rrect(d, cell_box(i), 4, fill=(252, 248, 236))
        if rd is not None:
            x0, y0, x1, y1 = cell_box(i)
            paste_emoji(L, rd["grid"][i], (x0 + x1) / 2, (y0 + y1) / 2, 24)
    # surbrillance après grattage complet
    if rd is not None and ph in ("reveal", "outro"):
        a = 1.0 if ph == "outro" else smooth((st["v"] - 0.15) / 0.2)
        hl = rd["sym"] or rd["pair"]
        col = (60, 220, 140) if rd["win"] else (240, 60, 80)
        for i in range(9):
            if rd["grid"][i] == hl:
                x0, y0, x1, y1 = cell_box(i)
                rrect(d, (x0 - 1, y0 - 1, x1 + 1, y1 + 1), 5, outline=col + (int(255 * a),), w=2)
                glow_rrect(GL, (x0, y0, x1, y1), 4, col, int(200 * a), w=4)
    # feuille à gratter
    if rd is None:
        u = 0.0
    elif ph == "bet":
        u = 0.0
    elif ph == "spin":
        u = st["u"]
    else:
        u = 1.0
    if u < 1.0:
        m, head = scratch_mask(rd, u) if rd is not None else (Image.new("L", G_["foil"].size, 255), None)
        foil = G_["foil"].copy()
        foil.putalpha(m)
        L.alpha_composite(foil, (int(P(GX0)), int(P(GY0))))
        if head is not None:
            wob = 6 * math.sin(t * 40)
            paste_emoji(L, "🪙", head[0] + 6, head[1] + 6, 18, rot=20 + wob)
            glow_circle(GL, head[0], head[1], 10, (255, 230, 150), 130)
    # table des gains
    focus = rd["focus"] if rd is not None and ph in ("bet", "spin", "reveal") else "all"
    for i, (e, mlt, pr) in enumerate(PRIZES):
        x0 = 192 + i * 39
        active = focus == "all" or focus == e
        won = rd is not None and ph == "reveal" and rd["sym"] == e
        fill = YEL if won else ((44, 58, 70) if active else (28, 34, 42))
        rrect(d, (x0, 412, x0 + 36, 446), 3, fill=fill)
        if focus == e and not won:
            rrect(d, (x0 - .5, 411.5, x0 + 36.5, 446.5), 3.4, outline=CYAN, w=1)
        paste_emoji(L, e, x0 + 18, 421, 10, alpha=1.0 if active else 0.4)
        tc = (20, 20, 20) if won else (WHITE if active else (120, 128, 136))
        text(d, (x0 + 18, 433), f"{mlt}×", font("black", 7.5), tc)
        text(d, (x0 + 18, 441.5), pr, font("bold", 5.5), (60, 60, 60) if won else (150, 160, 170))
    text(d, (288, 455), "3 matching symbols = prize", font("semi", 6.5), (160, 170, 180))

G_ = R.G

def audio_round(A, k, rd, st0):
    ts, te = st0 + T_BET, st0 + T_LAND
    n = int((te - ts) / 0.045)
    for i in range(n):
        u = i / n
        if u < 0.03:
            continue
        A.add(A.noise(0.05, 30, 2), ts + i * 0.045, pan=0.3 * math.sin(i * 0.7),
              gain=0.10 + 0.08 * abs(math.sin(i * 0.9)))
    for j in range(8):
        tc = ts + (0.03 + (j + 1) * (0.77 / 8)) * (te - ts)
        A.add(A.tone(1046.5 * 2 ** (j / 12), 0.15, 18, (1, .3)), tc, gain=0.08)
