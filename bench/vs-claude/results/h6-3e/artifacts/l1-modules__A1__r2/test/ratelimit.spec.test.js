import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenBucket, createSlidingWindow } from '../src/ratelimit/index.js';

const code = (c) => (e) => e.code === c;
function clock(start = 0) {
  const c = { t: start, now: () => c.t };
  return c;
}

test('tùy chọn sai', () => {
  const now = () => 0;
  for (const make of [createTokenBucket, createSlidingWindow]) {
    assert.throws(() => make(), code('RL_INVALID_OPTIONS'));
    assert.throws(() => make(null), code('RL_INVALID_OPTIONS'));
    assert.throws(() => make({ capacity: 1, limit: 1, windowMs: 1 }), code('RL_INVALID_OPTIONS'));
  }
  for (const bad of [0, -1, 1.5, '1', undefined, NaN]) {
    assert.throws(() => createTokenBucket({ capacity: bad, now }), code('RL_INVALID_OPTIONS'));
    assert.throws(() => createSlidingWindow({ limit: bad, windowMs: 1, now }), code('RL_INVALID_OPTIONS'));
    assert.throws(() => createSlidingWindow({ limit: 1, windowMs: bad, now }), code('RL_INVALID_OPTIONS'));
  }
  for (const bad of [0, -1, 1.5, '1', null]) {
    assert.throws(() => createTokenBucket({ capacity: 1, refillAmount: bad, now }), code('RL_INVALID_OPTIONS'));
    assert.throws(() => createTokenBucket({ capacity: 1, refillIntervalMs: bad, now }), code('RL_INVALID_OPTIONS'));
  }
  assert.throws(() => createTokenBucket({ capacity: 1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1, now: 5 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 1 }), code('RL_INVALID_OPTIONS'));
});

test('kiểm tra khóa và cost theo thứ tự', () => {
  const c = clock();
  for (const l of [createTokenBucket({ capacity: 2, now: c.now }), createSlidingWindow({ limit: 2, windowMs: 10, now: c.now })]) {
    for (const op of ['take', 'peek']) {
      assert.throws(() => l[op]('', 0), code('RL_INVALID_KEY'));
      assert.throws(() => l[op](5), code('RL_INVALID_KEY'));
      assert.throws(() => l[op]('k', 0), code('RL_INVALID_COST'));
      assert.throws(() => l[op]('k', 1.5), code('RL_INVALID_COST'));
      assert.throws(() => l[op]('k', '1'), code('RL_INVALID_COST'));
      assert.throws(() => l[op]('k', null), code('RL_INVALID_COST'));
      assert.throws(() => l[op]('k', 3), code('RL_COST_EXCEEDS_CAPACITY'));
      assert.equal(l[op]('k', 2).allowed, true); // đúng bằng sức chứa là hợp lệ
      l.reset('k');
    }
    assert.equal(l.size(), 0);
    assert.throws(() => l.reset(''), code('RL_INVALID_KEY'));
  }
});

test('token bucket: ví dụ spec', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  assert.deepEqual([1, 2, 3, 4, 5].map(() => b.take('k').remaining), [4, 3, 2, 1, 0]);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  assert.deepEqual(b.take('k', 1), { allowed: false, retryAfterMs: 1000, remaining: 0 });

  const d = clock();
  const b2 = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: d.now });
  b2.take('k', 6);
  assert.deepEqual(b2.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  d.t = 666;
  assert.deepEqual(b2.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  d.t = 667;
  assert.deepEqual(b2.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});

test('token bucket: phần lẻ, giới hạn, đồng hồ lùi', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, refillAmount: 1, refillIntervalMs: 1000, now: c.now });
  b.take('k', 3);
  c.t = 1500;
  assert.deepEqual(b.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 1 });
  assert.deepEqual(b.take('k', 2), { allowed: false, retryAfterMs: 500, remaining: 1 });
  c.t = 2000;
  assert.deepEqual(b.take('k', 2), { allowed: true, retryAfterMs: 0, remaining: 0 });
  c.t = 1e12;
  assert.equal(b.peek('k').remaining, 3);
  // đồng hồ lùi: coi như không có thời gian trôi, không lùi mốc
  const d = clock(1000);
  const b2 = createTokenBucket({ capacity: 2, now: d.now });
  b2.take('k', 2);
  d.t = 500;
  assert.equal(b2.take('k').allowed, false);
  d.t = 1999;
  assert.equal(b2.take('k').allowed, false);
  d.t = 2000;
  assert.equal(b2.take('k').allowed, true);
  // chính xác với số lớn
  const e = clock();
  const b3 = createTokenBucket({ capacity: 1000000007, refillAmount: 7, refillIntervalMs: 1000000009, now: e.now });
  b3.take('k', 1000000007);
  const r = b3.take('k', 1000000007);
  assert.equal(r.retryAfterMs, Number((1000000007n * 1000000009n + 6n) / 7n));
});

test('token bucket: retryAfterMs đủ để lần sau chắc chắn được phép', () => {
  for (const [capacity, refillAmount, refillIntervalMs] of [[6, 3, 2000], [10, 7, 13], [5, 1, 1000], [4, 9, 4]]) {
    for (let cost = 1; cost <= capacity; cost++) {
      const c = clock();
      const b = createTokenBucket({ capacity, refillAmount, refillIntervalMs, now: c.now });
      b.take('k', capacity);
      const r = b.take('k', cost);
      c.t += r.retryAfterMs - 1;
      assert.equal(b.peek('k', cost).allowed, false, `${capacity}/${refillAmount}/${refillIntervalMs} cost ${cost}`);
      c.t += 1;
      assert.equal(b.take('k', cost).allowed, true);
    }
  }
});

test('token bucket: peek, reset, sweep, size', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.deepEqual(b.peek('x'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(b.size(), 0);
  assert.equal(b.reset('x'), false);
  b.take('a');
  b.take('b', 2);
  assert.equal(b.size(), 2);
  assert.equal(b.peek('b').allowed, false);
  assert.equal(b.peek('b').remaining, 0);
  assert.equal(b.peek('b').retryAfterMs, 1000);
  assert.equal(b.sweep(), 0);
  c.t = 1000;
  assert.equal(b.sweep(), 1); // 'a' đã đầy lại
  assert.equal(b.size(), 1);
  c.t = 2000;
  assert.equal(b.size(), 1); // chưa sweep
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 0);
  b.take('a');
  assert.equal(b.reset('a'), true);
  assert.equal(b.size(), 0);
});

test('cửa sổ trượt: ví dụ spec', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual([1, 2, 3].map(() => w.take('k').remaining), [2, 1, 0]);
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.equal(w.take('k').allowed, true);
});

test('cửa sổ trượt: retryAfterMs theo sự kiện cũ nhất đủ giải phóng', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 100, now: c.now });
  w.take('k', 1); // t=0
  c.t = 10;
  w.take('k', 2); // t=10
  c.t = 30;
  w.take('k', 2); // t=30, used=5
  c.t = 40;
  assert.deepEqual(w.take('k', 1), { allowed: false, retryAfterMs: 60, remaining: 0 }); // cần 1: sự kiện t=0
  assert.deepEqual(w.take('k', 2), { allowed: false, retryAfterMs: 70, remaining: 0 }); // cần 2: cộng dồn tới t=10
  assert.deepEqual(w.take('k', 4), { allowed: false, retryAfterMs: 90, remaining: 0 }); // cần 4: t=30
  assert.deepEqual(w.peek('k', 5), { allowed: false, retryAfterMs: 90, remaining: 0 });
  c.t = 100;
  assert.deepEqual(w.peek('k', 1), { allowed: true, retryAfterMs: 0, remaining: 1 });
  assert.equal(w.take('k', 1).remaining, 0);
  c.t = 110;
  assert.equal(w.take('k', 2).allowed, true);
});

test('cửa sổ trượt: peek, reset, sweep, size', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  assert.deepEqual(w.peek('x'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.equal(w.size(), 0);
  w.take('a');
  c.t = 50;
  w.take('b');
  assert.equal(w.size(), 2);
  assert.equal(w.peek('a').remaining, 1);
  c.t = 100;
  assert.equal(w.size(), 2);
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 1);
  assert.equal(w.take('b').remaining, 0);
  assert.equal(w.reset('b'), true);
  assert.equal(w.reset('b'), false);
  assert.equal(w.size(), 0);
});

test('mỗi khóa độc lập', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 1, now: c.now });
  assert.equal(b.take('a').allowed, true);
  assert.equal(b.take('b').allowed, true);
  assert.equal(b.take('a').allowed, false);
});
