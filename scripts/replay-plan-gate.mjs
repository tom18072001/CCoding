#!/usr/bin/env node
/**
 * B-10 — Phát lại offline cổng phủ kế hoạch (src/plan-gate.ts) trên kết quả bộ đo. Không gọi LLM, chỉ đọc và in ra stdout.
 *
 * Cách chạy (Node ≥ 22), từ thư mục gốc repo:
 *   npm run build && node scripts/replay-plan-gate.mjs             # import từ dist/plan-gate.js
 *   node --experimental-strip-types scripts/replay-plan-gate.mjs   # chưa build: import thẳng src/plan-gate.ts
 *
 * Đọc: bench/vs-claude/results/C<n>/<lượt>/ccoding-task.json → brief, runs[].planSummary, runs[].subtasks.
 * Tên vai (agentIds) lấy từ tên tệp trong agents/**.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const resultsDir = path.join(root, 'bench', 'vs-claude', 'results');

async function loadGate() {
  const dist = path.join(root, 'dist', 'plan-gate.js');
  if (fs.existsSync(dist)) return import(pathToFileURL(dist).href);
  return import(pathToFileURL(path.join(root, 'src', 'plan-gate.ts')).href);
}

function agentIds(dir) {
  const ids = [];
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ids.push(...agentIds(p));
    else if (e.name.endsWith('.md')) ids.push(e.name.slice(0, -3));
  }
  return ids;
}

if (!fs.existsSync(resultsDir)) {
  console.error(`Không thấy ${resultsDir} — chạy từ thư mục gốc repo.`);
  process.exit(2);
}
const { planGate } = await loadGate();
const ids = agentIds(path.join(root, 'agents'));
const files = [];
for (const c of fs.readdirSync(resultsDir).filter((d) => /^C\d+$/.test(d)).sort()) {
  for (const r of fs.readdirSync(path.join(resultsDir, c)).sort()) {
    const f = path.join(resultsDir, c, r, 'ccoding-task.json');
    if (fs.existsSync(f)) files.push({ c, r, f });
  }
}

let total = 0;
const blocked = [];
for (const { c, r, f } of files) {
  const task = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const [i, run] of (task.runs ?? []).entries()) {
    total++;
    const g = planGate({ brief: task.brief ?? '', planSummary: run.planSummary ?? '', subtasks: run.subtasks ?? [], agentIds: ids });
    if (!g.blocked) continue;
    blocked.push({ name: `${c}/${r}`, run: i, g });
    console.log(`CHẶN ${c}/${r} (run ${i}) — quy tắc ${g.rules.join('+')}`);
    for (const reason of g.reasons) console.log(`    ${reason}`);
  }
}
const T5 = 'C9/t5-logq.ccoding-fastlane.2';
const T1 = 'C9/t1-duration.ccoding-fastlane.3';
const t5 = blocked.find((b) => b.name === T5);
const t1 = blocked.find((b) => b.name === T1);
console.log(`\nTổng kết: đọc ${files.length} tệp ccoding-task.json (${total} lượt), chặn ${blocked.length}.`);
for (const b of blocked) console.log(`  - ${b.name}: ${b.g.rules.join('+')}`);
console.log(`t5 C9 lượt 2: ${t5 ? `bị chặn bởi ${t5.g.rules.join('+')}` : 'KHÔNG bị chặn'}`);
console.log(`t1 C9 lượt 3: ${t1 ? 'BỊ CHẶN NHẦM' : 'không bị chặn'}`);
console.log(`Chặn ngoài t5: ${blocked.filter((b) => b.name !== T5).length} (chỉ tiêu ≤ 1)`);
