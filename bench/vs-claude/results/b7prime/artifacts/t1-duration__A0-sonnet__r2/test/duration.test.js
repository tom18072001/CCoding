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

test('parse: số và làm tròn', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-1.5), -2);
  assert.equal(parseDuration(-0.4), 0);
  assert.ok(Object.is(parseDuration(-0), 0));
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('1.4'), 1);
  assert.ok(Object.is(parseDuration('-0.1'), 0));
  assert.equal(parseDuration('0.0005s'), 1);
  assert.equal(parseDuration(' +1500 '), 1500);
  assert.equal(parseDuration('-20'), -20);
});

test('parse: lỗi', () => {
  for (const v of [NaN, Infinity, -Infinity, null, undefined, {}, true, [], ' ', '-', '+', '.5', '5.', '1e3', '1h-30m', '--5s', '1h 30', '30m1h', '1h1h', '1x', 'h', '1h,', '1 ms s',
    'P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'PT1H1D', 'P1DT1H1D', 'PT 1H', 'P1.W', 'PT1S1M', 'P-1D', 'P1,D']) {
    if (v === undefined) assert.throws(() => parseDuration(v), { message: 'Invalid duration: undefined' });
    else bad(v);
  }
});

test('parse: dạng đơn vị', () => {
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1H 30M'), 5400000);
  assert.equal(parseDuration('1w2d3h4m5s6ms'), 604800000 + 2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5000 + 6);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('1 min'), 60000);
  assert.equal(parseDuration('5 msecs'), 5);
  assert.equal(parseDuration('1 wk'), 604800000);
  assert.equal(parseDuration('1m 1ms'), 60001);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('-P1DT2H'), -(86400000 + 7200000));
  assert.equal(parseDuration('p1dt1s'), 86401000);
  assert.equal(parseDuration('P0D'), 0);
  assert.equal(parseDuration('PT0.0005S'), 1);
});

test('format: biên', () => {
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(0.5), '1ms');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
  assert.equal(formatDuration(1209600000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(2 * 86400000 + 5000), '2d 5s');
  assert.equal(formatDuration(250), '250ms');
});

test('format: largest', () => {
  const ms = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(ms, { largest: 2 }), '1w');
  assert.equal(formatDuration(ms, { largest: 1 }), '1w');
  assert.equal(formatDuration(ms), '6d 23h 59m 31s');
  assert.equal(formatDuration(3600000 + 29 * 60000 + 30000, { largest: 2 }), '1h 30m');
  assert.equal(formatDuration(3600000 + 29 * 60000 + 29999, { largest: 2 }), '1h 29m');
  assert.equal(formatDuration(3600000 + 5000, { largest: 2 }), '1h');
  assert.equal(formatDuration(3600000 + 5000, { largest: 3 }), '1h 5s');
  assert.equal(formatDuration(3600000 + 5000, { largest: 100 }), '1h 5s');
  assert.equal(formatDuration(-(3600000 + 31 * 60000), { largest: 1, style: 'long' }), '-2 hours');
  assert.equal(formatDuration(59 * 60000 + 59500, { largest: 2 }), '1h');
  assert.equal(formatDuration(0, { largest: 1 }), '0ms');
});

test('format: lỗi tùy chọn', () => {
  for (const v of [NaN, Infinity, '1', null, undefined]) assert.throws(() => formatDuration(v), TypeError);
  for (const o of [{ style: 'x' }, { style: null }, { largest: 0 }, { largest: 1.5 }, { largest: '2' }, { largest: -1 }, { largest: NaN }, { largest: Infinity }, { largest: null }]) {
    assert.throws(() => formatDuration(1000, o), TypeError);
  }
});

test('round-trip', () => {
  for (const x of [0, 1, -1, 0.5, -0.5, 999.5, 59999.5, 5400000, -86400001, 1e15, 123456789012, 1e21, -1e21]) {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
    assert.equal(parseDuration(formatDuration(x, { style: 'long' })), parseDuration(x));
  }
});
