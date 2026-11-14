'use strict';
// Tiền lưu bằng số nguyên "xu" (1 đơn vị tiền = 100 xu) để tránh sai số dấu phẩy động.

/** Đổi số tiền (vd. 12.34) sang xu, làm tròn half away from zero. */
function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new TypeError('amount phải là số hữu hạn');
  const abs = Math.abs(amount);
  // Dịch dấu thập phân theo chuỗi để tránh lỗi nhị phân (1.005 * 100 = 100.49999...).
  const str = abs.toPrecision(15);
  const cents = str.includes('e') ? Math.round(abs * 100) : Math.round(Number(`${str}e2`));
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
  const shares = weights.map((w) => Math.floor((total * w) / sum));
  const rems = weights.map((w) => (total * w) % sum);
  let left = total - shares.reduce((a, b) => a + b, 0);
  const order = weights.map((_, i) => i).sort((a, b) => rems[b] - rems[a] || a - b);
  for (let k = 0; left > 0 && k < order.length; k++, left--) shares[order[k]] += 1;
  return shares;
}

module.exports = { toCents, fromCents, formatMoney, allocate };
