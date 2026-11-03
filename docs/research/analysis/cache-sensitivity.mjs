#!/usr/bin/env node
// Cơ cấu chi phí, tỉ lệ trúng cache, độ nhạy hệ số cacheRead 0,05 và USD (vòng 4, gói 3, hạng mục S1).
// Node >= 22, không gói ngoài, offline. Dữ liệu CHỈ lấy từ ảnh chụp git 838a5f1 (đọc bằng `git show`, không đọc runs.jsonl hiện tại).
//
//   node docs/research/analysis/cache-sensitivity.mjs                       # in toàn bộ tài liệu ra stdout
//   node docs/research/analysis/cache-sensitivity.mjs --table C-3           # in một bảng
//   node docs/research/analysis/cache-sensitivity.mjs --check docs/research/analysis/cache-sensitivity.md
//        # mọi bảng trong .md phải trùng từng ký tự với đầu ra script (exit 1 nếu lệch)
//
// PHÂN TÍCH PHỤ, NGOÀI HỌ HOLM. Thước đo chính của dự án vẫn là weighted = input + 1,25·cacheWrite + 0,1·cacheRead + 5·out.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { median, gitBlob, sha256, bootstrapRatio } from './prereg-tests.mjs';
import { weighted } from '../../../bench/vs-claude/lib/claude.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SNAPSHOT = '838a5f1', SNAPSHOT_PATH = 'bench/vs-claude/results/study-cloud/runs.jsonl', EXPECT_LINES = 276;
const SCRIPT_VERSION = 'cache-sensitivity v1 (round 4, package 3, S1)';
const T15 = ['t1-duration', 't2-orders', 't3-api', 't4-perf', 't5-logq'];
const ARMS = ['A0-sonnet', 'B0', 'B6', 'B7'];

// Giá USD / triệu token. Lấy từ trang giá chính thức (WebFetch ngày 3/11/2026), cột "5m cache writes" và "Cache hits and refreshes".
// Chú thích 2 của trang: đọc cache của Opus 5.5 và Sonnet 5.5 = 0,05× giá đầu vào.
const PRICES = {
  sourceUrl: 'https://platform.claude.com/docs/en/about-claude/pricing', accessed: '2026-11-03', verified: true,
  models: {
    'Sonnet 5.5': { input: 2, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.1, output: 10 },
    'Opus 5.5': { input: 4, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2, output: 20 },
  },
};
const VF = PRICES.verified ? '' : ' [CHƯA KIỂM CHỨNG]';

// ---------- dữ liệu ----------
const raw = execFileSync('git', ['show', `${SNAPSHOT}:${SNAPSHOT_PATH}`], { cwd: ROOT, maxBuffer: 1 << 28 });
const lines = raw.toString('utf8').split('\n').filter((l) => l.trim());
if (lines.length !== EXPECT_LINES) { console.error(`DỪNG: ảnh chụp ${SNAPSHOT} có ${lines.length} dòng, kỳ vọng ${EXPECT_LINES}.`); process.exit(3); }
const rows = lines.map((l) => JSON.parse(l));
const done = rows.filter((r) => r.status === 'done');
const R = Object.fromEntries(ARMS.map((a) => [a, done.filter((r) => r.arm === a)]));

// ---------- định dạng + thống kê ----------
const nf = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }) : 'không đo được');
const k = (x) => (Number.isFinite(x) ? `${nf(x / 1000, 1)}k` : 'không đo được');
const pct = (x) => `${nf(x * 100, 1)} %`;
const ratio = (x) => `×${nf(x, 2)}`;
const usd = (x) => `$${nf(x, 2)}`;
const tbl = (head, body) => [`| ${head.join(' | ')} |`, `| ${head.map((h, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`, ...body.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const sum = (a) => a.reduce((s, x) => s + x, 0);
const quant = (a, p) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const wk = (t, crCoef = 0.1) => t.input + 1.25 * t.cacheWrite + crCoef * t.cacheRead + 5 * t.output;
const usdOf = (t, m, w1h = false) => (t.input * m.input + t.cacheWrite * (w1h ? m.cacheWrite1h : m.cacheWrite5m) + t.cacheRead * m.cacheRead + t.output * m.output) / 1e6;
const tot = (rs, c) => sum(rs.map((r) => r.tokens[c]));
const comps = (rs, crCoef = 0.1) => ({ input: tot(rs, 'input'), cacheWrite: 1.25 * tot(rs, 'cacheWrite'), cacheRead: crCoef * tot(rs, 'cacheRead'), output: 5 * tot(rs, 'output') });
const hit = (rs) => tot(rs, 'cacheRead') / (tot(rs, 'cacheRead') + tot(rs, 'cacheWrite') + tot(rs, 'input'));

const wMismatch = done.filter((r) => Math.abs(weighted(r.tokens) - r.tokens.weighted) > 1).length;
const T = {}, TITLES = {};
const sec = (id, title, body) => { TITLES[id] = title; T[id] = body; };

// ---------- C-0 nhận dạng ----------
const buf = Buffer.from(lines.join('\n') + '\n');
const modelVals = [...new Set(rows.map((r) => (r.model === undefined ? '(không có trường model)' : String(r.model))))];
sec('C-0', 'C-0. Nhận dạng dữ liệu', tbl(['Mục', 'Giá trị'], [
  ['Script', SCRIPT_VERSION],
  ['Ảnh chụp', `\`git show ${SNAPSHOT}:${SNAPSHOT_PATH}\``],
  ['Số dòng (kỳ vọng 276)', `${rows.length}`],
  ['Hash git (blob) của ảnh chụp', `\`${gitBlob(buf)}\``],
  ['sha256 (LF)', `\`${sha256(buf)}\``],
  ['Số lượt done theo arm', ARMS.map((a) => `${a} ${R[a].length}`).join('; ')],
  ['Lượt không done', `${rows.length - done.length}`],
  ['tokens.weighted ≠ weighted(tokens) (sai số > 1)', `${wMismatch} lượt`],
  ['Giá trị trường `model` trong ảnh chụp', modelVals.join('; ')],
  ['Số lượt có `costUsd` > 0', `${rows.filter((r) => r.costUsd > 0).length}`],
]));

// ---------- C-1 cơ cấu chi phí ----------
{
  const body = ARMS.map((a) => {
    const c = comps(R[a]), s = sum(Object.values(c)), w = R[a].map((r) => r.tokens.weighted);
    return [a, R[a].length, pct(c.input / s), pct(c.cacheWrite / s), pct(c.cacheRead / s), pct(c.output / s), k(sum(w)), k(median(w)), `${k(quant(w, 0.25))} – ${k(quant(w, 0.75))}`];
  });
  sec('C-1', 'C-1. Cơ cấu token có trọng số theo arm (gộp bài, mọi lượt done)',
    'Công thức chính (cacheRead ×0,1). Tỉ lệ = tổng thành phần có hệ số / tổng weighted của arm (gộp mọi lượt, nên bài nhiều token nặng hơn). Trung vị và IQR (Q1–Q3, nội suy tuyến tính) tính theo lượt. Mô tả, các arm có tập bài khác nhau.\n\n' +
    tbl(['Arm', 'Lượt', 'input', '1,25·cacheWrite', '0,1·cacheRead', '5·out', 'Tổng weighted', 'Trung vị/lượt', 'IQR/lượt'], body));
}

// ---------- C-2 tỉ lệ trúng cache ----------
{
  const body = ARMS.map((a) => {
    const rs = R[a], per = rs.map((r) => r.tokens.cacheRead / (r.tokens.cacheRead + r.tokens.cacheWrite + r.tokens.input));
    return [a, k(tot(rs, 'input')), k(tot(rs, 'cacheWrite')), k(tot(rs, 'cacheRead')), pct(hit(rs)), pct(median(per)), `${pct(quant(per, 0.25))} – ${pct(quant(per, 0.75))}`];
  });
  sec('C-2', 'C-2. Tỉ lệ trúng cache = cacheRead / (cacheRead + cacheWrite + input)',
    'Chỉ mô tả. "Gộp" = tỉ số của các tổng; "trung vị/lượt" tính trên tỉ lệ từng lượt. Không có ngưỡng đạt/không đạt.\n\n' +
    tbl(['Arm', 'Σ input', 'Σ cacheWrite', 'Σ cacheRead', 'Tỉ lệ trúng (gộp)', 'Trung vị/lượt', 'IQR/lượt'], body));
}

// ---------- C-3 đối chiếu 68 % ----------
{
  const share = (c) => { const s = sum(Object.values(c)); return [pct(c.cacheWrite / s), pct(c.cacheRead / s), pct((c.cacheWrite + c.cacheRead) / s), pct(c.output / s)]; };
  const usdComps = (rs, m) => ({ input: tot(rs, 'input') * m.input, cacheWrite: tot(rs, 'cacheWrite') * m.cacheWrite5m, cacheRead: tot(rs, 'cacheRead') * m.cacheRead, output: tot(rs, 'output') * m.output });
  const b15 = R.B7.filter((r) => T15.includes(r.task)), a15 = R['A0-sonnet'].filter((r) => T15.includes(r.task));
  const body = [];
  const add = (scope, den, c) => body.push([scope, den, ...share(c)]);
  add('B7, mọi bài (gộp lượt)', 'weighted 0,1', comps(R.B7));
  add('B7, mọi bài (gộp lượt)', `USD giá Sonnet 5.5${VF}`, usdComps(R.B7, PRICES.models['Sonnet 5.5']));
  add('B7, mọi bài (gộp lượt)', `USD giá Opus 5.5${VF}`, usdComps(R.B7, PRICES.models['Opus 5.5']));
  add('B7, t1–t5 (gộp lượt)', 'weighted 0,1', comps(b15));
  add('A0-sonnet, t1–t5 (gộp lượt)', 'weighted 0,1', comps(a15));
  // Cách T-4: mỗi bài, hệ số × (trung vị B7 − trung vị A0) theo thành phần, cộng trên bài.
  const d = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }, mult = { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 };
  for (const t of T15) for (const c of Object.keys(d)) d[c] += mult[c] * (median(b15.filter((r) => r.task === t).map((r) => r.tokens[c])) - median(a15.filter((r) => r.task === t).map((r) => r.tokens[c])));
  add('Phần chênh B7 − A0, t1–t5 (cách T-4: trung vị theo bài)', 'weighted 0,1', d);
  for (const a of ['B0', 'B6']) add(`${a}, mọi bài (gộp lượt)`, 'weighted 0,1', comps(R[a]));
  const sonnet = PRICES.models['Sonnet 5.5'];
  const perRun = 'Phân bố theo từng lượt của tỉ trọng cacheWrite trong USD (giá Sonnet 5.5; cùng tỉ lệ ở giá Opus 5.5 vì mọi thành phần Opus đúng 2× Sonnet). Tài liệu chỉ có 1 lượt chạy thật, nên câu hỏi là 68 % nằm ở đâu trong phân bố này:\n\n' +
    tbl(['Arm', 'Lượt', 'Trung vị', 'P90', 'Max', 'Số lượt ≥ 68 %'], ARMS.map((a) => { const v = R[a].map((r) => r.tokens.cacheWrite * sonnet.cacheWrite5m / (usdOf(r.tokens, sonnet) * 1e6)); return [a, v.length, pct(median(v)), pct(quant(v, 0.9)), pct(Math.max(...v)), v.filter((x) => x >= 0.68).length]; }));
  sec('C-3', 'C-3. Đối chiếu con số "ghi cache ≈ 68 % chi phí" của tài liệu với T-4',
    'Cùng một dữ liệu, mẫu số khác nhau cho phần trăm khác nhau. Tài liệu: 1 nhiệm vụ chạy thật, 5 lượt, tổng chi phí (không nêu bảng giá hay hệ số), "ghi cache" hiểu là cacheWrite. T-4 (b7-cost-decomposition.md): phần CHÊNH B7 − A0 trên t1–t5, mẫu số là Δ weighted. Dòng "Phần chênh" ở đây tính lại T-4 trên ảnh chụp 276 dòng (T-4 gốc dùng 221 dòng đầu) nên có thể lệch nhẹ so với 50,4 / 36,8 / 12,8 %. Dòng USD là cơ cấu chi phí thật nếu mọi lượt tính giá một model (ảnh chụp không có trường `model`).\n\n' +
    tbl(['Phạm vi', 'Mẫu số', 'cacheWrite', 'cacheRead', 'cacheWrite + cacheRead', 'out'], body) + '\n\n' + perRun);
}

// ---------- C-4 độ nhạy hệ số cacheRead ----------
{
  const tasksOf = (a, b, only) => [...new Set(R[a].map((r) => r.task))].filter((t) => R[b].some((r) => r.task === t) && (!only || only.includes(t)));
  const est = (fnum, base, treat, ts) => bootstrapRatio(ts.map((t) => R[base].filter((r) => r.task === t).map(fnum)), ts.map((t) => R[treat].filter((r) => r.task === t).map(fnum)), { reps: 1 }).est;
  const f = { 'weighted, cacheRead ×0,1 (CHÍNH)': (r) => wk(r.tokens, 0.1), 'weighted, cacheRead ×0,05 (độ nhạy)': (r) => wk(r.tokens, 0.05) };
  const body = [];
  for (const [treat, label, only] of [['B7', 'B7/A0, t1–t5', T15], ['B7', 'B7/A0, mọi bài có cả hai arm'], ['B6', 'B6/A0, mọi bài có cả hai arm']]) {
    const ts = tasksOf('A0-sonnet', treat, only);
    const e1 = est(f['weighted, cacheRead ×0,1 (CHÍNH)'], 'A0-sonnet', treat, ts), e2 = est(f['weighted, cacheRead ×0,05 (độ nhạy)'], 'A0-sonnet', treat, ts);
    body.push([label, ts.length, ratio(e1), ratio(e2), `${nf((e2 / e1 - 1) * 100, 1)} %`]);
  }
  sec('C-4', 'C-4. Độ nhạy của tỉ số token có trọng số với hệ số cacheRead 0,05 (ngoài họ Holm)',
    'Ước lượng điểm kiểu prereg (trung bình hình học của tỉ số trung bình theo bài, `bootstrapRatio` với `reps: 1`, cùng hàm T-7), mọi lượt done, ảnh chụp 276 dòng. Hệ số **0,1 vẫn là thước đo chính**; cột 0,05 (giá Opus 5.5 / Sonnet 5.5 theo chú thích 2 của trang giá) chỉ là phân tích phụ, không p, không đổi K, không thuộc họ Holm. Cột 0,1 trên t1–t5 đối chiếu T-7 (×2,51 trên 221 dòng đầu).\n\n' +
    tbl(['Tỉ số', 'Số bài', 'Hệ số 0,1 (chính)', 'Hệ số 0,05', 'Đổi so với chính'], body));
}

// ---------- C-5 USD ----------
{
  const body = [];
  for (const a of ARMS) {
    const rs = R[a];
    body.push([a, rs.length, ...Object.values(PRICES.models).flatMap((m) => [usd(sum(rs.map((r) => usdOf(r.tokens, m)))), usd(median(rs.map((r) => usdOf(r.tokens, m))))]), ...Object.values(PRICES.models).map((m) => usd(sum(rs.map((r) => usdOf(r.tokens, m, true))))), `${usd(sum(rs.map((r) => r.costUsd || 0)))} (${rs.filter((r) => r.costUsd > 0).length})`]);
  }
  const ratios = [];
  for (const [mn, m] of Object.entries(PRICES.models)) {
    for (const treat of ['B7', 'B6']) {
      const ts = [...new Set(R['A0-sonnet'].map((r) => r.task))].filter((t) => R[treat].some((r) => r.task === t));
      const e = bootstrapRatio(ts.map((t) => R['A0-sonnet'].filter((r) => r.task === t).map((r) => usdOf(r.tokens, m))), ts.map((t) => R[treat].filter((r) => r.task === t).map((r) => usdOf(r.tokens, m))), { reps: 1 }).est;
      ratios.push([`${treat}/A0 (${ts.length} bài), cùng giá ${mn}`, ratio(e)]);
    }
  }
  const pr = Object.entries(PRICES.models).map(([n, m]) => [n, nf(m.input, 2), nf(m.cacheWrite5m, 2), nf(m.cacheWrite1h, 2), nf(m.cacheRead, 2), nf(m.output, 2), `${nf(m.cacheRead / m.input, 2)}×`]);
  sec('C-5', 'C-5. Chi phí USD theo bảng giá (phân tích phụ, ngoài họ Holm)' + VF,
    `Ảnh chụp **không có trường \`model\`** (giá trị: ${modelVals.join('; ')}) nên không tách được lượt Sonnet / Opus theo dữ liệu. \`arms.json\` chỉ ghi bí danh \`sonnet\` cho A0-sonnet và không ghi model cho B0/B6/B7 (do cấu hình CCoding quyết định). Vì vậy mỗi arm được tính ở **hai kịch bản cận**: toàn bộ lượt giá Sonnet 5.5, hoặc toàn bộ giá Opus 5.5; không suy đoán tỉ lệ pha. Ảnh chụp không phân biệt cacheWrite 5 phút và 1 giờ, nên có hai nhóm cột: cacheWrite giá 5 phút (1,25× giá đầu vào) và giá 1 giờ (2×). Đối chiếu duy nhất có thể kiểm: cột \`costUsd\` đã ghi của A0-sonnet (chỉ A0 có \`costUsd\` > 0; số trong ngoặc là số lượt) với hai cột Sonnet 5.5; so khớp ở nhóm nào thì nhóm đó là bằng chứng gián tiếp cho cách tính của claude-cli (chỉ cho A0, và giả định A0-sonnet chạy Sonnet 5.5). Khi mọi thành phần Opus đúng 2× Sonnet thì tỉ số B/A0 ở hai model trùng nhau; ở hệ số 0,05 và cacheWrite 5 phút, tỉ số USD cũng trùng C-4 cột 0,05 (giá Sonnet 5.5 có tỉ lệ 1 : 1,25 : 0,05 : 5).\n\nBảng giá (USD / triệu token; nguồn ${PRICES.sourceUrl}, truy cập ${PRICES.accessed}, verified=${PRICES.verified}):\n\n` +
    tbl(['Model', 'input', 'cacheWrite 5 phút', 'cacheWrite 1 giờ', 'cacheRead', 'output', 'cacheRead / input'], pr) + '\n\nUSD theo arm:\n\n' +
    tbl(['Arm', 'Lượt', 'Σ USD giá Sonnet 5.5', 'Trung vị/lượt Sonnet 5.5', 'Σ USD giá Opus 5.5', 'Trung vị/lượt Opus 5.5', 'Σ Sonnet 5.5, cacheWrite 1 giờ', 'Σ Opus 5.5, cacheWrite 1 giờ', 'Σ `costUsd` đã ghi (số lượt > 0)'], body) + '\n\nTỉ số USD (cùng kiểu ước lượng prereg như C-4; cacheWrite giá 5 phút):\n\n' + tbl(['Tỉ số', 'Giá trị'], ratios));
}

const ORDER = ['C-0', 'C-1', 'C-2', 'C-3', 'C-4', 'C-5'];
const render = (id) => `### ${TITLES[id]}\n\n${T[id]}\n`;
const HEADER = `# Cơ cấu chi phí, tỉ lệ trúng cache và độ nhạy giá (cache-sensitivity)\n\n> Phân tích phụ, **ngoài họ Holm**; sinh bởi \`cache-sensitivity.mjs\`. Thước đo chính của dự án vẫn là \`input + 1,25·cacheWrite + 0,1·cacheRead + 5·out\`. Phân loại dữ liệu: Nội bộ. Dữ liệu: ảnh chụp git \`${SNAPSHOT}\` (${EXPECT_LINES} dòng).\n`;

const args = process.argv.slice(2), ci = args.indexOf('--check'), ti = args.indexOf('--table');
if (ci >= 0) {
  const doc = fs.readFileSync(path.resolve(args[ci + 1]), 'utf8').replace(/\r\n/g, '\n');
  const miss = ORDER.filter((id) => !doc.includes(render(id)));
  if (miss.length) { console.error(`LỆCH: bảng không trùng đầu ra script: ${miss.join(', ')}`); process.exit(1); }
  console.log(`OK: ${ORDER.length} bảng trong ${args[ci + 1]} trùng đầu ra script.`);
} else if (ti >= 0) {
  const id = args[ti + 1];
  if (!T[id]) { console.error(`Bảng không tồn tại: ${id} (có: ${ORDER.join(', ')})`); process.exit(2); }
  process.stdout.write(render(id));
} else { console.log(HEADER); for (const id of ORDER) console.log(render(id)); }
