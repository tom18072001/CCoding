#!/usr/bin/env node
// Kiểm hạ tầng cho kịch bản e78-run.ps1. Chỉ đọc trường hạ tầng (status, promptSha, tools, maxConcSubtasks); không đọc verdict, điểm hay token.
//   node e78-check.mjs smoke <runs.jsonl> <id>      → OK | FAIL <lý do>
//   node e78-check.mjs smokecount <runs.jsonl> <id> → "<số arm R1/R3 đã done> 2"
//   node e78-check.mjs e7 <runs.jsonl> <selected.json> → "<done> <cần>"
//   node e78-check.mjs e8 <runs.jsonl> <cần>          → "<done> <cần>"
//   node e78-check.mjs b6w1 <runs.jsonl>              → số lượt B6w1 có ≥ 2 hạng mục chạy cùng lúc
import fs from 'node:fs';

const rows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : []);
const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'smoke') {
  const rs = rows(a).filter((r) => r.id === b && r.status === 'done');
  const r1 = rs.findLast((r) => r.arm === 'R1'), r3 = rs.findLast((r) => r.arm === 'R3');
  const why = !r1 ? 'thiếu R1 done' : !r3 ? 'thiếu R3 done' : !r1.promptSha || r1.promptSha !== r3.promptSha ? 'promptSha R1 khác R3' : JSON.stringify(r1.tools) !== JSON.stringify(['Read', 'Glob', 'Grep', 'Bash']) ? `tools R1 = ${JSON.stringify(r1.tools)}` : r3.tools !== 'Read,Glob,Grep,Bash' ? `tools R3 = ${r3.tools}` : null;
  console.log(why ? `FAIL ${why}` : 'OK');
} else if (cmd === 'smokecount') {
  console.log(`${new Set(rows(a).filter((r) => r.id === b && r.status === 'done' && (r.arm === 'R1' || r.arm === 'R3')).map((r) => r.arm)).size} 2`);
} else if (cmd === 'e7') {
  const sel = JSON.parse(fs.readFileSync(b, 'utf8')).items;
  const want = new Set(sel.flatMap((id) => ['R1', 'R2', 'R3'].map((arm) => `${id}__${arm}`)));
  const done = new Set(rows(a).filter((r) => r.status === 'done' && want.has(`${r.id}__${r.arm}`)).map((r) => `${r.id}__${r.arm}`));
  console.log(`${done.size} ${want.size}`);
} else if (cmd === 'e8') {
  console.log(`${new Set(rows(a).filter((r) => r.status === 'done').map((r) => r.key)).size} ${b}`);
} else if (cmd === 'b6w1') {
  console.log(rows(a).filter((r) => r.status === 'done' && r.arm === 'B6w1' && (r.maxConcSubtasks ?? 0) >= 2).length);
} else { console.error('lệnh: smoke | e7 | e8 | b6w1'); process.exit(2); }
