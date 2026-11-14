// Test D12/K1a cho lib/stats.mjs theo thẩm định K2 (docs/research/context/k2-stats-review-2026-11-04.md).
// Kỳ vọng lấy theo QUY TẮC ĐĂNG KÝ (preregistration §2.5 v2.1), không theo đầu ra cũ của mã.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tost, bootP, h6Combine, percentileCI, permTwoSample, permStratified, streamFor, fnv1a32, mulberry32 } from '../lib/stats.mjs';

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
  const pDeg1 = bootP(three([0.7, 0.7], [0.7, 0.7]), { arm: 'A1' });
  const pOk2 = bootP(good, { arm: 'A2', seed: 3 });
  const c2 = h6Combine(pDeg1, pOk2);
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

// ---------- T-2, T-3, T-4, T-6, B-2, B-3, C-1 ----------

test('F12 (T-2): tost logratio = trung bình log-tỉ số THEO BÀI (≈ 0,3466), không phải ln(51/50,5)', () => {
  const cells = [mk('t1', [1], [2]), mk('t2', [100], [100])];
  const t = tost(cells, { margin: Math.log(1.15), scale: 'logratio' });
  assert.ok(Math.abs(t.est - Math.log(2) / 2) < 1e-12, `est = ${t.est}`);
  assert.ok(Math.abs(t.est - Math.log(51 / 50.5)) > 0.3);
});

test('T-2/T-5: logratio với trung bình lượt bằng 0 ⇒ log không hữu hạn ⇒ suy biến, không equivalent', () => {
  const t = tost(three([0, 0], [1, 1]), { margin: Math.log(1.15), scale: 'logratio' });
  assert.equal(t.degenerate, true);
  assert.equal(t.equivalent, false);
  assert.equal(t.p, null);
});

test('T-3: ceil 0,99 bỏ bài chạm trần cả hai arm (0,99 vẫn là trần), báo ceilingTasks', () => {
  const cells = [
    mk('c1', [1, 1], [1, 1]), mk('c2', [0.99, 1], [1, 0.99]),
    mk('v1', [0.5, 0.6], [0.52, 0.58]), mk('v2', [0.6, 0.7], [0.58, 0.72]), mk('v3', [0.7, 0.8], [0.69, 0.79]),
    mk('one', [1, 1], [1, 0.98]),
  ];
  const t = tost(cells, { margin: 0.05, ceil: 0.99, minTasks: 3 });
  assert.deepEqual(t.ceilingTasks, ['c1', 'c2']);
  assert.equal(t.n, 4); // v1–v3 và 'one' (trần một phía thì giữ)
  assert.equal(t.degenerate, false);
});

test('T-3/T-6: còn < 3 bài sau khi bỏ trần ⇒ không kết luận, không equivalent, p null', () => {
  const cells = [mk('c1', [1, 1], [1, 1]), mk('c2', [1, 1], [1, 1]), mk('c3', [1, 1], [1, 1]), mk('v1', [0.5, 0.6], [0.5, 0.6])];
  const t = tost(cells, { margin: 0.05, ceil: 0.99, minTasks: 3 });
  assert.equal(t.equivalent, false);
  assert.equal(t.p, null);
  assert.equal(t.n, 1);
  assert.match(t.label, /ít bài/);
  const all = tost(cells.slice(0, 3), { margin: 0.05, ceil: 0.99, minTasks: 3 });
  assert.equal(all.equivalent, false);
  assert.match(all.label, /trần/);
});

test('T-6: tost n = 2 bài với minTasks = 3 (B-01 (a), (b)) ⇒ không equivalent dù CI hẹp', () => {
  const two = ['x', 'y'].map((t) => mk(t, [1.0, 1.01, 0.99], [1.0, 1.01, 0.99]));
  assert.equal(tost(two, { margin: 0.05, seed: 1 }).equivalent, true); // mặc định minTasks = 0: hành vi cũ
  const gated = tost(two, { margin: 0.05, seed: 1, minTasks: 3 });
  assert.equal(gated.equivalent, false);
  assert.equal(gated.p, null);
});

test('T-4/A-6: percentileCI nội suy kiểu R-7 (0..999 ⇒ [24,975; 974,025]), bỏ giá trị không hữu hạn', () => {
  const v = Array.from({ length: 1000 }, (_, i) => i);
  const ci = percentileCI([...v, NaN, Infinity]);
  assert.ok(Math.abs(ci[0] - 24.975) < 1e-9 && Math.abs(ci[1] - 974.025) < 1e-9, String(ci));
  assert.equal(percentileCI([]), null);
  assert.deepEqual(percentileCI([5]), [5, 5]);
  const m = percentileCI(v, 0.9);
  assert.ok(Math.abs(m[0] - 49.95) < 1e-9);
});

test('B-2: không suy biến nhưng CI hẳn ngoài biên ⇒ label "Bác bỏ", vẫn có p; h6Combine cũng "Bác bỏ", không supported', () => {
  const cells = ['x', 'y', 'z'].map((t) => mk(t, [0.5, 0.51, 0.5], [0.7, 0.71, 0.69]));
  const r1 = bootP(cells, { arm: 'A1' }), r2 = bootP(cells, { arm: 'A2' });
  assert.equal(r1.label, 'Bác bỏ');
  assert.equal(r1.degenerate, false);
  assert.equal(typeof r1.p, 'number');
  const c = h6Combine(r1, r2);
  assert.equal(c.label, 'Bác bỏ');
  assert.equal(c.supported, false);
  assert.equal(tost(cells, { margin: 0.05 }).label, 'Bác bỏ');
});

test('B-3/B-4: bootP ghi chú CI một tầng; tost ghi chú CI hai tầng', () => {
  const cells = three([0.5, 0.6, 0.55], [0.52, 0.58, 0.57]);
  assert.match(bootP(cells, { arm: 'A1' }).ciNote, /một tầng/);
  assert.match(tost(cells, { margin: 0.05 }).ciNote, /hai tầng/);
});

test('C-1: bootP thiếu/sai arm ⇒ lỗi; h6Combine nhận kết quả sai arm ⇒ lỗi', () => {
  const cells = three([0.5, 0.6, 0.55], [0.52, 0.58, 0.57]);
  assert.throws(() => bootP(cells), /arm/);
  assert.throws(() => bootP(cells, { arm: 'B0' }), /arm/);
  const a1 = bootP(cells, { arm: 'A1' }), a2 = bootP(cells, { arm: 'A2' });
  assert.throws(() => h6Combine(a2, a1), /h6Combine/);
  assert.throws(() => h6Combine(a1, a1), /h6Combine/);
  assert.doesNotThrow(() => h6Combine(a1, a2));
});

test('F2–F5: bootP trần, ngưỡng 0,99, n = 0, n = 1–3', () => {
  const ones = ['a', 'b', 'c', 'd'].map((t) => mk(t, [1, 1, 1], [1, 1, 1]));
  const f2 = bootP(ones, { arm: 'A1' });
  assert.equal(f2.ceilingTasks.length, 4);
  assert.equal(f2.nA1, 0);
  assert.equal(f2.verdict, 'estimate');
  assert.equal(f2.ci90, null);
  const kept = (a, b) => bootP([mk('t', a, b)], { arm: 'A1' }).nA1;
  assert.equal(kept([0.99, 0.99, 0.99], [0.99, 1, 1]), 0); // (i) = 0,99 là trần
  assert.equal(kept([1, 1, 1], [1, 1, 0.998]), 0); // (ii)
  assert.equal(kept([1, 1, 1], [1, 1, 0.98]), 1); // (iii)
  assert.equal(kept([1, 1, 1], [1, 1, 0.9899999]), 1); // (iv)
  const f4 = bootP([], { arm: 'A1' });
  assert.equal(f4.nA1, 0);
  assert.equal(f4.ci90, null);
  assert.equal(bootP(three([0.5], [0.5]), { arm: 'A1', taskSet: ['q'] }).nA1, 0);
  const mkN = (n) => ['x', 'y', 'z'].slice(0, n).map((t) => mk(t, [0.5, 0.6, 0.7], [0.6, 0.6, 0.8]));
  for (const n of [1, 2]) {
    const r = bootP(mkN(n), { arm: 'A1' });
    assert.equal(r.verdict, 'estimate');
    assert.equal(r.p, null);
    assert.ok(r.ci90.every(Number.isFinite));
  }
  const r3 = bootP(mkN(3), { arm: 'A1' });
  assert.equal(r3.verdict, 'p');
  assert.ok(r3.p >= 1 / 4001 && r3.p <= 1);
});

// ---------- S-1, S-2, P-2, A-5, F9–F11 ----------

const same = (n, v, r = 2) => Array.from({ length: n }, (_, i) => mk(`t${i}`, Array(r).fill(v), Array(r).fill(v)));

test('F9: permTwoSample suy biến (H3) — recall p = 1, precision p = pMin; b rỗng ⇒ null; a=[0,0], b=[1,1]', () => {
  const ones = Array(10).fill(1.0);
  const rec = permTwoSample(ones, ones, { shift: -0.15 });
  assert.equal(rec.N, 184756);
  assert.equal(rec.p, 1);
  assert.equal(rec.pMin, 1 / 184756);
  assert.equal(rec.exact, true);
  const prec = permTwoSample(ones, ones, { shift: 0.05 });
  assert.equal(prec.p, 1 / 184756);
  assert.equal(Math.max(rec.p, prec.p), 1);
  const empty = permTwoSample([1, 2], [NaN]);
  assert.equal(empty.p, null);
  assert.equal(empty.N, 0);
  assert.equal(permTwoSample([0, 0], [1, 1]).p, 1 / 6);
  assert.equal(permTwoSample([0, 0], [1, 1], { alt: 'two' }).p, 2 / 6);
});

test('P-2: permTwoSample r = 20 mỗi arm ⇒ Monte Carlo M = 10 000, hạt 20261102, tái lập, không treo', () => {
  const a = Array.from({ length: 20 }, (_, i) => 0.3 + i * 0.01), b = Array.from({ length: 20 }, (_, i) => 0.5 + i * 0.01);
  const t0 = Date.now();
  const r = permTwoSample(a, b);
  assert.ok(Date.now() - t0 < 10000);
  assert.equal(r.exact, false);
  assert.equal(r.N, 10000);
  assert.ok(r.nTotal > 1e11);
  assert.equal(r.pMin, 1 / 10001);
  assert.ok(r.p >= 1 / 10001 && r.p <= 1);
  assert.deepEqual(permTwoSample(a, b), r);
  assert.equal(permTwoSample(a, b, { seed: 1 }).exact, false);
  assert.equal(permTwoSample(a.slice(0, 10), b.slice(0, 10)).exact, true); // C(20,10) ≤ 10⁶ ⇒ vẫn chính xác
  assert.equal(permTwoSample(a.slice(0, 10), b.slice(0, 10), { maxExact: 1000 }).exact, false);
});

test('P-2: permStratified ∏ C > 10⁶ ⇒ Monte Carlo M = 10 000 (không liệt kê), tái lập', () => {
  const cells = ['x', 'y', 'z'].map((t) => mk(t, Array.from({ length: 20 }, (_, i) => 0.2 + i * 0.01), Array.from({ length: 20 }, (_, i) => 0.4 + i * 0.01)));
  const r = permStratified(cells);
  assert.equal(r.exact, false);
  assert.equal(r.nPerm, 10000);
  assert.ok(r.p >= 1 / 10001 && r.p <= 1);
  assert.deepEqual(permStratified(cells), r);
});

test('F10: permStratified cơ bản (margin 0 giữ hành vi cũ)', () => {
  const e = permStratified([]);
  assert.deepEqual([e.n, e.nPerm, e.p, e.pMin], [0, 0, null, null]);
  assert.ok(Number.isNaN(e.tObs));
  const b = permStratified([mk('t', [0], [1])]);
  assert.deepEqual([b.nPerm, b.tObs, b.p, b.pMin], [2, 1, 0.5, 0.5]);
  const c = permStratified([mk('x', [1], []), mk('y', [0], [1])]);
  assert.deepEqual([c.n, c.skipped, c.p], [1, ['x'], 0.5]);
  const d = permStratified([mk('x', [1, 1], [1, 1]), mk('y', [1, 1], [1, 1])]);
  assert.deepEqual([d.nPerm, d.tObs, d.p, d.pMin, d.degenerate], [36, 0, 1, 1 / 36, false]);
  const mc = permStratified([mk('x', [1, 1], [1, 1]), mk('y', [1, 1], [1, 1])], { maxExact: 1 });
  assert.equal(mc.exact, false);
  assert.equal(mc.nPerm, 10000);
  assert.deepEqual(permStratified([mk('x', [1, 1], [1, 1]), mk('y', [1, 1], [1, 1])], { maxExact: 1 }), mc);
});

test('F11 (S-1): bài trần có margin (H2′) ⇒ p = null, degenerate, ceilingTasks; không còn p_min giả 1/6 và 1/252', () => {
  for (const r of [2, 5]) {
    const cells = [mk('x', Array(r).fill(1), Array(r).fill(1))];
    const res = permStratified(cells, { alt: 'less', margin: 0.05 });
    assert.equal(res.p, null);
    assert.equal(res.degenerate, true);
    assert.equal(res.label, 'không kết luận (suy biến)');
    assert.deepEqual(res.ceilingTasks, ['x']);
    assert.equal(res.n, 0);
    // độ nhạy: tắt chốt chặn ⇒ tái hiện số cũ
    const legacy = permStratified(cells, { alt: 'less', margin: 0.05, ceilGuard: false });
    assert.equal(legacy.p, r === 2 ? 1 / 6 : 1 / 252);
    assert.ok(Math.abs(legacy.tObs + 0.05) < 1e-12);
  }
});

test('S-1: bài hằng không do trần (mọi lượt 0,7) có margin ⇒ suy biến; bài trần bị loại, bài còn lại vẫn cho p', () => {
  const flat = permStratified(same(2, 0.7), { alt: 'less', margin: 0.05 });
  assert.equal(flat.p, null);
  assert.equal(flat.degenerate, true);
  assert.deepEqual(flat.ceilingTasks, []);
  const mixed = permStratified([mk('top', [1, 1], [1, 1]), mk('x', [0.4, 0.6], [0.5, 0.7]), mk('y', [0.3, 0.5], [0.4, 0.6])], { alt: 'greater', margin: 0.05 });
  assert.deepEqual(mixed.ceilingTasks, ['top']);
  assert.equal(mixed.n, 2);
  assert.equal(mixed.degenerate, false);
  assert.equal(typeof mixed.p, 'number');
  assert.equal(mixed.nPerm, 36);
  // bài trần một phía thì giữ
  assert.equal(permStratified([mk('x', [1, 1], [1, 0.9]), mk('y', [0.3, 0.5], [0.4, 0.6])], { margin: 0.05 }).ceilingTasks.length, 0);
});

test('S-2: alt = two kèm margin — T_obs tính trên b − margin; p = #{|T*| ≥ |T_obs|}/N', () => {
  const cells = [mk('t', [0.2, 0.4], [0.8, 0.6])];
  const two = permStratified(cells, { alt: 'two', margin: 0.1 });
  assert.ok(Math.abs(two.tObs - 0.3) < 1e-12);
  assert.equal(two.nPerm, 6);
  assert.equal(two.p, 2 / 6);
  assert.equal(permStratified(cells, { alt: 'greater', margin: 0.1 }).p, 1 / 6);
  assert.equal(permStratified(cells, { alt: 'less', margin: 0.1 }).p, 1);
  // margin đổi dấu T_obs: hai phía bắt được cả hai đuôi
  const neg = permStratified([mk('t', [0.8, 0.6], [0.2, 0.4])], { alt: 'two', margin: -0.1 });
  assert.ok(neg.tObs < 0);
  assert.equal(neg.p, 2 / 6);
});

test('A-5: streamFor tất định theo (hypId, hạt gốc); fnv1a32 khớp vector chuẩn', () => {
  assert.equal(fnv1a32(''), 0x811c9dc5);
  assert.equal(fnv1a32('a'), 0xe40c292c);
  assert.equal(fnv1a32('foobar'), 0xbf9cf968);
  const seq = (g) => Array.from({ length: 5 }, g);
  assert.deepEqual(seq(streamFor('H6')), seq(streamFor('H6')));
  assert.deepEqual(seq(streamFor('H6')), seq(mulberry32((20261102 ^ fnv1a32('H6')) >>> 0)));
  assert.notDeepEqual(seq(streamFor('H6')), seq(streamFor('H7')));
  assert.notDeepEqual(seq(streamFor('H6')), seq(streamFor('H6', 7)));
  const g = streamFor('H1');
  const first = g();
  assert.ok(first >= 0 && first < 1);
  assert.equal(first, streamFor('H1')()); // độc lập thứ tự gọi các luồng khác
});
