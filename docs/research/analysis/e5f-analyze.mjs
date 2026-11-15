#!/usr/bin/env node
// V4-3e-E5′ (preregistration.md §9): B-15 chính, họp ở làn đầy đủ ép. Phân tích đúng (5)–(8), không p.
//   node docs/research/analysis/e5f-analyze.mjs [bench/vs-claude/results/b15f-main/runs.jsonl] [--subtasks <tệp JSON khóa→số hạng mục>] [--json]
// Chính: R̂ = B1F/B0F của token có trọng số = exp(TB theo bài của ln(TB B1F / TB B0F)), CI 90 % bootstrap hai tầng
//        (lấy lại bài, rồi lấy lại lượt trong ô), 4000 vòng, hạt 20261104 (bootstrapRatio của prereg-tests.mjs, phương án A).
//        CI chứa 1 → "không phân biệt được".
// Loại (8): lượt B0F không có byPhase.discuss bị loại kèm cặp B1F cùng (bài, rep); cộng §4.1/§4.3 (status ≠ done, leak).
// Phụ: wallSec (cùng cách), điểm test ẩn (TB theo bài của hiệu TB, CI 90 % bootstrap hai tầng), tỉ lệ pass, byPhase.discuss/finalize,
//      USD (ngoài họ Holm). Độ nhạy: không loại lượt nào.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapRatio, mean, rng } from './prereg-tests.mjs';

export const SEED = 20261104;
export const REPS = 4000;
const TASKS = ['l1-modules', 'l2-chain'];

/** Bootstrap hai tầng cho hiệu TB (B − A) theo bài, CI mức `level`. */
export function bootstrapDiff(cellsA, cellsB, { reps = REPS, seed = SEED, level = 0.9 } = {}) {
  const T = cellsA.length;
  const d = (a, b) => mean(b) - mean(a);
  const est = mean(cellsA.map((_, t) => d(cellsA[t], cellsB[t])));
  const rnd = rng(seed), boots = [];
  const re = (a) => a.map(() => a[Math.floor(rnd() * a.length)]);
  for (let i = 0; i < reps; i++) { let s = 0; for (let j = 0; j < T; j++) { const t = Math.floor(rnd() * T); s += d(re(cellsA[t]), re(cellsB[t])); } boots.push(s / T); }
  boots.sort((x, y) => x - y);
  const al = (1 - level) / 2;
  return { est, lo: boots[Math.floor(al * reps)], hi: boots[Math.min(reps - 1, Math.floor((1 - al) * reps))] };
}

export function select(rows, { exclude = true } = {}) {
  const done = rows.filter((r) => r.status === 'done' && !r.excluded);
  const leak = done.filter((r) => r.leak);
  const usable = done.filter((r) => !r.leak);
  const noDiscuss = usable.filter((r) => r.arm === 'B0F' && !(r.byPhase && 'discuss' in r.byPhase)).map((r) => `${r.task}|${r.rep}`);
  const drop = new Set(exclude ? noDiscuss : []);
  const kept = usable.filter((r) => !drop.has(`${r.task}|${r.rep}`));
  return { kept, excludedPairs: [...drop], leak: leak.map((r) => r.key), notDone: rows.filter((r) => r.status !== 'done').map((r) => `${r.key}:${r.status}`) };
}

export function analyze(rows, { exclude = true, subtasks = null } = {}) {
  const { kept, excludedPairs, leak, notDone } = select(rows, { exclude });
  const cells = (arm, f) => TASKS.map((t) => kept.filter((r) => r.task === t && r.arm === arm).map(f));
  const ratio = (f) => { const r = bootstrapRatio(cells('B0F', f), cells('B1F', f), { reps: REPS, seed: SEED, level: 0.9, margin: [0.85, 1.15] }); return { est: r.est, lo: r.lo, hi: r.hi, verdict: !Number.isFinite(r.lo) ? 'thiếu dữ liệu' : r.lo <= 1 && r.hi >= 1 ? 'không phân biệt được' : r.hi < 1 ? 'B1F thấp hơn' : 'B1F cao hơn' }; };
  const n = Object.fromEntries(TASKS.map((t) => [t, { B0F: kept.filter((r) => r.task === t && r.arm === 'B0F').length, B1F: kept.filter((r) => r.task === t && r.arm === 'B1F').length }]));
  const per = {};
  for (const arm of ['B0F', 'B1F']) {
    const rs = kept.filter((r) => r.arm === arm);
    per[arm] = {
      n: rs.length,
      weightedMean: mean(rs.map((r) => r.tokens.weighted)), wallSecMean: mean(rs.map((r) => r.wallSec)),
      scoreMean: mean(rs.map((r) => r.score)), pass: rs.filter((r) => r.pass).length,
      usd: rs.reduce((s, r) => s + (r.costUsd ?? 0), 0),
      discuss: rs.filter((r) => r.byPhase && 'discuss' in r.byPhase).length, finalize: rs.filter((r) => r.byPhase && 'finalize' in r.byPhase).length,
      discussShare: mean(rs.map((r) => ((r.byPhase?.discuss ?? 0) + (r.byPhase?.finalize ?? 0)) / r.tokens.weighted)),
      review: rs.filter((r) => r.byPhase && 'review' in r.byPhase).length, revise: rs.filter((r) => r.byPhase && 'revise' in r.byPhase).length,
      ...(subtasks ? { subtasksMean: mean(rs.map((r) => subtasks[r.key]).filter((x) => Number.isFinite(x))), subtasksKnown: rs.filter((r) => Number.isFinite(subtasks[r.key])).length } : {}),
      byTask: Object.fromEntries(TASKS.map((t) => { const x = rs.filter((r) => r.task === t); return [t, { n: x.length, weightedMean: mean(x.map((r) => r.tokens.weighted)), wallSecMean: mean(x.map((r) => r.wallSec)), scoreMean: mean(x.map((r) => r.score)), pass: x.filter((r) => r.pass).length }]; })),
    };
  }
  const sd = bootstrapDiff(cells('B0F', (r) => r.score), cells('B1F', (r) => r.score));
  return { n, excludedPairs, leak, notDone, weighted: ratio((r) => r.tokens.weighted), wallSec: ratio((r) => r.wallSec), score: sd, per };
}

const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
export function report(main, sens) {
  const L = ['# E5′ (V4-3e-E5′): bỏ họp ở làn đầy đủ ép, B1F so với B0F', ''];
  const block = (a, title) => {
    L.push(`## ${title}`, '', `Số lượt dùng: ${JSON.stringify(a.n)}. Cặp bị loại theo (8): ${a.excludedPairs.length ? a.excludedPairs.join(', ') : '0'}. Lượt rò rỉ: ${a.leak.length}. Dòng không \`done\`: ${a.notDone.length} (${a.notDone.join(', ') || '—'}).`, '');
    L.push('| Đại lượng | R̂ hoặc Δ (B1F so với B0F) | CI 90 % | Đọc |', '|---|---|---|---|');
    L.push(`| Token có trọng số (chính) | R̂ = ${f(a.weighted.est)} | [${f(a.weighted.lo)}; ${f(a.weighted.hi)}] | ${a.weighted.verdict} |`);
    L.push(`| Thời gian thực (phụ) | R̂ = ${f(a.wallSec.est)} | [${f(a.wallSec.lo)}; ${f(a.wallSec.hi)}] | ${a.wallSec.verdict} |`);
    L.push(`| Điểm test ẩn (phụ) | Δ = ${f(a.score.est)} | [${f(a.score.lo)}; ${f(a.score.hi)}] | ${a.score.lo <= 0 && a.score.hi >= 0 ? 'không phân biệt được' : a.score.hi < 0 ? 'B1F thấp hơn' : 'B1F cao hơn'} |`, '');
    L.push('| Arm | n | Token có trọng số TB | Thời gian TB (s) | Điểm TB | pass | USD | có discuss | có finalize | phần họp TB | có review | có revise |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const [arm, p] of Object.entries(a.per)) L.push(`| ${arm} | ${p.n} | ${Math.round(p.weightedMean).toLocaleString('vi-VN')} | ${f(p.wallSecMean, 0)} | ${f(p.scoreMean)} | ${p.pass}/${p.n} | ${f(p.usd, 2)} | ${p.discuss} | ${p.finalize} | ${f(100 * p.discussShare, 1)} % | ${p.review} | ${p.revise} |`);
    L.push('', '| Arm × bài | n | Token TB | Thời gian TB (s) | Điểm TB | pass |', '|---|---|---|---|---|---|');
    for (const [arm, p] of Object.entries(a.per)) for (const [t, x] of Object.entries(p.byTask)) L.push(`| ${arm} × ${t} | ${x.n} | ${Math.round(x.weightedMean).toLocaleString('vi-VN')} | ${f(x.wallSecMean, 0)} | ${f(x.scoreMean)} | ${x.pass}/${x.n} |`);
    if (a.per.B0F.subtasksMean !== undefined) L.push('', `Số hạng mục kế hoạch TB: B0F ${f(a.per.B0F.subtasksMean, 2)} (${a.per.B0F.subtasksKnown} lượt có số), B1F ${f(a.per.B1F.subtasksMean, 2)} (${a.per.B1F.subtasksKnown} lượt).`);
    L.push('');
  };
  block(main, 'Phân tích chính (có quy tắc loại (8))');
  block(sens, 'Độ nhạy: không loại lượt nào');
  L.push('Ghi chú: R̂ là TB hình học theo bài của tỉ số các trung bình; hai bài nên CI rộng (không tuyên bố độ chính xác 0,218 của phương án A). Không p, theo (6).');
  return L.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--subtasks') ?? 'bench/vs-claude/results/b15f-main/runs.jsonl';
  const si = args.indexOf('--subtasks');
  const subtasks = si >= 0 ? JSON.parse(fs.readFileSync(args[si + 1], 'utf8')) : null;
  const rows = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const main = analyze(rows, { exclude: true, subtasks }), sens = analyze(rows, { exclude: false, subtasks });
  console.log(args.includes('--json') ? JSON.stringify({ main, sens }, null, 1) : report(main, sens));
}
