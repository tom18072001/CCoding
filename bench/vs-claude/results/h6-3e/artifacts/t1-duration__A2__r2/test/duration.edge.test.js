'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration, formatDuration } = require('../src/duration');

const bad = (v) => assert.throws(() => parseDuration(v), TypeError);

test('parse: biên hợp lệ', () => {
  const eq = (a, b) => assert.equal(parseDuration(a), b);
  eq('-1h30m', -5400000);
  eq('- 5s', -5000);
  eq('+5s', 5000);
  eq('  1H 30M ', 5400000);
  eq('2 days 4 hours', 2 * 86400000 + 4 * 3600000);
  eq('1w1d1h1m1s1ms', 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  eq('1500', 1500);
  eq('1.5', 2);
  eq('-1.5', -2);
  eq('0.5', 1);
  eq('-0.5', -1);
  eq('1.0005s', 1001);
  eq('0.4', 0);
  eq('-0.4', 0);
  assert.ok(Object.is(parseDuration('-0'), 0));
  assert.ok(Object.is(parseDuration(-0), 0));
  eq(2.5, 3);
  eq(-2.5, -3);
  eq(1.4, 1);
  eq('1.5ms', 2);
  eq('1 m', 60000);
  eq('1min 5secs', 65000);
  eq('PT0,5S', 500);
  eq('P1W', 604800000);
  eq('P1DT1H', 90000000);
  eq('PT1M', 60000);
  eq('-PT1S', -1000);
  eq('P0.5D', 43200000);
});

test('parse: biên không hợp lệ', () => {
  for (const v of ['', '   ', '-', '+', '--1s', '1h-30m', '.5', '5.', '1e3', '1h 30', '30m1h', '1h1h',
    '1x', 'h', '1hm', 'P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'PT1H1D', 'PT1S1M', 'P1D T1H', 'PT1.S',
    '1h,5m', '1 2h', 'abc', '5ms5']) bad(v);
  for (const v of [NaN, Infinity, -Infinity, null, undefined, {}, [], true, 1n]) bad(v);
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
  assert.throws(() => parseDuration('1x'), { message: 'Invalid duration: "1x"' });
});

test('format: biên', () => {
  const f = formatDuration;
  assert.equal(f(0, { style: 'long' }), '0 milliseconds');
  assert.equal(f(0.4), '0ms');
  assert.equal(f(-0.4), '0ms');
  assert.equal(f(-0.5), '-1ms');
  assert.equal(f(1.5), '2ms');
  assert.equal(f(-5400000), '-1h 30m');
  assert.equal(f(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(f(604800000 * 2 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(f(86400000 * 2 + 5000), '2d 5s');
  const x = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(f(x, { largest: 2 }), '1w');
  assert.equal(f(3600000 + 29 * 60000 + 30000, { largest: 2 }), '1h 30m');
  assert.equal(f(3600000 + 29 * 60000 + 29999, { largest: 2 }), '1h 29m');
  assert.equal(f(3600000 + 59 * 60000 + 30000, { largest: 2 }), '2h');
  assert.equal(f(3600000 + 5000, { largest: 2 }), '1h');
  assert.equal(f(3600000 + 1800000 + 5000, { largest: 1 }), '2h');
  assert.equal(f(1999, { largest: 1 }), '2s');
  assert.equal(f(400, { largest: 1 }), '400ms');
  assert.equal(f(100, { largest: 5 }), '100ms');
  assert.equal(f(-x, { largest: 2 }), '-1w');
  assert.equal(f(0, { largest: 1 }), '0ms');
  for (const o of [{ style: 'x' }, { largest: 0 }, { largest: 1.5 }, { largest: '2' }, { largest: Infinity }]) {
    assert.throws(() => f(1, o), TypeError);
  }
  for (const v of [NaN, Infinity, '1', null, undefined]) assert.throws(() => f(v), TypeError);
  assert.throws(() => f(undefined), { message: 'Invalid duration: undefined' });
});

test('round-trip', () => {
  for (const x of [0, 1, -1, 0.5, -0.5, 1.5, 999.5, 86399999.5, -1234567.4, 1e15, 123456789012]) {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
  }
});
