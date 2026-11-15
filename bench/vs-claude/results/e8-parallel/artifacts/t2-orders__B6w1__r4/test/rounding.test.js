'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents } = require('../src/money');
const { Catalog } = require('../src/catalog');

test('toCents làm tròn half away from zero đúng với giá trị nhị phân lệch', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(1.015), 102);
  assert.equal(toCents(8.325), 833);
});

test('toCents số âm đối xứng', () => {
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(-2.675), -268);
  assert.equal(toCents(-12.34), -1234);
});

test('toCents số nguyên, 0 và giá trị đang đúng', () => {
  assert.equal(toCents(0), 0);
  assert.equal(toCents(-0) === 0, true);
  assert.equal(toCents(5), 500);
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0.1), 10);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0.004), 0);
  assert.equal(toCents(1234567.89), 123456789);
});

test('toCents từ chối giá trị không hữu hạn', () => {
  assert.throws(() => toCents(NaN), TypeError);
  assert.throws(() => toCents(Infinity), TypeError);
  assert.throws(() => toCents('1'), TypeError);
});

test('Catalog đổi giá sản phẩm sang xu bằng toCents', () => {
  const c = new Catalog([{ sku: 'A', name: 'A', price: 1.005, category: 'x' }]);
  assert.equal(c.bySku.get('A').priceCents, 101);
});
