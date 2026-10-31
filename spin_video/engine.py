#!/usr/bin/env python3
"""Moteur commun des vidéos « ..., but it's math » (1080x1920, 30 fps, 68 s, 160 BPM).
Un jeu fournit : textes, manches, init(G), draw_center(L, d, t, st), audio_round(A, k, rd, t0)."""
import math, os, sys, subprocess, wave
from multiprocessing import Pool
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import render as R
from render import (FPS, W, H, SS, K, INTRO, SPIN_LEN, NSPIN, DURATION, NFRAMES, T_BET, T_LAND,
                    BEAT, P, font, text, rrect, pill, formula, check, cross, smooth, fy,
                    pre_curve, post_curve, draw_curve, glow_dot, make_banner, make_bg,
                    RED, BLUE, GOLD, YEL, CYAN, WHITE, GREEN, ORANGE, LAV, GX0, GX1, GDROP, GAXIS)

G = R.G
GAME = None

def Fr(a, b):
    return ("f", str(a), str(b))

def spin_start(k):
    return INTRO + k * SPIN_LEN

def state(t):
    st = dict(phase="intro", k=-1, u=0.0, v=0.0)
    if t >= INTRO + NSPIN * SPIN_LEN:
        st.update(phase="outro", v=t - (INTRO + NSPIN * SPIN_LEN), k=NSPIN - 1)
    elif t >= INTRO:
        k = int((t - INTRO) // SPIN_LEN)
        lt = t - spin_start(k)
        st["k"] = k
        if lt < T_BET:
            st.update(phase="bet", v=lt)
        elif lt < T_LAND:
            st.update(phase="spin", u=(lt - T_BET) / (T_LAND - T_BET), v=lt)
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
        import importlib
        GAME = importlib.import_module(game_mod)
        finalize(GAME)
    G["banner"] = make_banner(GAME.TITLE)
    G["bg_n"] = make_bg((22, 38, 30))
    G["bg_w"] = make_bg((20, 38, 78))
    G["bg_l"] = make_bg((84, 16, 22))
    rng = np.random.default_rng(GAME.SEED)
    G["noise"] = [np.cumsum(rng.normal(0, 1, 400)) for _ in range(NSPIN + 1)]
    GAME.init(G)

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

    tw = tl = 0.0
    if ph == "reveal":
        a = min(1.0, st["v"] / 0.25) * (1 - 0.35 * smooth((st["v"] - 1.2) / 1.3))
        tw, tl = (a, 0.0) if s["win"] else (0.0, a)
    elif ph == "bet" and k > 0:
        a = 0.65 * (1 - smooth(st["v"] / T_BET))
        tw, tl = (a, 0) if g.ROUNDS[k - 1]["win"] else (0, a)
    elif ph == "outro":
        tw = 0.5 * smooth(st["v"] / 1.0)
    bg = G["bg_n"] * (1 - tw - tl) + G["bg_w"] * tw + G["bg_l"] * tl
    base = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8), "RGB").convert("RGBA")

    L = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(L)

    b = G["banner"]
    L.alpha_composite(b, (int(P(288) - b.width / 2), int(P(189) - b.height / 2)))
    if ph == "reveal" and st["v"] > 0.15:
        pill(d, 288, 233, s["pill"], font("xb", 11.5), RED, WHITE, padx=8, h=19, r=3)
    elif ph == "outro":
        pill(d, 288, 233, "COMMENT YOUR SCORE /8", font("xb", 12), RED, WHITE, padx=8, h=20, r=3)
    else:
        pill(d, 288, 236, g.SUBTITLE, font("bold", 15.5), WHITE, (10, 10, 10), padx=9, h=27, r=3)

    rrect(d, (180, 253, 395, 465), 6, fill=(24, 36, 31, 235), outline=(62, 80, 72), w=1)
    st["ring"] = None
    if ph == "reveal":
        st["ring"] = BLUE if s["win"] else RED
    elif ph == "outro":
        st["ring"] = GOLD
    g.draw_center(L, d, t, st)

    # statut
    if ph == "intro":
        pill_txt, pc = g.INTRO["status"], (50, 58, 56)
    elif ph in ("bet", "spin"):
        pill_txt, pc = f"#{k + 1}/8  {s['name']} : {g.QUESTION}", (50, 58, 56)
    elif ph == "reveal":
        pill_txt, pc = (f"#{k + 1}/8  WIN +{s['delta']}", BLUE) if s["win"] else \
            (f"#{k + 1}/8  LOST −{-s['delta']}", RED)
    else:
        pill_txt, pc = "SESSION OVER", GOLD
    fpill = font("xb", 12.5)
    half = max(87, d.textlength(pill_txt, font=fpill) / K / 2 + 12)
    rrect(d, (288 - half, 469, 288 + half, 497), 5, fill=pc)
    text(d, (288, 483.5), pill_txt, fpill, WHITE)
    rrect(d, (205, 502, 371, 505), 1.5, fill=(48, 56, 54))
    if ph == "spin":
        rrect(d, (205, 502, 205 + 166 * st["u"], 505), 1.5, fill=ORANGE)

    # colonne gauche
    lab = font("bold", 10)
    text(d, (95, 282), "LIVES", lab, (225, 230, 228))
    bw, gap = (15, 3) if g.LIVES0 <= 5 else (12, 2.6)
    tot = g.LIVES0 * bw + (g.LIVES0 - 1) * gap
    for i in range(g.LIVES0):
        x0 = 95 - tot / 2 + i * (bw + gap)
        flash = ph == "reveal" and not s["win"] and i == lives and st["v"] < 0.8 and int(st["v"] * 10) % 2 == 0
        col = GREEN if i < lives else (RED if flash else (44, 54, 50))
        rrect(d, (x0, 296, x0 + bw, 305), 2, fill=col)
    text(d, (95, 328), g.BANK_LABEL, lab, (225, 230, 228))
    rrect(d, (63, 340, 127, 372), 4, fill=(12, 6, 8), outline=(70, 30, 34), w=1)
    disp = g.BANK[done]
    if ph == "reveal":
        disp = round(g.BANK[k] + (g.BANK[k + 1] - g.BANK[k]) * smooth(st["v"] / 0.6))
    fm = font("mono", 23)
    text(d, (95, 357), "888", fm, (52, 14, 16))
    text(d, (95, 357), f"{disp:>3d}", fm, (255, 52, 58))
    text(d, (95, 391), g.COUNT_LABEL, lab, (225, 230, 228))
    for i in range(8):
        x0 = 61 + (i % 4) * 17.5
        y0 = 402 + (i // 4) * 17.5
        box = (x0, y0, x0 + 13, y0 + 13)
        if i < done:
            win = g.ROUNDS[i]["win"]
            rrect(d, box, 2, fill=BLUE if win else RED)
            (check if win else cross)(d, x0 + 6.5, y0 + 6.5, 10, WHITE)
        elif i == k and ph in ("bet", "spin"):
            rrect(d, box, 2, fill=(30, 36, 34), outline=ORANGE, w=1.2)
        else:
            rrect(d, box, 2, fill=(30, 36, 34), outline=(64, 72, 70), w=1)

    # colonne droite
    if ph == "intro":
        I = g.INTRO
        big, l1, l2, sm, bc = I["big"], I["l1"], I["l2"], I["sm"], ORANGE
    elif ph == "outro":
        big, l1, l2, sm, bc = f"{g.WINS}/8", "YOUR", "SCORE", f"{g.BANK_LABEL.lower()} 100 → {g.BANK[-1]}", YEL
    else:
        pct = float(s["stat"].split()[0])
        big, l1, l2, sm = s["stat"], s.get("l1", "CHANCE OF"), s.get("l2", s["name"]), s["sub"]
        bc = LAV if pct > 40 else ORANGE
        if ph == "bet":
            tt = smooth(st["v"] / 0.55)
            dec = 2 if pct < 0.1 else 1
            big = f"{pct * tt:.{dec}f} %"
    text(d, (482, 313), big, font("xb", 27), bc)
    text(d, (482, 345), l1, font("bold", 10.5), WHITE)
    text(d, (482, 359), l2, font("bold", 10.5), WHITE)
    text(d, (482, 385), sm, font("med", 8), (150, 160, 156))

    # graphe
    grid = (34, 46, 42, 255)
    for gx in np.arange(GX0, GX1 + 1, 22):
        d.line([P(gx), P(520), P(gx), P(665)], fill=grid, width=int(P(0.5)))
    for gy in np.arange(522, 666, 22):
        d.line([P(GX0 - 10), P(gy), P(GX1 + 10), P(gy)], fill=grid, width=int(P(0.5)))
    for i, lbl in enumerate(["F1", "F2", "F3", "F4", "F5"]):
        text(d, (40, fy(i + 1)), lbl, font("bold", 8), (130, 140, 136))
    axc = (175, 185, 190)
    d.line([P(GX0), P(GAXIS), P(GX1), P(GAXIS)], fill=axc, width=int(P(1)))
    d.polygon([(P(GX1 + 1), P(GAXIS)), (P(GX1 - 7), P(GAXIS - 4)), (P(GX1 - 7), P(GAXIS + 4))], fill=axc)
    d.line([P(GDROP), P(665), P(GDROP), P(522)], fill=axc, width=int(P(1)))
    d.polygon([(P(GDROP), P(518)), (P(GDROP - 4), P(526)), (P(GDROP + 4), P(526))], fill=axc)
    text(d, (GDROP, 512), g.AXIS_LABEL, font("bold", 7.5), (140, 150, 146))
    for tx in np.arange(70, 515, 6.3):
        d.line([P(tx), P(660), P(tx), P(665)], fill=(90, 100, 96), width=int(P(0.7)))
    if ph == "intro":
        glow_dot(L, 65, fy(3.2) + math.sin(t * 4) * 2, YEL)
    elif ph == "bet":
        glow_dot(L, 65, fy(3.55), YEL)
    elif ph == "spin":
        pts = pre_curve(k, st["u"])
        draw_curve(d, pts, YEL)
        glow_dot(L, pts[-1][0], pts[-1][1], YEL)
    elif ph == "reveal":
        col = CYAN if s["win"] else RED
        pts = pre_curve(k, 1.0)
        draw_curve(d, pts, col)
        post = post_curve(k, s["win"], smooth(st["v"] / 0.7))
        draw_curve(d, post, col, 2.2)
        glow_dot(L, post[-1][0], post[-1][1], col)
        if st["v"] > 0.5:
            a = int(255 * smooth((st["v"] - 0.5) / 0.3))
            sc = 1 + 0.25 * (1 - smooth((st["v"] - 0.5) / 0.25))
            if s["win"]:
                d.line([P(292), P(GAXIS - 4), P(292), P(fy(3.9))], fill=CYAN + (a,), width=int(P(1)))
                text(d, (300, fy(3.5)), "+24  (s = +2)", font("semi", 8), CYAN + (a,), "lm")
                text(d, (430, 556), f"+{s['delta']}", font("black", 31 * sc), CYAN + (a,))
            else:
                text(d, (300, fy(2.25)), "−36  (s = −3)", font("semi", 8), (255, 120, 120, a), "lm")
                text(d, (420, 556), s.get("big", "LOST"), font("black", 31 * sc), RED + (a,))
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
        glow_dot(L, pts[-1][0], pts[-1][1], YEL)

    # formules
    if ph == "intro":
        f1, f2, f3, tag = g.INTRO["f1"], g.INTRO["f2"], None, g.INTRO["tag"]
    elif ph == "outro":
        bits = "".join("1" if x["win"] else "0" for x in g.ROUNDS)
        f1 = [("r", f"{bits} = {g.OUTRO_WORD}")]
        f2, f3 = g.OUTRO["f2"], g.OUTRO["f3"]
        tag = "comment your score /8"
    else:
        f1, f2, tag = s["f1"], s["f2"], s["tag"]
        if ph == "reveal" and st["v"] > 0.3:
            if s["win"]:
                f3 = [("i", "s"), ("r", " = +2 :  4"), ("i", "f"), ("r", "  WIN (glass bell)")]
            else:
                f3 = [("i", "s"), ("r", " = −3 :  "), ("i", "f"), ("r", "/8  LOST (sub saw)")]
        else:
            f3 = [("i", "f"), ("sub", "out"), ("r", " = "), ("i", "f"), ("r", "·2"), ("sup", "s"),
                  ("r", ",   "), ("i", "s"), ("r", " = ?")]
    formula(L, 288, 706, f1, 19, (245, 245, 245))
    formula(L, 288, 744, f2, 12.5, (205, 210, 208))
    if f3:
        formula(L, 288, 771, f3, 12.5, (205, 210, 208))
    pill(d, 288, 808, tag, font("bold", 14), YEL, (12, 12, 12), padx=8, h=24, r=3)

    if t < 0.4:
        L.alpha_composite(Image.new("RGBA", L.size, (0, 0, 0, int(255 * (1 - t / 0.4)))))
    base.alpha_composite(L.reduce(SS))
    return base.convert("RGB").tobytes()

# ---------------------------------------------------------------- audio
SR = 44100
class Audio:
    def __init__(self, seed):
        self.n = int(DURATION * SR) + SR
        self.out = np.zeros((self.n, 2), np.float32)
        self.rng = np.random.default_rng(seed)
    def add(self, sig, t0, pan=0.0, gain=1.0):
        i0 = int(t0 * SR); i1 = min(self.n, i0 + len(sig))
        if i1 <= i0 or i0 < 0:
            return
        x = sig[: i1 - i0] * gain
        self.out[i0:i1, 0] += x * (1 - max(0, pan)); self.out[i0:i1, 1] += x * (1 + min(0, pan))
    def tone(self, f, dur, decay=6.0, harm=(1.0,), att=0.004):
        tt = np.arange(int(dur * SR)) / SR
        sig = sum(a * np.sin(2 * np.pi * f * (i + 1) * tt) for i, a in enumerate(harm))
        return (sig * np.exp(-tt * decay) * np.minimum(1, tt / att)).astype(np.float32)
    def bell(self, f, dur=2.2):
        tt = np.arange(int(dur * SR)) / SR
        sig = sum(a * np.sin(2 * np.pi * f * m * tt) * np.exp(-tt * dc)
                  for m, a, dc in [(1, 1.0, 2.2), (2.76, .5, 3.5), (5.4, .28, 5), (8.93, .15, 7)])
        return (sig * np.minimum(1, tt / 0.002)).astype(np.float32)
    def saw_drop(self, f0, f1, dur):
        tt = np.arange(int(dur * SR)) / SR
        ph = np.cumsum(f0 * (f1 / f0) ** (tt / dur)) / SR
        sig = np.convolve(2 * (ph % 1) - 1, np.ones(12) / 12, mode="same")
        return (sig * np.minimum(1, tt / 0.01) * np.exp(-tt * 1.6)).astype(np.float32)
    def noise(self, dur, dec, smoothn=1):
        tt = np.arange(int(dur * SR)) / SR
        z = self.rng.normal(0, 1, len(tt))
        z = np.convolve(z, np.ones(smoothn) / smoothn, mode="same") if smoothn > 1 else np.diff(z, prepend=0)
        return (z * np.exp(-tt * dec)).astype(np.float32)
    def kick(self, t0, g=0.5):
        tt = np.arange(int(0.35 * SR)) / SR
        f = 45 + 90 * np.exp(-tt * 30)
        self.add((np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9)).astype(np.float32), t0, gain=g)

PENTA = [220.0, 261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0, 880.0]

def synth_audio(path):
    g = GAME
    A = Audio(g.SEED)
    tt = np.arange(A.n) / SR
    pad = (0.5 * np.sin(2 * np.pi * 110 * tt) + 0.3 * np.sin(2 * np.pi * 164.8 * tt + 1)
           + 0.2 * np.sin(2 * np.pi * 220.5 * tt)) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.42 * tt))
    A.out[:, 0] += pad * 0.035; A.out[:, 1] += pad * 0.035
    tb, j = 0.0, 0
    while tb < DURATION - 1.0:
        A.kick(tb, 0.32)
        A.add(A.noise(0.05, 90), tb + BEAT / 2, pan=0.25, gain=0.10)
        if j % 2 == 1:
            A.add(A.noise(0.18, 22) + A.tone(190, 0.18, 30) * 0.6, tb, gain=0.16)
        tb += BEAT; j += 1
    for i, f in enumerate([440, 523.3, 659.3, 880]):
        A.add(A.tone(f, 0.6, 7, (1, .3, .1)), 0.25 + i * BEAT / 4, pan=(i - 1.5) * 0.3, gain=0.22)
    A.add(A.bell(1760), 1.0, gain=0.10)
    for k, rd in enumerate(g.ROUNDS):
        st0 = spin_start(k)
        ts = st0 + T_BET
        tn = ts
        while tn < st0 + T_LAND - 0.15:                      # notes qui suivent le tracé
            q = R.G_noise_level(k, (tn - ts) / (T_LAND - T_BET))
            A.add(A.tone(PENTA[int(np.clip(q, 0, 10))], 0.18, 22, (1, .25, .08)), tn, gain=0.10)
            tn += BEAT / 2
        g.audio_round(A, k, rd, st0)
        te = st0 + T_LAND
        if rd["win"]:
            A.add(A.bell(1760), te + 0.05, gain=0.22)
            for j2, f in enumerate([880, 1108.7, 1318.5, 1760]):
                A.add(A.tone(f, 0.5, 8, (1, .2)), te + 0.04 + j2 * BEAT / 4, pan=(j2 - 1.5) * .35, gain=0.12)
        else:
            A.add(A.saw_drop(220, 41, 1.6), te + 0.02, gain=0.30)
            A.add(A.noise(0.5, 6, 30), te, gain=0.5)
    to = INTRO + NSPIN * SPIN_LEN
    for i, x in enumerate(g.ROUNDS):
        A.add(A.tone(880 if x["win"] else 330, 0.4, 9, (1, .3, .1)), to + 0.3 + i * BEAT / 2,
              pan=(i - 3.5) * 0.12, gain=0.18)
    for f in (440, 554.4, 659.3, 880):
        A.add(A.tone(f, 2.5, 1.4, (1, .3, .1), att=0.02), to + 1.75, gain=0.10)
    A.add(A.bell(1760, 3.0), to + 1.75, gain=0.15)
    out = A.out[: int(DURATION * SR)]
    fade = int(0.6 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    out /= np.max(np.abs(out)) / 0.89
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((out * 32767).astype(np.int16).tobytes())

def main():
    mod = sys.argv[1]
    init_worker(mod)
    out = sys.argv[2] if len(sys.argv) > 2 else GAME.OUT
    if len(sys.argv) > 3 and sys.argv[3] == "--preview":
        for tt in map(float, sys.argv[4:]):
            Image.frombytes("RGB", (W, H), render(int(tt * FPS))).save(f"/tmp/{mod}_{tt:05.1f}.png")
        return
    wav = f"/tmp/{mod}_audio.wav"
    synth_audio(wav)
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "18",
           "-pix_fmt", "yuv420p", "-af", R.AUDIO_FX, "-ar", "44100", "-c:a", "aac", "-b:a", "192k",
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
