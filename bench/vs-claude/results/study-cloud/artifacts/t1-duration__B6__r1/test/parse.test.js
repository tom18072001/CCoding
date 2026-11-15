'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration } = require('../src/parse');

const bad = (x) =>
  assert.throws(() => parseDuration(x), (e) =>
    e instanceof TypeError &&
    e.message === 'Invalid duration: ' + (x === undefined ? 'undefined' : JSON.stringify(x)));

test('kiểu đầu vào', () => {
  assert.equal(parseDuration(1500), 1500);
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-1.5), -2);
  assert.equal(parseDuration(-0.5), -1);
  assert.equal(parseDuration(0.4), 0);
  assert.ok(Object.is(parseDuration(-0), 0));
  assert.ok(Object.is(parseDuration(-0.4), 0));
  for (const x of [NaN, Infinity, -Infinity, null, undefined, true, false, {}, [], [1]]) bad(x);
});

test('rỗng, khoảng trắng, dấu', () => {
  for (const x of ['', '   ', '-', '+', '- ', '--1s', '+-1s', '1h-30m', '1h+30m']) bad(x);
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('+1h'), 3600000);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('  1h  '), 3600000);
  assert.ok(Object.is(parseDuration('-0'), 0));
  assert.ok(Object.is(parseDuration('-0.4'), 0));
});

test('số thuần', () => {
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration('1.5'), 2);
  assert.equal(parseDuration('-20'), -20);
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  for (const x of ['.5', '5.', '1e3', '1,5', '1_0', '0x10', 'NaN', 'Infinity']) bad(x);
});

test('dạng đơn vị', () => {
  assert.equal(parseDuration('1h30m'), 5400000);
  assert.equal(parseDuration('1h 30m'), 5400000);
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1W2D3H4M5S6MS'), 604800000 + 2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5000 + 6);
  assert.equal(parseDuration('1 WEEK'), 604800000);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('0.0005s'), 1);
  assert.equal(parseDuration('0.0004s'), 0);
  assert.equal(parseDuration('1.5ms'), 2);
  assert.equal(parseDuration('-1.5ms'), -2);
  assert.equal(parseDuration('1 min 1 sec 1 msec'), 61001);
  for (const [a, ms] of [['wk', 6048e5], ['wks', 6048e5], ['weeks', 6048e5], ['day', 864e5], ['hr', 36e5],
    ['hrs', 36e5], ['hours', 36e5], ['min', 6e4], ['mins', 6e4], ['minutes', 6e4], ['secs', 1e3],
    ['seconds', 1e3], ['msecs', 1], ['milliseconds', 1], ['millisecond', 1]]) {
    assert.equal(parseDuration('1' + a), ms, a);
  }
  for (const x of ['30m1h', '1h1h', '1h 30', '30 1h', 'h', '1x', '1h!', '1h,30m', '1 2h', '1hh', '.5h', '5.h',
    '1e3s', '1s1ms1s', '1m1w', '1h-30m', '1ms1s']) bad(x);
});

test('ISO 8601', () => {
  assert.equal(parseDuration('PT1H30M'), 5400000);
  assert.equal(parseDuration('pt1h30m'), 5400000);
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('P2W'), 2 * 604800000);
  assert.equal(parseDuration('P1D'), 86400000);
  assert.equal(parseDuration('P1DT2H3M4S'), 86400000 + 7200000 + 180000 + 4000);
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('PT0.5S'), 500);
  assert.equal(parseDuration('P0.5D'), 43200000);
  assert.equal(parseDuration('P1,5W'), 907200000);
  assert.equal(parseDuration('-PT1S'), -1000);
  assert.equal(parseDuration('+PT1S'), 1000);
  assert.equal(parseDuration('- PT1S'), -1000);
  assert.equal(parseDuration('PT0.0005S'), 1);
  assert.equal(parseDuration('-PT0.0005S'), -1);
  for (const x of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1Y2M', 'PT1', 'P1W1D', 'P1WT1H', 'PT1S1M', 'PT1M1H', 'P1H',
    'P T1S', 'PT 1S', 'P1D T1H', ' P 1D', 'PT.5S', 'PT5.S', 'PT1,S', 'P-1D', 'PT-1S', 'P1DT1D', 'PT1H1H', 'P1.W5']) bad(x);
});
