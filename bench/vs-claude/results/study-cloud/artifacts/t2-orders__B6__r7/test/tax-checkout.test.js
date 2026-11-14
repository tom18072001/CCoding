'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');

function mk(coupon) {
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price: 3.33, category: 'x' },
    { sku: 'B', name: 'B', price: 3.33, category: 'x', taxClass: 'reduced' },
    { sku: 'C', name: 'C', price: 3.34, category: 'y' },
  ]);
  const cart = new Cart(catalog, new Inventory({ A: 9, B: 9, C: 9 }), []);
  for (const s of ['A', 'B', 'C']) cart.addItem(s, 1);
  cart.coupon = coupon;
  return cart;
}

test('mã cố định 10.00 trên giỏ 3 món: tổng giảm đúng 1000', () => {
  const t = computeTotals(mk({ type: 'fixed', amount: 10 }));
  assert.equal(t.discount, 1000);
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 1000);
  for (const l of t.lines) assert.equal(l.net, l.gross - l.discount);
});

test('mã %: tổng giảm = round(subtotal*%), total nhất quán với dòng', () => {
  const t = computeTotals(mk({ type: 'percent', percent: 15 }));
  assert.equal(t.discount, Math.round((1000 * 15) / 100));
  assert.equal(t.total, t.lines.reduce((a, l) => a + l.net + l.tax, 0));
});

test('thuế tính trên net từng dòng, làm tròn từng dòng', () => {
  const t = computeTotals(mk({ type: 'fixed', amount: 10 }));
  assert.equal(t.tax, 0);
  const t2 = computeTotals(mk({ type: 'percent', percent: 50 }));
  const [a, b, c] = t2.lines;
  assert.equal(a.tax, Math.round(a.net * 0.1));
  assert.equal(b.tax, Math.round(b.net * 0.05));
  assert.equal(c.tax, Math.round(c.net * 0.1));
  assert.equal(t2.tax, a.tax + b.tax + c.tax);
});
