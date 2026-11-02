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

const bad = (v) => assert.throws(() => parseDuration(v), TypeError);

test('parse: số và số thuần', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-0.5), -1);
  assert.equal(parseDuration(-0.4), 0);
  assert.ok(Object.is(parseDuration(-0.4), 0));
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration(' -20 '), -20);
  for (const v of ['.5', '5.', '1e3', '', '  ', '--5', '+-5', '1,5']) bad(v);
  for (const v of [NaN, Infinity, -Infinity, null, undefined, {}, [], true]) bad(v);
});

test('parse: thông báo lỗi', () => {
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
  assert.throws(() => parseDuration('x'), { message: 'Invalid duration: "x"' });
  assert.throws(() => parseDuration(null), { message: 'Invalid duration: null' });
});

test('parse: dạng đơn vị', () => {
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('+5s'), 5000);
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1H 30 MIN'), 5400000);
  assert.equal(parseDuration('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('0.5ms'), 1);
  assert.equal(parseDuration('1m'), 60000);
  assert.equal(parseDuration('1ms'), 1);
  assert.equal(parseDuration('2 wks'), 1209600000);
  for (const v of ['1h-30m', '30m1h', '1h1h', '1h 30', '30 1h', 'h', '1x', '1h!', '1 h 30 m x', '1.h', '.5h', '1e3s', '1hh', '1m s'])
    bad(v);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('-P1DT2H'), -(86400000 + 7200000));
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('pt1h30m5s'), 5405000);
  assert.equal(parseDuration('P1DT1.5S'), 86401500);
  for (const v of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1S1M', 'P1D T1H', 'P 1D', 'PT1,S', 'P1.5', 'PT-1S'])
    bad(v);
});

test('format: cơ bản và biên', () => {
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(0.5), '1ms');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
  assert.equal(formatDuration(1209600000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(2 * 86400000 + 5000), '2d 5s');
  assert.equal(formatDuration(250), '250ms');
  assert.equal(formatDuration(3600000 + 1), '1h 1ms');
});

test('format: largest', () => {
  const x = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(x, { largest: 2 }), '1w');
  assert.equal(formatDuration(x, { largest: 1 }), '1w');
  assert.equal(formatDuration(x, { largest: 6 }), '6d 23h 59m 31s');
  assert.equal(formatDuration(3600000 + 30 * 60000, { largest: 1 }), '2h');
  assert.equal(formatDuration(3600000 + 29 * 60000, { largest: 1 }), '1h');
  assert.equal(formatDuration(86400000 + 3600000 * 0 + 31000, { largest: 3 }), '1d 1m');
  assert.equal(formatDuration(86400000 + 31000, { largest: 4 }), '1d 31s');
  assert.equal(formatDuration(59 * 60000 + 31000, { largest: 1 }), '1h');
  assert.equal(formatDuration(-(3600000 + 1800000), { largest: 1, style: 'long' }), '-2 hours');
  assert.equal(formatDuration(0, { largest: 2 }), '0ms');
  assert.equal(formatDuration(400, { largest: 1 }), '400ms');
});

test('format: lỗi', () => {
  for (const v of [NaN, Infinity, '1', null, undefined]) assert.throws(() => formatDuration(v), TypeError);
  assert.throws(() => formatDuration(NaN), { message: 'Invalid duration: null' });
  for (const o of [{ style: 'x' }, { largest: 0 }, { largest: 1.5 }, { largest: '2' }, { largest: -1 }, { largest: NaN }])
    assert.throws(() => formatDuration(1, o), TypeError);
});

test('round-trip', () => {
  for (const x of [0, 1, -1, 0.5, -0.5, 999.5, 5400000, -86400000.5, 1e12, 123456789.4, 1e21]) {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
    assert.equal(parseDuration(formatDuration(x, { style: 'long' })), parseDuration(x));
  }
});
