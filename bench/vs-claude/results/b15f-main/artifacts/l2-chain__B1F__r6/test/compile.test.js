import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';

test('index xuất đủ API công khai', () => {
  for (const n of ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'compile',
    'diff', 'applyDiff', 'formatText', 'formatJson', 'summarize',
    'escapePointer', 'unescapePointer', 'parsePointer', 'formatPointer']) {
    assert.equal(typeof api[n], 'function', n);
  }
});
test('compile: nhánh parse', () => {
  const r = api.compile({ main: 'a = ' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'PARSE_UNEXPECTED_EOF');
  assert.equal(r.errors[0].file, 'main');
  assert.equal(api.compile({}, 'main').errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});
test('compile: nhánh check (kể cả lỗi schema)', () => {
  const r = api.compile({ main: 'a = "${b}"' }, 'main');
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => e.code), ['SEM_UNDEFINED_REF']);
  const s = api.compile({ main: 'a = 1' }, 'main', { fields: { a: { type: 'string' } } });
  assert.deepEqual([s.ok, s.stage, s.errors[0].code], [false, 'check', 'SEM_TYPE_MISMATCH']);
});
test('compile: nhánh thành công và nối với diff', () => {
  const files = { main: 'include "b"\nserver { port = 2 }\nmode = "prod"', b: 'server { host = "a" port = 1 }\nmode = "dev"' };
  const r = api.compile(files, 'main');
  assert.deepEqual(r, { ok: true, config: { server: { host: 'a', port: 2 }, mode: 'prod' } });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
  assert.deepEqual(api.compile({ main: 'x = 1' }, 'main', { fields: { x: { type: 'integer' } } }), { ok: true, config: { x: 1 } });
  assert.equal(api.formatText(api.diff(r.config, { server: { host: 'a', port: 3 }, mode: 'prod' })), '~ /server/port: 2 -> 3');
});
