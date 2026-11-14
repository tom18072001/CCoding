#!/usr/bin/env node
// Lớp chỉ số "bộ chấm và cổng như bộ phân loại": ma trận nhầm lẫn, Accuracy, Precision, Recall, F1 (macro-F1 khi nhiều lớp),
// Cohen's κ, prevalence, PABAK, CI bootstrap 95 % lấy mẫu lại THEO LƯỢT CHẠY (runId). Vòng 4, gói 2, hạng mục S1.
// Node >= 22, không gói ngoài, offline, không gọi LLM. Chỉ ĐỌC bench/ (grade.mjs, tasks, results); không sửa.
//
//   node docs/research/analysis/agreement.mjs                          # in mọi bảng (a), (b)
//   node docs/research/analysis/agreement.mjs --table A-2              # một bảng
//   node docs/research/analysis/agreement.mjs --check docs/research/analysis/agreement.md
//        # mọi bảng trong .md phải trùng từng ký tự với đầu ra script; hash ảnh chụp; gold-sheet/gold-key khớp bản sinh lại (exit 1 nếu lệch)
//   node docs/research/analysis/agreement.mjs --make-gold              # sinh gold-sheet.csv, gold-key.csv (xác định theo seed)
//   node docs/research/analysis/agreement.mjs --gold-score             # khi giám đốc đã điền nhãn: judge, regex so với nhãn người
//   node docs/research/analysis/agreement.mjs --pairs tệp.csv [--positive X] [--seed N] [--boot B]
//        # tệp CSV có cột ref,pred[,runId]; không có runId thì mỗi dòng là một đơn vị lấy mẫu
//
// QUY ƯỚC. Nhãn so theo chuỗi. Nhị phân: Precision/Recall/F1 tính cho lớp dương; ref là "tham chiếu", pred là "dự đoán".
// Nhiều lớp: Precision/Recall/F1 là macro (trung bình không trọng số các lớp; lớp có mẫu số 0 tính 0). F1 macro = TB của F1 từng lớp.
// κ = (po − pe)/(1 − pe); không xác định (n/a) khi pe = 1. PABAK = (k·po − 1)/(k − 1), k = số lớp (nhị phân: 2·po − 1).
// Bootstrap: lấy lại runId có hoàn lại, ghép mọi cặp của các lượt được chọn, tính lại thống kê; bản lấy mẫu mà thống kê không xác định
// bị bỏ và đếm (báo "B hợp lệ"). CI = phân vị 2,5 %–97,5 %, nội suy tuyến tính.
// (a) CHỈ gộp mọi arm: khóa lượt chứa tên arm nên chỉ dùng nội bộ làm runId, không bao giờ in hay ghi ra tệp.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
export const SEED = 20261103;
export const BOOT = 2000;
export const PREV_LO = 0.1, PREV_HI = 0.9;

// ───────────────────────── Thư viện chỉ số ─────────────────────────
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const S = (x) => String(x);
const div = (a, b) => (b === 0 ? NaN : a / b);

/** pairs: [{ref, pred, runId?}]. opts.positive: ép chế độ nhị phân với lớp dương này. */
export function metrics(pairs, opts = {}) {
  const ps = pairs.map((p) => ({ ref: S(p.ref), pred: S(p.pred) }));
  const seen = [...new Set(ps.flatMap((p) => [p.ref, p.pred]))].sort();
  let labels, positive;
  if (opts.positive !== undefined || seen.length <= 2) {
    positive = opts.positive !== undefined ? S(opts.positive) : (seen.includes('1') ? '1' : seen.includes('true') ? 'true' : seen.at(-1) ?? '1');
    labels = [...seen.filter((l) => l !== positive), positive];
    if (labels.length === 1) labels = [`¬${positive}`, positive];
    if (labels.length > 2) { positive = undefined; }
  } else labels = seen;
  const binary = positive !== undefined && labels.length === 2;
  const k = labels.length, idx = new Map(labels.map((l, i) => [l, i]));
  const m = Array.from({ length: k }, () => Array(k).fill(0));
  for (const p of ps) m[idx.get(p.ref)][idx.get(p.pred)]++;
  const n = ps.length;
  const rowT = m.map((r) => r.reduce((a, b) => a + b, 0));
  const colT = labels.map((_, j) => m.reduce((a, r) => a + r[j], 0));
  const diag = m.reduce((a, r, i) => a + r[i], 0);
  const po = div(diag, n);
  const pe = n ? rowT.reduce((a, r, i) => a + r * colT[i], 0) / (n * n) : NaN;
  const kappa = pe === 1 ? NaN : (po - pe) / (1 - pe);
  const kP = opts.kFixed ?? k; // bootstrap đa lớp: giữ k của mẫu gốc để PABAK không đổi theo số lớp có mặt trong mẫu lấy lại
  const pabak = kP > 1 ? (kP * po - 1) / (kP - 1) : NaN;
  const perClass = labels.map((l, i) => {
    const tp = m[i][i], fp = colT[i] - tp, fn = rowT[i] - tp;
    return { label: l, support: rowT[i], precision: div(tp, tp + fp), recall: div(tp, tp + fn), f1: div(2 * tp, 2 * tp + fp + fn) };
  });
  const out = { n, k, labels, matrix: m, binary, accuracy: po, kappa, pabak, po, pe, perClass, nRef: rowT, nPred: colT };
  const z = (x) => (Number.isFinite(x) ? x : 0);
  if (binary) {
    const c = perClass[1];
    Object.assign(out, { positive, tp: m[1][1], fp: m[0][1], fn: m[1][0], tn: m[0][0], nPositive: rowT[1], precision: c.precision, recall: c.recall, f1: c.f1, prevalence: div(rowT[1], n), predRate: div(colT[1], n) });
  } else {
    const mean = (f) => (n ? perClass.reduce((a, c) => a + z(c[f]), 0) / k : NaN);
    Object.assign(out, { precision: mean('precision'), recall: mean('recall'), f1: mean('f1'), macroF1: mean('f1'), prevalence: n ? Math.max(...rowT) / n : NaN, predRate: n ? Math.max(...colT) / n : NaN });
  }
  out.warnings = [];
  // Nhị phân: ngoài [0,1; 0,9] ở tham chiếu hoặc dự đoán. Đa lớp (preregistration.md §5.1, duyệt thiết kế điểm 3): chỉ khi lớp lớn nhất
  // của tham chiếu hoặc của dự đoán > 0,9; cận dưới 0,1 không có nghĩa khi có nhiều nhãn.
  const extreme = (x) => x > PREV_HI || (binary && x < PREV_LO);
  if (n > 0 && (extreme(out.prevalence) || extreme(out.predRate))) {
    const where = binary ? `prevalence (tham chiếu) = ${vn(out.prevalence)}, tỉ lệ dương dự đoán = ${vn(out.predRate)}` : `lớp lớn nhất chiếm ${vn(out.prevalence)} tham chiếu và ${vn(out.predRate)} dự đoán`;
    const range = binary ? `nằm ngoài [${vn(PREV_LO, 1)}; ${vn(PREV_HI, 1)}]` : `vượt ${vn(PREV_HI, 1)}`;
    out.warnings.push(`NGHỊCH LÝ κ: ${where} ${range}, hầu hết ô chạm trần; κ = ${vn(kappa)} có thể thấp dù khớp thô = ${vn(po)}. Đọc kèm PABAK = ${vn(pabak)} (không phụ thuộc phân bố lớp).`);
  }
  return out;
}

function quantile(sorted, p) {
  if (!sorted.length) return NaN;
  const x = p * (sorted.length - 1), lo = Math.floor(x), hi = Math.ceil(x);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
}

/** Nhóm cặp theo runId (thiếu runId: mỗi cặp một nhóm). */
export function groupByRun(pairs) {
  const g = new Map();
  pairs.forEach((p, i) => { const id = p.runId ?? `#${i}`; if (!g.has(id)) g.set(id, []); g.get(id).push(p); });
  return [...g.values()];
}

/** Một mẫu bootstrap: lấy lại các NHÓM LƯỢT (không phải từng mục), ghép lại. */
export function bootstrapSample(groups, rnd) {
  const out = [];
  for (let i = 0; i < groups.length; i++) out.push(...groups[Math.floor(rnd() * groups.length)]);
  return out;
}

/** CI bootstrap theo lượt cho thống kê stat(pairs) → số. Trả {lo, hi, valid, B}. */
export function bootstrapCI(pairs, stat, { B = BOOT, seed = SEED, level = 0.95 } = {}) {
  const groups = groupByRun(pairs), rnd = rng(seed), v = [];
  for (let b = 0; b < B; b++) { const x = stat(bootstrapSample(groups, rnd)); if (Number.isFinite(x)) v.push(x); }
  v.sort((a, b) => a - b);
  const a = (1 - level) / 2;
  return { lo: quantile(v, a), hi: quantile(v, 1 - a), valid: v.length, B, runs: groups.length };
}

/** Báo cáo đầy đủ cho một tập cặp: số liệu điểm + CI theo lượt cho các chỉ số chính. */
export function report(pairs, opts = {}) {
  const base = metrics(pairs, opts), keys = ['accuracy', 'precision', 'recall', 'f1', 'kappa', 'pabak'];
  const ci = {};
  for (const key of keys) ci[key] = bootstrapCI(pairs, (s) => metrics(s, { ...opts, positive: base.binary ? base.positive : undefined, kFixed: base.binary ? undefined : base.k })[key], opts);
  return { ...base, ci };
}

// ───────────────────────── Định dạng ─────────────────────────
export function vn(x, d = 3) { return Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : 'n/a'; }
const cell = (x, ci) => (ci && Number.isFinite(ci.lo) ? `${vn(x)} [${vn(ci.lo, 2)}; ${vn(ci.hi, 2)}]` : vn(x));
const tbl = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

export function formatReport(r, title = '') {
  const L = [];
  if (title) L.push(`## ${title}`);
  L.push(`n = ${r.n}${r.binary ? ` · số dương thật (tham chiếu) = ${r.nPositive} · lớp dương = ${r.positive}` : ` · ${r.k} lớp`}`);
  L.push(`Ma trận nhầm lẫn (hàng = tham chiếu, cột = dự đoán):\n${tbl(['', ...r.labels.map((l) => `dự đoán ${l}`)], r.matrix.map((row, i) => [`tham chiếu ${r.labels[i]}`, ...row.map(String)]))}`);
  const ci = (k) => (r.ci?.[k] ? ` [${vn(r.ci[k].lo, 2)}; ${vn(r.ci[k].hi, 2)}]` : '');
  L.push(`Accuracy ${vn(r.accuracy)}${ci('accuracy')} · Precision${r.binary ? '' : ' (macro)'} ${vn(r.precision)}${ci('precision')} · Recall${r.binary ? '' : ' (macro)'} ${vn(r.recall)}${ci('recall')} · ${r.binary ? 'F1' : 'macro-F1'} ${vn(r.f1)}${ci('f1')}`);
  L.push(`Cohen's κ ${vn(r.kappa)}${ci('kappa')} · PABAK ${vn(r.pabak)}${ci('pabak')} · prevalence ${vn(r.prevalence)}${r.ci ? ` · CI bootstrap theo lượt (${r.ci.accuracy.runs} lượt, B hợp lệ ${r.ci.kappa.valid}/${r.ci.kappa.B}, seed ${SEED})` : ''}`);
  for (const w of r.warnings) L.push(`⚠ ${w}`);
  return L.join('\n\n');
}

// ───────────────────────── CSV ─────────────────────────
const q = (x) => `"${S(x).replace(/"/g, '""')}"`;
export function toCsv(head, rows) { return [head, ...rows].map((r) => r.map(q).join(',')).join('\n') + '\n'; }
export function parseCsv(text) {
  const t = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const recs = []; let row = [], f = '', inq = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inq) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else inq = false; } else f += c; }
    else if (c === '"') inq = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); f = ''; recs.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); recs.push(row); }
  const [head, ...rest] = recs.filter((r) => !(r.length === 1 && r[0] === '') && !String(r[0]).startsWith('#'));
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// ───────────────────────── Dữ liệu (a): judge so với regex ─────────────────────────
const SNAP_COMMIT = '838a5f1', SNAP_PATH = 'bench/vs-claude/results/study-cloud/runs.jsonl';
const SNAP_SHA = '85db4ddbb65e12482cc7acb57e31154192ce22655d298061c9a437edce9b5d39', SNAP_LINES = 276;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const BENCH = path.join(ROOT, 'bench', 'vs-claude');
const ART = path.join(BENCH, 'results', 'study-cloud', 'artifacts');

function loadSnapshot() {
  const buf = execFileSync('git', ['show', `${SNAP_COMMIT}:${SNAP_PATH}`], { cwd: ROOT, maxBuffer: 1 << 28 });
  const h = sha(buf);
  if (h !== SNAP_SHA) throw new Error(`Hash ảnh chụp ${SNAP_COMMIT} lệch: ${h}`);
  const rows = buf.toString('utf8').trim().split('\n').map((l) => JSON.parse(l));
  if (rows.length !== SNAP_LINES) throw new Error(`Số dòng ảnh chụp lệch: ${rows.length}`);
  return { rows, hash: h };
}

let DATA;
/** Tính một lần: mọi bảng (a), (b) lấy từ đây. Khóa lượt (chứa tên arm) chỉ nằm trong `pairs[].runId`, `runs[].key`. */
async function data() {
  if (DATA) return DATA;
  const { rows, hash } = loadSnapshot();
  const { gradeChecklist } = await import(pathToFileURL(path.join(BENCH, 'lib', 'grade.mjs')).href);
  const ck = rows.filter((r) => r.details?.verdicts);
  const excl = { notChecklist: rows.length - ck.length, noJudge: 0, notDone: 0, noArtifact: 0 };
  const kept = [], itemsOf = {};
  let charsOk = 0, regexRowsOk = 0, regexRows = 0;
  for (const r of ck) {
    const hidden = path.join(BENCH, 'tasks', r.task, 'hidden'), dir = path.join(ART, r.key);
    const isJudge = r.details.judge && r.details.judge !== 'regex';
    if (r.status !== 'done') { excl.notDone++; continue; }
    if (!fs.existsSync(dir)) { excl.noArtifact++; continue; }
    const task = JSON.parse(fs.readFileSync(path.join(BENCH, 'tasks', r.task, 'task.json'), 'utf8'));
    const finalPath = path.join(dir, '_FINAL.txt');
    const finalText = lf(fs.existsSync(finalPath) ? fs.readFileSync(finalPath, 'utf8') : '');
    // Không truyền judge ⇒ gradeChecklist dùng regex. Blob git là LF nhưng cây làm việc Windows có thể là CRLF (autocrlf):
    // chép bản deliverable đã chuẩn hóa LF vào thư mục tạm để chấm đúng văn bản mà judge đã thấy (bench/ không bị sửa).
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agr-'));
    const dfile = path.join(dir, task.deliverable);
    if (fs.existsSync(dfile)) fs.writeFileSync(path.join(tmp, task.deliverable), lf(fs.readFileSync(dfile, 'utf8')));
    const g = await gradeChecklist({ workdir: tmp, hiddenDir: hidden, finalText, task });
    fs.rmSync(tmp, { recursive: true, force: true });
    const items = JSON.parse(fs.readFileSync(path.join(hidden, 'checklist.json'), 'utf8')).items;
    itemsOf[r.task] = items;
    if (!isJudge) { // hàng đã chấm bằng regex: chỉ dùng để kiểm artifact còn nguyên, KHÔNG vào phép so
      excl.noJudge++; regexRows++;
      if (JSON.stringify(g.details.verdicts) === JSON.stringify(r.details.verdicts)) regexRowsOk++;
      continue;
    }
    if (g.details.chars === r.details.chars) charsOk++;
    kept.push({ key: r.key, task: r.task, text: readText(dir, task.deliverable, finalText), judge: r.details.verdicts, regex: g.details.verdicts, items });
  }
  const pairs = kept.flatMap((k) => k.items.map((it) => ({ ref: k.judge[it.id] ? '1' : '0', pred: k.regex[it.id] ? '1' : '0', runId: k.key, task: k.task, item: it.id, question: it.question })));
  DATA = { hash, nRows: rows.length, excl, kept, pairs, itemsOf, charsOk, regexRowsOk, regexRows };
  return DATA;
}
function lf(t) { return t.replace(/\r\n/g, '\n'); }
function readText(dir, file, finalText) { const p = path.join(dir, file); return fs.existsSync(p) ? lf(fs.readFileSync(p, 'utf8')) : finalText; }

// ───────────────────────── Bảng (a) ─────────────────────────
const BOOT_B = BOOT;
const TITLES = {
  'A-0': 'A-0. Nhận dạng dữ liệu và số dòng bị loại',
  'A-1': 'A-1. Judge so với regex theo từng mục checklist (gộp mọi arm)',
  'A-2': 'A-2. Judge so với regex, gộp theo bài và toàn bộ (CI 95 % bootstrap theo lượt)',
  'A-3': 'A-3. Đối chiếu hai lỗi regex đã biết (chẩn đoán sau, không sửa bộ chấm)',
  'G-0': 'G-0. Chuẩn bị bộ nhãn vàng (b): chỉ nhận dạng, không có κ',
  'C-0': 'C-0. Nhận dạng dữ liệu và phạm vi của (c)',
  'C-1': 'C-1. Cổng như bộ phát hiện lượt lỗi, C1–C9 (gộp mọi arm)',
  'C-2': 'C-2. Vòng sửa như bộ phát hiện lượt lỗi, ảnh chụp 276 dòng (gộp mọi arm)',
  'C-3': 'C-3. Số lượt bài cài lỗi để nửa độ rộng CI 95 % của recall ≤ 0,15',
  'M-0': 'M-0. Đối chiếu commit và nhận dạng tệp nhãn MAST',
  'M-1': 'M-1. κ giữa người gán A và B, C-01…C-49 (CI bootstrap theo C-xx)',
  'M-2': 'M-2. Ma trận nhầm lẫn theo nhóm (hàng = A, cột = B)',
  'M-3': 'M-3. Phân xử: nhãn cuối so với A và B',
  'M-4': 'M-4. Nhóm gốc trong challenges.md (theo khoảng mã) so với nhóm cuối',
};
export const IDS = Object.keys(TITLES);
const pct = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(1).replace('.', ',')} %` : 'n/a');

async function buildTables() {
  const D = await data(), T = {};
  const nPairs = D.pairs.length;
  T['A-0'] = `Ảnh chụp: \`${SNAP_PATH}\` ở commit \`${SNAP_COMMIT}\`. Artifact chấm lại: \`bench/vs-claude/results/study-cloud/artifacts/<khóa>/\`. Không gọi LLM, không truyền judge cho \`gradeChecklist\`.\n\n` + tbl(['Mục', 'Giá trị'], [
    ['sha256 ảnh chụp (byte thô, `git show`)', `\`${D.hash}\``],
    ['Số dòng ảnh chụp', String(D.nRows)],
    ['Loại: không phải bài checklist (không có `details.verdicts`)', String(D.excl.notChecklist)],
    ['Loại: bài checklist nhưng đã chấm bằng regex, không có judge', String(D.excl.noJudge)],
    ['Loại: status ≠ done', String(D.excl.notDone)],
    ['Loại: thiếu artifact', String(D.excl.noArtifact)],
    ['**Giữ lại: dòng có judge (opus)**', `**${D.kept.length}**`],
    ['Số cặp (lượt × mục) trong phép so', String(nPairs)],
    ['Kiểm artifact: độ dài văn bản chấm lại = `chars` lúc judge chấm', `${D.charsOk}/${D.kept.length}`],
    ['Kiểm artifact: regex chấm lại = verdict regex đã lưu, trên các dòng regex bị loại', `${D.regexRowsOk}/${D.regexRows}`],
  ]) + `\n\nPhân vùng: ${D.excl.notChecklist} + ${D.excl.noJudge} + ${D.excl.notDone} + ${D.excl.noArtifact} + ${D.kept.length} = ${D.excl.notChecklist + D.excl.noJudge + D.excl.notDone + D.excl.noArtifact + D.kept.length} dòng. Các dòng regex bị loại chỉ dùng kiểm artifact còn nguyên, không đưa vào phép so nào. Blob git là LF nhưng cây làm việc Windows có thể là CRLF (autocrlf): script chuẩn hóa về LF trước khi chấm, nếu không độ dài lệch \`chars\` và cửa sổ \`.{0,300}\` của regex lệch.`;

  const tasks = [...new Set(D.pairs.map((p) => p.task))];
  const byItem = tasks.flatMap((t) => D.itemsOf[t].map((it) => ({ task: t, item: it.id })));
  const rowsA1 = [], warnA1 = [];
  for (const { task, item } of byItem) {
    const ps = D.pairs.filter((p) => p.task === task && p.item === item), m = metrics(ps, { positive: '1' });
    rowsA1.push([task, item, String(m.n), String(m.nPositive), String(m.nPred[1]), `${m.tp}/${m.fn}/${m.fp}/${m.tn}`, vn(m.accuracy, 2), vn(m.kappa, 2), vn(m.pabak, 2), vn(m.prevalence, 2), m.warnings.length ? '⚠' : '']);
    if (m.warnings.length) warnA1.push(`${task}/${item}`);
  }
  T['A-1'] = `Tham chiếu = judge (opus), dự đoán = regex; lớp dương = "mục đạt". Đây là **độ khớp**, không phải độ đúng: không bên nào là chuẩn vàng. Cột "TP/FN/FP/TN" = judge có & regex có / judge có & regex không / judge không & regex có / cả hai không. Mỗi mục chỉ có n lượt, nên κ từng mục thô; không tính CI từng mục (n quá nhỏ cho bootstrap theo lượt). "n/a" = κ không xác định (cả hai bên cùng một nhãn ở mọi lượt, pe = 1). ⚠ = prevalence hoặc tỉ lệ dương dự đoán ngoài [0,1; 0,9] (nghịch lý κ).\n\n` + tbl(['Bài', 'Mục', 'n lượt', 'Judge dương', 'Regex dương', 'TP/FN/FP/TN', 'Khớp thô', 'κ', 'PABAK', 'Prevalence', 'Cảnh báo'], rowsA1) +
    `\n\nSố mục có cảnh báo nghịch lý κ: ${warnA1.length}/${byItem.length}. Ở các mục này κ không dùng được để so; đọc "Khớp thô" và PABAK.`;

  const rowsA2 = [];
  const groups = [...tasks.map((t) => [t, D.pairs.filter((p) => p.task === t)]), ['Gộp', D.pairs]];
  let pooled;
  for (const [name, ps] of groups) {
    const r = report(ps, { positive: '1', B: BOOT_B, seed: SEED });
    if (name === 'Gộp') pooled = r;
    rowsA2.push([name, String(r.ci.accuracy.runs), String(r.n), `${r.nPositive}/${r.nPred[1]}`, cell(r.accuracy, r.ci.accuracy), cell(r.precision, r.ci.precision), cell(r.recall, r.ci.recall), cell(r.f1, r.ci.f1), cell(r.kappa, r.ci.kappa), cell(r.pabak, r.ci.pabak), `${vn(r.prevalence, 2)} / ${vn(r.predRate, 2)}`]);
  }
  T['A-2'] = `Ref = judge, pred = regex (Precision = trong số mục regex cho đạt, tỉ lệ judge cũng cho đạt; Recall = trong số mục judge cho đạt, tỉ lệ regex cũng cho đạt). Accuracy, κ, PABAK đối xứng giữa hai bên. Ô: ước lượng [CI 95 %]; CI lấy lại **lượt** (không lấy lại mục), B = ${BOOT_B}, seed ${SEED}; ô "n/a" nghĩa là thống kê không xác định ở phần lớn mẫu. "Dương thật" = số mục judge cho đạt, "dự đoán dương" = số mục regex cho đạt.\n\n` +
    tbl(['Phạm vi', 'Số lượt', 'n cặp', 'Dương judge/regex', 'Accuracy', 'Precision', 'Recall', 'F1', 'κ', 'PABAK', 'Prevalence judge / regex'], rowsA2) +
    '\n\n' + (pooled.warnings.length ? pooled.warnings.map((w) => `⚠ ${w}`).join('\n\n') : 'Không có cảnh báo nghịch lý κ ở dòng "Gộp".') +
    `\n\nCông thức của ô "Gộp": ma trận nhầm lẫn ${pooled.tp}/${pooled.fn}/${pooled.fp}/${pooled.tn} (TP/FN/FP/TN), po = ${vn(pooled.po)}, pe = ${vn(pooled.pe)}.`;

  // A-3: hai lỗi regex đã biết (preregistration.md), chẩn đoán trên chính các văn bản đã giữ
  const rows3 = [];
  const integ = D.kept.filter((k) => k.task === 'r1-elk-design');
  {
    const it = D.itemsOf['r1-elk-design'].find((x) => x.id === 'integrity');
    const fixed = it.regex.map((re) => re.replace(/\bsign\b/g, '\\bsign'));
    const hit = integ.filter((k) => k.regex.integrity);
    const spurious = hit.filter((k) => !fixed.some((re) => new RegExp(re, 'is').test(k.text)));
    const spuriousAgree = spurious.filter((k) => k.judge.integrity).length;
    rows3.push(['`sign` khớp "design" (mục `integrity`)', `${hit.length} lượt regex cho đạt`, `${spurious.length} lượt chỉ đạt nhờ "sign" trong từ khác (khi đổi thành \`\\bsign\`)`, `judge cũng cho đạt: ${spuriousAgree}/${spurious.length}`]);
  }
  {
    const it = D.itemsOf['r1-elk-design'].find((x) => x.id === 'daily-volume');
    const miss = integ.filter((k) => !new RegExp(it.regex[0], 'is').test(k.text));
    const oneDec = miss.filter((k) => /\b1[.,][2-5] ?(TB|TiB)\b/i.test(k.text));
    const agree = oneDec.filter((k) => k.judge['daily-volume']).length;
    rows3.push(['bỏ sót "1,4 TB" một chữ số thập phân (mục `daily-volume`)', `${miss.length} lượt regex không cho đạt`, `${oneDec.length} lượt có "1,2–1,5 TB/TiB" một chữ số thập phân mà regex bỏ sót`, `judge cho đạt: ${agree}/${oneDec.length}`]);
  }
  const dis = D.pairs.filter((p) => p.ref !== p.pred).length;
  T['A-3'] = `Chẩn đoán trên ${D.kept.length} văn bản đã giữ ở A-0, gộp arm. Không sửa \`checklist.json\` hay \`grade.mjs\`; chỉ chạy lại biểu thức đã biết lỗi với một biến thể sửa để đếm. Trường hợp "không khớp judge" chưa chắc là lỗi regex: judge cũng có thể sai.\n\n` +
    tbl(['Lỗi đã biết', 'Phạm vi', 'Số lượt bị ảnh hưởng', 'Judge'], rows3) +
    `\n\nCả hai lỗi đã biết **không xảy ra** trong ${D.kept.length} văn bản này (số 0 ở cột 3); không suy ra tần suất của chúng ở bài khác. Tổng số cặp bất đồng judge ≠ regex: ${dis}/${nPairs}.`;
  T['G-0'] = (await goldTables()).summary;
  Object.assign(T, await gateTables(), await mastTables());
  return T;
}

// ───────────────────────── (b) Bộ nhãn vàng: chuẩn bị ─────────────────────────
const GOLD_N = 60;
const STOP = new Set('does the spec document design that with from about which what when where have this those these into your their there whether between within include includes explicit explicitly correctly concrete mechanism computed compute'.split(' '));
const terms = (s) => [...new Set((s.toLowerCase().match(/[a-z0-9][a-z0-9.\-+]{2,}/g) ?? []).filter((w) => !STOP.has(w)))];

async function blindFn() { return (await import(pathToFileURL(path.join(BENCH, 'lib', 'judge.mjs')).href)).blind; }

/** Đoạn trích: tối đa 3 đoạn văn trùng nhiều từ khóa của CÂU HỎI nhất (độc lập với regex và judge), giữ thứ tự tài liệu. */
function excerpt(text, question, blind) {
  const paras = blind(text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const tq = terms(question);
  const scored = paras.map((p, i) => ({ p, i, s: tq.filter((w) => p.toLowerCase().includes(w)).length })).filter((x) => x.s > 0);
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  const top = scored.slice(0, 3).sort((a, b) => a.i - b.i);
  const cut = (p) => (p.length > 500 ? `${p.slice(0, 500)}…` : p);
  return (top.length ? top.map((x) => cut(x.p)).join(' […] ') : '(không tìm thấy đoạn nào trùng từ khóa của câu hỏi)').replace(/\s*\n\s*/g, ' ¶ ');
}

function shuffle(a, rnd) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

let GOLD;
async function goldBuild() {
  if (GOLD) return GOLD;
  const D = await data(), blind = await blindFn();
  const cells = [...new Set(D.pairs.map((p) => `${p.task}\t${p.item}`))];
  const base = Math.floor(GOLD_N / cells.length), extra = GOLD_N - base * cells.length;
  const bonus = new Set(shuffle(cells, rng(SEED + 1)).slice(0, extra));
  const runCode = new Map(shuffle([...new Set(D.pairs.map((p) => p.runId))].sort(), rng(SEED + 2)).map((k, i) => [k, `L${String(i + 1).padStart(2, '0')}`]));
  const text = new Map(D.kept.map((k) => [k.key, k.text]));
  const chosen = [];
  cells.forEach((c, ci) => {
    const ps = D.pairs.filter((p) => `${p.task}\t${p.item}` === c);
    chosen.push(...shuffle(ps, rng(SEED + 100 + ci)).slice(0, base + (bonus.has(c) ? 1 : 0)));
  });
  const final = shuffle(chosen, rng(SEED + 3));
  const rows = final.map((p, i) => ({ id: `G${String(i + 1).padStart(2, '0')}`, task: p.task, item: p.item, question: p.question, excerpt: excerpt(text.get(p.runId), p.question, blind), run: runCode.get(p.runId), judge: p.ref, regex: p.pred }));
  const sheet = '﻿' + toCsv(['id', 'bài', 'mục', 'câu_hỏi', 'đoạn_trích', 'nhãn_người', 'ghi_chú'], rows.map((r) => [r.id, r.task, r.item, r.question, r.excerpt, '', ''])) +
    `# seed=${SEED}; xáo Fisher-Yates bằng mulberry32; ${rows.length} mục từ ${cells.length} ô bài×mục; điền nhãn_người: 1 (đạt) / 0 (không đạt) / ? (đoạn trích không đủ)\n`;
  const key = toCsv(['id', 'bài', 'mục', 'lượt', 'judge', 'regex'], rows.map((r) => [r.id, r.task, r.item, r.run, r.judge, r.regex])) + `# seed=${SEED}; mã lượt L01..L12 xáo bằng seed; ánh xạ về khóa lượt tính lại được bằng script từ ảnh chụp ${SNAP_COMMIT}, không lưu ở đây\n`;
  GOLD = { rows, sheet, key, cells, base, extra };
  return GOLD;
}
const GS = path.join(HERE, 'gold-sheet.csv'), GK = path.join(HERE, 'gold-key.csv');
const blankCols = (csv) => parseCsv(csv).map((r) => ['id', 'bài', 'mục', 'câu_hỏi', 'đoạn_trích'].map((c) => r[c]).join('\u0001')).join('\u0002');

async function goldTables() {
  const G = await goldBuild();
  const perCell = G.cells.map((c) => G.rows.filter((r) => `${r.task}\t${r.item}` === c).length);
  const head = tbl(['Mục', 'Giá trị'], [
    ['Seed (chọn mục, mã lượt, xáo thứ tự)', String(SEED)],
    ['Số mục chọn / số cặp có sẵn', `${G.rows.length}/${(await data()).pairs.length}`],
    ['Số ô bài×mục; số mục mỗi ô', `${G.cells.length}; ${Math.min(...perCell)}–${Math.max(...perCell)} (${G.base} mỗi ô, ${G.extra} ô thêm 1 do seed)`],
    ['sha256 `gold-sheet.csv` bản trắng (chưa có nhãn)', `\`${sha(Buffer.from(G.sheet, 'utf8'))}\``],
    ['sha256 `gold-key.csv`', `\`${sha(Buffer.from(G.key, 'utf8'))}\``],
    ['Số nhãn người đã có', '0 (chưa gán; script không tính κ hay Accuracy cho bộ nhãn vàng khi chưa có nhãn)'],
  ]);
  return { summary: head };
}

// ───────────────────────── Chấm theo nhãn vàng (khi đã điền) ─────────────────────────
function goldScore() {
  const sheet = parseCsv(fs.readFileSync(GS, 'utf8')), key = new Map(parseCsv(fs.readFileSync(GK, 'utf8')).map((r) => [r.id, r]));
  const lab = sheet.filter((r) => ['0', '1'].includes(r['nhãn_người'].trim()));
  const unsure = sheet.filter((r) => r['nhãn_người'].trim() === '?').length;
  if (!lab.length) { console.log(`Chưa có nhãn người (0/${sheet.length} dòng có nhãn 0/1; ${unsure} dòng "?"). Không tính chỉ số.`); return; }
  for (const who of ['judge', 'regex']) {
    const pairs = lab.map((r) => ({ ref: r['nhãn_người'].trim(), pred: key.get(r.id)[who], runId: key.get(r.id)['lượt'] }));
    console.log(formatReport(report(pairs, { positive: '1' }), `${who} so với nhãn người (${lab.length}/${sheet.length} dòng có nhãn; ${unsure} dòng "?")`) + '\n');
  }
}

// ───────────────────────── (c) Cổng như bộ phát hiện lượt lỗi (hạng mục S5) ─────────────────────────
// Định nghĩa chốt trước khi tính: agreement.md §(c) "Định nghĩa chốt trước". Dữ liệu C1–C9 + ảnh chụp 276 dòng; không đọc gì sau đó.
const RES = path.join(BENCH, 'results');
const lfRead = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const lfSha = (p) => sha(Buffer.from(lfRead(p), 'utf8'));
const C_FILES = [ // [nhãn hiển thị, đường dẫn, sha256 sau khi chuẩn hóa LF]
  ['docs/research/analysis/b02m-replay.md', path.join(HERE, 'b02m-replay.md'), 'e32d073d1b19694ee3a4274ee0d74a0c60c1c7c42d76d66a34f1ccc7591ca06c'],
  ['bench/vs-claude/results/runs.csv', path.join(RES, 'runs.csv'), '128513e2de31727d44d08d11473d27d08dfe51f096e2d8493820fff8012e27f9'],
  ['bench/vs-claude/results/phases.csv', path.join(RES, 'phases.csv'), '4641996d769db2f036632eedc44b631dd83e8100a78bf687cb77db4ca187bb9e'],
  ['bench/vs-claude/results/calls.csv', path.join(RES, 'calls.csv'), '1d7f9f52365eea7e45ce4e146caa121529561417f1cdd27f1b4d0d68a3ca4e98'],
];
const MIN_POS = 10; // dưới ngưỡng này (đếm theo lượt) ⇒ "recall chưa ước lượng được"
const gkey = (r) => `${r.run}/${r.task}.${r.system}.${r.rep}`;

let GATE;
function gateData() {
  if (GATE) return GATE;
  for (const [name, p, h] of C_FILES) { const got = lfSha(p); if (got !== h) throw new Error(`Hash ${name} lệch (${got}); dữ liệu C1–C9 đã đổi, dừng.`); }
  const md = lfRead(C_FILES[0][1]);
  const runs = parseCsv(lfRead(C_FILES[1][1])), phases = parseCsv(lfRead(C_FILES[2][1])), calls = parseCsv(lfRead(C_FILES[3][1]));
  const byKey = new Map(runs.filter((r) => r.system.startsWith('ccoding')).map((r) => [gkey(r), r]));
  const reviseP = new Set(phases.filter((r) => r.phase === 'revise').map(gkey)), reviseC = new Set(calls.filter((r) => r.phase === 'revise').map(gkey));
  const c19 = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^\| (C\d+\/\S+) \| (\S+) \| (true|false) \| (.*?) \| (.*?) \| (.*?) \| (CÓ|không) \| (CHẶN|không) \|$/);
    if (!m) continue;
    const k = m[1], run = byKey.get(k);
    if (!run) throw new Error(`Không ghép được ${k} với runs.csv`);
    const hp = Number(run.hidden_pass), ht = Number(run.hidden_total);
    if (!Number.isFinite(hp) || !Number.isFinite(ht) || ht <= 0) throw new Error(`Thiếu test ẩn: ${k}`);
    c19.push({ runId: k, hiddenFail: hp < ht, redFinal: /:đỏ/.test(m[5]), gate: m[8] === 'CHẶN', revise: reviseP.has(k), costUsd: Number(run.cost_usd), wallS: Number(run.wall_s) });
  }
  const { rows, hash } = loadSnapshot();
  const withPhase = rows.filter((r) => r.byPhase && Object.keys(r.byPhase).length);
  const snap = withPhase.filter((r) => Number.isFinite(r.details?.total) && Number.isFinite(r.details?.passed))
    .map((r) => ({ runId: r.key, hiddenFail: r.details.passed < r.details.total, revise: (r.byPhase.revise ?? 0) > 0 }));
  GATE = { c19, snap, nRows: rows.length, snapHash: hash, noPhase: rows.length - withPhase.length, phaseNoTest: withPhase.length - snap.length, reviseOnlyP: [...reviseP].filter((k) => !reviseC.has(k)).length, reviseOnlyC: [...reviseC].filter((k) => !reviseP.has(k)).length, nCcodingRuns: byKey.size, nPhaseRuns: new Set(phases.slice(0).filter((r) => r.run).map(gkey)).size };
  return GATE;
}

/** Clopper–Pearson 95 % hai phía (chia đôi trên phân phối nhị thức; trùng b02m-replay.mjs). */
export function clopperPearson(x, n, alpha = 0.05) {
  const lf = [0]; for (let i = 1; i <= n; i++) lf[i] = lf[i - 1] + Math.log(i);
  const cdf = (k, p) => { let s = 0; for (let i = 0; i <= k; i++) s += Math.exp(lf[n] - lf[i] - lf[n - i] + (i ? i * Math.log(p) : 0) + (n - i ? (n - i) * Math.log(1 - p) : 0)); return Math.min(1, s); };
  const bis = (f) => { let lo = 0, hi = 1; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m)) lo = m; else hi = m; } return (lo + hi) / 2; };
  if (n === 0) return [NaN, NaN];
  return [x === 0 ? 0 : bis((p) => 1 - cdf(x - 1, p) < alpha / 2), x === n ? 1 : bis((p) => cdf(x, p) > alpha / 2)];
}
/** Số dương thật nhỏ nhất để nửa độ rộng CP ≤ h khi recall kỳ vọng r (x = làm tròn r·n; yêu cầu giữ cho 10 giá trị n kế tiếp). */
export function minPositives(r, h = 0.15) {
  const ok = (n) => { const [lo, hi] = clopperPearson(Math.round(r * n), n); return (hi - lo) / 2 <= h; };
  for (let n = 2; n <= 400; n++) if (Array.from({ length: 11 }, (_, i) => n + i).every(ok)) return n;
  return NaN;
}

function gateRow(label, pairs) {
  const r = report(pairs, { positive: '1' }), low = r.nPositive < MIN_POS;
  const unest = `chưa ước lượng được (${r.nPositive} dương thật < ${MIN_POS})`;
  return { r, row: [label, String(r.n), String(r.nPositive), String(r.nPred[1]), `${r.tp}/${r.fn}/${r.fp}/${r.tn}`, cell(r.accuracy, r.ci.accuracy), cell(r.precision, r.ci.precision), low ? unest : cell(r.recall, r.ci.recall), low ? 'chưa tính (suy từ recall)' : cell(r.f1, r.ci.f1), cell(r.kappa, r.ci.kappa), cell(r.pabak, r.ci.pabak), vn(r.prevalence, 2)] };
}
const GATE_HEAD = ['Cổng ↔ nhãn lỗi thật', 'n lượt', 'Dương thật', 'Dự đoán dương', 'TP/FN/FP/TN', 'Accuracy', 'Precision', 'Recall', 'F1', 'κ', 'PABAK', 'Prevalence'];
const pairsOf = (rows, pf, tf) => rows.map((x) => ({ ref: tf(x) ? '1' : '0', pred: pf(x) ? '1' : '0', runId: x.runId }));

async function gateTables() {
  const D = gateData(), T = {};
  const hdr = D.c19.length;
  T['C-0'] = tbl(['Mục', 'Giá trị'], [
    ...C_FILES.map(([name, , h]) => [`sha256 (đã chuẩn hóa LF) \`${name}\``, `\`${h}\``]),
    ['sha256 ảnh chụp 276 dòng (`git show 838a5f1:…/runs.jsonl`)', `\`${D.snapHash}\``],
    ['C1–C9: lượt CCoding ghép được giữa `b02m-replay.md` và `runs.csv` (có test ẩn)', `${hdr}/${D.nCcodingRuns}`],
    ['C1–C9: lượt có pha `revise` ở `phases.csv`; ở `calls.csv` không khớp (hai chiều)', `${D.c19.filter((x) => x.revise).length}; ${D.reviseOnlyP}/${D.reviseOnlyC}`],
    ['Ảnh chụp: số dòng', String(D.nRows)],
    ['Ảnh chụp, loại: không có `byPhase` (không đi qua pha điều phối, không có cổng)', String(D.noPhase)],
    ['Ảnh chụp, loại: có `byPhase` nhưng không có test ẩn (bài tài liệu/checklist)', String(D.phaseNoTest)],
    ['**Ảnh chụp, giữ lại: có `byPhase` và test ẩn**', `**${D.snap.length}**`],
  ]) + `\n\nPhân vùng ảnh chụp: ${D.noPhase} + ${D.phaseNoTest} + ${D.snap.length} = ${D.noPhase + D.phaseNoTest + D.snap.length} dòng. Khóa lượt (\`runId\`) chứa tên arm nên chỉ dùng nội bộ cho bootstrap, không in. Không đọc dòng nào sau ảnh chụp; C1–C9 có trước ảnh chụp. B-10 và CTO không có trường ghi quyết định ở nguồn nào nên **không đo được** (xem định nghĩa ở trên).`;

  const a = [
    gateRow('B-02 chặn ↔ lỗi thật (test ẩn < 100 % hoặc lệnh còn đỏ)', pairsOf(D.c19, (x) => x.gate, (x) => x.hiddenFail || x.redFinal)),
    gateRow('B-02 chặn ↔ chỉ test ẩn < 100 % (biến thể độc lập)', pairsOf(D.c19, (x) => x.gate, (x) => x.hiddenFail)),
    gateRow('vòng sửa ↔ lỗi thật (test ẩn < 100 % hoặc lệnh còn đỏ)', pairsOf(D.c19, (x) => x.revise, (x) => x.hiddenFail || x.redFinal)),
    gateRow('vòng sửa ↔ chỉ test ẩn < 100 %', pairsOf(D.c19, (x) => x.revise, (x) => x.hiddenFail)),
  ];
  const warn = (rs) => { const m = new Map(); for (const { r, row } of rs) for (const w of r.warnings) m.set(w, [...(m.get(w) ?? []), row[0]]); return [...m].map(([w, ls]) => `⚠ ${ls.join('; ')}: ${w}`).join('\n\n'); };
  T['C-1'] = `Lớp dương = lượt lỗi. Mỗi lượt một lần cổng quyết định, nên "một cặp mỗi lượt" trùng phân tích chính. CI 95 % bootstrap theo lượt, B = ${BOOT}, seed ${SEED}. Recall và F1 chỉ in khi ≥ ${MIN_POS} lượt dương thật. Nhãn "lệnh còn đỏ" và quyết định B-02 cùng đọc \`projectChecks.latest\` (không độc lập), nên dòng 2 và 4 dùng nhãn chỉ-test-ẩn.\n\n` +
    tbl(GATE_HEAD, a.map((x) => x.row)) + '\n\n' + warn(a);

  const b = [gateRow('vòng sửa (`byPhase.revise`) ↔ test ẩn < 100 %', pairsOf(D.snap, (x) => x.revise, (x) => x.hiddenFail))];
  T['C-2'] = `Chỉ nhãn test ẩn (ảnh chụp không có trạng thái lệnh kiểm tra). "Vòng sửa" là đại diện: không phân biệt vòng sửa do cổng, reviewer hay CTO kích hoạt. Cùng cách đọc như C-1.\n\n` + tbl(GATE_HEAD, b.map((x) => x.row)) + '\n\n' + warn(b);

  const rows3 = [];
  for (const rec of [0.6, 0.8, 0.9]) {
    const np = minPositives(rec);
    for (const [m, rho] of [[1, 0], [3, 0.3], [5, 0.5]]) {
      const deff = 1 + (m - 1) * rho, nd = Math.ceil(np * deff);
      rows3.push([vn(rec, 1), String(np), `${m}; ${vn(rho, 1)}`, vn(deff, 2), String(nd), ...[1, 0.7, 0.5].map((q) => String(Math.ceil(nd / (m * q))))]);
    }
  }
  const meanCost = D.c19.reduce((s, x) => s + x.costUsd, 0) / D.c19.length, meanWall = D.c19.reduce((s, x) => s + x.wallS, 0) / D.c19.length;
  T['C-3'] = `Mục tiêu: nửa độ rộng CI 95 % của recall ≤ 0,15, tính bằng Clopper–Pearson chính xác (x = làm tròn r·n; n nhỏ nhất mà điều kiện đúng cho cả 10 giá trị n kế tiếp). **Mọi giá trị r, ρ, q dưới đây là giả định**, không ước lượng được từ dữ liệu hiện có (quá ít dương thật). Cột: r = recall kỳ vọng; "dương cần" = số quyết định dương thật nếu các quyết định độc lập; m = số lỗi cài trong một lượt; ρ = hệ số tương quan nội cụm giữa các quyết định cùng lượt; hệ số thiết kế DEFF = 1 + (m − 1)·ρ; "quyết định cần" = ⌈dương cần × DEFF⌉; lượt cần = ⌈quyết định cần / (m·q)⌉ với q = xác suất một lỗi cài sẵn còn nguyên đến cổng (agent không tự sửa trước). Với m = 1 mỗi lượt một quyết định nên DEFF = 1 và bootstrap theo lượt trùng bootstrap theo mục.\n\n` +
    tbl(['r', 'Dương cần (độc lập)', 'm; ρ', 'DEFF', 'Quyết định cần', 'Lượt cần, q = 1,0', 'q = 0,7', 'q = 0,5'], rows3) +
    `\n\nĐơn giá tham chiếu (C1–C9, ${D.c19.length} lượt CCoding): trung bình ${vn(meanCost, 2)} USD và ${vn(meanWall, 0)} giây mỗi lượt (\`runs.csv\`, \`cost_usd\`, \`wall_s\`); chỉ để ước cỡ chi phí của B-12, không phải đo đạc cho đề xuất đó.`;
  return T;
}

// ───────────────────────── κ MAST: hai người gán nhãn C-01…C-49 (hạng mục S5) ─────────────────────────
const FM_CODES = ['FM-1.1', 'FM-1.2', 'FM-1.3', 'FM-1.4', 'FM-1.5', 'FM-2.1', 'FM-2.2', 'FM-2.3', 'FM-2.4', 'FM-2.5', 'FM-2.6', 'FM-3.1', 'FM-3.2', 'FM-3.3'];
const VALID = new Set([...FM_CODES, 'INF', 'NA']);
const grp = (l) => (l.startsWith('FM-') ? l.slice(0, 4) : l);
const ids49 = Array.from({ length: 49 }, (_, i) => `C-${String(i + 1).padStart(2, '0')}`);
const MAST_A = path.join(HERE, 'mast-labels-A.csv'), MAST_B = path.join(HERE, 'mast-labels-B.csv'), MAST_F = path.join(HERE, 'mast-labels-final.csv'), MAST_CB = path.join(HERE, 'mast-codebook.md');
const CHALLENGES = path.join(HERE, '..', 'challenges.md');

function loadLabels(file, col = 'fm') {
  const rows = parseCsv(lfRead(file)), m = new Map();
  for (const r of rows) {
    if (m.has(r.id)) throw new Error(`${path.basename(file)}: trùng ${r.id}`);
    if (!VALID.has(r[col])) throw new Error(`${path.basename(file)}: nhãn không hợp lệ ở ${r.id}: ${r[col]}`);
    m.set(r.id, r[col]);
  }
  for (const id of ids49) if (!m.has(id)) throw new Error(`${path.basename(file)}: thiếu ${id}`);
  if (m.size !== 49) throw new Error(`${path.basename(file)}: ${m.size} nhãn, cần 49`);
  return m;
}
const gitOut = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const gitFirst = (rel) => { const l = gitOut('log', '--diff-filter=A', '--format=%H%x09%aI%x09%P', '--', rel).split('\n').filter(Boolean); if (!l.length) throw new Error(`Chưa có commit thêm ${rel}`); const [h, t, p] = l[l.length - 1].split('\t'); return { h, t, p: p.split(' ')[0] }; };
const isAnc = (a, b) => { try { execFileSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: ROOT }); return true; } catch { return false; } };
const pairsLab = (A, B, filter = () => true) => ids49.filter((id) => filter(A.get(id), B.get(id))).map((id) => ({ ref: A.get(id), pred: B.get(id) }));

async function mastTables() {
  const A = loadLabels(MAST_A), B = loadLabels(MAST_B), F = loadLabels(MAST_F), T = {};
  const REL = 'docs/research/analysis/';
  const cb = gitFirst(`${REL}mast-codebook.md`), ca = gitFirst(`${REL}mast-labels-A.csv`), cbB = gitFirst(`${REL}mast-labels-B.csv`);
  const s7 = (h) => h.slice(0, 7), hhmm = (t) => t.replace('T', ' ').replace(/\+07:00$/, ' (UTC+7)');
  const order = [['mast-codebook.md', cb], ['mast-labels-B.csv', cbB], ['mast-labels-A.csv', ca]].sort((x, y) => Date.parse(x[1].t) - Date.parse(y[1].t) || (x[0] === 'mast-codebook.md' ? -1 : 1));
  const ancYes = (x, y) => (isAnc(x, y) ? 'có' : 'không');
  T['M-0'] = tbl(['Tệp', 'Commit thêm tệp', 'Thời điểm commit (author date)', 'Commit cha', 'sha256 (LF)'], [
    ['`mast-codebook.md`', `\`${cb.h}\``, hhmm(cb.t), `\`${s7(cb.p)}\``, `\`${lfSha(MAST_CB)}\``],
    ['`mast-labels-B.csv` (S4, research-lead)', `\`${cbB.h}\``, hhmm(cbB.t), `\`${s7(cbB.p)}\``, `\`${lfSha(MAST_B)}\``],
    ['`mast-labels-A.csv` (S3, methodologist)', `\`${ca.h}\``, hhmm(ca.t), `\`${s7(ca.p)}\``, `\`${lfSha(MAST_A)}\``],
  ]) + `\n\nKiểm bằng \`git log --diff-filter=A --format=%H%x09%aI%x09%P -- <tệp>\` và \`git merge-base --is-ancestor\`. Thứ tự commit: ${order.map((o) => o[0]).join(' → ')}. Sổ mã là tổ tiên của commit B: ${ancYes(cb.h, cbB.h)}; của commit A: ${ancYes(cb.h, ca.h)}. **Commit B là tổ tiên của commit A: ${ancYes(cbB.h, ca.h)}; commit A là tổ tiên của commit B: ${ancYes(ca.h, cbB.h)}.** Cha của commit A (\`${s7(ca.p)}\`) có chứa commit B: ${ancYes(cbB.h, ca.p)}; cha của commit B (\`${s7(cbB.p)}\`) có chứa commit A: ${ancYes(ca.h, cbB.p)}. Hai nhánh làm việc tách từ cùng bản có sổ mã và không thấy tệp của nhau trong lịch sử git. Thời điểm commit là lúc CCoding bàn giao hạng mục, **không phải** lúc gán nhãn; dòng comment đầu mỗi tệp chỉ ghi ngày 3/11/2026. Git không chứng minh được việc không bàn nhãn ngoài lịch sử (xem giới hạn).`;

  const lvl = [
    ['1. Chi tiết: 14 FM + INF + NA (16 nhãn khả dĩ)', pairsLab(A, B)],
    ['1b. Chỉ cặp mà cả hai gán FM (14 nhãn khả dĩ)', pairsLab(A, B, (a, b) => a.startsWith('FM-') && b.startsWith('FM-'))],
    ['2. Nhóm: FM-1, FM-2, FM-3, INF, NA (5 lớp)', pairsLab(A, B).map((p) => ({ ref: grp(p.ref), pred: grp(p.pred) }))],
    ['3. Nhóm, bỏ cặp có NA ở một bên: FM-1, FM-2, FM-3, INF', pairsLab(A, B, (a, b) => a !== 'NA' && b !== 'NA').map((p) => ({ ref: grp(p.ref), pred: grp(p.pred) }))],
  ];
  const rowsM = [], warnM = [];
  for (const [name, pairs] of lvl) {
    const r = report(pairs, { B: BOOT, seed: SEED });
    rowsM.push([name, String(r.n), String(r.k), cell(r.accuracy, r.ci.accuracy), vn(r.precision, 3), vn(r.recall, 3), cell(r.f1, r.ci.f1), cell(r.kappa, r.ci.kappa), cell(r.pabak, r.ci.pabak), `${vn(r.prevalence, 2)} / ${vn(r.predRate, 2)}`]);
    r.warnings.forEach((w) => warnM.push(`⚠ ${name}: ${w}`));
  }
  const agreeD = ids49.filter((id) => A.get(id) === B.get(id)).length, agreeG = ids49.filter((id) => grp(A.get(id)) === grp(B.get(id))).length;
  T['M-1'] = `Ref = nhãn A, pred = nhãn B; mỗi C-xx một đơn vị (**không có cấu trúc lượt**: không có \`runId\`, bootstrap lấy lại từng C-xx), B = ${BOOT}, seed ${SEED}. "Lớp có mặt" = số nhãn xuất hiện ở A hoặc B; k này cũng dùng cho PABAK và được giữ cố định khi lấy lại mẫu. Precision, Recall là macro (không trọng số lớp, lớp vắng tính 0), F1 là macro-F1; Accuracy, κ, PABAK đối xứng giữa A và B. "Lớp lớn nhất" = tỉ lệ lớp đông nhất ở A / ở B. Mẫu 49 với nhiều lớp thưa: CI rất rộng. Trùng nhãn chi tiết ${agreeD}/49, trùng nhóm ${agreeG}/49 (độ khớp giữa hai người gán, không phải độ đúng).\n\n` +
    tbl(['Mức', 'n', 'Lớp có mặt', 'Accuracy', 'Precision (macro)', 'Recall (macro)', 'macro-F1', 'κ', 'PABAK', 'Lớp lớn nhất A / B'], rowsM) + (warnM.length ? '\n\n' + warnM.join('\n\n') : '\n\nKhông có cảnh báo nghịch lý κ (không lớp nào > 0,9).');

  const G5 = ['FM-1', 'FM-2', 'FM-3', 'INF', 'NA'], cnt = (x, y) => ids49.filter((id) => grp(A.get(id)) === x && grp(B.get(id)) === y).length;
  const offD = ids49.filter((id) => grp(A.get(id)) !== grp(B.get(id))).length, naD = ids49.filter((id) => grp(A.get(id)) !== grp(B.get(id)) && (A.get(id) === 'NA' || B.get(id) === 'NA')).length;
  T['M-2'] = tbl(['A \\ B', ...G5, 'Tổng A'], [...G5.map((x) => [`**${x}**`, ...G5.map((y) => String(cnt(x, y))), String(G5.reduce((s, y) => s + cnt(x, y), 0))]), ['**Tổng B**', ...G5.map((y) => String(G5.reduce((s, x) => s + cnt(x, y), 0))), '49']]) +
    `\n\nLệch nhóm: ${offD}/49 C-xx, trong đó ${naD} có NA ở một bên. Không thể nói bên nào "đúng" khi chưa có chuẩn vàng.`;

  const dis = ids49.filter((id) => A.get(id) !== B.get(id)), eqA = dis.filter((id) => F.get(id) === A.get(id)).length, eqB = dis.filter((id) => F.get(id) === B.get(id)).length, neither = dis.length - eqA - eqB;
  const fcnt = (g) => ids49.filter((id) => grp(F.get(id)) === g).length;
  T['M-3'] = tbl(['Mục', 'Giá trị'], [
    ['Số C-xx lệch nhãn chi tiết giữa A và B', String(dis.length)],
    ['Nhãn cuối trùng A (trong số lệch)', String(eqA)],
    ['Nhãn cuối trùng B (trong số lệch)', String(eqB)],
    ['Nhãn cuối khác cả A và B', String(neither)],
    ['Số C-xx trùng A và B mà nhãn cuối khác (phải bằng 0)', String(ids49.filter((id) => A.get(id) === B.get(id) && F.get(id) !== A.get(id)).length)],
    ['Phân bố nhóm của nhãn cuối: FM-1 / FM-2 / FM-3 / INF / NA', G5.map(fcnt).join(' / ')],
    ['sha256 `mast-labels-final.csv` (LF)', `\`${lfSha(MAST_F)}\``],
  ]) + `\n\nKiểm \`mast-labels-final.csv\`: 49 dòng, mỗi dòng một nhãn hợp lệ, cột \`fm_A\`, \`fm_B\` trùng hai tệp gốc. Phân xử bởi một người (data-scientist, vai người thứ ba), **không độc lập với việc đọc cả hai nhãn**; đây không phải đo độ tin cậy, chỉ là chốt nhãn để dùng ở \`challenges.md\`.`;
  const fA = loadLabels(MAST_F, 'fm_A'), fB = loadLabels(MAST_F, 'fm_B');
  for (const id of ids49) if (fA.get(id) !== A.get(id) || fB.get(id) !== B.get(id)) throw new Error(`mast-labels-final.csv: cột fm_A/fm_B lệch tệp gốc ở ${id}`);

  // M-4: nhóm theo khoảng mã trong challenges.md (cách gán gốc của một tác giả) so với nhóm cuối
  const orig = (id) => { const n = Number(id.slice(2)); return n <= 14 ? 'FM-1' : n <= 23 ? 'FM-2' : n <= 32 ? 'FM-3' : 'INF'; };
  const ch = lfRead(CHALLENGES);
  for (const [lo, hi, g] of [[1, 14, 'FM-1'], [15, 23, 'FM-2'], [24, 32, 'FM-3'], [33, 49, 'INF']]) for (let n = lo; n <= hi; n++) if (!ch.includes(`| C-${String(n).padStart(2, '0')} |`)) throw new Error(`challenges.md thiếu C-${n} (${g})`);
  const O4 = ['FM-1', 'FM-2', 'FM-3', 'INF'];
  const oc = (x, y) => ids49.filter((id) => orig(id) === x && grp(F.get(id)) === y).length;
  const pO = ids49.map((id) => ({ ref: orig(id), pred: grp(F.get(id)) }));
  const mO = metrics(pO);
  T['M-4'] = tbl(['Nhóm gốc \\ nhóm cuối', ...G5, 'Tổng'], [...O4.map((x) => [`**${x}** (${{ 'FM-1': 'C-01…C-14', 'FM-2': 'C-15…C-23', 'FM-3': 'C-24…C-32', INF: 'C-33…C-49' }[x]})`, ...G5.map((y) => String(oc(x, y))), String(G5.reduce((s, y) => s + oc(x, y), 0))])]) +
    `\n\nNhóm gốc = tiêu đề mục 1.1–1.4 của \`challenges.md\` (một tác giả gán, trước khi có sổ mã). Trùng nhóm cuối: ${pO.filter((p) => p.ref === p.pred).length}/49. Khớp thô ${vn(mO.accuracy)} và κ = ${vn(mO.kappa)} (nhóm cuối có thêm lớp NA mà nhóm gốc không có nên κ chỉ mang tính mô tả; **nhóm cuối do chính người phân xử chốt**, không độc lập với nhóm gốc).`;
  return T;
}

// ───────────────────────── CLI ─────────────────────────
const render = (T, id) => `### ${TITLES[id]}\n\n${T[id]}\n`;
async function main() {
  const args = process.argv.slice(2), opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes('--pairs')) {
    const rows = parseCsv(fs.readFileSync(opt('--pairs'), 'utf8')).map((r) => ({ ref: r.ref, pred: r.pred, runId: r.runId || undefined }));
    const o = { B: Number(opt('--boot') ?? BOOT), seed: Number(opt('--seed') ?? SEED) };
    if (opt('--positive') !== undefined) o.positive = opt('--positive');
    console.log(formatReport(report(rows, o), `Độ khớp ${rows.length} cặp`)); return;
  }
  if (args.includes('--make-gold')) {
    const G = await goldBuild();
    fs.writeFileSync(GS, G.sheet); fs.writeFileSync(GK, G.key);
    console.log(`Đã ghi ${GS} và ${GK} (${G.rows.length} mục, seed ${SEED}).`); return;
  }
  if (args.includes('--gold-score')) { goldScore(); return; }
  const T = await buildTables();
  if (args.includes('--fill')) { // thay dòng {{ID}} (một mình trên dòng) bằng bảng sinh từ script
    const f = path.resolve(opt('--fill')), raw = fs.readFileSync(f, 'utf8'), crlf = raw.includes('\r\n'), doc = raw.replace(/\r\n/g, '\n');
    const out = doc.replace(/\{\{([A-Z]-\d)\}\}\n/g, (_, id) => { if (!T[id]) throw new Error(`Bảng không tồn tại: ${id}`); return render(T, id); });
    fs.writeFileSync(f, crlf ? out.replace(/\n/g, '\r\n') : out); // giữ kiểu xuống dòng của tệp
    console.log(`Đã điền bảng vào ${f}`); return;
  }
  const ck = args.indexOf('--check');
  if (ck >= 0) {
    const doc = fs.readFileSync(path.resolve(args[ck + 1]), 'utf8').replace(/\r\n/g, '\n');
    const miss = IDS.filter((id) => !doc.includes(render(T, id)));
    if (miss.length) { console.error(`LỆCH: bảng không trùng đầu ra script: ${miss.join(', ')}`); process.exit(1); }
    const G = await goldBuild();
    if (!fs.existsSync(GS) || !fs.existsSync(GK)) { console.error('LỆCH: thiếu gold-sheet.csv hoặc gold-key.csv'); process.exit(1); }
    if (blankCols(fs.readFileSync(GS, 'utf8')) !== blankCols(G.sheet)) { console.error('LỆCH: gold-sheet.csv (các cột trừ nhãn) không khớp bản sinh lại'); process.exit(1); }
    if (fs.readFileSync(GK, 'utf8').replace(/\r\n/g, '\n') !== G.key) { console.error('LỆCH: gold-key.csv không khớp bản sinh lại'); process.exit(1); }
    console.log(`OK: ${IDS.length} bảng trong ${args[ck + 1]} trùng đầu ra script; hash ảnh chụp khớp; gold-sheet.csv và gold-key.csv khớp bản sinh lại.`);
  } else if (args.includes('--table')) {
    const id = opt('--table');
    if (!T[id]) { console.error(`Bảng không tồn tại: ${id} (có: ${IDS.join(', ')})`); process.exit(2); }
    process.stdout.write(render(T, id));
  } else for (const id of IDS) console.log(render(T, id));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
