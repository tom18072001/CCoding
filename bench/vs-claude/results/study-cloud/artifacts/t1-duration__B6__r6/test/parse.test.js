'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration } = require('../src/parse');

const bad = (x) =>
  assert.throws(
    () => parseDuration(x),
    (e) => e instanceof TypeError && e.message === 'Invalid duration: ' + JSON.stringify(x)
  );

test('number', () => {
  assert.equal(parseDuration(1500), 1500);
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-1.5), -2);
  assert.equal(parseDuration(0.4), 0);
  assert.equal(Object.is(parseDuration(-0), 0), true);
  assert.equal(Object.is(parseDuration(-0.4), 0), true);
  for (const x of [NaN, Infinity, -Infinity]) bad(x);
});

test('kiểu không hợp lệ', () => {
  for (const x of [null, undefined, true, false, {}, [], ['1s']]) bad(x);
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('rỗng, dấu', () => {
  for (const x of ['', '   ', '-', '+', '- ', '--5s', '+-5s', '1h-30m', '1h +30m']) bad(x);
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('+1h30m'), 5400000);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('  -20 '), -20);
  assert.equal(Object.is(parseDuration('-0'), 0), true);
  assert.equal(Object.is(parseDuration('-0.4'), 0), true);
});

test('số thuần', () => {
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration('1.5'), 2);
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('1.4'), 1);
  for (const x of ['.5', '5.', '1e3', '1E3', '1_0', '0x10', '1 000']) bad(x);
});

test('dạng đơn vị', () => {
  assert.equal(parseDuration('1h30m'), 5400000);
  assert.equal(parseDuration('1h 30m'), 5400000);
  assert.equal(parseDuration('1 h 30 m'), 5400000);
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1W2D3H4M5S6MS'), 604800000 + 2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5000 + 6);
  assert.equal(parseDuration('1m5ms'), 60005);
  assert.equal(parseDuration('1m 5ms'), 60005);
  assert.equal(parseDuration('5ms'), 5);
  assert.equal(parseDuration('5m'), 300000);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('0.0005s'), 1);
  assert.equal(parseDuration('1.0005s'), 1001);
  assert.equal(parseDuration('-1.0005s'), -1001);
  assert.equal(parseDuration('1.0004s'), 1000);
  for (const [u, v] of [
    ['wk', 604800000], ['wks', 604800000], ['week', 604800000], ['weeks', 604800000],
    ['day', 86400000], ['days', 86400000], ['hr', 3600000], ['hrs', 3600000], ['hour', 3600000],
    ['hours', 3600000], ['min', 60000], ['mins', 60000], ['minute', 60000], ['minutes', 60000],
    ['sec', 1000], ['secs', 1000], ['second', 1000], ['seconds', 1000], ['msec', 1], ['msecs', 1],
    ['millisecond', 1], ['milliseconds', 1], ['Hours', 3600000], ['MINS', 60000],
  ]) assert.equal(parseDuration('1' + u), v, u);
  assert.equal(parseDuration('1 Hour 2 MINUTES'), 3720000);
});

test('lỗi dạng đơn vị', () => {
  for (const x of ['1h1h', '30m1h', '1s1m', '1ms1s', '1h 30', '30 1h', 'h', '1x', '1h!', '1h,30m',
    '1h30mx', '1hm', 'abc', '1 2h', '.5h', '5.h', '1e3s', '1h30m-', '1h&30m', '1mo', '1y', '1hou', 'toString', '1constructor'])
    bad(x);
});

test('ISO 8601', () => {
  assert.equal(parseDuration('PT1H30M'), 5400000);
  assert.equal(parseDuration('pt1h30m'), 5400000);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('P1D'), 86400000);
  assert.equal(parseDuration('P1DT2H3M4S'), 86400000 + 7200000 + 180000 + 4000);
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('PT0.5S'), 500);
  assert.equal(parseDuration('P1.5D'), 129600000);
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('-PT1S'), -1000);
  assert.equal(parseDuration('+PT1S'), 1000);
  assert.equal(parseDuration('- PT1S'), -1000);
  assert.equal(parseDuration(' PT1S '), 1000);
  assert.equal(parseDuration('PT0.0005S'), 1);
  assert.equal(parseDuration('P0.5W'), 302400000);
  for (const x of ['P1W2D', 'P1WT1H', 'P1D1W', 'P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1M1D', 'P1Y1D', 'PT1H 30M',
    'P 1D', 'PT1H-30M', 'P-1D', 'PT1M1H', 'PT1S1M', 'P1DT1D', 'PT1', 'P1', 'PT.5S', 'PT5.S', 'PT1MS', 'P1H', 'PT1D',
    'PT1,S', 'P1,5', '-P', 'PT1H1H', 'P1T1H'])
    bad(x);
});
