'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv } = require('../src/export');

test('toCsv có tiêu đề sku,quantity,price', () => {
  const csv = toCsv([{ sku: 'a', price: 10, quantity: 4 }]);
  assert.equal(csv, 'sku,quantity,price\na,4,10');
});
