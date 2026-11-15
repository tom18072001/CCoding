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

const P = parseDuration;
const F = formatDuration;
const bad = (v) => assert.throws(() => P(v), (e) => e instanceof TypeError && e.message === 'Invalid duration: ' + JSON.stringify(v));

test('parse: kiểu đầu vào', () => {
  assert.equal(P(1.5), 2);
  assert.equal(P(-1.5), -2);
  assert.equal(P(-0.5), -1);
  assert.equal(P(-0.4), 0);
  assert.ok(Object.is(P(-0.4), 0));
  assert.ok(Object.is(P('-0'), 0));
  for (const v of [NaN, Infinity, -Infinity, null, undefined, {}, [], true]) assert.throws(() => P(v), TypeError);
  assert.throws(() => P(undefined), { message: 'Invalid duration: undefined' });
});

test('parse: chuỗi và dấu', () => {
  assert.equal(P('  1H30M '), 5400000);
  assert.equal(P('-1h30m'), -5400000);
  assert.equal(P('+5s'), 5000);
  assert.equal(P('- 5s'), -5000);
  assert.equal(P('1500'), 1500);
  assert.equal(P('1.5'), 2);
  assert.equal(P('-0.5'), -1);
  assert.equal(P('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(P('1h 30m'), 5400000);
  assert.equal(P('1 w 1 d'), 691200000);
  assert.equal(P('1.0005s'), 1001);
  assert.equal(P('0.5ms'), 1);
  assert.equal(P('1.5h'), 5400000);
  assert.equal(P('1m500ms'), 60500);
  for (const v of ['', '   ', '1h-30m', '--5s', '.5', '5.', '1e3', '1h 30', '30m1h', '1h1h', '1x', 'abc', '1h,', '1,5s', '-', '5 ', 'h', '1hm', '1h 1hr', '١s', '1_0'].filter((x) => x.trim() !== '5' )) {
    bad(v);
  }
  bad('');
});

test('parse: ISO 8601', () => {
  assert.equal(P('PT1H30M'), 5400000);
  assert.equal(P('pt1m'), 60000);
  assert.equal(P('P1W'), 604800000);
  assert.equal(P('P1DT2H3M4S'), 86400000 + 7200000 + 180000 + 4000);
  assert.equal(P('PT0,5S'), 500);
  assert.equal(P('-PT1S'), -1000);
  assert.equal(P('P1.5D'), 129600000);
  for (const v of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1H P', 'P 1D', 'PT1S1M', 'P1H', 'PT.5S', 'PT1', 'P1DT1D']) bad(v);
});

test('format: tùy chọn và lỗi', () => {
  assert.equal(F(1), '1ms');
  assert.equal(F(1.5), '2ms');
  assert.equal(F(-1.5), '-2ms');
  assert.equal(F(-0.4), '0ms');
  assert.equal(F(0, { style: 'long' }), '0 milliseconds');
  assert.equal(F(1, { style: 'long' }), '1 millisecond');
  assert.equal(F(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(F(-5400000), '-1h 30m');
  assert.equal(F(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(F(2 * 86400000 + 5000), '2d 5s');
  for (const v of [NaN, Infinity, '1', null, undefined]) assert.throws(() => F(v), TypeError);
  for (const o of [{ style: 'x' }, { largest: 0 }, { largest: 1.5 }, { largest: -1 }, { largest: '2' }, { largest: Infinity }, { largest: NaN }]) {
    assert.throws(() => F(1000, o), TypeError);
  }
  assert.equal(F(1000, {}), '1s');
  assert.equal(F(1000, { largest: undefined }), '1s');
});

test('format: largest', () => {
  const t = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(F(t, { largest: 2 }), '1w');
  assert.equal(F(t, { largest: 1 }), '1w');
  assert.equal(F(t, { largest: 3 }), '1w');
  assert.equal(F(t, { largest: 4 }), '6d 23h 59m 31s');
  assert.equal(F(t, { largest: 6 }), '6d 23h 59m 31s');
  assert.equal(F(5400000 + 29999, { largest: 2 }), '1h 30m');
  assert.equal(F(5400000 + 30000, { largest: 2 }), '1h 31m');
  assert.equal(F(3600000 + 29 * 60000 + 30000, { largest: 1 }), '1h');
  assert.equal(F(3600000 + 30 * 60000, { largest: 1 }), '2h');
  assert.equal(F(86400000 + 5000 + 400, { largest: 2 }), '1d');
  assert.equal(F(86400000 + 3600000 * 12, { largest: 2 }), '1d 12h');
  assert.equal(F(86400000 + 3600000 * 12, { largest: 1 }), '2d');
  assert.equal(F(3600000 + 1000, { largest: 3 }), '1h 1s');
  assert.equal(F(3600000 + 1500, { largest: 3 }), '1h 2s');
  assert.equal(F(-(86400000 + 3600000 * 12), { largest: 1 }), '-2d');
  assert.equal(F(23 * 3600000 + 59 * 60000 + 59500, { largest: 2, style: 'long' }), '1 day');
  assert.equal(F(250, { largest: 1 }), '250ms');
  assert.equal(F(0, { largest: 1 }), '0ms');
});

test('roundtrip', () => {
  for (const x of [0, 1, -1, 999, 1000, 59999.5, -86400001, 1e12, 123456789012, 604800000 * 5000, 0.5, -0.5, 2 ** 60, 1e21]) {
    assert.equal(P(F(x)), P(x));
    assert.equal(P(F(x, { style: 'long' })), P(x));
  }
});
