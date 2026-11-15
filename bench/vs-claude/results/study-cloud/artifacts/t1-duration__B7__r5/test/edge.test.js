'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration: p, formatDuration: f } = require('../src/duration');

test('parse số và làm tròn', () => {
  assert.equal(p(1.5), 2);
  assert.equal(p(-1.5), -2);
  assert.ok(Object.is(p(-0.4), 0));
  assert.equal(p('0.5'), 1);
  assert.equal(p('-0.5'), -1);
  assert.equal(p('1.4'), 1);
  assert.equal(p(' 1500 '), 1500);
  assert.equal(p('+20'), 20);
  assert.equal(p('-20'), -20);
});

test('parse đơn vị', () => {
  assert.equal(p('-1h30m'), -5400000);
  assert.equal(p('- 5s'), -5000);
  assert.equal(p('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(p('1H 30MIN'), 5400000);
  assert.equal(p('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(p('1 m'), 60000);
  assert.equal(p('1ms'), 1);
  assert.equal(p('1.5h'), 5400000);
  assert.equal(p('1 weeks'), 604800000);
  assert.equal(p('5 msecs'), 5);
});

test('parse ISO', () => {
  assert.equal(p('PT0,5S'), 500);
  assert.equal(p('PT1M'), 60000);
  assert.equal(p('P1W'), 604800000);
  assert.equal(p('P1DT2H3M4.5S'), 86400000 + 7200000 + 180000 + 4500);
  assert.equal(p('-PT1H'), -3600000);
  assert.equal(p('pt1h'), 3600000);
});

test('parse lỗi', () => {
  const bad = ['', '  ', '-', '+', '--5s', '1h-30m', '.5', '5.', '1e3', '30m1h', '1h1h', '1h 30',
    '1h x', 'abc', 'P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'PT1H1D', 'P1D T1H', 'P 1D', '- P1D',
    '1,5h', '5 x', 'h', '1 h 2', '1h30', 'PT1,S'];
  for (const s of bad) assert.throws(() => p(s), TypeError, JSON.stringify(s));
  for (const v of [null, undefined, {}, [], true, NaN, Infinity, -Infinity]) {
    assert.throws(() => p(v), TypeError);
  }
  assert.throws(() => p(undefined), { message: 'Invalid duration: undefined' });
  assert.throws(() => p('x'), { message: 'Invalid duration: "x"' });
  assert.throws(() => p(null), { message: 'Invalid duration: null' });
  assert.throws(() => p({ a: 1 }), { message: 'Invalid duration: {"a":1}' });
  assert.throws(() => p('1constructor'), TypeError);
});

test('format cơ bản và dấu', () => {
  assert.equal(f(-5400000), '-1h 30m');
  assert.equal(f(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(f(0.4), '0ms');
  assert.equal(f(-0.4), '0ms');
  assert.equal(f(-0.4, { style: 'long' }), '0 milliseconds');
  assert.equal(f(1.5), '2ms');
  assert.equal(f(-1.5), '-2ms');
  assert.equal(f(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(f(2 * 86400000 + 5000), '2d 5s');
  assert.equal(f(1, { style: 'long' }), '1 millisecond');
});

test('format largest', () => {
  const v = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(f(v, { largest: 2 }), '1w');
  assert.equal(f(3600000 + 29 * 60000 + 30000, { largest: 2 }), '1h 30m');
  assert.equal(f(3600000 + 29 * 60000 + 29999, { largest: 2 }), '1h 29m');
  assert.equal(f(86400000 + 5000, { largest: 2 }), '1d');
  assert.equal(f(86400000 + 5000, { largest: 3 }), '1d');
  assert.equal(f(86400000 + 5000, { largest: 4 }), '1d 5s');
  assert.equal(f(5400000, { largest: 1 }), '2h');
  assert.equal(f(5400000 - 1, { largest: 1 }), '1h');
  assert.equal(f(59 * 60000 + 59500, { largest: 2 }), '1h');
  assert.equal(f(-5400000, { largest: 1, style: 'long' }), '-2 hours');
  assert.equal(f(23 * 3600000 + 59 * 60000 + 31000, { largest: 2 }), '1d');
  assert.equal(f(100, { largest: 10 }), '100ms');
  assert.equal(f(0, { largest: 2 }), '0ms');
});

test('format lỗi tùy chọn', () => {
  for (const v of ['1', NaN, Infinity, null, undefined]) assert.throws(() => f(v), TypeError);
  assert.throws(() => f(undefined), { message: 'Invalid duration: undefined' });
  assert.throws(() => f(1, { style: 'x' }), TypeError);
  for (const l of [0, -1, 1.5, '2', NaN, null]) assert.throws(() => f(1, { largest: l }), TypeError);
});

test('round-trip', () => {
  for (const x of [0, 1, -1, 0.5, -0.5, 1.4, 999.5, 59999.5, 5400000.7, -86400001, 1e12, 123456789.5]) {
    assert.equal(p(f(x)), p(x));
    assert.equal(p(f(x, { style: 'long' })), p(x));
  }
});
