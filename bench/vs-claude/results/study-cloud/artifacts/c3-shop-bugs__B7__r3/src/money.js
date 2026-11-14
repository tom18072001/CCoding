// Amounts are VND (integer dong). Percent discounts are rounded half-up to the nearest dong.
export function applyPercent(amount, pct) {
  return amount - Math.floor((amount * pct + 50) / 100);
}
export function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}
