'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { formatDuration: f } = require('../src/format');

const H = 3600000, M = 60000, D = 86400000, W = 604800000;

test('cơ bản short/long', () => {
  assert.strictEqual(f(0), '0ms');
  assert.strictEqual(f(0, { style: 'long' }), '0 milliseconds');
  assert.strictEqual(f(H + 30 * M), '1h 30m');
  assert.strictEqual(f(H + 30 * M, { style: 'long' }), '1 hour 30 minutes');
  assert.strictEqual(f(2 * D + 5000), '2d 5s');
  assert.strictEqual(f(250), '250ms');
  assert.strictEqual(f(2 * W + D, { style: 'long' }), '2 weeks 1 day');
  assert.strictEqual(f(1, { style: 'long' }), '1 millisecond');
  assert.strictEqual(f(H, null), '1h');
});

test('âm và làm tròn ms', () => {
  assert.strictEqual(f(-(H + 30 * M)), '-1h 30m');
  assert.strictEqual(f(-(H + 30 * M), { style: 'long' }), '-1 hour 30 minutes');
  assert.strictEqual(f(0.5), '1ms');
  assert.strictEqual(f(-0.5), '-1ms');
  assert.strictEqual(f(1.4), '1ms');
  assert.strictEqual(f(-0.4), '0ms');
  assert.strictEqual(f(-0), '0ms');
  assert.strictEqual(f(-0.4, { style: 'long' }), '0 milliseconds');
});

test('lỗi ms', () => {
  for (const v of [NaN, Infinity, -Infinity, '5', null, {}, true, [1]]) {
    assert.throws(() => f(v), {
      name: 'TypeError',
      message: 'Invalid duration: ' + JSON.stringify(v),
    });
  }
  assert.throws(() => f(undefined), { name: 'TypeError', message: 'Invalid duration: undefined' });
  assert.throws(() => f(), { name: 'TypeError', message: 'Invalid duration: undefined' });
});

test('lỗi options', () => {
  assert.throws(() => f(1, { style: 'x' }), TypeError);
  assert.throws(() => f(1, { style: null }), TypeError);
  assert.throws(() => f(1, { style: 'LONG' }), TypeError);
  for (const l of [null, 0, 1.5, '2', NaN, -1, Infinity]) {
    assert.throws(() => f(1, { largest: l }), TypeError, String(l));
  }
  assert.strictEqual(f(H, { largest: undefined }), '1h');
});

test('largest', () => {
  assert.strictEqual(f(H + 30 * M + 31000, { largest: 1 }), '2h');
  assert.strictEqual(f(H + 29 * M + 59000, { largest: 1 }), '1h');
  assert.strictEqual(f(H + 30 * M, { largest: 1 }), '2h');
  assert.strictEqual(f(6 * D + 23 * H + 59 * M + 31000, { largest: 2 }), '1w');
  assert.strictEqual(f(6 * D + 23 * H + 59 * M + 31000, { largest: 2, style: 'long' }), '1 week');
  assert.strictEqual(f(D + 5000, { largest: 3 }), '1d');
  assert.strictEqual(f(D + 5000, { largest: 4 }), '1d 5s');
  assert.strictEqual(f(D + 5000, { largest: 5 }), '1d 5s');
  assert.strictEqual(f(D + 29 * M, { largest: 2 }), '1d');
  assert.strictEqual(f(D + 30 * M, { largest: 2 }), '1d 1h');
  assert.strictEqual(f(H + 59 * M + 30000, { largest: 2 }), '2h');
  assert.strictEqual(f(1500, { largest: 1 }), '2s');
  assert.strictEqual(f(1499, { largest: 1 }), '1s');
  assert.strictEqual(f(500, { largest: 1 }), '500ms');
  assert.strictEqual(f(5, { largest: 3 }), '5ms');
  assert.strictEqual(f(0, { largest: 1 }), '0ms');
  assert.strictEqual(f(-(H + 30 * M), { largest: 1 }), '-2h');
  assert.strictEqual(f(2 * W + 3 * D + 12 * H, { largest: 2 }), '2w 4d');
  assert.strictEqual(f(W + 3 * H, { largest: 3, style: 'long' }), '1 week 3 hours');
});

test('giá trị rất lớn', () => {
  assert.strictEqual(f(W * 1e6), '1000000w');
  assert.strictEqual(typeof f(Number.MAX_VALUE), 'string');
});

test('round-trip với parse (nếu có)', (t) => {
  let parse;
  try { parse = require('../src/parse'); } catch (e) { return t.skip('chưa có src/parse.js'); }
  const fn = parse.parseDuration;
  if (typeof fn !== 'function') return t.skip('parse không export parseDuration');
  for (const x of [0, 1, -1, 0.5, -0.5, 999, 1000, 90 * M, -(D + 5), 6 * D + 23 * H, W * 3 + 7]) {
    assert.strictEqual(fn(f(x)), fn(x));
  }
});
