'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDuration: f } = require('../src/format');

test('cơ bản và style', () => {
  assert.equal(f(5400000), '1h 30m');
  assert.equal(f(5400000, { style: 'long' }), '1 hour 30 minutes');
  assert.equal(f(1209600000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(f(172805000), '2d 5s');
  assert.equal(f(250), '250ms');
  assert.equal(f(1, { style: 'long' }), '1 millisecond');
  assert.equal(f(3600001, {}), '1h 1ms');
});

test('không và dấu', () => {
  assert.equal(f(0), '0ms');
  assert.equal(f(-0), '0ms');
  assert.equal(f(0, { style: 'long' }), '0 milliseconds');
  assert.equal(f(0.4), '0ms');
  assert.equal(f(-0.4), '0ms');
  assert.equal(f(0.5), '1ms');
  assert.equal(f(-0.5), '-1ms');
  assert.equal(f(-5400000), '-1h 30m');
  assert.equal(f(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(f(1.5), '2ms');
  assert.equal(f(-1.5), '-2ms');
});

test('largest', () => {
  assert.equal(f(86399600, { largest: 1 }), '1d'); // 23h59m59s600ms
  assert.equal(f(84540000, { largest: 1 }), '23h');
  assert.equal(f(604800000 - 29000, { largest: 2 }), '1w'); // 6d23h59m31s
  assert.equal(f(5400000, { largest: 1 }), '2h');
  assert.equal(f(5399999, { largest: 1 }), '1h');
  assert.equal(f(5400000, { largest: 5 }), '1h 30m');
  assert.equal(f(5400000, { largest: 100 }), '1h 30m');
  assert.equal(f(3601000, { largest: 3 }), '1h 1s'); // giữ h,m,s; m = 0
  assert.equal(f(3630000, { largest: 2 }), '1h 1m'); // 30s >= nửa phút
  assert.equal(f(3629999, { largest: 2 }), '1h');
  assert.equal(f(-86399600, { largest: 1, style: 'long' }), '-1 day');
  assert.equal(f(1500, { largest: 1 }), '2s');
  assert.equal(f(999.4, { largest: 1 }), '999ms');
  assert.equal(f(-0.4, { largest: 1 }), '0ms');
  assert.equal(f(59999 + 60000 * 59, { largest: 1 }), '1h');
});

test('options rỗng/undefined', () => {
  assert.equal(f(1000, undefined), '1s');
  assert.equal(f(1000, {}), '1s');
  assert.equal(f(1000, { largest: undefined, style: undefined }), '1s');
});

test('lỗi', () => {
  for (const bad of [NaN, Infinity, -Infinity, '1', null, undefined, {}]) {
    assert.throws(() => f(bad), TypeError);
  }
  assert.throws(() => f(NaN), { message: 'Invalid duration: null' });
  assert.throws(() => f(undefined), { message: 'Invalid duration: undefined' });
  assert.throws(() => f(1, { style: 'x' }), TypeError);
  for (const l of [0, -1, 1.5, '2', null, NaN, Infinity]) {
    assert.throws(() => f(1, { largest: l }), TypeError);
  }
});

test('round-trip với parse (không largest)', () => {
  const { parseDuration: p } = require('../src/duration');
  for (const x of [0, -0, 0.5, -0.5, 0.4, 1, 999.5, 5400000, -5400000, 604800000, 1e12 + 0.5, -123456789.5]) {
    assert.equal(p(f(x)), p(x));
    assert.equal(p(f(x, { style: 'long' })), p(x));
  }
});
