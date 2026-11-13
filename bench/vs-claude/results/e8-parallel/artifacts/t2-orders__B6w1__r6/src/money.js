'use strict';
// Tiền lưu bằng số nguyên "xu" (1 đơn vị tiền = 100 xu) để tránh sai số dấu phẩy động.

/** Đổi số tiền (vd. 12.34) sang xu, làm tròn half away from zero. */
function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new TypeError('amount phải là số hữu hạn');
  const abs = Math.abs(amount);
  // toPrecision(15) loại sai số nhị phân (1.005*100 = 100.49999999999999) trước khi làm tròn half-up trên giá trị tuyệt đối.
  const cents = Math.round(Number((abs * 100).toPrecision(15)));
  return amount < 0 && cents !== 0 ? -cents : cents;
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
  const exact = weights.every(Number.isInteger) && Number.isSafeInteger(abs * sum);
  const shares = weights.map((w) => Math.floor((abs * w) / sum));
  const fracs = weights.map((w, i) => (exact ? ((abs * w) % sum) / sum : (abs * w) / sum - shares[i]));
  let left = abs - shares.reduce((a, b) => a + b, 0);
  const order = weights.map((_, i) => i).filter((i) => weights[i] > 0).sort((a, b) => fracs[b] - fracs[a] || a - b);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) shares[order[k]]++;
  return shares.map((x) => (x === 0 ? 0 : sign * x));
}

module.exports = { toCents, fromCents, formatMoney, allocate };
