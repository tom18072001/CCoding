#!/usr/bin/env node
// R11 — Tách chi phí và thời gian làn đơn B7 so với A0-sonnet (vòng 4, gói 1, hạng mục S1).
// Node >= 22, không gói ngoài, offline. Chỉ ĐỌC bench/vs-claude/results/study-cloud/runs.jsonl.
//
//   node docs/research/analysis/b7-cost-decomposition.mjs                       # in toàn bộ bảng ra stdout
//   node docs/research/analysis/b7-cost-decomposition.mjs --table T-3          # in một bảng
//   node docs/research/analysis/b7-cost-decomposition.mjs --check docs/research/analysis/b7-cost-decomposition.md
//        # mọi bảng trong .md phải trùng từng ký tự với đầu ra script (exit 1 nếu lệch)
//
// Công thức weighted: import từ bench/vs-claude/lib/claude.mjs (cùng hàm mà bench ghi vào runs.jsonl; prereg-tests.mjs
// chỉ đọc tokens.weighted từ runs.jsonl). Script kiểm tokens.weighted == weighted(tokens) (sai số làm tròn ≤ 1).
// median/sha256/gitBlob: import từ prereg-tests.mjs (không tự định nghĩa lại).
//
// THỨ TỰ QUY PHẦN (cố định, để không đếm một token hai lần), áp cho từng bài rồi cộng các bài:
//   Δ = weighted(B7) − weighted(A0), mỗi vế là trung vị của bài. Phần còn lại được cắt ở 0 sau mỗi bước.
//   (i)   accept        = trung vị byPhase.accept của B7 (A0 không có pha này ⇒ toàn bộ là phần vượt)
//   (ii)  out vượt A0   = 5 × max(0, out_B7 − out_A0), cắt ở phần còn lại. LƯU Ý: byPhase chỉ có weighted theo pha,
//                         KHÔNG có out theo pha ⇒ không tách được "out của execute"; dùng out cả lượt (có thể gồm out của accept).
//   (iii) cacheWrite vượt A0 = 1,25 × max(0, cw_B7 − cw_A0), cắt ở phần còn lại
//   (iv)  các pha khác + phần dư = Δ − (i) − (ii) − (iii)
// Độ nhạy: thứ tự ngược (ii) → (iii) → (i) → (iv).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { median, sha256, gitBlob, bootstrapRatio } from './prereg-tests.mjs';
import { weighted } from '../../../bench/vs-claude/lib/claude.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNS = path.resolve(HERE, '../../../bench/vs-claude/results/study-cloud/runs.jsonl');
const SCRIPT_VERSION = 'b7-cost-decomposition v1 (round 4, S1)';
const T15 = ['t1-duration', 't2-orders', 't3-api', 't4-perf', 't5-logq'];
const BRIEF = { A0: { out: 8000, cacheRead: 124000, cacheWrite: 15000, weighted: 66000, wall: 52 }, B7: { out: 20200, cacheRead: 219000, cacheWrite: 51000, weighted: 199000, wall: 140 } }; // đề bài (làm tròn)
const COMP = ['output', 'cacheRead', 'cacheWrite', 'input'];
const COMP_VI = { output: 'out', cacheRead: 'cacheRead', cacheWrite: 'cacheWrite', input: 'input' };

const runsBuf = fs.readFileSync(RUNS);
const rows = runsBuf.toString('utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const done = rows.filter((r) => r.status === 'done');
const A0 = done.filter((r) => r.arm === 'A0-sonnet'), B7 = done.filter((r) => r.arm === 'B7');
const allTasks = [...new Set(B7.map((r) => r.task))];
const SETS = { 't1–t5': allTasks.filter((t) => T15.includes(t)), 'B7b (13 bài)': allTasks.filter((t) => !T15.includes(t)) };

// ---------- định dạng ----------
const nf = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }) : 'không đo được');
const k = (x) => (Number.isFinite(x) ? `${nf(x / 1000, 1)}k` : 'không đo được');
const pct = (x) => `${nf(x * 100, 1)} %`;
const ratio = (x) => `×${nf(x, 2)}`;
const tbl = (head, body) => [`| ${head.join(' | ')} |`, `| ${head.map((h, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`, ...body.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const sum = (a) => a.reduce((s, x) => s + x, 0);
const val = (r, c) => (c === 'weighted' ? r.tokens.weighted : c === 'wall' ? r.wallSec : r.tokens[c]);
const byTask = (R, ts) => Object.fromEntries(ts.map((t) => [t, R.filter((r) => r.task === t)]));
const medOf = (R, c) => median(R.map((r) => val(r, c)));
const phaseOf = (r, p) => r.byPhase?.[p] ?? 0;
const rank = (a) => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = Array(a.length); for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let m = i; m <= j; m++) r[o[m][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
const spearman = (x, y) => { const a = rank(x), b = rank(y), ma = sum(a) / a.length, mb = sum(b) / b.length; const num = sum(a.map((v, i) => (v - ma) * (b[i] - mb))); return num / Math.sqrt(sum(a.map((v) => (v - ma) ** 2)) * sum(b.map((v) => (v - mb) ** 2))); };

// ---------- kiểm schema + công thức ----------
const wMismatch = done.filter((r) => Math.abs(weighted(r.tokens) - r.tokens.weighted) > 1).length;
const phaseMismatch = B7.filter((r) => Math.abs(sum(Object.values(r.byPhase ?? {})) - r.tokens.weighted) > 5).length;
const keysB7 = [...new Set(B7.flatMap((r) => Object.keys(r)))].sort();
const phaseNames = [...new Set(B7.flatMap((r) => Object.keys(r.byPhase ?? {})))];

// ---------- phân rã có thứ tự ----------
function decompose(wB, wA, acc, outB, outA, cwB, cwA, order) {
  let rem = wB - wA; const d = { accept: 0, out: 0, cw: 0, other: 0 };
  const want = { accept: acc, out: 5 * Math.max(0, outB - outA), cw: 1.25 * Math.max(0, cwB - cwA) };
  for (const key of order) { const take = Math.min(want[key], Math.max(0, rem)); d[key] = take; rem -= take; }
  d.other = rem; return d;
}
function decompSet(ts, order) {
  const tot = { delta: 0, accept: 0, out: 0, cw: 0, other: 0 };
  for (const t of ts) {
    const b = B7.filter((r) => r.task === t), a = A0.filter((r) => r.task === t);
    const d = decompose(medOf(b, 'weighted'), medOf(a, 'weighted'), median(b.map((r) => phaseOf(r, 'accept'))), medOf(b, 'output'), medOf(a, 'output'), medOf(b, 'cacheWrite'), medOf(a, 'cacheWrite'), order);
    tot.delta += medOf(b, 'weighted') - medOf(a, 'weighted'); for (const key of ['accept', 'out', 'cw', 'other']) tot[key] += d[key];
  }
  return tot;
}
const ORD = ['accept', 'out', 'cw'], ORD_REV = ['out', 'cw', 'accept'];

// ---------- các bảng ----------
const T = {}, TITLES = {};
const sec = (id, title, body) => { T[id] = body; TITLES[id] = title; };

{ // T-1 tái lập trung vị t1–t5
  const ts = SETS['t1–t5'], a = A0.filter((r) => ts.includes(r.task)), b = B7.filter((r) => ts.includes(r.task));
  const spec = [['out', 'output', BRIEF.A0.out, BRIEF.B7.out], ['cacheRead', 'cacheRead', BRIEF.A0.cacheRead, BRIEF.B7.cacheRead], ['cacheWrite', 'cacheWrite', BRIEF.A0.cacheWrite, BRIEF.B7.cacheWrite], ['input', 'input', null, null], ['weighted', 'weighted', BRIEF.A0.weighted, BRIEF.B7.weighted], ['wall (s)', 'wall', BRIEF.A0.wall, BRIEF.B7.wall]];
  const fm = (c, x) => (c === 'wall' ? nf(x, 1) : c === 'input' ? nf(x) : k(x));
  const body = spec.map(([lab, c, ba, bb]) => { const ma = medOf(a, c), mb = medOf(b, c); const dev = (m, bv) => (bv == null ? 'đề bài không có' : `${pct(m / bv - 1)}`); return [lab, fm(c, ma), ba == null ? '—' : fm(c, ba), dev(ma, ba), fm(c, mb), bb == null ? '—' : fm(c, bb), dev(mb, bb), ratio(mb / ma)]; });
  sec('T-1', 'T-1. Tái lập trung vị t1–t5 (gộp mọi lượt done) so với số trong đề bài', `Lượt done: A0-sonnet ${a.length}, B7 ${b.length}. weighted = input + 1,25·cacheWrite + 0,1·cacheRead + 5·out (\`bench/vs-claude/lib/claude.mjs\`). Cột "lệch" = tính lại ÷ đề bài − 1.\n\n` + tbl(['Thành phần', 'A0 tính lại', 'A0 đề bài', 'lệch A0', 'B7 tính lại', 'B7 đề bài', 'lệch B7', 'B7/A0 (trung vị gộp)'], body));
}

{ // T-2 B7 theo pha + số lượt gọi
  const body = [];
  for (const [name, ts] of Object.entries(SETS)) {
    const b = B7.filter((r) => ts.includes(r.task)), a = A0.filter((r) => ts.includes(r.task));
    for (const p of phaseNames) {
      const has = b.filter((r) => r.byPhase?.[p] != null);
      body.push([name, p, `${has.length}/${b.length}`, k(median(has.map((r) => r.byPhase[p]))), pct(sum(has.map((r) => r.byPhase[p])) / sum(b.map((r) => r.tokens.weighted)))]);
    }
    body.push([name, '**tổng B7 (weighted)**', `${b.length}/${b.length}`, k(medOf(b, 'weighted')), '100,0 %']);
    body.push([name, '(A0 cùng bài, không có byPhase)', `${a.length}`, k(medOf(a, 'weighted')), 'không đo được']);
  }
  const calls = [];
  for (const [name, ts] of Object.entries(SETS)) {
    const b = B7.filter((r) => ts.includes(r.task)); const g = {};
    for (const r of b) { const key = `${r.calls} lượt: ${Object.keys(r.byPhase).join('+')}`; (g[key] ??= []).push(r); }
    for (const key of Object.keys(g).sort()) calls.push([name, key, g[key].length, k(medOf(g[key], 'weighted')), k(medOf(g[key], 'output')), nf(medOf(g[key], 'wall'), 0)]);
  }
  sec('T-2', 'T-2. B7 theo pha (byPhase) và theo số lượt gọi', `\`byPhase\` chỉ chứa **weighted theo pha** (tổng pha = weighted lượt, lệch >5 ở ${phaseMismatch} lượt). Không có out/cacheRead/cacheWrite/input/giây theo pha. "Trung vị" tính trên các lượt có pha đó; "tỷ trọng" = tổng weighted của pha ÷ tổng weighted B7.\n\n` + tbl(['Bộ', 'Pha', 'Số lượt có pha', 'Trung vị weighted', 'Tỷ trọng'], body) + '\n\nTheo số lượt gọi (`calls`) và tập pha:\n\n' + tbl(['Bộ', 'calls: pha', 'Số lượt', 'weighted (trung vị)', 'out (trung vị)', 'wall s (trung vị)'], calls));
}

{ // T-3 so từng thành phần với A0 cùng bài (ghép theo bài)
  const body = [];
  for (const [name, ts] of Object.entries(SETS)) {
    for (const c of ['output', 'cacheRead', 'cacheWrite', 'input', 'weighted', 'wall']) {
      const pairs = ts.map((t) => [medOf(B7.filter((r) => r.task === t), c), medOf(A0.filter((r) => r.task === t), c)]);
      const rr = pairs.map(([b, a]) => b / a), dd = pairs.map(([b, a]) => b - a);
      const f = (x) => (c === 'wall' ? nf(x, 1) : c === 'input' ? nf(x) : k(x));
      body.push([name, c === 'wall' ? 'wall (s)' : COMP_VI[c] ?? c, ts.length, f(median(pairs.map((p) => p[1]))), f(median(pairs.map((p) => p[0]))), ratio(median(rr)), `${ratio(Math.min(...rr))} … ${ratio(Math.max(...rr))}`, f(median(dd))]);
    }
  }
  sec('T-3', 'T-3. Từng thành phần B7 so với A0 cùng bài (ghép cặp theo bài, rồi trung vị qua bài)', 'Mỗi bài: trung vị các lượt done của B7 và của A0; sau đó lấy trung vị qua bài. A0 không ghi `calls` (chỉ `turns` của CLI, khác nghĩa) nên cột số lượt gọi nằm ở T-2.\n\n' + tbl(['Bộ', 'Thành phần', 'Số bài', 'A0 (trung vị bài)', 'B7 (trung vị bài)', 'B7/A0 (trung vị cặp)', 'khoảng B7/A0 qua bài', 'B7 − A0 (trung vị cặp)'], body));
}

{ // T-4 phân rã chênh weighted theo thành phần token (chính xác) + cacheWrite/lượt gọi
  const body = [];
  for (const [name, ts] of Object.entries(SETS)) {
    const d = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }; const mult = { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 };
    let delta = 0, cwPerCallB = [], cwA = [];
    for (const t of ts) {
      const b = B7.filter((r) => r.task === t), a = A0.filter((r) => r.task === t);
      delta += medOf(b, 'weighted') - medOf(a, 'weighted');
      for (const c of Object.keys(d)) d[c] += mult[c] * (medOf(b, c) - medOf(a, c));
      cwPerCallB.push(...b.map((r) => r.tokens.cacheWrite / r.calls)); cwA.push(...a.map((r) => r.tokens.cacheWrite));
    }
    const sd = sum(Object.values(d));
    for (const c of ['output', 'cacheWrite', 'cacheRead', 'input']) body.push([name, `${COMP_VI[c]} (×${nf(mult[c], c === 'cacheWrite' ? 2 : c === 'cacheRead' ? 1 : 0)})`, k(d[c] / ts.length), pct(d[c] / sd)]);
    body.push([name, '**cộng** (khớp Δ weighted ± làm tròn trung vị)', k(sd / ts.length), `Δ = ${k(delta / ts.length)}/bài`]);
    body.push([name, 'cacheWrite mỗi lượt gọi B7 (trung vị) / cacheWrite mỗi lượt A0', `${k(median(cwPerCallB))} / ${k(median(cwA))}`, 'mô tả, không phải nhân quả']);
  }
  sec('T-4', 'T-4. Chênh weighted (B7 − A0) theo thành phần token — phân rã đại số, độc lập với pha', 'Mỗi bài: Δ thành phần = hệ số × (trung vị B7 − trung vị A0). Trình bày trung bình trên bài (k token weighted/bài) và % của tổng. Vì trung vị từng thành phần không cộng đúng bằng trung vị weighted nên dòng "cộng" có thể lệch Δ đôi chút.\n\n' + tbl(['Bộ', 'Thành phần', 'Δ weighted mỗi bài', '% chênh'], body));
}

{ // T-5 phân rã cộng 100 % theo thứ tự quy phần
  const mk = (ts, order, label) => { const d = decompSet(ts, order); const n = ts.length; return { d, n, label }; };
  const body = [];
  for (const [name, ts] of Object.entries(SETS)) {
    const d = decompSet(ts, ORD), n = ts.length;
    const rowsD = [['(i) pha accept', d.accept], ['(ii) out vượt A0 (cả lượt; không tách theo pha)', d.out], ['(iii) cacheWrite vượt A0 (mỗi lượt gọi là phiên mới)', d.cw], ['(iv) các pha khác + phần dư (plan, review, cacheRead, input, execute còn lại)', d.other]];
    for (const [lab, v] of rowsD) body.push([name, lab, k(v / n), pct(v / d.delta)]);
    body.push([name, '**Tổng = Δ weighted (B7 − A0)**', k(d.delta / n), '100,0 %']);
  }
  const sens = [];
  for (const [name, ts] of Object.entries(SETS)) {
    const a = decompSet(ts, ORD), r = decompSet(ts, ORD_REV);
    for (const [lab, key] of [['accept', 'accept'], ['out', 'out'], ['cacheWrite', 'cw'], ['khác + dư', 'other']]) sens.push([name, lab, pct(a[key] / a.delta), pct(r[key] / r.delta)]);
  }
  sec('T-5', 'T-5. Phân rã Δ weighted (B7 − A0) cộng đúng 100 %, theo thứ tự quy phần cố định', 'Thứ tự: accept → out vượt A0 → cacheWrite vượt A0 → các pha khác và phần dư (xem đầu script). Mỗi bài tính từ trung vị của bài, rồi cộng qua bài; số tuyệt đối là k token weighted trung bình mỗi bài.\n\n' + tbl(['Bộ', 'Phần', 'Tuyệt đối mỗi bài', '% của Δ'], body) + '\n\nĐộ nhạy với thứ tự (ngược: out → cacheWrite → accept → khác). Phần accept (i) là weighted đo trực tiếp; out và cacheWrite dùng số cả lượt nên TRÙNG một phần với chính token của accept (byPhase không tách thành phần). Thứ tự ngược cho biết phần accept không trùng với out/cacheWrite vượt A0 (cận dưới của phần accept "độc lập"); thứ tự chính cho accept đầy đủ:\n\n' + tbl(['Bộ', 'Phần', 'Thứ tự chính', 'Thứ tự ngược'], sens));
}

{ // T-6 thời gian
  const body = [];
  for (const [name, ts] of Object.entries(SETS)) {
    const b = B7.filter((r) => ts.includes(r.task)), a = A0.filter((r) => ts.includes(r.task));
    const pr = ts.map((t) => medOf(B7.filter((r) => r.task === t), 'wall') / medOf(A0.filter((r) => r.task === t), 'wall'));
    const dd = ts.map((t) => medOf(B7.filter((r) => r.task === t), 'wall') - medOf(A0.filter((r) => r.task === t), 'wall'));
    body.push([name, 'wall tổng (trung vị lượt): A0 → B7', `${nf(medOf(a, 'wall'), 1)} s → ${nf(medOf(b, 'wall'), 1)} s`, `${ratio(medOf(b, 'wall') / medOf(a, 'wall'))} gộp; ${ratio(median(pr))} cặp-theo-bài; Δ ${nf(median(dd), 1)} s`]);
    for (const lab of ['execute (giây)', 'accept (giây)', 'lệnh kiểm tra baseline/sau (giây)', 'tạo worktree (giây)', 'lượt định tuyến LLM (giây)']) body.push([name, lab, 'không đo được', 'runs.jsonl không có byPhase.wallMs/sec hay thời gian lệnh']);
    body.push([name, 'phần không quy được', `${nf(medOf(b, 'wall') - medOf(a, 'wall'), 1)} s (toàn bộ Δ)`, 'vì không có pha nào đo được']);
    const g = {};
    for (const r of b) (g[r.calls >= 4 ? '≥4 lượt (có plan)' : r.calls === 3 ? '3 lượt (review)' : '2 lượt (execute+accept)'] ??= []).push(r);
    for (const key of Object.keys(g).sort()) body.push([name, `mô tả: B7 ${key}`, `${g[key].length} lượt; wall ${nf(medOf(g[key], 'wall'), 1)} s; weighted ${k(medOf(g[key], 'weighted'))}`, '']);
    body.push([name, 'Spearman wall~out / wall~calls / wall~weighted (B7, theo lượt)', `${nf(spearman(b.map((r) => r.wallSec), b.map((r) => r.tokens.output)), 2)} / ${nf(spearman(b.map((r) => r.wallSec), b.map((r) => r.calls)), 2)} / ${nf(spearman(b.map((r) => r.wallSec), b.map((r) => r.tokens.weighted)), 2)}`, 'tương quan, không phải phân rã']);
    body.push([name, 'Spearman wall~out (A0, theo lượt)', nf(spearman(a.map((r) => r.wallSec), a.map((r) => r.tokens.output)), 2), 'tương quan, không phải phân rã']);
  }
  sec('T-6', 'T-6. Tách thời gian (×2,57 trên t1–t5)', 'Chỉ `wallSec` toàn lượt được ghi. Theo mã harness (`bench/vs-claude/lib/ccoding.mjs`): đồng hồ chạy từ lúc tạo dự án (POST /api/projects) tới khi task kết thúc, `isolation: \'none\'` (không tạo worktree), `checkCommands: [\'npm test\']` nếu workspace có `package.json`. Đó là suy ra từ mã, không phải số đo. Không chia bình quân hay phân bổ theo tỷ lệ token để lấp chỗ trống.\n\n' + tbl(['Bộ', 'Mục', 'Giá trị', 'Ghi chú'], body));
}

{ // T-7 trả lời R11.3
  const f = (ts) => { const d = decompSet(ts, ORD), r = decompSet(ts, ORD_REV); return { d, r }; };
  const body = [];
  for (const [name, ts] of Object.entries(SETS)) {
    const { d, r } = f(ts);
    const a = A0.filter((x) => ts.includes(x.task)), b = B7.filter((x) => ts.includes(x.task));
    const est = (m) => bootstrapRatio(ts.map((t) => a.filter((x) => x.task === t).map((x) => val(x, m))), ts.map((t) => b.filter((x) => x.task === t).map((x) => val(x, m))), { reps: 1 }).est;
    body.push([name, 'Neo: ước lượng điểm kiểu prereg (TB hình học của tỷ số trung bình theo bài), weighted / wall, mọi lượt done', `${ratio(est('weighted'))} / ${ratio(est('wall'))}`]);
    body.push([name, 'Tỷ lệ B7/A0 weighted (trung vị cặp)', ratio(median(ts.map((t) => medOf(B7.filter((x) => x.task === t), 'weighted') / medOf(A0.filter((x) => x.task === t), 'weighted'))))]);
    body.push([name, 'Phần Δ đến từ pha accept', `${pct(d.accept / d.delta)} (${k(d.accept / ts.length)}/bài); nếu quy accept sau cùng: ${pct(r.accept / r.delta)}`]);
    body.push([name, 'Phần Δ KHÔNG đến từ accept (execute + plan + review vượt A0; accept đo trực tiếp)', pct(1 - d.accept / d.delta)]);
    body.push([name, 'Phần Δ đến từ đầu ra dài hơn (out vượt A0; không tách mẫu đầu ra / báo cáo bàn giao)', `${pct(d.out / d.delta)} (${k(d.out / ts.length)}/bài); nếu quy out trước: ${pct(r.out / r.delta)}`]);
    body.push([name, 'Phần Δ đến từ cacheWrite vượt A0', `${pct(d.cw / d.delta)} (${k(d.cw / ts.length)}/bài); nếu quy cacheWrite trước: ${pct(r.cw / r.delta)}`]);
    body.push([name, 'Phần Δ từ các pha khác + phần dư', `${pct(d.other / d.delta)} (${k(d.other / ts.length)}/bài)`]);
    body.push([name, 'Pha plan + review (tỷ trọng trong tổng weighted B7)', `${pct(sum(b.map((x) => phaseOf(x, 'plan') + phaseOf(x, 'review'))) / sum(b.map((x) => x.tokens.weighted)))} weighted B7 (không phải % của Δ)`]);
  }
  sec('T-7', 'T-7. Trả lời bằng số cho R11.3', 'Mọi số lấy từ T-4/T-5 (chính). "Đầu ra dài hơn" = toàn bộ out vượt A0; byPhase không có out theo pha nên không tách được mẫu đầu ra khỏi báo cáo bàn giao, cũng không tách được out của accept khỏi out của execute.\n\n' + tbl(['Bộ', 'Câu hỏi', 'Số'], body));
}

// ---------- nhận dạng + giới hạn (văn bản cố định, cũng nằm trong bảng để --check) ----------
const idBlock = () => `| Mục | Giá trị |\n| --- | --- |\n| Script | ${SCRIPT_VERSION} |\n| Hash git (blob) \`runs.jsonl\` | \`${gitBlob(runsBuf)}\` |\n| sha256 \`runs.jsonl\` (LF) | \`${sha256(runsBuf)}\` |\n| Số dòng; done A0-sonnet / B7 | ${rows.length}; ${A0.length} / ${B7.length} |\n| Bài t1–t5 / B7b | ${SETS['t1–t5'].length} / ${SETS['B7b (13 bài)'].length} |\n| Lượt B7 trên t1–t5 / B7b | ${B7.filter((r) => SETS['t1–t5'].includes(r.task)).length} / ${B7.filter((r) => SETS['B7b (13 bài)'].includes(r.task)).length} |\n| Lượt A0 trên t1–t5 / B7b | ${A0.filter((r) => SETS['t1–t5'].includes(r.task)).length} / ${A0.filter((r) => SETS['B7b (13 bài)'].includes(r.task)).length} |\n| tokens.weighted ≠ weighted(tokens) (sai số >1) | ${wMismatch} lượt |\n| Trường của dòng B7 | ${keysB7.join(', ')} |\n| Pha trong byPhase | ${phaseNames.join(', ')} |`;
sec('T-0', 'T-0. Nhận dạng dữ liệu và schema', idBlock());

const ORDER = ['T-0', 'T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6', 'T-7'];
const render = (id) => `### ${TITLES[id]}\n\n${T[id]}\n`;

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
} else for (const id of ORDER) console.log(render(id));
