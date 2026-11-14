// BRIEF-19 K3: điều kiện đọc E7/E8 (bảng theo bài, đọc McNemar cùng bootstrap theo bài, độ nhạy bỏ t5-logq và unparsed = chặn,
// recall theo số lần trượt khi kiểm nhãn; E8: mô tả theo arm). Dữ liệu giả, không đọc dữ liệu thật.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, bootDiff, readPrimary, report } from '../e7/analyze.mjs';
import { describe } from '../e8/analyze.mjs';
import { summarize } from '../e7/label-trials.mjs';

const TASKS = ['a1', 'a2', 'a3', 'a4', 'a5', 't5-logq']; // 6 bài: bootstrap theo bài cần đủ bài (E7 thật có 8)
function fixture({ r1Block = () => true, r3Block = () => false, r2Block = () => false, unparsedR3 = () => false } = {}) {
  const items = [], rows = [];
  for (const task of TASKS) for (let i = 0; i < 6; i++) for (const kind of ['faulty', 'clean']) {
    const id = `${task}-${kind}-${i}`; items.push({ id, task, kind });
    const ctx = { task, kind, i };
    const v = (blk) => (kind === 'faulty' && blk(ctx) ? 'block' : 'pass');
    rows.push({ id, arm: 'R1', status: 'done', verdict: v(r1Block) }, { id, arm: 'R2', status: 'done', verdict: v(r2Block) });
    rows.push({ id, arm: 'R3', status: 'done', verdict: unparsedR3(ctx) ? 'unparsed' : v(r3Block) });
  }
  return { items, selected: items.map((x) => x.id), rows };
}

test('readPrimary: < 10 cặp bất đồng → p chỉ mô tả; thống nhất → khác nhau; lệch → chưa kết luận', () => {
  assert.match(readPrimary({ a: 'R1', b: 'R3', aOnly: 5, bOnly: 0, p: 0.06 }, [0.01, 0.2]).label, /chỉ mô tả \(5 cặp/);
  assert.match(readPrimary({ a: 'R1', b: 'R3', aOnly: 12, bOnly: 0, p: 0.0005 }, [0.1, 0.3]).label, /khác nhau: R1 chặn nhiều hơn R3/);
  assert.match(readPrimary({ a: 'R1', b: 'R3', aOnly: 12, bOnly: 0, p: 0.0005 }, [-0.02, 0.3]).label, /chưa kết luận/);
  assert.equal(readPrimary({ a: 'R1', b: 'R3', aOnly: 6, bOnly: 5, p: 1 }, [-0.1, 0.1]).label, 'không phân biệt được');
});

test('bootDiff: hiệu không đổi → CI suy biến đúng giá trị; phân tầng theo bài', () => {
  const ci = bootDiff([{ task: 'x', d: 1 }, { task: 'y', d: 1 }]);
  assert.deepEqual(ci, [1, 1]);
  const c2 = bootDiff([{ task: 'x', d: 1 }, { task: 'x', d: 0 }, { task: 'y', d: 0 }, { task: 'y', d: 0 }]);
  assert.ok(c2[0] >= 0 && c2[1] <= 1 && c2[0] < c2[1]);
});

test('analyze: bảng theo bài, bỏ t5-logq, unparsed = chặn, lệch unparsed giữa arm', () => {
  // R1 chặn mọi mục lỗi; R3 chặn mục lỗi của t5-logq; R3 có 2 lượt unparsed ở a1
  const d = fixture({ r3Block: ({ task }) => task === 't5-logq', unparsedR3: ({ task, kind, i }) => task === 'a1' && kind === 'faulty' && i < 2 });
  const a = analyze(d);
  assert.deepEqual([a.primary.n, a.primary.aOnly, a.primary.bOnly], [36, 30, 0]);
  assert.match(a.primary.reading.label, /khác nhau: R1 chặn nhiều hơn R3/);
  assert.deepEqual([a.sensitivity.withoutT5.n, a.sensitivity.withoutT5.aOnly], [30, 30]);
  assert.deepEqual([a.sensitivity.unparsedAsBlock.aOnly, a.sensitivity.unparsedAsBlock.bOnly], [28, 0]);
  const t5 = a.perTask.find((t) => t.task === 't5-logq');
  assert.deepEqual([t5['R1|faulty'], t5['R3|faulty'].blocked, t5.r1Only, t5.r3Only], [{ blocked: 6, n: 6, unparsed: 0 }, 6, 0, 0]);
  assert.equal(a.unparsedDiffers, true);
  assert.deepEqual(a.unparsed, { R1: 0, R2: 0, R3: 2 });
  const txt = report(a);
  assert.match(txt, /Bỏ `t5-logq`/);
  assert.match(txt, /tách nguyên nhân trước khi đọc recall/);
  assert.match(txt, /\| t5-logq \| 6\/6 \|/);
  assert.match(txt, /cộng\*\* lớp vận hành CCoding/);
});

test('analyze: recall theo số lần trượt khi kiểm nhãn; summarize đếm phân bố', () => {
  const d = fixture();
  const lt = d.items.map((x) => ({ id: x.id, task: x.task, kind: x.kind, trials: 3, fails: x.kind === 'faulty' ? (x.task === 't5-logq' ? 1 : 3) : 0 }));
  const a = analyze({ ...d, labelTrials: lt });
  assert.deepEqual(a.byLabelFails, { '1/3': { n: 6, R1: 6, R2: 0, R3: 0 }, '3/3': { n: 30, R1: 30, R2: 0, R3: 0 } });
  assert.match(report(a), /Recall theo số lần test ẩn trượt/);
  const s = summarize(lt);
  assert.deepEqual(s.find((c) => c.task === 't5-logq' && c.kind === 'faulty').dist, [0, 6, 0, 0]);
  assert.deepEqual(s.find((c) => c.task === 'a1' && c.kind === 'clean').dist, [6, 0, 0, 0]);
});

test('E8 describe: chạy chồng, chia < 2 hạng mục, cổng, điểm; A0 không có trường CCoding', () => {
  const rows = [
    { arm: 'B6w4', status: 'done', maxConcSubtasks: 3, subtasksTimed: 4, gate: 'green', score: 1, pass: true },
    { arm: 'B6w4', status: 'done', maxConcSubtasks: 1, subtasksTimed: 1, gate: 'red', score: 0.5, pass: false },
    { arm: 'B6w1', status: 'done', maxConcSubtasks: 1, subtasksTimed: 3, gate: 'green', score: 1, pass: true },
    { arm: 'B6w1', status: 'infra' },
    { arm: 'A0-sonnet', status: 'done', score: 0.9, pass: true },
  ];
  const d = describe(rows);
  assert.deepEqual(d.B6w4, { n: 2, overlapping: 1, under2Subtasks: 1, gate: { red: 1, green: 1, none: 0 }, scoreMean: 0.75, pass: 1 });
  assert.equal(d.B6w1.n, 1);
  assert.deepEqual(d['A0-sonnet'], { n: 1, scoreMean: 0.9, pass: 1 });
});

test('13/11 R3 chạm trần lượt: dòng infra cũ (turns > maxTurns, lỗi rỗng) → độ nhạy coi unparsed hoặc bỏ cặp; dòng capped mới được đếm', () => {
  const d = fixture({ r3Block: ({ task }) => task === 't5-logq' });
  const leg = d.items.filter((x) => x.kind === 'faulty' && x.task === 't5-logq').slice(0, 2).map((x) => x.id);
  const rows = [...leg.map((id) => ({ id, arm: 'R3', status: 'infra', infra: 'error', error: '', maxTurns: 6, turns: 7 })), ...d.rows];
  rows.find((r) => r.id === d.items[0].id && r.arm === 'R3').capped = 'turns';
  // dòng infra thật (có lỗi) không bị tính
  rows.unshift({ id: d.items[2].id, arm: 'R3', status: 'infra', infra: 'error', error: 'spawn ENOENT', maxTurns: 6, turns: 0 });
  const a = analyze({ ...d, rows });
  assert.deepEqual(a.sensitivity.cappedLegacy.ids, [...leg].sort());
  assert.equal(a.primary.bOnly, 0);
  assert.equal(a.sensitivity.cappedLegacy.asUnparsed.aOnly, a.primary.aOnly + 2);
  assert.equal(a.sensitivity.cappedLegacy.excluded.n, a.primary.n - 2);
  assert.equal(a.cappedDone.R3, 1);
  assert.match(report(a), /chạm trần lượt trước bản sửa 13\/11 \(2 cặp/);
});

test('13/11 phân loại lại lượt accept lỗi hạ tầng: dòng cuối quyết định; độ nhạy giữ như đã ghi hoặc bỏ cặp', async () => {
  const { findMisclassified, reclassRow } = await import('../e7/reclassify.mjs');
  const { latestDone } = await import('../e7/analyze.mjs');
  const d = fixture();
  const fId = d.items.find((x) => x.kind === 'faulty').id;
  // R1 của mục lỗi đầu: lượt cũ 403 ghi done/unparsed; lượt gọi có error
  const rows = d.rows.map((r) => (r.id === fId && r.arm === 'R1' ? { ...r, verdict: 'unparsed', taskId: 'T-1', at: 't0' } : r));
  const calls = { 'T-1': [{ phase: 'accept', error: 'Failed to authenticate. API Error: 403 Attention Required! | Cloudflare' }] };
  const found = findMisclassified(rows, (t) => calls[t] ?? []);
  assert.deepEqual(found.map((m) => m.key), [`${fId}__R1`]);
  const withReclass = [...rows, reclassRow(found[0], 't1')];
  assert.equal(latestDone(withReclass).has(`${fId}__R1`), false, 'chưa chạy lại → chưa có quan sát');
  assert.deepEqual(findMisclassified(withReclass, (t) => calls[t] ?? []), [], 'đã có dòng sau → không ghi nữa');
  const rerun = [...withReclass, { id: fId, arm: 'R1', status: 'done', verdict: 'block', taskId: 'T-2', at: 't2' }];
  assert.equal(latestDone(rerun).get(`${fId}__R1`).verdict, 'block');
  const a = analyze({ ...d, rows: rerun });
  assert.deepEqual(a.sensitivity.reclassified.pairs, [`${fId}__R1`]);
  assert.equal(a.sensitivity.reclassified.byArm.R1, 1);
  assert.equal(a.primary.aOnly, 36, 'chính: lượt chạy lại (chặn)');
  assert.equal(a.sensitivity.reclassified.asRecorded.aOnly, 35, 'như đã ghi: unparsed = không chặn');
  assert.equal(a.sensitivity.reclassified.excluded.n, 35);
  assert.match(report(a), /phân loại lại và chạy lại \(1 cặp: R1 1\)/);
});
