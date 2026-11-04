// D12/K1b: test analyze.mjs theo thẩm định K2 (docs/research/context/k2-stats-review-2026-11-04.md §2.6, §3, §4).
// Kỳ vọng lấy từ preregistration §2.4–§2.7 (không từ đầu ra cũ): suy biến/NaN ⇒ p = NA, không SUPPORTED (§2.5 (c)).
// Bảng F → test (mức analyze; mức hàm nằm ở stats-k2.test.mjs): F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12 đều có test 'Fn …' dưới đây.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { streamFor, percentileCI } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ANALYZE = path.resolve(HERE, '../analyze.mjs');

function run(rows, args = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'an-k2-'));
  fs.writeFileSync(path.join(dir, 'runs.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const p = spawnSync(process.execPath, [ANALYZE, dir, ...args], { encoding: 'utf8' });
  const rp = path.join(dir, 'report.md');
  return { code: p.status, out: p.stdout, err: p.stderr, report: fs.existsSync(rp) ? fs.readFileSync(rp, 'utf8') : '' };
}

let n = 0;
const row = (task, arm, score, extra = {}) => ({
  key: `${task}__${arm}__r${++n}`, task, category: extra.category ?? 'coding', size: extra.size ?? 3, arm, rep: n, status: 'done',
  wallSec: extra.wallSec ?? 10, tokens: { weighted: extra.weighted ?? 1000 }, costUsd: 0, leak: false, score, pass: score >= 0.99, formatMiss: false,
  details: extra.details, ...extra.fields,
});
const mk = (task, arm, scores, extra = {}) => scores.map((s) => row(task, arm, s, extra));
const hRow = (report, id) => report.split(/\r?\n/).find((l) => l.startsWith(`| ${id} |`)) ?? '';
const T7 = ['l1-modules', 'l2-chain', 't1-duration', 't2-orders', 't3-api'];
/** B0, A1, A2 (+ A0-sonnet = B0) trên tập tasks; mỗi arm một dãy điểm. */
const h6Data = (b0, a1, a2, tasks = T7) => tasks.flatMap((t) => [...mk(t, 'B0', b0), ...mk(t, 'A1', a1), ...mk(t, 'A2', a2), ...mk(t, 'A0-sonnet', b0)]);
const NOT_SUPPORTED_BARE = /\| SUPPORTED \|$/; // nhãn cuối dòng đúng 'SUPPORTED'
const isSupported = (line) => NOT_SUPPORTED_BARE.test(line.trim());

// ---------- Ca biên F1–F12 ở mức analyze ----------

test('F1 (T-1, C-2): H6 suy biến không do trần (mọi lượt 0,7) ⇒ không SUPPORTED, "không kết luận (suy biến)", p = NA', () => {
  const r = run(h6Data([0.7, 0.7, 0.7], [0.7, 0.7, 0.7], [0.7, 0.7, 0.7]));
  assert.equal(r.code, 0, r.err);
  const h6 = hRow(r.report, 'H6');
  assert.ok(!isSupported(h6), h6);
  assert.match(h6, /không kết luận \(suy biến\)/);
  assert.doesNotMatch(r.report, /2\.50e-4/, 'p = 1/4001 bị cấm khi suy biến (§2.5 (c))');
  assert.match(hRow(r.report, 'Holm {H3, H6}'), /H6: p=NA/);
  assert.match(hRow(r.report, 'Holm {H3, H6}'), /không có giả thuyết xác nhận/);
});

test('F2 (T-3): H6 mọi bài chạm trần ở cả hai arm ⇒ insufficient data, ra khỏi họ Holm', () => {
  const r = run(h6Data([1, 1, 1], [1, 1, 1], [1, 1, 1]));
  const h6 = hRow(r.report, 'H6');
  assert.match(h6, /insufficient data/);
  assert.match(h6, /bỏ trần \[l1-modules, l2-chain, t1-duration, t2-orders, t3-api\]/);
  assert.match(hRow(r.report, 'Holm {H3, H6}'), /họ rỗng|K=0/);
});

test('F3: ngưỡng trần 0,99 và trần một phía ở H6 (dấu ≥ đúng tại 0,99)', () => {
  const rows = [
    ...mk('l1-modules', 'B0', [1, 1, 1]), ...mk('l1-modules', 'A1', [1, 1, 0.998]), // (ii) ⇒ trần
    ...mk('l2-chain', 'B0', [1, 1, 1]), ...mk('l2-chain', 'A1', [1, 1, 0.98]), // (iii) ⇒ giữ
    ...mk('t1-duration', 'B0', [0.99, 0.99, 0.99]), ...mk('t1-duration', 'A1', [0.99, 1, 1]), // (i) ⇒ trần
    ...mk('t2-orders', 'B0', [1, 1, 1]), ...mk('t2-orders', 'A1', [1, 1, 0.9899999]), // (iv) ⇒ giữ
    ...mk('t3-api', 'B0', [0.5, 0.6, 0.7]), ...mk('t3-api', 'A1', [0.5, 0.6, 0.7]),
    ...T7.flatMap((t) => mk(t, 'A2', [0.5, 0.6, 0.7])),
  ];
  const h6 = hRow(run(rows).report, 'H6');
  assert.match(h6, /A1: n=3, bỏ trần \[l1-modules, t1-duration\]/);
});

test('F4 (n = 0): không có arm A1/A2, hoặc chỉ có bài ngoài tập khai báo ⇒ insufficient data', () => {
  const none = run([...mk('c3', 'A0-sonnet', [0.5, 0.6]), ...mk('c3', 'B0', [0.6, 0.7])]);
  assert.match(hRow(none.report, 'H6'), /insufficient data/);
  const outside = run(['c3', 'c4', 'c5'].flatMap((t) => [...mk(t, 'B0', [0.5, 0.6]), ...mk(t, 'A1', [0.4, 0.7]), ...mk(t, 'A2', [0.6, 0.5])]));
  assert.match(hRow(outside.report, 'H6'), /insufficient data/);
  assert.match(hRow(outside.report, 'H6'), /A1: n=0/);
});

test('F5 (n = 1, 2, 3): dưới 3 bài ⇒ ước lượng (insufficient data); đủ 3 bài ⇒ có p hữu hạn', () => {
  const b = [0.5, 0.6, 0.7], a = [0.6, 0.6, 0.8];
  for (const k of [1, 2]) assert.match(hRow(run(h6Data(b, a, a, T7.slice(0, k))).report, 'H6'), /insufficient data/, `n=${k}`);
  const three = run(h6Data(b, a, a, T7.slice(0, 3)));
  const h6 = hRow(three.report, 'H6');
  assert.doesNotMatch(h6, /insufficient data/);
  assert.match(hRow(three.report, 'Holm {H3, H6}'), /H6: p=0\.\d+/);
});

test('F6 (suy biến bị bác bỏ): Δ cố định +0,10 ⇒ nhãn "bác bỏ", không SUPPORTED, p = NA', () => {
  const r = run(h6Data([0.5, 0.5, 0.5], [0.6, 0.6, 0.6], [0.6, 0.6, 0.6]));
  const h6 = hRow(r.report, 'H6');
  assert.ok(!isSupported(h6));
  assert.match(h6, /not supported — bác bỏ/);
  assert.match(hRow(r.report, 'Holm {H3, H6}'), /H6: p=NA/);
});

test('F7 (B-1, NaN): điểm không hữu hạn ở A1 ⇒ suy biến, p = NA (không 1/4001), không SUPPORTED', () => {
  const rows = T7.slice(0, 4).flatMap((t) => [...mk(t, 'B0', [0.5]), ...mk(t, 'A1', ['x']), ...mk(t, 'A2', [0.5]), ...mk(t, 'A0-sonnet', [0.5])]);
  const r = run(rows);
  assert.equal(r.code, 0, r.err);
  const h6 = hRow(r.report, 'H6');
  assert.ok(!isSupported(h6), h6);
  assert.doesNotMatch(r.report, /2\.50e-4/);
  assert.match(hRow(r.report, 'Holm {H3, H6}'), /H6: p=NA/);
});

test('F8 (a)(e) h6Combine ở analyze: thiếu A1/A2 ⇒ insufficient data và ngoài họ Holm; hai cặp có p ⇒ p = max, vào họ', () => {
  const none = run(T7.flatMap((t) => [...mk(t, 'B0', [0.5, 0.6]), ...mk(t, 'A0-sonnet', [0.5, 0.6])]));
  assert.match(hRow(none.report, 'H6'), /insufficient data/);
  assert.match(hRow(none.report, 'H6'), /ngoài họ Holm/);
  const ok = run(h6Data([0.5, 0.6, 0.7], [0.5, 0.62, 0.7], [0.52, 0.6, 0.68]));
  assert.match(hRow(ok.report, 'Holm {H3, H6}'), /H6: p=0\.\d+/);
});

test('F9 (H3 suy biến): recall và precision hằng ở cả hai arm ⇒ p(recall) = 1, H3 không SUPPORTED, không xác nhận', () => {
  const s1 = (a) => Array.from({ length: 10 }, () => row('s1-seeded', a, 1, { category: 'review', details: { recall: 1, precision: 1 } }));
  const r = run([...s1('A0-sonnet'), ...s1('B0')]);
  const h3 = hRow(r.report, 'H3');
  assert.match(h3, /recall p=1\.0000 \(N=184756\)/);
  assert.ok(!isSupported(h3));
  assert.match(hRow(r.report, 'Holm {H3, H6}'), /không có giả thuyết xác nhận/);
});

test('F10 (permStratified qua H1′/H2′): không bài ⇒ "chưa có bài"; a = b = [1,1] hai bài margin 0 ⇒ p = 1, p_min = 1/36', () => {
  const empty = run([...mk('c3', 'A0-sonnet', [0.5]), ...mk('c3', 'B0', [0.6])]);
  assert.match(hRow(empty.report, 'H1′'), /chưa có bài nào đủ lượt cả hai arm/);
  const iv = run(['l1-modules', 't1-duration'].flatMap((t) => [...mk(t, 'A0-sonnet', [1, 1]), ...mk(t, 'B0', [1, 1])]));
  const h = hRow(iv.report, 'H1′');
  assert.match(h, /T=\+0\.0 pp, p=1\.0000, p_min=0\.0278/);
  assert.match(h, /dự kiến, chưa khóa/);
});

test('F11 (S-1): H2′ trần có margin ⇒ không còn p = p_min giả (1/252); bài trần bị loại, suy biến ⇒ không kết luận, chờ đăng ký', () => {
  const r = run([...mk('l2-chain', 'A0-sonnet', [1, 1, 1, 1, 1]), ...mk('l2-chain', 'B0', [1, 1, 1, 1, 1])]);
  const h = hRow(r.report, 'H2′');
  assert.doesNotMatch(h, /p=0\.00\d+|p=3\.97e-3/);
  assert.doesNotMatch(h, /confirmable=có/);
  assert.match(h, /chờ đăng ký \(S-1\)/);
});

test('F12 (T-2): B-01 là trung bình theo bài của log-tỉ số, không phải ln của tỉ số hai trung bình', () => {
  // ba bài: tỉ số theo bài 2, 1, 1 (trọng số 1000 / 100000 / 100000) ⇒ TB log = ln2/3 ⇒ R = 2^(1/3) = 1,260; tỉ số hai trung bình sẽ là ≈ 1,005
  const t = (task, a, b) => [row(task, 'A0-sonnet', 0.5, { weighted: a }), row(task, 'SL', 0.5, { weighted: b })];
  const r = run([...t('t1-duration', 1000, 2000), ...t('t2-orders', 100000, 100000), ...t('t3-api', 100000, 100000)]);
  assert.match(hRow(r.report, 'B-01a'), /R=1\.260/);
  assert.doesNotMatch(hRow(r.report, 'B-01a'), /R=1\.005/);
});

// ---------- Các mục còn lại của mục 2 ----------

test('T-3/T-6 B-01: (c) mọi bài trần ⇒ không kết luận (trước đây SUPPORTED); dưới 3 bài ⇒ insufficient data', () => {
  const five = ['t1-duration', 't2-orders', 't3-api', 't4-perf', 't5-logq'].flatMap((t) => [...mk(t, 'A0-sonnet', [1, 1, 1]), ...mk(t, 'SL', [1, 1, 1])]);
  const c = hRow(run(five).report, 'B-01c');
  assert.ok(!isSupported(c), c);
  assert.match(c, /bỏ trần|chạm trần/);
  const two = ['t1-duration', 't2-orders'].flatMap((t) => [...mk(t, 'A0-sonnet', [0.8, 0.82, 0.78]), ...mk(t, 'SL', [0.8, 0.78, 0.82])]);
  for (const id of ['B-01a', 'B-01b', 'B-01c']) assert.match(hRow(run(two).report, id), /insufficient data/, id);
});

test('T-1 (H2, B-01): Δ = 0 do trần/hằng không còn SUPPORTED; suy biến ghi "không kết luận (suy biến)"', () => {
  const logic = ['l3', 'l4', 'l5'].flatMap((t) => [...mk(t, 'A0-sonnet', [1, 1], { category: 'logic' }), ...mk(t, 'B0', [1, 1], { category: 'logic' })]);
  const h2 = hRow(run(logic).report, 'H2');
  assert.ok(!isSupported(h2), h2);
  assert.match(h2, /không kết luận \(suy biến\)/);
  const flat = ['t1-duration', 't2-orders', 't3-api'].flatMap((t) => [...mk(t, 'A0-sonnet', [0.8, 0.8, 0.8]), ...mk(t, 'SL', [0.8, 0.8, 0.8])]);
  const b = hRow(run(flat).report, 'B-01a');
  assert.ok(!isSupported(b), b);
  assert.match(b, /không kết luận \(suy biến\)/);
});

test('C-1: dòng thiếu `arm` ⇒ báo lỗi tiếng Việt, exit ≠ 0, không ghi report', () => {
  const rows = [...mk('c3', 'A0-sonnet', [0.5]), ...mk('c3', 'B0', [0.6]), { ...row('c3', 'B0', 0.7), arm: undefined }];
  const r = run(rows);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /Từ chối \(C-1\).*thiếu trường `arm`/);
  assert.equal(r.report, '');
});

test('P-1: H3 chỉ 1 bài review (s1) vẫn được phán, vào họ Holm K = 1; không còn "chỉ 1 bài review" (SR-11)', () => {
  const s1 = (a, rec) => Array.from({ length: 10 }, () => row('s1-seeded', a, 0.5, { category: 'review', details: { recall: rec, precision: 1 } }));
  const r = run([...s1('A0-sonnet', 0.5), ...s1('B0', 1)]);
  const h3 = hRow(r.report, 'H3');
  assert.doesNotMatch(h3, /insufficient data/);
  assert.match(h3, /SUPPORTED/);
  assert.match(hRow(r.report, 'Holm {H3, H6}'), /K=1/);
});

test('A-1: H7 cần r ≥ 5 và ≥ 3 bài; sd gộp 0/0 hoặc sd gộp B0 = 0 ⇒ suy biến, không SUPPORTED; phép cũ ở mục độ nhạy', () => {
  const t3 = ['c3', 'c4', 'c5'];
  const r4 = run(t3.flatMap((t) => [...mk(t, 'A0-sonnet', [0.4, 0.5, 0.6, 0.7]), ...mk(t, 'B0', [0.5, 0.5, 0.5, 0.5])]));
  assert.match(hRow(r4.report, 'H7'), /insufficient data/, 'r = 4 < 5');
  const two = run(['c3', 'c4'].flatMap((t) => [...mk(t, 'A0-sonnet', [0.4, 0.5, 0.6, 0.7, 0.5]), ...mk(t, 'B0', [0.5, 0.5, 0.5, 0.5, 0.5])]));
  assert.match(hRow(two.report, 'H7'), /insufficient data/, '2 bài < 3');
  const zeroB = run(t3.flatMap((t) => [...mk(t, 'A0-sonnet', [0.4, 0.5, 0.6, 0.7, 0.5]), ...mk(t, 'B0', [1, 1, 1, 1, 1])]));
  const hb = hRow(zeroB.report, 'H7');
  assert.ok(!isSupported(hb), hb);
  assert.match(hb, /không kết luận \(suy biến\)/);
  const zeroZero = run(t3.flatMap((t) => [...mk(t, 'A0-sonnet', [0.6, 0.6, 0.6, 0.6, 0.6]), ...mk(t, 'B0', [0.6, 0.6, 0.6, 0.6, 0.6])]));
  const h0 = hRow(zeroZero.report, 'H7');
  assert.ok(!isSupported(h0), h0);
  assert.match(h0, /suy biến/);
  assert.match(hRow(zeroB.report, 'H7 (độ nhạy)'), /nhãn cũ/);
  // dữ liệu bình thường vẫn phán được
  const ok = run(t3.flatMap((t) => [...mk(t, 'A0-sonnet', [0.4, 0.5, 0.6, 0.7, 0.5]), ...mk(t, 'B0', [0.5, 0.52, 0.5, 0.48, 0.5])]));
  assert.match(hRow(ok.report, 'H7'), /SUPPORTED/);
});

test('A-2: H1 dùng danh sách cố định c3, c4, c5, r1 (không theo size); lọc size cũ thành dòng độ nhạy', () => {
  const mkt = (t) => ['A0-sonnet', 'B0'].flatMap((a) => mk(t, a, a === 'B0' ? [0.9, 0.8] : [0.3, 0.4], { size: 5 }));
  const rows = ['c3-shop-bugs', 'c4-audit-chain', 'c5-tickets-api', 'g1-slug-dedupe', 't5-logq'].flatMap(mkt);
  const r = run(rows);
  assert.match(hRow(r.report, 'H1'), /danh sách cố định c3, c4, c5, r1/);
  assert.match(hRow(r.report, 'H1'), /tasks=3/); // c5-tickets-api có size 1 trong task.json nhưng vẫn thuộc danh sách
  assert.match(hRow(r.report, 'H1 (độ nhạy)'), /size/);
  assert.match(hRow(run(rows, ['--legacy-rng']).report, 'H1'), /size>=3/);
});

test('A-3: H9 đọc citationValidity (grader mới); không có dữ liệu trích dẫn ⇒ insufficient data, không "not supported" im lặng', () => {
  const res = (arm, v, refusal) => ['re1', 're2', 're3'].flatMap((t) => mk(t, arm, [0.5, 0.5], { category: 'research', details: { citationValidity: v, correctRefusal: refusal } }));
  const good = hRow(run([...res('A0-sonnet', 0.5, 0.2), ...res('B0', 0.8, 0.5)]).report, 'H9');
  assert.match(good, /SUPPORTED/);
  assert.match(good, /citation precision \+30\.0 pp/);
  const old = (arm, v) => ['re1', 're2', 're3'].flatMap((t) => mk(t, arm, [0.5, 0.5], { category: 'research', details: { citationPrecision: v, correctRefusal: v } }));
  assert.match(hRow(run([...old('A0-sonnet', 0.2), ...old('B0', 0.6)]).report, 'H9'), /SUPPORTED/); // alias dữ liệu cũ
  const none = ['re1', 're2', 're3'].flatMap((t) => ['A0-sonnet', 'B0'].flatMap((a) => mk(t, a, [0.5, 0.5], { category: 'research', details: { correctRefusal: 1 } })));
  assert.match(hRow(run(none).report, 'H9'), /insufficient data/);
});

test('A-4: "not supported" tách bác bỏ (CI hẳn dưới ngưỡng) và không kết luận (CI rộng)', () => {
  const cells = (d) => ['c3', 'c4', 'c5'].flatMap((t, i) => [...mk(t, 'A0-sonnet', [0.5, 0.5]), ...mk(t, 'B0', [0.5 + d[i], 0.5 + d[i]])]);
  assert.match(hRow(run(cells([0, 0, 0])).report, 'H1'), /not supported — bác bỏ/);
  assert.match(hRow(run(cells([0.2, -0.1, 0.3])).report, 'H1'), /not supported — không kết luận/);
  assert.match(hRow(run(cells([0.3, 0.3, 0.3])).report, 'H1'), /SUPPORTED/);
});

test('A-5: mỗi giả thuyết một luồng ⇒ thêm giả thuyết khác không đổi số của H1/H4; báo cáo ghi quy tắc suy hạt; luồng chung cũ ở độ nhạy', () => {
  const core = ['c3', 'c4', 'c5'].flatMap((t, i) => [...mk(t, 'A0-sonnet', [0.5, 0.55]), ...mk(t, 'B0', [0.6 + 0.05 * i, 0.7])]);
  const req = ['a1', 'a2', 'a3'].flatMap((t) => [...mk(t, 'A0-sonnet', [0.3, 0.4], { category: 'requirements' }), ...mk(t, 'B0', [0.6, 0.5], { category: 'requirements' })]);
  const logic = ['l3', 'l4', 'l5'].flatMap((t) => [...mk(t, 'A0-sonnet', [0.3, 0.5], { category: 'logic' }), ...mk(t, 'B0', [0.4, 0.45], { category: 'logic' })]);
  const a = run([...core, ...req]).report, b = run([...core, ...req, ...logic]).report;
  assert.equal(hRow(a, 'H1'), hRow(b, 'H1'));
  assert.equal(hRow(a, 'H4'), hRow(b, 'H4'));
  assert.match(a, /mulberry32\(20261102 \^ fnv1a32\(mã giả thuyết\)\)/);
  assert.match(a, /chờ đăng ký/);
  assert.match(a, /Độ nhạy \(cách cũ/);
  assert.match(hRow(a, 'H2/H4/H6/H10 (độ nhạy)'), /luồng chung cũ/);
});

test('A-6 + A-5: CI 95 % của H1 khớp bootstrap độc lập dùng percentileCI (phân vị nội suy) và streamFor("H1")', () => {
  const A = { c3: [0.4, 0.5], c4: [0.5, 0.7], c5: [0.3, 0.6] }, B = { c3: [0.7, 0.9], c4: [0.6, 0.6], c5: [0.8, 0.5] };
  const rows = Object.keys(A).flatMap((t) => [...mk(t, 'A0-sonnet', A[t]), ...mk(t, 'B0', B[t])]);
  const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length;
  const rng = streamFor('H1'), ts = Object.keys(A), boots = [];
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  for (let i = 0; i < 4000; i++) {
    const d = [];
    for (let j = 0; j < ts.length; j++) { const t = pick(ts); const xa = A[t], xb = B[t]; d.push(mean(xb.map(() => pick(xb))) - mean(xa.map(() => pick(xa)))); }
    boots.push(mean(d));
  }
  const [lo, hi] = percentileCI(boots);
  const pp = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} pp`;
  assert.match(hRow(run(rows).report, 'H1'), new RegExp(`\\[${pp(lo).replace(/[+.]/g, '\\$&')}, ${pp(hi).replace(/[+.]/g, '\\$&')}\\]`));
});

test('A-7: --allow-mixed-judge ghi rõ trong báo cáo là số đối chiếu, không dùng cho phân tích chính', () => {
  const mix = ['c3', 'c4', 'c5'].flatMap((t) => [row(t, 'A0-sonnet', 0.5, { details: { judge: 'm1' } }), row(t, 'A0-sonnet', 0.5, { details: { judge: 'm2' } }), row(t, 'B0', 0.6, { details: { judge: 'm1' } }), row(t, 'B0', 0.7, { details: { judge: 'm1' } })]);
  const r = run(mix, ['--allow-mixed-judge']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.report, /CHẠY VỚI --allow-mixed-judge \(A-7\)/);
  assert.match(r.report, /ĐỐI CHIẾU/);
  assert.doesNotMatch(run(['c3', 'c4', 'c5'].flatMap((t) => [row(t, 'A0-sonnet', 0.5), row(t, 'B0', 0.6)])).report, /A-7/);
});
