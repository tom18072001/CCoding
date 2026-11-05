'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDuration: f } = require('../src/format');

const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H, W = 7 * D;

test('không / làm tròn / dấu', () => {
  assert.equal(f(0), '0ms');
  assert.equal(f(-0), '0ms');
  assert.equal(f(0.5), '1ms');
  assert.equal(f(-0.5), '-1ms');
  assert.equal(f(0.4), '0ms');
  assert.equal(f(-0.4), '0ms');
  assert.equal(f(-0.4, { style: 'long' }), '0 milliseconds');
  assert.equal(f(1.5), '2ms');
  assert.equal(f(-1.5), '-2ms');
  assert.equal(f(-5400000), '-1h 30m');
  assert.equal(f(-5400000, { style: 'long' }), '-1 hour 30 minutes');
});

test('biên đơn vị', () => {
  assert.equal(f(59999), '59s 999ms');
  assert.equal(f(60 * S), '1m');
  assert.equal(f(H), '1h');
  assert.equal(f(D), '1d');
  assert.equal(f(W), '1w');
  assert.equal(f(2 * W + D, { style: 'long' }), '2 weeks 1 day');
  assert.equal(f(2 * D + 5 * S), '2d 5s');
  assert.equal(f(250), '250ms');
  assert.equal(f(1, { style: 'long' }), '1 millisecond');
  assert.equal(f(S, { style: 'long' }), '1 second');
  assert.equal(f(2 * S, { style: 'long' }), '2 seconds');
});

test('largest', () => {
  const x = W + 2 * D + 3 * H + 4 * M + 5 * S + 6;
  assert.equal(f(x, { largest: 1 }), '1w');
  assert.equal(f(x, { largest: 2 }), '1w 2d');
  assert.equal(f(x, { largest: 3 }), '1w 2d 3h');
  assert.equal(f(x, { largest: 4 }), '1w 2d 3h 4m');
  assert.equal(f(x, { largest: 5 }), '1w 2d 3h 4m 5s');
  assert.equal(f(x, { largest: 6 }), '1w 2d 3h 4m 5s 6ms');
  assert.equal(f(x, { largest: 99 }), '1w 2d 3h 4m 5s 6ms');
  assert.equal(f(x, { largest: undefined }), '1w 2d 3h 4m 5s 6ms');
  assert.equal(f(x, { largest: 2, style: 'long' }), '1 week 2 days');
  assert.equal(f(-x, { largest: 2 }), '-1w 2d');
});

test('largest: 0 giữa, làm tròn, nhớ', () => {
  assert.equal(f(D + 5 * M, { largest: 3 }), '1d 5m');
  assert.equal(f(D + 5 * M, { largest: 2 }), '1d');
  assert.equal(f(D + 30 * M, { largest: 2 }), '1d 1h');
  assert.equal(f(D + 29 * M, { largest: 2 }), '1d');
  assert.equal(f(D + 12 * H, { largest: 1 }), '2d');
  assert.equal(f(D + 12 * H - 1, { largest: 1 }), '1d');
  assert.equal(f(12 * H, { largest: 1 }), '12h');
  assert.equal(f(6 * D + 23 * H + 59 * M + 31 * S, { largest: 2 }), '1w');
  assert.equal(f(23 * H + 59 * M + 30 * S, { largest: 2 }), '1d');
  assert.equal(f(59 * M + 59 * S + 500, { largest: 2 }), '1h');
  assert.equal(f(59 * S + 500, { largest: 1 }), '1m');
  assert.equal(f(999, { largest: 1 }), '999ms');
  assert.equal(f(1500, { largest: 1 }), '2s');
  assert.equal(f(-1500, { largest: 1 }), '-2s');
  assert.equal(f(0, { largest: 2 }), '0ms');
  assert.equal(f(W - 1, { largest: 3 }), '1w');
});

test('lỗi', () => {
  for (const v of [undefined, null, '1', NaN, Infinity, -Infinity, {}, true]) {
    assert.throws(() => f(v), (e) => e instanceof TypeError && e.message === 'Invalid duration: ' + JSON.stringify(v));
  }
  assert.throws(() => f(1, { style: 'x' }), TypeError);
  assert.throws(() => f(1, { style: null }), TypeError);
  for (const l of [0, 1.5, '2', NaN, -1, null, Infinity]) {
    assert.throws(() => f(1, { largest: l }), TypeError);
  }
});

test('MAX_SAFE_INTEGER', () => {
  const s = f(Number.MAX_SAFE_INTEGER);
  assert.equal(s, '14892855w 6d 8h 59m 991ms');
  assert.equal(f(-Number.MAX_SAFE_INTEGER)[0], '-');
  assert.ok(f(Number.MAX_SAFE_INTEGER, { largest: 2 }).length > 0);
});

test('property: parse(format(x)) === parse(x)', () => {
  const { parseDuration } = require('../src/duration');
  const xs = [0, -0, 0.5, -0.5, 1.5, -1.5, 999, 1000, 59999, 60000, 3599999, W - 1, W, -W - 1, 123456789, -987654321.5, 1e12, Number.MAX_SAFE_INTEGER];
  for (let i = 0; i < 200; i++) xs.push(Math.round((Math.random() - 0.5) * 2e10) / 3);
  for (const x of xs) {
    for (const style of ['short', 'long']) {
      assert.equal(parseDuration(f(x, { style })), parseDuration(x), String(x));
    }
  }
});
