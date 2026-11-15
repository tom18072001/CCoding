// Amounts are VND (integer dong). Percent discounts are rounded half-up to the nearest dong.
export function applyPercent(amount, pct) {
  // discount = round-half-up(amount*pct/100) using integer math (amount >= 0)
  const discount = Math.floor((amount * pct * 2 + 100) / 200);
  return amount - discount;
}
export function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}
