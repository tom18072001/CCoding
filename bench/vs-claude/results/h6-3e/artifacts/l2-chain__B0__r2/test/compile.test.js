import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';
import { compile, diff, formatText, applyDiff } from '../src/index.js';

test('compile thành công và so sánh', () => {
  const a = compile({ main: 'p = 1' }, 'main');
  const b = compile({ main: 'p = 2\nq = [1]' }, 'main');
  assert.equal(formatText(diff(a.config, b.config)), '~ /p: 1 -> 2\n+ /q = [1]');
});

test('compile lỗi parse', () => {
  const r = compile({ main: 'a = ' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].file, 'main');
  assert.equal(compile({}, 'main').errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});

test('compile lỗi check và schema', () => {
  const r = compile({ main: 'a = "${b}"' }, 'main');
  assert.deepEqual([r.ok, r.stage, r.errors[0].code], [false, 'check', 'SEM_UNDEFINED_REF']);
  const s = compile({ main: 'a = 1' }, 'main', { type: 'object', fields: { a: { type: 'string' } } });
  assert.deepEqual([s.stage, s.errors[0].code], ['check', 'SEM_TYPE_MISMATCH']);
});

test('compile: include + ghi đè, thứ tự khóa (SPEC mục 9)', () => {
  const files = { main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"', 'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"' };
  const r = compile(files, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('compile: lỗi lexer/parse ở tệp include, dấu phẩy thừa', () => {
  const bad = compile({ main: 'include "x"', x: 'a = "\\q"' }, 'main');
  assert.deepEqual([bad.ok, bad.stage, bad.errors.length, bad.errors[0].file], [false, 'parse', 1, 'x']);
  assert.match(bad.errors[0].code, /^LEX_/);
  const ex = compile({ main: 'https { port = 1 , }' }, 'main');
  assert.equal(ex.errors[0].code, 'PARSE_UNEXPECTED_TOKEN');
});

test('compile: dừng ở tầng lỗi, không có config; API công khai đủ', () => {
  const r = compile({ main: 'a = "${b}"' }, 'main');
  assert.equal('config' in r, false);
  for (const n of ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'compile', 'diff', 'applyDiff',
    'formatText', 'formatJson', 'summarize', 'escapePointer', 'unescapePointer', 'parsePointer', 'formatPointer']) {
    assert.equal(typeof api[n], 'function', n);
  }
});

test('compile: bất biến applyDiff(a, diff(a, b)) = b', () => {
  const a = compile({ main: 'x = [1,2,3]\ns { k = "v" }' }, 'main').config;
  const b = compile({ main: 'x = [1,5]\ns { k = "w" z = null }' }, 'main').config;
  assert.deepEqual(applyDiff(a, diff(a, b)), b);
});
