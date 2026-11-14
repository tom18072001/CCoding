#!/usr/bin/env node
// BRIEF-22 K2 — bảng điểm từng agent, chỗ fail, hiệu quả chia việc. Không gọi LLM, chỉ đọc tệp trong repo.
// Cách dùng:
//   node docs/research/analysis/decisions/scorecard.mjs            in mọi bảng ra stdout
//   node docs/research/analysis/decisions/scorecard.mjs --write    ghi lại các khối bảng trong scorecard.md và effectiveness.md
//   node docs/research/analysis/decisions/scorecard.mjs --check    so khối bảng trong 2 tệp md với đầu ra; exit 1 nếu lệch hoặc không đủ 20 dòng agent
// Khối bảng trong md nằm giữa <!-- BEGIN:tên --> và <!-- END:tên -->; phần chữ ngoài khối do người viết, không kiểm.
// Dữ liệu cấu trúc kế hoạch dùng lại decomp-metrics.mjs (đã tính ra decomp-agg.json); script này chỉ đọc kết quả đó.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const RES = path.join(ROOT, 'bench', 'vs-claude', 'results');
const DEC = path.join(RES, 'decisions');
const MD = { scorecard: path.join(HERE, 'scorecard.md'), effectiveness: path.join(HERE, 'effectiveness.md') };
const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--write') ? 'write' : 'print';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const readText = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const readJsonl = (p) => readText(p).split('\n').filter(Boolean).map((l) => JSON.parse(l));

// ───────────── định dạng và thống kê nhỏ ─────────────
const vn = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ','));
const pct = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : `${vn(x * 100, d)} %`);
const frac = (a, b) => `${a}/${b}`;
const sorted = (a) => [...a].sort((x, y) => x - y);
const quant = (a, p) => { if (!a.length) return null; const s = sorted(a); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const median = (a) => quant(a, 0.5);
const meanOf = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const iqr = (a) => (a.length ? `${vn(median(a), 2)} (IQR ${vn(quant(a, 0.25), 2)}–${vn(quant(a, 0.75), 2)})` : '—');
const ranks = (a) => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const rk = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = rk; i = j + 1; } return r; };
function spearman(x, y) {
  if (x.length < 5) return null;
  const rx = ranks(x), ry = ranks(y), mx = meanOf(rx), my = meanOf(ry);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < rx.length; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
// Clopper–Pearson 95 % hai phía bằng chia đôi trên CDF nhị thức
function binomCdf(k, n, p) { let s = 0, c = 1; for (let i = 0; i <= k; i++) { if (i > 0) c = (c * (n - i + 1)) / i; s += c * p ** i * (1 - p) ** (n - i); } return s; }
function cp95(x, n) {
  const solve = (f) => { let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m)) lo = m; else hi = m; } return (lo + hi) / 2; };
  const lo = x === 0 ? 0 : solve((p) => 1 - binomCdf(x - 1, n, p) < 0.025);
  const hi = x === n ? 1 : solve((p) => binomCdf(x, n, p) > 0.025);
  return [lo, hi];
}
const rate = (x, n) => { const [lo, hi] = cp95(x, n); return `${frac(x, n)} = ${pct(x / n)} [${vn(lo * 100)}; ${vn(hi * 100)}]`; };
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

const facts = {}; // khóa brief22.* → giá trị (chuỗi hiển thị hoặc số)
const setFact = (k, v) => { facts[`brief22.${k}`] = v; };
const blocks = { scorecard: {}, effectiveness: {} };
const sourcesMissing = [];

// ───────────── nạp dữ liệu ─────────────
const kpi = readJson(path.join(DEC, 'kpi-office.json'));
const agg = readJson(path.join(DEC, 'decomp-agg.json'));
const runlog = readText(path.join(DEC, 'RUNLOG.md'));
const pRunlog = readText(path.join(RES, 'p-parallel', 'RUNLOG.md'));
const gReport = readText(path.join(RES, 'g-mutation', 'report.md'));
const e7Report = readText(path.join(RES, 'e7-cto', 'report.md'));
const ax2 = readJson(path.join(RES, 'axis2-guard', 'results.json'));

const batches = {};
for (const d of fs.readdirSync(RES)) {
  const f = path.join(RES, d, 'runs.jsonl');
  if (d === 'e7-cto' || d === 'selftest' || !fs.existsSync(f)) continue;
  batches[d] = readJsonl(f);
}
const isCC = (r) => r.status === 'done' && r.byPhase && !String(r.arm).startsWith('A');
const isA0 = (r) => r.status === 'done' && /^A0/.test(r.arm);

const AG = kpi.agents;
const idOf = (id) => AG.find((a) => a.agentId === id);
const GROUPS = ['quality', 'outcome', 'honesty', 'efficiency', 'reliability', 'compliance'];
const GROUP_VN = { quality: 'Chất lượng', outcome: 'Kết quả thật', honesty: 'Trung thực', efficiency: 'Hiệu quả', reliability: 'Tin cậy', compliance: 'Tuân thủ' };

// ───────────── (1a) KPI v2 từng agent ─────────────
let kpiRows;
// 6 agent của roster (agents/) không có trong kpi-office.json: ghi "không có dữ liệu trong 30 ngày", ô điểm là "—" (không phải 0).
const NODATA = [
  ['orchestrator', 'router', 'office'], ['solution-architect', 'member', 'dev'], ['frontend-dev', 'member', 'dev'],
  ['data-engineer', 'member', 'dev'], ['business-analyst', 'member', 'dev'], ['ba-presales', 'member', 'dev'],
];
const ROSTER_N = 20;
{
  const rows = AG.map((a) => [
    `\`${a.agentId}\``, a.role, a.department, `**${a.score}** (${a.grade})`, String(a.scoreRaw),
    ...GROUPS.map((g) => (a.scores[g] == null ? 'n/a' : String(a.scores[g]))),
    `${a.confidence} (n=${a.evidenceN})`,
    String(a.findings.length), `${a.failedCalls}/${a.calls}`, `${a.truncated}/${a.calls}`,
  ]);
  kpiRows = rows;
  for (const a of AG) {
    setFact(`kpi.${a.agentId}.total`, a.score);
    setFact(`kpi.${a.agentId}.grade`, a.grade);
    setFact(`kpi.${a.agentId}.confidence`, a.confidence);
    setFact(`kpi.${a.agentId}.evidenceN`, a.evidenceN);
    setFact(`kpi.${a.agentId}.findings`, a.findings.length);
    setFact(`kpi.${a.agentId}.failedCalls`, a.failedCalls);
    setFact(`kpi.${a.agentId}.truncated`, a.truncated);
    setFact(`kpi.${a.agentId}.calls`, a.calls);
    for (const g of GROUPS) if (a.scores[g] != null) setFact(`kpi.${a.agentId}.${g}`, a.scores[g]);
  }
  const trunc = AG.reduce((s, a) => s + a.truncated, 0), calls = AG.reduce((s, a) => s + a.calls, 0), failed = AG.reduce((s, a) => s + a.failedCalls, 0);
  const withTrunc = AG.filter((a) => a.truncated > 0).length;
  setFact('kpi.agents', AG.length); setFact('kpi.callsTotal', calls); setFact('kpi.truncatedTotal', trunc); setFact('kpi.failedCallsTotal', failed);
  setFact('kpi.agentsWithTruncated', withTrunc);
  setFact('kpi.tasksByStatus', Object.entries(kpi.tasksByStatus).map(([k, v]) => `${k} ${v}`).join(', '));
  setFact('kpi.tasksCountedField', kpi.tasksCounted);
  setFact('kpi.tasksByStatusSum', Object.values(kpi.tasksByStatus).reduce((s, v) => s + v, 0));
  const scores = AG.map((a) => a.score);
  setFact('kpi.scoreMedian', median(scores)); setFact('kpi.scoreMin', Math.min(...scores)); setFact('kpi.scoreMax', Math.max(...scores));
  const lowEv = AG.filter((a) => a.confidence === 'low').map((a) => a.agentId);
  setFact('kpi.lowConfidenceAgents', lowEv.join(', '));
  const mapDept = Object.fromEntries(kpi.departments.map((d) => [d.id, d]));
  setFact('kpi.dept.dev.score', mapDept.dev?.score); setFact('kpi.dept.research.score', mapDept.research?.score); setFact('kpi.dept.office.score', mapDept.office?.score);
  setFact('kpi.dept.research.tokens', mapDept.research?.tokens); setFact('kpi.dept.dev.tokens', mapDept.dev?.tokens);
  blocks.scorecard.kpiNotes = [
    `- Nguồn: \`bench/vs-claude/results/decisions/kpi-office.json\` (\`generatedAt\` ${kpi.generatedAt}); trường \`tasksByStatus\`: ${Object.entries(kpi.tasksByStatus).map(([k, v]) => `${k} ${v}`).join(', ')} (tổng ${facts['brief22.kpi.tasksByStatusSum']}); trường \`tasksCounted\` = ${kpi.tasksCounted}. Hai con số lệch nhau, tệp không giải thích (xem mục chỗ fail F-M1).`,
    `- Số dòng agent có KPI: ${AG.length} (dev ${AG.filter((a) => a.department === 'dev').length}, research ${AG.filter((a) => a.department === 'research').length}, office ${AG.filter((a) => a.department === 'office').length}). Điểm phòng: ${kpi.departments.map((d) => `${d.id} ${d.score}`).join(', ')}.`,
    `- **Lượt hỏng** (cột "Lượt hỏng") = \`failedCalls\`/\`calls\` của agent: lượt hỏng do agent, công cụ lỗi, chạm trần, kết luận không đọc được, sản phẩm rỗng theo trường \`method\` (nhóm Tin cậy); lỗi hạ tầng (\`infraFailedCalls\`) không tính điểm, chỉ báo. **Đầu ra bị cắt** (cột "Bị cắt") = \`truncated\`/\`calls\`: lượt đầu ra chạm giới hạn độ dài. Hai định nghĩa giữ đúng như \`kpi-office.json\`, không định nghĩa lại. \`failedCalls\` của mọi agent đều 0 trừ \`dev-lead\` (${idOf('dev-lead').failedCalls}); \`infraFailedCalls\` = ${AG.reduce((s, a) => s + a.infraFailedCalls, 0)} ở cả 14 agent.`,
    `- "n/a" = nhóm không có dữ liệu nên bị bỏ khỏi điểm (theo \`method\`: nhóm không có dữ liệu bỏ qua; điểm co về 60 theo lượng bằng chứng \`evidenceN\`).`,
    `- **6 agent không có trong \`kpi-office.json\`** (điều phối viên \`orchestrator\`, \`solution-architect\`, \`frontend-dev\`, \`data-engineer\`, \`business-analyst\`, \`ba-presales\`): dòng ghi "không có dữ liệu trong 30 ngày", ô điểm là "—" (không cho điểm, không phải 0). Roster \`agents/\` có ${AG.length + NODATA.length} agent = ${AG.length} có KPI + ${NODATA.length} không có.`,
    `- **Điều phối viên — chi phí khâu route (thay cho KPI).** Nguồn: \`byPhase.route\` trong \`bench/vs-claude/results/*/runs.jsonl\` (trừ \`e7-cto\`, \`selftest\`), chỉ lượt CCoding \`done\` có \`byPhase\` (bỏ arm A*). Cách tính: với mỗi lượt có \`byPhase.route\`, chi phí = token có trọng số của khâu route; tỉ trọng = route ÷ tổng \`byPhase\` của lượt; báo trung vị. Không chạy benchmark mới; số cụ thể ở mục 1b (dòng "Điều phối viên") và khóa \`brief22.route.*\`.`,
  ].join('\n');
}

// ───────────── (1b) số đo theo vai ─────────────
const P = agg.groups['P'], PD = agg.groups['P/dev'], PR = agg.groups['P/research'], OF = agg.groups['office'];
const st = (g, k) => g?.[k] ?? null;
{
  const row = (name, g) => [name, String(g.runs), iqr(g.subtasksPerPlan ? [] : []) && `${vn(g.subtasksPerPlan.median, 1)} (${g.subtasksPerPlan.min}–${g.subtasksPerPlan.max})`,
    `${vn(g.potentialSpeedup.median, 2)} (${vn(g.potentialSpeedup.q1, 2)}–${vn(g.potentialSpeedup.q3, 2)})`,
    `${vn(g.achievedSpeedup.median, 2)} (${vn(g.achievedSpeedup.q1, 2)}–${vn(g.achievedSpeedup.q3, 2)})`,
    `${vn(g.maxConc.median, 0)} (${g.maxConc.min}–${g.maxConc.max})`,
    `${pct(g.slackOverCp.median)} (${pct(g.slackOverCp.q1)}–${pct(g.slackOverCp.q3)})`,
    `${pct(g.longestShare.median)} (${pct(g.longestShare.q1)}–${pct(g.longestShare.q3)})`,
    `${frac(g.plansWithLongestShareOver50pct, g.runs)}`,
    `${pct(g.reworkShare.median)} (${pct(g.reworkShare.q1)}–${pct(g.reworkShare.q3)})`,
    `${frac(g.singleSubtaskPlans, g.runs)}`, String(g.conflicts)];
  const head = ['Nhóm', 'Lượt', 'Hạng mục/kế hoạch', 'Song song cho phép (work/cp)', 'Song song đạt được (work/span)', 'maxConc', 'Vượt đường găng', 'Hạng mục dài nhất / tổng', 'Lượt >50 %', 'Làm lại (tỉ lệ hạng mục)', 'Kế hoạch 1 hạng mục', 'Hạng mục còn xung đột'];
  blocks.scorecard.lead = table(head, [row('P (server chính)', P), row('P/dev', PD), row('P/research', PR), row('Văn phòng phụ', OF && agg.groups.office)]) + '\n\nÔ dạng `trung vị (q1–q3)` hoặc `trung vị (min–max)`; tính bằng `decomp-metrics.mjs` ra `decomp-agg.json`.';
  for (const [k, g] of [['P', P], ['office', agg.groups.office]]) {
    setFact(`decomp.${k}.runs`, g.runs);
    setFact(`decomp.${k}.subtasksMedian`, g.subtasksPerPlan.median);
    setFact(`decomp.${k}.parAllowedMedian`, g.potentialSpeedup.median);
    setFact(`decomp.${k}.parAchievedMedian`, g.achievedSpeedup.median);
    setFact(`decomp.${k}.slackMedian`, g.slackOverCp.median);
    setFact(`decomp.${k}.slackQ3`, g.slackOverCp.q3);
    setFact(`decomp.${k}.longestShareMedian`, g.longestShare.median);
    setFact(`decomp.${k}.longestShareOver50`, g.plansWithLongestShareOver50pct);
    setFact(`decomp.${k}.reworkShareMedian`, g.reworkShare.median);
    setFact(`decomp.${k}.singleSubtaskPlans`, g.singleSubtaskPlans);
    setFact(`decomp.${k}.plansWithAnyParallel`, g.plansWithAnyParallel);
  }
  setFact('decomp.P.dev.runs', PD.runs); setFact('decomp.P.research.runs', PR.runs);
  const o = agg.office;
  setFact('decomp.office.replanned', o.replanned); setFact('decomp.office.planGateBlocked', o.planGateBlocked);
  setFact('decomp.office.reviewSkipped', o.reviewSkipped);
  setFact('decomp.office.acceptedTasks', o.acceptedTasks); setFact('decomp.office.notAcceptedTasks', o.notAcceptedTasks);
  setFact('decomp.office.briefItems', o.briefItems); setFact('decomp.office.briefItemsCovered', o.briefItemsCovered);
  setFact('decomp.office.briefRoleItems', o.briefRoleItems); setFact('decomp.office.briefRoleItemsCovered', o.briefRoleItemsCovered);
  setFact('decomp.office.planModels', Object.entries(o.planModels).map(([k, v]) => `${k} ×${v}`).join(', '));

  const cov = `${frac(o.briefItemsCovered, o.briefItems)} = ${pct(o.briefItemsCovered / o.briefItems)}`;
  const covRole = `${frac(o.briefRoleItemsCovered, o.briefRoleItems)} = ${pct(o.briefRoleItemsCovered / o.briefRoleItems)}`;
  blocks.scorecard.leadCover = table(['Số đo (5 lượt văn phòng phụ, `decomp-agg.json` → `office`)', 'Giá trị'], [
    ['Model của lượt `plan`', Object.entries(o.planModels).map(([k, v]) => `${k} ×${v}`).join(', ')],
    ['Độ phủ hạng mục đề bài (mã K… có trong ít nhất một hạng mục kế hoạch)', cov],
    ['Độ phủ vai (hạng mục nêu id agent có hạng mục giao đúng agent đó)', covRole],
    ['Cổng phủ kế hoạch chặn / lập lại kế hoạch', `${o.planGateBlocked} chặn / ${o.replanned} lập lại`],
    ['Review bị cổng chất lượng bỏ ("không thuộc diện bắt buộc review")', frac(o.reviewSkipped, o.runs)],
    ['Nhiệm vụ CTO nghiệm thu / không nghiệm thu', `${o.acceptedTasks} / ${o.notAcceptedTasks}`],
  ]) + `\n\nĐộ phủ đo bằng regex mã \`K\\d+\` (RUNLOG, mục Giới hạn): có thể sót cách viết khác; đề D14–D16 dùng tên vai không có trong roster nên không vào mẫu số độ phủ vai. P (56 lượt) không có dữ liệu độ phủ vì không có đề bài.`;
  setFact('decomp.office.coverageBrief', `${o.briefItemsCovered}/${o.briefItems}`);
  setFact('decomp.office.coverageRole', `${o.briefRoleItemsCovered}/${o.briefRoleItems}`);
}

// reviewer, CTO, orchestrator (1b tiếp)
// — E7 đọc từ báo cáo
const e7 = {};
for (const arm of ['R1', 'R2', 'R3']) {
  const m = new RegExp(`^\\| ${arm} \\| (\\d+)/(\\d+) = [\\d,]+ % \\|[^|]*\\|[^|]*\\| (\\d+)/(\\d+) = [\\d,]+ % \\|[^|]*\\| (\\d+) \\|`, 'm').exec(e7Report);
  if (!m) { sourcesMissing.push(`e7-cto/report.md: không đọc được hàng ${arm}`); continue; }
  e7[arm] = { catch: +m[1], bad: +m[2], fb: +m[3], good: +m[4], unread: +m[5] };
}
// — G-3
const gAll = /^\| tất cả \|[^|]*\|[^|]*\| (\d+)\/(\d+) = ([\d,]+) % \[([\d,]+) %; ([\d,]+) %\] \((\d+) lượt, (\d+) bài\)/m.exec(gReport);
const gFalse = /^\| tất cả \| (\d+)\/(\d+) = [\d,]+ % \[[\d,]+ %; ([\d,]+) %\] \| (\d+)\/(\d+)/m.exec(gReport);
if (!gAll) sourcesMissing.push('g-mutation/report.md: không đọc được hàng "tất cả"');
const g3 = gAll ? { x: +gAll[1], n: +gAll[2], pctTxt: gAll[3], lo: gAll[4], hi: gAll[5], runs: +gAll[6], tasks: +gAll[7] } : null;
const g3False = gFalse ? { x: +gFalse[1], n: +gFalse[2] } : null;
// — gộp worktree
const mergeM = /\*\*(\d+) lần xung đột khi gộp = ([\d,]+) %\*\* trên (\d+) lần gộp \(CI \[([\d,]+); ([\d,]+)\]\)/.exec(pRunlog);
const merges207 = /(\d+) lần gộp xong/.exec(pRunlog);
const newRed = /đỏ mới do nhiệm vụ: (\d+)\/(\d+) = ([\d,]+) %/.exec(pRunlog);
if (!mergeM) sourcesMissing.push('p-parallel/RUNLOG.md: không đọc được xung đột khi gộp');
const merge = mergeM ? { x: +mergeM[1], pct: mergeM[2], n: +mergeM[3], lo: mergeM[4], hi: mergeM[5] } : null;
// — trục 2 (b)
const tiers = ax2.sets.redcode.tiers;
const ax = { gitRead: tiers['git-read'].blockRate, full: tiers.full.blockRate, fullRules: tiers.full.byRule };

// — chi phí route từ bench
function phaseStats(runs) {
  const tot = {}; let all = 0;
  for (const r of runs) for (const [k, v] of Object.entries(r.byPhase)) { tot[k] = (tot[k] ?? 0) + v; all += v; }
  return { tot, all };
}
const ccAll = Object.entries(batches).flatMap(([b, rs]) => rs.filter(isCC).map((r) => ({ ...r, _b: b })));
const withRoute = ccAll.filter((r) => r.byPhase.route != null);
const routeShare = withRoute.map((r) => r.byPhase.route / Object.values(r.byPhase).reduce((s, v) => s + v, 0));
const routeTok = withRoute.map((r) => r.byPhase.route);
const routeModels = {};
for (const r of withRoute) for (const m of r.byPhaseModel?.route ?? []) routeModels[m] = (routeModels[m] ?? 0) + 1;
const routeBatches = [...new Set(withRoute.map((r) => r._b))];
setFact('route.runsWithRoute', withRoute.length); setFact('route.runsCCoding', ccAll.length);
setFact('route.tokensMedian', Math.round(median(routeTok))); setFact('route.shareMedian', routeShare.length ? Math.round(median(routeShare) * 1000) / 1000 : null);
setFact('route.models', Object.entries(routeModels).map(([k, v]) => `${k} ×${v}`).join(', '));

// — dòng KPI đủ 20 agent: 14 có dữ liệu + 6 không có
{
  const NO = 'không có dữ liệu trong 30 ngày';
  const rows = NODATA.map(([id, role, dept]) => [`\`${id}\``, role, dept, '—', '—', ...GROUPS.map(() => '—'),
    id === 'orchestrator' ? `${NO}; chi phí route (bench): ${withRoute.length}/${ccAll.length} lượt CCoding có khâu route, trung vị ${vn(median(routeTok), 0)} token có trọng số = ${pct(median(routeShare))} tổng (mục 1b, "Điều phối viên")` : NO,
    '—', '—', '—']);
  blocks.scorecard.kpi = table(['Agent', 'Vai', 'Phòng', 'Điểm (hạng)', 'Thô', ...GROUPS.map((g) => GROUP_VN[g]), 'Mức bằng chứng', 'Findings', 'Lượt hỏng', 'Bị cắt'], [...kpiRows, ...rows]);
  setFact('kpi.agentsNoData', NODATA.length); setFact('kpi.rosterAgents', AG.length + NODATA.length);
}

// — review bị bỏ trong bench
const fastSingle = ccAll.filter((r) => r.lane);
const reviewPresent = (rs) => rs.filter((r) => (r.byPhase.review ?? 0) > 0).length;
const byLane = {};
for (const r of ccAll) if (r.lane) { const k = r.lane; (byLane[k] ??= []).push(r); }
const laneRows = Object.entries(byLane).map(([lane, rs]) => [lane, String(rs.length), frac(reviewPresent(rs), rs.length), frac(rs.filter((r) => (r.byPhase.accept ?? 0) > 0).length, rs.length)]);
setFact('bench.ccodingRuns', ccAll.length);
setFact('bench.ccodingRunsWithLane', fastSingle.length);
for (const [lane, rs] of Object.entries(byLane)) { setFact(`bench.lane.${lane}.runs`, rs.length); setFact(`bench.lane.${lane}.withReview`, reviewPresent(rs)); }
const fullRuns = ccAll.filter((r) => r.lane === 'full');
const fullWithReview = reviewPresent(fullRuns);
const escal = ccAll.filter((r) => r.escalatedFrom);
setFact('bench.escalatedFrom', escal.length);
const escalBy = {}; for (const r of escal) escalBy[r.escalatedFrom] = (escalBy[r.escalatedFrom] ?? 0) + 1;
setFact('bench.escalatedFromDetail', Object.entries(escalBy).map(([k, v]) => `${k} ${v}`).join(', '));

{
  const q = idOf('qa-tester'), pr = idOf('peer-reviewer');
  const ord = e7.R1;
  const rows = [
    ['**Reviewer** (`qa-tester`, `peer-reviewer`, KPI)', `qa-tester: ${q.quality.reviewed} review, lần đầu ổn ${q.quality.firstPassOk}/${q.quality.reviewed}, kết luận không đọc được ${q.format.reviewUnparsed}, bị cắt ${q.truncated}/${q.calls} lượt; peer-reviewer: ${pr.quality.reviewed} review đo được, bị cắt ${pr.truncated}/${pr.calls} lượt, findings ${pr.findingKeys.join(', ')}`, '`kpi-office.json`'],
    ['**Reviewer** — review bị cổng chất lượng bỏ (văn phòng phụ)', `${frac(agg.office.reviewSkipped, agg.office.runs)} lượt phòng`, '`decomp-agg.json` → office.reviewSkipped'],
    ['**Reviewer** — bench: lượt CCoding có khâu `review` (byPhase.review > 0)', `mọi lượt CCoding \`done\`: ${frac(reviewPresent(ccAll), ccAll.length)}; theo làn (chỉ đợt có \`lane\`): ${laneRows.map(([l, n, rv]) => `${l} ${rv}`).join('; ')}. Lượt có review nằm toàn ở đợt \`study-cloud\` (không có \`lane\`). Các arm đợt có \`lane\` không có khâu review trong \`byPhase\`; \`runs.jsonl\` không ghi lý do (thiết kế arm hay cổng chất lượng), nên không đọc đây là agent bỏ review`, '`*/runs.jsonl`'],
    ['**Reviewer** — độ đúng của kết luận', 'Không có số: không có tập review có đáp án thật. KPI chỉ đo "lần đầu ổn / cuối sạch" (n ≤ 2 mỗi agent). **[Cần đo thêm]**', '`kpi-office.json` → quality'],
    ['**CTO** — E7 recall (lỗi lọt cổng, n=' + (ord?.bad ?? '—') + ')', ['R1', 'R2', 'R3'].filter((a) => e7[a]).map((a) => `${a}: ${rate(e7[a].catch, e7[a].bad)}`).join('; '), '`e7-cto/report.md` mục 2'],
    ['**CTO** — E7 chặn nhầm (sản phẩm đúng, n=' + (ord?.good ?? '—') + ')', ['R1', 'R2', 'R3'].filter((a) => e7[a]).map((a) => `${a}: ${rate(e7[a].fb, e7[a].good)}`).join('; '), '`e7-cto/report.md` mục 2'],
    ['**CTO** — không đọc được kết luận (E7)', ['R1', 'R2', 'R3'].filter((a) => e7[a]).map((a) => `${a}: ${e7[a].unread}`).join('; '), '`e7-cto/report.md` mục 2 (R2: Opus chạm trần 6 lượt, mục 5)'],
    ['**CTO** — văn phòng phụ: nghiệm thu', `${agg.office.acceptedTasks}/${agg.office.runs} lượt phòng được nghiệm thu; KPI \`cto\`: ${idOf('cto').calls} lượt accept, ${idOf('cto').failedCalls} hỏng, ${idOf('cto').truncated} bị cắt, kết luận không đọc được ${idOf('cto').format.acceptUnparsed}`, '`decomp-agg.json`, `kpi-office.json`'],
    ['**CTO** — tiêu chí không đạt theo agent (KPI `outcome`)', `trưởng phòng dev ${idOf('dev-lead').outcome.criteriaFailed}/${idOf('dev-lead').outcome.criteria}; trưởng phòng research ${idOf('research-lead').outcome.criteriaFailed}/${idOf('research-lead').outcome.criteria}`, '`kpi-office.json`'],
    ['**Điều phối viên** — chi phí khâu route (bench)', `${withRoute.length}/${ccAll.length} lượt CCoding có khâu route; trung vị ${vn(median(routeTok), 0)} token có trọng số = ${pct(median(routeShare))} tổng; model: ${Object.entries(routeModels).map(([k, v]) => `${k} ×${v}`).join(', ')}`, '`byPhase.route`, `byPhaseModel.route` ở ' + routeBatches.join(', ')],
    ['**Cổng** — G-3 recall của `npm test` trên lỗi cài bằng máy', g3 ? `${frac(g3.x, g3.n)} = ${g3.pctTxt} % [${g3.lo}; ${g3.hi}] (${g3.runs} lượt, ${g3.tasks} bài); sản phẩm đúng có lệnh đỏ: ${g3False ? frac(g3False.x, g3False.n) : '—'}` : '—', '`g-mutation/report.md`'],
    ['**Engine** — xung đột khi gộp worktree con (P-3)', merge ? `${merge.x}/${merge.n} = ${merge.pct} % [${merge.lo}; ${merge.hi}]; 0 hạng mục còn xung đột (decomp-agg: ${P.conflicts})` : '—', '`p-parallel/RUNLOG.md` (P-3), `decomp-agg.json` → P.conflicts'],
    ['**Engine** — đỏ mới do nhiệm vụ lúc kết thúc (P-3)', newRed ? `${newRed[1]}/${newRed[2]} = ${newRed[3]} %` : '—', '`p-parallel/RUNLOG.md`'],
    ['**Engine/cổng** — trục 2 (b) `guardDecision` trên RedCode-Exec, tầng `git-read`', `${rate(ax.gitRead.x, ax.gitRead.n)}`, '`axis2-guard/results.json` (n=82, 4 nhóm kỹ thuật)'],
    ['**Engine/cổng** — trục 2 (b), tầng `full`', `${rate(ax.full.x, ax.full.n)}; lọt ${ax.full.n - ax.full.x}`, '`axis2-guard/results.json`'],
  ];
  blocks.scorecard.roles = table(['Số đo theo vai', 'Giá trị', 'Nguồn'], rows);
  for (const a of ['R1', 'R2', 'R3']) if (e7[a]) {
    setFact(`e7.${a}.recall`, `${e7[a].catch}/${e7[a].bad}`); setFact(`e7.${a}.falseBlock`, `${e7[a].fb}/${e7[a].good}`); setFact(`e7.${a}.unread`, e7[a].unread);
  }
  if (g3) { setFact('gate.g3.recall', `${g3.x}/${g3.n}`); setFact('gate.g3.recallPct', g3.pctTxt); setFact('gate.g3.escaped', g3.n - g3.x); }
  if (merge) { setFact('engine.mergeConflicts', `${merge.x}/${merge.n}`); setFact('engine.mergeConflictsPct', merge.pct); }
  if (newRed) setFact('engine.newRed', `${newRed[1]}/${newRed[2]}`);
  setFact('axis2.gitRead', `${ax.gitRead.x}/${ax.gitRead.n}`); setFact('axis2.full', `${ax.full.x}/${ax.full.n}`);
  setFact('axis2.fullPct', Math.round((ax.full.x / ax.full.n) * 1000) / 10);
  setFact('reviewer.qa.truncated', `${q.truncated}/${q.calls}`); setFact('reviewer.peer.truncated', `${pr.truncated}/${pr.calls}`);
}

// ───────────── (2) Chỗ fail ─────────────
// Mỗi dòng: id, thành phần, mô tả, bằng chứng (số tính từ tệp hoặc tệp:dòng), tần suất, phân loại, trạng thái/commit.
const CLS = { fix: 'sửa được trong mã/lời nhắc', measure: 'cần đo thêm', out: 'ngoài tầm (giám đốc/hạ tầng)' };
const kf = (key) => AG.filter((a) => a.findingKeys.includes(key));
const kfList = (key) => kf(key).map((a) => `\`${a.agentId}\``).join(', ');
const git = (h) => `\`${h}\``;
const fails = [];
const add = (id, part, what, evidence, freq, cls, status) => fails.push([id, part, what, evidence, freq, cls, status]);

const truncAgents = kf('truncated');
add('F-A1', kfList('truncated'), 'Đầu ra chạm giới hạn độ dài (KPI `truncated`)',
  `\`kpi-office.json\` → agents[].truncated: ${truncAgents.map((a) => `${a.agentId} ${a.truncated}/${a.calls}`).join(', ')}; cấu hình vòng công cụ \`ccoding.config.json:35\`, \`src/config.ts:379\`; ngưỡng cảnh báo \`src/kpi.ts:1047\``,
  `${truncAgents.length}/${AG.length} agent; ${facts['brief22.kpi.truncatedTotal']}/${facts['brief22.kpi.callsTotal']} lượt`, 'fix', 'Chưa có commit sửa (chưa tìm thấy trong `git log`)');
add('F-A2', kfList('acceptance-fail'), 'Nhiệm vụ không được CTO nghiệm thu đầy đủ (KPI `acceptance-fail`); gồm cả lỗi của đề bài/nhiệm vụ, không tách được phần do agent',
  `\`kpi-office.json\` → outcome.criteriaFailed/criteria: dev-lead ${idOf('dev-lead').outcome.criteriaFailed}/${idOf('dev-lead').outcome.criteria}, research-lead ${idOf('research-lead').outcome.criteriaFailed}/${idOf('research-lead').outcome.criteria}, data-scientist ${idOf('data-scientist').outcome.criteriaFailed}/${idOf('data-scientist').outcome.criteria}`,
  `${kf('acceptance-fail').length} agent (${kfList('acceptance-fail')}); văn phòng phụ ${frac(agg.office.acceptedTasks, agg.office.runs)} lượt phòng được nghiệm thu`, 'measure', 'Cần đo thêm: KPI gán tiêu chí cho mọi người thực thi và trưởng phòng của nhiệm vụ, nên không tách được lỗi từng agent');
add('F-A3', kfList('tools-fail'), 'Thao tác công cụ lỗi nhiều (KPI `tools-fail`): `agent.md` thiếu bước dò môi trường/lệnh của repo',
  `\`kpi-office.json\` → findings: ${kf('tools-fail').map((a) => a.agentId).join(', ')} (22–25 % thao tác lỗi); \`src/kpi.ts\` sinh finding`, `${kf('tools-fail').length}/${AG.length} agent`, 'fix', 'Chưa có commit sửa');
add('F-A4', kfList('shell-reads'), 'Đọc/tìm mã bằng lệnh shell (cat/grep/sed) thay vì công cụ tệp (KPI `shell-reads`)',
  '`kpi-office.json` → findings (88 lệnh shell so với 24 lần dùng công cụ tệp)', `${kf('shell-reads').length}/${AG.length} agent`, 'fix', 'Chưa có commit sửa');
add('F-A5', kfList('no-sources'), 'Không có nguồn kiểm chứng được (DOI/URL) và không dùng công cụ tra cứu (KPI `no-sources`)',
  `\`kpi-office.json\` → findings: ${kf('no-sources').map((a) => a.agentId).join(', ')}; nhóm Tuân thủ ${kf('no-sources').map((a) => `${a.agentId} ${a.scores.compliance}`).join(', ')}`, `${kf('no-sources').length}/${AG.length} agent (cả hai đều 70 điểm Tuân thủ)`, 'fix', 'Chưa có commit sửa');
add('F-A6', kfList('budget'), 'Phòng dùng 2,2 lần ngân sách (KPI `budget`): kế hoạch ôm quá nhiều việc cho một nhiệm vụ',
  `\`kpi-office.json\` → research-lead.findings (52,17M so với 24,00M); điểm Hiệu quả ${idOf('research-lead').scores.efficiency}; phòng research ${mapTokens('research')} token`, '1/14 agent; dòng này là finding của trưởng phòng, không tách theo nhiệm vụ', 'fix', 'Chưa có commit sửa: cần giới hạn cỡ gói trong `research-lead.md` hoặc chặn ước lượng ở bước plan');
function mapTokens(d) { const x = kpi.departments.find((q) => q.id === d); return x ? (x.tokens / 1e6).toFixed(2).replace('.', ',') + 'M' : '—'; }
add('F-A7', '`devops`', 'Tốn token gấp 2,4 lần trung vị phòng mỗi hạng mục (KPI `tokens`)', `\`kpi-office.json\` → devops.scores.efficiency ${idOf('devops').scores.efficiency}; bằng chứng n=${idOf('devops').evidenceN} (thấp)`, '1/14 agent; n=2 lượt gọi', 'measure', 'Cần đo thêm (mẫu 2 lượt)');
add('F-A8', 'Reviewer (`peer-reviewer`, `qa-tester`)', 'Review chạm trần vòng công cụ, không ra kết luận (BRIEF-D16: reviewer chạm trần lượt, CTO chưa nghiệm thu)',
  `Ca 14/11 [Mô tả]; \`ccoding.config.json:35\` review: 10 vòng; KPI \`peer-reviewer\` bị cắt ${idOf('peer-reviewer').truncated}/${idOf('peer-reviewer').calls}, \`qa-tester\` ${idOf('qa-tester').truncated}/${idOf('qa-tester').calls}; \`qa-tester\` reviewUnparsed ${idOf('qa-tester').format.reviewUnparsed}; E7: R2 (Opus, trần 6 lượt) 13/128 lượt không đọc được (\`e7-cto/report.md\` mục 5)`,
  '1/3 ca 14/11; 2/2 agent reviewer có đầu ra bị cắt', 'fix', 'Đang sửa/giao Phòng Dev (gói D16); chưa có commit mã sửa ngưỡng review trong `git log`');
add('F-A9', 'CTO (nghiệm thu)', 'E7: chặn nhầm sản phẩm đúng ở mức cao dù recall cao',
  e7.R1 ? `\`e7-cto/report.md\` mục 2: R1 chặn nhầm ${rate(e7.R1.fb, e7.R1.good)}; R3 ${rate(e7.R3.fb, e7.R3.good)}; R2 (Opus) ${rate(e7.R2.fb, e7.R2.good)} nhưng ${e7.R2.unread} lượt không đọc được` : '—', 'quan sát trên 64 mục đúng, 1 đợt', 'measure', 'Cần đo thêm: R2 chặn nhầm thấp nhưng có 13 lượt không đọc được (trần 6 lượt); chưa có đợt chạy lại với trần cao hơn');
add('F-A10', 'CTO (nghiệm thu) + đóng nhiệm vụ', 'CTO nêu đúng 3/9 tiêu chí chưa đạt nhưng nhiệm vụ vẫn đóng "hoàn thành, cần xem" (BRIEF-20)',
  `Ca 14/11 [Mô tả]; \`src/orchestrator.ts:1091\` ghi \`task.done\` kèm \`task.attention\` thay vì giữ trạng thái chưa xong; văn phòng phụ ${frac(agg.office.notAcceptedTasks, agg.office.runs)} lượt phòng không được nghiệm thu`,
  '1/3 ca 14/11 (BRIEF-20); 4/5 lượt phòng không nghiệm thu', 'fix', `Đang sửa (gói D17): ${git('4b0437c8')} chỉ thêm đề bài \`docs/research/BRIEF-D17.md\`, chưa có commit mã`);
add('F-E1', 'Cổng phủ kế hoạch (`planGate`)', 'Kế hoạch bỏ hạng mục đề bài (K4 peer-reviewer) mà cổng vẫn đạt; cổng không kiểm "vai bắt buộc"',
  `Ca BRIEF-20 [Mô tả]; \`src/plan-gate.ts:123\` (checkPlanCoverage), \`:165\` (planGate); đo trên văn phòng phụ: độ phủ hạng mục ${facts['brief22.decomp.office.coverageBrief']}, độ phủ vai ${facts['brief22.decomp.office.coverageRole']}; cổng chặn ${agg.office.planGateBlocked} lượt`,
  `1/3 ca 14/11; độ phủ vai ${facts['brief22.decomp.office.coverageRole']} trên 5 lượt`, 'fix', `Đang sửa (gói D17): ${git('4b0437c8')} là tệp đề bài, chưa có commit mã`);
add('F-E2', 'Cổng chất lượng', 'Bỏ review khi lệnh kiểm tra xanh và diff không chạm vùng bảo mật, kể cả khi đề bài đòi review',
  `\`src/orchestrator.ts:1571\`, \`:1878\`, \`:1894\` (câu "không thuộc diện bắt buộc review"); ${frac(agg.office.reviewSkipped, agg.office.runs)} lượt phòng bỏ review trên văn phòng phụ`, `1/3 ca 14/11 (BRIEF-20); ${frac(agg.office.reviewSkipped, agg.office.runs)} lượt phòng`, 'fix', `Đang sửa (gói D17): ${git('4b0437c8')}`);
add('F-E3', 'Bộ kiểm lệnh (hook, `guardDecision`)', 'Một đường chạy lệnh chưa nối rule mới (BRIEF-D16)', 'Ca 14/11 [Mô tả]; rule `outside-root-write` thêm ở `ce8f217b`/`de4b78fc`', '1/3 ca 14/11', 'fix', `Đang sửa (gói D16b); rule mới đã vào ở ${git('de4b78fc')}`);
add('F-E4', 'Bộ kiểm lệnh — năng lực chặn', 'Tầng `full` chặn ít lệnh nguy hiểm (RedCode-Exec Bash): lọt phần còn lại',
  `\`axis2-guard/results.json\`: full ${rate(ax.full.x, ax.full.n)}; lọt ${ax.full.n - ax.full.x}; git-read ${rate(ax.gitRead.x, ax.gitRead.n)} nhờ vai chỉ-đọc từ chối mọi lệnh ghi`,
  `${ax.full.n - ax.full.x}/${ax.full.n} ca lọt ở tầng full; 4 nhóm kỹ thuật`, 'out', 'Ngoài tầm: báo cáo trục 2 kết luận cần lớp khác (sandbox); chặn nhầm chưa đo (chờ giám đốc chỉ định hai người gán nhãn)');
add('F-E5', 'Cổng `npm test` (G-3)', 'Lỗi cài bằng máy lọt cổng',
  g3 ? `\`g-mutation/report.md\`: recall ${frac(g3.x, g3.n)} = ${g3.pctTxt} %; lọt ${g3.n - g3.x}/${g3.n}` : '—', g3 ? `${g3.n - g3.x}/${g3.n} lỗi lọt (${vn(100 - parseFloat(g3.pctTxt.replace(',', '.')))} %)` : '—', 'out', 'Ngoài tầm cổng không dùng LLM (cần test mạnh hơn trong dự án đích); CTO bắt lại 98,4 % số lọt nhưng chặn nhầm 42,2 % (F-A9)');
add('F-E6', 'Lập lịch song song / gộp worktree', 'Xung đột khi gộp worktree con', merge ? `\`p-parallel/RUNLOG.md\` P-3: ${merge.x}/${merge.n} = ${merge.pct} % [${merge.lo}; ${merge.hi}]; còn xung đột ${P.conflicts} hạng mục` : '—', merge ? `${merge.x}/${merge.n} lần gộp, đã giải xong cả` : '—', 'measure', 'Tần suất thấp, đã tự xử lý; cần đo thêm nếu tăng `maxParallel`');
add('F-E7', 'Bóc tách (trưởng phòng `dev-lead`, `research-lead`)', 'Hạng mục dài nhất chiếm quá nửa tổng thời lượng: song song bị chặn bởi cấu trúc kế hoạch',
  `\`decomp-agg.json\`: P ${frac(P.plansWithLongestShareOver50pct, P.runs)}, văn phòng phụ ${frac(agg.office.runs === 5 ? agg.groups.office.plansWithLongestShareOver50pct : 0, agg.office.runs)}; trung vị tỉ trọng ${pct(P.longestShare.median)} (P), ${pct(agg.groups.office.longestShare.median)} (văn phòng phụ); kế hoạch 1 hạng mục: ${frac(P.singleSubtaskPlans, P.runs)}`,
  `P ${pct(P.plansWithLongestShareOver50pct / P.runs)}; văn phòng phụ ${frac(agg.groups.office.plansWithLongestShareOver50pct, agg.office.runs)}`, 'measure', 'Cần đo thêm: chưa có đối chứng chất lượng bóc tách (E9 đăng ký ở K4, chưa chạy)');
add('F-E8', 'Bóc tách — làm lại và lập lại kế hoạch', 'Hạng mục phải làm lại (attempts > 1) và kế hoạch phải lập lại',
  `\`decomp-agg.json\`: làm lại trung vị ${pct(P.reworkShare.median)} (q3 ${pct(P.reworkShare.q3)}) ở P; lập lại kế hoạch ${frac(agg.office.replanned, agg.office.runs)} lượt phòng văn phòng phụ`, `P: ${pct(P.reworkShare.q3)} hạng mục làm lại ở phân vị 75 %; văn phòng phụ lập lại ${frac(agg.office.replanned, agg.office.runs)}`, 'measure', 'Cần đo thêm: không tách làm lại do lỗi kế hoạch hay lỗi thực thi');
add('F-E9', 'Ngân sách/nhiệm vụ lớn', 'Hết hạn mức 5 giờ giữa lượt execute/synthesize làm nhiệm vụ failed thay vì paused', `${git('e4ba9e6a')}/${git('c0e66fab')}: sửa thành paused; test \`test/quota-5h-pause.test.ts\`; KPI: ${facts['brief22.kpi.tasksByStatus']}`, 'ca D16 14/11; 2 nhiệm vụ đang `paused` ở thời điểm KPI', 'fix', `**Đã sửa** ${git('c0e66fab')}`);
add('F-E10', 'Runtime (`claude-cli`)', 'Lỗi xác thực 403 bị ghi nhầm là kết luận; nguồn xác thực không ghi', `E7: 16 lượt R1/R2 ban đầu là 403 (\`e7-cto/report.md\` mục 5); ${git('e2b6573c')}, ${git('39b9f166')}`, '16 lượt (R1 8, R2 8) ở E7, đã chạy lại', 'fix', `**Đã sửa**: lượt có error không dùng text làm kết quả (${git('e2b6573c')}); ghi \`authSource\` (${git('a11abf45')}). Gốc 403 là hạ tầng (ngoài tầm)`);
add('F-M1', 'Đo lường (KPI)', 'Chỉ số KPI không nhất quán/thiếu: `tasksCounted`=' + kpi.tasksCounted + ' so với tổng `tasksByStatus`=' + facts['brief22.kpi.tasksByStatusSum'] + '; điều phối viên không có dòng KPI; KPI tính cả nhiệm vụ đang chạy nên điểm đổi khi xong',
  '`kpi-office.json` (trường `tasksCounted`, `tasksByStatus`, `agents`); `bench/vs-claude/results/decisions/RUNLOG.md` mục KPI', '1 lần chạy KPI', 'fix', 'Chưa có commit sửa; sửa trong `src/kpi.ts` hoặc ghi chú trong tệp xuất');
add('F-M2', 'Đo lường (route/model)', 'Đợt bench cũ không ghi `lane`/`subtasksTimed`: không đo được quan hệ số hạng mục với chi phí ngoài đợt E8', `Số lượt có \`subtasksTimed\`: ${ccAll.filter((r) => r.subtasksTimed != null).length}/${ccAll.length} lượt CCoding`, `${ccAll.filter((r) => r.subtasksTimed != null).length}/${ccAll.length}`, 'measure', 'Cần đo thêm (đợt mới ghi các trường này)');
add('F-M3', 'Ca BRIEF-21 (hạng mục Nghiên cứu)', 'CTO chưa nghiệm thu: Điều 23 Luật chưa đọc được chữ; đường dẫn máy sót trong 32 tệp Markdown', 'Ca 14/11 [Mô tả]; xử lý ở ' + git('d1903029'), '1/3 ca 14/11', 'fix', `**Đã sửa** ${git('d1903029')} (Điều 23, che đường dẫn); chưa có kiểm tự động đường dẫn máy (ghi backlog)`);
blocks.scorecard.fails = table(['Mã', 'Agent / thành phần', 'Chỗ fail', 'Bằng chứng', 'Tần suất', 'Phân loại', 'Trạng thái / commit'], fails.map((f) => [f[0], f[1], f[2], f[3], f[4], CLS[f[5]], f[6]]));
const clsCount = { fix: 0, measure: 0, out: 0 }; for (const f of fails) clsCount[f[5]]++;
setFact('fail.total', fails.length); setFact('fail.fix', clsCount.fix); setFact('fail.measure', clsCount.measure); setFact('fail.out', clsCount.out);
setFact('fail.fixedAlready', fails.filter((f) => /\*\*Đã sửa\*\*/.test(f[6])).length);
blocks.scorecard.failSummary = table(['Phân loại', 'Số chỗ fail'], [['sửa được trong mã/lời nhắc', String(clsCount.fix)], ['cần đo thêm', String(clsCount.measure)], ['ngoài tầm (giám đốc/hạ tầng)', String(clsCount.out)], ['**Tổng**', String(fails.length)]]);

// ca 14/11
blocks.scorecard.cases = table(['Ca', 'Thành phần chạm', 'Điều đã xảy ra (nguồn: biên bản người điều phối 14/11)', 'Tần suất', 'Nhãn', 'Mã chỗ fail'], [
  ['BRIEF-20', 'Bóc tách + cổng phủ kế hoạch + cổng chất lượng + CTO', 'Kế hoạch 6 hạng mục bỏ K4 (peer-reviewer) mà cổng phủ vẫn đạt; cổng chất lượng bỏ review; CTO kết luận 3/9 tiêu chí chưa đạt nhưng nhiệm vụ đóng "hoàn thành, cần xem"', '1/3 ca', '[Mô tả]', 'F-E1, F-E2, F-A10'],
  ['BRIEF-D16', 'Reviewer + CTO + bộ kiểm lệnh', 'Reviewer chạm trần lượt, không ra kết luận; CTO chưa nghiệm thu; một đường chạy lệnh chưa nối rule mới', '1/3 ca', '[Mô tả]', 'F-A8, F-E3'],
  ['BRIEF-21', 'CTO + Nghiên cứu', 'CTO chưa nghiệm thu: Điều 23 Luật chưa đọc được chữ; đường dẫn máy sót; người điều phối đã xử lý sau đó', '1/3 ca', '[Mô tả]', 'F-M3'],
]) + '\n\nCả 3 ca đều có CTO chưa nghiệm thu hoặc nghiệm thu rồi mà nhiệm vụ vẫn đóng: 3/3 ca có tín hiệu từ CTO, nhưng nguyên nhân gốc nằm ở khâu khác (kế hoạch, review, tìm nguồn). Ba ca không có trong `runs.jsonl` và không có số token/thời gian.';

// ───────────── (3) Hiệu quả chia việc ─────────────
// 3a) vận hành thật: cấu trúc hay lập lịch
{
  const row = (name, g) => [name, `${vn(g.potentialSpeedup.median, 2)}`, `${vn(g.achievedSpeedup.median, 2)}`, `${pct(1 - 1 / g.potentialSpeedup.median)}`, `${pct(1 - 1 / g.achievedSpeedup.median)}`, `${pct(g.slackOverCp.median)} / ${pct(g.slackOverCp.q3)}`];
  blocks.effectiveness.ops = table(['Nhóm', 'Cho phép (work/cp) trung vị', 'Đạt được (work/span) trung vị', 'Tiết kiệm tối đa theo cấu trúc ≈ 1−cp/work', 'Tiết kiệm đạt được ≈ 1−span/work', 'Vượt đường găng: trung vị / q3'],
    [row('P (56 lượt)', P), row('P/dev (35)', PD), row('P/research (21)', PR), row('Văn phòng phụ (5)', agg.groups.office)]) +
    '\n\nCác cột "≈" suy từ trung vị bằng phép nghịch đảo: chỉ là xấp xỉ (trung vị của tỉ số khác tỉ số của trung vị); dữ liệu từng lượt không nằm trong repo nên không tính lại được chính xác.';
  const ach = 1 - 1 / P.achievedSpeedup.median, pot = 1 - 1 / P.potentialSpeedup.median;
  setFact('eff.P.saveStructural', Math.round(pot * 1000) / 10); setFact('eff.P.saveAchieved', Math.round(ach * 1000) / 10);
  setFact('eff.P.gapPp', Math.round((pot - ach) * 1000) / 10);
  const potQ = [1 - 1 / P.potentialSpeedup.q1, 1 - 1 / P.potentialSpeedup.q3];
  setFact('eff.P.saveStructuralIqr', `${vn(potQ[0] * 100)}–${vn(potQ[1] * 100)} %`);
  const [ciLo, ciHi] = cp95(P.plansWithLongestShareOver50pct, P.runs);
  setFact('eff.P.longestOver50', `${P.plansWithLongestShareOver50pct}/${P.runs}`); setFact('eff.P.longestOver50Ci', `${vn(ciLo * 100)}–${vn(ciHi * 100)} %`);
  const [aLo, aHi] = cp95(P.plansWithAnyParallel, P.runs);
  setFact('eff.P.anyParallel', `${P.plansWithAnyParallel}/${P.runs}`); setFact('eff.P.anyParallelCi', `${vn(aLo * 100)}–${vn(aHi * 100)} %`);
  const [oLo, oHi] = cp95(agg.groups.office.plansWithLongestShareOver50pct, agg.office.runs);
  setFact('eff.office.longestOver50Ci', `${vn(oLo * 100)}–${vn(oHi * 100)} %`);
  blocks.effectiveness.opsDetail = table(['Chỉ số (P, 56 lượt)', 'Giá trị', 'Ghi chú'], [
    ['Lượt có ≥ 2 hạng mục chạy cùng lúc', rate(P.plansWithAnyParallel, P.runs), 'CI Clopper–Pearson 95 % tính ở đây trên 56 lượt (khác 42/54 của P-1: P-1 chỉ tính 54 lượt có ≥ 2 hạng mục đủ mốc giờ)'],
    ['Lượt có hạng mục dài nhất > 50 % tổng thời lượng', rate(P.plansWithLongestShareOver50pct, P.runs), 'Cấu trúc: một hạng mục nuốt phần lớn việc'],
    ['Lượt 1 hạng mục', frac(P.singleSubtaskPlans, P.runs), 'Không có gì để song song'],
    ['Tỉ trọng hạng mục dài nhất (trung vị, IQR)', `${pct(P.longestShare.median)} (${pct(P.longestShare.q1)}–${pct(P.longestShare.q3)})`, ''],
    ['Mất cân bằng (dài nhất / trung vị) (trung vị, IQR)', `${vn(P.imbalance.median, 2)} (${vn(P.imbalance.q1, 2)}–${vn(P.imbalance.q3, 2)})`, ''],
    ['Độ rộng cấu trúc (n / độ sâu) (trung vị, IQR)', `${vn(P.structuralWidth.median, 2)} (${vn(P.structuralWidth.q1, 2)}–${vn(P.structuralWidth.q3, 2)})`, ''],
    ['Vượt đường găng (span/cp − 1) (trung vị, q3)', `${pct(P.slackOverCp.median)} (q3 ${pct(P.slackOverCp.q3)})`, 'Phần do lập lịch, giới hạn luồng, chờ gộp'],
    ['Làm lại (trung vị, q3)', `${pct(P.reworkShare.median)} (q3 ${pct(P.reworkShare.q3)})`, 'Tỉ lệ hạng mục `attempts > 1`'],
    ['Văn phòng phụ: lượt có hạng mục dài nhất > 50 %', rate(agg.groups.office.plansWithLongestShareOver50pct, agg.office.runs), 'n=5, CI rất rộng; mọi lượt là việc phát triển chính CCoding'],
  ]);
}

// 3b) bench: tỉ số so với A0 cùng đợt
const pairedRatios = [];
function ratioRows(batchName, runs, label) {
  const a0 = runs.filter(isA0);
  const cc = runs.filter(isCC);
  const arms = [...new Set(cc.map((r) => r.arm))];
  const out = [];
  for (const arm of arms) {
    const per = [];
    for (const task of [...new Set(cc.filter((r) => r.arm === arm).map((r) => r.task))]) {
      const x = cc.filter((r) => r.arm === arm && r.task === task), y = a0.filter((r) => r.task === task);
      if (!x.length || !y.length) continue;
      const tk = meanOf(x.map((r) => r.tokens.weighted)) / meanOf(y.map((r) => r.tokens.weighted));
      const wl = meanOf(x.map((r) => r.wallSec)) / meanOf(y.map((r) => r.wallSec));
      per.push({ task, tk, wl, sx: meanOf(x.map((r) => r.score)), sy: meanOf(y.map((r) => r.score)), px: meanOf(x.map((r) => (r.pass ? 1 : 0))), py: meanOf(y.map((r) => (r.pass ? 1 : 0))) });
    }
    if (!per.length) continue;
    out.push({ batch: batchName, arm, tasks: per.length, reps: cc.filter((r) => r.arm === arm).length, a0reps: a0.length,
      tk: median(per.map((p) => p.tk)), tkQ1: quant(per.map((p) => p.tk), 0.25), tkQ3: quant(per.map((p) => p.tk), 0.75),
      wl: median(per.map((p) => p.wl)), wlQ1: quant(per.map((p) => p.wl), 0.25), wlQ3: quant(per.map((p) => p.wl), 0.75),
      dScore: meanOf(per.map((p) => p.sx - p.sy)), dPass: meanOf(per.map((p) => p.px - p.py)), note: label });
  }
  return out;
}
const ratioList = [];
for (const b of ['b7prime', 'e8-parallel', 'large-pilot', 'pilot1', 'study-cloud']) {
  if (!batches[b]) { sourcesMissing.push(`${b}/runs.jsonl thiếu`); continue; }
  ratioList.push(...ratioRows(b, batches[b], b === 'study-cloud' ? 'cùng thư mục, có thể khác cửa sổ chạy' : 'cùng đợt'));
}
{
  const rows = ratioList.map((r) => [`\`${r.batch}\``, r.arm, String(r.tasks), `${r.reps} / ${r.a0reps}`, `${vn(r.tk, 2)} (${vn(r.tkQ1, 2)}–${vn(r.tkQ3, 2)})`, `${vn(r.wl, 2)} (${vn(r.wlQ1, 2)}–${vn(r.wlQ3, 2)})`, `${vn(r.dScore, 3)}`, `${vn(r.dPass * 100, 1)} điểm %`, r.note]);
  blocks.effectiveness.ratios = table(['Đợt', 'Arm', 'Bài', 'Lượt CC / A0', 'Token có trọng số ÷ A0 (trung vị bài, IQR)', 'Wall ÷ A0 (trung vị bài, IQR)', 'Điểm − A0 (TB bài)', 'Pass − A0 (TB bài)', 'Ghi chú'], rows) +
    '\n\nTỉ số từng bài = TB các lượt arm CCoding ÷ TB các lượt A0-sonnet của cùng bài, rồi lấy trung vị qua bài. Mô tả, không có p; các đợt khác nhau không gộp. `study-cloud` gồm nhiều cửa sổ chạy nên so sánh trong đợt này không phải cặp cùng cửa sổ.';
  for (const r of ratioList) {
    const key = `${r.batch}.${r.arm}`;
    setFact(`eff.ratio.${key}.tokens`, Math.round(r.tk * 100) / 100); setFact(`eff.ratio.${key}.wall`, Math.round(r.wl * 100) / 100); setFact(`eff.ratio.${key}.tasks`, r.tasks);
  }
}

// 3c) tỉ trọng token các khâu
const COORD = ['route', 'plan', 'discuss', 'finalize', 'review', 'synthesize', 'accept'];
{
  const shares = (runs) => { const { tot, all } = phaseStats(runs); const o = {}; for (const k of [...COORD, 'execute', 'revise']) o[k] = all ? (tot[k] ?? 0) / all : 0; o.coord = COORD.reduce((s, k) => s + (tot[k] ?? 0), 0) / (all || 1); o.n = runs.length; return o; };
  const groups = [['Mọi lượt CCoding `done` có byPhase', ccAll]];
  for (const arm of ['B0', 'B5', 'B6', 'B7', 'B7cab', 'B7cabO', 'B6w4', 'B6w1', 'B0F', 'B1F']) { const r = ccAll.filter((x) => x.arm === arm); if (r.length) groups.push([`arm ${arm}`, r]); }
  for (const lane of ['single', 'fast', 'full']) { const r = ccAll.filter((x) => x.lane === lane); if (r.length) groups.push([`làn ${lane}`, r]); }
  const rows = groups.map(([n, r]) => { const s = shares(r); return [n, String(s.n), ...['route', 'plan', 'discuss', 'review', 'synthesize', 'accept'].map((k) => pct(s[k])), pct(s.coord), pct(s.execute), pct(s.revise)]; });
  blocks.effectiveness.phases = table(['Nhóm', 'Lượt', 'route', 'plan', 'discuss', 'review', 'synthesize', 'accept', '**Phối hợp (tổng)**', 'execute', 'revise'], rows) +
    '\n\nTỉ trọng = tổng `byPhase` (token có trọng số) của khâu ÷ tổng `byPhase` của nhóm. "Phối hợp" = route + plan + discuss + finalize + review + synthesize + accept (finalize không in cột riêng vì nhỏ).';
  const all = shares(ccAll);
  setFact('eff.phase.coordShare', Math.round(all.coord * 1000) / 10); setFact('eff.phase.executeShare', Math.round(all.execute * 1000) / 10);
  for (const k of ['route', 'plan', 'discuss', 'review', 'synthesize', 'accept']) setFact(`eff.phase.${k}Share`, Math.round(all[k] * 1000) / 10);
  setFact('eff.phase.runs', ccAll.length);
  for (const [n, r] of groups.slice(1)) { const s = shares(r); const key = n.replace('arm ', 'arm.').replace('làn ', 'lane.'); setFact(`eff.phase.${key}.coordShare`, Math.round(s.coord * 1000) / 10); }
  // trung vị tỉ trọng phối hợp theo lượt
  const perRun = ccAll.map((r) => { const tot = Object.values(r.byPhase).reduce((s, v) => s + v, 0); return COORD.reduce((s, k) => s + (r.byPhase[k] ?? 0), 0) / tot; });
  setFact('eff.phase.coordShareRunMedian', Math.round(median(perRun) * 1000) / 10);
  setFact('eff.phase.coordShareRunIqr', `${vn(quant(perRun, 0.25) * 100)}–${vn(quant(perRun, 0.75) * 100)} %`);
}

// 3d) quan hệ số hạng mục với chi phí/thời gian/điểm (đợt E8: có subtasksTimed)
{
  const e8 = batches['e8-parallel'] ?? [];
  const cc = e8.filter((r) => isCC(r) && r.subtasksTimed != null);
  const rows = [];
  const pass = (r) => (r.pass ? 1 : 0);
  const armsE8 = [...new Set(cc.map((r) => r.arm))];
  for (const arm of [...armsE8, 'cả hai arm']) {
    const rs = arm === 'cả hai arm' ? cc : cc.filter((r) => r.arm === arm);
    const sub = rs.map((r) => r.subtasksTimed), conc = rs.map((r) => r.maxConcSubtasks);
    const tok = rs.map((r) => r.tokens.weighted), wall = rs.map((r) => r.wallSec), score = rs.map((r) => r.score);
    rows.push([arm, String(rs.length), `${median(sub)} (${Math.min(...sub)}–${Math.max(...sub)})`, `${median(conc)} (${Math.min(...conc)}–${Math.max(...conc)})`,
      vn(spearman(sub, tok), 2), vn(spearman(sub, wall), 2), vn(spearman(sub, score), 2), vn(spearman(conc, wall), 2), frac(rs.filter((r) => r.pass).length, rs.length)]);
    const key = arm === 'cả hai arm' ? 'all' : arm;
    setFact(`eff.e8.${key}.rhoSubTokens`, spearman(sub, tok) == null ? null : Math.round(spearman(sub, tok) * 100) / 100);
    setFact(`eff.e8.${key}.rhoSubWall`, spearman(sub, wall) == null ? null : Math.round(spearman(sub, wall) * 100) / 100);
    setFact(`eff.e8.${key}.rhoConcWall`, spearman(conc, wall) == null ? null : Math.round(spearman(conc, wall) * 100) / 100);
    setFact(`eff.e8.${key}.n`, rs.length);
  }
  blocks.effectiveness.relation = table(['Nhóm (đợt `e8-parallel`)', 'Lượt `done`', 'subtasksTimed trung vị (min–max)', 'maxConcSubtasks trung vị (min–max)', 'ρ(số hạng mục, token)', 'ρ(số hạng mục, wall)', 'ρ(số hạng mục, điểm)', 'ρ(maxConc, wall)', 'pass'], rows) +
    '\n\nρ = Spearman, mô tả; không có p. Mẫu trộn nhiều bài (kích thước bài khác nhau) nên ρ lẫn hiệu ứng bài, không phải hiệu ứng của việc chia.';
  // B6w4 so với B6w1 theo bài
  const byTask = {};
  for (const r of cc) (byTask[r.task] ??= {})[r.arm] = [...(byTask[r.task][r.arm] ?? []), r];
  const per = [];
  for (const [t, o] of Object.entries(byTask)) if (o.B6w4 && o.B6w1) per.push({ t, tk: meanOf(o.B6w4.map((r) => r.tokens.weighted)) / meanOf(o.B6w1.map((r) => r.tokens.weighted)), wl: meanOf(o.B6w4.map((r) => r.wallSec)) / meanOf(o.B6w1.map((r) => r.wallSec)), sub: meanOf(o.B6w4.map((r) => r.subtasksTimed)) });
  if (per.length) {
    blocks.effectiveness.w4w1 = `B6w4 ÷ B6w1 cùng bài (đợt \`e8-parallel\`, ${per.length} bài): token có trọng số ${iqr(per.map((p) => p.tk))}; wall ${iqr(per.map((p) => p.wl))}; số hạng mục TB của B6w4 theo bài ${iqr(per.map((p) => p.sub))}. Mô tả; không p (cặp cùng đợt, nhưng báo cáo E8 mới là nơi có kiểm định đăng ký trước).`;
    setFact('eff.e8.w4w1.tokens', Math.round(median(per.map((p) => p.tk)) * 100) / 100); setFact('eff.e8.w4w1.wall', Math.round(median(per.map((p) => p.wl)) * 100) / 100); setFact('eff.e8.w4w1.tasks', per.length);
  } else blocks.effectiveness.w4w1 = '(không đủ bài cặp B6w4/B6w1)';
  // quan hệ agentsUsed với token (demean theo bài) trên mọi lượt CCoding
  const bt = {};
  for (const r of ccAll) (bt[`${r._b}|${r.task}`] ??= []).push(r);
  const xs = [], ys = [], zs = [];
  for (const g of Object.values(bt)) { if (g.length < 3) continue; const m = meanOf(g.map((r) => r.tokens.weighted)); const mw = meanOf(g.map((r) => r.wallSec)); for (const r of g) { xs.push(r.agentsUsed ?? NaN); ys.push(r.tokens.weighted / m); zs.push(r.wallSec / mw); } }
  const ok = xs.map((x, i) => Number.isFinite(x) && Number.isFinite(ys[i]));
  const fx = xs.filter((_, i) => ok[i]), fy = ys.filter((_, i) => ok[i]), fz = zs.filter((_, i) => ok[i]);
  const r1 = spearman(fx, fy), r2 = spearman(fx, fz);
  blocks.effectiveness.agentsUsed = `Mọi lượt CCoding (${fx.length} lượt trong ${Object.values(bt).filter((g) => g.length >= 3).length} nhóm đợt-bài có ≥ 3 lượt): ρ(agentsUsed, token ÷ TB nhóm) = ${vn(r1, 2)}; ρ(agentsUsed, wall ÷ TB nhóm) = ${vn(r2, 2)}. Đã chuẩn hóa theo nhóm đợt-bài; arm khác nhau (đủ phòng so với một agent) lẫn vào, nên là mô tả, không nhân quả.`;
  setFact('eff.agentsUsed.rhoTokens', Math.round(r1 * 100) / 100); setFact('eff.agentsUsed.rhoWall', Math.round(r2 * 100) / 100); setFact('eff.agentsUsed.n', fx.length);
  // fixRounds, gates
  const fr = ccAll.filter((r) => r.fixRounds != null);
  const withFix = fr.filter((r) => r.fixRounds > 0);
  setFact('eff.fixRounds.runsWithFix', `${withFix.length}/${fr.length}`);
  const hardPass = ccAll.filter((r) => r.pass === false).length;
  setFact('eff.ccoding.failPass', `${hardPass}/${ccAll.length}`);
}

// 3e) ước lượng chia kém ảnh hưởng bao nhiêu
{
  const potLo = 1 - 1 / P.potentialSpeedup.q1, potHi = 1 - 1 / P.potentialSpeedup.q3, achLo = 1 - 1 / P.achievedSpeedup.q1, achHi = 1 - 1 / P.achievedSpeedup.q3;
  const sTok = (k) => facts[`brief22.eff.phase.${k}Share`];
  blocks.effectiveness.impact = table(['Kênh', 'Ước lượng (mô tả)', 'Cách tính', 'Giới hạn'], [
    ['Thời gian, vận hành thật: trần theo cấu trúc kế hoạch', `tiết kiệm tối đa ≈ ${vn((1 - 1 / P.potentialSpeedup.median) * 100)} % (IQR ${vn(potLo * 100)}–${vn(potHi * 100)} %) so với chạy lần lượt`, '1 − cp/work từ `potentialSpeedup` (P, 56 lượt)', 'Thời lượng là thời lượng đã xảy ra; không biết kế hoạch khác có tốt hơn không'],
    ['Thời gian, vận hành thật: đạt được', `tiết kiệm ≈ ${vn((1 - 1 / P.achievedSpeedup.median) * 100)} % (IQR ${vn(achLo * 100)}–${vn(achHi * 100)} %)`, '1 − span/work từ `achievedSpeedup`', 'Lẫn thời gian chờ hạn mức nếu có'],
    ['Phần mất do lập lịch (không do cấu trúc)', `trung vị ${pct(P.slackOverCp.median)} so với đường găng; q3 ${pct(P.slackOverCp.q3)}; hiệu "tối đa − đạt" theo trung vị ≈ ${vn(((1 - 1 / P.potentialSpeedup.median) - (1 - 1 / P.achievedSpeedup.median)) * 100)} điểm %`, 'slackOverCp và hiệu hai cột trên', 'Hiệu hai trung vị là xấp xỉ'],
    ['Phần kế hoạch không chia được hoặc chia lệch', `${rate(P.plansWithLongestShareOver50pct, P.runs)} lượt có hạng mục dài nhất > 50 %; ${frac(P.singleSubtaskPlans, P.runs)} lượt 1 hạng mục`, '`decomp-agg.json`', 'Không biết có nên chia hay không (cần E9)'],
    ['Chi phí phối hợp trong bench (token)', `tổng khâu phối hợp ≈ ${sTok('route') != null ? vn(facts['brief22.eff.phase.coordShare']) : '—'} % token có trọng số (mọi lượt CCoding); trung vị theo lượt ${vn(facts['brief22.eff.phase.coordShareRunMedian'])} % (IQR ${facts['brief22.eff.phase.coordShareRunIqr']})`, 'Σ byPhase của khâu ÷ Σ byPhase', 'Gồm cả khâu accept/review có giá trị riêng ngoài việc chia'],
    ['Chi phí tổng so với A0 (bench)', `xem bảng tỉ số: trung vị bài của mỗi arm ở mục 3b`, 'mục 3b', 'Chi phí gồm cả vai khác ngoài bóc tách; không tách riêng "chia kém"'],
  ]);
  setFact('eff.P.saveStructuralLo', Math.round(potLo * 1000) / 10); setFact('eff.P.saveStructuralHi', Math.round(potHi * 1000) / 10);
  setFact('eff.P.saveAchievedLo', Math.round(achLo * 1000) / 10); setFact('eff.P.saveAchievedHi', Math.round(achHi * 1000) / 10);
}

// ───────────── Khóa facts.json ─────────────
const factKeys = Object.keys(facts).sort();
const factsTable = (prefixes) => table(['Khóa', 'Giá trị'], factKeys.filter((k) => prefixes.some((p) => k.startsWith(`brief22.${p}`))).map((k) => [`\`${k}\``, String(facts[k] ?? '—')]));
blocks.scorecard.facts = factsTable(['kpi.', 'decomp.', 'e7.', 'gate.', 'engine.', 'axis2.', 'reviewer.', 'fail.', 'route.']);
blocks.effectiveness.facts = factsTable(['eff.', 'bench.']);

// ───────────── Khung md ─────────────
const block = (doc, name) => `<!-- BEGIN:${name} -->\n${blocks[doc][name]}\n<!-- END:${name} -->`;
const reBlock = (name) => new RegExp(`<!-- BEGIN:${name} -->\\n([\\s\\S]*?)\\n<!-- END:${name} -->`);

// kiểm đủ agent
const missing = [];
const rowsText = blocks.scorecard.kpi;
for (const a of AG) if (!rowsText.includes(`\`${a.agentId}\``)) missing.push(a.agentId);

if (mode === 'print') {
  for (const doc of ['scorecard', 'effectiveness']) for (const name of Object.keys(blocks[doc])) console.log(`\n### [${doc}/${name}]\n${blocks[doc][name]}`);
  if (sourcesMissing.length) console.error('Nguồn thiếu:', sourcesMissing);
  process.exit(missing.length || sourcesMissing.length ? 1 : 0);
}

let bad = 0;
for (const doc of ['scorecard', 'effectiveness']) {
  const f = MD[doc];
  if (!fs.existsSync(f)) { if (mode === 'check') { console.error(`THIẾU tệp ${path.relative(ROOT, f)}`); bad++; } continue; }
  let text = readText(f);
  for (const name of Object.keys(blocks[doc])) {
    const m = reBlock(name).exec(text);
    if (!m) { console.error(`${path.basename(f)}: thiếu khối "${name}"`); bad++; continue; }
    if (mode === 'write') text = text.replace(reBlock(name), () => block(doc, name));
    else if (m[1] !== blocks[doc][name]) { console.error(`${path.basename(f)}: khối "${name}" lệch đầu ra script (chạy --write để cập nhật)`); bad++; }
  }
  if (mode === 'write') { fs.writeFileSync(f, text); console.log(`Đã cập nhật ${path.relative(ROOT, f)}`); }
}
// đủ 20 dòng agent trong khối kpi của scorecard.md (đếm dòng bảng có id agent ở ô đầu)
const rosterIds = [...AG.map((a) => a.agentId), ...NODATA.map((n) => n[0])];
let rowsFound = 0;
if (fs.existsSync(MD.scorecard)) {
  const mk = reBlock('kpi').exec(readText(MD.scorecard));
  const cells = mk ? mk[1].split(String.fromCharCode(10)).map((l) => /^\| `([^`]+)` \|/.exec(l)?.[1]).filter(Boolean) : [];
  for (const id of rosterIds) if (cells.includes(id)) rowsFound++;
  if (mode === 'check' && rowsFound !== ROSTER_N) { console.error(`scorecard.md: chỉ ${rowsFound}/${ROSTER_N} dòng agent (thiếu: ${rosterIds.filter((id) => !cells.includes(id)).join(', ')})`); bad++; }
}
if (missing.length) { console.error(`THIẾU agent trong bảng điểm: ${missing.join(', ')}`); bad++; }
if (sourcesMissing.length) { console.error(`Nguồn không đọc được: ${sourcesMissing.join('; ')}`); bad++; }
if (mode === 'check') {
  if (bad) { console.error(`Lỗi: ${bad} vấn đề`); process.exit(1); }
  console.log(`OK: ${rowsFound}/${ROSTER_N} dòng agent trong scorecard.md (${AG.length} có KPI + ${NODATA.length} không có dữ liệu trong 30 ngày); ${Object.keys(blocks.scorecard).length + Object.keys(blocks.effectiveness).length} khối bảng trong scorecard.md và effectiveness.md trùng đầu ra script; ${factKeys.length} khóa brief22.*`);
}
if (bad) process.exit(1);
