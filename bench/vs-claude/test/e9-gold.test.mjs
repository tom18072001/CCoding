import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../e9/gold-from-solution.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'e9-gold');

test('e9-gold: danh sách tệp, loại thay đổi, số dòng, module', () => {
  const r = build(dir);
  assert.deepEqual(r.tasks.map((t) => t.id), ['x1-full', 'x2-nosize']); // x3 thiếu solutionDir bị bỏ
  const t = r.tasks[0];
  assert.equal(t.size, 2);
  assert.equal(t.sizeBasis, 'co so thu');
  const got = t.files.map((f) => [f.path, f.change, f.linesAdded, f.linesRemoved, f.module]);
  assert.deepEqual(got, [
    ['api/new.js', 'added', 3, 0, 'api'],
    ['lib/gone.js', 'deleted', 0, 2, 'lib'],
    ['root.txt', 'modified', 1, 0, '.'], // CRLF→LF, thêm r3; crlf.txt chỉ khác CRLF nên bị bỏ
    ['src/mod.js', 'modified', 2, 1, 'src'],
  ]);
  assert.deepEqual(t.modules, ['.', 'api', 'lib', 'src']);
});

test('e9-gold: thiếu size/sizeBasis ghi null', () => {
  const t = build(dir).tasks[1];
  assert.equal(t.size, null);
  assert.equal(t.sizeBasis, null);
  assert.equal(t.files.length, 1);
});

test('e9-gold: hai lần chạy cùng sha256', () => {
  const a = build(dir);
  const b = build(dir);
  assert.match(a.sha256, /^[0-9a-f]{64}$/);
  assert.equal(a.sha256, b.sha256);
});
