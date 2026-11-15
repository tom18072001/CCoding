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

test('parse: số, dấu, làm tròn', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-0.5), -1);
  assert.equal(parseDuration(1.4), 1);
  assert.ok(Object.is(parseDuration(-0.2), 0));
  assert.ok(Object.is(parseDuration('-0'), 0));
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration('1.5'), 2);
  assert.equal(parseDuration('-20'), -20);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('+ 5s'), 5000);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('  1H 30M  '), 5400000);
  assert.equal(parseDuration('0.0005s'), 1);
});

test('parse: dạng đơn vị', () => {
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1w2d3h4m5s6ms'), 604800000 + 2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5000 + 6);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('1 min'), 60000);
  assert.equal(parseDuration('1 msecs'), 1);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('P1DT2H'), 93600000);
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('-pt1h'), -3600000);
  assert.equal(parseDuration('P0.5D'), 43200000);
});

test('parse: đầu vào không hợp lệ', () => {
  const bad = ['', '  ', '-', '.5', '5.', '1e3', '1h-30m', '30m1h', '1h1h', '1h 30', '1x', 'abc',
    'P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'PT1H1D', 'P1D T1H', 'PT1S1M', '--5s', '1 h 30',
    '1hm', 'h', '1__proto__', '1constructor'];
  for (const b of bad) {
    assert.throws(() => parseDuration(b), (e) => e instanceof TypeError &&
      e.message === 'Invalid duration: ' + JSON.stringify(b), b);
  }
  for (const b of [NaN, Infinity, -Infinity, null, undefined, {}, [], true]) {
    assert.throws(() => parseDuration(b), TypeError);
  }
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('format: largest và làm tròn', () => {
  const x = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(x, { largest: 2 }), '1w');
  assert.equal(formatDuration(5400000 + 30000, { largest: 2 }), '1h 31m');
  assert.equal(formatDuration(3600000 + 29000, { largest: 2 }), '1h');
  assert.equal(formatDuration(2 * 86400000 + 5000, { largest: 3 }), '2d');
  assert.equal(formatDuration(3600000 + 5000, { largest: 3 }), '1h 5s');
  assert.equal(formatDuration(3600000 + 5000, { largest: 5 }), '1h 5s');
  assert.equal(formatDuration(5400000, { largest: 10 }), '1h 30m');
  assert.equal(formatDuration(1500, { largest: 1 }), '2s');
  assert.equal(formatDuration(0, { largest: 1 }), '0ms');
});

test('format: style, dấu, 0', () => {
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(1209600000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(-0.5), '-1ms');
});

test('format: lỗi tùy chọn', () => {
  assert.throws(() => formatDuration(NaN), TypeError);
  assert.throws(() => formatDuration('1'), TypeError);
  assert.throws(() => formatDuration(1, { style: 'x' }), TypeError);
  for (const l of [0, -1, 1.5, '2', NaN, Infinity]) {
    assert.throws(() => formatDuration(1000, { largest: l }), TypeError);
  }
});

test('round trip', () => {
  for (const x of [0, 1, -1, 999.5, 123456789.4, -987654321, 1e15, 1e21, -3.5e9]) {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
    assert.equal(parseDuration(formatDuration(x, { style: 'long' })), parseDuration(x));
  }
});
