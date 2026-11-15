// Test b14-step2.mjs bằng dữ liệu giả (hạt cố định). Không đọc dữ liệu thật.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyze, collapseRetries, defaultDeps, weightedOf, TASKS } from './b14-step2.mjs';
import { permStratified, mulberry32 } from '../../../bench/vs-claude/lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'b14-step2.mjs');
const BASE = { 't2-orders': 12.0, 't3-api': 12.6, 't4-perf': 13.1 }; // ln(weighted) giả

/** Dòng giả theo schema run.mjs: tokens.{input,cacheWrite,cacheRead,output,weighted}. */
function mkRow(task, rep, w) {
  const out = Math.round(w * 0.02), cacheWrite = Math.round(w * 0.3), cacheRead = Math.round(w * 0.3), input = 1000;
  const tokens = { input, output: out, cacheRead, cacheWrite, weighted: w };
  return { key: `${task}|B7|${rep}`, task, arm: 'B7', rep, status: 'done', excluded: null, tokens, score: 0.8, pass: rep % 4 !== 0, wallSec: 100 + rep, calls: 20 };
}
/** Một nhánh đủ 3 bài × 16 lượt; nhiễu ±0,05 (đều) từ hạt cố định. factor nhân lên weighted. */
function mkArm(seed, factor = 1) {
  const rnd = mulberry32(seed), rows = [];
  for (const t of TASKS) for (let rep = 1; rep <= 16; rep++) rows.push(mkRow(t, rep, Math.exp(BASE[t] + (rnd() - 0.5) * 0.1) * factor));
  return rows;
}
const cp = (rows) => rows.map((r) => ({ ...r, tokens: { ...r.tokens } }));

test('1. hai nhánh y hệt nhau → không phân biệt được', () => {
  const off = mkArm(1), r = analyze(off, cp(off));
  assert.equal(r.verdict, 'không phân biệt được');
  assert.equal(r.n, 96);
  assert.equal(r.nLabel, 'đủ 96');
  assert.ok(Math.abs(r.T) < 1e-12);
});

test('2. nhánh bật nhân 0,8 → giảm, R̂ ≈ 0,8 (±0,03), cận trên CI < 1', () => {
  const r = analyze(mkArm(1), mkArm(2, 0.8));
  assert.equal(r.verdict, 'giảm');
  assert.ok(Math.abs(r.R - 0.8) < 0.03, `R = ${r.R}`);
  assert.ok(r.ci95[1] < 1);
  assert.ok(r.p <= 0.05);
});

test('3. nhánh bật thiếu r13–16 → chỉ dùng cặp đủ, n = 72, nhãn chưa đủ N', () => {
  const on = mkArm(2).filter((x) => x.rep <= 12);
  const r = analyze(mkArm(1), on);
  assert.equal(r.n, 72);
  assert.deepEqual(r.pairsKept, [1, 2, 3]);
  assert.match(r.nLabel, /^chưa đủ N \(n = 72\/96\)/);
  assert.equal(r.drops['cặp khối không đủ cả hai nhánh'], 12); // r13–16 của nhánh tắt: 3 bài × 4
});

test('4. status ≠ done và excluded bị loại, không vào T, đếm theo lý do', () => {
  const off = mkArm(1), on = mkArm(2);
  const bad = (rows, task, rep, patch) => Object.assign(rows.find((x) => x.task === task && x.rep === rep), patch);
  bad(off, 't3-api', 2, { status: 'error' });
  bad(on, 't3-api', 5, { excluded: 'timeout' });
  bad(on, 't4-perf', 6, { status: 'infra' });
  // lượt bị loại có token cực lớn: nếu lọt vào T thì T lệch rõ
  bad(off, 't3-api', 2, { tokens: { ...off[0].tokens, weighted: 1e12 } });
  const r = analyze(off, on);
  assert.equal(r.n, 93);
  assert.equal(r.drops['status ≠ done (error)'], 1);
  assert.equal(r.drops['status ≠ done (infra)'], 1);
  assert.equal(r.drops['excluded (timeout)'], 1);
  const ref = analyze(mkArm(1), mkArm(2));
  assert.ok(Math.abs(r.T - ref.T) < 0.05, 'T không bị lượt loại kéo lệch');
});

test('5. permStratified gọi đúng một lần với đúng { alt, margin, M, seed }, không thêm khóa', () => {
  const calls = [];
  const spy = (cells, opts) => { calls.push({ cells, opts }); return permStratified(cells, opts); };
  const r = analyze(mkArm(1), mkArm(2), { permStratified: spy });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].opts, { alt: 'two', margin: 0, M: 10000, seed: 20261104 });
  assert.deepEqual(Object.keys(calls[0].opts).sort(), ['M', 'alt', 'margin', 'seed']);
  assert.deepEqual(r.permArgs, calls[0].opts);
  assert.deepEqual(calls[0].cells.map((c) => c.task), TASKS);
  assert.ok(calls[0].cells.every((c) => c.a.length === 16 && c.b.length === 16));
  assert.equal(r.perm.exact, false); // ∏C(32,16) > 10⁶ ⇒ Monte Carlo
});

test('6. lượt thay rep 17 nhận cặp của lượt bị loại; lượt thay thứ 3 làm ô thiếu dữ liệu', () => {
  const off = mkArm(1), on = mkArm(2);
  off.find((x) => x.task === 't2-orders' && x.rep === 6).status = 'error'; // cặp 2
  off.push(mkRow('t2-orders', 17, Math.exp(BASE['t2-orders'])));
  const r = analyze(off, on);
  assert.deepEqual(r.assignments, [{ arm: 'off', task: 't2-orders', rep: 17, replaces: 6, pair: 2 }]);
  assert.equal(r.n, 96);
  assert.equal(r.skipped.length, 0);

  // ô t2-orders × tắt có 3 lượt thay (17, 18, 19) ⇒ thiếu dữ liệu, bài vào skipped
  const off3 = mkArm(1);
  for (const rep of [1, 2, 3]) off3.find((x) => x.task === 't2-orders' && x.rep === rep).status = 'error';
  for (const rep of [17, 18, 19]) off3.push(mkRow('t2-orders', rep, Math.exp(BASE['t2-orders'])));
  const r3 = analyze(off3, mkArm(2));
  assert.deepEqual(r3.skipped.map((s) => s.task), ['t2-orders']);
  assert.equal(r3.verdict, 'không kết luận (thiếu dữ liệu)');
  assert.ok(!r3.cells.some((c) => c.task === 't2-orders'));

  // lượt thay không có lượt gốc bị loại
  const offX = mkArm(1); offX.push(mkRow('t3-api', 17, 1e5));
  const rx = analyze(offX, mkArm(2));
  assert.equal(rx.drops['thay thế không có lượt gốc'], 1);
  assert.equal(rx.n, 96);
});

test('7. dòng thiếu weighted được tính theo input + 1,25·cacheWrite + 0,1·cacheRead + 5·out', () => {
  const t = { input: 1000, cacheWrite: 2000, cacheRead: 10000, output: 100 };
  assert.equal(weightedOf(t), 1000 + 2500 + 1000 + 500);
  assert.equal(weightedOf({ ...t, weighted: 77 }), 77);
  const off = mkArm(1);
  const row = off[0];
  row.tokens = { input: 1000, cacheWrite: 2000, cacheRead: 10000, output: 100 }; // không có weighted
  const full = cp(off); full[0].tokens.weighted = 5000;
  assert.ok(Math.abs(analyze(off, mkArm(2)).T - analyze(full, mkArm(2)).T) < 1e-12);
});

test('8. deps mặc định là chính permStratified của bench/vs-claude/lib/stats.mjs, không từ vendor/', () => {
  assert.equal(defaultDeps.permStratified, permStratified);
  const a = analyze(mkArm(1), mkArm(2)), b = analyze(mkArm(1), mkArm(2), { permStratified });
  assert.equal(a.p, b.p);
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const imports = src.split('\n').filter((l) => /^import /.test(l));
  assert.ok(imports.some((l) => l.includes("bench/vs-claude/lib/stats.mjs")));
  assert.ok(!imports.some((l) => /vendor/.test(l)));
});

test('9. CLI khi thiếu tệp: exit ≠ 0, thông báo tiếng Việt', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b14-'));
  const r = spawnSync(process.execPath, [SCRIPT, '--off', path.join(dir, 'x.jsonl'), '--on', path.join(dir, 'y.jsonl')], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Không đọc được tệp/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('CLI với dữ liệu giả ghi vào thư mục tạm: in bảng và --json có permArgs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b14-'));
  const w = (n, rows) => { const p = path.join(dir, n); fs.writeFileSync(p, rows.map((x) => JSON.stringify(x)).join('\n')); return p; };
  const off = w('off.jsonl', mkArm(1)), on = w('on.jsonl', mkArm(2, 0.8));
  const j = spawnSync(process.execPath, [SCRIPT, '--off', off, '--on', on, '--json'], { encoding: 'utf8' });
  assert.equal(j.status, 0);
  assert.deepEqual(JSON.parse(j.stdout).permArgs, { alt: 'two', margin: 0, M: 10000, seed: 20261104 });
  const m = spawnSync(process.execPath, [SCRIPT, '--off', off, '--on', on], { encoding: 'utf8' });
  assert.match(m.stdout, /Phán quyết: giảm/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ───── sửa 13/11/2026: runner chạy lại ĐÚNG KHÓA khi dòng là infra hoặc chưa xong (queue.mjs isFinishedRow) ─────
test('10. collapseRetries: dòng infra trước lượt done không chặn quan sát; failed rồi done = lượt thay cùng khóa', () => {
  const off = mkArm(11), on = mkArm(22);
  const infra = (task, rep) => ({ key: `${task}|B7|${rep}`, task, arm: 'B7', rep, status: 'infra', infra: 'rate-limit' });
  const failed = (task, rep) => ({ key: `${task}|B7|${rep}`, task, arm: 'B7', rep, status: 'failed', excluded: null, tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, weighted: 6 } });
  // tắt: 60 dòng hạn mức trước t2 r1 (như dữ liệu thật); t4 r14 failed trước done; bật: t3 r1 có 3 dòng infra trước done
  const offRows = [...Array.from({ length: 60 }, () => infra('t2-orders', 1)), ...off.slice(0, 13 + 16 * 2), failed('t4-perf', 14), ...off.slice(13 + 16 * 2)];
  const onRows = [infra('t3-api', 1), infra('t3-api', 1), infra('t3-api', 1), ...on];
  const c = collapseRetries(offRows);
  assert.equal(c.rows.length, 48);
  assert.equal(c.notes.infra, 60);
  assert.deepEqual(c.notes.retried, [{ task: 't4-perf', rep: 14, status: 'failed', sameKeyDone: true }]);
  const a = analyze(offRows, onRows);
  assert.equal(a.n, 96);
  assert.equal(a.nLabel, 'đủ 96');
  assert.equal(a.drops['dòng hạ tầng (infra), chạy lại cùng khóa — không phải quan sát'], 63);
  assert.equal(a.drops['status ≠ done (failed), thay bằng lượt cùng khóa'], 1);
  assert.equal(a.drops['trùng khóa (bài, rep)'], undefined);
  assert.deepEqual(a.assignments, [{ arm: 'off', task: 't4-perf', rep: 14, replaces: 14, pair: 4, sameKey: true }]);
  // cùng kết quả như khi không có dòng thừa (lượt thay cùng khóa giữ đúng cặp khối)
  const clean = analyze(off, on);
  assert.equal(a.T, clean.T);
  // cách cũ (giữ dòng đầu): infra chặn khóa, n < 96
  const first = analyze(offRows, onRows, defaultDeps, { retries: 'first' });
  assert.ok(first.n < 96);
  assert.ok(first.drops['trùng khóa (bài, rep)'] > 0);
});

test('11. lượt thay cùng khóa tính vào trần 2 mỗi ô; quá trần → ô thiếu dữ liệu', () => {
  const off = mkArm(11), on = mkArm(22);
  const failed = (rep) => ({ key: `t3-api|B7|${rep}`, task: 't3-api', arm: 'B7', rep, status: 'failed', excluded: null });
  const a = analyze([failed(2), failed(5), failed(9), ...off], on);
  assert.equal(a.skipped.length, 1);
  assert.match(a.skipped[0].reason, /3 lượt thay > 2/);
  assert.equal(a.verdict, 'không kết luận (thiếu dữ liệu)');
  const b = analyze([failed(2), failed(5), ...off], on);
  assert.equal(b.skipped.length, 0);
  assert.equal(b.n, 96);
});

test('12. opts.exclude bỏ đúng một lượt (độ nhạy), không đổi tham số phép kiểm', () => {
  const a = analyze(mkArm(11), mkArm(22), defaultDeps, { exclude: ['off|t3-api|1'] });
  assert.equal(a.n, 95);
  assert.equal(a.cells.find((c) => c.task === 't3-api').nOff, 15);
  assert.equal(a.drops['bỏ theo phân tích độ nhạy (opts.exclude)'], 1);
  assert.deepEqual(a.permArgs, { alt: 'two', margin: 0, M: 10000, seed: 20261104 });
});
