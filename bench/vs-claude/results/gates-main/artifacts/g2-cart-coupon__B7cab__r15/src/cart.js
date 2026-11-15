'use strict';
const { toCents } = require('./money');

function total(items) {
  return items.reduce((s, it) => s + toCents(it.price) * it.quantity, 0);
}

function applyCoupon(totalCents, coupon) {
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new RangeError('Tổng xu không hợp lệ: ' + totalCents);
  if (coupon === null || typeof coupon !== 'object') throw new RangeError('Coupon không hợp lệ');
  const v = coupon.value;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError('Giá trị coupon không hợp lệ: ' + v);
  if (coupon.type === 'percent') {
    if (v < 0 || v > 100) throw new RangeError('Phần trăm ngoài [0,100]: ' + v);
    return Math.round(totalCents * (100 - v) / 100);
  }
  if (coupon.type === 'fixed') {
    if (!Number.isInteger(v) || v < 0) throw new RangeError('Giá trị fixed không hợp lệ: ' + v);
    return Math.max(0, totalCents - v);
  }
  throw new RangeError('Loại coupon không hợp lệ: ' + coupon.type);
}

module.exports = { total, applyCoupon };
