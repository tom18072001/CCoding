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
