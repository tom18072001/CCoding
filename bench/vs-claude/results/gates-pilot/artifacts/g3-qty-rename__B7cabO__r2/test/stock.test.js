'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { reserve } = require('../src/stock');

test('reserve: đủ hàng trừ đúng quantity và không đột biến stock gốc', () => {
  const stock = { a: 5, b: 3 };
  const next = reserve(stock, [{ sku: 'a', price: 100, quantity: 2 }, { sku: 'b', price: 50, quantity: 3 }]);
  assert.deepEqual(next, { a: 3, b: 0 });
  assert.deepEqual(stock, { a: 5, b: 3 });
});

test('reserve: thiếu hàng ném lỗi "Thiếu hàng: <sku>"', () => {
  assert.throws(
    () => reserve({ a: 1 }, [{ sku: 'a', price: 100, quantity: 2 }]),
    { message: 'Thiếu hàng: a' }
  );
});

test('reserve: item chỉ có qty không còn được đọc', () => {
  // Hành vi thực tế: quantity là undefined nên không ném lỗi và tồn kho thành NaN.
  const next = reserve({ a: 5 }, [{ sku: 'a', price: 100, qty: 2 }]);
  assert.notEqual(next.a, 3);
  assert.ok(Number.isNaN(next.a));
});
