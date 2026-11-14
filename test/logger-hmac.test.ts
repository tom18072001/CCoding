import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { LogStore, verifyChain, verifyChainStream, resetHmacWarning } from '../src/logger.js';

const ENV = 'CCODING_LOG_HMAC_KEY';
const FAKE_KEY = 'khoa-gia-chi-dung-cho-test-0001';

function withKey<T>(key: string | undefined, fn: () => T): T {
  const old = process.env[ENV];
  if (key === undefined) delete process.env[ENV];
  else process.env[ENV] = key;
  try {
    return fn();
  } finally {
    if (old === undefined) delete process.env[ENV];
    else process.env[ENV] = old;
  }
}

function mk(): { store: LogStore; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccoding-hmac-'));
  const store = new LogStore(dir, { redactSecrets: true, redactPii: true, hashChain: true });
  return { store, file: path.join(dir, 'x.jsonl') };
}

function fill(store: LogStore, file: string, n = 4): void {
  for (let i = 0; i < n; i++) store.append(file, { msg: `dong ${i}` });
}

test('ghi có khóa rồi kiểm có khóa → đạt, dòng có kid và sig', () => {
  withKey(FAKE_KEY, () => {
    const { store, file } = mk();
    fill(store, file);
    const first = JSON.parse(fs.readFileSync(file, 'utf8').split('\n')[0]);
    assert.match(first.kid, /^[0-9a-f]{8}$/);
    assert.match(first.sig, /^[0-9a-f]{64}$/);
    assert.deepEqual(verifyChain(file), { ok: true, lines: 4 });
  });
});

test('sửa một dòng → báo đúng dòng (hash sai)', () => {
  withKey(FAKE_KEY, () => {
    const { store, file } = mk();
    fill(store, file);
    const ls = fs.readFileSync(file, 'utf8').split('\n');
    ls[2] = ls[2].replace('dong 2', 'dong X');
    fs.writeFileSync(file, ls.join('\n'));
    const r = verifyChain(file);
    assert.equal(r.ok, false);
    assert.equal(r.brokenAt, 3);
    assert.match(r.reason!, /hash sai/);
  });
});

test('sửa dòng, tính lại hash nhưng không có khóa → chữ ký sai', () => {
  const { store, file } = mk();
  withKey(FAKE_KEY, () => fill(store, file, 3));
  const ls = fs.readFileSync(file, 'utf8').split('\n');
  const o = JSON.parse(ls[2]);
  const { hash: _h, kid: _k, sig: _s, ...rest } = o;
  rest.msg = 'bi sua';
  const hash = crypto.createHash('sha256').update(rest.prev).update(JSON.stringify(rest)).digest('hex').slice(0, 32);
  ls[2] = JSON.stringify({ ...rest, hash, kid: o.kid, sig: o.sig });
  fs.writeFileSync(file, ls.join('\n'));
  const r = withKey(FAKE_KEY, () => verifyChain(file));
  assert.equal(r.ok, false);
  assert.equal(r.brokenAt, 3);
  assert.equal(r.reason, 'chữ ký sai');
  // kiểm không có khóa: chỉ kiểm hash nên không phát hiện (đúng như tài liệu)
  assert.equal(withKey(undefined, () => verifyChain(file)).ok, true);
});

test('khóa khác → khóa khác/không có khóa', () => {
  const { store, file } = mk();
  withKey(FAKE_KEY, () => fill(store, file, 2));
  const r = withKey('khoa-gia-khac-0002', () => verifyChain(file));
  assert.equal(r.ok, false);
  assert.equal(r.brokenAt, 1);
  assert.equal(r.reason, 'khóa khác/không có khóa');
});

test('thiếu khóa → cảnh báo một lần, chuỗi băm vẫn đúng; log cũ không ký vẫn kiểm được', () => {
  const { store, file } = mk();
  const msgs: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  (process.stderr as any).write = (s: string) => (msgs.push(String(s)), true);
  try {
    withKey(undefined, () => {
      resetHmacWarning();
      fill(store, file, 3);
    });
  } finally {
    (process.stderr as any).write = orig;
  }
  assert.equal(msgs.filter((m) => m.includes(ENV)).length, 1);
  assert.deepEqual(withKey(undefined, () => verifyChain(file)), { ok: true, lines: 3 });
  // có khóa: phần đầu không ký (log cũ) vẫn qua, dòng ký thêm sau đó đạt
  withKey(FAKE_KEY, () => {
    const s2 = new LogStore(path.dirname(file), { redactSecrets: true, redactPii: true, hashChain: true });
    s2.append(file, { msg: 'moi' });
    assert.deepEqual(verifyChain(file, { allowUnsigned: true }), { ok: true, lines: 4 });
    assert.equal(verifyChain(file).reason, 'thiếu chữ ký'); // mặc định có khóa: bắt buộc ký
  });
});

test('nội dung log không chứa khóa', () => {
  withKey(FAKE_KEY, () => {
    const { store, file } = mk();
    fill(store, file);
    assert.equal(fs.readFileSync(file, 'utf8').includes(FAKE_KEY), false);
  });
});

/** Gỡ sig/kid mọi dòng rồi tính lại chuỗi băm (kẻ tấn công không có khóa). */
function stripAndRehash(file: string): void {
  let prev = 'genesis';
  const out = fs.readFileSync(file, 'utf8').split(String.fromCharCode(10)).filter((l) => l.trim()).map((l) => {
    const { hash: _h, sig: _s, kid: _k, ...rest } = JSON.parse(l);
    rest.prev = prev;
    const hash = crypto.createHash('sha256').update(prev).update(JSON.stringify(rest)).digest('hex').slice(0, 32);
    prev = hash;
    return JSON.stringify({ ...rest, hash });
  });
  fs.writeFileSync(file, out.join(String.fromCharCode(10)) + String.fromCharCode(10));
}

test('(a) có khóa, gỡ sig mọi dòng rồi tính lại hash → lỗi ở dòng 1, thiếu chữ ký', () => {
  const { store, file } = mk();
  withKey(FAKE_KEY, () => fill(store, file, 3));
  stripAndRehash(file);
  const r = withKey(FAKE_KEY, () => verifyChain(file));
  assert.equal(r.ok, false);
  assert.equal(r.brokenAt, 1);
  assert.equal(r.reason, 'thiếu chữ ký');
});

test('(b) không khóa nhưng requireSigned → lỗi', () => {
  const { store, file } = mk();
  withKey(FAKE_KEY, () => fill(store, file, 2));
  const r = withKey(undefined, () => verifyChain(file, { requireSigned: true }));
  assert.equal(r.ok, false);
  assert.equal(r.brokenAt, 1);
  assert.match(r.reason!, /không có khóa HMAC/);
});

test('(c) không khóa, không cờ → hành vi cũ (chỉ kiểm hash)', () => {
  const { store, file } = mk();
  withKey(FAKE_KEY, () => fill(store, file, 3));
  stripAndRehash(file);
  assert.deepEqual(withKey(undefined, () => verifyChain(file)), { ok: true, lines: 3 });
});

test('(d) có khóa + allowUnsigned → log cũ chưa ký qua; stream cũng theo cờ', async () => {
  const { store, file } = mk();
  withKey(FAKE_KEY, () => fill(store, file, 3));
  stripAndRehash(file);
  assert.deepEqual(withKey(FAKE_KEY, () => verifyChain(file, { allowUnsigned: true })), { ok: true, lines: 3 });
  const old = process.env[ENV];
  process.env[ENV] = FAKE_KEY;
  try {
    assert.equal((await verifyChainStream(file)).reason, 'thiếu chữ ký');
    assert.equal((await verifyChainStream(file, { allowUnsigned: true })).ok, true);
  } finally {
    if (old === undefined) delete process.env[ENV];
    else process.env[ENV] = old;
  }
});
