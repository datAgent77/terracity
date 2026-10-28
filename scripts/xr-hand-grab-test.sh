#!/usr/bin/env bash
# Phase 0 emulator check: right hand pinches the residential cluster, carries it
# to a farmland tile, releases, and we read back the live ECS transform.
# Requires a running `npx @iwsdk/cli dev up` runtime. IWSDK CLI 1.0.1.
set -euo pipefail
cd "$(dirname "$0")/.."
iw() { npx @iwsdk/cli "$@" 2>&1; }
pos() {
  iw ecs query --input-json "{\"entityIndex\":$1}" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const cs=JSON.parse(s).data.result.components;
    const t=cs.find(c=>c.componentId==="Transform").values; const p=t.position.map(v=>+v.toFixed(3));
    console.log(JSON.stringify({worldPosition:p, grabbed:cs.some(c=>c.componentId==="Grabbed")}));});'
}
IDX=$(iw ecs find --input-json '{"withComponents":["Placeable"]}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.result.entities[0].entityIndex))')
echo "entity: $IDX"
iw xr status | grep -q '"sessionActive": true' || iw xr enter >/dev/null
iw xr set-input-mode --input-json '{"mode":"hand"}' >/dev/null
iw xr set-transform --input-json '{"device":"headset","position":{"x":0,"y":1.25,"z":0.05}}' >/dev/null
iw xr look-at --input-json '{"device":"headset","target":{"x":0,"y":0.78,"z":-0.5}}' >/dev/null
echo "before:   $(pos "$IDX")"
iw xr animate-to --input-json "{\"device\":\"hand-right\",\"position\":{\"x\":${HX:-0.27},\"y\":${HY:-0.83},\"z\":${HZ:--0.59}},\"duration\":0.4}" >/dev/null
sleep 0.8
iw xr set-select-value --input-json '{"device":"hand-right","value":1}' >/dev/null
sleep 0.5
echo "pinched:  $(pos "$IDX")"
iw xr animate-to --input-json '{"device":"hand-right","position":{"x":-0.09,"y":0.83,"z":-0.35},"duration":0.8}' >/dev/null
sleep 1.2
echo "carried:  $(pos "$IDX")"
iw browser screenshot --output-file docs/evidence/phase0-xr-hand-carry.png >/dev/null
iw xr set-select-value --input-json '{"device":"hand-right","value":0}' >/dev/null
sleep 0.5
echo "released: $(pos "$IDX")"
iw xr animate-to --input-json '{"device":"hand-right","position":{"x":0.25,"y":1.0,"z":-0.2},"duration":0.3}' >/dev/null
sleep 0.5
iw browser screenshot --output-file docs/evidence/phase0-xr-hand-placed.png >/dev/null

# Rejection path: carry the homes over the sea and release -> must snap back.
iw xr animate-to --input-json '{"device":"hand-right","position":{"x":-0.09,"y":0.83,"z":-0.35},"duration":0.3}' >/dev/null
sleep 0.6
iw xr set-select-value --input-json '{"device":"hand-right","value":1}' >/dev/null
sleep 0.5
iw xr animate-to --input-json '{"device":"hand-right","position":{"x":0.0,"y":0.86,"z":-0.76},"duration":0.8}' >/dev/null
sleep 1.2
echo "over sea: $(pos "$IDX")"
iw browser screenshot --output-file docs/evidence/phase0-xr-hand-over-sea.png >/dev/null
iw xr set-select-value --input-json '{"device":"hand-right","value":0}' >/dev/null
sleep 0.5
echo "rejected: $(pos "$IDX")  (expect snap back to [-0.09,0.8,-0.35])"
iw xr animate-to --input-json '{"device":"hand-right","position":{"x":0.25,"y":1.0,"z":-0.2},"duration":0.3}' >/dev/null
sleep 0.5
iw browser screenshot --output-file docs/evidence/phase0-xr-hand-rejected.png >/dev/null
