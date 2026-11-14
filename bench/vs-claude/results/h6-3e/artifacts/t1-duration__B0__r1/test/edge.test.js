'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration: p, formatDuration: f } = require('../src/duration');

test('parse: số và làm tròn', () => {
  assert.equal(p(1.5), 2);
  assert.equal(p(-1.5), -2);
  assert.equal(p(-0.4), 0);
  assert.ok(Object.is(p(-0.4), 0));
  assert.equal(p('1500'), 1500);
  assert.equal(p('0.5'), 1);
  assert.equal(p('-0.5'), -1);
  assert.equal(p('1.4'), 1);
  assert.equal(p('-20'), -20);
  assert.equal(p(' +7 '), 7);
  assert.equal(p('0.0005s'), 1);
  assert.equal(p('1.1s'), 1100);
});

test('parse: dạng đơn vị', () => {
  assert.equal(p('-1h30m'), -5400000);
  assert.equal(p('- 5s'), -5000);
  assert.equal(p('1h 30m'), 5400000);
  assert.equal(p('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(p('1W2D3H4M5S6MS'), 604800000 + 2 * 86400000 + 3 * 3600000 + 240000 + 5000 + 6);
  assert.equal(p('1.5h'), 5400000);
  assert.equal(p('1 min'), 60000);
  assert.equal(p('1m5s'), 65000);
  assert.equal(p('5 msecs'), 5);
  assert.ok(Object.is(p('-0s'), 0));
});

test('parse: lỗi', () => {
  const bad = ['', '   ', '-', '+', '1h-30m', '--1h', '.5', '5.', '1e3', '30m1h', '1h1h', '1h 30',
    '30 1h', 'abc', '1x', 'h', '1 h x', '1,5h', '1h,', 'P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D',
    'PT1H30', 'P1DT1H1D', 'PT1S1M', 'PT 1S', 'P 1D', '1d1w', '5 s5'];
  for (const b of bad) assert.throws(() => p(b), TypeError, JSON.stringify(b));
  for (const b of [NaN, Infinity, -Infinity, null, undefined, {}, [], true, () => 1]) {
    assert.throws(() => p(b), TypeError);
  }
  assert.throws(() => p(undefined), { message: 'Invalid duration: undefined' });
  assert.throws(() => p('x'), { message: 'Invalid duration: "x"' });
  assert.throws(() => p(null), { message: 'Invalid duration: null' });
});

test('parse: ISO 8601', () => {
  assert.equal(p('PT1M'), 60000);
  assert.equal(p('PT0,5S'), 500);
  assert.equal(p('PT0.5S'), 500);
  assert.equal(p('P2W'), 2 * 604800000);
  assert.equal(p('P1.5W'), 907200000);
  assert.equal(p('P1DT2H3M4S'), 86400000 + 7200000 + 180000 + 4000);
  assert.equal(p('-PT1S'), -1000);
  assert.equal(p('pt1h'), 3600000);
  assert.equal(p('P1D'), 86400000);
  assert.equal(p('PT1,0005S'), 1001);
  assert.equal(p('-PT0.0005S'), -1);
});

test('format: cơ bản', () => {
  assert.equal(f(0), '0ms');
  assert.equal(f(0, { style: 'long' }), '0 milliseconds');
  assert.equal(f(250), '250ms');
  assert.equal(f(-5400000), '-1h 30m');
  assert.equal(f(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(f(1, { style: 'long' }), '1 millisecond');
  assert.equal(f(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(f(2 * 86400000 + 5000), '2d 5s');
  assert.equal(f(0.4), '0ms');
  assert.equal(f(-0.4), '0ms');
  assert.equal(f(-0.5), '-1ms');
  assert.equal(f(1.5), '2ms');
});

test('format: lỗi', () => {
  for (const b of ['1', NaN, Infinity, null, undefined]) assert.throws(() => f(b), TypeError);
  assert.throws(() => f(1, { style: 'x' }), TypeError);
  assert.throws(() => f(1, { largest: 0 }), TypeError);
  assert.throws(() => f(1, { largest: 1.5 }), TypeError);
  assert.throws(() => f(1, { largest: '2' }), TypeError);
  assert.throws(() => f(1, { largest: Infinity }), TypeError);
  assert.throws(() => f(1, { largest: -1 }), TypeError);
});

test('format: largest', () => {
  const ms = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(f(ms, { largest: 2 }), '1w');
  assert.equal(f(ms, { largest: 1 }), '1w');
  assert.equal(f(ms), '6d 23h 59m 31s');
  assert.equal(f(5400000 + 30000, { largest: 2 }), '1h 31m');
  assert.equal(f(5400000 + 29999, { largest: 2 }), '1h 30m');
  assert.equal(f(3600000 + 29 * 60000 + 30000, { largest: 1 }), '1h');
  assert.equal(f(3600000 + 30 * 60000, { largest: 1 }), '2h');
  // đơn vị bằng 0 ở giữa được tính
  assert.equal(f(3600000 + 5000, { largest: 2 }), '1h');
  assert.equal(f(3600000 + 5000, { largest: 3 }), '1h 5s');
  assert.equal(f(3600000 + 5000, { largest: 4 }), '1h 5s');
  assert.equal(f(86400000 + 5000, { largest: 10 }), '1d 5s');
  // nhớ nhiều tầng
  assert.equal(f(23 * 3600000 + 59 * 60000 + 31000, { largest: 2 }), '1d');
  assert.equal(f(59 * 60000 + 59500, { largest: 2 }), '1h');
  assert.equal(f(999.5, { largest: 1 }), '1s');
  assert.equal(f(-5400000 - 30000, { largest: 2, style: 'long' }), '-1 hour 31 minutes');
  assert.equal(f(0, { largest: 2 }), '0ms');
  assert.equal(f(30000, { largest: 1 }), '30s');
  assert.equal(f(500, { largest: 1 }), '500ms');
});

test('round-trip', () => {
  for (const x of [0, 1, -1, 0.5, -0.5, 999, 1000, 59999, 3600001, -987654321, 1e12, 123456789.5]) {
    assert.equal(p(f(x)), p(x));
    assert.equal(p(f(x, { style: 'long' })), p(x));
  }
});
