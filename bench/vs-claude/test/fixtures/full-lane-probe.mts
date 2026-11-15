// Chạy bằng: node --import tsx full-lane-probe.mts '<json options>' — in ra một dòng JSON {status, lane, subtasks, assignees, discussion}.
// Runtime giả (mock), không gọi `claude -p`. Dùng bởi arms-full-lane.test.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../../../src/app.js';
import { loadConfig } from '../../../../src/config.js';

const options = JSON.parse(process.argv[2] ?? '{}');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-armfull-'));
const base = loadConfig();
const a = createApp({
  dataDir,
  workspacesDir: path.join(dataDir, 'workspaces'),
  runner: 'process',
  runtime: { ...base.runtime, default: 'mock', order: ['mock'] },
  runtimes: { ...base.runtimes, mock: { minDelayMs: 1, maxDelayMs: 5, reviewRejectRate: 0 } },
  herdr: { ...base.herdr, notify: false, agentPanes: false },
});
try {
  const t = a.orchestrator.submit({ brief: 'Thiết kế API Node.js/TypeScript ghi log kiểm toán vào Elasticsearch qua Logstash', mode: 'department', department: 'dev', options });
  const done = await a.orchestrator.waitFor(t.id);
  const run = done.runs[done.runs.length - 1];
  const subtasks = run?.subtasks ?? [];
  const msgs = a.store.transcript(t.id);
  console.log(JSON.stringify({
    status: done.status, error: done.error ?? null, lane: done.lane ?? null,
    subtasks: subtasks.length, assignees: new Set(subtasks.map((s: { assignee: string }) => s.assignee)).size,
    discussion: msgs.filter((m) => m.kind === 'discussion').length,
  }));
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
