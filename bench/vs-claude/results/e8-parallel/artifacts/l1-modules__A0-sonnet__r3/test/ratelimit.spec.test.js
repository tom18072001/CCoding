import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenBucket, createSlidingWindow } from '../src/ratelimit/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('token bucket', () => {
  let t = 0;
  const b = createTokenBucket({ capacity: 5, now: () => t });
  assert.deepEqual([1, 2, 3, 4, 5].map(() => b.take('k').remaining), [4, 3, 2, 1, 0]);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  t = 999;
  assert.equal(b.take('k').retryAfterMs, 1);
  t = 1000;
  assert.equal(b.take('k').allowed, true);
  assert.equal(b.size(), 1);
  assert.equal(b.sweep(), 0);
  t = 100000;
  assert.equal(b.peek('k').remaining, 5);
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 0);
});

test('token bucket: nạp lẻ, đồng hồ lùi, peek, reset', () => {
  let t = 0;
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: () => t });
  b.take('k', 6);
  t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  t = 667;
  assert.equal(b.take('k').allowed, true);
  t = 500; // lùi: không đổi mốc
  assert.equal(b.peek('k').remaining, 0);
  t = 667 + 2000;
  assert.equal(b.peek('k', 3).allowed, true);
  assert.equal(b.peek('nope').remaining, 6);
  assert.equal(b.size(), 1);
  assert.equal(b.reset('k'), true);
  assert.equal(b.reset('k'), false);
});

test('lỗi đầu vào', () => {
  const now = () => 0;
  const b = createTokenBucket({ capacity: 2, now });
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now });
  for (const l of [b, w]) {
    assert.equal(code(() => l.take('')), 'RL_INVALID_KEY');
    assert.equal(code(() => l.take(1, 0)), 'RL_INVALID_KEY');
    assert.equal(code(() => l.take('k', 0)), 'RL_INVALID_COST');
    assert.equal(code(() => l.take('k', 1.5)), 'RL_INVALID_COST');
    assert.equal(code(() => l.take('k', 3)), 'RL_COST_EXCEEDS_CAPACITY');
    assert.equal(l.size(), 0);
    assert.equal(l.take('k', 2).allowed, true);
  }
  assert.equal(code(() => createTokenBucket()), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createTokenBucket({ capacity: 0, now })), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createTokenBucket({ capacity: 1 })), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createSlidingWindow({ limit: 1, windowMs: 1.5, now })), 'RL_INVALID_OPTIONS');
});

test('sliding window', () => {
  let t = 0;
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: () => t });
  assert.deepEqual([1, 2, 3].map(() => w.take('k').remaining), [2, 1, 0]);
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  t = 999;
  assert.equal(w.take('k').retryAfterMs, 1);
  assert.equal(w.peek('k').allowed, false);
  t = 1000;
  assert.equal(w.take('k').allowed, true);
});

test('sliding window: retry theo cộng dồn, sweep', () => {
  let t = 0;
  const w = createSlidingWindow({ limit: 5, windowMs: 100, now: () => t });
  w.take('k', 2); t = 10; w.take('k', 2); t = 20; w.take('k', 1);
  t = 30;
  assert.deepEqual(w.take('k', 3), { allowed: false, retryAfterMs: 80, remaining: 0 });
  assert.equal(w.take('k', 2).retryAfterMs, 70);
  assert.equal(w.take('other').allowed, true);
  t = 1000;
  assert.equal(w.size(), 2);
  assert.equal(w.sweep(), 2);
  assert.equal(w.size(), 0);
});
