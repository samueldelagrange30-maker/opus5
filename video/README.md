# « La porte » — court métrage pixel art vertical (TikTok 9:16)

Vidéo de **1 min 08 s** (68,0 s), 1080×1920, 30 i/s, H.264 + AAC, entièrement
générée par code : aucun asset externe, aucun watermark, aucun logo.

Fichier final : `output/la_porte_tiktok_9x16.mp4`

## Rendu

```bash
pip install numpy scipy pillow     # + ffmpeg dans le PATH
python3 audio.py output/soundtrack.wav
python3 render.py output/la_porte_tiktok_9x16.mp4 output/soundtrack.wav
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

## Détails cachés

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
- `story.py` — les plans des 5 scènes.
- `audio.py` — la bande-son.
- `render.py` — rendu parallèle + encodage ffmpeg.
