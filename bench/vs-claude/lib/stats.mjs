// Thư viện thống kê thuần cho bench/vs-claude (suite-review §5: SR-20, SR-04, SR-26, SR-25).
// Chỉ hàm thuần: không đọc tệp, không dùng trạng thái chung. Mỗi hàm có hạt tự tạo bộ sinh riêng,
// nên không đụng `rnd()` của analyze.mjs (p của H1–H10 hiện có không đổi).
// Quy ước ô: cells = [{ task, a: number[], b: number[] }]; a = BASE (hoặc B0), b = TREAT (hoặc A1/A2).

const EPS = 1e-12;

const mean = (x) => (x.length ? x.reduce((s, v) => s + v, 0) / x.length : NaN);

// ---------- SR-20: bộ sinh có hạt ----------

/** mulberry32: trả hàm () => [0, 1). Cùng hạt ⇒ cùng chuỗi. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates: trả bản xáo mới, không sửa mảng vào. */
export function fisherYates(arr, rnd) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------- SR-04: TOST dùng chung ----------

const quantile = (sorted, q) => {
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

/**
 * Tương đương (TOST) bằng CI bootstrap hai tầng (bài → lượt). `b` là TREAT, `a` là BASE.
 * scale 'diff': thống kê = TB theo bài của (mean(b) − mean(a)); margin cùng đơn vị điểm.
 * scale 'logratio': thống kê = ln(TB theo bài mean(b) / TB theo bài mean(a)); margin theo ln (vd. ln 1.1).
 * CI (1 − 2·alpha) = [alpha, 1 − alpha]; equivalent ⇔ CI nằm trọn trong [−margin, +margin].
 */
export function tost(cells, { margin, alpha = 0.05, B = 4000, seed = 20261102, scale = 'diff' } = {}) {
  const cs = cells.filter((c) => c.a?.length && c.b?.length);
  const stat = (ma, mb) => (scale === 'logratio' ? Math.log(mean(mb) / mean(ma)) : mean(mb) - mean(ma));
  const nan = { est: NaN, lo90: NaN, hi90: NaN, equivalent: false };
  if (!cs.length || !(margin > 0)) return nan;
  const est = stat(cs.map((c) => mean(c.a)), cs.map((c) => mean(c.b)));
  const rnd = mulberry32(seed);
  const res = (x) => x.map(() => x[Math.floor(rnd() * x.length)]);
  const boots = [];
  for (let i = 0; i < B; i++) {
    const ma = [], mb = [];
    for (let j = 0; j < cs.length; j++) {
      const c = cs[Math.floor(rnd() * cs.length)];
      ma.push(mean(res(c.a)));
      mb.push(mean(res(c.b)));
    }
    boots.push(stat(ma, mb));
  }
  const ok = boots.filter(Number.isFinite).sort((x, y) => x - y);
  if (!Number.isFinite(est) || !ok.length) return { ...nan, est };
  const lo90 = quantile(ok, alpha), hi90 = quantile(ok, 1 - alpha);
  return { est, lo90, hi90, equivalent: lo90 >= -margin - EPS && hi90 <= margin + EPS };
}

// ---------- SR-26: cổng nhãn, H3 (hoán vị hai mẫu chính xác), H6 (bootstrap có quy tắc trần/suy biến) ----------

/** Cổng nhãn "xác nhận": chỉ khi p nhỏ nhất mà phép kiểm có thể cho ≤ ngưỡng Holm. */
export function confirmable(pMin, holmThreshold) {
  return Number.isFinite(pMin) && Number.isFinite(holmThreshold) && pMin <= holmThreshold + EPS;
}

/**
 * Hoán vị hai mẫu chính xác (H3). a = BASE, b = TREAT; b′ = b + shift (recall: shift = −0,15; precision: +0,05).
 * Liệt kê đủ C(r_a + r_b, r_b) cách chọn r_b lượt làm TREAT. T = mean(b′) − mean(a).
 * alt: 'greater' (T* ≥ T_obs), 'less' (T* ≤ T_obs), 'two' (|T*| ≥ |T_obs|); sai số 1e-12. Giá trị không hữu hạn bị bỏ.
 */
export function permTwoSample(a, b, { shift = 0, alt = 'greater' } = {}) {
  const xa = (a ?? []).filter(Number.isFinite), xb = (b ?? []).filter(Number.isFinite).map((v) => v + shift);
  const ra = xa.length, rb = xb.length;
  if (!ra || !rb) return { p: null, pMin: null, N: 0, exact: true };
  const pool = [...xa, ...xb], n = ra + rb, total = pool.reduce((s, v) => s + v, 0);
  const tOf = (s) => s / rb - (total - s) / ra;
  const tObs = tOf(xb.reduce((s, v) => s + v, 0));
  const hit = (t) => (alt === 'less' ? t <= tObs + EPS : alt === 'two' ? Math.abs(t) >= Math.abs(tObs) - EPS : t >= tObs - EPS);
  let N = 0, k = 0;
  const rec = (start, left, s) => {
    if (left === 0) { N++; if (hit(tOf(s))) k++; return; }
    for (let i = start; i <= n - left; i++) rec(i + 1, left - 1, s + pool[i]);
  };
  rec(0, rb, 0);
  return { p: k / N, pMin: 1 / N, N, exact: true };
}

const H6_MARGIN = 0.05;

/**
 * p bootstrap tương đương cho MỘT cặp (A/B0) của H6. cells = [{ task, a: điểm B0[], b: điểm A[] }].
 * `arm` ('A1' | 'A2', mặc định 'A1') chỉ quyết định điền nA1 hay nA2; trường kia là null.
 * v2.1: (a) chỉ dùng taskSet khai báo; (b) bỏ bài chạm trần ở CẢ HAI arm (mọi lượt ≥ ceil), giữ bài chạm trần một phía;
 * (c) Δ* suy biến ⇒ p = null (không bao giờ 1/(B+1)); (d) < minTasks bài ⇒ verdict 'estimate' kèm ci90, không p.
 */
export function bootP(cells, { B = 4000, seed = 20261102, ceil = 0.99, minTasks = 3, taskSet, arm = 'A1' } = {}) {
  const inSet = (c) => !taskSet || taskSet.includes(c.task);
  const valid = (cells ?? []).filter((c) => inSet(c) && c.a?.length && c.b?.length);
  const ceilingTasks = [], kept = [];
  for (const c of valid) (c.a.every((v) => v >= ceil) && c.b.every((v) => v >= ceil) ? ceilingTasks : kept).push(c);
  const n = kept.length;
  const base = { nA1: arm === 'A1' ? n : null, nA2: arm === 'A2' ? n : null, ceilingTasks: ceilingTasks.map((c) => c.task), B };
  const rnd = mulberry32(seed);
  const res = (x) => x.map(() => x[Math.floor(rnd() * x.length)]);
  const deltas = [];
  if (n) {
    for (let i = 0; i < B; i++) {
      let s = 0;
      for (const c of kept) s += mean(res(c.b)) - mean(res(c.a));
      deltas.push(s / n);
    }
  }
  const sorted = [...deltas].sort((x, y) => x - y);
  const ci90 = n ? [quantile(sorted, 0.05), quantile(sorted, 0.95)] : null;
  if (n < minTasks) return { ...base, p: null, verdict: 'estimate', ci90, k: null };
  const degenerate = sorted[sorted.length - 1] - sorted[0] <= EPS;
  if (degenerate) {
    const rejected = deltas.every((d) => Math.abs(d) >= H6_MARGIN - EPS);
    return { ...base, p: null, verdict: rejected ? 'Bác bỏ' : 'Không kết luận (trần/suy biến)', ci90, k: null };
  }
  const kLow = deltas.filter((d) => d <= -H6_MARGIN + EPS).length, kHigh = deltas.filter((d) => d >= H6_MARGIN - EPS).length;
  const k = Math.max(kLow, kHigh);
  return { ...base, p: (k + 1) / (B + 1), pMin: 1 / (B + 1), verdict: 'p', ci90, k };
}

/** Gộp hai cặp của H6: p = max(p(A1), p(A2)); một cặp NA ⇒ NA; một cặp 'estimate' ⇒ H6 hạ xuống ước lượng. */
export function h6Combine(pA1, pA2) {
  const out = (p, verdict) => ({
    p, verdict, nA1: pA1.nA1, nA2: pA2.nA2, ci90: { A1: pA1.ci90, A2: pA2.ci90 },
    ceilingTasks: { A1: pA1.ceilingTasks, A2: pA2.ceilingTasks }, B: pA1.B, k: { A1: pA1.k, A2: pA2.k },
  });
  if (pA1.verdict === 'estimate' || pA2.verdict === 'estimate') return out(null, 'estimate');
  if (pA1.p == null || pA2.p == null) {
    const bad = [pA1, pA2].filter((r) => r.p == null);
    return out(null, bad.some((r) => r.verdict === 'Bác bỏ') ? 'Bác bỏ' : 'Không kết luận (trần/suy biến)');
  }
  return out(Math.max(pA1.p, pA2.p), 'p');
}

// ---------- SR-25: hoán vị nhãn arm theo lượt, phân tầng theo bài (H1′/H2′) ----------

const choose = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return Math.round(r); };

/**
 * cells = [{ task, a: BASE[], b: TREAT[] }]. b′ = b − margin (margin trừ khỏi điểm TREAT) rồi hoán vị trong từng bài.
 * T = TB theo bài của (mean(b′) − mean(a)). alt: 'greater' | 'less' | 'two'; sai số 1e-12.
 * ∏ C(r_a + r_b, r_b) ≤ maxExact ⇒ liệt kê đủ; ngược lại Monte Carlo M lần (Fisher-Yates, bộ sinh riêng), p = (k + 1)/(M + 1).
 * Bài thiếu a hoặc b vào `skipped` (tên bài).
 */
export function permStratified(cells, { alt = 'greater', margin = 0, maxExact = 1e6, M = 10000, seed = 20261102 } = {}) {
  const skipped = [], ts = [];
  for (const c of cells ?? []) {
    const a = (c.a ?? []).filter(Number.isFinite), b = (c.b ?? []).filter(Number.isFinite).map((v) => v - margin);
    if (a.length && b.length) ts.push({ pool: [...a, ...b], ra: a.length, rb: b.length });
    else skipped.push(c.task);
  }
  const n = ts.length;
  if (!n) return { n, nPerm: 0, exact: true, tObs: NaN, p: null, pMin: null, skipped };
  const sum = (x) => x.reduce((s, v) => s + v, 0);
  // d của một cách chọn TREAT có tổng s: s/rb − (tot − s)/ra
  const dOf = (t, s, tot) => s / t.rb - (tot - s) / t.ra;
  const tots = ts.map((t) => sum(t.pool));
  const tObs = ts.reduce((s, t, i) => s + dOf(t, sum(t.pool.slice(t.ra)), tots[i]), 0) / n;
  const hit = (t) => (alt === 'less' ? t <= tObs + EPS : alt === 'two' ? Math.abs(t) >= Math.abs(tObs) - EPS : t >= tObs - EPS);
  const N = ts.reduce((s, t) => s * choose(t.pool.length, t.rb), 1);
  if (N <= maxExact) {
    // d từng bài cho mọi cách chọn, rồi duyệt tích Descartes
    const lists = ts.map((t, i) => {
      const out = [], m = t.pool.length;
      const rec = (start, left, s) => {
        if (left === 0) { out.push(dOf(t, s, tots[i])); return; }
        for (let j = start; j <= m - left; j++) rec(j + 1, left - 1, s + t.pool[j]);
      };
      rec(0, t.rb, 0);
      return out;
    });
    let k = 0;
    const walk = (i, acc) => {
      if (i === n) { if (hit(acc / n)) k++; return; }
      for (const d of lists[i]) walk(i + 1, acc + d);
    };
    walk(0, 0);
    return { n, nPerm: N, exact: true, tObs, p: k / N, pMin: 1 / N, skipped };
  }
  const rnd = mulberry32(seed);
  let k = 0;
  for (let it = 0; it < M; it++) {
    let acc = 0;
    ts.forEach((t, i) => {
      const sh = fisherYates(t.pool, rnd);
      acc += dOf(t, sum(sh.slice(0, t.rb)), tots[i]);
    });
    if (hit(acc / n)) k++;
  }
  return { n, nPerm: M, exact: false, tObs, p: (k + 1) / (M + 1), pMin: 1 / (M + 1), skipped };
}
