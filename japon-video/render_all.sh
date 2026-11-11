#!/bin/bash
# Rend les six scènes en 1920x1080 à 24 i/s (9 s chacune) dans le dossier donné.
# Usage : ./render_all.sh <dossier_de_sortie>
set -e
cd "$(dirname "$0")"
OUT=${1:-clips}; W=${W:-1920}; H=${H:-1080}; N=${N:-216}; FPS=24
mkdir -p build "$OUT"
g++ -O3 -march=native -ffast-math -fsingle-precision-constant -fopenmp -std=c++17 -o build/render src/main.cpp
for s in bamboo torii unkai fuji tanada pagoda; do
  [ -f "$OUT/$s.mp4" ] && continue
  ./build/render $s $W $H 0 $((N-1)) $N $FPS 2> "$OUT/$s.log" | \
    ffmpeg -loglevel error -y -f rawvideo -pix_fmt rgb24 -s ${W}x${H} -r $FPS -i - \
      -c:v libx264 -preset fast -crf 12 -pix_fmt yuv420p "$OUT/$s.tmp.mp4"
  mv "$OUT/$s.tmp.mp4" "$OUT/$s.mp4"
  echo "ok $s"
done
