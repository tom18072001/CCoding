import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chi2q, normQ, normCdf, tQ, tCdf, wallCells, pooledSigmaLn, sigmaCi, gridOf, sheppardSigmaLn, expectedObservedSigma, invertRounding,
  seDelta, powerAnalytic, mde, sigmaMax, powerSim, fisherTwoSided, relabel, bootstrap2Legacy, scenario,
} from './v43f-e8-t5logq.mjs';
import { deltaStat, perRun } from './g-analyze.mjs';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≠ ${b} (±${tol})`);

test('phân vị chuẩn, χ², t khớp bảng', () => {
  close(normQ(0.975), 1.959964, 1e-4); close(normCdf(0), 0.5, 1e-9);
  close(chi2q(0.975, 24), 39.364, 2e-3); close(chi2q(0.025, 24), 12.401, 2e-3);
  close(tQ(0.975, 30), 2.0423, 1e-3); close(tCdf(0, 5), 0.5, 1e-9);
});

test('σ_ln gộp: ví dụ tay, bỏ ô n < 2', () => {
  const cells = [{ w: [Math.E, Math.E ** 2] }, { w: [5] }, { w: [1, Math.E, Math.E ** 2] }];
  // ô 1: ln = 1, 2 → SS 0,5 (df 1); ô 3: ln = 0, 1, 2 → SS 2 (df 2) ⇒ sqrt(2,5/3)
  const r = pooledSigmaLn(cells);
  assert.equal(r.df, 3); assert.equal(r.cells, 2); close(r.sigma, Math.sqrt(2.5 / 3), 1e-12);
  assert.equal(pooledSigmaLn([{ w: [10, 10, 10] }]).zeroCells, 1);
});

test('CI của σ theo χ²: σ = 0,178, df 24 → cận trên ≈ 0,247 (§9 ghi 0,248)', () => {
  const [lo, hi] = sigmaCi(0.178, 24);
  close(hi, 0.2475, 1e-3); assert.ok(lo < 0.178 && lo > 0.13);
});

test('vòng 10 s: wallSec = 10k + ε', () => {
  const g = gridOf(70.12); assert.equal(g.k, 7); close(g.eps, 0.12, 1e-9);
});

test('Sheppard: phương sai nhỏ hơn h²/12 bị hiệu chỉnh về 0', () => {
  const r = sheppardSigmaLn([{ w: [40.0, 40.2, 40.1] }]);
  assert.equal(r.sigma, 0);
  const big = sheppardSigmaLn([{ w: [40, 80, 120] }]); assert.ok(big.sigma > 0.3);
});

test('mô phỏng làm tròn: σ thật 0 ⇒ σ quan sát 0; σ lớn ⇒ ≈ σ thật; đơn điệu', () => {
  const cells = Array.from({ length: 6 }, (_, i) => ({ w: [60 + 10 * i, 60 + 10 * i, 60 + 10 * i + 10] }));
  assert.equal(expectedObservedSigma(cells, 0, 50, 's'), 0);
  const a = expectedObservedSigma(cells, 0.1, 400, 's'), b = expectedObservedSigma(cells, 0.4, 400, 's');
  assert.ok(a < b); close(b, 0.4, 0.05);
  const inv = invertRounding(cells, b, 400, 's'); close(inv, 0.4, 0.06);
});

test('SE của Δ = σ/3 với 3 bài × 6 lượt mỗi ô; power σ = 0,25 giảm 30 % > 0,9; σ = 0,4 ≈ 0,76', () => {
  close(seDelta(0.25, 0.25), 1 / 12, 1e-12);
  assert.ok(powerAnalytic(0.25, 0.3, { t: false }) > 0.95);
  close(powerAnalytic(0.4, 0.3, { t: false }), 0.763, 0.01);
  assert.ok(powerAnalytic(0.4, 0.3) < powerAnalytic(0.4, 0.3, { t: false })); // t thận trọng hơn z
  close(powerAnalytic(0.25, 0, {}), 0.05, 1e-9); // không có hiệu ứng: bằng α
});

test('MDE và σ tối đa là nghịch đảo của power', () => {
  const m = mde(0.25, 0.8); close(powerAnalytic(0.25, m), 0.8, 1e-6);
  const s = sigmaMax(0.3, 0.9); close(powerAnalytic(s, 0.3), 0.9, 1e-6);
  assert.ok(mde(0.25, 0.9) > mde(0.25, 0.8));
});

test('power mô phỏng (hoán vị) gần giải tích và mức sai loại I gần 0,05', () => {
  const p = powerSim(0.25, 0.25, 0.3, { sims: 300, M: 199, seed: 't' });
  close(p, powerAnalytic(0.25, 0.3), 0.06);
  const n = powerSim(0.25, 0.25, 0, { sims: 400, M: 199, seed: 'n' });
  assert.ok(n < 0.12, `sai loại I ${n}`);
});

test('Fisher chính xác hai phía', () => {
  close(fisherTwoSided(3, 1, 1, 3), 0.4857, 1e-3);
  close(fisherTwoSided(2, 10, 0, 18), 0.1, 0.1); assert.ok(fisherTwoSided(5, 0, 0, 5) < 0.01);
});

test('relabel chỉ đổi nhãn real của bài được chỉ định, giữ vRed', () => {
  const mut = [{ key: 'k', i: 0, task: 't5-logq', real: true, vRed: false }, { key: 'k', i: 1, task: 't5-logq', real: true, vRed: true }, { key: 'x', i: 0, task: 'other', real: true, vRed: false }];
  const out = relabel(mut, [{ key: 'k', i: 0, failRuns: 0 }, { key: 'k', i: 1, failRuns: 2 }, { key: 'x', i: 0, failRuns: 0 }], 't5-logq');
  assert.deepEqual(out.map((r) => r.real), [false, true, true]); assert.equal(out[0].vRed, false);
});

test('bootstrap2Legacy tất định theo hạt giống và cho CI chứa ước lượng ở dữ liệu cân', () => {
  const runs = [];
  for (const t of ['a', 'b', 'c']) for (let j = 0; j < 4; j++) { runs.push({ task: t, arm: 'A0-sonnet', key: `${t}A${j}`, real: 4, caught: 3, mutants: 4 }); runs.push({ task: t, arm: 'B0', key: `${t}C${j}`, real: 4, caught: j < 2 ? 4 : 3, mutants: 4 }); }
  const x = bootstrap2Legacy(runs, deltaStat, 300, 's'), y = bootstrap2Legacy(runs, deltaStat, 300, 's');
  assert.deepEqual(x, y); const d = deltaStat(runs); assert.ok(x.lo <= d && d <= x.hi + 1e-9);
});

test('scenario: số đếm khớp tay trên dữ liệu nhỏ', () => {
  const mut = [], base = [];
  for (const t of ['a', 'b']) for (const arm of ['A0-sonnet', 'B0']) {
    const key = `${t}__${arm}__r1`; base.push({ type: 'base', key, task: t, arm, hPass: true, vRed: false, vNone: false, eligible: true });
    for (let i = 0; i < 4; i++) mut.push({ type: 'mut', key, task: t, arm, i, op: 'ROR', real: true, vRed: i < 3 });
  }
  const s = scenario({ base, mut, missing: [] }, { seed: 's', B: 50, M: 50 });
  assert.equal(s.real, 16); assert.equal(s.caught, 12); close(s.recall, 0.75, 1e-12); close(s.delta, 0, 1e-12); assert.equal(s.survivors, 4);
});

test('dữ liệu đã commit: σ_ln gộp của gates-pilot + b7prime = 0,178, df 24 (khớp §9)', () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const rd = (d) => fs.readFileSync(path.join(ROOT, 'bench', 'vs-claude', 'results', d, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const r = pooledSigmaLn(wallCells([...rd('gates-pilot'), ...rd('b7prime')]));
  assert.equal(r.df, 24); close(r.sigma, 0.178, 5e-4);
  // perRun dùng được trên cùng loại dòng
  assert.equal(perRun([{ key: 'k', task: 't', arm: 'B0', real: true, vRed: true }]).length, 1);
});
