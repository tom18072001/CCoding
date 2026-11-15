import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

const ZERO = '0'.repeat(64);
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const hashOf = (seq, prev, entry) => sha(canonicalize({ seq, prev, entry }));
const build = (n = 4) => {
  const c = [];
  for (let i = 0; i < n; i++) append(c, { n: i, action: 'act' + i });
  return c;
};
// Recompute hashes from index `from` on so only the targeted defect remains.
const rehash = (c, from = 0) => {
  for (let i = from; i < c.length; i++) {
    c[i].prev = i === 0 ? ZERO : c[i - 1].hash;
    c[i].hash = hashOf(c[i].seq, c[i].prev, c[i].entry);
  }
};

test.describe('canonicalize', () => {
  test('sorts keys at every depth', () => {
    assert.equal(canonicalize({ b: { d: 1, c: { z: 1, a: 2 } }, a: 0 }), '{"a":0,"b":{"c":{"a":2,"z":1},"d":1}}');
  });
  test('arrays keep order, objects inside are sorted', () => {
    assert.equal(canonicalize([3, 1, { b: 1, a: 2 }, 2]), '[3,1,{"a":2,"b":1},2]');
  });
  test('omits undefined properties; undefined in array becomes null', () => {
    assert.equal(canonicalize({ a: undefined, b: 1 }), '{"b":1}');
    assert.equal(canonicalize([undefined, 1]), '[null,1]');
    assert.equal(canonicalize({ a: [undefined, { x: undefined, y: 1 }] }), '{"a":[null,{"y":1}]}');
  });
  test('Date uses toJSON', () => {
    const d = new Date('2026-01-02T03:04:05.000Z');
    assert.equal(canonicalize({ d }), '{"d":"2026-01-02T03:04:05.000Z"}');
    assert.equal(canonicalize(d), JSON.stringify(d));
  });
  test('matches JSON.stringify for primitives', () => {
    for (const v of ['a"b\\c\n\t\u0001é😀', '', -5, -0.5, 0, 1e21, null, true, false]) {
      assert.equal(canonicalize(v), JSON.stringify(v));
    }
  });
  test('orders keys by code point, not UTF-16 unit', () => {
    const o = { '\u{1F600}': 1, '￿': 2 };
    assert.equal(canonicalize(o), '{"￿":2,"\u{1F600}":1}');
  });
  test('insertion order does not matter', () => {
    assert.equal(canonicalize({ a: 1, b: { x: 1, y: 2 } }), canonicalize({ b: { y: 2, x: 1 }, a: 1 }));
  });
  test('no whitespace in output', () => {
    assert.equal(canonicalize({ a: [1, 2], b: { c: 'x y' } }), '{"a":[1,2],"b":{"c":"x y"}}');
  });
});

test.describe('redact', () => {
  test('plain, dotted and plus-tagged emails', () => {
    assert.deepEqual(redact({ a: 'x@example.com', b: 'first.last@mail.example.org', c: 'me+tag@example.com' }),
      { a: '[EMAIL]', b: '[EMAIL]', c: '[EMAIL]' });
  });
  test('email within text', () => {
    assert.equal(redact({ m: 'contact x@example.com now' }).m, 'contact [EMAIL] now');
  });
  test('phones with 0 and +84 prefixes, all valid first digits', () => {
    for (const d of '35789') {
      assert.equal(redact({ p: `0${d}12345678` }).p, '[PHONE]');
      assert.equal(redact({ p: `+84${d}12345678` }).p, '[PHONE]');
    }
    assert.equal(redact({ p: 'call 0912345678.' }).p, 'call [PHONE].');
  });
  test('invalid leading digits 1,2,4,6 are untouched', () => {
    for (const d of '1246') {
      assert.equal(redact({ p: `0${d}12345678` }).p, `0${d}12345678`);
      assert.equal(redact({ p: `+84${d}12345678` }).p, `+84${d}12345678`);
    }
  });
  test('too few or too many digits untouched', () => {
    assert.equal(redact({ p: '091234567' }).p, '091234567');
    assert.equal(redact({ p: '09123456789' }).p, '09123456789');
    assert.equal(redact({ p: '+8491234567' }).p, '+8491234567');
    assert.equal(redact({ p: '+849123456789' }).p, '+849123456789');
  });
  test('preceding digit prevents match', () => {
    assert.equal(redact({ p: '10912345678' }).p, '10912345678');
    assert.equal(redact({ p: '1+84912345678' }).p, '1+84912345678');
  });
  test('PII nested in arrays of objects', () => {
    const out = redact({ l: [{ e: 'a@b.com', t: ['0912345678', 'ok'] }, 'c@d.org', 5] });
    assert.deepEqual(out, { l: [{ e: '[EMAIL]', t: ['[PHONE]', 'ok'] }, '[EMAIL]', 5] });
  });
  test('keys containing email are kept', () => {
    assert.deepEqual(redact({ 'a@b.com': 'a@b.com' }), { 'a@b.com': '[EMAIL]' });
  });
  test('does not mutate input and returns a deep copy', () => {
    const input = { a: 'x@y.com', n: { arr: ['0912345678', { p: '+84912345678' }] } };
    const before = structuredClone(input);
    const out = redact(input);
    assert.deepEqual(input, before);
    assert.notEqual(out.n, input.n);
    assert.notEqual(out.n.arr, input.n.arr);
    assert.notEqual(out.n.arr[1], input.n.arr[1]);
  });
  test('non-string values are kept', () => {
    const e = { n: 1, b: true, z: null, f: -2.5, arr: [1, false, null] };
    assert.deepEqual(redact(e), e);
  });
});

test.describe('append', () => {
  test('seq increments from 0 and record is pushed and returned', () => {
    const c = [];
    const r0 = append(c, { a: 1 });
    append(c, { a: 2 });
    append(c, { a: 3 });
    assert.deepEqual(c.map((r) => r.seq), [0, 1, 2]);
    assert.equal(c[0], r0);
    assert.deepEqual(Object.keys(r0).sort(), ['entry', 'hash', 'prev', 'seq']);
  });
  test('prev linkage', () => {
    const c = build(3);
    assert.equal(c[0].prev, ZERO);
    assert.equal(c[1].prev, c[0].hash);
    assert.equal(c[2].prev, c[1].hash);
  });
  test('hash equals independent sha256 of canonical {seq,prev,entry}', () => {
    const c = build(3);
    for (const r of c) {
      const expected = createHash('sha256')
        .update(canonicalize({ seq: r.seq, prev: r.prev, entry: r.entry }))
        .digest('hex');
      assert.equal(r.hash, expected);
      assert.match(r.hash, /^[0-9a-f]{64}$/);
    }
  });
  test('stored entry is redacted', () => {
    const r = append([], { who: 'x@example.com', tel: '0912345678' });
    assert.deepEqual(r.entry, { who: '[EMAIL]', tel: '[PHONE]' });
  });
  test('PII never reaches the hash input', () => {
    const email = 'someone@example.com';
    const phone = '0912345678';
    const raw = { who: email, notes: [`call ${phone}`, { alt: '+84912345678' }] };
    const r = append([], raw);
    const input = canonicalize({ seq: r.seq, prev: r.prev, entry: r.entry });
    assert.ok(!input.includes(email));
    assert.ok(!input.includes(phone));
    assert.ok(!input.includes('912345678'));
    assert.ok(input.includes('[EMAIL]') && input.includes('[PHONE]'));
    assert.notEqual(r.hash, hashOf(0, ZERO, raw));
    assert.equal(r.hash, hashOf(0, ZERO, redact(raw)));
  });
  test('does not mutate the caller entry', () => {
    const raw = { who: 'a@b.com' };
    append([], raw);
    assert.deepEqual(raw, { who: 'a@b.com' });
  });
});

test.describe('verify', () => {
  test('valid chain and empty chain are ok', () => {
    assert.deepEqual(verify(build(5)), { ok: true });
    assert.deepEqual(verify([]), { ok: true });
  });
  test('tampered entry in the middle', () => {
    const c = build(4);
    c[2].entry.action = 'evil';
    assert.deepEqual(verify(c), { ok: false, index: 2 });
  });
  test('tampered hash', () => {
    const c = build(4);
    c[1].hash = 'f'.repeat(64);
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
  test('tampered prev', () => {
    const c = build(4);
    c[2].prev = 'a'.repeat(64);
    assert.deepEqual(verify(c), { ok: false, index: 2 });
  });
  test('first record with wrong prev', () => {
    const c = build(2);
    c[0].prev = '1'.repeat(64);
    assert.deepEqual(verify(c), { ok: false, index: 0 });
  });
  test('changed seq', () => {
    const c = build(4);
    c[3].seq = 9;
    assert.deepEqual(verify(c), { ok: false, index: 3 });
  });
  test('changed seq with recomputed hash is still caught', () => {
    const c = build(3);
    c[1].seq = 7;
    rehash(c, 1);
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
  test('swapped records', () => {
    const c = build(4);
    [c[1], c[2]] = [c[2], c[1]];
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
  test('deleted middle record', () => {
    const c = build(4);
    c.splice(1, 1);
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
  test('inserted raw-PII record with valid recomputed hash is rejected', () => {
    const c = build(3);
    const seq = 3;
    const prev = c[2].hash;
    const entry = { who: 'leak@example.com', tel: '0912345678' };
    c.push({ seq, prev, entry, hash: hashOf(seq, prev, entry) });
    assert.deepEqual(verify(c), { ok: false, index: 3 });
  });
  test('raw PII injected mid-chain with whole tail rehashed points at that record', () => {
    const c = build(4);
    c[1].entry = { who: 'leak@example.com' };
    rehash(c, 1);
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
});
