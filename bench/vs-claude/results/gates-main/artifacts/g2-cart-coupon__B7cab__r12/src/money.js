'use strict';

function toCents(x) {
  if (!Number.isFinite(x) || x < 0) throw new RangeError('Số tiền không hợp lệ: ' + x);
  return Math.round(x * 100) + 0; // +0 chuẩn hóa -0
}

module.exports = { toCents };
