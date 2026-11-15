'use strict';

const RATES = { standard: 0.1, reduced: 0.05, zero: 0 };

/** Thuế của một dòng (xu) tính trên net (sau giảm), làm tròn half up tới xu. */
function lineTax(amountCents, taxClass) {
  const rate = RATES[taxClass];
  if (rate === undefined) throw new Error(`Loại thuế không hợp lệ: ${taxClass}`);
  return Math.round(amountCents * rate);
}

module.exports = { RATES, lineTax };
