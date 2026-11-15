import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, redact, append, verify } from '../src/index.js';

const ZERO = '0'.repeat(64);
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('canonicalize', () => {
  test('sắp khóa lồng nhau', () => {
    assert.equal(canonicalize({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }] } }), '{"a":{"c":[{"y":2,"z":1}],"d":1},"b":1}');
  });
  test('mảng giữ thứ tự', () => {
    assert.equal(canonicalize([3, 1, 2]), '[3,1,2]');
  });
  test('bỏ thuộc tính undefined, undefined trong mảng thành null', () => {
    assert.equal(canonicalize({ a: undefined, b: 1 }), '{"b":1}');
    assert.equal(canonicalize([undefined, 1]), '[null,1]');
  });
  test('không khoảng trắng', () => {
    assert.doesNotMatch(canonicalize({ a: [1, { b: 2 }], c: 'x' }), /[ \n\t]/);
  });
  test('khóa astral sắp theo code point', () => {
    assert.equal(canonicalize({ '\u{1F600}': 2, '～': 1 }), '{"～":1,"\u{1F600}":2}');
    assert.equal(canonicalize({ '\u{1F600}': 2, a: 0, '～': 1 }), '{"a":0,"～":1,"\u{1F600}":2}');
  });
  test('chuỗi đặc biệt/Unicode giống JSON.stringify', () => {
    const s = 'a"b\\c\n\t\u0001 tiếng Việt 😀  ';
    assert.equal(canonicalize(s), JSON.stringify(s));
    assert.equal(canonicalize({ k: s }), `{"k":${JSON.stringify(s)}}`);
  });
  test('số, boolean, null', () => {
    assert.equal(canonicalize([1, -0.5, 1e21, true, false, null]), JSON.stringify([1, -0.5, 1e21, true, false, null]));
    assert.equal(canonicalize(null), 'null');
    assert.equal(canonicalize(0), '0');
  });
  test('Date qua toJSON', () => {
    const d = new Date(0);
    assert.equal(canonicalize(d), JSON.stringify(d));
    assert.equal(canonicalize({ d }), '{"d":"1970-01-01T00:00:00.000Z"}');
  });
  test('khác thứ tự khóa cho cùng chuỗi', () => {
    assert.equal(canonicalize({ a: 1, b: { x: 1, y: 2 } }), canonicalize({ b: { y: 2, x: 1 }, a: 1 }));
  });
});

describe('redact', () => {
  test('e-mail và điện thoại ở mọi độ sâu, kể cả mảng lồng mảng', () => {
    const out = redact({
      a: 'mail x.y@ex.vn',
      b: { c: ['0912345678', [['liên hệ +84387654321', { d: 'u@d.com' }]]] },
    });
    assert.deepEqual(out, {
      a: 'mail [EMAIL]',
      b: { c: ['[PHONE]', [['liên hệ [PHONE]', { d: '[EMAIL]' }]]] },
    });
  });
  test('cả hai tiền tố và các đầu số 3/5/7/8/9', () => {
    for (const d of '35789') {
      assert.equal(redact(`0${d}12345678`), '[PHONE]');
      assert.equal(redact(`+84${d}12345678`), '[PHONE]');
    }
  });
  test('nhiều giá trị trong cùng chuỗi', () => {
    assert.equal(redact('a@b.vn, 0912345678; +84912345678.'), '[EMAIL], [PHONE]; [PHONE].');
  });
  test('ca âm: đầu số 1/2/4/6', () => {
    for (const d of '1246') {
      assert.equal(redact(`0${d}12345678`), `0${d}12345678`);
      assert.equal(redact(`+84${d}12345678`), `+84${d}12345678`);
    }
  });
  test('ca âm: 8 hoặc 10 chữ số sau tiền tố', () => {
    assert.equal(redact('091234567'), '091234567');
    assert.equal(redact('09123456789'), '09123456789');
    assert.equal(redact('+8491234567'), '+8491234567');
    assert.equal(redact('+849123456789'), '+849123456789');
  });
  test('ca âm: có chữ số liền trước hoặc liền sau', () => {
    assert.equal(redact('10912345678'), '10912345678');
    assert.equal(redact('09123456781'), '09123456781');
    assert.equal(redact('1+84912345678'), '1+84912345678');
    assert.equal(redact('+849123456781'), '+849123456781');
  });
  test('key chứa e-mail không đổi', () => {
    assert.deepEqual(redact({ 'a@b.com': 'a@b.com' }), { 'a@b.com': '[EMAIL]' });
  });
  test('giá trị không phải chuỗi giữ nguyên', () => {
    assert.deepEqual(redact({ n: 912345678, b: true, z: null, f: 1.5 }), { n: 912345678, b: true, z: null, f: 1.5 });
  });
  test('không mutate input', () => {
    const input = { a: 'x@y.com', b: [{ c: '0912345678' }, ['z@z.vn']] };
    const snap = structuredClone(input);
    redact(input);
    assert.deepEqual(input, snap);
  });
  test('bản sao mới, không chia sẻ tham chiếu', () => {
    const input = { a: { b: 1 }, l: [{ c: 2 }, [3]] };
    const out = redact(input);
    assert.notEqual(out, input);
    assert.notEqual(out.a, input.a);
    assert.notEqual(out.l, input.l);
    assert.notEqual(out.l[0], input.l[0]);
    assert.notEqual(out.l[1], input.l[1]);
    assert.deepEqual(out, input);
  });
});

describe('append', () => {
  const entry = { who: 'a@b.com', phone: '0912345678', note: ['+84387654321'] };

  test('seq, prev, hash, giá trị trả về', () => {
    const chain = [];
    const r0 = append(chain, { n: 1 });
    const r1 = append(chain, { n: 2 });
    const r2 = append(chain, { n: 3 });
    assert.deepEqual(chain.map((r) => r.seq), [0, 1, 2]);
    assert.equal(r0.prev, ZERO);
    assert.equal(r1.prev, r0.hash);
    assert.equal(r2.prev, r1.hash);
    assert.equal(chain.length, 3);
    assert.equal(r0, chain[0]);
    assert.equal(r2, chain[2]);
    for (const r of chain) {
      assert.match(r.hash, /^[0-9a-f]{64}$/);
      assert.equal(r.hash, sha(canonicalize({ seq: r.seq, prev: r.prev, entry: r.entry })));
    }
  });
  test('PII không vào hash', () => {
    const chain = [];
    const r = append(chain, entry);
    assert.deepEqual(r.entry, { who: '[EMAIL]', phone: '[PHONE]', note: ['[PHONE]'] });
    const input = canonicalize({ seq: r.seq, prev: r.prev, entry: r.entry });
    assert.doesNotMatch(input, /a@b\.com|0912345678|387654321/);
    assert.equal(r.hash, sha(input));
    assert.notEqual(r.hash, sha(canonicalize({ seq: 0, prev: ZERO, entry })));
    assert.doesNotMatch(JSON.stringify(chain), /a@b\.com|0912345678|387654321/);
  });
  test('sửa entry gốc sau append không đổi chain', () => {
    const chain = [];
    const e = { a: { b: 'x' }, l: [1] };
    append(chain, e);
    const snap = structuredClone(chain);
    e.a.b = 'changed';
    e.l.push(2);
    assert.deepEqual(chain, snap);
    assert.deepEqual(verify(chain), { ok: true });
  });
});

describe('verify', () => {
  const build = () => {
    const c = [];
    for (let i = 0; i < 4; i++) append(c, { i, m: `u${i}@x.vn` });
    return c;
  };
  test('chain rỗng và hợp lệ', () => {
    assert.deepEqual(verify([]), { ok: true });
    assert.deepEqual(verify(build()), { ok: true });
  });
  test('sửa entry', () => {
    const c = build(); c[2].entry.i = 99;
    assert.deepEqual(verify(c), { ok: false, index: 2 });
  });
  test('sửa hash', () => {
    const c = build(); c[1].hash = 'f'.repeat(64);
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
  test('sửa prev', () => {
    const c = build(); c[3].prev = 'a'.repeat(64);
    assert.deepEqual(verify(c), { ok: false, index: 3 });
    const d = build(); d[0].prev = 'a'.repeat(64);
    assert.deepEqual(verify(d), { ok: false, index: 0 });
  });
  test('đổi seq', () => {
    const c = build(); c[2].seq = 7;
    assert.deepEqual(verify(c), { ok: false, index: 2 });
  });
  test('hoán đổi hai bản ghi', () => {
    const c = build(); [c[1], c[2]] = [c[2], c[1]];
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
  test('xóa bản ghi giữa', () => {
    const c = build(); c.splice(1, 1);
    assert.deepEqual(verify(c), { ok: false, index: 1 });
  });
  test('xóa bản ghi đầu', () => {
    const c = build(); c.shift();
    assert.deepEqual(verify(c), { ok: false, index: 0 });
  });
  // Gắn với giả định A2: verify coi entry còn PII là lỗi dù hash tự tính đúng.
  test('[A2] chèn bản ghi có PII nhưng hash tự tính đúng', () => {
    const c = build();
    const entry = { leak: 'victim@x.com' };
    const seq = c.length;
    const prev = c[seq - 1].hash;
    c.push({ seq, prev, entry, hash: sha(canonicalize({ seq, prev, entry })) });
    assert.deepEqual(verify(c), { ok: false, index: seq });
  });
});
