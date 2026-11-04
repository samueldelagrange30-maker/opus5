#!/bin/bash
# Compile l'app pour le simulateur et prend des captures du tableau de bord en mode démo.
set -euo pipefail
BUNDLE=com.samueldelagrange.carinfo
mkdir -p shots

xcodebuild -project CarInfo.xcodeproj -scheme CarInfo -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build-sim CODE_SIGNING_ALLOWED=NO build > sim-build.log 2>&1 || { grep -E "error:" sim-build.log | head -50; exit 1; }
APP=build-sim/Build/Products/Debug-iphonesimulator/CarInfo.app

pick() { xcrun simctl list devices available | grep -E "$1" | head -1 | grep -oE '[0-9A-F-]{36}'; }

shoot() { # udid nom args...
  local udid=$1 name=$2; shift 2
  xcrun simctl terminate "$udid" "$BUNDLE" >/dev/null 2>&1 || true
  xcrun simctl launch "$udid" "$BUNDLE" "$@" >/dev/null
  sleep 9
  xcrun simctl io "$udid" screenshot "shots/$name.png" >/dev/null
  echo "capture $name"
}

for spec in "iPad Pro 13|ipad" "iPhone 16 Pro \(|iphone"; do
  pattern=${spec%%|*}; prefix=${spec##*|}
  UDID=$(pick "$pattern") || true
  [ -z "${UDID:-}" ] && { echo "pas de simulateur pour $pattern"; continue; }
  xcrun simctl boot "$UDID" || true
  xcrun simctl bootstatus "$UDID" -b >/dev/null
  xcrun simctl install "$UDID" "$APP"
  for tab in vehicule ouvrants entretien moteur; do
    shoot "$UDID" "$prefix-$tab" -demo -landscape -tab "$tab"
  done
  if [ "$prefix" = iphone ]; then
    xcrun simctl uninstall "$UDID" "$BUNDLE"; xcrun simctl install "$UDID" "$APP"
    shoot "$UDID" "$prefix-portrait" -demo -tab vehicule
  fi
  xcrun simctl shutdown "$UDID" || true
done
