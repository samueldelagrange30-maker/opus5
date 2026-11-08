# « La porte » — court métrage pixel art vertical (TikTok 9:16)

Vidéo de **1 min 08 s** (68,0 s), 1080×1920, 30 i/s, H.264 + AAC, entièrement
générée par code : aucun asset externe, aucun watermark, aucun logo.

Fichiers finaux :
- Partie 1 : `output/la_porte_tiktok_9x16.mp4`
- Partie 2 : `output/la_porte_partie2_tiktok_9x16.mp4`
- Partie 3 : `output/la_porte_partie3_tiktok_9x16.mp4`

## Rendu

```bash
pip install numpy scipy pillow     # + ffmpeg dans le PATH
python3 audio.py output/soundtrack.wav
python3 render.py output/la_porte_tiktok_9x16.mp4 output/soundtrack.wav
# partie 2
python3 audio2.py output/soundtrack2.wav
python3 render.py output/la_porte_partie2_tiktok_9x16.mp4 output/soundtrack2.wav story2
# partie 3
python3 audio3.py output/soundtrack3.wav
python3 render.py output/la_porte_partie3_tiktok_9x16.mp4 output/soundtrack3.wav story3
```

L'image est calculée en 270×480 (vrais pixels) puis agrandie ×4 au plus proche
voisin, avec une palette fixe 16-bit et un tramage ordonné.

## Découpage

| Temps | Scène | Ce qui se passe |
|---|---|---|
| 0–5,5 s | 1. Accroche | Rue néon sous la pluie, lumière rouge qui clignote au loin. « Il n'aurait jamais dû ouvrir cette porte… » |
| 5,5–17 s | 2. Mystère | Un éclair fait apparaître une porte qui respire et change de forme. Une silhouette apparaît derrière lui. « Pourtant, quelque chose l'attendait de l'autre côté. » |
| 17–34 s | 3. Tension | Silence, la porte s'ouvre seule : à travers, la même ville… en miroir et abandonnée. Les lampadaires s'allument un à un, la dernière lumière révèle la silhouette (travelling compensé). « Et cette ville… lui ressemblait étrangement. » |
| 34–54,6 s | 4. Accélération | Drop à 140 BPM : la silhouette court, décors déformés, lumières qui clignotent sur les kicks, coupes de plus en plus rapides. Silence, puis un écran géant (au format 9:16) affiche son visage. « Puis il a compris qu'il était observé depuis le début. » |
| 54,6–68 s | 5. Révélation | Zoom dans l'écran → la caméra passe derrière lui (écran récursif) → on découvre qu'on regarde par les yeux de la silhouette (visière, mains). Il se retourne vers nous. « Mais alors… qui regarde cette vidéo ? » La dernière image raccorde exactement avec la première (boucle parfaite). |

## Partie 2 — « Chaque silhouette… portait son visage »

Mêmes paramètres : 68,0 s, 9:16, pixel art 16-bit, 5 actes, sous-titres pixel,
synthwave/dark ambient (do mineur), 140 BPM dans l'action, silences avant les
révélations, boucle parfaite.

| Temps | Scène | Ce qui se passe |
|---|---|---|
| 0–5,5 s | 1. Accroche | Il marche vers nous sous la pluie et nous fixe. « Cette fois, il savait qu'on le regardait. » |
| 5,5–17 s | 2. Mystère | Il s'enfuit, les lampadaires meurent derrière lui ; une porte surgit devant, une autre derrière, puis à l'infini. « Il a couru… mais chaque rue le ramenait à la porte. » |
| 17–34 s | 3. Tension | Toutes les portes s'ouvrent ; une silhouette sort de chacune, une par une, puis elles avancent. « Puis les portes se sont ouvertes… toutes en même temps. » |
| 34–54,6 s | 4. Accélération | Poursuite à 140 BPM, il est encerclé. Silence, flash rouge : les silhouettes sont des copies de lui. « Chaque silhouette… portait son visage. » |
| 54,6–68 s | 5. Révélation | Zoom dans l'œil d'une copie ; il se vide de ses couleurs et devient l'une d'elles. On regarde par ses yeux un « nouveau » lui arriver… « Et toi… combien de fois l'as-tu déjà regardée ? » La fin raccorde avec la première image. |

Détails cachés de la partie 2 : au loin, dans la première scène, le « lui » de
la partie 1 s'éloigne ; une silhouette sur un toit quand il se retourne ;
l'œil brodé dans le dos de chaque copie ; les carillons descendent là où ils
montaient dans la partie 1 ; le point rouge de la visière bat toujours au
rythme de la lumière rouge du début.

## Partie 3 — « La lumière rouge »

Mêmes paramètres que les parties 1 et 2 (68 s, 9:16, 5 actes, 140 BPM dans
l'action, silences, boucle parfaite), en la mineur avec un leitmotiv de 4 notes
(le « thème de la lumière rouge ») qu'on entend dans les bips, les lampadaires,
le lead et la cloche finale.

| Temps | Scène | Ce qui se passe |
|---|---|---|
| 0–5,5 s | 1. Accroche | La rue est vide ; il entre dans le cadre et fixe la lumière rouge. « Depuis le début, une lumière rouge clignotait au loin. » |
| 5,5–17 s | 2. Mystère | Il marche vers elle et ignore la porte qui s'entrouvre ; la lumière recule à chaque pas. Ses copies sur les toits. « Il a ignoré la porte… mais la lumière ne se rapprochait jamais. » |
| 17–34 s | 3. Tension | Tout s'éteint ; une piste de lampadaires s'allume vers la lumière, une copie sous chacun. Elles se tournent toutes vers nous. « Et toutes ses copies… regardaient dans la même direction. » |
| 34–54,6 s | 4. Accélération | Sprint à 140 BPM, l'écran se désagrège en blocs, flashs des parties 1 et 2. Au bout : une vitre, et derrière, un visage géant éclairé par un écran. La lumière rouge était le voyant de sa caméra. « Au bout de la rue… il n'y avait que toi. » |
| 54,6–68 s | 5. Révélation | On passe de l'autre côté de la vitre — notre écran. Il frappe : l'écran se fissure, sa main traverse. Puis la rue est vide. « Il est sorti… ne te retourne pas. » La boucle recommence quand il rentre dans le cadre. |

Améliorations : éclaboussures de pluie au sol, respiration des personnages au
repos, plan latéral façon jeu de plateforme, désagrégation de l'image en blocs,
mixage plus fort sans saturation.

Détails cachés de la partie 3 : le visage apparaît deux images pendant un
éclair à 2,4 s ; le pylône radio a disparu (la lumière n'était pas sur un
pylône) ; l'encoche de caméra autour de la lumière rouge ; le reflet du héros
dans la flaque en bas de l'image finale… et un pas, derrière, à 61,6 s.

## Détails cachés (partie 1)

- Une silhouette minuscule au fond de la rue dès la scène 1 (1,6–3,4 s).
- L'œil en néon sur le mur : fermé au début, il s'ouvre au moment où la silhouette apparaît.
- Le même œil est brodé dans le dos de la veste du héros.
- Une caméra de surveillance suit le héros ; un chat aux yeux brillants sur une enseigne (yeux rouges dans l'autre ville).
- L'autre ville est un miroir exact (enseignes et bâtiments inversés).
- La LED rouge de veille de l'écran géant est visible avant qu'il ne s'allume.
- Le point rouge de la visière clignote au même rythme que la lumière rouge du début.
- L'écran géant affiche ce que voit la silhouette… y compris la visière.

## Son

Synthèse procédurale (`audio.py`) : drone dark ambient, pluie, battement de
cœur à 70 BPM sous la porte, carillons 8-bit à chaque lampadaire, montée,
drop synthwave à 140 BPM (kick, basse roulante, arpèges 8-bit), groove
half-time sous l'écran, glitchs, impacts et quatre silences très courts avant
les révélations. Aucune voix. L'ambiance de fin est générée sur la même horloge
que le début : la boucle est aussi continue à l'oreille.

## Fichiers

- `core.py` — résolution, palette/quantification, caméra, police pixel.
- `world.py` — moteur de rue pseudo-3D (lancer de rayons analytique, façades, néons, porte, écran).
- `puppet.py` — personnages 3D rendus directement en pixels (ombrage cel, contours).
- `engine.py` — composition : lumières, faisceaux volumétriques, brouillard, pluie, bloom, effets.
- `timeline.py` — tous les repères temporels et la batterie, partagés image/son.
- `story.py` / `story2.py` / `story3.py` — les plans des 5 scènes de chaque partie.
- `timeline2.py` / `timeline3.py` — repères des parties 2 et 3.
- `audio.py` / `audio2.py` / `audio3.py` — les bandes-son.
- `render.py` — rendu parallèle + encodage ffmpeg.
