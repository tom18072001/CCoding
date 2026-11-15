import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../src/config.js';

// D26/K2: luật stray-files đọc mẫu từ .ccoding/scratch.json (qua matchScratch của src/scratch.ts) + danh sách tệp gốc cho phép.
// Dựng repo git tạm trong os.tmpdir(), chạy đúng bộ chạy lint thật.

const RUNNER = path.join(ROOT, 'scripts', 'lint', 'run.mjs');

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(' ')} lỗi: ${r.stderr}`);
}

function put(dir: string, rel: string, content: string): void {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content, 'utf8');
}

/** Repo tạm có src/scratch.ts + .ccoding/scratch.json của repo này, thêm các tệp `files` rồi commit. */
function run(files: string[], allow: unknown[] = []): { code: number | null; out: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-stray-'));
  try {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'lint@example.invalid');
    git(dir, 'config', 'user.name', 'lint');
    git(dir, 'config', 'commit.gpgsign', 'false');
    put(dir, 'src/scratch.ts', fs.readFileSync(path.join(ROOT, 'src', 'scratch.ts'), 'utf8'));
    put(dir, '.ccoding/scratch.json', fs.readFileSync(path.join(ROOT, '.ccoding', 'scratch.json'), 'utf8'));
    put(dir, 'scripts/lint/allow.json', JSON.stringify({ entries: allow }));
    put(dir, 'scripts/lint/baseline.json', JSON.stringify({ entries: [] }));
    for (const f of files) put(dir, f, f.endsWith('.json') ? '{}\n' : 'x\n');
    git(dir, 'add', '-A', '-f');
    git(dir, 'commit', '-q', '-m', 'init');
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.LINT_BASE;
    delete env.CCODING_BASE_REF;
    const r = spawnSync(process.execPath, [RUNNER, '--rule', 'stray-files'], { cwd: dir, encoding: 'utf8', env, windowsHide: true });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('_ed.py ở gốc ⇒ đỏ, nêu .scratch/', () => {
  const r = run(['_ed.py']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /_ed\.py/);
  assert.match(r.out, /\.scratch\//);
});

test('docs/k2-tmp/a.mjs ⇒ đỏ', () => {
  const r = run(['docs/k2-tmp/a.mjs']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /k2-tmp\/a\.mjs/);
});

test('tệp gốc lạ foo.txt ⇒ đỏ, nêu ROOT_ALLOW', () => {
  const r = run(['foo.txt']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /ROOT_ALLOW/);
});

test('mẫu cũ vẫn chạy: docs/x-insert.md ⇒ đỏ', () => {
  assert.equal(run(['docs/x-insert.md']).code, 1);
});

test('bench/vs-claude/results/x/_FINAL.txt ⇒ xanh (mẫu loại trừ)', () => {
  const r = run(['bench/vs-claude/results/x/_FINAL.txt']);
  assert.equal(r.code, 0, r.out);
});

test('bench/vs-claude/tasks/t/tmp_old/a.txt ⇒ xanh (mẫu loại trừ)', () => {
  const r = run(['bench/vs-claude/tasks/t/tmp_old/a.txt']);
  assert.equal(r.code, 0, r.out);
});

test('README.md và các tệp gốc cho phép ⇒ xanh', () => {
  const r = run(['README.md', 'package.json', 'tsconfig.json', 'src/a.ts']);
  assert.equal(r.code, 0, r.out);
});

test('tệp trong allow.json ⇒ xanh', () => {
  const r = run(['foo.txt'], [{ rule: 'stray-files', file: 'foo.txt', anchor: 'tệp lạ ở gốc', reason: 'thử ngoại lệ', by: 'test' }]);
  assert.equal(r.code, 0, r.out);
});
