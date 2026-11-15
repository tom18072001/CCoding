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

test('parse: số và làm tròn', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-1.5), -2);
  assert.equal(parseDuration(-0.4), 0);
  assert.ok(Object.is(parseDuration(-0.4), 0));
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('1.4'), 1);
  assert.equal(parseDuration('0.0005s'), 1);
  assert.equal(parseDuration('1.1s'), 1100);
  assert.ok(Object.is(parseDuration('-0'), 0));
  assert.equal(parseDuration('-1500'), -1500);
});

test('parse: chuỗi hợp lệ', () => {
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('+ 5s'), 5000);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('  2 Days 4 HOURS '), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1w 1d 1h 1m 1s 1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1001);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('1 min 2 secs'), 62000);
});

test('parse: chuỗi lỗi', () => {
  for (const x of ['', '  ', '-', '+', '.5', '5.', '1e3', '1h-30m', '1h 30', '30m1h', '1h1h', '--5s', '+-5s', '5x', '1hm', 'abc', '1h,30m', '1 h 2', '1_000']) bad(x);
  for (const x of [NaN, Infinity, -Infinity, null, undefined, {}, [], true]) assert.throws(() => parseDuration(x), TypeError);
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('pt1m'), 60000);
  assert.equal(parseDuration('P1DT2H3M4.5S'), 86400000 + 7200000 + 180000 + 4500);
  assert.equal(parseDuration('-P1W'), -604800000);
  assert.equal(parseDuration('P1.5D'), 129600000);
  for (const x of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1H1D', 'P1D T1H', 'PT1S1M', 'P1H', 'PT1.S', 'P.5D']) bad(x);
});

test('format: largest và nhớ', () => {
  assert.equal(formatDuration(6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000, { largest: 2 }), '1w');
  assert.equal(formatDuration(3600000 + 29 * 60000 + 30000, { largest: 2 }), '1h 30m');
  assert.equal(formatDuration(3600000 + 59 * 60000 + 30000, { largest: 2 }), '2h');
  assert.equal(formatDuration(86400000 + 30000, { largest: 3 }), '1d 1m');
  assert.equal(formatDuration(3600000 + 29 * 60000, { largest: 1 }), '1h');
  assert.equal(formatDuration(3600000 + 30 * 60000, { largest: 1 }), '2h');
  assert.equal(formatDuration(86400000 + 3600000, { largest: 10 }), '1d 1h');
  assert.equal(formatDuration(1000, { largest: 1 }), '1s');
  assert.equal(formatDuration(1999, { largest: 1 }), '2s');
  assert.equal(formatDuration(0, { largest: 1, style: 'long' }), '0 milliseconds');
});

test('format: dấu, long, lỗi', () => {
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(-0.5), '-1ms');
  assert.equal(formatDuration(1.5 * 604800000 + 0, { style: 'long' }), '1 week 3 days 12 hours');
  assert.equal(formatDuration(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
  for (const x of ['1', NaN, Infinity, null, undefined]) assert.throws(() => formatDuration(x), TypeError);
  for (const o of [{ style: 'x' }, { largest: 0 }, { largest: 1.5 }, { largest: '2' }, { largest: NaN }, { largest: -1 }]) assert.throws(() => formatDuration(1000, o), TypeError);
});

test('round trip', () => {
  for (const x of [0, 1, -1, 0.5, 999.5, 86399999, 1e12, -123456789.5, 604800000 * 3 + 1]) {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
  }
});
