#!/usr/bin/env node
// Ca biên của bench/vs-claude/lib/stats.mjs (D11), đặc tả F1–F12 và V1 ở docs/research/context/k2-stats-review-2026-11-04.md §3.
// Chỉ import, không sửa stats.mjs. Mỗi ca in hai cột:
//   "Mã vs S2"   : đầu ra thật của mã so với đầu ra S2 suy bằng tay ("Mã") → Đạt / Lệch
//   "Mã vs ĐK"   : đầu ra thật so với quy tắc đã đăng ký (preregistration.md) → Khớp / Lệch đăng ký (lỗi giao Phòng Phát triển)
//
//   node docs/research/analysis/d11-stats-edgecases.mjs                       in bảng F1–F12
//   node docs/research/analysis/d11-stats-edgecases.mjs --v1 <thư mục results>  thêm V1 (đếm nhánh 0/0 := 1 của H7)
// Node >= 22, không gói ngoài, không ghi tệp.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// Đông cứng bản trước D12 (8941103) để kết quả tái lập đúng K2 §10; bản sửa có test riêng ở bench/vs-claude/test/stats-k2.test.mjs.
import { tost, permTwoSample, bootP, h6Combine, permStratified, mulberry32 } from './vendor/stats-pre-d12.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const near = (x, y, e = 1e-9) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= e;
const isNull = (x) => x === null;
const fmt = (x) => (typeof x === 'number' ? (Number.isFinite(x) ? String(+x.toPrecision(6)) : String(x)) : JSON.stringify(x));
const cell = (task, a, b) => ({ task, a, b });
const rep = (v, n) => Array(n).fill(v);

/** rows: { id, ca, thuc, s2: boolean (khớp S2), dk: boolean|null (khớp đăng ký; null = không áp) , ghi } */
export function runEdgeCases() {
  const rows = [];
  const add = (id, ca, thuc, s2, dk, ghi = '') => rows.push({ id, ca, thuc, s2: !!s2, dk, ghi });

  // F1: suy biến không do trần
  {
    const cells = ['t1', 't2', 't3'].map((t) => cell(t, rep(0.7, 3), rep(0.7, 3)));
    const r = bootP(cells), tt = tost(cells, { margin: 0.05 });
    const s2 = isNull(r.p) && r.verdict === 'Không kết luận (trần/suy biến)' && r.ci90.every((v) => near(v, 0)) && r.nA1 === 3 && r.ceilingTasks.length === 0
      && near(tt.est, 0) && near(tt.lo90, 0) && near(tt.hi90, 0) && tt.equivalent === true;
    add('F1', 'bootP + tost, 3 bài a = b = 0,7 (suy biến không do trần)',
      `bootP: p=${fmt(r.p)}, ${r.verdict}, ci90=${fmt(r.ci90)}, nA1=${r.nA1}; tost: est=${fmt(tt.est)}, [${fmt(tt.lo90)}, ${fmt(tt.hi90)}], equivalent=${tt.equivalent}`,
      s2, tt.equivalent === false, 'T-1: tost cho equivalent = true trên phân phối suy biến; analyze.mjs:211 dùng h6.equiv ⇒ H6 SUPPORTED (sai theo P:107)');
  }
  // F2: trần mọi bài
  {
    const cells = ['t1', 't2', 't3', 't4'].map((t) => cell(t, [1, 1, 1], [1, 1, 1]));
    const r = bootP(cells);
    const s2 = r.ceilingTasks.length === 4 && r.nA1 === 0 && r.verdict === 'estimate' && isNull(r.p) && isNull(r.ci90) && isNull(r.k);
    add('F2', 'bootP, 4 bài trần hai phía', `ceil=${r.ceilingTasks.length}, nA1=${r.nA1}, ${r.verdict}, p=${fmt(r.p)}, ci90=${fmt(r.ci90)}`, s2, s2);
  }
  // F3: ngưỡng 0,99 và trần một phía
  {
    const cs = [
      ['i', [0.99, 0.99, 0.99], [0.99, 1, 1], true],
      ['ii', [1, 1, 1], [1, 1, 0.998], true],
      ['iii', [1, 1, 1], [1, 1, 0.98], false],
      ['iv', [1, 1, 1], [1, 1, 0.9899999], false],
    ].map(([k, a, b, ceil]) => ({ k, ceil, got: bootP([cell('x', a, b)]).ceilingTasks.length === 1 }));
    const s2 = cs.every((c) => c.got === c.ceil);
    add('F3', 'bootP, ngưỡng 0,99 và trần một phía (i)–(iv)', cs.map((c) => `(${c.k}) ${c.got ? 'trần' : 'giữ'}`).join('; '), s2, s2);
  }
  // F4: n = 0
  {
    const r0 = bootP([]);
    const r1 = bootP(['a', 'b', 'c'].map((t) => cell(t, [0.5, 0.6, 0.7], [0.6, 0.6, 0.8])), { taskSet: ['z1', 'z2'] });
    const ok = (r) => r.nA1 === 0 && r.verdict === 'estimate' && isNull(r.ci90) && isNull(r.p);
    add('F4', 'bootP, n = 0 (cells rỗng; 3 bài ngoài taskSet)', `rỗng: nA1=${r0.nA1}, ${r0.verdict}, ci90=${fmt(r0.ci90)}; ngoài taskSet: nA1=${r1.nA1}, ${r1.verdict}`, ok(r0) && ok(r1), ok(r0) && ok(r1));
  }
  // F5: n = 1, 2, 3
  {
    const mk = (n) => Array.from({ length: n }, (_, i) => cell(`t${i}`, [0.5, 0.6, 0.7], [0.6, 0.6, 0.8]));
    const rs = [1, 2, 3].map((n) => bootP(mk(n)));
    const tt = [1, 2].map((n) => tost(mk(n), { margin: 0.05 }));
    const s2 = [0, 1].every((i) => rs[i].verdict === 'estimate' && isNull(rs[i].p) && rs[i].ci90.length === 2 && rs[i].ci90.every(Number.isFinite))
      && rs[2].verdict === 'p' && rs[2].p >= 1 / 4001 && rs[2].p <= 1;
    add('F5', 'bootP n = 1, 2, 3 bài không chạm trần', rs.map((r, i) => `n=${i + 1}: ${r.verdict}, p=${fmt(r.p)}`).join('; ') + `; tost n=1,2 equivalent=${tt.map((t) => t.equivalent).join(',')}`, s2, s2, 'T-6: tost không có cổng n ≥ 3');
  }
  // F6: suy biến bị bác bỏ
  {
    const cells = ['t1', 't2', 't3'].map((t) => cell(t, [0.5, 0.5], [0.6, 0.6]));
    const r = bootP(cells);
    const s2 = isNull(r.p) && r.verdict === 'Bác bỏ' && r.ci90.every((v) => near(v, 0.1)) && isNull(r.k);
    add('F6', 'bootP, Δ* cố định +0,10', `p=${fmt(r.p)}, ${r.verdict}, ci90=${fmt(r.ci90)}`, s2, s2);
  }
  // F7: NaN
  {
    const cells = ['t1', 't2', 't3'].map((t) => cell(t, [NaN], [0.5]));
    const r = bootP(cells);
    const s2 = near(r.p, 1 / 4001) && r.verdict === 'p' && r.ci90.every(Number.isNaN);
    add('F7', 'bootP, a = [NaN], b = [0,5], 3 bài', `p=${fmt(r.p)}, ${r.verdict}, ci90=${fmt(r.ci90)}`, s2, isNull(r.p), 'B-1: đăng ký (P:107) cấm p = 1/(B+1) khi suy biến; lỗi, không phải chỗ lệch có chủ đích');
  }
  // F8: h6Combine
  {
    const est = bootP([], { arm: 'A1' }), est2 = bootP([], { arm: 'A2' });
    const mkP = (arm, shift) => bootP(['t1', 't2', 't3'].map((t) => cell(t, [0.5, 0.6, 0.7, 0.4], [0.5 + shift, 0.6, 0.7, 0.4])), { arm });
    const pa = mkP('A1', 0), pb = mkP('A2', 0);
    const rej = bootP(['t1', 't2', 't3'].map((t) => cell(t, [0.5, 0.5], [0.6, 0.6])), { arm: 'A1' });
    const deg = bootP(['t1', 't2', 't3'].map((t) => cell(t, [0.7, 0.7], [0.7, 0.7])), { arm: 'A2' });
    const a = h6Combine(est, est2);
    const b = h6Combine(est, pb);
    const c = h6Combine(rej, pb);
    const d = h6Combine(pa, deg);
    const e = h6Combine({ ...pa, p: 0.01, verdict: 'p' }, { ...pb, p: 0.03, verdict: 'p' });
    const sa = isNull(a.p) && a.verdict === 'estimate' && a.nA1 === 0 && a.nA2 === 0 && isNull(a.ci90.A1) && isNull(a.ci90.A2) && isNull(a.k.A1) && isNull(a.k.A2);
    const sb = b.verdict === 'estimate' && isNull(b.p);
    const sc = isNull(c.p) && c.verdict === 'Bác bỏ';
    const sd = isNull(d.p) && d.verdict === 'Không kết luận (trần/suy biến)';
    const se = near(e.p, 0.03) && e.verdict === 'p';
    add('F8', 'h6Combine (a) n=0 hai cặp; (b) estimate+p; (c) Bác bỏ+p; (d) Không kết luận+p; (e) p+p',
      `(a) ${a.verdict}/${fmt(a.p)}/nA1=${a.nA1}/nA2=${a.nA2}; (b) ${b.verdict}; (c) ${c.verdict}/${fmt(c.p)}; (d) ${d.verdict}/${fmt(d.p)}; (e) ${e.verdict}/${fmt(e.p)}`,
      sa && sb && sc && sd && se, sa && sb && sc && sd && se);
  }
  // F9: permTwoSample suy biến (H3)
  {
    const a = rep(1, 10), b = rep(1, 10);
    const rec = permTwoSample(a, b, { shift: -0.15, alt: 'greater' });
    const pre = permTwoSample(a, b, { shift: 0.05, alt: 'greater' });
    const empty = permTwoSample(a, [], {});
    const nan = permTwoSample(a, [NaN, NaN], {});
    const g = permTwoSample([0, 0], [1, 1], { alt: 'greater' }), two = permTwoSample([0, 0], [1, 1], { alt: 'two' });
    const s2 = rec.N === 184756 && near(rec.p, 1) && near(rec.pMin, 1 / 184756) && near(pre.p, 1 / 184756) && Math.max(rec.p, pre.p) === rec.p
      && isNull(empty.p) && empty.N === 0 && isNull(nan.p) && near(g.p, 1 / 6) && near(two.p, 2 / 6);
    add('F9', 'permTwoSample H3: 10×1,0 vs 10×1,0 (recall −0,15; precision +0,05); b rỗng/NaN; [0,0] vs [1,1]',
      `recall N=${rec.N}, p=${fmt(rec.p)}, pMin=${fmt(rec.pMin)}; precision p=${fmt(pre.p)}; rỗng p=${fmt(empty.p)}, N=${empty.N}; NaN p=${fmt(nan.p)}; greater p=${fmt(g.p)}, two p=${fmt(two.p)}`, s2, s2);
  }
  // F10: permStratified cơ bản
  {
    const i = permStratified([]);
    const ii = permStratified([cell('x', [0], [1])]);
    const iii = permStratified([cell('x', [1], []), cell('y', [0], [1])]);
    const iv = permStratified([cell('x', [1, 1], [1, 1]), cell('y', [1, 1], [1, 1])]);
    const v1 = permStratified([cell('x', [1, 1], [1, 1]), cell('y', [1, 1], [1, 1])], { maxExact: 1 });
    const v2 = permStratified([cell('x', [1, 1], [1, 1]), cell('y', [1, 1], [1, 1])], { maxExact: 1 });
    const si = i.n === 0 && i.nPerm === 0 && isNull(i.p) && Number.isNaN(i.tObs);
    const sii = ii.nPerm === 2 && near(ii.tObs, 1) && near(ii.p, 0.5) && near(ii.pMin, 0.5);
    const siii = iii.n === 1 && iii.skipped.length === 1 && iii.skipped[0] === 'x' && near(iii.p, 0.5);
    const siv = iv.nPerm === 36 && near(iv.tObs, 0) && near(iv.p, 1) && near(iv.pMin, 1 / 36);
    const sv = v1.exact === false && v1.nPerm === 10000 && near(v1.p * 10001, Math.round(v1.p * 10001)) && v1.p === v2.p;
    add('F10', 'permStratified cơ bản (i)–(v); S2 gọi "N" = trường `nPerm` của mã',
      `(i) n=${i.n}, nPerm=${i.nPerm}, p=${fmt(i.p)}; (ii) nPerm=${ii.nPerm}, tObs=${fmt(ii.tObs)}, p=${fmt(ii.p)}; (iii) n=${iii.n}, skipped=${fmt(iii.skipped)}, p=${fmt(iii.p)}; (iv) nPerm=${iv.nPerm}, p=${fmt(iv.p)}, pMin=${fmt(iv.pMin)}; (v) exact=${v1.exact}, nPerm=${v1.nPerm}, p=${fmt(v1.p)}, lặp lại ${v1.p === v2.p ? 'trùng' : 'KHÁC'}`,
      si && sii && siii && siv && sv, si && sii && siii && siv && sv);
  }
  // F11: permStratified trần có margin (H2′)
  {
    const r2 = permStratified([cell('x', [1, 1], [1, 1])], { alt: 'less', margin: 0.05 });
    const r5 = permStratified([cell('x', rep(1, 5), rep(1, 5))], { alt: 'less', margin: 0.05 });
    const s2 = r2.nPerm === 6 && near(r2.tObs, -0.05) && near(r2.p, 1 / 6) && r5.nPerm === 252 && near(r5.p, 1 / 252) && r5.p <= 0.0125;
    add('F11', 'permStratified H2′, 1 bài trần, less, margin 0,05, r = 2 và r = 5',
      `r=2: nPerm=${r2.nPerm}, tObs=${fmt(r2.tObs)}, p=${fmt(r2.p)}; r=5: nPerm=${r5.nPerm}, p=${fmt(r5.p)} (≤ 0,0125: ${r5.p <= 0.0125})`,
      s2, !(r5.p <= 0.0125), 'S-1: p_min giả chỉ vì trần; chặn khóa H2′');
  }
  // F12: B-01 log-tỉ số
  {
    const cells = [cell('t1', [1], [2]), cell('t2', [100], [100])];
    const t = tost(cells, { margin: Math.log(1.15), scale: 'logratio' });
    const ptEst = (Math.log(2 / 1) + Math.log(100 / 100)) / 2; // trung bình log-tỉ số theo bài (prereg-tests.mjs bootstrapRatio, P:80)
    const s2 = near(t.est, Math.log(51 / 50.5), 1e-9);
    add('F12', 'tost logratio: bài 1 a=[1], b=[2]; bài 2 a=[100], b=[100]',
      `analyze/stats: est=${fmt(t.est)} (R=${fmt(Math.exp(t.est))}); công thức prereg-tests/P:80: est=${fmt(ptEst)} (R=${fmt(Math.exp(ptEst))})`, s2, near(t.est, ptEst, 1e-6),
      'T-2: hai thống kê khác nhau trên cùng dữ liệu; PT tính inline ở đây từ công thức, không import');
  }
  return rows;
}

/** V1: đếm mẫu bootstrap của H7 rơi vào nhánh 0/0 := 1 (analyze.mjs:217). Lặp đúng lọc và hạt (SEED + 71) của analyze.mjs. */
export function runV1(dir) {
  const rows = fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    .filter((r) => r.status !== 'infra' && !r.excluded && !r.leak);
  const SUITE = path.join(HERE, '../../../bench/vs-claude/tasks');
  const setOf = (t) => { try { return JSON.parse(fs.readFileSync(path.join(SUITE, t, 'task.json'), 'utf8')).set; } catch { return undefined; } };
  const tasks = [...new Set(rows.map((r) => r.task))].sort().filter((t) => setOf(t) !== 'exploratory');
  const R = rows.filter((r) => tasks.includes(r.task));
  const cellOf = (arm, t) => R.filter((r) => r.arm === arm && r.task === t).map((r) => r.score).filter((v) => v !== undefined && v !== null).map(Number);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  const BASE = 'A0-sonnet', TREAT = 'B0';
  const ts = tasks.filter((t) => cellOf(BASE, t).length > 1 && cellOf(TREAT, t).length > 1);
  const pooled = (set, arm) => { let ss = 0, df = 0; for (const t of set) { const x = cellOf(arm, t); ss += sd(x) ** 2 * (x.length - 1); df += x.length - 1; } return df ? Math.sqrt(ss / df) : NaN; };
  const branch = (set) => { const a = pooled(set, BASE), b = pooled(set, TREAT); return a > 0 ? 'ratio' : (b === 0 ? 'zero' : 'inf'); };
  const est = (() => { const a = pooled(ts, BASE), b = pooled(ts, TREAT); return a > 0 ? b / a : (b === 0 ? 1 : Infinity); })();
  // Không tái tạo rnd chung của analyze.mjs: dùng mulberry32(SEED + 71) như analyze (rb riêng, không phụ thuộc rnd chung).
  const rb = mulberry32(20261102 + 71);
  let zero = 0, inf = 0, ratio = 0, n = 0;
  for (let i = 0; i < 4000 && ts.length; i++) {
    const set = ts.map(() => ts[Math.floor(rb() * ts.length)]);
    const br = branch(set);
    n++; if (br === 'zero') zero++; else if (br === 'inf') inf++; else ratio++;
  }
  const sdA0Zero = ts.filter((t) => sd(cellOf(BASE, t)) === 0).length;
  return { tasks: ts.length, sdA0Zero, est, mauNhanhZero: zero, mauNhanhInf: inf, mauNhanhRatio: ratio, B: n, tiLe0_0: n ? zero / n : NaN, duDoan: Math.pow(sdA0Zero / ts.length, ts.length) };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const rows = runEdgeCases();
  const mark = (b) => (b === null ? 'n/a' : b ? 'Khớp' : 'Lệch đăng ký');
  console.log('| ID | Ca | Đầu ra thật của mã | Mã vs S2 | Mã vs đăng ký | Ghi chú |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const r of rows) console.log(`| ${r.id} | ${r.ca} | ${r.thuc.replace(/\|/g, '/')} | ${r.s2 ? 'Đạt' : 'Lệch'} | ${mark(r.dk)} | ${r.ghi} |`);
  const nS2 = rows.filter((r) => !r.s2).length, nDk = rows.filter((r) => r.dk === false).length;
  console.log(`\nTổng: ${rows.length} ca; lệch so với S2: ${nS2}; lệch đăng ký: ${nDk} (${rows.filter((r) => r.dk === false).map((r) => r.id).join(', ') || 'không'}).`);
  const i = process.argv.indexOf('--v1');
  if (i > 0) console.log('\nV1 ' + JSON.stringify(runV1(path.resolve(process.argv[i + 1])), null, 2));
}
