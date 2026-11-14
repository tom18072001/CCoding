import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCsv, filterRuns, bootstrap, permutationTest, cliffsDelta, requiredRuns, zInv, simulateRequiredRuns, loadRuns, groupOf, parseDelta, analyse, renderMd } from './stats.mjs';

const csv = `run,run_note,task,system,rep,status,wall_s,cost_usd,task_id
C5,"ghi chú, có dấu phẩy",t3-api,ccoding-fastlane,1,done,579,1.0,T-hung
C5,x,t3-api,ccoding-fastlane,2,done,221,1.0,T-b
C5,x,t3-api,claude,1,done,155,1.0,T-c
C6,x,t3-api,claude,1,done,246,1.0,T-d
C6,x,t3-api,other-sys,1,done,1,1.0,T-e
`;
const runs = () => parseCsv(csv).map((r) => ({ ...r, rep: +r.rep, wall: +r.wall_s, cost: +r.cost_usd, group: r.system === 'claude' ? 'claude' : r.system.startsWith('ccoding') ? 'cc' : 'other' }));

test('bootstrap tái lập được với seed cố định, đổi seed thì đổi kết quả', () => {
  const strata = [{ cc: [100, 120, 90], cl: [150, 160, 170] }, { cc: [50, 70], cl: [80, 60] }];
  const a = bootstrap(strata, { B: 2000, seed: 7 }), b = bootstrap(strata, { B: 2000, seed: 7 }), c = bootstrap(strata, { B: 2000, seed: 8 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.diffCI, c.diffCI);
  assert.ok(a.diffCI[0] < a.diff && a.diff < a.diffCI[1]);
});

test('hoán vị chính xác: cc=[1,2], cl=[3,4] → p = 2/6', () => {
  const r = permutationTest([{ cc: [1, 2], cl: [3, 4] }]);
  assert.equal(r.method, 'exact');
  assert.equal(r.combos, 6);
  assert.ok(Math.abs(r.p - 1 / 3) < 1e-12);
});

test('hoán vị Monte Carlo khi số tổ hợp lớn, tái lập theo seed', () => {
  const s = [{ cc: [1, 2, 3, 4, 5, 6, 7, 8], cl: [9, 10, 11, 12, 13, 14, 15, 16] }];
  const a = permutationTest(s, { N: 3000, seed: 1, exactLimit: 100 }), b = permutationTest(s, { N: 3000, seed: 1, exactLimit: 100 });
  assert.equal(a.method, 'monte-carlo');
  assert.deepEqual(a, b);
  assert.ok(a.p < 0.01);
});

test("Cliff's delta: tách hoàn toàn = −1, trùng = 0", () => {
  assert.equal(cliffsDelta([{ cc: [1, 2], cl: [3, 4] }]), -1);
  assert.equal(cliffsDelta([{ cc: [1, 2], cl: [1, 2] }]), 0);
});

test('bộ lọc: rounds, tasks, exclude theo task_id và theo khóa, bỏ hệ lạ', () => {
  assert.equal(filterRuns(runs(), {}).length, 4);
  assert.equal(filterRuns(runs(), { rounds: ['C6'] }).length, 1);
  assert.equal(filterRuns(runs(), { tasks: ['t9'] }).length, 0);
  assert.deepEqual(filterRuns(runs(), { exclude: ['T-hung'] }).map((r) => r.task_id), ['T-b', 'T-c', 'T-d']);
  assert.equal(filterRuns(runs(), { exclude: ['C5/t3-api/ccoding-fastlane/1'] }).length, 3);
});

test('parseCsv xử lý trường có dấu ngoặc kép và dấu phẩy', () => {
  assert.equal(runs()[0].run_note, 'ghi chú, có dấu phẩy');
});

test('requiredRuns: σ=1, Δ=1, α=0,05, power=0,8 → 16; σ=Δ/2 → 4; Δ=0 → Infinity', () => {
  assert.ok(Math.abs(zInv(0.975) - 1.959964) < 1e-5);
  assert.equal(requiredRuns({ sigma: 1, delta: 1 }), 16);
  assert.equal(requiredRuns({ sigma: 1, delta: 2 }), 4);
  assert.equal(requiredRuns({ sigma: 1, delta: 0 }), Infinity);
});

test('simulateRequiredRuns trả số nguyên hợp lý và tái lập', () => {
  const o = { cc: [8, 10, 12, 9, 11], cl: [18, 20, 22, 19, 21], delta: 10, sims: 300, seed: 3 };
  const n = simulateRequiredRuns(o);
  assert.ok(Number.isInteger(n) && n >= 2 && n <= 10);
  assert.equal(simulateRequiredRuns(o), n);
});

const csv7 = `run,task,system,rep,wall_s,cost_usd,task_id
C7,t1,ccoding-fastlane,1,109,0.40,T-1
C7,t1,claude-sonnet,1,69,0.22,S-1
C7,t1,claude-sonnet,2,62,0.18,S-2
C7,t2,ccoding-fastlane,1,71,0.40,T-2
C7,t2,claude-sonnet,1,41,0.16,S-3
C7,t2,claude-sonnet,2,42,0.16,S-4
C7,t2,claude,1,90,0.45,O-1
`;
const tmpCsv = (text) => { const d = mkdtempSync(join(tmpdir(), 'stats-')); const p = join(d, 'runs.csv'); writeFileSync(p, text); return p; };

test('--baseline: groupOf chọn hệ đối chứng, hệ Claude khác bị bỏ', () => {
  assert.equal(groupOf('claude'), 'claude');
  assert.equal(groupOf('claude-sonnet'), 'other');
  assert.equal(groupOf('claude-sonnet', 'claude-sonnet'), 'claude');
  assert.equal(groupOf('claude', 'claude-sonnet'), 'other');
  assert.equal(groupOf('ccoding-fastlane', 'claude-sonnet'), 'cc');
});

test('--baseline claude-sonnet: chỉ dùng claude-sonnet làm đối chứng, đúng số học', () => {
  const p = tmpCsv(csv7);
  const runs = filterRuns(loadRuns([p], 'claude-sonnet'), { rounds: ['C7'] });
  assert.equal(runs.length, 6); // bỏ dòng hệ claude (Opus)
  const res = analyse(runs, { B: 500, baseline: 'claude-sonnet' });
  assert.equal(res.baseline, 'claude-sonnet');
  const w = res.metrics.wall.pooled;
  assert.equal(w.nCC, 2); assert.equal(w.nClaude, 4);
  // TB bài: t1 109 − 65.5 = 43.5; t2 71 − 41.5 = 29.5 ⇒ 36.5
  assert.ok(Math.abs(w.diff - 36.5) < 1e-9);
  assert.equal(w.perm.method, 'exact');
  assert.equal(w.perm.combos, 9); // 3 × 3 hoán vị
  assert.ok(/đối chứng = claude-sonnet/.test(renderMd(res)));
  // mặc định (claude) dùng Opus: chỉ t2 có đối chứng
  const opus = analyse(filterRuns(loadRuns([p]), {}), { B: 200 });
  assert.deepEqual(opus.tasksUsed, ['t2']);
  assert.ok(Math.abs(opus.metrics.wall.pooled.diff - (71 - 90)) < 1e-9);
});

test('loadRuns bỏ dòng trùng khi nạp hai tệp chồng nhau', () => {
  const p = tmpCsv(csv7), q = tmpCsv(csv7);
  assert.equal(loadRuns([p, q], 'claude-sonnet').length, 7);
});

test('--delta: parseDelta và áp vào số lượt cần', () => {
  assert.deepEqual(parseDelta('wall=30,cost=0.1'), { wall: 30, cost: 0.1 });
  assert.throws(() => parseDelta('foo=3'));
  assert.throws(() => parseDelta('wall=-1'));
  const p = tmpCsv(['run,task,system,rep,wall_s,cost_usd,task_id', 'C7,t1,ccoding-fastlane,1,100,1,a', 'C7,t1,ccoding-fastlane,2,120,1,b', 'C7,t1,claude-sonnet,1,60,1,c', 'C7,t1,claude-sonnet,2,70,1,d'].join(String.fromCharCode(10)) + String.fromCharCode(10));
  const runs = filterRuns(loadRuns([p], 'claude-sonnet'), {});
  const dflt = analyse(runs, { B: 100, requiredRuns: true, baseline: 'claude-sonnet' }).metrics.wall.required.t1;
  const big = analyse(runs, { B: 100, requiredRuns: true, delta: { wall: 1000 }, baseline: 'claude-sonnet' }).metrics.wall.required.t1;
  assert.equal(big.delta, 1000);
  assert.equal(big.n, 2); // Δ rất lớn so với σ ⇒ n tối thiểu
  assert.ok(dflt.delta > 0 && dflt.delta < 1000 && dflt.n >= big.n);
});
