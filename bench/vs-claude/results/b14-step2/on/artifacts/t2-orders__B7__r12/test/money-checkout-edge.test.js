'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { toCents, allocate } = require('../src/money');

test('toCents: biên', () => {
  assert.equal(toCents(0), 0);
  assert.equal(Object.is(toCents(-0), 0), true);
  assert.equal(Object.is(toCents(-0.001), 0), true);
  assert.equal(toCents(0.004), 0);
  assert.equal(toCents(0.005), 1);
  assert.equal(toCents(-0.005), -1);
  assert.equal(toCents(1e-7), 0);
  assert.equal(toCents(1e-10), 0);
  assert.equal(toCents(1e21), 1e23);
  assert.equal(toCents(-2.675), -268);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(1.15), 115);
  assert.equal(toCents(8.325), 833);
});

test('toCents: đầu vào không hợp lệ ném TypeError', () => {
  for (const v of [NaN, Infinity, -Infinity, '1', null, undefined]) assert.throws(() => toCents(v), TypeError);
});

test('allocate: tổng phần chia luôn bằng total', () => {
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const cases = [
    [0, [1, 2, 3]], [1, [1, 1, 1]], [100, [0, 5, 0, 5]], [7, [1, 1, 1, 1, 1, 1]],
    [999999, [3, 3, 3, 1]], [-10, [1, 1, 1]], [-1, [2, 3]], [5, [0, 0, 1]],
  ];
  for (const [total, w] of cases) {
    const r = allocate(total, w);
    assert.equal(r.length, w.length);
    assert.equal(sum(r), total, `total=${total} w=${w}`);
    r.forEach((v, i) => { if (w[i] === 0) assert.equal(v, 0); });
  }
});

test('allocate: hòa thì phần đứng trước được trước; trọng số 0 không nhận', () => {
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepEqual(allocate(1, [0, 1, 1]), [0, 1, 0]);
  assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
  assert.deepEqual(allocate(5, []), []);
  assert.deepEqual(allocate(5, [0, 0, 0]), [0, 0, 0]);
});

test('checkout: giảm cố định vượt subtotal bị chặn, tổng giảm đúng, tax trên net', () => {
  const catalog = new Catalog([
    { sku: 'A', name: 'a', price: 1.01, category: 'x' },
    { sku: 'B', name: 'b', price: 2.02, category: 'x' },
  ]);
  const cart = new Cart(catalog, new Inventory({ A: 5, B: 5 }), [
    { code: 'BIG', type: 'fixed', amount: 100 },
    { code: 'F', type: 'fixed', amount: 1.005 },
  ]);
  cart.addItem('A', 1); cart.addItem('B', 1);
  cart.applyCoupon('BIG');
  let t = computeTotals(cart);
  assert.equal(t.discount, 303);
  assert.equal(t.total, t.lines.reduce((a, l) => a + l.net + l.tax, 0));
  cart.applyCoupon('F');
  t = computeTotals(cart);
  assert.equal(t.discount, 101);
  assert.equal(t.lines.reduce((a, l) => a + l.discount, 0), 101);
  assert.equal(t.subtotal - t.discount, t.lines.reduce((a, l) => a + l.net, 0));
});
