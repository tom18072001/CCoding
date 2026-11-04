// Test analyze.mjs theo suite-review §5 (S6: SR-01c, 03, 04, 05iii, 06, 07, 12, 20, 25, 26) trên runs.jsonl tổng hợp.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ANALYZE = path.resolve(HERE, '../analyze.mjs');

/** Ghi rows vào thư mục tạm, chạy analyze.mjs; trả { code, out, err, report }. */
function run(rows, args = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'an-sr-'));
  fs.writeFileSync(path.join(dir, 'runs.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const p = spawnSync(process.execPath, [ANALYZE, dir, ...args], { encoding: 'utf8' });
  const rp = path.join(dir, 'report.md');
  return { code: p.status, out: p.stdout, err: p.stderr, report: fs.existsSync(rp) ? fs.readFileSync(rp, 'utf8') : '', dir };
}

let n = 0;
const row = (task, arm, score, extra = {}) => ({
  key: `${task}__${arm}__r${++n}`, task, category: extra.category ?? 'coding', size: extra.size ?? 3, arm, rep: n, status: 'done',
  wallSec: extra.wallSec ?? 10, tokens: { weighted: extra.weighted ?? 1000 }, costUsd: 0, leak: false, score, pass: score >= 0.99, formatMiss: false,
  details: extra.details, ...extra.fields,
});
const hRow = (report, id) => report.split('\n').find((l) => l.startsWith(`| ${id} |`)) ?? '';

const base = () => ['c3', 'c4', 'c5'].flatMap((t) => [row(t, 'A0-sonnet', 0.5), row(t, 'A0-sonnet', 0.6), row(t, 'B0', 0.7), row(t, 'B0', 0.8)]);

test('SR-01c: lượt excluded bị loại và đếm theo arm; dòng cũ thiếu trường giữ nguyên', () => {
  const rows = base();
  rows.push(row('c3', 'B0', 0.0, { fields: { excluded: 'quota' } }), row('c3', 'A0-sonnet', 0.0, { fields: { excluded: 'timeout' } }), row('c4', 'B0', 0.0, { fields: { excluded: 'leak' } }));
  const a = run(rows);
  assert.equal(a.code, 0, a.err);
  assert.match(a.report, /3 lượt excluded/);
  assert.match(a.report, /A0-sonnet: timeout 1/);
  assert.match(a.report, /B0: (quota 1, leak 1|leak 1, quota 1)/);
  const b = run(base());
  assert.match(b.report, /0 lượt excluded/);
  assert.equal(hRow(a.report, 'H1'), hRow(b.report, 'H1'));
});

test('SR-03: hai hash CCoding trong một arm ⇒ cảnh báo; --strict ⇒ từ chối', () => {
  const rows = base();
  rows.filter((r) => r.arm === 'B0').forEach((r, i) => { r.ccodingCommit = i % 2 ? 'aaa1111' : 'bbb2222'; });
  const w = run(rows);
  assert.equal(w.code, 0);
  assert.match(w.report, /CẢNH BÁO SR-03.*B0: (aaa1111, bbb2222|bbb2222, aaa1111)/);
  const s = run(rows, ['--strict']);
  assert.notEqual(s.code, 0);
  assert.match(s.err, /SR-03/);
  const ok = base();
  ok.forEach((r) => { r.ccodingCommit = 'aaa1111'; });
  assert.doesNotMatch(run(ok, ['--strict']).report, /CẢNH BÁO SR-03/);
});

test('SR-07: judge khác nhau cùng bài ⇒ từ chối; ghi model giám khảo vào báo cáo', () => {
  const rows = base();
  rows[0].details = { judge: 'opus' }; rows[1].details = { judge: 'sonnet' };
  const bad = run(rows);
  assert.notEqual(bad.code, 0);
  assert.match(bad.err, /SR-07/);
  const good = base();
  good.forEach((r) => { r.details = { judge: 'opus' }; });
  const g = run(good);
  assert.equal(g.code, 0, g.err);
  assert.match(g.report, /Giám khảo: opus/);
  const mix = base(); mix[0].details = { judge: 'opus' };
  assert.notEqual(run(mix).code, 0);
  const allowed = run(mix, ['--allow-mixed-judge']);
  assert.equal(allowed.code, 0);
  assert.match(allowed.report, /CẢNH BÁO SR-07/);
});

test('SR-20: báo cáo ghi hạt; mặc định mulberry32 tái lập; --legacy-rng đổi sang LCG', () => {
  const a = run(base()), b = run(base()), l = run(base(), ['--legacy-rng']);
  assert.match(a.report, /RNG: mulberry32, hạt 20261102/);
  assert.match(l.report, /RNG: LCG cũ \(--legacy-rng\), hạt 12345/);
  assert.equal(hRow(a.report, 'H1'), hRow(b.report, 'H1'));
  assert.equal(hRow(a.report, 'H10'), hRow(b.report, 'H10'));
  assert.notEqual(hRow(a.report, 'H1'), hRow(l.report, 'H1'));
});

test('SR-26 ca 9 / SR-20: --legacy-rng trên study-cloud cho H1, H2, H10 trùng mốc d11-baseline', () => {
  const root = path.resolve(HERE, '../../..');
  const baseline = fs.readFileSync(path.join(root, 'docs/research/context/d11-baseline/study-cloud/report.md'), 'utf8');
  const rows = fs.readFileSync(path.join(root, 'bench/vs-claude/results/study-cloud/runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const r = run(rows, ['--legacy-rng', '--allow-mixed-judge']);
  assert.equal(r.code, 0, r.err);
  for (const id of ['H1', 'H2', 'H10']) assert.equal(hRow(r.report, id), hRow(baseline, id), id);
});

test('SR-05(iii): H10 xáo Fisher-Yates tái lập theo hạt và cho p trong (0, 0.5) với 6 điểm', () => {
  const rows = [];
  for (const [i, t] of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].entries()) {
    const b = 0.5 + 0.05 * i + (i % 2) * 0.1;
    rows.push(row(t, 'A0-sonnet', 0.5, { size: i + 1 }), row(t, 'A0-sonnet', 0.5, { size: i + 1 }), row(t, 'B0', b, { size: i + 1 }), row(t, 'B0', b, { size: i + 1 }));
  }
  const fy = run(rows), fy2 = run(rows), lg = run(rows, ['--legacy-rng']);
  assert.equal(hRow(fy.report, 'H10'), hRow(fy2.report, 'H10'));
  const p = +/permutation p=([0-9.]+)/.exec(hRow(fy.report, 'H10'))[1];
  assert.ok(p > 0 && p < 0.5, `p=${p}`);
  assert.match(hRow(lg.report, 'H10'), /permutation p=/);
});

test('SR-06: H5 ghép tr và wr theo bài, bài có tỉ số vô hạn bị bỏ cả hai chỉ số', () => {
  const mk = (t, bw, tw, bs, ts) => [row(t, 'A0-sonnet', 0.5, { weighted: bw, wallSec: bs }), row(t, 'B0', 0.5, { weighted: tw, wallSec: ts })];
  // a: token cơ sở 0 ⇒ tỉ số vô hạn (bỏ); b, c: token ×4, thời gian ×2 ⇒ đạt cả hai ngưỡng
  const rows = [...mk('a', 0, 1000, 10, 10), ...mk('b', 1000, 4000, 10, 20), ...mk('c', 1000, 4000, 10, 20)];
  const r = run(rows);
  assert.match(hRow(r.report, 'H5'), /tasks meeting both thresholds 100%/);
});
