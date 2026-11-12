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

test('bucket: nạp từng phần, remaining là floor, không vượt capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  for (let i = 0; i < 6; i++) b.take('k');
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
  c.t = 667 + 1999; // 1999ms -> 2.9985 + 0.0005 token
  assert.equal(b.peek("k").remaining, 2);
  c.t = 1e9;
  assert.equal(b.peek('k').remaining, 6);
});

test('bucket: retryAfterMs làm tròn lên với cost > 1', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  b.take('k', 5);
  c.t = 500; // 0.5 token
  assert.deepEqual(b.take('k', 2), { allowed: false, retryAfterMs: 1500, remaining: 0 });
});

test('bucket: cost bằng capacity hợp lệ, lớn hơn thì ném và không tạo khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  assert.throws(() => b.take('x', 4), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(b.size(), 0);
  assert.deepEqual(b.take('x', 3), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('bucket: đồng hồ lùi không nạp thêm và không lùi mốc', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 500;
  assert.equal(b.take('k').allowed, false);
  c.t = 1999; // mốc vẫn là 1000 -> 0.999 token
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
});

test('bucket: từ chối không tiêu; peek không tạo khóa và không tiêu', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.deepEqual(b.peek('n'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(b.size(), 0);
  b.take('k', 2);
  assert.equal(b.take('k', 2).allowed, false);
  assert.equal(b.peek('k').remaining, 0);
  c.t = 1000;
  assert.equal(b.peek('k').remaining, 1);
  assert.equal(b.take('k').remaining, 0);
});

test('bucket: nhiều khóa độc lập, reset, sweep', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 1, now: c.now });
  b.take('a');
  assert.equal(b.take('b').allowed, true);
  assert.equal(b.take('a').allowed, false);
  assert.equal(b.size(), 2);
  assert.equal(b.reset('a'), true);
  assert.equal(b.reset('a'), false);
  assert.equal(b.take('a').allowed, true);
  assert.equal(b.sweep(), 0);
  c.t = 1000;
  assert.equal(b.sweep(), 2);
  assert.equal(b.size(), 0);
});

test('thứ tự lỗi: khóa → cost → vượt sức chứa', () => {
  const c = clock();
  for (const l of [createTokenBucket({ capacity: 2, now: c.now }), createSlidingWindow({ limit: 2, windowMs: 10, now: c.now })]) {
    assert.throws(() => l.take('', 0), (e) => e.code === 'RL_INVALID_KEY');
    assert.throws(() => l.take(5, 99), (e) => e.code === 'RL_INVALID_KEY');
    assert.throws(() => l.take('k', 1.5), (e) => e.code === 'RL_INVALID_COST');
    assert.throws(() => l.take('k', 0), (e) => e.code === 'RL_INVALID_COST');
    assert.throws(() => l.peek('k', '2'), (e) => e.code === 'RL_INVALID_COST');
    assert.throws(() => l.take('k', 3), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
    assert.equal(l.take('k', undefined).allowed, true);
  }
});

test('tùy chọn sai → RL_INVALID_OPTIONS', () => {
  const now = () => 0;
  const bad = [
    () => createTokenBucket(),
    () => createTokenBucket({ capacity: 0, now }),
    () => createTokenBucket({ capacity: 1.5, now }),
    () => createTokenBucket({ capacity: 1 }),
    () => createTokenBucket({ capacity: 1, refillAmount: 0, now }),
    () => createTokenBucket({ capacity: 1, refillIntervalMs: -1, now }),
    () => createSlidingWindow(),
    () => createSlidingWindow({ limit: 1, now }),
    () => createSlidingWindow({ limit: 1, windowMs: 0, now }),
    () => createSlidingWindow({ limit: 1, windowMs: 5, now: 3 }),
  ];
  for (const f of bad) assert.throws(f, (e) => e.code === 'RL_INVALID_OPTIONS');
});

test('cửa sổ: biên 999/1000 và retryAfterMs', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  for (let i = 0; i < 3; i++) w.take('k');
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.deepEqual(w.take('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
});

test('cửa sổ: retryAfterMs theo sự kiện cũ cần hết hiệu lực (cost, cộng dồn)', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 1000, now: c.now });
  w.take('k', 1); // t=0
  c.t = 100;
  w.take('k', 1); // t=100
  c.t = 300;
  w.take('k', 3); // t=300, used=5
  c.t = 400;
  assert.deepEqual(w.take('k', 1), { allowed: false, retryAfterMs: 600, remaining: 0 });
  assert.deepEqual(w.take('k', 2), { allowed: false, retryAfterMs: 700, remaining: 0 });
  assert.deepEqual(w.take('k', 3), { allowed: false, retryAfterMs: 900, remaining: 0 });
  c.t = 1000;
  assert.equal(w.peek('k', 1).remaining, 1); // chỉ sự kiện t=0 đã hết hiệu lực
  assert.equal(w.take('k', 2).allowed, false);
  c.t = 1100;
  assert.equal(w.take('k', 2).allowed, true);
});

test('cửa sổ: cost bằng limit hợp lệ, lớn hơn thì ném không tạo khóa; peek không tạo khóa', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 50, now: c.now });
  assert.throws(() => w.take('k', 3), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
  assert.deepEqual(w.peek('k', 2), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(w.size(), 0);
  assert.deepEqual(w.take('k', 2), { allowed: true, retryAfterMs: 0, remaining: 0 });
  assert.equal(w.size(), 1);
});

test('cửa sổ: nhiều khóa độc lập, reset, sweep còn khóa sống', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 1, windowMs: 100, now: c.now });
  w.take('a');
  c.t = 60;
  w.take('b');
  assert.equal(w.take('a').allowed, false);
  c.t = 100;
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 1);
  assert.equal(w.take('a').allowed, true);
  assert.equal(w.reset('b'), true);
  assert.equal(w.reset('zz'), false);
});
