# opus5 — Tokyo Midnight Drift

Vidéo verticale **9:16 (1080×1920, 30 i/s, 1 min 07,5 s)** d'un coupé sport japonais qui drifte de nuit
dans Tokyo — format TikTok / Reels / Shorts.

➡️ **Vidéo finale : [`out/tokyo-drift.mp4`](out/tokyo-drift.mp4)**

Tout est **procédural** : aucune image, aucun modèle 3D ni son externe. La scène est décrite en code
(Three.js), rendue image par image dans Chromium headless, puis assemblée par ffmpeg avec une
bande-son entièrement synthétisée.

## Contenu de la vidéo

| Temps | Séquence |
|---|---|
| 0:00 – 0:04 | Titre « 東京 — Midnight Drift », burnout à l'arrêt |
| 0:04 – 0:15 | Départ vers la tour, enchaînement de dérives en « manji » sur l'avenue |
| 0:15 – 0:30 | Trois virages à 90° en glisse (plans fixes, poursuite, téléobjectif, hélico) |
| 0:30 – 0:34 | Break musical : caméra pare-chocs en ligne droite |
| 0:34 – 0:45 | Appel/contre-appel, deux nouveaux virages en drift |
| 0:45 – 0:57 | Donuts sur le carrefour à passages piétons diagonaux (vue zénithale, caméra au centre) |
| 0:57 – 1:07 | Sortie vers la tour, arrêt en travers, plan final et fondu |

## Reconstruire la vidéo

Prérequis : Node 22+, ffmpeg, Playwright avec Chromium (WebGL logiciel SwiftShader suffisant).

```bash
npm install
npm run audio     # build/audio.wav  (quelques secondes)
npm run render    # build/frames/*.jpg puis out/tokyo-drift.mp4  (~25 min sur 4 cœurs sans GPU)
```

Options de `src/render.mjs` : `--scale 0.3 --step 2` (aperçu rapide), `--workers N`, `--crf 21`.
Le rendu est reprenable : les images déjà présentes dans `build/frames` ne sont pas recalculées.
Aperçus d'images isolées : `src/sheet.sh <dossier> <échelle> <t1> <t2> …`.

## Organisation du code

| Fichier | Rôle |
|---|---|
| `src/path.js` | Tracé (droites + arcs), profil de vitesse, angle de dérive : `state(t)` déterministe, partagé image/son |
| `src/city.js` | Ville : chaussée mouillée réfléchissante, immeubles, enseignes néon, écrans, lampadaires, tour treillis |
| `src/car.js` | Voiture modélisée par lofting de sections, roues, optiques, halos, flammes d'échappement |
| `src/fx.js` | Billboards instanciés, fumée de pneus (fonction pure du temps), traces de gomme |
| `src/cameras.js` | 22 plans calés sur les mesures de la musique (128 BPM) |
| `src/main.js` | Rendu : reflets, bloom, FXAA, flou de vitesse, titre, grain, fondus |
| `src/audio.mjs` | Moteur 6 cylindres, crissements, retours de flamme, instrumental original |
| `src/render.mjs` | Orchestration : pages Chromium en parallèle → JPEG → ffmpeg (H.264 + AAC) |

Chaque image ne dépend que de son instant `t` : le rendu peut donc être réparti sur plusieurs
processus et repris après interruption.
