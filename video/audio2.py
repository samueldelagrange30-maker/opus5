"""Soundtrack of part 2: same palette as part 1 (dark ambient, synthwave at
140 BPM in the action, 8-bit bleeps, glitches, short silences) in C minor."""
import numpy as np
from scipy import signal
import audio as A
from audio import (SR, N, Bus, hz, nm, midi, kick, snare, clap, hat, bass_note, arp_note, pad_chord, bip,
                   impact, metal_hit, riser, whoosh, glitch, tick, thunder, heartbeat, bell, reverb_ir, delay,
                   sine, saw, pulse, noise, lp, hp, bp, sweep, stereo_widen, env_exp, adsr, crush)
from core import DURATION, BEAT, BAR, DROP, bar_t
from timeline import DRUMS, CUTS, SIL_B, SIL_C, RISER, ZOOM, POV, VISOR, REVEAL, BUILD, TYPE_CPS, LAMPS_ON
from timeline2 import *
import story2 as S2

RNG = np.random.default_rng(21)
CH = {
    'Cm': ['C3', 'Eb3', 'G3', 'C4'], 'Ab': ['Ab2', 'C3', 'Eb3', 'Ab3'], 'Fm': ['F2', 'Ab2', 'C3', 'F3'],
    'G': ['G2', 'B2', 'D3', 'G3'], 'Cm9': ['C3', 'Eb3', 'G3', 'D4'], 'Fm6': ['F2', 'Ab2', 'C3', 'D3'],
}
ROOT = {'Cm': 'C2', 'Ab': 'Ab1', 'Fm': 'F1', 'G': 'G1', 'Cm9': 'C2', 'Fm6': 'F1'}


def step_times(s0, s1):
    """Footstep times of the hero walking toward the observer (loop clock)."""
    ss = np.arange(s0, s1, 0.002)
    d = np.array([S2.obs_dist(x) for x in ss])
    k = np.floor(d / 0.62)
    idx = np.nonzero(np.diff(k) != 0)[0]
    return [(float(ss[i]), float(d[i])) for i in idx]


def footstep(vel=1.0, wet=True):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    thud = lp(noise(n), 300) * np.exp(-t / 0.02) * 2.0
    click = bp(noise(n), 2000, 7000) * np.exp(-t / 0.008) * 0.5
    splash = bp(noise(n), 1500, 6000) * np.exp(-t / 0.04) * (0.6 if wet else 0)
    return (thud + click + splash) * vel


def build():
    music, drums, sfx, amb, send = Bus(), Bus(), Bus(), Bus(), Bus()

    # ---------------------------------------------------------- loop ambience (rain + drone + steps)
    s0, s1 = -(DURATION - POV2), S1_END + 0.6
    nL = int((s1 - s0) * SR)
    ts = s0 + np.arange(nL) / SR
    rainS = bp(noise(nL), 900, 9000) * 0.11 + lp(noise(nL), 500) * 0.12
    drops = (RNG.random(nL) < 0.0009) * RNG.uniform(0.2, 1, nL)
    rainS += hp(np.convolve(drops, np.exp(-np.arange(200) / 25.0), 'same'), 2000) * 0.25
    rainS = stereo_widen(rainS, 0.017)
    drone = (sine(hz('C2'), nL) * 0.35 + sine(hz('G2'), nL) * 0.18 +
             lp(saw(hz('C2') * (1 + 0.003 * np.sin(2 * np.pi * 0.11 * ts)), nL), 300) * 0.25)
    drone *= 0.8 + 0.2 * np.sin(2 * np.pi * 0.17 * ts)
    pad_l = lp(saw(hz('Eb3') * 1.002, nL) + saw(hz('G3') * 0.998, nL) + saw(hz('C4'), nL), 600) * 0.06
    drone = stereo_widen(drone + pad_l, 0.009)
    steps = np.zeros(nL)
    for (st_, d) in step_times(s0, min(s1, STOP_S + 0.01)):
        i0 = int((st_ - s0) * SR)
        fs = footstep(min(1.0, 2.2 / max(d, 1.0)))
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
    # rain under scenes 2 to 5 (world A all along)
    n2 = int((POV2 - S1_END) * SR)
    r2 = stereo_widen(bp(noise(n2), 900, 9000) * 0.11 + lp(noise(n2), 500) * 0.12, 0.017)
    e2 = np.ones(n2)
    e2[:int(0.6 * SR)] = np.linspace(0, 1, int(0.6 * SR))
    amb.add(S1_END, r2 * e2[:, None], 0.85)

    # ---------------------------------------------------------- scene 1
    sfx.add(0.25, impact(2.0, 70, 30, 0.55), 0.8)
    send.add(0.25, impact(2.0, 70, 30, 0.55), 0.3)
    for k in range(-60, 60):
        s = 0.12 + k * 2 * BEAT
        for tb in ([s] if 0 <= s < S1_END else []) + ([s + DURATION] if POV2 + 0.3 <= s + DURATION < DURATION else []):
            b = bip(1568, 0.09, 0.5) * 0.18
            sfx.add(tb, b, 1.0, pan=0.15)
            send.add(tb, b, 0.6)
    # he stops and looks at us: a low swell
    sw = pad_chord([hz('C3'), hz('G3'), hz('D4')], 2.4, cut=700, att=1.2, rel=0.6)
    music.add(STOP_S - 0.4, sw, 0.35)
    for (a, b, lines) in SUBS:
        txt = ''.join(lines)
        for i, ch in enumerate(txt):
            if ch != ' ' and i % 2 == 0:
                sfx.add(a + i / TYPE_CPS, tick(i + 100), 0.22)

    # ---------------------------------------------------------- scene 2: the run
    sfx.add(S1_END, whoosh(0.35, 300, 9000), 0.6)
    sfx.add(S1_END, glitch(0.12, 31), 0.35)
    # running feet + pulse at 140 BPM (8ths), without drums
    t = RUN0
    while t < 8.9:
        v = S2.run_speed(t) / 4.2
        if v > 0.1:
            sfx.add(t, footstep(0.6 * v), 0.8, pan=RNG.uniform(-0.15, 0.15))
        t += BEAT / 2
    t = RUN0
    i = 0
    while t < 8.9:
        f = hz('C2') if i % 4 != 3 else hz('Eb2')
        music.add(t, bass_note(f, BEAT / 2 * 0.8, cut=500, drive=1.8), 0.4)
        t += BEAT / 2
        i += 1
    music.add(RUN0, pad_chord([hz(x) for x in CH['Cm']], 8.9 - RUN0, cut=1200, att=0.2, rel=0.3), 0.3)
    # lamps dying behind him
    for k, pt in S2.PASS.items():
        if pt is None:
            continue
        sfx.add(pt, hp(noise(int(0.05 * SR)), 1500) * env_exp(0.05, 0.012), 0.5)
        dn = np.zeros(int(0.3 * SR))
        for j, m in enumerate((84, 79, 75, 72)):
            b = bip(midi(m), 0.05, 0.25)
            dn[int(j * 0.04 * SR):int(j * 0.04 * SR) + len(b)] += b * (1 - j * 0.15)
        sfx.add(pt + 0.02, dn, 0.18, pan=0.3)
    # skid + doors appearing
    sk = sweep(noise(int(0.5 * SR)), lambda x: 6000 * (0.15 ** (x / 0.5)), 'low') * env_exp(0.5, 0.2)
    sfx.add(8.5, sk, 0.35)
    for tt_, pan in ((DOOR_AHEAD, -0.2), (DOOR_BEHIND, 0.3)):
        sfx.add(tt_ - 0.4, whoosh(0.4, 400, 9000, rev=True), 0.4)
        sfx.add(tt_, glitch(0.14, int(tt_ * 10)), 0.4, pan=pan)
        sfx.add(tt_, impact(1.6, 90, 35, 0.5), 0.5)
    # door hums (breathing)
    for d0, pan in ((DOOR_AHEAD, -0.35), (DOOR_BEHIND, 0.35)):
        nd = int((SIL_A[0] - d0) * SR)
        td = d0 + np.arange(nd) / SR
        br = 0.5 + 0.5 * np.cos(2 * np.pi * (td - HEART0) / (2 * BEAT))
        hum = sine(55 if pan < 0 else 55 * 1.5, nd) * 0.5 + lp(saw(55.3, nd), 400) * 0.25
        hum += sine(880 * (1 + 0.004 * np.sin(2 * np.pi * 5 * td)), nd) * 0.03 * br
        hum *= (0.45 + 0.55 * br)
        hum[:int(0.1 * SR)] *= np.linspace(0, 1, int(0.1 * SR))
        music.add(d0, hum, 0.42, pan=pan)
    # heartbeat once he has stopped
    k = 0
    while DOOR_BEHIND + k * BEAT < SIL_A[0] - 0.05:
        tb = DOOR_BEHIND + k * BEAT
        drums.add(tb, heartbeat(0.45 + 0.5 * (tb - DOOR_BEHIND) / (SIL_A[0] - DOOR_BEHIND)), 0.75)
        k += 1
    for (a, b, c) in ((9.0, 11.6, 'Cm9'), (11.6, 13.4, 'Ab'), (13.4, 15.0, 'Fm6'), (15.0, SIL_A[0], 'G')):
        music.add(a, pad_chord([hz(x) for x in CH[c]], b - a + 0.8, cut=900, att=0.8, rel=0.9), 0.5)
        music.add(a, bass_note(hz(ROOT[c]), b - a, cut=200, drive=1.0) * 0.5, 0.6)
    st_ = sum(sine(hz(nn), int(0.9 * SR)) for nn in ('D6', 'Db6', 'G6')) * env_exp(0.9, 0.35) * 0.15
    sfx.add(DETAIL[0], st_, 1.0, pan=0.3)
    send.add(DETAIL[0], st_, 0.8)
    sfx.add(DETAIL[0], glitch(0.35, 77), 0.4, pan=-0.3)
    sfx.add(13.5, riser(SIL_A[0] - 13.5, 150, 6000), 0.5)

    # ---------------------------------------------------------- scene 3: every door opens
    sfx.add(DOOR_OPEN, impact(3.0, 95, 24, 1.0), 1.0)
    for j, pan in enumerate((-0.8, -0.4, 0.0, 0.4, 0.8)):
        mh = metal_hit(3.0, 98 * 2 ** (j / 12))
        sfx.add(DOOR_OPEN + j * 0.012, mh, 0.22, pan=pan)
        send.add(DOOR_OPEN, mh, 0.25)
    sfx.add(DOOR_OPEN, whoosh(1.6, 200, 9000), 0.45)
    stab = pad_chord([hz('C3'), hz('G3'), hz('C4'), hz('Eb4')], 2.5, cut=3000, att=0.003, rel=1.5)
    music.add(DOOR_OPEN, stab, 0.6)
    send.add(DOOR_OPEN, stab, 0.5)
    # the first one walks out
    t = EMERGE
    while t < 20.2:
        sfx.add(t, lp(footstep(0.8, False), 900), 0.7)
        t += 0.62
    nw = int((SIL_B[0] - EMERGE) * SR)
    tw = np.arange(nw) / SR
    wind = lp(noise(nw), 380, 2) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.13 * tw) ** 2) * 0.6
    wind[:int(0.8 * SR)] *= np.linspace(0, 1, int(0.8 * SR))
    amb.add(EMERGE, stereo_widen(wind, 0.02), 0.5)
    # eight silhouettes appear: thump + descending 8-bit chime + eye ignition
    scale = ['C6', 'Bb5', 'Ab5', 'G5', 'F5', 'Eb5', 'D5', 'C5']
    for i, ta in enumerate(APPEAR):
        sfx.add(ta, lp(kick(0.6, 0.3), 700), 0.75)
        ch = np.zeros(int(0.4 * SR))
        for j, m in enumerate((0, -5, -12, -17)):
            b = bip(hz(scale[i]) * 2 ** (m / 12), 0.06, 0.25)
            ch[int(j * 0.035 * SR):int(j * 0.035 * SR) + len(b)] += b * (1 - j * 0.15)
        pan = 0.45 * (1 if i % 2 else -1)
        sfx.add(ta + 0.02, ch, 0.22, pan=pan)
        send.add(ta + 0.02, ch, 0.5)
        n = int(0.25 * SR)
        zap = sine(600 * 2 ** (np.linspace(0, 2.5, n)), n) * env_exp(0.25, 0.08) * 0.08
        sfx.add(ta, zap, 1.0, pan=-pan)
        music.add(ta, bass_note(hz('C2'), 2 * BEAT, cut=180, drive=1.2), 0.4 + 0.04 * i)
    pc = pad_chord([hz(x) for x in ['C3', 'G3', 'D4', 'Eb4']], REVEAL - APPEAR[0] + 0.5, cut=1100, att=3.0, rel=0.5)
    music.add(APPEAR[0], pc, 0.45)
    sfx.add(CUT_3C, glitch(0.08, 5), 0.3)
    # reveal + build (same architecture as part 1, in C minor)
    sfx.add(REVEAL - 0.75, whoosh(0.75, 400, 9000, rev=True), 0.45)
    st2 = pad_chord([hz('C3'), hz('Db3'), hz('G3'), hz('C4')], 1.6, cut=3500, att=0.003, rel=1.2, det=0.15)
    music.add(REVEAL, st2, 0.9)
    sfx.add(REVEAL, impact(2.5, 60, 25, 1.0), 0.9)
    send.add(REVEAL, st2, 0.6)
    for c, a in (('Cm', bar_t(-4)), ('Ab', bar_t(-3)), ('Fm', bar_t(-2)), ('G', bar_t(-1))):
        music.add(a, pad_chord([hz(x) for x in CH[c]], BAR + 0.3, cut=1300, att=0.3, rel=0.3), 0.45)
    t = bar_t(-3)
    while t < SIL_B[0] - 1e-6:
        c = 'Ab' if t < bar_t(-2) else ('Fm' if t < bar_t(-1) else 'G')
        music.add(t, bass_note(hz(ROOT[c]) * 2, BEAT / 2 * 0.9, cut=500), 0.35)
        t += BEAT / 2
    arp = Bus()
    t, i = bar_t(-2), 0
    while t < SIL_B[0] - 1e-6:
        c = 'Fm' if t < bar_t(-1) else 'G'
        notes = [nm(x) + 12 for x in CH[c][:3]]
        seq = [notes[0], notes[2], notes[1], notes[0] + 12, notes[1], notes[2]]
        arp.add(t, arp_note(midi(seq[i % len(seq)]), BEAT / 4 * 0.9, 0.125), 1.0)
        t += BEAT / 4
        i += 1
    a0, a1 = int(bar_t(-2) * SR), int(SIL_B[0] * SR)
    arp.x[a0:a1] = sweep(arp.x[a0:a1], lambda x: 400 * (12000 / 400) ** (x / (SIL_B[0] - bar_t(-2))), 'low', 256)
    music.x += delay(arp.x, BEAT * 0.75, 0.3, 4) * 0.25
    sfx.add(30.5, riser(SIL_B[0] - 30.5, 200, 9000), 0.55)
    sfx.add(SLAM - 0.03, impact(0.6, 120, 50, 0.7), 0.6)

    # ---------------------------------------------------------- scene 4: the chase
    drop_chords = ['Cm', 'Ab', 'Fm', 'G', 'Cm', 'Ab', 'Fm']
    sfx.add(DROP, impact(2.5, 100, 30, 1.0), 1.0)
    send.add(DROP, impact(2.5, 100, 30, 1.0), 0.4)
    arp = Bus()
    for b, c in enumerate(drop_chords):
        t0 = bar_t(b)
        dur = BAR if b < 6 else 3 * BEAT
        music.add(t0, pad_chord([hz(x) for x in CH[c]], dur + 0.1, cut=2200, att=0.02, rel=0.1), 0.42)
        root = hz(ROOT[c])
        for q in range(int(round(dur / (BEAT / 4)))):
            fq = root * (2 if q % 4 in (1, 3) else 1)
            music.add(t0 + q * BEAT / 4, bass_note(fq, BEAT / 4 * 0.85, cut=900, drive=2.0), 0.5)
        notes = [nm(x) + 12 for x in CH[c][:3]]
        seq = [notes[2], notes[0], notes[1], notes[0] + 12, notes[2], notes[1], notes[0], notes[1]]
        for q in range(int(round(dur / (BEAT / 4)))):
            arp.add(t0 + q * BEAT / 4, arp_note(midi(seq[q % 8]), BEAT / 4 * 0.8, 0.125 if b % 2 else 0.25), 1.0)
    music.x += delay(arp.x, BEAT * 0.75, 0.32, 4) * 0.28
    for (a, b, s) in CUTS:
        sfx.add(a, glitch(0.07, int(a * 100) + 7), 0.35, pan=RNG.uniform(-0.5, 0.5))
    sfx.add(SIL_C[0] - 0.4, whoosh(0.4, 500, 12000, rev=True) + glitch(0.4, 98) * 0.5, 0.6)

    # ---------------------------------------------------------- the faces
    sfx.add(FACE_ON, impact(3.5, 110, 24, 1.0), 1.0)
    send.add(FACE_ON, impact(3.5, 110, 24, 1.0), 0.5)
    sfx.add(FACE_ON, thunder(3.0) * 0.6, 0.5)
    for i, c in enumerate(['Cm', 'Cm', 'Ab', 'G']):
        t0 = bar_t(7 + i)
        music.add(t0, pad_chord([hz(x) for x in CH[c]], BAR + 0.2, cut=1500, att=0.1, rel=0.3, det=0.12), 0.45)
        music.add(t0, bass_note(hz(ROOT[c]), BAR * 0.95, cut=420, drive=2.5), 0.55)
    mel = [('G4', 1), ('Eb4', 1), ('D4', .5), ('Eb4', .5), ('C4', 1),
           ('G4', 1.5), ('Ab4', .5), ('G4', 1), ('F4', 1),
           ('Eb4', 1), ('C4', 1), ('Eb4', 1), ('F4', 1),
           ('D4', 2), ('B3', 1), ('D4', 1)]
    lead = Bus()
    t = bar_t(7)
    for name, beats in mel:
        dur = beats * BEAT
        nn = int(dur * SR)
        tv = np.arange(nn) / SR
        vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * tv) * np.clip(tv / 0.2, 0, 1)
        s = pulse(hz(name) * vib, nn, 0.5) * 0.5 + pulse(hz(name) * 1.005 * vib, nn, 0.25) * 0.3
        lead.add(t, lp(s, 2600) * adsr(dur, 0.01, 0.2, 0.7, 0.05), 1.0)
        t += dur
    music.x += delay(lead.x, BEAT * 0.75, 0.38, 5) * 0.32
    for t0 in (D2, D3, D4):
        sfx.add(t0, glitch(0.08, int(t0 * 10)), 0.3)
    sfx.add(RISER, riser(ZOOM - RISER, 200, 12000), 0.6)
    music.add(RISER, pad_chord([hz(x) for x in CH['G']], BAR, cut=2500, att=1.2, rel=0.05), 0.5)

    # ---------------------------------------------------------- scene 5
    sfx.add(ZOOM, whoosh(POV - ZOOM, 300, 12000), 0.65)
    sfx.add(ZOOM, impact(2.0, 120, 30, 0.9), 0.9)
    mus5 = Bus()
    for q in range(int(round((VISOR - ZOOM) / (BEAT / 4)))):
        mus5.add(ZOOM + q * BEAT / 4, bass_note(hz('C2') * (2 if q % 4 == 2 else 1), BEAT / 4 * 0.85, cut=600), 0.5)
    a0, a1 = int(ZOOM * SR), int(VISOR * SR)
    mus5.x[a0:a1] = lp(mus5.x[a0:a1], 650)
    music.x += mus5.x
    # transformation: a rising, opening saw chord with crackles
    nt = int((HIT - TRANS[0]) * SR)
    tr = sum(saw(hz(x) * 2 ** (np.linspace(-0.3, 0, nt) / 12 * 12), nt) for x in ('C3', 'G3', 'Eb4'))
    tr = sweep(tr / 3, lambda x: 300 * (8000 / 300) ** (x / (HIT - TRANS[0])), 'low', 256) * np.linspace(0.2, 1, nt)
    music.add(TRANS[0], tr, 0.45)
    for k in range(10):
        sfx.add(TRANS[0] + k * 0.13, crush(noise(int(0.05 * SR)) * 0.5, 3, 12), 0.25, pan=RNG.uniform(-0.7, 0.7))
    sfx.add(TRANS[0], glitch(0.12, 55), 0.45)
    sfx.add(HIT, impact(3.0, 70, 22, 1.0), 1.0)
    send.add(HIT, impact(3.0, 70, 22, 1.0), 0.5)
    music.add(HIT, pad_chord([hz('C2'), hz('G2'), hz('C3'), hz('Eb3')], SIL_D[0] - HIT, cut=1400, att=0.01, rel=0.05), 0.55)
    k = 0
    while HIT + 0.6 + k * 2 * BEAT < SIL_D[0] - 0.1:
        drums.add(HIT + 0.6 + k * 2 * BEAT, heartbeat(0.7), 0.6)
        k += 1
    sw = pad_chord([hz('C4'), hz('Db4'), hz('G4'), hz('Ab4')], SIL_D[0] - 58.0, cut=2500, att=1.2, rel=0.01, det=0.2)
    music.add(58.0, sw, 0.5)
    # final question, back in the observer's eyes
    sfx.add(POV2, impact(4.0, 60, 20, 1.0), 1.0)
    sfx.add(POV2, glitch(0.15, 61), 0.5)
    bl = bell(hz('C5'), 4.5) * 0.35 + bell(hz('G5') * 1.007, 4.5) * 0.18
    sfx.add(POV2, bl, 0.8)
    send.add(POV2, bl, 1.0)
    for j in range(3):
        sfx.add(POV2 + 0.4 + j * 0.09, bip(2093 if j < 2 else 2637, 0.05, 0.25), 0.18, pan=-0.4)
    sfx.add(VFADE[0], glitch(0.2, 64), 0.3)

    # ---------------------------------------------------------- drums (shared grid)
    for (tk, v) in DRUMS['kick']:
        drums.add(tk, kick(v), 0.9)
    for (tk, v) in DRUMS['snare']:
        s = snare(v)
        drums.add(tk, s, 0.55)
        send.add(tk, s, 0.15)
    for (tk, v) in DRUMS['clap']:
        drums.add(tk, clap(v), 0.45)
    for (tk, v) in DRUMS['hat']:
        drums.add(tk, hat(v), 0.22, pan=-0.25)
    for (tk, v) in DRUMS['ohat']:
        drums.add(tk, hat(v, True), 0.2, pan=0.2)
    a0, a1 = int(ZOOM * SR), int(VISOR * SR)
    drums.x[a0:a1] = lp(drums.x[a0:a1], 700)

    sc = np.ones(N)
    for (tk, v) in DRUMS['kick']:
        i0 = int(tk * SR)
        L = int(0.3 * SR)
        e = 1 - 0.6 * v * np.exp(-np.arange(L) / SR / 0.09)
        sc[i0:i0 + L] = np.minimum(sc[i0:i0 + L], e[:max(0, min(L, N - i0))])
    music.x *= sc[:, None]

    ir = reverb_ir(seed=5)
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
    peak = np.max(np.abs(mix))
    mix = mix / (peak + 1e-9) * 1.6
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
    m = write_wav(sys.argv[1] if len(sys.argv) > 1 else 'soundtrack2.wav')
    print('done', m.shape, float(np.abs(m).max()))
