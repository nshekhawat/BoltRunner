// Runs the deterministic benchmark (?bench=1) headless on the real GPU for every tier and writes a JSON report.
// usage: node perf/bench.mjs [--out=perf/current.json] [--tiers=high,medium,low] [--biomes=desert,city,jungle,frostpeak,journey] [--secs=60] [--label=text]
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const args = process.argv.slice(2), opt = (k, d) => args.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const tiers = opt('tiers', 'high,medium,low').split(','), secs = +opt('secs', 60), biomes = opt('biomes', ''), out = opt('out', 'perf/current.json');
const report = { date: new Date().toISOString(), label: opt('label', ''), commit: spawnSync('git', ['rev-parse', '--short', 'HEAD']).stdout.toString().trim(), secs, tiers: {} };
for (const tier of tiers) {
  const q = `bench=1&q=${tier}&secs=${secs}${biomes ? '&biomes=' + biomes : ''}`;
  process.stderr.write(`▶ ${tier} (${q})\n`);
  const r = spawnSync('node', ['check.mjs', '1', q, '--gpu', '--uncapped', '--eval=bolt.bench.done'], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: (secs * 5 + 90) * 1000 });
  const line = r.stdout.split('\n').find(l => l.startsWith('[eval] '));
  if (!line) { console.error(r.stdout, r.stderr); process.exit(1); }
  report.tiers[tier] = JSON.parse(line.slice(7));
  const bad = r.stdout.split('\n').filter(l => /EXCEPTION|\[error\]|HTTP 4|NETFAIL/.test(l)); if (bad.length) console.error(bad.join('\n'));
}
if (report.tiers.medium) report.hardware = report.tiers.medium.hardware; else report.hardware = Object.values(report.tiers)[0].hardware;
writeFileSync(out, JSON.stringify(report, null, 1)); console.log(table(report));
if (out !== 'perf/history.json' && existsSync('perf/history.json') || out === 'perf/current.json') { // append a compact line to the history
  const h = existsSync('perf/history.json') ? JSON.parse(readFileSync('perf/history.json', 'utf8')) : [];
  h.push({ date: report.date, commit: report.commit, label: report.label, tiers: Object.fromEntries(Object.entries(report.tiers).map(([t, r]) => [t, Object.fromEntries(Object.entries(r.biomes).map(([b, s]) => [b, { p50: s.frame.p50, p95: s.frame.p95, p99: s.frame.p99, low1: s.low1, cpu95: s.cpu.p95, calls: s.calls.p50 }]))])) });
  writeFileSync('perf/history.json', JSON.stringify(h, null, 1));
}
export function table(rep) {
  const rows = [['tier', 'biome', 'fps', '1% low', 'p50', 'p95', 'p99', 'max', 'cpu p50', 'cpu p95', 'gpu p50', 'calls', 'tris', 'heap 0→60', 'gc>5ms', 'geo/tex']];
  for (const [t, r] of Object.entries(rep.tiers)) for (const [b, s] of Object.entries(r.biomes)) rows.push([t, b, s.fps, s.low1, s.frame.p50, s.frame.p95, s.frame.p99, s.frame.max, s.cpu.p50, s.cpu.p95, s.gpu?.p50 ?? '-', s.calls.p50, s.triangles, s.heap ? `${s.heap.startMB}→${s.heap.endMB}` : '-', s.heap?.gcOver5ms ?? '-', `${s.memory.end.geometries}/${s.memory.end.textures}` + (s.journey ? ` J:${s.journey.transitions}t max${s.journey.frameMax}` : '')]);
  const w = rows[0].map((_, i) => Math.max(...rows.map(r => String(r[i]).length)));
  return rows.map(r => r.map((c, i) => String(c).padEnd(w[i])).join('  ')).join('\n');
}
