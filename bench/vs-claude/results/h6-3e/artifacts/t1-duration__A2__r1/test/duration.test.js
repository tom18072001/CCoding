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
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('1.4'), 1);
  assert.equal(parseDuration('1.0005s'), 1001);
  assert.ok(Object.is(parseDuration('-0'), 0));
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('+2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('  1H 30M '), 5400000);
  assert.equal(parseDuration('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(parseDuration('1 ms'), 1);
  assert.equal(parseDuration('1.5h'), 5400000);
});

test('parse: ISO', () => {
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('-P1DT1H'), -90000000);
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('p1dt2h3m4.5s'), 86400000 + 7200000 + 180000 + 4500);
});

test('parse: lỗi', () => {
  for (const x of ['', '  ', '-', '.5', '5.', '1e3', '1h-30m', '30m1h', '1h1h', '1h 30', '1x', 'abc', '--5', '+-5',
    'P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'PT1H1D', 'P1D T1H', 'P1.D', 'PT1S1M', '1 2', 'h', '1hm']) bad(x);
  for (const x of [NaN, Infinity, -Infinity, null, undefined, {}, true, [], [1]]) {
    assert.throws(() => parseDuration(x), TypeError);
  }
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('format: largest và nhớ', () => {
  assert.equal(formatDuration(6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000, { largest: 2 }), '1w');
  assert.equal(formatDuration(3600000 + 30 * 60000 + 30000, { largest: 2 }), '1h 31m');
  assert.equal(formatDuration(3600000 + 30 * 60000 + 29999, { largest: 2 }), '1h 30m');
  assert.equal(formatDuration(86400000 + 5000, { largest: 2 }), '1d');
  assert.equal(formatDuration(86400000 + 5000, { largest: 5 }), '1d 5s');
  assert.equal(formatDuration(3599500, { largest: 1 }), '1h');
  assert.equal(formatDuration(59 * 60000 + 59500, { largest: 2 }), '1h');
  assert.equal(formatDuration(1500, { largest: 10 }), '1s 500ms');
  assert.equal(formatDuration(-1500, { largest: 1, style: 'long' }), '-2 seconds');
});

test('format: dấu, làm tròn, long', () => {
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(-0.5), '-1ms');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
  assert.equal(formatDuration(172805000), '2d 5s');
});

test('format: lỗi tham số', () => {
  for (const x of [NaN, Infinity, '1', null, undefined]) assert.throws(() => formatDuration(x), TypeError);
  assert.throws(() => formatDuration(1, { style: 'x' }), TypeError);
  for (const l of [0, -1, 1.5, '2', NaN, Infinity, null]) assert.throws(() => formatDuration(1, { largest: l }), TypeError);
});

test('round-trip', () => {
  for (const x of [0, 1, -1, 0.5, -0.5, 1234567.89, -987654321, 1e12, 604800000 * 3 + 7]) {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
  }
});
