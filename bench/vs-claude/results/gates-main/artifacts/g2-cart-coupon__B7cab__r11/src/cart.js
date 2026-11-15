'use strict';
const { toCents } = require('./money');

function total(items) {
  return items.reduce((s, it) => s + toCents(it.price) * it.quantity, 0);
}

function applyCoupon(totalCents, coupon) {
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new RangeError('Tổng xu không hợp lệ: ' + totalCents);
  if (coupon === null || typeof coupon !== 'object') throw new RangeError('Coupon sai kiểu');
  const v = coupon.value;
  if (coupon.type === 'percent') {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) throw new RangeError('Percent không hợp lệ: ' + v);
    // toPrecision(12) khử sai số float ở ca đúng nửa (vd 500 * 0.1 = 0.5000000000000001 hoặc 0.49999...)
    return Math.round(Number((totalCents * (100 - v) / 100).toPrecision(12)));
  }
  if (coupon.type === 'fixed') {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new RangeError('Fixed không hợp lệ: ' + v);
    return Math.max(0, totalCents - v);
  }
  throw new RangeError('Loại coupon không hợp lệ: ' + coupon.type);
}

module.exports = { total, applyCoupon };
