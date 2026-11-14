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
