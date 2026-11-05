#!/usr/bin/env node
// Kiểm cổng của V4-3e-E5′ (preregistration.md §9) trên runs.jsonl của b15f-main. CHỈ đọc trường quy trình:
// arm, task, rep, status, byPhase (khóa và có/không discuss). KHÔNG đọc, KHÔNG in điểm, token hay thời gian.
// node check-e5f.mjs <runs.jsonl> --first   → Dừng 1 (B0F cặp đầu không họp) + kiểm nhiễu khóa byPhase
// node check-e5f.mjs <runs.jsonl>           → Dừng 2 (≥ 3/10 cặp bị loại theo (8) ở một bài)
// Exit 0: chạy tiếp; exit 10: dừng (lý do in ra); exit 2: lỗi đầu vào.
import fs from 'node:fs';
const [file, flag] = process.argv.slice(2);
if (!file || !fs.existsSync(file)) { console.log(JSON.stringify({ ok: false, error: 'thiếu runs.jsonl' })); process.exit(2); }
const VARIANT = new Set(['route', 'plan', 'discuss', 'finalize', 'execute', 'review', 'revise', 'synthesize', 'accept']);
// Sai lệch (3) 5/11: `review` là pha có điều kiện theo cổng B-02 (bỏ reviewer khi xanh), như `revise` — không còn là pha cấu trúc
const STRUCT = ['route', 'plan', 'execute', 'synthesize', 'accept'];
const rows = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => (r.arm === 'B0F' || r.arm === 'B1F') && r.status === 'done');
const key = (r) => `${r.task}|${r.rep}`;
const by = new Map();
for (const r of rows) { const k = key(r); if (!by.has(k)) by.set(k, {}); by.get(k)[r.arm] = Object.keys(r.byPhase ?? {}).filter((p) => (r.byPhase[p] ?? 0) > 0); }
const tasks = [...new Set(rows.map((r) => r.task))].sort();
const out = { ok: true, pairs: {}, excluded: {}, stop: [] };
for (const t of tasks) {
  const ps = [...by.entries()].filter(([k, v]) => k.startsWith(`${t}|`) && v.B0F && v.B1F);
  out.pairs[t] = ps.length;
  out.excluded[t] = ps.filter(([, v]) => !v.B0F.includes('discuss')).length;
}
if (flag === '--first') {
  for (const t of ['l1-modules', 'l2-chain']) {
    const v = by.get(`${t}|1`);
    if (!v || !v.B0F || !v.B1F) { out.stop.push(`${t}: cặp đầu chưa đủ hai arm`); continue; }
    if (!v.B0F.includes('discuss')) out.stop.push(`Dừng 1: ${t} B0F cặp đầu không có discuss`);
    for (const a of ['B0F', 'B1F']) for (const p of v[a]) if (!VARIANT.has(p)) out.stop.push(`nhiễu: ${t} ${a} có pha lạ ${p}`);
    for (const p of STRUCT) for (const a of ['B0F', 'B1F']) if (!v[a].includes(p)) out.stop.push(`nhiễu: ${t} ${a} thiếu pha cấu trúc ${p}`);
    const extra = v.B0F.filter((p) => !v.B1F.includes(p) && !['discuss', 'finalize', 'revise', 'review'].includes(p));
    if (extra.length) out.stop.push(`nhiễu: ${t} B1F mất thêm pha ${extra.join(',')}`);
    out[`phases_${t}`] = { B0F: v.B0F.join('/'), B1F: v.B1F.join('/') };
  }
} else {
  for (const t of tasks) if (out.excluded[t] >= 3) out.stop.push(`Dừng 2: ${t} có ${out.excluded[t]} cặp bị loại (≥ 3)`);
}
if (out.stop.length) out.ok = false;
console.log(JSON.stringify(out));
process.exit(out.ok ? 0 : 10);
