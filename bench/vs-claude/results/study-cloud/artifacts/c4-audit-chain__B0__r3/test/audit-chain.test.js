import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const ZERO = '0'.repeat(64);

test('canonicalize', async (t) => {
  await t.test('sorts keys at every depth, including objects inside arrays', () => {
    assert.equal(canonicalize({ b: { z: 1, a: 2 }, a: [{ y: 1, x: 2 }] }), '{"a":[{"x":2,"y":1}],"b":{"a":2,"z":1}}');
  });
  await t.test('keeps array order', () => {
    assert.equal(canonicalize([3, 1, 2]), '[3,1,2]');
  });
  await t.test('omits undefined properties; undefined in array becomes null', () => {
    assert.equal(canonicalize({ a: undefined, b: 1 }), '{"b":1}');
    assert.equal(canonicalize([1, undefined, 2]), '[1,null,2]');
  });
  await t.test('no whitespace', () => {
    assert.doesNotMatch(canonicalize({ a: [1, { b: 2 }], c: 'x' }), /[ \n\t]/);
  });
  await t.test('strings match JSON.stringify', () => {
    const s = 'q"\\\n\t\u0001 é 中   😀 \ud800';
    assert.equal(canonicalize({ k: s }), `{"k":${JSON.stringify(s)}}`);
    assert.equal(canonicalize(s), JSON.stringify(s));
  });
  await t.test('Date uses toJSON', () => {
    const d = new Date('2026-01-02T03:04:05.000Z');
    assert.equal(canonicalize({ d }), '{"d":"2026-01-02T03:04:05.000Z"}');
  });
  await t.test('orders by code point, not UTF-16 unit (U+FF61 before U+1F600)', () => {
    const out = canonicalize({ '\u{1F600}': 1, '｡': 2 });
    assert.equal(out, '{"｡":2,"\u{1F600}":1}');
  });
  await t.test('insertion order does not matter', () => {
    assert.equal(canonicalize({ a: 1, b: { c: 1, d: 2 } }), canonicalize({ b: { d: 2, c: 1 }, a: 1 }));
  });
  await t.test('primitives and null', () => {
    assert.equal(canonicalize(null), 'null');
    assert.equal(canonicalize(1.5), '1.5');
    assert.equal(canonicalize(true), 'true');
  });
});

test('redact', async (t) => {
  const r = (s) => redact({ s }).s;
  await t.test('email', () => {
    assert.equal(r('mail a.b+c@example.com now'), 'mail [EMAIL] now');
  });
  await t.test('valid phones 0xxxxxxxxx and +84xxxxxxxxx for prefixes 3/5/7/8/9', () => {
    for (const p of ['3', '5', '7', '8', '9']) {
      assert.equal(r(`0${p}12345678`), '[PHONE]');
      assert.equal(r(`+84${p}12345678`), '[PHONE]');
    }
  });
  await t.test('invalid prefixes 1/2/4/6 are untouched', () => {
    for (const p of ['1', '2', '4', '6']) {
      assert.equal(r(`0${p}12345678`), `0${p}12345678`);
      assert.equal(r(`+84${p}12345678`), `+84${p}12345678`);
    }
  });
  await t.test('wrong digit count is untouched', () => {
    assert.equal(r('091234567'), '091234567');
    assert.equal(r('09123456789'), '09123456789');
    assert.equal(r('+8491234567'), '+8491234567');
    assert.equal(r('+849123456789'), '+849123456789');
  });
  await t.test('adjacent digits prevent a match', () => {
    assert.equal(r('10912345678'), '10912345678');
    assert.equal(r('09123456780'), '09123456780');
    assert.equal(r('1+84912345678'), '1+84912345678');
    assert.equal(r('+849123456781'), '+849123456781');
  });
  await t.test('phone delimited by non-digits is redacted', () => {
    assert.equal(r('call:0912345678.'), 'call:[PHONE].');
    assert.equal(r('(0912345678)'), '([PHONE])');
  });
  await t.test('deeply nested strings and arrays', () => {
    const out = redact({ a: { b: [{ c: ['x@y.vn', 'tel 0912345678'] }, 'ok'] } });
    assert.deepEqual(out, { a: { b: [{ c: ['[EMAIL]', 'tel [PHONE]'] }, 'ok'] } });
    assert.deepEqual(redact(['0912345678', ['u@v.com']]), ['[PHONE]', ['[EMAIL]']]);
  });
  await t.test('multiple PII in one string', () => {
    assert.equal(r('a@b.com, c@d.org, 0912345678 / +84987654321'), '[EMAIL], [EMAIL], [PHONE] / [PHONE]');
  });
  await t.test('keys are unchanged', () => {
    assert.deepEqual(redact({ 'a@b.com': 'x@y.com' }), { 'a@b.com': '[EMAIL]' });
  });
  await t.test('non-string primitives preserved', () => {
    assert.deepEqual(redact({ n: 912345678, b: false, z: null, t: true }), { n: 912345678, b: false, z: null, t: true });
  });
  await t.test('does not mutate input and returns a copy', () => {
    const input = { a: 'x@y.com', n: { p: ['0912345678'] } };
    const snap = structuredClone(input);
    const out = redact(input);
    assert.deepEqual(input, snap);
    assert.notEqual(out, input);
    assert.notEqual(out.n, input.n);
    assert.notEqual(out.n.p, input.n.p);
  });
});

test('append', async (t) => {
  await t.test('seq, prev linkage, hash format and independent hash', () => {
    const chain = [];
    const recs = [0, 1, 2].map((i) => append(chain, { i, who: 'svc' }));
    assert.deepEqual(recs.map((x) => x.seq), [0, 1, 2]);
    assert.equal(recs[0].prev, ZERO);
    assert.equal(recs[1].prev, recs[0].hash);
    assert.equal(recs[2].prev, recs[1].hash);
    for (const x of recs) {
      assert.match(x.hash, /^[0-9a-f]{64}$/);
      assert.equal(x.hash, sha(canonicalize({ seq: x.seq, prev: x.prev, entry: x.entry })));
    }
  });
  await t.test('returns the pushed element', () => {
    const chain = [];
    const rec = append(chain, { a: 1 });
    assert.equal(chain.length, 1);
    assert.equal(chain[0], rec);
  });
  await t.test('stored entry is redacted', () => {
    const chain = [];
    const rec = append(chain, { m: 'a@b.com 0912345678' });
    assert.deepEqual(rec.entry, { m: '[EMAIL] [PHONE]' });
  });
  await t.test('mutating the original object afterwards does not break the chain', () => {
    const chain = [];
    const e = { a: { b: 'x' }, l: [1] };
    append(chain, e);
    append(chain, { z: 1 });
    e.a.b = 'changed';
    e.l.push(2);
    assert.deepEqual(verify(chain), { ok: true });
  });
});

test('PII never reaches the hash input', () => {
  const email = 'nguyen.van@example.com';
  const phones = ['0912345678', '+84987654321'];
  const chain = [];
  const entries = [
    { msg: `contact ${email} or ${phones[0]}` },
    { nested: [{ p: phones[1], e: [email] }] },
  ];
  for (const e of entries) append(chain, e);
  const dump = JSON.stringify(chain);
  for (const pii of [email, ...phones, '912345678', '987654321']) {
    assert.ok(!dump.includes(pii), `chain leaks PII (${pii.length} chars)`);
  }
  for (const rec of chain) {
    const input = canonicalize({ seq: rec.seq, prev: rec.prev, entry: rec.entry });
    for (const pii of [email, ...phones]) assert.ok(!input.includes(pii));
    assert.equal(rec.hash, sha(input));
  }
  const c2 = [];
  const raw = entries[0];
  const rec = append(c2, raw);
  assert.equal(rec.hash, sha(canonicalize({ seq: 0, prev: ZERO, entry: redact(raw) })));
  assert.notEqual(rec.hash, sha(canonicalize({ seq: 0, prev: ZERO, entry: raw })));
});

test('verify', async (t) => {
  const build = (n = 4) => {
    const c = [];
    for (let i = 0; i < n; i++) append(c, { i, note: `n${i}` });
    return c;
  };
  await t.test('empty and valid chains are ok', () => {
    assert.deepEqual(verify([]), { ok: true });
    assert.deepEqual(verify(build()), { ok: true });
  });
  await t.test('modified entry', () => {
    const c = build(); c[2].entry.note = 'evil';
    assert.deepEqual(verify(c), { ok: false, index: 2 });
  });
  await t.test('modified seq', () => {
    const c = build(); c[2].seq = 9;
    assert.deepEqual(verify(c), { ok: false, index: 2 });
  });
  await t.test('modified prev', () => {
    const c = build(); c[1].prev = 'f'.repeat(64);
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
  await t.test('modified first prev', () => {
    const c = build(); c[0].prev = 'f'.repeat(64);
    assert.deepEqual(verify(c), { ok: false, index: 0 });
  });
  await t.test('modified hash', () => {
    const c = build(); c[1].hash = 'a'.repeat(64);
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
  await t.test('recomputed hash after edit still breaks the next link', () => {
    const c = build(); c[1].entry.note = 'evil';
    c[1].hash = sha(canonicalize({ seq: 1, prev: c[1].prev, entry: c[1].entry }));
    assert.deepEqual(verify(c), { ok: false, index: 2 });
  });
  await t.test('swapped records', () => {
    const c = build(); [c[1], c[2]] = [c[2], c[1]];
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
  await t.test('deleted middle record', () => {
    const c = build(); c.splice(1, 1);
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
  await t.test('null or malformed records do not throw', () => {
    assert.deepEqual(verify([null]), { ok: false, index: 0 });
    const c = build(); c[2] = null;
    assert.deepEqual(verify(c), { ok: false, index: 2 });
    for (const bad of [{}, { seq: 1 }, { seq: 1, prev: 'x' }, 'str', 5, []]) {
      const d = build(); d[1] = bad;
      assert.deepEqual(verify(d), { ok: false, index: 1 });
    }
    const e = build(); delete e[3].entry;
    assert.deepEqual(verify(e), { ok: false, index: 3 });
  });
});
