'use strict';
const { toCents } = require('./money');

function total(items) {
  return items.reduce((s, it) => s + toCents(it.price) * it.quantity, 0);
}

function applyCoupon(totalCents, coupon) {
  if (!coupon || typeof coupon !== 'object') throw new RangeError('Mã giảm giá không hợp lệ');
  const v = coupon.value;
  if (coupon.type === 'percent') {
    if (typeof v !== 'number' || !(v >= 0 && v <= 100)) throw new RangeError('Phần trăm không hợp lệ: ' + v);
    return Math.round((totalCents * (100 - v)) / 100);
  }
  if (coupon.type === 'fixed') {
    if (!Number.isInteger(v) || v < 0) throw new RangeError('Số xu không hợp lệ: ' + v);
    return Math.max(0, totalCents - v);
  }
  throw new RangeError('Loại mã không hợp lệ: ' + coupon.type);
}

module.exports = { total, applyCoupon };
