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

test('token bucket: cost > 1 và cost bằng capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  assert.deepEqual(b.take('k', 5), { allowed: true, retryAfterMs: 0, remaining: 0 });
  assert.deepEqual(b.take('k', 3), { allowed: false, retryAfterMs: 3000, remaining: 0 });
  c.t = 3000;
  assert.deepEqual(b.take('k', 3), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('token bucket: nạp phân số, retryAfterMs ceil, không vượt capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  b.take('k', 6);
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.equal(b.take('k').allowed, true);
  c.t = 1_000_000;
  assert.equal(b.peek('k').remaining, 6);
  assert.equal(b.take('k').remaining, 5);
});

test('token bucket: remaining là floor phần lẻ; peek không tạo khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, refillAmount: 1, refillIntervalMs: 1000, now: c.now });
  assert.equal(b.peek('x').remaining, 3);
  assert.equal(b.size(), 0);
  b.take('x', 3);
  c.t = 1500;
  assert.equal(b.peek('x').remaining, 1);
  assert.equal(b.size(), 1);
});

test('token bucket: đồng hồ lùi giữ mốc cũ', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 1, now: c.now });
  b.take('k');
  c.t = 500;
  assert.equal(b.take('k').retryAfterMs, 1000);
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
});

test('token bucket: nhiều khóa độc lập, reset, sweep', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 1, now: c.now });
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

test('cửa sổ trượt: retryAfterMs tại biên và nhiều sự kiện', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  w.take('k', 1);
  c.t = 300;
  w.take('k', 2);
  c.t = 999;
  assert.deepEqual(w.take('k', 1), { allowed: false, retryAfterMs: 1, remaining: 0 });
  assert.deepEqual(w.take('k', 3), { allowed: false, retryAfterMs: 301, remaining: 0 });
  c.t = 1000;
  assert.deepEqual(w.peek('k', 1), { allowed: true, retryAfterMs: 0, remaining: 1 });
  assert.deepEqual(w.take('k', 1), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('cửa sổ trượt: peek không tạo khóa, từ chối không tiêu, khóa độc lập', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 1, windowMs: 100, now: c.now });
  assert.equal(w.peek('a').remaining, 1);
  assert.equal(w.size(), 0);
  w.take('a');
  w.take('a');
  assert.equal(w.take('b').allowed, true);
  c.t = 100;
  assert.equal(w.take('a').allowed, true);
  assert.equal(w.reset('b'), true);
  assert.equal(w.reset('zz'), false);
});

test('thứ tự kiểm lỗi: khóa → cost → vượt sức chứa', () => {
  const c = clock();
  for (const m of [createTokenBucket({ capacity: 2, now: c.now }), createSlidingWindow({ limit: 2, windowMs: 10, now: c.now })]) {
    assert.throws(() => m.take('', 0), (e) => e.code === 'RL_INVALID_KEY');
    assert.throws(() => m.take(5, 99), (e) => e.code === 'RL_INVALID_KEY');
    assert.throws(() => m.take('k', 0), (e) => e.code === 'RL_INVALID_COST');
    assert.throws(() => m.take('k', 1.5), (e) => e.code === 'RL_INVALID_COST');
    assert.throws(() => m.peek('k', '1'), (e) => e.code === 'RL_INVALID_COST');
    assert.throws(() => m.take('k', 2.5), (e) => e.code === 'RL_INVALID_COST');
    assert.throws(() => m.take('k', 3), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
    assert.equal(m.size(), 0);
  }
});

test('lỗi cấu hình RL_INVALID_OPTIONS', () => {
  const now = () => 0;
  const bad = [
    () => createTokenBucket(),
    () => createTokenBucket({ capacity: 1 }),
    () => createTokenBucket({ now }),
    () => createTokenBucket({ capacity: 0, now }),
    () => createTokenBucket({ capacity: 1.5, now }),
    () => createTokenBucket({ capacity: 1, refillAmount: 0, now }),
    () => createTokenBucket({ capacity: 1, refillIntervalMs: -1, now }),
    () => createSlidingWindow(),
    () => createSlidingWindow({ limit: 1, windowMs: 0, now }),
    () => createSlidingWindow({ limit: '1', windowMs: 10, now }),
    () => createSlidingWindow({ limit: 1, windowMs: 10 }),
  ];
  for (const f of bad) assert.throws(f, (e) => e.code === 'RL_INVALID_OPTIONS');
});
