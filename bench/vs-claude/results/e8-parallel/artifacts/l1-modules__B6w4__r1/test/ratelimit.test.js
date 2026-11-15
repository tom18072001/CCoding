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

const code = (c) => (e) => e.code === c;

test('bucket: nạp theo phần, 3/2000ms cần 667ms', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).allowed, true);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('bucket: không vượt capacity, remaining là floor', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  b.take('k', 3);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 1);
  c.t = 1e6;
  assert.equal(b.peek('k').remaining, 3);
});

test('bucket: peek không tạo khóa, không tiêu; từ chối không tiêu', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.deepEqual(b.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(b.size(), 0);
  b.take('k', 2);
  assert.equal(b.take('k').allowed, false);
  assert.equal(b.peek('k').remaining, 0);
  c.t = 1000;
  assert.equal(b.take('k', 2).allowed, false);
  assert.equal(b.take('k').allowed, true);
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

test('bucket: reset và sweep', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('a');
  b.take('b', 2);
  assert.equal(b.reset('a'), true);
  assert.equal(b.reset('a'), false);
  assert.equal(b.sweep(), 0);
  c.t = 2000;
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 0);
});

test('bucket: kiểm tra đầu vào và thứ tự', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.throws(() => b.take(5, 0), code('RL_INVALID_KEY'));
  assert.throws(() => b.take('k', 0), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', 1.5), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', '1'), code('RL_INVALID_COST'));
  assert.throws(() => b.peek('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(b.size(), 0);
  assert.equal(b.take('k', 2).allowed, true);
});

test('lỗi tùy chọn', () => {
  const c = clock();
  assert.throws(() => createTokenBucket(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 0, now: c.now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillAmount: 0, now: c.now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1.5, windowMs: 1, now: c.now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow(), code('RL_INVALID_OPTIONS'));
});

test('cửa sổ: retryAfterMs theo ví dụ spec', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual([1, 2, 3].map(() => w.take('k').remaining), [2, 1, 0]);
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
});

test('cửa sổ: cost nhiều, duyệt sự kiện cũ đến mới', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 100, now: c.now });
  w.take('k', 2);
  c.t = 10;
  w.take('k', 1);
  c.t = 20;
  w.take('k', 2);
  c.t = 30;
  // cần 3: target = 5+3-5 = 3 → cộng dồn 2, 3 ở sự kiện t=10 → 10+100-30 = 80
  assert.deepEqual(w.take('k', 3), { allowed: false, retryAfterMs: 80, remaining: 0 });
  assert.deepEqual(w.peek('k', 2), { allowed: false, retryAfterMs: 70, remaining: 0 });
  c.t = 110;
  assert.deepEqual(w.peek('k', 1), { allowed: true, retryAfterMs: 0, remaining: 3 });
  assert.equal(w.take('k', 3).allowed, true);
});

test('cửa sổ: peek không tạo khóa; reset; sweep giữ khóa còn sự kiện', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  w.peek('k');
  assert.equal(w.size(), 0);
  w.take('k');
  c.t = 50;
  w.take('k');
  c.t = 100;
  assert.equal(w.sweep(), 0);
  assert.equal(w.peek('k').remaining, 1);
  assert.equal(w.reset('k'), true);
  assert.equal(w.reset('k'), false);
});

test('cửa sổ: lỗi đầu vào', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  assert.throws(() => w.take(''), code('RL_INVALID_KEY'));
  assert.throws(() => w.take('k', -1), code('RL_INVALID_COST'));
  assert.throws(() => w.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(w.size(), 0);
  assert.equal(w.take('k', 2).allowed, true);
});

test('lỗi có mã', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.throws(() => b.take('k', 3), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
  assert.throws(() => b.take(''), (e) => e.code === 'RL_INVALID_KEY');
});
