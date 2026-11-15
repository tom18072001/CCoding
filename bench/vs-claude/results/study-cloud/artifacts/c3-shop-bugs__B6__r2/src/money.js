// Amounts are VND (integer dong). Percent discounts are rounded half-up to the nearest dong.
export function applyPercent(amount, pct) {
  // result = round-half-up(amount*(100-pct)/100), computed without float division
  return Math.floor((amount * (100 - pct) * 2 + 100) / 200);
}
export function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}
