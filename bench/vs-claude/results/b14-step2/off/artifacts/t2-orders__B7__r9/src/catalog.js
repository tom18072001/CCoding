'use strict';
const { toCents } = require('./money');

class Catalog {
  constructor(products = []) {
    this.bySku = new Map();
    for (const p of products) this.add(p);
  }

  /** p: { sku, name, price (đơn vị tiền), category, taxClass: 'standard' | 'reduced' | 'zero' } */
  add(p) {
    if (!p.sku) throw new Error('thiếu sku');
    this.bySku.set(p.sku, { ...p, priceCents: toCents(p.price), taxClass: p.taxClass ?? 'standard' });
  }

  get(sku) {
    const p = this.bySku.get(sku);
    if (!p) throw new Error(`Không có sản phẩm ${sku}`);
    return p;
  }
}

module.exports = { Catalog };
