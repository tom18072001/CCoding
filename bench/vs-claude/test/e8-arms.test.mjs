// E8 (§9 V4-3f bản chốt) và D14 K4: arm B6w4/B6w1 (worktree, làn nhanh ép), server thứ hai cho B6w1, thời gian theo mốc nhiệm vụ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCcoding, taskTimes } from '../lib/ccoding.mjs';
import { checkArms } from '../lib/queue.mjs';

const SUITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARMS = JSON.parse(fs.readFileSync(path.join(SUITE, 'arms.json'), 'utf8'));
const RUN = path.join(SUITE, 'run.mjs');

test('arms.json: B6w4 và B6w1 chỉ khác số hạng mục chạy cùng lúc', () => {
  assert.deepEqual(ARMS.B6w4, { kind: 'ccoding', options: { lane: 'fast' }, isolation: 'worktree', label: 'CCoding làn nhanh, worktree, fastLane.maxParallel 4 (E8)' });
  assert.deepEqual(ARMS.B6w1, { kind: 'ccoding', options: { lane: 'fast', maxParallel: 1 }, isolation: 'worktree', server: 'alt', label: 'CCoding làn nhanh, worktree, lần lượt: server riêng có fastLane.maxParallel 1 (E8)' });
  assert.deepEqual(checkArms(['B6w4', 'B6w1'], ARMS, ['single', 'fast', 'full']), []);
  // B6 cũ không đổi (các đợt trước so được)
  assert.deepEqual(ARMS.B6, { kind: 'ccoding', options: { lane: 'fast' }, label: 'CCoding làn nhanh' });
});

test('taskTimes: thời gian theo mốc của nhiệm vụ; thiếu mốc → null', () => {
  assert.deepEqual(taskTimes({ createdAt: '2026-11-05T00:00:00.000Z', startedAt: '2026-11-05T00:00:02.000Z', finishedAt: '2026-11-05T00:01:05.500Z' }), { wallSecTask: 63.5, queueSecTask: 2, subtasksTimed: 0, maxConcSubtasks: 0 });
  assert.deepEqual(taskTimes({ startedAt: '2026-11-05T00:00:02.000Z' }), { wallSecTask: null, queueSecTask: null, subtasksTimed: 0, maxConcSubtasks: 0 });
  assert.deepEqual(taskTimes(undefined), { wallSecTask: null, queueSecTask: null, subtasksTimed: 0, maxConcSubtasks: 0 });
  const st = (a, b) => ({ startedAt: `2026-11-05T00:00:${a}.000Z`, finishedAt: `2026-11-05T00:00:${b}.000Z` });
  assert.equal(taskTimes({ runs: [{ subtasks: [st('01', '10'), st('05', '20'), st('20', '30')] }] }).maxConcSubtasks, 2, 'chồng 05–10; nối đuôi ở 20 không tính chồng');
  assert.equal(taskTimes({ runs: [{ subtasks: [st('01', '10'), st('10', '20'), { startedAt: 'x' }] }] }).maxConcSubtasks, 1);
  assert.equal(taskTimes({ runs: [{ subtasks: [st('01', '10'), st('10', '20')] }] }).subtasksTimed, 2);
  assert.equal(taskTimes({ startedAt: '2026-11-05T00:00:09.000Z', finishedAt: '2026-11-05T00:00:02.000Z' }).wallSecTask, null, 'mốc ngược → null');
});

test('runCcoding ghi wallSecTask từ nhiệm vụ cuối, vẫn giữ wallSec cũ', async () => {
  const task = { id: 'T-1', status: 'done', createdAt: '2026-11-05T00:00:00.000Z', startedAt: '2026-11-05T00:00:02.000Z', finishedAt: '2026-11-05T00:01:05.500Z', runs: [] };
  const srv = http.createServer((req, res) => {
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'POST' && req.url === '/api/projects') return send(200, { ok: true });
    if (req.method === 'POST' && req.url === '/api/tasks') return send(200, task);
    if (req.method === 'GET' && req.url === '/api/tasks/T-1') return send(200, { task, usage: [] });
    return send(404, { error: 'không có' });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e8-'));
    const r = await runCcoding({ baseUrl: `http://127.0.0.1:${srv.address().port}`, dataDir: dir, runtime: 'mock', projectId: 'p', workdir: dir, brief: 'b', title: 't', timeoutMin: 1 });
    assert.equal(r.status, 'done');
    assert.equal(r.research.wallSecTask, 63.5);
    assert.equal(r.research.queueSecTask, 2);
    assert.equal(typeof r.wallSec, 'number');
  } finally { srv.close(); }
});

test('run.mjs: arm server "alt" cần --ccoding-url-alt và --ccoding-data-alt, và server đó phải chạy', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'e8-run-'));
  const base = [RUN, '--arms', 'B6w1', '--tasks', 't1-duration', '--repeats', '1', '--out', out, '--claude-bin', process.execPath];
  const a = spawnSync(process.execPath, base, { encoding: 'utf8', timeout: 60_000 });
  assert.equal(a.status, 2);
  assert.match(a.stderr, /--ccoding-url-alt và --ccoding-data-alt/);
  const b = spawnSync(process.execPath, [...base, '--ccoding-url-alt', 'http://127.0.0.1:9', '--ccoding-data-alt', out], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(b.status, 2);
  assert.match(b.stderr, /server \(alt\) không truy cập được/);
  const d = spawnSync(process.execPath, [RUN, '--arms', 'A0-sonnet,B6w4,B6w1', '--tasks', 'l1-modules,t2-orders,t3-api', '--repeats', '6', '--dry-run', '--out', out], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(d.status, 0, d.stderr);
  assert.match(d.stdout, /^54 runs/);
});

test('e8/analyze: Δ ln theo bài, hoán vị trong bài, kiểm B6w1 không chạy chồng', async () => {
  const { analyze, deltaLn, permP } = await import('../e8/analyze.mjs');
  const rows = [];
  for (const task of ['l1', 't2', 't3']) for (let r = 0; r < 6; r++) {
    rows.push({ task, arm: 'B6w4', status: 'done', wallSecTask: 100 * (1 + r / 50), wallSec: 110, tokens: { weighted: 1000 }, maxConcSubtasks: 3 });
    rows.push({ task, arm: 'B6w1', status: 'done', wallSecTask: 200 * (1 + r / 50), wallSec: 210, tokens: { weighted: 1000 }, maxConcSubtasks: 1 });
  }
  rows.push({ task: 'l1', arm: 'B6w1', status: 'infra' }, { task: 'l1', arm: 'A0-sonnet', status: 'done', wallSecTask: 5 });
  const a = analyze(rows, { M: 2000, B: 500 });
  assert.ok(Math.abs(a.wallSecTask.ratio - 0.5) < 1e-9);
  assert.ok(a.wallSecTask.p < 0.01);
  assert.ok(a.wallSecTask.ci[0] <= 0.5 && a.wallSecTask.ci[1] >= 0.5);
  assert.ok(Math.abs(a['tokens.weighted'].ratio - 1) < 1e-9);
  assert.deepEqual(a.wallSecTask.n, { l1: [6, 6], t2: [6, 6], t3: [6, 6] });
  assert.deepEqual(a.configCheck, { b6w1Runs: 18, b6w1Overlapping: 0 });
  assert.equal(a.overlapB6w4, 18);
  assert.ok(Number.isNaN(deltaLn({})));
  const same = { x: { a: [1, 2, 3], b: [1, 2, 3] } };
  assert.ok(permP(same, { M: 500 }) > 0.5);
});
