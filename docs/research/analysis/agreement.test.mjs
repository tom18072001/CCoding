// Test tính tay cho agreement.mjs. Chạy: node --test docs/research/analysis/agreement.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { metrics, bootstrapCI, bootstrapSample, groupByRun, rng, report, parseCsv, toCsv, vn, clopperPearson, minPositives } from './agreement.mjs';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≠ ${b}`);
const mk = (ref, pred, runId) => ref.map((r, i) => ({ ref: r, pred: pred[i], ...(runId ? { runId: runId[i] } : {}) }));
const rep = (n, ref, pred, runId) => Array.from({ length: n }, () => ({ ref, pred, ...(runId ? { runId } : {}) }));

test('κ = 0: khớp đúng bằng mức ngẫu nhiên', () => {
  // ref 1,1,0,0 · pred 1,0,1,0 → po = 2/4, pe = (.5·.5 + .5·.5) = .5, κ = 0
  const m = metrics(mk([1, 1, 0, 0], [1, 0, 1, 0]));
  assert.deepEqual([m.tp, m.fn, m.fp, m.tn], [1, 1, 1, 1]);
  near(m.accuracy, 0.5); near(m.precision, 0.5); near(m.recall, 0.5); near(m.f1, 0.5);
  near(m.kappa, 0); near(m.pabak, 0); near(m.prevalence, 0.5);
  assert.equal(m.warnings.length, 0);
});

test('κ = 1: khớp hoàn toàn', () => {
  const m = metrics(mk([1, 1, 0, 0, 0], [1, 1, 0, 0, 0]));
  near(m.accuracy, 1); near(m.f1, 1); near(m.kappa, 1); near(m.pabak, 1);
  near(m.prevalence, 0.4);
});

test('nghịch lý prevalence: khớp thô 0,90, κ âm nhỏ, PABAK 0,8, có cảnh báo', () => {
  // TP 90, FN 5, FP 5, TN 0, N = 100: po = .90, ref dương = pred dương = .95, pe = .95² + .05² = .905
  // κ = (.90 − .905)/(1 − .905) = −.005/.095 = −1/19; PABAK = 2·.9 − 1 = .8; P = R = F1 = 90/95
  const pairs = [...rep(90, 1, 1), ...rep(5, 1, 0), ...rep(5, 0, 1)];
  const m = metrics(pairs);
  assert.deepEqual([m.tp, m.fn, m.fp, m.tn], [90, 5, 5, 0]);
  near(m.accuracy, 0.9); near(m.pe, 0.905); near(m.kappa, -1 / 19);
  near(m.pabak, 0.8); near(m.precision, 90 / 95); near(m.recall, 90 / 95); near(m.f1, 90 / 95);
  near(m.prevalence, 0.95); assert.equal(m.nPositive, 95);
  assert.equal(m.warnings.length, 1);
  assert.match(m.warnings[0], /NGHỊCH LÝ κ/);
  assert.match(m.warnings[0], /PABAK = 0,800/);
});

test('prevalence thấp (< 0,1) cũng cảnh báo; ở 0,5 thì không', () => {
  assert.equal(metrics([...rep(2, 1, 1), ...rep(98, 0, 0)]).warnings.length, 1);
  assert.equal(metrics([...rep(10, 1, 1), ...rep(10, 0, 0)]).warnings.length, 0);
});

test('κ không xác định khi chỉ một nhãn (pe = 1); không lỗi, PABAK vẫn tính được', () => {
  const m = metrics(rep(6, 1, 1), { positive: '1' });
  assert.ok(Number.isNaN(m.kappa)); near(m.pabak, 1); near(m.accuracy, 1);
  assert.equal(vn(m.kappa), 'n/a');
});

test('3 lớp: ma trận nhầm lẫn, macro-F1, κ, PABAK', () => {
  // hàng = tham chiếu A,B,C; cột = dự đoán A,B,C: A [4,1,0] · B [1,3,1] · C [1,1,2]; N = 14
  const cm = { A: { A: 4, B: 1, C: 0 }, B: { A: 1, B: 3, C: 1 }, C: { A: 1, B: 1, C: 2 } };
  const pairs = Object.entries(cm).flatMap(([r, row]) => Object.entries(row).flatMap(([p, n]) => rep(n, r, p)));
  const m = metrics(pairs);
  assert.equal(m.binary, false); assert.deepEqual(m.labels, ['A', 'B', 'C']);
  assert.deepEqual(m.matrix, [[4, 1, 0], [1, 3, 1], [1, 1, 2]]);
  near(m.accuracy, 9 / 14);
  // po = 9/14 = 126/196; pe = (5·6 + 5·5 + 4·3)/196 = 67/196; κ = 59/129
  near(m.pe, 67 / 196); near(m.kappa, 59 / 129);
  // F1 từng lớp = 2TP/(2TP+FP+FN): A 8/11, B 3/5, C 4/7 → macro = 731/1155
  near(m.perClass[0].f1, 8 / 11); near(m.perClass[1].f1, 3 / 5); near(m.perClass[2].f1, 4 / 7);
  near(m.macroF1, 731 / 1155); near(m.f1, 731 / 1155);
  near(m.precision, (4 / 6 + 3 / 5 + 2 / 3) / 3); near(m.recall, (4 / 5 + 3 / 5 + 2 / 4) / 3);
  near(m.pabak, (3 * (9 / 14) - 1) / 2); // = 13/28
});

test('bootstrap lấy lại THEO LƯỢT: tổng cỡ mẫu chỉ có thể là tổng cỡ của các lượt', () => {
  // Lượt X có 3 cặp, lượt Y có 1 cặp. Lấy lại 2 lượt → cỡ ∈ {2 (YY), 4 (XY, YX), 6 (XX)}; không bao giờ 1, 3, 5.
  // Nếu lấy lại theo mục (4 cặp) thì cỡ luôn bằng 4 và CI sẽ suy biến [4; 4].
  const pairs = [...rep(3, 1, 1, 'X'), ...rep(1, 0, 1, 'Y')];
  const groups = groupByRun(pairs);
  assert.deepEqual(groups.map((g) => g.length), [3, 1]);
  const rnd = rng(7), sizes = new Set();
  for (let i = 0; i < 500; i++) sizes.add(bootstrapSample(groups, rnd).length);
  assert.deepEqual([...sizes].sort(), [2, 4, 6]);
  // P(2) = P(6) = 1/4 nên phân vị 2,5 % và 97,5 % là 2 và 6
  const ci = bootstrapCI(pairs, (s) => s.length, { B: 4000, seed: 1 });
  near(ci.lo, 2); near(ci.hi, 6); assert.equal(ci.runs, 2); assert.equal(ci.valid, 4000);
});

test('bootstrap: mọi mục của một lượt đi cùng nhau (không tách được)', () => {
  const pairs = [...rep(4, 1, 1, 'A'), ...rep(4, 1, 0, 'B'), ...rep(4, 0, 0, 'C')];
  const rnd = rng(3);
  for (let i = 0; i < 200; i++) {
    const s = bootstrapSample(groupByRun(pairs), rnd);
    assert.equal(s.length % 4, 0);
    for (const run of ['A', 'B', 'C']) assert.equal(s.filter((p) => p.runId === run).length % 4, 0);
  }
});

test('bootstrap: seed cố định cho kết quả giống hệt; đổi seed thì khác', () => {
  const pairs = mk([1, 1, 0, 0, 1, 0, 1, 1], [1, 0, 0, 1, 1, 0, 1, 0], ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd']);
  const stat = (s) => metrics(s, { positive: '1' }).accuracy;
  assert.deepEqual(bootstrapCI(pairs, stat, { seed: 5 }), bootstrapCI(pairs, stat, { seed: 5 }));
  // 4 lượt cho CI rời rạc nên hai seed có thể trùng cận; so chuỗi giá trị từng bản lấy mẫu.
  const seq = (seed) => { const v = []; bootstrapCI(pairs, (s) => { v.push(stat(s)); return stat(s); }, { seed, B: 300 }); return v; };
  assert.deepEqual(seq(5), seq(5));
  assert.notDeepEqual(seq(5), seq(6));
});

test('bootstrap: bản lấy mẫu mà κ không xác định bị bỏ và đếm', () => {
  const pairs = [...rep(2, 1, 1, 'A'), ...rep(2, 0, 0, 'B')];
  const ci = bootstrapCI(pairs, (s) => metrics(s, { positive: '1' }).kappa, { B: 1000, seed: 2 });
  assert.ok(ci.valid < 1000 && ci.valid > 0); // AA hoặc BB cho κ n/a (xác suất 1/2)
  near(ci.lo, 1); near(ci.hi, 1);
});

test('report: CI gồm đủ chỉ số và chứa ước lượng điểm của Accuracy', () => {
  const pairs = mk([1, 1, 0, 0, 1, 0, 1, 1, 0, 1], [1, 0, 0, 1, 1, 0, 1, 1, 0, 1], ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd', 'e', 'e']);
  const r = report(pairs, { positive: '1', B: 500 });
  for (const k of ['accuracy', 'precision', 'recall', 'f1', 'kappa', 'pabak']) assert.ok(k in r.ci);
  assert.ok(r.ci.accuracy.lo <= r.accuracy && r.accuracy <= r.ci.accuracy.hi);
  assert.equal(r.nPositive, 6);
});

test('CSV: vòng khứ hồi với dấu phẩy, ngoặc kép, xuống dòng; bỏ BOM và dòng chú thích', () => {
  const csv = '﻿' + toCsv(['a', 'b'], [['x,y', 'dòng 1\ndòng "2"'], ['', '1']]) + '# ghi chú\n';
  assert.deepEqual(parseCsv(csv), [{ a: 'x,y', b: 'dòng 1\ndòng "2"' }, { a: '', b: '1' }]);
});

test('đa lớp: cảnh báo nghịch lý chỉ khi lớp lớn nhất > 0,9; lớp nhỏ < 0,1 thì không (preregistration §5.1)', () => {
  // n = 20: a 12, b 7, c 1 (lớp nhỏ nhất 0,05 < 0,1 nhưng lớp lớn nhất 0,6): khớp hoàn toàn, không cảnh báo
  const lab = [...Array(12).fill('a'), ...Array(7).fill('b'), 'c'];
  const m = metrics(mk(lab, lab));
  assert.equal(m.k, 3); near(m.prevalence, 0.6); near(m.predRate, 0.6); near(m.kappa, 1);
  assert.equal(m.warnings.length, 0);
  // n = 22: a 20, b 1, c 1: lớp lớn nhất 20/22 = 0,909 > 0,9 ⇒ cảnh báo, kèm PABAK
  const lab2 = [...Array(20).fill('a'), 'b', 'c'];
  const m2 = metrics(mk(lab2, lab2));
  near(m2.prevalence, 20 / 22);
  assert.equal(m2.warnings.length, 1); assert.match(m2.warnings[0], /NGHỊCH LÝ κ/); assert.match(m2.warnings[0], /PABAK/);
  // chỉ phía dự đoán chạm trần cũng cảnh báo: ref a 11, b 10, c 1; pred a 20, b 1, c 1 (n = 22)
  const ref3 = [...Array(11).fill('a'), ...Array(10).fill('b'), 'c'], pred3 = [...Array(20).fill('a'), 'b', 'c'];
  const m3 = metrics(mk(ref3, pred3));
  near(m3.prevalence, 0.5); near(m3.predRate, 20 / 22);
  assert.equal(m3.warnings.length, 1);
});

test('PABAK đa lớp dùng k cố định (kFixed) khi lấy lại mẫu có ít lớp hơn mẫu gốc', () => {
  // mẫu 2 nhãn, ép k = 3: po = 3/4, PABAK = (3·0,75 − 1)/(3 − 1) = 0,625; không kFixed thì k = 2 ⇒ 2·0,75 − 1 = 0,5
  const ref = ['a', 'a', 'b', 'b'], pred = ['a', 'a', 'b', 'a'];
  const m = metrics(mk(ref, pred), { kFixed: 3 });
  near(m.po, 0.75); near(m.pabak, 0.625);
  near(metrics(mk(ref, pred)).pabak, 0.5);
});

test('Clopper–Pearson: giá trị tính tay/đã biết', () => {
  const [l1, h1] = clopperPearson(1, 1); near(l1, 0.025, 1e-6); near(h1, 1);        // 1/1 ⇒ [2,5 %; 100 %] như b02m-replay.md
  const [l0, h0] = clopperPearson(0, 10); near(l0, 0); near(h0, 1 - Math.pow(0.025, 1 / 10), 1e-6); // 0/10 ⇒ cận trên 1 − 0,025^(1/10)
  const [l5, h5] = clopperPearson(5, 10); near(l5, 0.1871, 5e-4); near(h5, 0.8129, 5e-4);         // bảng CP chuẩn
  assert.ok(Number.isNaN(clopperPearson(0, 0)[0]));
});

test('minPositives: nửa độ rộng CP ≤ 0,15 tại kết quả; recall gần 0,5 cần nhiều dương hơn gần 1', () => {
  for (const r of [0.6, 0.8, 0.9]) {
    const n = minPositives(r), [lo, hi] = clopperPearson(Math.round(r * n), n);
    assert.ok((hi - lo) / 2 <= 0.15, `r=${r}, n=${n}`);
  }
  assert.ok(minPositives(0.6) > minPositives(0.8) && minPositives(0.8) > minPositives(0.9));
  assert.ok(minPositives(0.8) > 20 && minPositives(0.8) < 45); // Wald cho 28; CP chính xác lớn hơn một chút
});
