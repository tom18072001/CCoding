#!/usr/bin/env node
// R14 — Tách phương sai log(B7/A0) giữa bài và giữa lượt trong bài; CI dự kiến cho cỡ mẫu B7′; bảng điểm dừng sau 20 lượt.
// Vòng 4, gói 1b, hạng mục S2. Node >= 22, không gói ngoài, offline. Chỉ ĐỌC bench/vs-claude/results/study-cloud/runs.jsonl.
//
//   node docs/research/analysis/variance-decomposition.mjs                       # in toàn bộ bảng ra stdout
//   node docs/research/analysis/variance-decomposition.mjs --table V-2           # in một bảng
//   node docs/research/analysis/variance-decomposition.mjs --check docs/research/analysis/variance-decomposition.md
//        # mọi bảng trong .md phải trùng từng ký tự với đầu ra script; hash runs.jsonl ghi trong .md phải khớp (exit 1 nếu lệch)
//
// BỘ LỌC (giữ đúng prereg-tests.mjs và b7-cost-decomposition.mjs):
//   1. classifyRows() của prereg-tests.mjs (loại Q, L, T, E1/E4, status 'infra', khóa trùng) lấy `kept`;
//   2. status === 'done' (như b7-cost-decomposition.mjs; lượt failed/error bị bỏ khỏi phân tích tỷ số);
//   3. arm ∈ {A0-sonnet, B7}; bộ t1–t5 và bộ B7b (mọi bài khác có cả hai arm). Không lọc theo score.
//   Số lượt sau lọc nằm ở bảng V-0 và phải bằng số `done` của b7-cost-decomposition.mjs cùng phạm vi.
// GHIM DỮ LIỆU: runs.jsonl chỉ nối thêm dòng (study-cloud B6b còn chạy); script chỉ đọc PIN_LINES dòng đầu và ghi hash
//   của phần đã ghim, để --check không lệch khi có dòng mới. Đổi PIN_LINES ⇒ phải sinh lại .md và ghi vào §9.
//
// MÔ HÌNH (log token có trọng số hoặc log wallSec). Với bài t, arm a∈{A,B}, lượt i: y = ln(giá trị).
//   ℓ_t = TB_i y(B,t,i) − TB_j y(A,t,j)                (log tỷ số hình học của bài t)
//   Var_t(ℓ_t) = σ²_task + TB_t( σ²_B/n_Bt + σ²_A/n_At )      (σ²_task: phương sai THẬT giữa bài của log tỷ số)
//   σ²_run = σ²_A + σ²_B  = phương sai giữa lượt trong bài của MỘT cặp log(B/A); σ²_a ước lượng gộp = ΣSS_trong-ô / Σ(n−1).
//   Ước lượng moment (ANOVA một chiều có hiệu chỉnh cho n_At, n_Bt không đều): σ²_task = max(0, Var_t(ℓ_t) − TB_t(...)).
// CI của σ²: bootstrap phân tầng hai mức (lấy lại bài, rồi lấy lại lượt trong ô, từng arm), B = BOOT, phân vị 5 %–95 %.
//   Lưu ý: lấy lại lượt trong ô làm σ²_run lệch thấp ≈ (n−1)/n; bài chỉ có 5 nên CI của σ²_task rất rộng; nêu ở Giới hạn.
// CI DỰ KIẾN: mô phỏng tham số (log-chuẩn, ba tham số σ²_task, σ²_A, σ²_B), thống kê và CI đúng như prereg-tests.mjs
//   (bootstrapRatio: TB hình học theo bài của tỷ số các trung bình, bootstrap hai tầng, CI 90 %); lấy trung vị độ rộng qua SIMS lần mô phỏng.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRows, bootstrapRatio, rng, mean, median, sha256, gitBlob } from './prereg-tests.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNS = path.resolve(HERE, '../../../bench/vs-claude/results/study-cloud/runs.jsonl');
const SCRIPT_VERSION = 'variance-decomposition v1 (round 4, S2)';
const PIN_LINES = 240; // số dòng đầu của runs.jsonl đã phân tích (hash ở V-0)
const T15 = ['t1-duration', 't2-orders', 't3-api', 't4-perf', 't5-logq'];
const SEED = 20261104, BOOT = 4000, SIMS = 300, SIM_BOOT = 500, SIMS_STOP = 20000;
const Z90 = 1.6448536269514722;
const METRICS = [['weighted', 'token có trọng số'], ['wallSec', 'thời gian thực (wallSec)']];

const fullBuf = fs.readFileSync(RUNS);
const runsBuf = Buffer.from(fullBuf.toString('utf8').split('\n').slice(0, PIN_LINES).join('\n') + '\n');
const allRows = runsBuf.toString('utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const { kept } = classifyRows(allRows);
const done = kept.filter((r) => r.status === 'done');
const A0 = done.filter((r) => r.arm === 'A0-sonnet'), B7 = done.filter((r) => r.arm === 'B7');
const taskIds = [...new Set(B7.map((r) => r.task))].filter((t) => A0.some((r) => r.task === t));
const SETS = { 't1–t5': taskIds.filter((t) => T15.includes(t)), 'B7b': taskIds.filter((t) => !T15.includes(t)) };
SETS['gộp t1–t5 + B7b'] = [...SETS['t1–t5'], ...SETS.B7b];
const val = (r, m) => (m === 'weighted' ? r.tokens.weighted : r.wallSec);
const cellOf = (R, arm, t, m) => R.filter((r) => r.task === t).map((r) => val(r, m));

// ---------- định dạng ----------
const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : 'n/a');
const rt = (x) => `×${f(x, 2)}`;
const pct = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d).replace('.', ',')} %` : 'n/a');
const ci = (a, d = 3) => `[${f(a[0], d)}; ${f(a[1], d)}]`;
const tbl = (head, body) => [`| ${head.join(' | ')} |`, `| ${head.map((h, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`, ...body.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const sum = (a) => a.reduce((s, x) => s + x, 0);
const varS = (a) => { if (a.length < 2) return NaN; const m = mean(a); return sum(a.map((x) => (x - m) ** 2)) / (a.length - 1); };
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// ---------- ước lượng moment ----------
/** logsA/logsB: mảng theo bài, mỗi phần tử là mảng ln(giá trị) của các lượt. */
export function decompose(logsA, logsB) {
  const T = logsA.length;
  const ell = logsA.map((a, t) => mean(logsB[t]) - mean(a));
  const within = (L) => { let ss = 0, df = 0; for (const c of L) { const m = mean(c); ss += sum(c.map((x) => (x - m) ** 2)); df += c.length - 1; } return df > 0 ? ss / df : NaN; };
  const s2A = within(logsA), s2B = within(logsB);
  const samp = mean(logsA.map((a, t) => s2A / a.length + s2B / logsB[t].length));
  const raw = varS(ell);
  return { T, mu: mean(ell), s2A, s2B, s2Run: s2A + s2B, varEll: raw, samp, s2Task: Math.max(0, raw - samp), negative: raw - samp < 0 };
}
function bootDecomp(logsA, logsB, seed) {
  const rnd = rng(seed), T = logsA.length, out = { task: [], run: [], mu: [], s2A: [], s2B: [] };
  const rs = (c) => c.map(() => c[Math.floor(rnd() * c.length)]);
  for (let i = 0; i < BOOT; i++) {
    const A = [], Bc = [];
    for (let j = 0; j < T; j++) { const t = Math.floor(rnd() * T); A.push(rs(logsA[t])); Bc.push(rs(logsB[t])); }
    const d = decompose(A, Bc);
    if (![d.s2Task, d.s2Run, d.mu].every(Number.isFinite)) continue;
    out.task.push(d.s2Task); out.run.push(d.s2Run); out.mu.push(d.mu); out.s2A.push(d.s2A); out.s2B.push(d.s2B);
  }
  return out;
}
const ci90 = (a) => [q(a, 0.05), q(a, 0.95)];
const logsFor = (set, m) => ({ A: SETS[set].map((t) => cellOf(A0, 'A0-sonnet', t, m).map(Math.log)), B: SETS[set].map((t) => cellOf(B7, 'B7', t, m).map(Math.log)) });

const EST = {}; // EST[metric][set] = {d, boot}
for (const [m] of METRICS) {
  EST[m] = {};
  for (const set of Object.keys(SETS)) {
    const { A, B } = logsFor(set, m);
    EST[m][set] = { d: decompose(A, B), boot: bootDecomp(A, B, SEED + set.length) };
  }
}

// ---------- mô phỏng ----------
function normal(rnd) { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); }
/** spec: mảng theo bài {s2Task, s2A, s2B}; m: số lượt mỗi arm mỗi bài; R: tỷ số thật (tỉ số các kỳ vọng). Trả cellsA, cellsB (giá trị gốc). */
function simData(spec, m, R, rnd) {
  const cA = [], cB = [];
  for (const p of spec) {
    const d = Math.sqrt(p.s2Task) * normal(rnd);
    cA.push(Array.from({ length: m }, () => Math.exp(-p.s2A / 2 + Math.sqrt(p.s2A) * normal(rnd))));
    cB.push(Array.from({ length: m }, () => Math.exp(Math.log(R) + d - p.s2B / 2 + Math.sqrt(p.s2B) * normal(rnd))));
  }
  return { cA, cB };
}
const estPrereg = (cA, cB) => mean(cA.map((a, t) => Math.log(mean(cB[t]) / mean(a))));
function widthSim(spec, m, R, seed) {
  const rnd = rng(seed), hw = [], hiF = [], loF = [], est = [];
  for (let i = 0; i < SIMS; i++) {
    const { cA, cB } = simData(spec, m, R, rnd);
    const r = bootstrapRatio(cA, cB, { reps: SIM_BOOT, seed: seed + i + 1 });
    hw.push((Math.log(r.hi) - Math.log(r.lo)) / 2); hiF.push(r.hi / r.est); loF.push(r.est / r.lo); est.push(r.est);
  }
  return { hw: median(hw), hiF: median(hiF), loF: median(loF), sdLogEst: Math.sqrt(varS(est.map(Math.log))) };
}
const analytic = (spec, m) => Z90 * Math.sqrt(sum(spec.map((p) => p.s2Task + (p.s2A + p.s2B) / m)) / spec.length ** 2);
const pr = (e) => ({ s2Task: e.d.s2Task, s2A: e.d.s2A, s2B: e.d.s2B });

/** Kịch bản cho 5 bài thêm (B7b) ở phương án B. Năm bài đầu luôn dùng ước lượng t1–t5. */
function scenarios(m) {
  const e15 = EST[m]['t1–t5'], eB = EST[m]['B7b'], base = pr(e15);
  const bb = pr(eB), dbl = { s2Task: 2 * bb.s2Task, s2A: 2 * bb.s2A, s2B: 2 * bb.s2B };
  return [['K1: B7b cùng σ² với t1–t5', base], ['K2: B7b theo ước lượng riêng của B7b', bb], ['K3: B7b gấp đôi mọi σ² của ước lượng B7b', dbl]];
}
const designSpec = (m, which, add) => { const e15 = pr(EST[m]['t1–t5']); return which === 'A' ? Array(5).fill(e15) : [...Array(5).fill(e15), ...Array(5).fill(add)]; };

const T = {}, TITLES = {};
const sec = (id, title, body) => { T[id] = body; TITLES[id] = title; };
const IDS = [];
const add = (id, title, body) => { sec(id, title, body); IDS.push(id); };

// V-0 nhận dạng
{
  const c = (R, ts) => R.filter((r) => ts.includes(r.task)).length;
  const body = `| Mục | Giá trị |\n| --- | --- |\n| Script | ${SCRIPT_VERSION} |\n| Số dòng đã ghim (PIN_LINES) | ${PIN_LINES} (tệp hiện có ${fullBuf.toString('utf8').split('\n').filter((l) => l.trim()).length} dòng) |\n| Hash git (blob) \`runs.jsonl\` (phần ghim) | \`${gitBlob(runsBuf)}\` |\n| sha256 \`runs.jsonl\` (phần ghim, LF) | \`${sha256(runsBuf)}\` |\n| Lượt sau lọc (kept ∩ done): A0-sonnet / B7 | ${A0.length} / ${B7.length} |\n| Bài t1–t5: lượt A0 / B7 | ${c(A0, SETS['t1–t5'])} / ${c(B7, SETS['t1–t5'])} |\n| Bài B7b (${SETS.B7b.length} bài có cả hai arm): lượt A0 / B7 | ${c(A0, SETS.B7b)} / ${c(B7, SETS.B7b)} |\n| Hạt / vòng bootstrap σ² / mô phỏng độ rộng / mô phỏng điểm dừng | ${SEED} / ${BOOT} / ${SIMS}×${SIM_BOOT} / ${SIMS_STOP} |`;
  add('V-0', 'V-0. Nhận dạng dữ liệu, bộ lọc, tham số', body);
}

// V-1 σ²
{
  const body = [];
  for (const [m, lab] of METRICS) for (const set of Object.keys(SETS)) {
    const { d, boot } = EST[m][set];
    body.push([lab, set, `${d.T} bài; ${f(d.mu, 3)} (${rt(Math.exp(d.mu))})`, `${f(d.s2Task, 4)} ${ci(ci90(boot.task), 4)}`, `${f(d.s2Run, 4)} ${ci(ci90(boot.run), 4)}`, `${f(d.s2A, 4)} / ${f(d.s2B, 4)}`, d.s2Task > d.s2Run ? 'giữa bài > giữa lượt' : 'giữa bài ≤ giữa lượt', d.negative ? 'có (cắt ở 0)' : 'không']);
  }
  add('V-1', 'V-1. Tách phương sai log(B7/A0): σ²_task (giữa bài) và σ²_run (giữa lượt trong bài)', `σ²_task = phương sai thật giữa bài của log tỷ số (đã trừ phần nhiễu lấy mẫu của ô); σ²_run = σ²_A + σ²_B, phương sai một cặp log(B7/A0) giữa lượt trong bài. CI 90 % = bootstrap phân tầng hai mức (bài rồi lượt), ${BOOT} vòng. "TB log tỷ số" là trung bình theo bài của ℓ_t (tỷ số hình học, không phải thống kê prereg).\n\n` + tbl(['Đại lượng', 'Bộ bài', 'Số bài; TB log tỷ số', 'σ²_task [CI 90 %]', 'σ²_run [CI 90 %]', 'σ²_A / σ²_B', 'So sánh', 'σ²_task âm trước khi cắt'], body));
}

// V-2 CI dự kiến
const WIDTH = {};
{
  const body = [];
  for (const [m, lab] of METRICS) {
    const rowA = widthSim(designSpec(m, 'A'), 10, 1.3, SEED + 101);
    WIDTH[m] = { A: rowA, B: [] };
    body.push([lab, 'A: 10 lượt × 5 bài (t1–t5)', 'ước lượng t1–t5', f(analytic(designSpec(m, 'A'), 10), 3), f(rowA.hw, 3), `${rt(rowA.loF)} … ${rt(rowA.hiF)}`, f(rowA.sdLogEst, 3)]);
    for (const [name, addSpec] of scenarios(m)) {
      const r = widthSim(designSpec(m, 'B', addSpec), 5, 1.3, SEED + 202);
      WIDTH[m].B.push({ name, ...r, an: analytic(designSpec(m, 'B', addSpec), 5) });
      body.push([lab, 'B: 5 lượt × 10 bài (t1–t5 + 5 bài B7b)', name, f(analytic(designSpec(m, 'B', addSpec), 5), 3), f(r.hw, 3), `${rt(r.loF)} … ${rt(r.hiF)}`, f(r.sdLogEst, 3)]);
    }
  }
  add('V-2', 'V-2. Độ rộng CI 90 % dự kiến của tỷ số hình học theo phương án (R thật = 1,3)', `Cả hai phương án đều 100 lượt (50 B7′ + 50 A0, ghép cặp theo bài). "Nửa độ rộng (giải tích)" = 1,645·√(Σ_t(σ²_task,t + σ²_run,t/m)/T²) trên thang log; "nửa độ rộng (mô phỏng)" = trung vị qua ${SIMS} lần mô phỏng của (ln hi − ln lo)/2 với CI bootstrap đúng như \`prereg-tests.mjs\` (${SIM_BOOT} vòng mỗi lần); cột nhân tử = R̂/cận dưới … cận trên/R̂ (trung vị). Mô phỏng thường hẹp hơn giải tích khi T nhỏ (bootstrap lấy lại bài với T = 5 đánh giá thấp phương sai). Giả định cho 5 bài B7b: xem cột "kịch bản"; ước lượng B7b dựa trên A0 lấy từ cửa sổ khác (xem Giới hạn) nên σ²_task của B7b có thể bị thổi phồng.\n\n` + tbl(['Đại lượng', 'Phương án', 'Kịch bản σ² cho bài thêm', 'nửa độ rộng (giải tích)', 'nửa độ rộng (mô phỏng)', 'nhân tử CI quanh R̂', 'SD của ln R̂'], body));
}

// V-3 quy tắc phân bổ
let CHOSEN;
{
  const body = [], flags = [];
  for (const [m, lab] of METRICS) {
    const d = EST[m]['t1–t5'].d, w = WIDTH[m], k2 = w.B[1];
    const ruleVar = d.s2Task > d.s2Run, ruleWidth = k2.hw < w.A.hw;
    flags.push({ ruleVar, ruleWidth });
    body.push([lab, `${f(d.s2Task, 4)} vs ${f(d.s2Run, 4)} → ${ruleVar ? 'giữa bài lớn hơn' : 'giữa lượt lớn hơn hoặc bằng'}`, f(w.A.hw, 3), w.B.map((x) => `${x.name.slice(0, 2)} ${f(x.hw, 3)}`).join('; '), `${f(k2.hw - w.A.hw, 3)} (${ruleWidth ? 'B hẹp hơn' : 'B không hẹp hơn'})`]);
  }
  CHOSEN = flags.every((x) => x.ruleVar) && flags.every((x) => x.ruleWidth) ? 'B' : 'A';
  const gap = Math.max(...METRICS.map(([m]) => Math.abs(WIDTH[m].B[1].hw - WIDTH[m].A.hw)));
  const reason = CHOSEN === 'B'
    ? 'phương sai giữa bài lớn hơn giữa lượt ở cả hai đại lượng và B hẹp hơn A theo ước lượng riêng của B7b (K2)'
    : `điều kiện phương sai (giữa bài > giữa lượt) thỏa ở ${flags.filter((x) => x.ruleVar).length}/2 đại lượng, nhưng theo ước lượng riêng của B7b (K2) B không hẹp hơn A ở ${flags.filter((x) => !x.ruleWidth).length}/2 đại lượng; chênh độ rộng giữa hai phương án ≤ ${f(gap, 3)} trên thang log (gần hòa). B chỉ hơn rõ ở K1 (giả định B7b đồng nhất với t1–t5, chưa kiểm) và kém hơn ở K3. Giữ A: không phụ thuộc giả định chưa kiểm về B7b và ghép được với B7 cũ trên cùng 5 bài`;
  add('V-3', 'V-3. Áp quy tắc phân bổ của `improvement-backlog.md` §B-11.5 ("Độ rộng CI dự kiến")', `Quy tắc trong backlog (đề xuất, ngưỡng chưa kiểm): nếu phương sai giữa bài lớn hơn giữa lượt thì giữ tổng 100 lượt nhưng chia lại sang nhiều bài hơn (thêm bài từ B7b, ít lượt mỗi bài, A0 ghép cặp cùng bài); ngược lại thêm lượt trên cùng 5 bài. Áp dụng: so σ²_task với σ²_run của bộ t1–t5 (V-1) ở từng đại lượng. **Quy tắc phụ do script thêm (S2, cần vì điều kiện phương sai chưa nói B có thật sự hẹp hơn):** chỉ chọn B khi B còn hẹp hơn A theo mô phỏng với σ² của B7b ước lượng từ chính dữ liệu B7b (K2); K1 là cận lạc quan, K3 là cận bi quan. Điều kiện phương sai chỉ so σ²_run với σ²_task *không chia m*, nên không tự suy ra B hẹp hơn: B cũng đổi σ² của bài thêm.

` + tbl(['Đại lượng', 'σ²_task vs σ²_run (t1–t5)', 'nửa độ rộng A (mô phỏng)', 'nửa độ rộng B (K1; K2; K3)', 'B(K2) − A'], body) + `

**Phương án được chọn: ${CHOSEN}** — ${reason}.`);
}

// V-4 điểm dừng sau 20 lượt (10 cặp)
{
  const body = [];
  for (const [m, lab] of METRICS) {
    const e15 = pr(EST[m]['t1–t5']), addK = scenarios(m);
    const designs = [['A: 2 lượt × 5 bài (t1–t5)', Array(5).fill(e15), 2], [`B: 1 lượt × 10 bài (K1)`, designSpec(m, 'B', addK[0][1]), 1], [`B: 1 lượt × 10 bài (K3)`, designSpec(m, 'B', addK[2][1]), 1]];
    for (const [dn, spec, mm] of designs) for (const Rtrue of [1.3, 1.6, 2.0]) {
      const rnd = rng(SEED + 303 + Math.round(Rtrue * 10) + spec.length), est = [];
      for (let i = 0; i < SIMS_STOP; i++) { const { cA, cB } = simData(spec, mm, Rtrue, rnd); est.push(Math.exp(estPrereg(cA, cB))); }
      const P = (th) => est.filter((x) => x > th).length / est.length;
      body.push([lab, dn, f(Rtrue, 1), `${rt(median(est))} (${rt(q(est, 0.05))} … ${rt(q(est, 0.95))})`, pct(P(1.45)), pct(P(1.6)), pct(P(1.8))]);
    }
  }
  add('V-4', 'V-4. Điểm dừng: xác suất R̂ sau 20 lượt (10 cặp B7′/A0) vượt ngưỡng, theo R thật', `Mô phỏng tham số ${SIMS_STOP} lần mỗi dòng, σ² lấy từ V-1 (bộ t1–t5; K3 = B7b gấp đôi σ² của ước lượng B7b). R̂ là thống kê prereg (TB hình học theo bài của tỷ số các trung bình; không phải trung vị). 20 lượt = 10 B7′ + 10 A0 xen kẽ, phương án A đã hoàn thành 2 vòng lượt trên 5 bài, phương án B đã hoàn thành 1 vòng trên 10 bài. Cột "R̂: trung vị (5 %…95 %)" cho thấy độ phân tán của R̂. Đọc: nếu R thật = 1,3 mà P(R̂ > 1,6) đáng kể thì ngưỡng dừng 1,6 gây dừng nhầm; nếu R thật = 2,0 mà P(R̂ > 1,6) thấp thì ngưỡng bỏ sót.\n\n` + tbl(['Đại lượng', 'Phương án', 'R thật', 'R̂: trung vị (5 %…95 %)', 'P(R̂ > 1,45)', 'P(R̂ > 1,6)', 'P(R̂ > 1,8)'], body));
}

const render = (id) => `### ${TITLES[id]}\n\n${T[id]}\n`;
const args = process.argv.slice(2), ck = args.indexOf('--check'), ti = args.indexOf('--table');
if (ck >= 0) {
  const file = path.resolve(args[ck + 1]);
  const doc = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const miss = IDS.filter((id) => !doc.includes(render(id)));
  if (miss.length) { console.error(`LỆCH: bảng không trùng đầu ra script: ${miss.join(', ')}`); process.exit(1); }
  const m = doc.match(/sha256 `runs\.jsonl` \(phần ghim, LF\) \| `([0-9a-f]{64})`/);
  if (!m || m[1] !== sha256(runsBuf)) { console.error('LỆCH: hash runs.jsonl trong tệp không khớp phần đã ghim'); process.exit(1); }
  if (!doc.includes(`**Phương án được chọn: ${CHOSEN}**`)) { console.error('LỆCH: dòng phương án được chọn không khớp'); process.exit(1); }
  console.log(`OK: ${IDS.length} bảng trong ${args[ck + 1]} trùng đầu ra script; hash runs.jsonl khớp.`);
} else if (ti >= 0) {
  const id = args[ti + 1];
  if (!T[id]) { console.error(`Bảng không tồn tại: ${id} (có: ${IDS.join(', ')})`); process.exit(2); }
  process.stdout.write(render(id));
} else for (const id of IDS) console.log(render(id));
