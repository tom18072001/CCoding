#!/usr/bin/env node
// Chỉ số cấu trúc của quyết định chia việc (kế hoạch của trưởng phòng) trên dữ liệu vận hành — không gọi LLM, chỉ đọc.
// Đầu vào (tham số): --p <tệp JSON trích từ server chính, dạng {rows:[{project, runs:[{department, subtasks:[…]}]}]}>
//                    --office <thư mục runs/ của văn phòng phụ, mỗi nhiệm vụ một thư mục có task.json, calls.jsonl>
//                    --out <tệp JSON tổng hợp>   [--rows <tệp JSONL từng lượt phòng — KHÔNG commit, dữ liệu vận hành>]
// Đầu ra --out chỉ có số tổng hợp (không tiêu đề, không đề bài, không mã nhiệm vụ) để đưa vào repo công khai.
import fs from 'node:fs';
import path from 'node:path';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const pFile = arg('--p');
const officeDir = arg('--office');
const outFile = arg('--out');
const rowsFile = arg('--rows');
if (!outFile || (!pFile && !officeDir)) {
  console.error('Cách dùng: node decomp-metrics.mjs [--p <tệp>] [--office <thư mục runs>] --out <tệp> [--rows <tệp jsonl>]');
  process.exit(2);
}

const ms = (s) => (s ? Date.parse(s) : NaN);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);

/** Chỉ số của một lượt phòng (một kế hoạch). */
function runMetrics(subtasks) {
  const subs = subtasks ?? [];
  const n = subs.length;
  const ids = new Set(subs.map((s) => s.id));
  const deps = new Map(subs.map((s) => [s.id, (s.dependsOn ?? []).filter((d) => ids.has(d))]));
  const roots = subs.filter((s) => !(deps.get(s.id) ?? []).length).length;
  const edges = [...deps.values()].reduce((a, d) => a + d.length, 0);
  // độ sâu (số hạng mục trên chuỗi phụ thuộc dài nhất)
  const depthMemo = new Map();
  const depth = (id, seen = new Set()) => {
    if (depthMemo.has(id)) return depthMemo.get(id);
    if (seen.has(id)) return 1; // vòng (không mong đợi) — cắt
    seen.add(id);
    const v = 1 + Math.max(0, ...(deps.get(id) ?? []).map((d) => depth(d, seen)));
    depthMemo.set(id, v);
    return v;
  };
  const maxDepth = n ? Math.max(...subs.map((s) => depth(s.id))) : 0;
  const timed = subs.filter((s) => Number.isFinite(ms(s.startedAt)) && Number.isFinite(ms(s.finishedAt)) && ms(s.finishedAt) >= ms(s.startedAt));
  const dur = new Map(timed.map((s) => [s.id, (ms(s.finishedAt) - ms(s.startedAt)) / 1000]));
  const allTimed = timed.length === n && n > 0;
  let work = null, span = null, cp = null, maxConc = null, longestShare = null, imbalance = null;
  if (timed.length) {
    work = [...dur.values()].reduce((a, b) => a + b, 0);
    span = (Math.max(...timed.map((s) => ms(s.finishedAt))) - Math.min(...timed.map((s) => ms(s.startedAt)))) / 1000;
    const ev = timed.flatMap((s) => [[ms(s.startedAt), 1], [ms(s.finishedAt), -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let c = 0; maxConc = 0;
    for (const [, d] of ev) { c += d; maxConc = Math.max(maxConc, c); }
    const ds = [...dur.values()];
    longestShare = work > 0 ? Math.max(...ds) / work : null;
    const med = median(ds);
    imbalance = med > 0 ? Math.max(...ds) / med : null;
    if (allTimed) {
      const cpMemo = new Map();
      const cpOf = (id, seen = new Set()) => {
        if (cpMemo.has(id)) return cpMemo.get(id);
        if (seen.has(id)) return 0;
        seen.add(id);
        const v = (dur.get(id) ?? 0) + Math.max(0, ...(deps.get(id) ?? []).map((d) => cpOf(d, seen)));
        cpMemo.set(id, v);
        return v;
      };
      cp = Math.max(...subs.map((s) => cpOf(s.id)));
    }
  }
  const attempts = subs.map((s) => s.attempts ?? 1);
  return {
    n, roots, edges, maxDepth,
    structuralWidth: maxDepth ? n / maxDepth : null, // song song tối đa theo cấu trúc (trung bình theo tầng)
    timed: timed.length, allTimed,
    workSec: r3(work), spanSec: r3(span), cpSec: r3(cp), maxConc,
    achievedSpeedup: work != null && span > 0 ? r3(work / span) : null, // Σ thời lượng / thời gian khâu làm việc
    potentialSpeedup: cp > 0 ? r3(work / cp) : null, // Σ thời lượng / đường găng theo phụ thuộc
    slackOverCp: cp > 0 && span != null ? r3(span / cp - 1) : null, // thời gian vượt đường găng (lập lịch, chờ gộp, giới hạn luồng)
    longestShare: r3(longestShare), imbalance: r3(imbalance),
    reworkShare: n ? r3(attempts.filter((a) => a > 1).length / n) : null,
    failedShare: n ? r3(subs.filter((s) => s.status === 'failed').length / n) : null,
    conflicts: subs.filter((s) => s.conflict).length,
  };
}

/** Mã hạng mục trong đề bài (K1…, **K2 —**) và vai được nêu trên cùng dòng; độ phủ trong kế hoạch. Không xuất chữ. */
function briefItems(brief, subtasks, agentIds) {
  const items = new Map();
  for (const line of String(brief ?? '').split(/\r?\n/)) {
    const m = /^\s*(?:#{1,6}\s*)?(?:[-*]\s*)?\**\s*(K\d{1,2})\s*(?:—|-|:|–)/.exec(line);
    if (!m) continue;
    const roles = agentIds.filter((a) => new RegExp(`(^|[^\\w-])@?${a}([^\\w-]|$)`).test(line));
    const skip = /không làm|chờ giám đốc/i.test(line) && !/^\s*\**\s*K\d+\s*—\s*[\w-]+\s*[:(]/.test(line);
    if (!items.has(m[1])) items.set(m[1], { roles, skip });
  }
  const text = (s) => `${s.title ?? ''}\n${s.description ?? ''}`;
  let covered = 0, roleNeeded = 0, roleCovered = 0;
  for (const [k, it] of items) {
    if (it.skip) continue;
    const hits = subtasks.filter((s) => new RegExp(`\\b${k}\\b`).test(text(s)));
    if (hits.length) covered++;
    if (it.roles.length) {
      roleNeeded++;
      if (hits.some((s) => it.roles.includes(s.assignee))) roleCovered++;
    }
  }
  const active = [...items.values()].filter((i) => !i.skip).length;
  return { items: active, covered, roleNeeded, roleCovered };
}

const rows = [];

if (pFile) {
  const d = JSON.parse(fs.readFileSync(pFile, 'utf8'));
  for (const t of d.rows ?? []) {
    if (t.status !== 'done') continue;
    for (const r of t.runs ?? []) rows.push({ source: 'P', department: r.department ?? null, lane: t.lane ?? null, ...runMetrics(r.subtasks) });
  }
}

if (officeDir) {
  const agentIds = ['peer-reviewer', 'code-reviewer', 'qa-tester', 'academic-writer', 'data-scientist', 'methodologist', 'literature-researcher', 'research-lead',
    'dev-lead', 'backend-dev', 'frontend-dev', 'senior-swe', 'security', 'devops', 'data-engineer', 'tech-writer', 'solution-architect', 'business-analyst', 'ba-presales'];
  for (const dir of fs.readdirSync(officeDir)) {
    const f = path.join(officeDir, dir, 'task.json');
    if (!fs.existsSync(f)) continue;
    const t = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (t.status !== 'done') continue;
    let calls = [];
    const cf = path.join(officeDir, dir, 'calls.jsonl');
    if (fs.existsSync(cf)) calls = fs.readFileSync(cf, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const planModels = [...new Set(calls.filter((c) => c.phase === 'plan').map((c) => c.model))];
    const acc = t.acceptance ?? {};
    const crit = Array.isArray(acc.criteria) ? acc.criteria : [];
    const critFail = crit.filter((c) => !/^(đạt|pass|ok)/i.test(String(c.result ?? c.verdict ?? c.status ?? ''))).length;
    for (const r of t.runs ?? []) {
      const reviewSkipped = /không thuộc diện bắt buộc review/i.test(r.review?.summary ?? '');
      rows.push({
        source: 'office', department: r.department ?? null, lane: t.lane ?? null,
        ...runMetrics(r.subtasks),
        planModels,
        planGateBlocked: !!(r.planGate?.rules?.length), replanned: !!r.planGate?.replanned,
        reviewSkipped, reviewApproved: r.review ? !!r.review.approved : null,
        accepted: acc.parsed ? !!acc.accepted : null, criteria: crit.length || null, criteriaNotPassed: crit.length ? critFail : null,
        brief: briefItems(t.brief, r.subtasks ?? [], agentIds),
        tokens: t.usage ? (t.usage.input ?? 0) + (t.usage.output ?? 0) + (t.usage.cacheRead ?? 0) + (t.usage.cacheWrite ?? 0) : null,
      });
    }
  }
}

const summarize = (rs) => {
  const pick = (k) => rs.map((r) => r[k]).filter((x) => x != null && Number.isFinite(x));
  const stat = (k) => { const a = pick(k); return a.length ? { n: a.length, median: r3(median(a)), q1: r3(q(a, 0.25)), q3: r3(q(a, 0.75)), min: r3(Math.min(...a)), max: r3(Math.max(...a)) } : null; };
  const nDist = {};
  for (const r of rs) nDist[r.n] = (nDist[r.n] ?? 0) + 1;
  return {
    runs: rs.length,
    subtasksPerPlan: stat('n'), subtasksDistribution: nDist,
    singleSubtaskPlans: rs.filter((r) => r.n === 1).length,
    roots: stat('roots'), maxDepth: stat('maxDepth'), structuralWidth: stat('structuralWidth'),
    maxConc: stat('maxConc'), achievedSpeedup: stat('achievedSpeedup'), potentialSpeedup: stat('potentialSpeedup'),
    slackOverCp: stat('slackOverCp'), longestShare: stat('longestShare'), imbalance: stat('imbalance'),
    reworkShare: stat('reworkShare'), failedShare: stat('failedShare'),
    conflicts: rs.reduce((a, r) => a + (r.conflicts ?? 0), 0),
    plansWithLongestShareOver50pct: rs.filter((r) => r.longestShare != null && r.longestShare > 0.5).length,
    plansWithAnyParallel: rs.filter((r) => (r.maxConc ?? 0) >= 2).length,
  };
};

const groups = {};
for (const r of rows) {
  for (const key of [r.source, `${r.source}/${r.department ?? 'không rõ'}`]) (groups[key] ??= []).push(r);
}
const out = { generatedAt: new Date().toISOString(), script: 'docs/research/analysis/decisions/decomp-metrics.mjs', note: 'Chỉ số tổng hợp; không có đề bài, tiêu đề hay mã nhiệm vụ. Dữ liệu từng lượt không nằm trong repo.', groups: {} };
for (const [k, rs] of Object.entries(groups)) out.groups[k] = summarize(rs);
const off = rows.filter((r) => r.source === 'office');
if (off.length) {
  out.office = {
    runs: off.length,
    planModels: off.reduce((m, r) => { for (const x of r.planModels ?? []) m[x] = (m[x] ?? 0) + 1; return m; }, {}),
    planGateBlocked: off.filter((r) => r.planGateBlocked).length, replanned: off.filter((r) => r.replanned).length,
    reviewSkipped: off.filter((r) => r.reviewSkipped).length,
    acceptedTasks: off.filter((r) => r.accepted === true).length, notAcceptedTasks: off.filter((r) => r.accepted === false).length,
    briefItems: off.reduce((a, r) => a + (r.brief?.items ?? 0), 0),
    briefItemsCovered: off.reduce((a, r) => a + (r.brief?.covered ?? 0), 0),
    briefRoleItems: off.reduce((a, r) => a + (r.brief?.roleNeeded ?? 0), 0),
    briefRoleItemsCovered: off.reduce((a, r) => a + (r.brief?.roleCovered ?? 0), 0),
  };
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
if (rowsFile) fs.writeFileSync(rowsFile, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`Đã ghi ${outFile}: ${rows.length} lượt phòng (${Object.keys(groups).join(', ')})`);
