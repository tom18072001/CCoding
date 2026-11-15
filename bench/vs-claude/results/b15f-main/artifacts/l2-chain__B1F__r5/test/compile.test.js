import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/index.js';
import * as api from '../src/index.js';

test('index xuất lại API công khai', () => {
  for (const n of ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'compile', 'diff', 'applyDiff', 'formatText', 'formatJson', 'summarize']) {
    assert.equal(typeof api[n], 'function', n);
  }
});

test('compile: stage parse trả đúng một lỗi có file', () => {
  const r = compile({ main: 'a = 1\nb = ' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.deepEqual(
    { code: r.errors[0].code, file: r.errors[0].file, line: r.errors[0].line, column: r.errors[0].column },
    { code: 'PARSE_UNEXPECTED_EOF', file: 'main', line: 2, column: 5 },
  );
});

test('compile: entry thiếu → stage parse PARSE_ENTRY_NOT_FOUND', () => {
  const r = compile({}, 'main');
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});

test('compile: stage check trả đúng mảng của check', () => {
  const r = compile({ main: 'a = "${b}"\nc = "${d}"' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => [e.code, e.line, e.column]), [
    ['SEM_UNDEFINED_REF', 1, 6],
    ['SEM_UNDEFINED_REF', 2, 6],
  ]);
});

test('compile: lỗi schema ở stage check', () => {
  const r = compile({ main: 'a = "x"' }, 'main', { type: 'object', fields: { a: { type: 'number' } } });
  assert.equal(r.stage, 'check');
  assert.equal(r.errors[0].code, 'SEM_TYPE_MISMATCH');
});

test('compile: thành công', () => {
  assert.deepEqual(compile({ main: 'x = 1' }, 'main'), { ok: true, config: { x: 1 } });
});

test('compile: đầu cuối nhiều tệp, include, hằng, ghi đè, schema', () => {
  const files = {
    main: [
      'const env = "prod"',
      'include "base.cfg"',
      'server { port = 2 }',
      'mode = "${@env}"',
      'name = "svc-${@env}-${server.host}"',
      'ports = [80, 443]',
      'first { port = "${ports.0}" }',
    ].join('\n'),
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"\ninclude "deep.cfg"',
    'deep.cfg': 'extra = [1, 2]\nconst unused = 1',
  };
  const schema = {
    type: 'object',
    closed: true,
    fields: {
      server: { type: 'object', required: true, fields: { host: { type: 'string' }, port: { type: 'integer' } } },
      mode: { enum: ['dev', 'prod'] },
      name: { type: 'string' },
      ports: { type: 'array', items: { type: 'integer' } },
      first: { type: 'object' },
      extra: { type: 'array' },
    },
  };
  const r = compile(files, 'main', schema);
  assert.deepEqual(r, {
    ok: true,
    config: {
      server: { host: 'a', port: 2 },
      mode: 'prod',
      extra: [1, 2],
      name: 'svc-prod-a',
      ports: [80, 443],
      first: { port: 80 },
    },
  });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode', 'extra', 'name', 'ports', 'first']);
});

test('compile: lỗi ở tệp include được báo kèm tên tệp', () => {
  const r = compile({ main: 'include "b"', b: 'k = 1\nk = 2' }, 'main');
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => [e.code, e.file, e.line, e.column]), [['SEM_DUPLICATE_KEY', 'b', 2, 1]]);
});
