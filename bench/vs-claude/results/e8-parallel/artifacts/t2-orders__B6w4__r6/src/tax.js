'use strict';

const RATES = { standard: 0.1, reduced: 0.05, zero: 0 };

/** Thuế của một dòng (xu), làm tròn half up tới xu. */
function lineTax(amountCents, taxClass) {
  const rate = RATES[taxClass];
  if (rate === undefined) throw new Error(`Loại thuế không hợp lệ: ${taxClass}`);
  // số nguyên (basis points) để tránh sai số float khi nhân với tỉ lệ thập phân
  return Math.round((amountCents * Math.round(rate * 10000)) / 10000);
}

module.exports = { RATES, lineTax };
