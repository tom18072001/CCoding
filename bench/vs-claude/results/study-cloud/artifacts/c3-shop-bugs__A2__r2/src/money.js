// Amounts are VND (integer dong). Percent discounts are rounded half-up to the nearest dong.
export function applyPercent(amount, pct) {
  const discount = Math.floor((amount * pct * 2 + 100) / 200); // half-up, integer math
  return amount - discount;
}
export function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}
