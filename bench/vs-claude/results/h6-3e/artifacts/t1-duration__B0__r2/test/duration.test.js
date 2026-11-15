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

const bad = (v) => assert.throws(() => parseDuration(v), TypeError);

test('parse: số và làm tròn', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-1.5), -2);
  assert.equal(parseDuration(-0.4), 0);
  assert.ok(Object.is(parseDuration(-0.4), 0));
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('1.4'), 1);
  assert.equal(parseDuration('1.0005s'), 1001);
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration('-20'), -20);
  assert.ok(Object.is(parseDuration('-0'), 0));
});

test('parse: dấu và khoảng trắng', () => {
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('+1h'), 3600000);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('  2 Days 4 HOURS '), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1h 30m'), 5400000);
  assert.equal(parseDuration('1 w 1 ms'), 604800001);
  assert.equal(parseDuration('5 MINS'), 300000);
});

test('parse: lỗi', () => {
  for (const v of ['', '  ', '-', '1h-30m', '--1h', '.5', '5.', '1e3', '1h 30', '30m1h', '1h1h', '1x', 'h', '1h!', '1 5s',
    'abc', 'P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'PT1H1D', 'P1D T1H', 'PT1S1M', 'P1DT1H extra',
    NaN, Infinity, -Infinity, null, undefined, {}, [], true, '1hm', '1 h m']) bad(v);
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
  assert.throws(() => parseDuration('x'), { message: 'Invalid duration: "x"' });
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('PT0.5S'), 500);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('P1DT12H'), 129600000);
  assert.equal(parseDuration('-pt1h30m15s'), -5415000);
  assert.equal(parseDuration('P1.5D'), 129600000);
  assert.equal(parseDuration('P2DT3H4M5.678S'), 2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5678);
});

test('format: long, âm, làm tròn', () => {
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(0.5), '1ms');
  assert.equal(formatDuration(-0.5), '-1ms');
  assert.equal(formatDuration(604800000 + 86400000, { style: 'long' }), '1 week 1 day');
  assert.equal(formatDuration(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
  assert.equal(formatDuration(2 * 86400000 + 5000), '2d 5s');
});


test('format: largest', () => {
  const v = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(v, { largest: 2 }), '1w');
  assert.equal(formatDuration(5400000 + 30000, { largest: 2 }), '1h 31m');
  assert.equal(formatDuration(5400000 + 29999, { largest: 2 }), '1h 30m');
  assert.equal(formatDuration(5400000, { largest: 1 }), '2h');
  assert.equal(formatDuration(3600000 + 5000, { largest: 2 }), '1h');
  assert.equal(formatDuration(3600000 + 5000, { largest: 3 }), '1h 5s');
  assert.equal(formatDuration(3599500, { largest: 2 }), '1h');
  assert.equal(formatDuration(250, { largest: 5 }), '250ms');
  assert.equal(formatDuration(-5400000, { largest: 1, style: 'long' }), '-2 hours');
  assert.equal(formatDuration(0, { largest: 1 }), '0ms');
  assert.equal(formatDuration(400, { largest: 1 }), '400ms');
  assert.equal(formatDuration(86400000 + 1000, { largest: 2 }), '1d');
});

test('format: lỗi tham số', () => {
  for (const v of ['1', NaN, Infinity, null, undefined]) assert.throws(() => formatDuration(v), TypeError);
  assert.throws(() => formatDuration(1, { style: 'x' }), TypeError);
  for (const l of [0, -1, 1.5, '2', null, NaN]) assert.throws(() => formatDuration(1, { largest: l }), TypeError);
});

test('tính chất round-trip', () => {
  for (const x of [0, 1, -1, 0.5, -0.5, 999.5, 5400000, -90061001, 123456789.4, 604800000 * 3 + 1]) {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
    assert.equal(parseDuration(formatDuration(x, { style: 'long' })), parseDuration(x));
  }
});
