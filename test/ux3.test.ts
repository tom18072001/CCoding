import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createServer } from '../src/server.js';
import { buildTimeline } from '../src/timeline.js';
import type { LogEntry, Task } from '../src/types.js';
import { testApp } from './helpers.js';

// UX-3: dòng thời gian (Gantt) dựng từ calls.jsonl + nhật ký nhiệm vụ.

const T0 = Date.parse('2026-11-01T10:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const ev = (s: number, kind: string, extra: Partial<LogEntry> = {}): LogEntry => ({ ts: at(s), level: 'info', kind, msg: kind, taskId: 'T-1', ...extra }) as LogEntry;

function task(status: Task['status']): Task {
  return {
    id: 'T-1',
    title: 'Thử',
    status,
    createdAt: at(0),
    startedAt: at(0),
    updatedAt: at(100),
    finishedAt: status === 'done' ? at(120) : undefined,
    runs: [
      {
        department: 'dev',
        status: 'done',
        subtasks: [
          { id: 'S1', title: 'Nền', assignee: 'backend-dev', dependsOn: [], status: 'done' },
          { id: 'S2', title: 'API', assignee: 'backend-dev', dependsOn: ['S1'], status: 'done' },
          { id: 'S3', title: 'Giao diện', assignee: 'frontend-dev', dependsOn: ['S1'], status: status === 'done' ? 'done' : 'running' },
        ],
      },
    ],
  } as unknown as Task;
}

const calls = [
  { ts: at(10), callId: 'c1', department: 'dev', agentId: 'dev-lead', phase: 'plan' as const, durationMs: 10_000 },
  { ts: at(40), callId: 'c2', department: 'dev', subtaskId: 'S1', agentId: 'backend-dev', phase: 'execute' as const, durationMs: 30_000 },
  { ts: at(70), callId: 'c3', department: 'dev', subtaskId: 'S2', agentId: 'backend-dev', phase: 'execute' as const, durationMs: 25_000 },
  { ts: at(60), callId: 'c4', department: 'dev', subtaskId: 'S3', agentId: 'frontend-dev', phase: 'execute' as const, durationMs: 18_000, error: 'lỗi' },
];
const events = [
  ev(0, 'task.start'),
  ev(0, 'phase', { department: 'dev', phase: 'plan' }),
  ev(10, 'phase', { department: 'dev', phase: 'execute' }),
  ev(12, 'checks.run', { department: 'dev', data: { when: 'baseline', setupMs: 1000, results: [{ ok: true, ms: 1500 }, { ok: true, ms: 500 }] } }),
  ev(41, 'workspace.merge', { department: 'dev', subtaskId: 'S1' }),
  ev(70, 'phase', { department: 'dev', phase: 'review' }),
  ev(80, 'task.paused', { msg: 'T-1 tạm dừng (budget): hết' }),
  ev(100, 'task.resumed'),
  ev(105, 'call.start', { department: 'dev', subtaskId: 'S3', agentId: 'frontend-dev', phase: 'revise', data: { callId: 'c5' } }),
];

test('dòng thời gian: thanh theo lượt gọi, lệnh kiểm tra, tạm dừng, gộp, chờ, đường găng, lượt đang chạy', () => {
  const tl = buildTimeline(task('running'), calls, events, T0 + 110_000);
  assert.equal(tl.live, true);
  assert.equal(tl.start, T0);
  assert.equal(tl.end, T0 + 110_000);
  const lane = (k: string) => tl.lanes.find((l) => l.key === k)!;
  assert.equal(tl.lanes[0].key, 'dev|_', 'làn điều phối của phòng lên đầu');
  assert.deepEqual(lane('dev|_').bars.map((b) => [b.phase, (b.start - T0) / 1000, (b.end - T0) / 1000]), [
    ['plan', 0, 10],
    ['setup', 9, 10],
    ['checks', 10, 12],
  ]);
  assert.equal(lane('dev|S2').readyAt, T0 + 40_000, 'S2 sẵn sàng khi S1 xong');
  assert.deepEqual(lane('dev|S1').merges, [T0 + 41_000]);
  const s3 = lane('dev|S3').bars;
  assert.equal(s3[0].error, true);
  assert.equal(s3.at(-1)!.open, true, 'lượt đã bắt đầu chưa xong = đang chạy');
  assert.equal(s3.at(-1)!.phase, 'revise');
  assert.equal(s3.at(-1)!.end, T0 + 110_000);
  // đường găng: hạng mục xong muộn nhất (S3 đang chạy tới 110 s) ← S1
  assert.deepEqual(tl.critical.lanes, ['dev|S1', 'dev|S3']);
  assert.equal(tl.stats.maxParallel, 2, 'S2 và S3 chạy song song');
  assert.equal(tl.stats.pausedMs, 20_000);
  assert.deepEqual(tl.pauses, [{ start: T0 + 80_000, end: T0 + 100_000, reason: 'budget' }]);
  assert.ok(tl.phases.some((p) => p.phase === 'execute' && p.start === T0 + 10_000 && p.end === T0 + 70_000));
  // xong: lượt bị ngắt không còn "đang chạy"; đường găng S1 → S2 (S2 xong lúc 70 s, muộn hơn S3 lúc 60 s)
  const done = buildTimeline(task('done'), calls, events.filter((e) => e.kind !== 'call.start'), T0 + 999_000);
  assert.equal(done.live, false);
  assert.equal(done.end, T0 + 120_000);
  assert.deepEqual(done.critical.lanes, ['dev|S1', 'dev|S2']);
  assert.equal(done.critical.ms, 70_000 - 10_000);
  assert.ok(!done.lanes.some((l) => l.bars.some((b) => b.open)));
});

test('API dòng thời gian của nhiệm vụ chạy thật (runtime mock)', async () => {
  const app = testApp();
  const s0 = createServer(app);
  await new Promise<void>((r) => s0.listen(0, '127.0.0.1', r));
  const port = (s0.address() as AddressInfo).port;
  s0.close();
  app.config.server.port = port;
  const srv = createServer(app);
  await new Promise<void>((r) => srv.listen(port, '127.0.0.1', r));
  try {
    const t = app.orchestrator.submit({ brief: 'Thiết kế API quản lý hồ sơ, có phân quyền, log kiểm toán, test và tài liệu', mode: 'department', department: 'dev', options: { discussionRounds: 1 } });
    const d = await app.orchestrator.waitFor(t.id);
    assert.equal(d.status, 'done', d.error);
    const r = await fetch(`http://127.0.0.1:${port}/api/tasks/${t.id}/timeline`);
    assert.equal(r.status, 200);
    const tl = (await r.json()) as ReturnType<typeof buildTimeline>;
    assert.equal(tl.live, false);
    const subs = tl.lanes.filter((l) => l.subtask);
    assert.equal(subs.length, d.runs[0].subtasks.length);
    assert.ok(subs.every((l) => l.bars.some((b) => b.phase === 'execute')), 'mỗi hạng mục có thanh thực thi');
    assert.ok(tl.lanes.some((l) => !l.subtask && l.bars.some((b) => b.phase === 'plan')));
    assert.ok(tl.phases.some((p) => p.phase === 'discuss'), 'có pha họp');
    assert.ok(tl.critical.lanes.length >= 1);
    assert.equal(tl.stats.calls, d.usage.calls);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/tasks/KHONG-CO/timeline`)).status, 404);
  } finally {
    srv.close();
    app.cleanup();
  }
});
