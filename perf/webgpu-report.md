# WebGPU evaluation (`?webgpu=1`)

Evaluation only — the game is **not** ported. Behind `?webgpu=1` the app creates `WebGPURenderer` from
`three/webgpu` (the same three.js 0.186 release; it shares `three.core.js` with the classic build, so every
material, geometry and object class the game uses is the same object and the modules keep importing from
`three`). Everything that is WebGL-only in this codebase is skipped in that mode, which is why the numbers
below are *not* like-for-like on features:

| Feature | WebGL path | `?webgpu=1` |
|---|---|---|
| Bloom (High tier) | EffectComposer + UnrealBloomPass | off (needs the TSL `PostProcessing` + `bloom()` node) |
| Sky | custom `ShaderMaterial` (sun, moon, stars, aurora) | flat horizon colour (needs a TSL rewrite) |
| High-Contrast Mode | `onBeforeCompile` GLSL injection | ignored (needs TSL `colorNode` hooks) |
| Pickup contrast plate | async `readPixels` + PBO fence | skipped (would use `readRenderTargetPixelsAsync`) |
| GPU frame time | `EXT_disjoint_timer_query_webgl2` | `trackTimestamp` + `resolveTimestampsAsync` |
| Shadows, instancing, merged geometry, Points, Sprites, fog, tone mapping | yes | yes, unchanged |

## Numbers

Apple M3, Chrome headless with the real GPU, 1280×720, vsync off, Medium tier, 20 s per biome, same seed
(`node perf/bench.mjs --webgpu --tiers=medium --secs=20`; result in `perf/webgpu-medium.json`).

| biome | renderer | fps | 1 % low | frame p50 / p95 ms | CPU p50 / p95 ms | GPU p50 / p95 ms |
|---|---|---|---|---|---|---|
| desert | WebGL2 | 565 | 140 | 2.3 / 2.9 | 2.2 / 2.6 | 1.61 / 5.41 |
| desert | WebGPU | 1931 | 525 | 0.5 / 0.8 | 0.4 / 0.5 | 0.68 / 1.06 |
| city | WebGL2 | 599 | 189 | 2.3 / 2.8 | 2.2 / 2.6 | 1.60 / 2.66 |
| city | WebGPU | 1397 | 482 | 0.7 / 1.0 | 0.6 / 0.8 | 0.90 / 1.27 |
| jungle | WebGL2 | 591 | 203 | 2.3 / 3.0 | 2.2 / 2.7 | 1.12 / 3.17 |
| jungle | WebGPU | 1355 | 478 | 0.7 / 1.1 | 0.6 / 0.8 | 0.82 / 1.34 |
| frostpeak | WebGL2 | 651 | 230 | 2.2 / 2.6 | 2.2 / 2.5 | 1.22 / 2.07 |
| frostpeak | WebGPU | 1276 | 406 | 0.7 / 1.2 | 0.7 / 0.9 | 0.93 / 1.63 |

Main-thread cost per frame drops from ~2.2 ms to ~0.6 ms (command submission is far cheaper than WebGL's
per-call validation), GPU time roughly halves, and the 1 % low more than doubles. The WebGPU run draws less
(no bloom, no sky shader), which flatters it, but those passes cost well under 1 ms on this GPU, so the gap is real.

Caveats seen during the run:
- `THREE.AttributeNode: Vertex attribute "uv" not found` for the trail ribbon and the particle `Points`
  (harmless; the node materials want a uv attribute).
- One `Destroyed texture "ShadowDepthTexture" used in a submit` validation error per frame after the tier
  switch disposes the shadow map; in WebGPU mode the manual dispose is now skipped.
- `renderer.info.render.calls` is cumulative in WebGPU (no per-frame reset), so the draw-call column is not
  comparable there.
- Not measured on the target hardware (integrated graphics, tablets). WebGPU on Android Chrome and iOS 18+
  Safari is real but younger; the WebGL2 fallback path inside `WebGPURenderer` was not exercised here.

## Recommendation

Do not migrate in this pass. The renderer swap itself is a few lines; the cost is the four WebGL-only
features above (bloom, sky shader, High-Contrast injection, pixel readback), each of which needs a TSL
rewrite, plus re-running the contrast test and the whole benchmark matrix on integrated graphics. That is
a self-contained later pass, and the numbers say it is worth scheduling: on this machine WebGPU halves GPU
time and cuts main-thread render cost by ~70 %, which is exactly the headroom a cheap tablet lacks. Until
then `?webgpu=1` stays as the evaluation switch and `perf/bench.mjs --webgpu` re-measures it.
