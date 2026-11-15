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

/** FNV-1a 32 bit trên chuỗi UTF-16 (mã đơn vị): băm tất định, không phụ thuộc nền tảng. */
export function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

/**
 * A-5 (K2): luồng ngẫu nhiên riêng của từng giả thuyết, suy tất định từ hạt gốc đã đăng ký (20261102):
 * mulberry32((baseSeed ^ fnv1a32(hypId)) >>> 0). Nhờ vậy p/CI của một giả thuyết không phụ thuộc thứ tự gọi
 * hay việc thêm giả thuyết khác. Quy tắc suy hạt này CHỜ Phòng Nghiên cứu đăng ký (preregistration chỉ nêu hạt gốc);
 * kết quả theo luồng chung cũ của analyze.mjs phải ghi thành dòng độ nhạy để đối chiếu.
 */
export function streamFor(hypId, baseSeed = 20261102) {
  return mulberry32((baseSeed ^ fnv1a32(String(hypId))) >>> 0);
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

/**
 * T-4 (K2): phân vị nội suy tuyến tính giữa hai thứ hạng (kiểu R-7) là quy ước DUY NHẤT của stats.mjs
 * (tost, bootP, percentileCI). prereg-tests.mjs lấy chỉ số `floor` nên chữ số lẻ thứ 3 của CI có thể lệch; giữ nội suy
 * vì `floor(0,975·n)` rơi vào phân vị 97,525 % (A-6), không phải 97,5 %. Chênh lệch này không đổi biên, ngưỡng hay hạt.
 */
export const quantile = (sorted, q) => {
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

/** A-6 (K2): CI phân vị hai phía `level` (mặc định 95 %) bằng cùng `quantile`. Giá trị không hữu hạn bị bỏ; rỗng ⇒ null. */
export function percentileCI(values, level = 0.95) {
  const v = (values ?? []).filter(Number.isFinite).sort((x, y) => x - y);
  if (!v.length) return null;
  const al = (1 - level) / 2;
  return [quantile(v, al), quantile(v, 1 - al)];
}

/** Nhãn đăng ký cho phân phối suy biến (preregistration §2.5 v2.1 (c)): không có p, không "xác nhận". */
export const DEGENERATE_LABEL = 'không kết luận (suy biến)';

/**
 * Tương đương (TOST) bằng CI bootstrap hai tầng (bài → lượt). `b` là TREAT, `a` là BASE.
 * scale 'diff': thống kê = TB theo bài của (mean(b) − mean(a)); margin cùng đơn vị điểm.
 * scale 'logratio' (T-2, K2): thống kê = TRUNG BÌNH THEO BÀI của ln(mean(b_bài) / mean(a_bài)), như P:80 và prereg-tests.mjs
 * (trước đây là ln của tỉ số hai trung bình qua bài); margin theo ln (vd. ln 1.1). Trung bình lượt bằng 0 ⇒ log không
 * hữu hạn ⇒ suy biến (T-5).
 * `ceil` (T-3, B-01 (c)): nếu có, bỏ bài mà mọi lượt cả hai arm ≥ ceil (vd. 0,99), trả `ceilingTasks`.
 * `minTasks` (T-6): còn < minTasks bài ⇒ p = null, equivalent = false, label 'không kết luận (ít bài…)' (B-01 dùng 3).
 * Mặc định ceil = null, minTasks = 0 (hành vi cũ; H6 đã lọc trần ở bootP).
 * CI (1 − 2·alpha) = [alpha, 1 − alpha]; equivalent ⇔ CI nằm trọn trong [−margin, +margin] VÀ không suy biến.
 * T-1/B-1/T-5 (K2): suy biến ⇒ p = null, degenerate = true, equivalent = false, label = DEGENERATE_LABEL.
 * Suy biến = điểm gốc hoặc bất kỳ mẫu bootstrap nào không hữu hạn (NaN), hoặc mọi mẫu bằng nhau (dung sai 1e-12).
 * Giống H6 (P:107): suy biến nhưng CI nằm hẳn ngoài biên (vd. Δ cố định +0,10) vẫn nhãn 'Bác bỏ' (p vẫn null).
 * p (phụ, kiểu bootP): max hai phía (k + 1)/(B + 1); null khi suy biến.
 * Trả { est, lo, hi, lo90, hi90, p, equivalent, degenerate, label, n, ceilingTasks, ciNote } (lo90/hi90 giữ cho analyze.mjs).
 * B-4 (K2): tost dùng CI HAI tầng (bài → lượt), còn bootP một tầng (chỉ lượt, bài cố định, theo P:93). Giữ khác có chủ ý:
 * P:173 lấy CI 90 % (hai tầng, phản ánh biến thiên giữa bài) làm kết luận chính, p của bootP chỉ phụ. Nếu hai bên bất
 * đồng thì báo theo CI của tost (analyze.mjs).
 */
export function tost(cells, { margin, alpha = 0.05, B = 4000, seed = 20261102, scale = 'diff', ceil = null, minTasks = 0 } = {}) {
  const valid = cells.filter((c) => c.a?.length && c.b?.length);
  const isCeil = (c) => ceil != null && c.a.every((v) => v >= ceil) && c.b.every((v) => v >= ceil);
  const cs = valid.filter((c) => !isCeil(c));
  const ceilingTasks = valid.filter(isCeil).map((c) => c.task);
  const ciNote = 'CI hai tầng (bài → lượt)';
  const stat = (ma, mb) => (scale === 'logratio' ? mean(ma.map((x, i) => Math.log(mb[i] / x))) : mean(mb) - mean(ma));
  const out = (o) => ({ lo: o.lo90, hi: o.hi90, n: cs.length, ceilingTasks, ciNote, ...o });
  if (!cs.length || !(margin > 0)) {
    const label = !cs.length && ceilingTasks.length ? 'không kết luận (mọi bài chạm trần)' : 'không kết luận (thiếu dữ liệu)';
    return out({ est: NaN, lo90: NaN, hi90: NaN, p: null, equivalent: false, degenerate: false, label });
  }
  if (cs.length < minTasks) {
    const est = stat(cs.map((c) => mean(c.a)), cs.map((c) => mean(c.b)));
    return out({ est, lo90: NaN, hi90: NaN, p: null, equivalent: false, degenerate: false, label: `không kết luận (ít bài: ${cs.length} < ${minTasks})` });
  }
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
  if (!Number.isFinite(est) || !boots.every(Number.isFinite)) {
    return out({ est, lo90: NaN, hi90: NaN, p: null, equivalent: false, degenerate: true, label: DEGENERATE_LABEL });
  }
  const sorted = [...boots].sort((x, y) => x - y);
  const lo90 = quantile(sorted, alpha), hi90 = quantile(sorted, 1 - alpha);
  const degenerate = sorted[sorted.length - 1] - sorted[0] <= EPS;
  const outside = lo90 >= margin - EPS || hi90 <= -margin + EPS;
  if (degenerate) {
    return out({ est, lo90, hi90, p: null, equivalent: false, degenerate: true, label: outside ? 'Bác bỏ' : DEGENERATE_LABEL });
  }
  const equivalent = lo90 >= -margin - EPS && hi90 <= margin + EPS;
  const kLow = boots.filter((d) => d <= -margin + EPS).length, kHigh = boots.filter((d) => d >= margin - EPS).length;
  const p = (Math.max(kLow, kHigh) + 1) / (B + 1);
  return out({ est, lo90, hi90, p, equivalent, degenerate: false, label: equivalent ? 'Tương đương (CI trong biên)' : outside ? 'Bác bỏ' : 'Không kết luận' });
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
 * P-2 (K2): C(r_a + r_b, r_b) > maxExact (mặc định 10⁶; s1 r = 10 là 184 756 nên vẫn chính xác) ⇒ Monte Carlo M lần
 * (mặc định 10 000, hạt 20261102, Fisher-Yates), p = (k + 1)/(M + 1), exact = false, N = M, nTotal = số cách thật.
 * Trước đây r = 20 mỗi arm (≈ 1,4·10¹¹ cách) làm treo tiến trình.
 */
export function permTwoSample(a, b, { shift = 0, alt = 'greater', maxExact = 1e6, M = 10000, seed = 20261102 } = {}) {
  const xa = (a ?? []).filter(Number.isFinite), xb = (b ?? []).filter(Number.isFinite).map((v) => v + shift);
  const ra = xa.length, rb = xb.length;
  if (!ra || !rb) return { p: null, pMin: null, N: 0, exact: true };
  const pool = [...xa, ...xb], n = ra + rb, total = pool.reduce((s, v) => s + v, 0);
  const tOf = (s) => s / rb - (total - s) / ra;
  const tObs = tOf(xb.reduce((s, v) => s + v, 0));
  const hit = (t) => (alt === 'less' ? t <= tObs + EPS : alt === 'two' ? Math.abs(t) >= Math.abs(tObs) - EPS : t >= tObs - EPS);
  const nTotal = choose(n, Math.min(ra, rb));
  if (!(nTotal <= maxExact)) {
    const rnd = mulberry32(seed);
    let kMc = 0;
    for (let it = 0; it < M; it++) {
      const sh = fisherYates(pool, rnd);
      if (hit(tOf(sh.slice(0, rb).reduce((s, v) => s + v, 0)))) kMc++;
    }
    return { p: (kMc + 1) / (M + 1), pMin: 1 / (M + 1), N: M, nTotal, exact: false };
  }
  let N = 0, k = 0;
  const rec = (start, left, s) => {
    if (left === 0) { N++; if (hit(tOf(s))) k++; return; }
    for (let i = start; i <= n - left; i++) rec(i + 1, left - 1, s + pool[i]);
  };
  rec(0, rb, 0);
  return { p: k / N, pMin: 1 / N, N, exact: true };
}

const H6_MARGIN = 0.05;
const CI_NOTE_ONE_LEVEL = 'CI một tầng (chỉ lấy lại lượt trong ô, bài cố định); không phản ánh biến thiên giữa bài, kết luận chính theo CI hai tầng của tost';

/**
 * p bootstrap tương đương cho MỘT cặp (A/B0) của H6. cells = [{ task, a: điểm B0[], b: điểm A[] }].
 * `arm` ('A1' | 'A2', BẮT BUỘC — C-1) chỉ quyết định điền nA1 hay nA2; trường kia là null. Thiếu/sai arm ⇒ ném lỗi.
 * v2.1: (a) chỉ dùng taskSet khai báo; (b) bỏ bài chạm trần ở CẢ HAI arm (mọi lượt ≥ ceil), giữ bài chạm trần một phía;
 * (c) Δ* suy biến ⇒ p = null (không bao giờ 1/(B+1)); (d) < minTasks bài ⇒ verdict 'estimate' kèm ci90, không p.
 * T-1/B-1 (K2): điểm không hữu hạn (NaN) cũng là suy biến (trước đây NaN ≤ EPS sai ⇒ p = 1/(B+1)).
 * B-2: CI 90 % nằm hẳn ngoài ±0,05 mà không suy biến ⇒ `label` = 'Bác bỏ' (p vẫn có, verdict vẫn 'p').
 * B-3: `ciNote`: ci90 ở đây là bootstrap MỘT tầng (chỉ lượt, bài cố định, theo P:93), không phản ánh biến thiên giữa bài;
 * kết luận chính theo CI hai tầng của `tost` (B-4, P:173).
 * Trả thêm `degenerate` (bool) và `label` ('không kết luận (suy biến)' khi suy biến không bị bác bỏ); `verdict` giữ như cũ.
 */
export function bootP(cells, { B = 4000, seed = 20261102, ceil = 0.99, minTasks = 3, taskSet, arm } = {}) {
  if (arm !== 'A1' && arm !== 'A2') throw new Error(`bootP: thiếu hoặc sai arm (cần 'A1' hoặc 'A2', nhận ${JSON.stringify(arm)})`);
  const inSet = (c) => !taskSet || taskSet.includes(c.task);
  const valid = (cells ?? []).filter((c) => inSet(c) && c.a?.length && c.b?.length);
  const ceilingTasks = [], kept = [];
  for (const c of valid) (c.a.every((v) => v >= ceil) && c.b.every((v) => v >= ceil) ? ceilingTasks : kept).push(c);
  const n = kept.length;
  const base = { nA1: arm === 'A1' ? n : null, nA2: arm === 'A2' ? n : null, ceilingTasks: ceilingTasks.map((c) => c.task), B, ciNote: CI_NOTE_ONE_LEVEL };
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
  const finite = deltas.every(Number.isFinite);
  const sorted = [...deltas].sort((x, y) => x - y);
  const ci90 = n ? [quantile(sorted, 0.05), quantile(sorted, 0.95)] : null;
  if (n < minTasks) return { ...base, p: null, degenerate: !finite, label: finite ? 'ước lượng (ít bài)' : DEGENERATE_LABEL, verdict: 'estimate', ci90, k: null };
  if (!finite) return { ...base, p: null, degenerate: true, label: DEGENERATE_LABEL, verdict: 'Không kết luận (trần/suy biến)', ci90, k: null };
  const degenerate = sorted[sorted.length - 1] - sorted[0] <= EPS;
  if (degenerate) {
    const rejected = deltas.every((d) => Math.abs(d) >= H6_MARGIN - EPS);
    return { ...base, p: null, degenerate: true, label: rejected ? 'Bác bỏ' : DEGENERATE_LABEL, verdict: rejected ? 'Bác bỏ' : 'Không kết luận (trần/suy biến)', ci90, k: null };
  }
  const kLow = deltas.filter((d) => d <= -H6_MARGIN + EPS).length, kHigh = deltas.filter((d) => d >= H6_MARGIN - EPS).length;
  const k = Math.max(kLow, kHigh);
  const outside = ci90[0] >= H6_MARGIN - EPS || ci90[1] <= -H6_MARGIN + EPS;
  return { ...base, p: (k + 1) / (B + 1), pMin: 1 / (B + 1), degenerate: false, label: outside ? 'Bác bỏ' : 'p', verdict: 'p', ci90, k };
}

/**
 * Gộp hai cặp của H6: p = max(p(A1), p(A2)); một cặp NA (suy biến, kể cả NaN) ⇒ p = null, degenerate = true,
 * supported = false; một cặp 'estimate' ⇒ H6 hạ xuống ước lượng. `supported` = cả hai cặp có p và ci90 một tầng trong ±0,05;
 * ngưỡng Holm và CI hai tầng của tost áp ở analyze.mjs. Trả { p, degenerate, supported, label, verdict, ... }.
 */
export function h6Combine(pA1, pA2) {
  if (pA1?.nA1 == null || pA2?.nA2 == null) throw new Error("h6Combine: pA1 phải từ bootP(..., { arm: 'A1' }) và pA2 từ bootP(..., { arm: 'A2' }) (C-1)");
  const out = (p, verdict, extra) => ({
    p, verdict, degenerate: false, supported: false, label: verdict, ...extra,
    nA1: pA1.nA1, nA2: pA2.nA2, ci90: { A1: pA1.ci90, A2: pA2.ci90 },
    ceilingTasks: { A1: pA1.ceilingTasks, A2: pA2.ceilingTasks }, B: pA1.B, k: { A1: pA1.k, A2: pA2.k },
  });
  if (pA1.verdict === 'estimate' || pA2.verdict === 'estimate') {
    const nan = pA1.degenerate || pA2.degenerate;
    return out(null, 'estimate', nan ? { degenerate: true, label: DEGENERATE_LABEL } : { label: 'ước lượng (ít bài)' });
  }
  if (pA1.p == null || pA2.p == null || pA1.degenerate || pA2.degenerate) {
    const bad = [pA1, pA2].filter((r) => r.p == null);
    const rejected = bad.some((r) => r.verdict === 'Bác bỏ');
    return out(null, rejected ? 'Bác bỏ' : 'Không kết luận (trần/suy biến)', { degenerate: true, label: rejected ? 'Bác bỏ' : DEGENERATE_LABEL });
  }
  const inside = (ci) => Array.isArray(ci) && ci[0] >= -H6_MARGIN - EPS && ci[1] <= H6_MARGIN + EPS;
  const rejected = pA1.label === 'Bác bỏ' || pA2.label === 'Bác bỏ'; // B-2
  return out(Math.max(pA1.p, pA2.p), 'p', { supported: inside(pA1.ci90) && inside(pA2.ci90), label: rejected ? 'Bác bỏ' : 'p' });
}

// ---------- SR-25: hoán vị nhãn arm theo lượt, phân tầng theo bài (H1′/H2′) ----------

const choose = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return Math.round(r); };

/**
 * cells = [{ task, a: BASE[], b: TREAT[] }]. b′ = b − margin (margin trừ khỏi điểm TREAT) rồi hoán vị trong từng bài.
 * T = TB theo bài của (mean(b′) − mean(a)). alt: 'greater' | 'less' | 'two'; sai số 1e-12.
 * ∏ C(r_a + r_b, r_b) ≤ maxExact ⇒ liệt kê đủ; ngược lại Monte Carlo M lần (Fisher-Yates, bộ sinh riêng), p = (k + 1)/(M + 1).
 * Bài thiếu a hoặc b vào `skipped` (tên bài).
 * P-2: ∏ C > maxExact ⇒ Monte Carlo (không bao giờ liệt kê); N tích có thể là Infinity vẫn đi nhánh Monte Carlo.
 * S-1 (K2): margin ≠ 0 làm bài chạm trần cho p = p_min giả (b − margin kém hơn a ở mọi lượt, F11). Quy tắc BẢO THỦ, cùng
 * H6 v2.1 (b), (c): (i) bỏ bài mà mọi lượt cả hai arm (điểm gốc, trước khi trừ margin) ≥ ceil (mặc định 0,99), báo
 * `ceilingTasks`; (ii) nếu mọi bài còn lại có điểm gốc hằng (một giá trị duy nhất) hoặc không còn bài ⇒ suy biến: p = null,
 * degenerate = true, label 'không kết luận (suy biến)'. Chỉ bật khi margin ≠ 0 (margin = 0 thì T* = T_obs = 0 ở bài trần, p = 1,
 * không có p_min giả); `ceilGuard` ghi đè. CHỜ Phòng Nghiên cứu đăng ký trước khi khóa H1′/H2′ (§2.6 chưa có quy tắc này).
 * S-2: `alt = 'two'` kèm margin hợp lệ: |T*| ≥ |T_obs|, T_obs đã tính trên b − margin (xem test stats-k2).
 * Trả { n, nPerm, exact, tObs, p, pMin, skipped, ceilingTasks, degenerate, label }.
 */
export function permStratified(cells, { alt = 'greater', margin = 0, maxExact = 1e6, M = 10000, seed = 20261102, ceil = 0.99, ceilGuard = margin !== 0 } = {}) {
  const skipped = [], ceilingTasks = [], ts = [];
  for (const c of cells ?? []) {
    const rawA = (c.a ?? []).filter(Number.isFinite), rawB = (c.b ?? []).filter(Number.isFinite);
    if (!rawA.length || !rawB.length) { skipped.push(c.task); continue; }
    if (ceilGuard && rawA.every((v) => v >= ceil) && rawB.every((v) => v >= ceil)) { ceilingTasks.push(c.task); continue; }
    const raw = [...rawA, ...rawB];
    ts.push({ pool: [...rawA, ...rawB.map((v) => v - margin)], ra: rawA.length, rb: rawB.length, flat: Math.max(...raw) - Math.min(...raw) <= EPS });
  }
  const n = ts.length;
  const extra = { skipped, ceilingTasks, degenerate: false, label: 'p' };
  if (!n) {
    return ceilGuard && ceilingTasks.length
      ? { n, nPerm: 0, exact: true, tObs: NaN, p: null, pMin: null, ...extra, degenerate: true, label: DEGENERATE_LABEL }
      : { n, nPerm: 0, exact: true, tObs: NaN, p: null, pMin: null, ...extra, label: 'không kết luận (thiếu dữ liệu)' };
  }
  const degenerate = ceilGuard && ts.every((t) => t.flat);
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
    return degenerate
      ? { n, nPerm: N, exact: true, tObs, p: null, pMin: null, ...extra, degenerate, label: DEGENERATE_LABEL }
      : { n, nPerm: N, exact: true, tObs, p: k / N, pMin: 1 / N, ...extra };
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
  return degenerate
    ? { n, nPerm: M, exact: false, tObs, p: null, pMin: null, ...extra, degenerate, label: DEGENERATE_LABEL }
    : { n, nPerm: M, exact: false, tObs, p: (k + 1) / (M + 1), pMin: 1 / (M + 1), ...extra };
}
