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

const code = (f) => { try { f(); } catch (e) { return e.code; } };

test('bucket: nạp phân số 3/2000ms, 667ms', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).allowed, true);
  assert.equal(b.take('k').retryAfterMs, 667);
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('bucket: remaining floor phần lẻ, không vượt capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 1);
  c.t = 100000;
  assert.equal(b.peek('k').remaining, 2);
});

test('bucket: đồng hồ lùi giữ mốc cũ', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 1, now: c.now });
  b.take('k');
  c.t = 500;
  assert.equal(b.take('k').retryAfterMs, 1000);
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
});

test('bucket: peek không tạo khóa, reset, sweep', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.deepEqual(b.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(b.size(), 0);
  b.take('k');
  assert.equal(b.size(), 1);
  assert.equal(b.sweep(), 0);
  c.t = 1000;
  assert.equal(b.sweep(), 1);
  b.take('x');
  assert.equal(b.reset('x'), true);
  assert.equal(b.reset('x'), false);
});

test('thứ tự kiểm tra: khóa → cost → sức chứa', () => {
  const b = createTokenBucket({ capacity: 2, now: () => 0 });
  assert.equal(code(() => b.take('', 0)), 'RL_INVALID_KEY');
  assert.equal(code(() => b.take(5, 99)), 'RL_INVALID_KEY');
  assert.equal(code(() => b.take('k', 0)), 'RL_INVALID_COST');
  assert.equal(code(() => b.take('k', 1.5)), 'RL_INVALID_COST');
  assert.equal(code(() => b.take('k', 3)), 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(b.size(), 0);
  assert.equal(b.take('k', 2).allowed, true);
});

test('tùy chọn sai', () => {
  assert.equal(code(() => createTokenBucket()), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createTokenBucket({ capacity: 0, now: () => 0 })), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createTokenBucket({ capacity: 1 })), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createTokenBucket({ capacity: 1, refillAmount: 1.5, now: () => 0 })), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createSlidingWindow({ limit: 1, windowMs: 0, now: () => 0 })), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createSlidingWindow({ limit: 1, windowMs: 5 })), 'RL_INVALID_OPTIONS');
  assert.equal(code(() => createSlidingWindow()), 'RL_INVALID_OPTIONS');
});

test('cửa sổ: retryAfterMs theo sự kiện cũ đủ giải phóng', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  w.take('k');
  c.t = 300;
  w.take('k', 2);
  c.t = 400;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 600, remaining: 0 });
  assert.equal(w.take('k', 3).retryAfterMs, 900);
  c.t = 999;
  assert.equal(w.peek('k').remaining, 0);
  assert.equal(w.take('k', 3).retryAfterMs, 301);
  c.t = 1000;
  assert.deepEqual(w.take('k', 1), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('cửa sổ: peek, reset, sweep, cost = limit', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  assert.deepEqual(w.peek('k', 2), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(w.size(), 0);
  assert.equal(code(() => w.take('k', 3)), 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(w.take('k', 2).remaining, 0);
  assert.equal(w.sweep(), 0);
  c.t = 100;
  assert.equal(w.size(), 1);
  assert.equal(w.sweep(), 1);
  w.take('a');
  assert.equal(w.reset('a'), true);
  assert.equal(w.reset('a'), false);
});
