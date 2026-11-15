import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { commitAll, ensureScratchExcluded, git } from '../src/git.js';
import { loadScratchPatterns, matchScratch } from '../src/scratch.js';
import { closeServer } from './helpers.js';

// D26/K1: tệp nháp mới của agent không vào commit — chuyển vào .scratch/ theo .ccoding/scratch.json. Mọi repo tạm nằm trong os.tmpdir().

const PATTERNS = ['_*', '**/*-tmp/**', '*-tmp/**', '**/tmp_*/**', 'tmp_*/**', '**/*.tmp', '**/*.bak', '**/*.orig', '**/*.rej', '!bench/vs-claude/results/**', '!bench/vs-claude/tasks/**'];

function run(cwd: string, args: string[]): string {
  const r = git(cwd, ['-c', 'user.name=t', '-c', 'user.email=t@localhost', '-c', 'commit.gpgsign=false', ...args]);
  assert.ok(r.ok, `git ${args.join(' ')}: ${r.out}`);
  return r.out;
}

function write(dir: string, rel: string, text: string): void {
  const f = path.join(dir, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
}

function makeRepo(withConfig: boolean): { dir: string; root: string; base: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding scratch '));
  const dir = path.join(root, 'repo');
  fs.mkdirSync(dir);
  run(dir, ['init', '-q', '-b', 'main']);
  write(dir, 'a.txt', 'a');
  write(dir, 'old.bak', 'v1');
  if (withConfig) write(dir, '.ccoding/scratch.json', JSON.stringify({ patterns: PATTERNS }));
  run(dir, ['add', '-f', '-A']);
  run(dir, ['commit', '-q', '-m', 'init']);
  return { dir, root, base: run(dir, ['rev-parse', 'HEAD']).trim() };
}

test('(a) tệp nháp mới được chuyển vào .scratch/, không vào commit', () => {
  const { dir, root, base } = makeRepo(true);
  try {
    write(dir, '_ed.py', 'print(1)');
    write(dir, 'docs/k2-tmp/a.mjs', 'x');
    write(dir, 'src/real.ts', 'export {}');
    const r = commitAll(dir, 'msg', { base });
    assert.ok(r.ok, r.out);
    assert.deepEqual([...r.scratchMoved].sort(), ['_ed.py', 'docs/k2-tmp/a.mjs']);
    assert.deepEqual(r.scratchErrors, []);
    const files = run(dir, ['show', '--name-only', '--format=', 'HEAD']).split('\n').map((s) => s.trim());
    assert.deepEqual(files, ['src/real.ts']);
    assert.equal(fs.readFileSync(path.join(dir, '.scratch', '_ed.py'), 'utf8'), 'print(1)');
    assert.equal(fs.readFileSync(path.join(dir, '.scratch', 'docs', 'k2-tmp', 'a.mjs'), 'utf8'), 'x');
    assert.ok(!fs.existsSync(path.join(dir, '_ed.py')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('(a) tệp nháp đã nằm trong index (git add) và tệp thêm mới so với base cũng được chuyển, không commit', () => {
  const { dir, root, base } = makeRepo(true);
  try {
    write(dir, '_ed.py', 'x');
    run(dir, ['add', '_ed.py']);
    write(dir, 'src/b.ts', 'export {}');
    const r = commitAll(dir, 'msg', { base });
    assert.deepEqual(r.scratchMoved, ['_ed.py']);
    assert.deepEqual(run(dir, ['show', '--name-only', '--format=', 'HEAD']).trim().split('\n'), ['src/b.ts']);
    // lần sau: tệp nháp đã bị commit nhầm ở commit trước (A so với base) vẫn được chuyển ra
    write(dir, '_late.py', 'y');
    run(dir, ['add', '_late.py']);
    run(dir, ['commit', '-q', '-m', 'agent tự commit']);
    const r2 = commitAll(dir, 'msg2', { base });
    assert.ok(r2.scratchMoved.includes('_late.py'));
    assert.ok(!run(dir, ['ls-files']).includes('_late.py'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('(b) tệp đã track trùng mẫu bị sửa vẫn được commit', () => {
  const { dir, root, base } = makeRepo(true);
  try {
    write(dir, 'old.bak', 'v2');
    const r = commitAll(dir, 'msg', { base });
    assert.ok(r.ok, r.out);
    assert.deepEqual(r.scratchMoved, []);
    assert.deepEqual(run(dir, ['show', '--name-only', '--format=', 'HEAD']).trim().split('\n'), ['old.bak']);
    assert.equal(fs.readFileSync(path.join(dir, 'old.bak'), 'utf8'), 'v2');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('(c) repo không có .ccoding/scratch.json: _ed.py vẫn được commit như cũ', () => {
  const { dir, root, base } = makeRepo(false);
  try {
    write(dir, '_ed.py', 'x');
    const r = commitAll(dir, 'msg');
    assert.ok(r.ok, r.out);
    assert.deepEqual(r.scratchMoved, []);
    assert.deepEqual(r.scratchErrors, []);
    assert.deepEqual(run(dir, ['show', '--name-only', '--format=', 'HEAD']).trim().split('\n'), ['_ed.py']);
    assert.equal(loadScratchPatterns(dir), undefined);
    assert.equal(commitAll(dir, 'again', { base }).out, 'không có thay đổi');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('không chuyển được → để nguyên, không commit, ghi lỗi', () => {
  const { dir, root, base } = makeRepo(true);
  try {
    write(dir, '_ed.py', 'x');
    write(dir, 'src/real.ts', 'export {}');
    write(dir, '.scratch', 'tệp chặn thư mục'); // .scratch là tệp → mkdir lỗi
    const r = commitAll(dir, 'msg', { base });
    assert.deepEqual(r.scratchErrors, ['_ed.py']);
    assert.deepEqual(r.scratchMoved, []);
    assert.deepEqual(run(dir, ['show', '--name-only', '--format=', 'HEAD']).trim().split('\n'), ['src/real.ts']);
    assert.ok(fs.existsSync(path.join(dir, '_ed.py')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('(d) ensureScratchExcluded chạy hai lần: info/exclude có .scratch/ đúng một lần; không đụng .gitignore', () => {
  const { dir, root } = makeRepo(true);
  try {
    const wt = path.join(root, 'wt');
    run(dir, ['worktree', 'add', '-q', '-b', 'nhanh', wt]);
    assert.ok(ensureScratchExcluded(wt));
    assert.ok(ensureScratchExcluded(wt));
    const ex = path.resolve(wt, run(wt, ['rev-parse', '--git-path', 'info/exclude']).trim());
    assert.equal(fs.readFileSync(ex, 'utf8').split(/\r?\n/).filter((l) => l.trim() === '.scratch/').length, 1);
    write(wt, '.scratch/x.txt', 'x');
    assert.equal(run(wt, ['status', '--porcelain']).trim(), '', '.scratch/ bị git bỏ qua');
    assert.ok(!fs.existsSync(path.join(wt, '.gitignore')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('(e) matchScratch: gốc, thư mục tạm, loại trừ bench', () => {
  assert.equal(matchScratch('_ed.py', PATTERNS), true);
  assert.equal(matchScratch('src/_ed.py', PATTERNS), false, '_* chỉ ở gốc');
  assert.equal(matchScratch('k2-tmp/a.mjs', PATTERNS), true);
  assert.equal(matchScratch('docs/k2-tmp/a.mjs', PATTERNS), true);
  assert.equal(matchScratch('tmp_x/a', PATTERNS), true);
  assert.equal(matchScratch('a/b/tmp_x/c/d', PATTERNS), true);
  assert.equal(matchScratch('src/a.tmp', PATTERNS), true);
  assert.equal(matchScratch('x.orig', PATTERNS), true);
  assert.equal(matchScratch('src/real.ts', PATTERNS), false);
  assert.equal(matchScratch('bench/vs-claude/results/x/_FINAL.txt', PATTERNS), false);
  assert.equal(matchScratch('bench/vs-claude/tasks/t/tmp_old/a', PATTERNS), false);
  assert.equal(matchScratch('a/b.c', ['a/?.c']), true);
  assert.equal(matchScratch('a/bb.c', ['a/?.c']), false);
  assert.equal(matchScratch('a/b/c.c', ['a/*.c']), false);
  assert.equal(matchScratch('a/b/c.c', ['a/**']), true);
  assert.equal(matchScratch('x.c', []), false);
});

test('loadScratchPatterns: thiếu tệp / JSON hỏng / sai dạng → undefined', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding scratch cfg '));
  try {
    assert.equal(loadScratchPatterns(root), undefined);
    write(root, '.ccoding/scratch.json', '{hỏng');
    assert.equal(loadScratchPatterns(root), undefined);
    write(root, '.ccoding/scratch.json', '{"patterns":"x"}');
    assert.equal(loadScratchPatterns(root), undefined);
    write(root, '.ccoding/scratch.json', '{"patterns":["_*"]}');
    assert.deepEqual(loadScratchPatterns(root), ['_*']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('orchestrator: kết thúc nhiệm vụ ghi sự kiện nhật ký workspace.scratch (chỉ đường dẫn tương đối)', async () => {
  const { dir: repo, root } = makeRepo(true);
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
  const dataDir = path.join(root, 'data');
  const base = loadConfig();
  const app = createApp({
    dataDir,
    workspacesDir: path.join(dataDir, 'workspaces'),
    runner: 'process',
    runtime: { ...base.runtime, default: 'auto', order: ['fake'] },
    runtimes: { fake: { type: 'openai-api', baseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`, tags: 'none', local: true } },
    models: { fake: { opus: ['m-ok'], sonnet: ['m-ok'], haiku: ['m-ok'] } },
    herdr: { ...base.herdr, notify: false, agentPanes: false },
  } as any);
  const events: Array<{ kind: string; level: string; msg: string }> = [];
  const orig = app.logs.write.bind(app.logs);
  (app.logs as any).write = (e: any) => {
    events.push(e);
    return orig(e);
  };
  try {
    app.store.saveProject({ id: 'p-sc', name: 'Dự án nháp', department: 'dev', classification: 'internal', workspace: repo, createdAt: new Date().toISOString() } as any);
    const t = app.orchestrator.submit({ brief: 'Viết API', projectId: 'p-sc', options: { discussionRounds: 0 } });
    const done = await app.orchestrator.waitFor(t.id);
    assert.ok(done.workspace && done.branch, 'có worktree riêng');
    const ex = path.resolve(done.workspace!, run(done.workspace!, ['rev-parse', '--git-path', 'info/exclude']).trim());
    assert.ok(fs.readFileSync(ex, 'utf8').split(/\r?\n/).includes('.scratch/'), 'dựng worktree đã ghi exclude');
    write(done.workspace!, '_ed.py', 'x');
    (app.orchestrator as any).finishWorkspace(done);
    const ev = events.filter((e) => e.kind === 'workspace.scratch');
    assert.equal(ev.length, 1);
    assert.equal(ev[0]!.level, 'info');
    assert.match(ev[0]!.msg, /_ed\.py/);
    assert.ok(!ev[0]!.msg.includes(root), 'không ghi đường dẫn tuyệt đối');
    assert.ok(!run(done.workspace!, ['ls-files']).includes('_ed.py'));
  } finally {
    await closeServer(srv);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
