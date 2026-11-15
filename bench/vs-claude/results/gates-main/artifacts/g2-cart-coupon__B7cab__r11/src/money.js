'use strict';

function toCents(x) {
  if (!Number.isFinite(x) || x < 0) throw new RangeError('Số tiền không hợp lệ: ' + x);
  // toPrecision(12) khử sai số nhị phân (vd 1.005*100 = 100.49999999999999) trước khi làm tròn nửa lên
  return Math.round(Number((x * 100).toPrecision(12)));
}

module.exports = { toCents };
