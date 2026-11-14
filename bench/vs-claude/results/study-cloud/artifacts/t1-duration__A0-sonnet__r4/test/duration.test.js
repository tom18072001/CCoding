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

test('parse: số và lỗi kiểu', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-1.5), -2);
  assert.equal(parseDuration(-0.4), 0);
  assert.ok(Object.is(parseDuration(-0), 0));
  [NaN, Infinity, -Infinity, null, undefined, {}, true, []].forEach(bad);
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('parse: chuỗi thuần và dấu', () => {
  assert.equal(parseDuration(' 1500 '), 1500);
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('-0.4'), 0);
  assert.ok(Object.is(parseDuration('-0'), 0));
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('+5s'), 5000);
  ['', '  ', '.5', '5.', '1e3', '1h-30m', '--5s', '+-5', '-', '1h 30', '30m1h', '1h1h', '1x', '1h!', 'h', '1 2h', '1hm'].forEach(bad);
});

test('parse: dạng đơn vị', () => {
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1H 30M'), 5400000);
  assert.equal(parseDuration('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('1 ms'), 1);
  assert.equal(parseDuration('1m5s'), 65000);
  assert.equal(parseDuration('0.0005s'), 1);
  assert.equal(parseDuration('1.0015s'), 1002);
  assert.equal(parseDuration('2 wks'), 1209600000);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('P1DT2H3M4.5S'), 86400000 + 7200000 + 180000 + 4500);
  assert.equal(parseDuration('-pt1m'), -60000);
  assert.equal(parseDuration('PT1M'), 60000);
  ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1DT1W', 'PT1H1D', 'PT1S1M', 'P 1D', 'PT1 H', 'P1D1D', 'PT.5S'].forEach(bad);
});

test('format: largest và làm tròn', () => {
  assert.equal(formatDuration(6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000, { largest: 2 }), '1w');
  assert.equal(formatDuration(5400000, { largest: 1 }), '2h');
  assert.equal(formatDuration(5399999, { largest: 1 }), '1h');
  assert.equal(formatDuration(3600000 + 5000, { largest: 3 }), '1h 5s');
  assert.equal(formatDuration(3600000 + 5000, { largest: 2 }), '1h');
  assert.equal(formatDuration(86400000 + 1800000, { largest: 2 }), '1d 1h');
  assert.equal(formatDuration(59999, { largest: 1 }), '1m');
  assert.equal(formatDuration(100, { largest: 5 }), '100ms');
});

test('format: dạng và lỗi', () => {
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(1209600000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(0.5), '1ms');
  assert.equal(formatDuration(-0.5), '-1ms');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
  assert.equal(formatDuration(86400000 * 2 + 5000), '2d 5s');
  [NaN, Infinity, '5', null, undefined].forEach((x) => assert.throws(() => formatDuration(x), TypeError));
  [{ style: 'x' }, { largest: 0 }, { largest: 1.5 }, { largest: -1 }, { largest: '2' }, { largest: NaN }, { largest: null }].forEach((o) =>
    assert.throws(() => formatDuration(1000, o), TypeError));
});

test('round-trip', () => {
  [0, 1, -1, 999, 1000, 59999, 3600001, -90061001, 1e12, 123456789.5, -0.5].forEach((x) => {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
    assert.equal(parseDuration(formatDuration(x, { style: 'long' })), parseDuration(x));
  });
});
