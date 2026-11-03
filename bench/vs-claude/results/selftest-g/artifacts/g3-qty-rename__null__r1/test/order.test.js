'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { orderTotal } = require('../src/order');
const { summary } = require('../src/report');

const items = [{ sku: 'a', price: 100, qty: 2 }, { sku: 'b', price: 50, qty: 1 }];
test('orderTotal', () => { assert.equal(orderTotal(items), 250); });
test('summary', () => { assert.deepEqual(summary(items), { lines: 2, units: 3, total: 250 }); });
