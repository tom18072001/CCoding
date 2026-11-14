'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCents } = require('../src/money');

test('toCents 0', () => { assert.equal(toCents(0), 0); });
test('toCents 19.99', () => { assert.equal(toCents(19.99), 1999); });
test('toCents 0.1+0.2', () => { assert.equal(toCents(0.1 + 0.2), 30); });
test('toCents làm tròn nửa lên ở các giá trị lệch nhị phân', () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(1.255), 126);
  assert.equal(toCents(8.325), 833);
});
test('toCents số rất lớn', () => {
  assert.equal(toCents(1e12), 1e14);
  assert.equal(toCents(123456789012.34), 12345678901234);
});
test('toCents số âm', () => { assert.throws(() => toCents(-1), RangeError); });
test('toCents NaN/Infinity', () => {
  assert.throws(() => toCents(NaN), RangeError);
  assert.throws(() => toCents(Infinity), RangeError);
});
test('toCents không phải số', () => {
  assert.throws(() => toCents('5'), RangeError);
  assert.throws(() => toCents(undefined), RangeError);
  assert.throws(() => toCents(null), RangeError);
});
