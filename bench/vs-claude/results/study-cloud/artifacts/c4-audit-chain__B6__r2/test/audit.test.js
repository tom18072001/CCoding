import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const ZERO = '0'.repeat(64);
const clone = (x) => JSON.parse(JSON.stringify(x));
const build = (n) => {
  const c = [];
  for (let i = 0; i < n; i++) append(c, { actor: 'svc', n: i });
  return c;
};

test('canonicalize: sắp khóa lồng nhau', () => {
  assert.equal(canonicalize({ b: 1, a: { d: 1, c: 2 } }), '{"a":{"c":2,"d":1},"b":1}');
});
test('canonicalize: giữ thứ tự mảng, sắp khóa trong phần tử', () => {
  assert.equal(canonicalize([3, { b: 1, a: 2 }, 1]), '[3,{"a":2,"b":1},1]');
});
test('canonicalize: không có khoảng trắng', () => {
  assert.ok(!/\s/.test(canonicalize({ a: [1, 2], b: { c: 'x' } })));
});
test('canonicalize: bỏ thuộc tính undefined; undefined trong mảng thành null', () => {
  assert.equal(canonicalize({ a: undefined, b: 1 }), '{"b":1}');
  assert.equal(canonicalize([undefined, 1]), '[null,1]');
});
test('canonicalize: so sánh theo code point', () => {
  assert.equal(canonicalize({ '\u{1F600}': 1, '￿': 2 }), '{"￿":2,"\u{1F600}":1}');
});
test('canonicalize: bằng JSON.stringify với dữ liệu đã sắp sẵn', () => {
  const v = { a: 1, b: [1, 'x', null, true], c: { d: 'é', e: 1.5 } };
  assert.equal(canonicalize(v), JSON.stringify(v));
});
test('canonicalize: khác thứ tự khóa cho cùng chuỗi', () => {
  assert.equal(canonicalize({ a: 1, b: { x: 1, y: 2 } }), canonicalize({ b: { y: 2, x: 1 }, a: 1 }));
});

test('redact: email', () => {
  assert.deepEqual(redact({ m: 'a.b@example.com' }), { m: '[EMAIL]' });
});
test('redact: số điện thoại 0 và +84', () => {
  assert.deepEqual(redact({ a: '0912345678', b: '+84912345678' }), { a: '[PHONE]', b: '[PHONE]' });
});
test('redact: chữ số đầu 3,5,7,8,9 hợp lệ', () => {
  for (const d of '35789') {
    assert.equal(redact({ p: `0${d}12345678` }).p, '[PHONE]');
    assert.equal(redact({ p: `+84${d}12345678` }).p, '[PHONE]');
  }
});
test('redact: chữ số đầu 1,2,4,6 không bị thay', () => {
  for (const d of '1246') {
    assert.equal(redact({ p: `0${d}12345678` }).p, `0${d}12345678`);
  }
});
test('redact: chữ số đứng trước/sau thì không thay', () => {
  assert.equal(redact({ p: '90912345678' }).p, '90912345678');
  assert.equal(redact({ p: '09123456789' }).p, '09123456789');
});
test('redact: chuỗi chứa cả email và số', () => {
  assert.equal(
    redact({ t: 'gọi 0912345678 hoặc mail x@y.vn nhé' }).t,
    'gọi [PHONE] hoặc mail [EMAIL] nhé'
  );
});
test('redact: độ sâu 3 và trong mảng (kể cả lồng nhau)', () => {
  const r = redact({ a: { b: { c: 'x@y.com' } }, l: ['0912345678', ['a@b.co', { z: '+84912345678' }]] });
  assert.equal(r.a.b.c, '[EMAIL]');
  assert.equal(r.l[0], '[PHONE]');
  assert.equal(r.l[1][0], '[EMAIL]');
  assert.equal(r.l[1][1].z, '[PHONE]');
});
test('redact: khóa không đổi', () => {
  assert.deepEqual(redact({ 'a@b.com': 'v' }), { 'a@b.com': 'v' });
});
test('redact: không mutate input, trả về bản sao', () => {
  const input = { a: { b: ['x@y.com', { c: '0912345678' }] } };
  const before = clone(input);
  const out = redact(input);
  assert.deepEqual(input, before);
  assert.notEqual(out, input);
  assert.notEqual(out.a, input.a);
  assert.notEqual(out.a.b, input.a.b);
});
test('redact: số, boolean, null giữ nguyên', () => {
  assert.deepEqual(redact({ n: 912345678, t: true, f: false, z: null }), { n: 912345678, t: true, f: false, z: null });
});

test('append: seq tăng từ 0, prev nối tiếp', () => {
  const c = build(3);
  assert.deepEqual(c.map((r) => r.seq), [0, 1, 2]);
  assert.equal(c[0].prev, ZERO);
  assert.equal(c[1].prev, c[0].hash);
  assert.equal(c[2].prev, c[1].hash);
});
test('append: entry đã redact và hash đúng công thức', () => {
  const c = [];
  const r = append(c, { who: 'a@b.com', tel: '0912345678' });
  assert.deepEqual(r.entry, { who: '[EMAIL]', tel: '[PHONE]' });
  assert.equal(r.hash, sha(canonicalize({ seq: 0, prev: ZERO, entry: r.entry })));
  assert.match(r.hash, /^[0-9a-f]{64}$/);
});
test('append: hash không tính trên entry gốc, chain không chứa PII', () => {
  const c = [];
  const orig = { who: 'a@b.com', tel: '+84912345678' };
  const r = append(c, orig);
  assert.notEqual(r.hash, sha(canonicalize({ seq: 0, prev: ZERO, entry: orig })));
  const s = JSON.stringify(c);
  assert.ok(!s.includes('a@b.com'));
  assert.ok(!s.includes('912345678'));
});
test('append: trả về chính phần tử được push', () => {
  const c = [];
  const r = append(c, { a: 1 });
  assert.equal(c.length, 1);
  assert.equal(c[0], r);
});

test('verify: chain rỗng và hợp lệ', () => {
  assert.deepEqual(verify([]), { ok: true });
  assert.deepEqual(verify(build(4)), { ok: true });
});
test('verify: sửa entry', () => {
  const c = build(4);
  c[2].entry.n = 99;
  assert.deepEqual(verify(c), { ok: false, index: 2 });
});
test('verify: sửa hash', () => {
  const c = build(4);
  c[1].hash = '0'.repeat(64);
  assert.deepEqual(verify(c), { ok: false, index: 1 });
});
test('verify: sửa prev', () => {
  const c = build(4);
  c[3].prev = 'f'.repeat(64);
  assert.deepEqual(verify(c), { ok: false, index: 3 });
});
test('verify: sửa seq', () => {
  const c = build(4);
  c[1].seq = 5;
  assert.deepEqual(verify(c), { ok: false, index: 1 });
});
test('verify: xóa record giữa chain', () => {
  const c = build(5);
  c.splice(2, 1);
  assert.deepEqual(verify(c), { ok: false, index: 2 });
});
test('verify: đổi thứ tự record', () => {
  const c = build(4);
  [c[1], c[2]] = [c[2], c[1]];
  assert.deepEqual(verify(c), { ok: false, index: 1 });
});
test('verify: nhiều chỗ lỗi trả về index nhỏ nhất', () => {
  const c = build(6);
  c[4].entry.n = 99;
  c[2].entry.n = 99;
  assert.deepEqual(verify(c), { ok: false, index: 2 });
});
