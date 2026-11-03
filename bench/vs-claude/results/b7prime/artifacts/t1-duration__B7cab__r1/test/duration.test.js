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

test('parse biên: số, dấu, làm tròn', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-0.5), -1);
  assert.equal(parseDuration(-0.2), 0);
  assert.ok(Object.is(parseDuration(-0.2), 0));
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration(' - 5s '), -5000);
  assert.equal(parseDuration('+1H'), 3600000);
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('1.0005s'), 1001);
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1w 1d'), 691200000);
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('P2W'), 1209600000);
  assert.equal(parseDuration('P1DT2H3M4.5S'), 86400000 + 7200000 + 180000 + 4500);
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('-PT1S'), -1000);
});

test('parse biên: lỗi', () => {
  for (const v of ['', '  ', '-', '.5', '5.', '1e3', '1h-30m', '30m1h', '1h1h', '1h 30', 'abc', '1x', '--5',
    'P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1DT1H1D', 'PT1H1D', 'P 1D', 'PT1,S', '1,5s', '1h,', 'ms', '5 5s']) bad(v);
  for (const v of [NaN, Infinity, -Infinity, null, {}, true, []]) {
    assert.throws(() => parseDuration(v), TypeError);
  }
  assert.throws(() => parseDuration(undefined), { name: 'TypeError', message: 'Invalid duration: undefined' });
});

test('format biên', () => {
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(0.4), '0ms');
  assert.equal(formatDuration(-0.4, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(0.5), '1ms');
  assert.equal(formatDuration(1209600000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(86400005), '1d 5ms');
  const d6 = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(d6, { largest: 2 }), '1w');
  assert.equal(formatDuration(d6, { largest: 1 }), '1w');
  assert.equal(formatDuration(3600000 + 29 * 60000 + 30000, { largest: 2 }), '1h 30m');
  assert.equal(formatDuration(3600000 + 5000, { largest: 2 }), '1h');
  assert.equal(formatDuration(3600000 + 5000, { largest: 3 }), '1h 5s');
  assert.equal(formatDuration(3600000 + 30000, { largest: 2 }), '1h 1m');
  assert.equal(formatDuration(1500, { largest: 10 }), '1s 500ms');
  assert.equal(formatDuration(1500, { largest: 1, style: 'long' }), '2 seconds');
  assert.equal(formatDuration(-90000, { largest: 1 }), '-2m');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
});

test('format: lỗi tùy chọn', () => {
  for (const v of [NaN, Infinity, '1', null, undefined]) assert.throws(() => formatDuration(v), TypeError);
  assert.throws(() => formatDuration(1, { style: 'x' }), TypeError);
  for (const l of [0, -1, 1.5, '2', NaN, Infinity, null]) assert.throws(() => formatDuration(1, { largest: l }), TypeError);
});

test('round-trip', () => {
  for (const x of [0, 1, -1, 0.5, -0.5, 999.5, 59999.5, 604800000, 123456789.4, -987654321, 1e15]) {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
    assert.equal(parseDuration(formatDuration(x, { style: 'long' })), parseDuration(x));
  }
});
