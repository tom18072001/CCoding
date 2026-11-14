'use strict';
// Tiền lưu bằng số nguyên "xu" (1 đơn vị tiền = 100 xu) để tránh sai số dấu phẩy động.

/** Đổi số tiền (vd. 12.34) sang xu, làm tròn half away from zero. */
function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new TypeError('amount phải là số hữu hạn');
  // Dịch dấu thập phân bằng chuỗi mũ để tránh sai số nhị phân (1.005 -> 101).
  const [m, e] = String(Math.abs(amount)).split('e');
  const r = Math.round(Number(m + 'e' + ((e ? Number(e) : 0) + 2)));
  if (r === 0) return 0;
  return amount < 0 ? -r : r;
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
  const exact = weights.every(Number.isInteger) && Number.isInteger(t);
  const floors = [];
  const rems = []; // phần lẻ: BigInt (chính xác) hoặc số thực
  if (exact) {
    const S = BigInt(sum);
    for (const w of weights) {
      const p = BigInt(t) * BigInt(w);
      floors.push(Number(p / S));
      rems.push(p % S);
    }
  } else {
    for (const w of weights) {
      const q = (t * w) / sum;
      floors.push(Math.floor(q));
      rems.push(q - Math.floor(q));
    }
  }
  let left = t - floors.reduce((a, b) => a + b, 0);
  const order = weights.map((_, i) => i).sort((a, b) => (rems[a] > rems[b] ? -1 : rems[a] < rems[b] ? 1 : a - b));
  for (let k = 0; k < order.length && left > 0; k++, left--) floors[order[k]] += 1;
  return floors.map((x) => (x === 0 ? 0 : sign * x));
}

module.exports = { toCents, fromCents, formatMoney, allocate };
