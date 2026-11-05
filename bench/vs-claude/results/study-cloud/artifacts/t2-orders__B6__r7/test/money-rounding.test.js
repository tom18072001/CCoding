'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents, allocate } = require('../src/money');
const { Catalog } = require('../src/catalog');

test('toCents half away from zero', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(2.675), 268);
  assert.equal(toCents(1.004), 100);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0), 0);
  assert.ok(Object.is(toCents(-0.001), 0));
});

test('Catalog đổi giá sang xu đúng', () => {
  const c = new Catalog([{ sku: 'A', name: 'a', price: 1.005, category: 'x' }]);
  assert.equal(c.get('A').priceCents, 101);
});

test('allocate largest remainder', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(5, [1, 3, 1]), [1, 3, 1]);
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
});

test('allocate tổng luôn bằng total, âm, trọng số 0', () => {
  for (const total of [0, 1, 7, 100, 999, -1, -7, -1000]) {
    for (const w of [[1, 1, 1], [0, 1, 2], [5, 0, 0, 3], [1, 2, 3, 4, 5, 6, 7]]) {
      assert.equal(allocate(total, w).reduce((a, b) => a + b, 0), total);
    }
  }
  assert.deepEqual(allocate(-1000, [1, 1, 1]), [-334, -333, -333]);
  assert.deepEqual(allocate(100, [0, 1, 0]), [0, 100, 0]);
  assert.deepEqual(allocate(100, [0, 0]), [0, 0]);
});
