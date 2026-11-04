// SR-15: nhãn `hypotheses` của task.json phản ánh bộ lọc của analyze.mjs (H1: coding/design và size >= 3; H2/H3/H4/H9 theo category).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TASKS = path.join(ROOT, 'tasks');
const tasks = fs.readdirSync(TASKS).filter((d) => fs.existsSync(path.join(TASKS, d, 'task.json'))).map((d) => JSON.parse(fs.readFileSync(path.join(TASKS, d, 'task.json'), 'utf8')));

const FILTER = {
  H1: (t) => ['coding', 'design'].includes(t.category) && t.size >= 3,
  H2: (t) => t.category === 'logic',
  H3: (t) => t.category === 'review',
  H4: (t) => t.category === 'requirements',
  H9: (t) => t.category === 'research',
};

test('SR-15: nhãn H1/H2/H3/H4/H9 trong hypotheses khớp bộ lọc của analyze.mjs', () => {
  assert.ok(tasks.length >= 25);
  for (const t of tasks.filter((x) => x.set !== 'exploratory')) for (const [h, pred] of Object.entries(FILTER)) assert.equal(t.hypotheses.includes(h), pred(t), `${t.id}: ${h} (category=${t.category}, size=${t.size})`);
});

test('SR-15: analyze.mjs vẫn dùng đúng bộ lọc H1 (coding/design, size >= 3)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'analyze.mjs'), 'utf8');
  assert.match(src, /\['coding', 'design'\]\.includes\(catOf\[t\]\) && sizeOf\[t\] >= 3/);
});

test('SR-11 / D6: bài exploratory không mang nhãn giả thuyết xác nhận (analyze.mjs loại chúng khỏi H1–H10)', () => {
  const ex = tasks.filter((t) => t.set === 'exploratory');
  assert.ok(ex.length >= 3);
  for (const t of ex) assert.deepEqual(t.hypotheses.filter((h) => /^H[0-9]/.test(h)), [], t.id);
});
