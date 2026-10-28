#!/usr/bin/env bash
# Phase 1 emulator check (IWSDK CLI 1.0.1, needs `npm run dev`):
#  1. hand pinches the Homes token in the tray, carries it to tile (6,4), releases
#  2. hand pinches the Wind token, twists the wrist 90 deg, releases on ridge (12,8)
#  3. hand pinches the placed homes and drops them off the board -> removed
#  4. controller ray presses the Undo button on the action pad -> homes return
#  5. controller squeeze carries the Park token to tile (9,3)
set -euo pipefail
cd "$(dirname "$0")/.."
iw() { npx @iwsdk/cli "$@" 2>&1; }
find_named() { # prints "index name" for every Placeable
  iw ecs find --input-json '{"withComponents":["Placeable"]}' | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const e of JSON.parse(s).data.result.entities) console.log(e.entityIndex, e.name)})'
}
idx_of() { find_named | awk -v n="$1" '$2==n{print $1}' | tail -1; }
pose() {
  iw ecs query --input-json "{\"entityIndex\":$1}" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const cs=JSON.parse(s).data.result.components;
    const t=cs.find(c=>c.componentId==="Transform").values;
    const q=t.orientation; const yaw=Math.atan2(2*(q[3]*q[1]+q[0]*q[2]),1-2*(q[1]*q[1]+q[2]*q[2]))*180/Math.PI;
    console.log(JSON.stringify({pos:t.position.map(v=>+v.toFixed(3)), yawDeg:Math.round(yaw), grabbed:cs.some(c=>c.componentId==="Grabbed")}))})'
}
hand() { iw xr animate-to --input-json "{\"device\":\"hand-right\",\"position\":{\"x\":$1,\"y\":$2,\"z\":$3}${4:+,\"orientation\":$4},\"duration\":${5:-0.5}}" >/dev/null; sleep 0.8; }
pinch() { iw xr set-select-value --input-json "{\"device\":\"hand-right\",\"value\":$1}" >/dev/null; sleep 0.5; }
shot() { iw browser screenshot --output-file "docs/evidence/$1.png" >/dev/null; }

iw xr status | grep -q '"sessionActive": true' || iw xr enter >/dev/null
iw xr set-input-mode --input-json '{"mode":"hand"}' >/dev/null
iw xr set-transform --input-json '{"device":"headset","position":{"x":0,"y":1.3,"z":0.2}}' >/dev/null
iw xr look-at --input-json '{"device":"headset","target":{"x":0,"y":0.78,"z":-0.45}}' >/dev/null
UP='{"x":0,"y":0,"z":0,"w":1}'

echo "== 1. tray Homes -> tile (6,4)"
T=$(idx_of tray-residential); echo "token entity $T: $(pose "$T")"
hand -0.17 0.81 -0.14 "$UP"; pinch 1; echo "pinched: $(pose "$T")"
hand -0.10 0.95 -0.35 "$UP"; hand -0.03 0.83 -0.53 "$UP"
shot phase1-xr-carry-homes
pinch 0; echo "released: $(pose "$T")"
echo "placeables now: $(find_named | tr '\n' ' ')"
hand 0.0 1.0 -0.2 "$UP"

echo "== 2. tray Wind -> twist 90deg -> ridge (12,8)"
W=$(idx_of tray-wind); echo "token entity $W"
hand 0.0 0.84 -0.14 "$UP"; pinch 1
hand 0.2 0.98 -0.25 '{"x":0,"y":0.7071,"z":0,"w":0.7071}'
hand 0.33 0.92 -0.29 '{"x":0,"y":0.7071,"z":0,"w":0.7071}'
echo "carried+twisted: $(pose "$W")"
pinch 0; echo "released: $(pose "$W")"
hand 0.0 1.0 -0.2 "$UP"
shot phase1-xr-wind-placed

echo "== 3. grab placed homes, drop off the board -> remove"
H=$(idx_of residential-1); echo "homes entity $H: $(pose "$H")"
hand -0.03 0.83 -0.53 "$UP"; pinch 1
hand -0.3 1.0 -0.3 "$UP"; hand -0.6 0.9 -0.4 "$UP"
shot phase1-xr-drop-off-board
pinch 0
echo "placeables after drop: $(find_named | tr '\n' ' ')"
hand 0.0 1.0 -0.2 "$UP"

echo "== 4. controller ray -> Undo button"
UNDO=$(iw browser logs | grep -v non-immersive | grep -o '\[terracity\] ui [a-z-]* btn-undo [-0-9.,]*' | tail -1 | awk '{print $5}')
echo "undo button at $UNDO"
IFS=, read -r UX UY UZ <<<"$UNDO"
iw xr set-input-mode --input-json '{"mode":"controller"}' >/dev/null
iw xr set-transform --input-json '{"device":"controller-right","position":{"x":0.25,"y":1.0,"z":-0.1}}' >/dev/null
iw xr look-at --input-json "{\"device\":\"controller-right\",\"target\":{\"x\":$UX,\"y\":$UY,\"z\":$UZ}}" >/dev/null
sleep 0.5
iw xr select --input-json '{"device":"controller-right","duration":0.2}' >/dev/null
sleep 0.8
echo "placeables after undo: $(find_named | tr '\n' ' ')"
shot phase1-xr-after-undo

echo "== 5. controller squeeze: Park token -> tile (9,3)"
P=$(idx_of tray-park); echo "token entity $P"
ctrl() { iw xr set-transform --input-json "{\"device\":\"controller-right\",\"position\":{\"x\":$1,\"y\":$2,\"z\":$3},\"orientation\":{\"x\":0,\"y\":0,\"z\":0,\"w\":1}}" >/dev/null; sleep 0.5; }
squeeze() { iw xr set-gamepad-state --input-json "{\"device\":\"controller-right\",\"buttons\":[{\"index\":1,\"value\":$1}]}" >/dev/null; sleep 0.5; }
ctrl 0.085 0.79 -0.14; squeeze 1; echo "squeezed: $(pose "$P")"
ctrl 0.12 0.95 -0.35; ctrl 0.15 0.81 -0.59
squeeze 0; echo "released: $(pose "$P")"
echo "placeables: $(find_named | tr '\n' ' ')"
ctrl 0.25 1.0 -0.1
shot phase1-xr-controller-park
iw xr set-input-mode --input-json '{"mode":"hand"}' >/dev/null
