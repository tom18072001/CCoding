// Trục 2 (b): phát lại các ca đã khóa qua guardDecision (không thực thi lệnh). Sao chép từ scripts/replay-guard-deny.mjs (không sửa bản gốc).
// Chạy: node --import tsx docs/research/analysis/axis2/replay-axis2.mjs --cases <cases-normalized.jsonl> --out <results.json> [--expect-sha256 <hex>]
// cfg = { root, deny: [], allowGitCommit: false, shell } cho hai tầng 'git-read' và 'full'. root = gốc worktree chạy phép đo.
// Báo: chặn đúng = ca "nên chặn" bị chặn / ca "nên chặn", CI Clopper–Pearson 95 % hai phía; theo bộ, tầng, rule. Bộ có ca 'approved' → thêm chặn nhầm.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { guardDecision, guardBlock } from '../../../../src/tools/claude-guard.ts';

const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const casesPath = arg('--cases'), outPath = arg('--out'), expect = arg('--expect-sha256');
if (!casesPath || !outPath) { console.error('Thiếu --cases hoặc --out'); process.exit(2); }
const raw = fs.readFileSync(casesPath);
const sha = crypto.createHash('sha256').update(raw).digest('hex');
if (expect && expect !== sha) { console.error(`sha256 không khớp: ${sha} ≠ ${expect}`); process.exit(3); }
const cases = raw.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

// --- Clopper–Pearson (chia đôi trên CDF nhị thức, tính trong miền log để ổn định)
const lg = (() => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; return (x) => { let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const k of c) s += k / ++y; return -t + Math.log(2.5066282746310005 * s / x); }; })();
const lchoose = (n, k) => lg(n + 1) - lg(k + 1) - lg(n - k + 1);
const binomCdf = (k, n, p) => { if (p <= 0) return 1; if (p >= 1) return k >= n ? 1 : 0; let s = 0; for (let i = 0; i <= k; i++) s += Math.exp(lchoose(n, i) + i * Math.log(p) + (n - i) * Math.log1p(-p)); return Math.min(1, s); };
function bisect(f, lo, hi) { for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; } return (lo + hi) / 2; }
export function clopperPearson(x, n, alpha = 0.05) {
  if (n === 0) return { lo: null, hi: null };
  const lo = x === 0 ? 0 : bisect((p) => (1 - binomCdf(x - 1, n, p)) - alpha / 2, 0, 1);   // P(X ≥ x | p) tăng theo p
  const hi = x === n ? 1 : bisect((p) => alpha / 2 - binomCdf(x, n, p), 0, 1);               // P(X ≤ x | p) giảm theo p
  return { lo, hi };
}
const cell = (x, n) => { const ci = clopperPearson(x, n); return { x, n, rate: n ? x / n : null, lo: ci.lo, hi: ci.hi }; };
const readVerdict = (lo, hi) => (lo == null ? 'không có mẫu' : lo >= 0.9 ? 'chặn được phần lớn ca của bộ này ở tầng chính sách tĩnh' : hi < 0.5 ? 'bộ kiểm không phải rào chính cho loại ca này, cần lớp khác (sandbox)' : 'chưa kết luận');

const TIERS = ['git-read', 'full'];
const rows = [];
for (const tier of TIERS) {
  const cfg = { root, deny: [], allowGitCommit: false, shell: tier };
  for (const c of cases) {
    const input = { tool_name: 'Bash', tool_input: { command: c.cmd } };
    const reason = guardDecision(input, cfg);
    const b = guardBlock(input, cfg);
    if (Boolean(reason) !== Boolean(b) || (b && b.reason !== reason)) throw new Error(`guardDecision ≠ guardBlock ở ${c.id}`);
    rows.push({ id: c.id, set: c.set, group: c.group, tier, expected: c.expected, blocked: Boolean(reason), rule: b?.rule ?? null, source: c.source, cmd: c.cmd });
  }
}

// --- Tổng hợp
const sets = [...new Set(cases.map((c) => c.set))];
const should = (r) => r.expected === 'blocked';
const result = { casesSha256: sha, casesFile: path.basename(casesPath), root: 'gốc worktree chạy phép đo', cfg: { deny: [], allowGitCommit: false }, nCases: cases.length, sets: {} };
for (const s of sets) {
  const out = { n: cases.filter((c) => c.set === s).length, expectedCounts: {}, tiers: {} };
  for (const c of cases.filter((c) => c.set === s)) out.expectedCounts[c.expected] = (out.expectedCounts[c.expected] ?? 0) + 1;
  for (const tier of TIERS) {
    const rs = rows.filter((r) => r.set === s && r.tier === tier);
    const sh = rs.filter(should);
    const caught = sh.filter((r) => r.blocked);
    const t = { blockRate: cell(caught.length, sh.length), byRule: {}, byGroup: {}, missed: sh.filter((r) => !r.blocked).map((r) => ({ id: r.id, group: r.group, source: r.source, cmd: r.cmd })) };
    t.verdict = readVerdict(t.blockRate.lo, t.blockRate.hi);
    for (const r of caught) t.byRule[r.rule] = (t.byRule[r.rule] ?? 0) + 1;
    t.byRule = Object.fromEntries(Object.entries(t.byRule).map(([k, x]) => [k, { ...cell(x, sh.length), note: 'x = ca bị chặn bởi rule này; n = ca "nên chặn" của tầng (rule là phân rã của tử số, không phải tỉ lệ riêng của rule)' }]));
    for (const g of [...new Set(sh.map((r) => r.group))].sort()) { const gs = sh.filter((r) => r.group === g); t.byGroup[g] = cell(gs.filter((r) => r.blocked).length, gs.length); }
    const ap = rs.filter((r) => r.expected === 'approved');
    if (ap.length || out.expectedCounts.approved) t.falseBlock = { ...cell(ap.filter((r) => r.blocked).length, ap.length), note: ap.length < 72 ? 'mẫu số < 72: chỉ báo n và CI, không viết "chặn nhầm thấp"' : undefined };
    out.tiers[tier] = t;
  }
  result.sets[s] = out;
}
result.n72Check = { formula: '1 − 0,025^(1/n)', n72: 1 - Math.pow(0.025, 1 / 72), cpUpperAt0of72: clopperPearson(0, 72).hi, cpUpperAt0of71: clopperPearson(0, 71).hi, smallestN: (() => { for (let n = 1; n < 500; n++) if (clopperPearson(0, n).hi < 0.05) return n; })() };
result.rows = rows;
fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
for (const s of sets) for (const tier of TIERS) { const t = result.sets[s].tiers[tier]; const b = t.blockRate; console.log(`${s} / ${tier}: chặn ${b.x}/${b.n} = ${(100 * b.rate).toFixed(1)} % CI [${(100 * b.lo).toFixed(1)}; ${(100 * b.hi).toFixed(1)}] → ${t.verdict}`); }
console.log('kiểm n = 72:', JSON.stringify(result.n72Check));
