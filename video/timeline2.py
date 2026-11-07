"""Timeline of part 2 (« La porte — Partie 2 »).  Same grid and parameters as
part 1 (68 s, 140 BPM sections, silences before the reveals) so the two
videos feel like one series."""
from core import BEAT, BAR, DROP, bar_t, DURATION
from timeline import (DRUMS, kick_env, snare_env, tower_blink, LAMPS_ON, REVEAL, BUILD, SIL_B,
                      SIL_C, RISER, ZOOM, POV, VISOR, TYPE_CPS, CUTS)

S1_END = 5.5
STOP_S = 3.4                 # the hero stops in front of the observer (loop clock)
RUN0 = 5.75
DOOR_AHEAD = 8.6             # first door appears in front of him
TURN_BACK = 10.0
DOOR_BEHIND = 10.3
DETAIL = (10.9, 11.35)       # silhouette on a rooftop
CRANE = 11.6
HEART0 = 6.0
SIL_A = (16.6, 17.0)
DOOR_OPEN = 17.0
EMERGE = 17.7
APPEAR = LAMPS_ON            # 8 silhouettes, one every 2 beats (20.286 .. 26.286)
CUT_3C = bar_t(-7, 3)        # 23.286
SLAM = SIL_B[0]              # doors slam shut in the silence
FACE_ON = bar_t(7)           # 46.0 : red flash, the faces are revealed
D2 = bar_t(9)
D3 = bar_t(10)
D4 = RISER
TRANS = (POV, POV + 1.3)     # 55.714 .. 57.014 drain
HIT = VISOR                  # 57.143
SIL_D = (59.4, 59.7)
POV2 = SIL_D[1]
VFADE = (63.5, 65.5)
LOOP = 65.5

SUBS = [
    (0.25, 4.95, ["Cette fois, il savait", "qu'on le regardait."]),
    (6.3, 11.0, ["Il a couru…", "mais chaque rue", "le ramenait à la porte."]),
    (17.6, 22.6, ["Puis les portes", "se sont ouvertes…", "toutes en même temps."]),
    (46.45, 52.75, ["Chaque silhouette…", "portait son visage."]),
    (59.7, 63.42, ["Et toi…", "combien de fois", "l'as-tu déjà regardée ?"]),
]
