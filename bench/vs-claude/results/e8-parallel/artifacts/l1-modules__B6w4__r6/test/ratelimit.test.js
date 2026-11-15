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

test('bucket: nạp phần lẻ 3/2000ms, retry 667', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  for (let i = 0; i < 6; i++) b.take('k');
  assert.equal(b.take('k').retryAfterMs, 667);
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.equal(b.take('k').allowed, true);
});

test('bucket: remaining là floor, không vượt capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, refillAmount: 1, refillIntervalMs: 1000, now: c.now });
  b.take('k', 3);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 1);
  c.t = 1e9;
  assert.equal(b.peek('k').remaining, 3);
});

test('bucket: cost bằng capacity hợp lệ; từ chối không tiêu', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 4, now: c.now });
  assert.equal(b.take('k', 4).remaining, 0);
  assert.deepEqual(b.take('k', 2), { allowed: false, retryAfterMs: 2000, remaining: 0 });
  c.t = 1000;
  assert.deepEqual(b.take('k', 2), { allowed: false, retryAfterMs: 1000, remaining: 1 });
  assert.equal(b.peek('k').remaining, 1);
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

test('bucket: peek không tạo khóa; reset; sweep; size', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.deepEqual(b.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(b.size(), 0);
  assert.equal(b.reset('k'), false);
  b.take('k');
  b.take('j');
  assert.equal(b.size(), 2);
  assert.equal(b.sweep(), 0);
  c.t = 1000;
  assert.equal(b.sweep(), 2);
  assert.equal(b.size(), 0);
  b.take('k');
  assert.equal(b.reset('k'), true);
  assert.equal(b.size(), 0);
});

test('thứ tự kiểm tra: khóa → cost → vượt sức chứa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.throws(() => b.take(5, 'x'), code('RL_INVALID_KEY'));
  assert.throws(() => b.take('k', 0), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', 1.5), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', null), code('RL_INVALID_COST'));
  assert.throws(() => b.peek('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(b.size(), 0);
  assert.equal(b.take('k', undefined).remaining, 1);
});

test('tùy chọn sai → RL_INVALID_OPTIONS', () => {
  const now = () => 0;
  for (const o of [undefined, null, {}, { capacity: 0, now }, { capacity: 1.5, now }, { capacity: 1 },
    { capacity: 1, now, refillAmount: 0 }, { capacity: 1, now, refillIntervalMs: -1 }, { capacity: 1, now: 5 }]) {
    assert.throws(() => createTokenBucket(o), code('RL_INVALID_OPTIONS'));
  }
  for (const o of [undefined, {}, { limit: 0, windowMs: 1, now }, { limit: 1, windowMs: 0, now }, { limit: 1, windowMs: 1 }]) {
    assert.throws(() => createSlidingWindow(o), code('RL_INVALID_OPTIONS'));
  }
});

test('cửa sổ: retryAfter theo sự kiện cũ nhất đủ giải phóng', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 1000, now: c.now });
  w.take('k', 2);
  c.t = 300;
  w.take('k', 2);
  c.t = 600;
  w.take('k', 1);
  assert.deepEqual(w.take('k', 2), { allowed: false, retryAfterMs: 400, remaining: 0 });
  assert.deepEqual(w.take('k', 3), { allowed: false, retryAfterMs: 700, remaining: 0 });
  assert.deepEqual(w.take('k', 5), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 1000;
  assert.equal(w.peek('k').remaining, 2);
  assert.equal(w.take('k', 2).remaining, 0);
});

test('cửa sổ: peek, từ chối không ghi, cost = limit, lỗi', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  assert.deepEqual(w.peek('k', 2), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(w.size(), 0);
  assert.equal(w.take('k', 2).remaining, 0);
  assert.equal(w.take('k').allowed, false);
  c.t = 100;
  assert.equal(w.take('k', 2).allowed, true);
  assert.throws(() => w.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.throws(() => w.take('', 3), code('RL_INVALID_KEY'));
  assert.throws(() => w.take('k', -1), code('RL_INVALID_COST'));
  assert.equal(w.reset('k'), true);
  assert.equal(w.reset('k'), false);
});

test('cửa sổ: sweep dọn sự kiện cũ của khóa còn lại', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 100, now: c.now });
  w.take('a');
  c.t = 60;
  w.take('b');
  c.t = 100;
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 1);
  assert.equal(w.peek('b').remaining, 2);
});
