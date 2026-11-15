'use strict';

const RATES = { standard: 0.1, reduced: 0.05, zero: 0 };

/** Thuế của một dòng (xu), làm tròn half up tới xu. */
function lineTax(amountCents, taxClass) {
  const rate = RATES[taxClass];
  if (rate === undefined) throw new Error(`Loại thuế không hợp lệ: ${taxClass}`);
  const bp = Math.round(rate * 10000); // điểm cơ bản, tính bằng số nguyên
  const sign = amountCents < 0 ? -1 : 1;
  const t = Math.floor((Math.abs(amountCents) * bp + 5000) / 10000);
  return t === 0 ? 0 : sign * t;
}

module.exports = { RATES, lineTax };
