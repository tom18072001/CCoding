import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isWorktreeOf } from '../src/git.js';
import { samePath } from '../src/tools/guard-paths.js';

// K3: runner Windows của GitHub có TEMP dạng 8.3 (`C:\Users\RUNNER~1\…`) còn git trả đường dẫn dài → so chuỗi thô sai.

/** Dạng 8.3 của một thư mục đang tồn tại (undefined nếu ổ đĩa tắt tạo tên ngắn hoặc không dịch được). */
function shortForm(dir: string): string | undefined {
  try {
    const out = execSync(`for %I in ("${dir}") do @echo %~sI`, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out && out.toLowerCase() !== dir.toLowerCase() ? out : undefined;
  } catch {
    return undefined;
  }
}

test('samePath: bỏ dấu phân cách cuối, ..; hoa/thường chỉ bỏ qua trên win32; đường dẫn chưa tồn tại vẫn so được', () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ccoding-sp-'));
  try {
    assert.ok(samePath(dir, dir + path.sep));
    assert.ok(samePath(dir, path.join(dir, 'x', '..')));
    assert.ok(!samePath(dir, path.join(dir, 'khac')));
    assert.ok(samePath(path.join(dir, 'chua-co', 'a'), path.join(dir, 'chua-co', '.', 'a')));
    assert.equal(samePath(dir, dir.toUpperCase()), process.platform === 'win32');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('samePath: dạng 8.3 và dạng dài của cùng thư mục là một (và thư mục con chưa tồn tại)', (t) => {
  if (process.platform !== 'win32') return t.skip('chỉ Windows có tên 8.3');
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ccoding-thu-muc-dai-'));
  try {
    const short = shortForm(dir);
    if (!short) return t.skip('ổ đĩa tắt tên 8.3 (fsutil 8dot3name) hoặc không dịch được');
    assert.notEqual(short.toLowerCase(), dir.toLowerCase());
    assert.ok(samePath(short, dir));
    assert.ok(samePath(path.join(short, 'moi', 'x'), path.join(dir, 'moi', 'x')));
    assert.ok(!samePath(short, path.join(dir, 'khac')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('isWorktreeOf: đúng với đường dẫn 8.3 của cùng repo; thư mục con của repo không phải worktree', (t) => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ccoding-thu-muc-dai-'));
  try {
    const repo = path.join(dir, 'repo');
    fs.mkdirSync(path.join(repo, 'sub'), { recursive: true });
    const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, stdio: 'ignore' });
    git('init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
    git('add', '-A');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
    assert.ok(isWorktreeOf(repo, repo));
    assert.ok(!isWorktreeOf(path.join(repo, 'sub'), repo));
    if (process.platform !== 'win32') return;
    const short = shortForm(repo);
    if (!short) return t.skip('ổ đĩa tắt tên 8.3 hoặc không dịch được');
    assert.ok(isWorktreeOf(short, repo), 'repo dạng 8.3 phải khớp git (toplevel dạng dài)');
    assert.ok(isWorktreeOf(repo, short));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
