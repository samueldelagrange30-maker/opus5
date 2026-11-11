#!/bin/bash
# Planche-contact : src/sheet.sh <dossier> <scale> t1 t2 ...
dir=$1; scale=$2; shift 2
NODE_PATH=$(npm root -g) node src/preview.mjs "$dir" "$scale" "$@" 2>&1 | grep -v "^t \|^init"
ins=""; n=0; for f in $(ls "$dir"/t*.jpg | sort -V); do ins="$ins -i $f"; n=$((n+1)); done
ffmpeg -y -loglevel error $ins -filter_complex "hstack=inputs=$n" "$dir/sheet.jpg"
