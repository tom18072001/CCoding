'use strict';
// Tiền lưu bằng số nguyên "xu" (1 đơn vị tiền = 100 xu) để tránh sai số dấu phẩy động.

/** Đổi số tiền (vd. 12.34) sang xu, làm tròn half away from zero. */
function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new TypeError('amount phải là số hữu hạn');
  const neg = amount < 0;
  // Dùng biểu diễn thập phân ngắn nhất của số (vd. "1.005") thay vì amount*100 (sai số nhị phân).
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(Math.abs(amount)));
  let digits = m[1] + (m[2] || '');
  let pointPos = m[1].length + Number(m[3] || 0) + 2; // dịch dấu chấm 2 chữ số (x100)
  if (pointPos > digits.length) digits = digits.padEnd(pointPos, '0');
  if (pointPos < 0) {
    digits = '0'.repeat(-pointPos) + digits;
    pointPos = 0;
  }
  let cents = Number(digits.slice(0, pointPos) || '0');
  if (digits.charCodeAt(pointPos) >= 53) cents += 1; // chữ số kế tiếp >= 5 -> làm tròn ra xa 0
  return neg && cents !== 0 ? -cents : cents;
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
  const parts = weights.map((w) => Math.floor((t * w) / sum));
  const rems = weights.map((w, i) => ({ i, r: (t * w) % sum }));
  let left = t - parts.reduce((a, b) => a + b, 0);
  rems.sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0; k++, left--) parts[rems[k].i] += 1;
  return parts.map((p) => (p === 0 ? 0 : sign * p));
}

module.exports = { toCents, fromCents, formatMoney, allocate };
