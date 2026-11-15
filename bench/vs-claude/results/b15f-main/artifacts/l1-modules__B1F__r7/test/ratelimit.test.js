import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenBucket, createSlidingWindow } from '../src/ratelimit/index.js';

function clock(start = 0) {
  const c = { t: start, now: () => c.t };
  return c;
}

test('token bucket: cạn rồi từ chối kèm retryAfterMs', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  const rem = [];
  for (let i = 0; i < 5; i++) rem.push(b.take('k').remaining);
  assert.deepEqual(rem, [4, 3, 2, 1, 0]);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
});

test('token bucket: nạp lại theo thời gian', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 1, now: c.now });
  assert.equal(b.take('k').allowed, true);
  c.t = 999;
  assert.equal(b.take('k').retryAfterMs, 1);
  c.t = 1000;
  assert.equal(b.take('k').allowed, true);
});

test('cửa sổ trượt: hết hiệu lực đúng tại t + windowMs', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  for (let i = 0; i < 3; i++) assert.equal(w.take('k').allowed, true);
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 1000;
  assert.equal(w.take('k').allowed, true);
});

test('dọn khóa hết hạn', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 1, windowMs: 100, now: c.now });
  w.take('a');
  assert.equal(w.size(), 1);
  c.t = 100;
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 0);
});

test('lỗi có mã', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.throws(() => b.take('k', 3), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
  assert.throws(() => b.take(''), (e) => e.code === 'RL_INVALID_KEY');
});

const code = (c) => (e) => e.code === c;

test('token bucket: nạp phần lẻ, 3 token / 2000ms', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).remaining, 0);
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('token bucket: không vượt capacity, remaining là floor', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, refillAmount: 1, refillIntervalMs: 1000, now: c.now });
  b.take('k', 3);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 1);
  c.t = 1e7;
  assert.equal(b.peek('k').remaining, 3);
});

test('token bucket: đồng hồ lùi giữ mốc cũ', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 500;
  assert.equal(b.take('k').allowed, false);
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
});

test('token bucket: peek không tạo khóa, reset, sweep, tách khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.deepEqual(b.peek('x'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(b.size(), 0);
  b.take('a', 2);
  b.take('b');
  assert.equal(b.take('a').allowed, false);
  assert.equal(b.peek('b').remaining, 1);
  assert.equal(b.size(), 2);
  c.t = 1000;
  assert.equal(b.sweep(), 1); // b đã đầy lại
  assert.equal(b.size(), 1);
  assert.equal(b.reset('a'), true);
  assert.equal(b.reset('a'), false);
});

test('token bucket: cost == capacity hợp lệ, thứ tự kiểm lỗi, tùy chọn sai', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.equal(b.take('k', 2).allowed, true);
  assert.throws(() => b.take(1, 'x'), code('RL_INVALID_KEY'));
  assert.throws(() => b.take('k', 0), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', 1.5), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', 99), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.throws(() => b.peek('k', 99), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(b.size(), 1);
  assert.throws(() => createTokenBucket(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 0, now: c.now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillAmount: 1.5, now: c.now }), code('RL_INVALID_OPTIONS'));
});

test('cửa sổ trượt: retryAfterMs theo sự kiện cũ, biên 999/1000', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  w.take('k'); // t=0
  c.t = 400;
  w.take('k', 2); // t=400
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 600, remaining: 0 });
  assert.equal(w.peek('k', 3).retryAfterMs, 1000 + 400 - 400);
  c.t = 999;
  assert.equal(w.take('k').retryAfterMs, 1);
  c.t = 1000;
  assert.deepEqual(w.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('cửa sổ trượt: peek, reset, sweep, tách khóa, lỗi', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  assert.deepEqual(w.peek('x'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(w.size(), 0);
  w.take('a', 2);
  assert.equal(w.take('b').remaining, 1);
  assert.equal(w.take('a').allowed, false);
  assert.equal(w.reset('b'), true);
  assert.equal(w.reset('b'), false);
  c.t = 100;
  assert.equal(w.sweep(), 1);
  assert.throws(() => w.take(''), code('RL_INVALID_KEY'));
  assert.throws(() => w.take('a', -1), code('RL_INVALID_COST'));
  assert.throws(() => w.take('a', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.throws(() => createSlidingWindow({ limit: 1, now: c.now }), code('RL_INVALID_OPTIONS'));
});
