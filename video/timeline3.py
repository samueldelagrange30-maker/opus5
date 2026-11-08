"""Timeline of part 3 (« La lumière rouge »): same grid as parts 1 and 2."""
from core import BEAT, BAR, DROP, bar_t, DURATION
from timeline import (DRUMS, kick_env, snare_env, tower_blink, LAMPS_ON, REVEAL, BUILD, SIL_B,
                      SIL_C, RISER, ZOOM, POV, VISOR, TYPE_CPS, CUTS)

S1_END = 5.5
STOP1 = 4.0                  # he stops and stares at the red light (loop clock)
WALK2 = 5.8                  # he walks toward it
DOOR_APPEAR = 8.6
DOOR_CRACK = (10.4, 11.8)    # the door opens a crack as he passes
DOOR_GONE = 13.0
ROOF = (14.0, 14.9)          # his copies on the rooftops (hidden detail)
STOP2 = 16.4
SIL_A = (16.6, 17.0)
LIGHTS_OUT = 17.0
RUNWAY = LAMPS_ON            # 8 lamps toward the light, a copy under each
SIL_B = SIL_B
FACE_ON = bar_t(7)           # 46.0 the glass, the face
D2 = bar_t(9)
D3 = bar_t(10)
D4 = RISER                   # 52.857
PRESS = 53.8                 # palm against the glass
THROUGH = (ZOOM, POV)        # 54.571 .. 55.714 camera passes through the glass
PUNCH1 = VISOR               # 57.143
PUNCH2 = 58.0
HAND = (58.8, 59.35)
SIL_D = (59.4, 59.7)
POV2 = 59.7
HEAL = (63.4, 63.7)
REFLECT = (61.0, 63.2)       # hidden: his reflection, behind you
LOOP = 65.5
FLASH_STILLS = [bar_t(3, 2), bar_t(4, 2), bar_t(5, 2.5), bar_t(6, 1.5)]

SUBS = [
    (0.25, 4.95, ["Depuis le début,", "une lumière rouge", "clignotait au loin."]),
    (6.3, 11.6, ["Il a ignoré la porte…", "mais la lumière", "ne se rapprochait jamais."]),
    (21.6, 26.6, ["Et toutes ses copies…", "regardaient", "dans la même direction."]),
    (46.45, 52.75, ["Au bout de la rue…", "il n'y avait que toi."]),
    (59.7, 63.42, ["Il est sorti…", "ne te retourne pas."]),
]
