'use strict';
// Tiền lưu bằng số nguyên "xu" (1 đơn vị tiền = 100 xu) để tránh sai số dấu phẩy động.

/** Đổi số tiền (vd. 12.34) sang xu, làm tròn half away from zero. */
function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new TypeError('amount phải là số hữu hạn');
  const sign = amount < 0 ? -1 : 1;
  const r = roundHalfUp(shiftDecimal(Math.abs(amount), 2));
  return r === 0 ? 0 : sign * r;
}

/** Nhân x với 10^n theo biểu diễn thập phân ngắn nhất của x (tránh sai số nhị phân, vd. 1.005). */
function shiftDecimal(x, n) {
  const [m, e = '0'] = String(x).split('e');
  return Number(`${m}e${Number(e) + n}`);
}

/** Làm tròn số không âm, half up (tức half away from zero với số tiền dương). */
function roundHalfUp(x) {
  return Math.floor(x + 0.5);
}

function fromCents(cents) {
  return cents / 100;
}

/** "1,234.50" — dấu phẩy phân cách nghìn, luôn 2 chữ số thập phân; âm có dấu "-" phía trước. */
function formatMoney(cents) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const units = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = String(abs % 100).padStart(2, '0');
  return `${neg ? '-' : ''}${units}.${frac}`;
}

/**
 * Chia `total` xu cho các phần theo tỉ lệ `weights` (số không âm), tổng các phần = total.
 * Phương pháp phần dư lớn nhất: mỗi phần lấy phần nguyên, số xu còn dư chia lần lượt cho các phần có phần lẻ lớn nhất
 * (bằng nhau thì phần đứng trước được trước).
 */
function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  const sign = total < 0 ? -1 : 1;
  const t = Math.abs(total);
  const parts = weights.map((w) => {
    const base = Math.floor((t * w) / sum);
    return { base, rem: t * w - base * sum };
  });
  let left = t - parts.reduce((a, p) => a + p.base, 0);
  const order = parts.map((_, i) => i).sort((a, b) => parts[b].rem - parts[a].rem || a - b);
  for (const i of order) {
    if (left <= 0) break;
    if (weights[i] > 0) { parts[i].base += 1; left -= 1; }
  }
  return parts.map((p) => (p.base === 0 ? 0 : sign * p.base));
}

module.exports = { roundHalfUp, toCents, fromCents, formatMoney, allocate };
