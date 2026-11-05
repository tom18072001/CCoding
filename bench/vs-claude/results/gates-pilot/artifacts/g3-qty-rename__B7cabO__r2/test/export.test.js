'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv } = require('../src/export');

test('toCsv xuất cột quantity', () => {
  const items = [
    { sku: 'a', price: 100, quantity: 2 },
    { sku: 'b', price: 50, quantity: 1 },
  ];
  assert.equal(toCsv(items), 'sku,quantity,price\na,2,100\nb,1,50');
});

test('toCsv với danh sách rỗng chỉ trả về dòng tiêu đề', () => {
  assert.equal(toCsv([]), 'sku,quantity,price');
});
