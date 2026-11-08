"""Soundtrack of part 3 (A minor).  Same palette as parts 1-2, plus a 4-note
leitmotif — the red light's theme — heard in the bleeps, the lamps, the lead
and the final bell."""
import numpy as np
from scipy import signal
from audio import (SR, N, Bus, hz, nm, midi, kick, snare, clap, hat, bass_note, arp_note, pad_chord, bip,
                   impact, metal_hit, riser, whoosh, glitch, tick, thunder, heartbeat, bell, reverb_ir, delay,
                   sine, saw, pulse, noise, lp, hp, bp, sweep, stereo_widen, env_exp, adsr, crush)
from audio2 import footstep
from core import DURATION, BEAT, BAR, DROP, bar_t
from timeline import DRUMS, CUTS
from timeline3 import *
import story3 as S3

RNG = np.random.default_rng(33)
MOTIF = ['A4', 'C5', 'E5', 'D5']
CH = {
    'Am': ['A2', 'C3', 'E3', 'A3'], 'F': ['F2', 'A2', 'C3', 'F3'], 'C': ['C3', 'E3', 'G3', 'C4'],
    'G': ['G2', 'B2', 'D3', 'G3'], 'E': ['E2', 'G#2', 'B2', 'E3'], 'Am9': ['A2', 'C3', 'E3', 'B3'],
    'Dm': ['D3', 'F3', 'A3', 'D4'],
}
ROOT = {'Am': 'A1', 'F': 'F1', 'C': 'C2', 'G': 'G1', 'E': 'E1', 'Am9': 'A1', 'Dm': 'D2'}


def up(name, octv=1):
    return hz(name) * 2 ** octv


def glass_crack(big=1.0):
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    crack = hp(noise(n), 2500) * np.exp(-t / (0.02 + 0.03 * big)) * 1.4
    body = bp(noise(n), 600, 3000) * np.exp(-t / 0.12) * 0.5
    out = crack + body
    r = np.random.default_rng(int(big * 100))
    for k in range(int(10 + 25 * big)):
        i0 = int(r.uniform(0.01, 0.9) * SR)
        f = r.uniform(3000, 9000)
        L = int(0.08 * SR)
        tk = np.arange(L) / SR
        out[i0:i0 + L] += np.sin(2 * np.pi * f * tk) * np.exp(-tk / 0.02) * r.uniform(0.05, 0.25) * big
    return out


def build():
    music, drums, sfx, amb, send = Bus(), Bus(), Bus(), Bus(), Bus()

    # ---------------------------------------------------------- loop ambience
    s0, s1 = -(DURATION - POV2), S1_END + 0.6
    nL = int((s1 - s0) * SR)
    ts = s0 + np.arange(nL) / SR
    rainS = bp(noise(nL), 900, 9000) * 0.11 + lp(noise(nL), 500) * 0.12
    drops = (RNG.random(nL) < 0.0009) * RNG.uniform(0.2, 1, nL)
    rainS += hp(np.convolve(drops, np.exp(-np.arange(200) / 25.0), 'same'), 2000) * 0.25
    rainS = stereo_widen(rainS, 0.017)
    drone = (sine(hz('A1'), nL) * 0.35 + sine(hz('E2'), nL) * 0.18 +
             lp(saw(hz('A1') * (1 + 0.003 * np.sin(2 * np.pi * 0.11 * ts)), nL), 300) * 0.25)
    drone *= 0.8 + 0.2 * np.sin(2 * np.pi * 0.17 * ts)
    pad_l = lp(saw(hz('C3') * 1.002, nL) + saw(hz('E3') * 0.998, nL) + saw(hz('A3'), nL), 600) * 0.06
    drone = stereo_widen(drone + pad_l, 0.009)
    steps = np.zeros(nL)
    ss = np.arange(0.0, STOP1 + 0.01, 0.002)
    d = np.array([S3.h1(x) for x in ss])
    kk = np.floor(d / 0.62)
    for i in np.nonzero(np.diff(kk) != 0)[0]:
        st_ = ss[i]
        dist = abs(d[i] - S3.CAM1[2])
        fs = footstep(min(1.0, 1.6 / max(dist, 0.8)))
        i0 = int((st_ - s0) * SR)
        steps[i0:i0 + len(fs)] += fs[:max(0, nL - i0)]
    loop_sig = rainS + drone * 0.55 + stereo_widen(steps * 0.5, 0.002)
    k0 = int(-s0 * SR)
    head, tail = loop_sig[k0:], loop_sig[:k0]
    fh = np.ones(len(head))
    fh[-int(0.6 * SR):] = np.linspace(1, 0, int(0.6 * SR))
    amb.add(0.0, head * fh[:, None], 1.0)
    ft = np.ones(len(tail))
    ft[:int(0.2 * SR)] = np.linspace(0, 1, int(0.2 * SR))
    amb.add(POV2, tail * ft[:, None], 1.0)
    n2 = int((POV2 - S1_END) * SR)
    r2 = stereo_widen(bp(noise(n2), 900, 9000) * 0.11 + lp(noise(n2), 500) * 0.12, 0.017)
    e2 = np.ones(n2)
    e2[:int(0.6 * SR)] = np.linspace(0, 1, int(0.6 * SR))
    i_in = int((THROUGH[1] - S1_END) * SR)
    e2[i_in:] *= 0.35          # outside the glass the rain is muffled
    amb.add(S1_END, r2 * e2[:, None], 0.85)

    # ---------------------------------------------------------- scene 1
    sfx.add(0.25, impact(2.0, 70, 30, 0.55), 0.8)
    send.add(0.25, impact(2.0, 70, 30, 0.55), 0.3)
    for k in range(-60, 60):
        s = 0.12 + k * 2 * BEAT
        note = up(MOTIF[k % 4], 1)
        for tb in ([s] if 0 <= s < WALK2 + 0.3 else []) + ([s + DURATION] if POV2 + 0.3 <= s + DURATION < DURATION else []):
            b = bip(note, 0.09, 0.5) * 0.18
            sfx.add(tb, b, 1.0, pan=0.12)
            send.add(tb, b, 0.6)
    sfx.add(2.4, thunder(3.0) * 0.5, 0.45)
    sfx.add(2.4, glitch(0.08, 3), 0.25)
    for (a, b, lines) in SUBS:
        txt = ''.join(lines)
        for i, ch in enumerate(txt):
            if ch != ' ' and i % 2 == 0:
                sfx.add(a + i / TYPE_CPS, tick(i + 200), 0.22)

    # ---------------------------------------------------------- scene 2: walking toward the light
    t = WALK2 + 0.3
    while t < STOP2 - 0.2:
        sfx.add(t, footstep(0.55), 0.7, pan=RNG.uniform(-0.1, 0.1))
        t += 0.5
    k = 0
    while WALK2 + k * 2 * BEAT < SIL_A[0] - 0.1:
        tb = WALK2 + k * 2 * BEAT
        sfx.add(tb, bip(hz('A5') if k % 2 == 0 else hz('E5'), 0.03, 0.125) * 0.5, 0.25, pan=0.5 if k % 2 else -0.5)
        k += 1
    for (a, b, c) in ((WALK2, 9.2, 'Am9'), (9.2, 12.6, 'F'), (12.6, 14.6, 'C'), (14.6, SIL_A[0], 'E')):
        music.add(a, pad_chord([hz(x) for x in CH[c]], b - a + 0.8, cut=900, att=0.8, rel=0.9), 0.5)
        music.add(a, bass_note(hz(ROOT[c]) * 2, b - a, cut=220, drive=1.0) * 0.5, 0.55)
    sfx.add(DOOR_APPEAR, glitch(0.14, 81), 0.4, pan=-0.3)
    sfx.add(DOOR_APPEAR, impact(1.4, 90, 35, 0.4), 0.5)
    nd = int((DOOR_GONE - DOOR_APPEAR) * SR)
    td = DOOR_APPEAR + np.arange(nd) / SR
    br = 0.5 + 0.5 * np.cos(2 * np.pi * (td - 6.0) / (2 * BEAT))
    hum = (sine(55, nd) * 0.5 + lp(saw(55.3, nd), 400) * 0.25) * (0.45 + 0.55 * br)
    hum += sine(880 * (1 + 0.004 * np.sin(2 * np.pi * 5 * td)), nd) * 0.04 * br
    hum[:int(0.1 * SR)] *= np.linspace(0, 1, int(0.1 * SR))
    hum[-int(0.15 * SR):] *= np.linspace(1, 0, int(0.15 * SR))
    music.add(DOOR_APPEAR, hum, 0.45, pan=-0.45)
    n = int((DOOR_CRACK[1] - DOOR_CRACK[0] + 0.4) * SR)
    shim = sum(sine(hz(x) * (1 + 0.003 * np.sin(np.arange(n) / SR * 30 + j)), n) for j, x in enumerate(('A5', 'E6', 'C7')))
    shim = shim * np.sin(np.pi * np.linspace(0, 1, n)) * 0.06
    sfx.add(DOOR_CRACK[0], shim, 1.0, pan=-0.4)
    send.add(DOOR_CRACK[0], shim, 0.8)
    sfx.add(DOOR_GONE - 0.1, glitch(0.15, 82), 0.35, pan=-0.4)
    stg = sum(sine(hz(x), int(0.9 * SR)) for x in ('Bb5', 'A5', 'E6')) * env_exp(0.9, 0.35) * 0.15
    sfx.add(ROOF[0], stg, 1.0, pan=0.3)
    send.add(ROOF[0], stg, 0.8)
    sfx.add(13.5, riser(SIL_A[0] - 13.5, 150, 6000), 0.5)

    # ---------------------------------------------------------- scene 3: lights out, the runway
    n = int(1.2 * SR)
    pd = sweep(saw(np.linspace(400, 40, n), n), lambda x: 3000 * (0.05 ** (x / 1.2)), 'low') * env_exp(1.2, 0.5)
    sfx.add(LIGHTS_OUT, pd, 0.7)
    sfx.add(LIGHTS_OUT, impact(2.5, 80, 25, 0.9), 0.9)
    send.add(LIGHTS_OUT, impact(2.5, 80, 25, 0.9), 0.4)
    nh = int((SIL_B[0] - LIGHTS_OUT) * SR)
    th = np.arange(nh) / SR
    red_hum = sine(hz('A5'), nh) * 0.018 * (0.7 + 0.3 * np.sin(2 * np.pi * 3.5 * th)) * np.clip(th / 1.5, 0, 1)
    sfx.add(LIGHTS_OUT, red_hum, 1.0)
    notes = ['A4', 'C5', 'E5', 'D5', 'A5', 'C6', 'E6', 'D6']
    for i, tl in enumerate(RUNWAY):
        sfx.add(tl, lp(kick(0.55, 0.3), 900), 0.7)
        sfx.add(tl, hp(noise(int(0.02 * SR)), 3000) * env_exp(0.02, 0.005), 0.4)
        bz = lp(saw(100, int(0.35 * SR)), 1200) * env_exp(0.35, 0.12) * 0.25
        sfx.add(tl + 0.01, bz, 0.5, pan=0.3 * (1 if i % 2 else -1))
        c = bip(hz(notes[i]), 0.22, 0.25) * adsr(0.22, 0.002, 0.08, 0.4, 0.05)
        sfx.add(tl + 0.03, c, 0.28, pan=0.4 * (1 if i % 2 else -1))
        send.add(tl + 0.03, c, 0.6)
        sfx.add(tl + 0.02, glitch(0.06, 300 + i), 0.18)
        music.add(tl, bass_note(hz('A1') * 2, 2 * BEAT, cut=180, drive=1.2), 0.4 + 0.04 * i)
    pc = pad_chord([hz(x) for x in ['A2', 'E3', 'B3', 'C4']], REVEAL - RUNWAY[0] + 0.5, cut=1100, att=3.0, rel=0.5)
    music.add(RUNWAY[0], pc, 0.45)
    sfx.add(REVEAL - 0.75, whoosh(0.75, 400, 9000, rev=True), 0.45)
    st2 = pad_chord([hz('A2'), hz('Bb2'), hz('E3'), hz('A3')], 1.6, cut=3500, att=0.003, rel=1.2, det=0.15)
    music.add(REVEAL, st2, 0.9)
    sfx.add(REVEAL, impact(2.5, 60, 25, 1.0), 0.9)
    send.add(REVEAL, st2, 0.6)
    for j in range(8):
        sfx.add(REVEAL + 0.01 * j, glitch(0.05, 400 + j), 0.2, pan=-0.9 + 0.25 * j)
    for c, a in (('Am', bar_t(-4)), ('F', bar_t(-3)), ('Dm', bar_t(-2)), ('E', bar_t(-1))):
        music.add(a, pad_chord([hz(x) for x in CH[c]], BAR + 0.3, cut=1300, att=0.3, rel=0.3), 0.45)
    t = bar_t(-3)
    while t < SIL_B[0] - 1e-6:
        c = 'F' if t < bar_t(-2) else ('Dm' if t < bar_t(-1) else 'E')
        music.add(t, bass_note(hz(ROOT[c]) * 2, BEAT / 2 * 0.9, cut=500), 0.35)
        t += BEAT / 2
    arp = Bus()
    t, i = bar_t(-2), 0
    while t < SIL_B[0] - 1e-6:
        c = 'Dm' if t < bar_t(-1) else 'E'
        nn_ = [nm(x) + 12 for x in CH[c][:3]]
        seq = [nn_[0], nn_[1], nn_[2], nn_[0] + 12, nn_[2], nn_[1]]
        arp.add(t, arp_note(midi(seq[i % 6]), BEAT / 4 * 0.9, 0.25), 1.0)
        t += BEAT / 4
        i += 1
    a0, a1 = int(bar_t(-2) * SR), int(SIL_B[0] * SR)
    arp.x[a0:a1] = sweep(arp.x[a0:a1], lambda x: 400 * (12000 / 400) ** (x / (SIL_B[0] - bar_t(-2))), 'low', 256)
    music.x += delay(arp.x, BEAT * 0.75, 0.3, 4) * 0.25
    sfx.add(30.5, riser(SIL_B[0] - 30.5, 200, 9000), 0.55)
    sfx.add(SIL_B[0] - 0.03, impact(0.6, 120, 50, 0.7), 0.6)

    # ---------------------------------------------------------- scene 4: the sprint
    drop_chords = ['Am', 'F', 'C', 'G', 'Am', 'F', 'E']
    sfx.add(DROP, impact(2.5, 100, 30, 1.0), 1.0)
    send.add(DROP, impact(2.5, 100, 30, 1.0), 0.4)
    arp = Bus()
    for b, c in enumerate(drop_chords):
        t0 = bar_t(b)
        dur = BAR if b < 6 else 3 * BEAT
        music.add(t0, pad_chord([hz(x) for x in CH[c]], dur + 0.1, cut=2200, att=0.02, rel=0.1), 0.42)
        root = hz(ROOT[c])
        for q in range(int(round(dur / (BEAT / 4)))):
            fq = root * (2 if q % 4 == 2 else 1)
            music.add(t0 + q * BEAT / 4, bass_note(fq, BEAT / 4 * 0.85, cut=900, drive=2.0), 0.5)
        nn_ = [nm(x) + 12 for x in CH[c][:3]]
        seq = [nn_[0], nn_[1], nn_[2], nn_[0] + 12, nn_[2], nn_[1], nn_[0] + 12, nn_[2]]
        for q in range(int(round(dur / (BEAT / 4)))):
            arp.add(t0 + q * BEAT / 4, arp_note(midi(seq[q % 8]), BEAT / 4 * 0.8, 0.25 if b % 2 else 0.125), 1.0)
    music.x += delay(arp.x, BEAT * 0.75, 0.32, 4) * 0.28
    # the motif as a lead over the drop (every other bar)
    lead = Bus()
    for b in (0, 2, 4):
        for j, nn_ in enumerate(MOTIF):
            dur = BEAT * (1 if j < 3 else 1)
            n = int(dur * SR)
            s = pulse(up(nn_, 0), n, 0.5) * 0.5 + pulse(up(nn_, 0) * 1.004, n, 0.25) * 0.3
            lead.add(bar_t(b, j), lp(s, 3000) * adsr(dur, 0.005, 0.15, 0.6, 0.05), 1.0)
    music.x += delay(lead.x, BEAT * 0.75, 0.35, 4) * 0.26
    for (a, b, s) in CUTS:
        sfx.add(a, glitch(0.07, int(a * 100) + 11), 0.35, pan=RNG.uniform(-0.5, 0.5))
    # the world crumbling
    for (bx, by, bw, bh, t0, spd) in S3._BLOCKS[::3]:
        thud = crush(lp(noise(int(0.15 * SR)), 800) * env_exp(0.15, 0.04), 4, 8)
        sfx.add(t0 + 0.25, thud, 0.25, pan=(bx / 270.0 - 0.5) * 1.4)
    for ts_ in FLASH_STILLS:
        g = glitch(0.15, int(ts_ * 10))
        sfx.add(ts_, g + whoosh(0.15, 2000, 9000, rev=True) * 0.5, 0.5)
    sfx.add(SIL_C[0] - 0.4, whoosh(0.4, 500, 12000, rev=True) + glitch(0.4, 97) * 0.5, 0.6)

    # ---------------------------------------------------------- the glass, the face
    sfx.add(FACE_ON, impact(3.5, 110, 24, 1.0), 1.0)
    send.add(FACE_ON, impact(3.5, 110, 24, 1.0), 0.5)
    ng = int((ZOOM - FACE_ON) * SR)
    tg = np.arange(ng) / SR
    ghum = (sine(1180, ng) + sine(1187, ng)) * 0.008 * np.clip(tg / 1.0, 0, 1)
    sfx.add(FACE_ON, ghum, 1.0)
    swell = pad_chord([hz('A1'), hz('E2'), hz('A2')], 3.0, cut=500, att=1.0, rel=1.0)
    music.add(FACE_ON, swell, 0.6)
    for i, c in enumerate(['Am', 'Am', 'F', 'E']):
        t0 = bar_t(7 + i)
        music.add(t0, pad_chord([hz(x) for x in CH[c]], BAR + 0.2, cut=1500, att=0.1, rel=0.3, det=0.12), 0.45)
        music.add(t0, bass_note(hz(ROOT[c]), BAR * 0.95, cut=420, drive=2.5), 0.55)
    mel = [('A4', 1), ('C5', 1), ('E5', 1), ('D5', 1),
           ('C5', 1.5), ('B4', .5), ('A4', 1), ('G4', 1),
           ('F4', 1), ('A4', 1), ('C5', 1), ('B4', 1),
           ('E4', 1), ('G#4', 1), ('B4', 1), ('E5', 1)]
    lead = Bus()
    t = bar_t(7)
    for name, beats in mel:
        dur = beats * BEAT
        nn_ = int(dur * SR)
        tv = np.arange(nn_) / SR
        vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * tv) * np.clip(tv / 0.2, 0, 1)
        s = pulse(hz(name) * vib, nn_, 0.5) * 0.5 + pulse(hz(name) * 1.005 * vib, nn_, 0.25) * 0.3
        lead.add(t, lp(s, 2600) * adsr(dur, 0.01, 0.2, 0.7, 0.05), 1.0)
        t += dur
    music.x += delay(lead.x, BEAT * 0.75, 0.38, 5) * 0.32
    for t0 in (D2, D3, D4):
        sfx.add(t0, glitch(0.08, int(t0 * 10) + 3), 0.3)
    sfx.add(RISER, riser(ZOOM - RISER, 200, 12000), 0.6)
    music.add(RISER, pad_chord([hz(x) for x in CH['E']], BAR, cut=2500, att=1.2, rel=0.05), 0.5)
    n = int(1.2 * SR)
    wub = sine(np.linspace(300, 80, n), n) * env_exp(1.2, 0.4) * 0.3 + \
        sine(hz('E6'), n) * env_exp(1.2, 0.3) * 0.05
    sfx.add(PRESS, wub, 0.8)
    send.add(PRESS, wub, 0.6)

    # ---------------------------------------------------------- scene 5: our side of the glass
    sfx.add(ZOOM, lp(whoosh(THROUGH[1] - ZOOM, 300, 8000), 2500), 0.7)
    sfx.add(ZOOM, impact(2.0, 120, 30, 0.9), 0.8)
    mus5 = Bus()
    for q in range(int(round((PUNCH1 - ZOOM) / (BEAT / 4)))):
        mus5.add(ZOOM + q * BEAT / 4, bass_note(hz('A1') * (2 if q % 4 == 2 else 1), BEAT / 4 * 0.85, cut=600), 0.5)
    a0, a1 = int(ZOOM * SR), int(PUNCH1 * SR)
    mus5.x[a0:a1] = lp(mus5.x[a0:a1], 500)
    music.x += mus5.x
    sfx.add(56.7, riser(PUNCH1 - 56.7, 300, 5000, tone=False), 0.4)
    for tp, big in ((PUNCH1, 0.7), (PUNCH2, 1.0)):
        sfx.add(tp, impact(2.5, 90, 25, 1.0), 1.0)
        gc = glass_crack(big)
        sfx.add(tp, gc, 0.8)
        send.add(tp, gc, 0.5)
    k = 0
    while PUNCH1 + 0.4 + k * 2 * BEAT < SIL_D[0] - 0.1:
        drums.add(PUNCH1 + 0.4 + k * 2 * BEAT, heartbeat(0.75), 0.6)
        k += 1
    music.add(PUNCH1, pad_chord([hz('A1'), hz('E2'), hz('A2'), hz('C3')], SIL_D[0] - PUNCH1, cut=1400, att=0.01, rel=0.05), 0.5)
    sh = glass_crack(1.6)
    sfx.add(HAND[0], sh, 0.9)
    sfx.add(HAND[0], stereo_widen(whoosh(HAND[1] - HAND[0] + 0.1, 400, 14000), 0.02), 0.7)
    n = int((SIL_D[0] - 59.0) * SR)
    wt = sine(hz('A5') * 2 ** (np.linspace(0, 1.5, n)), n) * np.linspace(0, 1, n) ** 2 * 0.06
    sfx.add(59.0, wt, 1.0)
    # he is out
    sfx.add(POV2, impact(4.0, 60, 20, 1.0), 1.0)
    bl = Bus()
    for j, nn_ in enumerate(MOTIF):
        bl.add(POV2 + j * 0.62, bell(up(nn_, 0), 4.0) * 0.3, 1.0)
    sfx.x += bl.x * 0.8
    send.x += bl.x
    sfx.add(61.6, lp(footstep(0.9, True), 1200), 0.45, pan=0.95)
    sfx.add(HEAL[0], glitch(0.2, 64), 0.3)

    # ---------------------------------------------------------- drums
    for (tk, v) in DRUMS['kick']:
        if THROUGH[0] <= tk < PUNCH1:
            v *= 0.7
        drums.add(tk, kick(v), 0.9)
    for (tk, v) in DRUMS['snare']:
        s = snare(v)
        drums.add(tk, s, 0.55)
        send.add(tk, s, 0.15)
    for (tk, v) in DRUMS['clap']:
        drums.add(tk, clap(v), 0.45)
    for (tk, v) in DRUMS['hat']:
        drums.add(tk, hat(v), 0.22, pan=0.2)
    for (tk, v) in DRUMS['ohat']:
        drums.add(tk, hat(v, True), 0.2, pan=-0.2)
    a0, a1 = int(ZOOM * SR), int(PUNCH1 * SR)
    drums.x[a0:a1] = lp(drums.x[a0:a1], 600)

    sc = np.ones(N)
    for (tk, v) in DRUMS['kick']:
        i0 = int(tk * SR)
        L = int(0.3 * SR)
        e = 1 - 0.6 * v * np.exp(-np.arange(L) / SR / 0.09)
        sc[i0:i0 + L] = np.minimum(sc[i0:i0 + L], e[:max(0, min(L, N - i0))])
    music.x *= sc[:, None]

    ir = reverb_ir(seed=9)
    wet = np.zeros((N, 2))
    src = send.x + music.x * 0.35
    for c in range(2):
        wet[:, c] = signal.fftconvolve(src[:, c], ir[:, c])[:N]
    mix = music.x * 0.9 + drums.x * 1.0 + sfx.x * 0.9 + amb.x * 0.8 + wet * 0.35
    mix = hp(mix, 28)
    gate = np.ones(N)
    for a, b in (SIL_A, SIL_B, SIL_C, SIL_D):
        i0, i1 = int(a * SR), int(b * SR)
        f = int(0.006 * SR)
        gate[i0:i1] = 0
        gate[i0 - f:i0] = np.minimum(gate[i0 - f:i0], np.linspace(1, 0, f))
    mix *= gate[:, None]
    peak = np.percentile(np.abs(mix), 99.95)
    mix = mix / (peak + 1e-9) * 1.25
    mix = np.tanh(mix) / np.tanh(1.6) * 0.89
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
    m = write_wav(sys.argv[1] if len(sys.argv) > 1 else 'soundtrack3.wav')
    print('done', m.shape, float(np.abs(m).max()))
