#!/usr/bin/env node
// E9-lite [Khám phá] (BRIEF-24 K2): gán nhãn "chia được"/"không chia được" TẤT ĐỊNH từ gold.json.
// Quy tắc chép NGUYÊN VĂN từ docs/research/preregistration.md §9 mục "Sai lệch E9 → E9-lite" (3). Không đổi quy tắc khi nhãn suy biến.
// Dùng: node docs/research/analysis/e9lite-labels.mjs [--gold <gold.json>] [--out <labels.json>]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// task: phần tử của gold.json.tasks; trả 'chia_duoc' | 'khong_chia_duoc'
export const label = (task) =>
  new Set(task.files.map((f) => f.module)).size >= 2 ? 'chia_duoc' : 'khong_chia_duoc';

export function buildLabels(gold) {
  const labels = {};
  for (const t of gold.tasks) {
    labels[t.id] = { label: label(t), moduleCount: new Set(t.files.map((f) => f.module)).size, fileCount: t.files.length, modules: [...new Set(t.files.map((f) => f.module))].sort() };
  }
  const counts = { chia_duoc: 0, khong_chia_duoc: 0 };
  for (const v of Object.values(labels)) counts[v.label]++;
  const degenerate = counts.chia_duoc === 0 || counts.khong_chia_duoc === 0;
  return { version: 1, rule: 'chia_duoc ⇔ số module khác nhau của files[] ≥ 2 (tệp ở gốc = module ".")', goldSha256: gold.sha256, taskCount: gold.tasks.length, counts, degenerate, labels };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const a = process.argv.slice(2);
  const opt = (n, d) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : d; };
  const gold = JSON.parse(readFileSync(opt('--gold', 'bench/vs-claude/results/e9lite/gold.json'), 'utf8'));
  const out = buildLabels(gold);
  writeFileSync(opt('--out', 'bench/vs-claude/results/e9lite/labels.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`nhãn: chia_duoc=${out.counts.chia_duoc}, khong_chia_duoc=${out.counts.khong_chia_duoc}${out.degenerate ? ' — PHÂN TẦNG SUY BIẾN (không đổi quy tắc)' : ''}`);
}
