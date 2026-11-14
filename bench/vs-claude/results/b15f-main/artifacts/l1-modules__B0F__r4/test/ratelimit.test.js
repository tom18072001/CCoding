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

test('bucket 6/3/2000: 667 ms, tại 666 ms còn 1', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  for (let i = 0; i < 6; i++) assert.equal(b.take('k').allowed, true);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.equal(b.take('k').allowed, true);
});

test('bucket: nạp không vượt capacity, remaining là floor', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  b.take('k', 3);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 1);
  c.t = 1000000;
  assert.equal(b.peek('k').remaining, 3);
  assert.equal(b.take('k', 3).allowed, true);
});

test('bucket: từ chối không tiêu; peek không tạo khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 4, now: c.now });
  assert.equal(b.peek('k').remaining, 4);
  assert.equal(b.size(), 0);
  b.take('k', 3);
  assert.deepEqual(b.take('k', 2), { allowed: false, retryAfterMs: 1000, remaining: 1 });
  assert.equal(b.take('k', 1).allowed, true);
  assert.deepEqual(b.peek('k', 2), { allowed: false, retryAfterMs: 2000, remaining: 0 });
});

test('bucket: đồng hồ lùi giữ mốc cũ', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 1, now: c.now });
  b.take('k');
  c.t = 500;
  assert.equal(b.take('k').allowed, false);
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
});

test('bucket: sweep xóa khóa đã đầy, reset trả boolean', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('a');
  b.take('b', 2);
  assert.equal(b.sweep(), 0);
  c.t = 1000;
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 1);
  assert.equal(b.reset('b'), true);
  assert.equal(b.reset('b'), false);
});

test('cửa sổ: t=999 còn 1 ms, t=1000 được phép', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual([1, 2, 3].map(() => w.take('k').remaining), [2, 1, 0]);
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.equal(w.take('k').allowed, true);
});

test('cửa sổ: retryAfterMs cộng dồn cost từ sự kiện cũ nhất', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 1000, now: c.now });
  w.take('k', 1);
  c.t = 100;
  w.take('k', 1);
  c.t = 200;
  w.take('k', 3);
  c.t = 300;
  assert.deepEqual(w.peek('k', 1), { allowed: false, retryAfterMs: 700, remaining: 0 });
  assert.equal(w.peek('k', 2).retryAfterMs, 800);
  assert.equal(w.peek('k', 3).retryAfterMs, 900);
});

test('cửa sổ: peek không tạo khóa, reset', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  assert.equal(w.peek('k').remaining, 2);
  assert.equal(w.size(), 0);
  w.take('k');
  c.t = 50;
  w.take('k');
  c.t = 100;
  assert.equal(w.sweep(), 0);
  assert.equal(w.peek('k').remaining, 1);
  assert.equal(w.reset('k'), true);
  assert.equal(w.reset('k'), false);
});

test('kiểm đầu vào: key → cost → capacity', () => {
  const c = clock();
  for (const l of [
    createTokenBucket({ capacity: 2, now: c.now }),
    createSlidingWindow({ limit: 2, windowMs: 10, now: c.now }),
  ]) {
    assert.throws(() => l.take('', 0), code('RL_INVALID_KEY'));
    assert.throws(() => l.take(5, 'x'), code('RL_INVALID_KEY'));
    assert.throws(() => l.take('k', 0), code('RL_INVALID_COST'));
    assert.throws(() => l.take('k', 1.5), code('RL_INVALID_COST'));
    assert.throws(() => l.peek('k', -1), code('RL_INVALID_COST'));
    assert.throws(() => l.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
    assert.equal(l.size(), 0);
    assert.equal(l.take('k', 2).allowed, true);
    assert.equal(l.take('k', undefined).allowed, false);
  }
});

test('RL_INVALID_OPTIONS', () => {
  const now = () => 0;
  const bad = [
    () => createTokenBucket(),
    () => createTokenBucket(null),
    () => createTokenBucket({ now }),
    () => createTokenBucket({ capacity: 0, now }),
    () => createTokenBucket({ capacity: 1.5, now }),
    () => createTokenBucket({ capacity: 1, refillAmount: 0, now }),
    () => createTokenBucket({ capacity: 1, refillIntervalMs: -1, now }),
    () => createTokenBucket({ capacity: 1 }),
    () => createTokenBucket({ capacity: 1, now: 5 }),
    () => createSlidingWindow(),
    () => createSlidingWindow({ limit: 1, now }),
    () => createSlidingWindow({ limit: 0, windowMs: 1, now }),
    () => createSlidingWindow({ limit: 1, windowMs: '1', now }),
    () => createSlidingWindow({ limit: 1, windowMs: 1 }),
  ];
  for (const f of bad) assert.throws(f, code('RL_INVALID_OPTIONS'));
});
