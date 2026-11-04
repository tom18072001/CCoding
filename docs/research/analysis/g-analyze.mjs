#!/usr/bin/env node
// V4-3f-G: phân tích đầu ra của g-mutation.mjs. Không p nào vào họ Holm. Một phép kiểm duy nhất (G-3Δ).
//   node docs/research/analysis/g-analyze.mjs <out.jsonl> [--seed 20261104] [--B 4000] [--M 10000] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rng } from './g-mutation.mjs';

export const GROUP_A = ['A0-sonnet'];
export const GROUP_C = ['B0', 'B5', 'B6', 'B7'];
export const groupOf = (arm) => (GROUP_A.includes(arm) ? 'A' : GROUP_C.includes(arm) ? 'C' : null);

// Clopper–Pearson 95 % hai phía bằng chia đôi trên CDF nhị thức (như b02m-replay.mjs).
function binomCdf(k, n, p) { let s = 0, t = Math.pow(1 - p, n); for (let i = 0; i <= k; i++) { s += t; t = t * (n - i) / (i + 1) * (p / (1 - p)); } return s; }
export function cp(k, n, a = 0.05) {
  if (!n) return [NaN, NaN];
  const bis = (f) => { let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m)) hi = m; else lo = m; } return (lo + hi) / 2; };
  const lo = k === 0 ? 0 : bis((p) => 1 - binomCdf(k - 1, n, p) >= a / 2);
  const hi = k === n ? 1 : bis((p) => binomCdf(k, n, p) <= a / 2);
  return [lo, hi];
}

export function load(file) {
  const rows = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const base = rows.filter((r) => r.type === 'base');
  const mut = rows.filter((r) => r.type === 'mut');
  const missing = rows.filter((r) => r.type === 'missing');
  const meta = rows.filter((r) => r.type === 'meta');
  return { base, mut, missing, meta };
}

/** Tổng hợp theo lượt: số lỗi thật, số bị cổng chặn. */
export function perRun(mut) {
  const m = new Map();
  for (const r of mut) {
    if (!m.has(r.key)) m.set(r.key, { key: r.key, task: r.task, arm: r.arm, real: 0, caught: 0, mutants: 0 });
    const x = m.get(r.key); x.mutants++;
    if (r.real) { x.real++; if (r.vRed) x.caught++; }
  }
  return [...m.values()];
}
const recall = (runs) => { const real = runs.reduce((s, r) => s + r.real, 0); return real ? runs.reduce((s, r) => s + r.caught, 0) / real : NaN; };

/** Bootstrap hai tầng: lấy lại bài, rồi lấy lại lượt trong bài. f(runs) → số. */
export function bootstrap2(runs, f, B, seed) {
  const byTask = groupBy(runs, (r) => r.task); const tasks = [...byTask.keys()].sort();
  const rnd = rng(seed); const vals = [];
  for (let b = 0; b < B; b++) {
    const pick = [];
    for (let i = 0; i < tasks.length; i++) {
      const rs = byTask.get(tasks[Math.floor(rnd() * tasks.length)]);
      for (let j = 0; j < rs.length; j++) pick.push(rs[Math.floor(rnd() * rs.length)]);
    }
    const v = f(pick); if (Number.isFinite(v)) vals.push(v);
  }
  vals.sort((a, b) => a - b);
  return { lo: vals[Math.floor(0.025 * (vals.length - 1))], hi: vals[Math.ceil(0.975 * (vals.length - 1))], valid: vals.length };
}
function groupBy(a, k) { const m = new Map(); for (const x of a) { const key = k(x); if (!m.has(key)) m.set(key, []); m.get(key).push(x); } return m; }

/** Δ = trung bình theo bài của (recall nhóm C − recall nhóm A), chỉ bài có lỗi thật ở cả hai nhóm. */
export function deltaStat(runs) {
  const byTask = groupBy(runs.filter((r) => groupOf(r.arm)), (r) => r.task);
  const d = [];
  for (const rs of byTask.values()) {
    const a = rs.filter((r) => groupOf(r.arm) === 'A'), c = rs.filter((r) => groupOf(r.arm) === 'C');
    const ra = recall(a), rc = recall(c);
    if (Number.isFinite(ra) && Number.isFinite(rc)) d.push(rc - ra);
  }
  return d.length ? d.reduce((s, x) => s + x, 0) / d.length : NaN;
}
/** Hoán vị nhãn nhóm giữa các lượt trong cùng bài (giữ cỡ nhóm), hai phía. */
export function permDelta(runs, M, seed) {
  const rs = runs.filter((r) => groupOf(r.arm));
  const obs = deltaStat(rs);
  const byTask = groupBy(rs, (r) => r.task); const rnd = rng(seed); let ge = 0;
  for (let m = 0; m < M; m++) {
    const perm = [];
    for (const list of byTask.values()) {
      const labels = list.map((r) => r.arm); // xáo nhãn arm (giữ số lượt mỗi arm trong bài)
      for (let i = labels.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [labels[i], labels[j]] = [labels[j], labels[i]]; }
      list.forEach((r, i) => perm.push({ ...r, arm: labels[i] }));
    }
    const t = deltaStat(perm);
    if (Number.isFinite(t) && Math.abs(t) >= Math.abs(obs) - 1e-12) ge++;
  }
  return { obs, p: (1 + ge) / (M + 1) };
}

export function analyze({ base, mut, missing }, { seed = '20261104', B = 4000, M = 10000 } = {}) {
  const arms = [...new Set(base.map((b) => b.arm))].sort();
  const g1 = {}, g2 = {};
  for (const a of [...arms, '*']) {
    const bs = base.filter((b) => (a === '*' || b.arm === a) && !b.vNone);
    const clean = bs.filter((b) => b.hPass);
    const fp = clean.filter((b) => b.vRed).length;
    g1[a] = { n: clean.length, red: fp, rate: clean.length ? fp / clean.length : NaN, ci: cp(fp, clean.length) };
    const red = bs.filter((b) => b.vRed).length;
    g2[a] = { n: bs.length, red, rate: bs.length ? red / bs.length : NaN, ci: cp(red, bs.length), hiddenFail: bs.filter((b) => !b.hPass).length };
  }
  const runs = perRun(mut);
  const g3 = {};
  const sets = { '*': runs, A: runs.filter((r) => groupOf(r.arm) === 'A'), C: runs.filter((r) => groupOf(r.arm) === 'C'), ...Object.fromEntries(arms.map((a) => [a, runs.filter((r) => r.arm === a)])) };
  for (const [k, rs] of Object.entries(sets)) {
    const real = rs.reduce((s, r) => s + r.real, 0), caught = rs.reduce((s, r) => s + r.caught, 0), mutants = rs.reduce((s, r) => s + r.mutants, 0);
    g3[k] = { runs: rs.length, tasks: new Set(rs.map((r) => r.task)).size, mutants, real, caught, recall: real ? caught / real : NaN, ci: rs.length ? bootstrap2(rs, recall, B, `${seed}|g3|${k}`) : null };
  }
  const delta = permDelta(runs, M, `${seed}|perm`);
  const deltaCi = bootstrap2(runs.filter((r) => groupOf(r.arm)), deltaStat, B, `${seed}|delta`);
  const byTask = {};
  for (const [t, rs] of groupBy(runs, (r) => r.task)) byTask[t] = { A: recall(rs.filter((r) => groupOf(r.arm) === 'A')), C: recall(rs.filter((r) => groupOf(r.arm) === 'C')), all: recall(rs), real: rs.reduce((s, r) => s + r.real, 0) };
  const byOp = {};
  for (const r of mut.filter((m) => m.real)) { byOp[r.op] ??= { real: 0, caught: 0 }; byOp[r.op].real++; if (r.vRed) byOp[r.op].caught++; }
  const survivors = mut.filter((m) => m.real && !m.vRed).map((m) => ({ key: m.key, task: m.task, arm: m.arm, i: m.i, file: m.file, line: m.line, op: m.op, repl: m.repl }));
  return {
    counts: { baseRuns: base.length, eligible: base.filter((b) => b.eligible).length, slow: base.filter((b) => b.slow).length, missing: missing.length, mutants: mut.length, real: mut.filter((m) => m.real).length, notReal: mut.filter((m) => !m.real).length, vTimeout: mut.filter((m) => m.vTimeout).length, hTimeout: mut.filter((m) => m.hTimeout).length },
    g1, g2, g3, g3delta: { ...delta, ci: deltaCi, tasksUsed: Object.values(byTask).filter((x) => Number.isFinite(x.A) && Number.isFinite(x.C)).length }, byTask, byOp, survivors,
  };
}

const pct = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(1).replace('.', ',')} %` : '—');
const ci = (c) => (c && Number.isFinite(c[0] ?? c.lo) ? `[${pct(c[0] ?? c.lo)}; ${pct(c[1] ?? c.hi)}]` : '');
export function report(res) {
  const L = [];
  const c = res.counts;
  L.push(`Lượt có base: ${c.baseRuns} · đủ điều kiện đột biến: ${c.eligible} · base chậm (> 30 s): ${c.slow} · thiếu artifact: ${c.missing}`);
  L.push(`Đột biến: ${c.mutants} · lỗi thật (test ẩn trượt): ${c.real} · không phải lỗi thật: ${c.notReal} · quá hạn npm test: ${c.vTimeout} · quá hạn test ẩn: ${c.hTimeout}`);
  L.push('', '| Arm | G-1 chặn nhầm (lượt đúng mà lệnh đỏ) | G-2 báo xong khi lệnh đỏ | G-3 cổng bắt lỗi cài máy |', '|---|---|---|---|');
  for (const a of Object.keys(res.g1)) {
    const g1 = res.g1[a], g2 = res.g2[a], g3 = res.g3[a];
    L.push(`| ${a === '*' ? 'tất cả' : a} | ${g1.red}/${g1.n} = ${pct(g1.rate)} ${ci(g1.ci)} | ${g2.red}/${g2.n} = ${pct(g2.rate)} ${ci(g2.ci)} | ${g3 ? `${g3.caught}/${g3.real} = ${pct(g3.recall)} ${ci(g3.ci)} (${g3.runs} lượt, ${g3.tasks} bài)` : '—'} |`);
  }
  for (const k of ['A', 'C']) { const g = res.g3[k]; L.push(`| nhóm ${k} | | | ${g.caught}/${g.real} = ${pct(g.recall)} ${ci(g.ci)} (${g.runs} lượt, ${g.tasks} bài) |`); }
  const d = res.g3delta;
  L.push('', `G-3Δ (C − A, trung bình theo bài, ${d.tasksUsed} bài): ${Number.isFinite(d.obs) ? (100 * d.obs).toFixed(1).replace('.', ',') : '—'} điểm % ${ci(d.ci)}; p hoán vị hai phía = ${d.p.toFixed(4).replace('.', ',')}`);
  L.push('', '| Bài | lỗi thật | recall A | recall C | recall chung |', '|---|---|---|---|---|');
  for (const [t, x] of Object.entries(res.byTask).sort()) L.push(`| ${t} | ${x.real} | ${pct(x.A)} | ${pct(x.C)} | ${pct(x.all)} |`);
  L.push('', '| Toán tử | lỗi thật | bị chặn | recall |', '|---|---|---|---|');
  for (const [o, x] of Object.entries(res.byOp).sort()) L.push(`| ${o} | ${x.real} | ${x.caught} | ${pct(x.caught / x.real)} |`);
  L.push('', `Lỗi thật lọt cổng (G-4, kho lỗi cho E7): ${res.survivors.length}`);
  return L.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const file = process.argv[2];
  const opt = Object.fromEntries(process.argv.slice(3).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
  const res = analyze(load(file), { seed: opt.seed ?? '20261104', B: Number(opt.B ?? 4000), M: Number(opt.M ?? 10000) });
  if (opt.json) console.log(JSON.stringify(res, null, 1)); else console.log(report(res));
}
