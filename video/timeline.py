"""Shared timeline: every visual and audio event is derived from here so
image and sound stay locked together."""
import numpy as np
from core import BEAT, BAR, DROP, bar_t, DURATION

# ------------------------------------------------------------ scene marks
S1_END = 5.5                       # lightning reveals the door
HEART0 = 6.0                       # door heartbeat (70 BPM pulse)
DETAIL = (11.55, 12.05)            # strange background detail
SIL_A = (16.6, 17.0)               # silence before the door opens
DOOR_OPEN = 17.0
CROSS = 19.75                      # camera passes through the doorway
LAMPS_ON = [bar_t(-8) + 2 * BEAT * k for k in range(8)]   # 20.286 ... 26.286
REVEAL = bar_t(-4)                 # 27.143 last lamp -> silhouette
BUILD = (bar_t(-3), bar_t(-1, 3))  # 28.857 .. 33.571
SIL_B = (bar_t(-1, 3), DROP)       # 33.571 .. 34.0
SIL_C = (bar_t(6, 3), bar_t(7))    # 45.571 .. 46.0
SCREEN_ON = bar_t(7)               # 46.0
RISER = bar_t(11)                  # 52.857
ZOOM = bar_t(12)                   # 54.571
POV = bar_t(12, 8 / 3.0)           # 55.714 (2/3 bar)
VISOR = bar_t(13, 2)               # 57.143
TURN = (58.2, 59.4)
SIL_D = (59.4, 59.7)
GLITCH_BACK = 63.5
LOOP = 65.5                        # pure scene-1 frames from here (s = t - DURATION)

# S4 shot list: (start, end, shot)
CUTS = [
    (bar_t(0), bar_t(2), 'A'),
    (bar_t(2), bar_t(3), 'C'),
    (bar_t(3), bar_t(4), 'B'),
    (bar_t(4), bar_t(5), 'A'),
    (bar_t(5), bar_t(5, 2), 'C'),
    (bar_t(5, 2), bar_t(6), 'B'),
    (bar_t(6), bar_t(6, 1), 'B'),
    (bar_t(6, 1), bar_t(6, 2), 'A'),
    (bar_t(6, 2), bar_t(6, 3), 'L'),      # lunge
]

# ------------------------------------------------------------ subtitles
SUBS = [
    (0.25, 4.95, ["Il n'aurait jamais dû", "ouvrir cette porte…"]),
    (7.6, 12.35, ["Pourtant, quelque chose", "l'attendait de", "l'autre côté."]),
    (21.6, 26.6, ["Et cette ville…", "lui ressemblait", "étrangement."]),
    (46.45, 52.75, ["Puis il a compris", "qu'il était observé", "depuis le début."]),
    (59.7, 63.42, ["Mais alors…", "qui regarde", "cette vidéo ?"]),
]
TYPE_CPS = 34.0


# ------------------------------------------------------------ drums
def drum_events():
    """Return dict name -> list of (time, velocity)."""
    ev = {'kick': [], 'snare': [], 'hat': [], 'ohat': [], 'clap': []}
    # build-up (S3c): soft kicks every beat, hats 8ths then 16ths, accelerating snare roll
    for b in range(int(round((SIL_B[0] - BUILD[0]) / BEAT))):
        t = BUILD[0] + b * BEAT
        ev['kick'].append((t, 0.35 + 0.4 * b / 12))
    for k in range(int(round((SIL_B[0] - bar_t(-2)) / (BEAT / 2)))):
        t = bar_t(-2) + k * BEAT / 2
        if t < bar_t(-1):
            ev['hat'].append((t, 0.35))
    for k in range(int(round((SIL_B[0] - bar_t(-1)) / (BEAT / 4)))):
        ev['hat'].append((bar_t(-1) + k * BEAT / 4, 0.4))
    # snare roll in the last bar of the build
    t = bar_t(-2)
    step = BEAT
    while t < SIL_B[0] - 1e-6:
        ev['snare'].append((t, 0.25 + 0.6 * (t - bar_t(-2)) / (SIL_B[0] - bar_t(-2))))
        if t >= bar_t(-2, 2):
            step = BEAT / 2
        if t >= bar_t(-1):
            step = BEAT / 4
        if t >= bar_t(-1, 2):
            step = BEAT / 8
        t += step
    # DROP: four on the floor
    t = DROP
    while t < SIL_C[0] - 1e-6:
        bi = int(round((t - DROP) / BEAT))
        ev['kick'].append((t, 1.0))
        if bi % 2 == 1:
            ev['snare'].append((t, 0.95))
            ev['clap'].append((t, 0.7))
        for q in range(4):
            vel = 0.55 if q == 2 else 0.28
            ev['hat'].append((t + q * BEAT / 4, vel))
        if bi % 4 == 3:
            ev['ohat'].append((t + BEAT / 2, 0.4))
        t += BEAT
    # half-time groove under the giant screen
    for bar in range(7, 11):
        b0 = bar_t(bar)
        ev['kick'].append((b0, 1.0))
        ev['kick'].append((b0 + 1.5 * BEAT, 0.8))
        ev['snare'].append((b0 + 2 * BEAT, 1.0))
        ev['clap'].append((b0 + 2 * BEAT, 0.6))
        if bar % 2 == 0:
            ev['kick'].append((b0 + 3.5 * BEAT, 0.6))
        for q in range(8):
            ev['hat'].append((b0 + q * BEAT / 2, 0.42 if q % 2 else 0.22))
    # riser bar: kicks every beat + accelerating roll
    for q in range(4):
        ev['kick'].append((bar_t(11, q), 0.9))
    t = bar_t(11)
    while t < ZOOM - 1e-6:
        frac = (t - bar_t(11)) / BAR
        ev['snare'].append((t, 0.3 + 0.7 * frac))
        t += BEAT / 4 if frac < 0.5 else BEAT / 8
    # S5: muffled four-on-the-floor while the screen recursion plays
    t = ZOOM
    while t < VISOR - 1e-6:
        ev['kick'].append((t, 0.85))
        for q in range(2):
            ev['hat'].append((t + q * BEAT / 2, 0.3))
        t += BEAT
    return ev


DRUMS = drum_events()
_KICKS = np.array(sorted(t for t, v in DRUMS['kick'] if t >= DROP))
_SNARES = np.array(sorted(t for t, v in DRUMS['snare'] if t >= DROP and v > 0.6))


def env_since(times, t, tau=0.09):
    """Exponential envelope following the last event before t."""
    if len(times) == 0:
        return 0.0
    i = np.searchsorted(times, t, side='right') - 1
    if i < 0:
        return 0.0
    return float(np.exp(-(t - times[i]) / tau))


def kick_env(t):
    return env_since(_KICKS, t, 0.09)


def snare_env(t):
    return env_since(_SNARES, t, 0.07)


# ------------------------------------------------------------ red light bips
def tower_blink(s):
    """Red light on top of the radio mast; same phase on the loop clock s."""
    ph = (s - 0.12) % (2 * BEAT)
    return 1.0 if ph < 0.2 else 0.0


def bip_times():
    out = []
    # scene 1 (s = t) and loop tail (s = t - DURATION)
    for k in range(-40, 40):
        s = 0.12 + k * 2 * BEAT
        if 0 <= s < S1_END:
            out.append(s)
        tt = s + DURATION
        if GLITCH_BACK + 0.3 <= tt < DURATION:
            out.append(tt)
    return sorted(out)
