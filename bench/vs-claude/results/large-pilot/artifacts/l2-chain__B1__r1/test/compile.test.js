import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, diff, formatText } from '../src/index.js';

test('compile: ba nhánh kết quả', () => {
  assert.equal(compile({ main: 'x = ' }, 'main').stage, 'parse');
  assert.equal(compile({}, 'main').errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
  const c = compile({ main: 'a = 1\na = 2' }, 'main');
  assert.equal(c.stage, 'check');
  assert.equal(c.errors[0].code, 'SEM_DUPLICATE_KEY');
  const s = compile({ main: 'a = "x"' }, 'main', { type: 'object', fields: { a: { type: 'number' } } });
  assert.equal(s.errors[0].code, 'SEM_TYPE_MISMATCH');
});

test('đầu cuối: compile hai cấu hình rồi diff', () => {
  const a = compile({ main: 'p = 1\nn = "v${p}"' }, 'main').config;
  const b = compile({ main: 'p = 2\nn = "v${p}"' }, 'main').config;
  assert.equal(formatText(diff(a, b)), '~ /n: "v1" -> "v2"\n~ /p: 1 -> 2');
});

test('compile: entry thiếu → stage parse; index xuất đủ hàm', async () => {
  const r = compile({ main: 'a = 1' }, 'nope');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
  const m = await import('../src/index.js');
  for (const n of ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'compile', 'diff', 'applyDiff', 'formatText', 'formatJson', 'summarize', 'escapePointer', 'unescapePointer', 'parsePointer', 'formatPointer']) {
    assert.equal(typeof m[n], 'function', n);
  }
});

test('compile: include và ghi đè (ví dụ SPEC)', () => {
  const files = { main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"', 'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"' };
  const r = compile(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(JSON.stringify(r.config), '{"server":{"host":"a","port":2},"mode":"prod"}');
});
