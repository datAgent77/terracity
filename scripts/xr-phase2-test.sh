#!/usr/bin/env bash
# Phase 2 emulator check (IWSDK CLI 1.0.1, needs `npm run dev`). Hands only:
#  1. hand ray + pinch on the overlay Start button
#  2. hand pinch-carries Homes from the tray to tile (6,4)
#  3. hand ray presses 2050 on the time panel (projection view)
#  4. a pinch on the placed homes while viewing 2050 is refused (read-only)
#  5. hand ray presses 2026, then Save Plan A and Finish plan on the Plan pad
set -euo pipefail
cd "$(dirname "$0")/.."
iw() { npx @iwsdk/cli "$@" 2>&1; }
state() { iw browser logs | grep -o '\[terracity\] state [^"]*' | tail -1; }
uipos() { iw browser logs | grep -v non-immersive | grep -o "\[terracity\] ui [a-z-]* $1 [-0-9.,]*" | tail -1 | awk '{print $5}'; }
find_named() {
  iw ecs find --input-json '{"withComponents":["Placeable"]}' | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const e of JSON.parse(s).data.result.entities) console.log(e.entityIndex, e.name)})'
}
idx_of() { find_named | awk -v n="$1" '$2==n{print $1}' | tail -1; }
pos() {
  iw ecs query --input-json "{\"entityIndex\":$1}" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const cs=JSON.parse(s).data.result.components;
    console.log(JSON.stringify({pos:cs.find(c=>c.componentId==="Transform").values.position.map(v=>+v.toFixed(3)),grabbed:cs.some(c=>c.componentId==="Grabbed")}))})'
}
UP='{"x":0,"y":0,"z":0,"w":1}'
hand() { iw xr animate-to --input-json "{\"device\":\"hand-right\",\"position\":{\"x\":$1,\"y\":$2,\"z\":$3},\"orientation\":$UP,\"duration\":0.4}" >/dev/null; sleep 0.7; }
pinch() { iw xr set-select-value --input-json "{\"device\":\"hand-right\",\"value\":$1}" >/dev/null; sleep 0.5; }
# Point the hand's ray at a UI element (from the dev position log) and pinch-tap.
ray_tap() {
  local P; P=$(uipos "$1"); IFS=, read -r X Y Z <<<"$P"
  # Start the ray from in front of the target (toward the seated player) so it is not grazing.
  local OX OY OZ
  OX=$(node -e "console.log(($X)*0.45)"); OY=$(node -e "console.log(($Y)+0.1)"); OZ=$(node -e "console.log(($Z)+0.3)")
  iw xr set-transform --input-json "{\"device\":\"hand-right\",\"position\":{\"x\":$OX,\"y\":$OY,\"z\":$OZ}}" >/dev/null
  iw xr look-at --input-json "{\"device\":\"hand-right\",\"target\":{\"x\":$X,\"y\":$Y,\"z\":$Z}}" >/dev/null
  sleep 0.4
  iw xr select --input-json '{"device":"hand-right","duration":0.2}' >/dev/null
  sleep 0.8
  echo "  ray-tap $1 at $P -> $(state)"
}
shot() { iw browser screenshot --output-file "docs/evidence/$1.png" >/dev/null; }

iw xr status | grep -q '"sessionActive": true' || iw xr enter >/dev/null
iw xr set-input-mode --input-json '{"mode":"hand"}' >/dev/null
iw xr set-transform --input-json '{"device":"headset","position":{"x":0,"y":1.2,"z":0.05}}' >/dev/null
iw xr look-at --input-json '{"device":"headset","target":{"x":0,"y":0.85,"z":-0.55}}' >/dev/null
sleep 2
echo "start state: $(state)"
shot phase2-xr-intro

echo "== 1. Start via hand ray"
ray_tap ov-primary

echo "== 2. pinch Homes -> (6,4)"
T=$(idx_of tray-residential)
hand -0.17 0.81 -0.14; pinch 1; hand -0.10 0.95 -0.35; hand -0.03 0.83 -0.53; pinch 0
echo "  placeables: $(find_named | tr '\n' ' ')"
hand 0.1 1.0 -0.1

echo "== 3. 2050 via hand ray"
ray_tap year-2050
sleep 1.2
shot phase2-xr-2050

echo "== 4. pinch the placed homes while viewing 2050 -> refused, stays put"
H=$(idx_of residential-1); echo "  homes before: $(pos "$H")"
hand -0.03 0.83 -0.53; pinch 1; hand 0.1 0.95 -0.4; echo "  while pinching: $(pos "$H")"; pinch 0
echo "  after: $(pos "$H")"
hand 0.1 1.0 -0.1

echo "== 5. back to 2026, Save Plan A, Finish"
ray_tap year-2026
ray_tap btn-save-a
ray_tap btn-finish
sleep 1.2
shot phase2-xr-result
