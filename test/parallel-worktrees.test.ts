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
      res.writeHead(200, { 'content-type': 'application/json' });
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
    res.writeHead(200, { 'content-type': 'text/event-stream' });
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

function app(url: string, dataDir: string, parallelWorktrees = true) {
  const base = loadConfig();
  return createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'auto', order: ['fake'] },
    runtimes: { fake: { type: 'openai-api', baseUrl: url, tags: 'none', local: false } },
    models: { fake: { opus: ['m-ok'], sonnet: ['m-ok'], haiku: ['m-ok'] } },
    tools: { ...base.tools, serializeWriters: true, parallelWorktrees, repoMap: false },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
  });
}

function project(a: ReturnType<typeof app>, repo: string) {
  a.store.saveProject({ id: 'repo', name: 'Repo', department: 'dev', workspace: repo, classification: 'internal', toolAccess: 'exec', createdAt: new Date().toISOString() });
}

test('repo git: hạng mục chạy lệnh chạy song song trong worktree con rồi gộp vào nhánh nhiệm vụ; hạng mục phụ thuộc thấy phần đã gộp', async () => {
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
      const t = a.orchestrator.submit({ brief: 'Xây tính năng', projectId: 'repo', options: { discussionRounds: 0, maxParallel: 3, maxRevisions: 0 } });
      const done = await a.orchestrator.waitFor(t.id);
      assert.equal(done.status, 'done', done.error);
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
      fs.rmSync(dataDir, { recursive: true, force: true });
      fs.rmSync(repo, { recursive: true, force: true });
    }
  }
});

test('gộp worktree con bị xung đột → hạng mục làm lại lần lượt trong worktree chính, agent tự merge nhánh cũ', async () => {
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
    assert.equal(msgs.match(/đã gộp xong nhánh/g)?.length, 1, 'đúng một hạng mục phải làm lại và đã tự gộp');
    assert.ok(run.subtasks.every((s) => !s.mainOnly && !s.conflict && !s.handover && !s.worktree), 'trạng thái làm lại đã dọn');
    // agent nhận kết quả merge có xung đột rồi tự giải quyết
    assert.ok(gw.stats.toolResults.some((r) => /CONFLICT/.test(r.text)));
    assert.equal(gitc(repo, 'show', `${done.branch}:shared.txt`), 'tu backend-dev\ntu devops');
    assert.doesNotMatch(gitc(repo, 'branch', '--list'), /--s\d/i);
    assert.doesNotMatch(gitc(repo, 'worktree', 'list'), /--s\d/i);
  } finally {
    gw.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('làm lại sau xung đột mà agent không gộp nhánh cũ → hạng mục KHÔNG coi là xong, nhánh cũ giữ lại', async () => {
  const plan: Plan = [
    { id: 'S1', title: 'Sửa phần A', assignee: 'backend-dev', dependsOn: [] },
    { id: 'S2', title: 'Sửa phần B', assignee: 'devops', dependsOn: [] },
  ];
  // lần làm lại chỉ ghi đè tệp, bỏ qua bước git merge trong hướng dẫn
  const gw = await gateway(plan, (who) => [{ name: 'write_file', args: { path: 'shared.txt', content: `tu ${who}\n` } }]);
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
    assert.match(redo.error ?? '', /chưa được gộp/);
    assert.match(redo.handover ?? '', /git merge --no-ff --no-edit/, 'tiếp tục thì vẫn nhận hướng dẫn gộp');
    assert.match(gitc(repo, 'branch', '--list'), new RegExp(redo.conflict.branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'nhánh cũ còn để gộp');
    assert.notEqual(done.status, 'done');
  } finally {
    gw.srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('hook commit của repo không chặn CCoding commit/gộp worktree con', async () => {
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
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('isWorktreeOf: thư mục con của repo khác (worktree gỡ dở) không được coi là worktree con', async () => {
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
    fs.rmSync(other, { recursive: true, force: true });
  } finally {
    fs.rmSync(wt, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
