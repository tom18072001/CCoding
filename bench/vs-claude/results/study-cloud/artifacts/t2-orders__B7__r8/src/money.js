'use strict';
// Tiền lưu bằng số nguyên "xu" (1 đơn vị tiền = 100 xu) để tránh sai số dấu phẩy động.

/** Đổi số tiền (vd. 12.34) sang xu, làm tròn half away from zero. */
function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new TypeError('amount phải là số hữu hạn');
  const abs = Math.abs(amount);
  if (abs >= 1e15) return Math.round(amount * 100);
  // Làm tròn theo chữ số thập phân (tránh sai số nhị phân của abs * 100): half away from zero.
  const [int, frac = ''] = abs.toFixed(10).split('.');
  const cents = Number(int) * 100 + Number(frac.slice(0, 2)) + (frac[2] >= '5' ? 1 : 0);
  return amount < 0 ? -cents : cents;
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
  const neg = total < 0;
  const t = Math.abs(total);
  const base = weights.map((w) => Math.floor((t * w) / sum));
  const rem = weights.map((w, i) => (t * w) - base[i] * sum);
  let left = t - base.reduce((a, b) => a + b, 0);
  const order = weights.map((_, i) => i).sort((a, b) => rem[b] - rem[a] || a - b);
  for (const i of order) {
    if (left <= 0) break;
    if (weights[i] > 0) { base[i] += 1; left -= 1; }
  }
  return neg ? base.map((x) => -x) : base;
}

module.exports = { toCents, fromCents, formatMoney, allocate };
