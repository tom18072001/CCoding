// Test D12/K1a cho lib/stats.mjs theo thẩm định K2 (docs/research/context/k2-stats-review-2026-11-04.md).
// Kỳ vọng lấy theo QUY TẮC ĐĂNG KÝ (preregistration §2.5 v2.1), không theo đầu ra cũ của mã.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tost, bootP, h6Combine } from '../lib/stats.mjs';

const mk = (task, a, b) => ({ task, a, b });
const three = (a, b) => ['x', 'y', 'z'].map((t) => mk(t, a, b));
const DEG = 'không kết luận (suy biến)';

// ---------- T-1 / B-1 / T-5 ----------

test('F1 (T-1): mọi lượt 0,7 ở cả hai arm ⇒ bootP p = null, tost không equivalent', () => {
  const cells = three([0.7, 0.7, 0.7], [0.7, 0.7, 0.7]);
  const r = bootP(cells, { arm: 'A1' });
  assert.equal(r.p, null);
  assert.equal(r.degenerate, true);
  assert.equal(r.label, DEG);
  assert.equal(r.nA1, 3);
  assert.deepEqual(r.ceilingTasks, []);
  assert.deepEqual(r.ci90, [0, 0]);
  const t = tost(cells, { margin: 0.05 });
  assert.equal(t.equivalent, false);
  assert.equal(t.degenerate, true);
  assert.equal(t.p, null);
  assert.equal(t.label, DEG);
  assert.equal(t.est, 0);
});

test('F1b (T-1): H2 trần Δ = 0 (mọi điểm bằng nhau) không được equivalent', () => {
  const t = tost(three([1, 1], [1, 1]), { margin: 0.05 });
  assert.equal(t.equivalent, false);
  assert.equal(t.p, null);
});

test('F6: suy biến nhưng CI nằm hẳn ngoài biên ⇒ p = null, nhãn "Bác bỏ"', () => {
  const cells = three([0.5, 0.5], [0.6, 0.6]);
  const r = bootP(cells, { arm: 'A1' });
  assert.equal(r.p, null);
  assert.equal(r.verdict, 'Bác bỏ');
  assert.equal(r.label, 'Bác bỏ');
  assert.equal(r.k, null);
  assert.ok(Math.abs(r.ci90[0] - 0.1) < 1e-9 && Math.abs(r.ci90[1] - 0.1) < 1e-9);
  const t = tost(cells, { margin: 0.05 });
  assert.equal(t.equivalent, false);
  assert.equal(t.p, null);
  assert.equal(t.label, 'Bác bỏ');
});

test('F7 (B-1/T-5): NaN ⇒ bootP p = null (không phải 1/4001), degenerate', () => {
  const r = bootP(three([NaN], [0.5]), { arm: 'A1' });
  assert.equal(r.p, null);
  assert.notEqual(r.p, 1 / 4001);
  assert.equal(r.degenerate, true);
  assert.equal(r.label, DEG);
  assert.equal(r.nA1, 3);
});

test('F7b (T-5): NaN trong tost ⇒ suy biến, không equivalent, không im lặng bỏ NaN', () => {
  const t = tost(three([NaN, 0.5], [0.5, 0.5]), { margin: 0.05 });
  assert.equal(t.degenerate, true);
  assert.equal(t.equivalent, false);
  assert.equal(t.p, null);
  assert.equal(t.label, DEG);
  const t2 = tost(three([0.5], [NaN]), { margin: 0.05, scale: 'logratio' });
  assert.equal(t2.equivalent, false);
  assert.equal(t2.degenerate, true);
});

test('tost không suy biến: hợp đồng API { est, lo, hi, p, equivalent, degenerate, label }', () => {
  const cells = ['x', 'y', 'z'].map((t) => mk(t, [0.70, 0.71, 0.69, 0.70], [0.71, 0.70, 0.70, 0.71]));
  const r = tost(cells, { margin: 0.05, seed: 1 });
  assert.equal(r.equivalent, true);
  assert.equal(r.degenerate, false);
  assert.ok(r.p > 0 && r.p <= 1);
  assert.equal(r.lo, r.lo90);
  assert.equal(r.hi, r.hi90);
  assert.ok(typeof r.label === 'string' && r.label !== DEG);
});

test('F8 (T-1): h6Combine — suy biến một cặp ⇒ p null, degenerate, supported = false, nhãn đăng ký', () => {
  const good = three([0.5, 0.6, 0.55], [0.52, 0.58, 0.57]);
  const pOk = bootP(good, { arm: 'A1', seed: 3 });
  const pDeg = bootP(three([0.7, 0.7], [0.7, 0.7]), { arm: 'A2' });
  const c = h6Combine(pOk, pDeg);
  assert.equal(c.p, null);
  assert.equal(c.degenerate, true);
  assert.equal(c.supported, false);
  assert.equal(c.label, DEG);
  const c2 = h6Combine(pDeg, pOk);
  assert.equal(c2.supported, false);
  assert.equal(c2.p, null);
});

test('F8 (T-1/B-1): h6Combine — NaN ở một cặp ⇒ không supported, p null', () => {
  const pNaN = bootP(three([NaN], [0.5]), { arm: 'A2' });
  const pOk = bootP(three([0.5, 0.6, 0.55], [0.52, 0.58, 0.57]), { arm: 'A1', seed: 3 });
  const c = h6Combine(pOk, pNaN);
  assert.equal(c.p, null);
  assert.equal(c.degenerate, true);
  assert.equal(c.supported, false);
  assert.equal(c.label, DEG);
});

test('F8 (a)–(e): h6Combine các nhánh còn lại', () => {
  const e1 = bootP([], { arm: 'A1' }), e2 = bootP([], { arm: 'A2' });
  const a = h6Combine(e1, e2);
  assert.equal(a.p, null);
  assert.equal(a.verdict, 'estimate');
  assert.equal(a.supported, false);
  assert.equal(a.nA1, 0);
  assert.equal(a.nA2, 0);
  assert.deepEqual(a.ci90, { A1: null, A2: null });
  assert.deepEqual(a.k, { A1: null, A2: null });
  const mkRes = (arm, o) => ({ nA1: arm === 'A1' ? 3 : null, nA2: arm === 'A2' ? 3 : null, ceilingTasks: [], B: 4000, ci90: [0, 0.01], k: null, p: null, degenerate: false, ...o });
  const pOk = (arm, p) => mkRes(arm, { p, verdict: 'p', k: 1, ci90: [-0.01, 0.01] });
  assert.equal(h6Combine(mkRes('A1', { verdict: 'estimate' }), pOk('A2', 0.01)).verdict, 'estimate');
  const c = h6Combine(mkRes('A1', { verdict: 'Bác bỏ', degenerate: true }), pOk('A2', 0.01));
  assert.equal(c.p, null);
  assert.equal(c.verdict, 'Bác bỏ');
  assert.equal(c.supported, false);
  const d = h6Combine(mkRes('A1', { verdict: 'Không kết luận (trần/suy biến)', degenerate: true }), pOk('A2', 0.01));
  assert.equal(d.p, null);
  assert.equal(d.label, DEG);
  const e = h6Combine(pOk('A1', 0.01), pOk('A2', 0.03));
  assert.equal(e.p, 0.03);
  assert.equal(e.verdict, 'p');
  assert.equal(e.supported, true);
  assert.equal(e.degenerate, false);
});
