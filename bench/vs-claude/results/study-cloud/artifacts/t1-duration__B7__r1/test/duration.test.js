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

test('parse: số và số thuần', () => {
  assert.equal(P(1.5), 2);
  assert.equal(P(-0.5), -1);
  assert.equal(P(-0.4), 0);
  assert.ok(Object.is(P(-0), 0));
  assert.equal(P('1500'), 1500);
  assert.equal(P('1.5'), 2);
  assert.equal(P('-20'), -20);
  assert.equal(P(' +0.5 '), 1);
  assert.equal(P('-0.5'), -1);
  assert.ok(Object.is(P('-0'), 0));
  for (const bad of ['.5', '5.', '1e3', '--5', '+', '-', '  ', '1,5']) assert.throws(() => P(bad), TypeError, bad);
});

test('parse: dạng đơn vị', () => {
  assert.equal(P('-1h30m'), -5400000);
  assert.equal(P('- 5s'), -5000);
  assert.equal(P('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(P('1H 30 MIN'), 5400000);
  assert.equal(P('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(P('1.5h'), 5400000);
  assert.equal(P('0.0005s'), 1);
  assert.equal(P('1ms'), 1);
  assert.equal(P('2 wks'), 1209600000);
  for (const bad of ['30m1h', '1h1h', '1h-30m', '1h 30', '1h x', '1x', 'h', '1hm', '.5h', '5.h', '1e3s', '1 s 1 s', '1h+30m', '1ms1s'])
    assert.throws(() => P(bad), TypeError, bad);
});

test('parse: ISO 8601', () => {
  assert.equal(P('PT0,5S'), 500);
  assert.equal(P('P1W'), 604800000);
  assert.equal(P('P1DT2H3M4.5S'), 86400000 + 7200000 + 180000 + 4500);
  assert.equal(P('-PT1M'), -60000);
  assert.equal(P('pt1m'), 60000);
  assert.equal(P('P1.5D'), 129600000);
  for (const bad of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1H1D', 'PT1S1M', 'P1D 1H', 'PT 1H', 'P1DT1', 'P.5D'])
    assert.throws(() => P(bad), TypeError, bad);
});

test('parse: thông báo lỗi và kiểu sai', () => {
  assert.throws(() => P(undefined), { name: 'TypeError', message: 'Invalid duration: undefined' });
  assert.throws(() => P('abc'), { message: 'Invalid duration: "abc"' });
  assert.throws(() => P(null), { message: 'Invalid duration: null' });
  for (const bad of [NaN, Infinity, -Infinity, {}, [], true, null]) assert.throws(() => P(bad), TypeError);
});

test('format: cơ bản và dấu', () => {
  assert.equal(F(-5400000), '-1h 30m');
  assert.equal(F(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(F(0.4), '0ms');
  assert.equal(F(-0.4), '0ms');
  assert.equal(F(-0.5), '-1ms');
  assert.equal(F(0, { style: 'long' }), '0 milliseconds');
  assert.equal(F(1, { style: 'long' }), '1 millisecond');
  assert.equal(F(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(F(2 * 86400000 + 5000), '2d 5s');
  assert.equal(F(250), '250ms');
});

test('format: largest', () => {
  const x = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(F(x, { largest: 2 }), '1w');
  assert.equal(F(x, { largest: 1 }), '1w');
  assert.equal(F(x), '6d 23h 59m 31s');
  assert.equal(F(3600000 + 1000, { largest: 3 }), '1h 1s');
  assert.equal(F(3600000 + 29 * 60000 + 30000, { largest: 2 }), '1h 30m');
  assert.equal(F(3600000 + 29 * 60000 + 29999, { largest: 2 }), '1h 29m');
  assert.equal(F(3600000 + 1799999, { largest: 1 }), '1h');
  assert.equal(F(3600000 + 1800000, { largest: 1 }), '2h');
  assert.equal(F(59 * 60000 + 59500, { largest: 2 }), '1h');
  assert.equal(F(86400000 + 1000, { largest: 2 }), '1d');
  assert.equal(F(86400000 + 1800000, { largest: 2 }), '1d 1h');
  assert.equal(F(1499.4, { largest: 1 }), '1s');
  assert.equal(F(1500, { largest: 1 }), '2s');
  assert.equal(F(-1500, { largest: 1, style: 'long' }), '-2 seconds');
  assert.equal(F(5, { largest: 10 }), '5ms');
  assert.equal(F(0, { largest: 1 }), '0ms');
});

test('format: lỗi tùy chọn', () => {
  for (const bad of [NaN, Infinity, '1', null, undefined]) assert.throws(() => F(bad), TypeError);
  assert.throws(() => F(1, { style: 'x' }), TypeError);
  for (const l of [0, -1, 1.5, '2', NaN, Infinity, null]) assert.throws(() => F(1, { largest: l }), TypeError);
  assert.throws(() => F(undefined), { message: 'Invalid duration: undefined' });
});

test('round trip', () => {
  for (const x of [0, 1, -1, 0.5, -0.5, 59999.5, 123456789, -987654321.4, 1e12, 604800000 * 3 + 5]) {
    assert.equal(P(F(x)), P(x));
    assert.equal(P(F(x, { style: 'long' })), P(x));
  }
});
