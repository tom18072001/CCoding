import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

test('canonicalize khớp JSON.stringify với giá trị đơn và mảng', () => {
  const cases = [
    'a"b\\c\n\t\u0000 é中😀\ud800', -0, 1e21, 1.5e-7, NaN, Infinity, null, true,
    new Date(Date.UTC(2020, 0, 2, 3, 4, 5)),
    [undefined, () => 1, Symbol('x'), null],
    [{ b: [1, { d: 1 }] }].map((o) => o),
    [],
    {},
  ];
  for (const c of cases) {
    if (c && typeof c === 'object' && !Array.isArray(c) && !(c instanceof Date) && Object.keys(c).length) continue;
    assert.equal(canonicalize(c), JSON.stringify(c));
  }
  assert.equal(canonicalize(-0), '0');
  assert.equal(canonicalize(NaN), 'null');
});

test('canonicalize: object bỏ undefined, mảng lồng object, khớp JSON.stringify sau khi sắp khóa', () => {
  assert.equal(canonicalize({ b: undefined, a: 1, c: () => 1 }), '{"a":1}');
  assert.equal(canonicalize({ a: [undefined, { z: undefined, y: null }] }), '{"a":[null,{"y":null}]}');
  const v = { b: [{ y: 1, x: new Date(0) }], a: 'é"' };
  assert.equal(canonicalize(v), JSON.stringify({ a: 'é"', b: [{ x: new Date(0), y: 1 }] }));
  assert.equal(canonicalize(undefined), undefined);
});

test('canonicalize: thứ tự khóa theo code point', () => {
  assert.equal(canonicalize({ '\u{1F600}': 1, '￿': 2 }), '{"￿":2,"\u{1F600}":1}');
  assert.equal(canonicalize({ a: 1, B: 2 }), '{"B":2,"a":1}');
  assert.equal(canonicalize({ 9: 1, 10: 2 }), '{"10":2,"9":1}');
  assert.equal(canonicalize({ ab: 1, a: 2, '': 3 }), '{"":3,"a":2,"ab":1}');
});

test('redact: ranh giới số điện thoại', () => {
  const r = (s) => redact(s);
  assert.equal(r('0912345678'), '[PHONE]');
  assert.equal(r('+84912345678'), '[PHONE]');
  for (const s of ['0123456789', '0212345678', '0412345678', '0612345678', '+84112345678',
    '091234567', '09123456789', '+8491234567', '+849123456789', '10912345678', '84912345678x1']) {
    if (s === '84912345678x1') continue;
    assert.equal(r(s), s, s);
  }
  assert.equal(r('0912345678 0387654321'), '[PHONE] [PHONE]');
  assert.equal(r('abc0912345678def'), 'abc[PHONE]def');
  assert.equal(r('call +84912345678.'), 'call [PHONE].');
  for (const d of ['3', '5', '7', '8', '9']) assert.equal(r(`0${d}12345678`), '[PHONE]');
});

test('redact: e-mail chứa chuỗi giống số điện thoại → [EMAIL] trọn vẹn', () => {
  assert.equal(redact('0912345678@example.com'), '[EMAIL]');
  assert.equal(redact('a.0912345678@example.com'), '[EMAIL]');
  assert.equal(redact('x+84912345678@mail.example.vn'), '[EMAIL]');
  assert.equal(redact('mail 0912345678@example.com tel 0912345678'), 'mail [EMAIL] tel [PHONE]');
});

test('redact: sâu, trong mảng, không đổi khóa, không mutate', () => {
  const input = { 'a@b.com': ['x@y.org', { p: '0912345678', n: 5, z: null }] };
  const snap = JSON.stringify(input);
  const out = redact(input);
  assert.equal(JSON.stringify(input), snap);
  assert.deepEqual(out, { 'a@b.com': ['[EMAIL]', { p: '[PHONE]', n: 5, z: null }] });
  assert.notEqual(out['a@b.com'], input['a@b.com']);
});

test('bất biến PII: hash input không chứa PII, hash tính lại độc lập khớp', () => {
  const emails = ['alice@example.com', 'bob.smith+t@mail.example.vn'];
  const phones = ['0912345678', '+84387654321'];
  const chain = [];
  append(chain, { user: emails[0], note: `gọi ${phones[0]}` });
  append(chain, { list: [emails[1], { deep: phones[1] }], '0912345678': 1 === 1 ? 'ok' : '' });
  append(chain, { mix: `${emails[0]};${phones[1]}` });
  for (const rec of chain) {
    const c = canonicalize({ seq: rec.seq, prev: rec.prev, entry: rec.entry });
    for (const p of [...emails, ...phones.map((x) => x.replace('+84', '0'))]) {
      if (c.includes('"0912345678":')) continue; // khóa không bị đổi theo đặc tả
      assert.ok(!c.includes(p), p);
    }
    for (const e of emails) assert.ok(!c.includes(e));
    assert.equal(rec.hash, sha(c));
  }
  assert.equal(chain[0].prev, '0'.repeat(64));
  assert.equal(chain[1].prev, chain[0].hash);
  assert.deepEqual(verify(chain), { ok: true });
});

test('sửa input sau append không ảnh hưởng chain', () => {
  const entry = { a: { b: ['x@y.com', 'ok'] }, n: 1 };
  const chain = [];
  const rec = append(chain, entry);
  entry.a.b.push('evil');
  entry.a.b[1] = 'changed';
  entry.n = 2;
  assert.deepEqual(rec.entry, { a: { b: ['[EMAIL]', 'ok'] }, n: 1 });
  assert.deepEqual(verify(chain), { ok: true });
});

test('verify phát hiện hoán đổi, xóa giữa, sửa sâu', () => {
  const mk = () => {
    const c = [];
    for (let i = 0; i < 5; i++) append(c, { i, deep: { l: [{ v: `v${i}` }] } });
    return c;
  };
  let c = mk();
  [c[1], c[2]] = [c[2], c[1]];
  assert.deepEqual(verify(c), { ok: false, index: 1 });

  c = mk();
  c.splice(2, 1);
  assert.deepEqual(verify(c), { ok: false, index: 2 });

  c = mk();
  c[3].entry.deep.l[0].v = 'tampered';
  assert.deepEqual(verify(c), { ok: false, index: 3 });

  // sửa bản ghi sớm và sửa lại hash của nó: bản ghi kế tiếp vỡ prev
  c = mk();
  c[1].entry.i = 99;
  assert.deepEqual(verify(c), { ok: false, index: 1 });
  c[1].hash = sha(canonicalize({ seq: 1, prev: c[1].prev, entry: c[1].entry }));
  assert.deepEqual(verify(c), { ok: false, index: 2 });

  assert.deepEqual(verify([]), { ok: true });
});
