// Test cho lib/stats.mjs theo suite-review §5 (SR-20, SR-04, SR-26, SR-25).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, fisherYates, tost } from '../lib/stats.mjs';

const near = (x, y, e = 1e-9) => assert.ok(Math.abs(x - y) <= e, `${x} ≠ ${y}`);

test('SR-20 mulberry32: cùng hạt cho cùng chuỗi, khác hạt khác chuỗi, trong [0,1)', () => {
  const a = mulberry32(20261102), b = mulberry32(20261102), c = mulberry32(7);
  const sa = Array.from({ length: 50 }, a), sb = Array.from({ length: 50 }, b), sc = Array.from({ length: 50 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((x) => x >= 0 && x < 1));
});

test('SR-20 fisherYates: không sửa mảng vào, là hoán vị, tái lập theo hạt', () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const snap = [...src];
  const p1 = fisherYates(src, mulberry32(1)), p2 = fisherYates(src, mulberry32(1));
  assert.deepEqual(src, snap);
  assert.deepEqual(p1, p2);
  assert.deepEqual([...p1].sort((x, y) => x - y), snap);
});

// ---------- SR-04 ----------
const mk = (task, a, b) => ({ task, a, b });

test('SR-04 tost: chênh nhỏ, biến thiên nhỏ ⇒ tương đương trong ±0,05', () => {
  const cells = ['x', 'y', 'z'].map((t) => mk(t, [0.70, 0.71, 0.69, 0.70], [0.71, 0.70, 0.70, 0.71]));
  const r = tost(cells, { margin: 0.05, seed: 1 });
  assert.equal(r.equivalent, true);
  assert.ok(r.lo90 > -0.05 && r.hi90 < 0.05);
  near(r.est, 0.005, 1e-9);
});

test('SR-04 tost: chênh +0,10 ⇒ ngoài biên, không tương đương', () => {
  const cells = ['x', 'y', 'z'].map((t) => mk(t, [0.6, 0.7, 0.65], [0.8, 0.75, 0.8]));
  const r = tost(cells, { margin: 0.05, seed: 1 });
  assert.equal(r.equivalent, false);
  assert.ok(r.lo90 > 0.05);
});

test('SR-04 tost: biến thiên lớn ⇒ CI tràn biên dù est gần 0; tái lập theo hạt', () => {
  const cells = [mk('x', [0.1, 0.9], [0.9, 0.1]), mk('y', [0.2, 0.8], [0.8, 0.2])];
  const r1 = tost(cells, { margin: 0.05, seed: 3 }), r2 = tost(cells, { margin: 0.05, seed: 3 });
  assert.equal(r1.equivalent, false);
  assert.deepEqual(r1, r2);
});

test('SR-04 tost logratio: tỉ số ~1 trong ln(1,1) ⇒ tương đương; tỉ số 1,5 thì không', () => {
  const m = Math.log(1.1);
  const eq = tost(['x', 'y'].map((t) => mk(t, [100, 101, 99], [100, 100, 101])), { margin: m, scale: 'logratio', seed: 2 });
  assert.equal(eq.equivalent, true);
  const ne = tost(['x', 'y'].map((t) => mk(t, [100, 101, 99], [150, 151, 149])), { margin: m, scale: 'logratio', seed: 2 });
  assert.equal(ne.equivalent, false);
  near(ne.est, Math.log(1.5), 0.01);
});

test('SR-04 tost: không có ô hợp lệ ⇒ không tương đương, est NaN', () => {
  const r = tost([mk('x', [1], [])], { margin: 0.05 });
  assert.equal(r.equivalent, false);
  assert.ok(Number.isNaN(r.est));
});

// ---------- SR-26 ----------
import { permTwoSample, bootP, h6Combine, confirmable } from '../lib/stats.mjs';

const rep = (v, n) => Array(n).fill(v);
const A1 = (cells, o = {}) => bootP(cells, { arm: 'A1', ...o });
const tasks = (names, a, b) => names.map((t) => mk(t, a, b));

test('SR-26 ca 1 (H3, hiệu ứng rõ): p = 1/184756, N, exact, confirmable', () => {
  const rec = permTwoSample(rep(0.5, 10), rep(0.9, 10), { shift: -0.15 });
  const pre = permTwoSample(rep(0.8, 10), rep(0.8, 10), { shift: 0.05 });
  assert.equal(rec.N, 184756);
  assert.equal(rec.exact, true);
  near(rec.p, 1 / 184756, 1e-15);
  near(pre.p, 1 / 184756, 1e-15);
  near(Math.max(rec.p, pre.p), 1 / 184756, 1e-15);
  assert.equal(confirmable(rec.pMin, 0.0125), true);
});

test('SR-26 ca 2 (H3, dưới ngưỡng): Δ = 0,10 ≤ 0,15 ⇒ p = 1', () => {
  assert.equal(permTwoSample(rep(0.5, 10), rep(0.6, 10), { shift: -0.15 }).p, 1);
});

test('SR-26 permTwoSample: r_a ≠ r_b (NaN bị bỏ) ⇒ N = C(r_a + r_b, r_b)', () => {
  const r = permTwoSample(rep(0.8, 5), [0.9, NaN, 0.9, 0.9]);
  assert.equal(r.N, 56); // C(8, 3)
});

test('SR-26 ca 3: chạm trần cả hai arm ⇒ estimate, không p', () => {
  const r = A1(tasks(['t1', 't2', 't3'], rep(1, 3), rep(1, 3)));
  assert.equal(r.verdict, 'estimate');
  assert.equal(r.p, null);
  assert.equal(r.nA1, 0);
  assert.deepEqual(r.ceilingTasks, ['t1', 't2', 't3']);
});

test('SR-26 ca 3 biến thể: 4 bài 0,7 không biến thiên ⇒ p = NA, không phải 1/4001', () => {
  const r = A1(tasks(['t1', 't2', 't3', 't4'], rep(0.7, 3), rep(0.7, 3)));
  assert.equal(r.p, null);
  assert.notEqual(r.p, 1 / 4001);
  assert.equal(r.verdict, 'Không kết luận (trần/suy biến)');
  assert.equal(r.pMin, undefined);
});

test('SR-26 ca 4: lệch +0,10 ổn định ⇒ p = NA, Bác bỏ; có biến thiên ⇒ p số ≈ 1', () => {
  const r = A1(tasks(['t1', 't2', 't3'], rep(0.7, 3), rep(0.8, 3)));
  assert.equal(r.p, null);
  assert.equal(r.verdict, 'Bác bỏ');
  const v = A1(tasks(['t1', 't2', 't3'], [0.6, 0.7, 0.5], [0.8, 0.9, 0.7]));
  assert.ok(typeof v.p === 'number' && v.p > 0.9, `p=${v.p}`);
});

test('SR-26 ca 5: chạm trần một phía ⇒ giữ bài; bài trần cả hai arm bị loại', () => {
  const cells = [mk('t1', [1, 1, 1], [1, 1, 1]), mk('t2', [1, 1, 1], [1, 1, 1]), mk('t3', [1, 1, 0.9], [1, 1, 1])];
  const r = A1(cells);
  assert.deepEqual(r.ceilingTasks, ['t1', 't2']);
  assert.equal(r.nA1, 1);
  assert.equal(r.verdict, 'estimate');
  const more = [...cells.slice(0, 2), ...['t3', 't4', 't5'].map((t) => mk(t, [1, 1, 0.9], [1, 1, 1]))];
  const r2 = A1(more);
  assert.equal(r2.nA1, 3);
  assert.equal(typeof r2.p, 'number');
});

test('SR-26 ca 5b: ngưỡng 0,99 — 0,998 vẫn là trần; 0,98 thì giữ bài', () => {
  const names = ['t1', 't2', 't3'];
  const r = A1(tasks(names, [1, 1, 0.998], [1, 1, 1]));
  assert.equal(r.nA1, 0);
  assert.equal(r.ceilingTasks.length, 3);
  assert.equal(r.verdict, 'estimate');
  const k = A1(tasks(names, [1, 1, 0.98], [1, 1, 1]));
  assert.equal(k.nA1, 3);
  assert.equal(k.ceilingTasks.length, 0);
});

test('SR-26 ca 5c: gộp hai cặp — một cặp NA ⇒ p(H6) = NA, không max', () => {
  const deg = bootP(tasks(['t1', 't2', 't3'], rep(0.7, 3), rep(0.7, 3)), { arm: 'A1' });
  const ok = bootP(tasks(['t1', 't2', 't3'], [0.6, 0.7, 0.8], [0.6, 0.7, 0.8]), { arm: 'A2' });
  assert.equal(deg.p, null);
  assert.equal(typeof ok.p, 'number');
  const h = h6Combine(deg, ok);
  assert.equal(h.p, null);
  assert.equal(h.verdict, 'Không kết luận (trần/suy biến)');
  // C-1 (K2): h6Combine đòi pA1 từ arm A1, pA2 từ arm A2 (cùng ô, cùng hạt ⇒ cùng p)
  const ok1 = bootP(tasks(['t1', 't2', 't3'], [0.6, 0.7, 0.8], [0.6, 0.7, 0.8]), { arm: 'A1' });
  assert.equal(h6Combine(ok1, ok).p, ok.p);
});

test('SR-26 ca 6: đủ bài, không suy biến ⇒ p số trong [pMin, 1], pMin = 1/4001', () => {
  const r = A1(tasks(['t1', 't2', 't3'], [0.6, 0.7, 0.8], [0.6, 0.7, 0.8]));
  assert.equal(typeof r.p, 'number');
  assert.ok(r.p >= 1 / 4001 && r.p <= 1);
  near(r.pMin, 1 / 4001, 1e-15);
  assert.notEqual(r.verdict, 'Không kết luận (trần/suy biến)');
  assert.equal(r.B, 4000);
});

test('SR-26 ca 7: cùng hạt ⇒ cùng kết quả', () => {
  const c = tasks(['t1', 't2', 't3'], [0.6, 0.7, 0.8], [0.5, 0.75, 0.9]);
  assert.deepEqual(A1(c, { seed: 5 }), A1(c, { seed: 5 }));
});

test('SR-26 ca 8: B = 19 ⇒ pMin = 0,05 ⇒ confirmable = false ở ngưỡng 0,0125', () => {
  const r = A1(tasks(['t1', 't2', 't3'], [0.6, 0.7, 0.8], [0.6, 0.7, 0.8]), { B: 19 });
  near(r.pMin, 0.05, 1e-12);
  assert.equal(confirmable(r.pMin, 0.0125), false);
  assert.equal(confirmable(1 / 184756, 0.0125), true);
});

test('SR-26 (a) taskSet: bài ngoài tập khai báo không được dùng', () => {
  const c = [...tasks(['t1', 't2', 't3'], [0.6, 0.7, 0.8], [0.6, 0.7, 0.8]), mk('s1', [0.1], [0.9])];
  assert.equal(A1(c, { taskSet: ['t1', 't2', 't3'] }).nA1, 3);
  assert.equal(A1(c).nA1, 4);
});

// ---------- SR-25 ----------
import { permStratified } from '../lib/stats.mjs';

const c1 = () => [mk('bài 1', [0, 0], [1, 1]), mk('bài 2', [0.2, 0.3], [0.8, 0.9])];

test('SR-25 ca 1: p_min tính tay = 1/36', () => {
  const r = permStratified(c1());
  near(r.p, 1 / 36);
  near(r.pMin, 1 / 36);
  assert.equal(r.exact, true);
  assert.equal(r.nPerm, 36);
  assert.equal(r.n, 2);
});

test('SR-25 ca 2: có hòa ⇒ p = 5/36', () => {
  const r = permStratified([mk('b1', [0, 0], [1, 1]), mk('b2', [0.5, 1], [0.5, 1])]);
  near(r.tObs, 0.5);
  near(r.p, 5 / 36);
});

test('SR-25 ca 3: 3 bài r = 1 ⇒ N = 8, p = pMin = 1/8', () => {
  const r = permStratified(['x', 'y', 'z'].map((t) => mk(t, [0], [1])));
  assert.equal(r.nPerm, 8);
  near(r.p, 0.125);
  near(r.pMin, 0.125);
});

test('SR-25 ca 4: không có hiệu ứng ⇒ tObs = 0, p = 1', () => {
  const r = permStratified([mk('x', [1, 1], [1, 1]), mk('y', [1, 1, 1], [1, 1, 1])]);
  assert.equal(r.tObs, 0);
  assert.equal(r.p, 1);
});

test('SR-25 ca 5: alt = less trên ca 1 ⇒ p = 1', () => {
  assert.equal(permStratified(c1(), { alt: 'less' }).p, 1);
});

test('SR-25 ca 6: bài thiếu a hoặc b bị bỏ và báo, p không đổi', () => {
  const r = permStratified([...c1(), { task: 'bài 3', a: [0.1, 0.2], b: [] }]);
  assert.deepEqual(r.skipped, ['bài 3']);
  near(r.p, 1 / 36);
  assert.deepEqual(permStratified([...c1(), { task: 'bài 4', a: [0.1] }]).skipped, ['bài 4']);
});

test('SR-25 ca 7: N > maxExact ⇒ Monte Carlo, cùng hạt cùng p, pMin = 1/(M+1)', () => {
  const cells = Array.from({ length: 8 }, (_, i) => mk(`t${i}`, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], [0.3, 0.5, 0.2, 0.7, 0.6, 0.9]));
  const r1 = permStratified(cells, { seed: 9 }), r2 = permStratified(cells, { seed: 9 });
  assert.equal(r1.exact, false);
  assert.equal(r1.p, r2.p);
  assert.equal(r1.nPerm, 10000);
  near(r1.pMin, 1 / 10001);
  assert.ok(r1.p >= 1 / 10001 && r1.p <= 1);
});

test('SR-25 ca 8: cổng nhãn — pMin = 0,125 ở ngưỡng 0,0125 ⇒ confirmable = false', () => {
  const r = permStratified(['x', 'y', 'z'].map((t) => mk(t, [0], [1])));
  assert.equal(confirmable(r.pMin, 0.0125), false);
  assert.equal(confirmable(1 / 252, 0.0125), true);
});

test('SR-25 ca 9: margin trừ khỏi TREAT (H2′, alt = less)', () => {
  const r = permStratified([mk('x', [0.5, 0.5], [0.55, 0.55])], { alt: 'less', margin: 0.05 });
  assert.equal(r.p, 1);
  near(r.pMin, 1 / 6);
  const o = permStratified([mk('x', [0.5, 0.5], [0.4, 0.4])], { alt: 'less', margin: 0.05 });
  near(o.p, 1 / 6);
});

test('SR-25 margin phân biệt: greater, b = a + margin ⇒ sau dịch hòa ⇒ p = 1; margin = 0 ⇒ p = 1/6', () => {
  const c = [mk('x', [0.5, 0.5], [0.55, 0.55])];
  assert.equal(permStratified(c, { margin: 0.05 }).p, 1);
  near(permStratified(c, { margin: 0 }).p, 1 / 6);
});

test('SR-25 bài r_a ≠ r_b hợp lệ: N = C(5,2)', () => {
  assert.equal(permStratified([mk('x', [0.1, 0.2, 0.3], [0.9, 0.8])]).nPerm, 10);
});
