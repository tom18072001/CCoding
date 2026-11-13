'use strict';

const RATES = { standard: 0.1, reduced: 0.05, zero: 0 };

/** Thuế của một dòng (xu), làm tròn half up tới xu. */
function lineTax(amountCents, taxClass) {
  const rate = RATES[taxClass];
  if (rate === undefined) throw new Error(`Loại thuế không hợp lệ: ${taxClass}`);
  const pct = Math.round(rate * 100); // phần trăm nguyên, tránh sai số dấu phẩy động
  return Math.floor((amountCents * pct + 50) / 100);
}

module.exports = { RATES, lineTax };
