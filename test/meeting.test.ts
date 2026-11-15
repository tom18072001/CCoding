import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

function app(phases: Record<string, unknown> = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-meeting-'));
  const base = loadConfig();
  const a = createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'mock', order: ['mock'] },
    runtimes: { ...base.runtimes, mock: { minDelayMs: 1, maxDelayMs: 5, reviewRejectRate: 0 } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
    phases: { ...base.phases, ...phases },
  });
  return Object.assign(a, { cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true }) });
}

const BRIEF = 'Thiết kế API Node.js/TypeScript ghi log kiểm toán vào Elasticsearch qua Logstash';

test('họp song song: mỗi người phát biểu đúng một lần mỗi vòng, rồi trưởng phòng chốt', async () => {
  const a = app();
  try {
    const t = a.orchestrator.submit({ brief: BRIEF, mode: 'department', department: 'dev', options: { discussionRounds: 2 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    const msgs = a.store.transcript(t.id);
    const disc = msgs.filter((m) => m.kind === 'discussion');
    assert.ok(disc.length >= 4, `có phát biểu (${disc.length})`);
    for (const r of [1, 2]) {
      const speakers = disc.filter((m) => (m as { round?: number }).round === r).map((m) => m.from);
      assert.equal(new Set(speakers).size, speakers.length, `vòng ${r}: không ai phát biểu hai lần`);
    }
    const iDecision = msgs.findIndex((m) => m.kind === 'decision');
    const iLastDisc = msgs.map((m) => m.kind).lastIndexOf('discussion');
    assert.ok(iDecision > iLastDisc, 'chốt kế hoạch sau khi họp xong');
  } finally {
    a.cleanup();
  }
});

test('họp lần lượt khi tắt parallelDiscuss vẫn chạy như cũ', async () => {
  const a = app({ parallelDiscuss: false });
  try {
    const t = a.orchestrator.submit({ brief: BRIEF, mode: 'department', department: 'dev' });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.ok(a.store.transcript(t.id).some((m) => m.kind === 'discussion'));
  } finally {
    a.cleanup();
  }
});

test('ngưỡng họp cấu hình được: meetingMinSubtasks lớn → bỏ họp', async () => {
  const a = app({ meetingMinSubtasks: 99 });
  try {
    const t = a.orchestrator.submit({ brief: BRIEF, mode: 'department', department: 'dev' });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    const msgs = a.store.transcript(t.id);
    assert.equal(msgs.filter((m) => m.kind === 'discussion').length, 0);
    assert.ok(msgs.some((m) => m.kind === 'system' && /Bỏ qua họp/.test(m.text)));
  } finally {
    a.cleanup();
  }
});
