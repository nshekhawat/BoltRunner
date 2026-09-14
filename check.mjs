// Headless smoke test via Chrome DevTools Protocol. No deps (Node ≥22 has fetch + WebSocket).
// usage: node check.mjs [seconds] [query] [--shot=out.png] [--keys=Space,ArrowDown] [--js="run after keys"] [--eval="js, result printed, promises awaited"] [--size=W,H] [--mobile] [--touch] [--gpu] [--uncapped] [--heap] [--cpuprofile] [--webgpu]
import { spawn, execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const secs = +(args.find(a => /^\d+$/.test(a)) ?? 6);
const query = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a)) ?? '';
const opt = k => args.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const PORT = 8765, DBG = 9333;
const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' });
const PROFILE = `/tmp/boltchrome-${process.pid}`;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', ...(args.includes('--gpu') ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), `--window-size=${opt('size') ?? '1280,720'}`, // --gpu: real GPU (frame-time checks)
  '--no-first-run', '--js-flags=--expose-gc', '--enable-precise-memory-info', ...(args.includes('--uncapped') ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : []), ...(args.includes('--webgpu') ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU'] : []), `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${DBG}`, // --uncapped: no vsync, frame time = real throughput
  '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws; for (let i = 0; i < 40 && !ws; i++) { await sleep(250); try { const t = await (await fetch(`http://localhost:${DBG}/json`)).json(); ws = t.find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise(r => sock.onopen = r);
let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); sock.send(JSON.stringify({ id, method, params })); });
const lines = [];
sock.onmessage = ({ data }) => {
  const m = JSON.parse(data);
  if (m.id) return pending.get(m.id)?.(m.result), pending.delete(m.id);
  if (m.method === 'Runtime.consoleAPICalled') lines.push(`[${m.params.type}] ${m.params.args.map(a => a.value ?? a.description ?? '').join(' ')}`);
  if (m.method === 'Runtime.exceptionThrown') lines.push(`[EXCEPTION] ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) lines.push(`[HTTP ${m.params.response.status}] ${m.params.response.url}`);
  if (m.method === 'Network.loadingFailed') lines.push(`[NETFAIL] ${m.params.errorText}`);
};
await send('Runtime.enable'); await send('Network.enable'); await send('Log.enable');
if (args.includes('--mobile')) { // Samsung Galaxy S24 Ultra CSS viewport
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 3.5, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36' });
}
const tap = async (x, y, hold = 60) => { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(hold); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
const swipeDown = async (x, y) => { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); for (let i = 1; i <= 5; i++) { await sleep(20); await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 25 }] }); } await sleep(150); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
await send('Page.navigate', { url: `http://localhost:${PORT}/?${query}` });
// wait until the loading screen is ready for input (procedural generation can take a while under SwiftShader)
for (let i = 0; i < 120; i++) { const r = await send('Runtime.evaluate', { expression: "document.getElementById('loading')?.classList.contains('ready')", returnByValue: true }); if (r?.result?.value) break; await sleep(250); }
if (args.includes('--heap')) { await send('HeapProfiler.enable'); await send('HeapProfiler.collectGarbage'); await send('HeapProfiler.startSampling', { samplingInterval: 4096 }); } // --heap: live allocations by call site at the end (leak hunt)
await sleep(secs * 1000 / 4);
for (const key of (opt('keys') ?? '').split(',').filter(Boolean)) {
  const vk = key === 'Space' ? 32 : key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
  const code = key.length === 1 ? `Key${key.toUpperCase()}` : key, k = key === 'Space' ? ' ' : key.length === 1 ? key.toLowerCase() : key;
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: vk });
  await sleep(80);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: vk });
  await sleep(700);
}
// --touch: drive the game purely by touch and record what happened
if (args.includes('--touch')) {
  const probe = async label => { const r = await send('Runtime.evaluate', { expression: `JSON.stringify({ready:!!bolt.game.ready,state:bolt.game.state,y:+bolt.game.player.y.toFixed(2),duck:bolt.game.player.ducking,grounded:bolt.game.player.grounded})`, returnByValue: true }); lines.push(`[touch:${label}] ${r?.result?.value}`); };
  await tap(200, 450); await sleep(500); await probe('after unlock tap');
  await tap(200, 450); await sleep(500); await probe('after menu tap (select screen)');
  await tap(206, 460); await sleep(800); await probe('after pick tap');
  await sleep(6000); await probe('after countdown');
  await tap(200, 450, 250); await sleep(150); await probe('during hold-jump');
  await sleep(2500); await swipeDown(200, 300); await probe('at swipe end (duck held until release)');
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 300 }] }); await sleep(30);
  for (let i = 1; i <= 4; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 300 + i * 30 }] }); await sleep(120); }
  await probe('mid swipe (finger down)'); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(200); await probe('after release');
}
if (opt('js')) await send('Runtime.evaluate', { expression: opt('js') });
if (args.includes('--cpuprofile')) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start'); } // --cpuprofile: self time by function over the rest of the run
await sleep(secs * 3000 / 4);
if (opt('eval')) { const r = await send('Runtime.evaluate', { expression: opt('eval'), returnByValue: true, awaitPromise: true }); lines.push(`[eval] ${r?.exceptionDetails ? 'EXCEPTION ' + r.exceptionDetails.exception?.description : JSON.stringify(r?.result?.value)}`); }
if (args.includes('--cpuprofile')) { const { profile } = await send('Profiler.stop'); const by = new Map(); let total = 0; for (const n of profile.nodes) { const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`; by.set(k, (by.get(k) ?? 0) + n.hitCount); total += n.hitCount; }
  lines.push(`[cpu] self time by function (% of ${total} samples):`); for (const [k, v] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 22)) lines.push(`[cpu] ${(100 * v / total).toFixed(1).padStart(5)}%  ${k}`); }
if (args.includes('--heap')) { await send('HeapProfiler.collectGarbage'); const { profile } = await send('HeapProfiler.stopSampling'); const by = new Map(); const walk = n => { const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`; by.set(k, (by.get(k) ?? 0) + n.selfSize); n.children.forEach(walk); }; walk(profile.head);
  lines.push('[heap] live allocations by call site (KB):'); for (const [k, v] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 18)) lines.push(`[heap] ${(v / 1024).toFixed(0).padStart(7)}  ${k}`); }
if (opt('shot')) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(opt('shot'), Buffer.from(r.data, 'base64')); }
console.log(lines.length ? lines.join('\n') : '(no console output)');
chrome.kill(); srv.kill(); await sleep(500); execSync(`rm -rf ${PROFILE}`); process.exit(0);
