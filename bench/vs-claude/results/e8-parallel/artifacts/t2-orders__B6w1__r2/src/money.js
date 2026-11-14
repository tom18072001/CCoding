'use strict';
// Tiền lưu bằng số nguyên "xu" (1 đơn vị tiền = 100 xu) để tránh sai số dấu phẩy động.

/** Đổi số tiền (vd. 12.34) sang xu, làm tròn half away from zero. */
function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new TypeError('amount phải là số hữu hạn');
  // Làm tròn theo chuỗi thập phân ngắn nhất của số (vd. '1.005'); nhân float cho 1.005 * 100 = 100.49999...
  const neg = amount < 0;
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(Math.abs(amount)));
  let digits = m[1] + (m[2] || '');
  let pointPos = m[1].length + Number(m[3] || 0); // vị trí dấu thập phân trong digits
  if (pointPos < 0) {
    digits = '0'.repeat(-pointPos) + digits;
    pointPos = 0;
  }
  if (pointPos > digits.length) digits = digits.padEnd(pointPos, '0');
  const frac = digits.slice(pointPos).padEnd(3, '0');
  let cents = BigInt(digits.slice(0, pointPos) || '0') * 100n + BigInt(frac.slice(0, 2));
  if (frac[2] >= '5') cents += 1n;
  const result = Number(cents);
  return neg && result !== 0 ? -result : result;
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
  const shares = weights.map((w) => Math.floor((t * w) / sum));
  let left = t - shares.reduce((a, b) => a + b, 0);
  const order = weights.map((w, i) => ({ i, rem: (t * w) % sum })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) shares[order[k].i] += 1;
  return neg ? shares.map((x) => -x) : shares;
}

module.exports = { toCents, fromCents, formatMoney, allocate };
