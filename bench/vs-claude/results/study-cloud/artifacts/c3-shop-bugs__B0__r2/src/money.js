// Amounts are VND (integer dong). Percent discounts are rounded half-up to the nearest dong.
export function applyPercent(amount, pct) {
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) throw new Error('BAD_PCT');
  const discount = Math.floor((amount * pct + 50) / 100);
  return amount - discount;
}
export function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}
