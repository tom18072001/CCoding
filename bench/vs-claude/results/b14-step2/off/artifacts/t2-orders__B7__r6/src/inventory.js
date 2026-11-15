'use strict';

class OutOfStockError extends Error {
  constructor(sku, requested, available) {
    super(`Hết hàng: ${sku} (cần ${requested}, còn ${available})`);
    this.name = 'OutOfStockError';
    this.sku = sku;
    this.requested = requested;
    this.available = available;
  }
}

/** Tồn kho và lượng đang giữ chỗ cho các giỏ hàng. */
class Inventory {
  constructor(stock = {}) {
    this.stock = new Map(Object.entries(stock));
    this.reserved = new Map();
  }

  available(sku) {
    return (this.stock.get(sku) ?? 0) - (this.reserved.get(sku) ?? 0);
  }

  reserve(sku, qty) {
    const avail = this.available(sku);
    if (qty > avail) throw new OutOfStockError(sku, qty, avail);
    this.reserved.set(sku, (this.reserved.get(sku) ?? 0) + qty);
  }

  release(sku, qty) {
    const cur = this.reserved.get(sku) ?? 0;
    this.reserved.set(sku, Math.max(0, cur - qty));
  }
}

module.exports = { Inventory, OutOfStockError };
