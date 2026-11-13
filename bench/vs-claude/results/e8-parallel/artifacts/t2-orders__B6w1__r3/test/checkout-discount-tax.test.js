'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');

function cartWith(promo) {
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price: 1.005, taxClass: 'standard' },
    { sku: 'B', name: 'B', price: 10, taxClass: 'reduced' },
    { sku: 'C', name: 'C', price: 7.5, taxClass: 'zero' },
  ]);
  const cart = new Cart(catalog, new Inventory({ A: 10, B: 10, C: 10 }), [promo]);
  cart.addItem('A', 1);
  cart.addItem('B', 1);
  cart.addItem('C', 1);
  cart.applyCoupon(promo.code, new Date('2026-01-01T00:00:00Z'));
  return cart;
}

test('mã giảm cố định 10.00 chia 3 dòng: tổng giảm đúng 1000 xu', () => {
  const t = computeTotals(cartWith({ code: 'F', type: 'fixed', amount: 10 }));
  assert.equal(t.discount, 1000);
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 1000);
});

test('mã giảm % tổng giảm đúng số tiền của mã', () => {
  const t = computeTotals(cartWith({ code: 'P', type: 'percent', percent: 15 }));
  const sub = 101 + 1000 + 750;
  assert.equal(t.discount, Math.round((sub * 15) / 100));
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), t.discount);
});

test('thuế tính trên net sau giảm', () => {
  const t = computeTotals(cartWith({ code: 'F', type: 'fixed', amount: 5 }));
  for (const l of t.lines) assert.equal(l.net, l.gross - l.discount);
  const b = t.lines.find((l) => l.sku === 'B');
  assert.equal(b.tax, Math.round(b.net * 0.05));
  assert.ok(b.tax < 50);
  assert.equal(t.total, t.lines.reduce((a, l) => a + l.net + l.tax, 0));
});

test('mã cố định 1.005 đổi qua toCents → 101 xu', () => {
  const t = computeTotals(cartWith({ code: 'F', type: 'fixed', amount: 1.005 }));
  assert.equal(t.discount, 101);
});
