'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration: p, formatDuration: f } = require('../src/duration');

const bad = (x) => assert.throws(() => p(x), (e) => e instanceof TypeError && e.message === 'Invalid duration: ' + (x === undefined ? 'undefined' : JSON.stringify(x)));

test('parse: number', () => {
  assert.equal(p(1.5), 2);
  assert.equal(p(-1.5), -2);
  assert.equal(p(0.5), 1);
  assert.equal(p(-0.5), -1);
  assert.equal(p(1.4), 1);
  assert.ok(Object.is(p(-0), 0));
  assert.ok(Object.is(p(-0.4), 0));
  for (const x of [NaN, Infinity, -Infinity, null, undefined, {}, [], true]) bad(x);
});

test('parse: số thuần', () => {
  assert.equal(p('1500'), 1500);
  assert.equal(p('1.5'), 2);
  assert.equal(p('-20'), -20);
  assert.equal(p('+7'), 7);
  assert.equal(p(' 0.5 '), 1);
  assert.equal(p('-0.5'), -1);
  assert.ok(Object.is(p('-0'), 0));
  for (const x of ['.5', '5.', '1e3', '', '   ', '-', '+', '--5', '+-5', '1 000', '1,5']) bad(x);
});

test('parse: đơn vị', () => {
  assert.equal(p('1h30m'), 5400000);
  assert.equal(p('1H 30M'), 5400000);
  assert.equal(p('-1h30m'), -5400000);
  assert.equal(p('- 5s'), -5000);
  assert.equal(p('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(p('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(p('1.5h'), 5400000);
  assert.equal(p('1.0005s'), 1001);
  assert.equal(p('0.0005s'), 1);
  assert.equal(p('-0.0005s'), -1);
  assert.equal(p('1 wk'), 604800000);
  assert.equal(p('3 mins'), 180000);
  assert.equal(p('5 milliseconds'), 5);
  assert.equal(p('2 msecs'), 2);
  assert.equal(p('1m'), 60000);
  assert.equal(p('1m 1ms'), 60001);
  assert.ok(Object.is(p('-0s'), 0));
  for (const x of ['30m1h', '1h1h', '1h-30m', '1h 30', '30 1h', 'h', '1x', '1h!', '1hh', '1.h', '.5h', '1h,', '1m s', '1h+30m', '1ms1s', '1sec1ms1s', '1 d ay', 'abc'])
    bad(x);
});

test('parse: ISO 8601', () => {
  assert.equal(p('PT1H30M'), 5400000);
  assert.equal(p('pt1m'), 60000);
  assert.equal(p('P1W'), 604800000);
  assert.equal(p('P1DT1H'), 90000000);
  assert.equal(p('P2D'), 172800000);
  assert.equal(p('PT0,5S'), 500);
  assert.equal(p('PT0.5S'), 500);
  assert.equal(p('-PT1S'), -1000);
  assert.equal(p('+PT1S'), 1000);
  assert.equal(p('- PT1S'), -1000);
  assert.equal(p('P1.5D'), 129600000);
  for (const x of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1H1D', 'P1D1H', 'PT1S1M', 'P 1D', 'PT1 H', 'P1DT 1H', 'PT.5S', 'PT5.S', 'P1H', 'PT1D', 'PT1H1H'])
    bad(x);
});

test('parse: số lớn chính xác', () => {
  assert.equal(p('9007199254740993ms'), 9007199254740992);
  assert.equal(p('1000000000000000000000000ms'), 1e24);
});

test('format: cơ bản & dấu', () => {
  assert.equal(f(0), '0ms');
  assert.equal(f(0, { style: 'long' }), '0 milliseconds');
  assert.equal(f(-0.4), '0ms');
  assert.equal(f(0.5), '1ms');
  assert.equal(f(-0.5), '-1ms');
  assert.equal(f(-5400000), '-1h 30m');
  assert.equal(f(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(f(250), '250ms');
  assert.equal(f(86400000 * 2 + 5000), '2d 5s');
  assert.equal(f(604800000 * 2 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(f(1, { style: 'long' }), '1 millisecond');
  assert.equal(f(1000, { style: 'long' }), '1 second');
  assert.equal(f(604800000 * 100), '100w');
  assert.equal(f(1, null), '1ms');
});

test('format: largest', () => {
  const x = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(f(x, { largest: 2 }), '1w');
  assert.equal(f(x, { largest: 1 }), '1w');
  assert.equal(f(x), '6d 23h 59m 31s');
  assert.equal(f(x, { largest: 3 }), '1w');
  assert.equal(f(x, { largest: 4 }), '6d 23h 59m 31s');
  assert.equal(f(x, { largest: 99 }), '6d 23h 59m 31s');
  assert.equal(f(5400000, { largest: 1 }), '2h'); // 1h30m: nửa giờ -> làm tròn lên
  assert.equal(f(5399999, { largest: 1 }), '1h');
  assert.equal(f(3600000 + 29 * 60000, { largest: 1 }), '1h');
  assert.equal(f(3600000 + 5000, { largest: 2 }), '1h'); // giữ h, m=0 -> bỏ
  assert.equal(f(3600000 + 5000, { largest: 3 }), '1h 5s');
  assert.equal(f(3600000 + 5000, { largest: 2, style: 'long' }), '1 hour');
  assert.equal(f(86400000 + 1000, { largest: 2 }), '1d'); // d,h giữ; h=0
  assert.equal(f(86400000 + 59 * 60000 + 30000, { largest: 2 }), '1d 1h');
  assert.equal(f(86400000 + 23 * 3600000 + 59 * 60000 + 30000, { largest: 2 }), '2d');
  assert.equal(f(-x, { largest: 2 }), '-1w');
  assert.equal(f(1, { largest: 5 }), '1ms');
  assert.equal(f(0, { largest: 1 }), '0ms');
  assert.equal(f(999.4, { largest: 1 }), '999ms');
  assert.equal(f(1500, { largest: 1 }), '2s');
  assert.equal(f(60000 - 500, { largest: 1 }), '1m');
  assert.equal(f(1999, { largest: 1, style: 'long' }), '2 seconds');
});

test('format: lỗi', () => {
  for (const x of [NaN, Infinity, '1', null, undefined, {}])
    assert.throws(() => f(x), TypeError);
  for (const s of ['medium', 'LONG', null, 1]) assert.throws(() => f(1, { style: s }), TypeError);
  for (const l of [0, -1, 1.5, '2', null, NaN, Infinity]) assert.throws(() => f(1, { largest: l }), TypeError);
  assert.equal(f(1, { style: undefined, largest: undefined }), '1ms');
});

test('tính chất round-trip', () => {
  const xs = [0, 1, -1, 0.5, -0.5, 1.5, 999.5, 59999.5, 86399999.5, 1e9 + 0.4, -123456789.5, 1e15, 2 ** 53, 1e21, 1e300, -7.3e22];
  for (let i = 0; i < 300; i++) xs.push((Math.random() - 0.5) * 10 ** (Math.random() * 14));
  for (const x of xs) {
    assert.equal(p(f(x)), p(x), String(x));
    assert.equal(p(f(x, { style: 'long' })), p(x), String(x));
  }
});
