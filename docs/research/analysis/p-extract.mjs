#!/usr/bin/env node
// V4-3f-P: trích metadata song song của các nhiệm vụ đã chạy trên một server CCoding, CHỈ qua API đọc (GET).
// Không in và không ghi đề bài, tiêu đề, đầu ra hay nội dung tin nhắn. Mã nhiệm vụ và mã dự án được thay bằng nhãn băm.
// Từ bản ghi tin nhắn chỉ đếm số dòng khớp ba mẫu cố định (gộp xong, xung đột, làm lần lượt).
//   node docs/research/analysis/p-extract.mjs http://127.0.0.1:7420 <out.json>
import crypto from 'node:crypto';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:7420';
const out = process.argv[3] ?? 'prod-parallel.json';
const salt = crypto.randomBytes(8).toString('hex'); // không ghi ra: nhãn không đảo ngược được về mã thật
const label = (s) => crypto.createHash('sha256').update(salt + s).digest('hex').slice(0, 10);
const get = async (p) => { const r = await fetch(base + p); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };

export const PATTERNS = {
  merged: /🔀 Đã gộp S\d+/, // src/orchestrator.ts: gộp worktree con thành công
  conflict: /⚠️ S\d+ .*xung đột khi gộp/, // gộp worktree con gặp xung đột (hai dạng tin nhắn)
  serial: /🔒 Các hạng mục chạy lệnh .*làm lần lượt/, // không có worktree con: hạng mục chạy lệnh làm lần lượt
};

const projects = await get('/api/projects').catch(() => []);
const projList = Array.isArray(projects) ? projects : projects.projects ?? [];
const projIso = new Map(projList.map((p) => [p.id, { isolation: p.isolation ?? 'worktree', parallelWorktrees: p.parallelWorktrees, toolAccess: p.toolAccess, classification: p.classification }]));
const projLabel = new Map();
const pl = (id) => { if (!projLabel.has(id)) projLabel.set(id, `P${projLabel.size + 1}`); return projLabel.get(id); };

const list = await get('/api/tasks');
const tasks = Array.isArray(list) ? list : list.tasks ?? [];
const rows = [];
for (const t0 of tasks) {
  let detail;
  try { detail = await get(`/api/tasks/${encodeURIComponent(t0.id)}`); } catch { continue; }
  const t = detail.task ?? t0;
  const msgs = Array.isArray(detail.transcript) ? detail.transcript : [];
  const sys = msgs.filter((m) => m.from === 'system' || m.kind === 'system').map((m) => String(m.text ?? ''));
  const count = (re) => sys.filter((x) => re.test(x)).length;
  const p = projIso.get(t.projectId) ?? {};
  rows.push({
    task: label(t.id), project: t.projectId ? pl(t.projectId) : null, isolation: p.isolation ?? null, parallelWorktreesProject: p.parallelWorktrees ?? null,
    toolAccess: p.toolAccess ?? null, classification: t.classification ?? null, mode: t.mode, status: t.status, lane: t.lane ?? t.options?.lane ?? null,
    hasBranch: !!t.branch, createdAt: t.createdAt, startedAt: t.startedAt ?? null, finishedAt: t.finishedAt ?? null,
    checksLatest: Array.isArray(t.projectChecks?.latest) ? { n: t.projectChecks.latest.length, red: t.projectChecks.latest.filter((r) => !r.ok).length } : null,
    // sai lệch P-a (ghi sau khi thấy 11/47 kết thúc còn đỏ): tách đỏ có sẵn từ trước (baseline) khỏi đỏ mới; so theo tên lệnh, không ghi tên lệnh
    checksBaseline: Array.isArray(t.projectChecks?.baseline) ? { n: t.projectChecks.baseline.length, red: t.projectChecks.baseline.filter((r) => !r.ok && !r.denied).length } : null,
    checksNewRed: Array.isArray(t.projectChecks?.latest) ? t.projectChecks.latest.filter((r) => !r.ok && !r.denied && !(t.projectChecks.baseline ?? []).some((b) => b.command === r.command && !b.ok)).length : null,
    checksDenied: Array.isArray(t.projectChecks?.latest) ? t.projectChecks.latest.filter((r) => r.denied).length : null,
    msg: { merged: count(PATTERNS.merged), conflict: count(PATTERNS.conflict), serial: count(PATTERNS.serial), system: sys.length },
    runs: (t.runs ?? []).map((r) => ({
      department: r.department, status: r.status, startedAt: r.startedAt ?? null, finishedAt: r.finishedAt ?? null, escalatedFrom: r.escalatedFrom ?? null,
      subtasks: (r.subtasks ?? []).map((s) => ({
        id: s.id, status: s.status, startedAt: s.startedAt ?? null, finishedAt: s.finishedAt ?? null, dependsOn: s.dependsOn ?? [], attempts: s.attempts ?? null,
        conflict: s.conflict ? { files: (s.conflict.files ?? []).length, rounds: s.conflict.rounds ?? null, done: !!s.conflict.done } : null,
        mainOnly: !!s.mainOnly, mergePending: !!s.mergePending,
      })),
    })),
  });
}
fs.writeFileSync(out, JSON.stringify({ extractedAt: new Date().toISOString(), server: 'main', tasks: rows.length, projects: projLabel.size, rows }, null, 1));
console.log(`ghi ${rows.length} nhiệm vụ, ${projLabel.size} dự án → ${out}`);
