'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeTotals } = require('../src/checkout');
const { lineTax } = require('../src/tax');

function fakeCart(items, coupon) {
  return { coupon, items: () => items };
}
const tea = { sku: 'TEA', qty: 2, product: { priceCents: 500, taxClass: 'reduced', category: 'drink' } };
const mug = { sku: 'MUG', qty: 1, product: { priceCents: 1250, taxClass: 'standard', category: 'home' } };

test('lineTax tính theo loại thuế', () => {
  assert.equal(lineTax(1000, 'standard'), 100);
  assert.equal(lineTax(1000, 'reduced'), 50);
  assert.equal(lineTax(1000, 'zero'), 0);
  assert.throws(() => lineTax(1000, 'x'));
});

test('thuế tính trên net sau giảm (giảm theo %)', () => {
  const t = computeTotals(fakeCart([tea, mug], { type: 'percent', percent: 20 }));
  assert.deepEqual(t.lines.map((l) => l.net), [800, 1000]);
  assert.deepEqual(t.lines.map((l) => l.tax), [40, 100]);
  assert.equal(t.tax, 140);
  assert.equal(t.subtotal, 2250);
  assert.equal(t.total, 1800 + 140);
});

test('thuế trên net với giảm theo danh mục', () => {
  const t = computeTotals(fakeCart([tea, mug], { type: 'category', category: 'home', percent: 100 }));
  assert.equal(t.lines[1].net, 0);
  assert.equal(t.lines[1].tax, 0);
  assert.equal(t.tax, 50);
  assert.equal(t.total, t.lines.reduce((a, l) => a + l.net + l.tax, 0));
});

test('không mã giảm giá: thuế như cũ', () => {
  const t = computeTotals(fakeCart([tea, mug], null));
  assert.equal(t.tax, 175);
  assert.equal(t.total, 2425);
});
