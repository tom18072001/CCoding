// V4-3f khối B: harness chạy được cách ly worktree như vận hành thật; thư mục chấm về đúng commit cuối của nhánh nhiệm vụ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkoutTaskBranch } from '../lib/ccoding.mjs';

const git = (cwd, ...a) => { const r = spawnSync('git', a, { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };

test('checkoutTaskBranch: nhánh đang mở ở worktree khác vẫn đưa được thư mục chấm về commit cuối', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v43f-iso-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  git(repo, 'init', '-q'); fs.writeFileSync(path.join(repo, 'a.js'), 'base\n'); git(repo, 'add', '-A'); git(repo, '-c', 'user.name=b', '-c', 'user.email=b@l', 'commit', '-qm', 'base');
  const wt = path.join(root, 'wt');
  git(repo, 'worktree', 'add', '-q', '-b', 'ccoding/t-1', wt);
  fs.writeFileSync(path.join(wt, 'a.js'), 'xong\n'); fs.mkdirSync(path.join(wt, 'src')); fs.writeFileSync(path.join(wt, 'src', 'b.js'), 'moi\n');
  git(wt, 'add', '-A'); git(wt, '-c', 'user.name=b', '-c', 'user.email=b@l', 'commit', '-qm', 'task');
  const r = checkoutTaskBranch(repo, 'ccoding/t-1');
  assert.equal(r.ok, true, r.note);
  assert.equal(fs.readFileSync(path.join(repo, 'a.js'), 'utf8'), 'xong\n');
  assert.equal(fs.readFileSync(path.join(repo, 'src', 'b.js'), 'utf8'), 'moi\n');
  assert.equal(checkoutTaskBranch(repo, undefined).ok, false);
  assert.equal(checkoutTaskBranch(repo, 'khong-co').ok, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('run.mjs: --isolation mặc định none, giá trị lạ bị từ chối; arm có thể đặt isolation riêng', () => {
  const src = fs.readFileSync(new URL('../run.mjs', import.meta.url), 'utf8');
  assert.match(src, /isolation: flag\('isolation', 'none'\)/);
  assert.match(src, /isolation: spec\.isolation \?\? cfg\.isolation/);
  const r = spawnSync(process.execPath, [new URL('../run.mjs', import.meta.url).pathname, '--isolation', 'abc', '--arms', 'A0-sonnet', '--tasks', 't1-duration'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /--isolation phải là none hoặc worktree/);
});
