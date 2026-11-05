'use strict';
const { PromotionError, checkValidity } = require('./promotions');

/** Giỏ hàng: giữ chỗ tồn kho ngay khi thêm/sửa số lượng; tối đa một mã giảm giá. */
class Cart {
  constructor(catalog, inventory, promotions = []) {
    this.catalog = catalog;
    this.inventory = inventory;
    this.promotions = new Map(promotions.map((p) => [p.code.toUpperCase(), p]));
    this.lines = new Map(); // sku -> qty
    this.coupon = null;
  }

  addItem(sku, qty = 1) {
    if (!Number.isInteger(qty) || qty <= 0) throw new RangeError('qty phải là số nguyên dương');
    this.catalog.get(sku);
    this.inventory.reserve(sku, qty);
    this.lines.set(sku, (this.lines.get(sku) ?? 0) + qty);
  }

  updateQty(sku, qty) {
    if (!this.lines.has(sku)) throw new Error(`Giỏ không có ${sku}`);
    if (!Number.isInteger(qty) || qty < 0) throw new RangeError('qty phải là số nguyên không âm');
    if (qty === 0) return this.removeItem(sku);
    const delta = qty - this.lines.get(sku);
    if (delta > 0) this.inventory.reserve(sku, delta);
    else if (delta < 0) this.inventory.release(sku, -delta);
    this.lines.set(sku, qty);
  }

  removeItem(sku) {
    const qty = this.lines.get(sku);
    if (qty === undefined) return;
    this.inventory.release(sku, qty);
    this.lines.delete(sku);
  }

  items() {
    return [...this.lines.entries()].map(([sku, qty]) => ({ sku, qty, product: this.catalog.get(sku) }));
  }

  subtotalCents() {
    return this.items().reduce((a, it) => a + it.product.priceCents * it.qty, 0);
  }

  applyCoupon(code, now = new Date()) {
    const promo = this.promotions.get(String(code).toUpperCase());
    if (!promo) throw new PromotionError(code, 'mã không tồn tại');
    checkValidity(promo, now, this.subtotalCents());
    this.coupon = promo;
    return promo;
  }

  removeCoupon() {
    this.coupon = null;
  }
}

module.exports = { Cart };
