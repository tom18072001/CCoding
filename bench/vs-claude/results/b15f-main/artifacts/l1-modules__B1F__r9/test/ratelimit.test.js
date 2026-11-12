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

test('token bucket: nạp phân số, 3 token / 2000ms', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  b.take('k', 6);
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.equal(b.take('k').allowed, true);
});

test('token bucket: đồng hồ lùi, peek, reset, sweep', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.equal(b.peek('x').remaining, 2);
  assert.equal(b.size(), 0);
  b.take('k', 2);
  c.t = 500;
  assert.equal(b.take('k').allowed, false);
  c.t = 2000;
  assert.equal(b.peek('k').remaining, 1);
  assert.equal(b.sweep(), 0);
  c.t = 3000;
  assert.equal(b.sweep(), 1);
  assert.equal(b.reset('k'), false);
  b.take('k');
  assert.equal(b.reset('k'), true);
});

test('kiểm tra đầu vào theo thứ tự khóa → cost → sức chứa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.throws(() => b.take(5, 0), (e) => e.code === 'RL_INVALID_KEY');
  assert.throws(() => b.take('k', 0), (e) => e.code === 'RL_INVALID_COST');
  assert.throws(() => b.take('k', 1.5), (e) => e.code === 'RL_INVALID_COST');
  assert.throws(() => b.peek('k', 3), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(b.size(), 0);
  assert.equal(b.take('k', 2).allowed, true);
});

test('tùy chọn sai', () => {
  const bad = (f) => assert.throws(f, (e) => e.code === 'RL_INVALID_OPTIONS');
  bad(() => createTokenBucket());
  bad(() => createTokenBucket({ capacity: 0, now: () => 0 }));
  bad(() => createTokenBucket({ capacity: 1 }));
  bad(() => createSlidingWindow({ limit: 1, windowMs: 0, now: () => 0 }));
  bad(() => createSlidingWindow({ limit: 1, windowMs: 1 }));
});

test('cửa sổ trượt: biên 999/1000 và remaining', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual([1, 2, 3].map(() => w.take('k').remaining), [2, 1, 0]);
  c.t = 999;
  assert.equal(w.take('k').retryAfterMs, 1);
  c.t = 1000;
  assert.equal(w.take('k').allowed, true);
});

test('cửa sổ trượt: cost nhiều, duyệt cũ đến mới', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 100, now: c.now });
  w.take('k', 2);
  c.t = 10;
  w.take('k', 2);
  c.t = 20;
  assert.deepEqual(w.peek('k', 3), { allowed: false, retryAfterMs: 80, remaining: 1 });
  assert.deepEqual(w.peek('k', 5), { allowed: false, retryAfterMs: 90, remaining: 1 });
  assert.throws(() => w.take('k', 6), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
});

test('lỗi có mã', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.throws(() => b.take('k', 3), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
  assert.throws(() => b.take(''), (e) => e.code === 'RL_INVALID_KEY');
});
