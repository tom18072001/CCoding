import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';
import { compile, diff } from '../src/index.js';

test('index xuất đủ API công khai', () => {
  for (const n of ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'compile', 'diff', 'applyDiff',
    'formatText', 'formatJson', 'summarize', 'escapePointer', 'unescapePointer', 'parsePointer', 'formatPointer']) {
    assert.equal(typeof api[n], 'function', n);
  }
});

test('compile: thành công', () => {
  assert.deepEqual(compile({ main: 'a = 1\nb = "${a}"' }, 'main'), { ok: true, config: { a: 1, b: 1 } });
});

test('compile: lỗi parse', () => {
  const r = compile({ main: 'include "x"', x: 'a = ,' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.deepEqual([r.errors[0].code, r.errors[0].file, r.errors[0].line, r.errors[0].column], ['PARSE_UNEXPECTED_TOKEN', 'x', 1, 5]);
  assert.equal(compile({}, 'main').errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});

test('compile: lỗi check và schema', () => {
  const r = compile({ main: 'a = "${b}"' }, 'main');
  assert.equal(r.stage, 'check');
  assert.equal(r.errors[0].code, 'SEM_UNDEFINED_REF');
  const s = compile({ main: 'a = 1' }, 'main', { fields: { a: { type: 'string' } } });
  assert.equal(s.stage, 'check');
  assert.equal(s.errors[0].code, 'SEM_TYPE_MISMATCH');
});

test('đường ống: compile hai cấu hình rồi diff', () => {
  const a = compile({ main: 'p = 1\nl = [1,2]' }, 'main').config;
  const b = compile({ main: 'p = 2\nl = [1]' }, 'main').config;
  assert.deepEqual(diff(a, b).map((o) => o.path), ['/l/1', '/p']);
});
