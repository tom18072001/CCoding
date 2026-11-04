'use strict';
const { toCents } = require('./money');

function total(items) {
  if (!Array.isArray(items)) throw new RangeError('items phải là mảng');
  return items.reduce((s, it) => {
    if (it === null || typeof it !== 'object') throw new RangeError('Dòng hàng sai kiểu');
    if (!Number.isInteger(it.quantity) || it.quantity < 0) throw new RangeError('Số lượng không hợp lệ: ' + it.quantity);
    return s + toCents(it.price) * it.quantity;
  }, 0);
}

function applyCoupon(totalCents, coupon) {
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new RangeError('Tổng xu không hợp lệ: ' + totalCents);
  if (coupon === null || typeof coupon !== 'object') throw new RangeError('Coupon sai kiểu');
  const v = coupon.value;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError('Giá trị coupon không hợp lệ');
  if (coupon.type === 'percent') {
    if (v < 0 || v > 100) throw new RangeError('Percent ngoài [0,100]: ' + v);
    return Math.round((totalCents * (100 - v)) / 100) + 0; // +0 chuẩn hóa -0
  }
  if (coupon.type === 'fixed') {
    if (!Number.isInteger(v) || v < 0) throw new RangeError('Fixed không hợp lệ: ' + v);
    return Math.max(0, totalCents - v) + 0;
  }
  throw new RangeError('Loại coupon không hợp lệ');
}

module.exports = { total, applyCoupon };
