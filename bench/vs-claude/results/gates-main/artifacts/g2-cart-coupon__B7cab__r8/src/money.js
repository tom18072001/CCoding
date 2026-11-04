'use strict';

function toCents(x) {
  if (!Number.isFinite(x) || x < 0) throw new RangeError('Số tiền không hợp lệ: ' + x);
  return Math.round(Number((x * 100).toPrecision(15)));
}

module.exports = { toCents };
