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

test('bucket: refill phân số 3/2000ms, 667ms', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).allowed, true);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('bucket: không vượt capacity, remaining là floor phần lẻ', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, refillAmount: 1, refillIntervalMs: 1000, now: c.now });
  b.take('k', 3);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 1);
  c.t = 1000000;
  assert.equal(b.peek('k').remaining, 3);
  assert.equal(b.take('k', 3).remaining, 0);
});

test('bucket: từ chối không tiêu; peek không tạo khóa, không tiêu', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.deepEqual(b.peek('x'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(b.size(), 0);
  b.take('k', 2);
  assert.deepEqual(b.take('k', 2), { allowed: false, retryAfterMs: 2000, remaining: 0 });
  assert.equal(b.peek('k').retryAfterMs, 1000);
  c.t = 2000;
  assert.equal(b.take('k', 2).allowed, true);
});

test('bucket: đồng hồ lùi giữ mốc cũ', () => {
  const c = clock(5000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 4000;
  assert.equal(b.take('k').allowed, false);
  c.t = 6000; // 1000ms kể từ mốc 5000
  assert.equal(b.take('k').allowed, true);
});

test('bucket: reset, sweep, size', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('a');
  b.take('b', 2);
  assert.equal(b.size(), 2);
  assert.equal(b.sweep(), 0);
  c.t = 1000; // a đầy lại, b còn 1
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 1);
  assert.equal(b.reset('b'), true);
  assert.equal(b.reset('b'), false);
});

test('bucket: cost == capacity hợp lệ; thứ tự kiểm tra lỗi', () => {
  const b = createTokenBucket({ capacity: 2, now: () => 0 });
  assert.equal(b.take('k', 2).allowed, true);
  assert.throws(() => b.take(5, 0), code('RL_INVALID_KEY'));
  assert.throws(() => b.take('k', 0), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', 1.5), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', '1'), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  const b2 = createTokenBucket({ capacity: 2, now: () => 0 });
  assert.throws(() => b2.take('z', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(b2.size(), 0);
  assert.throws(() => b2.peek('', 1), code('RL_INVALID_KEY'));
});

test('tùy chọn sai → RL_INVALID_OPTIONS', () => {
  const now = () => 0;
  for (const bad of [undefined, null, {}, { capacity: 0, now }, { capacity: 1.5, now }, { capacity: 1 },
    { capacity: 1, now, refillAmount: 0 }, { capacity: 1, now, refillIntervalMs: -1 }, { capacity: 1, now: 5 }]) {
    assert.throws(() => createTokenBucket(bad), code('RL_INVALID_OPTIONS'));
  }
  for (const bad of [undefined, {}, { limit: 1, now }, { limit: 0, windowMs: 1, now }, { limit: 1, windowMs: 1 }]) {
    assert.throws(() => createSlidingWindow(bad), code('RL_INVALID_OPTIONS'));
  }
});

test('cửa sổ: retryAfterMs theo sự kiện cũ, biên 999/1000', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  for (let i = 0; i < 3; i++) assert.equal(w.take('k').remaining, 2 - i);
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.deepEqual(w.take('k', 3), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('cửa sổ: cộng dồn cost đến khi đủ', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 1000, now: c.now });
  w.take('k', 1); // t=0
  c.t = 100;
  w.take('k', 2); // t=100
  c.t = 300;
  w.take('k', 2); // t=300, used=5
  c.t = 400;
  assert.deepEqual(w.take('k', 1), { allowed: false, retryAfterMs: 600, remaining: 0 });
  assert.equal(w.take('k', 3).retryAfterMs, 700); // need 3: 1+2 -> sự kiện t=100
  assert.equal(w.peek('k', 3).remaining, 0);
  c.t = 1100;
  assert.deepEqual(w.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 3 });
  assert.equal(w.size(), 1);
});

test('cửa sổ: khóa độc lập, reset, sweep dọn sự kiện cũ, peek không tạo khóa', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 1, windowMs: 100, now: c.now });
  assert.equal(w.peek('a').allowed, true);
  assert.equal(w.size(), 0);
  w.take('a');
  assert.equal(w.take('b').allowed, true);
  assert.equal(w.take('a').allowed, false);
  assert.equal(w.reset('a'), true);
  assert.equal(w.reset('a'), false);
  assert.equal(w.take('a').allowed, true);
  c.t = 100;
  assert.equal(w.sweep(), 2);
  assert.equal(w.size(), 0);
});

test('cửa sổ: lỗi đầu vào', () => {
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now: () => 0 });
  assert.throws(() => w.take(''), code('RL_INVALID_KEY'));
  assert.throws(() => w.take('k', -1), code('RL_INVALID_COST'));
  assert.throws(() => w.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(w.size(), 0);
  assert.equal(w.take('k', 2).allowed, true);
});
