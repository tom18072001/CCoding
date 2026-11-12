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

test('token bucket: nạp phần lẻ, 667ms', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  b.take('k', 6);
  assert.equal(b.take('k').retryAfterMs, 667);
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.equal(b.take('k').allowed, true);
});

test('token bucket: nạp đến đầy, không vượt capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  b.take('k', 3);
  c.t = 100000;
  assert.equal(b.peek('k').remaining, 3);
  assert.equal(b.take('k').remaining, 2);
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

test('token bucket: peek không tạo khóa, reset, sweep, nhiều khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.deepEqual(b.peek('a'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(b.size(), 0);
  b.take('a', 2);
  b.take('b');
  assert.equal(b.take('a').allowed, false);
  assert.equal(b.take('b').remaining, 0);
  assert.equal(b.size(), 2);
  assert.equal(b.reset('a'), true);
  assert.equal(b.reset('a'), false);
  c.t = 2000;
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 0);
});

test('thứ tự lỗi: khóa → cost → vượt sức chứa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now: c.now });
  for (const l of [b, w]) {
    assert.throws(() => l.take('', 0), (e) => e.code === 'RL_INVALID_KEY');
    assert.throws(() => l.take(5, 'x'), (e) => e.code === 'RL_INVALID_KEY');
    assert.throws(() => l.take('k', 0), (e) => e.code === 'RL_INVALID_COST');
    assert.throws(() => l.take('k', 1.5), (e) => e.code === 'RL_INVALID_COST');
    assert.throws(() => l.peek('k', 99), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
    assert.equal(l.take('k', 2).allowed, true);
    assert.equal(l.size(), 1);
  }
});

test('lỗi cấu hình', () => {
  const bad = (f) => assert.throws(f, (e) => e.code === 'RL_INVALID_OPTIONS');
  bad(() => createTokenBucket());
  bad(() => createTokenBucket({ capacity: 0, now: () => 0 }));
  bad(() => createTokenBucket({ capacity: 1 }));
  bad(() => createTokenBucket({ capacity: 1, refillAmount: 0, now: () => 0 }));
  bad(() => createSlidingWindow());
  bad(() => createSlidingWindow({ limit: 1, windowMs: 1.5, now: () => 0 }));
  bad(() => createSlidingWindow({ limit: 1, windowMs: 5 }));
});

test('cửa sổ trượt: retryAfterMs theo sự kiện cũ và biên', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  w.take('k');
  c.t = 400;
  w.take('k', 2);
  assert.deepEqual(w.take('k', 1), { allowed: false, retryAfterMs: 600, remaining: 0 });
  c.t = 999;
  assert.equal(w.take('k', 1).retryAfterMs, 1);
  assert.equal(w.peek('k').remaining, 0);
  c.t = 1000;
  assert.deepEqual(w.take('k', 1), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('cửa sổ trượt: nhiều khóa độc lập, peek không tạo khóa', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 1, windowMs: 100, now: c.now });
  assert.equal(w.peek('x').remaining, 1);
  assert.equal(w.size(), 0);
  w.take('a');
  assert.equal(w.take('b').allowed, true);
  assert.equal(w.take('a').allowed, false);
  assert.equal(w.reset('a'), true);
  assert.equal(w.take('a').allowed, true);
});
