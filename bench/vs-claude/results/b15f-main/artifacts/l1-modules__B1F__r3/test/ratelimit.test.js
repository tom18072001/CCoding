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

test('token bucket: nạp lẻ và retryAfterMs làm tròn lên', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).allowed, true);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.equal(b.take('k').allowed, true);
});

test('token bucket: không vượt capacity, đồng hồ đứng yên không nạp', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  c.t = 100000;
  assert.equal(b.take('k').remaining, 1);
  assert.equal(b.take('k').remaining, 0);
  assert.equal(b.take('k').allowed, false);
  assert.equal(b.take('k').allowed, false);
});

test('token bucket: đồng hồ lùi không lùi mốc', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 1, now: c.now });
  b.take('k');
  c.t = 500;
  assert.equal(b.take('k').retryAfterMs, 1000);
  c.t = 2000; // mốc vẫn là 1000 => đã trôi 1000ms
  assert.equal(b.take('k').allowed, true);
});

test('token bucket: peek không tạo khóa, không tiêu; cost = capacity hợp lệ', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  assert.deepEqual(b.peek('k', 3), { allowed: true, retryAfterMs: 0, remaining: 3 });
  assert.equal(b.size(), 0);
  assert.equal(b.take('k', 3).allowed, true);
  assert.deepEqual(b.peek('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
});

test('token bucket: nhiều khóa độc lập, reset, sweep', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('a', 2);
  b.take('b');
  assert.equal(b.take('a').allowed, false);
  assert.equal(b.take('b').remaining, 0);
  assert.equal(b.size(), 2);
  assert.equal(b.reset('zzz'), false);
  assert.equal(b.reset('b'), true);
  assert.equal(b.size(), 1);
  c.t = 1999;
  assert.equal(b.sweep(), 0);
  c.t = 2000;
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 0);
});

test('lỗi: thứ tự khóa → cost → vượt sức chứa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.throws(() => b.take(5, 0), code('RL_INVALID_KEY'));
  assert.throws(() => b.take('', 'x'), code('RL_INVALID_KEY'));
  for (const bad of [0, -1, 1.5, '1', null, NaN]) {
    assert.throws(() => b.take('k', bad), code('RL_INVALID_COST'));
  }
  assert.throws(() => b.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.throws(() => b.peek('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(b.size(), 0);
});

test('lỗi: tùy chọn sai', () => {
  const now = () => 0;
  assert.throws(() => createTokenBucket(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillAmount: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillIntervalMs: 1.5, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 10 }), code('RL_INVALID_OPTIONS'));
});

test('cửa sổ trượt: biên 999/1000 và retryAfterMs theo sự kiện', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual([1, 2, 3].map(() => w.take('k').remaining), [2, 1, 0]);
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.deepEqual(w.take('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
});

test('cửa sổ trượt: cost > 1 chọn đúng sự kiện cuối cần hết hạn', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 100, now: c.now });
  w.take('k', 2); // t=0
  c.t = 30;
  w.take('k', 1); // t=30
  c.t = 60;
  w.take('k', 2); // t=60, used=5
  c.t = 70;
  // cần 4: cộng dồn 2,3,5 => sự kiện t=60 => 60+100-70 = 90
  assert.deepEqual(w.take('k', 4), { allowed: false, retryAfterMs: 90, remaining: 0 });
  assert.deepEqual(w.take('k', 3), { allowed: false, retryAfterMs: 60, remaining: 0 }); // cần 3 => sự kiện t=30
  assert.equal(w.peek('k', 5).remaining, 0);
});

test('cửa sổ trượt: peek không tạo khóa, đồng hồ đứng yên, khóa độc lập, reset', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 50, now: c.now });
  assert.deepEqual(w.peek('a', 2), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(w.size(), 0);
  w.take('a', 2);
  assert.equal(w.take('a').allowed, false);
  assert.equal(w.take('b').allowed, true);
  assert.equal(w.size(), 2);
  assert.equal(w.reset('a'), true);
  assert.equal(w.reset('a'), false);
  assert.equal(w.take('a', 2).allowed, true);
  assert.throws(() => w.take('a', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.throws(() => w.take('a', 0), code('RL_INVALID_COST'));
  c.t = 50;
  assert.equal(w.sweep(), 2);
});
