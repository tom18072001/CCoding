// SR-13/16/17/18 (S5): bộ chấm. Không gọi LLM.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonJson, eq, gradeExact } from '../lib/grade.mjs';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `ccvb-${p}-`));
const put = (dir, rel, content) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof content === 'string' ? content : JSON.stringify(content)); };

test('SR-16: so JSON không phụ thuộc thứ tự khóa, vẫn phụ thuộc thứ tự mảng', () => {
  assert.equal(eq({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }), true);
  assert.equal(eq([1, 2], [2, 1]), false);
  assert.equal(eq({ a: 1 }, { a: 2 }), false);
  assert.deepEqual(Object.keys(canonJson({ z: 1, a: { y: 1, b: 2 } })), ['a', 'z']);
});

test('SR-16: gradeExact đúng khi schedule viết khác thứ tự khóa', () => {
  const hidden = tmp('h'), work = tmp('w');
  put(hidden, 'answer.json', { schedule: { Mon: 'Dung', Tue: 'Chi' }, startup_order: ['a', 'b'], n: 10 });
  put(work, 'answer.json', { n: 10, startup_order: ['a', 'b'], schedule: { Tue: 'Chi', Mon: 'Dung' } });
  const g = gradeExact({ workdir: work, hiddenDir: hidden, finalText: '', task: { deliverable: 'answer.json' } });
  assert.equal(g.score, 1);
  put(work, 'answer.json', { n: 10, startup_order: ['b', 'a'], schedule: { Tue: 'Chi', Mon: 'Dung' } });
  assert.equal(gradeExact({ workdir: work, hiddenDir: hidden, finalText: '', task: { deliverable: 'answer.json' } }).details.fields.startup_order, false);
});
