#!/usr/bin/env node
// Tạo bản sao runs.jsonl đã lọc theo §4.3 (cùng classifyRows với prereg-tests.mjs) cho analyze.mjs (run-plan.md §5.3).
// all/ = mọi lượt giữ lại; W1, W2a, W2b, W2c, B7a = từng cửa sổ (đúng cặp cùng cửa sổ của H5). Bản gốc không bị sửa.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRows, windowOf, WINDOWS } from './prereg-tests.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..', '..', '..', 'bench', 'vs-claude', 'results', 'study-cloud', 'runs.jsonl');
const rows = fs.readFileSync(src, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const { kept, excluded } = classifyRows(rows, { timeoutMin: 20 });
const write = (name, rs) => {
  const d = path.join(here, 'reconcile', name);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'runs.jsonl'), rs.map((r) => JSON.stringify(r) + '\n').join(''));
  console.log(`${name}: ${rs.length} dòng`);
};
write('all', kept);
for (const w of WINDOWS) write(w.id, kept.filter((r) => windowOf(r) === w.id));
console.log(`Bị loại: ${excluded.length}`);
