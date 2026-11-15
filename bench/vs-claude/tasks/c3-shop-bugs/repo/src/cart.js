import { applyPercent, sum } from './money.js';
import { reserve, release } from './stock.js';

export const MAX_QTY_PER_LINE = 10;

export function createCart() { return { lines: [], couponPct: 0 }; }

/** Add qty of sku at unitPrice (VND). A line may hold at most MAX_QTY_PER_LINE units. */
export function addItem(cart, sku, unitPrice, qty) {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('BAD_QTY');
  const line = cart.lines.find((l) => l.sku === sku);
  const current = line ? line.qty : 0;
  if (current + qty >= MAX_QTY_PER_LINE) throw new Error('QTY_LIMIT');
  reserve(sku, qty);
  if (line) line.qty += qty; else cart.lines.push({ sku, unitPrice, qty });
}

export function removeItem(cart, sku) {
  const i = cart.lines.findIndex((l) => l.sku === sku);
  if (i < 0) return;
  release(sku, cart.lines[i].qty);
  cart.lines.splice(i, 1);
}

export function applyCoupon(cart, pct) { cart.couponPct = pct; }

/** Total in VND: each line = unitPrice*qty; coupon applies once to the subtotal. */
export function total(cart) {
  const lines = cart.lines.map((l) => applyPercent(l.unitPrice * l.qty, cart.couponPct));
  const subtotal = sum(lines);
  return applyPercent(subtotal, cart.couponPct);
}
