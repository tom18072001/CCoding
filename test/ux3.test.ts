import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createServer } from '../src/server.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTimeline } from '../src/timeline.js';
import { scanJsonl, type JsonlCache } from '../src/util/fsx.js';
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
  ev(100, 'task.start'),
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
  // đường găng theo lượt thực thi (lượt sửa của S3 không tính): S2 xong thực thi muộn nhất (70 s) ← S1
  assert.deepEqual(tl.critical.lanes, ['dev|S1', 'dev|S2']);
  assert.equal(tl.stats.maxParallel, 2, 'S2 và S3 chạy song song');
  assert.equal(tl.stats.pausedMs, 20_000);
  assert.deepEqual(tl.pauses, [{ start: T0 + 80_000, end: T0 + 100_000, reason: 'budget' }]);
  assert.ok(tl.phases.some((p) => p.phase === 'execute' && p.start === T0 + 10_000 && p.end === T0 + 70_000));
  // xong: lượt bị ngắt không còn "đang chạy"; đường găng S1 → S2 (S2 xong lúc 70 s, muộn hơn S3 lúc 60 s)
  const done = buildTimeline(task('done'), calls, [...events.filter((e) => e.kind !== 'call.start'), ev(120, 'task.done')], T0 + 999_000);
  assert.equal(done.live, false);
  assert.equal(done.end, T0 + 120_000);
  assert.deepEqual(done.critical.lanes, ['dev|S1', 'dev|S2']);
  assert.equal(done.critical.ms, 70_000 - 10_000);
  assert.ok(!done.lanes.some((l) => l.bars.some((b) => b.open)));
});

function oneSub(status: Task['status'], subs = [{ id: 'S1', dependsOn: [] as string[] }], dept = 'dev', extra: Partial<Task> = {}): Task {
  return {
    id: 'T-1',
    title: 'Thử',
    status,
    createdAt: at(0),
    startedAt: at(0),
    updatedAt: at(0),
    runs: [{ department: dept, status: 'running', subtasks: subs.map((s) => ({ ...s, title: s.id, assignee: 'backend-dev', status: 'running' })) }],
    ...extra,
  } as unknown as Task;
}

test('dòng thời gian: server khởi động lại giữa chừng — lượt dở thành "bị ngắt", khoảng chết tính là tạm dừng', () => {
  // c1 bắt đầu lúc 5 s rồi server dừng (store chỉ đánh dấu tạm dừng, không ghi nhật ký); 1 giờ sau bấm Tiếp tục
  const evs = [ev(0, 'task.start'), ev(0, 'phase', { department: 'dev', phase: 'execute' }), ev(5, 'call.start', { department: 'dev', subtaskId: 'S1', phase: 'execute', data: { callId: 'c1' } }), ev(3600, 'task.resumed'), ev(3600, 'task.start'), ev(3601, 'call.start', { department: 'dev', subtaskId: 'S1', phase: 'execute', data: { callId: 'c2' } })];
  const cs = [{ ts: at(3700), callId: 'c2', department: 'dev', subtaskId: 'S1', agentId: 'backend-dev', phase: 'execute' as const, durationMs: 99_000 }];
  const tl = buildTimeline(oneSub('running'), cs, evs, T0 + 3_700_000);
  const bars = tl.lanes.find((l) => l.key === 'dev|S1')!.bars;
  assert.equal(bars.length, 2);
  assert.deepEqual([bars[0].start, bars[0].end, bars[0].open, bars[0].error], [T0 + 5000, T0 + 5000, undefined, true], 'lượt của đợt trước bị ngắt, không kéo tới bây giờ');
  assert.equal(tl.stats.maxParallel, 1);
  assert.deepEqual(tl.pauses, [{ start: T0 + 5000, end: T0 + 3_600_000, reason: 'interrupted' }]);
  assert.ok(!tl.phases.some((p) => p.end > T0 + 5000 && p.start < T0 + 3_600_000), 'pha không kéo qua lúc server chết');
  // vẫn đang dừng sau khởi động lại (không có sự kiện nào): khoảng dừng tới bây giờ, biểu đồ kéo tới bây giờ
  const paused = buildTimeline(oneSub('paused', undefined, 'dev', { pause: { reason: 'interrupted', at: at(50) } } as Partial<Task>), [], evs.slice(0, 3), T0 + 100_000);
  assert.equal(paused.end, T0 + 100_000);
  assert.deepEqual(paused.pauses, [{ start: T0 + 5000, end: T0 + 100_000, reason: 'interrupted' }]);
  assert.equal(paused.stats.pausedMs, 95_000);
  // bản ghi bù "-lost1" (lỗi chậm rồi hết quota) cũng là lượt đã xong
  const lost = buildTimeline(oneSub('running'), [{ ts: at(20), callId: 'c9-lost1', department: 'dev', subtaskId: 'S1', phase: 'execute' as const, durationMs: 10_000, error: 'lỗi' }], [ev(0, 'task.start'), ev(10, 'call.start', { department: 'dev', subtaskId: 'S1', data: { callId: 'c9' } })], T0 + 60_000);
  assert.ok(!lost.lanes.some((l) => l.bars.some((b) => b.open)));
});

test('dòng thời gian: tạm dừng chờ duyệt — biểu đồ tính tới bây giờ; lỗi rồi chạy lại — khoảng chờ là tạm dừng', () => {
  const evs = [ev(0, 'task.start'), ev(0, 'phase', { department: 'dev', phase: 'plan' }), ev(1.1, 'task.paused', { msg: 'T-1 tạm dừng (plan): chờ duyệt' })];
  const cs = [{ ts: at(1), callId: 'c1', department: 'dev', agentId: 'dev-lead', phase: 'plan' as const, durationMs: 1000 }];
  const tl = buildTimeline(oneSub('paused'), cs, evs, T0 + 21_900);
  assert.equal(tl.end, T0 + 21_900, 'trục kéo tới bây giờ để vạch tạm dừng không tràn khung');
  assert.deepEqual(tl.pauses, [{ start: T0 + 1100, end: T0 + 21_900, reason: 'plan' }]);
  assert.equal(tl.stats.pausedMs, 20_800);
  const failed = [ev(0, 'task.start'), ev(50, 'task.failed', { level: 'warn' }), ev(80, 'task.resumed'), ev(80, 'task.start')];
  assert.deepEqual(buildTimeline(oneSub('running'), [], failed, T0 + 90_000).pauses, [{ start: T0 + 50_000, end: T0 + 80_000, reason: 'failed' }]);
});

test('dòng thời gian: pha của phòng trước khép khi phòng sau bắt đầu; mốc gộp theo phòng ghi trong nhật ký', () => {
  const t = {
    ...oneSub('done'),
    finishedAt: at(200),
    runs: [
      { department: 'research', status: 'done', subtasks: [{ id: 'S1', title: 'Tìm', assignee: 'researcher', dependsOn: [], status: 'done' }] },
      { department: 'dev', status: 'done', subtasks: [{ id: 'S1', title: 'Làm', assignee: 'backend-dev', dependsOn: [], status: 'done' }, { id: 'S2', title: 'Làm 2', assignee: 'backend-dev', dependsOn: [], status: 'done' }] },
    ],
  } as unknown as Task;
  const evs = [ev(0, 'task.start'), ev(20, 'phase', { department: 'research', phase: 'synthesize' }), ev(30, 'phase', { department: 'dev', phase: 'plan' }), ev(60, 'workspace.merge', { department: 'dev', subtaskId: 'S2' }), ev(200, 'task.done')];
  const tl = buildTimeline(t, [], evs, T0 + 999_000);
  const syn = tl.phases.find((p) => p.department === 'research' && p.phase === 'synthesize')!;
  assert.equal(syn.end, T0 + 30_000, 'tổng hợp của phòng nghiên cứu không kéo suốt phần của phòng dev');
  assert.deepEqual(tl.lanes.find((l) => l.key === 'dev|S2')!.merges, [T0 + 60_000]);
  assert.ok(!tl.lanes.some((l) => l.title.includes('không còn trong kế hoạch')));
});

test('dòng thời gian: đường găng và lúc sẵn sàng chỉ theo lượt thực thi (lượt sửa sau review không tính)', () => {
  const t = oneSub('done', [{ id: 'S1', dependsOn: [] }, { id: 'S2', dependsOn: ['S1'] }]);
  const row = (id: string, sub: string, s: number, e: number, phase: 'execute' | 'revise') => ({ ts: at(e), callId: id, department: 'dev', subtaskId: sub, agentId: 'backend-dev', phase, durationMs: (e - s) * 1000 });
  const tl = buildTimeline(t, [row('a', 'S1', 0, 10, 'execute'), row('b', 'S2', 10, 30, 'execute'), row('c', 'S1', 40, 45, 'revise')], [ev(0, 'task.start'), ev(50, 'task.done')], T0 + 999_000);
  assert.deepEqual(tl.critical.lanes, ['dev|S1', 'dev|S2']);
  assert.equal(tl.critical.ms, 30_000);
  assert.equal(tl.lanes.find((l) => l.key === 'dev|S2')!.readyAt, T0 + 10_000);
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

test('scanJsonl: đọc theo dòng, chỉ phần ghi thêm, bỏ dòng đang ghi dở, dòng rất dài, file bị thay', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-scan-'));
  try {
    const f = path.join(dir, 'calls.jsonl');
    const big = 'x'.repeat(3 * 1024 * 1024); // dài hơn khối đọc 1 MB
    fs.writeFileSync(f, `${JSON.stringify({ n: 1, raw: big })}\n{hỏng\n${JSON.stringify({ n: 2 })}\n{"n":3`);
    const cache: JsonlCache<number> = new Map();
    let parsed = 0;
    const pick = (o: Record<string, unknown>) => (parsed++, Number(o.n));
    assert.deepEqual(scanJsonl(f, pick, cache), [1, 2], 'dòng cuối chưa xuống dòng để lần sau');
    fs.appendFileSync(f, `}\n${JSON.stringify({ n: 4 })}\n`);
    parsed = 0;
    assert.deepEqual(scanJsonl(f, pick, cache), [1, 2, 3, 4]);
    assert.equal(parsed, 2, 'lần sau chỉ đọc phần mới');
    parsed = 0;
    assert.deepEqual(scanJsonl(f, pick, cache), [1, 2, 3, 4]);
    assert.equal(parsed, 0, 'không đổi thì không đọc lại');
    fs.writeFileSync(f, `${JSON.stringify({ n: 9 })}\n`);
    assert.deepEqual(scanJsonl(f, pick, cache), [9], 'file bị thay (nhỏ hơn) → đọc lại từ đầu');
    assert.deepEqual(scanJsonl(path.join(dir, 'khong-co.jsonl'), pick, cache), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
