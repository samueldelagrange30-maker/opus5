#!/usr/bin/env python3
"""Moteur v2 des vidéos « ..., but it's math » (1080x1920, 30 fps, 68 s, 160 BPM).
Nouveautés : accroche, décompte, glow, caméra, confettis, tampons, cœurs, série, vraie musique.
Un jeu fournit : textes, HOOK, ROUNDS, INTRO, OUTRO, init(G), draw_center(L, d, GL, t, st),
audio_round(A, k, rd, t0). Usage : python3 engine2.py game2_xxx [OUT.mp4] [--preview t ...]"""
import math, os, sys, subprocess, wave, importlib
from multiprocessing import Pool
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import render as R
from render import (FPS, W, H, SS, K, P, font, text, rrect, formula, check, cross, smooth, fy,
                    pre_curve, post_curve, draw_curve, make_banner, make_bg,
                    RED, BLUE, GOLD, YEL, CYAN, WHITE, GREEN, ORANGE, LAV, GX0, GX1, GDROP, GAXIS)

BPM = 160
BEAT = 60.0 / BPM
INTRO, SPIN_LEN, NSPIN, OUTRO = 3.0, 20 * BEAT, 8, 5.0
DURATION = INTRO + SPIN_LEN * NSPIN + OUTRO           # 68 s
NFRAMES = int(round(DURATION * FPS))
T_BET, T_LAND = 2 * BEAT, 14 * BEAT                    # 0.75 s, 5.25 s
G = R.G
GAME = None
EMOJI_PATH = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"
PINK = (255, 92, 170)

def Fr(a, b):
    return ("f", str(a), str(b))

def spin_start(k):
    return INTRO + k * SPIN_LEN

def GP(x):                      # coord. design -> calque glow (1/2 de la résolution finale)
    return x * K / 4

# ---------------------------------------------------------------- emojis
_emo = {}
def emoji(ch, size):
    """image RGBA d'un emoji, `size` en coord. design (hauteur)"""
    key = (ch, size)
    if key not in _emo:
        f = ImageFont.truetype(EMOJI_PATH, 109)
        im = Image.new("RGBA", (180, 160), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((10, 10), ch, font=f, embedded_color=True)
        im = im.crop(im.getbbox())
        h = max(2, int(P(size)))
        w = max(2, int(im.width * h / im.height))
        _emo[key] = im.resize((w, h), Image.LANCZOS)
    return _emo[key]

def paste_emoji(L, ch, x, y, size, scale=1.0, alpha=1.0, rot=0.0):
    im = emoji(ch, size)
    if scale != 1.0:
        im = im.resize((max(2, int(im.width * scale)), max(2, int(im.height * scale))), Image.BICUBIC)
    if rot:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    if alpha < 1.0:
        im = im.copy()
        im.putalpha(im.getchannel("A").point(lambda v: int(v * max(0.0, alpha))))
    L.alpha_composite(im, (int(P(x) - im.width / 2), int(P(y) - im.height / 2)))

# ---------------------------------------------------------------- glow helpers
def glow_circle(GL, x, y, r, col, a=200):
    ImageDraw.Draw(GL).ellipse([GP(x - r), GP(y - r), GP(x + r), GP(y + r)], fill=tuple(col[:3]) + (int(a),))

def glow_rrect(GL, box, r, col, a=200, w=None):
    d = ImageDraw.Draw(GL)
    bx = [GP(box[0]), GP(box[1]), GP(box[2]), GP(box[3])]
    if w:
        d.rounded_rectangle(bx, radius=GP(r), outline=tuple(col[:3]) + (int(a),), width=max(1, int(GP(w))))
    else:
        d.rounded_rectangle(bx, radius=GP(r), fill=tuple(col[:3]) + (int(a),))

def glow_text(GL, xy, s, size, col, a=220, name="black"):
    f = ImageFont.truetype({"black": R.FI + "Inter-Black.otf", "xb": R.FI + "Inter-ExtraBold.otf"}[name],
                           max(1, int(GP(size))))
    ImageDraw.Draw(GL).text((GP(xy[0]), GP(xy[1])), s, font=f, fill=tuple(col[:3]) + (int(a),), anchor="mm")

def glow_dot(L, GL, x, y, col, r=5.5):
    d = ImageDraw.Draw(L)
    glow_circle(GL, x, y, r * 2.4, col, 230)
    d.ellipse([P(x - r), P(y - r), P(x + r), P(y + r)], fill=col)
    d.ellipse([P(x - r * .45), P(y - r * .45), P(x + r * .45), P(y + r * .45)], fill=(255, 250, 225))

def pop(v, dur=0.25, over=0.12):
    """échelle d'apparition : 0 -> 1+over -> 1"""
    if v <= 0:
        return 0.0
    if v >= dur:
        return 1.0
    u = v / dur
    return (1 + over) * smooth(u / 0.65) if u < 0.65 else 1 + over * (1 - smooth((u - 0.65) / 0.35))

def spill(d, GL, cx, cy, s, f_size, bg, fg, padx=10, h=26, r=5, scale=1.0, name="xb", glow=False, alpha=255):
    """pastille avec échelle animée"""
    if scale <= 0.01:
        return
    f = font(name, f_size * scale)
    tw = d.textlength(s, font=f) / K
    hh = h * scale
    px = padx * scale
    box = (cx - tw / 2 - px, cy - hh / 2, cx + tw / 2 + px, cy + hh / 2)
    if glow:
        glow_rrect(GL, box, r * scale, bg, 170)
    rrect(d, box, r * scale, fill=tuple(bg[:3]) + (alpha,))
    text(d, (cx, cy + 0.5 * scale), s, f, tuple(fg[:3]) + (alpha,))

def stamp(L, s, cx, cy, size, col, v, rot=-8):
    """tampon géant : arrive en écrasant, reste, s'efface"""
    if v < 0 or v > 1.6:
        return
    sc = 1 + 1.3 * (1 - smooth(v / 0.16))
    a = 1.0 if v < 1.2 else 1 - smooth((v - 1.2) / 0.4)
    f = font("black", size * sc)
    tmp = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    bb = tmp.textbbox((0, 0), s, font=f, stroke_width=int(P(3 * sc)))
    w, h = bb[2] - bb[0] + int(P(20)), bb[3] - bb[1] + int(P(20))
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dd = ImageDraw.Draw(im)
    dd.text((w / 2, h / 2), s, font=f, fill=col + (255,), anchor="mm", stroke_width=int(P(3 * sc)),
            stroke_fill=(12, 12, 16, 255))
    im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    if a < 1:
        im.putalpha(im.getchannel("A").point(lambda q: int(q * a)))
    L.alpha_composite(im, (int(P(cx) - im.width / 2), int(P(cy) - im.height / 2)))

# ---------------------------------------------------------------- état
def state(t):
    st = dict(phase="intro", k=-1, u=0.0, v=0.0, lt=t)
    if t >= INTRO + NSPIN * SPIN_LEN:
        st.update(phase="outro", v=t - (INTRO + NSPIN * SPIN_LEN), k=NSPIN - 1)
    elif t >= INTRO:
        k = min(NSPIN - 1, int((t - INTRO) // SPIN_LEN))
        lt = t - spin_start(k)
        st["k"], st["lt"] = k, lt
        if lt < T_BET:
            st.update(phase="bet", v=lt)
        elif lt < T_LAND:
            st.update(phase="spin", u=(lt - T_BET) / (T_LAND - T_BET), v=lt - T_BET)
        else:
            st.update(phase="reveal", v=lt - T_LAND)
    return st

def finalize(game):
    bank = [100]
    for rd in game.ROUNDS:
        bank.append(bank[-1] + rd["delta"])
    game.BANK = bank
    game.WINS = sum(rd["win"] for rd in game.ROUNDS)

def init_worker(game_mod=None):
    global GAME
    if game_mod is not None:
        GAME = importlib.import_module(game_mod)
        finalize(GAME)
    G["banner"] = make_banner(GAME.TITLE)
    G["bg_n"] = make_bg((22, 34, 44))
    G["bg_w"] = make_bg((20, 40, 92))
    G["bg_l"] = make_bg((96, 14, 26))
    rng = np.random.default_rng(GAME.SEED)
    G["noise"] = [np.cumsum(rng.normal(0, 1, 400)) for _ in range(NSPIN + 1)]
    # particules de fond (bokeh)
    G["bokeh"] = [dict(x=rng.uniform(0, W), y=rng.uniform(0, H), sp=rng.uniform(12, 40),
                       r=rng.choice([18, 30, 46]), ph=rng.uniform(0, 6.28), a=rng.uniform(0.05, 0.16))
                  for _ in range(34)]
    spr = {}
    for r in (18, 30, 46):
        s = Image.new("L", (r * 4, r * 4), 0)
        ImageDraw.Draw(s).ellipse([r, r, 3 * r, 3 * r], fill=255)
        spr[r] = s.filter(ImageFilter.GaussianBlur(r * 0.45))
    G["bokeh_spr"] = spr
    # confettis (par manche)
    G["confetti"] = []
    for k in range(NSPIN + 1):
        rr = np.random.default_rng(900 + k)
        G["confetti"].append([dict(vx=rr.uniform(-260, 260), vy=rr.uniform(-430, -160), rot=rr.uniform(0, 360),
                                   vr=rr.uniform(-720, 720), w=rr.uniform(3, 6), h=rr.uniform(6, 11),
                                   c=[YEL, CYAN, PINK, (120, 255, 160), WHITE, ORANGE][int(rr.integers(0, 6))],
                                   t0=rr.uniform(0, 0.12)) for _ in range(90)])
    GAME.init(G)

# ---------------------------------------------------------------- rendu d'une image
def streak_at(done):
    n = 0
    for i in range(done - 1, -1, -1):
        if GAME.ROUNDS[i]["win"]:
            n += 1
        else:
            break
    return n

def draw_bokeh(base, t, tint):
    for p in G["bokeh"]:
        y = (p["y"] - p["sp"] * t) % (H + 200) - 100
        x = p["x"] + 30 * math.sin(t * 0.4 + p["ph"])
        spr = G["bokeh_spr"][p["r"]]
        a = p["a"] * (0.7 + 0.3 * math.sin(t * 1.3 + p["ph"]))
        col = Image.new("RGBA", spr.size, tint + (0,))
        col.putalpha(spr.point(lambda q: int(q * a)))
        base.alpha_composite(col, (int(x - spr.width / 2), int(y - spr.height / 2)))

def render(fi):
    g = GAME
    t = fi / FPS
    st = state(t)
    ph, k = st["phase"], st["k"]
    s = g.ROUNDS[k] if k >= 0 else None
    done = k if ph in ("bet", "spin") else (k + 1 if ph == "reveal" else (NSPIN if ph == "outro" else 0))
    st["done"] = done
    losses = sum(1 for i in range(done) if not g.ROUNDS[i]["win"])
    lives = g.LIVES0 - losses

    # ---- fond + bokeh
    tw = tl = 0.0
    if ph == "reveal":
        a = min(1.0, st["v"] / 0.2) * (1 - 0.35 * smooth((st["v"] - 1.2) / 1.0))
        tw, tl = (a, 0.0) if s["win"] else (0.0, a)
    elif ph == "bet" and k > 0:
        a = 0.65 * (1 - smooth(st["v"] / T_BET))
        tw, tl = (a, 0) if g.ROUNDS[k - 1]["win"] else (0, a)
    elif ph == "outro":
        tw = 0.55 * smooth(st["v"] / 1.0)
    bg = G["bg_n"] * (1 - tw - tl) + G["bg_w"] * tw + G["bg_l"] * tl
    if ph == "spin":        # le fond respire plus vite à l'approche du résultat
        bg = bg * (1 + 0.05 * st["u"] * (0.5 + 0.5 * math.sin(t * 2 * math.pi / BEAT)))
    base = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    tint = (120, 170, 255) if tw > tl else ((255, 90, 110) if tl > 0 else (150, 220, 200))
    draw_bokeh(base, t, tint)

    L = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    GL = Image.new("RGBA", (W // 2, H // 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(L)

    # ---- bannière (pulse sur le temps)
    b = G["banner"]
    beat_env = math.exp(-((t % BEAT) / BEAT) * 5) if t > 2.6 else 0.0
    bs = 1 + 0.018 * beat_env
    if bs != 1:
        b = b.resize((int(b.width * bs), int(b.height * bs)), Image.BICUBIC)
    glow_rrect(GL, (62, 160, 514, 218), 6, RED, 110)
    L.alpha_composite(b, (int(P(288) - b.width / 2), int(P(189) - b.height / 2)))
    if ph == "reveal" and st["v"] > 0.12:
        spill(d, GL, 288, 233, s["pill"], 11.5, RED, WHITE, padx=8, h=19, r=3, scale=pop(st["v"] - 0.12))
    elif ph == "outro":
        spill(d, GL, 288, 233, "COMMENT YOUR SCORE /8", 12, RED, WHITE, padx=8, h=20, r=3, scale=pop(st["v"]))
    else:
        spill(d, GL, 288, 236, g.SUBTITLE, 15.5, WHITE, (10, 10, 10), padx=9, h=27, r=3, name="bold")

    # ---- panneau central
    st["ring"] = None
    if ph == "reveal":
        st["ring"] = BLUE if s["win"] else RED
    elif ph == "outro":
        st["ring"] = GOLD
    pcol = (70, 92, 100)
    if ph == "spin":
        pulse = 0.5 + 0.5 * math.sin(t * 2 * math.pi / BEAT * 2)
        pcol = tuple(int(c1 + (c2 - c1) * pulse * st["u"]) for c1, c2 in zip((70, 92, 100), ORANGE))
        glow_rrect(GL, (180, 253, 395, 465), 6, ORANGE, int(90 * st["u"] * pulse), w=4)
    if st["ring"]:
        pcol = st["ring"]
        glow_rrect(GL, (180, 253, 395, 465), 6, st["ring"], 210, w=5)
    rrect(d, (180, 253, 395, 465), 6, fill=(18, 26, 32, 240), outline=pcol, w=1.4)
    g.draw_center(L, d, GL, t, st)

    # ---- statut (pop à chaque changement)
    if ph == "intro":
        pill_txt, pc, pv = g.INTRO["status"], (50, 58, 66), t - 2.2
    elif ph in ("bet", "spin"):
        pill_txt, pc, pv = f"#{k + 1}/8  {s['name']} : {g.QUESTION}", (50, 58, 66), st["lt"]
    elif ph == "reveal":
        pv = st["v"]
        if s["win"]:
            pill_txt, pc = f"#{k + 1}/8  WIN +{s['delta']}", BLUE
        else:
            pill_txt, pc = f"#{k + 1}/8  {s.get('lose_word', 'LOST')} −{-s['delta']}", RED
    else:
        pill_txt, pc, pv = "SESSION OVER", GOLD, st["v"]
    sc = pop(pv, 0.28, 0.14)
    fpill = font("xb", 12.5 * sc)
    half = max(87, d.textlength(pill_txt, font=fpill) / K / 2 + 12) * sc
    if sc > 0.01:
        box = (288 - half, 483 - 14 * sc, 288 + half, 483 + 14 * sc)
        if ph in ("reveal", "outro"):
            glow_rrect(GL, box, 5, pc, 130 if pc != GOLD else 70)
        rrect(d, box, 5 * sc, fill=pc)
        text(d, (288, 483.5), pill_txt, fpill, WHITE)
    rrect(d, (205, 502, 371, 505), 1.5, fill=(48, 56, 62))
    if ph == "spin":
        rrect(d, (205, 502, 205 + 166 * st["u"], 505), 1.5, fill=ORANGE)
        glow_rrect(GL, (205, 501, 205 + 166 * st["u"], 506), 2, ORANGE, 200)

    # ---- colonne gauche : cœurs, banque, manches, série
    lab = font("bold", 10)
    text(d, (95, 282), "LIVES", lab, (225, 230, 228))
    n = g.LIVES0
    step = min(15.5, 84 / n)
    for i in range(n):
        x = 95 - (n - 1) * step / 2 + i * step
        alive = i < lives
        breaking = ph == "reveal" and not s["win"] and i == lives and st["v"] < 0.7
        if breaking:
            v = st["v"]
            sc2 = 1 + 0.6 * math.sin(min(1, v / 0.35) * math.pi)
            paste_emoji(L, "❤️", x + 2 * math.sin(v * 60), 300, 11, scale=sc2, alpha=1 - smooth((v - 0.35) / 0.35))
            paste_emoji(L, "🖤", x, 300, 11, alpha=smooth((v - 0.35) / 0.35) * 0.55)
        elif alive:
            hb = 1 + 0.08 * beat_env if ph == "spin" else 1.0
            paste_emoji(L, "❤️", x, 300, 11, scale=hb)
        else:
            paste_emoji(L, "🖤", x, 300, 11, alpha=0.55)
    text(d, (95, 328), g.BANK_LABEL, lab, (225, 230, 228))
    rrect(d, (63, 340, 127, 372), 4, fill=(12, 6, 8), outline=(90, 34, 40), w=1)
    disp = g.BANK[done]
    if ph == "reveal":
        disp = round(g.BANK[k] + (g.BANK[k + 1] - g.BANK[k]) * smooth(st["v"] / 0.6))
    fm = font("mono", 23)
    text(d, (95, 357), "888", fm, (52, 14, 16))
    text(d, (95, 357), f"{disp:>3d}", fm, (255, 52, 58))
    glow_text(GL, (95, 357), f"{disp:>3d}", 23, (255, 40, 50), 110, "xb")
    if ph == "reveal" and 0.1 < st["v"] < 1.6 and s["delta"] != 0:
        v = st["v"] - 0.1
        a = int(255 * (1 - smooth((v - 1.0) / 0.5)))
        txt = f"+{s['delta']}" if s["delta"] > 0 else f"−{-s['delta']}"
        colr = (120, 255, 170) if s["delta"] > 0 else (255, 90, 100)
        text(d, (138, 352 - 26 * smooth(v / 1.2)), txt, font("black", 13), colr + (a,), "lm")
    text(d, (95, 391), g.COUNT_LABEL, lab, (225, 230, 228))
    for i in range(8):
        x0 = 61 + (i % 4) * 17.5
        y0 = 402 + (i // 4) * 17.5
        box = (x0, y0, x0 + 13, y0 + 13)
        if i < done:
            win = g.ROUNDS[i]["win"]
            just = ph == "reveal" and i == k
            sc3 = pop(st["v"], 0.3, 0.3) if just else 1.0
            cx_, cy_ = x0 + 6.5, y0 + 6.5
            bx = (cx_ - 6.5 * sc3, cy_ - 6.5 * sc3, cx_ + 6.5 * sc3, cy_ + 6.5 * sc3)
            rrect(d, bx, 2, fill=BLUE if win else RED)
            if just:
                glow_rrect(GL, bx, 2, BLUE if win else RED, 200)
            (check if win else cross)(d, cx_, cy_, 10 * sc3, WHITE)
        elif i == k and ph in ("bet", "spin"):
            rrect(d, box, 2, fill=(30, 36, 40), outline=ORANGE, w=1.2)
            glow_rrect(GL, box, 2, ORANGE, 120, w=2)
        else:
            rrect(d, box, 2, fill=(30, 36, 40), outline=(64, 72, 78), w=1)
    stk = streak_at(done)
    if stk >= 2 and ph != "intro":
        just = ph == "reveal" and s["win"]
        sc4 = pop(st["v"], 0.3, 0.25) if just else 1.0
        rrect(d, (66, 445, 124, 461), 8, fill=(60, 30, 10, 230), outline=ORANGE, w=1)
        paste_emoji(L, "🔥", 75, 452.5, 11, scale=sc4)
        text(d, (101, 453.5), f"STREAK ×{stk}", font("xb", 7.5), (255, 200, 120))
        glow_rrect(GL, (66, 445, 124, 461), 8, ORANGE, 90)

    # ---- colonne droite : probabilité + jauge
    if ph == "intro":
        I = g.INTRO
        big, l1, l2, sm, bc, pctv = I["big"], I["l1"], I["l2"], I["sm"], ORANGE, None
    elif ph == "outro":
        big, l1, l2, sm, bc, pctv = f"{g.WINS}/8", "SESSION", "SCORE", \
            f"{g.BANK_LABEL.lower()} 100 → {g.BANK[-1]}", YEL, None
    else:
        pct = float(s["stat"].split()[0].replace(",", ""))
        big, l1, l2, sm = s["stat"], s.get("l1", "CHANCE OF"), s.get("l2", s["name"]), s["sub"]
        bc = LAV if pct > 40 else ORANGE
        pctv = pct
        if ph == "bet":
            tt = smooth(st["v"] / 0.55)
            dec = 6 if pct < 0.001 else (3 if pct < 0.01 else (2 if pct < 0.1 else 1))
            big = f"{pct * tt:.{dec}f} %"
            pctv = pct * tt
    sc5 = pop(st["lt"] if ph == "bet" else 1.0, 0.3, 0.12)
    bfs = 27 * sc5 * min(1.0, 7.0 / max(1, len(big)))
    text(d, (482, 313), big, font("xb", bfs), bc)
    glow_text(GL, (482, 313), big, bfs, bc, 120, "xb")
    text(d, (482, 345), l1, font("bold", 10.5), WHITE)
    text(d, (482, 359), l2, font("bold", 10.5), WHITE)
    text(d, (482, 385), sm, font("med", 8), (150, 160, 166))
    if pctv is not None:
        rrect(d, (442, 396, 522, 401), 2.5, fill=(44, 52, 58))
        wbar = 80 * min(1.0, max(0.012, pctv / 100))
        rrect(d, (442, 396, 442 + wbar, 401), 2.5, fill=bc)
        glow_rrect(GL, (442, 396, 442 + wbar, 401), 2.5, bc, 160)

    # ---- graphe
    grid = (32, 44, 52, 255)
    for gx in np.arange(GX0, GX1 + 1, 22):
        d.line([P(gx), P(520), P(gx), P(665)], fill=grid, width=int(P(0.5)))
    for gy in np.arange(522, 666, 22):
        d.line([P(GX0 - 10), P(gy), P(GX1 + 10), P(gy)], fill=grid, width=int(P(0.5)))
    for i, lbl in enumerate(["F1", "F2", "F3", "F4", "F5"]):
        text(d, (40, fy(i + 1)), lbl, font("bold", 8), (130, 140, 146))
    axc = (175, 185, 195)
    d.line([P(GX0), P(GAXIS), P(GX1), P(GAXIS)], fill=axc, width=int(P(1)))
    d.polygon([(P(GX1 + 1), P(GAXIS)), (P(GX1 - 7), P(GAXIS - 4)), (P(GX1 - 7), P(GAXIS + 4))], fill=axc)
    d.line([P(GDROP), P(665), P(GDROP), P(522)], fill=axc, width=int(P(1)))
    d.polygon([(P(GDROP), P(518)), (P(GDROP - 4), P(526)), (P(GDROP + 4), P(526))], fill=axc)
    text(d, (GDROP, 512), g.AXIS_LABEL, font("bold", 7.5), (140, 150, 156))
    for tx in np.arange(70, 515, 6.3):
        d.line([P(tx), P(660), P(tx), P(665)], fill=(90, 100, 106), width=int(P(0.7)))
    if ph == "intro":
        glow_dot(L, GL, 65, fy(3.2) + math.sin(t * 4) * 2, YEL)
    elif ph == "bet":
        glow_dot(L, GL, 65, fy(3.55), YEL)
    elif ph == "spin":
        pts = pre_curve(k, st["u"])
        draw_curve(d, pts, YEL)
        ImageDraw.Draw(GL).line([(GP(x), GP(y)) for x, y in pts[-60:]], fill=YEL + (120,), width=3)
        glow_dot(L, GL, pts[-1][0], pts[-1][1], YEL)
        # décompte 3-2-1 + « lock in »
        lt = st["lt"]
        text(d, (440, 538), "LOCK IN YOUR GUESS", font("xb", 8.5),
             YEL + (int(160 + 95 * math.sin(t * 8)),))
        for j, num in enumerate(("3", "2", "1")):
            tb = T_LAND - (3 - j) * BEAT
            if tb <= lt < tb + BEAT:
                v = lt - tb
                scn = 1.6 - 0.6 * smooth(v / 0.12)
                a = int(255 * (1 - smooth((v - 0.2) / 0.17)))
                coln = [ORANGE, (255, 140, 60), RED][j]
                text(d, (440, 578), num, font("black", 34 * scn), coln + (a,))
                glow_text(GL, (440, 578), num, 34 * scn, coln, a)
    elif ph == "reveal":
        col = CYAN if s["win"] else RED
        pts = pre_curve(k, 1.0)
        draw_curve(d, pts, col)
        post = post_curve(k, s["win"], smooth(st["v"] / 0.7))
        draw_curve(d, post, col, 2.2)
        ImageDraw.Draw(GL).line([(GP(x), GP(y)) for x, y in post], fill=col + (150,), width=3)
        glow_dot(L, GL, post[-1][0], post[-1][1], col)
        if st["v"] > 0.5:
            a = int(255 * smooth((st["v"] - 0.5) / 0.3))
            if s["win"]:
                d.line([P(292), P(GAXIS - 4), P(292), P(fy(3.9))], fill=CYAN + (a,), width=int(P(1)))
                text(d, (300, fy(3.5)), "+24  (s = +2)", font("semi", 8), CYAN + (a,), "lm")
            else:
                text(d, (300, fy(2.25)), "−36  (s = −3)", font("semi", 8), (255, 120, 120, a), "lm")
    elif ph == "outro":
        v = smooth(st["v"] / 1.6)
        pts = []
        bank = g.BANK
        span = max(1, max(bank) - min(bank))
        for i in range(int(160 * v) + 2):
            w = i / 160
            j = w * NSPIN
            a = int(min(j, NSPIN - 1))
            bnk = bank[a] + (bank[a + 1] - bank[a]) * smooth((j - a) * 2)
            yy = fy(3.4) - (bnk - 100) * min(0.42, 40 / span) + G["noise"][0][i] * 0.5
            pts.append((GX0 + 30 + (GDROP - GX0 - 30) * w, yy))
        draw_curve(d, pts, YEL, 2.2)
        glow_dot(L, GL, pts[-1][0], pts[-1][1], YEL)
        # carte « combien en as-tu deviné ? »
        cv = st["v"] - 0.8
        if cv > 0:
            a = smooth(cv / 0.3)
            yoff = 14 * (1 - a)
            box = (300, 524 + yoff, 532, 664 + yoff)
            rrect(d, box, 7, fill=(14, 18, 24, int(240 * a)), outline=GOLD + (int(255 * a),), w=1.4)
            glow_rrect(GL, box, 7, GOLD, int(120 * a), w=4)
            text(d, (416, 541 + yoff), "HOW MANY DID YOU GUESS?", font("black", 9.5), (255, 255, 255, int(255 * a)))
            rows = [("8/8", "TOP 0.4 %", (255, 215, 80)), ("7/8", "TOP 3.5 %", (200, 220, 255)),
                    ("6/8", "TOP 14 %", (200, 220, 255)), ("5/8", "TOP 36 %", (170, 180, 190))]
            for i, (sc_, rk, cc) in enumerate(rows):
                ra = smooth((cv - 0.25 - i * 0.18) / 0.2) * a
                if ra <= 0:
                    continue
                yy = 563 + i * 19 + yoff
                rrect(d, (316, yy - 8, 516, yy + 8), 4, fill=(30, 36, 46, int(230 * ra)))
                text(d, (334, yy + 0.5), sc_, font("black", 10), cc + (int(255 * ra),))
                text(d, (500, yy + 0.5), rk, font("xb", 9), cc + (int(255 * ra),), "rm")
                if i == 0:
                    paste_emoji(L, "👑", 362, yy, 10, alpha=ra)
            text(d, (416, 654 + yoff), "if every call were a coin flip", font("med", 7), (150, 160, 170, int(255 * a)))

    # ---- formules (glissent à chaque manche)
    if ph == "intro":
        f1, f2, f3, tag = g.INTRO["f1"], g.INTRO["f2"], None, g.INTRO["tag"]
        fv = t - 2.2
    elif ph == "outro":
        bits = "".join("1" if x["win"] else "0" for x in g.ROUNDS)
        f1 = [("r", f"{bits} = {g.OUTRO_WORD}")]
        f2, f3 = g.OUTRO["f2"], g.OUTRO["f3"]
        tag, fv = "comment your score /8", st["v"]
    else:
        f1, f2, tag = s["f1"], s["f2"], s["tag"]
        fv = st["lt"]
        if ph == "reveal" and st["v"] > 0.3:
            if s["win"]:
                f3 = [("i", "s"), ("r", " = +2 :  4"), ("i", "f"), ("r", "  WIN (glass bell)")]
            else:
                f3 = [("i", "s"), ("r", " = −3 :  "), ("i", "f"), ("r", "/8  LOST (sub saw)")]
        else:
            f3 = [("i", "f"), ("sub", "out"), ("r", " = "), ("i", "f"), ("r", "·2"), ("sup", "s"),
                  ("r", ",   "), ("i", "s"), ("r", " = ?")]
    fa = smooth(fv / 0.35) if fv < 0.35 else 1.0
    if fa > 0:
        y0 = 682
        FL = Image.new("RGBA", (W * SS, int(P(108))), (0, 0, 0, 0))
        off = 10 * (1 - fa)
        formula(FL, 288, 706 - y0 + off, f1, 19, (245, 245, 245))
        formula(FL, 288, 744 - y0 + off, f2, 12.5, (205, 210, 214))
        if f3:
            formula(FL, 288, 771 - y0 + off * 1.4, f3, 12.5, (205, 210, 214))
        if fa < 1:
            FL.putalpha(FL.getchannel("A").point(lambda q: int(q * fa)))
        L.alpha_composite(FL, (0, int(P(y0))))
    spill(d, GL, 288, 808, tag, 14, YEL, (12, 12, 12), padx=8, h=24, r=3, name="bold",
          scale=pop(fv - 0.1, 0.3, 0.15), glow=True)

    # ---- tampon + confettis au résultat
    if ph == "reveal":
        v = st["v"]
        if s["win"]:
            stamp(L, s.get("stamp_win", f"WIN +{s['delta']}"), 288, 356, 34, CYAN, v - 0.05)
            for c in G["confetti"][k]:
                tt = v - c["t0"]
                if tt <= 0 or tt > 2.2:
                    continue
                x = 288 + c["vx"] * tt * 0.6
                y = 400 + c["vy"] * tt + 300 * tt * tt
                if y > 960:
                    continue
                ang = math.radians(c["rot"] + c["vr"] * tt)
                fl = abs(math.cos(tt * 7 + c["rot"]))
                hw, hh = c["w"] / 2 * (0.3 + 0.7 * fl), c["h"] / 2
                pts = [(x + dx * math.cos(ang) - dy * math.sin(ang), y + dx * math.sin(ang) + dy * math.cos(ang))
                       for dx, dy in ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh))]
                al = int(255 * (1 - smooth((tt - 1.6) / 0.6)))
                d.polygon([(P(px), P(py)) for px, py in pts], fill=c["c"] + (al,))
        else:
            stamp(L, s.get("stamp_lose", "LOST"), 288, 356, 38, RED, v - 0.05, rot=7)

    # ---- accroche (0 – 2.4 s)
    if t < 2.45:
        ov = 1.0 if t < 2.0 else 1 - smooth((t - 2.0) / 0.45)
        L.alpha_composite(Image.new("RGBA", L.size, (6, 8, 12, int(225 * ov))))
        lines = g.HOOK
        cols = [WHITE, YEL, RED]
        for i, ln in enumerate(lines):
            t0 = 0.12 + i * 0.5
            v = t - t0
            if v < 0:
                continue
            sc6 = 1 + 0.9 * (1 - smooth(v / 0.14))
            a = ov * min(1, v / 0.06)
            y = 500 + (i - 1) * 62
            size = 40 if i < 2 else 46
            if i == 2:
                fh = font("black", size * sc6)
                tw2 = d.textlength(ln, font=fh) / K
                rrect(d, (288 - tw2 / 2 - 14, y - 30 * sc6, 288 + tw2 / 2 + 14, y + 30 * sc6), 6,
                      fill=RED + (int(255 * a),))
                glow_rrect(GL, (288 - tw2 / 2 - 14, y - 30, 288 + tw2 / 2 + 14, y + 30), 6, RED, int(200 * a))
                text(d, (288, y + 1), ln, fh, (255, 255, 255, int(255 * a)))
            else:
                text(d, (288, y), ln, font("black", size * sc6), cols[i] + (int(255 * a),))
                glow_text(GL, (288, y), ln, size * sc6, cols[i], int(130 * a))
    if t < 0.12:
        L.alpha_composite(Image.new("RGBA", L.size, (0, 0, 0, int(255 * (1 - t / 0.12)))))

    # ---- composition + glow
    base.alpha_composite(L.reduce(SS))
    glow = GL.filter(ImageFilter.GaussianBlur(9)).resize((W, H), Image.BILINEAR)
    arr = np.asarray(base.convert("RGB")).astype(np.float32)
    ga = np.asarray(glow).astype(np.float32)
    arr += ga[..., :3] * (ga[..., 3:4] / 255.0) * 0.75
    # flash blanc au résultat
    if ph == "reveal" and st["v"] < 0.1:
        fl = 0.22 * (1 - st["v"] / 0.1)
        arr = arr * (1 - fl) + 255 * fl
    frame = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")

    # ---- caméra : zoom + secousse
    z, dx, dy = 1.0, 0.0, 0.0
    if ph == "reveal":
        v = st["v"]
        z = 1 + 0.045 * math.exp(-v * 5) * min(1, v / 0.05)
        amp = 9 * math.exp(-v * 9)
        dx, dy = amp * math.sin(v * 83), amp * math.cos(v * 71)
    elif ph == "spin":
        z = 1 + 0.025 * st["u"] ** 2            # lent zoom avant pendant le suspense
    elif ph == "outro":
        z = 1 + 0.03 * math.exp(-st["v"] * 4)
    elif t < 2.45:
        z = 1.0
    if z > 1.0005 or abs(dx) > 0.3:
        cw, ch = W / z, H / z
        cx0, cy0 = W / 2 + dx, H * 0.36 + dy
        box = (cx0 - cw / 2, cy0 - ch * 0.36, cx0 + cw / 2, cy0 + ch * 0.64)
        frame = frame.transform((W, H), Image.EXTENT, box, resample=Image.BILINEAR)
    return frame.tobytes()

# ---------------------------------------------------------------- audio
SR = 44100
def lowpass(x, n):
    n = max(1, int(n))
    if n == 1:
        return x
    return np.convolve(x, np.ones(n) / n, mode="same").astype(np.float32)

class Audio:
    def __init__(self, seed):
        self.n = int(DURATION * SR) + SR
        self.out = np.zeros((self.n, 2), np.float32)
        self.music = np.zeros((self.n, 2), np.float32)     # partie musicale (subit le sidechain)
        self.rng = np.random.default_rng(seed)
    def add(self, sig, t0, pan=0.0, gain=1.0, bus=None):
        buf = self.out if bus is None else bus
        i0 = int(t0 * SR); i1 = min(self.n, i0 + len(sig))
        if i1 <= i0 or i0 < 0:
            return
        x = sig[: i1 - i0] * gain
        buf[i0:i1, 0] += x * (1 - max(0, pan)); buf[i0:i1, 1] += x * (1 + min(0, pan))
    def tone(self, f, dur, decay=6.0, harm=(1.0,), att=0.004):
        tt = np.arange(int(dur * SR)) / SR
        sig = sum(a * np.sin(2 * np.pi * f * (i + 1) * tt) for i, a in enumerate(harm))
        return (sig * np.exp(-tt * decay) * np.minimum(1, tt / att)).astype(np.float32)
    def saw(self, f, dur, decay=3.0, att=0.01, lp=8):
        tt = np.arange(int(dur * SR)) / SR
        sig = 2 * ((f * tt) % 1) - 1
        sig = lowpass(sig, lp)
        return (sig * np.exp(-tt * decay) * np.minimum(1, tt / att)).astype(np.float32)
    def bell(self, f, dur=2.2):
        tt = np.arange(int(dur * SR)) / SR
        sig = sum(a * np.sin(2 * np.pi * f * m * tt) * np.exp(-tt * dc)
                  for m, a, dc in [(1, 1.0, 2.2), (2.76, .5, 3.5), (5.4, .28, 5), (8.93, .15, 7)])
        return (sig * np.minimum(1, tt / 0.002)).astype(np.float32)
    def saw_drop(self, f0, f1, dur):
        tt = np.arange(int(dur * SR)) / SR
        ph = np.cumsum(f0 * (f1 / f0) ** (tt / dur)) / SR
        sig = lowpass(2 * (ph % 1) - 1, 12)
        return (sig * np.minimum(1, tt / 0.01) * np.exp(-tt * 1.6)).astype(np.float32)
    def noise(self, dur, dec, smoothn=1):
        tt = np.arange(int(dur * SR)) / SR
        z = self.rng.normal(0, 1, len(tt)).astype(np.float32)
        z = lowpass(z, smoothn) if smoothn > 1 else np.diff(z, prepend=0)
        return (z * np.exp(-tt * dec)).astype(np.float32)
    def kick(self, t0, g=0.5):
        tt = np.arange(int(0.35 * SR)) / SR
        f = 45 + 110 * np.exp(-tt * 28)
        self.add((np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 8)).astype(np.float32), t0, gain=g)
    def boom(self, t0, g=0.6):
        tt = np.arange(int(1.2 * SR)) / SR
        f = 32 + 70 * np.exp(-tt * 9)
        sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 3.2)
        self.add(sig.astype(np.float32), t0, gain=g)
        self.add(self.noise(0.6, 7, 6), t0, gain=g * 0.5)
    def whoosh(self, t0, dur=0.4, g=0.25, up=True):
        nn = int(dur * SR)
        z = self.rng.normal(0, 1, nn).astype(np.float32)
        out = np.zeros(nn, np.float32)
        seg = nn // 12
        for i in range(12):
            w = (24 - 2 * i) if up else (2 + 2 * i)
            out[i * seg:(i + 1) * seg] = lowpass(z[i * seg:(i + 1) * seg], w)
        env = np.sin(np.linspace(0, np.pi, nn)) ** 2
        self.add(out * env, t0, gain=g)
    def riser(self, t0, dur, g=0.3):
        nn = int(dur * SR)
        z = self.rng.normal(0, 1, nn).astype(np.float32)
        out = np.zeros(nn, np.float32)
        seg = nn // 20
        for i in range(20):
            out[i * seg:(i + 1) * seg] = lowpass(z[i * seg:(i + 1) * seg], 40 - 1.9 * i)
        tt = np.arange(nn) / SR
        sweep = np.sin(2 * np.pi * np.cumsum(220 * 4 ** (tt / dur)) / SR) * 0.35
        env = (tt / dur) ** 2
        self.add((out + sweep) * env, t0, gain=g)

NOTE = lambda m: 440.0 * 2 ** ((m - 69) / 12)
CHORDS = [(57, 60, 64), (53, 57, 60), (48, 52, 55), (55, 59, 62)]      # Am F C G
PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81]                    # La mineur pentatonique

def music(A, t_start, t_end):
    """basse + nappe + rythmique, avec sidechain"""
    bar = 4 * BEAT
    nb = int((t_end - t_start) / bar + 0.999)
    for b in range(nb):
        tb = t_start + b * bar
        ch = CHORDS[b % 4]
        root = NOTE(ch[0] - 24)
        for e in range(8):                                   # basse en croches
            f = root * (2 if e in (3, 7) else 1)
            A.add(A.saw(f, BEAT / 2 * 0.95, 9, 0.004, 30) + A.tone(f, BEAT / 2 * 0.95, 7) * 0.8,
                  tb + e * BEAT / 2, gain=0.13, bus=A.music)
        for m in ch:                                         # nappe
            for det in (-0.12, 0.12):
                A.add(A.saw(NOTE(m) * 2 ** (det / 12), bar, 0.6, 0.25, 40), tb, pan=det * 4, gain=0.022,
                      bus=A.music)
    tb, j = t_start, 0
    while tb < t_end - 0.01:
        A.kick(tb, 0.42)
        A.add(A.noise(0.05, 90), tb + BEAT / 2, pan=0.25, gain=0.10)
        A.add(A.noise(0.03, 140), tb + BEAT / 4 * 3, pan=-0.25, gain=0.04)
        if j % 2 == 1:
            A.add(A.noise(0.2, 20, 2) + A.tone(200, 0.2, 30) * 0.5, tb, gain=0.17)
        tb += BEAT; j += 1

def sidechain(A):
    tt = np.arange(A.n) / SR
    ph = (tt % BEAT) / BEAT
    duck = 1 - 0.65 * np.exp(-ph * 9)
    A.music *= duck[:, None]

def synth_audio(path):
    g = GAME
    A = Audio(g.SEED)
    # accroche : trois impacts + montée
    for i in range(3):
        t0 = 0.12 + i * 0.5
        A.boom(t0, 0.55 if i < 2 else 0.75)
        A.add(A.noise(0.25, 14, 2), t0, gain=0.35)
        A.add(A.tone(NOTE(81 + [0, 3, 7][i]), 0.6, 6, (1, .4, .2)), t0, gain=0.12)
    A.riser(1.5, 1.5, 0.30)
    music(A, INTRO, INTRO + NSPIN * SPIN_LEN + 2 * 4 * BEAT)
    A.boom(INTRO, 0.6)
    for k, rd in enumerate(g.ROUNDS):
        st0 = spin_start(k)
        ts, te = st0 + T_BET, st0 + T_LAND
        A.whoosh(st0 - 0.1, 0.35, 0.22)
        tn, i = ts, 0
        while tn < te - 3 * BEAT - 0.05:                     # mélodie = tracé
            q = R.G_noise_level(k, (tn - ts) / (te - ts))
            m = PENTA[int(np.clip(q, 0, 10))] + 12
            A.add(A.tone(NOTE(m), 0.22, 16, (1, .35, .12)), tn, pan=0.3 * math.sin(i), gain=0.075)
            tn += BEAT / 2; i += 1
        A.riser(te - 1.6, 1.6, 0.22)
        for j in range(3):                                   # bips du décompte
            A.add(A.tone([880, 988, 1175][j], 0.12, 22, (1, .3)), te - (3 - j) * BEAT, gain=0.18)
        g.audio_round(A, k, rd, st0)
        A.boom(te, 0.65)
        if rd["win"]:
            A.add(A.bell(1760), te + 0.04, gain=0.2)
            for j2, m in enumerate([69, 73, 76, 81, 85]):
                A.add(A.tone(NOTE(m + 12), 0.5, 8, (1, .25)), te + 0.05 + j2 * BEAT / 4,
                      pan=(j2 - 2) * .3, gain=0.11)
            for c in range(14):
                A.add(A.bell(A.rng.uniform(2600, 4400), 0.4), te + 0.1 + A.rng.uniform(0, 1.0),
                      pan=A.rng.uniform(-0.8, 0.8), gain=0.035)
        else:
            A.add(A.saw_drop(220, 38, 1.6), te + 0.02, gain=0.28)
            A.add(A.tone(NOTE(45), 0.9, 3, (1, .5, .3)), te, gain=0.2)
    to = INTRO + NSPIN * SPIN_LEN
    for i, x in enumerate(g.ROUNDS):
        A.add(A.tone(NOTE(81 if x["win"] else 69), 0.4, 9, (1, .3, .1)), to + 0.3 + i * BEAT / 2,
              pan=(i - 3.5) * 0.12, gain=0.16)
    for m in (69, 73, 76, 81):
        A.add(A.tone(NOTE(m), 3.0, 1.2, (1, .3, .1), att=0.02), to + 3.0, gain=0.09)
    A.add(A.bell(1760, 3.0), to + 3.0, gain=0.14)
    sidechain(A)
    out = (A.out + A.music)[: int(DURATION * SR)]
    fade = int(0.8 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    out /= np.max(np.abs(out)) / 0.89
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((out * 32767).astype(np.int16).tobytes())

AUDIO_FX = "acompressor=threshold=-22dB:ratio=3.5:attack=5:release=120:makeup=3,loudnorm=I=-14:TP=-1.5:LRA=9"

def main():
    mod = sys.argv[1]
    init_worker(mod)
    out = sys.argv[2] if len(sys.argv) > 2 else GAME.OUT
    if len(sys.argv) > 3 and sys.argv[3] == "--preview":
        outdir = os.environ.get("PREVIEW_DIR", "/tmp")
        for tt in map(float, sys.argv[4:]):
            Image.frombytes("RGB", (W, H), render(int(tt * FPS))).save(f"{outdir}/{mod}_{tt:05.2f}.png")
        return
    wav = f"/tmp/{mod}_audio.wav"
    synth_audio(wav)
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "18",
           "-pix_fmt", "yuv420p", "-af", AUDIO_FX, "-ar", "44100", "-c:a", "aac", "-b:a", "192k",
           "-movflags", "+faststart", "-t", f"{DURATION:.3f}", out]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(os.cpu_count(), initializer=init_worker, initargs=(mod,)) as pool:
        for i, fr in enumerate(pool.imap(render, range(NFRAMES), chunksize=4)):
            ff.stdin.write(fr)
            if i % 500 == 0:
                print(f"{mod}: frame {i}/{NFRAMES}", flush=True)
    ff.stdin.close(); ff.wait()
    print("ok", out)

if __name__ == "__main__":
    main()
