#!/usr/bin/env node
// E8: song song có worktree (§9 V4-3f, bản chốt). Chỉ chạy khi đợt E8 đã xong.
//   node bench/vs-claude/e8/analyze.mjs bench/vs-claude/results/e8-parallel [--json]
// Chính: Δ = trung bình theo bài của (TB ln wallSecTask B6w4 − TB ln wallSecTask B6w1); exp(Δ) kèm CI bootstrap trong bài;
//        p hai phía bằng hoán vị nhãn arm trong bài (M = 10000, hạt giống 20261104). Phụ: cùng phép tính trên wallSec, token.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rng } from '../../../docs/research/analysis/g-mutation.mjs';

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

/** cells: { bài: { a: [giá trị], b: [giá trị] } } trên thang ln. Δ = trung bình theo bài của (TB a − TB b). */
export function deltaLn(cells) {
  const ds = Object.values(cells).filter((c) => c.a.length && c.b.length).map((c) => mean(c.a) - mean(c.b));
  return ds.length ? mean(ds) : NaN;
}

export function permP(cells, { M = 10000, seed = '20261104' } = {}) {
  const obs = Math.abs(deltaLn(cells));
  const r = rng(seed);
  let ge = 0;
  for (let m = 0; m < M; m++) {
    const sh = {};
    for (const [t, c] of Object.entries(cells)) {
      const all = [...c.a, ...c.b];
      for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
      sh[t] = { a: all.slice(0, c.a.length), b: all.slice(c.a.length) };
    }
    if (Math.abs(deltaLn(sh)) >= obs - 1e-12) ge++;
  }
  return (ge + 1) / (M + 1);
}

export function bootCI(cells, { B = 4000, seed = '20261104' } = {}) {
  const r = rng(`${seed}|boot`);
  const pick = (a) => a.map(() => a[Math.floor(r() * a.length)]);
  const v = [];
  for (let b = 0; b < B; b++) v.push(deltaLn(Object.fromEntries(Object.entries(cells).map(([t, c]) => [t, { a: pick(c.a), b: pick(c.b) }]))));
  v.sort((x, y) => x - y);
  return [v[Math.floor(0.025 * (B - 1))], v[Math.ceil(0.975 * (B - 1))]];
}

/** rows: dòng runs.jsonl. field: 'wallSecTask' | 'wallSec' | 'tokens.weighted'. */
export function cellsOf(rows, field, a = 'B6w4', b = 'B6w1') {
  const get = (r) => field.split('.').reduce((o, k) => o?.[k], r);
  const cells = {};
  for (const r of rows) {
    if (r.status !== 'done' || r.excluded || (r.arm !== a && r.arm !== b)) continue;
    const v = get(r);
    if (!(typeof v === 'number' && v > 0)) continue;
    const c = (cells[r.task] ??= { a: [], b: [] });
    (r.arm === a ? c.a : c.b).push(Math.log(v));
  }
  return cells;
}

export function analyze(rows, opts = {}) {
  const res = {};
  for (const f of ['wallSecTask', 'wallSec', 'tokens.weighted']) {
    const cells = cellsOf(rows, f);
    const d = deltaLn(cells);
    res[f] = { n: Object.fromEntries(Object.entries(cells).map(([t, c]) => [t, [c.a.length, c.b.length]])), delta: d, ratio: Math.exp(d), ci: bootCI(cells, opts).map(Math.exp), p: permP(cells, opts) };
  }
  const b6w1 = rows.filter((r) => r.status === 'done' && r.arm === 'B6w1');
  res.configCheck = { b6w1Runs: b6w1.length, b6w1Overlapping: b6w1.filter((r) => (r.maxConcSubtasks ?? 0) >= 2).length };
  res.overlapB6w4 = rows.filter((r) => r.status === 'done' && r.arm === 'B6w4' && (r.maxConcSubtasks ?? 0) >= 2).length;
  res.describe = describe(rows);
  return res;
}

/**
 * Mô tả theo arm (§9 E8 "Thước đo phụ"; BRIEF-19 K3 điều kiện 5): số lượt, số lượt có ≥ 2 hạng mục chạy cùng lúc, số lượt chia
 * dưới 2 hạng mục (có mốc), cổng kiểm tra cuối (`gate`: red/green/none), điểm và pass test ẩn (A0-sonnet làm mốc). Không p.
 */
export function describe(rows, arms = ['B6w4', 'B6w1', 'A0-sonnet']) {
  const out = {};
  for (const arm of arms) {
    const rs = rows.filter((r) => r.status === 'done' && !r.excluded && r.arm === arm);
    const sc = rs.map((r) => r.score).filter((x) => typeof x === 'number');
    const isCc = rs.some((r) => r.subtasksTimed !== undefined || r.maxConcSubtasks !== undefined);
    out[arm] = {
      n: rs.length,
      ...(isCc ? {
        overlapping: rs.filter((r) => (r.maxConcSubtasks ?? 0) >= 2).length,
        under2Subtasks: rs.filter((r) => (r.subtasksTimed ?? 0) < 2).length,
        gate: { red: rs.filter((r) => r.gate === 'red').length, green: rs.filter((r) => r.gate === 'green').length, none: rs.filter((r) => !r.gate || r.gate === 'none').length },
      } : {}),
      scoreMean: sc.length ? mean(sc) : null, pass: rs.filter((r) => r.pass === true).length,
    };
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dir = process.argv[2];
  const rows = fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const a = analyze(rows);
  if (process.argv.includes('--json')) console.log(JSON.stringify(a, null, 1));
  else {
    const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
    for (const [k, v] of Object.entries(a)) if (v.ratio !== undefined) console.log(`${k}: B6w4/B6w1 = ${f(v.ratio)} [${f(v.ci[0])}; ${f(v.ci[1])}], p = ${f(v.p, 4)}, n theo bài ${JSON.stringify(v.n)}`);
    console.log(`B6w1 có chạy chồng: ${a.configCheck.b6w1Overlapping}/${a.configCheck.b6w1Runs} (phải là 0). B6w4 có chạy chồng: ${a.overlapB6w4}.`);
    for (const [arm, d] of Object.entries(a.describe)) console.log(`${arm}: n ${d.n}${d.overlapping !== undefined ? `, chạy chồng ${d.overlapping}, chia < 2 hạng mục ${d.under2Subtasks}, cổng đỏ/xanh/không ${d.gate.red}/${d.gate.green}/${d.gate.none}` : ''}, điểm TB ${f(d.scoreMean)}, pass ${d.pass}/${d.n}`);
    console.log('σ_ln 0,178 của kế hoạch lấy từ arm một agent; dùng cho B6w1/B6w4 là giả định. Ước đó lệch xuống vì nhiều ô có σ = 0 do wallSec lượng tử theo vòng hỏi 10 s (BRIEF-19 K3 điều kiện 4). Server A và B lẫn với arm; chỉ suy ra cho 3 bài (điều kiện 6).');
  }
}
