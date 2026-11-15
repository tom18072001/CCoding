'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { summary } = require('../src/report');

test('summary cộng quantity', () => {
  const items = [{ sku: 'a', price: 10, quantity: 4 }, { sku: 'b', price: 5, quantity: 2 }];
  assert.deepEqual(summary(items), { lines: 2, units: 6, total: 50 });
});
