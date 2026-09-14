// Frame-time instrumentation. No dependencies: a ring buffer of frame / CPU / GPU times, percentile maths, an FPS panel (F) with a
// rolling graph, and a debug overlay (F3) reading renderer.info plus our own counters. Zero allocation per frame once created.
import * as THREE from 'three';

const N = 240; // samples kept for the live panel (4 s at 60 Hz)
export const percentile = (arr, p) => { if (!arr.length) return 0; const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
// 1% low FPS: the mean of the slowest 1% of frames, expressed as FPS. This is the number that decides whether a game feels smooth.
export const lowFps = (frameMs, pct = 1) => { if (!frameMs.length) return 0; const s = Float64Array.from(frameMs).sort(); const n = Math.max(1, Math.floor(s.length * pct / 100)); let sum = 0; for (let i = s.length - n; i < s.length; i++) sum += s[i]; return 1000 / (sum / n); };

export class Perf {
  constructor(renderer) {
    this.renderer = renderer; renderer.info.autoReset = false; // we reset once per frame so the counts cover every pass of the post chain
    this.frameMs = new Float32Array(N); this.cpuMs = new Float32Array(N); this.gpuMs = new Float32Array(N); this.head = 0; this.count = 0;
    this.counters = { obstacles: 0, particles: 0, pooled: 0, ticks: 0, scale: 1, tier: '', note: '' }; this.log = [];
    this.t0 = 0; this.cpu0 = 0; this.lastFrame = 0; this.recording = null;
    // GPU timer (EXT_disjoint_timer_query_webgl2): measures the GPU side of a frame when the browser exposes it; silently absent otherwise.
    this.webgpu = !!renderer.isWebGPURenderer; const gl = this.gl = this.webgpu ? null : renderer.getContext(); this.ext = gl ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null; this.queries = []; this.gpuLast = 0;
    // Panels
    this.panel = document.createElement('div'); this.panel.id = 'perf'; this.panel.hidden = true; this.panel.innerHTML = '<div class="txt"></div><canvas width="240" height="48"></canvas>';
    this.info = document.createElement('pre'); this.info.id = 'perfinfo'; this.info.hidden = true;
    document.body.append(this.panel, this.info); this.txt = this.panel.querySelector('.txt'); this.gfx = this.panel.querySelector('canvas').getContext('2d');
    this.lastTxt = ''; this.acc = 0; this.frames = 0; this.fps = 0; this._w = { frameP95: 0, frameP50: 0, cpuP95: 0, gpuP95: 0, n: 0 };
  }
  toggle() { this.panel.hidden = !this.panel.hidden; }
  // ---- Press-to-pixel latency probe (?latency=1): on a press, a white corner quad is drawn in the very next rendered frame and the
  // input-event → render-submit delta is logged (with the number of frames in between). Budget: under 2 frames.
  enableLatency() { this.latency = { pending: 0, frames: 0, log: [] }; this.flashScene = new THREE.Scene(); this.flashCam = new THREE.OrthographicCamera(0, 1, 1, 0, 0, 1); const q = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff })); q.position.set(0.95, 0.05, 0); this.flashScene.add(q); }
  press(timeStamp) { if (this.latency && !this.latency.pending) { this.latency.pending = timeStamp; this.latency.frames = 0; } }
  // Call right after the frame has been submitted. frameStart = the rAF timestamp of this frame.
  flash(frameStart) {
    const L = this.latency; if (!L || !L.pending) return; L.frames++;
    const auto = this.renderer.autoClear; this.renderer.autoClear = false; this.renderer.render(this.flashScene, this.flashCam); this.renderer.autoClear = auto;
    const ms = performance.now() - L.pending, entry = { pressToSubmitMs: +ms.toFixed(1), frames: L.frames, frameStartDeltaMs: +(frameStart - L.pending).toFixed(1) };
    L.log.push(entry); console.log('latency', JSON.stringify(entry)); this.note(`latency ${entry.pressToSubmitMs} ms (${L.frames} frame)`); L.pending = 0;
  }
  toggleInfo() { this.info.hidden = !this.info.hidden; }
  // Call at the top of the animation loop with the rAF timestamp.
  begin(now) {
    this.renderer.info.reset(); this.t0 = now; this.cpu0 = performance.now();
    if (this.ext) { const q = this.gl.createQuery(); this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q); this.queries.push(q); this.qOpen = true; }
  }
  // Call once the frame's JS (simulation + render submission) is done.
  end() {
    const cpu = performance.now() - this.cpu0;
    if (this.qOpen) { this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.qOpen = false; this.pollGpu(); }
    if (this.webgpu) { this.renderer.resolveTimestampsAsync?.(); this.gpuLast = this.renderer.info.render.timestamp || 0; } // WebGPU timestamp queries (trackTimestamp), one frame behind
    const frame = this.lastFrame ? this.t0 - this.lastFrame : 16.7; this.lastFrame = this.t0;
    const i = this.head; this.frameMs[i] = frame; this.cpuMs[i] = cpu; this.gpuMs[i] = this.gpuLast; this.head = (i + 1) % N; this.count++;
    const r = this.recording; if (r && r.n < r.cap) { const k = r.n++; r.frame[k] = frame; r.cpu[k] = cpu; r.gpu[k] = this.gpuLast; r.calls[k] = this.renderer.info.render.calls; r.tris[k] = this.renderer.info.render.triangles; r.heap[k] = performance.memory ? performance.memory.usedJSHeapSize : 0; }
    this.acc += frame; this.frames++; if (this.acc >= 500) { this.fps = this.frames * 1000 / this.acc; this.acc = 0; this.frames = 0; if (!this.panel.hidden) this.draw(); if (!this.info.hidden) this.drawInfo(); }
  }
  pollGpu() {
    const gl = this.gl, ext = this.ext; while (this.queries.length) { const q = this.queries[0]; if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break; if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) this.gpuLast = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(q); this.queries.shift(); }
    if (this.queries.length > 8) { gl.deleteQuery(this.queries.shift()); } // never let stalled queries pile up
  }
  // Rolling stats over the last N frames (for the adaptive controllers and the panel).
  window() { const n = Math.min(N, this.count), f = n < N ? this.frameMs.subarray(0, n) : this.frameMs, c = n < N ? this.cpuMs.subarray(0, n) : this.cpuMs, g = n < N ? this.gpuMs.subarray(0, n) : this.gpuMs; const W = this._w; W.frameP95 = percentile(f, 95); W.frameP50 = percentile(f, 50); W.cpuP95 = percentile(c, 95); W.gpuP95 = this.ext || this.webgpu ? percentile(g, 95) : 0; W.n = n; return W; }
  draw() {
    const w = this.window(), ms = w.frameP50, s = `${this.fps.toFixed(0)} FPS  ${ms.toFixed(1)} ms  p95 ${w.frameP95.toFixed(1)}  cpu ${w.cpuP95.toFixed(1)}${this.ext ? `  gpu ${this.gpuLast.toFixed(1)}` : ''}  ×${this.counters.scale.toFixed(2)}`;
    if (s !== this.lastTxt) { this.txt.textContent = s; this.lastTxt = s; }
    const g = this.gfx; g.clearRect(0, 0, 240, 48); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 240, 48);
    g.fillStyle = '#4c9'; for (let k = 0; k < N; k++) { const v = this.frameMs[(this.head + k) % N], h = Math.min(48, v * 1.2); g.fillStyle = v > 25 ? '#e44' : v > 17.5 ? '#ec4' : '#4c9'; g.fillRect(k, 48 - h, 1, h); }
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(0, 48 - 16.7 * 1.2, 240, 1);
  }
  drawInfo() {
    const I = this.renderer.info, c = this.counters, gl = this.gl;
    this.info.textContent = `draw calls  ${I.render.calls}\ntriangles   ${I.render.triangles}\npoints      ${I.render.points}\ngeometries  ${I.memory.geometries}\ntextures    ${I.memory.textures}\nprograms    ${I.programs?.length ?? 0}\nobstacles   ${c.obstacles}\nparticles   ${c.particles}\npooled      ${c.pooled}\nticks/frame ${c.ticks}\nrender scale ${c.scale.toFixed(2)}  tier ${c.tier}\nbuffer      ${gl ? gl.drawingBufferWidth + '×' + gl.drawingBufferHeight : 'webgpu'}\n${c.note}\n${this.log.slice(-6).join('\n')}`;
  }
  note(s) { this.log.push(`${(performance.now() / 1000).toFixed(1)}s ${s}`); if (this.log.length > 40) this.log.shift(); }
  // ---- Benchmark recording ------------------------------------------------------------------------------------------------
  // Preallocated typed arrays (allocated before the heap is sampled) so the recording itself never shows up as heap growth.
  startRecording(cap = 120000) { const r = this.recording = { n: 0, cap, frame: new Float64Array(cap), cpu: new Float64Array(cap), gpu: new Float64Array(cap), calls: new Float64Array(cap), tris: new Float64Array(cap), heap: new Float64Array(cap) }; return r; }
  stopRecording() { const r = this.recording; this.recording = null; if (!r) return null; for (const k of ['frame', 'cpu', 'gpu', 'calls', 'tris', 'heap']) r[k] = r[k].subarray(0, r.n); return summarise(r); }
}

// Percentiles, not averages. GC pauses are inferred from heap drops (a drop of ≥ 1 MB between two consecutive frames = a collection);
// the frame that contained one is charged as the pause length.
export function summarise(r) {
  const f = r.frame, c = r.cpu, n = f.length; let gc = 0, gcMax = 0, gcOver5 = 0; const max = a => { let m = 0; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; };
  for (let i = 1; i < r.heap.length; i++) if (r.heap[i] < r.heap[i - 1] - 1e6) { gc++; gcMax = Math.max(gcMax, c[i]); if (c[i] > 5) gcOver5++; }
  const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const worst = []; let t = 0; for (let i = 0; i < n; i++) { t += f[i]; if (f[i] > 25) worst.push({ t: +(t / 1000).toFixed(2), ms: +f[i].toFixed(1), cpu: +c[i].toFixed(1) }); } worst.sort((a, b) => b.ms - a.ms);
  return {
    worst: worst.slice(0, 6), frames: n, seconds: +(f.reduce((a, b) => a + b, 0) / 1000).toFixed(1), fps: +(1000 / mean(f)).toFixed(1), low1: +lowFps(f).toFixed(1),
    frame: { p50: +percentile(f, 50).toFixed(2), p95: +percentile(f, 95).toFixed(2), p99: +percentile(f, 99).toFixed(2), max: +max(f).toFixed(1), over25: f.filter(x => x > 25).length },
    cpu: { p50: +percentile(c, 50).toFixed(2), p95: +percentile(c, 95).toFixed(2), p99: +percentile(c, 99).toFixed(2), max: +max(c).toFixed(1) },
    gpu: r.gpu.some(x => x > 0) ? { p50: +percentile(r.gpu, 50).toFixed(2), p95: +percentile(r.gpu, 95).toFixed(2) } : null,
    calls: { p50: percentile(r.calls, 50), max: max(r.calls) }, triangles: percentile(r.tris, 50),
    heap: r.heap.length && r.heap[0] ? { startMB: +(r.heap[0] / 1048576).toFixed(1), endMB: +(r.heap[r.heap.length - 1] / 1048576).toFixed(1), gcEvents: gc, gcMaxFrameMs: +gcMax.toFixed(1), gcOver5ms: gcOver5 } : null,
  };
}
