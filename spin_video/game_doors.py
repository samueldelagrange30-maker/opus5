"""PICK A DOOR : le problème de Monty Hall (rester ou changer)."""
import math
from PIL import Image, ImageDraw
from engine import (Fr, P, font, text, rrect, smooth, T_BET, T_LAND,
                    RED, BLUE, GOLD, YEL, CYAN, WHITE, ORANGE)
import render as R

TITLE, SUBTITLE, OUT = "PICK A DOOR", "Monty Hall, but it's math", "pick_a_door_tiktok.mp4"
QUESTION, BANK_LABEL, COUNT_LABEL, AXIS_LABEL = "CAR OR GOAT?", "CHIPS", "DOORS", "OPEN"
OUTRO_WORD, LIVES0, SEED = "this session's doors", 5, 66

# (choix initial, voiture, stratégie, porte ouverte par l'animateur)
SETUP = [(0, 2, "STAY", 1), (1, 0, "SWITCH", 2), (2, 1, "SWITCH", 0), (0, 0, "STAY", 2),
         (1, 1, "SWITCH", 0), (0, 1, "SWITCH", 2), (2, 0, "STAY", 1), (1, 2, "SWITCH", 0)]
TXT = [
    ([("i", "P"), ("r", "(win | stay) = "), Fr(1, 3), ("r", " = 33.3 %")],
     [("r", "your first pick is right 1 time in 3")], "the host's door changes nothing for stayers",
     "+1 POINT PER RIGHT CALL"),
    ([("i", "P"), ("r", "(win | switch) = "), Fr(2, 3), ("r", " = 66.7 %")],
     [("r", "switch wins whenever your first pick was wrong")], "the host knows where the car is",
     "SWITCH WINS"),
    ([("i", "P"), ("r", "(first pick wrong) = "), Fr(2, 3)],
     [("r", "the host must open a goat  ⇒  information leaks")], "his choice is not random", "AGAIN"),
    ([("i", "P"), ("r", "(win | stay) = "), Fr(1, 3), ("r", " = 33.3 %")],
     [("r", "staying still wins 1 time in 3")], "winning once doesn't make it right", "LUCKY STAY"),
    ([("i", "P"), ("r", "(lose | switch) = "), Fr(1, 3)],
     [("r", "66.7 % is not 100 %")], "good strategy, bad luck", "UNLUCKY SWITCH"),
    ([("i", "P"), ("r", "(car B | host opens C) = "), Fr("⅓ · 1", "½"), ("r", " = "), Fr(2, 3)],
     [("r", "Bayes :  "), ("i", "P"), ("r", "(A|B) = "), Fr("P(B|A)·P(A)", "P(B)")], "Bayes says switch",
     "BAYES WINS"),
    ([("i", "P"), ("r", "(win | stay) = "), Fr(1, 3), ("r", " = 33.3 %")],
     [("r", "100 doors :  stay = "), Fr(1, 100), ("r", ",  switch = "), Fr(99, 100)], "imagine 100 doors",
     "LAST DOOR NEXT"),
    ([("i", "P"), ("r", "(win | switch) = "), Fr(2, 3), ("r", " = 66.7 %")],
     [("i", "E"), ("r", "[wins | always switch] = 8·"), Fr(2, 3), ("r", " = 5.33")], "always switch",
     "SWITCH FOR THE WIN"),
]
ROUNDS = []
for k, (p, c, strat, h) in enumerate(SETUP):
    final = p if strat == "STAY" else ({0, 1, 2} - {p, h}).pop()
    assert h != p and h != c
    win = final == c
    f1, f2, tag, pl = TXT[k]
    ROUNDS.append(dict(name=strat, pick=p, car=c, host=h, final=final, win=win, delta=10 if win else -10,
                       stat="33.3 %" if strat == "STAY" else "66.7 %", l1="CHANCE TO WIN",
                       l2=f"IF YOU {strat}", sub="1 of 3 doors" if strat == "STAY" else "2 of 3 doors",
                       f1=f1, f2=f2, tag=tag, pill=pl, big="GOAT"))
INTRO = dict(big="3", l1="DOORS,", l2="1 CAR", sm="2 goats behind the others", status="PICK 8 DOORS",
             f1=[("i", "P"), ("r", "(car) = "), Fr(1, 3)],
             f2=[("r", "every door is a note :  "), ("i", "f"), ("sub", "out"), ("r", " = "), ("i", "f"),
                 ("r", "·2"), ("sup", "s")],
             tag="stay or switch? call it")
OUTRO = dict(f2=[("r", "always switch : "), ("i", "E"), ("r", " = 8·"), Fr(2, 3), ("r", " = 5.33")],
             f3=[("r", "always stay : "), ("i", "E"), ("r", " = 8·"), Fr(1, 3), ("r", " = 2.67")])

DX = [224.0, 288.0, 352.0]
DW, DY0, DY1 = 54.0, 273.0, 370.0

def prize(kind):
    w, h = int(P(DW - 8)) * 3, int(P(46)) * 3
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    u = w / 100
    if kind == "car":
        col = (230, 40, 56)
        d.rounded_rectangle([6 * u, 46 * u, 94 * u, 76 * u], radius=10 * u, fill=col)
        d.polygon([(24 * u, 48 * u), (34 * u, 26 * u), (68 * u, 26 * u), (80 * u, 48 * u)], fill=col)
        d.polygon([(30 * u, 47 * u), (38 * u, 31 * u), (50 * u, 31 * u), (50 * u, 47 * u)], fill=(170, 220, 255))
        d.polygon([(54 * u, 47 * u), (54 * u, 31 * u), (66 * u, 31 * u), (75 * u, 47 * u)], fill=(170, 220, 255))
        for cx in (26, 74):
            d.ellipse([(cx - 12) * u, 64 * u, (cx + 12) * u, 88 * u], fill=(30, 30, 34))
            d.ellipse([(cx - 5) * u, 71 * u, (cx + 5) * u, 81 * u], fill=(190, 190, 196))
        d.ellipse([86 * u, 52 * u, 94 * u, 60 * u], fill=(255, 230, 120))
    else:
        body, dark = (232, 228, 218), (120, 110, 100)
        for lx in (30, 40, 64, 74):
            d.line([lx * u, 62 * u, lx * u, 88 * u], fill=dark, width=int(4 * u))
        d.ellipse([22 * u, 38 * u, 82 * u, 70 * u], fill=body, outline=dark, width=int(2 * u))
        d.ellipse([70 * u, 20 * u, 96 * u, 48 * u], fill=body, outline=dark, width=int(2 * u))
        d.line([76 * u, 22 * u, 66 * u, 6 * u], fill=dark, width=int(3 * u))
        d.line([86 * u, 22 * u, 92 * u, 6 * u], fill=dark, width=int(3 * u))
        d.polygon([(84 * u, 46 * u), (90 * u, 46 * u), (86 * u, 58 * u)], fill=dark)
        d.ellipse([84 * u, 28 * u, 89 * u, 33 * u], fill=(20, 20, 20))
        d.line([22 * u, 48 * u, 14 * u, 40 * u], fill=dark, width=int(3 * u))
    return im.resize((w // 3, h // 3), Image.LANCZOS)

def door_img(n):
    w, h = int(P(DW)), int(P(DY1 - DY0))
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    u = w / 100
    d.rectangle([0, 0, w - 1, h - 1], fill=(150, 88, 46), outline=(90, 50, 22), width=int(3 * u))
    for y0, y1 in ((8, 46), (54, 92)):
        d.rectangle([12 * u, y0 / 100 * h, 88 * u, y1 / 100 * h], outline=(110, 62, 28), width=int(3 * u))
    d.ellipse([74 * u, h * 0.52, 86 * u, h * 0.52 + 12 * u], fill=(240, 200, 80))
    f = R.ImageFont.truetype(R.FI + "Inter-Black.otf", int(46 * u))
    d.text((w / 2, h * 0.28), str(n), font=f, fill=(255, 236, 200), anchor="mm")
    return im

def init(G):
    G["car"], G["goat"] = prize("car"), prize("goat")
    G["doors"] = [door_img(i + 1) for i in range(3)]

G_ = R.G

def door_open_amount(st, i):
    ph, k = st["phase"], st["k"]
    if k < 0 or ph == "bet":
        return 0.0
    if ph == "outro":
        return 1.0
    s = ROUNDS[k]
    if ph == "spin":
        return smooth(st["u"] / 0.2) if i == s["host"] else 0.0
    if i == s["host"]:
        return 1.0
    if i == s["final"]:
        return smooth(st["v"] / 0.25)
    return smooth((st["v"] - 0.7) / 0.3)

def marker_x(st):
    ph, k = st["phase"], st["k"]
    s = ROUNDS[k]
    if ph == "bet":
        return DX[s["pick"]]
    if ph == "spin":
        v = smooth((st["u"] - 0.45) / 0.3)
        return DX[s["pick"]] + (DX[s["final"]] - DX[s["pick"]]) * v
    return DX[s["final"]]

def draw_center(L, d, t, st):
    ph, k = st["phase"], st["k"]
    s = ROUNDS[k] if k >= 0 else (ROUNDS[-1] if ph == "outro" else None)
    if ph == "outro":
        s = ROUNDS[-1]
    for i in range(3):
        x0 = DX[i] - DW / 2
        rrect(d, (x0 - 2, DY0 - 2, x0 + DW + 2, DY1 + 2), 2, fill=(14, 16, 18), outline=(90, 96, 94), w=1)
        if s is not None:
            kind = "car" if s["car"] == i else "goat"
            im = G_[kind]
            L.alpha_composite(im, (int(P(DX[i]) - im.width / 2), int(P(DY1 - 30) - im.height / 2)))
        a = door_open_amount(st, i) if k >= 0 or ph == "outro" else 0.0
        door = G_["doors"][i]
        w = max(2, int(door.width * (1 - 0.82 * a)))
        if w != door.width:
            dimg = door.resize((w, door.height), Image.BICUBIC)
            shade = Image.new("RGBA", dimg.size, (0, 0, 0, int(110 * a)))
            dimg.alpha_composite(shade)
        else:
            dimg = door
        L.alpha_composite(dimg, (int(P(x0)), int(P(DY0))))
    # marqueur du choix
    if k >= 0 and ph in ("bet", "spin", "reveal"):
        mx = marker_x(st)
        col = YEL
        d.polygon([(P(mx), P(DY1 + 4)), (P(mx - 5), P(DY1 + 11)), (P(mx + 5), P(DY1 + 11))], fill=col)
        text(d, (mx, DY1 + 16), "YOUR PICK", font("xb", 6.5), col)
        if ph == "spin" and st["u"] > 0.3:
            a = int(255 * smooth((st["u"] - 0.3) / 0.1))
            strat = s["name"]
            c = CYAN if strat == "SWITCH" else ORANGE
            rrect(d, (258, 257, 318, 270), 3, fill=c + (a,))
            text(d, (288, 263.8), strat, font("black", 9), (12, 12, 12, a))
    if st["ring"] and ph in ("reveal", "outro"):
        f = s["final"]
        x0 = DX[f] - DW / 2
        rrect(d, (x0 - 4, DY0 - 4, x0 + DW + 4, DY1 + 4), 3, outline=st["ring"], w=2.2)
    # tableau stay / switch
    rows = [("STAY", ["WIN", "LOSE", "LOSE"]), ("SWITCH", ["LOSE", "WIN", "WIN"])]
    heads = ["CAR @ PICK", "CAR @ OTHER", "CAR @ OTHER"]
    case = None
    if s is not None and ph in ("reveal", "outro"):
        if s["car"] == s["pick"]:
            case = 0
        else:
            others = [i for i in range(3) if i != s["pick"]]
            case = 1 + others.index(s["car"])
    for j, hd in enumerate(heads):
        text(d, (250 + j * 47, 402), hd, font("bold", 5.6), (150, 160, 156))
    for r, (nm, cells) in enumerate(rows):
        y = 409 + r * 19
        active = s is not None and ph != "intro" and s["name"] == nm
        text(d, (204, y + 8), nm, font("xb", 6.5), WHITE if active else (120, 128, 125))
        for j, c in enumerate(cells):
            x0 = 228 + j * 47
            col = (40, 120, 70) if c == "WIN" else (110, 40, 48)
            if not active:
                col = tuple(int(v * 0.5 + 12) for v in col)
            rrect(d, (x0, y, x0 + 44, y + 16), 2, fill=col)
            if active and case == j:
                rrect(d, (x0 - .6, y - .6, x0 + 44.6, y + 16.6), 2.4, outline=YEL, w=1.3)
            text(d, (x0 + 22, y + 8.3), c, font("xb", 6.5), WHITE)
    text(d, (250 + 47, 451), "each column :  1/3", font("semi", 6.2), (150, 160, 156))

def audio_round(A, k, rd, st0):
    ts, te = st0 + T_BET, st0 + T_LAND
    A.add(A.tone(880, 0.25, 14, (1, .4)), st0 + 0.08, gain=0.18)                 # choix
    A.add(A.noise(0.3, 9, 6), ts + 0.02, gain=0.25)                              # porte qui grince
    A.add(A.saw_drop(330, 300, 0.4) * 0.3, ts + 0.02, gain=0.2)
    A.add(A.tone(392, 0.4, 6, (1, .5)), ts + 0.3 * (te - ts), gain=0.22)          # STAY / SWITCH
    if rd["name"] == "SWITCH":
        A.add(A.tone(587, 0.4, 6, (1, .5)), ts + 0.36 * (te - ts), gain=0.22)
    for i in range(8):                                                        # roulement de tambour
        A.add(A.noise(0.05, 40), ts + (0.78 + i * 0.026) * (te - ts), gain=0.12 + 0.02 * i)
    A.add(A.noise(0.25, 10, 5), te, gain=0.3)
    A.kick(te, 0.45)
