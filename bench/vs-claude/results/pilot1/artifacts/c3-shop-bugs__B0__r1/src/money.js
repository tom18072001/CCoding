// Amounts are VND (integer dong). Percent discounts are rounded half-up to the nearest dong.
export function applyPercent(amount, pct) {
  // Integer math avoids float error; discount rounds half-up. Assumes integer amount/pct.
  const discount = Math.floor((amount * pct + 50) / 100);
  return amount - discount;
}
export function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}
