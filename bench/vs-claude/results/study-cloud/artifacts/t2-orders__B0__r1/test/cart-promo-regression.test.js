'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');
const { freeUnits, checkValidity, PromotionError } = require('../src/promotions');
const { OutOfStockError } = require('../src/inventory');

function setup(promos = [], stock = { TEA: 10, MUG: 5 }) {
  const catalog = new Catalog([
    { sku: 'TEA', name: 'Trà', price: 5, category: 'drink', taxClass: 'reduced' },
    { sku: 'MUG', name: 'Cốc', price: 12.5, category: 'home' },
  ]);
  const inv = new Inventory(stock);
  return { catalog, inv, cart: new Cart(catalog, inv, promos) };
}

test('bxgy: freeUnits cần đủ nhóm buy+free', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(4, 3, 2), 0);
  assert.equal(freeUnits(5, 3, 2), 2);
  assert.equal(freeUnits(10, 3, 2), 4);
});

test('bxgy: giỏ 2 hộp mua 2 tặng 1 không giảm', () => {
  const { cart } = setup([{ code: 'B2G1', type: 'bxgy', sku: 'MUG', buy: 2, free: 1 }]);
  cart.addItem('MUG', 2);
  cart.applyCoupon('B2G1');
  assert.equal(computeTotals(cart).discount, 0);
});

test('endsAt hiệu lực hết ngày endsAt (UTC)', () => {
  const p = { code: 'X', type: 'percent', percent: 10, endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(
    () => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0),
    (e) => e instanceof PromotionError && e.reason === 'đã hết hạn',
  );
});

test('startsAt giữ nguyên', () => {
  const p = { code: 'X', type: 'percent', percent: 10, startsAt: '2026-11-10' };
  assert.throws(() => checkValidity(p, new Date('2026-11-09T23:59:59Z'), 0), /chưa tới ngày/);
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-10T00:00:00Z'), 0));
});

test('kho: updateQty chỉ giữ phần chênh lệch', () => {
  const { cart, inv } = setup();
  cart.addItem('MUG', 2);
  cart.updateQty('MUG', 3);
  assert.equal(inv.available('MUG'), 2);
  cart.updateQty('MUG', 1);
  assert.equal(inv.available('MUG'), 4);
});

test('kho: removeItem và updateQty 0 trả hàng', () => {
  const { cart, inv, catalog } = setup();
  cart.addItem('MUG', 3);
  cart.removeItem('MUG');
  assert.equal(inv.available('MUG'), 5);
  cart.addItem('MUG', 4);
  cart.updateQty('MUG', 0);
  assert.equal(inv.available('MUG'), 5);
  new Cart(catalog, inv).addItem('MUG', 5); // giỏ khác mua được
  assert.equal(inv.available('MUG'), 0);
});

test('kho: hai giỏ chung Inventory giữ bất biến', () => {
  const { cart, inv, catalog } = setup();
  const c2 = new Cart(catalog, inv);
  cart.addItem('MUG', 2);
  c2.addItem('MUG', 2);
  cart.updateQty('MUG', 3);
  c2.updateQty('MUG', 1);
  assert.equal(inv.reserved.get('MUG'), 4);
  cart.removeItem('MUG');
  assert.equal(inv.reserved.get('MUG'), 1);
});

test('kho: vượt kho thì giỏ và reserved không đổi', () => {
  const { cart, inv } = setup();
  cart.addItem('MUG', 2);
  assert.throws(() => cart.updateQty('MUG', 6), OutOfStockError);
  assert.equal(cart.lines.get('MUG'), 2);
  assert.equal(inv.reserved.get('MUG'), 2);
});
