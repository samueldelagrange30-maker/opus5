#!/usr/bin/env python3
"""Montage final : fondus enchaînés entre les six plans, titres, bande-son.
Usage : assemble.py <dossier_clips> <sortie.mp4> [crf]"""
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

CLIPS, OUT = sys.argv[1], sys.argv[2]
CRF = sys.argv[3] if len(sys.argv) > 3 else "20"
W, H, FPS = 1920, 1080, 24
LEN, XF = 9.0, 1.0
SCENES = [
    ("unkai", "Mer de nuages", "Alpes japonaises · lever du soleil", "雲海"),
    ("fuji", "Mont Fuji", "Lac Kawaguchi · matin de printemps", "富士山"),
    ("bamboo", "Bambouseraie d'Arashiyama", "Kyoto", "竹林"),
    ("tanada", "Rizières en terrasses", "Campagne japonaise", "棚田"),
    ("torii", "Grand torii de Miyajima", "Mer intérieure · coucher du soleil", "厳島"),
    ("pagoda", "Pagode Chūreitō", "Mont Fuji · heure bleue", "忠霊塔"),
]
TOTAL = len(SCENES) * LEN - (len(SCENES) - 1) * XF
HERE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(CLIPS, "_montage")
os.makedirs(TMP, exist_ok=True)

LIGHT = "/usr/share/fonts/opentype/inter/InterDisplay-Light.otf"
THIN = "/usr/share/fonts/opentype/inter/InterDisplay-ExtraLight.otf"
JP = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def shadowed(draw_fn):
    """Texte blanc avec ombre portée douce pour rester lisible sur tous les plans."""
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(sh), (0, 0, 0, 150))
    sh = sh.filter(ImageFilter.GaussianBlur(9))
    fg = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(fg), (255, 255, 255, 240))
    return Image.alpha_composite(sh, fg)


def spaced(d, xy, text, f, fill, spacing):
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=f, fill=fill)
        x += d.textlength(ch, font=f) + spacing


def spaced_width(text, f, spacing):
    d = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    return sum(d.textlength(ch, font=f) + spacing for ch in text) - spacing


def opening():
    f1, f2, f3 = font(THIN, 150), font(LIGHT, 34), font(JP, 40)

    def draw(d, fill):
        w1 = spaced_width("JAPON", f1, 46)
        spaced(d, ((W - w1) / 2, 380), "JAPON", f1, fill, 46)
        w2 = spaced_width("PAYSAGES", f2, 22)
        spaced(d, ((W - w2) / 2, 585), "PAYSAGES", f2, fill, 22)
        w3 = spaced_width("日本の風景", f3, 16)
        spaced(d, ((W - w3) / 2, 660), "日本の風景", f3, fill, 16)
        d.line([(W / 2 - 60, 562), (W / 2 + 60, 562)], fill=fill, width=2)

    return shadowed(draw)


def caption(title, sub, kanji):
    f1, f2, f3 = font(LIGHT, 54), font(LIGHT, 28), font(JP, 34)

    def draw(d, fill):
        x, y = 110, 880
        d.line([(x, y - 2), (x, y + 104)], fill=fill, width=3)
        d.text((x + 28, y - 8), title, font=f1, fill=fill)
        tw = d.textlength(title, font=f1)
        d.text((x + 28 + tw + 26, y + 10), kanji, font=f3, fill=fill)
        spaced(d, (x + 30, y + 68), sub.upper(), f2, fill, 4)

    return shadowed(draw)


overlays = []  # (png, début, fin)
p = os.path.join(TMP, "title.png")
opening().save(p)
overlays.append((p, 0.9, 4.6))
for i, (name, title, sub, kanji) in enumerate(SCENES):
    p = os.path.join(TMP, f"cap_{name}.png")
    caption(title, sub, kanji).save(p)
    start = i * (LEN - XF)
    overlays.append((p, start + (5.4 if i == 0 else 1.7), start + (8.0 if i == 0 else 6.6)))

wav = os.path.join(TMP, "musique.wav")
subprocess.run([sys.executable, os.path.join(HERE, "make_audio.py"), wav, str(TOTAL)], check=True)

cmd = ["ffmpeg", "-y", "-loglevel", "error"]
for name, *_ in SCENES:
    cmd += ["-i", os.path.join(CLIPS, name + ".mp4")]
for png, *_ in overlays:
    cmd += ["-loop", "1", "-framerate", str(FPS), "-t", f"{TOTAL}", "-i", png]
cmd += ["-i", wav]

fc = []
prev = "0:v"
for i in range(1, len(SCENES)):
    out = f"x{i}"
    fc.append(f"[{prev}][{i}:v]xfade=transition=fade:duration={XF}:offset={i * (LEN - XF)}[{out}]")
    prev = out
for k, (png, a, b) in enumerate(overlays):
    idx = len(SCENES) + k
    fc.append(f"[{idx}:v]format=rgba,fade=t=in:st={a}:d=0.9:alpha=1,fade=t=out:st={b - 0.9}:d=0.9:alpha=1[o{k}]")
    out = f"v{k}"
    fc.append(f"[{prev}][o{k}]overlay=0:0:enable='between(t,{a},{b})'[{out}]")
    prev = out
fc.append(f"[{prev}]fade=t=in:st=0:d=1.2,fade=t=out:st={TOTAL - 1.6}:d=1.6,format=yuv420p[vout]")
cmd += ["-filter_complex", ";".join(fc), "-map", "[vout]", "-map", f"{len(SCENES) + len(overlays)}:a",
        "-c:v", "libx264", "-preset", "slow", "-crf", CRF, "-profile:v", "high", "-r", str(FPS),
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", f"{TOTAL}", OUT]
subprocess.run(cmd, check=True)
print("vidéo :", OUT)
