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

test('parse: số và kiểu đầu vào', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-0.5), -1);
  assert.equal(parseDuration(-0.4), 0);
  assert.ok(Object.is(parseDuration(-0.4), 0));
  for (const x of [NaN, Infinity, -Infinity, null, {}, true, []]) assert.throws(() => parseDuration(x), TypeError);
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
  assert.throws(() => parseDuration(10n), TypeError);
});

test('parse: số thuần và dấu', () => {
  assert.equal(parseDuration(' 1500 '), 1500);
  assert.equal(parseDuration('1.5'), 2);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('+ 5s'), 5000);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.ok(Object.is(parseDuration('-0'), 0));
  for (const x of ['', '  ', '.5', '5.', '1e3', '-', '--5s', '+-5s', '1h-30m', '1h +30m', '1,5']) bad(x);
});

test('parse: dạng đơn vị', () => {
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1H 30M'), 5400000);
  assert.equal(parseDuration('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('1 min'), 60000);
  assert.equal(parseDuration('1.0005s'), 1001);
  assert.equal(parseDuration('0.0005s'), 1);
  assert.equal(parseDuration('1ms 0.5'.slice(0, 3)), 1);
  for (const x of ['30m1h', '1h1h', '1h 30', '1 30m', 'h', '1x', '1h x', '1hm', 'abc', '1h,30m', '1ms1s', '1.h', '.5h']) bad(x);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('P1DT2H3M4.5S'), 86400000 + 7200000 + 180000 + 4500);
  assert.equal(parseDuration('-pt1m'), -60000);
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('P1.5D'), 129600000);
  for (const x of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1H1D', 'PT1S1M', 'P1D 1H', 'P 1D', 'PT1,S', 'P1Y2M']) bad(x);
});

test('format: cơ bản và dấu', () => {
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(0.5), '1ms');
  assert.equal(formatDuration(-0.5), '-1ms');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
  assert.equal(formatDuration(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(2 * 86400000 + 5000), '2d 5s');
  assert.equal(formatDuration(250), '250ms');
});

test('format: largest', () => {
  const v = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(v, { largest: 2 }), '1w');
  assert.equal(formatDuration(5400000 + 30000, { largest: 1 }), '2h');
  assert.equal(formatDuration(3600000 + 5000, { largest: 2 }), '1h');
  assert.equal(formatDuration(3600000 + 5000, { largest: 3 }), '1h 5s');
  assert.equal(formatDuration(3600000 + 29 * 60000, { largest: 1 }), '1h');
  assert.equal(formatDuration(3600000 + 30 * 60000, { largest: 1 }), '2h');
  assert.equal(formatDuration(59 * 60000 + 59500, { largest: 2 }), '1h');
  assert.equal(formatDuration(1500, { largest: 1 }), '2s');
  assert.equal(formatDuration(-1500, { largest: 1, style: 'long' }), '-2 seconds');
  assert.equal(formatDuration(5, { largest: 10 }), '5ms');
  assert.equal(formatDuration(0, { largest: 1 }), '0ms');
  assert.equal(formatDuration(86400000 + 20, { largest: 3 }), '1d');
  assert.equal(formatDuration(23 * 3600000 + 59 * 60000 + 30000, { largest: 2 }), '1d');
});

test('format: lỗi', () => {
  for (const x of ['1', NaN, Infinity, null, undefined]) assert.throws(() => formatDuration(x), TypeError);
  for (const o of [{ style: 'x' }, { style: null }, { largest: 0 }, { largest: 1.5 }, { largest: '2' }, { largest: -1 }, { largest: NaN }, { largest: null }]) {
    assert.throws(() => formatDuration(1000, o), TypeError);
  }
  assert.equal(formatDuration(1000, {}), '1s');
  assert.equal(formatDuration(1000, { style: undefined, largest: undefined }), '1s');
});

test('round-trip', () => {
  for (const x of [0, 1, -1, 0.5, -0.5, 1234.567, 5400000, -86400001, 1e12, 604800000 * 3.5, 123456789012]) {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
    assert.equal(parseDuration(formatDuration(x, { style: 'long' })), parseDuration(x));
  }
});
