#!/usr/bin/env node
// E9-lite [Khám phá] (BRIEF-24 K2): gán nhãn "chia được"/"không chia được" TẤT ĐỊNH từ gold.json.
// Quy tắc chép NGUYÊN VĂN từ docs/research/preregistration.md §9 mục "Sai lệch E9 → E9-lite" (3). Không đổi quy tắc khi nhãn suy biến.
// Dùng: node docs/research/analysis/e9lite-labels.mjs [--gold <gold.json>] [--out <labels.json>]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// task: phần tử của gold.json.tasks; trả 'chia_duoc' | 'khong_chia_duoc'
// B1 (sửa sau khi thấy gold, TRƯỚC khi thấy kế hoạch): chỉ tệp có change ∈ {added, modified}; 'deleted' là vật phẩm của ref/ dạng chép đè.
export const changedFiles = (task) => task.files.filter((f) => f.change === 'added' || f.change === 'modified');
export const changedModules = (task) => [...new Set(changedFiles(task).map((f) => f.module))].sort();
export const label = (task) => (changedModules(task).length >= 2 ? 'chia_duoc' : 'khong_chia_duoc');
// §9 (S2) độ nhạy: mod2Of = hai đoạn đầu khi đoạn đầu là src và có ≥ 3 đoạn; còn lại như thư mục cấp một. Không thay nhãn chính.
export const modOf = (p) => { const i = p.indexOf('/'); return i < 0 ? '.' : p.slice(0, i); };
export const mod2Of = (p) => { const s = p.split('/'); return s[0] === 'src' && s.length >= 3 ? `src/${s[1]}` : modOf(p); };
export const changedModules2 = (task) => [...new Set(changedFiles(task).map((f) => mod2Of(f.path)))].sort();
export const label2 = (task) => (changedModules2(task).length >= 2 ? 'chia_duoc' : 'khong_chia_duoc');

export function buildLabels(gold) {
  const labels = {};
  for (const t of gold.tasks) {
    labels[t.id] = { label: label(t), moduleCount: changedModules(t).length, fileCount: changedFiles(t).length, deletedIgnored: t.files.length - changedFiles(t).length, modules: changedModules(t), sensitivity: { label: label2(t), moduleCount: changedModules2(t).length, modules: changedModules2(t) } };
  }
  const counts = { chia_duoc: 0, khong_chia_duoc: 0 };
  for (const v of Object.values(labels)) counts[v.label]++;
  const degenerate = counts.chia_duoc === 0 || counts.khong_chia_duoc === 0;
  const counts2 = { chia_duoc: 0, khong_chia_duoc: 0 };
  for (const v of Object.values(labels)) counts2[v.sensitivity.label]++;
  return { version: 1, rule: 'chia_duoc ⇔ số module khác nhau của files[] có change ∈ {added, modified} ≥ 2 (tệp ở gốc = module "."; deleted bị bỏ, B1)', goldSha256: gold.sha256, taskCount: gold.tasks.length, counts, degenerate, sensitivityCounts: counts2, labels };
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
