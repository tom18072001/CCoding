// Test e9lite.mjs và e9lite-labels.mjs trên gold/runs.jsonl GIẢ dựng trong test (ca biết trước đáp án). Không có số thật.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normPath, moduleOf, coverage, rowMetrics, weighted, gateFirst, parseRuns, selectRuns, stopFlags, perTask, bootstrapMean, analyze, format } from './e9lite.mjs';
import { label, buildLabels } from './e9lite-labels.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const f = (path) => ({ path, change: 'modified', linesAdded: 1, linesRemoved: 0, module: path.includes('/') ? path.split('/')[0] : '.', flag: null });
// a: 2 module (src, test) ⇒ chia được; b: 1 module (src) ⇒ không chia được; c: 1 tệp ở gốc ⇒ không chia được
const gold = { version: 1, taskCount: 3, sha256: 'x', tasks: [
  { id: 'a', modules: ['src', 'test'], files: [f('src/a.js'), f('test/a.test.js')] },
  { id: 'b', modules: ['src'], files: [f('src/x.js')] },
  { id: 'c', modules: ['.'], files: [f('main.js')] },
] };
const item = (...files) => ({ id: 1, title: 't', assignee: 'x', dependsOn: [], files });
const row = (o) => ({ key: `${o.task}__${o.arm}__r${o.rep}`, status: 'done', planRaw: [], planFinal: [], planGate: { rules: [] }, replanCount: 0, usage: { tokens: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0 } }, planModel: { match: true }, authSource: null, configHash: `h-${o.arm}`, ...o });

test('nhãn đúng trên gold giả: ≥ 2 module ⇒ chia được; 1 module hoặc tệp gốc ⇒ không chia được', () => {
  assert.equal(label(gold.tasks[0]), 'chia_duoc');
  assert.equal(label(gold.tasks[1]), 'khong_chia_duoc');
  assert.equal(label(gold.tasks[2]), 'khong_chia_duoc');
  assert.equal(label({ files: [] }), 'khong_chia_duoc');
  const l = buildLabels(gold);
  assert.deepEqual(l.counts, { chia_duoc: 1, khong_chia_duoc: 2 });
  assert.equal(l.degenerate, false);
  assert.equal(l.labels.a.moduleCount, 2); assert.equal(l.labels.a.fileCount, 2);
});

test('nhãn suy biến được báo, quy tắc không đổi', () => {
  const g = { sha256: 'y', tasks: [gold.tasks[0], { id: 'd', files: [f('package.json'), f('src/q.js'), f('test/q.js')] }] };
  const l = buildLabels(g);
  assert.equal(l.degenerate, true);
  assert.deepEqual(l.counts, { chia_duoc: 2, khong_chia_duoc: 0 });
});

test('chuẩn hóa đường dẫn: "\\", "./", tiền tố repo; phân biệt hoa thường; không khớp hậu tố', () => {
  assert.equal(normPath('src\\a.js', 'a'), 'src/a.js');
  assert.equal(normPath('./src/a.js', 'a'), 'src/a.js');
  assert.equal(normPath('.\\.\\src\\a.js', 'a'), 'src/a.js');
  assert.equal(normPath('starter/src/a.js', 'a'), 'src/a.js');
  assert.equal(normPath('a/starter/src/a.js', 'a'), 'src/a.js');
  assert.equal(normPath('./starter\\src\\a.js', 'a'), 'src/a.js');
  assert.equal(moduleOf('main.js'), '.');
  assert.equal(moduleOf('src/x/y.js'), 'src');
  const g = new Set(['src/a.js']);
  assert.equal(coverage(g, new Set(['SRC/a.js'])), 0);
  assert.equal(coverage(g, new Set(['a.js'])), 0);
  assert.equal(coverage(g, new Set(['lib/src/a.js'])), 0);
  assert.equal(coverage(new Set(), new Set(['a.js'])), null);
});

test('độ phủ 0, 0,5, 1 trên tệp và module, riêng planRaw và planFinal', () => {
  const g = gold.tasks[0]; // G_f = {src/a.js, test/a.test.js}; G_m = {src, test}
  const m0 = rowMetrics(row({ task: 'a', arm: 'P-S', rep: 1, planRaw: [], planFinal: [item('docs/x.md')] }), g, 'chia_duoc');
  assert.equal(m0['raw.covFile'], 0); assert.equal(m0['raw.covMod'], 0);
  assert.equal(m0['final.covFile'], 0); assert.equal(m0['final.covMod'], 0);
  const mh = rowMetrics(row({ task: 'a', arm: 'P-S', rep: 1, planRaw: [item('src/a.js'), item('src/zzz.js')], planFinal: [item('.\\test\\a.test.js')] }), g, 'chia_duoc');
  assert.equal(mh['raw.covFile'], 0.5); assert.equal(mh['raw.covMod'], 0.5);
  assert.equal(mh['final.covFile'], 0.5); assert.equal(mh['final.covMod'], 0.5);
  const m1 = rowMetrics(row({ task: 'a', arm: 'P-S', rep: 1, planRaw: [item('src/a.js', 'test/a.test.js')], planFinal: [item('src/a.js'), item('./test/a.test.js')] }), g, 'chia_duoc');
  assert.equal(m1['raw.covFile'], 1); assert.equal(m1['raw.covMod'], 1);
  assert.equal(m1['final.covFile'], 1); assert.equal(m1['final.covMod'], 1);
  // raw và final khác nhau không bị trộn; số hạng mục riêng
  assert.equal(m1['raw.items'], 1); assert.equal(m1['final.items'], 2);
  // module phủ 1 nhưng tệp phủ 0,5: cùng module khác tệp
  const mm = rowMetrics(row({ task: 'a', arm: 'P-S', rep: 1, planRaw: [item('src/other.js', 'test/other.js')] }), g, 'chia_duoc');
  assert.equal(mm['raw.covFile'], 0); assert.equal(mm['raw.covMod'], 1);
});

test('planRaw null ⇒ độ phủ 0; planFinal null ⇒ loại khỏi planFinal (đếm)', () => {
  const m = rowMetrics(row({ task: 'a', arm: 'P-S', rep: 1, planRaw: null, planFinal: null }), gold.tasks[0], 'chia_duoc');
  assert.equal(m['raw.covFile'], 0);
  assert.equal(m['final.covFile'], undefined);
  assert.equal(m['final.missing'], 1);
});

test('chia thừa chỉ tính trên bài không chia được: > 1 hạng mục', () => {
  const g = gold.tasks[1];
  const one = rowMetrics(row({ task: 'b', arm: 'P-O', rep: 1, planRaw: [item('src/x.js')], planFinal: [item('src/x.js')] }), g, 'khong_chia_duoc');
  assert.equal(one['raw.overSplit'], 0); assert.equal(one['final.overSplit'], 0);
  const two = rowMetrics(row({ task: 'b', arm: 'P-O', rep: 1, planRaw: [item('src/x.js'), item()], planFinal: [item('src/x.js')] }), g, 'khong_chia_duoc');
  assert.equal(two['raw.overSplit'], 1); assert.equal(two['final.overSplit'], 0);
  const lab = rowMetrics(row({ task: 'a', arm: 'P-O', rep: 1, planRaw: [item(), item()] }), gold.tasks[0], 'chia_duoc');
  assert.equal(lab['raw.overSplit'], undefined);
});

test('token có trọng số, cổng đạt lần đầu', () => {
  assert.equal(weighted({ input: 100, output: 10, cacheRead: 1000, cacheWrite: 200 }), Math.round(100 + 250 + 100 + 50));
  assert.equal(weighted(null), null);
  assert.equal(gateFirst({ planGate: { rules: [] }, replanCount: 0 }), 1);
  assert.equal(gateFirst({ planGate: { rules: ['A'], replanned: true }, replanCount: 1 }), 0);
  assert.equal(gateFirst({ planGate: { rules: [] }, replanCount: 1 }), 0);
  assert.equal(gateFirst({ planGate: null, replanCount: 0 }), null);
});

test('dòng model lệch bị loại, kể cả khi status done; vẫn được báo là lượt đầu lỗi', () => {
  const rows = [
    row({ task: 'a', arm: 'P-O', rep: 1, status: 'done', planModel: { match: false } }),
    row({ task: 'a', arm: 'P-S', rep: 1 }),
  ];
  const s = selectRuns(rows);
  assert.equal(s.kept.length, 1); assert.equal(s.kept[0].arm, 'P-S');
  assert.equal(s.mismatch.length, 1); assert.equal(s.noDone.length, 1);
  assert.equal(s.firstFail[0].cause, 'model-lệch');
});

test('khóa có error rồi done: chỉ tính done cuối; lượt đầu vẫn đếm', () => {
  const rows = [
    row({ task: 'a', arm: 'P-S', rep: 1, status: 'error', error: 'HTTP 403', planRaw: [item('src/a.js', 'test/a.test.js')] }),
    row({ task: 'a', arm: 'P-S', rep: 1, status: 'done', planRaw: [item('docs/x.md')], planFinal: [item('docs/x.md')] }),
    row({ task: 'a', arm: 'P-S', rep: 1, status: 'done', planRaw: [item('src/a.js')], planFinal: [item('src/a.js')] }), // done cuối
  ];
  const s = selectRuns(rows);
  assert.equal(s.kept.length, 1);
  assert.equal(s.kept[0].planRaw[0].files[0], 'src/a.js');
  assert.deepEqual(s.firstFail.map((x) => [x.arm, x.cause]), [['P-S', 'hạ-tầng']]);
  const { out } = perTask(s.kept, { a: gold.tasks[0] }, { a: 'chia_duoc' });
  assert.equal(out.a['P-S']['raw.covFile'].mean, 0.5);
  assert.equal(out.a['P-S']['raw.covFile'].reps, 1);
});

test('cờ dừng: authSource lẫn khóa API, configHash khác trong cùng arm, trùng giữa arm', () => {
  const ok = [row({ task: 'a', arm: 'P-H', rep: 1 }), row({ task: 'a', arm: 'P-S', rep: 1 })];
  assert.deepEqual(stopFlags(ok), []);
  assert.match(stopFlags([...ok, row({ task: 'a', arm: 'P-O', rep: 1, authSource: 'ANTHROPIC_API_KEY' })]).join('|'), /khóa API/);
  assert.match(stopFlags([...ok, row({ task: 'b', arm: 'P-S', rep: 1, authSource: 'none' })]).join('|'), /lẫn/);
  assert.match(stopFlags([...ok, row({ task: 'b', arm: 'P-S', rep: 1, configHash: 'khác' })]).join('|'), /trong cùng arm P-S/);
  assert.match(stopFlags([row({ task: 'a', arm: 'P-H', rep: 1, configHash: 'z' }), row({ task: 'a', arm: 'P-S', rep: 1, configHash: 'z' })]).join('|'), /trùng configHash/);
});

test('bootstrap tất định theo seed; seed khác ⇒ có thể khác; ca đã biết đáp án', () => {
  const d = [0.1, 0.2, -0.1, 0.4, 0.0, 0.3];
  const a = bootstrapMean(d, 500, 7); const b = bootstrapMean(d, 500, 7); const c = bootstrapMean(d, 500, 8);
  assert.deepEqual(a, b);
  assert.notDeepEqual([a.lo, a.hi], [c.lo, c.hi]);
  assert.ok(Math.abs(a.mean - 0.15) < 1e-12);
  assert.ok(a.lo <= a.mean && a.mean <= a.hi);
  const k = bootstrapMean([0.5, 0.5, 0.5], 200, 1); // không đổi ⇒ khoảng thoái hóa
  assert.equal(k.lo, 0.5); assert.equal(k.hi, 0.5);
});

test('analyze: hiệu theo bài gộp lặp trước; phân tầng; tầng n < 3 chỉ liệt kê', () => {
  const rows = [];
  // bài a (chia được): Sonnet phủ 0,5 (cả 2 lần lặp), Opus phủ 1 và 0 ⇒ TB 0,5; Haiku phủ 0
  for (const rep of [1, 2]) rows.push(row({ task: 'a', arm: 'P-S', rep, planRaw: [item('src/a.js')], planFinal: [item('src/a.js')] }));
  rows.push(row({ task: 'a', arm: 'P-O', rep: 1, planRaw: [item('src/a.js', 'test/a.test.js')], planFinal: [] }));
  rows.push(row({ task: 'a', arm: 'P-O', rep: 2, planRaw: [], planFinal: [] }));
  for (const rep of [1, 2]) rows.push(row({ task: 'a', arm: 'P-H', rep, planRaw: [], planFinal: [] }));
  // bài b (không chia được): Sonnet 1 hạng mục, Opus 2 hạng mục
  rows.push(row({ task: 'b', arm: 'P-S', rep: 1, planRaw: [item('src/x.js')], planFinal: [item('src/x.js')] }));
  rows.push(row({ task: 'b', arm: 'P-O', rep: 1, planRaw: [item('src/x.js'), item()], planFinal: [item('src/x.js'), item()] }));
  rows.push(row({ task: 'b', arm: 'P-H', rep: 1, planRaw: [item('src/x.js')], planFinal: [item('src/x.js')] }));
  const res = analyze({ rows, gold, labels: buildLabels(gold), seed: 1, B: 100 });
  const c = res.contrasts.all['Opus − Sonnet|raw.covFile'];
  assert.equal(res.contrasts.all['Opus − Sonnet|raw.covFile'].n, 2);
  assert.ok(Math.abs(c.perTask.find((r) => r.task === 'a').diff - 0) < 1e-12); // 0,5 − 0,5
  assert.ok(Math.abs(c.perTask.find((r) => r.task === 'b').diff - 0) < 1e-12);
  const o = res.contrasts.khong_chia_duoc['Opus − Sonnet|raw.overSplit'];
  assert.equal(o.n, 1); assert.equal(o.perTask[0].diff, 1); assert.equal(o.listOnly, true); assert.equal(o.boot, undefined);
  assert.equal(res.contrasts.chia_duoc['Haiku − Sonnet|raw.covFile'].perTask[0].diff, -0.5);
  assert.equal(res.contrasts.chia_duoc['Opus − Sonnet|raw.overSplit'], undefined);
  assert.equal(res.degenerate, false);
  assert.match(format(res), /Tầng: chia_duoc/);
});

test('phân tầng suy biến: chỉ tầng all, không có chia thừa', () => {
  const g = { sha256: 'z', tasks: [gold.tasks[0]] };
  const rows = [row({ task: 'a', arm: 'P-S', rep: 1 }), row({ task: 'a', arm: 'P-O', rep: 1 })];
  const res = analyze({ rows, gold: g, labels: buildLabels(g), seed: 1, B: 50 });
  assert.equal(res.degenerate, true);
  assert.deepEqual(Object.keys(res.contrasts), ['all']);
  assert.match(format(res), /SUY BIẾN/);
});

test('CLI: chưa có runs.jsonl ⇒ exit 0 và không in bảng; có cờ dừng ⇒ exit 3', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e9l-'));
  try {
    const gp = join(dir, 'gold.json'); const lp = join(dir, 'labels.json'); const rp = join(dir, 'runs.jsonl');
    writeFileSync(gp, JSON.stringify(gold)); writeFileSync(lp, JSON.stringify(buildLabels(gold)));
    const script = join(here, 'e9lite.mjs');
    const run = () => spawnSync(process.execPath, [script, '--runs', rp, '--gold', gp, '--labels', lp, '--seed', '20261115', '--tasks-dir', dir], { encoding: 'utf8' });
    let r = run();
    assert.equal(r.status, 0); assert.match(r.stdout, /Chưa có runs\.jsonl/); assert.doesNotMatch(r.stdout, /\|/);
    writeFileSync(rp, '');
    r = run(); assert.equal(r.status, 0); assert.doesNotMatch(r.stdout, /\|/);
    writeFileSync(rp, [row({ task: 'a', arm: 'P-S', rep: 1, authSource: 'ANTHROPIC_API_KEY' })].map((x) => JSON.stringify(x)).join('\n') + '\n');
    r = run(); assert.equal(r.status, 3); assert.match(r.stdout, /CỜ DỪNG/); assert.doesNotMatch(r.stdout, /\| Cặp/);
    writeFileSync(rp, [row({ task: 'a', arm: 'P-S', rep: 1 }), row({ task: 'a', arm: 'P-O', rep: 1 })].map((x) => JSON.stringify(x)).join('\n') + '\n');
    r = run(); assert.equal(r.status, 0); assert.match(r.stdout, /\| Cặp/);
    assert.equal(parseRuns('{"a":1}\nhỏng\n').malformed, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
