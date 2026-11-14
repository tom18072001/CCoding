import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunRequest, RunResult } from '../src/types.js';
import { testApp } from './helpers.js';

// D21/K1: lượt hết giờ ≠ hết hạn mức. Runtime là giả (mock) — không gọi claude -p.

type App = ReturnType<typeof testApp>;
const TIMEOUT_MSG = 'Hết thời gian (1800s)';
const BRIEF_A = 'Viết tài liệu API nhỏ cho dịch vụ thanh toán';
const BRIEF_B = 'Viết hướng dẫn cài đặt ngắn cho dịch vụ báo cáo';

const timeoutRes = (): RunResult => ({
  text: '',
  error: TIMEOUT_MSG,
  errorKind: 'timeout',
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 },
  estimated: false,
  model: 'mock',
  runtime: 'mock',
  durationMs: 1800_000,
});
const quotaRes = (): RunResult => ({
  text: '',
  error: "You've hit your 5-hour limit · resets 1am (Asia/Bangkok)",
  errorKind: 'quota',
  retryAt: Date.now() + 3_600_000,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 },
  estimated: false,
  model: 'mock',
  runtime: 'mock',
  durationMs: 1,
});

/**
 * Ở pha execute, với nhiệm vụ mà `pick(taskId)` trả về, `plan(n)` quyết định kết quả của lần gọi thứ n (1-based) —
 * undefined = chạy mock thật. Trả về các lời nhắc đã thấy.
 */
function inject(a: App, pick: (taskId: string) => boolean, plan: (n: number) => RunResult | undefined) {
  const seen: Array<{ taskId: string; prompt: string; n: number }> = [];
  const counts = new Map<string, number>();
  const mock = a.runtimes.get('mock')!;
  const origRun = mock.run.bind(mock);
  mock.run = async (req: RunRequest, hooks) => {
    const taskId = req.meta?.taskId ?? '';
    if (req.phase === 'execute' && pick(taskId)) {
      const n = (counts.get(taskId) ?? 0) + 1;
      counts.set(taskId, n);
      seen.push({ taskId, prompt: req.prompt, n });
      const r = plan(n);
      if (r) return r;
    }
    return origRun(req, hooks);
  };
  return seen;
}

const subtasks = (t: { runs: Array<{ subtasks: Array<{ status: string }> }> }) => t.runs.flatMap((r) => r.subtasks);

test('a) nhiệm vụ A hết giờ hai lần ⇒ nhiệm vụ B vẫn chạy tới done, không có task.paused lý do quota, runtime không bị nghỉ', async () => {
  const a = testApp();
  try {
    const ta = a.orchestrator.submit({ brief: BRIEF_A, options: { discussionRounds: 0 } });
    const tb = a.orchestrator.submit({ brief: BRIEF_B, options: { discussionRounds: 0 } });
    const seen = inject(a, (id) => id === ta.id, () => timeoutRes());
    const [da, db] = await Promise.all([a.orchestrator.waitFor(ta.id), a.orchestrator.waitFor(tb.id)]);
    assert.equal(db.status, 'done', `B: ${db.status}`);
    assert.notEqual(da.status, 'paused', 'A không bị tạm dừng');
    assert.ok(seen.length >= 2, 'A được thử lại');
    assert.notEqual(da.pause?.reason, 'quota');
    assert.notEqual(db.pause?.reason, 'quota');
    assert.ok(![...a.runtimes.health.values()].some((h) => h.until), 'không runtime nào bị đánh dấu tạm ngừng');
  } finally {
    a.cleanup();
  }
});

test('b) hết giờ lần đầu rồi xong ⇒ hạng mục done, lời nhắc lần 2 nêu việc đã làm', async () => {
  const a = testApp();
  try {
    const seen = inject(a, () => true, (n) => (n === 1 ? timeoutRes() : undefined));
    const t = a.orchestrator.submit({ brief: BRIEF_A, options: { discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', `status=${done.status}`);
    assert.ok(subtasks(done).every((s) => s.status === 'done'), 'mọi hạng mục done');
    const first = seen.find((s) => s.n === 1)!;
    const second = seen.find((s) => s.n === 2);
    assert.ok(second, 'có lần thử 2');
    assert.ok(!/Lượt trước hết giờ/.test(first.prompt), 'lần 1 chưa có ghi chú');
    assert.match(second.prompt, /Lượt trước hết giờ/);
    assert.match(second.prompt, /Commit mới kể từ đầu lượt/);
    assert.match(second.prompt, /KHÔNG reset/);
  } finally {
    a.cleanup();
  }
});

test('c) hết giờ hai lần ⇒ hạng mục lỗi, runtime không bị đánh dấu, đúng 2 lượt cho một lời gọi', async () => {
  const a = testApp();
  try {
    const seen = inject(a, () => true, () => timeoutRes());
    const t = a.orchestrator.submit({ brief: BRIEF_A, options: { discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.notEqual(done.status, 'paused');
    assert.ok(subtasks(done).some((s) => s.status === 'failed'), 'có hạng mục failed');
    assert.ok(seen.length >= 2);
    assert.equal(seen.filter((s) => s.n <= 2).length, 2, 'lời gọi đầu: đúng 2 lượt (1 + 1 thử lại)');
    assert.ok([...a.runtimes.health.values()].every((h) => !h.until && h.kind !== 'timeout'), 'sức khỏe runtime không bị ghi lỗi hết giờ');
    assert.equal(a.runtimes.markFailure('mock', 'mock', 'timeout', TIMEOUT_MSG).until, undefined);
  } finally {
    a.cleanup();
  }
});

test('d) quota thật (429 + retryAt) vẫn tạm dừng nhiệm vụ như cũ', async () => {
  const a = testApp();
  try {
    inject(a, () => true, () => quotaRes());
    const t = a.orchestrator.submit({ brief: BRIEF_A, options: { discussionRounds: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'paused', `status=${done.status}`);
    assert.equal(done.pause?.reason, 'quota');
    assert.ok([...a.runtimes.health.values()].some((h) => h.kind === 'quota' && h.until), 'runtime/model bị đánh dấu nghỉ tới retryAt');
  } finally {
    a.cleanup();
  }
});

test('e) calls.jsonl có dòng stopReason "timeout" kèm durationMs và attempt', async () => {
  const a = testApp();
  try {
    inject(a, () => true, (n) => (n <= 2 ? timeoutRes() : undefined));
    const t = a.orchestrator.submit({ brief: BRIEF_A, options: { discussionRounds: 0 } });
    await a.orchestrator.waitFor(t.id);
    const rec = a.usage.all({ task: t.id }).filter((r) => r.stopReason === 'timeout');
    assert.ok(rec.length >= 2, `số dòng timeout: ${rec.length}`);
    assert.deepEqual(rec.map((r) => r.attempt).sort().slice(0, 2), [1, 2]);
    assert.ok(rec.every((r) => r.phase === 'execute' && typeof r.durationMs === 'number' && r.error));
  } finally {
    a.cleanup();
  }
});
