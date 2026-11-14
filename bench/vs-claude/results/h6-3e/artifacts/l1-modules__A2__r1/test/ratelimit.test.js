import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenBucket, createSlidingWindow } from '../src/ratelimit/index.js';

const throwsCode = (fn, code) => assert.throws(fn, (e) => e.code === code);
const clock = () => { const c = { t: 0, now: () => c.t }; return c; };

test('tùy chọn và đầu vào', () => {
  const c = clock();
  throwsCode(() => createTokenBucket(), 'RL_INVALID_OPTIONS');
  throwsCode(() => createTokenBucket({ capacity: 0, now: c.now }), 'RL_INVALID_OPTIONS');
  throwsCode(() => createTokenBucket({ capacity: 1 }), 'RL_INVALID_OPTIONS');
  throwsCode(() => createTokenBucket({ capacity: 1, refillIntervalMs: 1.5, now: c.now }), 'RL_INVALID_OPTIONS');
  throwsCode(() => createSlidingWindow({ limit: 1, now: c.now }), 'RL_INVALID_OPTIONS');
  for (const rl of [createTokenBucket({ capacity: 2, now: c.now }), createSlidingWindow({ limit: 2, windowMs: 10, now: c.now })]) {
    throwsCode(() => rl.take(''), 'RL_INVALID_KEY');
    throwsCode(() => rl.take(5, 0), 'RL_INVALID_KEY');
    throwsCode(() => rl.take('k', 0), 'RL_INVALID_COST');
    throwsCode(() => rl.take('k', 1.5), 'RL_INVALID_COST');
    throwsCode(() => rl.peek('k', 3), 'RL_COST_EXCEEDS_CAPACITY');
    throwsCode(() => rl.take('k', 3), 'RL_COST_EXCEEDS_CAPACITY');
    assert.equal(rl.size(), 0);
    assert.equal(rl.take('k', 2).allowed, true);
  }
});

test('token bucket', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  assert.deepEqual(b.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 5 });
  assert.equal(b.size(), 0);
  assert.deepEqual([1, 2, 3, 4, 5].map(() => b.take('k').remaining), [4, 3, 2, 1, 0]);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 500;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 500, remaining: 0 });
  c.t = 1000;
  assert.equal(b.take('k').allowed, true);
  assert.equal(b.sweep(), 0);
  c.t = 100000;
  assert.equal(b.size(), 1);
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 0);
  assert.equal(b.reset('k'), false);
  b.take('k');
  assert.equal(b.reset('k'), true);
});

test('token bucket nạp lẻ và đồng hồ lùi', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  b.take('k', 6);
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
  c.t = 100;
  assert.equal(b.take('k').allowed, false);
  c.t = 667 + 667;
  assert.equal(b.take('k').allowed, true);
});

test('sliding window', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual([1, 2, 3].map(() => w.take('k').remaining), [2, 1, 0]);
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 999;
  assert.equal(w.take('k').retryAfterMs, 1);
  assert.deepEqual(w.peek('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.equal(w.take('k').allowed, true);
});

test('sliding window retryAfter theo sự kiện, sweep, reset', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 100, now: c.now });
  w.take('k', 2); c.t = 10; w.take('k', 2); c.t = 20; w.take('k', 1);
  c.t = 30;
  assert.equal(w.take('k', 3).retryAfterMs, 80);
  assert.equal(w.peek('k', 1).retryAfterMs, 70);
  assert.equal(w.peek('other').remaining, 5);
  assert.equal(w.size(), 1);
  c.t = 1000;
  assert.equal(w.size(), 1);
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 0);
  w.take('x');
  assert.equal(w.reset('x'), true);
  assert.equal(w.reset('x'), false);
});
