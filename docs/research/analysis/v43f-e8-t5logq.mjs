#!/usr/bin/env node
// S4 (BRIEF-19, T-20261112-235700-08d): (1) tính lại σ_ln, df, làm tròn 10 s, power/MDE của E8; (2) độ nhạy của G-3 với t5-logq.
// Chỉ đọc tệp đã commit (study-cloud, g-mutation, gates-pilot, b7prime) và t5-relabel-*.jsonl do v43f-t5-relabel.mjs ghi. Không gọi LLM, không đọc e8-parallel.
//   node docs/research/analysis/v43f-e8-t5logq.mjs [e8|g3|all] [--json] [--B 4000] [--M 10000] [--sims 4000]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rng, load, analyze, perRun, deltaStat, groupOf, cp } from './g-analyze.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RES = path.join(ROOT, 'bench', 'vs-claude', 'results');
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

// ───────────── thống kê cơ bản ─────────────
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
export function gammaP(a, x) { // hàm gamma không đầy đủ chuẩn hóa P(a, x)
  if (x <= 0) return 0;
  if (x < a + 1) { let s = 1 / a, t = s; for (let n = 1; n < 500; n++) { t *= x / (a + n); s += t; if (t < s * 1e-15) break; } return s * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break; }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}
function lgamma(z) { const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = z, t = z + 5.5; t -= (z + 0.5) * Math.log(t); let s = 1.000000000190015; for (const c of g) s += c / ++y; return -t + Math.log((2.5066282746310005 * s) / z); }
/** Phân vị χ² bậc df (chia đôi trên gammaP). */
export function chi2q(p, df) { let lo = 0, hi = 10 * df + 100; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (gammaP(df / 2, m / 2) < p) lo = m; else hi = m; } return (lo + hi) / 2; }
export function normCdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
export function normQ(p) { let lo = -10, hi = 10; for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (normCdf(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; }
/** Hàm phân phối t (qua beta không đầy đủ, chuỗi liên phân số). */
function betacf(a, b, x) { let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d; for (let m = 1; m <= 300; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c; aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break; } return h; }
function ibeta(a, b, x) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
export function tCdf(t, df) { const x = df / (df + t * t); const p = 0.5 * ibeta(df / 2, 0.5, x); return t > 0 ? 1 - p : p; }
export function tQ(p, df) { let lo = -50, hi = 50; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (tCdf(m, df) < p) lo = m; else hi = m; } return (lo + hi) / 2; }

// ───────────── (1) E8: σ_ln, làm tròn 10 s ─────────────
/** Các ô (bài × arm) của gates-pilot + b7prime: ln wallSec của lượt `done`. */
export function wallCells(rows) {
  const m = new Map();
  for (const r of rows) if (r.status === 'done' && r.wallSec > 0) { const k = `${r.task}|${r.arm}`; if (!m.has(k)) m.set(k, { task: r.task, arm: r.arm, w: [] }); m.get(k).w.push(r.wallSec); }
  return [...m.values()];
}
/** σ_ln gộp trong ô: sqrt(Σ SS / Σ (n−1)); ô n < 2 bị bỏ. */
export function pooledSigmaLn(cells, f = (x) => Math.log(x)) {
  let ss = 0, df = 0, zero = 0, used = 0;
  for (const c of cells) {
    if (c.w.length < 2) continue;
    const v = c.w.map(f), mu = mean(v), s = v.reduce((a, b) => a + (b - mu) ** 2, 0);
    ss += s; df += v.length - 1; used++; if (s < 1e-12) zero++;
  }
  return { sigma: df ? Math.sqrt(ss / df) : NaN, df, cells: used, zeroCells: zero };
}
export function sigmaCi(sigma, df) { return [sigma * Math.sqrt(df / chi2q(0.975, df)), sigma * Math.sqrt(df / chi2q(0.025, df))]; }
/** Số vòng 10 s: wallSec ≈ 10·ceil(T/10) + ε; trả k và ε. */
export const gridOf = (w) => ({ k: Math.floor(w / 10), eps: w - 10 * Math.floor(w / 10) });
/** Hiệu chỉnh Sheppard theo giây: var_hc = max(var − h²/12, 0), h = 10; đổi sang ln bằng σ² = ln(1 + var/mean²) ở mỗi ô, rồi gộp theo bậc tự do. */
export function sheppardSigmaLn(cells, h = 10) {
  let ss = 0, df = 0;
  for (const c of cells) {
    if (c.w.length < 2) continue;
    const mu = mean(c.w), v = c.w.reduce((a, b) => a + (b - mu) ** 2, 0) / (c.w.length - 1);
    const meanT = Math.max(mu - h / 2, 1), vc = Math.max(v - h * h / 12, 0);
    ss += Math.log(1 + vc / (meanT * meanT)) * (c.w.length - 1); df += c.w.length - 1;
  }
  return { sigma: Math.sqrt(ss / df), df };
}
const gauss = (rnd) => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
/** Mô phỏng ngược: kỳ vọng σ_ln gộp của dữ liệu làm tròn lên 10 s, khi σ thật = s; trung vị thật mỗi ô = tâm hình học quan sát − 5 s. */
export function expectedObservedSigma(cells, s, sims, seed, h = 10) {
  const rnd = rng(seed); const mus = cells.map((c) => Math.log(Math.max(Math.exp(mean(c.w.map(Math.log))) - h / 2, 1)));
  let acc = 0;
  for (let k = 0; k < sims; k++) {
    const sim = cells.map((c, i) => ({ w: c.w.map(() => h * Math.ceil(Math.exp(mus[i] + s * gauss(rnd)) / h)) }));
    acc += pooledSigmaLn(sim).sigma ** 2;
  }
  return Math.sqrt(acc / sims);
}
/** Tìm σ thật sao cho kỳ vọng σ quan sát = target (chia đôi trên [0, 1,5]). */
export function invertRounding(cells, target, sims, seed) {
  let lo = 0, hi = 1.5;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (expectedObservedSigma(cells, m, sims, `${seed}|inv`) < target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ───────────── power / MDE của E8 ─────────────
/** SE của Δ (trung bình theo bài của hiệu ln trung bình hai arm): sqrt((σ1² + σ4²)/n)/sqrt(T) → σ·sqrt(2/n)/sqrt(T) khi σ chung. */
export const seDelta = (s1, s4, n = 6, tasks = 3) => Math.sqrt(((s1 * s1 + s4 * s4) / n) / tasks);
/** Power hai phía của z/t với Δ = ln(1 − giảm), df = tasks·(2n − 2) (σ chung ước từ chính dữ liệu của đợt). */
export function powerAnalytic(sig, reduction, { n = 6, tasks = 3, s1, alpha = 0.05, t = true } = {}) {
  const se = seDelta(sig, s1 ?? sig, n, tasks), d = Math.abs(Math.log(1 - reduction)) / se;
  const crit = t ? tQ(1 - alpha / 2, tasks * (2 * n - 2)) : normQ(1 - alpha / 2);
  return t ? 1 - tCdf(crit - d, tasks * (2 * n - 2)) + tCdf(-crit - d, tasks * (2 * n - 2)) : normCdf(d - crit) + normCdf(-d - crit);
}
/** MDE (giảm tối thiểu để đạt power) theo xấp xỉ t. */
export function mde(sig, power, opt = {}) { let lo = 0, hi = 0.99; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (powerAnalytic(sig, m, opt) < power) lo = m; else hi = m; } return (lo + hi) / 2; }
/** σ lớn nhất mà vẫn đạt power. */
export function sigmaMax(reduction, power, opt = {}) { let lo = 0.01, hi = 3; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (powerAnalytic(m, reduction, opt) >= power) lo = m; else hi = m; } return lo; }
/** Power bằng mô phỏng, kiểm hoán vị trong bài (đúng như e8/analyze.mjs: nhãn arm xáo trong bài, hai phía, Δ = TB theo bài). */
export function powerSim(sig1, sig4, reduction, { n = 6, tasks = 3, sims = 2000, M = 499, seed = '20261104|pow', alpha = 0.05 } = {}) {
  const rnd = rng(seed); let rej = 0; const d = Math.log(1 - reduction);
  for (let s = 0; s < sims; s++) {
    const cells = Array.from({ length: tasks }, () => ({ a: Array.from({ length: n }, () => d + sig4 * gauss(rnd)), b: Array.from({ length: n }, () => sig1 * gauss(rnd)) }));
    const stat = (cs) => mean(cs.map((c) => mean(c.a) - mean(c.b)));
    const obs = Math.abs(stat(cells)); let ge = 0;
    for (let m = 0; m < M; m++) {
      const perm = cells.map((c) => { const all = [...c.a, ...c.b]; for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; } return { a: all.slice(0, n), b: all.slice(n) }; });
      if (Math.abs(stat(perm)) >= obs - 1e-12) ge++;
    }
    if ((1 + ge) / (M + 1) <= alpha) rej++;
  }
  return rej / sims;
}

export function e8Report({ sims = 4000, powSims = 1500 } = {}) {
  const rows = [...jsonl(path.join(RES, 'gates-pilot', 'runs.jsonl')), ...jsonl(path.join(RES, 'b7prime', 'runs.jsonl'))];
  const cells = wallCells(rows);
  const all = pooledSigmaLn(cells);
  const cc = cells.filter((c) => c.arm !== 'A0-sonnet'), a0 = cells.filter((c) => c.arm === 'A0-sonnet');
  const grid = rows.filter((r) => r.arm !== 'A0-sonnet' && r.status === 'done').map((r) => gridOf(r.wallSec));
  const rep = {
    inputs: { runs: rows.length, done: rows.filter((r) => r.status === 'done').length, armCount: Object.fromEntries([...new Set(rows.map((r) => r.arm))].map((a) => [a, rows.filter((r) => r.arm === a).length])) },
    all: { ...all, ci: sigmaCi(all.sigma, all.df) },
    ccoding: { ...pooledSigmaLn(cc) }, a0: { ...pooledSigmaLn(a0) },
    grid: { n: grid.length, epsMax: Math.max(...grid.map((g) => g.eps)), epsMin: Math.min(...grid.map((g) => g.eps)), multOf10: rows.filter((r) => r.arm !== 'A0-sonnet').filter((r) => Math.abs(r.wallSec / 10 - Math.round(r.wallSec / 10)) < 1e-9).length, a0Eps: a0.flatMap((c) => c.w).map((w) => +(w % 10).toFixed(2)) },
  };
  rep.ccoding.ci = sigmaCi(rep.ccoding.sigma, rep.ccoding.df); rep.a0.ci = sigmaCi(rep.a0.sigma, rep.a0.df);
  // số ô CCoding mà mọi lượt rơi vào cùng một vòng 10 s
  rep.sameGridCells = cc.filter((c) => c.w.length >= 2 && new Set(c.w.map((w) => gridOf(w).k)).size === 1).length;
  // σ trên thang k·10 (bỏ ε) cho CCoding
  rep.ccodingGridOnly = pooledSigmaLn(cc.map((c) => ({ ...c, w: c.w.map((w) => 10 * Math.floor(w / 10)) })));
  rep.sheppardCcoding = sheppardSigmaLn(cc);
  rep.sheppardAll = sheppardSigmaLn(cells.filter((c) => c.arm !== 'A0-sonnet').concat(a0));
  // mô phỏng ngược: σ thật khi quan sát σ_cc
  rep.invert = { point: invertRounding(cc, rep.ccoding.sigma, sims, 'inv-pt'), lo: invertRounding(cc, rep.ccoding.ci[0], sims, 'inv-lo'), hi: invertRounding(cc, rep.ccoding.ci[1], sims, 'inv-hi') };
  rep.expectedAt = Object.fromEntries([0.1, 0.178, 0.25, 0.4].map((s) => [s, expectedObservedSigma(cc, s, Math.min(sims, 1500), `exp|${s}`)]));
  // power / MDE
  const T = { n: 6, tasks: 3 };
  rep.power = {
    se025: seDelta(0.25, 0.25), z: Math.abs(Math.log(0.7)) / seDelta(0.25, 0.25),
    byTable: [0.178, 0.25, 0.3, 0.35, 0.4, 0.5].map((s) => ({ sigma: s, se: seDelta(s, s), p30t: powerAnalytic(s, 0.3, T), p30z: powerAnalytic(s, 0.3, { ...T, t: false }), p20t: powerAnalytic(s, 0.2, T), p15t: powerAnalytic(s, 0.15, T), mde80: mde(s, 0.8, T), mde90: mde(s, 0.9, T) })),
    sigmaMax: { p80: sigmaMax(0.3, 0.8, T), p90: sigmaMax(0.3, 0.9, T), p80z: sigmaMax(0.3, 0.8, { ...T, t: false }), p90z: sigmaMax(0.3, 0.9, { ...T, t: false }) },
    sim: [[0.25, 0.25], [0.35, 0.35], [0.4, 0.4], [0.25, 0.4]].map(([s1, s4]) => ({ sigma1: s1, sigma4: s4, power30: powerSim(s1, s4, 0.3, { sims: powSims }), powerNull: powerSim(s1, s4, 0, { sims: powSims, seed: '20261104|null' }) })),
    n7: { power30sigma025: powerAnalytic(0.25, 0.3, { n: 7, tasks: 3 }), n8: powerAnalytic(0.4, 0.3, { n: 8, tasks: 3 }), n10: powerAnalytic(0.4, 0.3, { n: 10, tasks: 3 }) },
  };
  return rep;
}

// ───────────── (2) t5-logq và G-3 ─────────────
export function fisherTwoSided(a, b, c, d) { // bảng [[a,b],[c,d]]
  const lf = (n) => lgamma(n + 1), n = a + b + c + d, r1 = a + b, c1 = a + c;
  const p = (x) => Math.exp(lf(r1) + lf(n - r1) + lf(c1) + lf(n - c1) - lf(n) - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(n - r1 - c1 + x));
  const p0 = p(a); let s = 0; for (let x = Math.max(0, r1 + c1 - n); x <= Math.min(r1, c1); x++) { const px = p(x); if (px <= p0 * (1 + 1e-9)) s += px; } return Math.min(s, 1);
}
/** Thay nhãn `real` của đột biến theo kết quả chạy lại bằng bộ test đầy đủ: real := trượt ≥ 1 trong các lần chạy (như quy tắc giữ mục của E7). vRed giữ nguyên. */
export function relabel(mut, relabelRows, taskId) {
  const m = new Map(relabelRows.filter((r) => !r.mismatchSite).map((r) => [`${r.key}|${r.i}`, r.failRuns > 0]));
  return mut.map((r) => (r.task === taskId && m.has(`${r.key}|${r.i}`) ? { ...r, real: m.get(`${r.key}|${r.i}`) } : r));
}
/** Bản g-analyze.mjs ở d1e8573: bootstrap Δ gộp hai lần rút cùng bài thành một cụm (không có `_c`). */
export function bootstrap2Legacy(runs, f, B, seed) {
  const by = new Map(); for (const r of runs) { if (!by.has(r.task)) by.set(r.task, []); by.get(r.task).push(r); }
  const tasks = [...by.keys()].sort(); const rnd = rng(seed); const vals = [];
  for (let b = 0; b < B; b++) {
    const pick = [];
    for (let i = 0; i < tasks.length; i++) { const rs = by.get(tasks[Math.floor(rnd() * tasks.length)]); for (let j = 0; j < rs.length; j++) pick.push(rs[Math.floor(rnd() * rs.length)]); }
    const v = f(pick); if (Number.isFinite(v)) vals.push(v);
  }
  vals.sort((a, b) => a - b);
  return { lo: vals[Math.floor(0.025 * (vals.length - 1))], hi: vals[Math.ceil(0.975 * (vals.length - 1))] };
}
/** Một kịch bản G-3: số đếm, recall (+CI hai tầng), Δ (+CI bản đã sửa của S1 và bản d1e8573, p hoán vị). */
export function scenario(data, opt) {
  const res = analyze(data, opt);
  const runs = perRun(data.mut);
  const legacy = bootstrap2Legacy(runs.filter((r) => groupOf(r.arm)), deltaStat, opt.B, `${opt.seed}|delta`);
  return { real: res.g3['*'].real, caught: res.g3['*'].caught, recall: res.g3['*'].recall, ci: [res.g3['*'].ci.lo, res.g3['*'].ci.hi], A: res.g3.A, C: res.g3.C, delta: res.g3delta.obs, deltaCi: [res.g3delta.ci.lo, res.g3delta.ci.hi], deltaCiLegacy: [legacy.lo, legacy.hi], p: res.g3delta.p, tasksUsed: res.g3delta.tasksUsed, survivors: res.survivors.length, t5: res.byTask['t5-logq'] ?? null, runs: runs.length };
}
const baseRunInfo = (base, task) => Object.fromEntries(base.filter((b) => b.task === task).map((b) => [b.key, b.hTotal]));

export function g3Report({ B = 4000, M = 10000, seed = '20261104' } = {}) {
  const dir = path.join(RES, 'g-mutation');
  const data = load(path.join(dir, 'g-mutation.jsonl'), path.join(dir, 'g-rebase.jsonl'));
  const opt = { seed, B, M };
  const out = { sha: { gMutation: null } };
  const t5 = (n) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'v43f-e8-t5logq', n);
  const rel = fs.existsSync(t5('t5-relabel-reps3.jsonl')) ? jsonl(t5('t5-relabel-reps3.jsonl')) : null;
  const rel1 = fs.existsSync(t5('t5-relabel-reps1.jsonl')) ? jsonl(t5('t5-relabel-reps1.jsonl')) : null;
  // số test ẩn đã ghi ở dòng base
  const tot = baseRunInfo(data.base, 't5-logq'); const vals = Object.values(tot);
  out.hTotal = { runs: vals.length, min: Math.min(...vals), max: Math.max(...vals), full: vals.filter((v) => v === 146).length, distinct: [...new Set(vals)].sort((a, b) => a - b), allPass: data.base.filter((b) => b.task === 't5-logq').every((b) => b.hPass) };
  const byTask = {};
  for (const t of ['t1-duration', 't2-orders', 't3-api', 'c1-iis-ecs', 'c2-burst-alert', 'c3-shop-bugs', 'c4-audit-chain', 'c5-tickets-api', 't5-logq']) { const v = Object.values(baseRunInfo(data.base, t)); if (v.length) byTask[t] = { n: v.length, min: Math.min(...v), max: Math.max(...v), belowMax: v.filter((x) => x < Math.max(...v)).length }; }
  out.hTotalByTask = byTask;
  out.keep = scenario(data, opt);
  out.dropT5 = scenario({ ...data, mut: data.mut.filter((r) => r.task !== 't5-logq'), base: data.base.filter((b) => b.task !== 't5-logq') }, opt);
  // chỉ t5-logq
  out.onlyT5 = (() => { const rs = perRun(data.mut).filter((r) => r.task === 't5-logq'); const real = rs.reduce((s, r) => s + r.real, 0), caught = rs.reduce((s, r) => s + r.caught, 0); return { real, caught, recall: caught / real, runs: rs.length }; })();
  // lượt t5 có đủ test ở base (146) so với thiếu
  const full = new Set(data.base.filter((b) => b.task === 't5-logq' && b.hTotal === 146).map((b) => b.key));
  out.completeOnly = scenario({ ...data, mut: data.mut.filter((r) => r.task !== 't5-logq' || full.has(r.key)), base: data.base.filter((b) => b.task !== 't5-logq' || full.has(b.key)) }, opt);
  if (rel) {
    out.relabel = { reps: rel[0].reps, n: rel.length, mismatchSite: rel.filter((r) => r.mismatchSite).length };
    const ok = rel.filter((r) => !r.mismatchSite);
    out.relabel.agree = ok.filter((r) => r.real0 === (r.failRuns > 0)).length;
    out.relabel.flips = ok.filter((r) => r.real0 !== (r.failRuns > 0)).map((r) => ({ key: r.key, i: r.i, op: r.op, line: r.line, real0: r.real0, vRed0: r.vRed0, failRuns: r.failRuns, reps: r.reps, totals: r.totals, baseTotal: tot[r.key] }));
    out.relabel.partial = ok.filter((r) => r.failRuns > 0 && r.failRuns < r.reps).length; // trượt không đều giữa các lần chạy
    out.relabel.totalsNow = [...new Set(ok.flatMap((r) => r.totals))].sort((a, b) => a - b);
    out.relabel.crashed = ok.filter((r) => r.totals.some((x) => x < 100)).length;
    const surv = ok.filter((r) => r.real0 && !r.vRed0);
    out.relabel.survivors = { n: surv.length, stillReal: surv.filter((r) => r.failRuns > 0).length };
    // hai lỗi không tái lập nằm ở lượt có test ẩn ghi thiếu không (so với 146)?
    const inc = ok.filter((r) => tot[r.key] < 146), cmp = ok.filter((r) => tot[r.key] === 146);
    out.relabel.byBaseCount = { incomplete: { n: inc.length, flips: inc.filter((r) => r.real0 !== (r.failRuns > 0)).length }, complete: { n: cmp.length, flips: cmp.filter((r) => r.real0 !== (r.failRuns > 0)).length } };
    const b = out.relabel.byBaseCount; out.relabel.fisher = fisherTwoSided(b.incomplete.flips, b.incomplete.n - b.incomplete.flips, b.complete.flips, b.complete.n - b.complete.flips);
    out.relabeled = scenario({ ...data, mut: relabel(data.mut, rel, 't5-logq') }, opt);
    // ba lần chạy: chỉ giữ đột biến có nhãn ổn định (cả 3 lần cùng kết quả)
    const unstable = new Set(ok.filter((r) => r.failRuns > 0 && r.failRuns < r.reps).map((r) => `${r.key}|${r.i}`));
    out.stableOnly = scenario({ ...data, mut: relabel(data.mut, rel, 't5-logq').filter((r) => !unstable.has(`${r.key}|${r.i}`)) }, opt);
    out.stableOnly.dropped = unstable.size;
  }
  if (rel1) { const ok = rel1.filter((r) => !r.mismatchSite); out.relabel1 = { n: ok.length, agree: ok.filter((r) => r.real0 === (r.failRuns > 0)).length, flips: ok.filter((r) => r.real0 !== (r.failRuns > 0)).map((r) => `${r.key}:${r.i}`) }; }
  for (const t of ['t1-duration', 't2-orders']) {
    const f = t5(`${t}-relabel-reps1.jsonl`);
    if (fs.existsSync(f)) { const ok = jsonl(f).filter((r) => !r.mismatchSite); const surv = ok.filter((r) => r.real0 && !r.vRed0); out[`extra_${t}`] = { n: ok.length, agree: ok.filter((r) => r.real0 === (r.failRuns > 0)).length, flips: ok.filter((r) => r.real0 !== (r.failRuns > 0)).map((r) => `${r.key}:${r.i}:${r.real0 ? 'thật→đạt' : 'đạt→trượt'}`), survivors: surv.length, survivorsStillReal: surv.filter((r) => r.failRuns > 0).length }; }
  }
  return out;
}

// ───────────── in báo cáo ─────────────
const vn = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
const pc = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(1).replace('.', ',')} %` : '—');
const pp = (x) => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${(100 * Math.abs(x)).toFixed(1).replace('.', ',')}` : '—');
const ci = (c) => `[${pc(c[0])}; ${pc(c[1])}]`;
export function formatG3(r) {
  const L = [];
  const row = (name, s) => `| ${name} | ${s.caught}/${s.real} = ${pc(s.recall)} ${ci(s.ci)} | ${s.A.caught}/${s.A.real} = ${pc(s.A.recall)} · ${s.C.caught}/${s.C.real} = ${pc(s.C.recall)} | ${pp(s.delta)} đ.% ${ci(s.deltaCi).replace(/ %/g, '')} | ${ci(s.deltaCiLegacy).replace(/ %/g, '')} | ${vn(s.p, 4)} | ${s.survivors} |`;
  L.push('| Trường hợp | G-3 recall (CI hai tầng) | Nhóm A · nhóm C | G-3Δ C−A (CI, bản S1) | CI bản d1e8573 | p hoán vị | G-4 lọt cổng |', '|---|---|---|---|---|---|---|');
  L.push(row('1. Giữ nguyên', r.keep), row('2. Bỏ t5-logq', r.dropT5), row('2b. Chỉ lượt t5-logq có đủ 146 test ở base', r.completeOnly));
  if (r.relabeled) L.push(row('3. Gán lại nhãn t5-logq bằng bộ test đầy đủ, ổn định (≥ 1/3 lần trượt)', r.relabeled));
  return L.join('\n');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const mode = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all';
  const flag = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
  const out = {};
  if (mode === 'e8' || mode === 'all') out.e8 = e8Report({ sims: Number(flag('sims', 4000)), powSims: Number(flag('powsims', 1500)) });
  if (mode === 'g3' || mode === 'all') out.g3 = g3Report({ B: Number(flag('B', 4000)), M: Number(flag('M', 10000)) });
  if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
  else { if (out.e8) console.log(JSON.stringify(out.e8, null, 1)); if (out.g3) { console.log(formatG3(out.g3)); console.log(JSON.stringify({ ...out.g3, keep: undefined, dropT5: undefined, completeOnly: undefined, relabeled: undefined, stableOnly: undefined }, null, 1)); } }
}
