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

test('điều phối làn nhanh: hạng mục của người review → trọng tâm review; trùng người làm → chia người khác cùng năng lực', () => {
  const a = app();
  try {
    const reg = a.registry;
    const dept = reg.department('dev');
    const lead = reg.agent(dept.lead);
    const reviewer = reg.agent(dept.reviewer!);
    const roster = reg.members('dev');
    const mk = (id: string, assignee: string, dependsOn: string[] = []) => ({ id, title: `Việc ${id}`, assignee, description: `Mô tả ${id}`, dependsOn, status: 'pending', attempts: 0 });
    const run = { department: 'dev', status: 'running', subtasks: [mk('S1', 'backend-dev'), mk('S2', 'backend-dev'), mk('S3', reviewer.id), mk('S4', 'backend-dev', ['S3'])] } as never as Parameters<never>[0];
    const task = { id: 'T-x', options: { review: true, maxParallel: 1 }, title: 't' } as never;
    const caps = Object.fromEntries(roster.map((r) => [r.id, 'chạy lệnh']));
    const orch = a.orchestrator as unknown as { shapeFastPlan: (...x: unknown[]) => void; message: (...x: unknown[]) => void };
    orch.message = () => undefined;
    orch.shapeFastPlan(task, run, roster, lead, reviewer, { caps });
    const r = run as unknown as { subtasks: Array<{ id: string; assignee: string; dependsOn: string[] }>; reviewFocus?: string };
    assert.deepEqual(r.subtasks.map((s) => s.id), ['S1', 'S2', 'S4']);
    assert.match(r.reviewFocus ?? '', /Việc S3/);
    assert.deepEqual(r.subtasks.find((s) => s.id === 'S4')!.dependsOn, []);
    const owners = r.subtasks.map((s) => s.assignee);
    assert.equal(new Set(owners).size, 3, `mỗi hạng mục độc lập một người: ${owners}`);
    assert.ok(!owners.includes(reviewer.id) && !owners.includes(lead.id));
    // 3 hạng mục độc lập còn lại → được chạy cùng lúc cả 3 dù nhiệm vụ đặt maxParallel 1
    assert.equal((task as unknown as { options: { maxParallel: number } }).options.maxParallel, 3);
  } finally {
    a.cleanup();
  }
});

test('hook claude-cli: lệnh Bash chạy với stdin = /dev/null (không treo khi lệnh đọc stdin)', async () => {
  const { withNullStdin } = await import('../src/tools/claude-guard.js');
  const wrapped = withNullStdin("cat > x.txt 2>/dev/null || true; echo xong");
  assert.equal(wrapped, "{ cat > x.txt 2>/dev/null || true; echo xong\n} </dev/null");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-stdin-'));
  try {
    // chạy thật bằng bash với stdin là một pipe không bao giờ đóng: không có nhóm </dev/null thì `cat` sẽ treo
    const out = execFileSync('bash', ['-c', withNullStdin("cd sub 2>/dev/null; cat > x.txt; heredoc=$(cat <<'EOF'\nvẫn đọc được heredoc\nEOF\n); echo \"$heredoc\"; pwd")], { cwd: dir, encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    assert.match(out, /vẫn đọc được heredoc/);
    assert.equal(fs.readFileSync(path.join(dir, 'x.txt'), 'utf8'), '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
