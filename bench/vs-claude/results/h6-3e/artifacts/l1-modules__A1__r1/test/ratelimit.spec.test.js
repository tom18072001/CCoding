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
  assert.throws(() => createTokenBucket(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ capacity: 1 }), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createTokenBucket({ now }), code('RL_INVALID_OPTIONS'));
  for (const bad of [0, -1, 1.5, '2', NaN]) {
    assert.throws(() => createTokenBucket({ capacity: bad, now }), code('RL_INVALID_OPTIONS'));
    assert.throws(() => createTokenBucket({ capacity: 1, refillAmount: bad, now }), code('RL_INVALID_OPTIONS'));
    assert.throws(() => createTokenBucket({ capacity: 1, refillIntervalMs: bad, now }), code('RL_INVALID_OPTIONS'));
    assert.throws(() => createSlidingWindow({ limit: bad, windowMs: 1, now }), code('RL_INVALID_OPTIONS'));
    assert.throws(() => createSlidingWindow({ limit: 1, windowMs: bad, now }), code('RL_INVALID_OPTIONS'));
  }
  assert.throws(() => createSlidingWindow(), code('RL_INVALID_OPTIONS'));
  assert.throws(() => createSlidingWindow({ limit: 1, windowMs: 1 }), code('RL_INVALID_OPTIONS'));
});

for (const [name, make] of [
  ['bucket', (now) => createTokenBucket({ capacity: 3, now })],
  ['window', (now) => createSlidingWindow({ limit: 3, windowMs: 1000, now })],
]) {
  test(`${name}: kiểm tra đầu vào theo thứ tự`, () => {
    const c = clock();
    const l = make(c.now);
    for (const m of ['take', 'peek']) {
      assert.throws(() => l[m](''), code('RL_INVALID_KEY'));
      assert.throws(() => l[m](5, 0), code('RL_INVALID_KEY'));
      assert.throws(() => l[m]('k', 0), code('RL_INVALID_COST'));
      assert.throws(() => l[m]('k', 1.5), code('RL_INVALID_COST'));
      assert.throws(() => l[m]('k', '1'), code('RL_INVALID_COST'));
      assert.throws(() => l[m]('k', null), code('RL_INVALID_COST'));
      assert.throws(() => l[m]('k', 4), code('RL_COST_EXCEEDS_CAPACITY'));
    }
    assert.equal(l.size(), 0);
    assert.equal(l.take('k', 3).allowed, true);
  });

  test(`${name}: peek không tạo khóa, không tiêu; reset; size`, () => {
    const c = clock();
    const l = make(c.now);
    assert.deepEqual(l.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 3 });
    assert.equal(l.size(), 0);
    assert.equal(l.reset('k'), false);
    l.take('k');
    assert.deepEqual(l.peek('k', 2), { allowed: true, retryAfterMs: 0, remaining: 2 });
    assert.equal(l.take('k', 2).remaining, 0);
    assert.equal(l.size(), 1);
    assert.equal(l.take('x').remaining, 2);
    assert.equal(l.reset('k'), true);
    assert.equal(l.size(), 1);
    assert.equal(l.take('k').remaining, 2);
  });
}

test('bucket: từ chối không tiêu gì, retry chính xác', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.equal(b.take('k', 6).allowed, true);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 }); // 1.0005 - 1 -> floor 0
  const r = b.take('k', 6);
  assert.equal(r.allowed, false);
  assert.equal(r.retryAfterMs, 4000);
});

test('bucket: remaining là floor của phần lẻ, không vượt capacity', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, refillAmount: 1, refillIntervalMs: 1000, now: c.now });
  b.take('k', 5);
  c.t = 2500;
  assert.deepEqual(b.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
  c.t = 10 ** 9;
  assert.equal(b.peek('k').remaining, 5);
});

test('bucket: đồng hồ lùi không lùi mốc', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k', 2);
  c.t = 500; // lùi
  assert.equal(b.take('k').allowed, false);
  c.t = 1999; // 999ms kể từ mốc 1000
  assert.equal(b.take('k').retryAfterMs, 1);
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
});

test('bucket: sweep xóa khóa đã đầy lại', () => {
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

test('cửa sổ trượt: ví dụ SPEC', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual([1, 2, 3].map(() => w.take('k').remaining), [2, 1, 0]);
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 999;
  assert.equal(w.take('k').retryAfterMs, 1);
  c.t = 1000;
  assert.deepEqual(w.take('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
});

test('cửa sổ trượt: retryAfterMs theo sự kiện cũ nhất đủ giải phóng', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 1000, now: c.now });
  w.take('k', 1); // t=0
  c.t = 100;
  w.take('k', 2); // t=100
  c.t = 300;
  w.take('k', 2); // t=300, used=5
  c.t = 400;
  assert.deepEqual(w.peek('k', 1), { allowed: false, retryAfterMs: 600, remaining: 0 });
  assert.equal(w.take('k', 3).retryAfterMs, 700); // cần giải phóng 3: 1+2 -> sự kiện t=100
  assert.equal(w.take('k', 5).retryAfterMs, 900); // cần 5: tới sự kiện t=300
  c.t = 1100;
  assert.deepEqual(w.peek('k', 3), { allowed: true, retryAfterMs: 0, remaining: 3 });
});

test('cửa sổ trượt: sweep', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 100, now: c.now });
  w.take('a');
  c.t = 50;
  w.take('b');
  c.t = 100;
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 1);
  c.t = 150;
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 0);
});
