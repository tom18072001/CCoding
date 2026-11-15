'use strict';
// Tiền lưu bằng số nguyên "xu" (1 đơn vị tiền = 100 xu) để tránh sai số dấu phẩy động.

/** Đổi số tiền (vd. 12.34) sang xu, làm tròn half away from zero. */
function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new TypeError('amount phải là số hữu hạn');
  // Nhân 100 rồi cắt nhiễu dấu phẩy động (15 chữ số có nghĩa) trước khi làm tròn half away from zero.
  const abs = Math.round(Number((Math.abs(amount) * 100).toPrecision(15)));
  return amount < 0 ? -abs : abs;
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
  const abs = Math.abs(total);
  const raw = weights.map((w) => (abs * w) / sum);
  const parts = raw.map((r) => Math.floor(r));
  let left = abs - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => i).filter((i) => weights[i] > 0)
    .sort((a, b) => (raw[b] - parts[b]) - (raw[a] - parts[a]) || a - b);
  for (let k = 0; left > 0 && order.length; k++, left--) parts[order[k % order.length]] += 1;
  return parts.map((p) => (p === 0 ? 0 : sign * p));
}

module.exports = { toCents, fromCents, formatMoney, allocate };
