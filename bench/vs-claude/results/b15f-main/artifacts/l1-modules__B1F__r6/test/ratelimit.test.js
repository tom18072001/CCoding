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

const code = (c) => (e) => e.code === c;

test('bucket: nạp phân số 3/2000ms, 667ms', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).allowed, true);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.equal(b.take('k').allowed, true);
});

test('bucket: không vượt capacity, khóa độc lập, peek không tạo khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.equal(b.peek('a').remaining, 2);
  assert.equal(b.size(), 0);
  b.take('a');
  assert.equal(b.take('b').remaining, 1);
  c.t = 100000;
  assert.equal(b.peek('a').remaining, 2);
  assert.equal(b.sweep(), 2);
  assert.equal(b.size(), 0);
});

test('bucket: remaining là floor phần lẻ, đồng hồ lùi giữ mốc', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 0);
  c.t = 500; // lùi
  assert.equal(b.take('k').retryAfterMs, 1000);
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
});

test('bucket: reset và cost bằng capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.equal(b.take('k', 2).allowed, true);
  assert.equal(b.reset('k'), true);
  assert.equal(b.reset('k'), false);
  assert.equal(b.take('k', 2).allowed, true);
});

test('thứ tự lỗi: khóa → cost → vượt sức chứa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.throws(() => b.take(5, 0), code('RL_INVALID_KEY'));
  assert.throws(() => b.take('', 99), code('RL_INVALID_KEY'));
  assert.throws(() => b.take('k', 0), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', 1.5), code('RL_INVALID_COST'));
  assert.throws(() => b.peek('k', '1'), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(b.size(), 0);
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now: c.now });
  assert.throws(() => w.take('', 0), code('RL_INVALID_KEY'));
  assert.throws(() => w.take('k', -1), code('RL_INVALID_COST'));
  assert.throws(() => w.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(w.size(), 0);
});

test('tùy chọn khởi tạo sai', () => {
  const now = () => 0;
  assert.throws(() => createTokenBucket(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillAmount: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillIntervalMs: 1.5, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 1 }), code('RL_INVALID_OPTIONS'));
});

test('cửa sổ: biên 999/1000 và retryAfterMs', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  for (let i = 0; i < 3; i++) assert.equal(w.take('k').remaining, 2 - i);
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.deepEqual(w.take('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
});

test('cửa sổ: retryAfterMs theo cộng dồn sự kiện cũ, peek không tiêu', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 4, windowMs: 100, now: c.now });
  w.take('k', 1); // t=0
  c.t = 10;
  w.take('k', 2); // t=10
  c.t = 20;
  w.take('k', 1); // t=20, used 4
  c.t = 30;
  assert.deepEqual(w.peek('k', 1), { allowed: false, retryAfterMs: 70, remaining: 0 });
  assert.equal(w.peek('k', 2).retryAfterMs, 80); // cần 2 → sự kiện t=10
  assert.equal(w.peek('k', 4).retryAfterMs, 90); // cần 4 → sự kiện t=20
  assert.equal(w.peek('zz').remaining, 4);
  assert.equal(w.size(), 1);
});

test('cửa sổ: sweep giữ khóa còn sự kiện, reset', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  w.take('a');
  c.t = 50;
  w.take('b');
  c.t = 100;
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 1);
  assert.equal(w.reset('b'), true);
  assert.equal(w.reset('b'), false);
});
