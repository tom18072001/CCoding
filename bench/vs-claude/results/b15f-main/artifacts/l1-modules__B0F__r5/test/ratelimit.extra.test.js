import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenBucket, createSlidingWindow } from '../src/ratelimit/index.js';

function clock(start = 0) {
  const c = { t: start, now: () => c.t };
  return c;
}
const code = (c) => (e) => e.code === c;

test('bucket: nạp liên tục 3/2000ms, đúng mốc 667 và lệch 1ms', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).remaining, 0);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('bucket: remaining là floor của phần lẻ; không vượt capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  b.take('k', 3);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 1);
  c.t = 1_000_000;
  assert.equal(b.peek('k').remaining, 3);
});

test('bucket: cost == capacity hợp lệ; cost > capacity ném và không tạo khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.throws(() => b.take('x', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(b.size(), 0);
  assert.equal(b.take('x', 2).allowed, true);
  assert.equal(b.size(), 1);
});

test('bucket: thứ tự kiểm tra khóa → cost → sức chứa', () => {
  const b = createTokenBucket({ capacity: 2, now: () => 0 });
  assert.throws(() => b.take('', 0), code('RL_INVALID_KEY'));
  assert.throws(() => b.take(5, 99), code('RL_INVALID_KEY'));
  assert.throws(() => b.take('k', 0), code('RL_INVALID_COST'));
  assert.throws(() => b.take('k', 1.5), code('RL_INVALID_COST'));
  assert.throws(() => b.peek('k', -1), code('RL_INVALID_COST'));
  assert.throws(() => b.peek('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
});

test('bucket: từ chối không tiêu; peek không tạo khóa; reset trả boolean', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.deepEqual(b.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(b.size(), 0);
  b.take('k', 2);
  b.take('k');
  c.t = 1000;
  assert.equal(b.take('k').allowed, true);
  assert.equal(b.reset('k'), true);
  assert.equal(b.reset('k'), false);
});

test('bucket: nhiều khóa độc lập', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 1, now: c.now });
  assert.equal(b.take('a').allowed, true);
  assert.equal(b.take('a').allowed, false);
  assert.equal(b.take('b').allowed, true);
  assert.equal(b.size(), 2);
});

test('bucket: đồng hồ lùi không lùi mốc cập nhật', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 1, now: c.now });
  b.take('k');
  c.t = 500;
  assert.equal(b.take('k').allowed, false);
  c.t = 1999;
  assert.equal(b.take('k').retryAfterMs, 1);
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
});

test('bucket: sweep chỉ xóa khóa đã đầy lại', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k');
  c.t = 999;
  assert.equal(b.sweep(), 0);
  c.t = 1000;
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 0);
});

test('bucket: lỗi cấu hình', () => {
  const now = () => 0;
  assert.throws(() => createTokenBucket(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1.5, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillAmount: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillIntervalMs: '5', now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, now: 5 }), code('RL_INVALID_OPTIONS'));
});

test('cửa sổ: biên t-windowMs (999 từ chối, 1000 cho phép)', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  for (let i = 0; i < 3; i++) w.take('k');
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.deepEqual(w.take('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
});

test('cửa sổ: retryAfterMs duyệt sự kiện cũ → mới', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 1000, now: c.now });
  w.take('k', 2); // t=0
  c.t = 100;
  w.take('k', 3); // t=100, used=5
  c.t = 200;
  // cost 2: goal = 2 → sự kiện t=0 → 800
  assert.equal(w.take('k', 2).retryAfterMs, 800);
  // cost 3: goal = 3 → cộng dồn 2 < 3, rồi 5 ≥ 3 → sự kiện t=100 → 900
  assert.equal(w.take('k', 3).retryAfterMs, 900);
  assert.equal(w.peek('k').remaining, 0);
});

test('cửa sổ: peek không tạo khóa, remaining trước khi trừ', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual(w.peek('k', 2), { allowed: true, retryAfterMs: 0, remaining: 3 });
  assert.equal(w.size(), 0);
  w.take('k');
  assert.equal(w.peek('k', 2).remaining, 2);
  assert.equal(w.size(), 1);
});

test('cửa sổ: cost và kiểm tra đầu vào', () => {
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now: () => 0 });
  assert.throws(() => w.take('', 9), code('RL_INVALID_KEY'));
  assert.throws(() => w.take('k', 0), code('RL_INVALID_COST'));
  assert.throws(() => w.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(w.size(), 0);
  assert.equal(w.take('k', 2).allowed, true);
});

test('cửa sổ: nhiều khóa độc lập, reset, sweep', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 1, windowMs: 100, now: c.now });
  w.take('a');
  w.take('b');
  assert.equal(w.take('a').allowed, false);
  assert.equal(w.reset('a'), true);
  assert.equal(w.reset('a'), false);
  assert.equal(w.take('a').allowed, true);
  c.t = 99;
  assert.equal(w.sweep(), 0);
  c.t = 100;
  assert.equal(w.sweep(), 2);
  assert.equal(w.size(), 0);
});

test('cửa sổ: lỗi cấu hình', () => {
  const now = () => 0;
  assert.throws(() => createSlidingWindow(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 0, windowMs: 1, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 1.5, now }), code('RL_INVALID_OPTIONS'));
});
