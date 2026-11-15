'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { lineTotal, orderTotal } = require('../src/order');
const { summary } = require('../src/report');
const { toCsv } = require('../src/export');
const { reserve } = require('../src/stock');

const items = [{ sku: 'a', price: 100, quantity: 2 }, { sku: 'b', price: 50, quantity: 1 }];
test('hidden/order lineTotal', () => { assert.equal(lineTotal(items[0]), 200); });
test('hidden/order orderTotal', () => { assert.equal(orderTotal(items), 250); });
test('hidden/report summary', () => { assert.deepEqual(summary(items), { lines: 2, units: 3, total: 250 }); });
test('hidden/export toCsv', () => { assert.equal(toCsv(items), 'sku,quantity,price\na,2,100\nb,1,50'); });
test('hidden/export rỗng', () => { assert.equal(toCsv([]), 'sku,quantity,price'); });
test('hidden/stock reserve', () => { assert.deepEqual(reserve({ a: 5, b: 1 }, items), { a: 3, b: 0 }); });
test('hidden/stock thiếu hàng', () => { assert.throws(() => reserve({ a: 1 }, items), /Thiếu hàng: a/); });
test('hidden/stock không đổi tồn gốc', () => { const s = { a: 5, b: 1 }; reserve(s, items); assert.deepEqual(s, { a: 5, b: 1 }); });
