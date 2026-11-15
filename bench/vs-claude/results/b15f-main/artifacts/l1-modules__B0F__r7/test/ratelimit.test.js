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

test('token bucket: nạp phân số 3/2000ms, 667ms', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).allowed, true);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('token bucket: nạp không vượt capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  b.take('k', 3);
  c.t = 1_000_000;
  assert.equal(b.peek('k').remaining, 3);
  assert.equal(b.take('k').remaining, 2);
});

test('token bucket: nạp theo chu kỳ, remaining là floor', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 10, refillAmount: 2, refillIntervalMs: 1000, now: c.now });
  assert.equal(b.take('k', 10).remaining, 0);
  c.t = 1500; // 3 token
  assert.equal(b.peek('k').remaining, 3);
  c.t = 1749; // 3.498 token
  assert.equal(b.peek('k').remaining, 3);
  c.t = 2000;
  assert.equal(b.take('k', 4).remaining, 0);
});

test('token bucket: cost = capacity hợp lệ, cost > capacity ném', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 4, now: c.now });
  assert.equal(b.take('k', 4).allowed, true);
  assert.throws(() => b.take('x', 5), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(b.size(), 1);
  assert.throws(() => b.peek('x', 5), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
});

test('các khóa độc lập và reset', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 1, now: c.now });
  assert.equal(b.take('a').allowed, true);
  assert.equal(b.take('b').allowed, true);
  assert.equal(b.take('a').allowed, false);
  assert.equal(b.reset('a'), true);
  assert.equal(b.reset('a'), false);
  assert.equal(b.take('a').allowed, true);
  const w = createSlidingWindow({ limit: 1, windowMs: 100, now: c.now });
  assert.equal(w.take('a').allowed, true);
  assert.equal(w.take('b').allowed, true);
  assert.equal(w.take('a').allowed, false);
  assert.equal(w.reset('a'), true);
  assert.equal(w.reset('a'), false);
});

test('peek không tiêu token và không tạo khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.deepEqual(b.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(b.size(), 0);
  b.take('k', 2);
  assert.deepEqual(b.peek('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  assert.deepEqual(b.peek('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  assert.deepEqual(w.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(w.size(), 0);
  w.take('k');
  assert.deepEqual(w.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 1 });
  assert.deepEqual(w.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 1 });
});

test('token bucket: đồng hồ lùi giữ nguyên mốc cũ', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 500; // lùi: không nạp thêm
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 2000; // mốc vẫn là 1000 → trôi 1000ms = 1 token
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('token bucket: sweep xóa khóa đã đầy lại', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('a', 2);
  b.take('b', 1);
  c.t = 1000;
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 1);
});

test('cửa sổ trượt: biên tại windowMs, retryAfterMs 999 → 1', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  for (let i = 0; i < 3; i++) assert.equal(w.take('k').remaining, 2 - i);
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.equal(w.take('k').allowed, true);
});

test('cửa sổ trượt: retryAfterMs theo cộng dồn cost sự kiện cũ', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 1000, now: c.now });
  w.take('k', 2); // t=0
  c.t = 300;
  w.take('k', 2); // t=300
  c.t = 400;
  // used=4, cost 3 → cần giải phóng 2 → sự kiện t=0 → 600
  assert.deepEqual(w.take('k', 3), { allowed: false, retryAfterMs: 600, remaining: 1 });
  // cost 5 → cần 4 → sự kiện t=300 → 900
  assert.deepEqual(w.take('k', 5), { allowed: false, retryAfterMs: 900, remaining: 1 });
});

test('cửa sổ trượt: cost = limit hợp lệ, cost > limit ném', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  assert.equal(w.take('k', 2).allowed, true);
  assert.throws(() => w.take('z', 3), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
  assert.equal(w.size(), 1);
});

test('cửa sổ trượt: sweep giữ khóa còn sự kiện hiệu lực', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  w.take('a');
  c.t = 50;
  w.take('b');
  c.t = 100;
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 1);
});

test('mã lỗi và thứ tự kiểm: khóa → cost → sức chứa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now: c.now });
  for (const l of [b, w]) {
    assert.throws(() => l.take(5, 'x'), (e) => e.code === 'RL_INVALID_KEY');
    assert.throws(() => l.take('', 99), (e) => e.code === 'RL_INVALID_KEY');
    assert.throws(() => l.take('k', 0), (e) => e.code === 'RL_INVALID_COST');
    assert.throws(() => l.take('k', 1.5), (e) => e.code === 'RL_INVALID_COST');
    assert.throws(() => l.peek('k', -1), (e) => e.code === 'RL_INVALID_COST');
    assert.throws(() => l.take('k', null), (e) => e.code === 'RL_INVALID_COST');
    assert.throws(() => l.take('k', 3), (e) => e.code === 'RL_COST_EXCEEDS_CAPACITY');
    assert.throws(() => l.reset(''), (e) => e.code === 'RL_INVALID_KEY');
  }
});

test('tùy chọn sai → RL_INVALID_OPTIONS', () => {
  const bad = (f) => assert.throws(f, (e) => e.code === 'RL_INVALID_OPTIONS');
  const now = () => 0;
  bad(() => createTokenBucket());
  bad(() => createTokenBucket({ capacity: 0, now }));
  bad(() => createTokenBucket({ capacity: 1.5, now }));
  bad(() => createTokenBucket({ capacity: 1 }));
  bad(() => createTokenBucket({ capacity: 1, refillAmount: 0, now }));
  bad(() => createTokenBucket({ capacity: 1, refillIntervalMs: -1, now }));
  bad(() => createSlidingWindow());
  bad(() => createSlidingWindow({ limit: 1, windowMs: 0, now }));
  bad(() => createSlidingWindow({ limit: '1', windowMs: 1, now }));
  bad(() => createSlidingWindow({ limit: 1, windowMs: 1 }));
});
