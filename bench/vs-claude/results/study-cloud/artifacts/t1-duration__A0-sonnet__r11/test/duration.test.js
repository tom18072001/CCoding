'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration, formatDuration } = require('../src/duration');

test('parse cơ bản', () => {
  assert.equal(parseDuration('1h30m'), 5400000);
  assert.equal(parseDuration('250ms'), 250);
  assert.equal(parseDuration('PT1H30M'), 5400000);
});

test('format cơ bản', () => {
  assert.equal(formatDuration(5400000), '1h 30m');
  assert.equal(formatDuration(5400000, { style: 'long' }), '1 hour 30 minutes');
  assert.equal(formatDuration(0), '0ms');
});

test('lỗi', () => {
  assert.throws(() => parseDuration(''), TypeError);
});

const P = parseDuration;
const F = formatDuration;

test('parse: số và làm tròn', () => {
  assert.equal(P(1.5), 2);
  assert.equal(P(-1.5), -2);
  assert.equal(P(-0.5), -1);
  assert.equal(P(-0.2), 0);
  assert.ok(Object.is(P(-0.2), 0));
  assert.equal(P('0.5'), 1);
  assert.equal(P('-0.5'), -1);
  assert.equal(P('1.0005s'), 1001);
  assert.equal(P('1500'), 1500);
  assert.equal(P(' - 5s '), -5000);
  assert.equal(P('+5S'), 5000);
  assert.ok(Object.is(P('-0'), 0));
});

test('parse: dạng đơn vị', () => {
  assert.equal(P('1h 30m'), 5400000);
  assert.equal(P('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(P('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(P('-1h30m'), -5400000);
  assert.equal(P('1.5h'), 5400000);
  assert.equal(P('5 MIN'), 300000);
  assert.equal(P('5ms'), 5);
});

test('parse: ISO', () => {
  assert.equal(P('PT0,5S'), 500);
  assert.equal(P('PT1M'), 60000);
  assert.equal(P('P1W'), 604800000);
  assert.equal(P('P1DT2H'), 93600000);
  assert.equal(P('-PT1H'), -3600000);
  assert.equal(P('pt1h'), 3600000);
});

test('parse: lỗi', () => {
  for (const bad of ['', '  ', '.5', '5.', '1e3', '1h-30m', '30m1h', '1h1h', '1h 30', '1x', 'abc', '--5', '-', '+',
    'P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'PT1H1D', 'P1D T1H', 'PT1.S', '1h,5m', '1,5', 'toString', '1 constructor',
    null, undefined, {}, [], true, NaN, Infinity, -Infinity]) {
    assert.throws(() => P(bad), TypeError, String(bad));
  }
  assert.throws(() => P(undefined), { message: 'Invalid duration: undefined' });
  assert.throws(() => P('x'), { message: 'Invalid duration: "x"' });
});

test('format', () => {
  assert.equal(F(-5400000), '-1h 30m');
  assert.equal(F(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(F(-0.4), '0ms');
  assert.equal(F(0, { style: 'long' }), '0 milliseconds');
  assert.equal(F(1.5), '2ms');
  assert.equal(F(-1.5), '-2ms');
  assert.equal(F(604800000 + 86400000, { style: 'long' }), '1 week 1 day');
  assert.equal(F(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(F(2 * 86400000 + 5000), '2d 5s');
});

test('format: largest', () => {
  const v = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(F(v, { largest: 2 }), '1w');
  assert.equal(F(5400000, { largest: 1 }), '2h');
  assert.equal(F(5399999, { largest: 1 }), '1h');
  assert.equal(F(86400000 + 30000, { largest: 3 }), '1d 1m');
  assert.equal(F(86400000 + 29000, { largest: 3 }), '1d');
  assert.equal(F(3600000 + 59 * 60000 + 40000, { largest: 2 }), '2h');
  assert.equal(F(1000 + 500, { largest: 1 }), '2s');
  assert.equal(F(1234, { largest: 10 }), '1s 234ms');
  assert.equal(F(-5400000, { largest: 1, style: 'long' }), '-2 hours');
});

test('format: lỗi', () => {
  assert.throws(() => F('1'), TypeError);
  assert.throws(() => F(NaN), TypeError);
  assert.throws(() => F(1, { style: 'x' }), TypeError);
  assert.throws(() => F(1, { largest: 0 }), TypeError);
  assert.throws(() => F(1, { largest: 1.5 }), TypeError);
  assert.throws(() => F(1, { largest: '2' }), TypeError);
});

test('round trip', () => {
  for (const x of [0, 1, -1, 999.5, 123456789.4, -987654321, 1e15, 604800000 * 3 + 1]) {
    assert.equal(P(F(x)), P(x));
  }
});
