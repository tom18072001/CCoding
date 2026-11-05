'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { lineTax } = require('../src/tax');

function setup() {
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price: 10, category: 'x', taxClass: 'standard' },
    { sku: 'B', name: 'B', price: 20, category: 'y', taxClass: 'reduced' },
    { sku: 'C', name: 'C', price: 30, category: 'x', taxClass: 'zero' },
  ]);
  const cart = new Cart(catalog, new Inventory({ A: 10, B: 10, C: 10 }), []);
  cart.addItem('A', 1);
  cart.addItem('B', 1);
  cart.addItem('C', 1);
  return cart;
}

test('lineTax tính theo số tiền truyền vào', () => {
  assert.equal(lineTax(1000, 'standard'), 100);
  assert.equal(lineTax(0, 'reduced'), 0);
  assert.throws(() => lineTax(100, 'bogus'));
});

test('không có mã giảm: thuế trên giá gốc như cũ', () => {
  const t = computeTotals(setup());
  assert.deepEqual(t.lines.map((l) => l.tax), [100, 100, 0]);
  assert.equal(t.tax, 200);
  assert.equal(t.total, 6000 + 200);
});

test('mã giảm %: thuế từng dòng trên net, nhiều mức thuế', () => {
  const cart = setup();
  cart.coupon = { type: 'percent', percent: 50 };
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.net), [500, 1000, 1500]);
  assert.deepEqual(t.lines.map((l) => l.tax), [50, 50, 0]);
  assert.equal(t.tax, 100);
  assert.equal(t.total, 3000 + 100);
});

test('mã giảm cố định chia theo allocate, thuế trên net', () => {
  const cart = setup();
  cart.coupon = { type: 'fixed', amount: 10 };
  const t = computeTotals(cart);
  const classes = ['standard', 'reduced', 'zero'];
  for (const l of t.lines) assert.equal(l.net, l.gross - l.discount);
  assert.deepEqual(t.lines.map((l) => l.tax), t.lines.map((l, i) => lineTax(l.net, classes[i])));
  assert.equal(t.total, t.lines.reduce((a, l) => a + l.net + l.tax, 0));
});

test('mã theo danh mục: chỉ dòng trong danh mục được giảm thuế', () => {
  const cart = setup();
  cart.coupon = { type: 'category', category: 'x', percent: 100 };
  const t = computeTotals(cart);
  assert.deepEqual(t.lines.map((l) => l.tax), [0, 100, 0]);
});
