'use strict';
const { toCents } = require('./money');

function total(items) {
  return items.reduce((s, it) => s + toCents(it.price) * it.quantity, 0);
}

function applyCoupon(totalCents, coupon) {
  if (!coupon || typeof coupon !== 'object') throw new RangeError('Coupon không hợp lệ');
  const { type, value } = coupon;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError('Giá trị coupon không hợp lệ');
  if (type === 'percent') {
    if (value < 0 || value > 100) throw new RangeError('Phần trăm ngoài [0,100]: ' + value);
    return Math.round((totalCents * (100 - value)) / 100);
  }
  if (type === 'fixed') {
    if (value < 0 || !Number.isInteger(value)) throw new RangeError('Số xu giảm không hợp lệ: ' + value);
    return Math.max(0, totalCents - value);
  }
  throw new RangeError('Loại coupon không hợp lệ: ' + type);
}

module.exports = { total, applyCoupon };
