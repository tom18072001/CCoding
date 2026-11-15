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

test('thứ tự lỗi: khóa → cost → vượt sức chứa', () => {
  const b = createTokenBucket({ capacity: 2, now: () => 0 });
  assert.throws(() => b.take(1, 0), code('RL_INVALID_KEY'));
  assert.throws(() => b.take('', 99), code('RL_INVALID_KEY'));
  assert.throws(() => b.take('k', 0), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', 1.5), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', null), code('RL_INVALID_COST'));
  assert.throws(() => b.peek('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(b.size(), 0);
  assert.equal(b.take('k', 2).allowed, true);
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now: () => 0 });
  assert.throws(() => w.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.throws(() => w.take('k', -1), code('RL_INVALID_COST'));
  assert.equal(w.size(), 0);
});

test('tùy chọn sai → RL_INVALID_OPTIONS', () => {
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

test('token bucket: nạp phân số, ceil 667ms', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).allowed, true);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('token bucket: peek không tiêu, không tạo khóa; không vượt capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  assert.deepEqual(b.peek('x'), { allowed: true, retryAfterMs: 0, remaining: 3 });
  assert.equal(b.size(), 0);
  b.take('k', 3);
  assert.deepEqual(b.peek('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 1e6;
  assert.equal(b.peek('k').remaining, 3);
  assert.equal(b.take('k', 3).allowed, true);
});

test('token bucket: từ chối không tiêu; remaining là floor phần lẻ', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  b.take('k', 3);
  c.t = 1500;
  assert.deepEqual(b.take('k', 3), { allowed: false, retryAfterMs: 1500, remaining: 1 });
  assert.equal(b.peek('k').remaining, 1);
  assert.equal(b.take('k').remaining, 0);
});

test('token bucket: đồng hồ lùi giữ mốc cũ', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 500;
  assert.equal(b.take('k').retryAfterMs, 1000);
  c.t = 2000; // mốc cũ vẫn 1000 → đã trôi 1000ms
  assert.equal(b.take('k').allowed, true);
});

test('token bucket: khóa độc lập, reset, sweep', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('a', 2);
  b.take('b');
  assert.equal(b.take('a').allowed, false);
  assert.equal(b.take('b').allowed, true);
  assert.equal(b.reset('zz'), false);
  assert.equal(b.reset('a'), true);
  assert.equal(b.take('a').remaining, 1);
  c.t = 999;
  assert.equal(b.sweep(), 0);
  c.t = 2000;
  assert.equal(b.sweep(), 2);
  assert.equal(b.size(), 0);
});

test('cửa sổ trượt: biên 999/1000', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual([1, 2, 3].map(() => w.take('k').remaining), [2, 1, 0]);
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000; // cả ba sự kiện (t=0) hết hiệu lực đúng tại 1000
  assert.deepEqual(w.take('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
});

test('cửa sổ trượt: retryAfterMs duyệt cộng dồn cost từ sự kiện cũ', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 100, now: c.now });
  w.take('k', 1); // t=0
  c.t = 10;
  w.take('k', 2); // t=10
  c.t = 30;
  w.take('k', 2); // t=30, used=5
  c.t = 40;
  // cần 3: used+cost-limit=3; cộng dồn 1, 3 ≥ 3 tại sự kiện t=10 → 10+100-40=70
  assert.deepEqual(w.take('k', 3), { allowed: false, retryAfterMs: 70, remaining: 0 });
  assert.deepEqual(w.peek('k', 1), { allowed: false, retryAfterMs: 60, remaining: 0 });
  c.t = 110; // sự kiện t=0 và t=10 đã hết hạn
  assert.deepEqual(w.peek('k', 1), { allowed: true, retryAfterMs: 0, remaining: 3 });
});

test('cửa sổ trượt: peek không tạo khóa, reset, sweep dọn sự kiện cũ', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  assert.equal(w.peek('k').remaining, 2);
  assert.equal(w.size(), 0);
  w.take('k');
  c.t = 50;
  w.take('k');
  c.t = 100;
  assert.equal(w.sweep(), 0);
  assert.equal(w.peek('k').remaining, 1);
  c.t = 150;
  assert.equal(w.sweep(), 1);
  assert.equal(w.reset('k'), false);
  w.take('k');
  assert.equal(w.reset('k'), true);
});
