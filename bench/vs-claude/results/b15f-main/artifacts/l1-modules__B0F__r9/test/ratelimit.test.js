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

// ---- Mở rộng (S5) ----
const code = (c) => (e) => e.code === c;

test('bucket: ví dụ 667/666 ms (capacity 6, 3 token / 2000 ms)', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).allowed, true);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('bucket: nạp liên tục, remaining = floor, không vượt capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  b.take('k', 3);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 1);
  c.t = 1000000;
  assert.equal(b.peek('k').remaining, 3);
});

test('bucket: take bị từ chối không tiêu gì', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 500;
  assert.equal(b.take('k', 1).allowed, false);
  c.t = 1000;
  assert.equal(b.take('k', 1).allowed, true);
});

test('bucket: đồng hồ lùi giữ nguyên mốc cũ', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 1, now: c.now });
  b.take('k');
  c.t = 500;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 2000; // mốc vẫn là 1000 → đã trôi 1000 ms
  assert.equal(b.take('k').allowed, true);
});

test('bucket: trạng thái tách theo khóa, peek không tạo khóa, reset', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 1, now: c.now });
  assert.deepEqual(b.peek('x'), { allowed: true, retryAfterMs: 0, remaining: 1 });
  assert.equal(b.size(), 0);
  b.take('a');
  assert.equal(b.take('b').allowed, true);
  assert.equal(b.take('a').allowed, false);
  assert.equal(b.size(), 2);
  assert.equal(b.reset('a'), true);
  assert.equal(b.reset('a'), false);
});

test('bucket: sweep xóa khóa đã đầy lại', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('a');
  b.take('b', 2);
  c.t = 1000;
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 1);
  c.t = 2000;
  assert.equal(b.sweep(), 1);
});

test('bucket: cost = capacity hợp lệ, cost > capacity ném và không tạo khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.throws(() => b.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.throws(() => b.peek('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(b.size(), 0);
  assert.equal(b.take('k', 2).allowed, true);
});

test('thứ tự lỗi: key trước cost, cost sai trước vượt sức chứa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now: c.now });
  for (const x of [b, w]) {
    assert.throws(() => x.take('', 0), code('RL_INVALID_KEY'));
    assert.throws(() => x.take(5, 'x'), code('RL_INVALID_KEY'));
    assert.throws(() => x.take('k', 0), code('RL_INVALID_COST'));
    assert.throws(() => x.take('k', 1.5), code('RL_INVALID_COST'));
    assert.throws(() => x.take('k', null), code('RL_INVALID_COST'));
    assert.equal(x.take('k', undefined).allowed, true);
  }
});

test('option sai → RL_INVALID_OPTIONS', () => {
  const now = () => 0;
  assert.throws(() => createTokenBucket(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillAmount: 1.5, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillIntervalMs: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: '1', windowMs: 5, now }), code('RL_INVALID_OPTIONS'));
});

test('cửa sổ: ví dụ dòng 498 (t=0, 999, 1000)', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  const rem = [];
  for (let i = 0; i < 3; i++) rem.push(w.take('k').remaining);
  assert.deepEqual(rem, [2, 1, 0]);
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 999;
  assert.equal(w.take('k').retryAfterMs, 1);
  c.t = 1000;
  assert.equal(w.take('k').allowed, true);
});

test('cửa sổ: retryAfterMs cộng dồn từ sự kiện cũ nhất', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 1000, now: c.now });
  w.take('k', 1); // t=0
  c.t = 100;
  w.take('k', 2); // t=100
  c.t = 300;
  w.take('k', 2); // t=300, used = 5
  c.t = 400;
  // cost 3: cần giải phóng 3 → cộng dồn 1, 3 tại sự kiện t=100 → 100+1000-400
  assert.deepEqual(w.take('k', 3), { allowed: false, retryAfterMs: 700, remaining: 0 });
  // cost 1: cần giải phóng 1 → sự kiện t=0 → 0+1000-400
  assert.deepEqual(w.peek('k', 1), { allowed: false, retryAfterMs: 600, remaining: 0 });
  c.t = 1100;
  assert.deepEqual(w.peek('k', 1), { allowed: true, retryAfterMs: 0, remaining: 3 });
});

test('cửa sổ: peek không tạo khóa, khóa tách biệt, sweep', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 1, windowMs: 100, now: c.now });
  w.peek('x');
  assert.equal(w.size(), 0);
  w.take('a');
  c.t = 50;
  w.take('b');
  assert.equal(w.take('a').allowed, false);
  c.t = 100;
  assert.equal(w.sweep(), 1); // a hết hạn đúng tại 100, b còn
  assert.equal(w.size(), 1);
  assert.equal(w.reset('b'), true);
  assert.equal(w.reset('b'), false);
});

test('cửa sổ: cost > limit ném, không tạo khóa; cost = limit hợp lệ', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  assert.throws(() => w.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(w.size(), 0);
  assert.equal(w.take('k', 2).allowed, true);
});
