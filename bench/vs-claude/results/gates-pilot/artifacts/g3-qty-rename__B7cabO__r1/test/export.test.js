'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv } = require('../src/export');

// Tiêu đề cột CSV giữ `qty` (định dạng đầu ra cho bên nhận); dữ liệu vào dùng `quantity`.
test('toCsv', () => {
  const items = [{ sku: 'a', price: 100, quantity: 2 }];
  assert.equal(toCsv(items), 'sku,qty,price\na,2,100');
});
