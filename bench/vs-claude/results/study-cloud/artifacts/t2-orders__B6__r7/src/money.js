'use strict';
// Tiền lưu bằng số nguyên "xu" (1 đơn vị tiền = 100 xu) để tránh sai số dấu phẩy động.

/** Đổi số tiền (vd. 12.34) sang xu, làm tròn half away from zero. */
function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new TypeError('amount phải là số hữu hạn');
  const neg = amount < 0;
  const abs = Math.abs(amount);
  // toPrecision(15) loại bỏ sai số nhị phân (1.005 -> "1.00500000000000"), sau đó làm tròn trên chuỗi thập phân.
  const str = abs.toPrecision(15);
  let cents;
  if (str.includes('e')) {
    cents = Math.round(abs * 100); // số rất lớn (nguyên) hoặc rất nhỏ (→ 0)
  } else {
    const [int, frac = ''] = str.split('.');
    const f = frac.padEnd(3, '0');
    cents = Number(int + f.slice(0, 2)) + (f.charCodeAt(2) >= 53 ? 1 : 0); // chữ số thứ 3 >= 5 → làm tròn lên
  }
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
  const parts = weights.map((w) => {
    const exact = (t * w) / sum;
    const base = Math.floor(exact);
    return { base, frac: exact - base, w };
  });
  let left = t - parts.reduce((a, p) => a + p.base, 0);
  const order = parts
    .map((p, i) => ({ i, frac: p.frac, w: p.w }))
    .filter((x) => x.w > 0)
    .sort((x, y) => y.frac - x.frac || x.i - y.i);
  for (let k = 0; left > 0 && order.length; k++, left--) parts[order[k % order.length].i].base += 1;
  return parts.map((p) => (p.base === 0 ? 0 : sign * p.base));
}

module.exports = { toCents, fromCents, formatMoney, allocate };
