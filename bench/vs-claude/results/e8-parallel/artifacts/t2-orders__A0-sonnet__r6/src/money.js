'use strict';
// Tiền lưu bằng số nguyên "xu" (1 đơn vị tiền = 100 xu) để tránh sai số dấu phẩy động.

/** Đổi số tiền (vd. 12.34) sang xu, làm tròn half away from zero. */
function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new TypeError('amount phải là số hữu hạn');
  return roundHalfAway(amount * 100);
}

/** Làm tròn half away from zero, bỏ nhiễu dấu phẩy động (vd. 1.005*100 = 100.49999999999999). */
function roundHalfAway(x) {
  const r = Math.round(Number(Math.abs(x).toPrecision(12)));
  return x < 0 ? -r : r;
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
  const base = weights.map((w) => Math.floor((total * w) / sum));
  const rem = weights.map((w, i) => (total * w) / sum - base[i]);
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = weights.map((_, i) => i).sort((a, b) => rem[b] - rem[a] || a - b);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length) {
    if (weights[order[k]] > 0) { base[order[k]] += 1; left -= 1; }
  }
  return base;
}

module.exports = { roundHalfAway, toCents, fromCents, formatMoney, allocate };
