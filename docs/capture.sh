#!/bin/sh
# Regenerate the README screenshots. Run from the repository root: sh docs/capture.sh
#
# Every gameplay shot is deterministic: ?bench=1 seeds Math.random and drives the robot with the
# benchmark autopilot, so a given seed always produces the same run. The capture waits for a chosen
# moment, freezes the simulation by setting timeScale to 0, and only then asks Chrome for the frame —
# otherwise the round trip to the browser would let the world scroll on before the shot lands. A
# pending HUD banner ("SHIELD", "NEW BEST!") also disqualifies a frame; it covers half the screen.
#
# Each world clears a different archetype, which sets the score each one waits for: tall is available
# from the start, wide unlocks at 250, flyer at 500, chaser at 1000. Scores below ~220 would not do —
# the difficulty band holds two chunks there, so every seed produces the same opening.
set -e
command -v node >/dev/null || { echo "node is required"; exit 1; }

SIZE=1440,900          # → a 1440×813 viewport once Chrome's own window chrome is subtracted
Q=high                 # the tier with bloom and 1024 px shadows
CAM="bolt.game.settings.set('cameraDistance',0.85)"

# Chrome captures PNG; these are noisy 3D renders, where PNG costs ~3× JPEG for no visible gain.
jpg() { sips -s format jpeg -s formatOptions 90 "docs/$1.png" --out "docs/$1.jpg" >/dev/null && rm "docs/$1.png"; }

# The autopilot holds a full jump, so the frame where an obstacle is under the robot is also the apex
# of the arc (~3.3 u): that is the shot, not a compromise.
shot() { # shot <file> <biome> <seed> <minScore> <archetype>
  echo "▶ $1"
  node check.mjs 12 "bench=1&q=$Q&biomes=$2&secs=400&seed=$3" --gpu --size=$SIZE \
    --js="$CAM" --shot="docs/$1.png" --eval="$(cat <<JS
(()=>{const SCORE=$4,ARCH='$5';return new Promise(res=>{const t0=Date.now();
const t=setInterval(()=>{const g=bolt.game,p=g.player;
if(g.state==='PLAYING'&&g.score>=SCORE&&!document.getElementById('message').textContent){let near=null;
for(const o of g.obstacles.active){const d=o.userData.def;if(d.arch!==ARCH)continue;
const x=o.userData.x;if(x>-1.5&&x<1.5){near=o;break;}}
if(near&&p.y>2.0&&!p.grounded){clearInterval(t);g.timeScale=0;
return res('ok '+near.userData.type+'@'+near.userData.x.toFixed(2)+' y='+p.y.toFixed(2)+' score='+g.score);}}
if(Date.now()-t0>150000){clearInterval(t);res('timeout '+g.state+' score='+g.score);}},4);});})()
JS
)" | grep -E '^\[eval\]|EXCEPTION' || true
  jpg "$1"
}

shot desert     desert     3  300 wide    # cactus cluster
shot city       city       5  600 flyer   # delivery drone
shot jungle     jungle     9 1100 chaser  # rolling boulder
shot frostpeak  frostpeak  4  700 tall    # icicle spike

# The health pickup and its telegraph beam, at night where the contrast plate goes white. A pickup
# only spawns while a shield is missing, so the run is held at two shields; that is the state the
# player is actually in when one appears. The first pickup of a session raises the "HEALTH" tutorial
# banner, so this waits for a later one.
echo "▶ pickup.jpg"
node check.mjs 14 "bench=1&q=$Q&biomes=city&secs=400&seed=6" --gpu --size=$SIZE \
  --js="$CAM;import('/src/hud.js').then(({hud})=>setInterval(()=>{const g=bolt.game;
if(g.state==='PLAYING'&&g.shields>2){g.shields=2;hud.shields(2,3);}},400))" \
  --shot=docs/pickup.png --eval="new Promise(res=>{const t0=Date.now();const t=setInterval(()=>{const g=bolt.game;
if(g.state==='PLAYING'&&!document.getElementById('message').textContent){
const k=g.obstacles.active.find(o=>o.userData.def.pickup&&!o.userData.def.power);
if(k&&k.userData.x>5&&k.userData.x<12&&g.obstacles.beamMat.opacity>0.4&&g.player.grounded){
clearInterval(t);g.timeScale=0;return res('ok pickup@'+k.userData.x.toFixed(1)+' beam='+g.obstacles.beamMat.opacity.toFixed(2));}}
if(Date.now()-t0>150000){clearInterval(t);res('timeout');}},4);})" | grep -E '^\[eval\]|EXCEPTION' || true
jpg pickup

# The world-select carousel: no bench mode here, just two presses (unlock, then menu → select).
echo "▶ select.jpg"
node check.mjs 14 "q=$Q&biome=jungle" --gpu --size=$SIZE --keys=Space,Space \
  --shot=docs/select.png --eval="'select state '+bolt.game.state" | grep -E '^\[eval\]|EXCEPTION' || true
jpg select

echo "Done. Screenshots are in docs/."
