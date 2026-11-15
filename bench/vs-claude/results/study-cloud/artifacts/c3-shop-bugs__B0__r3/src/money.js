// Amounts are VND (integer dong). Percent discounts are rounded half-up to the nearest dong.
export function applyPercent(amount, pct) {
  if (!Number.isInteger(amount) || amount < 0 || !(pct >= 0 && pct <= 100)) throw new RangeError('BAD_PERCENT_ARGS');
  // Integer pct: exact integer math. Non-integer pct: round half-up on the scaled value.
  const discount = Number.isInteger(pct)
    ? Math.floor((amount * pct + 50) / 100)
    : Math.floor(amount * pct / 100 + 0.5);
  return amount - discount;
}
export function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}
