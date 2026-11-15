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

const codeOf = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('token bucket: nạp phân số, retryAfterMs làm tròn lên', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).allowed, true);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('token bucket: không vượt capacity, remaining là floor', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, refillAmount: 1, refillIntervalMs: 1000, now: c.now });
  b.take('k', 3);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 1);
  c.t = 1e9;
  assert.equal(b.peek('k').remaining, 3);
  assert.equal(b.take('k').remaining, 2);
});

test('token bucket: từ chối không tiêu; peek không tạo khóa; đồng hồ lùi', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.equal(b.peek('x').remaining, 2);
  assert.equal(b.size(), 0);
  assert.equal(b.take('k', 2).allowed, true);
  assert.equal(b.take('k', 2).allowed, false);
  assert.equal(b.size(), 1);
  c.t = 500; // lùi: không có thời gian trôi, mốc giữ nguyên
  assert.equal(b.take('k').allowed, false);
  c.t = 2000; // 1000ms kể từ mốc 1000 -> 1 token
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
  assert.equal(b.peek('k', 2).allowed, false);
  assert.equal(b.peek('k', 2).remaining, 0);
});

test('token bucket: reset, sweep, size', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('a');
  b.take('b', 2);
  assert.equal(b.size(), 2);
  assert.equal(b.reset('a'), true);
  assert.equal(b.reset('a'), false);
  assert.equal(b.sweep(), 0);
  c.t = 2000;
  assert.equal(b.size(), 1);
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 0);
});

test('kiểm tra đầu vào và thứ tự lỗi', () => {
  const c = clock();
  for (const make of [createTokenBucket, createSlidingWindow]) {
    const cap = make === createTokenBucket ? { capacity: 3 } : { limit: 3, windowMs: 100 };
    const l = make({ ...cap, now: c.now });
    assert.equal(codeOf(() => l.take('', 0)), 'RL_INVALID_KEY');
    assert.equal(codeOf(() => l.take(5)), 'RL_INVALID_KEY');
    for (const bad of [0, -1, 1.5, '1', null, NaN]) assert.equal(codeOf(() => l.take('k', bad)), 'RL_INVALID_COST');
    assert.equal(codeOf(() => l.take('k', 4)), 'RL_COST_EXCEEDS_CAPACITY');
    assert.equal(codeOf(() => l.peek('k', 4)), 'RL_COST_EXCEEDS_CAPACITY');
    assert.equal(l.size(), 0);
    assert.equal(l.take('k', 3).allowed, true);
  }
  assert.equal(codeOf(() => createTokenBucket()), 'RL_INVALID_OPTIONS');
  assert.equal(codeOf(() => createTokenBucket({ capacity: 1 })), 'RL_INVALID_OPTIONS');
  assert.equal(codeOf(() => createTokenBucket({ capacity: 0, now: c.now })), 'RL_INVALID_OPTIONS');
  assert.equal(codeOf(() => createTokenBucket({ capacity: 1, refillAmount: 0, now: c.now })), 'RL_INVALID_OPTIONS');
  assert.equal(codeOf(() => createTokenBucket({ capacity: 1, refillIntervalMs: 1.5, now: c.now })), 'RL_INVALID_OPTIONS');
  assert.equal(codeOf(() => createSlidingWindow({ limit: 1, now: c.now })), 'RL_INVALID_OPTIONS');
  assert.equal(codeOf(() => createSlidingWindow({ limit: 1, windowMs: 5 })), 'RL_INVALID_OPTIONS');
  assert.equal(codeOf(() => createSlidingWindow()), 'RL_INVALID_OPTIONS');
});

test('cửa sổ trượt: ví dụ đặc tả', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual([1, 2, 3].map(() => w.take('k').remaining), [2, 1, 0]);
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 999;
  assert.equal(w.take('k').retryAfterMs, 1);
  c.t = 1000;
  assert.equal(w.take('k').allowed, true);
});

test('cửa sổ trượt: retryAfterMs theo cộng dồn cost các sự kiện cũ', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 1000, now: c.now });
  w.take('k', 2); // t=0
  c.t = 100;
  w.take('k', 1); // t=100
  c.t = 300;
  w.take('k', 2); // t=300, used = 5
  c.t = 400;
  // cần 3: đến khi cộng dồn >= 3 -> sự kiện t=100 -> 100+1000-400
  assert.deepEqual(w.take('k', 3), { allowed: false, retryAfterMs: 700, remaining: 0 });
  assert.deepEqual(w.take('k', 2), { allowed: false, retryAfterMs: 600, remaining: 0 });
  assert.equal(w.peek('k', 5).retryAfterMs, 900);
  c.t = 1000;
  assert.equal(w.peek('k').remaining, 2);
  assert.equal(w.take('k', 2).allowed, true);
});

test('cửa sổ trượt: peek, reset, sweep', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  assert.deepEqual(w.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(w.size(), 0);
  w.take('k');
  assert.equal(w.peek('k').remaining, 1);
  assert.equal(w.take('k').remaining, 0);
  assert.equal(w.reset('k'), true);
  assert.equal(w.reset('k'), false);
  w.take('a');
  w.take('b');
  c.t = 50;
  w.take('b');
  c.t = 100;
  assert.equal(w.size(), 2);
  assert.equal(w.sweep(), 1); // 'a' hết hạn, 'b' còn sự kiện t=50
  assert.equal(w.size(), 1);
});
