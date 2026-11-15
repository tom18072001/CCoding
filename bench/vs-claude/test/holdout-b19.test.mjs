// B-19 (CT-13, phần harness + đếm leak): dữ liệu giả, không chạy benchmark.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { leakCounts } from '../lib/queue.mjs';
import { startDir } from '../lib/workspace.mjs';

const SUITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = path.resolve(SUITE, '..', '..', 'docs', 'research', 'self-improvement', 'holdout-lock.json');

test('B-19: 10 bài giữ lại đều tìm được thư mục mã khởi đầu (starter/ hoặc repo/)', () => {
  const ids = Object.keys(JSON.parse(fs.readFileSync(LOCK, 'utf8')));
  assert.equal(ids.length, 10);
  for (const id of ids) {
    const d = startDir(path.join(SUITE, 'tasks', id));
    assert.ok(d && fs.existsSync(d), `${id}: không có starter/ hoặc repo/`);
  }
});

test('B-19: startDir ưu tiên starter/, rơi về repo/, thiếu cả hai → null', () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'b19-'));
  try {
    assert.equal(startDir(t), null);
    fs.mkdirSync(path.join(t, 'repo'));
    assert.equal(startDir(t), path.join(t, 'repo'));
    fs.mkdirSync(path.join(t, 'starter'));
    assert.equal(startDir(t), path.join(t, 'starter'));
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
});

test('B-19: leakCounts đếm theo nhánh { arm, leakRuns, totalRuns }, bỏ dòng infra, không mang nội dung', () => {
  const rows = [
    { arm: 'A', leak: false, status: 'done', details: 'bí mật' },
    { arm: 'A', leak: true, status: 'done' },
    { arm: 'B', leak: false, status: 'done' },
    { arm: 'B', leak: true, status: 'infra' },
  ];
  assert.deepEqual(leakCounts(rows), [{ arm: 'A', leakRuns: 1, totalRuns: 2 }, { arm: 'B', leakRuns: 0, totalRuns: 1 }]);
  assert.deepEqual(leakCounts([]), []);
});
