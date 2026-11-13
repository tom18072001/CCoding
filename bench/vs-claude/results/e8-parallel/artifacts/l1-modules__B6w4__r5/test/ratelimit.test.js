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

test('thứ tự kiểm tra: khóa → cost → sức chứa', () => {
  const b = createTokenBucket({ capacity: 2, now: clock().now });
  assert.throws(() => b.take('', 0), code('RL_INVALID_KEY'));
  assert.throws(() => b.take(5, 99), code('RL_INVALID_KEY'));
  assert.throws(() => b.take('k', 0), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', 1.5), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', '1'), code('RL_INVALID_COST'));
  assert.throws(() => b.peek('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(b.size(), 0);
  assert.equal(b.take('k', 2).allowed, true);
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now: clock().now });
  assert.throws(() => w.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(w.size(), 0);
});

test('tùy chọn sai', () => {
  const now = () => 0;
  for (const o of [undefined, {}, { capacity: 0, now }, { capacity: 1 }, { capacity: 1.5, now },
    { capacity: 1, refillAmount: 0, now }, { capacity: 1, refillIntervalMs: 'x', now }]) {
    assert.throws(() => createTokenBucket(o), code('RL_INVALID_OPTIONS'));
  }
  for (const o of [undefined, { limit: 1, now }, { limit: 0, windowMs: 1, now }, { limit: 1, windowMs: 1 }]) {
    assert.throws(() => createSlidingWindow(o), code('RL_INVALID_OPTIONS'));
  }
});

test('token bucket: nạp phần lẻ, 667ms', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).remaining, 0);
  assert.equal(b.take('k').retryAfterMs, 667);
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('token bucket: remaining là floor, không vượt capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  b.take('k', 3);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 1);
  c.t = 100000;
  assert.equal(b.peek('k').remaining, 3);
});

test('token bucket: từ chối không tiêu; peek không tạo khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  assert.equal(b.peek('k').remaining, 3);
  assert.equal(b.size(), 0);
  b.take('k', 2);
  assert.equal(b.take('k', 2).allowed, false);
  assert.equal(b.peek('k').remaining, 1);
  assert.equal(b.peek('k', 1).allowed, true);
  assert.equal(b.peek('k').remaining, 1);
});

test('token bucket: đồng hồ lùi giữ mốc cũ', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 500;
  assert.equal(b.take('k').retryAfterMs, 1000);
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
});

test('token bucket: reset và sweep', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('a');
  b.take('b', 2);
  assert.equal(b.reset('a'), true);
  assert.equal(b.reset('a'), false);
  assert.equal(b.sweep(), 0);
  c.t = 1999;
  assert.equal(b.sweep(), 0);
  c.t = 2000;
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 0);
});

test('cửa sổ trượt: ví dụ SPEC', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual([1, 1, 1].map(() => w.take('k').remaining), [2, 1, 0]);
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.deepEqual(w.take('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
});

test('cửa sổ trượt: retryAfterMs theo sự kiện cộng dồn', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 1000, now: c.now });
  w.take('k', 1);
  c.t = 100; w.take('k', 2);
  c.t = 300; w.take('k', 2);
  c.t = 400;
  assert.deepEqual(w.take('k', 3), { allowed: false, retryAfterMs: 700, remaining: 0 });
  assert.equal(w.peek('k', 1).retryAfterMs, 600);
  c.t = 1100;
  assert.equal(w.peek('k').remaining, 3);
  assert.equal(w.take('k', 3).allowed, true);
});

test('cửa sổ trượt: khóa độc lập, reset, sweep giữ khóa còn hiệu lực', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 1, windowMs: 100, now: c.now });
  w.take('a');
  c.t = 50;
  w.take('b');
  assert.equal(w.take('a').allowed, false);
  assert.equal(w.peek('c').remaining, 1);
  assert.equal(w.size(), 2);
  c.t = 100;
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 1);
  assert.equal(w.reset('b'), true);
  assert.equal(w.reset('b'), false);
});
