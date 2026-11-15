// Amounts are VND (integer dong). Percent discounts are rounded half-up to the nearest dong.
export function applyPercent(amount, pct) {
  // discount = round-half-up(amount * pct / 100), computed in integer math (non-negative inputs)
  const discount = Math.floor((amount * pct + 50) / 100);
  return amount - discount;
}
export function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}
