#!/usr/bin/env node
// Thống kê cho benchtest CCoding vs Claude Code: bootstrap, hoán vị, Cliff's delta, số lượt cần thiết.
// Node >= 22, không phụ thuộc gói ngoài. Không đọc export.py / report.py; chỉ đọc runs.csv.
//
//   node stats.mjs [--runs a.csv,b.csv] [--rounds C5,C6] [--tasks t3-api,t5-logq] [--baseline claude-sonnet]
//                  [--exclude-run <task_id|vòng/bài/hệ/lượt>[,...]] [--seed N] [--resamples N]
//                  [--format md|json] [--required-runs] [--delta wall=30,cost=0.1] [--sim] [--alpha 0.05] [--power 0.8]
//
// Quy ước: "CC" = mọi hệ có tên bắt đầu bằng "ccoding"; đối chứng ("Claude" trong mã) = hệ --baseline (mặc định "claude",
// tức Claude Code Opus; C7 có thêm "claude-sonnet"). Chênh lệch = CC − đối chứng. Hệ khác bị bỏ.
// Thống kê gộp = TB các bài của (TB lượt CC − TB lượt Claude), phân tầng theo bài (giống token-analysis.mjs T-f).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const DEFAULT_SEED = 20261102;
export const DEFAULT_RESAMPLES = 10000;
export const EXACT_LIMIT = 200000; // số tổ hợp tối đa để liệt kê chính xác

// ---------- CSV ----------
export function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '');
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

export function loadRuns(files, baseline = 'claude') {
  const seen = new Set(); // bỏ dòng trùng (cùng vòng/bài/hệ/lượt) khi nạp nhiều tệp chồng nhau
  return files.flatMap((p) => parseCsv(readFileSync(p, 'utf8'))).filter((r) => {
    const k = `${r.run}/${r.task}/${r.system}/${r.rep}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).map((r) => ({
    ...r, rep: Number(r.rep), wall: Number(r.wall_s), cost: Number(r.cost_usd),
    group: groupOf(r.system, baseline),
  }));
}

/** 'cc' cho ccoding*, 'claude' cho hệ đối chứng (baseline), còn lại 'other' (bị bỏ). */
export function groupOf(system, baseline = 'claude') {
  return system === baseline ? 'claude' : system.startsWith('ccoding') ? 'cc' : 'other';
}

/** "wall=30,cost=0.1" → { wall: 30, cost: 0.1 } (chênh lệch cần phát hiện cho --required-runs). */
export function parseDelta(s) {
  const o = {};
  for (const part of s.split(',').map((x) => x.trim()).filter(Boolean)) {
    const [k, v] = part.split('=');
    if (!['wall', 'cost'].includes(k) || !(Number(v) > 0)) throw new Error(`--delta không hợp lệ: "${part}" (dạng wall=30,cost=0.1)`);
    o[k] = Number(v);
  }
  return o;
}

export function filterRuns(runs, { rounds, tasks, exclude = [] } = {}) {
  return runs.filter((r) => {
    if (r.group === 'other') return false;
    if (rounds?.length && !rounds.includes(r.run)) return false;
    if (tasks?.length && !tasks.includes(r.task)) return false;
    const key = `${r.run}/${r.task}/${r.system}/${r.rep}`;
    return !exclude.some((e) => e === r.task_id || e === key);
  });
}

// ---------- PRNG (mulberry32, cùng bản với token-analysis.mjs) ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- thống kê cơ bản ----------
export const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
export const sd = (a) => (a.length < 2 ? 0 : Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1)));
export function quantile(a, q) {
  const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

/** Cliff's delta = (#{cc > cl} − #{cc < cl}) / (n·m); strata: [{cc:[], cl:[]}] gộp các cặp trong bài. */
export function cliffsDelta(strata) {
  let gt = 0, lt = 0, n = 0;
  for (const { cc, cl } of strata) for (const x of cc) for (const y of cl) { n++; if (x > y) gt++; else if (x < y) lt++; }
  return n ? (gt - lt) / n : NaN;
}

// Thống kê phân tầng: [hiệu TB, tỉ lệ TB CC / TB Claude]
export function stratStat(strata) {
  const dc = mean(strata.map((s) => mean(s.cc))), dl = mean(strata.map((s) => mean(s.cl)));
  return [dc - dl, dc / dl];
}

/** Bootstrap percentile phân tầng: lấy lại mẫu có hoàn lại các lượt trong từng ô (bài × hệ). */
export function bootstrap(strata, { B = DEFAULT_RESAMPLES, seed = DEFAULT_SEED, level = 0.95 } = {}) {
  const rand = rng(seed), diffs = [], ratios = [];
  for (let b = 0; b < B; b++) {
    const [d, r] = stratStat(strata.map((s) => ({
      cc: s.cc.map(() => s.cc[Math.floor(rand() * s.cc.length)]),
      cl: s.cl.map(() => s.cl[Math.floor(rand() * s.cl.length)]),
    })));
    diffs.push(d); ratios.push(r);
  }
  const a = (1 - level) / 2, [d0, r0] = stratStat(strata);
  return { diff: d0, diffCI: [quantile(diffs, a), quantile(diffs, 1 - a)], ratio: r0, ratioCI: [quantile(ratios, a), quantile(ratios, 1 - a)] };
}

// ---------- kiểm định hoán vị hai phía (hoán nhãn trong từng bài) ----------
const choose = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return Math.round(r); };

function* combinations(n, k) {
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield idx;
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

/** Trả { p, method: 'exact'|'monte-carlo', combos, N }. p hai phía: P(|T*| >= |T|) (cộng sai số 1e-9). */
export function permutationTest(strata, { N = DEFAULT_RESAMPLES, seed = DEFAULT_SEED, exactLimit = EXACT_LIMIT } = {}) {
  const diffOf = (parts) => stratStat(parts)[0];
  const t0 = Math.abs(diffOf(strata));
  const pools = strata.map((s) => [...s.cc, ...s.cl]);
  const combos = strata.reduce((p, s) => p * choose(s.cc.length + s.cl.length, s.cc.length), 1);
  const eps = 1e-9 * Math.max(1, t0);
  if (combos <= exactLimit) {
    let hit = 0;
    const rec = (i, parts) => {
      if (i === strata.length) { if (Math.abs(diffOf(parts)) >= t0 - eps) hit++; return; }
      const n = pools[i].length, k = strata[i].cc.length;
      for (const c of combinations(n, k)) {
        const set = new Set(c);
        rec(i + 1, [...parts, { cc: c.map((j) => pools[i][j]), cl: pools[i].filter((_, j) => !set.has(j)) }]);
      }
    };
    rec(0, []);
    return { p: hit / combos, method: 'exact', combos, N: combos };
  }
  const rand = rng(seed); let hit = 0;
  for (let it = 0; it < N; it++) {
    const parts = pools.map((pool, i) => {
      const a = [...pool];
      for (let j = a.length - 1; j > 0; j--) { const k = Math.floor(rand() * (j + 1)); [a[j], a[k]] = [a[k], a[j]]; }
      return { cc: a.slice(0, strata[i].cc.length), cl: a.slice(strata[i].cc.length) };
    });
    if (Math.abs(diffOf(parts)) >= t0 - eps) hit++;
  }
  return { p: (hit + 1) / (N + 1), method: 'monte-carlo', combos, N };
}

// ---------- số lượt cần cho mỗi ô ----------
/** Nghịch đảo phân phối chuẩn (Acklam). */
export function zInv(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) return -zInv(1 - p);
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** n mỗi nhánh = ceil(2·(z_{1−α/2} + z_{1−β})²·σ²/Δ²). sigma = độ lệch chuẩn chung, delta = chênh lệch cần phát hiện. */
export function requiredRuns({ sigma, delta, alpha = 0.05, power = 0.8 }) {
  if (!(delta > 0)) return Infinity;
  if (!(sigma > 0)) return 2;
  const z = zInv(1 - alpha / 2) + zInv(power);
  return Math.max(2, Math.ceil((2 * z * z * sigma * sigma) / (delta * delta)));
}

/**
 * Tùy chọn mô phỏng: lấy mẫu có hoàn lại n lượt từ mỗi nhánh dữ liệu thí điểm, thử z hai mẫu (σ ước lượng từ mẫu mô phỏng);
 * trả về n nhỏ nhất (2..maxN) có tỉ lệ bác bỏ >= power. Bất định: nếu mẫu thí điểm có chênh lệch TB nhỏ hơn delta thì bù bằng dịch nhánh.
 */
export function simulateRequiredRuns({ cc, cl, delta, alpha = 0.05, power = 0.8, sims = 2000, seed = DEFAULT_SEED, maxN = 60 }) {
  const rand = rng(seed), zc = zInv(1 - alpha / 2);
  const m = cc.length ? mean(cc) : 0, shift = (cl.length ? mean(cl) : 0) + Math.sign((m - mean(cl)) || 1) * delta - m;
  const draw = (a, n, off) => Array.from({ length: n }, () => a[Math.floor(rand() * a.length)] + off);
  for (let n = 2; n <= maxN; n++) {
    let rej = 0;
    for (let s = 0; s < sims; s++) {
      const x = draw(cc, n, shift), y = draw(cl, n, 0);
      const se = Math.sqrt((sd(x) ** 2 + sd(y) ** 2) / n);
      if (se > 0 ? Math.abs(mean(x) - mean(y)) / se > zc : mean(x) !== mean(y)) rej++;
    }
    if (rej / sims >= power) return n;
  }
  return null;
}

// ---------- phân tích ----------
export function strataOf(runs, task, key) {
  const t = runs.filter((r) => r.task === task);
  return { cc: t.filter((r) => r.group === 'cc').map((r) => r[key]), cl: t.filter((r) => r.group === 'claude').map((r) => r[key]) };
}

export function analyse(runs, opts = {}) {
  const tasks = [...new Set(runs.map((r) => r.task))].sort();
  const usable = tasks.filter((t) => { const s = strataOf(runs, t, 'wall'); return s.cc.length && s.cl.length; });
  const out = { baseline: opts.baseline ?? 'claude', seed: opts.seed ?? DEFAULT_SEED, resamples: opts.B ?? DEFAULT_RESAMPLES, tasksUsed: usable, tasksSkipped: tasks.filter((t) => !usable.includes(t)), metrics: {} };
  for (const [key, label] of [['wall', 'Thời gian (s)'], ['cost', 'Chi phí (USD)']]) {
    const one = (strata) => ({
      nCC: strata.reduce((s, x) => s + x.cc.length, 0), nClaude: strata.reduce((s, x) => s + x.cl.length, 0),
      ...bootstrap(strata, { B: out.resamples, seed: out.seed }),
      perm: permutationTest(strata, { N: out.resamples, seed: out.seed }),
      cliff: cliffsDelta(strata),
    });
    const per = {};
    for (const t of usable) per[t] = { ...one([strataOf(runs, t, key)]), meanCC: mean(strataOf(runs, t, key).cc), meanClaude: mean(strataOf(runs, t, key).cl) };
    const m = { label, perTask: per, pooled: usable.length ? one(usable.map((t) => strataOf(runs, t, key))) : null };
    if (opts.requiredRuns && usable.length) {
      m.required = {};
      for (const t of usable) {
        const s = strataOf(runs, t, key), n1 = s.cc.length, n2 = s.cl.length;
        const pooledVar = ((n1 - 1) * sd(s.cc) ** 2 + (n2 - 1) * sd(s.cl) ** 2) / Math.max(1, n1 + n2 - 2);
        const sigma = Math.sqrt(pooledVar), delta = Math.abs(mean(s.cc) - mean(s.cl));
        const detect = opts.delta?.[key] ?? delta;
        m.required[t] = { sigma, delta: detect, n: requiredRuns({ sigma, delta: detect, alpha: opts.alpha, power: opts.power }) };
        if (opts.sim) m.required[t].nSim = simulateRequiredRuns({ cc: s.cc, cl: s.cl, delta: detect, alpha: opts.alpha, power: opts.power, seed: out.seed });
      }
    }
    out.metrics[key] = m;
  }
  return out;
}

// ---------- đầu ra ----------
const fx = (x, d) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '–');
const ci = (c, d) => `[${fx(c[0], d)}; ${fx(c[1], d)}]`;
const verdict = (c) => (c[0] > 0 ? 'CC > đối chứng' : c[1] < 0 ? 'CC < đối chứng' : 'CI chứa 0');

export function renderMd(res, meta = {}) {
  const L = [], base = res.baseline && res.baseline !== 'claude' ? res.baseline : 'Claude';
  L.push(`seed = ${res.seed} · resample/hoán vị MC = ${res.resamples} · CI percentile 95% · hệ CC = ccoding* · đối chứng = ${res.baseline ?? 'claude'}`);
  if (meta.filters) L.push(`bộ lọc: ${meta.filters}`);
  L.push(`bài dùng được: ${res.tasksUsed.join(', ') || '(không)'}${res.tasksSkipped.length ? ` · bỏ (thiếu một hệ): ${res.tasksSkipped.join(', ')}` : ''}`);
  for (const [key, m] of Object.entries(res.metrics)) {
    const d = key === 'wall' ? 1 : 3, rows = [...Object.entries(m.perTask).map(([t, v]) => [t, v]), ['GỘP (TB các bài)', m.pooled]].filter(([, v]) => v);
    L.push('', `### ${m.label}`, '',
      `| Phạm vi | n CC / n ${base} | Chênh lệch CC − ${base} | CI 95% | Tỉ lệ CC/${base} | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |`,
      '|---|---:|---:|---:|---:|---:|---:|---|---:|---|');
    for (const [name, v] of rows) L.push(`| ${name} | ${v.nCC} / ${v.nClaude} | ${fx(v.diff, d)} | ${ci(v.diffCI, d)} | ${fx(v.ratio, 3)} | ${ci(v.ratioCI, 3)} | ${fx(v.perm.p, 4)} | ${v.perm.method} (${v.perm.combos} tổ hợp) | ${fx(v.cliff, 2)} | ${verdict(v.diffCI)} |`);
    if (m.required) {
      L.push('', `Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (${m.label}; công thức xấp xỉ chuẩn, α và power theo tham số):`, '',
        '| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |', '|---|---:|---:|---:|---:|');
      for (const [t, r] of Object.entries(m.required)) L.push(`| ${t} | ${fx(r.sigma, d)} | ${fx(r.delta, d)} | ${r.n} | ${'nSim' in r ? (r.nSim ?? '>60') : '–'} |`);
    }
  }
  return L.join('\n');
}

// ---------- CLI ----------
function parseArgs(argv) {
  const o = { format: 'md' }, list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--runs') o.runs = list(next());
    else if (a === '--rounds') o.rounds = list(next());
    else if (a === '--tasks') o.tasks = list(next());
    else if (a === '--exclude-run') o.exclude = [...(o.exclude ?? []), ...list(next())];
    else if (a === '--seed') o.seed = Number(next());
    else if (a === '--resamples') o.B = Number(next());
    else if (a === '--baseline') o.baseline = next();
    else if (a === '--delta') o.delta = parseDelta(next());
    else if (a === '--format') o.format = next();
    else if (a === '--required-runs') o.requiredRuns = true;
    else if (a === '--sim') o.sim = true;
    else if (a === '--alpha') o.alpha = Number(next());
    else if (a === '--power') o.power = Number(next());
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`Tham số không hợp lệ: ${a}`);
  }
  if (!['md', 'json'].includes(o.format)) throw new Error('--format phải là md hoặc json');
  if (o.baseline !== undefined && !/^claude/.test(o.baseline)) throw new Error('--baseline phải là một hệ Claude Code (claude, claude-sonnet…)');
  if (o.delta && !o.requiredRuns) throw new Error('--delta chỉ có nghĩa cùng --required-runs');
  return o;
}

const HELP = 'Cách dùng: node stats.mjs [--runs a.csv,b.csv] [--rounds C5,C6] [--tasks t3-api] [--exclude-run <task_id|vòng/bài/hệ/lượt>] [--seed N] [--resamples N] [--baseline claude|claude-sonnet] [--format md|json] [--required-runs] [--delta wall=30,cost=0.1] [--sim] [--alpha 0.05] [--power 0.8]';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.help) { console.log(HELP); process.exit(0); }
    const here = dirname(fileURLToPath(import.meta.url));
    const files = o.runs ?? [resolve(here, '../results/runs.csv')]; // results/ đã có C1–C7; c6-extract/ không còn dùng
    const all = loadRuns(files, o.baseline ?? 'claude'), runs = filterRuns(all, o);
    if (!runs.length) throw new Error('Không còn lượt chạy nào sau khi lọc.');
    const res = analyse(runs, o);
    const meta = { files, filters: `rounds=${o.rounds?.join(',') ?? '*'} tasks=${o.tasks?.join(',') ?? '*'} exclude=${o.exclude?.join(',') ?? '-'} · ${runs.length}/${all.length} lượt` };
    console.log(o.format === 'json' ? JSON.stringify({ meta, ...res }, null, 2) : renderMd(res, meta));
  } catch (e) { console.error(`Lỗi: ${e.message}`); process.exit(1); }
}
