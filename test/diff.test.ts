import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { DiffError, diffSummary, fileDiff, locate } from '../src/diff.js';
import { createServer } from '../src/server.js';
import { testApp } from './helpers.js';

// Diff thay đổi của nhiệm vụ cho giao diện: worktree (gồm phần chưa commit, tệp mới), nhánh (worktree đã gỡ), từng commit gộp hạng mục.

function gitc(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

const KEY = 'sk-abcdefghijklmnopqrstuvwxyz0123456789';

/** Repo dự án + worktree nhiệm vụ: 1 commit sửa, 1 đổi tên, 1 commit gộp hạng mục (--no-ff), phần chưa commit và tệp mới. */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-diff-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  gitc(repo, 'init', '-q', '-b', 'main');
  gitc(repo, 'config', 'user.email', 't@example.com');
  gitc(repo, 'config', 'user.name', 'Kiem thu');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'mot\nhai\nba\n');
  fs.writeFileSync(path.join(repo, 'b.txt'), 'goc\n');
  fs.writeFileSync(path.join(repo, 'old.txt'), 'doi ten\n'.repeat(5));
  fs.writeFileSync(path.join(repo, 'README.md'), '# repo\n');
  gitc(repo, 'add', '-A');
  gitc(repo, 'commit', '-q', '-m', 'init');
  const base = gitc(repo, 'rev-parse', 'HEAD');
  const wt = path.join(root, 'workspaces', 'wt-t-1');
  const branch = 'ccoding/t-1';
  gitc(repo, 'worktree', 'add', '-q', '-b', branch, wt, 'HEAD');
  fs.writeFileSync(path.join(wt, 'a.txt'), 'mot\nHAI\nba\nbon\n');
  gitc(wt, 'mv', 'old.txt', 'renamed.txt');
  gitc(wt, 'add', '-A');
  gitc(wt, 'commit', '-q', '-m', 'CCoding T-1 S1: sửa a, đổi tên');
  // hạng mục S2 trong worktree con → gộp --no-ff
  gitc(wt, 'checkout', '-q', '-b', 'ccoding/t-1--s2');
  fs.writeFileSync(path.join(wt, 'c.txt'), 'moi tu S2\n');
  gitc(wt, 'add', '-A');
  gitc(wt, 'commit', '-q', '-m', 'CCoding T-1 S2: thêm c');
  gitc(wt, 'checkout', '-q', branch);
  gitc(wt, 'merge', '-q', '--no-ff', '-m', 'CCoding T-1: gộp S2 — thêm c', 'ccoding/t-1--s2');
  const merge = gitc(wt, 'rev-parse', 'HEAD');
  // chưa commit: sửa b, tệp mới có bí mật, .env, nhị phân, thư mục riêng của CCoding
  fs.writeFileSync(path.join(wt, 'b.txt'), 'goc\nthem dong\n');
  fs.writeFileSync(path.join(wt, 'new.md'), `# Ghi chú\napi_key = ${KEY}\n`);
  fs.writeFileSync(path.join(wt, '.env.local'), 'DB_PASSWORD=that-su-bi-mat\n');
  fs.writeFileSync(path.join(wt, 'img.bin'), Buffer.from([1, 0, 2, 0, 3]));
  fs.mkdirSync(path.join(wt, '.ccoding', 'T-1'), { recursive: true });
  fs.writeFileSync(path.join(wt, '.ccoding', 'T-1', 'PLAN.md'), 'ke hoach\n');
  return { root, repo, wt, base, branch, merge };
}

test('diff nhiệm vụ: worktree gồm phần chưa commit + tệp mới, che bí mật, ẩn .env, lọc theo commit gộp hạng mục', () => {
  const f = fixture();
  try {
    assert.equal(locate({ workspace: f.wt, branch: f.branch, baseRef: undefined }, f.repo), undefined, 'thiếu commit gốc → không có diff');
    assert.equal(locate({ workspace: f.wt, branch: undefined, baseRef: f.base }, f.repo), undefined);
    const src = locate({ workspace: f.wt, branch: f.branch, baseRef: f.base }, f.repo);
    assert.ok(src);
    assert.equal(src.source, 'worktree');
    const s = diffSummary(src);
    const by = new Map(s.files.map((x) => [x.path, x]));
    assert.deepEqual([...by.keys()].sort(), ['.env.local', 'a.txt', 'b.txt', 'c.txt', 'img.bin', 'new.md', 'renamed.txt']);
    assert.ok(!s.files.some((x) => x.path.startsWith('.ccoding/')), 'thư mục .ccoding không phải thay đổi của dự án');
    assert.equal(by.get('a.txt')?.status, 'M');
    assert.deepEqual([by.get('a.txt')?.add, by.get('a.txt')?.del], [2, 1]);
    assert.equal(by.get('renamed.txt')?.status, 'R');
    assert.equal(by.get('renamed.txt')?.oldPath, 'old.txt');
    assert.equal(by.get('c.txt')?.status, 'A');
    assert.equal(by.get('new.md')?.status, '?');
    assert.equal(by.get('new.md')?.add, 2);
    assert.equal(by.get('img.bin')?.binary, true);
    assert.equal(by.get('.env.local')?.hidden, true);
    assert.ok(s.uncommitted >= 4, `uncommitted=${s.uncommitted}`);
    assert.equal(s.commits.length, 3);
    assert.equal(s.commits.filter((c) => c.merge).length, 1);
    assert.equal(s.totals.files, 7);

    // tệp mới chưa commit: hiện nội dung, che khóa API
    const nd = fileDiff(src, 'new.md');
    assert.match(nd.text, /^\+# Ghi chú$/m);
    assert.ok(!nd.text.includes(KEY), 'khóa API phải bị che');
    assert.match(nd.text, /REDACTED/);
    // .env: chỉ tên, không nội dung
    const env = fileDiff(src, '.env.local');
    assert.equal(env.hidden, true);
    assert.equal(env.text, '');
    // tệp đã theo dõi, có cả phần chưa commit
    assert.match(fileDiff(src, 'b.txt').text, /^\+them dong$/m);
    assert.match(fileDiff(src, 'renamed.txt').text, /rename from old\.txt/);
    // không đọc được tệp ngoài danh sách thay đổi
    for (const bad of ['README.md', '../repo/README.md', '.ccoding/T-1/PLAN.md', '']) assert.throws(() => fileDiff(src, bad), (e: unknown) => e instanceof DiffError && (e.status === 404 || e.status === 400), bad);

    // theo commit gộp hạng mục: chỉ phần S2 mang vào
    const m = diffSummary(src, f.merge.slice(0, 10));
    assert.equal(m.commit, f.merge);
    assert.deepEqual(m.files.map((x) => x.path), ['c.txt']);
    assert.match(fileDiff(src, 'c.txt', f.merge).text, /^\+moi tu S2$/m);
    assert.throws(() => diffSummary(src, f.base), (e: unknown) => e instanceof DiffError && e.status === 404, 'commit gốc không thuộc nhánh');
    assert.throws(() => diffSummary(src, 'HEAD~1'), (e: unknown) => e instanceof DiffError && e.status === 400);

    // không sửa index / không tạo khóa
    assert.ok(!fs.existsSync(path.join(f.repo, '.git', 'worktrees', 'wt-t-1', 'index.lock')));
    assert.equal(gitc(f.wt, 'status', '--porcelain').includes('A  new.md'), false, 'diff không được thêm tệp vào index');

    // worktree đã gỡ → lấy từ nhánh trong repo: chỉ phần đã commit
    gitc(f.repo, 'worktree', 'remove', '--force', f.wt);
    const br = locate({ workspace: f.wt, branch: f.branch, baseRef: f.base }, f.repo);
    assert.ok(br);
    assert.equal(br.source, 'branch');
    const sb = diffSummary(br);
    assert.deepEqual(sb.files.map((x) => x.path).sort(), ['a.txt', 'c.txt', 'renamed.txt']);
    assert.equal(sb.uncommitted, 0);
    assert.match(fileDiff(br, 'a.txt').text, /^\+HAI$/m);
    // nhánh đã xóa → không có diff
    gitc(f.repo, 'branch', '-D', 'ccoding/t-1--s2');
    gitc(f.repo, 'branch', '-D', f.branch);
    assert.equal(locate({ workspace: f.wt, branch: f.branch, baseRef: f.base }, f.repo), undefined);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('API diff và lọc nhật ký theo hạng mục', async () => {
  const f = fixture();
  const app = testApp();
  const srv0 = createServer(app);
  await new Promise<void>((r) => srv0.listen(0, '127.0.0.1', r));
  const port = (srv0.address() as AddressInfo).port;
  srv0.close();
  app.config.server.port = port;
  const srv = createServer(app);
  await new Promise<void>((r) => srv.listen(port, '127.0.0.1', r));
  const get = (p: string) => fetch(`http://127.0.0.1:${port}${p}`);
  try {
    app.store.saveProject({ id: 'dx', name: 'Diff', department: 'dev', workspace: f.repo } as never);
    const now = new Date().toISOString();
    const base = { title: 'Diff', brief: 'x', mode: 'project', status: 'done', classification: 'internal', runs: [], options: {}, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 }, createdAt: now, updatedAt: now };
    app.store.put({ ...base, id: 'T-DIFF', projectId: 'dx', workspace: f.wt, branch: f.branch, baseRef: f.base } as never, true);
    app.store.put({ ...base, id: 'T-NOGIT' } as never, true);

    const s = await get('/api/tasks/T-DIFF/diff');
    assert.equal(s.status, 200);
    const sum = (await s.json()) as { source: string; totals: { files: number }; commits: unknown[] };
    assert.equal(sum.source, 'worktree');
    assert.equal(sum.totals.files, 7);
    assert.equal(sum.commits.length, 3);
    const one = (await (await get(`/api/tasks/T-DIFF/diff?file=${encodeURIComponent('a.txt')}`)).json()) as { text: string };
    assert.match(one.text, /^\+bon$/m);
    assert.equal((await get('/api/tasks/T-DIFF/diff?file=README.md')).status, 404);
    assert.equal((await get('/api/tasks/T-DIFF/diff?commit=--output=x')).status, 400);
    assert.equal((await get('/api/tasks/T-NOGIT/diff')).status, 404);
    assert.equal((await get('/api/tasks/KHONG-CO/diff')).status, 404);

    app.logs.write({ level: 'info', kind: 'tool.call', msg: 'a', taskId: 'T-DIFF', agentId: 'backend-dev', subtaskId: 'S1' });
    app.logs.write({ level: 'info', kind: 'tool.call', msg: 'b', taskId: 'T-DIFF', agentId: 'frontend-dev', subtaskId: 'S2' });
    app.logs.write({ level: 'info', kind: 'phase', msg: 'c', taskId: 'T-DIFF', subtaskId: 'S1' });
    const ev = (await (await get('/api/tasks/T-DIFF/events?kind=tool.call&subtask=S1')).json()) as Array<{ msg: string }>;
    assert.deepEqual(ev.map((e) => e.msg), ['a']);
  } finally {
    srv.close();
    app.cleanup();
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
