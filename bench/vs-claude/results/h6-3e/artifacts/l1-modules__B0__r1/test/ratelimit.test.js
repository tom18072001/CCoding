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

test('token bucket: nạp lẻ 3/2000ms, biên 666/667', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).remaining, 0);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.equal(b.take('k').allowed, true);
});

test('token bucket: không vượt capacity, cost = capacity hợp lệ, remaining floor', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, refillAmount: 1, refillIntervalMs: 1000, now: c.now });
  assert.equal(b.take('k', 3).allowed, true);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 1);
  c.t = 999999;
  assert.equal(b.peek('k').remaining, 3);
});

test('token bucket: đồng hồ lùi không lùi mốc; từ chối không tiêu; peek không tạo khóa', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 1, now: c.now });
  assert.equal(b.peek('x').allowed, true);
  assert.equal(b.size(), 0);
  b.take('k');
  c.t = 500;
  assert.equal(b.take('k').retryAfterMs, 1000);
  c.t = 2000; // mốc cũ vẫn là 1000 -> đã nạp đủ
  assert.equal(b.take('k').allowed, true);
});

test('token bucket: sweep xóa khóa đã đầy, reset', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('a'); b.take('b', 2);
  assert.equal(b.sweep(), 0);
  c.t = 1000;
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 1);
  assert.equal(b.reset('b'), true);
  assert.equal(b.reset('b'), false);
});

test('cửa sổ trượt: biên 999/1000, peek, nhiều cost', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  w.take('k'); w.take('k'); w.take('k');
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.deepEqual(w.peek('k', 3), { allowed: true, retryAfterMs: 0, remaining: 3 });
  assert.equal(w.take('k', 3).remaining, 0);
});

test('cửa sổ trượt: retryAfterMs duyệt từ cũ đến mới', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 4, windowMs: 1000, now: c.now });
  w.take('k', 1); c.t = 100; w.take('k', 1); c.t = 200; w.take('k', 2);
  c.t = 300;
  assert.equal(w.take('k', 2).retryAfterMs, 800); // cần 2: sự kiện t=0 + t=100 -> t=100+1000-300
  assert.equal(w.take('k', 1).retryAfterMs, 700);
});

test('cửa sổ trượt: sweep giữ khóa còn sự kiện, reset', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  w.take('a'); c.t = 50; w.take('b');
  c.t = 100;
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 1);
  assert.equal(w.reset('b'), true);
  assert.equal(w.reset('zz'), false);
});

test('mã lỗi: thứ tự khóa -> cost -> sức chứa, và tùy chọn', () => {
  const c = clock();
  for (const mk of [() => createTokenBucket({ capacity: 2, now: c.now }), () => createSlidingWindow({ limit: 2, now: c.now, windowMs: 10 })]) {
    const l = mk();
    for (const m of ['take', 'peek']) {
      assert.throws(() => l[m](5, 0), { code: 'RL_INVALID_KEY' });
      assert.throws(() => l[m]('k', 0), { code: 'RL_INVALID_COST' });
      assert.throws(() => l[m]('k', 1.5), { code: 'RL_INVALID_COST' });
      assert.throws(() => l[m]('k', '1'), { code: 'RL_INVALID_COST' });
      assert.throws(() => l[m]('k', 3), { code: 'RL_COST_EXCEEDS_CAPACITY' });
    }
    assert.equal(l.size(), 0);
    assert.equal(l.take('k', undefined).remaining, 1);
  }
  assert.throws(() => createTokenBucket(), { code: 'RL_INVALID_OPTIONS' });
  assert.throws(() => createTokenBucket({ capacity: 0, now: c.now }), { code: 'RL_INVALID_OPTIONS' });
  assert.throws(() => createTokenBucket({ capacity: 1 }), { code: 'RL_INVALID_OPTIONS' });
  assert.throws(() => createTokenBucket({ capacity: 1, refillAmount: 0, now: c.now }), { code: 'RL_INVALID_OPTIONS' });
  assert.throws(() => createSlidingWindow({ limit: 1, now: c.now }), { code: 'RL_INVALID_OPTIONS' });
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 1 }), { code: 'RL_INVALID_OPTIONS' });
  assert.throws(() => createSlidingWindow(), { code: 'RL_INVALID_OPTIONS' });
});
