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

test('bucket: nạp phần lẻ, retryAfterMs ceil (capacity 6, +3/2000ms)', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).remaining, 0);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('bucket: không vượt capacity và đúng biên interval', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, refillAmount: 2, refillIntervalMs: 1000, now: c.now });
  b.take('k', 3);
  c.t = 999;
  assert.equal(b.peek('k').remaining, 1);
  c.t = 1000;
  assert.equal(b.peek('k').remaining, 2);
  c.t = 1_000_000;
  assert.equal(b.peek('k').remaining, 3);
  assert.equal(b.take('k', 3).allowed, true);
});

test('bucket: đồng hồ lùi không lùi mốc, không nạp thêm', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 500;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 2000; // mốc vẫn là 1000 → đã trôi 1000ms
  assert.equal(b.take('k').allowed, true);
});

test('bucket: peek không tạo khóa, không tiêu; từ chối không tiêu; khóa độc lập', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.deepEqual(b.peek('x'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(b.size(), 0);
  b.take('a', 2);
  assert.equal(b.take('a').allowed, false);
  assert.equal(b.take('b').remaining, 1);
  assert.equal(b.peek('a').remaining, 0);
  assert.equal(b.size(), 2);
});

test('bucket: reset và sweep', () => {
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

test('bucket: cost đúng bằng capacity hợp lệ; vượt thì ném và không tạo khóa', () => {
  const b = createTokenBucket({ capacity: 2, now: clock().now });
  assert.throws(() => b.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.throws(() => b.peek('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(b.size(), 0);
  assert.equal(b.take('k', 2).allowed, true);
});

test('cửa sổ: cost nhiều, retryAfterMs theo sự kiện cũ, biên 999/1000', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.equal(w.take('k').remaining, 2); // t=0
  c.t = 400;
  assert.equal(w.take('k', 2).remaining, 0); // t=400
  c.t = 500;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 500, remaining: 0 });
  assert.deepEqual(w.take('k', 3), { allowed: false, retryAfterMs: 900, remaining: 0 });
  c.t = 999;
  assert.equal(w.take('k').allowed, false);
  c.t = 1000;
  assert.deepEqual(w.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 1 });
  assert.equal(w.take('k').remaining, 0);
});

test('cửa sổ: ví dụ SPEC t=0/999/1000', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  for (let i = 0; i < 3; i++) w.take('k');
  assert.equal(w.take('k').retryAfterMs, 1000);
  c.t = 999;
  assert.equal(w.take('k').retryAfterMs, 1);
  c.t = 1000;
  assert.equal(w.take('k').allowed, true);
});

test('cửa sổ: peek không tạo khóa, reset, sweep, cost vượt limit', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  assert.deepEqual(w.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(w.size(), 0);
  assert.throws(() => w.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(w.size(), 0);
  w.take('a');
  w.take('b');
  assert.equal(w.reset('a'), true);
  assert.equal(w.reset('a'), false);
  c.t = 99;
  assert.equal(w.sweep(), 0);
  c.t = 100;
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 0);
});

test('RL_INVALID_KEY', () => {
  for (const mk of [createTokenBucket, createSlidingWindow]) {
    const l = mk({ capacity: 2, limit: 2, windowMs: 10, now: clock().now });
    for (const k of ['', undefined, null, 5, {}]) {
      assert.throws(() => l.take(k), code('RL_INVALID_KEY'));
      assert.throws(() => l.peek(k), code('RL_INVALID_KEY'));
    }
  }
});

test('RL_INVALID_COST', () => {
  const l = createTokenBucket({ capacity: 2, now: clock().now });
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now: clock().now });
  for (const x of [0, -1, 1.5, '1', null, NaN]) {
    assert.throws(() => l.take('k', x), code('RL_INVALID_COST'));
    assert.throws(() => w.take('k', x), code('RL_INVALID_COST'));
  }
});

test('thứ tự ưu tiên lỗi: khóa → cost → cost vượt sức chứa', () => {
  const l = createTokenBucket({ capacity: 2, now: clock().now });
  assert.throws(() => l.take('', 0), code('RL_INVALID_KEY'));
  assert.throws(() => l.take('', 99), code('RL_INVALID_KEY'));
  assert.throws(() => l.take('k', 0), code('RL_INVALID_COST'));
  assert.throws(() => l.take('k', 99.5), code('RL_INVALID_COST'));
  assert.throws(() => l.take('k', 99), code('RL_COST_EXCEEDS_CAPACITY'));
});

test('RL_INVALID_OPTIONS', () => {
  const now = () => 0;
  assert.throws(() => createTokenBucket(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1.5, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillAmount: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillIntervalMs: -5, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, now: 5 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: '1', windowMs: 5, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 5 }), code('RL_INVALID_OPTIONS'));
});
