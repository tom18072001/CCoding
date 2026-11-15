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

const bad = (v) => assert.throws(() => parseDuration(v), (e) => e instanceof TypeError && e.message === 'Invalid duration: ' + (v === undefined ? 'undefined' : JSON.stringify(v)));

test('parse: số và số thuần', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-0.5), -1);
  assert.equal(parseDuration(-0), 0);
  assert.equal(Object.is(parseDuration(-0.2), 0), true);
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration('1.5'), 2);
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('-20'), -20);
  assert.equal(parseDuration(' +7 '), 7);
  assert.equal(parseDuration('- 5s'), -5000);
  for (const v of [NaN, Infinity, -Infinity, null, undefined, {}, [], true, '', '  ', '.5', '5.', '1e3', '-', '--5', '+-5', '1h-30m', '1h 30', '30m1h', '1h1h', '1x', '1h!', 'h', '1 . 5s'])
    bad(v);
});

test('parse: đơn vị', () => {
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1H 30 MIN'), 5400000);
  assert.equal(parseDuration('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(parseDuration('1.0005s'), 1001);
  assert.equal(parseDuration('0.0005s'), 1);
  assert.equal(parseDuration('-0.0005s'), -1);
  assert.equal(parseDuration('1.5m'), 90000);
  assert.equal(parseDuration('5 msecs'), 5);
  assert.equal(parseDuration('1 wk'), 604800000);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('-P1DT2H3M4.5S'), -(86400000 + 7200000 + 180000 + 4500));
  assert.equal(parseDuration('pt1h'), 3600000);
  for (const v of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1H1D', 'P 1D', 'PT1 H', 'PT1S1M', 'P1D1D', 'PT.5S'])
    bad(v);
});

test('format: biên', () => {
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(-0.5), '-1ms');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(2 * 86400000 + 5000), '2d 5s');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
  const d = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(d, { largest: 2 }), '1w');
  assert.equal(formatDuration(d, { largest: 1 }), '1w');
  assert.equal(formatDuration(3600000 + 29 * 60000 + 30000, { largest: 2 }), '1h 30m');
  assert.equal(formatDuration(3600000 + 59 * 60000 + 30000, { largest: 2 }), '2h');
  assert.equal(formatDuration(3600000 + 5000, { largest: 2 }), '1h');
  assert.equal(formatDuration(3600000 + 5000, { largest: 3 }), '1h 5s');
  assert.equal(formatDuration(3600000 + 5000, { largest: 100 }), '1h 5s');
  assert.equal(formatDuration(90000 + 500, { largest: 2 }), '1m 31s');
  assert.equal(formatDuration(-(86400000 + 12 * 3600000), { largest: 1 }), '-2d');
  assert.equal(formatDuration(86400000 + 11 * 3600000, { largest: 1 }), '1d');
  for (const v of ['1', NaN, Infinity, null, undefined]) assert.throws(() => formatDuration(v), TypeError);
  assert.throws(() => formatDuration(1, { style: 'x' }), TypeError);
  for (const l of [0, -1, 1.5, '2', NaN, Infinity, null]) assert.throws(() => formatDuration(1, { largest: l }), TypeError);
});

test('round-trip', () => {
  for (const x of [0, 1, -1, 0.5, -0.5, 59999.5, 1e9, 123456789.4, -987654321, 1e21, 604800000 * 3 + 1])
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
});
