// Test e9lite-cost.mjs trên gold/runs.jsonl GIẢ dựng trong test (số tính tay trong chú thích). Không có số thật.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARMS, median, summarize, rowCost, planWeighted, analyzeCost, format, sepFromZero, verdictBoth, failedSummary, sha256Lf } from './e9lite-cost.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const f = (path) => ({ path, change: 'modified', linesAdded: 1, linesRemoved: 0, module: path.includes('/') ? path.split('/')[0] : '.', flag: null });
const gold = { version: 1, taskCount: 3, sha256: 'x', tasks: [
  { id: 'a', modules: ['src', 'test'], files: [f('src/a.js'), f('test/a.test.js')] },
  { id: 'b', modules: ['src'], files: [f('src/x.js')] },
  { id: 'c', modules: ['.'], files: [f('main.js')] },
] };
const item = (...files) => ({ id: 1, title: 't', assignee: 'x', dependsOn: [], files });
const MODEL = { 'P-S': 'claude-sonnet-5-5', 'P-O': 'claude-opus-5-5', 'P-H': 'claude-haiku-5-5' };
// Token chung cho mọi dòng done: input 1M, output 100K, cacheRead 1M, cacheWrite 500K.
//  Sonnet: 2 + 100K·10/1M=1 + 1M·2·0,05/1M=0,1 + 500K·2·2/1M=2 ⇒ 5,1
//  Opus:   4 + 2 + 0,2 + 4 ⇒ 10,2
//  Haiku cận trên: 0,5 + 0,25 + 1M·0,5·0,1/1M=0,05 + 500K·0,5·2/1M=0,5 ⇒ 1,3
//  Haiku cận dưới: 0,1 + 0,05 + 0,01 + 0,1 ⇒ 0,26
const TOK = { input: 1e6, output: 1e5, cacheRead: 1e6, cacheWrite: 5e5 };
const PLAN_TOK = { 'P-S': 1000, 'P-O': 2000, 'P-H': 3000 };
const row = (task, arm, files, extra = {}) => ({
  key: `${task}__${arm}__r1`, task, arm, rep: 1, status: 'done', planRaw: files.length ? [item(...files)] : [], planFinal: files.length ? [item(...files)] : [],
  planGate: { rules: [] }, replanCount: 0, usage: { tokens: { ...TOK }, byPhase: { route: 10, plan: PLAN_TOK[arm] }, calls: 3 }, planModel: { actual: MODEL[arm], match: true }, ...extra,
});
const FAILED_TOK = { input: 100, output: 10, cacheRead: 1000, cacheWrite: 500 }; // weighted = 100 + 625 + 100 + 50 = 875; Opus USD = (400+200+200+4000)/1e6 = 0,0048
const rows = [
  // S: phủ đủ ở cả 3 bài (độ phủ = 1,0)
  row('a', 'P-S', ['src/a.js', 'test/a.test.js']), row('b', 'P-S', ['src/x.js']), row('c', 'P-S', ['main.js']),
  // O: bài a chỉ phủ src (covFile 0,5; covMod 0,5); hai dòng failed của O (c) đứng trước dòng done cùng khóa
  row('a', 'P-O', ['src/a.js']), row('b', 'P-O', ['src/x.js']),
  { ...row('c', 'P-O', ['main.js']), status: 'failed', usage: { tokens: { ...FAILED_TOK }, byPhase: { route: 1, plan: 2 } } },
  { ...row('c', 'P-O', ['main.js']), status: 'failed', usage: { tokens: { ...FAILED_TOK }, byPhase: { route: 1, plan: 2 } } },
  row('c', 'P-O', ['main.js']),
  // H: bài a không phủ gì (0); một dòng failed không có usage
  row('a', 'P-H', []), row('b', 'P-H', ['src/x.js']),
  { ...row('c', 'P-H', ['main.js']), status: 'failed', usage: undefined },
  row('c', 'P-H', ['main.js']),
];

test('median/summarize: số tính tay, đếm bài đạt 1,0', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  const s = summarize([0.5, 1, 1, null]);
  assert.equal(s.n, 3); near(s.mean, 2.5 / 3); assert.equal(s.median, 1); assert.equal(s.min, 0.5); assert.equal(s.max, 1); assert.equal(s.n1, 2);
  assert.deepEqual(summarize([]), { n: 0, mean: null, median: null, min: null, max: null, n1: 0 });
});

test('rowCost: giá theo model của dòng, cache read, hai bậc Haiku', () => {
  const mk = (model, tokens) => ({ usage: { tokens }, planModel: { actual: model } });
  const s = rowCost(mk(MODEL['P-S'], TOK)); near(s.high, 5.1); near(s.low, 5.1); // Sonnet không có bậc
  const o = rowCost(mk(MODEL['P-O'], TOK)); near(o.high, 10.2); near(o.low, 10.2);
  const h = rowCost(mk(MODEL['P-H'], TOK)); near(h.high, 1.3); near(h.low, 0.26);
  // chỉ cache read 1M: Sonnet 2·0,05 = 0,1; Opus 4·0,05 = 0,2; Haiku (đọc cache 0,1× riêng) cận trên 0,5·0,1 = 0,05, cận dưới 0,1·0,1 = 0,01
  const cr = { cacheRead: 1e6 };
  near(rowCost(mk(MODEL['P-S'], cr)).high, 0.1); near(rowCost(mk(MODEL['P-O'], cr)).high, 0.2);
  const hc = rowCost(mk(MODEL['P-H'], cr)); near(hc.high, 0.05); near(hc.low, 0.01);
  assert.deepEqual(rowCost({ planModel: { actual: MODEL['P-S'] } }), { low: null, high: null }); // thiếu usage
  assert.deepEqual(rowCost(mk('model-la', TOK)), { low: null, high: null }); // model lạ: không đoán
});

test('planWeighted lấy byPhase.plan; thiếu ⇒ null', () => {
  assert.equal(planWeighted({ usage: { byPhase: { plan: 1234 } } }), 1234);
  assert.equal(planWeighted({ usage: { tokens: {} } }), null);
});

test('bảng tuyệt đối trên 3 bài giả: độ phủ = 1,0 ở S, trần chưa hoàn toàn ở O và H', () => {
  const res = analyzeCost({ rows, gold });
  assert.equal(res.nTasks, 3); assert.equal(res.nKept, 9); assert.equal(res.nNoDone, 0);
  const S = res.abs['P-S']; const O = res.abs['P-O']; const H = res.abs['P-H'];
  // S: mọi độ phủ = 1,0 ⇒ n1 = 3/3
  assert.equal(S.covFile.n1, 3); assert.equal(S.covMod.n1, 3); near(S.covFile.mean, 1);
  // O: covFile [0,5; 1; 1] ⇒ TB 5/6, trung vị 1, min 0,5, n1 = 2
  near(O.covFile.mean, 5 / 6); assert.equal(O.covFile.median, 1); assert.equal(O.covFile.min, 0.5); assert.equal(O.covFile.n1, 2);
  // H: covFile [0; 1; 1] ⇒ TB 2/3, n1 = 2; covMod bài a: 0
  near(H.covFile.mean, 2 / 3); assert.equal(H.covFile.min, 0); assert.equal(H.covMod.n1, 2);
  // số hạng mục: S 1,1,1; H 0,1,1 (bài a không có hạng mục)
  near(S.items.mean, 1); near(H.items.mean, 2 / 3);
  // token pha plan: hằng theo arm
  assert.equal(S.planTok.mean, 1000); assert.equal(O.planTok.median, 2000); assert.equal(H.planTok.max, 3000);
  assert.deepEqual(res.saturated, { covFile: false, covMod: false });
  // hiệu covMod: O − S = [−0,5; 0; 0] ⇒ 2 bài bằng 0; H − S = [−1; 0; 0] ⇒ 2 bài bằng 0
  assert.deepEqual([res.covDiff['O − S'].covMod.pos, res.covDiff['O − S'].covMod.zero, res.covDiff['O − S'].covMod.neg], [0, 2, 1]);
  assert.deepEqual([res.covDiff['H − S'].covMod.pos, res.covDiff['H − S'].covMod.zero, res.covDiff['H − S'].covMod.neg], [0, 2, 1]);
});

test('bão hòa = true khi cả ba arm đạt 1,0 ở mọi bài', () => {
  const full = rows.filter((r) => r.status === 'done').map((r) => ({ ...r, planRaw: [item(...(r.task === 'a' ? ['src/a.js', 'test/a.test.js'] : r.task === 'b' ? ['src/x.js'] : ['main.js']))] }));
  const res = analyzeCost({ rows: full, gold });
  assert.deepEqual(res.saturated, { covFile: true, covMod: true });
  assert.equal(res.covDiff['O − S'].covMod.zero, 3);
});

test('chi phí theo arm và hiệu O − S, H − S có khoảng bootstrap (số tính tay)', () => {
  const res = analyzeCost({ rows, gold });
  near(res.abs['P-S'].costHigh.mean, 5.1); near(res.abs['P-O'].costHigh.median, 10.2);
  near(res.abs['P-H'].costHigh.mean, 1.3); near(res.abs['P-H'].costLow.mean, 0.26);
  const os = res.costDiff['O − S']; // 10,2 − 5,1 = 5,1 ở mọi bài ⇒ khoảng thu về một điểm
  near(os.high.boot.mean, 5.1); near(os.high.boot.lo, 5.1); near(os.high.boot.hi, 5.1); near(os.low.boot.lo, 5.1);
  assert.equal(os.verdict, 'đắt hơn');
  const hs = res.costDiff['H − S']; // cận trên 1,3 − 5,1 = −3,8; cận dưới 0,26 − 5,1 = −4,84
  near(hs.high.boot.mean, -3.8); near(hs.low.boot.mean, -4.84);
  assert.equal(hs.verdict, 'rẻ hơn');
  assert.equal(hs.high.neg, 3);
  assert.equal(res.B, 4000); assert.equal(res.seed, 20261115);
});

test('kết luận chi phí: chỉ "rẻ hơn/đắt hơn" khi khoảng tách 0 ở cả hai bậc', () => {
  const b = (lo, hi) => ({ mean: (lo + hi) / 2, lo, hi });
  assert.equal(sepFromZero(b(0.1, 0.3)), 'đắt hơn');
  assert.equal(sepFromZero(b(-0.3, -0.1)), 'rẻ hơn');
  assert.equal(sepFromZero(b(-0.1, 0.3)), 'chưa phân biệt được');
  assert.equal(sepFromZero(undefined), 'chưa phân biệt được');
  assert.equal(verdictBoth(b(-0.3, -0.1), b(-0.2, -0.05)), 'rẻ hơn');
  assert.equal(verdictBoth(b(-0.3, -0.1), b(-0.2, 0.05)), 'chưa phân biệt được về chi phí bằng tiền'); // chỉ một bậc tách 0
  assert.equal(verdictBoth(b(-0.3, -0.1), b(0.05, 0.2)), 'chưa phân biệt được về chi phí bằng tiền'); // ngược hướng
});

test('dòng failed báo riêng: số dòng, token có trọng số, USD, dòng thiếu usage', () => {
  const F = failedSummary(rows);
  assert.equal(F.total.n, 3); assert.equal(F.total.noUsage, 1); assert.equal(F.total.weighted, 1750);
  assert.equal(F.byArm['P-O'].n, 2); assert.equal(F.byArm['P-O'].weighted, 1750); near(F.byArm['P-O'].high, 0.0096);
  assert.equal(F.byArm['P-H'].n, 1); assert.equal(F.byArm['P-H'].noUsage, 1); assert.equal(F.byArm['P-H'].weighted, 0);
  // dòng failed không vào phép so: nKept = 9 (3 bài × 3 arm), chi phí O không đổi
  assert.equal(analyzeCost({ rows, gold }).nKept, 9);
});

test('định dạng tất định, không đường dẫn máy; sha256 tính trên LF', () => {
  const res = analyzeCost({ rows, gold });
  const a = format(res, { command: 'node x --runs r.jsonl', inputs: [{ path: 'r.jsonl', sha256: 'abc' }] });
  assert.equal(a, format(analyzeCost({ rows, gold }), { command: 'node x --runs r.jsonl', inputs: [{ path: 'r.jsonl', sha256: 'abc' }] }));
  assert.ok(!/[A-Za-z]:\\|\/Users\/|\/home\//.test(a));
  assert.match(a, /không thuộc đăng ký, chỉ mô tả/);
  assert.match(a, /PRICING_VERSION = `2026-11-04`/);
  assert.match(a, /\*\*chưa phân biệt được|\*\*rẻ hơn\*\*/);
  assert.equal(sha256Lf('a\r\nb\r\n'), sha256Lf('a\nb\n'));
  assert.deepEqual(ARMS, ['P-H', 'P-S', 'P-O']);
});

test('CLI chạy hai lần ra đúng byte', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e9cost-'));
  try {
    writeFileSync(join(dir, 'runs.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    writeFileSync(join(dir, 'gold.json'), JSON.stringify(gold));
    writeFileSync(join(dir, 'labels.json'), JSON.stringify({ labels: {} }));
    const run = (out) => {
      const r = spawnSync(process.execPath, [join(here, 'e9lite-cost.mjs'), '--runs', join(dir, 'runs.jsonl'), '--gold', join(dir, 'gold.json'), '--labels', join(dir, 'labels.json'), '--out', out], { cwd: resolve(here, '../../..'), encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      return readFileSync(out, 'utf8');
    };
    const x = run(join(dir, 'o1.md')); const y = run(join(dir, 'o2.md'));
    assert.equal(x, y);
    assert.match(x, /## 3\. Dòng không phải `done`/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
