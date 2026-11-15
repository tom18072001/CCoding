// Amounts are VND (integer dong). Percent discounts are rounded half-up to the nearest dong.
export function applyPercent(amount, pct) {
  // result = amount * (100 - pct) / 100, rounded half-up, using integer-friendly math
  return Math.floor((amount * (100 - pct) + 50) / 100);
}
export function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}
