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

// ===== Mở rộng =====
const code = (c) => (e) => e.code === c;

test('bucket: ví dụ 6/3/2000 — 667ms, ±1ms quanh mốc', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).allowed, true);
  c.t = 665;
  assert.equal(b.take('k').retryAfterMs, 2);
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('bucket: giữ phần lẻ, remaining là floor', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  b.take('k', 3);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 1);
  assert.equal(b.take('k').remaining, 0);
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
});

test('bucket: không vượt capacity khi nạp lâu', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 1e9;
  assert.equal(b.peek('k').remaining, 2);
  assert.equal(b.take('k', 2).allowed, true);
  assert.equal(b.take('k').allowed, false);
});

test('bucket: bị từ chối không tiêu, retryAfterMs cho cost lớn', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  b.take('k', 4);
  assert.deepEqual(b.take('k', 3), { allowed: false, retryAfterMs: 2000, remaining: 1 });
  assert.equal(b.peek('k').remaining, 1);
  c.t = 2000;
  assert.equal(b.take('k', 3).allowed, true);
});

test('bucket: đồng hồ lùi không lùi mốc', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 500;
  assert.equal(b.take('k').allowed, false);
  c.t = 1999;
  assert.equal(b.take('k').retryAfterMs, 1);
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
});

test('bucket: mỗi khóa độc lập; reset; peek không tạo khóa; sweep', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 1, now: c.now });
  assert.equal(b.peek('a').allowed, true);
  assert.equal(b.size(), 0);
  b.take('a');
  assert.equal(b.take('b').allowed, true);
  assert.equal(b.take('a').allowed, false);
  assert.equal(b.size(), 2);
  assert.equal(b.reset('a'), true);
  assert.equal(b.reset('a'), false);
  assert.equal(b.take('a').allowed, true);
  c.t = 999;
  assert.equal(b.sweep(), 0);
  c.t = 1000;
  assert.equal(b.sweep(), 2);
  assert.equal(b.size(), 0);
});

test('bucket: cost bằng capacity hợp lệ; thứ tự kiểm đầu vào', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.equal(b.take('k', 2).allowed, true);
  for (const bad of [0, -1, 1.5, '1', null, NaN]) {
    assert.throws(() => b.take('x', bad), code('RL_INVALID_COST'));
  }
  assert.throws(() => b.take('', 99), code('RL_INVALID_KEY'));
  assert.throws(() => b.take(5, 0), code('RL_INVALID_KEY'));
  assert.throws(() => b.take('x', 0), code('RL_INVALID_COST'));
  assert.throws(() => b.peek('x', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(b.size(), 1);
});

test('bucket: RL_INVALID_OPTIONS', () => {
  const now = () => 0;
  assert.throws(() => createTokenBucket(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket(null), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1.5, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillAmount: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillIntervalMs: -5, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, now: 5 }), code('RL_INVALID_OPTIONS'));
});

test('cửa sổ: ±1ms quanh mốc hết hiệu lực', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual(w.take('k', 3), { allowed: true, retryAfterMs: 0, remaining: 0 });
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.deepEqual(w.take('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
});

test('cửa sổ: retryAfterMs theo cộng dồn sự kiện cũ → mới', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 1000, now: c.now });
  w.take('k', 2); // t=0
  c.t = 100;
  w.take('k', 2); // t=100
  c.t = 200;
  w.take('k', 1); // t=200, used=5
  assert.deepEqual(w.take('k', 2), { allowed: false, retryAfterMs: 800, remaining: 0 });
  assert.deepEqual(w.take('k', 3), { allowed: false, retryAfterMs: 900, remaining: 0 });
  assert.deepEqual(w.take('k', 5), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 1000;
  assert.equal(w.peek('k', 2).allowed, true);
  assert.equal(w.peek('k', 2).remaining, 2);
});

test('cửa sổ: từ chối không ghi sự kiện; peek không tạo khóa', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 1, windowMs: 100, now: c.now });
  assert.equal(w.peek('k').allowed, true);
  assert.equal(w.size(), 0);
  w.take('k');
  w.take('k');
  c.t = 100;
  assert.equal(w.take('k').allowed, true);
  assert.equal(w.take('k').allowed, false);
});

test('cửa sổ: khóa độc lập, reset, sweep giữ khóa còn hiệu lực', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 1, windowMs: 100, now: c.now });
  w.take('a');
  c.t = 50;
  w.take('b');
  assert.equal(w.size(), 2);
  c.t = 99;
  assert.equal(w.sweep(), 0);
  c.t = 100;
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 1);
  assert.equal(w.reset('b'), true);
  assert.equal(w.reset('b'), false);
});

test('cửa sổ: lỗi đầu vào và tùy chọn', () => {
  const now = () => 0;
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now });
  assert.throws(() => w.take(''), code('RL_INVALID_KEY'));
  assert.throws(() => w.take('k', 0), code('RL_INVALID_COST'));
  assert.throws(() => w.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(w.size(), 0);
  assert.equal(w.take('k', 2).allowed, true);
  assert.throws(() => createSlidingWindow(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 0, windowMs: 1, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 1 }), code('RL_INVALID_OPTIONS'));
});
