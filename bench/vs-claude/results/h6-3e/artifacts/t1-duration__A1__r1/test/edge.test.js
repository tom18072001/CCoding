'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration: p, formatDuration: f } = require('../src/duration');

const bad = (x) => assert.throws(() => p(x), (e) => e instanceof TypeError && e.message === 'Invalid duration: ' + JSON.stringify(x));

test('parse: number input', () => {
  assert.equal(p(1.5), 2);
  assert.equal(p(-1.5), -2);
  assert.equal(p(-0.5), -1);
  assert.equal(p(0.4999), 0);
  assert.ok(Object.is(p(-0.2), 0));
  assert.ok(Object.is(p(-0), 0));
  for (const x of [NaN, Infinity, -Infinity, null, undefined, {}, [], true, false]) bad(x);
  assert.throws(() => p(undefined), { message: 'Invalid duration: undefined' });
});

test('parse: plain numbers', () => {
  assert.equal(p('1500'), 1500);
  assert.equal(p('1.5'), 2);
  assert.equal(p('-20'), -20);
  assert.equal(p('+7'), 7);
  assert.equal(p('-0.5'), -1);
  assert.equal(p('  0.5 '), 1);
  assert.ok(Object.is(p('-0'), 0));
  for (const x of ['.5', '5.', '1e3', '--5', '+-5', '1,5', '1_0', '', '   ', '-', '+', '1 000']) bad(x);
});

test('parse: unit form', () => {
  assert.equal(p('-1h30m'), -5400000);
  assert.equal(p('- 5s'), -5000);
  assert.equal(p('1h 30m'), 5400000);
  assert.equal(p('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(p('1W2D3H4M5S6MS'), 604800000 + 2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5000 + 6);
  assert.equal(p('1m'), 60000);
  assert.equal(p('1ms'), 1);
  assert.equal(p('1m 1ms'), 60001);
  assert.equal(p('1 wk 1 hr 1 min 1 sec 1 msec'), 604800000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(p('2wks'), 2 * 604800000);
  assert.equal(p('1 millisecond'), 1);
  assert.equal(p('1.5h'), 5400000);
  assert.equal(p('0.5ms'), 1);
  assert.equal(p('1.0005s'), 1001); // exact: 1000.5 -> 1001
  assert.equal(p('-1.0005s'), -1001);
  assert.equal(p('0.0004s'), 0);
  assert.equal(p('\t1h\n30m '), 5400000);
  for (const x of ['1h-30m', '30m1h', '1h1h', '1h 30', '30 1h', 'h', '1x', '1h30', '1hh', '1h,30m', '1h+30m',
    '1h/30m', '1 m s', '1.h', '.5h', '1e3s', '1ms1m', '1s1ms1ms', '1 hourz', 'toString', '1constructor', '1h 30m x', '1d 1w']) bad(x);
});

test('parse: ISO 8601', () => {
  assert.equal(p('PT1H30M'), 5400000);
  assert.equal(p('pt1h30m'), 5400000);
  assert.equal(p('PT0,5S'), 500);
  assert.equal(p('PT0.5S'), 500);
  assert.equal(p('PT1M'), 60000);
  assert.equal(p('P1W'), 604800000);
  assert.equal(p('P1.5W'), 907200000);
  assert.equal(p('-P1D'), -86400000);
  assert.equal(p('+P1DT1S'), 86401000);
  assert.equal(p('P1DT2H3M4S'), 86400000 + 7200000 + 180000 + 4000);
  assert.equal(p('P0D'), 0);
  assert.equal(p('PT0.0005S'), 1);
  for (const x of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1MT1S', 'P1W1D', 'P1WT1H', 'PT1S1M', 'P1H', 'PT1D', 'PT1H 30M',
    'P 1D', 'P1D T1H', 'PT.5S', 'PT5.S', 'P1DT1', 'PT1', 'P-1D', 'PT-1S', 'P1S']) bad(x);
});

test('format: basics', () => {
  assert.equal(f(0), '0ms');
  assert.equal(f(0, { style: 'long' }), '0 milliseconds');
  assert.equal(f(250), '250ms');
  assert.equal(f(1), '1ms');
  assert.equal(f(1, { style: 'long' }), '1 millisecond');
  assert.equal(f(5400000), '1h 30m');
  assert.equal(f(-5400000), '-1h 30m');
  assert.equal(f(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(f(2 * 86400000 + 5000), '2d 5s');
  assert.equal(f(9 * 86400000, { style: 'long' }), '1 week 2 days');
  assert.equal(f(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(f(1.5), '2ms');
  assert.equal(f(-1.5), '-2ms');
  assert.equal(f(-0.4), '0ms');
  assert.equal(f(-0.4, { style: 'long' }), '0 milliseconds');
  assert.equal(f(-0.5), '-1ms');
  assert.equal(f(100 * 604800000), '100w');
  assert.equal(f(1000, undefined), '1s');
  assert.equal(f(1000, {}), '1s');
  assert.equal(f(1000, { style: undefined, largest: undefined }), '1s');
});

test('format: errors', () => {
  for (const x of [NaN, Infinity, -Infinity, '1', null, undefined, {}, 1n]) {
    assert.throws(() => f(x), TypeError);
  }
  assert.throws(() => f(undefined), { message: 'Invalid duration: undefined' });
  for (const s of ['SHORT', 'medium', '', null, 1]) assert.throws(() => f(1, { style: s }), TypeError);
  for (const l of [0, -1, 1.5, NaN, Infinity, '2', null, true]) assert.throws(() => f(1, { largest: l }), TypeError);
});

test('format: largest', () => {
  const t = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(f(t, { largest: 2 }), '1w');
  assert.equal(f(t, { largest: 1 }), '1w');
  assert.equal(f(t, { largest: 3 }), '1w');
  assert.equal(f(t, { largest: 4 }), '6d 23h 59m 31s');
  assert.equal(f(t, { largest: 99 }), '6d 23h 59m 31s');
  assert.equal(f(5400000, { largest: 1 }), '2h'); // 1h30m: rem == half -> up
  assert.equal(f(5399999, { largest: 1 }), '1h');
  assert.equal(f(3600000 + 29 * 60000 + 59999, { largest: 1 }), '1h');
  assert.equal(f(-5400000, { largest: 1 }), '-2h');
  assert.equal(f(3600000 + 5000, { largest: 2 }), '1h');   // zero minute in between kept, then dropped
  assert.equal(f(3600000 + 5000, { largest: 3 }), '1h 5s');
  assert.equal(f(3600000 + 30000, { largest: 2 }), '1h 1m'); // 30s >= half minute
  assert.equal(f(3600000 + 29999, { largest: 2 }), '1h');
  assert.equal(f(86400000 - 1, { largest: 1 }), '1d');
  assert.equal(f(86400000 - 1, { largest: 2 }), '1d');
  assert.equal(f(23 * 3600000 + 59 * 60000 + 30000, { largest: 2 }), '1d');
  assert.equal(f(3599500, { largest: 2 }), '1h'); // 59m 59.5s -> 60m -> 1h
  assert.equal(f(1999, { largest: 1 }), '2s');
  assert.equal(f(1500, { largest: 1, style: 'long' }), '2 seconds');
  assert.equal(f(1499, { largest: 1, style: 'long' }), '1 second');
  assert.equal(f(1999, { largest: 2 }), '1s 999ms');
  assert.equal(f(0, { largest: 3 }), '0ms');
  assert.equal(f(86400000 * 7 + 3, { largest: 1 }), '1w');
  assert.equal(f(604800000 + 6 * 86400000 + 12 * 3600000, { largest: 2 }), '2w');
  assert.equal(f(86400000 + 3 * 3600000 + 59 * 60000, { largest: 2 }), '1d 4h');
});

test('round trip', () => {
  const xs = [0, 1, -1, 0.5, -0.5, 1.4, 999.5, 5400000, -5400000.5, 604800000 * 3 + 1, 1e12 + 0.5, 2 ** 53, -(2 ** 40) - 0.5, 1e21];
  for (const x of xs) assert.equal(p(f(x)), p(x), String(x));
  for (const x of xs) assert.equal(p(f(x, { style: 'long' })), p(x), String(x));
});
