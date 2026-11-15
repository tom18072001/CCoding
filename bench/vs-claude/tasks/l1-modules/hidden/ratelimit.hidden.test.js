import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenBucket, createSlidingWindow } from '../src/ratelimit/index.js';

function clock(start = 0) {
  const c = { t: start, now: () => c.t };
  return c;
}
function code(c) {
  return (e) => e instanceof Error && e.code === c;
}
const BAD_KEY = code('RL_INVALID_KEY');
const BAD_COST = code('RL_INVALID_COST');
const TOO_BIG = code('RL_COST_EXCEEDS_CAPACITY');
const BAD_OPT = code('RL_INVALID_OPTIONS');

// ================= token bucket =================
test('bucket: lần đầu của khóa mới', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 4 });
});
test('bucket: cạn rồi từ chối', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  const rem = [];
  for (let i = 0; i < 5; i++) rem.push(b.take('k').remaining);
  assert.deepEqual(rem, [4, 3, 2, 1, 0]);
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
});
test('bucket: nạp dở dang thì retryAfterMs là phần còn thiếu', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  for (let i = 0; i < 5; i++) b.take('k');
  c.t = 400;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 600, remaining: 0 });
});
test('bucket: nạp liên tục, phần lẻ được giữ lại', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  for (let i = 0; i < 5; i++) b.take('k');
  c.t = 1000;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
  c.t = 2500;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 500, remaining: 0 });
  c.t = 3000;
  assert.equal(b.take('k').allowed, true);
});
test('bucket: không vượt capacity khi nghỉ lâu', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  b.take('k');
  c.t = 1e9;
  assert.equal(b.take('k').remaining, 4);
  const r = [];
  for (let i = 0; i < 5; i++) r.push(b.take('k').allowed);
  assert.deepEqual(r, [true, true, true, true, false]);
});
test('bucket: lần từ chối không tiêu token', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k');
  b.take('k');
  for (let i = 0; i < 5; i++) assert.equal(b.take('k').allowed, false);
  c.t = 1000;
  assert.equal(b.take('k').allowed, true);
});
test('bucket: cost lớn hơn 1', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  assert.deepEqual(b.take('k', 3), { allowed: true, retryAfterMs: 0, remaining: 2 });
  assert.deepEqual(b.take('k', 3), { allowed: false, retryAfterMs: 1000, remaining: 2 });
  assert.deepEqual(b.take('k', 2), { allowed: true, retryAfterMs: 0, remaining: 0 });
});
test('bucket: cost đúng bằng capacity hợp lệ, cost vượt capacity ném lỗi', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  assert.deepEqual(b.take('k', 5), { allowed: true, retryAfterMs: 0, remaining: 0 });
  assert.throws(() => b.take('k', 6), TOO_BIG);
  assert.throws(() => b.take('k', 100), TOO_BIG);
});
test('bucket: cost vượt capacity không tạo khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.throws(() => b.take('k', 3), TOO_BIG);
  assert.equal(b.size(), 0);
});
test('bucket: cost không hợp lệ', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  for (const v of [0, -1, 1.5, '2', NaN, null, Infinity]) assert.throws(() => b.take('k', v), BAD_COST);
});
test('bucket: khóa không hợp lệ', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  for (const k of ['', 5, undefined, null, {}]) {
    assert.throws(() => b.take(k), BAD_KEY);
    assert.throws(() => b.peek(k), BAD_KEY);
  }
});
test('bucket: các khóa độc lập', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 1, now: c.now });
  assert.equal(b.take('a').allowed, true);
  assert.equal(b.take('b').allowed, true);
  assert.equal(b.take('a').allowed, false);
  assert.equal(b.take('b').allowed, false);
  assert.equal(b.size(), 2);
});
test('bucket: nạp phân số, retryAfterMs làm tròn lên', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 6, refillAmount: 3, refillIntervalMs: 2000, now: c.now });
  assert.deepEqual(b.take('k', 6), { allowed: true, retryAfterMs: 0, remaining: 0 });
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 667, remaining: 0 });
  c.t = 666;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 667;
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});
test('bucket: chờ đúng retryAfterMs thì được phép', () => {
  for (const [capacity, refillAmount, refillIntervalMs, cost] of [[10, 7, 1000, 4], [3, 1, 333, 3], [8, 5, 3000, 8], [4, 2, 7, 3]]) {
    const c = clock();
    const b = createTokenBucket({ capacity, refillAmount, refillIntervalMs, now: c.now });
    b.take('k', capacity);
    const r = b.take('k', cost);
    assert.equal(r.allowed, false);
    assert.ok(Number.isInteger(r.retryAfterMs) && r.retryAfterMs >= 1);
    c.t += r.retryAfterMs - 1;
    assert.equal(b.peek('k', cost).allowed, false);
    c.t += 1;
    assert.equal(b.take('k', cost).allowed, true);
  }
});
test('bucket: nạp 1 token mỗi 100 ms ở tốc độ ổn định', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, refillAmount: 1, refillIntervalMs: 100, now: c.now });
  for (let i = 0; i < 3; i++) assert.equal(b.take('k').allowed, true);
  for (let i = 1; i <= 20; i++) {
    c.t = i * 100;
    assert.equal(b.take('k').allowed, true, `bước ${i}`);
  }
  assert.equal(b.take('k').allowed, false);
});
test('bucket: đồng hồ lùi coi như không có thời gian trôi qua', () => {
  const c = clock(1000);
  const b = createTokenBucket({ capacity: 2, now: c.now });
  b.take('k');
  b.take('k');
  c.t = 500;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 1500;
  assert.deepEqual(b.take('k'), { allowed: false, retryAfterMs: 500, remaining: 0 });
  c.t = 2000;
  assert.equal(b.take('k').allowed, true);
});
test('bucket: peek không tiêu và không tạo khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  assert.deepEqual(b.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 3 });
  assert.equal(b.size(), 0);
  b.take('k', 3);
  assert.deepEqual(b.peek('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  assert.deepEqual(b.peek('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
  c.t = 1500;
  assert.deepEqual(b.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 1 });
  assert.deepEqual(b.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});
test('bucket: peek kiểm cost', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  b.take('k', 4);
  assert.deepEqual(b.peek('k', 3), { allowed: false, retryAfterMs: 2000, remaining: 1 });
  assert.throws(() => b.peek('k', 6), TOO_BIG);
  assert.throws(() => b.peek('k', 0), BAD_COST);
});
test('bucket: reset', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 2, now: c.now });
  assert.equal(b.reset('k'), false);
  b.take('k');
  b.take('k');
  assert.equal(b.reset('k'), true);
  assert.equal(b.size(), 0);
  assert.equal(b.take('k').remaining, 1);
  assert.equal(b.reset('k'), true);
  assert.equal(b.reset('k'), false);
});
test('bucket: sweep xóa khóa đã nạp đầy lại', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  b.take('a');
  b.take('b');
  assert.equal(b.size(), 2);
  assert.equal(b.sweep(), 0);
  c.t = 999;
  assert.equal(b.sweep(), 0);
  assert.equal(b.size(), 2);
  c.t = 1000;
  assert.equal(b.sweep(), 2);
  assert.equal(b.size(), 0);
  assert.equal(b.sweep(), 0);
});
test('bucket: sweep theo từng khóa', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 5, now: c.now });
  b.take('a');
  c.t = 500;
  b.take('b');
  b.take('b');
  c.t = 1000;
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 1);
  c.t = 2499;
  assert.equal(b.sweep(), 0);
  c.t = 2500;
  assert.equal(b.sweep(), 1);
  assert.equal(b.size(), 0);
});
test('bucket: sweep không đổi hành vi của khóa còn lại', () => {
  const c = clock();
  const b = createTokenBucket({ capacity: 3, now: c.now });
  b.take('a', 3);
  b.take('b');
  c.t = 1000;
  assert.equal(b.sweep(), 1);
  assert.deepEqual(b.take('a'), { allowed: true, retryAfterMs: 0, remaining: 0 });
});
test('bucket: tùy chọn không hợp lệ', () => {
  const now = () => 0;
  assert.throws(() => createTokenBucket(), BAD_OPT);
  assert.throws(() => createTokenBucket({}), BAD_OPT);
  assert.throws(() => createTokenBucket({ capacity: 5 }), BAD_OPT);
  assert.throws(() => createTokenBucket({ now }), BAD_OPT);
  for (const capacity of [0, -1, 1.5, '5', NaN]) assert.throws(() => createTokenBucket({ capacity, now }), BAD_OPT);
  assert.throws(() => createTokenBucket({ capacity: 5, refillAmount: 0, now }), BAD_OPT);
  assert.throws(() => createTokenBucket({ capacity: 5, refillIntervalMs: 0, now }), BAD_OPT);
  assert.throws(() => createTokenBucket({ capacity: 5, refillIntervalMs: 1.5, now }), BAD_OPT);
  assert.throws(() => createTokenBucket({ capacity: 5, now: 123 }), BAD_OPT);
});
// ================= cửa sổ trượt =================
test('window: tối đa limit trong cửa sổ', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  const rem = [];
  for (let i = 0; i < 3; i++) rem.push(w.take('k'));
  assert.deepEqual(rem, [
    { allowed: true, retryAfterMs: 0, remaining: 2 },
    { allowed: true, retryAfterMs: 0, remaining: 1 },
    { allowed: true, retryAfterMs: 0, remaining: 0 },
  ]);
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1000, remaining: 0 });
});
test('window: sự kiện hết hiệu lực đúng tại t + windowMs', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  for (let i = 0; i < 3; i++) w.take('k');
  c.t = 999;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1000;
  assert.deepEqual(w.take('k'), { allowed: true, retryAfterMs: 0, remaining: 2 });
});
test('window: trượt theo từng sự kiện', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  w.take('k');
  c.t = 300;
  w.take('k');
  c.t = 600;
  w.take('k');
  c.t = 700;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 300, remaining: 0 });
  c.t = 1000;
  assert.deepEqual(w.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
  c.t = 1300;
  assert.deepEqual(w.take('k'), { allowed: true, retryAfterMs: 0, remaining: 0 });
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 300, remaining: 0 });
});
test('window: không có đột biến ở biên cửa sổ cố định', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 1000, now: c.now });
  c.t = 900;
  w.take('k');
  c.t = 950;
  w.take('k');
  c.t = 1000;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 900, remaining: 0 });
  c.t = 1899;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 1, remaining: 0 });
  c.t = 1900;
  assert.equal(w.take('k').allowed, true);
});
test('window: cost lớn hơn 1', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual(w.take('k', 2), { allowed: true, retryAfterMs: 0, remaining: 1 });
  c.t = 100;
  assert.deepEqual(w.take('k', 2), { allowed: false, retryAfterMs: 900, remaining: 1 });
  assert.deepEqual(w.take('k', 1), { allowed: true, retryAfterMs: 0, remaining: 0 });
});
test('window: retryAfterMs chờ đủ nhiều sự kiện cũ', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 5, windowMs: 1000, now: c.now });
  w.take('k');
  c.t = 100;
  w.take('k');
  c.t = 200;
  w.take('k', 3);
  c.t = 300;
  assert.deepEqual(w.take('k', 2), { allowed: false, retryAfterMs: 800, remaining: 0 });
  assert.deepEqual(w.take('k', 1), { allowed: false, retryAfterMs: 700, remaining: 0 });
  assert.deepEqual(w.take('k', 5), { allowed: false, retryAfterMs: 900, remaining: 0 });
  c.t = 1100;
  assert.deepEqual(w.take('k', 2), { allowed: true, retryAfterMs: 0, remaining: 0 });
});
test('window: cost bằng limit hợp lệ, vượt limit ném lỗi', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual(w.take('k', 3), { allowed: true, retryAfterMs: 0, remaining: 0 });
  assert.throws(() => w.take('k', 4), TOO_BIG);
  assert.throws(() => w.take('other', 4), TOO_BIG);
  assert.equal(w.size(), 1);
});
test('window: cost và khóa không hợp lệ', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  for (const v of [0, -2, 0.5, '1', NaN]) assert.throws(() => w.take('k', v), BAD_COST);
  for (const k of ['', 7, undefined]) assert.throws(() => w.take(k), BAD_KEY);
});
test('window: các khóa độc lập', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 1, windowMs: 1000, now: c.now });
  assert.equal(w.take('a').allowed, true);
  assert.equal(w.take('b').allowed, true);
  assert.equal(w.take('a').allowed, false);
  assert.equal(w.size(), 2);
});
test('window: lần từ chối không được ghi lại', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 1, windowMs: 1000, now: c.now });
  w.take('k');
  c.t = 500;
  assert.equal(w.take('k').allowed, false);
  c.t = 1000;
  assert.equal(w.take('k').allowed, true);
});
test('window: peek không ghi, không tạo khóa, remaining chưa trừ cost', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual(w.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 3 });
  assert.equal(w.size(), 0);
  w.take('k', 2);
  assert.deepEqual(w.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 1 });
  assert.deepEqual(w.peek('k', 2), { allowed: false, retryAfterMs: 1000, remaining: 1 });
  assert.deepEqual(w.peek('k'), { allowed: true, retryAfterMs: 0, remaining: 1 });
  assert.throws(() => w.peek('k', 4), TOO_BIG);
});
test('window: reset', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 1, windowMs: 1000, now: c.now });
  assert.equal(w.reset('k'), false);
  w.take('k');
  assert.equal(w.reset('k'), true);
  assert.equal(w.size(), 0);
  assert.equal(w.take('k').allowed, true);
});
test('window: sweep xóa khóa không còn sự kiện hiệu lực', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 3, windowMs: 1000, now: c.now });
  w.take('a');
  c.t = 500;
  w.take('b');
  c.t = 999;
  assert.equal(w.sweep(), 0);
  assert.equal(w.size(), 2);
  c.t = 1000;
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 1);
  c.t = 1499;
  assert.equal(w.sweep(), 0);
  c.t = 1500;
  assert.equal(w.sweep(), 1);
  assert.equal(w.size(), 0);
});
test('window: sweep giữ khóa còn sự kiện hiệu lực và không đổi kết quả', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 2, windowMs: 1000, now: c.now });
  w.take('a');
  c.t = 800;
  w.take('a');
  c.t = 1000;
  assert.equal(w.sweep(), 0);
  assert.equal(w.size(), 1);
  assert.deepEqual(w.take('a'), { allowed: true, retryAfterMs: 0, remaining: 0 });
  assert.deepEqual(w.take('a'), { allowed: false, retryAfterMs: 800, remaining: 0 });
});
test('window: retryAfterMs làm tròn lên với mốc thời gian lẻ', () => {
  const c = clock(0.4);
  const w = createSlidingWindow({ limit: 1, windowMs: 1000, now: c.now });
  w.take('k');
  c.t = 1000.1;
  const r = w.take('k');
  assert.equal(r.allowed, false);
  assert.equal(r.retryAfterMs, 1);
});
test('window: limit lớn', () => {
  const c = clock();
  const w = createSlidingWindow({ limit: 1000, windowMs: 60000, now: c.now });
  let ok = 0;
  for (let i = 0; i < 1001; i++) {
    c.t = i;
    if (w.take('k').allowed) ok++;
  }
  assert.equal(ok, 1000);
  c.t = 1001;
  assert.deepEqual(w.take('k'), { allowed: false, retryAfterMs: 58999, remaining: 0 });
});
test('window: tùy chọn không hợp lệ', () => {
  const now = () => 0;
  assert.throws(() => createSlidingWindow(), BAD_OPT);
  assert.throws(() => createSlidingWindow({ limit: 3, windowMs: 1000 }), BAD_OPT);
  assert.throws(() => createSlidingWindow({ windowMs: 1000, now }), BAD_OPT);
  assert.throws(() => createSlidingWindow({ limit: 3, now }), BAD_OPT);
  for (const limit of [0, -1, 2.5, '3']) assert.throws(() => createSlidingWindow({ limit, windowMs: 1000, now }), BAD_OPT);
  for (const windowMs of [0, -5, 0.5, null]) assert.throws(() => createSlidingWindow({ limit: 3, windowMs, now }), BAD_OPT);
  assert.throws(() => createSlidingWindow({ limit: 3, windowMs: 1000, now: 'x' }), BAD_OPT);
});
