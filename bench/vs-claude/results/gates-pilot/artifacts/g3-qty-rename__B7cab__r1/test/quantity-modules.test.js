'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { reserve } = require('../src/stock');
const { summary } = require('../src/report');
const { toCsv } = require('../src/export');

const items = [{ sku: 'a', quantity: 2, price: 100 }, { sku: 'b', quantity: 1, price: 50 }];

test('stock: trừ tồn kho theo quantity, không đổi đối tượng gốc', () => {
  const stock = { a: 5, b: 1 };
  assert.deepEqual(reserve(stock, items), { a: 3, b: 0 });
  assert.deepEqual(stock, { a: 5, b: 1 });
});

test('stock: ném lỗi khi quantity vượt tồn kho', () => {
  assert.throws(() => reserve({ a: 1 }, [{ sku: 'a', quantity: 2, price: 1 }]), /Thiếu hàng: a/);
});

test('report: units cộng theo quantity', () => {
  assert.equal(summary(items).units, 3);
  assert.equal(summary([]).units, 0);
});

test('export: CSV có tiêu đề sku,quantity,price và giá trị đúng', () => {
  assert.equal(toCsv(items), 'sku,quantity,price\na,2,100\nb,1,50');
});

test('qty cũ không được đọc', () => {
  const legacy = [{ sku: 'a', qty: 5, price: 10 }];
  assert.notEqual(summary(legacy).units, 5);
  assert.ok(!toCsv(legacy).includes('a,5,10'));
  assert.notEqual(reserve({ a: 10 }, legacy).a, 5);
});
