'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { reserve } = require('../src/stock');

test('reserve trừ kho theo quantity', () => {
  const next = reserve({ a: 5, b: 2 }, [{ sku: 'a', quantity: 3 }]);
  assert.deepEqual(next, { a: 2, b: 2 });
});

test('reserve ném lỗi khi thiếu hàng', () => {
  assert.throws(() => reserve({ a: 1 }, [{ sku: 'a', quantity: 2 }]), /Thiếu hàng: a/);
});
