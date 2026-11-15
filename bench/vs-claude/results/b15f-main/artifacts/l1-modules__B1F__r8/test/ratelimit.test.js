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

test('bucket: nạp phân số 3/2000ms, 667ms', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).allowed, true);
  assert.equal(b.take('k').retryAfterMs, 667);
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.equal(b.take('k').allowed, true);
});

test('bucket: không vượt capacity, peek không tạo khóa, reset, sweep', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  assert.deepEqual(b.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 3 });
  assert.equal(b.size(), 0);
  b.take('k', 3);
  assert.equal(b.peek('k').remaining, 0);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 1);
  assert.equal(b.sweep(), 0);
  c.t = 100000;
  assert.equal(b.peek('k').remaining, 3);
  assert.equal(b.sweep(), 1);
  assert.equal(b.reset('k'), false);
  b.take('x');
  assert.equal(b.reset('x'), true);
});

test('bucket: đồng hồ lùi giữ mốc cũ; khóa độc lập', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('a', 2);
  c.t = 500;
  assert.equal(b.take('a').allowed, false);
  c.t = 2000;
  assert.equal(b.take('a').allowed, true);
  assert.equal(b.take('b', 2).allowed, true);
});

test('bucket: kiểm tra đầu vào và tùy chọn', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  const code = (c2) => (e) => e.code === c2;
  assert.throws(() => b.take(5, 'x'), code('RL_INVALID_KEY'));
  assert.throws(() => b.take('k', 0), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', 1.5), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(b.size(), 0);
  assert.throws(() => createTokenBucket(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 0, now: c.now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillAmount: 0, now: c.now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 0, now: c.now }), code('RL_INVALID_OPTIONS'));
});

test('cửa sổ trượt: retryAfterMs theo sự kiện, biên 999/1000', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  w.take('k');
  c.t = 400;
  w.take('k', 2);
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 600, remaining: 0 });
  assert.equal(w.take('k', 3).retryAfterMs, 1000);
  c.t = 999;
  assert.equal(w.take('k').retryAfterMs, 1);
  c.t = 1000;
  assert.deepEqual(w.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 1 });
  assert.equal(w.take('k').remaining, 0);
});

test('cửa sổ trượt: peek không tạo khóa, reset, lỗi', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now: c.now });
  assert.equal(w.peek('k').remaining, 2);
  assert.equal(w.size(), 0);
  assert.throws(() => w.take('k', 3), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(w.size(), 0);
  w.take('k');
  assert.equal(w.reset('k'), true);
  assert.equal(w.reset('k'), false);
});
