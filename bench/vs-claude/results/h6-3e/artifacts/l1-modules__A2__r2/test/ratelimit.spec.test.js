import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenBucket, createSlidingWindow } from '../src/ratelimit/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return 'NO_ERROR'; };
const clock = () => { const c = { t: 0, now: () => c.t }; return c; };

test('tùy chọn và đầu vào', () => {
  const c = clock();
  assert.equal(code(() => createTokenBucket()), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createTokenBucket({ capacity: 0, now: c.now })), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createTokenBucket({ capacity: 1 })), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createSlidingWindow({ limit: 1.5, windowMs: 1, now: c.now })), 'RL_INVALID_OPTIONS');
  const b = createTokenBucket({ capacity: 3, now: c.now });
  assert.equal(code(() => b.take('')), 'RL_INVALID_KEY');
  assert.equal(code(() => b.take(1, 0)), 'RL_INVALID_KEY');
  assert.equal(code(() => b.take('k', 0)), 'RL_INVALID_COST');
  assert.equal(code(() => b.take('k', 1.5)), 'RL_INVALID_COST');
  assert.equal(code(() => b.take('k', 4)), 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(b.size(), 0);
  assert.equal(b.take('k', 3).allowed, true);
});

test('token bucket: nạp phân số', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).remaining, 0);
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
  c.t = 667 + 1334;
  assert.equal(b.peek('k').remaining, 2);
  assert.equal(b.peek('k', 2).allowed, true);
});

test('token bucket: peek, reset, sweep, đồng hồ lùi', () => {
  const c = clock();
  c.t = 1000;
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.deepEqual(b.peek('x'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(b.size(), 0);
  b.take('a', 2);
  c.t = 500;
  assert.equal(b.take('a').retryAfterMs, 1000);
  c.t = 2000;
  assert.equal(b.take('a').allowed, true);
  assert.equal(b.sweep(), 0);
  c.t = 10000;
  assert.equal(b.size(), 1);
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 0);
  assert.equal(b.reset('a'), false);
  b.take('a');
  assert.equal(b.reset('a'), true);
});

test('cửa sổ trượt', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual([1, 1, 1].map(() => w.take('k').remaining), [2, 1, 0]);
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 999;
  assert.equal(w.take('k').retryAfterMs, 1);
  assert.equal(w.peek('k').remaining, 0);
  c.t = 1000;
  assert.deepEqual(w.take('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
});

test('cửa sổ trượt: retryAfter theo cost và sweep', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 1000, now: c.now });
  w.take('k', 2);
  c.t = 100;
  w.take('k', 2);
  c.t = 200;
  assert.equal(w.take('k', 3).retryAfterMs, 800);
  assert.equal(w.take('k', 5).retryAfterMs, 900);
  assert.equal(code(() => w.take('k', 6)), 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(w.sweep(), 0);
  c.t = 5000;
  assert.equal(w.size(), 1);
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 0);
});
