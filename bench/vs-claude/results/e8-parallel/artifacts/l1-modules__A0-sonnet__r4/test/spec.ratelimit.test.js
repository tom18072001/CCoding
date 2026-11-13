import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenBucket, createSlidingWindow } from '../src/ratelimit/index.js';

const code = (fn, c) => assert.throws(fn, (e) => e.code === c);

test('tokenBucket: ví dụ đặc tả', () => {
  let t = 0;
  const b = createTokenBucket({ capacity: 5, now: () => t });
  assert.deepEqual([1, 2, 3, 4, 5].map(() => b.take('k').remaining), [4, 3, 2, 1, 0]);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  t = 1000;
  assert.equal(b.take('k').allowed, true);

  t = 0;
  const c = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: () => t });
  c.take('k', 6);
  assert.equal(c.take('k').retryAfterMs, 667);
  t = 666;
  assert.deepEqual(c.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  t = 667;
  assert.equal(c.take('k').allowed, true);
});

test('tokenBucket: remaining lẻ, peek, reset, sweep, đồng hồ lùi', () => {
  let t = 1000;
  const b = createTokenBucket({ capacity: 3, now: () => t });
  assert.equal(b.peek('x').remaining, 3);
  assert.equal(b.size(), 0);
  b.take('a', 3);
  t = 1500;
  assert.deepEqual(b.peek('a'), { allowed: false, retryAfterMs: 500, remaining: 0 });
  t = 900; // lùi
  assert.equal(b.take('a').retryAfterMs, 1000);
  t = 2000;
  assert.equal(b.peek('a', 1).remaining, 1);
  assert.equal(b.sweep(), 0);
  t = 10000;
  assert.equal(b.size(), 1);
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 0);
  b.take('z');
  assert.equal(b.reset('z'), true);
  assert.equal(b.reset('z'), false);
});

test('tokenBucket: lỗi', () => {
  const now = () => 0;
  code(() => createTokenBucket(), 'RL_INVALID_OPTIONS');
  code(() => createTokenBucket({ capacity: 1 }), 'RL_INVALID_OPTIONS');
  code(() => createTokenBucket({ capacity: 0, now }), 'RL_INVALID_OPTIONS');
  code(() => createTokenBucket({ capacity: 1, refillAmount: 1.5, now }), 'RL_INVALID_OPTIONS');
  const b = createTokenBucket({ capacity: 2, now });
  code(() => b.take(''), 'RL_INVALID_KEY');
  code(() => b.take(1, 0), 'RL_INVALID_KEY');
  code(() => b.take('k', 0), 'RL_INVALID_COST');
  code(() => b.take('k', 1.5), 'RL_INVALID_COST');
  code(() => b.take('k', 3), 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(b.size(), 0);
  assert.equal(b.take('k', 2).allowed, true);
});

test('slidingWindow', () => {
  let t = 0;
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: () => t });
  assert.deepEqual([1, 2, 3].map(() => w.take('k').remaining), [2, 1, 0]);
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  t = 999;
  assert.equal(w.take('k').retryAfterMs, 1);
  t = 1000;
  assert.equal(w.take('k').allowed, true);
  assert.equal(w.peek('k').remaining, 2);
});

test('slidingWindow: retryAfter theo sự kiện, sweep, lỗi', () => {
  let t = 0;
  const w = createSlidingWindow({ limit: 5, windowMs: 100, now: () => t });
  w.take('k', 2);
  t = 10;
  w.take('k', 2);
  t = 20;
  w.take('k', 1);
  // used 5; take 3 cần giải phóng 3: sự kiện t=0 (2) + t=10 (2) → chờ đến t=110
  assert.equal(w.take('k', 3).retryAfterMs, 90);
  assert.equal(w.take('k', 2).retryAfterMs, 80);
  assert.equal(w.peek('q').remaining, 5);
  assert.equal(w.size(), 1);
  t = 500;
  assert.equal(w.size(), 1);
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 0);
  code(() => w.take('k', 6), 'RL_COST_EXCEEDS_CAPACITY');
  code(() => w.take('k', -1), 'RL_INVALID_COST');
  code(() => createSlidingWindow({ limit: 1, windowMs: 0, now: () => 0 }), 'RL_INVALID_OPTIONS');
});
