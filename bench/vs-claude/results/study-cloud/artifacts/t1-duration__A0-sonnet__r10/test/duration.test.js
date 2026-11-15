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

const bad = (v) => assert.throws(() => parseDuration(v), (e) => e instanceof TypeError && e.message === 'Invalid duration: ' + JSON.stringify(v));

test('parse: số và dấu', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-0.5), -1);
  assert.equal(parseDuration(-0.4), 0);
  assert.ok(Object.is(parseDuration(-0.4), 0));
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('+5s'), 5000);
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('0.0005s'), 1);
  assert.ok(Object.is(parseDuration('-0'), 0));
  assert.equal(parseDuration('  2 DAYS 4 Hours '), 172800000 + 14400000);
  assert.equal(parseDuration('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
});

test('parse: lỗi', () => {
  for (const v of ['.5', '5.', '1e3', '1h-30m', '30m1h', '1h1h', '1h 30', '--5', '-', '', '  ', '5x', '1h?', '1 h m',
    NaN, Infinity, null, undefined, {}, true, 'P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'PT1H1D', 'P1D 1H', 'PT1S1M', 'P-1D']) {
    if (typeof v === 'number') assert.throws(() => parseDuration(v), TypeError);
    else bad(v);
  }
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('P1DT2H3M4.5S'), 86400000 + 7200000 + 180000 + 4500);
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('-PT1H'), -3600000);
  assert.equal(parseDuration('pt1h'), 3600000);
});

test('format: largest và làm tròn', () => {
  assert.equal(formatDuration(6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000, { largest: 2 }), '1w');
  assert.equal(formatDuration(5400000 + 30000, { largest: 2 }), '1h 31m');
  assert.equal(formatDuration(3600000 + 5000, { largest: 2 }), '1h');
  assert.equal(formatDuration(3600000 + 40 * 60000, { largest: 1 }), '2h');
  assert.equal(formatDuration(86400000 + 30 * 60000, { largest: 3 }), '1d 30m');
  assert.equal(formatDuration(59 * 60000 + 59500, { largest: 2 }), '1h');
  assert.equal(formatDuration(1500, { largest: 10 }), '1s 500ms');
  assert.equal(formatDuration(2.5), '3ms');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
});

test('format: lỗi tùy chọn', () => {
  for (const o of [{ style: 'x' }, { largest: 0 }, { largest: 1.5 }, { largest: '2' }, { largest: Infinity }, { largest: null }]) {
    assert.throws(() => formatDuration(1, o), TypeError);
  }
  for (const v of [NaN, Infinity, '1', null, undefined]) assert.throws(() => formatDuration(v), TypeError);
});

test('round-trip', () => {
  for (const x of [0, 1, -1, 0.5, -0.5, 999.5, 1e9, -123456789.4, 1e21, 6048e5 * 3 + 0.5]) {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
  }
});
