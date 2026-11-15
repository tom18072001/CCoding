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

const bad = (v) => assert.throws(() => parseDuration(v), (e) =>
  e instanceof TypeError && e.message === 'Invalid duration: ' + JSON.stringify(v));

test('parse: số và làm tròn', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-0.5), -1);
  assert.equal(parseDuration(1.4), 1);
  assert.equal(Object.is(parseDuration(-0.2), 0), true);
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('-20'), -20);
  assert.equal(Object.is(parseDuration('-0'), 0), true);
  for (const v of [NaN, Infinity, -Infinity, null, undefined, {}, true, [], '']) bad(v);
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('parse: dấu và khoảng trắng', () => {
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('+1h'), 3600000);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('  2 DAYS 4 Hours '), 2 * 86400000 + 4 * 3600000);
  for (const v of ['1h-30m', '--5', '+-5', '-', '   ', '.5', '5.', '1e3', '1h 30', '30m1h', '1h1h', '1x', '1h!', 'h', '1 h m']) bad(v);
});

test('parse: đơn vị', () => {
  assert.equal(parseDuration('1w'), 604800000);
  assert.equal(parseDuration('1wk 1d'), 604800000 + 86400000);
  assert.equal(parseDuration('1ms'), 1);
  assert.equal(parseDuration('1m'), 60000);
  assert.equal(parseDuration('1min 1sec 1msec'), 61001);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('0.0005s'), 1);
  assert.equal(parseDuration('1 week 2 days 3 hrs 4 mins 5 secs 6 milliseconds'),
    604800000 + 2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5000 + 6);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('-P1DT2H'), -(86400000 + 7200000));
  assert.equal(parseDuration('pt1h30m10.5s'), 5400000 + 10500);
  assert.equal(parseDuration('P1DT1H1M1S'), 86400000 + 3600000 + 60000 + 1000);
  for (const v of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1H 30M', 'PT30M1H', 'P1H', 'PT1D', 'P.5D', 'P1D T1H']) bad(v);
});

test('format: cơ bản và dấu', () => {
  assert.equal(formatDuration(250), '250ms');
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(0.5), '1ms');
  assert.equal(formatDuration(-0.5), '-1ms');
  assert.equal(formatDuration(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(86400000 + 5000), '1d 5s');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
});

test('format: lỗi', () => {
  for (const v of ['1', NaN, Infinity, null, undefined]) assert.throws(() => formatDuration(v), TypeError);
  for (const style of ['x', 1, null]) assert.throws(() => formatDuration(1, { style }), TypeError);
  for (const largest of [0, -1, 1.5, '2', NaN, Infinity, null]) assert.throws(() => formatDuration(1, { largest }), TypeError);
});

test('format: largest', () => {
  const x = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(x, { largest: 2 }), '1w');
  assert.equal(formatDuration(x, { largest: 1 }), '1w');
  assert.equal(formatDuration(x, { largest: 3 }), '1w');
  assert.equal(formatDuration(x, { largest: 4 }), '6d 23h 59m 31s');
  assert.equal(formatDuration(x, { largest: 5 }), '6d 23h 59m 31s');
  assert.equal(formatDuration(5400000, { largest: 1 }), '2h');
  assert.equal(formatDuration(5399999, { largest: 1 }), '1h');
  assert.equal(formatDuration(5400000 + 29999, { largest: 2 }), '1h 30m');
  assert.equal(formatDuration(3600000 + 5000, { largest: 2 }), '1h');
  assert.equal(formatDuration(86400000 + 5000, { largest: 3 }), '1d');
  assert.equal(formatDuration(86400000 + 5000, { largest: 5 }), '1d 5s');
  assert.equal(formatDuration(-5400000, { largest: 1, style: 'long' }), '-2 hours');
  assert.equal(formatDuration(1234, { largest: 10 }), '1s 234ms');
  assert.equal(formatDuration(59 * 60000 + 31000, { largest: 1 }), '1h');
  assert.equal(formatDuration(0, { largest: 2 }), '0ms');
});

test('round-trip', () => {
  for (const x of [0, 1, -1, 999, 1000, 59999.5, 5400000, -123456789, 1e15, 1e21, 0.5, -0.5, 604800000]) {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
  }
});
