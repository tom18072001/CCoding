import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenBucket, createSlidingWindow } from '../src/ratelimit/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const clock = () => { const c = { t: 0, now: () => c.t }; return c; };

test('token bucket: phân số và retryAfterMs', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  b.take('k', 6);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('token bucket: peek, reset, sweep, đồng hồ lùi, lỗi', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.equal(b.peek('x').remaining, 2);
  assert.equal(b.size(), 0);
  b.take('a', 2);
  c.t = 500;
  assert.equal(b.size(), 1);
  assert.equal(b.sweep(), 0);
  c.t = 400;
  assert.equal(b.peek('a').remaining, 0);
  c.t = 1000;
  assert.equal(b.peek('a').remaining, 1);
  c.t = 2000;
  assert.equal(b.sweep(), 1);
  assert.equal(b.reset('a'), false);
  b.take('a');
  assert.equal(b.reset('a'), true);
  assert.equal(code(() => b.take('')), 'RL_INVALID_KEY');
  assert.equal(code(() => b.take('a', 0)), 'RL_INVALID_COST');
  assert.equal(code(() => b.take('a', 3)), 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(b.size(), 0);
  assert.equal(code(() => createTokenBucket()), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createTokenBucket({ capacity: 0, now: c.now })), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createTokenBucket({ capacity: 1 })), 'RL_INVALID_OPTIONS');
});

test('sliding window', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual([1, 2, 3].map(() => w.take('k').remaining), [2, 1, 0]);
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 999;
  assert.equal(w.take('k').retryAfterMs, 1);
  c.t = 1000;
  assert.equal(w.take('k').allowed, true);
  assert.equal(w.peek('k').remaining, 2);
  c.t = 5000;
  assert.equal(w.size(), 1);
  assert.equal(w.sweep(), 1);
  assert.equal(code(() => w.take('k', 4)), 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(code(() => createSlidingWindow({ limit: 1, windowMs: 0, now: c.now })), 'RL_INVALID_OPTIONS');
});

test('sliding window: retryAfterMs theo cộng dồn', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 100, now: c.now });
  w.take('k', 1);
  c.t = 10;
  w.take('k', 1);
  c.t = 20;
  w.take('k', 3);
  c.t = 30;
  assert.deepEqual(w.take('k', 3), { allowed: false, retryAfterMs: 90, remaining: 0 });
});
