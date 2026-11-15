'use strict';
const { allocate, toCents, roundHalfAway } = require('./money');
const { lineTax } = require('./tax');
const { freeUnits } = require('./promotions');

/**
 * Tính tiền giỏ hàng (mọi số tiền bằng xu):
 *  - gross = đơn giá × số lượng
 *  - discount: giảm giá phân bổ cho từng dòng (xem promotions.js); giảm toàn giỏ chia theo tỉ lệ gross (allocate)
 *  - net = gross − discount (giá sau giảm, chưa thuế)
 *  - tax = thuế tính trên net theo loại thuế của sản phẩm, làm tròn từng dòng
 *  - total = Σ net + Σ tax
 * Kết quả: { lines: [{ sku, qty, unitPrice, gross, discount, net, tax }], subtotal, discount, tax, total }
 */
function computeTotals(cart) {
  const items = cart.items();
  const lines = items.map((it) => ({
    sku: it.sku,
    qty: it.qty,
    unitPrice: it.product.priceCents,
    gross: it.product.priceCents * it.qty,
    discount: 0,
    taxClass: it.product.taxClass,
    category: it.product.category,
  }));
  const promo = cart.coupon;
  if (promo) {
    if (promo.type === 'percent') {
      const subtotal = lines.reduce((a, l) => a + l.gross, 0);
      const totalDiscount = roundHalfAway((subtotal * promo.percent) / 100);
      allocate(totalDiscount, lines.map((l) => l.gross)).forEach((d, i) => (lines[i].discount += d));
    } else if (promo.type === 'fixed') {
      const subtotal = lines.reduce((a, l) => a + l.gross, 0);
      const totalDiscount = Math.min(subtotal, toCents(promo.amount));
      allocate(totalDiscount, lines.map((l) => l.gross)).forEach((d, i) => (lines[i].discount += d));
    } else if (promo.type === 'category') {
      for (const l of lines) if (l.category === promo.category) l.discount += roundHalfAway((l.gross * promo.percent) / 100);
    } else if (promo.type === 'bxgy') {
      for (const l of lines) if (l.sku === promo.sku) l.discount += freeUnits(l.qty, promo.buy, promo.free) * l.unitPrice;
    }
  }
  for (const l of lines) {
    l.net = l.gross - l.discount;
    l.tax = lineTax(l.net, l.taxClass);
  }
  const sum = (k) => lines.reduce((a, l) => a + l[k], 0);
  return {
    lines: lines.map(({ sku, qty, unitPrice, gross, discount, net, tax }) => ({ sku, qty, unitPrice, gross, discount, net, tax })),
    subtotal: sum('gross'),
    discount: sum('discount'),
    tax: sum('tax'),
    total: sum('net') + sum('tax'),
  };
}

module.exports = { computeTotals };
