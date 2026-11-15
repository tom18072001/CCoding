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

test('bucket: nạp lẻ 3/2000ms cần 667ms', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).allowed, true);
  assert.equal(b.take('k').retryAfterMs, 667);
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.equal(b.take('k').allowed, true);
});

test('bucket: đồng hồ lùi giữ mốc, peek không tạo khóa, reset, sweep', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.equal(b.peek('k').remaining, 2);
  assert.equal(b.size(), 0);
  b.take('k', 2);
  c.t = 500;
  assert.equal(b.take('k').allowed, false);
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
  assert.equal(b.sweep(), 0);
  c.t = 10000;
  assert.equal(b.sweep(), 1);
  b.take('x');
  assert.equal(b.reset('x'), true);
  assert.equal(b.reset('x'), false);
});

test('thứ tự kiểm tra và tùy chọn sai', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.throws(() => b.take('', 0), (e) => e.code === 'RL_INVALID_KEY');
  assert.throws(() => b.take('k', 1.5), (e) => e.code === 'RL_INVALID_COST');
  assert.throws(() => b.take('k', 0), (e) => e.code === 'RL_INVALID_COST');
  assert.equal(b.take('k', 2).allowed, true);
  assert.equal(b.size(), 1);
  assert.throws(() => createTokenBucket(), (e) => e.code === 'RL_INVALID_OPTIONS');
  assert.throws(() => createTokenBucket({ capacity: 1 }), (e) => e.code === 'RL_INVALID_OPTIONS');
  assert.throws(() => createSlidingWindow({ limit: 0, windowMs: 1, now: c.now }), (e) => e.code === 'RL_INVALID_OPTIONS');
});

test('cửa sổ trượt: retryAfter theo sự kiện cũ, 999ms', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  w.take('k', 1);
  c.t = 300;
  w.take('k', 2);
  c.t = 400;
  assert.deepEqual(w.take('k', 2), { allowed: false, retryAfterMs: 900, remaining: 0 });
  assert.deepEqual(w.peek('k'), { allowed: false, retryAfterMs: 600, remaining: 0 });
  c.t = 1000;
  assert.equal(w.peek('k', 1).remaining, 1);
  assert.equal(w.take('k', 3).allowed, false);
  assert.throws(() => w.take('k', 4), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
});
