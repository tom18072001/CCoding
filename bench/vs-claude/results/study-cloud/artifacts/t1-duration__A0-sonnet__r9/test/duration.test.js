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
  assert.ok(Object.is(parseDuration(-0), 0));
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('1.4'), 1);
  assert.equal(parseDuration('1.0005s'), 1001);
  assert.equal(parseDuration('-20'), -20);
  assert.ok(Object.is(parseDuration('-0'), 0));
  assert.equal(parseDuration('+ 5s'), 5000);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('-1h30m'), -5400000);
});

test('parse: lỗi', () => {
  for (const x of [NaN, Infinity, -Infinity, null, undefined, {}, true, [], '', '  ', '.5', '5.', '1e3', '1h-30m', '--1s', '-', '1h 30', '30m1h', '1h1h', '1x', 'h', '1h!', '1 h 3 0m', 'P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'PT1H1D', 'P 1D', 'PT1S1M', 'P1.D']) bad(x);
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('parse: đơn vị', () => {
  assert.equal(parseDuration(' 2 Days 4 HOURS '), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1w 1d 1h 1m 1s 1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(parseDuration('1m5s'), 65000);
  assert.equal(parseDuration('5 mins'), 300000);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('2 msecs'), 2);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('P2W'), 2 * 604800000);
  assert.equal(parseDuration('-P1DT1H'), -90000000);
  assert.equal(parseDuration('pt1h'), 3600000);
  assert.equal(parseDuration('P1DT2H3M4.5S'), 86400000 + 7200000 + 180000 + 4500);
});

test('format: largest và nhớ', () => {
  assert.equal(formatDuration(6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000, { largest: 2 }), '1w');
  assert.equal(formatDuration(5400000 + 30000, { largest: 2 }), '1h 31m');
  assert.equal(formatDuration(3600000 + 29999, { largest: 2 }), '1h');
  assert.equal(formatDuration(86400000 + 5000, { largest: 2 }), '1d');
  assert.equal(formatDuration(86400000 + 5000, { largest: 3 }), '1d');
  assert.equal(formatDuration(86400000 + 5000, { largest: 6 }), '1d 5s');
  assert.equal(formatDuration(3600000 + 59 * 60000 + 30000, { largest: 2 }), '2h');
  assert.equal(formatDuration(2 * 86400000 + 5000, { largest: 4 }), '2d 5s');
  assert.equal(formatDuration(1500, { largest: 1 }), '2s');
});

test('format: dấu, long, lỗi', () => {
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(0.5), '1ms');
  assert.equal(formatDuration(-0.5), '-1ms');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
  for (const x of ['1', NaN, Infinity, null, undefined]) assert.throws(() => formatDuration(x), TypeError);
  assert.throws(() => formatDuration(1, { style: 'x' }), TypeError);
  for (const l of [0, -1, 1.5, '2', NaN, Infinity]) assert.throws(() => formatDuration(1, { largest: l }), TypeError);
});

test('round trip', () => {
  for (const x of [0, 1, 999.5, -1234567.4, 123456789012, -604800000, 90061001]) {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
    assert.equal(parseDuration(formatDuration(x, { style: 'long' })), parseDuration(x));
  }
});
