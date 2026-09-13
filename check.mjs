// Headless smoke test via Chrome DevTools Protocol. No deps (Node ≥22 has fetch + WebSocket).
// usage: node check.mjs [seconds] [query] [--shot=out.png] [--keys=Space,ArrowDown] [--eval="js"]
import { spawn, execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const secs = +(args.find(a => /^\d+$/.test(a)) ?? 6);
const query = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a)) ?? '';
const opt = k => args.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const PORT = 8765, DBG = 9333;
const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' });
execSync('rm -rf /tmp/boltchrome');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720',
  '--no-first-run', '--user-data-dir=/tmp/boltchrome', `--remote-debugging-port=${DBG}`,
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
await send('Page.navigate', { url: `http://localhost:${PORT}/?${query}` });
await sleep(secs * 1000 / 2);
for (const key of (opt('keys') ?? '').split(',').filter(Boolean)) {
  const code = key === 'Space' ? 32 : key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: key, key: key === 'Space' ? ' ' : key, windowsVirtualKeyCode: code });
  await sleep(80);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: key, key: key === 'Space' ? ' ' : key, windowsVirtualKeyCode: code });
  await sleep(700);
}
await sleep(secs * 1000 / 2);
if (opt('eval')) { const r = await send('Runtime.evaluate', { expression: opt('eval'), returnByValue: true }); lines.push(`[eval] ${JSON.stringify(r?.result?.value)}`); }
if (opt('shot')) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(opt('shot'), Buffer.from(r.data, 'base64')); }
console.log(lines.length ? lines.join('\n') : '(no console output)');
chrome.kill(); srv.kill(); process.exit(0);
