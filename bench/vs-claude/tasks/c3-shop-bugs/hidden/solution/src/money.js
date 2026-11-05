export function applyPercent(amount, pct) { return amount - Math.floor((amount * pct) / 100 + 0.5); }
export function sum(values) { return values.reduce((a, b) => a + b, 0); }
