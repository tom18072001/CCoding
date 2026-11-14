import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';

test('index xuất đủ API', () => {
  for (const n of ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'compile', 'diff', 'applyDiff', 'formatText', 'formatJson', 'summarize', 'escapePointer', 'unescapePointer', 'parsePointer', 'formatPointer']) {
    assert.equal(typeof api[n], 'function', n);
  }
});

test('compile: parse, check, thành công', () => {
  let r = api.compile({ main: 'a = [' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].file, 'main');
  r = api.compile({}, 'main');
  assert.equal(r.errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
  r = api.compile({ main: 'a = "${b}"' }, 'main');
  assert.deepEqual([r.ok, r.stage, r.errors.map((e) => e.code)], [false, 'check', ['SEM_UNDEFINED_REF']]);
  r = api.compile({ main: 'a = 1' }, 'main', { fields: { a: { type: 'string' } } });
  assert.equal(r.stage, 'check');
  assert.equal(r.errors[0].code, 'SEM_TYPE_MISMATCH');
  assert.deepEqual(api.compile({ main: 'include "b"\nx = "${y}"', b: 'y = 1' }, 'main'), { ok: true, config: { y: 1, x: 1 } });
});

test('đầu cuối: compile rồi diff', () => {
  const a = api.compile({ main: 'v = 1\nl = [1]' }, 'main').config;
  const b = api.compile({ main: 'v = 2\nl = [1, 2]' }, 'main').config;
  assert.equal(api.formatText(api.diff(a, b)), '+ /l/1 = 2\n~ /v: 1 -> 2');
});
