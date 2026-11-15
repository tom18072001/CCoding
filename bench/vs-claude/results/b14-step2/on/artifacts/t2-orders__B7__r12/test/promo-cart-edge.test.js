'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Catalog, Inventory, Cart } = require('../src');
const { freeUnits, checkValidity } = require('../src/promotions');

function mk(stock = { A: 4 }, promos = []) {
  const catalog = new Catalog([{ sku: 'A', name: 'a', price: 1, category: 'x' }]);
  const inv = new Inventory(stock);
  return { cart: new Cart(catalog, inv, promos), inv };
}

test('freeUnits: chu kỳ buy+free và qty biên', () => {
  assert.equal(freeUnits(2, 2, 1), 0);
  assert.equal(freeUnits(3, 2, 1), 1);
  assert.equal(freeUnits(5, 2, 1), 1);
  assert.equal(freeUnits(6, 2, 1), 2);
  assert.equal(freeUnits(0, 2, 1), 0);
  assert.equal(freeUnits(7, 3, 2), 2);
});

test('freeUnits: buy/free bằng 0 hoặc không hợp lệ trả 0, không NaN', () => {
  for (const [b, f] of [[0, 0], [0, 1], [2, 0], [-1, 1], [NaN, 1], [2, undefined]]) {
    assert.equal(freeUnits(6, b, f), 0);
  }
});

test('checkValidity: endsAt chỉ có ngày dùng được hết ngày (UTC)', () => {
  const p = { code: 'X', endsAt: '2026-11-30' };
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T10:00:00Z'), 0));
  assert.doesNotThrow(() => checkValidity(p, new Date('2026-11-30T23:59:59.999Z'), 0));
  assert.throws(() => checkValidity(p, new Date('2026-12-01T00:00:00Z'), 0), /hết hạn/);
});

test('checkValidity: endsAt có giờ, rỗng, sai định dạng', () => {
  const t = new Date('2026-11-30T10:00:00Z');
  assert.throws(() => checkValidity({ code: 'X', endsAt: '2026-11-30T09:00:00Z' }, t, 0), /hết hạn/);
  assert.doesNotThrow(() => checkValidity({ code: 'X', endsAt: '2026-11-30T11:00:00Z' }, t, 0));
  assert.doesNotThrow(() => checkValidity({ code: 'X', endsAt: '' }, t, 0));
  assert.doesNotThrow(() => checkValidity({ code: 'X' }, t, 0));
  assert.throws(() => checkValidity({ code: 'X', endsAt: 'abc' }, t, 0), /hết hạn/); // fail closed
});

test('updateQty: lên/xuống/bằng nhau/về 0 giữ chỗ đúng', () => {
  const { cart, inv } = mk();
  cart.addItem('A', 2);
  cart.updateQty('A', 3);
  assert.equal(inv.reserved.get('A'), 3);
  cart.updateQty('A', 3);
  assert.equal(inv.reserved.get('A'), 3);
  cart.updateQty('A', 1);
  assert.equal(inv.reserved.get('A'), 1);
  cart.updateQty('A', 0);
  assert.equal(inv.reserved.get('A'), 0);
  assert.equal(inv.available('A'), 4);
  assert.equal(cart.lines.has('A'), false);
});

test('updateQty vượt tồn kho: lỗi, không đổi giỏ và không rò rỉ giữ chỗ', () => {
  const { cart, inv } = mk();
  cart.addItem('A', 2);
  assert.throws(() => cart.updateQty('A', 5), { name: 'OutOfStockError' });
  assert.equal(cart.lines.get('A'), 2);
  assert.equal(inv.reserved.get('A'), 2);
  cart.updateQty('A', 4);
  assert.equal(inv.available('A'), 0);
});

test('updateQty qty không hợp lệ hoặc sku không có trong giỏ', () => {
  const { cart, inv } = mk();
  cart.addItem('A', 2);
  assert.throws(() => cart.updateQty('A', -1), RangeError);
  assert.throws(() => cart.updateQty('A', 1.5), RangeError);
  assert.throws(() => cart.updateQty('Z', 1));
  assert.equal(inv.reserved.get('A'), 2);
});

test('removeItem: trả chỗ, gọi hai lần hoặc sku không tồn tại không ảnh hưởng', () => {
  const { cart, inv } = mk();
  const other = new Cart(cart.catalog, inv);
  cart.addItem('A', 2);
  other.addItem('A', 1);
  cart.removeItem('A');
  cart.removeItem('A');
  cart.removeItem('Z');
  assert.equal(inv.reserved.get('A'), 1); // chỉ còn giỏ khác
  other.addItem('A', 3);
  assert.equal(inv.available('A'), 0);
});
