// Test e7b-analyze.mjs trên dữ liệu giả lập, đáp án tính tay. Không dùng dữ liệu thật, không gọi LLM.
// Mỗi dòng QH1…QH36 của bảng Quy tắc hiệu lực (preregistration.md, Phụ lục E7b (2) (f)) có ít nhất một test; mã QH ghi ở đầu tên test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyzeChecked, analyzeE7b, branchOf, holm2, labelOf, timeoutCond, reconcileWithCalls, gitBlobSha, readSums, report, smokeCheck, LOCK, MODES } from './e7b-analyze.mjs';
import { bootDiff } from '../../../bench/vs-claude/e7/analyze.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const B = path.join(repo, 'bench', 'vs-claude', 'results', 'e7b-cto');
const SUMS = { R1b: 'a'.repeat(64), R2b: 'b'.repeat(64) };

// Fixture: 2 bài (A, B). Mục lỗi: 12 mỗi bài (24). Mục đúng: 12 mỗi bài (24). Tổng 48.
// Lỗi: R1b chặn cả 24. R2b: 20 chặn, 2 unread (fA0, fB0), 2 pass (fA1, fB1).
// Đúng: R1b chặn 14 (A: 8, B: 6). R2b: 0 chặn, 1 unread (cA0; R1b có chặn mục này).
const items = [], selected = [];
for (const task of ['A', 'B']) for (let i = 0; i < 12; i++) for (const [kind, p] of [['faulty', 'f'], ['clean', 'c']]) { const id = `${p}${task}${i}`; items.push({ id, task, kind }); selected.push(id); }
const base = { status: 'done', ccodingCommit: 'abc', acceptCalls: 1, acceptAuthSources: ['none'], acceptTurnCapped: false, acceptToolCalls: 4, acceptTurns: 5, costUsd: 0.1, tokens: { weighted: 1000 }, wallSec: 10 };
const R1 = (id, verdict, extra = {}) => ({ id, arm: 'R1', verdict, maxTurns: 6, extraConfigSha256: SUMS.R1b, models: ['claude-sonnet-5-5'], ...base, ...extra });
const R2 = (id, verdict, extra = {}) => ({ id, arm: 'R2', verdict, maxTurns: 16, extraConfigSha256: SUMS.R2b, models: ['claude-opus-5-5'], ...base, costUsd: 0.26, tokens: { weighted: 2000 }, wallSec: 20, ...extra });
const mk = () => {
  const rows = [];
  for (const x of items) {
    const n = Number(x.id.slice(2));
    if (x.kind === 'faulty') {
      rows.push(R1(x.id, 'block'));
      rows.push(R2(x.id, n === 0 ? 'unparsed' : n === 1 ? 'pass' : 'block', { taskId: `T-${x.id}` }));
    } else {
      const blocked = x.task === 'A' ? n < 8 : n < 6;
      rows.push(R1(x.id, blocked ? 'block' : 'pass'));
      rows.push(R2(x.id, x.id === 'cA0' ? 'unparsed' : 'pass', { taskId: `T-${x.id}` }));
    }
  }
  return rows;
};
const rows0 = mk();
const run = (o = {}) => analyzeE7b({ items, selected, rows: o.rows ?? rows0, sums: SUMS, ...o });
const infra = (id, arm, error, extra = {}) => ({ id, arm, status: 'infra', infra: 'error', error, verdict: null, ccodingCommit: 'abc', extraConfigSha256: arm === 'R1' ? SUMS.R1b : SUMS.R2b, ...extra });
const infra3 = (id, arm, error) => [infra(id, arm, error), infra(id, arm, error), infra(id, arm, error)];
/** Bỏ các dòng done của (mục, arm) rồi thêm 3 dòng infra. */
const dropPair = (rows, ids, arm, error) => [...rows.filter((r) => !(ids.includes(r.id) && r.arm === arm)), ...ids.flatMap((id) => infra3(id, arm, error))];

// ---------- QH1, QH2, QH4, QH6: tệp cấu hình và SHA256SUMS đã commit (blob git, LF) ----------
test('QH1: mẫu 128 mục, selected.json đúng git blob 5b3e8fcf…', () => {
  const f = path.join(repo, 'bench', 'vs-claude', 'results', 'e7-cto', 'selected.json');
  assert.equal(gitBlobSha(fs.readFileSync(f)).slice(0, 8), LOCK.selectedBlob);
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).items.length, LOCK.nSelected);
  // số mục khác 128 ⇒ lỗi kiểm QH1, không in nhãn
  const a = analyzeE7b({ items, selected, rows: rows0, sums: SUMS, expectN: 128 });
  assert.equal(a.status, 'checks-failed');
  assert.equal(a.checks[0].qh, 'QH1');
});

test('QH1 (m7): blob selected.json sai ⇒ KHÔNG gọi phân tích, chỉ trả lỗi kiểm QH1; blob đúng ⇒ gọi đúng một lần', () => {
  let calls = 0;
  const spy = (args) => { calls++; return analyzeE7b(args); };
  const args = { items, selected, rows: rows0, sums: SUMS };
  const bad = analyzeChecked({ blob: 'deadbeef', ...args }, spy);
  assert.equal(calls, 0);
  assert.equal(bad.status, 'checks-failed');
  assert.deepEqual(bad.checks.map((c) => [c.qh, c.seen]), [['QH1', 'deadbeef']]);
  assert.doesNotMatch(report(bad), /Nhãn P1|Kết luận nhánh|Recall|p Holm|Youden/);
  const ok = analyzeChecked({ blob: LOCK.selectedBlob, ...args }, spy);
  assert.equal(calls, 1);
  assert.equal(ok.status, 'ok');
});

test('QH2/QH4/QH6: hai tệp cấu hình chỉ khác accept 6/16, acceptFollowupRounds = 0, sha256 khớp SHA256SUMS', () => {
  const c1 = JSON.parse(fs.readFileSync(path.join(B, 'config-R1b.json'), 'utf8')), c2 = JSON.parse(fs.readFileSync(path.join(B, 'config-R2b.json'), 'utf8'));
  assert.equal(c1.defaults.acceptFollowupRounds, 0); // QH4
  assert.equal(c2.defaults.acceptFollowupRounds, 0);
  assert.equal(c1.phases.toolTurns.accept, 6); // QH2
  assert.equal(c2.phases.toolTurns.accept, 16);
  c1.phases.toolTurns.accept = c2.phases.toolTurns.accept;
  assert.deepEqual(c1, c2); // chỉ khác `accept`
  const sums = readSums(path.join(B, 'SHA256SUMS'));
  for (const arm of ['R1b', 'R2b']) { // QH6: sha trên nội dung LF (blob git)
    const txt = fs.readFileSync(path.join(B, `config-${arm}.json`), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(crypto.createHash('sha256').update(txt).digest('hex'), sums[arm]);
  }
  assert.ok(sums.R1b.startsWith('91cc507d') && sums.R2b.startsWith('3f62d742'));
});

// ---------- QH3: một tiến trình, một runs.jsonl, R1/R2; không R3 ----------
test('QH3/QH34: đọc MỘT runs.jsonl với arm R1 và R2; arm R3 hay lạ ⇒ lỗi kiểm', () => {
  assert.equal(run().status, 'ok');
  const a = run({ rows: [...rows0, { id: 'x', arm: 'R3', status: 'done', verdict: 'pass' }] });
  assert.equal(a.status, 'checks-failed');
  assert.deepEqual([a.checks[0].qh, a.checks[0].seen], ['QH34', '["R3"]']);
});

// ---------- QH5: acceptCalls = 1 ----------
test('QH5: acceptCalls = 2 (hoặc thiếu) ở dòng done ⇒ lỗi kiểm, không in nhãn', () => {
  const rows = rows0.map((r) => (r.id === 'fA5' && r.arm === 'R2' ? { ...r, acceptCalls: 2 } : r));
  const a = run({ rows });
  assert.equal(a.status, 'checks-failed');
  assert.deepEqual(a.checks.map((c) => [c.qh, c.arm, c.rows, c.seen]), [['QH5', 'R2b', 1, '[2]']]);
  assert.doesNotMatch(report(a), /Nhãn P1|Kết luận nhánh|Recall|p Holm|Youden/);
  const miss = run({ rows: rows0.map((r) => { const { acceptCalls, ...o } = r; return r.id === 'fA5' && r.arm === 'R1' ? o : r; }) });
  assert.equal(miss.checks[0].qh, 'QH5');
});

// ---------- QH6: bản ghim và cấu hình ----------
test('QH6: extraConfigSha256 sai ⇒ lỗi kiểm; commit khác nhau giữa hai arm ⇒ lỗi kiểm', () => {
  const a = run({ rows: rows0.map((r) => (r.arm === 'R2' ? { ...r, extraConfigSha256: 'c'.repeat(64) } : r)) });
  assert.equal(a.status, 'checks-failed');
  assert.deepEqual(a.checks.map((c) => [c.qh, c.arm]), [['QH6', 'R2b']]);
  assert.doesNotMatch(report(a), /Nhãn P1|Kết luận nhánh|Recall|p Holm|Youden/);
  const c = run({ rows: rows0.map((r) => (r.arm === 'R2' ? { ...r, ccodingCommit: 'xyz' } : r)) });
  assert.equal(c.checks.length, 1);
  assert.equal(c.checks[0].qh, 'QH6');
  const noSums = analyzeE7b({ items, selected, rows: rows0, sums: null }); // thiếu SHA256SUMS ⇒ không xác nhận được
  assert.equal(noSums.status, 'checks-failed');
});

// ---------- QH7, QH23: quan sát, cặp thiếu, loại ở bước chuẩn bị ----------
test('QH7: 3 lần infra ⇒ cặp thiếu bỏ khỏi phép ghép; mới 1 lần infra ⇒ chưa đủ dữ liệu (--final: tính thiếu); dòng cuối done thắng', () => {
  const a = run({ rows: dropPair(rows0, ['fA5'], 'R2', 'rate-limit-khong') });
  assert.equal(a.status, 'ok');
  assert.deepEqual(a.miss, { R1b: 0, R2b: 1 });
  assert.equal(a.byMode['chính'].faulty.n, 23);
  const one = [...rows0.filter((r) => !(r.id === 'fA5' && r.arm === 'R2')), infra('fA5', 'R2', 'x')];
  assert.equal(run({ rows: one }).status, 'insufficient');
  assert.equal(run({ rows: one, final: true }).miss.R2b, 1);
  const again = [infra('fA5', 'R2', 'x'), ...rows0]; // infra trước, done sau: cặp đã xong
  assert.equal(run({ rows: again }).miss.R2b, 0);
});

test('QH23: mục không dựng lại được (3 dòng prep) bị loại cả hai arm, báo số, không tính là cặp thiếu', () => {
  const rows = [...rows0.filter((r) => r.id !== 'cB11'), ...[1, 2, 3].map(() => ({ id: 'cB11', arm: 'R1+R2', status: 'infra', infra: 'prep', error: 'không dựng được' }))];
  const a = run({ rows });
  assert.deepEqual(a.prepExcluded, ['cB11']);
  assert.deepEqual(a.miss, { R1b: 0, R2b: 0 });
  assert.equal(a.byMode['chính'].clean.n, 23);
  assert.equal(a.planned.clean, 23);
});

// ---------- QH8, QH17, QH18, QH19, QH20: thước đo, phép kiểm, bootstrap, nhãn ----------
test('QH8/QH9/QH13/QH14/QH17/QH20: McNemar, Holm, số cặp bất đồng tính tay ở các cách tính', () => {
  const a = run();
  const m = a.byMode['chính'], s1 = a.byMode.S1, s2 = a.byMode.S2;
  // P1 chính: R1b 24/24, R2b 20/24 → chỉ R1b chặn 4, chỉ R2b chặn 0; p = 2·(1/2)^4 = 0,125 (QH8: chặn = block; unread không chặn)
  assert.deepEqual([m.faulty.n, m.faulty.R1b.k, m.faulty.R2b.k, m.faulty.aOnly, m.faulty.bOnly], [24, 24, 20, 4, 0]);
  assert.ok(Math.abs(m.faulty.p - 0.125) < 1e-12);
  assert.deepEqual([m.clean.R1b.k, m.clean.R2b.k, m.clean.aOnly, m.clean.bOnly], [14, 0, 14, 0]);
  assert.ok(Math.abs(m.clean.p - 0.5 ** 13) < 1e-15);
  assert.ok(Math.abs(m.clean.pAdj - 2 * 0.5 ** 13) < 1e-15); // QH17 Holm
  assert.ok(Math.abs(m.faulty.pAdj - 0.125) < 1e-12);
  assert.equal(m.clean.label, 'khác nhau');
  assert.equal(m.faulty.label, 'chưa phân biệt được'); // QH20: 4 cặp bất đồng < 10
  // S1 (QH13: unread = chặn): R2b lỗi chặn 22 → chỉ R1b 2; đúng: cA0 cả hai chặn → chỉ R1b 13
  assert.deepEqual([s1.faulty.R2b.k, s1.faulty.aOnly, s1.clean.R2b.k, s1.clean.aOnly], [22, 2, 1, 13]);
  assert.ok(Math.abs(s1.faulty.p - 0.5) < 1e-12);
  // S2 (QH14: bỏ cặp có unread): lỗi n = 22, đúng n = 23
  assert.deepEqual([s2.faulty.n, s2.faulty.R2b.k, s2.faulty.aOnly, s2.clean.n, s2.clean.aOnly], [22, 20, 2, 23, 13]);
  assert.deepEqual(holm2(0.01, 0.04).adj, [0.02, 0.04]);
  assert.deepEqual(holm2(0.04, 0.01).adj, [0.04, 0.02]);
  assert.deepEqual(holm2(0.03, 0.04).adj, [0.06, 0.06]);
});

test('QH18: bootstrap hai tầng theo bài, B = 4000, hạt 20261104, tất định', () => {
  assert.deepEqual([LOCK.B, LOCK.seed], [4000, '20261104']);
  const m = run().byMode['chính'];
  // hiệu mỗi mục lỗi chỉ R1b chặn: −1 ở 4 mục (fA0, fA1, fB0, fB1 → 2 mỗi bài); mục khác 0
  const ds = [];
  for (const x of items.filter((y) => y.kind === 'faulty')) { const n = Number(x.id.slice(2)); ds.push({ task: x.task, d: n <= 1 ? -1 : 0 }); }
  assert.deepEqual(m.faulty.diffBoot, bootDiff(ds, 4000, '20261104'));
  assert.deepEqual(run().byMode['chính'].faulty.diffBoot, m.faulty.diffBoot);
});

test('QH19: nhãn ba giá trị; hai phép khác chiều ⇒ "chưa kết luận"', () => {
  assert.equal(labelOf({ aOnly: 12, bOnly: 0, pAdj: 0.01, ci: [-0.5, -0.2] }), 'khác nhau'); // cùng chiều R2b < R1b
  assert.equal(labelOf({ aOnly: 12, bOnly: 0, pAdj: 0.01, ci: [0.1, 0.5] }), 'chưa kết luận'); // ngược chiều
  assert.equal(labelOf({ aOnly: 0, bOnly: 12, pAdj: 0.01, ci: [-0.5, -0.2] }), 'chưa kết luận');
  assert.equal(labelOf({ aOnly: 12, bOnly: 0, pAdj: 0.01, ci: [-0.5, 0.1] }), 'chưa kết luận'); // McNemar có ý nghĩa, bootstrap không
  assert.equal(labelOf({ aOnly: 12, bOnly: 0, pAdj: 0.2, ci: [-0.5, -0.2] }), 'chưa kết luận'); // bootstrap có, McNemar không
  assert.equal(labelOf({ aOnly: 12, bOnly: 0, pAdj: 0.2, ci: [-0.5, 0.1] }), 'chưa phân biệt được'); // cả hai không
});

test('QH19 (qua analyze): hai bài hiệu trái dấu (12–12) ⇒ cả hai phép không có ý nghĩa ⇒ nhãn "chưa phân biệt được"', () => {
  // bài A: chỉ R1b chặn (12); bài B: chỉ R2b chặn (12). McNemar p = 1 và CI bootstrap chứa 0: nhánh "cả hai không có ý nghĩa", không phải "chưa kết luận"
  const its = [], sel2 = [], rows = [];
  for (let i = 0; i < 12; i++) for (const [task, kind] of [['A', 'clean'], ['B', 'clean']]) { const id = `c${task}${i}`; its.push({ id, task, kind }); sel2.push(id); }
  for (const x of its) {
    const n = Number(x.id.slice(2));
    rows.push(R1(x.id, x.task === 'A' && n < 12 ? 'block' : 'pass')); // bài A: R1b chặn cả 12; bài B: không chặn
    rows.push(R2(x.id, x.task === 'A' ? 'pass' : 'block')); // bài B: chỉ R2b chặn cả 12 (ngược chiều bài A)
  }
  const a = analyzeE7b({ items: its, selected: sel2, rows, sums: SUMS });
  const c = a.byMode['chính'].clean;
  assert.deepEqual([c.aOnly, c.bOnly], [12, 12]);
  assert.equal(c.label, 'chưa phân biệt được'); // 24 cặp bất đồng nhưng p = 1 và CI chứa 0
});

test('QH19/QH28 (P5, qua analyze → bảng → decision.labels): McNemar có ý nghĩa nhưng CI bootstrap chứa 0 ⇒ "chưa kết luận" và nhánh F', () => {
  // Chỉ mục đúng (clean). Bài A: 12 mục chỉ R1b chặn (hiệu −1). Bài B: 12 mục cả hai không chặn (hiệu 0).
  // McNemar 12–0: p = 2·0,5^12, p Holm < 0,05 ⇒ có ý nghĩa. Bootstrap theo bài (2 bài): kịch bản rút hai lần bài B cho hiệu 0 ⇒ cận trên = 0 ⇒ CI chứa 0 ⇒ không có ý nghĩa.
  const its = [], sel2 = [], rows = [];
  for (let i = 0; i < 12; i++) for (const task of ['A', 'B']) { const id = `c${task}${i}`; its.push({ id, task, kind: 'clean' }); sel2.push(id); }
  for (const x of its) {
    rows.push(R1(x.id, x.task === 'A' ? 'block' : 'pass'));
    rows.push(R2(x.id, 'pass'));
  }
  const a = analyzeE7b({ items: its, selected: sel2, rows, sums: SUMS });
  assert.equal(a.status, 'ok');
  const c = a.byMode['chính'].clean;
  assert.deepEqual([c.aOnly, c.bOnly], [12, 0]);
  assert.ok(c.pAdj < LOCK.alphaTotal, `p Holm ${c.pAdj}`); // McNemar có ý nghĩa
  assert.ok(c.diffBoot[0] < 0 && c.diffBoot[1] >= 0, JSON.stringify(c.diffBoot)); // bootstrap: CI chứa 0
  assert.equal(c.label, 'chưa kết luận');
  assert.ok(MODES.every((m) => a.byMode[m].clean.label === 'chưa kết luận')); // đứng ở cả năm cách tính
  assert.equal(a.decision.labels.P2, 'chưa kết luận'); // decision.labels
  assert.equal(a.decision.branch, 'F'); // nhánh F: (1), (2) thỏa, (3) không (nhãn không phải "khác nhau")
  assert.match(report(a), /\| chính \| P2 chặn nhầm \| 24 \| 12 \| 0 \|.*\| chưa kết luận \|/); // bảng
  assert.match(report(a), /nhãn P2: \*\*chưa kết luận\*\*/);
});

test('QH19/QH28 (P5 chiều ngược, qua analyze → bảng → decision.labels): CI bootstrap không chứa 0 nhưng McNemar không có ý nghĩa ⇒ "chưa kết luận" và nhánh F', () => {
  // Chỉ mục đúng (clean), 12 mục mỗi bài. Bài A: 3 mục chỉ R1b chặn (hiệu −1), 9 mục cả hai không chặn. Bài B: 8 mục chỉ R1b chặn, 3 mục chỉ R2b chặn (hiệu +1), 1 mục cả hai không chặn.
  // Tổng chỉ R1b chặn 11, chỉ R2b chặn 3 (14 cặp bất đồng ≥ 10, QH20). McNemar 11–3: p = 0,0574 > 0,05; p Holm = 0,1148 ≥ 0,05 ⇒ không có ý nghĩa.
  // Bootstrap theo bài (2 bài, B = 4000, seed khóa): CI hiệu R2b − R1b = [−0,6667; −0,0833] ⇒ không chứa 0. Khoảng cách từ 0 tới cận gần nhất (cận trên) = 0,0833 = 2 mục trên 24, nên không sát biên (cận chạm 0 khi khoảng cách = 0).
  const its = [], sel2 = [], rows = [];
  for (let i = 0; i < 12; i++) for (const task of ['A', 'B']) { const id = `c${task}${i}`; its.push({ id, task, kind: 'clean' }); sel2.push(id); }
  const r1Only = new Set(['cA0', 'cA1', 'cA2', ...Array.from({ length: 8 }, (_, i) => `cB${i}`)]);
  const r2Only = new Set(['cB8', 'cB9', 'cB10']);
  for (const x of its) {
    rows.push(R1(x.id, r1Only.has(x.id) ? 'block' : 'pass'));
    rows.push(R2(x.id, r2Only.has(x.id) ? 'block' : 'pass'));
  }
  const a = analyzeE7b({ items: its, selected: sel2, rows, sums: SUMS });
  assert.equal(a.status, 'ok');
  const c = a.byMode['chính'].clean;
  assert.deepEqual([c.aOnly, c.bOnly], [11, 3]);
  assert.ok(c.p > 0.05 && c.p < 0.06, `p ${c.p}`);
  assert.ok(c.pAdj >= LOCK.alphaTotal, `p Holm ${c.pAdj}`); // McNemar không có ý nghĩa
  assert.ok(c.diffBoot[1] < 0, JSON.stringify(c.diffBoot)); // bootstrap: CI không chứa 0
  assert.ok(Math.abs(c.diffBoot[1] - -0.0833) < 0.001, JSON.stringify(c.diffBoot)); // khoảng cách tới biên ≈ 0,0833, không sát biên
  assert.equal(c.label, 'chưa kết luận');
  assert.ok(MODES.every((m) => a.byMode[m].clean.label === 'chưa kết luận')); // đứng ở cả năm cách tính
  assert.equal(a.decision.labels.P2, 'chưa kết luận');
  assert.equal(a.decision.branch, 'F');
  assert.match(report(a), /\| chính \| P2 chặn nhầm \| 24 \| 11 \| 3 \|.*\| chưa kết luận \|/);
  assert.match(report(a), /nhãn P2: \*\*chưa kết luận\*\*/);
});

// ---------- QH10: capped và "suy ra" ----------
test('QH10: thiếu acceptTurnCapped ⇒ "suy ra" = unread; có trường ⇒ chỉ lượt true; không dùng `turns`', () => {
  const noFlag = rows0.map((r) => { const { acceptTurnCapped, ...o } = r; return { ...o, turns: 0 }; });
  const a = run({ rows: noFlag });
  assert.deepEqual([a.per.R2b.unread, a.per.R2b.capped, a.per.R2b.cappedBasis], [3, 3, 'suy ra']);
  assert.equal(a.byMode['chính'].branch.id, 'D'); // 3 > floor(6/128 × 48) = 2
  const flagged = rows0.map((r) => (r.arm === 'R2' && ['fA0', 'fB0'].includes(r.id) ? { ...r, acceptTurnCapped: true } : r));
  const b = run({ rows: flagged });
  assert.deepEqual([b.per.R2b.capped, b.per.R2b.cappedBasis], [2, 'ghi']);
  assert.notEqual(b.byMode['chính'].branch.id, 'D'); // 2 > 2 sai
  // cờ true ở dòng KHÔNG unread không tính vào capped
  const c = run({ rows: rows0.map((r) => (r.arm === 'R2' && r.id === 'fA2' ? { ...r, acceptTurnCapped: true } : r)) });
  assert.equal(c.per.R2b.capped, 0);
});

// ---------- QH11: authSource ----------
test('QH11: authSource lạ (khóa API / nhãn khác / thiếu) ⇒ lỗi kiểm, không in nhãn', () => {
  for (const bad of [['claude.ai'], ['none', 'oauth'], ['apiKey'], undefined]) {
    const rows = rows0.map((r) => { if (!(r.id === 'fA3' && r.arm === 'R1')) return r; const { acceptAuthSources, ...o } = r; return bad === undefined ? o : { ...o, acceptAuthSources: bad }; });
    const a = run({ rows });
    assert.equal(a.status, 'checks-failed', JSON.stringify(bad));
    assert.deepEqual(a.checks.map((c) => [c.qh, c.arm]), [['QH11', 'R1b']]);
    assert.doesNotMatch(report(a), /Nhãn P1|Kết luận nhánh|Recall|p Holm|Youden/);
  }
});

test('QH11 (m3): authSource lạ ở dòng infra (kể cả khóa API) ⇒ lỗi kiểm, không in nhãn; infra không có trường hoặc ["none"] thì không lỗi; done thiếu trường vẫn lỗi riêng', () => {
  const withInfra = (extra) => [...rows0.filter((r) => !(r.id === 'fA5' && r.arm === 'R2')), infra('fA5', 'R2', 'transient: x', extra), infra('fA5', 'R2', 'transient: x'), infra('fA5', 'R2', 'transient: x')];
  const a = run({ rows: withInfra({ acceptAuthSources: ['apiKey'] }) });
  assert.equal(a.status, 'checks-failed');
  assert.deepEqual(a.checks.map((c) => [c.qh, c.arm, c.rows, c.seen]), [['QH11', 'R2b', 1, '[["apiKey"]]']]);
  assert.doesNotMatch(report(a), /Nhãn P1|Kết luận nhánh|Recall|p Holm|Youden/);
  assert.equal(run({ rows: withInfra({}) }).status, 'ok'); // infra không có lượt accept: không có trường, không lỗi
  assert.equal(run({ rows: withInfra({ acceptAuthSources: [] }) }).status, 'ok');
  assert.equal(run({ rows: withInfra({ acceptAuthSources: ['none'] }) }).status, 'ok');
  // dòng done thiếu trường: lỗi "thiếu" riêng (giữ nguyên)
  const miss = run({ rows: rows0.map((r) => { if (!(r.id === 'fA3' && r.arm === 'R1')) return r; const { acceptAuthSources, ...o } = r; return o; }) });
  assert.deepEqual(miss.checks.map((c) => [c.qh, c.arm, c.seen]), [['QH11', 'R1b', '[null]']]);
});

test('QH11 (K1, 26d): dòng done không xác nhận được ⇒ dừng ở QH11 và in giá trị thật: mảng rỗng in [[]], không có trường in [null]', () => {
  const pick = (extra) => rows0.map((r) => { if (!(r.id === 'fA3' && r.arm === 'R1')) return r; const { acceptAuthSources, ...o } = r; return extra ? { ...o, ...extra } : o; });
  const empty = run({ rows: pick({ acceptAuthSources: [] }) });
  assert.equal(empty.status, 'checks-failed');
  assert.deepEqual(empty.checks.map((c) => [c.qh, c.arm, c.rows, c.seen]), [['QH11', 'R1b', 1, '[[]]']]);
  assert.doesNotMatch(report(empty), /Nhãn P1|Kết luận nhánh|Recall|p Holm|Youden/);
  const none = run({ rows: pick(null) });
  assert.equal(none.status, 'checks-failed');
  assert.deepEqual(none.checks.map((c) => [c.qh, c.arm, c.rows, c.seen]), [['QH11', 'R1b', 1, '[null]']]);
  assert.doesNotMatch(report(none), /Nhãn P1|Kết luận nhánh|Recall|p Holm|Youden/);
});

// ---------- QH12: trần thực tế ----------
test('QH12: maxTurns khác 6 (R1) / 16 (R2) ⇒ lỗi kiểm', () => {
  const a = run({ rows: rows0.map((r) => (r.arm === 'R2' && r.id === 'fA4' ? { ...r, maxTurns: 6 } : r)) });
  assert.deepEqual(a.checks.map((c) => [c.qh, c.arm, c.seen]), [['QH12', 'R2b', '[6]']]);
  assert.equal(run({ rows: rows0.map((r) => (r.arm === 'R1' ? { ...r, maxTurns: 16 } : r)) }).checks[0].qh, 'QH12');
});

// ---------- QH15, QH16, QH30: S3 và luật "hết giờ" ----------
test('QH30: điều kiện hết giờ theo chuỗi/trường mã ghi; ngoài ba điều kiện thì không tính', () => {
  const s = (error, extra = {}) => timeoutCond({ status: 'infra', infra: 'error', error, ...extra });
  assert.equal(s('quá hạn chờ 5400s'), 1); // bench/vs-claude/e7/lib.mjs:262
  assert.equal(s('Hết thời gian (1800s)'), 2); // src/runtimes/claude-cli.ts:384
  assert.equal(s('timeout: Hết thời gian (1800s)'), 2); // chuỗi runtime thắng khi cùng khớp điều kiện 3
  assert.equal(s('timeout: ETIMEDOUT'), 3);
  assert.equal(s('', { errorKind: 'timeout' }), 0); // m1: (d) `error` rỗng không tính; errorKind của calls.jsonl chỉ để đối chiếu
  assert.equal(s('transient: ECONNRESET', { errorKind: 'timeout' }), 0); // errorKind không thay chuỗi `error`
  assert.equal(s('', { errorKind: 'timeout', infra: 'rate-limit' }), 0);
  assert.equal(s('transient: ECONNRESET'), 0);
  assert.equal(s('auth: Failed to authenticate. API Error: 403'), 0);
  assert.equal(s('Hết thời gian (1800s)', { infra: 'rate-limit' }), 0);
  assert.equal(s(''), 0);
  assert.equal(timeoutCond({ status: 'done', error: 'quá hạn chờ 5s' }), 0);
  assert.equal(s('quá hạn chờ rất lâu'), 0); // không có số giây
});

const withS3 = (error) => dropPair(rows0, ['fA5'], 'R2', error);
test('QH15/QH30: cặp thiếu do `quá hạn chờ` của runCto vào S3 (cặp được giữ như unread)', () => {
  const a = run({ rows: withS3('quá hạn chờ 5400s') });
  assert.deepEqual(a.per.R2b.timeoutMissing, { total: 1, byCond: [1, 0, 0], rowsByCond: [3, 0, 0] });
  const [main, s3a, s3b, s1] = [a.byMode['chính'], a.byMode.S3a, a.byMode.S3b, a.byMode.S1];
  assert.equal(main.faulty.n, 23); // cặp thiếu bỏ khỏi cách chính
  assert.equal(s3a.faulty.n, 24); // S3a: giữ lại như unread, không chặn → R1b chặn, R2b không: thêm 1 cặp chỉ R1b
  assert.deepEqual([s3a.faulty.R2b.k, s3a.faulty.aOnly], [19, 5]);
  assert.deepEqual([s3b.faulty.n, s3b.faulty.R2b.k, s3b.faulty.aOnly], [24, 22, 2]); // S3b (như S1): 19 chặn thật + 2 unread + 1 hết giờ = 22
  assert.equal(s1.faulty.n, 23);
});

test('QH15/QH30: cặp thiếu do `Hết thời gian` của runtime, hoặc `timeout:` qua callErrors, vào S3; lỗi khác thì không', () => {
  const b = run({ rows: withS3('Hết thời gian (1800s)') });
  assert.deepEqual(b.per.R2b.timeoutMissing, { total: 1, byCond: [0, 1, 0], rowsByCond: [0, 3, 0] });
  assert.equal(b.byMode.S3a.faulty.n, 24);
  const c = run({ rows: withS3('timeout: ETIMEDOUT') });
  assert.deepEqual(c.per.R2b.timeoutMissing.byCond, [0, 0, 1]);
  const d = run({ rows: withS3('transient: ECONNRESET') });
  assert.equal(d.per.R2b.timeoutMissing.total, 0);
  assert.equal(d.byMode.S3a.faulty.n, 23); // không hết giờ: S3a trùng cách chính
  assert.deepEqual([d.byMode.S3a.faulty.aOnly, d.byMode.S3a.faulty.R2b.k], [d.byMode['chính'].faulty.aOnly, d.byMode['chính'].faulty.R2b.k]);
  // lẫn: một dòng infra không phải hết giờ trong cặp ⇒ không tính (chọn "mọi dòng")
  const mixed = [...rows0.filter((r) => !(r.id === 'fA5' && r.arm === 'R2')), infra('fA5', 'R2', 'quá hạn chờ 5400s'), infra('fA5', 'R2', 'transient: ECONNRESET'), infra('fA5', 'R2', 'quá hạn chờ 5400s')];
  assert.equal(run({ rows: mixed }).per.R2b.timeoutMissing.total, 0);
  // m1: dòng infra `error` rỗng (dù errorKind = 'timeout') ⇒ không tính hết giờ
  const empty = [...rows0.filter((r) => !(r.id === 'fA5' && r.arm === 'R2')), ...[1, 2, 3].map(() => infra('fA5', 'R2', '', { errorKind: 'timeout' }))];
  const e = run({ rows: empty });
  assert.equal(e.per.R2b.timeoutMissing.total, 0);
  assert.equal(e.byMode.S3a.faulty.n, 23);
});

test('QH30 (m2): báo riêng số cặp và số dòng infra theo từng điều kiện; dòng khớp 2 và 3 tính vào ĐK2; bảng báo cáo ghi thứ tự xét', () => {
  // cặp fA5: 3 dòng ĐK1, ĐK2, ĐK3 (mọi dòng đều là hết giờ ⇒ tính); cặp theo dòng cuối (ĐK3); dòng theo từng điều kiện
  const rows = [...rows0.filter((r) => !(r.id === 'fA5' && r.arm === 'R2')), infra('fA5', 'R2', 'quá hạn chờ 5400s'), infra('fA5', 'R2', 'timeout: Hết thời gian (1800s)'), infra('fA5', 'R2', 'timeout: ETIMEDOUT')];
  const a = run({ rows });
  assert.deepEqual(a.per.R2b.timeoutMissing, { total: 1, byCond: [0, 0, 1], rowsByCond: [1, 1, 1] });
  const text = report(a);
  assert.match(text, /ĐK1, rồi ĐK2, rồi ĐK3/);
  assert.match(text, /\| R2b \| 1 \| 1: 0 \/ 0 \/ 1 \| 1 \/ 1 \/ 1 \|/);
});

test('QH16: nhánh phải giống nhau ở chính, S1, S2, S3 — không thì chưa kết luận', () => {
  assert.deepEqual(MODES, ['chính', 'S1', 'S2', 'S3a', 'S3b']);
  const flagged = rows0.map((r) => (r.arm === 'R2' && ['fA0', 'fB0'].includes(r.id) ? { ...r, acceptTurnCapped: true } : r));
  const b = run({ rows: flagged });
  assert.equal(b.byMode['chính'].branch.id, 'B');
  assert.deepEqual(b.byMode['chính'].branch.thr, { maxFp: 3, minRecall: 21, maxDrop: 3 });
  assert.equal(b.byMode.S1.branch.id, 'A'); // recall R2b 22 ≥ 21 và P2 "khác nhau"
  assert.equal(b.decision.stable, false);
  assert.match(b.decision.branch, /^chưa kết luận/);
  assert.equal(b.decision.branches.S3a, 'B');
  assert.equal(b.decision.branches.S3b, 'A');
});

// ---------- QH21, QH22: cặp thiếu theo arm ----------
test('QH21: một arm 4 cặp thiếu ⇒ nhánh F và nhãn "chưa kết luận" ở mọi cách tính', () => {
  const ids = ['fA5', 'fA6', 'fA7', 'fA8'];
  const a = run({ rows: dropPair(rows0, ids, 'R2', 'transient: x') });
  assert.deepEqual(a.miss, { R1b: 0, R2b: 4 });
  assert.equal(a.decision.branch, 'F');
  assert.ok(MODES.every((m) => a.byMode[m].branch.id === 'F' && a.byMode[m].faulty.label === 'chưa kết luận' && a.byMode[m].clean.label === 'chưa kết luận'));
  assert.deepEqual(a.decision.labels, { P1: 'chưa kết luận', P2: 'chưa kết luận' });
  assert.match(a.decision.forcedBy.join(';'), /QH21/);
  assert.match(a.decision.forcedBy.join(';'), /QH22/); // 4 − 0 = 4 ≥ 3 cũng đúng
  // 3 cặp thiếu ở một arm (chênh 3) → QH22 chứ không QH21
  const t = run({ rows: dropPair(rows0, ids.slice(0, 3), 'R2', 'transient: x') });
  assert.deepEqual(t.decision.forcedBy.map((s) => s.slice(0, 4)), ['QH22']);
});

test('QH22: chênh 3 cặp thiếu giữa hai arm ⇒ F; chênh 2 (mỗi arm ≤ 3) thì không bị ép', () => {
  let rows = dropPair(rows0, ['fA5', 'fA6', 'fA7'], 'R1', 'transient: x'); // R1b thiếu 3, R2b thiếu 0: chênh 3
  const a = run({ rows });
  assert.equal(a.decision.branch, 'F');
  assert.deepEqual(a.decision.forcedBy.map((s) => s.slice(0, 4)), ['QH22']);
  rows = dropPair(dropPair(rows0, ['fA5', 'fA6', 'fA7'], 'R1', 'transient: x'), ['fB5', 'fB6'], 'R2', 'transient: x'); // 3 so 2: chênh 1
  const b = run({ rows });
  assert.deepEqual(b.decision.forcedBy, []);
  const c = run({ rows: dropPair(rows0, ['fA5', 'fA6'], 'R2', 'transient: x') }); // chênh 2, mỗi arm ≤ 3
  assert.deepEqual(c.decision.forcedBy, []);
  assert.notEqual(c.decision.branch, 'F');
});

// ---------- QH24–QH28: nhánh ----------
test('QH24–QH28: thứ tự D → E → A → B → C → F và ngưỡng làm tròn (n = 64 ra 6, 58, 6)', () => {
  const mkBr = (fpR1, fpR2, rec1, rec2, label) => ({ faulty: { n: 64, planned: 64, R1b: { k: rec1 }, R2b: { k: rec2 } }, clean: { n: 64, planned: 64, R1b: { k: fpR1, cp: [fpR1 / 64 - 0.1, 1] }, R2b: { k: fpR2 }, label } });
  const per = { R2b: { capped: 0, cappedBasis: 'ghi' } };
  assert.equal(branchOf(mkBr(27, 6, 63, 58, 'khác nhau'), per).id, 'A'); // QH27
  assert.equal(branchOf(mkBr(27, 7, 63, 58, 'khác nhau'), per).id, 'C'); // QH28 C
  assert.equal(branchOf(mkBr(27, 6, 63, 57, 'khác nhau'), per).id, 'B'); // QH28 B
  assert.equal(branchOf(mkBr(27, 6, 63, 58, 'chưa phân biệt được'), per).id, 'F'); // QH28 F
  assert.equal(branchOf(mkBr(27, 6, 63, 58, 'chưa kết luận'), per).id, 'F'); // P5: "chưa kết luận" không thỏa A
  assert.equal(branchOf(mkBr(27, 6, 65, 58, 'khác nhau'), per).id, 'B'); // R1b − R2b = 7 > 6
  assert.equal(branchOf(mkBr(3, 0, 63, 63, 'khác nhau'), per).id, 'E'); // QH26
  assert.equal(branchOf(mkBr(3, 0, 63, 63, 'khác nhau'), { R2b: { capped: 7, cappedBasis: 'ghi' } }).id, 'D'); // QH25: 7 > 6/128 × 128 = 6, D đứng trước E
  assert.equal(branchOf(mkBr(27, 6, 63, 58, 'khác nhau'), { R2b: { capped: 6, cappedBasis: 'ghi' } }).id, 'A'); // 6 không vượt 6
});

// ---------- QH29: chỉ mô tả ----------
test('QH29: phân bố acceptTurns / acceptToolCalls chỉ mô tả; thiếu giá trị đếm riêng, không vào phép kiểm', () => {
  const rows = rows0.map((r) => (r.arm === 'R2' && r.id === 'fA5' ? { ...r, acceptTurns: null, acceptToolCalls: 9 } : r));
  const a = run({ rows });
  assert.deepEqual([a.per.R2b.acceptTurns.n, a.per.R2b.acceptTurns.nNull, a.per.R2b.acceptTurns.median], [47, 1, 5]);
  assert.deepEqual([a.per.R2b.acceptToolCalls.max, a.per.R2b.acceptToolCalls.sum], [9, 47 * 4 + 9]);
  const same = run();
  assert.deepEqual(a.byMode['chính'].faulty.p, same.byMode['chính'].faulty.p); // không đổi phép kiểm
  assert.ok(Math.abs(same.usdRatio - 2.6) < 1e-9); // USD mô tả
  assert.ok(Math.abs(same.byMode['chính'].youden.R2b - 20 / 24) < 1e-12);
});

// ---------- QH31: 403 ----------
test('QH31: dòng done có văn bản 403/Failed to authenticate ⇒ lỗi kiểm (dừng); lỗi 403 ở dòng infra không phải unread', () => {
  const a = run({ rows: rows0.map((r) => (r.arm === 'R1' && r.id === 'fA6' ? { ...r, text: 'Failed to authenticate. API Error: 403' } : r)) });
  assert.deepEqual(a.checks.map((c) => [c.qh, c.arm]), [['QH31', 'R1b']]);
  const ok = run({ rows: dropPair(rows0, ['fA6'], 'R1', 'auth: Failed to authenticate. API Error: 403') });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.per.R1b.unread, 0); // infra, không phải unread
  assert.equal(ok.per.R1b.timeoutMissing.total, 0); // 403 không phải hết giờ
});

// ---------- QH32, QH33, QH34, QH36: quy tắc chạy, kiểm qua RUNBOOK ----------
const runbook = fs.readFileSync(path.join(B, 'RUNBOOK.md'), 'utf8');
test('QH32/QH33: RUNBOOK dừng một tiến trình khi hết hạn mức, chạy lại đúng lệnh cũ, không chạy lại vì kết quả', () => {
  assert.match(runbook, /QH32/);
  assert.match(runbook, /đúng lệnh cũ/);
  assert.match(runbook, /QH33/);
  assert.match(runbook, /không chạy lại vì kết quả/i);
  assert.match(runbook, /không (mở|đọc) `runs\.jsonl`/i);
});

test('QH3/QH34: RUNBOOK một tiến trình — lệnh chính đủ cờ, lượt thử có mục dự phòng, KHÔNG có lượt R3', () => {
  assert.match(runbook, /--arms R1,R2/);
  assert.match(runbook, /--arm-config R1=\S*config-R1b\.json,R2=\S*config-R2b\.json/);
  assert.match(runbook, /--selected \S*e7-cto\\selected\.json/);
  assert.match(runbook, /--ccoding-data/);
  assert.match(runbook, /D24/);
  assert.match(runbook, /067cd64cc5/);
  assert.doesNotMatch(runbook, /--arms R3/); // không lệnh R3
  assert.doesNotMatch(runbook, /e7b-smoke-auth/);
  assert.doesNotMatch(runbook, /--arms R1 /); // không còn chạy mỗi arm một tiến trình
  assert.doesNotMatch(runbook, /hai tiến trình\*\* \*\*cùng lúc|cửa sổ 1|--data-r1b/);
  for (const qh of ['QH5', 'QH6', 'QH11', 'QH12', 'QH34']) assert.match(runbook, new RegExp(qh));
});

test('QH36: câu cấm — phương án hai tiến trình không gọi là "xen kẽ"; báo cáo không có "đã chứng minh/xác nhận/tái lập"', () => {
  const lines = runbook.split('\n').filter((l) => /hai tiến trình/i.test(l));
  for (const l of lines) assert.doesNotMatch(l, /xen kẽ(?!.*không)/i, l); // câu nhắc "hai tiến trình" chỉ để bác bỏ
  const text = report(run());
  assert.doesNotMatch(text, /đã chứng minh|xác nhận|tái lập|lặp lại E7/i);
  assert.doesNotMatch(text, /song song/);
  assert.match(text, /xen kẽ theo bảng Latin/);
  assert.doesNotMatch(text, /Opus tốt hơn Sonnet|nên đổi model/i);
});

test('QH34: kiểm lượt thử chỉ đọc trường hạ tầng; thiếu D24 (không có extraConfigSha256) hoặc authSource lạ ⇒ LỖI', () => {
  const good = [R1('s1', 'block', { promptSha: 'p1' }), R2('s1', 'pass', { promptSha: 'p1' })];
  const ok = smokeCheck(good, SUMS);
  assert.equal(ok.ok, true, ok.lines.join('\n'));
  assert.ok(ok.lines.every((l) => l.startsWith('OK')));
  assert.ok(!ok.lines.join('\n').match(/block|pass|verdict/)); // không lộ kết luận
  const noD24 = smokeCheck(good.map((r) => { const { extraConfigSha256, ...o } = r; return o; }), SUMS);
  assert.equal(noD24.ok, false);
  assert.match(noD24.lines.find((l) => l.startsWith('LỖI')), /QH6.*bản ghim thiếu D24/);
  const same = smokeCheck(good.map((r) => ({ ...r, extraConfigSha256: SUMS.R1b })), SUMS); // hai arm cùng một cấu hình
  assert.ok(same.lines.some((l) => l.startsWith('LỖI') && l.includes('R2b') && l.includes('QH6')));
  assert.equal(smokeCheck([good[0], { ...good[1], acceptAuthSources: ['apiKey'] }], SUMS).ok, false);
  assert.equal(smokeCheck([good[0], { ...good[1], acceptCalls: 2 }], SUMS).ok, false);
  assert.equal(smokeCheck([good[0], { ...good[1], promptSha: 'p2' }], SUMS).ok, false);
  assert.equal(smokeCheck([good[0], { ...good[1], models: ['claude-sonnet-5-5'] }], SUMS).ok, false); // R2 phải là Opus
  assert.equal(smokeCheck([good[0]], SUMS).ok, false); // thiếu arm R2
});

// ---------- QH35 + đối chiếu calls.jsonl + dữ liệu một phần ----------
const withCalls = (fn) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e7b-'));
  try { return fn(dir, (arm, taskId, recs) => {
    fs.mkdirSync(path.join(dir, arm, 'runs', taskId), { recursive: true });
    fs.writeFileSync(path.join(dir, arm, 'runs', taskId, 'calls.jsonl'), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

test('QH35/PL2 (b): đối chiếu calls.jsonl (w1/w2) chỉ ghi lệch; không đổi quyết định', () => {
  withCalls((dir, put) => {
    put('w1', 'T-1', [{ phase: 'execute' }, { phase: 'accept', authSource: 'none', turnCapped: false }]);
    put('w2', 'T-2', [{ phase: 'accept', authSource: 'none', turnCapped: true }, { phase: 'accept', authSource: 'none', turnCapped: false }]);
    put('w2', 'T-3', [{ phase: 'accept', authSource: 'oauth', turnCapped: false }]);
    const rows = [
      { id: 'a', arm: 'R1', status: 'done', taskId: 'T-1', acceptCalls: 1, acceptAuthSources: ['none'], acceptTurnCapped: false },
      { id: 'b', arm: 'R2', status: 'done', taskId: 'T-2', acceptCalls: 1, acceptAuthSources: ['none'], acceptTurnCapped: false },
      { id: 'c', arm: 'R2', status: 'done', taskId: 'T-3', acceptCalls: 1, acceptAuthSources: ['none'], acceptTurnCapped: false },
      { id: 'd', arm: 'R2', status: 'done', taskId: 'T-9', acceptCalls: 1, acceptAuthSources: ['none'] },
    ];
    const d = reconcileWithCalls([path.join(dir, 'w1'), path.join(dir, 'w2')], rows);
    assert.deepEqual(d.map((x) => `${x.id}: ${x.what}`), ['b: acceptCalls 1 ≠ calls.jsonl 2', 'b: acceptTurnCapped false ≠ calls.jsonl true', 'c: acceptAuthSources ["none"] ≠ calls.jsonl ["oauth"]', 'd: không thấy calls.jsonl']);
  });
});

const spawn = (args) => spawnSync(process.execPath, [path.join(here, 'e7b-analyze.mjs'), ...args], { encoding: 'utf8' });

test('dữ liệu một phần: từ chối in số, thoát 0, nói rõ --final', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e7b-'));
  try {
    const f = path.join(dir, 'runs.jsonl');
    fs.writeFileSync(f, JSON.stringify(R1('x1', 'block')) + '\n' + JSON.stringify(R2('x1', 'block')) + '\n');
    const r = spawn(['--runs', f, '--sums', path.join(B, 'SHA256SUMS')]);
    assert.match(r.stdout, /chưa đủ dữ liệu|QH/); // hoặc lỗi kiểm (sha không khớp) — cả hai đều không in số
    assert.doesNotMatch(r.stdout, /Recall|Youden|McNemar|Nhãn P1/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('chưa có runs.jsonl: thoát 0, báo "chưa có dữ liệu", không in số', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e7b-'));
  try {
    const r = spawn(['--runs', path.join(dir, 'runs.jsonl')]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /chưa có dữ liệu/);
    assert.ok(!/\d/.test(r.stdout.replace(/runs\.jsonl/g, '')), r.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('QH35 (CLI): kiểm hạ tầng sai thì thoát mã 2 và chỉ in lỗi kiểm', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e7b-'));
  try {
    const f = path.join(dir, 'runs.jsonl');
    fs.writeFileSync(f, JSON.stringify(R1('x1', 'block', { acceptAuthSources: ['apiKey'] })) + '\n');
    const r = spawn(['--runs', f, '--sums', path.join(B, 'SHA256SUMS')]);
    assert.equal(r.status, 2);
    assert.match(r.stdout, /QH11/);
    assert.doesNotMatch(r.stdout, /Recall|Youden|McNemar|Nhãn P1|Kết luận nhánh/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
