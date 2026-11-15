// Test e7b-analyze.mjs trên fixture giả, đáp án tính tay. Không dùng dữ liệu thật, không gọi LLM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyzeE7b, branchOf, holm2, labelOf, cappedFromCalls } from './e7b-analyze.mjs';

// Fixture: 2 bài (A, B). Mục lỗi: 12 mỗi bài (24). Mục đúng: 12 mỗi bài (24). Tổng 48.
// Lỗi: R1b chặn cả 24. R2b: 20 chặn, 2 unread (fA0, fB0), 2 pass (fA1, fB1).
// Đúng: R1b chặn 14 (A: 8, B: 6). R2b: 0 chặn, 1 unread (cA0; R1b có chặn mục này).
const items = [], selected = [];
for (const task of ['A', 'B']) for (let i = 0; i < 12; i++) for (const [kind, p] of [['faulty', 'f'], ['clean', 'c']]) { const id = `${p}${task}${i}`; items.push({ id, task, kind }); selected.push(id); }
const R1 = (id, verdict, extra = {}) => ({ id, arm: 'R1', status: 'done', verdict, maxTurns: 6, ccodingCommit: 'abc', extraConfigSha256: 's1', authSource: 'claude.ai', models: ['claude-sonnet-5-5'], costUsd: 0.1, tokens: { weighted: 1000 }, wallSec: 10, ...extra });
const R2 = (id, verdict, extra = {}) => ({ id, arm: 'R2', status: 'done', verdict, maxTurns: 16, ccodingCommit: 'abc', extraConfigSha256: 's2', authSource: 'claude.ai', models: ['claude-opus-5-5'], costUsd: 0.26, tokens: { weighted: 2000 }, wallSec: 20, ...extra });
const rows1 = [], rows2 = [];
for (const x of items) {
  const n = Number(x.id.slice(2));
  if (x.kind === 'faulty') {
    rows1.push(R1(x.id, 'block'));
    const v = n === 0 ? 'unparsed' : n === 1 ? 'pass' : 'block';
    rows2.push(R2(x.id, v, { taskId: `T-${x.id}` }));
  } else {
    const blocked = x.task === 'A' ? n < 8 : n < 6;
    rows1.push(R1(x.id, blocked ? 'block' : 'pass'));
    rows2.push(R2(x.id, x.id === 'cA0' ? 'unparsed' : 'pass', { taskId: `T-${x.id}` }));
  }
}
const run = (extra = {}) => analyzeE7b({ items, selected, rows1, rows2, ...extra });

test('McNemar, Holm, nhãn: số cặp bất đồng tính tay ở ba cách tính', () => {
  const a = run();
  const m = a.byMode['chính'], s1 = a.byMode.S1, s2 = a.byMode.S2;
  // P1 chính: R1b 24/24, R2b 20/24 → chỉ R1b chặn 4, chỉ R2b chặn 0; p = 2·(1/2)^4 = 0,125
  assert.deepEqual([m.faulty.n, m.faulty.R1b.k, m.faulty.R2b.k, m.faulty.aOnly, m.faulty.bOnly], [24, 24, 20, 4, 0]);
  assert.ok(Math.abs(m.faulty.p - 0.125) < 1e-12);
  // P2 chính: R1b chặn 14, R2b 0 → chỉ R1b 14; p = 2·(1/2)^14 = (1/2)^13
  assert.deepEqual([m.clean.R1b.k, m.clean.R2b.k, m.clean.aOnly, m.clean.bOnly], [14, 0, 14, 0]);
  assert.ok(Math.abs(m.clean.p - 0.5 ** 13) < 1e-15);
  // Holm hai phép: p nhỏ ×2, p lớn giữ nhưng không nhỏ hơn p nhỏ đã hiệu chỉnh
  assert.ok(Math.abs(m.clean.pAdj - 2 * 0.5 ** 13) < 1e-15);
  assert.ok(Math.abs(m.faulty.pAdj - 0.125) < 1e-12);
  // P2 chính: 14 cặp bất đồng ≥ 10, p Holm < 0,05, CI bootstrap (hiệu mỗi bài −8/12, −6/12) không chứa 0, cùng chiều → khác nhau
  assert.ok(m.clean.diffBoot[1] < 0);
  assert.equal(m.clean.label, 'khác nhau');
  // P1: 4 cặp bất đồng < 10 → chưa phân biệt được
  assert.equal(m.faulty.label, 'chưa phân biệt được');
  // S1 (unread = chặn): R2b lỗi chặn 22 → chỉ R1b 2, p = 0,5; đúng: cA0 cả hai chặn → chỉ R1b 13, p = (1/2)^12
  assert.deepEqual([s1.faulty.R2b.k, s1.faulty.aOnly, s1.clean.R2b.k, s1.clean.aOnly], [22, 2, 1, 13]);
  assert.ok(Math.abs(s1.faulty.p - 0.5) < 1e-12);
  assert.ok(Math.abs(s1.clean.p - 0.5 ** 12) < 1e-15);
  // S2 (bỏ cặp có unread): lỗi n = 22 (bỏ fA0, fB0), R2b chặn 20, chỉ R1b 2; đúng n = 23 (bỏ cA0), chỉ R1b 13
  assert.deepEqual([s2.faulty.n, s2.faulty.R2b.k, s2.faulty.aOnly, s2.clean.n, s2.clean.aOnly], [22, 20, 2, 23, 13]);
});

test('lượt không đọc được và chạm trần: suy ra = unread; có cờ nhật ký thì chỉ tính lượt có cờ', () => {
  const a = run();
  assert.equal(a.per.R2b.unread, 3);
  assert.equal(a.per.R1b.unread, 0);
  assert.deepEqual([a.per.R2b.capped, a.per.R2b.cappedBasis], [3, 'suy ra']);
  assert.equal(a.byMode['chính'].branch.id, 'D'); // 3 > floor(5 % × 48) = 2
  const b = run({ cappedIds: { R1b: new Set(), R2b: new Set(['fA0', 'fB0']) } });
  assert.deepEqual([b.per.R2b.capped, b.per.R2b.cappedBasis], [2, 'ghi']);
  assert.notEqual(b.byMode['chính'].branch.id, 'D'); // 2 > 2 sai
});

test('nhánh phải giống nhau ở ba cách tính, không thì chưa kết luận', () => {
  const b = run({ cappedIds: { R1b: new Set(), R2b: new Set(['fA0', 'fB0']) } });
  // chính: chặn nhầm R2b 0 ≤ ceil(6/64·24) = 3 (đạt); recall R2b 20 < floor(58/64·24) = 21 → B
  assert.equal(b.byMode['chính'].branch.id, 'B');
  assert.deepEqual(b.byMode['chính'].branch.thr, { maxFp: 3, minRecall: 21, maxDrop: 3 });
  // S1: recall R2b 22 ≥ 21, R1b − R2b = 2 ≤ 3 → (2) đạt; P2 "khác nhau" và R2b < R1b → A
  assert.equal(b.byMode.S1.branch.id, 'A');
  assert.equal(b.decision.stable, false);
  assert.match(b.decision.branch, /^chưa kết luận/);
});

test('hạng mục phụ: USD, Youden, kiểm cấu hình', () => {
  const a = run();
  assert.ok(Math.abs(a.per.R1b.usd - 4.8) < 1e-9 && Math.abs(a.per.R2b.usd - 12.48) < 1e-9);
  assert.ok(Math.abs(a.usdRatio - 2.6) < 1e-9);
  const y = a.byMode['chính'].youden;
  assert.ok(Math.abs(y.R1b - (1 - 14 / 24)) < 1e-12 && Math.abs(y.R2b - 20 / 24) < 1e-12);
  assert.deepEqual(a.checks, []);
  const bad = analyzeE7b({ items, selected, rows1, rows2: rows2.map((r) => ({ ...r, maxTurns: 6, ccodingCommit: 'xyz' })) });
  assert.equal(bad.checks.length, 2);
  // dòng infra cuối của một cặp làm cặp đó thiếu (bỏ khỏi phép ghép, không đếm là chặn)
  const gap = analyzeE7b({ items, selected, rows1, rows2: [...rows2, { id: 'fA5', arm: 'R2', status: 'infra', verdict: null }] });
  assert.equal(gap.byMode['chính'].faulty.n, 23);
});

test('holm2, labelOf, branchOf: ca biên', () => {
  assert.deepEqual(holm2(0.01, 0.04).adj, [0.02, 0.04]);
  assert.deepEqual(holm2(0.04, 0.01).adj, [0.04, 0.02]);
  assert.deepEqual(holm2(0.03, 0.04).adj, [0.06, 0.06]);
  assert.equal(labelOf({ aOnly: 12, bOnly: 0, pAdj: 0.01, ci: [-0.5, -0.2] }), 'khác nhau');
  assert.equal(labelOf({ aOnly: 12, bOnly: 0, pAdj: 0.01, ci: [-0.5, 0.1] }), 'chưa phân biệt được');
  assert.equal(labelOf({ aOnly: 12, bOnly: 0, pAdj: 0.01, ci: [0.1, 0.5] }), 'chưa kết luận');
  const mk = (fpR1, fpR2, rec1, rec2, label) => ({ faulty: { n: 64, planned: 64, R1b: { k: rec1 }, R2b: { k: rec2 } }, clean: { n: 64, planned: 64, R1b: { k: fpR1, cp: [fpR1 / 64 - 0.1, 1] }, R2b: { k: fpR2 }, label } });
  const per = { R2b: { capped: 0, cappedBasis: 'ghi' } };
  assert.equal(branchOf(mk(27, 6, 63, 58, 'khác nhau'), per).id, 'A');
  assert.equal(branchOf(mk(27, 7, 63, 58, 'khác nhau'), per).id, 'C');
  assert.equal(branchOf(mk(27, 6, 63, 57, 'khác nhau'), per).id, 'B');
  assert.equal(branchOf(mk(27, 6, 63, 58, 'chưa phân biệt được'), per).id, 'F');
  assert.equal(branchOf(mk(3, 0, 63, 63, 'khác nhau'), per).id, 'E'); // CP dưới của R1b = 3/64 − 0,1 < 10 %
});

test('cappedFromCalls đọc cờ capped của lượt accept; thiếu tệp → null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e7b-'));
  try {
    fs.mkdirSync(path.join(dir, 'runs', 'T-1'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'runs', 'T-1', 'calls.jsonl'), `${JSON.stringify({ phase: 'accept', capped: 'turns' })}\n`);
    const rows = [{ id: 'x', taskId: 'T-1', verdict: 'unparsed' }, { id: 'y', taskId: 'T-2', verdict: 'pass' }];
    assert.deepEqual([...cappedFromCalls(dir, rows)], ['x']);
    assert.equal(cappedFromCalls(dir, [...rows, { id: 'z', taskId: 'T-3', verdict: 'unparsed' }]), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('chưa có runs.jsonl: thoát 0, báo "chưa có dữ liệu", không in số', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e7b-'));
  try {
    const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'e7b-analyze.mjs');
    const r = spawnSync(process.execPath, [script, '--r1b', path.join(dir, 'R1b'), '--r2b', path.join(dir, 'R2b')], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /chưa có dữ liệu/);
    assert.ok(!/\d/.test(r.stdout.replace(/runs\.jsonl|R1b|R2b/g, '')), r.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
