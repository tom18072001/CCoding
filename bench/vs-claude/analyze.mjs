#!/usr/bin/env node
// Analyse a results folder: node analyze.mjs results/<run> [--baseline A0-sonnet] [--treatment B0]
// Writes report.md, summary.csv and pareto.csv into the folder.
// Cờ: --allow-mixed-judge (chỉ đối chiếu dữ liệu cũ, SR-07) · --strict (từ chối khi một arm có >1 hash CCoding, SR-03) · --legacy-rng (LCG + xáo cũ để tái lập số cũ, SR-20).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32, fisherYates, streamFor, percentileCI, DEGENERATE_LABEL, tost, permTwoSample, bootP, h6Combine, permStratified, confirmable } from './lib/stats.mjs';
import { citationValidityOf } from './lib/grade.mjs';

const dir = path.resolve(process.argv[2] ?? '.');
const argv = process.argv.slice(3);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const allRows = fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const has = (k) => argv.includes(`--${k}`);
const STRICT = has('strict');
const infraRows = allRows.filter((r) => r.status === 'infra'); // hạn mức / lỗi hạ tầng, không phải kết quả của arm
const afterInfra = allRows.filter((r) => r.status !== 'infra');
if (infraRows.length) console.log(`Đã loại ${infraRows.length} dòng infra (hạn mức/lỗi hạ tầng) khỏi phân tích.`);
// SR-01c: lượt có `excluded` (quota | leak | timeout) bị loại; dòng cũ thiếu trường coi là null, không loại.
const excludedRows = afterInfra.filter((r) => r.excluded);
const rows = afterInfra.filter((r) => !r.excluded);
const excludedByArm = {};
for (const r of excludedRows) { const e = (excludedByArm[r.arm] ??= {}); e[r.excluded] = (e[r.excluded] ?? 0) + 1; }
const excludedTxt = Object.entries(excludedByArm).map(([a, e]) => `${a}: ${Object.entries(e).map(([k, n]) => `${k} ${n}`).join(', ')}`).join('; ') || 'không';
if (excludedRows.length) console.log(`SR-01: đã loại ${excludedRows.length} lượt excluded (${excludedTxt}).`);
const die = (msg) => { console.error(msg); process.exit(1); };
// C-1 (K2): dòng không có `arm` làm mọi so sánh theo arm sai im lặng ⇒ từ chối và nêu dòng lỗi.
{
  const noArm = allRows.filter((r) => !r.arm);
  if (noArm.length) die(`Từ chối (C-1): ${noArm.length} dòng trong runs.jsonl thiếu trường \`arm\` (${noArm.slice(0, 3).map((r) => r.key ?? `${r.task ?? '?'}#${r.rep ?? '?'}`).join(', ')}${noArm.length > 3 ? ', …' : ''}). Sửa dữ liệu rồi chạy lại.`);
}
// SR-03: một arm chạy bằng nhiều hash CCoding thì cảnh báo; --strict thì từ chối.
const commitsByArm = {};
for (const r of rows) if (r.ccodingCommit) (commitsByArm[r.arm] ??= new Set()).add(r.ccodingCommit);
const multiCommit = Object.entries(commitsByArm).filter(([, s]) => s.size > 1).map(([a, s]) => `${a}: ${[...s].join(', ')}`);
const commitWarn = multiCommit.length ? `CẢNH BÁO SR-03: arm có nhiều hơn một hash CCoding (${multiCommit.join('; ')}).` : '';
if (commitWarn) { console.warn(commitWarn); if (STRICT) die('Từ chối (--strict, SR-03): một arm có nhiều hơn một hash CCoding.'); }
// SR-07: một chế độ chấm cho mỗi bài. Lượt không ghi `details.judge` chỉ bị tính là "khác" khi bài có lượt đã ghi giám khảo.
const judgesByTask = {};
for (const r of rows) (judgesByTask[r.task] ??= new Set()).add(r.details?.judge ?? null);
const mixedJudge = Object.entries(judgesByTask).filter(([, s]) => s.size > 1 && [...s].some((j) => j !== null)).map(([t, s]) => `${t}: ${[...s].map((j) => j ?? '(không ghi)').join(' / ')}`);
const mixedWarn = mixedJudge.length ? `CẢNH BÁO SR-07: chế độ chấm khác nhau giữa các lượt cùng bài (${mixedJudge.join('; ')}); chạy với --allow-mixed-judge chỉ để đối chiếu dữ liệu cũ, không dùng cho phân tích chính.` : '';
if (mixedJudge.length && !has('allow-mixed-judge')) die(`Từ chối (SR-07): chế độ chấm khác nhau giữa các lượt cùng bài (${mixedJudge.join('; ')}). Chạy lại với một giám khảo (hoặc --allow-mixed-judge để đối chiếu dữ liệu cũ).`);
const judgeModels = [...new Set(rows.map((r) => r.details?.judge).filter(Boolean))];
const judgeTxt = judgeModels.length ? judgeModels.join(', ') : 'không ghi (regex hoặc dữ liệu cũ)';
const leaks = rows.filter((r) => r.leak);
const Rall = rows.filter((r) => !r.leak);
const tasksAll = [...new Set(Rall.map((r) => r.task))].sort();
// D6: bài `set: "exploratory"` không vào H1–H10, tập bài H6 và H1′/H2′; chỉ ở bảng khám phá.
const SUITE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tasks');
const setOf = (t) => { try { return JSON.parse(fs.readFileSync(path.join(SUITE, t, 'task.json'), 'utf8')).set; } catch { return undefined; } };
const exploratory = tasksAll.filter((t) => setOf(t) === 'exploratory');
const tasks = tasksAll.filter((t) => !exploratory.includes(t));
const R = Rall.filter((r) => !exploratory.includes(r.task));
const Rx = Rall.filter((r) => exploratory.includes(r.task));
const arms = [...new Set(Rall.map((r) => r.arm))];
const BASE = flag('baseline', arms.includes('A0-sonnet') ? 'A0-sonnet' : arms[0]);
const TREAT = flag('treatment', arms.includes('B0') ? 'B0' : arms[1] ?? arms[0]);

// ---------- small stats kit (no deps) ----------
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// SR-20: mulberry32 có hạt, ghi vào báo cáo. --legacy-rng giữ LCG cũ (và cách xáo cũ ở H10) để tái lập số đã công bố.
const LEGACY = has('legacy-rng');
const SEED = LEGACY ? 12345 : 20261102;
let lcg = SEED;
const rnd = LEGACY ? () => ((lcg = (lcg * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) : mulberry32(SEED);
// A-5 (K2): mỗi giả thuyết một luồng suy tất định từ hạt gốc, streamFor(mã) = mulberry32(hạt gốc ^ fnv1a32(mã)); kết quả không còn phụ thuộc thứ tự gọi. Quy tắc suy hạt này CHỜ Phòng Nghiên cứu đăng ký.
const rngFor = (hypId) => (LEGACY ? rnd : streamFor(hypId, SEED));
const rngTxt = LEGACY ? `LCG cũ (--legacy-rng), hạt ${SEED}, xáo H10 kiểu cũ` : `mulberry32, hạt ${SEED} (hạt gốc); compare và hoán vị của H1, H2, H4, H6, H10 dùng luồng riêng mulberry32(${SEED} ^ fnv1a32(mã giả thuyết)) (A-5, chờ đăng ký); H3, H7, H10-coding/adj dùng hạt cố định riêng (gốc + 31/32, 71, 91, 92); tost, bootP, permStratified dùng hạt mặc định ${SEED}; xáo H10 Fisher-Yates; luồng chung cũ chỉ ở mục độ nhạy`;
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const pp = (x) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} pp` : 'n/a');

const get = (r, metric) => {
  if (metric === 'score') return r.score;
  if (metric === 'pass') return r.pass ? 1 : 0;
  if (metric === 'weighted') return r.tokens?.weighted ?? 0;
  if (metric === 'wallSec') return r.wallSec ?? 0;
  if (metric.startsWith('detail:')) return metric.slice(7).split('.').reduce((o, k) => o?.[k], r.details);
  return undefined;
};
const cell = (arm, task, metric = 'score') => R.filter((r) => r.arm === arm && r.task === task).map((r) => get(r, metric)).filter((v) => v !== undefined && v !== null).map(Number);

/** Paired comparison over tasks: delta = mean(b) - mean(a) per task, then averaged. Two-level bootstrap CI + sign-flip permutation p. */
function compare(a, b, { metric = 'score', filter = () => true, rng = rnd } = {}) {
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const ts = tasks.filter((t) => filter(t) && cell(a, t, metric).length && cell(b, t, metric).length);
  if (!ts.length) return { n: 0 };
  const deltas = ts.map((t) => mean(cell(b, t, metric)) - mean(cell(a, t, metric)));
  const est = mean(deltas);
  const boots = [];
  for (let i = 0; i < 4000; i++) {
    const d = [];
    for (let j = 0; j < ts.length; j++) { const t = pick(ts); const xa = cell(a, t, metric), xb = cell(b, t, metric); d.push(mean(xb.map(() => pick(xb))) - mean(xa.map(() => pick(xa)))); }
    boots.push(mean(d));
  }
  const ci = percentileCI(boots) ?? [NaN, NaN]; // A-6: phân vị 2,5 % / 97,5 % nội suy, không còn floor(0,975·n)
  let extreme = 0; const P = 10000;
  for (let i = 0; i < P; i++) { const m = mean(deltas.map((d) => (rng() < 0.5 ? -d : d))); if (Math.abs(m) >= Math.abs(est) - 1e-12) extreme++; }
  return { n: ts.length, est, lo: ci[0], hi: ci[1], p: extreme / P, deltas: Object.fromEntries(ts.map((t, i) => [t, deltas[i]])) };
}
const catOf = Object.fromEntries(R.map((r) => [r.task, r.category]));
// SR-05: `size` lấy từ task.json (định nghĩa mới, có sizeBasis); --legacy-rng giữ `size` ghi trong dòng chạy để tái lập số cũ (D7).
const taskSize = (t) => { try { return JSON.parse(fs.readFileSync(path.join(SUITE, t, 'task.json'), 'utf8')).size; } catch { return undefined; } };
const sizeOf = Object.fromEntries(R.map((r) => [r.task, LEGACY ? r.size : (taskSize(r.task) ?? r.size)]));
// SR-11: một giả thuyết cần ≥ 3 bài mới được phán; ít hơn ⇒ insufficient data (không phán SUPPORTED/not supported).
const MIN_TASKS = 3;
const inCats = (...c) => (t) => c.includes(catOf[t]);

// ---------- hypotheses ----------
const H = [];
// A-4 (K2): 'not supported' tách hai nghĩa: bác bỏ (CI nằm hẳn ngoài vùng ủng hộ/biên) và không kết luận (gồm suy biến). Giữ tiền tố 'not supported' cho mã đọc cũ.
// `degenerate` (T-1/B-1, §2.5 (c)): phân phối suy biến, không bao giờ SUPPORTED, kể cả khi `ok` đúng.
const verdict = (ok, unknown, { refuted = false, degenerate = false } = {}) => {
  if (unknown) return 'insufficient data';
  if (degenerate && !refuted) return `not supported — ${DEGENERATE_LABEL}`;
  if (ok && !degenerate) return 'SUPPORTED';
  if (LEGACY) return 'not supported'; // --legacy-rng tái lập nhãn cũ
  return refuted ? 'not supported — bác bỏ (CI hẳn ngoài vùng ủng hộ/biên)' : 'not supported — không kết luận';
};
const fp = (x) => (x == null || !Number.isFinite(x) ? 'NA' : x < 1e-3 ? x.toExponential(2) : x.toFixed(4));
const cellsOf = (a, b, ts, metric = 'score') => ts.map((t) => ({ task: t, a: cell(a, t, metric), b: cell(b, t, metric) })).filter((c) => c.a.length && c.b.length);
const HOLM_ALPHA = 0.025;
const EPS = 1e-12;

// SR-26/SR-04/SR-12: phép kiểm của H2, H3, H6 và họ Holm {H3, H6}. Mọi hàm có hạt riêng, không đụng `rnd` chung.
const H7_MIN_RUNS = 5; // P:174
const sizeFilter = (t) => ['coding', 'design'].includes(catOf[t]) && sizeOf[t] >= 3; // lọc cũ của H1 (SR-05), chỉ cho độ nhạy và --legacy-rng
const H1_TASKS = ['c3', 'c4', 'c5', 'r1']; // P:181: tiền tố mã bài (c3-shop-bugs, …)
const inH1 = (t) => H1_TASKS.some((id) => t === id || t.startsWith(`${id}-`));
const H6_TASKS = ['l1-modules', 'l2-chain', 't1-duration', 't2-orders', 't3-api', 't4-perf', 't5-logq']; // §2.5 (a)
const H6_MARGIN = 0.05;
const h6 = (() => {
  const per = {};
  for (const arm of ['A1', 'A2']) {
    const cells = cellsOf(TREAT, arm, H6_TASKS.filter((t) => tasks.includes(t)));
    const res = bootP(cells, { taskSet: H6_TASKS, arm });
    const kept = cells.filter((c) => !res.ceilingTasks.includes(c.task));
    per[arm] = { res, kept, tost: tost(kept, { margin: H6_MARGIN }) };
  }
  const comb = h6Combine(per.A1.res, per.A2.res);
  const nOk = per.A1.kept.length >= 3 && per.A2.kept.length >= 3;
  const equiv = ['A1', 'A2'].every((a) => per[a].tost.equivalent); // SR-12: cả hai arm khai báo phải nằm trong biên, không `.some()`
  // C-2 (K2): nhãn H6 lấy từ h6Combine (label/supported) kết hợp tost.equivalent (CI hai tầng); suy biến ở bootP HOẶC tost ⇒ không kết luận (T-1).
  const degenerate = comb.degenerate || ['A1', 'A2'].some((a) => per[a].tost.degenerate);
  const refuted = comb.label === 'Bác bỏ' || ['A1', 'A2'].some((a) => per[a].tost.label === 'Bác bỏ');
  const supported = comb.supported && equiv && !degenerate;
  return { per, comb, nOk, equiv, degenerate, refuted, supported, pMin: comb.p == null ? null : 1 / (comb.B + 1) };
})();
const h3 = (() => {
  const s1 = tasks.filter((t) => t.startsWith('s1'));
  const pool = (arm, k) => s1.flatMap((t) => cell(arm, t, `detail:${k}`)).filter(Number.isFinite);
  const runsOf = (arm) => R.filter((r) => r.arm === arm && s1.includes(r.task)).length;
  const REF = arms.includes('B2') && TREAT !== 'B2' ? 'B2' : BASE; // SR-10
  const rec = permTwoSample(pool(REF, 'recall'), pool(TREAT, 'recall'), { shift: -0.15 });
  const prec = permTwoSample(pool(REF, 'precision'), pool(TREAT, 'precision'), { shift: 0.05 });
  const nTasks = tasks.filter(inCats('review')).length;
  // P-1 (K2): H3 đăng ký đúng 1 bài (s1, P:100, :170); cổng ≥ 3 bài chỉ đăng ký cho H6 và H7, nên không áp ở đây. Chỉ cần có dữ liệu hai phía.
  const have = rec.N > 0 && prec.N > 0;
  const haveData = have;
  const droppedPrec = runsOf(REF) + runsOf(TREAT) - pool(REF, 'precision').length - pool(TREAT, 'precision').length;
  return { rec, prec, have, haveData, nTasks, p: have ? Math.max(rec.p, prec.p) : null, pMin: have ? Math.max(rec.pMin, prec.pMin) : null, droppedPrec };
})();
const holm = (() => {
  const members = [];
  if (h3.have) members.push({ id: 'H3', p: h3.p, pMin: h3.pMin });
  if (h6.comb.verdict !== 'estimate') members.push({ id: 'H6', p: h6.comb.p, pMin: h6.pMin }); // < 3 bài ⇒ ước lượng, ra khỏi họ (§2.5 d)
  const K = members.length;
  const order = [...members].sort((x, y) => (x.p ?? 1) - (y.p ?? 1)); // NA xếp như 1, không bao giờ bị bác bỏ, không chặn bước trước
  let ok = true;
  order.forEach((m, i) => {
    const thr = HOLM_ALPHA / (K - i);
    ok = ok && m.p != null && m.p <= thr + EPS;
    m.rejected = ok;
    m.confirmable = confirmable(m.pMin, HOLM_ALPHA / K);
    m.confirmed = m.rejected && m.confirmable;
  });
  return { K, byId: Object.fromEntries(members.map((m) => [m.id, m])), members: order };
})();
const holmTxt = (m) => (m ? `p=${fp(m.p)}, p_min=${fp(m.pMin)}, confirmable=${m.confirmable ? 'có' : 'không'} (ngưỡng p_min ≤ ${fp(HOLM_ALPHA / holm.K)}), Holm ${m.rejected ? 'bác bỏ H0' : 'không bác bỏ'}` : 'ngoài họ Holm (ước lượng)');
{
  // A-2 (K2): danh sách bài H1 đăng ký cố định (P:181), không đổi theo `size` đọc sau dữ liệu; lọc `size ≥ 3` cũ chỉ ở mục độ nhạy.
  const c = compare(BASE, TREAT, { filter: LEGACY ? sizeFilter : inH1, rng: rngFor('H1') });
  H.push(['H1', LEGACY ? `Decomposable work (coding/design, size>=3): ${TREAT} - ${BASE}` : `Decomposable work (danh sách cố định ${H1_TASKS.join(', ')}): ${TREAT} - ${BASE}`, `${pp(c.est)} [${pp(c.lo)}, ${pp(c.hi)}], p=${f(c.p, 3)}, tasks=${c.n}`, verdict(c.est >= 0.1 && c.lo > 0, c.n < MIN_TASKS, { refuted: Number.isFinite(c.hi) && c.hi < 0.1 })]);
}
{
  const c = compare(BASE, TREAT, { filter: inCats('logic'), rng: rngFor('H2') });
  // SR-04: phán quyết bằng cận trên CI 90 % (bootstrap hai tầng, hạt riêng) ≤ +0,05, không bằng ước lượng điểm.
  const t = tost(cellsOf(BASE, TREAT, tasks.filter(inCats('logic'))), { margin: 0.05 });
  H.push(['H2', `Coupled reasoning (logic) is not better: ${TREAT} - ${BASE} (90% CI upper bound ≤ +5 pp)`, `${pp(c.est)} [${pp(c.lo)}, ${pp(c.hi)}], p=${f(c.p, 3)}, tasks=${c.n}; TOST90 [${pp(t.lo90)}, ${pp(t.hi90)}]${t.degenerate ? ` — ${DEGENERATE_LABEL}` : ''}`,
    // T-1: phân phối suy biến (kể cả NaN, Δ = 0 do trần) không bao giờ SUPPORTED. Bác bỏ = CI 90 % hẳn trên +0,05 (B0 hơn).
    verdict(Number.isFinite(t.hi90) && t.hi90 <= 0.05 + EPS, c.n < MIN_TASKS, { degenerate: t.degenerate, refuted: Number.isFinite(t.lo90) && t.lo90 > 0.05 + EPS })]);
}
{
  const s = tasks.filter(inCats('review'));
  // SR-10: có B2 (review tắt) thì H3 so TREAT với B2 để cô lập hiệu ứng review; không có B2 thì so với BASE và đổi tên giả thuyết.
  const REF = arms.includes('B2') && TREAT !== 'B2' ? 'B2' : BASE;
  const isolated = REF === 'B2';
  const fin = (arm, k) => s.flatMap((t) => cell(arm, t, `detail:${k}`)).filter(Number.isFinite); // bỏ NaN/null
  // CI 95 % bootstrap phần trăm của hiệu trung bình theo lượt; hạt riêng, không đụng `rnd` chung.
  const ciOf = (a, b, seed) => {
    if (!a.length || !b.length) return [NaN, NaN];
    const r = mulberry32(seed), bs = [];
    for (let i = 0; i < 4000; i++) bs.push(mean(b.map(() => b[Math.floor(r() * b.length)])) - mean(a.map(() => a[Math.floor(r() * a.length)])));
    return percentileCI(bs) ?? [NaN, NaN]; // A-6
  };
  const one = (a, b) => ['recall', 'precision'].map((k, i) => { const [lo, hi] = ciOf(fin(a, k), fin(b, k), SEED + 31 + i); return `${k} ${pp(mean(fin(b, k)) - mean(fin(a, k)))} [${pp(lo)}, ${pp(hi)}]`; }).join(', ');
  const lines = [[REF, TREAT], ...(isolated ? [[BASE, TREAT]] : [])].map(([a, b]) => `${b} vs ${a}: ${one(a, b)}`);
  // SR-26: hoán vị hai mẫu chính xác trên s1; recall dịch −0,15, precision dịch +0,05, p = max.
  const m3 = holm.byId.H3;
  const permTxt = h3.haveData ? `s1 (${TREAT} vs ${REF}): recall p=${fp(h3.rec.p)} (N=${h3.rec.N}), precision p=${fp(h3.prec.p)} (N=${h3.prec.N}, bỏ ${h3.droppedPrec} lượt precision NaN); ${holmTxt(m3)}; ${h3.nTasks} bài review (H3 đăng ký 1 bài s1, không áp cổng ≥ ${MIN_TASKS} bài, P-1)` : 's1 chưa đủ dữ liệu cho hoán vị';
  const label = isolated ? 'Review raises seeded-issue recall without hurting precision (B0 vs B2: review tắt)' : `Seeded-issue recall/precision of ${TREAT} vs ${BASE} (B2 vắng nên KHÔNG cô lập hiệu ứng review; SR-10)`;
  H.push(['H3', `${label} (exact two-sample permutation, s1, margins recall −0.15 / precision +0.05)`, `${lines.join('; ') || 'n/a'}; ${permTxt}`, h3.have ? (m3.confirmable ? verdict(m3.confirmed, false) : (m3.confirmed ? 'SUPPORTED' : 'not supported') + ' (p_min > ngưỡng: không xác nhận được)') : 'insufficient data']);
}
{
  const c = compare(BASE, TREAT, { filter: inCats('requirements'), rng: rngFor('H4') });
  H.push(['H4', 'Planted-ambiguity detection (requirements)', `${pp(c.est)} [${pp(c.lo)}, ${pp(c.hi)}], tasks=${c.n}`, verdict(c.est >= 0.2, c.n < MIN_TASKS, { refuted: Number.isFinite(c.hi) && c.hi < 0.2 })]);
}
{
  const ratio = (metric) => tasks.map((t) => median(cell(TREAT, t, metric)) / median(cell(BASE, t, metric)));
  // SR-06: ghép tr và wr theo bài, bỏ bài có tỉ số NaN/vô hạn ở bất kỳ chỉ số nào trước khi đếm.
  const rT = ratio('weighted'), rW = ratio('wallSec');
  const pairs = tasks.map((t, i) => [rT[i], rW[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const tr = pairs.map((x) => x[0]), wr = pairs.map((x) => x[1]);
  const share = tr.filter((x, i) => x >= 3 && wr[i] >= 1.5).length / Math.max(1, tr.length);
  H.push(['H5', `Cost ratio ${TREAT}/${BASE}`, `weighted tokens median x${f(median(tr), 1)}, wall time median x${f(median(wr), 1)}; tasks meeting both thresholds ${(share * 100).toFixed(0)}%`, verdict(share >= 0.8, !tr.length)]);
}
{
  const parts = ['A1', 'A2'].filter((a) => arms.includes(a)).map((a) => { const c = compare(a, TREAT, { rng: rngFor(`H6-${a}`) }); return { a, c }; });
  const txt = parts.map(({ a, c }) => `${TREAT} - ${a}: ${pp(c.est)} [${pp(c.lo)}, ${pp(c.hi)}]`).join('; ');
  // SR-04/SR-12/SR-26: phán quyết bằng TOST CI 90 % trên tập bài khai báo sau khi loại bài chạm trần; cả A1 và A2 phải nằm trong ±0,05.
  const tokRatio = (a) => mean(R.filter((r) => r.arm === a).map((r) => r.tokens?.weighted ?? 0)) / mean(R.filter((r) => r.arm === TREAT).map((r) => r.tokens?.weighted ?? 0));
  const armTxt = (a) => { const x = h6.per[a]; return `${a}: n=${x.kept.length}, bỏ trần [${x.res.ceilingTasks.join(', ') || 'không'}], TOST90 [${pp(x.tost.lo90)}, ${pp(x.tost.hi90)}]${x.tost.equivalent ? ' trong biên' : ' ngoài biên'}`; };
  const confirmTxt = `tập khai báo: ${armTxt('A1')}; ${armTxt('A2')}; token có trọng số A2/${TREAT} x${f(tokRatio('A2'))}, A1/${TREAT} x${f(tokRatio('A1'))} (mọi bài); bootstrap ${h6.comb.label} (${h6.per.A1.res.ciNote}): ${holmTxt(holm.byId.H6)}${h6.degenerate ? ` — ${DEGENERATE_LABEL}` : ''}`;
  const unknown = !parts.length || !h6.nOk || h6.comb.verdict === 'estimate';
  H.push(['H6', 'Compute-matched single agent matches CCoding (null); both A1 and A2 within ±5 pp (TOST 90% CI)', `${txt || 'needs arms A1/A2'} (mọi bài, mô tả); ${confirmTxt}`, verdict(h6.supported, unknown, { degenerate: h6.degenerate, refuted: h6.refuted })]);
}
{
  // A-1 (K2): cổng của H7 đăng ký (P:174): r ≥ 5 mỗi ô và ≥ 3 bài. SR-14 (sd gộp theo bài, trọng số n−1) giữ làm phép kiểm chính nhưng
  // sd gộp mẫu số = 0 (0/0 hoặc a/0) hay sd gộp treatment = 0 (trần che hết biến thiên) ⇒ suy biến, không SUPPORTED, không quy ước 0/0 := 1.
  // Phép cũ (>1 lượt, 0/0 := 1, trung vị tỉ số SD theo bài) chỉ ở mục độ nhạy (V4-K2-1).
  const ts = tasks.filter((t) => cell(BASE, t).length >= H7_MIN_RUNS && cell(TREAT, t).length >= H7_MIN_RUNS);
  const pooled = (set, arm) => { let ss = 0, df = 0; for (const t of set) { const x = cell(arm, t); ss += sd(x) ** 2 * (x.length - 1); df += x.length - 1; } return df ? Math.sqrt(ss / df) : NaN; };
  const ratioOf = (set) => { const a = pooled(set, BASE), b = pooled(set, TREAT); return a > 0 ? b / a : NaN; };
  const sdA = pooled(ts, BASE), sdB = pooled(ts, TREAT);
  const degenerate = ts.length >= MIN_TASKS && !(sdA > 0 && sdB > 0);
  const est = degenerate ? NaN : sdB / sdA;
  const rb = mulberry32(SEED + 71), boots = [];
  for (let i = 0; i < 4000 && ts.length; i++) { const v = ratioOf(ts.map(() => ts[Math.floor(rb() * ts.length)])); if (Number.isFinite(v)) boots.push(v); }
  const ci = percentileCI(boots) ?? [NaN, NaN], lo = ci[0], hi = ci[1]; // A-6
  const zero = ts.filter((t) => sd(cell(BASE, t)) === 0).length;
  const excl = tasks.length - ts.length;
  H.push(['H7', 'Run-to-run stability (pooled SD ratio treatment/baseline, per-task variance pooled; r ≥ 5 và ≥ 3 bài, P:174)', degenerate ? `pooled SD ${BASE} = ${f(sdA, 3)}, ${TREAT} = ${f(sdB, 3)} over ${ts.length} tasks — ${DEGENERATE_LABEL} (không báo tỉ số); ${excl} bài loại vì r < ${H7_MIN_RUNS}` : `pooled SD ratio ${f(est)} [${f(lo)}, ${f(hi)}] over ${ts.length} tasks (${zero} có sd(${BASE}) = 0); ${excl} bài loại vì r < ${H7_MIN_RUNS}`, verdict(est <= 0.7, ts.length < MIN_TASKS, { degenerate })]);
}
{
  // SR-13: chỉ số điều phối đúng nghĩa, cặp theo bài (D2): `untouchedFileFailures` (test trượt thuộc tệp agent không sửa) và `redAtEnd` (lệnh kiểm còn đỏ khi kết thúc).
  // `formatMiss` (thiếu sản phẩm) chỉ là chỉ số phụ. Dòng cũ không có hai trường chính ⇒ bài đó không vào cặp.
  const fmOf = (x) => (x.formatMiss ?? x.details?.formatMiss ? 1 : 0);
  const pairs = tasks.map((t) => {
    const u = [cell(BASE, t, 'detail:untouchedFileFailures'), cell(TREAT, t, 'detail:untouchedFileFailures')];
    const r = [cell(BASE, t, 'detail:redAtEnd'), cell(TREAT, t, 'detail:redAtEnd')];
    if (!u.every((x) => x.length) || !r.every((x) => x.length)) return null;
    return { t, du: mean(u[1]) - mean(u[0]), dr: mean(r[1]) - mean(r[0]) };
  }).filter(Boolean);
  const fm = (arm) => mean(R.filter((x) => x.arm === arm).map(fmOf));
  const dU = mean(pairs.map((x) => x.du)), dR = mean(pairs.map((x) => x.dr));
  const txt = pairs.length ? `cặp theo ${pairs.length} bài: untouchedFileFailures ${TREAT} − ${BASE} = ${dU >= 0 ? '+' : ''}${f(dU, 2)} test/lượt, redAtEnd ${pp(dR)}; ` : 'chưa có dữ liệu untouchedFileFailures/redAtEnd (dòng cũ, trước S5); ';
  H.push(['H8', 'Coordination failures: untouched-file test failures and check-still-red-at-end, paired by task', `${txt}chỉ số phụ formatMiss ${BASE} ${pp(fm(BASE))} vs ${TREAT} ${pp(fm(TREAT))}`, verdict(dR > 0 && dU >= 0, pairs.length < MIN_TASKS) + ' (confirm with transcript review)']);
}
{
  const s = tasks.filter(inCats('research'));
  // A-3 (K2): grader mới chỉ ghi `citationValidity`; đọc qua citationValidityOf (alias `citationPrecision` cho dữ liệu cũ). NaN ⇒ insufficient data, không rơi im lặng về not supported.
  const cv = (arm) => mean(R.filter((r) => r.arm === arm && s.includes(r.task)).map((r) => citationValidityOf(r.details)).filter((v) => v != null).map(Number).filter(Number.isFinite));
  const m = (arm, k) => mean(s.flatMap((t) => cell(arm, t, `detail:${k}`).map(Number)));
  const dP = cv(TREAT) - cv(BASE);
  const dR = m(TREAT, 'correctRefusal') - m(BASE, 'correctRefusal');
  H.push(['H9', 'Grounding: citation precision and correct refusal', `citation precision ${pp(dP)}, correct refusal ${pp(dR)}`, verdict(dP >= 0.1 && dR >= 0.1, s.length < MIN_TASKS || !Number.isFinite(dP) || !Number.isFinite(dR))]);
}
{
  const r10 = rngFor('H10');
  const c = compare(BASE, TREAT, { rng: r10 });
  const pts = Object.entries(c.deltas ?? {}).map(([t, d]) => [sizeOf[t], d]);
  const slope = (p) => { const mx = mean(p.map((x) => x[0])), my = mean(p.map((x) => x[1])); const num = p.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0), den = p.reduce((s, [x]) => s + (x - mx) ** 2, 0); return den ? num / den : NaN; };
  const b = slope(pts); let ext = 0; const P = 5000;
  for (let i = 0; i < P; i++) { const ys = LEGACY ? pts.map((x) => x[1]).sort(() => r10() - 0.5) : fisherYates(pts.map((x) => x[1]), r10); if (Math.abs(slope(pts.map((x, j) => [x[0], ys[j]]))) >= Math.abs(b)) ext++; }
  H.push(['H10', 'Advantage grows with task size (slope of delta vs parts)', `slope ${pp(b)} per extra part, permutation p=${f(ext / P, 3)}, tasks=${pts.length}`, verdict(b > 0 && ext / P < 0.05, pts.length < MIN_TASKS || pts.length < 4)]);
}

// SR-05 (i, ii): độ dốc H10 chỉ trong coding và độ dốc điều chỉnh loại bài (trừ trung bình theo loại ở cả size và delta), CI bootstrap theo bài.
{
  const c = compare(BASE, TREAT, { rng: rngFor('H10-adj') });
  const pts = Object.entries(c.deltas ?? {}).map(([t, d]) => ({ x: sizeOf[t], y: d, cat: catOf[t] }));
  const ols = (p) => { const mx = mean(p.map((q) => q.x)), my = mean(p.map((q) => q.y)); const den = p.reduce((a, q) => a + (q.x - mx) ** 2, 0); return den ? p.reduce((a, q) => a + (q.x - mx) * (q.y - my), 0) / den : NaN; };
  const within = (p) => { // độ dốc gộp trong loại: Σx̃ỹ / Σx̃²
    let num = 0, den = 0;
    for (const cat of new Set(p.map((q) => q.cat))) { const g = p.filter((q) => q.cat === cat), mx = mean(g.map((q) => q.x)), my = mean(g.map((q) => q.y)); for (const q of g) { num += (q.x - mx) * (q.y - my); den += (q.x - mx) ** 2; } }
    return den ? num / den : NaN;
  };
  const bootSlope = (p, fn, seed) => {
    const r = mulberry32(seed), bs = [];
    for (let i = 0; i < 4000 && p.length; i++) { const v = fn(p.map(() => p[Math.floor(r() * p.length)])); if (Number.isFinite(v)) bs.push(v); }
    return percentileCI(bs) ?? [NaN, NaN]; // A-6
  };
  for (const [id, label, p, fn, seed] of [
    ['H10-coding', 'Slope of delta vs size, coding tasks only', pts.filter((q) => q.cat === 'coding'), ols, SEED + 91],
    ['H10-adj', 'Slope of delta vs size adjusted for task category (within-category pooled)', pts, within, SEED + 92],
  ]) {
    const b = fn(p), [lo, hi] = bootSlope(p, fn, seed);
    H.push([id, `${label} (SR-05)`, `slope ${pp(b)} per extra part [${pp(lo)}, ${pp(hi)}] (95% bootstrap over tasks), tasks=${p.length}`, verdict(b > 0 && lo > 0, p.length < 4 || !Number.isFinite(b))]);
  }
}

// SR-26: họ Holm {H3, H6}; NA xếp như 1 (không bác bỏ, không chặn).
{
  const txt = holm.members.map((m) => `${m.id}: ${holmTxt(m)}${m.confirmed ? ' ⇒ xác nhận' : ''}`).join('; ') || 'họ rỗng';
  H.push(['Holm {H3, H6}', `K=${holm.K}, ngưỡng ${HOLM_ALPHA}/(K−i+1), H6 ra khỏi họ khi < 3 bài (§2.5)`, txt, holm.members.some((m) => m.confirmed) ? 'có giả thuyết xác nhận' : 'không có giả thuyết xác nhận']);
}
// SR-25: H1′/H2′ (§2.6, dự kiến, chưa khóa): hoán vị nhãn arm theo lượt, phân tầng theo bài. Bài exploratory đã bị loại khỏi `tasks`.
for (const [id, desc, names, opts] of [
  ['H1′', `Decomposable (l1-modules, t1–t5): ${TREAT} > ${BASE}, margin 0`, ['l1-modules', ...tasks.filter((t) => /^t[1-5]-/.test(t))], { alt: 'greater', margin: 0 }],
  ['H2′', `Dependency chain (l2-chain): ${TREAT} not better than ${BASE}, margin 0,05`, ['l2-chain'], { alt: 'less', margin: 0.05 }],
]) {
  const cells = cellsOf(BASE, TREAT, names.filter((t) => tasks.includes(t)));
  const r = permStratified(cells, opts);
  const txt = r.n ? `T=${pp(r.tObs)}, p=${fp(r.p)}, p_min=${fp(r.pMin)}, bài=${r.n}, ${r.exact ? 'liệt kê đủ' : 'Monte Carlo'} (${r.nPerm}), confirmable=${confirmable(r.pMin, HOLM_ALPHA / 2) ? 'có' : 'không'} (ngưỡng 0,0125)${r.skipped.length ? `, bỏ [${r.skipped.join(', ')}]` : ''}${r.ceilingTasks?.length ? `, bỏ trần [${r.ceilingTasks.join(', ')}]` : ''}${r.degenerate ? ` — ${r.label ?? DEGENERATE_LABEL}` : ''}` : 'chưa có bài nào đủ lượt cả hai arm';
  // S-1: quy tắc trần/suy biến cho margin ≠ 0 là bảo thủ (loại bài trần rồi kiểm suy biến), CHỜ Phòng Nghiên cứu đăng ký trước khi khóa H1′/H2′.
  H.push([id, desc, txt, 'dự kiến, chưa khóa (§2.6); quy tắc trần/suy biến bảo thủ chờ đăng ký (S-1)']);
}
// SR-04: B-01 (làn đơn so với BASE), mỗi đại lượng một TOST trên log-tỉ số, biên [0,85; 1,15], t1–t5.
{
  const B01 = flag('b01-arm', 'SL');
  const t15 = tasks.filter((t) => /^t[1-5]-/.test(t));
  for (const [id, label, metric] of [['B-01a', 'token có trọng số', 'weighted'], ['B-01b', 'thời gian thực', 'wallSec'], ['B-01c', 'điểm tương đối', 'score']]) {
    const cells = arms.includes(B01) ? cellsOf(BASE, B01, t15, metric) : [];
    // T-2: thống kê = TRUNG BÌNH THEO BÀI của ln(tỉ số) (P:80, prereg-tests.mjs). T-3/T-6: (c) bỏ bài trần ≥ 0,99 ở cả hai arm; mọi đại lượng cần ≥ 3 bài. T-1/T-5: suy biến/NaN ⇒ không kết luận.
    const t = tost(cells, { margin: Math.log(1.15), scale: 'logratio', minTasks: MIN_TASKS, ...(metric === 'score' ? { ceil: 0.99 } : {}) });
    const lo = Math.exp(t.lo90), hi = Math.exp(t.hi90);
    const finite = Number.isFinite(lo) && Number.isFinite(hi);
    const inside = finite && lo >= 0.85 - EPS && hi <= 1.15 + EPS;
    const refuted = finite && (lo > 1.15 + EPS || hi < 0.85 - EPS);
    const unknown = !cells.length || (!t.degenerate && !finite);
    const txt = !cells.length ? `không có dữ liệu ${B01} trên t1–t5` : `R=${f(Math.exp(t.est), 3)} [${f(lo, 3)}, ${f(hi, 3)}], bài=${t.n}${t.ceilingTasks.length ? `, bỏ trần [${t.ceilingTasks.join(', ')}]` : ''} — ${t.label}`;
    H.push([id, `${label}: ${B01}/${BASE} trong [0,85; 1,15] (TOST 90% CI, trung bình theo bài của log-tỉ số)`, txt, verdict(inside, unknown, { degenerate: t.degenerate, refuted })]);
  }
}

// ---------- độ nhạy (không dùng để phán quyết) ----------
// A-1 (V4-K2-1), A-2, A-5 (K2): giữ cách cũ làm dòng đối chiếu: lọc size ≥ 3 cho H1, H7 cũ (>1 lượt, 0/0 := 1), luồng chung cũ `rnd` cho compare/hoán vị theo đúng thứ tự gọi cũ.
const SENS = [];
{
  const old = mulberry32(SEED);
  const cmp = (a, b, o) => compare(a, b, { ...o, rng: old });
  const fmt = (c) => (c.n ? `${pp(c.est)} [${pp(c.lo)}, ${pp(c.hi)}], p=${f(c.p, 3)}, tasks=${c.n}` : 'n/a');
  const c1 = cmp(BASE, TREAT, { filter: sizeFilter });
  const c2 = cmp(BASE, TREAT, { filter: inCats('logic') });
  const c4 = cmp(BASE, TREAT, { filter: inCats('requirements') });
  const c6 = ['A1', 'A2'].filter((a) => arms.includes(a)).map((a) => `${TREAT} - ${a}: ${fmt(cmp(a, TREAT, {}))}`);
  const c10 = cmp(BASE, TREAT, {});
  SENS.push(['H1 (độ nhạy)', 'lọc cũ coding/design size ≥ 3 (SR-05) + luồng chung cũ', fmt(c1)]);
  SENS.push(['H2/H4/H6/H10 (độ nhạy)', 'luồng chung cũ, đúng thứ tự gọi cũ (H1, H2, H4, H6, H10)', `H2 ${fmt(c2)}; H4 ${fmt(c4)}; H6 ${c6.join('; ') || 'n/a'}; H10 delta ${fmt(c10)}`]);
  const ts = tasks.filter((t) => cell(BASE, t).length > 1 && cell(TREAT, t).length > 1);
  const pooled = (set, arm) => { let ss = 0, df = 0; for (const t of set) { const x = cell(arm, t); ss += sd(x) ** 2 * (x.length - 1); df += x.length - 1; } return df ? Math.sqrt(ss / df) : NaN; };
  const a = pooled(ts, BASE), b = pooled(ts, TREAT);
  const ratio = a > 0 ? b / a : (b === 0 ? 1 : Infinity); // quy ước cũ 0/0 := 1
  const perTask = tasks.map((t) => { const x = sd(cell(BASE, t)), y = sd(cell(TREAT, t)); return x > 0 ? y / x : (y === 0 ? 1 : NaN); }).filter(Number.isFinite);
  SENS.push(['H7 (độ nhạy)', 'phép cũ: mọi bài có > 1 lượt, 0/0 := 1, không cổng r ≥ 5', `pooled SD ratio ${ratio === Infinity ? '∞' : f(ratio)} over ${ts.length} tasks; median per-task ratio ${f(median(perTask))} over ${perTask.length}; nhãn cũ ${ts.length < MIN_TASKS || Number.isNaN(ratio) ? 'insufficient data' : ratio <= 0.7 ? 'SUPPORTED' : 'not supported'}`]);
}
const mixedNote = has('allow-mixed-judge') ? 'CHẠY VỚI --allow-mixed-judge (A-7): số liệu chỉ để ĐỐI CHIẾU dữ liệu cũ, KHÔNG dùng cho phân tích chính; Bảng 10 phải ghi đây là số đối chiếu.' : '';
if (mixedNote) console.warn(mixedNote);

// ---------- tables ----------
const summary = [];
for (const a of arms) for (const t of tasks) {
  const rs = R.filter((r) => r.arm === a && r.task === t);
  if (!rs.length) continue;
  summary.push({ arm: a, task: t, category: catOf[t], size: sizeOf[t], n: rs.length, score: mean(rs.map((r) => r.score)), sd: sd(rs.map((r) => r.score)), pass: mean(rs.map((r) => (r.pass ? 1 : 0))), wtok: mean(rs.map((r) => r.tokens?.weighted ?? 0)), usd: mean(rs.map((r) => r.costUsd ?? 0)), wall: median(rs.map((r) => r.wallSec ?? 0)), errors: rs.filter((r) => r.status !== 'done').length });
}
const csv = (objs) => [Object.keys(objs[0] ?? {}).join(','), ...objs.map((o) => Object.values(o).map((v) => (typeof v === 'number' ? +v.toFixed(4) : v)).join(','))].join('\n');
fs.writeFileSync(path.join(dir, 'summary.csv'), csv(summary));
const pareto = arms.map((a) => { const rs = R.filter((r) => r.arm === a); return { arm: a, meanScore: mean(rs.map((r) => r.score)), meanWeightedTokens: mean(rs.map((r) => r.tokens?.weighted ?? 0)), meanUsd: mean(rs.map((r) => r.costUsd ?? 0)), medianWallSec: median(rs.map((r) => r.wallSec ?? 0)), scorePerMillionWtok: mean(rs.map((r) => r.score)) / (mean(rs.map((r) => r.tokens?.weighted ?? 0)) / 1e6 || NaN), runs: rs.length }; });
fs.writeFileSync(path.join(dir, 'pareto.csv'), csv(pareto));

const cats = [...new Set(tasks.map((t) => catOf[t]))];
const byCat = ['| Arm | ' + cats.join(' | ') + ' | Overall | Overall theo loại | Weighted tok (mean) | Wall s (median) |', '|' + ' --- |'.repeat(cats.length + 5)];
for (const a of arms) {
  const rs = R.filter((r) => r.arm === a);
  byCat.push(`| ${a} | ${cats.map((c) => f(mean(rs.filter((r) => r.category === c).map((r) => r.score)))).join(' | ')} | ${f(mean(rs.map((r) => r.score)))} | ${f(mean(cats.map((c) => mean(rs.filter((r) => r.category === c).map((r) => r.score))).filter(Number.isFinite)))} | ${Math.round(mean(rs.map((r) => r.tokens?.weighted ?? 0))).toLocaleString('en-US')} | ${Math.round(median(rs.map((r) => r.wallSec ?? 0)))} |`);
}
const md = `# CCoding vs single Claude - results

Folder: \`${dir}\` - ${rows.length} runs (${leaks.length} excluded for touching hidden files, ${infraRows.length} infra rows dropped), arms: ${arms.join(', ')}. Baseline **${BASE}**, treatment **${TREAT}**. Scores are 0-1 per run; deltas in percentage points, 95% two-level bootstrap CI over tasks, p from a paired sign-flip permutation test.

Đã loại ${excludedRows.length} lượt excluded (SR-01c; theo arm: ${excludedTxt}). Giám khảo: ${judgeTxt} (SR-07). RNG: ${rngTxt} (SR-20).${commitWarn ? `

${commitWarn}` : ''}${mixedWarn ? `

${mixedWarn}` : ''}${mixedNote ? `

**${mixedNote}**` : ''}

## Hypotheses

| ID | Test | Result | Verdict |
| --- | --- | --- | --- |
${H.map((h) => `| ${h.join(' | ')} |`).join('\n')}

Nhãn: \`not supported — bác bỏ\` = CI hẳn ngoài vùng ủng hộ/biên; \`not supported — không kết luận\` (gồm suy biến) KHÔNG phải bác bỏ (A-4). H1′/H2′ dùng quy tắc trần/suy biến bảo thủ CHỜ Phòng Nghiên cứu đăng ký (S-1).

## Độ nhạy (cách cũ, chỉ đối chiếu; không phán quyết)

| ID | Cách cũ | Kết quả |
| --- | --- | --- |
${SENS.map((h) => `| ${h.join(' | ')} |`).join('\n')}

## Mean score by category

Overall = trung bình theo lượt (loại nhiều bài như coding nặng hơn); Overall theo loại = trung bình có trọng số bằng nhau giữa các loại (SR-22).

${byCat.join('\n')}

## Cost-quality frontier

| Arm | Mean score | Mean weighted tokens | Mean USD | Median wall s | Score per 1M weighted tokens |
| --- | --- | --- | --- | --- | --- |
${pareto.map((p) => `| ${p.arm} | ${f(p.meanScore)} | ${Math.round(p.meanWeightedTokens).toLocaleString('en-US')} | ${f(p.meanUsd)} | ${Math.round(p.medianWallSec)} | ${f(p.scorePerMillionWtok)} |`).join('\n')}

## Per task (${TREAT} - ${BASE})

| Task | Category | Size | ${BASE} | ${TREAT} | Delta |
| --- | --- | --- | --- | --- | --- |
${tasks.map((t) => { const a = mean(cell(BASE, t)), b = mean(cell(TREAT, t)); return `| ${t} | ${catOf[t]} | ${sizeOf[t]} | ${f(a)} | ${f(b)} | ${pp(b - a)} |`; }).join('\n')}

${exploratory.length ? `## Exploratory tasks (set: exploratory; không vào H1–H10, H6, H1′/H2′)

| Task | Category | ${BASE} | ${TREAT} | Delta |
| --- | --- | --- | --- | --- |
${exploratory.map((t) => { const xs = Rx.filter((r) => r.task === t); const m = (arm) => mean(xs.filter((r) => r.arm === arm).map((r) => r.score)); return `| ${t} | ${xs[0]?.category} | ${f(m(BASE))} | ${f(m(TREAT))} | ${pp(m(TREAT) - m(BASE))} |`; }).join('\n')}

` : ''}Errors / non-done runs: ${rows.filter((r) => r.status !== 'done').map((r) => r.key).join(', ') || 'none'}.
Leaked runs: ${leaks.map((r) => r.key).join(', ') || 'none'}.
`;
fs.writeFileSync(path.join(dir, 'report.md'), md);
console.log(md);
