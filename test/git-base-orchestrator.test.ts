import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { git } from '../src/git.js';

// K5: nhánh cục bộ và origin lệch hai chiều → nhiệm vụ dừng ở 'failed' với thông báo tiếng Việt, không tạo worktree,
// không làm việc trực tiếp trong repo gốc.

async function gateway() {
  const srv = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'm-ok' }] }));
    }
    for await (const _ of req);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ model: 'm-ok', choices: [{ delta: { content: '## Tóm tắt\nXong.' }, finish_reason: 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1` };
}

test('K5: base lệch hai chiều → nhiệm vụ failed, không tạo worktree', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding k5 orch '));
  const run = (cwd: string, args: string[]) => {
    const r = git(cwd, ['-c', 'user.name=t', '-c', 'user.email=t@localhost', '-c', 'commit.gpgsign=false', ...args]);
    assert.ok(r.ok, `git ${args.join(' ')}: ${r.out}`);
  };
  const commit = (dir: string, name: string) => {
    fs.writeFileSync(path.join(dir, name), name);
    run(dir, ['add', '-A']);
    run(dir, ['commit', '-m', name]);
  };
  const origin = path.join(root, 'origin.git');
  const repo = path.join(root, 'repo dir');
  const other = path.join(root, 'other dir');
  fs.mkdirSync(origin);
  run(origin, ['init', '--bare', '-b', 'main']);
  run(root, ['clone', origin, repo]);
  run(repo, ['checkout', '-B', 'main']);
  commit(repo, 'a.txt');
  run(repo, ['push', 'origin', 'main']);
  run(root, ['clone', origin, other]);
  commit(other, 'remote.txt');
  run(other, ['push', 'origin', 'main']);
  commit(repo, 'local.txt');

  const gw = await gateway();
  const dataDir = path.join(root, 'data');
  const base = loadConfig();
  const app = createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'auto', order: ['fake'] },
    runtimes: { fake: { type: 'openai-api', baseUrl: gw.url, tags: 'none', local: true } },
    models: { fake: { opus: ['m-ok'], sonnet: ['m-ok'], haiku: ['m-ok'] } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
  } as any);
  try {
    app.store.saveProject({ id: 'p-k5', name: 'Dự án K5', department: 'dev', classification: 'internal', workspace: repo, baseRef: 'main', createdAt: new Date().toISOString() } as any);
    const t = app.orchestrator.submit({ brief: 'Viết API', projectId: 'p-k5', options: { discussionRounds: 0 } });
    const done = await app.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'failed');
    assert.match(done.error ?? '', /đã lệch nhau/);
    assert.equal(done.branch, undefined, 'không có nhánh/worktree nhiệm vụ');
    assert.ok(!fs.existsSync(path.join(dataDir, 'workspaces', 'p-k5', `wt-${t.id}`)));
    assert.equal(done.runs.length, 0, 'chưa chạy hạng mục nào');
  } finally {
    gw.srv.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
