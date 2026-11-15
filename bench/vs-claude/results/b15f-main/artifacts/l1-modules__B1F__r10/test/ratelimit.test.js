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

const code = (c) => (e) => e.code === c;

test('thứ tự lỗi: khóa → cost → cost vượt sức chứa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now: c.now });
  for (const l of [b, w]) {
    assert.throws(() => l.take('', 0), code('RL_INVALID_KEY'));
    assert.throws(() => l.take(5, 99), code('RL_INVALID_KEY'));
    assert.throws(() => l.take('k', 0), code('RL_INVALID_COST'));
    assert.throws(() => l.take('k', 1.5), code('RL_INVALID_COST'));
    assert.throws(() => l.take('k', '1'), code('RL_INVALID_COST'));
    assert.throws(() => l.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
    assert.throws(() => l.peek('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
    assert.equal(l.size(), 0);
    assert.equal(l.take('k', 2).allowed, true); // cost == capacity hợp lệ
  }
});

test('tùy chọn sai → RL_INVALID_OPTIONS', () => {
  const now = () => 0;
  assert.throws(() => createTokenBucket(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillAmount: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, refillIntervalMs: 1.5, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 0, now }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 5 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow(), code('RL_INVALID_OPTIONS'));
});

test('token bucket: nạp một phần chu kỳ, ceil retryAfterMs', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).remaining, 0);
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('token bucket: remaining là floor, chặn ở capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  b.take('k', 3);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 1);
  c.t = 1_000_000;
  assert.equal(b.peek('k').remaining, 3);
});

test('token bucket: đồng hồ đứng yên và đồng hồ lùi', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 500; // lùi: không có thời gian trôi qua
  assert.equal(b.take('k').allowed, false);
  c.t = 2000; // mốc cũ vẫn là 1000
  assert.equal(b.take('k').allowed, true);
});

test('peek không tạo khóa, không tiêu', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.deepEqual(b.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(b.size(), 0);
  b.take('k');
  assert.equal(b.peek('k').remaining, 1);
  assert.equal(b.peek('k').remaining, 1);
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

test('cửa sổ trượt: biên 999/1000, retryAfterMs', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual([1, 2, 3].map(() => w.take('k').remaining), [2, 1, 0]);
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  assert.equal(w.peek('k').allowed, false);
  c.t = 1000;
  assert.deepEqual(w.take('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
});

test('cửa sổ trượt: retryAfterMs theo cộng dồn cost sự kiện cũ', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 100, now: c.now });
  w.take('k', 1); // t=0
  c.t = 10;
  w.take('k', 1); // t=10
  c.t = 20;
  w.take('k', 3); // t=20, used=5
  c.t = 30;
  assert.deepEqual(w.take('k', 2), { allowed: false, retryAfterMs: 80, remaining: 0 });
  assert.equal(w.take('k', 4).retryAfterMs, 90);
  c.t = 110;
  assert.equal(w.take('k', 2).allowed, true);
});

test('cửa sổ trượt: nhiều khóa, đồng hồ đứng yên, reset, sweep', () => {
  const c = clock(50);
  const w = createSlidingWindow({ limit: 1, windowMs: 100, now: c.now });
  assert.equal(w.take('a').allowed, true);
  assert.equal(w.take('b').allowed, true);
  assert.equal(w.take('a').allowed, false);
  assert.equal(w.take('a').retryAfterMs, 100);
  assert.equal(w.peek('zzz').remaining, 1);
  assert.equal(w.size(), 2);
  assert.equal(w.sweep(), 0);
  assert.equal(w.reset('a'), true);
  assert.equal(w.reset('a'), false);
  assert.equal(w.take('a').allowed, true);
  c.t = 150;
  assert.equal(w.sweep(), 2);
  assert.equal(w.size(), 0);
});

test('lỗi có mã', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.throws(() => b.take('k', 3), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
  assert.throws(() => b.take(''), (e) => e.code === 'RL_INVALID_KEY');
});
