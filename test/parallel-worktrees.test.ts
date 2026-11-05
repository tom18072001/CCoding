import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

// Hạng mục chạy lệnh làm SONG SONG trong worktree con riêng, CCoding gộp vào nhánh nhiệm vụ; xung đột → làm lại lần lượt.

const RUNNERS = new Set(['backend-dev', 'frontend-dev', 'devops', 'qa-tester', 'data-engineer', 'security']);

type Call = { name: string; args: Record<string, unknown> };
type Plan = Array<{ id: string; title: string; assignee: string; dependsOn: string[] }>;

function gitc(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function initRepo(): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-par-repo-'));
  gitc(ws, 'init', '-q');
  gitc(ws, 'config', 'user.email', 't@example.com');
  gitc(ws, 'config', 'user.name', 'Kiem thu');
  fs.writeFileSync(path.join(ws, 'shared.txt'), 'goc\n');
  gitc(ws, 'add', '-A');
  gitc(ws, 'commit', '-q', '-m', 'init');
  return ws;
}

/**
 * Gateway giả: lập kế hoạch theo `plan`; agent thực thi gọi lần lượt các công cụ của `script(agent, prompt)` (mỗi lượt một công cụ),
 * hết công cụ thì bàn giao. Ghi lại số hạng mục chạy lệnh đồng thời và kết quả công cụ agent nhận được.
 */
async function gateway(plan: Plan, script: (who: string, user: string) => Call[]) {
  const active = new Set<string>();
  const stats = { peakRunners: 0, subPrompts: 0, toolResults: [] as Array<{ who: string; text: string }> };
  const srv = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json', connection: 'close' });
      return res.end(JSON.stringify({ data: [{ id: 'm-ok' }] }));
    }
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    const text = (m: { content: unknown }) => (typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((p: { text?: string }) => p.text ?? '').join('') : '');
    const sys = body.messages.filter((m: { role: string }) => m.role === 'system').map(text).join('\n');
    const user = body.messages.filter((m: { role: string }) => m.role === 'user').map(text).join('\n');
    const tools = body.messages.filter((m: { role: string }) => m.role === 'tool');
    const who = /\(@([a-z-]+)\)/.exec(sys)?.[1] ?? '?';
    const executing = user.includes('## Hạng mục của bạn');
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' });
    if (executing) {
      if (!tools.length && user.includes('worktree CON riêng')) stats.subPrompts++;
      if (tools.length) stats.toolResults.push({ who, text: text(tools.at(-1)) });
      active.add(who);
      stats.peakRunners = Math.max(stats.peakRunners, [...active].filter((a) => RUNNERS.has(a)).length);
      await new Promise((r) => setTimeout(r, 150));
      active.delete(who);
      const calls = script(who, user);
      const next = calls[tools.length];
      if (next) {
        send({ model: 'm-ok', choices: [{ delta: { tool_calls: [{ index: 0, id: `c${tools.length}`, type: 'function', function: { name: next.name, arguments: JSON.stringify(next.args) } }] }, finish_reason: 'tool_calls' }] });
        send({ choices: [], usage: { prompt_tokens: 500, completion_tokens: 50 } });
        return res.end('data: [DONE]\n\n');
      }
    }
    let out = '## Tóm tắt\nXong phần việc.';
    if (user.includes('LẬP KẾ HOẠCH')) out = `\`\`\`json\n${JSON.stringify({ summary: 'Song song', subtasks: plan.map((s) => ({ ...s, description: s.title })) })}\n\`\`\``;
    else if (user.includes('REVIEW CHẤT LƯỢNG')) out = '```json\n{"approved": true, "summary": "Ổn", "issues": []}\n```';
    send({ model: 'm-ok', choices: [{ delta: { content: out }, finish_reason: 'stop' }] });
    send({ choices: [], usage: { prompt_tokens: 500, completion_tokens: 50 } });
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, stats, url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1` };
}

function app(url: string, dataDir: string, parallelWorktrees = true, resolveRounds?: number) {
  const base = loadConfig();
  return createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'auto', order: ['fake'] },
    runtimes: { fake: { type: 'openai-api', baseUrl: url, tags: 'none', local: false } },
    models: { fake: { opus: ['m-ok'], sonnet: ['m-ok'], haiku: ['m-ok'] } },
    tools: { ...base.tools, serializeWriters: true, parallelWorktrees, repoMap: false, ...(resolveRounds !== undefined ? { resolveRounds } : {}) },
    lanes: { ...base.lanes, single: { ...base.lanes.single, enabled: false } }, // các test này kiểm luồng multi-agent: tắt làn đơn tự chọn
    herdr: { ...base.herdr, notify: false, agentPanes: false },
  });
}

function project(a: ReturnType<typeof app>, repo: string) {
  a.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: repo, classification: 'internal', toolAccess: 'exec', createdAt: new Date().toISOString() });
}

test('repo git: hạng mục chạy lệnh chạy song song trong worktree con rồi gộp vào nhánh nhiệm vụ; hạng mục phụ thuộc thấy phần đã gộp', { timeout: 120_000 }, async () => {
  const plan: Plan = [
    { id: 'S1', title: 'API', assignee: 'backend-dev', dependsOn: [] },
    { id: 'S2', title: 'CI', assignee: 'devops', dependsOn: [] },
    { id: 'S3', title: 'Giao diện', assignee: 'frontend-dev', dependsOn: [] },
    { id: 'S4', title: 'Kiểm thử', assignee: 'qa-tester', dependsOn: ['S1', 'S2'] },
  ];
  const files: Record<string, string> = { 'backend-dev': 'a.txt', devops: 'b.txt', 'frontend-dev': 'c.txt' };
  for (const parallel of [true, false]) {
    const gw = await gateway(plan, (who) =>
      files[who] ? [{ name: 'write_file', args: { path: files[who], content: `tu ${who}\n` } }] : who === 'qa-tester' ? [{ name: 'read_file', args: { paths: ['a.txt', 'b.txt'] } }] : [],
    );
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-par-'));
    const repo = initRepo();
    const a = app(gw.url, dataDir, parallel);
    try {
      project(a, repo);
      // làn đầy đủ: repo thử rất nhỏ nên 'auto' sẽ chọn làn nhanh (chuyển hạng mục của người review thành trọng tâm review)
      const t = a.orchestrator.submit({ brief: 'Xây tính năng', projectId: 'repo', options: { discussionRounds: 0, maxParallel: 3, maxRevisions: 0, lane: 'full' } });
      const done = await a.orchestrator.waitFor(t.id);
      assert.equal(done.status, 'done', `${done.error} ${JSON.stringify(done.attention ?? done.pause)}`);
      const run = done.runs[0];
      assert.ok(run.subtasks.every((s) => s.status === 'done'), JSON.stringify(run.subtasks.map((s) => [s.id, s.status, s.error])));
      const msgs = a.store.transcript(t.id).map((m) => m.text).join('\n');
      // hạng mục phụ thuộc (S4) đọc được phần của S1, S2 — đã gộp vào nhánh nhiệm vụ trước khi S4 tách worktree
      const qa = gw.stats.toolResults.find((r) => r.who === 'qa-tester')?.text ?? '';
      assert.match(qa, /tu backend-dev/);
      assert.match(qa, /tu devops/);
      assert.ok(done.branch);
      for (const f of Object.values(files)) assert.match(gitc(repo, 'show', `${done.branch}:${f}`), /^tu /);
      if (parallel) {
        assert.ok(gw.stats.peakRunners >= 2, `hạng mục chạy lệnh chạy song song (đỉnh ${gw.stats.peakRunners})`);
        assert.equal(gw.stats.subPrompts, 4, 'mỗi hạng mục chạy lệnh làm trong worktree con riêng');
        assert.match(msgs, /worktree con/);
        assert.match(msgs, /Đã gộp S1/);
        assert.doesNotMatch(msgs, /làm lần lượt/);
        // dọn sạch: không còn worktree con / nhánh tạm
        assert.doesNotMatch(gitc(repo, 'worktree', 'list'), /--s\d/i);
        assert.doesNotMatch(gitc(repo, 'branch', '--list'), /--s\d/i);
        assert.ok(run.subtasks.every((s) => !s.worktree && !s.mainOnly));
      } else {
        assert.equal(gw.stats.peakRunners, 1, 'tắt parallelWorktrees → lần lượt như trước');
        assert.equal(gw.stats.subPrompts, 0);
        assert.match(msgs, /làm lần lượt/);
      }
    } finally {
      gw.srv.close();
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
});

test('gộp worktree con bị xung đột → giải quyết trong worktree con MỚI (CCoding gộp sẵn nhánh cũ), agent chỉ sửa dấu xung đột', { timeout: 120_000 }, async () => {
  const plan: Plan = [
    { id: 'S1', title: 'Sửa phần A', assignee: 'backend-dev', dependsOn: [] },
    { id: 'S2', title: 'Sửa phần B', assignee: 'devops', dependsOn: [] },
  ];
  const gw = await gateway(plan, (who, user) =>
    user.includes('GỘP DỞ')
      ? [
          { name: 'read_file', args: { path: 'shared.txt' } },
          { name: 'write_file', args: { path: 'shared.txt', content: 'tu backend-dev\ntu devops\n' } },
        ]
      : [{ name: 'write_file', args: { path: 'shared.txt', content: `tu ${who}\n` } }],
  );
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-par-'));
  const repo = initRepo();
  const a = app(gw.url, dataDir);
  try {
    project(a, repo);
    const t = a.orchestrator.submit({ brief: 'Sửa tệp chung', projectId: 'repo', options: { discussionRounds: 0, maxParallel: 3, maxRevisions: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    const run = done.runs[0];
    assert.ok(run.subtasks.every((s) => s.status === 'done'), JSON.stringify(run.subtasks.map((s) => [s.id, s.status, s.error])));
    const msgs = a.store.transcript(t.id).map((m) => m.text).join('\n');
    assert.match(msgs, /xung đột khi gộp/);
    assert.match(msgs, /giải quyết trong worktree con MỚI/);
    assert.doesNotMatch(msgs, /LẦN LƯỢT trong worktree chính/);
    assert.equal(msgs.match(/đã gộp xong nhánh/g)?.length, 1, 'đúng một hạng mục phải làm lại và đã gộp');
    assert.equal(gw.stats.subPrompts, 3, 'lượt giải quyết xung đột cũng chạy trong worktree con');
    assert.ok(run.subtasks.every((s) => !s.mainOnly && !s.conflict && !s.handover && !s.worktree), 'trạng thái làm lại đã dọn');
    // agent thấy tệp đang gộp dở (có dấu xung đột) — không phải tự chạy git merge
    assert.ok(gw.stats.toolResults.some((r) => /<<<<<<</.test(r.text)), 'agent đọc thấy dấu xung đột');
    assert.equal(gitc(repo, 'show', `${done.branch}:shared.txt`), 'tu backend-dev\ntu devops');
    // báo cáo bàn giao gốc của hạng mục làm lại được giữ, phần gộp lại nối vào sau
    const redo = run.subtasks.find((s) => s.attempts > 1)!;
    assert.match(a.store.readRunFile(t.id, redo.output!) ?? '', /## Gộp lại sau xung đột/);
    assert.doesNotMatch(gitc(repo, 'branch', '--list'), /--s\d/i);
    assert.doesNotMatch(gitc(repo, 'worktree', 'list'), /--s\d/i);
  } finally {
    gw.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('trong lúc một hạng mục giải quyết xung đột, hạng mục khác vẫn gộp được (không chờ khóa worktree chính)', { timeout: 120_000 }, async () => {
  const plan: Plan = [
    { id: 'S1', title: 'Sửa phần A', assignee: 'backend-dev', dependsOn: [] },
    { id: 'S2', title: 'Sửa phần B', assignee: 'devops', dependsOn: [] },
    { id: 'S3', title: 'Giao diện', assignee: 'frontend-dev', dependsOn: [] },
  ];
  const look = (n: number) => Array.from({ length: n }, () => ({ name: 'list_files', args: { path: '.' } }));
  const gw = await gateway(plan, (who, user) =>
    user.includes('GỘP DỞ')
      ? [...look(8), { name: 'write_file', args: { path: 'shared.txt', content: 'tu backend-dev\ntu devops\n' } }]
      : who === 'frontend-dev'
        ? [{ name: 'write_file', args: { path: 'c.txt', content: 'tu frontend\n' } }, ...look(3)]
        : [{ name: 'write_file', args: { path: 'shared.txt', content: `tu ${who}\n` } }],
  );
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-par-'));
  const repo = initRepo();
  const a = app(gw.url, dataDir);
  try {
    project(a, repo);
    const t = a.orchestrator.submit({ brief: 'Sửa tệp chung', projectId: 'repo', options: { discussionRounds: 0, maxParallel: 3, maxRevisions: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    const msgs = a.store.transcript(t.id).map((m) => m.text);
    const resolveStart = msgs.findIndex((m) => /giải quyết xung đột trong worktree con mới/.test(m));
    const s3Merged = msgs.findIndex((m) => /Đã gộp S3/.test(m));
    const resolved = msgs.findIndex((m) => /đã gộp xong nhánh/.test(m));
    assert.ok(resolveStart >= 0 && s3Merged > resolveStart && s3Merged < resolved, `S3 gộp trong lúc giải quyết xung đột (${resolveStart} < ${s3Merged} < ${resolved})`);
    assert.equal(gitc(repo, 'show', `${done.branch}:c.txt`), 'tu frontend');
    assert.equal(gitc(repo, 'show', `${done.branch}:shared.txt`), 'tu backend-dev\ntu devops');
  } finally {
    gw.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('vai trò không có quyền chạy lệnh (Kiến trúc sư) vẫn giải quyết được xung đột — CCoding gộp sẵn và tự hoàn tất merge', { timeout: 120_000 }, async () => {
  const plan: Plan = [
    { id: 'S1', title: 'Sửa phần A', assignee: 'backend-dev', dependsOn: [] },
    { id: 'S2', title: 'Ghi tài liệu', assignee: 'solution-architect', dependsOn: [] },
  ];
  const gw = await gateway(plan, (who, user) =>
    user.includes('GỘP DỞ')
      ? [{ name: 'write_file', args: { path: 'shared.txt', content: 'tu backend-dev\ntu solution-architect\n' } }]
      : who === 'solution-architect'
        ? [{ name: 'list_files', args: { path: '.' } }, { name: 'list_files', args: { path: '.' } }, { name: 'write_file', args: { path: 'shared.txt', content: 'tu solution-architect\n' } }]
        : [{ name: 'write_file', args: { path: 'shared.txt', content: `tu ${who}\n` } }],
  );
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-par-'));
  const repo = initRepo();
  const a = app(gw.url, dataDir);
  try {
    project(a, repo);
    const t = a.orchestrator.submit({ brief: 'Code + tài liệu', projectId: 'repo', options: { discussionRounds: 0, maxParallel: 3, maxRevisions: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(done.runs[0].subtasks.find((s) => s.id === 'S2')?.attempts, 2, 'Kiến trúc sư gộp sau nên là người giải quyết xung đột');
    assert.equal(gitc(repo, 'show', `${done.branch}:shared.txt`), 'tu backend-dev\ntu solution-architect');
    assert.match(gitc(repo, 'log', '--format=%s', done.branch), /gộp lại ccoding\/[^ ]+-xd1 \(S2\)/, 'CCoding tự hoàn tất merge');
  } finally {
    gw.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('lượt giải quyết xung đột để lại dấu xung đột → KHÔNG commit dấu, hạng mục KHÔNG coi là xong, nhánh phần việc gốc giữ lại', { timeout: 120_000 }, async () => {
  const plan: Plan = [
    { id: 'S1', title: 'Sửa phần A', assignee: 'backend-dev', dependsOn: [] },
    { id: 'S2', title: 'Sửa phần B', assignee: 'devops', dependsOn: [] },
  ];
  // lần làm lại không sửa gì (bỏ qua hướng dẫn giải quyết xung đột)
  const gw = await gateway(plan, (who, user) => (user.includes('GỘP DỞ') ? [] : [{ name: 'write_file', args: { path: 'shared.txt', content: `tu ${who}\n` } }]));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-par-'));
  const repo = initRepo();
  const a = app(gw.url, dataDir);
  try {
    project(a, repo);
    const t = a.orchestrator.submit({ brief: 'Sửa tệp chung', projectId: 'repo', options: { discussionRounds: 0, maxParallel: 3, maxRevisions: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    const run = done.runs[0];
    const redo = run.subtasks.find((s) => s.conflict);
    assert.ok(redo, 'có hạng mục xung đột');
    assert.equal(redo.status, 'failed');
    assert.match(redo.error ?? '', /còn dấu xung đột/);
    assert.match(redo.conflict.branch, /-xd1$/);
    assert.match(gitc(repo, 'branch', '--list'), new RegExp(redo.conflict.branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'nhánh phần việc gốc còn để giải quyết lại');
    assert.doesNotMatch(gitc(repo, 'show', `${done.branch}:shared.txt`), /<<<<<<<|>>>>>>>/, 'không commit dấu xung đột vào nhánh nhiệm vụ');
    assert.doesNotMatch(gitc(repo, 'worktree', 'list'), /--s\d/i, 'worktree của lượt giải quyết đã gỡ');
    assert.notEqual(done.status, 'done');
  } finally {
    gw.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('đường dự phòng (resolveRounds: 0): làm lại lần lượt trong worktree chính, agent tự merge nhánh cũ', { timeout: 120_000 }, async () => {
  const plan: Plan = [
    { id: 'S1', title: 'Sửa phần A', assignee: 'backend-dev', dependsOn: [] },
    { id: 'S2', title: 'Sửa phần B', assignee: 'devops', dependsOn: [] },
  ];
  const gw = await gateway(plan, (who, user) => {
    const m = /git merge --no-ff --no-edit (\S+?)`/.exec(user);
    if (m)
      return [
        { name: 'run_command', args: { command: `git merge --no-ff --no-edit ${m[1]}` } },
        { name: 'write_file', args: { path: 'shared.txt', content: 'tu backend-dev\ntu devops\n' } },
        { name: 'run_command', args: { command: 'git add -A' } },
        { name: 'run_command', args: { command: 'git commit --no-edit' } },
      ];
    return [{ name: 'write_file', args: { path: 'shared.txt', content: `tu ${who}\n` } }];
  });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-par-'));
  const repo = initRepo();
  const a = app(gw.url, dataDir, true, 0);
  try {
    project(a, repo);
    const t = a.orchestrator.submit({ brief: 'Sửa tệp chung', projectId: 'repo', options: { discussionRounds: 0, maxParallel: 3, maxRevisions: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    const run = done.runs[0];
    assert.ok(run.subtasks.every((s) => s.status === 'done'), JSON.stringify(run.subtasks.map((s) => [s.id, s.status, s.error])));
    const msgs = a.store.transcript(t.id).map((m) => m.text).join('\n');
    assert.match(msgs, /LẦN LƯỢT trong worktree chính/);
    assert.equal(msgs.match(/đã gộp xong nhánh/g)?.length, 1);
    assert.ok(run.subtasks.every((s) => !s.mainOnly && !s.conflict && !s.handover && !s.worktree), 'trạng thái làm lại đã dọn');
    assert.ok(gw.stats.toolResults.some((r) => /CONFLICT/.test(r.text)));
    assert.equal(gitc(repo, 'show', `${done.branch}:shared.txt`), 'tu backend-dev\ntu devops');
    assert.doesNotMatch(gitc(repo, 'branch', '--list'), /--s\d/i);
  } finally {
    gw.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('hook commit của repo không chặn CCoding commit/gộp worktree con', { timeout: 120_000 }, async () => {
  const plan: Plan = [
    { id: 'S1', title: 'API', assignee: 'backend-dev', dependsOn: [] },
    { id: 'S2', title: 'CI', assignee: 'devops', dependsOn: [] },
  ];
  const files: Record<string, string> = { 'backend-dev': 'a.txt', devops: 'b.txt' };
  const gw = await gateway(plan, (who) => (files[who] ? [{ name: 'write_file', args: { path: files[who], content: `tu ${who}\n` } }] : []));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-par-'));
  const repo = initRepo();
  for (const h of ['pre-commit', 'commit-msg']) fs.writeFileSync(path.join(repo, '.git', 'hooks', h), '#!/bin/sh\necho "hook chan" >&2\nexit 1\n', { mode: 0o755 });
  const a = app(gw.url, dataDir);
  try {
    project(a, repo);
    const t = a.orchestrator.submit({ brief: 'Xây tính năng', projectId: 'repo', options: { discussionRounds: 0, maxParallel: 3, maxRevisions: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    for (const f of Object.values(files)) assert.match(gitc(repo, 'show', `${done.branch}:${f}`), /^tu /);
  } finally {
    gw.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('isWorktreeOf: thư mục con của repo khác (worktree gỡ dở) không được coi là worktree con', { timeout: 120_000 }, async () => {
  const { isWorktreeOf } = await import('../src/git.js');
  const repo = initRepo();
  const wt = `${repo}-wt`;
  try {
    gitc(repo, 'worktree', 'add', '-q', '-b', 'nhanh-con', wt);
    assert.ok(isWorktreeOf(wt, repo));
    fs.mkdirSync(path.join(repo, 'workspaces', 'wt-x'), { recursive: true });
    assert.equal(isWorktreeOf(path.join(repo, 'workspaces', 'wt-x'), repo), false, 'thư mục thường trong repo');
    const other = initRepo();
    assert.equal(isWorktreeOf(other, repo), false, 'repo khác');
    fs.rmSync(other, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } finally {
    fs.rmSync(wt, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('phụ thuộc mới cài trong worktree con rồi gộp → chạy lại lệnh chuẩn bị ở worktree nhiệm vụ trước khi kiểm tra; báo cáo ghi đúng commit', { timeout: 120_000 }, async () => {
  const plan: Plan = [
    { id: 'S1', title: 'Thêm thư viện', assignee: 'backend-dev', dependsOn: [] },
    { id: 'S2', title: 'CI', assignee: 'devops', dependsOn: [] },
  ];
  const gw = await gateway(plan, (who) =>
    who === 'backend-dev'
      ? [{ name: 'write_file', args: { path: 'package.json', content: '{ "name": "x", "dependencies": { "moi": "1.0.0" } }\n' } }]
      : who === 'devops'
        ? [{ name: 'write_file', args: { path: 'b.txt', content: 'tu devops\n' } }]
        : [],
  );
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-par-'));
  const repo = initRepo();
  fs.writeFileSync(path.join(repo, 'package.json'), '{ "name": "x" }\n');
  fs.writeFileSync(path.join(repo, '.gitignore'), '.installed.json\n');
  gitc(repo, 'add', '-A');
  gitc(repo, 'commit', '-q', '-m', 'package.json');
  const a = app(gw.url, dataDir);
  try {
    // "cài đặt" = chép package.json thành .installed.json (không track); kiểm tra = bản cài khớp package.json hiện tại
    a.store.saveProject({
      id: 'repo',
      name: 'Repo',
      department: 'dev',
      workspace: repo,
      classification: 'internal',
      toolAccess: 'exec',
      setupCommands: ["node -e \"require('fs').copyFileSync('package.json','.installed.json')\""],
      checkCommands: ["node -e \"const f=require('fs');process.exit(f.readFileSync('package.json','utf8')===f.readFileSync('.installed.json','utf8')?0:1)\""],
      createdAt: new Date().toISOString(),
    });
    const t = a.orchestrator.submit({ brief: 'Thêm thư viện', projectId: 'repo', options: { discussionRounds: 0, maxParallel: 3, maxRevisions: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    const msgs = a.store.transcript(t.id).map((m) => m.text).join('\n');
    assert.match(msgs, /Tệp khai báo phụ thuộc đã đổi sau lần chuẩn bị \(`package\.json`\)/);
    assert.equal(done.projectChecks?.latest?.[0].ok, true, 'kiểm tra sau thực thi chạy trên bản cài mới');
    assert.equal(done.attention, undefined, 'không có hồi quy giả');
    assert.match(gitc(repo, 'show', `${done.branch}:package.json`), /"moi"/);
    // mọi thay đổi vào nhánh qua gộp worktree con → báo cáo ghi commit HEAD + số commit, không phải "không có thay đổi"
    assert.match(done.commit ?? '', /^[0-9a-f]{10} — \d+ commit trên nhánh từ [0-9a-f]{10}/);
    assert.match(a.store.readRunFile(t.id, 'FINAL.md') ?? '', /commit: [0-9a-f]{10} — \d+ commit/);
  } finally {
    gw.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('hạng mục chỉ ghi tài liệu cũng làm trong worktree con (không bị commit dở khi gộp hạng mục khác), không chạy lệnh chuẩn bị', { timeout: 120_000 }, async () => {
  const plan: Plan = [
    { id: 'S1', title: 'API', assignee: 'backend-dev', dependsOn: [] },
    { id: 'S2', title: 'ADR', assignee: 'solution-architect', dependsOn: [] },
  ];
  const gw = await gateway(plan, (who) =>
    who === 'backend-dev'
      ? [{ name: 'write_file', args: { path: 'a.txt', content: 'tu backend\n' } }]
      : who === 'solution-architect'
        ? [
            { name: 'write_file', args: { path: 'docs/adr.md', content: 'nhap\n' } },
            { name: 'list_files', args: { path: '.' } },
            { name: 'list_files', args: { path: 'docs' } },
            { name: 'edit_file', args: { path: 'docs/adr.md', old_string: 'nhap', new_string: 'ban cuoi' } },
          ]
        : [],
  );
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-par-'));
  const repo = initRepo();
  const a = app(gw.url, dataDir);
  try {
    a.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: repo, classification: 'internal', toolAccess: 'exec', setupCommands: ["node -e \"require('fs').appendFileSync('setup.log','x')\""], createdAt: new Date().toISOString() });
    const t = a.orchestrator.submit({ brief: 'API + ADR', projectId: 'repo', options: { discussionRounds: 0, maxParallel: 3, maxRevisions: 0 } });
    const done = await a.orchestrator.waitFor(t.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(gw.stats.subPrompts, 2, 'cả hai hạng mục làm trong worktree con');
    assert.equal(gitc(repo, 'show', `${done.branch}:docs/adr.md`), 'ban cuoi');
    const log = gitc(repo, 'log', '--format=%s', done.branch);
    assert.doesNotMatch(log, /phần đã làm trước khi gộp/, log);
    assert.match(log, /gộp S2/);
    const setups = fs.readFileSync(path.join(dataDir, 'runs', t.id, 'events.jsonl'), 'utf8').split('\n').filter((l) => l.includes('"checks.setup"'));
    assert.equal(setups.length, 1, 'lệnh chuẩn bị chỉ chạy cho hạng mục chạy lệnh');
    assert.match(setups[0], /S1 worktree con/);
  } finally {
    gw.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
