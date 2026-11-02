#!/usr/bin/env node
// R13 — phát lại B02-M offline: cổng B-02 (src/quality-gate.ts, chỉ import) trên mọi bench/vs-claude/results/C*/*/ccoding-task.json.
// Lệnh: node docs/research/analysis/b02m-replay.mjs [--json]
// Cách import: không có dist/ và không có tsc ⇒ đăng ký resolve hook ánh xạ './x.js' → './x.ts' rồi để Node (≥ 22.6, strip-types) nạp trực tiếp src/*.ts.
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// kpi.ts → util/extract.ts dùng parameter property ⇒ cần --experimental-transform-types; tự chạy lại một lần với cờ này.
if (!process.execArgv.includes('--experimental-transform-types')) {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['--experimental-transform-types', '--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(path.dirname(path.dirname(here)));
const hook = 'data:text/javascript,' + encodeURIComponent(`
import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && spec.endsWith('.js') && ctx.parentURL?.endsWith('.ts')) {
    const u = new URL(spec.replace(/\\.js$/, '.ts'), ctx.parentURL);
    if (fs.existsSync(fileURLToPath(u))) return next(u.href, ctx);
  }
  return next(spec, ctx);
}`);
register(hook);
const gate = await import(pathToFileURL(path.join(repo, 'src/quality-gate.ts')).href);
const { briefMentions, classifyChecks } = gate;

// ---- khoảng tin cậy chính xác Clopper–Pearson 95 % (chia đôi trên hàm phân phối nhị thức) ----
function binomCdf(k, n, p) { // P[X<=k]
  const lf = [0]; for (let i = 1; i <= n; i++) lf[i] = lf[i - 1] + Math.log(i);
  let s = 0;
  for (let i = 0; i <= k; i++) s += Math.exp(lf[n] - lf[i] - lf[n - i] + (i ? i * Math.log(p) : 0) + (n - i ? (n - i) * Math.log(1 - p) : 0));
  return Math.min(1, s);
}
function bisect(f) { let lo = 0, hi = 1; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m)) lo = m; else hi = m; } return (lo + hi) / 2; }
export function clopperPearson(x, n, alpha = 0.05) {
  if (n === 0) return [NaN, NaN];
  const lo = x === 0 ? 0 : bisect((p) => 1 - binomCdf(x - 1, n, p) < alpha / 2);
  const hi = x === n ? 1 : bisect((p) => binomCdf(x, n, p) > alpha / 2);
  return [lo, hi];
}
const pct = (v) => (Number.isNaN(v) ? 'n/a' : (v * 100).toFixed(1).replace('.', ',') + ' %');
const ci = (x, n) => { const [a, b] = clopperPearson(x, n); return `${x}/${n} = ${n ? pct(x / n) : 'n/a'} [${pct(a)}; ${pct(b)}]`; };

// ---- quét tệp ----
const root = path.join(repo, 'bench', 'vs-claude', 'results');
const files = [];
for (const c of fs.readdirSync(root).filter((x) => /^C\d+$/.test(x)).sort((a, b) => +a.slice(1) - +b.slice(1)))
  for (const d of fs.readdirSync(path.join(root, c)).sort()) {
    const f = path.join(root, c, d, 'ccoding-task.json');
    if (fs.existsSync(f)) files.push({ c, d, f });
  }

const rows = [];
for (const { c, d, f } of files) {
  const t = JSON.parse(fs.readFileSync(f, 'utf8'));
  const run = t.runs?.[t.runs.length - 1];
  const approved = run?.review?.approved;
  const pc = t.projectChecks;
  const miss = [];
  if (typeof t.brief !== 'string' || !t.brief) miss.push('brief');
  if (typeof approved !== 'boolean') miss.push('review.approved');
  if (!Array.isArray(pc?.latest) || !pc.latest.length) miss.push('projectChecks.latest');
  if (!Array.isArray(pc?.baseline)) miss.push('projectChecks.baseline');
  const row = { turn: `${c}/${d}`, lane: t.lane ?? '-', approved, miss };
  if (miss.length) { row.replayable = false; rows.push(row); continue; }
  row.replayable = true;
  const latest = pc.latest, baseline = pc.baseline;
  row.baseline = baseline.map((r) => `${r.command}:${r.ok ? 'xanh' : 'đỏ'}`).join('; ');
  row.latest = latest.map((r) => `${r.command}:${r.ok ? 'xanh' : 'đỏ'}`).join('; ');
  // Sự thật: lệnh đề bài nhắc tên (đòi xanh) mà còn đỏ lúc duyệt (bỏ lệnh bị chặn theo chính sách: không có bằng chứng).
  // Lưu ý: dùng briefMentions của chính cổng để xác định "đề bài đòi" ⇒ phần này không độc lập với cổng (xem Giới hạn).
  row.requiredRed = latest.filter((r) => !r.ok && !r.denied && briefMentions(t.brief, r.command)).map((r) => r.command);
  row.anyRed = latest.filter((r) => !r.ok).map((r) => r.command);
  const classes = classifyChecks(baseline, latest, t.brief, latest.map((r) => r.command));
  row.classes = classes.map((x) => `${x.command}:${x.cls}`).join('; ');
  // Cổng cấm approved ⇔ có 'red-required' (Orchestrator.runQualityGate: forceUnapproved, orchestrator.ts:3018-3027).
  row.gateBlocks = classes.some((x) => x.cls === 'red-required');
  // Biến thể rộng: cả 'regression-or-new' (vòng sửa/nâng cấp, orchestrator.ts:1370).
  row.gateBlocksWide = classes.some((x) => x.cls === 'red-required' || x.cls === 'regression-or-new');
  row.truth = approved === true && row.requiredRed.length > 0; // "duyệt khi còn đỏ"
  row.truthAnyRed = approved === true && row.anyRed.length > 0;
  rows.push(row);
}

const rp = rows.filter((r) => r.replayable);
function matrix(truthKey, gateKey) {
  const m = { tp: [], fn: [], fp: [], tn: [] };
  for (const r of rp) (r[truthKey] ? (r[gateKey] ? m.tp : m.fn) : (r[gateKey] ? m.fp : m.tn)).push(r.turn);
  return m;
}
const M = matrix('truth', 'gateBlocks'), Mw = matrix('truth', 'gateBlocksWide'), Ma = matrix('truthAnyRed', 'gateBlocks');

const git = (...a) => { try { return execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim(); } catch { return 'n/a'; } };
const t5 = rows.find((r) => r.turn === 'C9/t5-logq.ccoding-fastlane.2');
const out = [];
const P = (s = '') => out.push(s);
P(`<!-- sinh bởi docs/research/analysis/b02m-replay.mjs; Node ${process.version}; src/quality-gate.ts @ ${git('log', '-1', '--format=%h', '--', 'src/quality-gate.ts')} -->`);
P('## Bảng từng lượt');
P();
P('| Lượt | làn | approved | baseline | sau (latest) | phân loại cổng | thật: duyệt khi còn đỏ | cổng chặn |');
P('|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  if (!r.replayable) P(`| ${r.turn} | ${r.lane} | ${r.approved ?? '?'} | không phát lại được (thiếu ${r.miss.join(', ')}) | | | | |`);
  else P(`| ${r.turn} | ${r.lane} | ${r.approved} | ${r.baseline} | ${r.latest} | ${r.classes} | ${r.truth ? 'CÓ' : 'không'} | ${r.gateBlocks ? 'CHẶN' : 'không'} |`);
}
P();
P('## Ma trận nhầm lẫn (chính: cổng = `forceUnapproved`, tức có lệnh `red-required`)');
P();
P('| | cổng chặn | cổng không chặn | tổng |');
P('|---|---|---|---|');
P(`| thật sự "duyệt khi còn đỏ" | ${M.tp.length} | ${M.fn.length} | ${M.tp.length + M.fn.length} |`);
P(`| lượt xanh / không duyệt-khi-đỏ | ${M.fp.length} | ${M.tn.length} | ${M.fp.length + M.tn.length} |`);
P();
P(`- n phát lại được = ${rp.length}; không phát lại được = ${rows.length - rp.length} (tổng ${rows.length} tệp).`);
P(`- Tỷ lệ bắt đúng (độ nhạy) = ${ci(M.tp.length, M.tp.length + M.fn.length)} (Clopper–Pearson 95 %).`);
P(`- Tỷ lệ chặn nhầm = ${ci(M.fp.length, M.fp.length + M.tn.length)} (Clopper–Pearson 95 %).`);
P(`- Lượt bị bắt đúng: ${M.tp.join(', ') || 'không có'}.`);
P(`- Lượt bỏ sót (duyệt khi còn đỏ mà cổng không chặn): ${M.fn.join(', ') || 'không có'}.`);
P(`- **Lượt xanh bị chặn nhầm (${M.fp.length}):** ${M.fp.join(', ') || 'không có'}.`);
P();
P('### Biến thể');
P();
P(`- Cổng rộng (chặn cả \`regression-or-new\`): bắt ${Mw.tp.length}/${Mw.tp.length + Mw.fn.length}, chặn nhầm ${Mw.fp.length}/${Mw.fp.length + Mw.tn.length}${Mw.fp.length ? ' — ' + Mw.fp.join(', ') : ''}.`);
P(`- Sự thật rộng ("duyệt khi có bất kỳ lệnh đỏ", không cần đề bài nhắc tên): thật = ${Ma.tp.length + Ma.fn.length}; cổng chính bắt ${Ma.tp.length}, bỏ sót ${Ma.fn.length}${Ma.fn.length ? ' — ' + Ma.fn.join(', ') : ''}.`);
P();
P('## Ca C9 t5-logq.ccoding-fastlane.2');
P();
if (t5?.replayable) P(`approved=${t5.approved}; baseline: ${t5.baseline}; sau: ${t5.latest}; phân loại: ${t5.classes}; lệnh đề bài đòi xanh còn đỏ: ${t5.requiredRed.join(', ') || 'không'}; cổng ${t5.gateBlocks ? 'BẮT ĐƯỢC (chặn)' : 'KHÔNG bắt được'}.`);
else P('không phát lại được.');
if (process.argv.includes('--json')) fs.writeFileSync(path.join(here, 'b02m-replay.json'), JSON.stringify({ rows, M, Mw, Ma }, null, 1));
console.log(out.join('\n'));
