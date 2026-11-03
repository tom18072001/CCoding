'use strict';

function toCents(x) {
  if (!Number.isFinite(x) || x < 0) throw new RangeError('Số tiền không hợp lệ: ' + x);
  return Math.floor(x * 100);
}

module.exports = { toCents };
