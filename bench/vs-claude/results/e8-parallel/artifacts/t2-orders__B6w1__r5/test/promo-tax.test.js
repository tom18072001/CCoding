'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { checkValidity, freeUnits, PromotionError } = require('../src/promotions');
const { lineTax } = require('../src/tax');

test('freeUnits mua 2 tặng 1', () => {
  assert.deepEqual([0, 1, 2, 3, 5, 6].map((q) => freeUnits(q, 2, 1)), [0, 0, 0, 1, 1, 2]);
});

test('freeUnits cấu hình khác: mua 1 tặng 1, mua 3 tặng 2', () => {
  assert.deepEqual([1, 2, 3].map((q) => freeUnits(q, 1, 1)), [0, 1, 1]);
  assert.deepEqual([3, 4, 5, 8, 10].map((q) => freeUnits(q, 3, 2)), [0, 1, 2, 2, 4]);
});

test('checkValidity: dùng được tới hết ngày endsAt, từ chối từ 00:00Z ngày sau', () => {
  const p = { code: 'X', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), PromotionError);
});

test('checkValidity: mã hết hạn thật và startsAt giữ hành vi cũ', () => {
  assert.throws(() => checkValidity({ code: 'X', endsAt: '2026-11-01' }, new Date('2026-11-20T00:00:00Z'), 0), PromotionError);
  const p = { code: 'Y', startsAt: '2026-11-10' };
  assert.throws(() => checkValidity(p, new Date('2026-11-09T23:59:59Z'), 0), PromotionError);
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-10T00:00:00Z'), 0));
});

function cartWith(promo) {
  const catalog = new Catalog([
    { sku: 'TEA', name: 'Trà', price: 5, category: 'drink', taxClass: 'standard' },
    { sku: 'MUG', name: 'Cốc', price: 10, category: 'home', taxClass: 'standard' },
  ]);
  const c = new Cart(catalog, new Inventory({ TEA: 10, MUG: 10 }), []);
  c.addItem('TEA', 3);
  c.addItem('MUG', 1);
  c.coupon = promo;
  return c;
}

test('thuế tính trên net khi có mã giảm', () => {
  const t = computeTotals(cartWith({ code: 'C', type: 'category', category: 'drink', percent: 20 }));
  const tea = t.lines.find((l) => l.sku === 'TEA');
  assert.equal(tea.net, 1200);
  assert.equal(tea.tax, 120);
  assert.equal(t.tax, 120 + 100);
  assert.equal(t.total, 1200 + 1000 + 220);
});

test('thuế trên net với bxgy', () => {
  const t = computeTotals(cartWith({ code: 'B', type: 'bxgy', sku: 'TEA', buy: 2, free: 1 }));
  assert.equal(t.lines[0].discount, 500);
  assert.equal(t.lines[0].tax, 100);
});

test('không có mã thì thuế như cũ', () => {
  const t = computeTotals(cartWith(null));
  assert.equal(t.tax, 150 + 100);
  assert.equal(lineTax(1000, 'standard'), 100);
});
