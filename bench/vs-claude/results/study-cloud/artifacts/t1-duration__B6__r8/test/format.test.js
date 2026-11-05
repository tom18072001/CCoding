'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDuration: f } = require('../src/format-duration');

const H = 3600000, M = 60000, D = 86400000, W = 604800000;

test('cơ bản và số 0', () => {
  assert.equal(f(0), '0ms');
  assert.equal(f(0, { style: 'long' }), '0 milliseconds');
  assert.equal(f(-0), '0ms');
  assert.equal(f(250), '250ms');
  assert.equal(f(2 * D + 5000), '2d 5s');
  assert.equal(f(H + 30 * M, { style: 'long' }), '1 hour 30 minutes');
  assert.equal(f(2 * W + D, { style: 'long' }), '2 weeks 1 day');
  assert.equal(f(1, { style: 'long' }), '1 millisecond');
  assert.equal(f(1001, { style: 'long' }), '1 second 1 millisecond');
  assert.equal(f(100 * W), '100w');
});

test('làm tròn và dấu', () => {
  assert.equal(f(0.5), '1ms');
  assert.equal(f(-0.5), '-1ms');
  assert.equal(f(0.4), '0ms');
  assert.equal(f(-0.4), '0ms');
  assert.equal(f(-0.4, { style: 'long' }), '0 milliseconds');
  assert.equal(f(1.5), '2ms');
  assert.equal(f(-1.5), '-2ms');
  assert.equal(f(-(H + 30 * M)), '-1h 30m');
  assert.equal(f(-(H + 30 * M), { style: 'long' }), '-1 hour 30 minutes');
});

test('largest', () => {
  const x = 6 * D + 23 * H + 59 * M + 31000;
  assert.equal(f(x, { largest: 2 }), '1w');
  assert.equal(f(x, { largest: 1 }), '1w');
  assert.equal(f(x), '6d 23h 59m 31s');
  assert.equal(f(H + 30 * M, { largest: 1 }), '2h');
  assert.equal(f(H + 29 * M + 59999, { largest: 1 }), '1h');
  assert.equal(f(2 * D + 5000, { largest: 2 }), '2d');
  assert.equal(f(2 * D + 5000, { largest: 3 }), '2d');
  assert.equal(f(2 * D + 5000, { largest: 5 }), '2d 5s');
  assert.equal(f(2 * D + 5000, { largest: 100 }), '2d 5s');
  assert.equal(f(H + 59 * M + 31000, { largest: 2 }), '2h');
  assert.equal(f(23 * H + 59 * M + 31000, { largest: 2 }), '1d');
  assert.equal(f(-(H + 30 * M), { largest: 1, style: 'long' }), '-2 hours');
  assert.equal(f(0, { largest: 1 }), '0ms');
  assert.equal(f(400, { largest: 1 }), '400ms');
  assert.equal(f(999, { largest: 1 }), '999ms');
  assert.equal(f(1499, { largest: 1 }), '1s');
  assert.equal(f(1500, { largest: 1 }), '2s');
});

test('lỗi', () => {
  const bad = (v, msg) =>
    assert.throws(() => f(v), (e) => e instanceof TypeError && e.message === msg);
  bad(NaN, 'Invalid duration: null');
  bad(Infinity, 'Invalid duration: null');
  bad(undefined, 'Invalid duration: undefined');
  bad('5', 'Invalid duration: "5"');
  bad(null, 'Invalid duration: null');
  bad({}, 'Invalid duration: {}');
  for (const s of ['SHORT', 'x', null, 1]) assert.throws(() => f(1, { style: s }), TypeError);
  for (const l of [0, -1, 1.5, '2', NaN, Infinity, null]) {
    assert.throws(() => f(1, { largest: l }), TypeError);
  }
  assert.equal(f(1, { style: undefined, largest: undefined }), '1ms');
});

test('round-trip với parseDuration', () => {
  const { parseDuration: p } = require('../src/duration');
  for (const x of [0, 1, 0.5, -0.5, 1.5, 999, 5400000, -5400000, 123456789, W * 3 + 7, -98765.4]) {
    assert.equal(p(f(x)), p(x));
    assert.equal(p(f(x, { style: 'long' })), p(x));
  }
});
