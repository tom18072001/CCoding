import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenBucket, createSlidingWindow } from '../src/ratelimit/index.js';

const code = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return null;
};

test('token bucket: ví dụ spec', () => {
  let t = 0;
  const b = createTokenBucket({ capacity: 5, now: () => t });
  assert.deepEqual([1, 2, 3, 4, 5].map(() => b.take('k').remaining), [4, 3, 2, 1, 0]);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  const b2 = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: () => t });
  b2.take('k', 6);
  assert.equal(b2.take('k').retryAfterMs, 667);
  t = 666;
  assert.deepEqual(b2.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  t = 667;
  assert.equal(b2.take('k').allowed, true);
});

test('token bucket: peek, reset, sweep, đồng hồ lùi, lỗi', () => {
  let t = 1000;
  const b = createTokenBucket({ capacity: 2, now: () => t });
  assert.equal(b.peek('x').remaining, 2);
  assert.equal(b.size(), 0);
  b.take('x', 2);
  t = 500; // lùi
  assert.equal(b.take('x').allowed, false);
  t = 2000; // mốc cũ 1000 được giữ → đã nạp 1 token
  assert.deepEqual(b.take('x'), { allowed: true, retryAfterMs: 0, remaining: 0 });
  assert.equal(b.sweep(), 0);
  t = 10000;
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 0);
  b.take('y');
  assert.equal(b.reset('y'), true);
  assert.equal(b.reset('y'), false);
  assert.equal(code(() => b.take('')), 'RL_INVALID_KEY');
  assert.equal(code(() => b.take(1, 0)), 'RL_INVALID_KEY');
  assert.equal(code(() => b.take('a', 0)), 'RL_INVALID_COST');
  assert.equal(code(() => b.take('a', 1.5)), 'RL_INVALID_COST');
  assert.equal(code(() => b.take('a', 3)), 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(b.size(), 0);
  assert.equal(code(() => createTokenBucket()), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createTokenBucket({ capacity: 0, now: () => 0 })), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createTokenBucket({ capacity: 1 })), 'RL_INVALID_OPTIONS');
});

test('cửa sổ trượt: ví dụ spec và retryAfter theo sự kiện', () => {
  let t = 0;
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: () => t });
  assert.deepEqual([1, 2, 3].map(() => w.take('k').remaining), [2, 1, 0]);
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  t = 999;
  assert.equal(w.take('k').retryAfterMs, 1);
  assert.equal(w.peek('k').allowed, false);
  t = 1000;
  assert.equal(w.take('k').allowed, true);

  t = 0;
  const v = createSlidingWindow({ limit: 5, windowMs: 100, now: () => t });
  v.take('k', 2);
  t = 30;
  v.take('k', 3);
  t = 40;
  assert.equal(v.take('k', 2).retryAfterMs, 60); // cần giải phóng 2: sự kiện đầu
  assert.equal(v.take('k', 5).retryAfterMs, 90); // cần giải phóng 5: cả hai
  assert.equal(v.peek('k').remaining, 0);
  t = 500;
  assert.equal(v.sweep(), 1);
  assert.equal(v.size(), 0);
  assert.equal(code(() => v.take('k', 6)), 'RL_COST_EXCEEDS_CAPACITY');
});
