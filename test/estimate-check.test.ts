// FX12 (S4): checkEstimate — kế hoạch có ước lượng > ngân sách thì ghi budget.estimate; chế độ pause dừng TRƯỚC khi thực thi.
// Dùng runtime mock làm planner (không gọi LLM thật), dữ liệu tổng hợp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

function app() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-est-'));
  const base = loadConfig();
  const a = createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'mock', order: ['mock'] },
    runtimes: { ...base.runtimes, mock: { minDelayMs: 1, maxDelayMs: 5, reviewRejectRate: 0 } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
    tools: { ...base.tools, repoMap: false },
  });
  return Object.assign(a, { cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) });
}

const BRIEF: Record<string, string> = {
  dev: 'Thiết kế API Node.js/TypeScript ghi log kiểm toán vào Elasticsearch qua Logstash, có test và tài liệu',
  research: 'Tổng quan tài liệu về phát hiện bất thường trong log, thiết kế phương pháp và viết bản thảo',
};

for (const lane of ['full', 'fast'] as const) {
  for (const department of ['dev', 'research'] as const) {
    test(`checkEstimate (${department}, làn ${lane}): ước lượng > ngân sách ⇒ budget.estimate + dừng trước thực thi (pause)`, { timeout: 120_000 }, async () => {
      const a = app();
      try {
        const t = a.orchestrator.submit({ brief: BRIEF[department], mode: 'department', department, options: { lane, budgetTokens: 50_000, budgetMode: 'pause', discussionRounds: 0 } });
        const p = await a.orchestrator.waitFor(t.id);
        assert.equal(p.status, 'paused', p.error);
        assert.equal(p.pause?.reason, 'budget');
        assert.match(p.pause?.detail ?? '', /ước tính/);
        const run = p.runs[0];
        assert.ok((run.estimate?.tokens ?? 0) > (run.estimate?.budget ?? 0), 'ước lượng lớn hơn phần ngân sách còn lại');
        assert.ok(a.logs.query({ task: t.id, limit: 500 }).some((e) => e.kind === 'budget.estimate'), 'có log budget.estimate');
        assert.ok(a.orchestrator.alerts.some((x) => x.kind === 'budget.estimate' && x.taskId === t.id));
        // dừng trước khi thực thi: không hạng mục nào chạy, không lượt execute nào được ghi
        assert.ok(run.subtasks.length >= 1);
        assert.ok(run.subtasks.every((s) => !s.attempts), 'chưa hạng mục nào được chạy');
        assert.equal(a.usage.summary('phase', { task: t.id }).some((r) => r.key === 'execute'), false);
      } finally {
        a.cleanup();
      }
    });
  }
}

test('checkEstimate: ngân sách đủ lớn ⇒ không có budget.estimate; chế độ complete chỉ cảnh báo, không dừng', { timeout: 120_000 }, async () => {
  const a = app();
  try {
    const big = a.orchestrator.submit({ brief: BRIEF.dev, mode: 'department', department: 'dev', options: { budgetTokens: 500_000_000, budgetMode: 'pause', discussionRounds: 0, review: false } });
    const d = await a.orchestrator.waitFor(big.id);
    assert.equal(d.status, 'done', d.error ?? d.pause?.detail);
    assert.equal(a.logs.query({ task: big.id, limit: 500 }).some((e) => e.kind === 'budget.estimate'), false);

    const warn = a.orchestrator.submit({ brief: BRIEF.dev, mode: 'department', department: 'dev', options: { budgetTokens: 50_000, budgetMode: 'complete', discussionRounds: 0, review: false } });
    await a.orchestrator.waitFor(warn.id);
    assert.ok(a.logs.query({ task: warn.id, limit: 500 }).some((e) => e.kind === 'budget.estimate'), 'complete vẫn ghi cảnh báo ước lượng');
  } finally {
    a.cleanup();
  }
});

test('estimatePlan: gói nghiên cứu — hạng mục có công cụ tra cứu được cộng phần web', { timeout: 60_000 }, () => {
  const a = app();
  try {
    const e = a.config.estimate;
    assert.ok(e.web > 0, 'có hằng số cộng thêm cho tra cứu web');
    assert.ok(e.perSubtask.write >= e.perSubtask.read && e.perSubtask.read > e.perSubtask.none);
  } finally {
    a.cleanup();
  }
});

// D18d K1: đối chiếu với số thật của 5 gói Nghiên cứu (chỉ dùng số, fixture tổng hợp; xem docs/diagnostics/estimate-research.md)
function fixture(a: ReturnType<typeof app>, assignees: string[], runtime: string) {
  const task = { id: 'T-fx', classification: 'internal', options: { runtime, review: true, maxRevisions: 1 } } as never;
  const run = { department: 'research', subtasks: assignees.map((assignee, i) => ({ id: `S${i + 1}`, title: 'x', assignee, status: 'pending', attempts: 0 })) } as never;
  return { task, run, est: () => a.orchestrator.estimatePlanDetail(task, run) };
}
const within15 = (est: number, actual: number) => est >= actual / 1.5 && est <= actual * 1.5;

test('estimatePlan (hằng số, claude-cli): BRIEF-19 — 6 hạng mục, thật 14.611.271 ⇒ ước lượng trong ±1,5 lần', () => {
  const a = app();
  try {
    a.config.estimate.historyDays = 0;
    const f = fixture(a, Array(6).fill('methodologist'), 'claude-cli');
    const est = f.est().total;
    assert.ok(within15(est, 14_611_271), `ước lượng ${est}`);
    // runtime không cache (mock) giữ nguyên hằng số gốc
    const m = fixture(a, Array(6).fill('methodologist'), 'mock').est().total;
    assert.ok(est > 3 * m, 'claude-cli lớn hơn rõ so với mock');
  } finally {
    a.cleanup();
  }
});

test('estimatePlan (lịch sử): BRIEF-20 — @data-scientist ~5,80M ×2, @methodologist ~513,8k ×4, thật 15.302.113 ⇒ trong ±1,5 lần; lịch sử không nhân hệ số', () => {
  const a = app();
  try {
    const mk = (id: string, assignee: string, tokens: number) => ({ id, status: 'done', attempts: 1, assignee, finishedAt: new Date().toISOString(), usage: { input: 0, output: 0, cacheRead: tokens, cacheWrite: 0 } });
    const hist = [...Array(2).fill(0).map((_, i) => mk(`h${i}`, 'data-scientist', 5_800_000)), ...Array(3).fill(0).map((_, i) => mk(`m${i}`, 'methodologist', 513_800))];
    a.store.put({ id: 'T-hist', title: 'h', status: 'done', options: { runtime: 'claude-cli' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), runs: [{ department: 'research', subtasks: hist }] } as never, true);
    const f = fixture(a, ['data-scientist', 'data-scientist', ...Array(4).fill('methodologist')], 'claude-cli');
    const d = f.est();
    assert.equal(d.work, 2 * 5_800_000 + 4 * 513_800, 'phần hạng mục lấy đúng trung vị lịch sử, không nhân hệ số');
    assert.ok(within15(d.total, 15_302_113), `ước lượng ${d.total}`);
  } finally {
    a.cleanup();
  }
});

test('budgetMode complete: ước lượng vượt ngân sách chỉ cảnh báo (budget.estimate), nhiệm vụ không dừng', { timeout: 120_000 }, async () => {
  const a = app();
  try {
    const t = a.orchestrator.submit({ brief: BRIEF.research, mode: 'department', department: 'research', options: { budgetTokens: 50_000, budgetMode: 'complete', discussionRounds: 0, review: false } });
    const p = await a.orchestrator.waitFor(t.id);
    assert.notEqual(p.pause?.reason, 'budget', 'không dừng vì ước lượng');
    const run = p.runs[0];
    assert.ok((run.estimate?.tokens ?? 0) > (run.estimate?.budget ?? 0));
    assert.ok(a.logs.query({ task: t.id, limit: 500 }).some((e) => e.kind === 'budget.estimate'));
  } finally {
    a.cleanup();
  }
});
