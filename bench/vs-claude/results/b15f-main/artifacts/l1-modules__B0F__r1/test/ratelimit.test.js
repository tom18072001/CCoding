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

test('bucket: nạp lẻ 3 token / 2000ms, 667ms', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).allowed, true);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('bucket: nạp qua nhiều chu kỳ, không vượt capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  b.take('k', 5);
  c.t = 3000;
  assert.equal(b.peek('k').remaining, 3);
  c.t = 100000;
  assert.equal(b.peek('k').remaining, 5);
});

test('bucket: cost > 1, retryAfterMs theo phần thiếu, từ chối không tiêu', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  assert.deepEqual(b.take('k', 3), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.deepEqual(b.take('k', 4), { allowed: false, retryAfterMs: 2000, remaining: 2 });
  assert.equal(b.take('k', 2).allowed, true);
  assert.equal(b.take('k', 5).retryAfterMs, 5000);
});

test('bucket: cost bằng capacity hợp lệ, vượt thì ném và không tạo khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.throws(() => b.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(b.size(), 0);
  assert.equal(b.take('k', 2).allowed, true);
});

test('bucket: đồng hồ lùi không lùi mốc', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 0);
  c.t = 0;
  assert.equal(b.peek('k').remaining, 0);
  c.t = 2000; // mốc vẫn là 1000 (take) -> 1500 chỉ là peek, không đổi mốc
  assert.equal(b.take('k').allowed, true);
});

test('bucket: khóa độc lập, reset, peek không tạo khóa, sweep', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 1, now: c.now });
  assert.equal(b.peek('a').allowed, true);
  assert.equal(b.size(), 0);
  b.take('a');
  assert.equal(b.take('b').allowed, true);
  assert.equal(b.take('a').allowed, false);
  assert.equal(b.size(), 2);
  assert.equal(b.sweep(), 0);
  c.t = 1000;
  assert.equal(b.sweep(), 2);
  assert.equal(b.size(), 0);
  b.take('a');
  assert.equal(b.reset('a'), true);
  assert.equal(b.reset('a'), false);
});

test('lỗi: khóa, cost, thứ tự ưu tiên', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now: c.now });
  for (const x of [b, w]) {
    for (const k of ['', null, undefined, 5, {}]) {
      assert.throws(() => x.take(k), code('RL_INVALID_KEY'));
      assert.throws(() => x.peek(k, 0), code('RL_INVALID_KEY'));
      assert.throws(() => x.take(k, 99), code('RL_INVALID_KEY'));
    }
    for (const n of [0, -1, 1.5, '1', null, NaN]) {
      assert.throws(() => x.take('k', n), code('RL_INVALID_COST'));
    }
    assert.throws(() => x.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
    assert.equal(x.size(), 0);
  }
});

test('tùy chọn sai', () => {
  const now = () => 0;
  assert.throws(() => createTokenBucket(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1.5, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, now, refillAmount: 0 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, now, refillIntervalMs: -1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 0, windowMs: 5, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 5, now: 3 }), code('RL_INVALID_OPTIONS'));
});

test('cửa sổ: biên windowMs-1, windowMs, windowMs+1', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  for (let i = 0; i < 3; i++) w.take('k');
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.equal(w.take('k').allowed, true);
  const w2 = createSlidingWindow({ limit: 1, windowMs: 1000, now: c.now });
  c.t = 0;
  w2.take('k');
  c.t = 1001;
  assert.equal(w2.take('k').allowed, true);
});

test('cửa sổ: retryAfterMs theo sự kiện cũ nhất đủ giải phóng', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 1000, now: c.now });
  w.take('k', 1); // t=0
  c.t = 100;
  w.take('k', 2); // t=100
  c.t = 300;
  w.take('k', 2); // t=300, used=5
  c.t = 400;
  assert.deepEqual(w.take('k', 1), { allowed: false, retryAfterMs: 600, remaining: 0 });
  assert.equal(w.take('k', 3).retryAfterMs, 700); // cần giải phóng 3: 1+2 -> t=100
  assert.equal(w.peek('k', 5).retryAfterMs, 900);
  c.t = 1000;
  assert.deepEqual(w.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 1 });
});

test('cửa sổ: cost > 1, từ chối không tiêu, peek không tạo khóa', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 4, windowMs: 100, now: c.now });
  assert.deepEqual(w.peek('k', 2), { allowed: true, retryAfterMs: 0, remaining: 4 });
  assert.equal(w.size(), 0);
  assert.deepEqual(w.take('k', 3), { allowed: true, retryAfterMs: 0, remaining: 1 });
  assert.equal(w.take('k', 2).allowed, false);
  assert.equal(w.peek('k').remaining, 1);
  assert.equal(w.take('k', 4).allowed, false);
});

test('cửa sổ: đồng hồ lùi không ném, khóa độc lập, reset', () => {
  const c = clock(500);
  const w = createSlidingWindow({ limit: 1, windowMs: 100, now: c.now });
  w.take('a');
  c.t = 400;
  assert.doesNotThrow(() => w.take('a'));
  assert.equal(w.take('b').allowed, true);
  assert.equal(w.reset('a'), true);
  assert.equal(w.reset('zz'), false);
  assert.equal(w.size(), 1);
});
