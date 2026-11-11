#!/usr/bin/env python3
"""Bande-son synthétisée : koto (cordes pincées Karplus-Strong), nappe douce et réverbération.
Gamme miyako-bushi (ré, mi bémol, sol, la, si bémol). Usage : make_audio.py sortie.wav [durée_s]"""
import sys
import wave
import numpy as np

SR = 48000
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 49.0
N = int(SR * DUR)
rng = np.random.default_rng(7)

# ré mi♭ sol la si♭ sur trois octaves
BASE = [146.83, 155.56, 196.00, 220.00, 233.08]
SCALE = [f * m for m in (1, 2, 4) for f in BASE]


def pluck(freq, dur, bright=0.5):
    """Corde pincée (Karplus-Strong), calculée période par période."""
    n = int(SR * dur)
    period = int(round(SR / freq))
    buf = rng.uniform(-1, 1, period)
    # excitation adoucie : moyenne glissante selon la brillance
    k = max(1, int((1 - bright) * 6) + 1)
    buf = np.convolve(np.concatenate([buf[-k:], buf]), np.ones(k) / k, mode="valid")[:period]
    buf -= buf.mean()
    out = np.empty(n)
    decay = 0.9965 ** (220.0 / freq * 0.5 + 0.5)
    pos = 0
    while pos < n:
        m = min(period, n - pos)
        out[pos:pos + m] = buf[:m]
        buf = decay * 0.5 * (buf + np.roll(buf, 1))
        pos += m
    t = np.arange(n) / SR
    env = np.minimum(1, t / 0.004) * np.exp(-t * 0.35)
    return out * env


def place(mix, sig, t0, gain, pan):
    i = int(t0 * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    mix[0, i:i + len(sig)] += sig * gain * np.cos(pan * np.pi / 2)
    mix[1, i:i + len(sig)] += sig * gain * np.sin(pan * np.pi / 2)


dry = np.zeros((2, N))

# --- koto : une phrase par plan de 8 s, promenade aléatoire sur la gamme
t = 1.2
idx = 7
while t < DUR - 5:
    phrase_end = (int(t // 8) + 1) * 8 - 1.6
    while t < phrase_end:
        step = rng.choice([-2, -1, -1, 1, 1, 2, 3])
        idx = int(np.clip(idx + step, 3, len(SCALE) - 2))
        d = rng.choice([0.5, 0.75, 1.0, 1.0, 1.5])
        place(dry, pluck(SCALE[idx], 4.5, bright=rng.uniform(0.35, 0.7)), t, rng.uniform(0.55, 0.85), rng.uniform(0.35, 0.65))
        # appoggiature occasionnelle
        if rng.random() < 0.22:
            place(dry, pluck(SCALE[min(idx + 1, len(SCALE) - 1)], 3.0, 0.5), t + 0.16, 0.4, rng.uniform(0.3, 0.7))
        t += d
    # fin de phrase : retour vers ré ou la, puis respiration
    idx = int(rng.choice([5, 8, 10]))
    place(dry, pluck(SCALE[idx], 6.0, 0.45), t, 0.8, 0.5)
    t = phrase_end + 1.6 + 0.6
# basse pincée au début de chaque plan
for k in range(int(DUR // 8) + 1):
    place(dry, pluck(73.42 if k % 2 == 0 else 110.0, 7.0, 0.3), k * 8 + 0.4, 0.55, 0.5)

# --- nappe : bourdon ré/la, sinusoïdes légèrement désaccordées
tt = np.arange(N) / SR
pad = np.zeros((2, N))
for f, g in ((73.42, 0.5), (110.0, 0.35), (146.83, 0.3), (220.0, 0.16), (293.66, 0.10)):
    for det, ch in ((-0.25, 0), (0.25, 1)):
        lfo = 0.75 + 0.25 * np.sin(2 * np.pi * (0.05 + 0.013 * f / 100) * tt + f)
        pad[ch] += g * lfo * np.sin(2 * np.pi * (f + det) * tt + rng.uniform(0, 6.28))
pad *= 0.045

# --- souffle de vent : bruit filtré passe-bas, très discret
noise = rng.normal(0, 1, (2, N))
spec = np.fft.rfft(noise, axis=1)
fr = np.fft.rfftfreq(N, 1 / SR)
spec *= 1 / (1 + (fr / 500.0) ** 2) * (fr > 60)
wind = np.fft.irfft(spec, N, axis=1)
wind /= np.abs(wind).max()
wind *= 0.02 * (0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * tt))

# --- réverbération : convolution avec un bruit à décroissance exponentielle
L = int(SR * 3.2)
ti = np.arange(L) / SR
ir = rng.normal(0, 1, (2, L)) * np.exp(-ti * 2.3)
irs = np.fft.rfft(ir, axis=1)
irs *= 1 / (1 + (np.fft.rfftfreq(L, 1 / SR) / 3500.0) ** 2)
ir = np.fft.irfft(irs, L, axis=1)
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
M = 1 << int(np.ceil(np.log2(N + L)))
wet = np.fft.irfft(np.fft.rfft(dry, M, axis=1) * np.fft.rfft(ir, M, axis=1), M, axis=1)[:, :N]

mix = dry * 0.8 + wet * 0.38 + pad + wind
mix *= np.minimum(1, tt / 1.5) * np.minimum(1, (DUR - tt) / 3.0)
mix = np.tanh(mix / np.abs(mix).max() * 1.1) / np.tanh(1.1) * 0.7

pcm = (mix.T * 32767).astype("<i2")
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("audio", sys.argv[1], f"{DUR:.1f}s")
