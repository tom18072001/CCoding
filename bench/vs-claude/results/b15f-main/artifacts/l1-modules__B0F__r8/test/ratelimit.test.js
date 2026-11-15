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

test('bucket: ví dụ capacity 6, nạp 3/2000ms → 667ms (SPEC:486)', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).allowed, true);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.equal(b.take('k').allowed, true);
});

test('bucket: đồng hồ đứng yên không nạp thêm', () => {
  const c = clock(500);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k'); b.take('k');
  assert.equal(b.take('k').allowed, false);
  assert.equal(b.take('k').allowed, false);
  assert.equal(b.peek('k').remaining, 0);
});

test('bucket: nạp không vượt capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  b.take('k', 3);
  c.t = 1000000;
  assert.equal(b.peek('k').remaining, 3);
  assert.equal(b.take('k', 3).allowed, true);
  assert.equal(b.take('k').allowed, false);
});

test('bucket: remaining là floor của phần lẻ', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 4, refillAmount: 1, refillIntervalMs: 1000, now: c.now });
  b.take('k', 4);
  c.t = 1500;
  assert.equal(b.peek('k').remaining, 1);
  assert.equal(b.take('k', 1).remaining, 0);
  c.t = 2000; // còn 0.5 + 0.5 = 1 token
  assert.equal(b.take('k').allowed, true);
});

test('bucket: đồng hồ lùi giữ mốc cũ', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 1, now: c.now });
  b.take('k');
  c.t = 500;
  assert.equal(b.take('k').retryAfterMs, 1000);
  c.t = 2000; // mốc vẫn là 1000 → đã 1000ms
  assert.equal(b.take('k').allowed, true);
});

test('bucket: cost bằng capacity hợp lệ, vượt thì ném và không tạo khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  assert.throws(() => b.take('k', 4), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(b.size(), 0);
  assert.equal(b.take('k', 3).allowed, true);
});

test('cost không hợp lệ: 0, âm, không nguyên, chuỗi, NaN', () => {
  const c = clock();
  for (const mk of [
    () => createTokenBucket({ capacity: 5, now: c.now }),
    () => createSlidingWindow({ limit: 5, windowMs: 100, now: c.now }),
  ]) {
    const l = mk();
    for (const bad of [0, -1, 1.5, '2', NaN, null, Infinity]) {
      assert.throws(() => l.take('k', bad), code('RL_INVALID_COST'), String(bad));
      assert.throws(() => l.peek('k', bad), code('RL_INVALID_COST'), String(bad));
    }
    assert.equal(l.size(), 0);
  }
});

test('thứ tự kiểm: khóa sai + cost sai → lỗi khóa; cost sai + quá lớn → INVALID_COST', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now: c.now });
  for (const l of [b, w]) {
    assert.throws(() => l.take('', -5), code('RL_INVALID_KEY'));
    assert.throws(() => l.take(42, 1.5), code('RL_INVALID_KEY'));
    assert.throws(() => l.peek(undefined, 0), code('RL_INVALID_KEY'));
    assert.throws(() => l.take('k', 99.5), code('RL_INVALID_COST'));
    assert.throws(() => l.take('k', 99), code('RL_COST_EXCEEDS_CAPACITY'));
    assert.throws(() => l.reset(''), code('RL_INVALID_KEY'));
  }
});

test('tùy chọn sai → RL_INVALID_OPTIONS', () => {
  const now = () => 0;
  const bad = [
    () => createTokenBucket(),
    () => createTokenBucket({ capacity: 0, now }),
    () => createTokenBucket({ capacity: 1.5, now }),
    () => createTokenBucket({ capacity: 1 }),
    () => createTokenBucket({ capacity: 1, now: 5 }),
    () => createTokenBucket({ capacity: 1, refillAmount: 0, now }),
    () => createTokenBucket({ capacity: 1, refillIntervalMs: -1, now }),
    () => createSlidingWindow(),
    () => createSlidingWindow({ limit: 0, windowMs: 10, now }),
    () => createSlidingWindow({ limit: 1, windowMs: 0, now }),
    () => createSlidingWindow({ limit: 1, windowMs: 10 }),
  ];
  for (const f of bad) assert.throws(f, code('RL_INVALID_OPTIONS'));
});

test('bucket: trạng thái tách theo khóa, reset, peek không tạo khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 1, now: c.now });
  assert.deepEqual(b.peek('a'), { allowed: true, retryAfterMs: 0, remaining: 1 });
  assert.equal(b.size(), 0);
  b.take('a');
  assert.equal(b.take('b').allowed, true);
  assert.equal(b.take('a').allowed, false);
  assert.equal(b.peek('a').allowed, false);
  assert.equal(b.reset('a'), true);
  assert.equal(b.reset('a'), false);
  assert.equal(b.take('a').allowed, true);
});

test('bucket: sweep xóa khóa đã đầy lại, giữ khóa chưa đầy', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('a');
  b.take('b', 2);
  assert.equal(b.sweep(), 0);
  c.t = 1000;
  assert.equal(b.sweep(), 1); // a đầy lại
  assert.equal(b.size(), 1);
  c.t = 2000;
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 0);
});

test('không dùng Date.now khi đã tiêm now', () => {
  const orig = Date.now;
  Date.now = () => { throw new Error('không được gọi Date.now'); };
  try {
    const b = createTokenBucket({ capacity: 1, now: () => 0 });
    b.take('k'); b.peek('k'); b.sweep();
    const w = createSlidingWindow({ limit: 1, windowMs: 5, now: () => 0 });
    w.take('k'); w.peek('k'); w.sweep();
  } finally {
    Date.now = orig;
  }
});

test('cửa sổ: mép — t=999 còn 1ms, t=1000 được phép (SPEC:498)', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual([1, 2, 3].map(() => w.take('k').remaining), [2, 1, 0]);
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  assert.equal(w.peek('k').allowed, false);
  c.t = 1000;
  assert.equal(w.peek('k').remaining, 3);
  assert.equal(w.take('k').allowed, true);
});

test('cửa sổ: đồng hồ đứng yên, từ chối không tiêu gì', () => {
  const c = clock(50);
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  w.take('k'); w.take('k');
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 100, remaining: 0 });
  }
  c.t = 150;
  assert.equal(w.take('k', 2).allowed, true);
});

test('cửa sổ: retryAfterMs theo cộng dồn cost sự kiện cũ nhất', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 1000, now: c.now });
  w.take('k', 1);            // t=0
  c.t = 100; w.take('k', 1);
  c.t = 300; w.take('k', 3); // used = 5
  c.t = 400;
  // cost 2: need = 2 → sự kiện t=0 (1) + t=100 (1) → hết hiệu lực lúc 1100
  assert.deepEqual(w.take('k', 2), { allowed: false, retryAfterMs: 700, remaining: 0 });
  // cost 1: need = 1 → chỉ sự kiện t=0 → 1000 - 400 = 600
  assert.equal(w.take('k', 1).retryAfterMs, 600);
  c.t = 1100;
  assert.equal(w.take('k', 2).allowed, true);
  assert.equal(w.peek('k').remaining, 0);
});

test('cửa sổ: cost bằng limit hợp lệ, vượt thì ném, không tạo khóa', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 10, now: c.now });
  assert.throws(() => w.take('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
  assert.equal(w.size(), 0);
  assert.deepEqual(w.take('k', 2), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('cửa sổ: khóa độc lập, reset, peek không tạo khóa, sweep dọn khóa hết hạn', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 1, windowMs: 100, now: c.now });
  assert.equal(w.peek('a').remaining, 1);
  assert.equal(w.size(), 0);
  w.take('a');
  assert.equal(w.take('b').allowed, true);
  assert.equal(w.take('a').allowed, false);
  assert.equal(w.reset('a'), true);
  assert.equal(w.reset('a'), false);
  assert.equal(w.take('a').allowed, true);
  c.t = 99;
  assert.equal(w.sweep(), 0);
  c.t = 100;
  assert.equal(w.size(), 2);
  assert.equal(w.sweep(), 2);
  assert.equal(w.size(), 0);
});
