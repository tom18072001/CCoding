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
  const pabak = k > 1 ? (k * po - 1) / (k - 1) : NaN;
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
    Object.assign(out, { precision: mean('precision'), recall: mean('recall'), f1: mean('f1'), macroF1: mean('f1'), prevalence: n ? Math.max(...rowT) / n : NaN, predRate: NaN });
  }
  out.warnings = [];
  const extreme = (x) => x > PREV_HI || x < PREV_LO;
  if (n > 0 && (extreme(out.prevalence) || (binary && extreme(out.predRate)))) {
    const where = binary ? `prevalence (tham chiếu) = ${vn(out.prevalence)}, tỉ lệ dương dự đoán = ${vn(out.predRate)}` : `lớp lớn nhất chiếm ${vn(out.prevalence)} tham chiếu`;
    out.warnings.push(`NGHỊCH LÝ κ: ${where} nằm ngoài [${vn(PREV_LO, 1)}; ${vn(PREV_HI, 1)}], hầu hết ô chạm trần; κ = ${vn(kappa)} có thể thấp dù khớp thô = ${vn(po)}. Đọc kèm PABAK = ${vn(pabak)} (không phụ thuộc phân bố lớp).`);
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
  for (const key of keys) ci[key] = bootstrapCI(pairs, (s) => metrics(s, { ...opts, positive: base.binary ? base.positive : undefined })[key], opts);
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
