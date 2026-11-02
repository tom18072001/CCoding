import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

function app(fastLane: Record<string, unknown> = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-fast-'));
  const base = loadConfig();
  const a = createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'mock', order: ['mock'] },
    runtimes: { ...base.runtimes, mock: { minDelayMs: 1, maxDelayMs: 5, reviewRejectRate: 0 } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
    tools: { ...base.tools, repoMap: false },
    fastLane: { ...base.fastLane, ...fastLane },
  });
  return Object.assign(a, { dataDir, cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true }) });
}

function repoIn(dir: string): string {
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"x","private":true}\n');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  return repo;
}

const BRIEF = 'Thiết kế API Node.js/TypeScript ghi log kiểm toán vào Elasticsearch qua Logstash';

test('làn nhanh theo yêu cầu: không họp, kế hoạch bằng model làn nhanh, báo cáo dựng từ bàn giao', async () => {
  const a = app();
  try {
    const t = a.orchestrator.submit({ brief: BRIEF, mode: 'department', department: 'dev', options: { lane: 'fast' } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(done.lane, 'fast');
    assert.equal(done.options.phaseModels?.plan, 'sonnet');
    const msgs = a.store.transcript(t.id);
    assert.equal(msgs.filter((m) => m.kind === 'discussion').length, 0, 'làn nhanh không họp');
    assert.ok(msgs.some((m) => m.kind === 'system' && m.text.startsWith('⚡ Làn nhanh')));
    const final = fs.readdirSync(a.store.runDir(t.id)).find((f) => f.endsWith('-FINAL.md'));
    assert.ok(final, 'có báo cáo phòng');
    const text = fs.readFileSync(path.join(a.store.runDir(t.id), final!), 'utf8');
    assert.match(text, /Làn nhanh: báo cáo dựng tự động/);
    assert.match(text, /## Từng hạng mục/);
    // không có lượt gọi model cho pha tổng hợp
    assert.equal(a.usage.summary('phase', { task: t.id }).some((r) => r.key === 'synthesize'), false);
  } finally {
    a.cleanup();
  }
});

test('làn đầy đủ theo yêu cầu vẫn họp và tổng hợp bằng model', async () => {
  const a = app();
  try {
    const t = a.orchestrator.submit({ brief: BRIEF, mode: 'department', department: 'dev', options: { lane: 'full' } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(done.lane, 'full');
    assert.ok(a.store.transcript(t.id).some((m) => m.kind === 'discussion'));
    assert.ok(a.usage.summary('phase', { task: t.id }).some((r) => r.key === 'synthesize'));
  } finally {
    a.cleanup();
  }
});

test('làn tự chọn: repo nhỏ → làn nhanh; vượt ngưỡng tệp → làn đầy đủ; không có repo → làn đầy đủ', async () => {
  for (const [cfg, want] of [[{}, 'fast'], [{ maxRepoFiles: 1 }, 'full']] as const) {
    const a = app(cfg);
    try {
      const repo = repoIn(a.dataDir);
      a.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: repo, classification: 'internal', toolAccess: 'write', createdAt: new Date().toISOString() });
      const t = a.orchestrator.submit({ brief: 'Thêm hàm cộng vào src/a.js', projectId: 'repo' });
      const done = await a.orchestrator.waitFor(t.id);
      assert.equal(done.status, 'done', done.error);
      assert.equal(done.lane, want, JSON.stringify(cfg));
    } finally {
      a.cleanup();
    }
  }
  const a = app();
  try {
    const t = a.orchestrator.submit({ brief: BRIEF, mode: 'department', department: 'dev' });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.lane, 'full');
  } finally {
    a.cleanup();
  }
});
