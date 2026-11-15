'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { checkValidity, freeUnits } = require('../src/promotions');

test('freeUnits: mua 2 tặng 1 chỉ tặng khi đủ nhóm', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(5, 1, 1), 2);
  assert.equal(freeUnits(7, 3, 2), 2);
});

test('checkValidity: hợp lệ đến hết ngày endsAt (UTC)', () => {
  const p = { code: 'X', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('checkValidity: startsAt từ đầu ngày', () => {
  const p = { code: 'X', startsAt: '2026-11-10' };
  assert.throws(() => checkValidity(p, new Date('2026-11-09T23:59:59Z'), 0), /chưa tới/);
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-10T00:00:00Z'), 0));
});

test('thuế tính trên giá sau giảm', () => {
  const catalog = new Catalog([{ sku: 'MUG', name: 'Cốc', price: 10, category: 'home' }]);
  const cart = new Cart(catalog, new Inventory({ MUG: 5 }), [{ code: 'P50', type: 'percent', percent: 50 }]);
  cart.addItem('MUG', 2);
  cart.applyCoupon('P50');
  const t = computeTotals(cart);
  assert.equal(t.lines[0].net, 1000);
  assert.equal(t.tax, 100);
  assert.equal(t.total, 1100);
});
