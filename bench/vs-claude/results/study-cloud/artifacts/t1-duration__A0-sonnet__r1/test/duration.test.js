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

const bad = (x) => assert.throws(() => parseDuration(x), (e) => e instanceof TypeError && e.message === 'Invalid duration: ' + JSON.stringify(x));

test('parse: số và số thuần', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-0.5), -1);
  assert.equal(parseDuration(-0.4), 0);
  assert.ok(Object.is(parseDuration(-0.4), 0));
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration('1.5'), 2);
  assert.equal(parseDuration('-20'), -20);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration(' +7 '), 7);
  for (const x of ['.5', '5.', '1e3', '', '   ', '-', '+', '--5', '+-5', '1,5']) bad(x);
  for (const x of [NaN, Infinity, -Infinity, null, undefined, {}, [], true]) {
    assert.throws(() => parseDuration(x), TypeError);
  }
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('parse: dạng đơn vị', () => {
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1H 30M'), 5400000);
  assert.equal(parseDuration('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('0.0005s'), 1);
  assert.equal(parseDuration('1.0005s'), 1001);
  assert.equal(parseDuration('1.005s'), 1005);
  assert.equal(parseDuration('-0.0005s'), -1);
  assert.equal(parseDuration('5 mins'), 300000);
  assert.equal(parseDuration('5 msecs'), 5);
  assert.equal(parseDuration('1 wk'), 604800000);
  assert.equal(parseDuration('1h30m'), 5400000);
  assert.equal(parseDuration('1m 1s'), 61000);
  for (const x of ['30m1h', '1h1h', '1h-30m', '1h 30', '30 1h', 'h', '1x', '1h x', '1 h m', '1hh', '.5h', '5.h', '1e3s', '1h,30m', '1h+30m', '1mo', 'h1']) bad(x);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT1H30M'), 5400000);
  assert.equal(parseDuration('pt1m'), 60000);
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('PT0.5S'), 500);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('P1DT2H3M4S'), 86400000 + 7200000 + 180000 + 4000);
  assert.equal(parseDuration('-PT1S'), -1000);
  assert.equal(parseDuration('P2D'), 172800000);
  assert.equal(parseDuration('P1.5D'), 129600000);
  for (const x of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1H1D', 'PT1S1M', 'P1D1H', 'P 1D', 'PT1 H', 'PT', 'P1', 'PT1', 'P.5D', 'PT5.S']) bad(x);
});

test('format: largest và làm tròn', () => {
  const f = formatDuration;
  assert.equal(f(0, { style: 'long' }), '0 milliseconds');
  assert.equal(f(0.4), '0ms');
  assert.equal(f(-0.4), '0ms');
  assert.equal(f(-0.5), '-1ms');
  assert.equal(f(1.5), '2ms');
  assert.equal(f(-5400000), '-1h 30m');
  assert.equal(f(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(f(1000, { style: 'long' }), '1 second');
  assert.equal(f(1 + 7 * 86400000 + 86400000, { style: 'long' }), '1 week 1 day 1 millisecond');
  assert.equal(f(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(f(86400000 + 5000), '1d 5s');
  const x = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(f(x, { largest: 2 }), '1w');
  assert.equal(f(x, { largest: 1 }), '1w');
  assert.equal(f(86400000 + 5000, { largest: 3 }), '1d');
  assert.equal(f(86400000 + 30 * 1000 + 1, { largest: 3 }), '1d 1m'); // d,h(0),m ; còn 31s>=30s -> +1m
  assert.equal(f(3600000 + 29 * 60000 + 30000, { largest: 1 }), '1h');
  assert.equal(f(3600000 + 30 * 60000, { largest: 1 }), '2h');
  assert.equal(f(23 * 3600000 + 59 * 60000 + 59000, { largest: 1 }), '1d');
  assert.equal(f(5400000, { largest: 10 }), '1h 30m');
  assert.equal(f(999, { largest: 1 }), '999ms');
  assert.equal(f(59500, { largest: 1 }), '1m');
  assert.equal(f(-59500, { largest: 1, style: 'long' }), '-1 minute');
  assert.equal(f(0, { largest: 2 }), '0ms');
  assert.equal(f(3600000 + 59 * 60000 + 30000, { largest: 2 }), '2h');
  for (const o of [{ style: 'x' }, { style: 'LONG' }, { largest: 0 }, { largest: 1.5 }, { largest: -1 }, { largest: '2' }, { largest: Infinity }, { largest: NaN }]) {
    assert.throws(() => f(1000, o), TypeError);
  }
  for (const m of ['1', NaN, Infinity, null, undefined]) assert.throws(() => f(m), TypeError);
  assert.throws(() => f(NaN), { message: 'Invalid duration: null' });
});

test('round-trip', () => {
  for (const x of [0, 1, -1, 999, 1000, 59999, 3600000, 123456789, -987654321, 1.5, -2.5, 1e12, 604800000 * 3 + 1]) {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
    assert.equal(parseDuration(formatDuration(x, { style: 'long' })), parseDuration(x));
  }
});
