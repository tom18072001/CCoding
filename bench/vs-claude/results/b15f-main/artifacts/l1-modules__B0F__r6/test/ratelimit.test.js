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

test('thứ tự kiểm lỗi: key trước cost trước sức chứa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.throws(() => b.take('', 'x'), (e) => e.code === 'RL_INVALID_KEY');
  assert.throws(() => b.take(5, 0), (e) => e.code === 'RL_INVALID_KEY');
  assert.throws(() => b.take('k', 0), (e) => e.code === 'RL_INVALID_COST');
  assert.throws(() => b.take('k', 1.5), (e) => e.code === 'RL_INVALID_COST');
  assert.throws(() => b.peek('k', 3), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(b.size(), 0);
  assert.equal(b.take('k', 2).allowed, true);
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now: c.now });
  assert.throws(() => w.take('', 'x'), (e) => e.code === 'RL_INVALID_KEY');
  assert.throws(() => w.take('k', -1), (e) => e.code === 'RL_INVALID_COST');
  assert.throws(() => w.take('k', 3), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(w.size(), 0);
});

test('tùy chọn sai → RL_INVALID_OPTIONS', () => {
  const now = () => 0;
  const bad = (e) => e.code === 'RL_INVALID_OPTIONS';
  assert.throws(() => createTokenBucket(), bad);
  assert.throws(() => createTokenBucket({ capacity: 0, now }), bad);
  assert.throws(() => createTokenBucket({ capacity: 1 }), bad);
  assert.throws(() => createTokenBucket({ capacity: 1, refillAmount: 1.5, now }), bad);
  assert.throws(() => createSlidingWindow(), bad);
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 0, now }), bad);
});

test('cửa sổ trượt: biên 999/1000 và cộng dồn retryAfterMs', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  for (let i = 0; i < 3; i++) w.take('k');
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.deepEqual(w.take('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });

  const w2 = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  c.t = 0; w2.take('k', 1);
  c.t = 100; w2.take('k', 2);
  c.t = 200;
  assert.equal(w2.take('k', 2).retryAfterMs, 900); // cộng dồn: t=0 (1) rồi t=100 (3 ≥ 2) → 100+1000-200
});

test('token bucket: chặn trần capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  b.take('k');
  c.t = 100000;
  assert.equal(b.peek('k').remaining, 3);
  assert.equal(b.take('k', 3).allowed, true);
  assert.equal(b.take('k').allowed, false);
});

test('token bucket: phần lẻ khi nạp, ceil/floor', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).remaining, 0);
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
  c.t = 667 + 1334; // 2 token + phần lẻ
  assert.equal(b.peek('k').remaining, 2);
});

test('token bucket: đồng hồ lùi giữ mốc cũ', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 1, now: c.now });
  b.take('k');
  c.t = 500;
  assert.equal(b.take('k').retryAfterMs, 1000);
  c.t = 1999;
  assert.equal(b.take('k').retryAfterMs, 1);
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
});

test('peek không tạo khóa, không tiêu; take bị từ chối không tiêu', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.deepEqual(b.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(b.size(), 0);
  b.take('k', 2);
  assert.equal(b.take('k').allowed, false);
  assert.equal(b.peek('k').remaining, 0);
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  assert.deepEqual(w.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(w.size(), 0);
  w.take('k');
  assert.deepEqual(w.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 1 });
  assert.equal(w.take('k', 2).allowed, false);
  assert.equal(w.peek('k').remaining, 1);
});

test('sweep/size/reset, khóa độc lập', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('a'); b.take('b', 2);
  assert.equal(b.take('b').allowed, false);
  assert.equal(b.take('a').remaining, 0);
  assert.equal(b.size(), 2);
  assert.equal(b.sweep(), 0);
  c.t = 2000;
  assert.equal(b.size(), 2);
  assert.equal(b.sweep(), 2); // cả a và b đã đầy lại
  assert.equal(b.reset('zzz'), false);
});

test('sliding window: sweep, reset', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  w.take('a'); c.t = 50; w.take('b');
  c.t = 100;
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 1);
  assert.equal(w.reset('b'), true);
  assert.equal(w.reset('b'), false);
});
