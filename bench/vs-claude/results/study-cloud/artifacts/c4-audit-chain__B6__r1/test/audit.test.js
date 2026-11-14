import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

const ZERO = '0'.repeat(64);
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const clone = (x) => structuredClone(x);

function build(n = 4) {
  const chain = [];
  for (let i = 0; i < n; i++) append(chain, { action: 'act' + i, n: i });
  return chain;
}

describe('canonicalize', () => {
  test('sorts keys at every depth, drops undefined props', () => {
    assert.equal(canonicalize({ b: 1, a: [{ d: 1, c: undefined }] }), '{"a":[{"d":1}],"b":1}');
  });
  test('sorts by code point, not UTF-16 unit', () => {
    const astral = '\u{1F600}'; // surrogates D83D DE00
    const fw = '～';
    assert.equal(canonicalize({ [astral]: 1, [fw]: 2 }), `{"${fw}":2,"${astral}":1}`);
  });
  test('arrays keep order; undefined in array becomes null', () => {
    assert.equal(canonicalize([3, 1, 2]), '[3,1,2]');
    assert.equal(canonicalize([1, undefined, 2]), '[1,null,2]');
  });
  test('matches JSON.stringify for primitives and strings', () => {
    for (const v of [null, true, 0, -1.5, 'a"b\n ', 'é']) {
      assert.equal(canonicalize(v), JSON.stringify(v));
    }
    assert.equal(canonicalize({}), '{}');
    assert.equal(canonicalize([]), '[]');
  });
  test('deterministic regardless of insertion order', () => {
    assert.equal(canonicalize({ x: { b: 1, a: 2 }, y: 1 }), canonicalize({ y: 1, x: { a: 2, b: 1 } }));
  });
});

describe('redact', () => {
  test('replaces email and phones', () => {
    assert.equal(redact({ m: 'mail a.b+c@example.com now' }).m, 'mail [EMAIL] now');
    assert.equal(redact({ p: '0912345678' }).p, '[PHONE]');
    assert.equal(redact({ p: 'call +84912345678.' }).p, 'call [PHONE].');
    assert.equal(redact({ p: '0312345678 0512345678 0712345678 0812345678' }).p, '[PHONE] [PHONE] [PHONE] [PHONE]');
  });
  test('does not replace non-matching numbers', () => {
    for (const s of ['09123456789', '109123456780', 'x09123456781', '0212345678', '0112345678', '0412345678', '0612345678', '+84212345678', '091234567']) {
      assert.equal(redact({ s }).s, s, s);
    }
  });
  test('non-digit neighbours still match', () => {
    assert.equal(redact({ s: 'a0912345678b' }).s, 'a[PHONE]b');
  });
  test('deep and arrays', () => {
    const out = redact({ a: { b: [{ c: 'x@y.com' }, ['0912345678', 'ok']] }, t: ['+84912345678'] });
    assert.deepEqual(out, { a: { b: [{ c: '[EMAIL]' }, ['[PHONE]', 'ok']] }, t: ['[PHONE]'] });
  });
  test('keys unchanged', () => {
    const out = redact({ 'x@y.com': 'v', '0912345678': 'w' });
    assert.deepEqual(Object.keys(out).sort(), ['0912345678', 'x@y.com']);
  });
  test('does not mutate input; returns copy', () => {
    const input = { a: 'x@y.com', b: [{ c: '0912345678' }] };
    const before = clone(input);
    const out = redact(input);
    assert.deepEqual(input, before);
    assert.notEqual(out, input);
    assert.notEqual(out.b, input.b);
    assert.notEqual(out.b[0], input.b[0]);
  });
  test('non-strings preserved', () => {
    const e = { n: 5, t: true, f: false, z: null, arr: [1, null, false] };
    assert.deepEqual(redact(e), e);
  });
});

describe('append', () => {
  test('seq, prev linkage, independent hash', () => {
    const chain = [];
    const r0 = append(chain, { a: 1 });
    const r1 = append(chain, { a: 2 });
    const r2 = append(chain, { a: 3 });
    assert.deepEqual(chain, [r0, r1, r2]);
    assert.deepEqual(chain.map((r) => r.seq), [0, 1, 2]);
    assert.equal(r0.prev, ZERO);
    assert.equal(r1.prev, r0.hash);
    assert.equal(r2.prev, r1.hash);
    for (const r of chain) {
      assert.match(r.hash, /^[0-9a-f]{64}$/);
      assert.equal(r.hash, sha(canonicalize({ seq: r.seq, prev: r.prev, entry: r.entry })));
    }
  });
  test('entry is redacted and PII never reaches hash input or chain', () => {
    const chain = [];
    const input = { user: 'jane@example.com', phones: ['0912345678', '+84987654321'], note: 'ok' };
    const before = clone(input);
    const rec = append(chain, input);
    assert.deepEqual(input, before);
    const red = { user: '[EMAIL]', phones: ['[PHONE]', '[PHONE]'], note: 'ok' };
    assert.deepEqual(rec.entry, red);
    assert.equal(rec.hash, sha(canonicalize({ seq: 0, prev: ZERO, entry: red })));
    const dump = JSON.stringify(chain);
    for (const pii of ['jane@example.com', '0912345678', '987654321']) assert.ok(!dump.includes(pii), pii);
  });
});

describe('verify', () => {
  test('valid and empty chains', () => {
    assert.deepEqual(verify([]), { ok: true });
    assert.deepEqual(verify(build(4)), { ok: true });
  });
  test('tampered entry', () => {
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
    c[3].prev = ZERO;
    assert.deepEqual(verify(c), { ok: false, index: 3 });
  });
  test('first record with wrong prev', () => {
    const c = build(2);
    c[0].prev = 'a'.repeat(64);
    assert.deepEqual(verify(c), { ok: false, index: 0 });
  });
  test('changed seq', () => {
    const c = build(4);
    c[2].seq = 7;
    assert.deepEqual(verify(c), { ok: false, index: 2 });
  });
  test('removed middle record', () => {
    const c = build(4);
    c.splice(1, 1);
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
  test('removed first record', () => {
    const c = build(3);
    c.shift();
    assert.deepEqual(verify(c), { ok: false, index: 0 });
  });
  test('swapped order', () => {
    const c = build(4);
    [c[1], c[2]] = [c[2], c[1]];
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
  test('first bad index reported when several are bad', () => {
    const c = build(5);
    c[3].entry.n = 99;
    c[1].entry.n = 99;
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
});
