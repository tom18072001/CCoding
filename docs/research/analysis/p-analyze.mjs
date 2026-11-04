#!/usr/bin/env node
// V4-3f-P: song song trong vận hành thật, từ tệp của p-extract.mjs. Chỉ mô tả, không p.
//   node docs/research/analysis/p-analyze.mjs <prod-parallel.json> [--json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ms = (a, b) => Date.parse(b) - Date.parse(a);
/** Độ dài hợp các khoảng [s, e] (ms). */
export function unionMs(iv) {
  const a = iv.filter(([s, e]) => e > s).sort((x, y) => x[0] - y[0]);
  let tot = 0, cs = -Infinity, ce = -Infinity;
  for (const [s, e] of a) { if (s > ce) { if (ce > cs) tot += ce - cs; cs = s; ce = e; } else ce = Math.max(ce, e); }
  if (ce > cs) tot += ce - cs;
  return tot;
}
/** Số khoảng chồng nhau tối đa. */
export function maxConcurrent(iv) {
  const ev = iv.flatMap(([s, e]) => [[s, 1], [e, -1]]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let c = 0, m = 0; for (const [, d] of ev) { c += d; m = Math.max(m, c); } return m;
}
/** Đường găng theo phụ thuộc (ms) với thời lượng đã đo: cận dưới của thời gian nếu song song không giới hạn. */
export function criticalPathMs(subs) {
  const dur = new Map(subs.map((s) => [s.id, ms(s.startedAt, s.finishedAt)]));
  const memo = new Map();
  const f = (id, seen = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (seen.has(id)) return 0; seen.add(id);
    const s = subs.find((x) => x.id === id); const deps = (s?.dependsOn ?? []).filter((d) => dur.has(d));
    const v = (dur.get(id) ?? 0) + Math.max(0, ...deps.map((d) => f(d, seen)));
    memo.set(id, v); return v;
  };
  return Math.max(0, ...subs.map((s) => f(s.id)));
}

export function runRows(data) {
  const out = [];
  for (const t of data.rows) for (const r of t.runs) {
    const subs = r.subtasks.filter((s) => s.startedAt && s.finishedAt && ms(s.startedAt, s.finishedAt) > 0);
    if (subs.length < 2) continue;
    const iv = subs.map((s) => [Date.parse(s.startedAt), Date.parse(s.finishedAt)]);
    const sum = iv.reduce((x, [s, e]) => x + (e - s), 0), span = unionMs(iv);
    const independentPairs = subs.some((a) => subs.some((b) => a !== b && !a.dependsOn.includes(b.id) && !b.dependsOn.includes(a.id)));
    out.push({
      task: t.task, project: t.project, isolation: t.isolation, taskStatus: t.status, runStatus: r.status, dept: r.department, n: subs.length,
      sumMin: sum / 60000, spanMin: span / 60000, critMin: criticalPathMs(subs) / 60000, overlap: sum / span, maxConc: maxConcurrent(iv), savedMin: (sum - span) / 60000,
      independentPairs, conflicts: r.subtasks.filter((s) => s.conflict).length, mainOnly: r.subtasks.filter((s) => s.mainOnly).length, mergePending: r.subtasks.filter((s) => s.mergePending).length,
      msgMerged: t.msg.merged, msgConflict: t.msg.conflict, msgSerial: t.msg.serial, checksRed: t.checksLatest?.red ?? null,
    });
  }
  return out;
}
/** Đếm từ tin nhắn là theo nhiệm vụ: mỗi nhiệm vụ một lần dù có nhiều lượt phòng. */
const uniq = (rs) => [...new Map(rs.map((r) => [r.task, r])).values()];
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); if (!s.length) return NaN; const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
export function summarize(rows) {
  const g = (rs) => ({
    runs: rs.length, tasks: new Set(rs.map((r) => r.task)).size, subtasks: rs.reduce((s, r) => s + r.n, 0),
    parallelRuns: rs.filter((r) => r.maxConc >= 2).length,
    overlap: { median: q(rs.map((r) => r.overlap), 0.5), q1: q(rs.map((r) => r.overlap), 0.25), q3: q(rs.map((r) => r.overlap), 0.75), max: Math.max(...rs.map((r) => r.overlap)) },
    sumMin: rs.reduce((s, r) => s + r.sumMin, 0), spanMin: rs.reduce((s, r) => s + r.spanMin, 0), savedMin: rs.reduce((s, r) => s + r.savedMin, 0),
    savedShare: rs.reduce((s, r) => s + r.savedMin, 0) / rs.reduce((s, r) => s + r.sumMin, 0),
    conflictSubtasks: rs.reduce((s, r) => s + r.conflicts, 0), mainOnly: rs.reduce((s, r) => s + r.mainOnly, 0), merges: uniq(rs).reduce((s, r) => s + r.msgMerged, 0), conflictMsgs: uniq(rs).reduce((s, r) => s + r.msgConflict, 0), serialMsgs: uniq(rs).reduce((s, r) => s + r.msgSerial, 0),
    endRed: rs.filter((r) => r.checksRed > 0).length, endChecked: rs.filter((r) => r.checksRed !== null).length,
  });
  const done = rows.filter((r) => r.runStatus === 'done');
  return { all: g(rows), done: g(done), byIsolation: Object.fromEntries([...new Set(rows.map((r) => r.isolation))].map((k) => [k, g(rows.filter((r) => r.isolation === k))])) };
}
export function report(s, data) {
  const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
  const L = [`Trích lúc ${data.extractedAt}: ${data.tasks} nhiệm vụ, ${data.projects} dự án (nhãn ẩn danh).`];
  for (const [k, g] of Object.entries({ 'mọi lượt phòng ≥ 2 hạng mục': s.all, 'lượt phòng xong (done)': s.done, ...Object.fromEntries(Object.entries(s.byIsolation).map(([k2, v]) => [`isolation = ${k2}`, v])) })) {
    L.push('', `**${k}:** ${g.runs} lượt phòng, ${g.tasks} nhiệm vụ, ${g.subtasks} hạng mục; có chạy chồng (≥ 2 cùng lúc): ${g.parallelRuns}/${g.runs}.`);
    L.push(`- Hệ số chồng Σ thời lượng / thời gian thực: trung vị ${f(g.overlap.median, 2)} (IQR ${f(g.overlap.q1, 2)}–${f(g.overlap.q3, 2)}, lớn nhất ${f(g.overlap.max, 2)}).`);
    L.push(`- Tổng thời lượng hạng mục ${f(g.sumMin, 0)} phút; thời gian thực của pha thực thi ${f(g.spanMin, 0)} phút; tiết kiệm nhờ chạy chồng ${f(g.savedMin, 0)} phút (${f(100 * g.savedShare)} %, cận trên).`);
    L.push(`- Gộp worktree con: ${g.merges} lần gộp xong; ${g.conflictMsgs} tin xung đột khi gộp; ${g.serialMsgs} nhiệm vụ báo "làm lần lượt"; ${g.conflictSubtasks} hạng mục còn ghi xung đột; ${g.mainOnly} hạng mục phải làm lại lần lượt; kết thúc còn lệnh kiểm tra đỏ: ${g.endRed}/${g.endChecked}.`);
  }
  return L.join('\n');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const rows = runRows(data); const s = summarize(rows);
  if (process.argv.includes('--json')) console.log(JSON.stringify({ summary: s, rows }, null, 1)); else console.log(report(s, data));
}
