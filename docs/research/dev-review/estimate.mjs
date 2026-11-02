#!/usr/bin/env node
// S4 — Ước lượng thí nghiệm bổ sung (không chạy benchmark, không phụ thuộc ngoài).
// Dùng:  node docs/research/dev-review/estimate.mjs [--md]
// Đọc: bench/vs-claude/results/runs.csv (+ C6 từ docs/research/performance/c6-extract/C6-runs.csv nếu results/ chưa có C6).
// Mọi tham số GIẢ ĐỊNH nằm ở khối ASSUME bên dưới; đổi ở đó rồi chạy lại.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const f = (p) => path.join(ROOT, p);

// ---------- GIẢ ĐỊNH (ghi rõ trong experiment-plan.md §2) ----------
const ASSUME = {
  alpha: 0.05, power: 0.8,           // công thức đã chốt: n = 2(z1-α/2 + z1-β)²σ²/Δ²
  relDelta: [0.10, 0.20],            // Δ mục tiêu = 10 % / 20 % trung bình của Claude Code (giả định)
  minRepsPerCell: 6,                 // yêu cầu (b)
  overheadPerRunS: 60,               // chấm test ẩn + dựng/dọn repo (giả định, chưa đo)
  // Bảng giá USD / triệu token — GIẢ ĐỊNH, CHƯA tra lại ngày 2/11/2026; chỉ dùng cho kịch bản đổi mô hình
  price: {
    sonnet: { in: 3, out: 15, read: 0.30, w5m: 3.75, w1h: 6.0 },
    opus:   { in: 5, out: 25, read: 0.50, w5m: 6.25, w1h: 10.0 },
  },
  largeTaskMinutes: 40, largeSuperlinear: 1.5, // bài lớn: wall = 40 phút; chi phí ∝ wall × 1.5 (ngữ cảnh phình)
  sweWallMult: 2, sweCostMult: 1.5,            // một instance SWE-bench ≈ 2× thời gian, 1.5× chi phí bài t1–t5 (giả định)
  cacheWrite: { claude: 'w1h', ccoding: 'w5m' }, // TTL ghi cache giả định theo hệ (T-0 trong token-analysis.md: Claude 1 giờ)
};

// ---------- CSV ----------
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [h, ...b] = rows.filter((r) => r.length > 1);
  return b.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
const num = (x) => (x === '' || x == null ? NaN : Number(x));

let runs = parseCsv(fs.readFileSync(f('bench/vs-claude/results/runs.csv'), 'utf8'));
const c6p = f('docs/research/performance/c6-extract/C6-runs.csv');
if (!runs.some((r) => r.run === 'C6') && fs.existsSync(c6p)) runs = runs.concat(parseCsv(fs.readFileSync(c6p, 'utf8')));
runs = runs.filter((r) => r.status === 'done');

// ---------- thống kê ----------
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => (a.length < 2 ? NaN : Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1)));
const z = { a: 1.959964, b: 0.841621 }; // z(0,975), z(0,80) — hằng chuẩn; khớp alpha/power ở ASSUME
const nReq = (sigma, delta) => (!(sigma > 0) || !(delta > 0) ? NaN : Math.ceil((2 * (z.a + z.b) ** 2 * sigma ** 2) / delta ** 2));
const fx = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '–');
const ms = (a, d = 1) => (a.length ? `${fx(mean(a), d)} ± ${fx(sd(a), d)}` : '–');
const k = (x) => (x < 1000 ? fx(x, 0) : fx(x / 1000, 1) + 'k');

const TASKS = ['t1-duration', 't2-orders', 't3-api', 't4-perf', 't5-logq'];
const grp = (task, sys, rounds) => runs.filter((r) => r.task === task && r.system === sys && rounds.includes(r.run));
const metrics = [
  ['wall_s', 'Thời gian (s)', 0], ['cost_usd', 'Chi phí (USD)', 3],
  ['input', 'Token vào', 0], ['output', 'Token ra', 0], ['cache_read', 'Đọc cache', 0], ['cache_write', 'Ghi cache', 0],
];
const out = [];
const P = (s = '') => out.push(s);

// Mốc so sánh phù hợp nhất: C5 + C6 (Claude Code = claude; CCoding = ccoding-fastlane)
const ROUNDS = ['C5', 'C6'];
const SYS = [['claude', 'Claude Code (opus)'], ['ccoding-fastlane', 'CCoding làn nhanh (sonnet)']];

P('## E-1. Trung bình ± độ lệch chuẩn theo bài và hệ (C5+C6, status=done)');
P();
P(`Nguồn: runs.csv${runs.some((r) => r.run === 'C6') ? ' + C6-runs.csv' : ''}; ${runs.length} lượt done tổng. sd là độ lệch mẫu (n−1), "–" khi n<2.`);
P();
P('| Bài | Hệ | n | ' + metrics.map((m) => m[1]).join(' | ') + ' |');
P('|---|---|---:|' + metrics.map(() => '---:').join('|') + '|');
const cell = {};
for (const t of TASKS) for (const [s, label] of SYS) {
  const g = grp(t, s, ROUNDS); cell[`${t}|${s}`] = g;
  P(`| ${t} | ${label} | ${g.length} | ` + metrics.map(([m, , d]) => ms(g.map((r) => num(r[m])), d)).join(' | ') + ' |');
}
const hung = grp('t3-api', 'ccoding-fastlane', ROUNDS).filter((r) => num(r.wall_s) > 500);
P();
P(hung.length ? `Lưu ý: ${hung.length} lượt t3 làn nhanh có wall_s > 500 s (${hung.map((r) => `${r.run}/rep${r.rep}=${r.wall_s}s`).join(', ')}; treo stdin theo HISTORY). Nó nằm trong bảng trên, nên sd của ô đó bị thổi phồng; E-2 tính cả hai cách.` : 'Không có lượt treo (>500 s).');

// ---------- E-2: số lượt cần ----------
P();
P('## E-2. Số lượt cần mỗi ô theo công thức đã chốt');
P();
P(`n = 2·(z₁₋α/₂ + z₁₋β)²·σ²/Δ², α = ${ASSUME.alpha}, power = ${ASSUME.power} (z = ${z.a}; ${z.b}); σ = sd gộp của hai hệ trong ô; Δ = ${ASSUME.relDelta.map((d) => d * 100 + ' %').join(' hoặc ')} trung bình của Claude Code (GIẢ ĐỊNH về Δ có ý nghĩa thực tế); n là số lượt mỗi hệ. Ô có <2 lượt ở một hệ không tính được σ → "–". "n dùng" = max(n, ${ASSUME.minRepsPerCell}).`);
P();
const pooledSd = (a, b) => {
  const na = a.length, nb = b.length; if (na < 2 || nb < 2) return NaN;
  return Math.sqrt(((na - 1) * sd(a) ** 2 + (nb - 1) * sd(b) ** 2) / (na + nb - 2));
};
function reqTable(label, excludeHung) {
  P(`**${label}**`); P();
  P('| Bài | Chỉ số | σ gộp | Δ=' + ASSUME.relDelta.map((d) => d * 100 + '%').join(' | Δ=') + ' | Δ quan sát (CCoding − Claude) | n theo Δ quan sát |');
  P('|---|---|---:|' + ASSUME.relDelta.map(() => '---:').join('|') + '|---:|---:|');
  const used = [];
  for (const t of TASKS) for (const m of ['wall_s', 'cost_usd']) {
    let b = cell[`${t}|claude`].map((r) => num(r[m]));
    let a = cell[`${t}|ccoding-fastlane`].filter((r) => !(excludeHung && num(r.wall_s) > 500)).map((r) => num(r[m]));
    const s = pooledSd(a, b), mb = mean(b);
    const ns = ASSUME.relDelta.map((d) => nReq(s, d * mb));
    const dObs = mean(a) - mb;
    const nObs = nReq(s, Math.abs(dObs));
    P(`| ${t} | ${m === 'wall_s' ? 'thời gian' : 'chi phí'} | ${fx(s, m === 'wall_s' ? 1 : 3)} | ${ns.map((x) => fx(x, 0)).join(' | ')} | ${fx(dObs, m === 'wall_s' ? 1 : 3)} | ${fx(nObs, 0)} |`);
    if (m === 'wall_s') used.push(ns[ns.length - 1]);
  }
  P();
  return used;
}
const u1 = reqTable('E-2a. Giữ mọi lượt', false);
const u2 = reqTable('E-2b. Bỏ lượt treo stdin (phân tích độ nhạy, hậu nghiệm)', true);
const worst1 = Math.max(...u1.filter(Number.isFinite)), worst = Math.max(...u2.filter(Number.isFinite));
const NCAP = 12; // trần thực tế do ngân sách (giả định); n công thức vượt trần thì ghi rõ thiếu lực
const nCell = Math.max(ASSUME.minRepsPerCell, Math.min(worst, NCAP));
P(`Thời gian, Δ = ${ASSUME.relDelta[1] * 100} %: n lớn nhất = ${fx(worst1, 0)} khi giữ lượt treo (E-2a) và ${fx(worst, 0)} khi bỏ nó (E-2b, cơ sở chốt). Chốt tổng n = max(${ASSUME.minRepsPerCell}, min(n E-2b, ${NCAP})) = **${nCell}** lượt/hệ/ô: ${ASSUME.minRepsPerCell} ở gói MVP, phần còn lại ở gói mở rộng (A+). ${worst > NCAP ? 'n công thức vượt trần ' + NCAP + ' nên ô thời gian có σ lớn (t2, t3; sd ước lượng từ n = 2–4 nên bản thân không chắc) vẫn thiếu lực ở Δ = 20 %; báo CI, không báo p.' : ''} Ô chi phí cần nhiều hơn (σ lớn so với Δ), xem bảng.`);

// ---------- E-3: đơn giá mỗi lượt ----------
P();
P('## E-3. Đơn giá mỗi lượt và kiểm tra bảng giá giả định');
P();
const cost = (tok, model, sys) => {
  const p = ASSUME.price[model];
  return (tok.input * p.in + tok.output * p.out + tok.read * p.read + tok.write * p[ASSUME.cacheWrite[sys]]) / 1e6;
};
const per = {};
for (const [s] of SYS) {
  const g = runs.filter((r) => r.system === s && ROUNDS.includes(r.run));
  per[s] = {
    n: g.length, wall: mean(g.map((r) => num(r.wall_s))), usd: mean(g.map((r) => num(r.cost_usd))),
    tok: { input: mean(g.map((r) => num(r.input))), output: mean(g.map((r) => num(r.output))), read: mean(g.map((r) => num(r.cache_read))), write: mean(g.map((r) => num(r.cache_write))) },
  };
}
P('| Hệ | n lượt | wall TB (s) | USD TB (quan sát) | vào | ra | đọc cache | ghi cache | USD theo bảng giả định, model gốc | USD theo bảng giả định, sonnet | USD theo bảng giả định, opus |');
P('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const [s, label] of SYS) {
  const p = per[s], own = s === 'claude' ? 'opus' : 'sonnet';
  p.model = { own: cost(p.tok, own, s === 'claude' ? 'claude' : 'ccoding'), sonnet: cost(p.tok, 'sonnet', s === 'claude' ? 'claude' : 'ccoding'), opus: cost(p.tok, 'opus', s === 'claude' ? 'claude' : 'ccoding') };
  P(`| ${label} | ${p.n} | ${fx(p.wall, 0)} | ${fx(p.usd, 3)} | ${k(p.tok.input)} | ${k(p.tok.output)} | ${k(p.tok.read)} | ${k(p.tok.write)} | ${fx(p.model.own, 3)} | ${fx(p.model.sonnet, 3)} | ${fx(p.model.opus, 3)} |`);
}
const calib = { claude: per.claude.usd / per.claude.model.own, ccoding: per['ccoding-fastlane'].usd / per['ccoding-fastlane'].model.own };
P();
P(`Hiệu chuẩn (USD quan sát / USD theo bảng giả định ở model gốc): Claude Code ${fx(calib.claude, 2)}, CCoding ${fx(calib.ccoding, 2)}. Gần 1 ⇒ bảng giả định không lệch xa; lệch nhiều ⇒ tin số quan sát hơn. Kịch bản đổi model dưới đây = USD quan sát × (USD bảng giả định ở model mới / USD bảng giả định ở model gốc), tức mang theo hệ số hiệu chuẩn. Token giả định không đổi khi đổi model (thực tế có thể khác: Sonnet có thể dùng nhiều lượt hơn).`);

// ---------- E-4: các gói ----------
const swap = (sys, to) => per[sys].usd * (per[sys].model[to] / per[sys].model.own);
const usd = {
  claudeOpus: per.claude.usd, claudeSonnet: swap('claude', 'sonnet'),
  ccSonnet: per['ccoding-fastlane'].usd, ccOpus: swap('ccoding-fastlane', 'opus'),
};
const wallC = per.claude.wall, wallF = per['ccoding-fastlane'].wall;
const meanWall = (wallC + wallF) / 2, meanUsd = (usd.claudeOpus + usd.ccSonnet) / 2;
const N = ASSUME.minRepsPerCell, NX = nCell - N;
// mỗi gói: {id, tên, jobs:[{label, runs, wall, usd}], conc}
const pk = [];
const add = (id, name, tier, conc, jobs, note) => pk.push({ id, name, tier, conc, jobs, note });
add('A', `Cùng mô hình (Sonnet cả hai), 5 bài t1–t5, ${N} lượt`, 'MVP', 2, [
  { label: `Claude Code sonnet ×${N}×5`, runs: N * 5, wall: wallC, usd: usd.claudeSonnet },
  { label: `CCoding làn nhanh sonnet ×${N}×5`, runs: N * 5, wall: wallF, usd: usd.ccSonnet },
], 'Wall của Claude khi dùng sonnet lấy bằng wall opus quan sát (giả định; Sonnet có thể nhanh hơn).');
if (NX > 0) add('A+', `Bổ sung ${NX} lượt/hệ/ô cho gói A (tổng ${nCell}), Sonnet cả hai`, 'Mở rộng', 2, [
  { label: `Claude Code sonnet ×${NX}×5`, runs: NX * 5, wall: wallC, usd: usd.claudeSonnet },
  { label: `CCoding làn nhanh sonnet ×${NX}×5`, runs: NX * 5, wall: wallF, usd: usd.ccSonnet },
], 'Đạt n công thức (hoặc trần).');
add('A2', `Cùng mô hình (Opus cả hai), t1–t5, ${N} lượt`, 'Mở rộng', 2, [
  { label: `Claude Code opus ×${N}×5`, runs: N * 5, wall: wallC, usd: usd.claudeOpus },
  { label: `CCoding làn nhanh opus ×${N}×5`, runs: N * 5, wall: wallF, usd: usd.ccOpus },
], 'Chi phí CCoding opus ngoại suy bằng bảng giá giả định.');
const lg = ASSUME.largeTaskMinutes * 60, lgMult = lg / meanWall;
const NL = 6;
add('C', `2 bài lớn (~${ASSUME.largeTaskMinutes} phút), sonnet cả hai`, 'MVP', 2, [
  { label: `Claude Code ×${NL}×2`, runs: NL * 2, wall: lg, usd: usd.claudeSonnet * lgMult * ASSUME.largeSuperlinear },
  { label: `CCoding ×${NL}×2`, runs: NL * 2, wall: lg, usd: usd.ccSonnet * lgMult * ASSUME.largeSuperlinear },
], `Quy mô từ t1–t5: wall × ${fx(lgMult, 1)}, chi phí × ${fx(lgMult * ASSUME.largeSuperlinear, 1)}. Cần nâng claudeTimeoutMin/ccodingTimeoutMin lên ≥ 90.`);
add('C3', 'Bài lớn thứ 3 (bổ sung)', 'Mở rộng', 2, [
  { label: `Claude Code ×${NL}`, runs: NL, wall: lg, usd: usd.claudeSonnet * lgMult * ASSUME.largeSuperlinear },
  { label: `CCoding ×${NL}`, runs: NL, wall: lg, usd: usd.ccSonnet * lgMult * ASSUME.largeSuperlinear },
], 'Đủ "≥ 3 bài > 15 phút" của D4.');
const NS = 20;
add('D', `SWE-bench Verified: ${NS} instance × 1 lượt`, 'MVP', 2, [
  { label: `Claude Code ×${NS}`, runs: NS, wall: wallC * ASSUME.sweWallMult, usd: usd.claudeSonnet * ASSUME.sweCostMult },
  { label: `CCoding ×${NS}`, runs: NS, wall: wallF * ASSUME.sweWallMult, usd: usd.ccSonnet * ASSUME.sweCostMult },
], 'Thêm chi phí chấm bằng Docker (không tính ở đây). Cần máy Linux/WSL2.');
add('D2', 'SWE-bench Verified mở rộng: +40 instance (tổng 60)', 'Mở rộng', 2, [
  { label: 'Claude Code ×40', runs: 40, wall: wallC * ASSUME.sweWallMult, usd: usd.claudeSonnet * ASSUME.sweCostMult },
  { label: 'CCoding ×40', runs: 40, wall: wallF * ASSUME.sweWallMult, usd: usd.ccSonnet * ASSUME.sweCostMult },
], '');
const NR = 3;
add('E', `Runtime khác: anthropic-api và codex-cli, ${NR} bài (t2,t3,t5) × ${NR} lượt, chỉ CCoding`, 'Mở rộng', 2, [
  { label: `anthropic-api ×${NR * NR}`, runs: NR * NR, wall: wallF, usd: usd.ccSonnet },
  { label: `codex-cli ×${NR * NR}`, runs: NR * NR, wall: wallF * 1.5, usd: usd.ccSonnet },
], 'Chi phí codex-cli lấy bằng chi phí sonnet (giả định thô — thực tế tính theo gói OpenAI); wall × 1,5 theo ghi chú "Codex chậm" trong RUNTIMES.md (định tính). Không có đối chứng Claude Code ở runtime khác.');
const confirmN = 6, tasksDev = 5;
const armsP = 4; // control + P1, P2, P3
add('F1', `A/B P1–P3, pha thăm dò: ${tasksDev} bài × 3 lượt × (A + 3 nhánh)`, 'MVP', 2, [
  { label: `CCoding làn nhanh ×${tasksDev * 3 * armsP}`, runs: tasksDev * 3 * armsP, wall: wallF, usd: usd.ccSonnet },
], 'Dùng chung một nhánh đối chứng A cho 3 bản vá (design.md §5.3 tính 2 nhánh mỗi bản vá = 90 lượt; dùng chung A còn 60).');
add('F2', `A/B P1–P3, pha xác nhận: ${tasksDev} bài × ${confirmN} lượt × (A + 3 nhánh)`, 'Mở rộng', 2, [
  { label: `CCoding làn nhanh ×${tasksDev * confirmN * armsP}`, runs: tasksDev * confirmN * armsP, wall: wallF, usd: usd.ccSonnet },
], 'design.md §5.3: 5 bài × 6 lượt × 2 nhánh = 60 cho MỖI bản vá; dùng chung A: 120.');
add('F3', 'A/B tập giữ lại t6–t8: 3 bài × 6 lượt × (A + ≤ 2 bản vá thắng)', 'Mở rộng', 2, [
  { label: 'CCoding làn nhanh ×54', runs: 3 * 6 * 3, wall: wallF, usd: usd.ccSonnet },
], 'Chỉ chạy MỘT lần, sau khi chốt bản vá (design.md §5.4). Phải viết t6–t8 trước (chi phí viết bài không tính ở đây).');

P();
P('## E-4. Ước lượng theo gói');
P();
P(`Công thức: số lượt = Σ lượt các dòng; thời gian thực ≈ Σ_dòng[lượt × (wall + ${ASSUME.overheadPerRunS} s)] / hệ số đồng thời (hai hệ của một ô chạy cùng lúc nên hệ số = số luồng song song --concurrency); USD = Σ lượt × USD/lượt (E-3, đã đổi model nếu cần); token = Σ lượt × token TB/lượt của hệ (E-3; bài lớn/SWE nhân cùng hệ số với USD, bỏ siêu tuyến tính). Thời gian là ước lượng **cận dưới theo trung bình**; đồng thời cao thêm nhiễu chung tài nguyên (xem rủi ro trong experiment-plan.md §6).`);
P();
P('| Gói | Tầng | Mô tả | Lượt | Thời gian thực (giờ) | Token vào+ra (triệu) | Token cache (triệu) | USD (giả định) | Đồng thời |');
P('|---|---|---|---:|---:|---:|---:|---:|---:|');
const rows = [];
for (const p of pk) {
  let runsN = 0, secs = 0, usdT = 0, tio = 0, tc = 0;
  for (const j of p.jobs) {
    runsN += j.runs; secs += j.runs * (j.wall + ASSUME.overheadPerRunS); usdT += j.runs * j.usd;
    const sys = /Claude Code/.test(j.label) ? 'claude' : 'ccoding-fastlane';
    const sc = j.usd / per[sys].usd; // hệ số quy mô chi phí so với quan sát (cũng áp cho token)
    tio += j.runs * (per[sys].tok.input + per[sys].tok.output) * (j.wall > 1500 || /SWE/.test(p.name) ? sc : 1);
    tc += j.runs * (per[sys].tok.read + per[sys].tok.write) * (j.wall > 1500 || /SWE/.test(p.name) ? sc : 1);
  }
  const hours = secs / p.conc / 3600;
  rows.push({ ...p, runsN, hours, usdT, tio, tc });
  P(`| ${p.id} | ${p.tier} | ${p.name} | ${runsN} | ${fx(hours, 1)} | ${fx(tio / 1e6, 2)} | ${fx(tc / 1e6, 1)} | ${fx(usdT, 0)} | ${p.conc} |`);
}
const sum = (tier) => rows.filter((r) => r.tier === tier).reduce((a, r) => ({ n: a.n + r.runsN, h: a.h + r.hours, u: a.u + r.usdT }), { n: 0, h: 0, u: 0 });
const mv = sum('MVP'), ex = sum('Mở rộng');
P();
P(`**Tổng MVP**: ${mv.n} lượt · ${fx(mv.h, 1)} giờ thực · ≈ ${fx(mv.u, 0)} USD. **Tổng mở rộng (thêm)**: ${ex.n} lượt · ${fx(ex.h, 1)} giờ · ≈ ${fx(ex.u, 0)} USD.`);
const cap = 200;
P(`So trần chi phí ví dụ \`maxCostUsd\` = ${cap} (config.example.json): MVP ${mv.u > cap ? 'VƯỢT' : 'nằm trong'} trần; MVP + mở rộng ${mv.u + ex.u > cap ? 'VƯỢT' : 'nằm trong'} trần. Đặt trần theo từng gói, không theo cả đợt.`);
P();
P('Ghi chú tính ghi cache: ghi cache chiếm phần lớn USD của CCoding (≈ 50 % theo T-e0). Đồng thời ≤ 2 để không dồn rate limit; đây là đề xuất, chưa đo.');

// ---------- ra ----------
const text = out.join('\n') + '\n';
console.log(`# estimate.mjs — ${new Date().toISOString().slice(0, 10)} — ${runs.length} lượt done đọc được\n`);
console.log(text);
// Chốt: kiểm tra tối thiểu để exit 0 chỉ khi dữ liệu đủ
const bad = TASKS.filter((t) => ROUNDS.some(() => cell[`${t}|claude`].length === 0 || cell[`${t}|ccoding-fastlane`].length === 0));
if (bad.length) { console.error('Thiếu dữ liệu ô: ' + bad.join(', ')); process.exit(2); }
