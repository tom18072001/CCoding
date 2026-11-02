'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart, computeTotals } = require('../src');

function setup(stock = { A: 4 }, promos = []) {
  const catalog = new Catalog([
    { sku: 'A', name: 'A', price: 10, taxClass: 'standard' },
    { sku: 'B', name: 'B', price: 10, taxClass: 'standard' },
  ]);
  const inv = new Inventory(stock);
  return { cart: new Cart(catalog, inv, promos), catalog, inv };
}

test('sửa số lượng 2 -> 3 chỉ giữ chỗ phần chênh', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.reserved.get('A'), 3);
  assert.equal(inv.available('A'), 1);
});

test('giảm số lượng nhả phần chênh; vượt kho vẫn báo hết hàng', () => {
  const { cart, inv } = setup();
  cart.addItem('A', 3);
  cart.updateQty('A', 1);
  assert.equal(inv.available('A'), 3);
  assert.throws(() => cart.updateQty('A', 5), { name: 'OutOfStockError' });
  assert.equal(inv.reserved.get('A'), 1);
  cart.updateQty('A', 4);
  assert.equal(inv.available('A'), 0);
});

test('xóa món và updateQty 0 nhả toàn bộ chỗ', () => {
  const { cart, catalog, inv } = setup();
  cart.addItem('A', 4);
  cart.removeItem('A');
  assert.equal(inv.available('A'), 4);
  const other = new Cart(catalog, inv);
  other.addItem('A', 4);
  other.updateQty('A', 0);
  assert.equal(inv.available('A'), 4);
  cart.removeItem('A'); // xóa lại không làm lệch
  assert.equal(inv.available('A'), 4);
});

test('thuế tính trên net sau giảm', () => {
  const { cart } = setup({ A: 5, B: 5 }, [{ code: 'X', type: 'fixed', amount: 10 }]);
  cart.addItem('A', 1);
  cart.addItem('B', 1);
  cart.applyCoupon('X');
  const t = computeTotals(cart);
  assert.equal(t.discount, 1000);
  assert.equal(t.tax, 100);
  assert.deepEqual(t.lines.map((l) => l.tax), [50, 50]);
  assert.equal(t.total, 1000 + 100);
});
