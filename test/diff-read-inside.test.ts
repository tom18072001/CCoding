// D22 K2 — readInside dùng chuẩn đường dẫn của claude-guard (realpath, hoa/thường, dấu phân cách cuối, symlink/'..' ra ngoài).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readInside } from '../src/diff.js';

const LIMIT = 1024;

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-readinside-'));
  const dir = path.join(base, 'wt');
  const outside = path.join(base, 'ngoai');
  fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(dir, 'sub', 'a.txt'), 'trong');
  fs.writeFileSync(path.join(outside, 'bi-mat.txt'), 'ngoai');
  return { base, dir, outside };
}

function tryLink(target: string, link: string): boolean {
  try {
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch {
    return false;
  }
}

test('readInside: đọc được tệp trong thư mục, kể cả khi dir có dấu phân cách cuối', () => {
  const { base, dir } = setup();
  try {
    assert.equal(readInside(dir, 'sub/a.txt', LIMIT).buf?.toString(), 'trong');
    assert.equal(readInside(dir + path.sep, 'sub/a.txt', LIMIT).buf?.toString(), 'trong');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('readInside: ".." và đường dẫn tuyệt đối trỏ ra ngoài bị chặn', () => {
  const { base, dir, outside } = setup();
  try {
    assert.equal(readInside(dir, '../ngoai/bi-mat.txt', LIMIT).buf, undefined);
    assert.equal(readInside(dir, path.join(outside, 'bi-mat.txt'), LIMIT).buf, undefined);
    assert.equal(readInside(dir, '../wt-anh-em/x', LIMIT).buf, undefined);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

const canLink = (() => {
  const { base, dir, outside } = setup();
  try {
    return tryLink(outside, path.join(dir, 'probe'));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
})();

test('readInside: symlink/junction thư mục trong worktree trỏ ra ngoài bị chặn', { skip: !canLink && 'không tạo được symlink/junction (thiếu quyền hoặc hệ tệp)' }, () => {
  const { base, dir, outside } = setup();
  try {
    tryLink(outside, path.join(dir, 'lien-ket'));
    assert.equal(readInside(dir, 'lien-ket/bi-mat.txt', LIMIT).buf, undefined);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('readInside: Windows — khác hoa/thường vẫn là cùng thư mục', { skip: process.platform !== 'win32' && 'chỉ Windows: hệ tệp Linux/macOS phân biệt hoa/thường' }, () => {
  const { base, dir } = setup();
  try {
    assert.equal(readInside(dir.toUpperCase(), 'SUB/A.TXT', LIMIT).buf?.toString(), 'trong');
    assert.equal(readInside(dir.toLowerCase(), 'sub/a.txt', LIMIT).buf?.toString(), 'trong');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
