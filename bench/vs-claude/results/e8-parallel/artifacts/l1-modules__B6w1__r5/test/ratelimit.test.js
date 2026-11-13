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

test('token bucket: nạp phần lẻ và retryAfterMs làm tròn lên', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).remaining, 0);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.equal(b.take('k').allowed, true);
});

test('token bucket: đồng hồ lùi không lùi mốc, peek không tạo khóa', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.equal(b.peek('x').remaining, 2);
  assert.equal(b.size(), 0);
  b.take('k', 2);
  c.t = 500;
  assert.equal(b.take('k').allowed, false);
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
  assert.equal(b.reset('k'), true);
  assert.equal(b.reset('k'), false);
});

test('token bucket: sweep xóa khóa đã đầy lại', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k');
  c.t = 999;
  assert.equal(b.sweep(), 0);
  c.t = 1000;
  assert.equal(b.sweep(), 1);
});

test('cửa sổ trượt: retryAfterMs theo sự kiện cũ nhất đủ giải phóng', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  w.take('k');
  c.t = 400;
  w.take('k', 2);
  assert.deepEqual(w.take('k', 2), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 999;
  assert.equal(w.take('k', 2).retryAfterMs, 401);
  c.t = 1000;
  assert.equal(w.peek('k').remaining, 1);
  assert.deepEqual(w.take('k', 2), { allowed: false, retryAfterMs: 400, remaining: 1 });
});

test('lỗi: thứ tự kiểm tra và tùy chọn', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now: c.now });
  assert.throws(() => w.take(5, 0), (e) => e.code === 'RL_INVALID_KEY');
  assert.throws(() => w.take('k', 1.5), (e) => e.code === 'RL_INVALID_COST');
  assert.throws(() => w.take('k', 3), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(w.size(), 0);
  assert.equal(w.take('k', 2).allowed, true);
  assert.throws(() => createTokenBucket(), (e) => e.code === 'RL_INVALID_OPTIONS');
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 1 }), (e) => e.code === 'RL_INVALID_OPTIONS');
  assert.throws(() => createTokenBucket({ capacity: 1, refillAmount: 0, now: c.now }), (e) => e.code === 'RL_INVALID_OPTIONS');
});
