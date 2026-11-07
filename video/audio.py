"""Procedural soundtrack: dark ambient + synthwave (140 BPM in the action
parts), 8-bit bleeps, glitches, impacts and short silences, all driven by
the shared timeline.  No voices."""
import numpy as np
from scipy import signal
from core import DURATION, BEAT, BAR, DROP, bar_t
from timeline import *

SR = 44100
N = int(DURATION * SR)
RNG = np.random.default_rng(7)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
        'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def nm(name):
    """'D3' -> midi number."""
    n = name[:-1]
    o = int(name[-1])
    return 12 * (o + 1) + NOTE[n]


def hz(name):
    return midi(nm(name))


# ------------------------------------------------------------------ buses
class Bus:
    def __init__(self):
        self.x = np.zeros((N, 2))

    def add(self, t, sig, gain=1.0, pan=0.0):
        if sig.ndim == 1:
            l = np.cos((pan + 1) * np.pi / 4)
            r = np.sin((pan + 1) * np.pi / 4)
            sig = np.stack([sig * l * 1.414, sig * r * 1.414], -1)
        i0 = int(round(t * SR))
        if i0 >= N:
            return
        if i0 < 0:
            sig = sig[-i0:]
            i0 = 0
        n = min(len(sig), N - i0)
        self.x[i0:i0 + n] += sig[:n] * gain


# ------------------------------------------------------------------ dsp
def tt(dur):
    return np.arange(int(dur * SR)) / SR


def env_exp(dur, tau, attack=0.002):
    t = tt(dur)
    e = np.exp(-t / tau)
    a = np.minimum(1, t / max(attack, 1e-4))
    return e * a


def adsr(dur, a, d, s, r):
    n = int(dur * SR)
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = int(r * SR)
    if rel > 0 and rel < n:
        e[-rel:] *= np.linspace(1, 0, rel) ** 2
    return e


def phase_of(freq, n):
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    return np.cumsum(f) / SR


def saw(freq, n):
    ph = phase_of(freq, n)
    return 2 * (ph % 1.0) - 1


def pulse(freq, n, duty=0.5):
    ph = phase_of(freq, n)
    return np.where((ph % 1.0) < duty, 1.0, -1.0)


def tri(freq, n):
    ph = phase_of(freq, n)
    return 2 * np.abs(2 * (ph % 1.0) - 1) - 1


def sine(freq, n, ph0=0.0):
    return np.sin(2 * np.pi * phase_of(freq, n) + ph0)


def noise(n):
    return RNG.standard_normal(n)


def lp(x, fc, order=2):
    fc = min(max(fc, 20), SR / 2 * 0.95)
    sos = signal.butter(order, fc, 'low', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def hp(x, fc, order=2):
    fc = min(max(fc, 20), SR / 2 * 0.95)
    sos = signal.butter(order, fc, 'high', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def bp(x, f1, f2, order=2):
    sos = signal.butter(order, [max(f1, 20), min(f2, SR / 2 * 0.95)], 'band', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def sweep(x, cut_fn, btype='low', block=256):
    """Time-varying 2-pole filter (block-wise coefficients, carried state)."""
    if x.ndim == 2:
        return np.stack([sweep(x[:, c], cut_fn, btype, block) for c in range(x.shape[1])], -1)
    out = np.zeros_like(x)
    zi = np.zeros((1, 2))
    for i in range(0, len(x), block):
        fc = float(cut_fn(i / SR))
        fc = min(max(fc, 25), SR / 2 * 0.9)
        sos = signal.butter(2, fc, btype, fs=SR, output='sos')
        y, zi = signal.sosfilt(sos, x[i:i + block], zi=zi)
        out[i:i + block] = y
    return out


def crush(x, bits=5, down=6):
    y = x[::down].repeat(down)[:len(x)]
    q = 2 ** bits
    return np.round(y * q) / q


def stereo_widen(x, ms=0.012):
    d = int(ms * SR)
    l = x
    r = np.concatenate([np.zeros(d), x[:-d]])
    return np.stack([l, r], -1)


# ------------------------------------------------------------------ instruments
def kick(vel=1.0, dur=0.45):
    t = tt(dur)
    f = 46 + 120 * np.exp(-t / 0.035)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.28)
    click = noise(len(t)) * np.exp(-t / 0.004) * 0.3
    s = np.tanh((s + click) * 1.6)
    return s * vel


def snare(vel=1.0, dur=0.3):
    t = tt(dur)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.06) * 0.6
    nz = bp(noise(len(t)), 1200, 8000) * np.exp(-t / 0.13)
    return np.tanh((tone + nz * 1.2) * 1.3) * vel


def clap(vel=1.0):
    t = tt(0.3)
    e = np.zeros(len(t))
    for k, d in enumerate((0.0, 0.011, 0.022)):
        e += np.exp(-np.maximum(t - d, 0) / (0.008 if k < 2 else 0.1)) * (t >= d)
    return bp(noise(len(t)), 900, 5000) * e * vel * 0.8


def hat(vel=1.0, open_=False):
    dur = 0.32 if open_ else 0.06
    t = tt(dur)
    s = hp(noise(len(t)), 7000) * np.exp(-t / (0.12 if open_ else 0.018))
    return s * vel


def bass_note(f, dur, cut=700, drive=1.5):
    n = int(dur * SR)
    s = saw(f, n) * 0.7 + pulse(f / 2, n, 0.5) * 0.35
    e = adsr(dur, 0.004, 0.12, 0.6, 0.03)
    fe = lambda tt_: cut * (0.6 + 1.6 * np.exp(-tt_ / 0.07))
    s = sweep(s, fe, 'low', 128)
    return np.tanh(s * drive) * e


def arp_note(f, dur, duty=0.25):
    n = int(dur * SR)
    s = pulse(f, n, duty)
    return s * adsr(dur, 0.002, 0.06, 0.3, 0.01) * 0.5


def pad_chord(freqs, dur, cut=1400, att=0.6, rel=0.8, voices=3, det=0.08):
    n = int(dur * SR)
    out = np.zeros((n, 2))
    for f in freqs:
        for v in range(voices):
            dt = (v - (voices - 1) / 2) * det
            fr = f * 2 ** (dt / 12)
            s = saw(fr * (1 + 0.002 * np.sin(2 * np.pi * 0.3 * np.arange(n) / SR + v)), n)
            pan = (v - (voices - 1) / 2) * 0.6
            out[:, 0] += s * np.cos((pan + 1) * np.pi / 4)
            out[:, 1] += s * np.sin((pan + 1) * np.pi / 4)
    out = lp(out, cut, 2)
    e = adsr(dur, att, 1.0, 1.0, rel)
    return out * e[:, None] / (len(freqs) * voices) * 1.6


def bip(f=1760, dur=0.07, duty=0.5):
    n = int(dur * SR)
    return pulse(f, n, duty) * adsr(dur, 0.001, 0.03, 0.5, 0.01)


def chime(base, dur=0.5):
    # quick 8-bit arpeggio up an octave
    out = np.zeros(int(dur * SR))
    for k, m in enumerate((0, 7, 12, 19)):
        s = bip(base * 2 ** (m / 12), 0.06, 0.25)
        i0 = int(k * 0.035 * SR)
        out[i0:i0 + len(s)] += s * (1 - k * 0.15)
    return out


def impact(dur=2.5, f0=80, f1=28, vel=1.0):
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t / 0.25)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.8)
    nz = lp(noise(len(t)), 2500) * np.exp(-t / 0.12) * 0.7
    return np.tanh((s + nz) * 1.8) * vel


def metal_hit(dur=3.0, f=110):
    t = tt(dur)
    out = np.zeros(len(t))
    for k, (m, a, tau) in enumerate(((1, 1, 1.4), (2.76, 0.6, 0.9), (5.4, 0.4, 0.6), (8.93, 0.25, 0.4), (13.3, 0.15, 0.3))):
        out += a * np.sin(2 * np.pi * f * m * t + k) * np.exp(-t / tau)
    return out * 0.5


def riser(dur, f0=200, f1=4000, tone=True):
    n = int(dur * SR)
    t = np.arange(n) / SR
    k = t / dur
    nz = noise(n)
    s = sweep(nz, lambda x: f0 * (f1 / f0) ** (x / dur), 'low', 256) * (k ** 2) * 0.8
    if tone:
        fr = 110 * 2 ** (3 * k ** 1.5)
        s += saw(fr, n) * 0.12 * k ** 2
        s += saw(fr * 1.5, n) * 0.06 * k ** 2
    return s


def whoosh(dur, f0=300, f1=6000, rev=False):
    n = int(dur * SR)
    t = np.arange(n) / SR
    k = t / dur
    s = sweep(noise(n), lambda x: f0 * (f1 / f0) ** (x / dur), 'band' if False else 'low', 256)
    e = np.sin(np.pi * k) ** 1.5
    s = s * e
    return s[::-1] if rev else s


def glitch(dur=0.25, seed=0):
    r = np.random.default_rng(seed)
    n = int(dur * SR)
    out = np.zeros(n)
    i = 0
    while i < n:
        L = int(r.uniform(0.008, 0.04) * SR)
        kind = r.integers(0, 3)
        seg_t = np.arange(L) / SR
        if kind == 0:
            seg = pulse(r.uniform(200, 3000), L, r.choice([0.125, 0.25, 0.5]))
        elif kind == 1:
            seg = crush(noise(L) * 0.6, 3, int(r.integers(4, 20)))
        else:
            seg = np.zeros(L)
        out[i:i + L] = seg[:max(0, min(L, n - i))] * r.uniform(0.3, 1.0)
        i += L
    return out * 0.6


def tick(seed=0):
    r = np.random.default_rng(seed)
    return bip(r.choice([1320, 1480, 1760]), 0.018, 0.25) * 0.5


def thunder(dur=4.0):
    t = tt(dur)
    n = len(t)
    crack = hp(noise(n), 1500) * np.exp(-t / 0.05) * 1.2
    rum = lp(noise(n), 180, 4) * (np.exp(-t / 1.4) * (0.6 + 0.4 * np.sin(t * 9) ** 2)) * 5
    return crack + rum


def heartbeat(vel=1.0):
    a = kick(vel * 0.8, 0.3)
    a = lp(a, 400)
    b = lp(kick(vel * 0.55, 0.3), 300)
    out = np.zeros(int(0.5 * SR))
    out[:len(a)] += a
    i = int(0.15 * SR)
    out[i:i + len(b)] += b[:len(out) - i]
    return out


def bell(f, dur=4.0):
    t = tt(dur)
    mod = np.sin(2 * np.pi * f * 1.414 * t) * 2.5 * np.exp(-t / 1.0)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t / 1.6)


def reverb_ir(dur=2.8, seed=3):
    r = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    ir = r.standard_normal((n, 2)) * np.exp(-t / 0.55)[:, None]
    ir = lp(ir, 5000)
    ir[:int(0.012 * SR)] = 0
    return ir / np.sqrt((ir ** 2).sum(axis=0))


def delay(x, time, fb=0.35, taps=5, pingpong=True):
    out = x.copy()
    d = int(time * SR)
    for k in range(1, taps + 1):
        g = fb ** k
        sh = np.zeros_like(x)
        if d * k < len(x):
            sh[d * k:] = x[:len(x) - d * k]
        if pingpong and x.ndim == 2 and k % 2 == 1:
            sh = sh[:, ::-1]
        out += sh * g
    return out


# ------------------------------------------------------------------ composition
CH = {
    'Dm': ['D3', 'F3', 'A3', 'D4'], 'Bb': ['Bb2', 'D3', 'F3', 'Bb3'], 'Gm': ['G2', 'Bb2', 'D3', 'G3'],
    'A': ['A2', 'C#3', 'E3', 'A3'], 'Dm9': ['D3', 'F3', 'A3', 'E4'], 'Gm6': ['G2', 'Bb2', 'D3', 'E3'],
}
ROOT = {'Dm': 'D2', 'Bb': 'Bb1', 'Gm': 'G1', 'A': 'A1', 'Dm9': 'D2', 'Gm6': 'G1'}


def build():
    music = Bus()      # tonal music (sidechained)
    drums = Bus()
    sfx = Bus()
    amb = Bus()        # loop-continuous ambience (rain, drone)
    send = Bus()       # reverb send

    # ---------------------------------------------------------- loop ambience
    # generated on the loop clock so the tail flows into the start
    s0, s1 = -(DURATION - GLITCH_BACK), S1_END + 0.6
    nL = int((s1 - s0) * SR)
    ts = s0 + np.arange(nL) / SR
    rainS = bp(noise(nL), 900, 9000) * 0.11 + lp(noise(nL), 500) * 0.12
    drops = (RNG.random(nL) < 0.0009) * RNG.uniform(0.2, 1, nL)
    rainS += hp(np.convolve(drops, np.exp(-np.arange(200) / 25.0), 'same'), 2000) * 0.25
    rainS = stereo_widen(rainS, 0.017)
    drone = (sine(hz('D2'), nL) * 0.35 + sine(hz('A2'), nL) * 0.18 +
             lp(saw(hz('D2') * (1 + 0.003 * np.sin(2 * np.pi * 0.11 * ts)), nL), 300) * 0.25)
    drone *= 0.8 + 0.2 * np.sin(2 * np.pi * 0.17 * ts)
    pad_l = lp(saw(hz('F3') * 1.002, nL) + saw(hz('A3') * 0.998, nL) + saw(hz('D4'), nL), 600) * 0.06
    drone = stereo_widen(drone + pad_l, 0.009)
    loop_sig = rainS * 1.0 + drone * 0.55
    # place: s in [0, S1_END+0.6] at t = s ; s in [s0, 0) at t = s + DURATION
    k0 = int(-s0 * SR)
    head = loop_sig[k0:]
    tail = loop_sig[:k0]
    fade_head = np.ones(len(head))
    fhe = int(0.6 * SR)
    fade_head[-fhe:] = np.linspace(1, 0, fhe)
    amb.add(0.0, head * fade_head[:, None], 1.0)
    fade_tail = np.ones(len(tail))
    fti = int(0.25 * SR)
    fade_tail[:fti] = np.linspace(0, 1, fti)
    amb.add(GLITCH_BACK, tail * fade_tail[:, None], 1.0)
    # rain continues under scene 2 (world A) until the portal
    n2 = int((DOOR_OPEN + 2.8 - S1_END) * SR)
    r2 = stereo_widen(bp(noise(n2), 900, 9000) * 0.11 + lp(noise(n2), 500) * 0.12, 0.017)
    e2 = np.ones(n2)
    e2[:int(0.6 * SR)] = np.linspace(0, 1, int(0.6 * SR))
    e2[-int(2.6 * SR):] = np.linspace(1, 0, int(2.6 * SR)) ** 2
    amb.add(S1_END, r2 * e2[:, None], 1.0)

    # ---------------------------------------------------------- scene 1 hook
    sfx.add(0.25, impact(2.0, 70, 30, 0.55), 0.8)
    send.add(0.25, impact(2.0, 70, 30, 0.55), 0.3)
    for tb in bip_times():
        b = bip(1568, 0.09, 0.5) * 0.18
        sfx.add(tb, b, 1.0, pan=0.15)
        send.add(tb, b, 0.6)

    # ---------------------------------------------------------- typing ticks
    for (a, b, lines) in SUBS:
        txt = ''.join(lines)
        for i, ch in enumerate(txt):
            if ch != ' ' and i % 2 == 0:
                sfx.add(a + i / TYPE_CPS, tick(i), 0.22, pan=0.0)

    # ---------------------------------------------------------- scene 2
    th = thunder(4.5)
    sfx.add(S1_END, th, 0.6)
    send.add(S1_END, th, 0.4)
    sfx.add(S1_END, glitch(0.18, 11), 0.35)
    # door hum with breathing (period 2 beats)
    d0, d1 = S1_END, SIL_A[0]
    nd = int((d1 - d0) * SR)
    td = d0 + np.arange(nd) / SR
    breath = 0.5 + 0.5 * np.cos(2 * np.pi * (td - HEART0) / (2 * BEAT))
    hum = (sine(55, nd) * 0.5 + sine(110.5, nd) * 0.25 + lp(saw(55.3, nd), 400) * 0.25)
    shimmer = sine(880 * (1 + 0.004 * np.sin(2 * np.pi * 5 * td)), nd) * 0.03 + sine(1318, nd) * 0.015
    grow = np.clip((td - d0) / (d1 - d0), 0, 1)
    hum = (hum * (0.45 + 0.55 * breath) + shimmer * breath) * (0.5 + 0.5 * grow)
    hum[:int(0.15 * SR)] *= np.linspace(0, 1, int(0.15 * SR))
    music.add(d0, stereo_widen(hum, 0.006), 0.55)
    # heartbeat
    k = 0
    while HEART0 + k * BEAT < SIL_A[0] - 0.05:
        tb = HEART0 + k * BEAT
        v = 0.45 + 0.5 * (tb - HEART0) / (SIL_A[0] - HEART0)
        drums.add(tb, heartbeat(v), 0.75)
        k += 1
    # slow dark pads
    for (a, b, c) in ((S1_END + 0.3, 9.0, 'Dm9'), (9.0, 12.43, 'Bb'), (12.43, 14.6, 'Gm6'), (14.6, SIL_A[0], 'A')):
        pc = pad_chord([hz(x) for x in CH[c]], b - a + 0.8, cut=900, att=0.8, rel=0.9)
        music.add(a, pc, 0.5)
        music.add(a, bass_note(hz(ROOT[c]) / 2 * 2, b - a, cut=200, drive=1.0) * 0.5, 0.6)
    # strange detail stinger
    rs = whoosh(0.6, 300, 5000, rev=True)
    sfx.add(DETAIL[0] - 0.6, rs, 0.35)
    st_ = (sine(hz('Eb6'), int(0.9 * SR)) + sine(hz('D6') * 1.01, int(0.9 * SR)) + sine(hz('A6'), int(0.9 * SR))) * env_exp(0.9, 0.35) * 0.15
    sfx.add(DETAIL[0], st_, 1.0, pan=-0.3)
    send.add(DETAIL[0], st_, 0.8)
    sfx.add(DETAIL[0], glitch(0.4, 5), 0.45, pan=0.4)
    # riser to the silence
    rz = riser(SIL_A[0] - 13.5, 150, 6000)
    sfx.add(13.5, rz, 0.5)

    # ---------------------------------------------------------- scene 3: door opens
    sfx.add(DOOR_OPEN, impact(3.0, 95, 26, 1.0), 1.0)
    mh = metal_hit(3.5, 98)
    sfx.add(DOOR_OPEN, mh, 0.5)
    send.add(DOOR_OPEN, mh, 0.6)
    send.add(DOOR_OPEN, impact(3.0, 95, 26, 1.0), 0.3)
    sfx.add(DOOR_OPEN, whoosh(CROSS - DOOR_OPEN + 0.2, 200, 9000), 0.55)
    sfx.add(CROSS - 0.05, impact(1.2, 120, 40, 0.5), 0.6)
    sfx.add(CROSS - 0.05, glitch(0.12, 3), 0.3)
    # dead city ambience: wind + cold high drone
    w0 = CROSS - 0.4
    nw = int((SIL_B[0] - w0) * SR)
    tw = np.arange(nw) / SR
    wind = lp(noise(nw), 380, 2) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.13 * tw) ** 2) * 0.9
    wind += bp(noise(nw), 1500, 3000) * 0.04 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.21 * tw + 1))
    cold = (sine(hz('A5'), nw) * 0.03 + sine(hz('E6') * 1.003, nw) * 0.02) * np.clip(tw / 2.0, 0, 1)
    sig = stereo_widen(wind + cold, 0.02)
    sig[:int(0.5 * SR)] *= np.linspace(0, 1, int(0.5 * SR))[:, None]
    amb.add(w0, sig, 0.5)
    # lamps igniting: clunk + buzz + rising 8-bit chime
    scale = ['D5', 'E5', 'F5', 'G5', 'A5', 'Bb5', 'C6', 'D6']
    for i, tl in enumerate(LAMPS_ON):
        sfx.add(tl, lp(kick(0.55, 0.3), 900), 0.7)
        sfx.add(tl, hp(noise(int(0.02 * SR)), 3000) * env_exp(0.02, 0.005), 0.4)
        bz = lp(saw(100, int(0.35 * SR)), 1200) * env_exp(0.35, 0.12) * 0.25
        sfx.add(tl + 0.01, bz, 0.5, pan=0.3 * (1 if i % 2 else -1))
        c = chime(hz(scale[i]), 0.4)
        sfx.add(tl + 0.03, c, 0.22, pan=0.4 * (1 if i % 2 else -1))
        send.add(tl + 0.03, c, 0.5)
        # sub pulse
        music.add(tl, bass_note(hz('D2'), 2 * BEAT, cut=180, drive=1.2), 0.4 + 0.04 * i)
    # cold pad growing under the lamps
    pc = pad_chord([hz(x) for x in ['D3', 'A3', 'E4', 'F4']], REVEAL - LAMPS_ON[0] + 0.5, cut=1100, att=3.0, rel=0.5)
    music.add(LAMPS_ON[0], pc, 0.45)
    # reveal stab
    rc = whoosh(0.75, 400, 9000, rev=True)
    sfx.add(REVEAL - 0.75, rc, 0.45)
    stab = pad_chord([hz('D3'), hz('Eb3'), hz('A3'), hz('D4')], 1.6, cut=3500, att=0.003, rel=1.2, det=0.15)
    music.add(REVEAL, stab, 0.9)
    sfx.add(REVEAL, impact(2.5, 60, 25, 1.0), 0.9)
    send.add(REVEAL, stab, 0.6)
    # build-up
    chords_build = [('Dm', bar_t(-4)), ('Bb', bar_t(-3)), ('Gm', bar_t(-2)), ('A', bar_t(-1))]
    for c, a in chords_build:
        music.add(a, pad_chord([hz(x) for x in CH[c]], BAR + 0.3, cut=1300, att=0.3, rel=0.3), 0.45)
    t = bar_t(-3)
    while t < SIL_B[0] - 1e-6:
        c = 'Dm' if t < bar_t(-3) else ('Bb' if t < bar_t(-2) else ('Gm' if t < bar_t(-1) else 'A'))
        c = 'Bb' if bar_t(-3) <= t < bar_t(-2) else c
        music.add(t, bass_note(hz(ROOT[c]) * 2, BEAT / 2 * 0.9, cut=500), 0.35)
        t += BEAT / 2
    # build arp (opening filter)
    arp = Bus()
    t = bar_t(-2)
    i = 0
    while t < SIL_B[0] - 1e-6:
        c = 'Gm' if t < bar_t(-1) else 'A'
        notes = [nm(x) + 12 for x in CH[c][:3]]
        seq = notes + [notes[0] + 12, notes[2], notes[1]]
        f = midi(seq[i % len(seq)])
        arp.add(t, arp_note(f, BEAT / 4 * 0.9), 1.0)
        t += BEAT / 4
        i += 1
    a0, a1 = int(bar_t(-2) * SR), int(SIL_B[0] * SR)
    seg = arp.x[a0:a1]
    seg = sweep(seg, lambda x: 400 * (12000 / 400) ** (x / (SIL_B[0] - bar_t(-2))), 'low', 256)
    arp.x[a0:a1] = seg
    music.x += delay(arp.x, BEAT * 0.75, 0.3, 4) * 0.25
    sfx.add(30.5, riser(SIL_B[0] - 30.5, 200, 9000), 0.55)

    # ---------------------------------------------------------- scene 4: drop
    drop_chords = ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'Gm']
    sfx.add(DROP, impact(2.5, 100, 30, 1.0), 1.0)
    send.add(DROP, impact(2.5, 100, 30, 1.0), 0.4)
    arp = Bus()
    for b, c in enumerate(drop_chords):
        t0 = bar_t(b)
        dur = BAR if b < 6 else 3 * BEAT
        music.add(t0, pad_chord([hz(x) for x in CH[c]], dur + 0.1, cut=2200, att=0.02, rel=0.1), 0.42)
        # rolling 16th bass
        root = hz(ROOT[c])
        for q in range(int(round(dur / (BEAT / 4)))):
            fq = root * (2 if q % 4 == 2 else 1)
            music.add(t0 + q * BEAT / 4, bass_note(fq, BEAT / 4 * 0.85, cut=900, drive=2.0), 0.5)
        notes = [nm(x) + 12 for x in CH[c][:3]]
        seq = [notes[0], notes[1], notes[2], notes[0] + 12, notes[2], notes[1], notes[0] + 12, notes[2]]
        for q in range(int(round(dur / (BEAT / 4)))):
            arp.add(t0 + q * BEAT / 4, arp_note(midi(seq[q % 8]), BEAT / 4 * 0.8, 0.25 if b % 2 else 0.125), 1.0)
    music.x += delay(arp.x, BEAT * 0.75, 0.32, 4) * 0.28
    # glitch ticks on every cut
    for (a, b, s) in CUTS:
        sfx.add(a, glitch(0.07, int(a * 100)), 0.35, pan=RNG.uniform(-0.5, 0.5))
    # lunge zap (reverse) right into the silence
    z = whoosh(0.4, 500, 12000, rev=True) + glitch(0.4, 99) * 0.5
    sfx.add(SIL_C[0] - 0.4, z, 0.6)

    # ---------------------------------------------------------- giant screen
    sfx.add(SCREEN_ON, impact(3.5, 110, 24, 1.0), 1.0)
    send.add(SCREEN_ON, impact(3.5, 110, 24, 1.0), 0.5)
    n = int(0.6 * SR)
    whine = sine(2000 * 2 ** (np.linspace(0, 2.2, n)), n) * env_exp(0.6, 0.25) * 0.08
    sfx.add(SCREEN_ON, whine, 1.0)
    # electrical hum under the screen
    nh = int((ZOOM - SCREEN_ON) * SR)
    hum = (saw(50, nh) * 0.5 + sine(100, nh) * 0.5)
    hum = lp(hum, 700) * 0.12
    hum[:int(0.05 * SR)] *= np.linspace(0, 1, int(0.05 * SR))
    music.add(SCREEN_ON, stereo_widen(hum, 0.004), 0.5)
    half_chords = ['Dm', 'Dm', 'Bb', 'A']
    for i, c in enumerate(half_chords):
        t0 = bar_t(7 + i)
        music.add(t0, pad_chord([hz(x) for x in CH[c]], BAR + 0.2, cut=1500, att=0.1, rel=0.3, det=0.12), 0.45)
        music.add(t0, bass_note(hz(ROOT[c]), BAR * 0.95, cut=420, drive=2.5), 0.55)
    # 8-bit lead melody
    mel = [('A4', 1), ('F4', 1), ('E4', .5), ('F4', .5), ('D4', 1),
           ('A4', 1.5), ('Bb4', .5), ('A4', 1), ('G4', 1),
           ('F4', 1), ('D4', 1), ('F4', 1), ('G4', 1),
           ('E4', 2), ('C#4', 1), ('E4', 1)]
    lead = Bus()
    t = bar_t(7)
    for name, beats in mel:
        dur = beats * BEAT
        nn = int(dur * SR)
        tv = np.arange(nn) / SR
        vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * tv) * np.clip(tv / 0.2, 0, 1)
        s = pulse(hz(name) * vib, nn, 0.5) * 0.5 + pulse(hz(name) * 1.005 * vib, nn, 0.25) * 0.3
        s = lp(s, 2600) * adsr(dur, 0.01, 0.2, 0.7, 0.05)
        lead.add(t, s, 1.0)
        t += dur
    music.x += delay(lead.x, BEAT * 0.75, 0.38, 5) * 0.32
    # riser bar
    sfx.add(RISER, riser(ZOOM - RISER, 200, 12000), 0.6)
    music.add(RISER, pad_chord([hz(x) for x in CH['A']], BAR, cut=2500, att=1.2, rel=0.05), 0.5)

    # ---------------------------------------------------------- scene 5
    sfx.add(ZOOM, whoosh(POV - ZOOM, 300, 12000), 0.65)
    sfx.add(ZOOM, impact(2.0, 120, 30, 0.9), 0.9)
    sfx.add(ZOOM, glitch(0.15, 7), 0.4)
    sfx.add(POV, glitch(0.1, 8), 0.35)
    # muffled groove until the visor
    mus5 = Bus()
    for q in range(int(round((VISOR - ZOOM) / (BEAT / 4)))):
        mus5.add(ZOOM + q * BEAT / 4, bass_note(hz('D2') * (2 if q % 4 == 2 else 1), BEAT / 4 * 0.85, cut=600), 0.5)
    mus5.add(ZOOM, pad_chord([hz(x) for x in CH['Dm']], VISOR - ZOOM + 0.1, cut=1200, att=0.05, rel=0.05), 0.4)
    a0, a1 = int(ZOOM * SR), int(VISOR * SR)
    mus5.x[a0:a1] = lp(mus5.x[a0:a1], 650)
    music.x += mus5.x
    # visor reveal
    sfx.add(VISOR, impact(3.0, 70, 22, 1.0), 1.0)
    send.add(VISOR, impact(3.0, 70, 22, 1.0), 0.5)
    for k in range(3):
        b = bip(2093 if k < 2 else 2637, 0.05, 0.25)
        sfx.add(VISOR + 0.35 + k * 0.09, b, 0.18, pan=-0.4)
    nd = int((SIL_D[0] - VISOR) * SR)
    td = np.arange(nd) / SR
    dr = (sine(hz('D1'), nd) * 0.5 + lp(saw(hz('D2'), nd), 250) * 0.3) * np.clip(td / 0.6, 0, 1)
    music.add(VISOR, stereo_widen(dr, 0.01), 0.55)
    # observer pulse
    k = 0
    while VISOR + 0.8 + k * 2 * BEAT < SIL_D[0] - 0.1:
        drums.add(VISOR + 0.8 + k * 2 * BEAT, heartbeat(0.7), 0.6)
        k += 1
    # turn: dissonant swell
    sw = pad_chord([hz('D4'), hz('Eb4'), hz('A4'), hz('Bb4')], SIL_D[0] - 58.0, cut=2500, att=1.2, rel=0.01, det=0.2)
    music.add(58.0, sw, 0.5)
    sfx.add(58.2, glitch(0.3, 21), 0.25)
    # final question
    sfx.add(SIL_D[1], impact(4.0, 60, 20, 1.0), 1.0)
    bl = bell(hz('D5'), 4.5) * 0.35 + bell(hz('A5') * 1.007, 4.5) * 0.18
    sfx.add(SIL_D[1], bl, 0.8)
    send.add(SIL_D[1], bl, 1.0)
    nd = int((GLITCH_BACK - SIL_D[1]) * SR)
    dr = (sine(hz('D1'), nd) * 0.4 + lp(saw(hz('D2') * 1.003, nd), 300) * 0.25 + sine(hz('Ab2'), nd) * 0.06)
    music.add(SIL_D[1], stereo_widen(dr, 0.01), 0.55)
    for k in range(6):
        sfx.add(62.7 + k * 0.13, glitch(0.1, 40 + k), 0.2 + 0.08 * k, pan=RNG.uniform(-0.6, 0.6))
    sfx.add(GLITCH_BACK - 0.05, glitch(0.3, 60), 0.7)
    sfx.add(GLITCH_BACK, impact(1.5, 90, 35, 0.6), 0.6)

    # ---------------------------------------------------------- drums
    for (tk, v) in DRUMS['kick']:
        drums.add(tk, kick(v), 0.9)
    for (tk, v) in DRUMS['snare']:
        s = snare(v)
        drums.add(tk, s, 0.55)
        send.add(tk, s, 0.15)
    for (tk, v) in DRUMS['clap']:
        drums.add(tk, clap(v), 0.45)
    for (tk, v) in DRUMS['hat']:
        drums.add(tk, hat(v), 0.22, pan=0.25)
    for (tk, v) in DRUMS['ohat']:
        drums.add(tk, hat(v, True), 0.2, pan=-0.2)
    # muffle the S5 drums
    a0, a1 = int(ZOOM * SR), int(VISOR * SR)
    drums.x[a0:a1] = lp(drums.x[a0:a1], 700)

    # ---------------------------------------------------------- sidechain
    sc = np.ones(N)
    for (tk, v) in DRUMS['kick']:
        i0 = int(tk * SR)
        L = int(0.3 * SR)
        e = 1 - 0.6 * v * np.exp(-np.arange(L) / SR / 0.09)
        sc[i0:i0 + L] = np.minimum(sc[i0:i0 + L], e[:max(0, min(L, N - i0))])
    music.x *= sc[:, None]

    # ---------------------------------------------------------- reverb + mix
    ir = reverb_ir()
    wet = np.zeros((N, 2))
    src = send.x + music.x * 0.35
    for c in range(2):
        wet[:, c] = signal.fftconvolve(src[:, c], ir[:, c])[:N]
    mix = music.x * 0.9 + drums.x * 1.0 + sfx.x * 0.9 + amb.x * 0.8 + wet * 0.35
    mix = hp(mix, 28)

    # ---------------------------------------------------------- silences
    gate = np.ones(N)
    for a, b in (SIL_A, SIL_B, SIL_C, SIL_D):
        i0, i1 = int(a * SR), int(b * SR)
        f = int(0.006 * SR)
        gate[i0:i1] = 0
        gate[i0 - f:i0] = np.minimum(gate[i0 - f:i0], np.linspace(1, 0, f))
    # keep the event that starts exactly at the end of each silence
    mix *= gate[:, None]

    # ---------------------------------------------------------- master
    peak = np.max(np.abs(mix))
    mix = mix / (peak + 1e-9) * 1.6
    mix = np.tanh(mix) / np.tanh(1.6)
    mix *= 0.89
    # tiny edge fades (avoid clicks at loop boundary)
    f = int(0.004 * SR)
    mix[:f] *= np.linspace(0, 1, f)[:, None]
    mix[-f:] *= np.linspace(1, 0, f)[:, None]
    return mix.astype(np.float32)


def write_wav(path):
    from scipy.io import wavfile
    mix = build()
    wavfile.write(path, SR, (np.clip(mix, -1, 1) * 32767).astype(np.int16))
    return mix


if __name__ == '__main__':
    import sys
    m = write_wav(sys.argv[1] if len(sys.argv) > 1 else 'soundtrack.wav')
    print('done', m.shape, float(np.abs(m).max()))
