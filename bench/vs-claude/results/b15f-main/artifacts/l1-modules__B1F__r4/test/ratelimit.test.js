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

test('bucket: nạp phần lẻ, 667ms', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).remaining, 0);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('bucket: không vượt capacity, đồng hồ lùi giữ mốc', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 500; // lùi
  assert.equal(b.take('k').allowed, false);
  c.t = 2000; // tính từ mốc 1000 => 1 token
  assert.equal(b.take('k').allowed, true);
  c.t = 999999;
  assert.equal(b.peek('k').remaining, 2);
});

test('bucket: peek không tạo khóa, reset, sweep, khóa độc lập', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.equal(b.peek('a').remaining, 2);
  assert.equal(b.size(), 0);
  b.take('a'); b.take('b', 2);
  assert.equal(b.peek('a').remaining, 1);
  assert.equal(b.peek('b').remaining, 0);
  assert.equal(b.reset('a'), true);
  assert.equal(b.reset('a'), false);
  c.t = 5000;
  assert.equal(b.size(), 1);
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 0);
});

test('thứ tự kiểm tra đầu vào', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  const code = (f) => { try { f(); } catch (e) { return e.code; } };
  assert.equal(code(() => b.take(5, 0)), 'RL_INVALID_KEY');
  assert.equal(code(() => b.take('k', 0)), 'RL_INVALID_COST');
  assert.equal(code(() => b.take('k', 1.5)), 'RL_INVALID_COST');
  assert.equal(code(() => b.take('k', 3)), 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(b.size(), 0);
  assert.equal(code(() => b.take('k', 2)), undefined);
  assert.equal(code(() => createTokenBucket()), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createTokenBucket({ capacity: 0, now: c.now })), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createTokenBucket({ capacity: 1 })), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createSlidingWindow({ limit: 1, windowMs: 0, now: c.now })), 'RL_INVALID_OPTIONS');
});

test('cửa sổ trượt: retryAfterMs theo sự kiện, biên 999/1000', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  for (let i = 0; i < 3; i++) assert.equal(w.take('k').remaining, 2 - i);
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.equal(w.take('k').allowed, true);
});

test('cửa sổ trượt: cost nhiều, sự kiện cũ nhất đến mới, peek', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 100, now: c.now });
  w.take('k', 2); // t=0
  c.t = 30; w.take('k', 2); // t=30
  c.t = 50;
  assert.deepEqual(w.peek('k', 3), { allowed: false, retryAfterMs: 50, remaining: 1 });
  assert.deepEqual(w.take('k', 4), { allowed: false, retryAfterMs: 80, remaining: 1 });
  assert.equal(w.peek('k').remaining, 1);
  assert.equal(w.peek('zz').remaining, 5);
  assert.equal(w.size(), 1);
  c.t = 100;
  assert.equal(w.take('k', 3).allowed, true);
  assert.equal(w.reset('k'), true);
  assert.equal(w.reset('k'), false);
});
