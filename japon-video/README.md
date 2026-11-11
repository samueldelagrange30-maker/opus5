# Japon — paysages (vidéo 100 % générée)

`japon-paysages.mp4` : 49 secondes, 1920×1080, 24 i/s, avec bande-son.

Tout est calculé par programme : aucune photo, aucune vidéo ni aucun son externe.
Les lieux nommés dans les titres sont des **évocations de synthèse**, pas des prises de vue réelles.

| # | Plan | Technique |
|---|------|-----------|
| 1 | Mer de nuages, Alpes japonaises (lever du soleil) | relief fractal « ridged », nappe de nuages en champ de hauteur, forêts d'automne |
| 2 | Mont Fuji et son reflet dans le lac (matin de printemps) | cône volcanique érodé, neige, lac miroir avec vaguelettes, pétales de cerisier |
| 3 | Bambouseraie d'Arashiyama | chaumes par intersection rayon/cylindre sur grille, lumière tachetée, rayons de soleil |
| 4 | Rizières en terrasses | relief en gradins, rizières inondées reflétant le ciel, forêt de cèdres |
| 5 | Grand torii de Miyajima (coucher du soleil) | torii modélisé en champs de distance signés, mer et reflets, montagnes dans la brume |
| 6 | Pagode Chūreitō et mont Fuji (heure bleue) | pagode à cinq étages en SDF, cimes de cerisiers en fleurs, lune et étoiles |

## Reproduire

Prérequis : `g++` (OpenMP), `ffmpeg`, Python 3 avec `numpy` et `Pillow`.

```bash
./render_all.sh clips                       # rend les six plans (≈ 1 h sur 4 cœurs)
python3 assemble.py clips japon-paysages.mp4   # fondus, titres, musique
```

## Fichiers

- `src/core.h` — maths, bruits, cartes de hauteur, ciel, brume, tracé de rayons
- `src/scenes_terrain.h` — mer de nuages, Fuji, pagode, rizières
- `src/scenes_objects.h` — bambouseraie, torii
- `src/main.cpp` — boucle de rendu, anticrénelage adaptatif, halo, courbe filmique, grain
- `make_audio.py` — musique synthétisée (koto Karplus-Strong, gamme miyako-bushi, nappe, réverbération)
- `assemble.py` — montage final avec ffmpeg
