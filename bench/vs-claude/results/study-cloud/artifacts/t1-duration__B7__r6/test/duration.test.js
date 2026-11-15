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

test('parse: lỗi', () => {
  ['', '  ', '-', '.5', '5.', '1e3', '1h-30m', '30m1h', '1h1h', '1h 30', '1x', 'h', '--5', '1h!', 'P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W2D', 'P1DT1H1D', 'PT1H2D', 'P 1D', 'PT1,S']
    .forEach(bad);
  [null, undefined, {}, [], true, NaN, Infinity, -Infinity].forEach((v) =>
    assert.throws(() => parseDuration(v), TypeError));
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('parse: hợp lệ', () => {
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('+5s'), 5000);
  assert.equal(parseDuration(' 2 Days 4 HOURS '), 187200000);
  assert.equal(parseDuration('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(parseDuration('1h 30m'), 5400000);
  assert.equal(parseDuration('1 h30 m'), 5400000);
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration('1.5'), 2);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('1.4'), 1);
  assert.equal(parseDuration('-0'), 0);
  assert.ok(Object.is(parseDuration('-0'), 0));
  assert.ok(Object.is(parseDuration('-0.4'), 0));
  assert.equal(parseDuration('1.5s'), 1500);
  assert.equal(parseDuration('0.0005s'), 1);
  assert.equal(parseDuration(2.5), 3);
  assert.equal(parseDuration(-2.5), -3);
  assert.ok(Object.is(parseDuration(-0), 0));
  assert.equal(parseDuration(0.49999999999999994), 0);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('pt1m'), 60000);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('-P1DT2H3M4.5S'), -(86400000 + 7200000 + 180000 + 4500));
  assert.equal(parseDuration('P1.5D'), 129600000);
  assert.equal(parseDuration('PT1H30M'), 5400000);
  assert.equal(parseDuration('PT30S'), 30000);
});

test('format: style, dấu, 0', () => {
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
  assert.equal(formatDuration(1.5), '2ms');
  assert.equal(formatDuration(-1.5), '-2ms');
  assert.equal(formatDuration(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(2 * 86400000 + 5000), '2d 5s');
});

test('format: largest', () => {
  const v = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(v, { largest: 2 }), '1w');
  assert.equal(formatDuration(v, { largest: 1 }), '1w');
  assert.equal(formatDuration(5400000, { largest: 1 }), '2h');
  assert.equal(formatDuration(5399999, { largest: 1 }), '1h');
  assert.equal(formatDuration(3600000 + 59 * 60000 + 31000, { largest: 2 }), '2h');
  assert.equal(formatDuration(86400000 + 29 * 60000, { largest: 2 }), '1d');
  assert.equal(formatDuration(86400000 + 30 * 60000, { largest: 2 }), '1d 1h');
  assert.equal(formatDuration(3600000 + 5000, { largest: 3 }), '1h 5s');
  assert.equal(formatDuration(86400000 + 5000, { largest: 2 }), '1d');
  assert.equal(formatDuration(1500, { largest: 10 }), '1s 500ms');
  assert.equal(formatDuration(-5400000, { largest: 1, style: 'long' }), '-2 hours');
  assert.equal(formatDuration(0, { largest: 2 }), '0ms');
});

test('format: tùy chọn không hợp lệ', () => {
  [NaN, Infinity, '1', null, undefined].forEach((v) => assert.throws(() => formatDuration(v), TypeError));
  assert.throws(() => formatDuration(1, { style: 'x' }), TypeError);
  [0, -1, 1.5, '2', NaN, null].forEach((l) => assert.throws(() => formatDuration(1, { largest: l }), TypeError));
});

test('round-trip', () => {
  [0, 1, -1, 999, 1000, 59999, 5400000, -5400000, 604800000 * 3 + 7, 1e15, 1e21, 1.7e308, -123456789.4, 0.5].forEach((x) => {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
    assert.equal(parseDuration(formatDuration(x, { style: 'long' })), parseDuration(x));
  });
});
