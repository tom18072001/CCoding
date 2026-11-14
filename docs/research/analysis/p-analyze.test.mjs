// Test bằng dữ liệu giả cho p-analyze.mjs (V4-3f-P).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unionMs, maxConcurrent, criticalPathMs, runRows, summarize, report } from './p-analyze.mjs';

const T = (m) => new Date(Date.UTC(2026, 10, 4, 0, m)).toISOString();
test('unionMs / maxConcurrent', () => {
  assert.equal(unionMs([[0, 10], [5, 15], [20, 30]]), 25);
  assert.equal(maxConcurrent([[0, 10], [5, 15], [20, 30]]), 2);
  assert.equal(maxConcurrent([[0, 10], [10, 20]]), 1, 'nối đuôi không tính là chồng');
});
test('criticalPathMs theo phụ thuộc', () => {
  const subs = [{ id: 'S1', startedAt: T(0), finishedAt: T(10), dependsOn: [] }, { id: 'S2', startedAt: T(0), finishedAt: T(4), dependsOn: [] }, { id: 'S3', startedAt: T(10), finishedAt: T(13), dependsOn: ['S1', 'S2'] }];
  assert.equal(criticalPathMs(subs), 13 * 60000);
});
test('runRows + summarize: lượt song song và lượt lần lượt', () => {
  const sub = (id, a, b, deps = []) => ({ id, status: 'done', startedAt: T(a), finishedAt: T(b), dependsOn: deps, conflict: null, mainOnly: false, mergePending: false });
  const data = { rows: [
    { task: 'x', project: 'P1', isolation: 'worktree', status: 'done', msg: { merged: 3, conflict: 1, serial: 0 }, checksLatest: { n: 1, red: 0 }, runs: [{ status: 'done', department: 'dev', subtasks: [sub('S1', 0, 10), sub('S2', 0, 10), sub('S3', 0, 10)] }] },
    { task: 'y', project: 'P2', isolation: 'none', status: 'done', msg: { merged: 0, conflict: 0, serial: 1 }, checksLatest: null, runs: [{ status: 'done', department: 'dev', subtasks: [sub('S1', 0, 10), sub('S2', 10, 20)] }] },
  ] };
  const rows = runRows(data);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].overlap, 3); assert.equal(rows[0].maxConc, 3); assert.equal(rows[0].savedMin, 20);
  assert.equal(rows[1].overlap, 1); assert.equal(rows[1].maxConc, 1);
  const s = summarize(rows);
  assert.equal(s.all.parallelRuns, 1); assert.equal(s.all.merges, 3); assert.equal(s.all.serialMsgs, 1);
  assert.equal(s.byIsolation.worktree.runs, 1);
});

test('independentPairs tính phụ thuộc bắc cầu: chuỗi S1→S2→S3 không có cặp độc lập', () => {
  const sub = (id, a, b, deps = []) => ({ id, status: 'done', startedAt: T(a), finishedAt: T(b), dependsOn: deps, conflict: null, mainOnly: false, mergePending: false });
  const data = { rows: [{ task: 'z', project: 'P1', isolation: 'worktree', status: 'done', msg: { merged: 0, conflict: 0, serial: 0 }, checksLatest: null, runs: [{ status: 'done', department: 'dev', subtasks: [sub('S1', 0, 5), sub('S2', 5, 10, ['S1']), sub('S3', 10, 15, ['S2'])] }] }] };
  assert.equal(runRows(data)[0].independentPairs, false);
});

test('D-P1: lệnh đỏ lúc kết thúc đếm theo nhiệm vụ, không theo lượt phòng; CP và theo phòng có trong báo cáo', () => {
  const sub = (id, a, b, deps = []) => ({ id, status: 'done', startedAt: T(a), finishedAt: T(b), dependsOn: deps, conflict: null, mainOnly: false, mergePending: false });
  const run = (dept) => ({ status: 'done', department: dept, subtasks: [sub('S1', 0, 10), sub('S2', 0, 10)] });
  const t = (task, runs, red, newRed) => ({ task, project: 'P1', isolation: 'worktree', status: 'done', msg: { merged: 2, conflict: 1, serial: 0 }, checksLatest: { n: 2, red }, checksBaseline: { n: 2, red: 0 }, checksNewRed: newRed, checksDenied: 0, runs });
  // nhiệm vụ 'a' có hai lượt phòng và 1 lệnh đỏ mới; nhiệm vụ 'b' một lượt, xanh
  const data = { extractedAt: 'x', tasks: 2, projects: 1, rows: [t('a', [run('dev'), run('research')], 1, 1), t('b', [run('dev')], 0, 0)] };
  const rows = runRows(data);
  assert.equal(rows.length, 3);
  const s = summarize(rows);
  assert.equal(s.all.runs, 3); assert.equal(s.all.tasks, 2);
  assert.deepEqual([s.all.endRed, s.all.endChecked, s.all.endNewRed], [1, 2, 1], 'trước khi sửa: 2/3/2 (đếm theo lượt)');
  assert.deepEqual(Object.keys(s.byDept).sort(), ['dev', 'research']);
  assert.equal(s.byDept.dev.runs, 2);
  assert.equal(s.all.parSpanMin, 30); assert.equal(s.all.parCritMin, 30);
  const text = report(s, data);
  assert.match(text, /CP 95 %/);
  assert.match(text, /phòng = dev/);
  assert.match(text, /đường găng/);
});
