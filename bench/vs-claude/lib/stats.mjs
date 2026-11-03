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
