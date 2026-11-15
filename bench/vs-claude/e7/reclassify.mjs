#!/usr/bin/env node
// E7 (13/11/2026): phân loại lại các lượt R1/R2 có lượt gọi accept kết thúc bằng lỗi (vd. "Failed to authenticate. API Error: 403")
// mà harness cũ ghi là `done`/unparsed, vì CCoding dùng chính thông báo lỗi làm văn bản nghiệm thu. Theo luật hạ tầng của §9 E7 và
// như R3 (claude -p is_error → infra), đó là lỗi hạ tầng: ghi thêm một dòng `infra` sau dòng `done` để runner chạy lại cặp đó
// (run.mjs, e78-check.mjs và analyze.mjs lấy DÒNG CUỐI của cặp). Không đọc kết luận; chỉ đọc trường `error` của bản ghi lượt gọi.
//   node bench/vs-claude/e7/reclassify.mjs --out <results/e7-cto> --ccoding-data <thư mục data của app E7> [--apply]
// Không có --apply: chỉ in danh sách. Có --apply: ghi thêm dòng vào runs.jsonl (chạy lại an toàn: cặp đã có dòng sau không ghi nữa).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);

/** Các cặp cần phân loại lại: dòng cuối là done của R1/R2, và lượt gọi của nhiệm vụ có `error` khác rỗng. */
export function findMisclassified(rows, callsOf) {
  const lastOf = new Map();
  for (const r of rows) lastOf.set(`${r.id}__${r.arm}`, r);
  const out = [];
  for (const [k, r] of lastOf) {
    if (r.status !== 'done' || !['R1', 'R2'].includes(r.arm) || !r.taskId) continue;
    const err = callsOf(r.taskId).filter((c) => c.error).at(-1)?.error;
    if (err) out.push({ key: k, id: r.id, arm: r.arm, taskId: r.taskId, fromAt: r.at, error: String(err).slice(0, 300) });
  }
  return out;
}

export function reclassRow(m, now = new Date().toISOString()) {
  return { id: m.id, arm: m.arm, status: 'infra', infra: 'error', error: m.error, reclassified: { fromAt: m.fromAt, taskId: m.taskId, rule: 'accept-call-error' }, at: now };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const flag = (k) => { const i = argv.indexOf(`--${k}`); return i < 0 ? undefined : argv[i + 1]; };
  const out = flag('out'), data = flag('ccoding-data');
  if (!out || !data) { console.error('Dùng: --out <results/e7-cto> --ccoding-data <thư mục data của app> [--apply]'); process.exit(2); }
  const runsFile = path.join(path.resolve(out), 'runs.jsonl');
  const found = findMisclassified(jl(runsFile), (taskId) => jl(path.join(path.resolve(data), 'runs', taskId, 'calls.jsonl')));
  for (const m of found) console.log(`${m.key}\t${m.taskId}\t${m.fromAt}\t${m.error.slice(0, 90)}`);
  console.log(`${found.length} cặp`);
  if (argv.includes('--apply') && found.length) {
    const now = new Date().toISOString();
    fs.appendFileSync(runsFile, found.map((m) => `${JSON.stringify(reclassRow(m, now))}\n`).join(''));
    console.log(`đã ghi ${found.length} dòng infra vào ${path.basename(runsFile)}`);
  }
}
