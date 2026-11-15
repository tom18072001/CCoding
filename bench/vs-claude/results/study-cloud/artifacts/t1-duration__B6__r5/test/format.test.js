'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { formatDuration: f } = require('../src/format');

const D = 86400000, H = 3600000, M = 60000, S = 1000;

test('cơ bản short/long', () => {
  assert.strictEqual(f(0), '0ms');
  assert.strictEqual(f(0, { style: 'long' }), '0 milliseconds');
  assert.strictEqual(f(H + 30 * M), '1h 30m');
  assert.strictEqual(f(2 * D + 5 * S), '2d 5s');
  assert.strictEqual(f(250), '250ms');
  assert.strictEqual(f(H + 30 * M, { style: 'long' }), '1 hour 30 minutes');
  assert.strictEqual(f(15 * D, { style: 'long' }), '2 weeks 1 day');
});

test('số ít/nhiều', () => {
  assert.strictEqual(f(1, { style: 'long' }), '1 millisecond');
  assert.strictEqual(f(2, { style: 'long' }), '2 milliseconds');
  assert.strictEqual(f(S, { style: 'long' }), '1 second');
});

test('âm và làm tròn', () => {
  assert.strictEqual(f(-0.4), '0ms');
  assert.strictEqual(f(-0), '0ms');
  assert.strictEqual(f(-0.5), '-1ms');
  assert.strictEqual(f(0.5), '1ms');
  assert.strictEqual(f(1.5), '2ms');
  assert.strictEqual(f(-1500, { style: 'long' }), '-1 second 500 milliseconds');
  assert.strictEqual(f(-(H + 30 * M)), '-1h 30m');
});

test('largest', () => {
  assert.strictEqual(f(H + 30 * M, { largest: 1 }), '2h');
  assert.strictEqual(f(H + 29 * M, { largest: 1 }), '1h');
  assert.strictEqual(f(H + 30 * M, { largest: 5 }), '1h 30m');
  assert.strictEqual(f(D + 5 * S, { largest: 3 }), '1d'); // 0h 0m giữ, 5s làm tròn xuống
  assert.strictEqual(f(D + 5 * S, { largest: 5 }), '1d 5s');
  assert.strictEqual(f(D + 5 * S, { largest: 6 }), '1d 5s');
  assert.strictEqual(f(D + 30 * S, { largest: 3 }), '1d 1m'); // 30s -> +1m, 0h giữa
  assert.strictEqual(f(6 * D + 23 * H + 59 * M + 31 * S, { largest: 2 }), '1w');
  assert.strictEqual(f(59 * M + 59500, { largest: 2 }), '1h');
  assert.strictEqual(f(59 * M + 59500, { largest: 1 }), '1h');
  assert.strictEqual(f(23 * H + 59 * M + 59500, { largest: 3 }), '1d');
  assert.strictEqual(f(-(H + 30 * M), { largest: 1, style: 'long' }), '-2 hours');
  assert.strictEqual(f(0, { largest: 2 }), '0ms');
  assert.strictEqual(f(400, { largest: 1 }), '400ms');
  assert.strictEqual(f(1, { largest: 1 }), '1ms');
});

test('largest không hợp lệ', () => {
  for (const v of [0, 1.5, '2', NaN, -1, null, Infinity]) {
    assert.throws(() => f(1000, { largest: v }), TypeError, String(v));
  }
});

test('style sai', () => {
  assert.throws(() => f(1, { style: 'medium' }), TypeError);
  assert.throws(() => f(1, { style: 1 }), TypeError);
});

test('ms không hợp lệ', () => {
  assert.throws(() => f(NaN), { name: 'TypeError', message: 'Invalid duration: null' });
  assert.throws(() => f(Infinity), TypeError);
  assert.throws(() => f('1'), { message: 'Invalid duration: "1"' });
  assert.throws(() => f(undefined), { message: 'Invalid duration: undefined' });
});

test('roundtrip với parseDuration', (t) => {
  let parse;
  try { parse = require('../src/duration').parseDuration; } catch { /* chưa có */ }
  if (typeof parse !== 'function') return t.skip('parseDuration chưa có');
  for (const x of [0, 1, -1, 0.5, -0.5, 1500, -1500, 59999.5, H + 30 * M, 8 * D + 3, -123456789.4, 1e12]) {
    assert.strictEqual(parse(f(x)), parse(x), String(x));
    assert.strictEqual(parse(f(x, { style: 'long' })), parse(x), 'long ' + x);
  }
});
