'use strict';
const { allocate: moneyAllocate } = require('./money');
const { lineTax } = require('./tax');
const { freeUnits } = require('./promotions');

/**
 * Chia total xu theo trọng số, phương pháp phần dư lớn nhất (tổng các phần = total).
 * Tự bảo đảm tổng đúng kể cả khi allocate của money.js chỉ lấy phần nguyên.
 */
function allocate(total, weights) {
  const parts = moneyAllocate(total, weights).slice();
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return parts;
  let left = total - parts.reduce((a, b) => a + b, 0);
  if (left <= 0) return parts;
  const order = weights
    .map((w, i) => ({ i, rem: (total * w) % sum }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) parts[order[k].i] += 1;
  return parts;
}

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
      const totalDiscount = Math.round((subtotal * promo.percent) / 100);
      allocate(totalDiscount, lines.map((l) => l.gross)).forEach((d, i) => (lines[i].discount += d));
    } else if (promo.type === 'fixed') {
      const subtotal = lines.reduce((a, l) => a + l.gross, 0);
      const totalDiscount = Math.min(subtotal, Math.round(promo.amount * 100));
      allocate(totalDiscount, lines.map((l) => l.gross)).forEach((d, i) => (lines[i].discount += d));
    } else if (promo.type === 'category') {
      for (const l of lines) if (l.category === promo.category) l.discount += Math.round((l.gross * promo.percent) / 100);
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
