'use strict';
// Tiền lưu bằng số nguyên "xu" (1 đơn vị tiền = 100 xu) để tránh sai số dấu phẩy động.

/** Đổi số tiền (vd. 12.34) sang xu, làm tròn half away from zero. */
function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new TypeError('amount phải là số hữu hạn');
  const abs = Math.abs(amount);
  const str = String(abs);
  // Dùng biểu diễn thập phân ngắn nhất ("1.005") để tránh sai số nhị phân của amount * 100.
  const cents = str.includes('e') ? Math.round(abs * 100) : Math.round(Number(`${str}e2`));
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
  const t = Math.abs(total);
  const parts = weights.map((w, i) => {
    const base = Math.floor((t * w) / sum);
    return { i, base, rem: t * w - base * sum };
  });
  let left = t - parts.reduce((a, p) => a + p.base, 0);
  const order = [...parts].sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const p of order) {
    if (left <= 0) break;
    p.base += 1;
    left -= 1;
  }
  return parts.map((p) => (p.base === 0 ? 0 : sign * p.base));
}

module.exports = { toCents, fromCents, formatMoney, allocate };
