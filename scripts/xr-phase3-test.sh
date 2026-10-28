#!/usr/bin/env bash
# Phase 3 emulator check (IWSDK CLI 1.0.1, needs `npm run dev`). Hands only:
#  1. Start via hand ray; tip 1 is shown
#  2. hover: an index tip near the Homes token makes it grow (scale 1.12)
#  3. pinch Homes onto the glowing tile (6,4) -> tip 2
#  4. hand ray on "Larger text" scales the spatial panels; again to restore
#  5. hand ray on "Skip tips" hides the coach
#  6. screenshot: mixed reality keeps the background transparent (passthrough)
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
  # Start the ray ~55% of the way from the target toward the eyes (arm's length):
  # closer than ~25 cm IWSDK hands over to the finger poke pointer instead.
  local OX OY OZ
  OX=$(node -e "console.log($X+(0-($X))*0.55)"); OY=$(node -e "console.log($Y+(1.15-($Y))*0.55)"); OZ=$(node -e "console.log($Z+(0.1-($Z))*0.55)")
  iw xr set-transform --input-json "{\"device\":\"hand-right\",\"position\":{\"x\":$OX,\"y\":$OY,\"z\":$OZ}}" >/dev/null
  iw xr look-at --input-json "{\"device\":\"hand-right\",\"target\":{\"x\":$X,\"y\":$Y,\"z\":$Z}}" >/dev/null
  sleep 0.4
  iw xr select --input-json '{"device":"hand-right","duration":0.2}' >/dev/null
  sleep 0.8
  echo "  ray-tap $1 at $P -> $(state)"
}
shot() { iw browser screenshot --output-file "docs/evidence/$1.png" >/dev/null; }

scale() {
  iw ecs query --input-json "{\"entityIndex\":$1}" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const cs=JSON.parse(s).data.result.components;
    console.log(cs.find(c=>c.componentId==="Transform").values.scale.map(v=>+v.toFixed(2)).join(","))})'
}
panel_scale() {
  local i; i=$(iw ecs find --input-json '{"withComponents":["ScreenSpace"]}' | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const e of JSON.parse(s).data.result.entities) if(e.name==="HUD Panel"||e.name==="hud-panel") console.log(e.entityIndex)})' | head -1)
  scale "$i"
}

iw xr status | grep -q '"sessionActive": true' || iw xr enter >/dev/null
iw xr set-input-mode --input-json '{"mode":"hand"}' >/dev/null
iw xr set-transform --input-json '{"device":"headset","position":{"x":0,"y":1.2,"z":0.05}}' >/dev/null
iw xr look-at --input-json '{"device":"headset","target":{"x":0,"y":0.85,"z":-0.55}}' >/dev/null
sleep 2

echo "== 1. Start"
ray_tap ov-primary

echo "== 2. hover"
T=$(idx_of tray-residential)
hand 0.1 1.0 -0.1; echo "  token scale far:  $(scale "$T")"
hand -0.17 0.81 -0.14; echo "  token scale near: $(scale "$T")"
shot phase3-xr-hover

echo "== 3. pinch Homes onto (6,4)"
pinch 1; hand -0.10 0.95 -0.35; hand -0.03 0.83 -0.53; pinch 0
hand 0.1 1.0 -0.1
sleep 0.5; echo "  $(state)"

echo "== 4. Larger text via hand ray"
echo "  HUD scale before: $(panel_scale)"
ray_tap btn-text-size
echo "  HUD scale after:  $(panel_scale)"
shot phase3-xr-large-text
ray_tap btn-text-size

echo "== 5. Skip tips via hand ray"
ray_tap btn-skip-tips

echo "== 6. passthrough-friendly background"
shot phase3-xr-passthrough
