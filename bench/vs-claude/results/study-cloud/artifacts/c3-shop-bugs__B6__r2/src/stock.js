const stock = new Map();
export function setStock(sku, qty) { stock.set(sku, qty); }
export function available(sku) { return stock.get(sku) ?? 0; }
/** Reserve qty units; throws Error('INSUFFICIENT_STOCK') if not enough. */
export function reserve(sku, qty) {
  const have = available(sku);
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('INVALID_QTY');
  if (have < qty) throw new Error('INSUFFICIENT_STOCK');
  stock.set(sku, have - qty);
}
export function release(sku, qty) { stock.set(sku, available(sku) + qty); }
