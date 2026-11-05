import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenBucket, createSlidingWindow } from '../src/ratelimit/index.js';

const code = (c) => (e) => e.code === c;
function clock(start = 0) {
  const c = { t: start, now: () => c.t };
  return c;
}

test('options sai', () => {
  assert.throws(() => createTokenBucket(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 5 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 0, now: () => 0 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1.5, now: () => 0 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillAmount: 0, now: () => 0 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillIntervalMs: -1, now: () => 0 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 0, windowMs: 1, now: () => 0 }), code('RL_INVALID_OPTIONS'));
});

test('kiểm tra key, cost', () => {
  const c = clock();
  for (const make of [
    () => createTokenBucket({ capacity: 3, now: c.now }),
    () => createSlidingWindow({ limit: 3, windowMs: 100, now: c.now }),
  ]) {
    const l = make();
    for (const k of ['', 5, null, undefined]) {
      assert.throws(() => l.take(k), code('RL_INVALID_KEY'));
      assert.throws(() => l.peek(k), code('RL_INVALID_KEY'));
    }
    assert.throws(() => l.take('', 0), code('RL_INVALID_KEY'));
    for (const cost of [0, -1, 1.5, '1', null, NaN]) assert.throws(() => l.take('k', cost), code('RL_INVALID_COST'));
    assert.throws(() => l.take('k', 4), code('RL_COST_EXCEEDS_CAPACITY'));
    assert.throws(() => l.peek('k', 4), code('RL_COST_EXCEEDS_CAPACITY'));
    assert.equal(l.size(), 0);
    assert.equal(l.take('k', 3).allowed, true);
  }
});

test('token bucket: ví dụ refill 3/2000ms', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).remaining, 0);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('token bucket: remaining là floor, peek không tiêu, không tạo khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  assert.deepEqual(b.peek('x'), { allowed: true, retryAfterMs: 0, remaining: 5 });
  assert.equal(b.size(), 0);
  b.take('k', 5);
  c.t = 1500;
  assert.deepEqual(b.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 1 });
  assert.deepEqual(b.peek('k', 3), { allowed: false, retryAfterMs: 1500, remaining: 1 });
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
  // còn 0,5 token
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 500, remaining: 0 });
});

test('token bucket: không vượt capacity, khóa độc lập, từ chối không tiêu', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('a', 2);
  assert.equal(b.take('b').remaining, 1);
  c.t = 1e9;
  assert.equal(b.peek('a').remaining, 2);
  b.take('a', 2);
  assert.equal(b.take('a', 2).allowed, false);
  assert.equal(b.take('a', 2).retryAfterMs, 2000);
});

test('token bucket: đồng hồ lùi giữ mốc cũ', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 500; // lùi
  assert.equal(b.take('k').allowed, false);
  c.t = 1999; // mốc cũ 1000: mới trôi 999ms
  assert.equal(b.take('k').allowed, false);
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
});

test('token bucket: reset, sweep, size', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('a');
  b.take('b', 2);
  assert.equal(b.size(), 2);
  assert.equal(b.sweep(), 0);
  c.t = 1000;
  assert.equal(b.sweep(), 1); // a đầy lại
  assert.equal(b.size(), 1);
  assert.equal(b.reset('b'), true);
  assert.equal(b.reset('b'), false);
  assert.equal(b.size(), 0);
  assert.throws(() => b.reset(''), code('RL_INVALID_KEY'));
});

test('sliding window: ví dụ đặc tả', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual([w.take('k').remaining, w.take('k').remaining, w.take('k').remaining], [2, 1, 0]);
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.equal(w.take('k').allowed, true);
});

test('sliding window: retryAfter theo cost, peek, sweep', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 100, now: c.now });
  w.take('k', 2); // t=0
  c.t = 30;
  w.take('k', 2); // t=30
  c.t = 50;
  assert.deepEqual(w.take('k', 3), { allowed: false, retryAfterMs: 50, remaining: 1 }); // cần giải phóng 1 -> sự kiện t=0
  assert.deepEqual(w.take('k', 5), { allowed: false, retryAfterMs: 80, remaining: 1 }); // cần 4 -> cả hai, t=30
  assert.deepEqual(w.peek('k', 1), { allowed: true, retryAfterMs: 0, remaining: 1 });
  assert.equal(w.take('k', 1).remaining, 0);
  c.t = 100;
  assert.equal(w.peek('k').remaining, 2);
  assert.equal(w.peek('zz').remaining, 5);
  assert.equal(w.size(), 1);
  c.t = 1000;
  assert.equal(w.size(), 1);
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 0);
  assert.equal(w.reset('k'), false);
});
