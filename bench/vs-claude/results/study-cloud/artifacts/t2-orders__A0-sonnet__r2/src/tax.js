'use strict';

const RATES = { standard: 0.1, reduced: 0.05, zero: 0 };

/** Thuế của một dòng (xu), làm tròn half up tới xu. */
function lineTax(amountCents, taxClass) {
  const rate = RATES[taxClass];
  if (rate === undefined) throw new Error(`Loại thuế không hợp lệ: ${taxClass}`);
  // rate*1000 là số nguyên (0.1→100, 0.05→50): tính số nguyên để không lệch khi làm tròn .5
  const permille = Math.round(rate * 1000);
  const sign = amountCents < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(amountCents) * permille + 500) / 1000);
}

module.exports = { RATES, lineTax };
