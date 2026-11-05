import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addWorktree, git, resolveBase } from '../src/git.js';

/** Bare origin + bản clone trong thư mục tạm (tên có khoảng trắng để kiểm đường dẫn Windows). Không chạm remote thật. */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding git base '));
  const origin = path.join(root, 'origin.git');
  const clone = path.join(root, 'clone dir');
  const other = path.join(root, 'other dir');
  const run = (cwd: string, args: string[]) => {
    const r = git(cwd, ['-c', 'user.name=t', '-c', 'user.email=t@localhost', '-c', 'commit.gpgsign=false', ...args]);
    assert.ok(r.ok, `git ${args.join(' ')}: ${r.out}`);
    return r.out;
  };
  fs.mkdirSync(origin);
  run(origin, ['init', '--bare', '-b', 'main']);
  run(root, ['clone', origin, clone]);
  run(clone, ['checkout', '-B', 'main']);
  const commit = (dir: string, name: string) => {
    fs.writeFileSync(path.join(dir, name), name);
    run(dir, ['add', '-A']);
    run(dir, ['commit', '-m', name]);
    return run(dir, ['rev-parse', 'HEAD']).trim();
  };
  commit(clone, 'a.txt');
  run(clone, ['push', 'origin', 'main']);
  run(root, ['clone', origin, other]);
  return { root, origin, clone, other, run, commit, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('cục bộ đi sau origin → dùng origin/<baseRef>, không sửa nhánh cục bộ', () => {
  const s = setup();
  try {
    const remoteHead = s.commit(s.other, 'b.txt');
    s.run(s.other, ['push', 'origin', 'main']);
    const localBefore = s.run(s.clone, ['rev-parse', 'main']).trim();
    const r = resolveBase(s.clone, 'main');
    assert.equal(r.source, 'remote');
    assert.equal(r.ref, 'origin/main');
    assert.equal(r.commit, remoteHead);
    assert.equal(r.warning, undefined);
    assert.equal(s.run(s.clone, ['rev-parse', 'main']).trim(), localBefore);
    // worktree dựng từ base mới, đường dẫn có khoảng trắng
    const wt = path.join(s.root, 'work trees', 'wt task');
    const w = addWorktree(s.clone, wt, 'ccoding/x', r.ref);
    assert.ok(w.ok, w.out);
    assert.equal(s.run(wt, ['rev-parse', 'HEAD']).trim(), remoteHead);
  } finally {
    s.cleanup();
  }
});

test('bằng nhau → dùng nhánh cục bộ', () => {
  const s = setup();
  try {
    const head = s.run(s.clone, ['rev-parse', 'main']).trim();
    const r = resolveBase(s.clone, 'main');
    assert.deepEqual({ ref: r.ref, commit: r.commit, source: r.source, warning: r.warning }, { ref: 'main', commit: head, source: 'local', warning: undefined });
  } finally {
    s.cleanup();
  }
});

test('cục bộ chỉ đi trước → dùng nhánh cục bộ', () => {
  const s = setup();
  try {
    const head = s.commit(s.clone, 'local.txt');
    const r = resolveBase(s.clone, 'main');
    assert.equal(r.source, 'local');
    assert.equal(r.ref, 'main');
    assert.equal(r.commit, head);
  } finally {
    s.cleanup();
  }
});

test('lệch hai chiều → ném lỗi tiếng Việt, không tạo worktree', () => {
  const s = setup();
  try {
    s.commit(s.other, 'remote-only.txt');
    s.run(s.other, ['push', 'origin', 'main']);
    s.commit(s.clone, 'local-only.txt');
    assert.throws(() => resolveBase(s.clone, 'main'), /đã lệch nhau.*1 commit riêng/s);
    assert.equal(git(s.clone, ['worktree', 'list']).out.split('\n').length, 1);
  } finally {
    s.cleanup();
  }
});

test('remote trỏ tới đường dẫn không tồn tại → dùng local kèm cảnh báo', () => {
  const s = setup();
  try {
    const head = s.run(s.clone, ['rev-parse', 'main']).trim();
    s.run(s.clone, ['remote', 'set-url', 'origin', path.join(s.root, 'không tồn tại.git')]);
    const r = resolveBase(s.clone, 'main', 20_000);
    assert.equal(r.source, 'local');
    assert.equal(r.commit, head);
    assert.match(r.warning ?? '', /Không cập nhật được base từ remote/);
  } finally {
    s.cleanup();
  }
});

test('không có remote → hành vi cũ', () => {
  const s = setup();
  try {
    s.run(s.clone, ['remote', 'remove', 'origin']);
    const head = s.run(s.clone, ['rev-parse', 'main']).trim();
    const r = resolveBase(s.clone, 'main');
    assert.deepEqual({ ref: r.ref, commit: r.commit, source: r.source, warning: r.warning }, { ref: 'main', commit: head, source: 'local', warning: undefined });
  } finally {
    s.cleanup();
  }
});

test('baseRef là commit hash hoặc HEAD hoặc không đặt → hành vi cũ, không fetch', () => {
  const s = setup();
  try {
    const old = s.run(s.clone, ['rev-parse', 'HEAD']).trim();
    s.commit(s.other, 'b.txt');
    s.run(s.other, ['push', 'origin', 'main']);
    const byHash = resolveBase(s.clone, old);
    assert.deepEqual({ ref: byHash.ref, commit: byHash.commit, source: byHash.source, warning: byHash.warning }, { ref: old, commit: old, source: 'local', warning: undefined });
    assert.equal(resolveBase(s.clone, 'HEAD').source, 'local');
    assert.equal(resolveBase(s.clone, undefined).ref, 'HEAD');
    assert.equal(resolveBase(s.clone, 'HEAD').commit, old);
  } finally {
    s.cleanup();
  }
});
