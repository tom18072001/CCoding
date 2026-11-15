import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';

test('danh sách hàm xuất', () => {
  for (const n of ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'diff', 'applyDiff', 'formatText', 'formatJson', 'summarize', 'escapePointer', 'unescapePointer', 'parsePointer', 'formatPointer', 'compile']) {
    assert.equal(typeof api[n], 'function', n);
  }
  assert.equal(api.merge, undefined);
});

test('nhánh parse', () => {
  const r = api.compile({ main: 'a = ' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'PARSE_UNEXPECTED_EOF');
});

test('nhánh check (ngữ nghĩa và schema)', () => {
  const r = api.compile({ main: 'a = "${b}"' }, 'main');
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => e.code), ['SEM_UNDEFINED_REF']);
  const r2 = api.compile({ main: 'a = "x"' }, 'main', { fields: { a: { type: 'number' } } });
  assert.equal(r2.ok, false);
  assert.equal(r2.stage, 'check');
  assert.equal(r2.errors[0].code, 'SEM_TYPE_MISMATCH');
});

test('nhánh thành công, ví dụ include/ghi đè', () => {
  const files = { 'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"\n', main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"\n' };
  const r = api.compile(files, 'main', { closed: true, fields: { server: { required: true, type: 'object' }, mode: { enum: ['dev', 'prod'] } } });
  assert.deepEqual(r, { ok: true, config: { server: { host: 'a', port: 2 }, mode: 'prod' } });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('evaluate → diff trên hai cấu hình', () => {
  const a = api.compile({ main: 'name = "x"\nl = [1,2,3]' }, 'main').config;
  const b = api.compile({ main: 'name = "y"\nl = [1,2]\nn = null' }, 'main').config;
  const ops = api.diff(a, b);
  assert.deepEqual(ops.map((o) => `${o.op} ${o.path}`), ['remove /l/2', 'add /n', 'replace /name']);
  assert.deepEqual(api.applyDiff(a, ops), b);
});
