'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, allocate } = require('../src/money');
const { Catalog } = require('../src');

test('toCents làm tròn half away from zero, không lỗi dấu phẩy động', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(-2.675), -268);
  assert.equal(toCents(1.115), 112);
  assert.equal(toCents(0.07), 7);
  assert.equal(toCents(19.99), 1999);
});

test('Catalog dùng toCents đúng cho giá', () => {
  assert.equal(new Catalog([{ sku: 'A', price: 1.005 }]).get('A').priceCents, 101);
});

test('allocate: tổng các phần đúng bằng total (10.00 chia 3 dòng)', () => {
  const r = allocate(1000, [1, 1, 1]);
  assert.deepEqual(r, [334, 333, 333]);
  assert.equal(r.reduce((a, b) => a + b, 0), 1000);
});

test('allocate: phần dư lớn nhất theo tỉ lệ', () => {
  const r = allocate(100, [1, 2, 3]);
  assert.equal(r.reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(r, [17, 33, 50]);
});

test('allocate: số âm và trọng số 0', () => {
  assert.deepEqual(allocate(-1000, [1, 1, 1]), [-334, -333, -333]);
  assert.deepEqual(allocate(5, [0, 1, 0]), [0, 5, 0]);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
});
