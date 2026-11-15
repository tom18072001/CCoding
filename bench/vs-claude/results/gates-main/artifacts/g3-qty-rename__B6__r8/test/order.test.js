'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { orderTotal } = require('../src/order');
const { summary } = require('../src/report');

const items = [{ sku: 'a', price: 100, quantity: 2 }, { sku: 'b', price: 50, quantity: 1 }];
test('orderTotal', () => { assert.equal(orderTotal(items), 250); });
test('summary', () => { assert.deepEqual(summary(items), { lines: 2, units: 3, total: 250 }); });
test('toCsv', () => {
  const { toCsv } = require('../src/export');
  assert.equal(toCsv(items), 'sku,quantity,price\na,2,100\nb,1,50');
});
test('reserve', () => {
  const { reserve } = require('../src/stock');
  assert.deepEqual(reserve({ a: 5, b: 1 }, items), { a: 3, b: 0 });
  assert.throws(() => reserve({ a: 1 }, items), /Thiếu hàng/);
});
