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

test('bucket: nạp phần lẻ, retryAfterMs làm tròn lên', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  for (let i = 0; i < 6; i++) assert.equal(b.take('k').allowed, true);
  assert.equal(b.take('k').retryAfterMs, 667);
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.equal(b.take('k').allowed, true);
});

test('bucket: không vượt capacity, cost = capacity hợp lệ, từ chối không tiêu', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  c.t = 100000;
  assert.equal(b.take('k', 3).remaining, 0);
  assert.deepEqual(b.take('k', 2), { allowed: false, retryAfterMs: 2000, remaining: 0 });
  c.t += 1500;
  assert.equal(b.peek('k', 1).remaining, 1);
  assert.equal(b.take('k', 2).allowed, false);
  assert.equal(b.peek('k', 1).remaining, 1);
});

test('bucket: đồng hồ lùi không lùi mốc', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 500;
  assert.equal(b.take('k').retryAfterMs, 1000);
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
});

test('peek không tạo khóa; reset và size; sweep bucket', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.deepEqual(b.peek('x'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(b.size(), 0);
  b.take('x', 2);
  b.take('y');
  assert.equal(b.size(), 2);
  assert.equal(b.reset('nope'), false);
  assert.equal(b.reset('y'), true);
  c.t = 1999;
  assert.equal(b.sweep(), 0);
  c.t = 2000;
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 0);
});

test('cửa sổ trượt: cost lớn, retryAfterMs theo sự kiện, peek', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 1000, now: c.now });
  w.take('k', 2);
  c.t = 300;
  w.take('k', 2);
  c.t = 400;
  assert.deepEqual(w.peek('k', 2), { allowed: false, retryAfterMs: 600, remaining: 1 });
  assert.deepEqual(w.take('k', 4), { allowed: false, retryAfterMs: 900, remaining: 1 });
  c.t = 999;
  assert.equal(w.take('k', 3).allowed, false);
  c.t = 1000;
  assert.deepEqual(w.take('k', 3), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('cửa sổ: peek không tạo khóa, sweep giữ khóa còn hiệu lực', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  assert.equal(w.peek('a').remaining, 2);
  assert.equal(w.size(), 0);
  w.take('a');
  c.t = 50;
  w.take('b');
  c.t = 100;
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 1);
  assert.equal(w.reset('b'), true);
  assert.equal(w.reset('b'), false);
});

test('thứ tự kiểm tra và RL_INVALID_OPTIONS', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  for (const bad of [0, -1, 1.5, '1', NaN, null]) {
    assert.throws(() => w.take('k', bad), (e) => e.code === 'RL_INVALID_COST');
  }
  assert.throws(() => w.take('k', 3), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(w.size(), 0);
  assert.throws(() => w.take(5, 0), (e) => e.code === 'RL_INVALID_KEY');
  assert.throws(() => w.peek('', 1), (e) => e.code === 'RL_INVALID_KEY');
  const opt = (e) => e.code === 'RL_INVALID_OPTIONS';
  assert.throws(() => createTokenBucket(), opt);
  assert.throws(() => createTokenBucket({ capacity: 0, now: c.now }), opt);
  assert.throws(() => createTokenBucket({ capacity: 1 }), opt);
  assert.throws(() => createTokenBucket({ capacity: 1, now: c.now, refillAmount: 0 }), opt);
  assert.throws(() => createTokenBucket({ capacity: 1, now: c.now, refillIntervalMs: 1.5 }), opt);
  assert.throws(() => createSlidingWindow({ limit: 1, now: c.now }), opt);
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 1 }), opt);
  assert.throws(() => createSlidingWindow(), opt);
});

test('lỗi có mã', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.throws(() => b.take('k', 3), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
  assert.throws(() => b.take(''), (e) => e.code === 'RL_INVALID_KEY');
});
