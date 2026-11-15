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
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('1.4'), 1);
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration('-20'), -20);
  assert.ok(Object.is(parseDuration('-0'), 0));
  assert.equal(parseDuration('0.1s'), 100);
  assert.equal(parseDuration('1.0005s'), 1001);
});

test('parse: lỗi', () => {
  for (const x of [NaN, Infinity, -Infinity, null, undefined, {}, true, [], '', '  ', '.5', '5.', '1e3', '1h-30m', '30m1h', '1h1h', '1h 30', '1x', 'h', '--5s', '+-5s', '-', '1 h m', 'P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1H1D', 'P1D 1H', 'P 1D', 'PT1S1M', '1,5s', '1ms1s'])
    bad(x);
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('parse: dạng đơn vị', () => {
  assert.equal(parseDuration('  - 5s '), -5000);
  assert.equal(parseDuration('+1H'), 3600000);
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('1h 30m'), 5400000);
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(parseDuration('5 MS'), 5);
  assert.equal(parseDuration('3 mins'), 180000);
  assert.equal(parseDuration('1.5h'), 5400000);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('P1DT2H3M4.5S'), 86400000 + 7200000 + 180000 + 4500);
  assert.equal(parseDuration('-pt1h'), -3600000);
  assert.equal(parseDuration('P1D'), 86400000);
  assert.equal(parseDuration('PT0.0005S'), 1);
});

test('format: largest và làm tròn', () => {
  const t = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(t, { largest: 2 }), '1w');
  assert.equal(formatDuration(t), '6d 23h 59m 31s');
  assert.equal(formatDuration(3600000 + 1800000, { largest: 1 }), '2h');
  assert.equal(formatDuration(86400000 + 5000, { largest: 2 }), '1d');
  assert.equal(formatDuration(86400000 + 5000, { largest: 4 }), '1d 5s');
  assert.equal(formatDuration(59 * 60000 + 30000, { largest: 1 }), '1h');
  assert.equal(formatDuration(5400000, { largest: 10 }), '1h 30m');
  assert.equal(formatDuration(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
});

test('format: dấu, 0, lỗi', () => {
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(0.5), '1ms');
  assert.equal(formatDuration(-0.5), '-1ms');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
  for (const x of ['1', NaN, Infinity, null, undefined]) assert.throws(() => formatDuration(x), TypeError);
  for (const o of [{ style: 'x' }, { largest: 0 }, { largest: 1.5 }, { largest: '2' }, { largest: -1 }, { largest: NaN }])
    assert.throws(() => formatDuration(1000, o), TypeError);
});

test('round-trip', () => {
  for (const x of [0, 1, -1, 999, 1000, 59999.5, -86400000, 1e15, 1e21, 123456789.4, -0.5])
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
});
