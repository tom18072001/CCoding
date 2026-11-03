#!/usr/bin/env node
// B-19 / S2a — Khóa hash bộ bài giữ lại (D6) rồi tính cỡ mẫu A/B của vòng tự cải thiện RQ5. Node >= 22, không gói ngoài, offline.
// Chỉ ĐỌC bench/vs-claude/tasks/* và bench/vs-claude/results/study-cloud/runs.jsonl. Không chạy benchmark.
//
//   node docs/research/self-improvement/holdout-sample-size.mjs --hash                 # in bảng hash (bước 1, khóa vào holdout-lock.json TRƯỚC khi tính cỡ mẫu)
//   node docs/research/self-improvement/holdout-sample-size.mjs --size                 # kiểm hash khớp holdout-lock.json rồi in bảng cỡ mẫu (bước 2)
//   node docs/research/self-improvement/holdout-sample-size.mjs --check <tệp.md>       # mọi dòng bảng trong .md phải có trong đầu ra script (exit 1 nếu lệch)
//
// Công cụ dùng lại: classifyRows/sha256 (prereg-tests.mjs), requiredRuns/zInv (bench/vs-claude/harness/stats.mjs).
// Mô hình (design.md §5.3: log-tỉ số B/A theo bài, bài là khối, hợp nhất qua bài):
//   ℓ_t = TB ln(B) − TB ln(A) theo bài;  Var(TB_t ℓ_t) = τ²/T + 2σ²_w/(T·r)
//   σ²_w = phương sai giữa lượt TRONG bài của MỘT nhánh (gộp ΣSS/Σ(n−1)); τ² = phương sai bản vá × bài (KHÔNG có số đo, là kịch bản).
//   Mốc: SE ≤ Δ / (z_{1−α/2} + z_{1−β}). τ² = 0 dùng requiredRuns() của stats.mjs (n mỗi nhánh gộp qua bài, r = ⌈n/T⌉); τ² > 0 dùng công thức đóng ở trên.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRows, windowOf, sha256, mean } from '../analysis/prereg-tests.mjs';
import { requiredRuns, zInv } from '../../../bench/vs-claude/harness/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const TASKS = path.join(ROOT, 'bench/vs-claude/tasks');
const RUNS = path.join(ROOT, 'bench/vs-claude/results/study-cloud/runs.jsonl');
const LOCK_FILE = path.join(HERE, 'holdout-lock.json');

// Bộ giữ lại (lý do chọn/loại: holdout-and-sample-size.md §1). Thứ tự cố định.
const HOLDOUT = ['c1-iis-ecs', 'c2-burst-alert', 'c3-shop-bugs', 'c4-audit-chain', 'c5-tickets-api', 'l1-oncall', 'l2-knights', 'l3-reconcile', 'l4-startup-order', 's1-sec-review'];
const EXCLUDED_CAND = ['a1-ambiguous-spec', 'r1-elk-design', 're1-lit-synthesis'];

// Giả định (D5) — không phải số đo
const ALPHA = 0.05, POWER = 0.8, HOLM_K = 3;

// ---------- hash ----------
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}
function treeHash(dir) {
  const lines = walk(dir).map((p) => `${path.relative(dir, p).split(path.sep).join('/')}\t${sha256(fs.readFileSync(p))}`);
  return { files: lines.length, sha: sha256(Buffer.from(lines.join('\n') + '\n')) };
}
function hashTable() {
  return [...HOLDOUT, ...EXCLUDED_CAND].map((t) => {
    const h = treeHash(path.join(TASKS, t, 'hidden'));
    return { task: t, taskJson: sha256(fs.readFileSync(path.join(TASKS, t, 'task.json'))), hiddenFiles: h.files, hiddenSha: h.sha, inSet: HOLDOUT.includes(t) };
  });
}

// ---------- định dạng ----------
const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : 'n/a');
const tbl = (head, body) => [`| ${head.join(' | ')} |`, `| ${head.map((h, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`, ...body.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const sum = (a) => a.reduce((s, x) => s + x, 0);

// ---------- dữ liệu phương sai ----------
const rows = fs.readFileSync(RUNS, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const done = classifyRows(rows).kept.filter((r) => r.status === 'done');
const val = { tok: (r) => Math.log(r.tokens.weighted), wall: (r) => Math.log(r.wallSec), score: (r) => r.score };
function pooled(arms, tasks, m) {
  let ss = 0, df = 0, n = 0;
  for (const t of tasks) for (const a of arms) {
    const v = done.filter((r) => r.task === t && r.arm === a).map(val[m]);
    n += v.length;
    if (v.length < 2) continue;
    const mu = mean(v); ss += sum(v.map((x) => (x - mu) ** 2)); df += v.length - 1;
  }
  return { s2: df > 0 ? ss / df : NaN, df, n };
}
const CCODING_ARMS = ['B0', 'B5', 'B6', 'B7', 'A1', 'A2'];

function hashSection() {
  return [
    tbl(['Bài', 'Trong bộ giữ lại', 'sha256 task.json', 'Số tệp ẩn', 'sha256 thư mục hidden/'],
      hashTable().map((x) => [x.task, x.inSet ? 'có' : 'không (loại, §1)', `\`${x.taskJson}\``, String(x.hiddenFiles), `\`${x.hiddenSha}\``])),
    '',
    'Quy ước: sha256 chuẩn hóa CRLF → LF (như `prereg-tests.mjs`); hash thư mục = sha256 của các dòng `đường dẫn tương đối<TAB>sha256 tệp` sắp theo tên, mỗi dòng kết thúc bằng LF.',
  ].join('\n');
}

function sizeSection() {
  const LOCK = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
  const now = Object.fromEntries(hashTable().map((x) => [x.task, x]));
  const bad = HOLDOUT.filter((t) => !LOCK[t] || now[t].taskJson !== LOCK[t].taskJson || now[t].hiddenSha !== LOCK[t].hiddenSha);
  if (bad.length) { console.error(`LỆCH HASH so với holdout-lock.json: ${bad.join(', ')} — dừng, không tính cỡ mẫu.`); process.exit(1); }
  const out = [];
  const T = HOLDOUT.length;

  const lin = {};
  for (const r of done.filter((x) => x.arm === 'B0' && HOLDOUT.includes(x.task))) {
    const x = (lin[windowOf(r)] ??= { n: 0, a: r.at, b: r.at, tok: 0, wall: 0 });
    x.n++; x.a = r.at < x.a ? r.at : x.a; x.b = r.at > x.b ? r.at : x.b; x.tok += r.tokens.weighted; x.wall += r.wallSec;
  }
  const nB0 = sum(Object.values(lin).map((x) => x.n)), tokB0 = sum(Object.values(lin).map((x) => x.tok)) / nB0, wallB0 = sum(Object.values(lin).map((x) => x.wall)) / nB0;
  out.push('### SS-0. Xuất xứ lượt B0 trên các bài giữ lại (cửa sổ chạy theo `WINDOWS` của prereg-tests.mjs)', '',
    tbl(['Cửa sổ', 'n lượt B0', 'từ', 'đến'], Object.entries(lin).map(([w, x]) => [w, String(x.n), x.a, x.b])), '',
    `Trung bình mỗi lượt B0: ${f(tokB0 / 1000, 1)} nghìn token quy đổi, ${f(wallB0, 1)} giây.`, '');
  const srcRows = [];
  for (const [label, arms] of [
    ['B0 (CCoding mặc định)', ['B0']],
    ['B7 (CCoding làn đơn)', ['B7']],
    ['mọi nhánh CCoding (B0,B5,B6,B7,A1,A2)', CCODING_ARMS],
    ['A0-sonnet (không CCoding; chỉ đối chiếu)', ['A0-sonnet']],
  ]) {
    const k = pooled(arms, HOLDOUT, 'tok'), w = pooled(arms, HOLDOUT, 'wall'), s = pooled(arms, HOLDOUT, 'score');
    srcRows.push([label, String(k.n), String(k.df), f(k.s2, 4), f(w.s2, 4), f(Math.sqrt(s.s2), 4)]);
  }
  out.push('### SS-1. Nguồn phương sai: σ²_w giữa lượt trong bài (gộp ΣSS/Σ(n−1)) trên các bài giữ lại', '',
    tbl(['Nhánh dữ liệu', 'n lượt done (kept)', 'bậc tự do', 'σ²_w ln(token quy đổi)', 'σ²_w ln(wallSec)', 'SD điểm (test ẩn)'], srcRows), '',
    'Dữ liệu: `bench/vs-claude/results/study-cloud/runs.jsonl`, bộ lọc `classifyRows().kept` ∩ `status = done` (giống `variance-decomposition.mjs`). Chỉ các bài giữ lại. Không lọc theo điểm.', '');

  const perTask = HOLDOUT.map((t) => {
    const b0 = done.filter((r) => r.task === t && r.arm === 'B0');
    return [t, String(b0.length), f(pooled(['B0'], [t], 'tok').s2, 4), f(pooled(['B0'], [t], 'wall').s2, 4), f(mean(b0.map((r) => r.score)), 3), f(Math.sqrt(pooled(CCODING_ARMS, [t], 'score').s2), 4)];
  });
  out.push('### SS-2. Theo bài (nhánh B0): n, σ²_w token, σ²_w wallSec, điểm TB; SD điểm theo mọi nhánh CCoding', '',
    tbl(['Bài', 'n (B0)', 'σ²_w token', 'σ²_w wallSec', 'điểm TB (B0)', 'SD điểm (mọi nhánh CCoding)'], perTask), '');

  const sTok = pooled(['B0'], HOLDOUT, 'tok').s2, sWall = pooled(['B0'], HOLDOUT, 'wall').s2;
  const sScore = pooled(CCODING_ARMS, HOLDOUT, 'score').s2;
  const sc = [['thấp (×0,5)', 0.5], ['vừa (dữ liệu B0)', 1], ['cao (×2)', 2]];
  const TAU2 = [0, 0.0005, 0.002, 0.01];
  const zA = (a) => zInv(1 - a / 2) + zInv(POWER);
  const need = (s2, delta, tau2, a) => {
    if (tau2 === 0) return Math.ceil(requiredRuns({ sigma: Math.sqrt(s2), delta, alpha: a, power: POWER }) / T);
    const d = T * (delta / zA(a)) ** 2 - tau2;
    return d > 0 ? Math.max(2, Math.ceil((2 * s2) / d)) : Infinity;
  };
  const cell = (r) => (Number.isFinite(r) ? String(r) : 'vô hạn');

  const metrics = [
    ['token: B/A thật 0,90, cần cận trên < 0,95', Math.log(0.95) - Math.log(0.90), sTok],
    ['token: B/A thật 0,85, cần cận trên < 0,95', Math.log(0.95) - Math.log(0.85), sTok],
    ['token (P4, không xấu đi): B/A thật 1,00, cận trên < 1,05', Math.log(1.05), sTok],
    ['wall-clock: B/A thật 1,00, cận trên < 1,05', Math.log(1.05), sWall],
  ];
  const body = [];
  for (const [name, d, s2] of metrics) for (const [aLab, a] of [['0,05', ALPHA], ['0,05/3 (Holm xấu nhất)', ALPHA / HOLM_K]]) for (const tau2 of TAU2)
    body.push([name, f(d, 4), aLab, f(tau2, 4), ...sc.map(([, k]) => cell(need(k * s2, d, tau2, a)))]);
  out.push(`### SS-3. Số lượt r mỗi nhánh mỗi bài, pha xác nhận (T = ${T} bài, power ${POWER}, hai phía)`.replace('0.8', '0,8'), '',
    tbl(['Chỉ số và giả định hiệu ứng', 'Δ (thang ln)', 'α', 'τ²', ...sc.map(([l]) => `r, σ² ${l}`)], body), '',
    'Δ = khoảng cách giữa hiệu ứng thật giả định và ngưỡng. r = ⌈n/T⌉ với n = `requiredRuns({sigma, delta, alpha, power})` khi τ² = 0; τ² > 0 theo công thức đóng ở đầu script (không phải `stats.mjs`). "vô hạn" = τ²/T lớn hơn SE mục tiêu: thêm lượt không giúp, phải thêm bài.', '');

  const sbody = [];
  for (const [aLab, a] of [['0,05', ALPHA], ['0,05/3 (Holm xấu nhất)', ALPHA / HOLM_K]])
    for (const [k, lab] of [[0.5, 'SD ×0,5'], [1, 'SD đo được'], [2, 'SD ×2']])
      sbody.push([aLab, lab, f(k * Math.sqrt(sScore), 4), ...[0, 0.0001, 0.0004].map((tau2) => cell(need(k * k * sScore, 0.02, tau2, a)))]);
  out.push('### SS-4. An toàn (test ẩn đạt, biên không thua kém −2 điểm phần trăm; hiệu ứng thật giả định 0)', '',
    tbl(['α', 'Kịch bản SD điểm', 'SD điểm', 'r (τ² = 0)', 'r (τ² = 0,0001; SD hiệu theo bài ≈ 1 pp)', 'r (τ² = 0,0004; ≈ 2 pp)'], sbody), '',
    'SD gộp theo mọi nhánh CCoding vì B0 một mình gần như luôn đạt trần. Điểm gần trần làm SD nhỏ: r thấp ở đây phản ánh trần, không phải phép đo nhạy.', '');

  const mde = (s2, r, a) => Math.sqrt((2 * s2) / (T * r)) * zA(a);
  const mrows = [];
  for (const r of [2, 3, 4]) for (const [name, s2] of [['token', sTok], ['wallSec', sWall]])
    mrows.push([String(r), name, String(T * r), ...sc.map(([, k]) => `×${f(Math.exp(mde(k * s2, r, ALPHA)), 3)}`)]);
  out.push(`### SS-5. Pha sàng lọc: tỉ số B/A nhỏ nhất phát hiện được (power 0,8, α = 0,05 hai phía, τ² = 0), T = ${T}`, '',
    tbl(['r mỗi nhánh mỗi bài', 'Chỉ số', 'Lượt mỗi nhánh', ...sc.map(([l]) => `B/A phát hiện được, σ² ${l}`)], mrows), '',
    'Sàng lọc chỉ để loại bản vá xấu rõ (D7, design.md §5.3). Đọc: B/A ≥ giá trị trong ô thì sàng lọc phát hiện với xác suất ≥ 0,8.', '');
  const tn = (s2, d, tau2, r, a) => Math.ceil((tau2 + (2 * s2) / r) / (d / zA(a)) ** 2);
  const trows = [];
  for (const [name, d, s2] of metrics) for (const [aLab, a] of [['0,05', ALPHA], ['0,05/3 (Holm xấu nhất)', ALPHA / HOLM_K]]) for (const tau2 of TAU2.slice(1))
    trows.push([name, aLab, f(tau2, 4), ...[6, 8].map((r) => String(tn(s2, d, tau2, r, a)))]);
  out.push('### SS-6. Số bài T cần khi τ² > 0 (σ² vừa, r cố định)', '',
    tbl(['Chỉ số và giả định hiệu ứng', 'α', 'τ²', 'T khi r = 6', 'T khi r = 8'], trows), '',
    'T = ⌈(τ² + 2σ²_w/r) / (Δ/(z_{1−α/2} + z_{1−β}))²⌉ (công thức đóng của script, không phải `stats.mjs`).', '');
  const crow = [];
  for (const [lab, r] of [['sàng lọc r = 3', 3], ['xác nhận r = 6', 6], ['xác nhận r = 8', 8], ['xác nhận r = 10', 10]]) {
    const n = 2 * T * r; crow.push([lab, String(n), f((n * tokB0) / 1e6, 1), f((n * wallB0) / 3600, 1)]);
  }
  out.push('### SS-7. Chi phí một bản vá (A và B, T bài), ước theo trung bình B0 ở SS-0', '',
    tbl(['Pha', 'Tổng lượt (2 nhánh)', 'Token quy đổi (triệu)', 'Giờ máy chạy tuần tự'], crow), '',
    'Ước thô: mỗi lượt A và B tốn như B0 trung bình; không tính lượt hỏng/xóa, nạp lại cache, thời gian chờ hạn mức 5 giờ.', '');
  return out.join('\n');
}

const arg = process.argv[2];
if (arg === '--hash') console.log(hashSection());
else if (arg === '--size') console.log(sizeSection());
else if (arg === '--check') {
  const md = fs.readFileSync(process.argv[3], 'utf8');
  const lines = [hashSection(), sizeSection()].join('\n').split('\n').filter((l) => l.startsWith('|'));
  const missing = lines.filter((l) => !md.includes(l));
  if (missing.length) { console.error(`Lệch: ${missing.length} dòng bảng không có trong ${process.argv[3]}.\n${missing[0]}`); process.exit(1); }
  console.log(`OK: ${lines.length} dòng bảng trong ${process.argv[3]} trùng đầu ra script.`);
} else { console.error('Dùng: --hash | --size | --check <tệp.md>'); process.exit(2); }
