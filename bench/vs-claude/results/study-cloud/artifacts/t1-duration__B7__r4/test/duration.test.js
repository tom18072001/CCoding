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

test('parse: số và kiểu đầu vào', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-0.5), -1);
  assert.equal(parseDuration(-0.4), 0);
  assert.ok(Object.is(parseDuration(-0.4), 0));
  [NaN, Infinity, -Infinity, null, undefined, {}, true, []].forEach(bad);
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('parse: số thuần, dấu', () => {
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('-20'), -20);
  assert.equal(parseDuration(' - 5s '), -5000);
  assert.equal(parseDuration('+5s'), 5000);
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.ok(Object.is(parseDuration('-0'), 0));
  ['', '  ', '.5', '5.', '1e3', '1h-30m', '--5s', '-', '+', '1h 30', '30m1h', '1h1h', '1x', '1h!', '1 2h'].forEach(bad);
});

test('parse: dạng đơn vị', () => {
  assert.equal(parseDuration('1h 30m'), 5400000);
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1W2D3H4M5S6MS'), 604800000 + 2 * 86400000 + 3 * 3600000 + 240000 + 5000 + 6);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('0.0005s'), 1);
  assert.equal(parseDuration('1 min 1 msec'), 60001);
  assert.equal(parseDuration('3 wks'), 3 * 604800000);
  assert.equal(parseDuration('1 millisecond'), 1);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('P1DT2H3M4.5S'), 86400000 + 7200000 + 180000 + 4500);
  assert.equal(parseDuration('-PT1M'), -60000);
  assert.equal(parseDuration('pt1m'), 60000);
  ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1H1D', 'P1D T1H', 'PT1.S', 'PT1M30'].forEach(bad);
});

test('format: largest và làm tròn', () => {
  const d = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(d, { largest: 2 }), '1w');
  assert.equal(formatDuration(5400000, { largest: 1 }), '2h');
  assert.equal(formatDuration(5399999, { largest: 1 }), '1h');
  assert.equal(formatDuration(3600000 + 5000, { largest: 2 }), '1h');
  assert.equal(formatDuration(3600000 + 29 * 60000 + 59999, { largest: 2 }), '1h 30m');
  assert.equal(formatDuration(86400000 + 5000, { largest: 3 }), '1d');
  assert.equal(formatDuration(23 * 3600000 + 59 * 60000 + 30000, { largest: 2 }), '1d');
  assert.equal(formatDuration(1500, { largest: 10 }), '1s 500ms');
  assert.equal(formatDuration(1500, { largest: 1, style: 'long' }), '2 seconds');
});

test('format: dấu, long, 0, lỗi', () => {
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(0.4), '0ms');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(-0.5), '-1ms');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(2 * 86400000 + 5000), '2d 5s');
  assert.throws(() => formatDuration('1'), TypeError);
  assert.throws(() => formatDuration(NaN), TypeError);
  assert.throws(() => formatDuration(1, { style: 'x' }), TypeError);
  [0, -1, 1.5, '2', null, NaN].forEach((l) => assert.throws(() => formatDuration(1, { largest: l }), TypeError));
});

test('round-trip', () => {
  [0, 1, -1, 0.5, 1234567.89, 999999999999, -86399999.5, 59999.5].forEach((x) => {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
  });
});
