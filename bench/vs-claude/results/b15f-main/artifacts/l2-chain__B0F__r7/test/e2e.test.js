import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';
import { compile, diff, formatText, applyDiff } from '../src/index.js';

const MAIN_BAD = [
  'const env = "prod"',
  'name = "svc-${@env}"',
  'ports = [80, 443]',
  'http { port = "${ports.0}" }',
  'https { port = "${ports.1}" , }',
].join('\n');
const MAIN_OK = MAIN_BAD.replace(' , }', ' }');

test('e2e: đúng 15 named export', () => {
  assert.deepEqual(Object.keys(api).sort(), [
    'applyDiff', 'check', 'compile', 'diff', 'escapePointer', 'evaluate', 'formatJson',
    'formatPointer', 'formatText', 'parse', 'parsePointer', 'parseProject', 'summarize',
    'tokenize', 'unescapePointer',
  ].sort());
});

test('e2e: ví dụ mục 9 bản lỗi 5:29', () => {
  const r = compile({ main: MAIN_BAD }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  const e = r.errors[0];
  assert.deepEqual([e.code, e.file, e.line, e.column], ['PARSE_UNEXPECTED_TOKEN', 'main', 5, 29]);
});

test('e2e: ví dụ mục 9 bản đã sửa', () => {
  const r = compile({ main: MAIN_OK }, 'main');
  assert.deepEqual(r, {
    ok: true,
    config: { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } },
  });
});

test('e2e: include và ghi đè, thứ tự khóa', () => {
  const files = {
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
  };
  const r = compile(files, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('e2e: lỗi check (tham chiếu không tồn tại) có stage check', () => {
  const r = compile({ main: 'a = "${zz}"' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.equal(r.errors[0].code, 'SEM_UNDEFINED_REF');
});

test('e2e: lỗi check do schema (pha C)', () => {
  const schema = {
    type: 'object',
    closed: true,
    fields: { port: { type: 'integer', required: true }, name: { type: 'string' } },
  };
  const r = compile({ main: 'port = "x"\nextra = 1' }, 'main', schema);
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => [e.code, e.file, e.line, e.column]), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 8],
    ['SEM_UNKNOWN_KEY', 'main', 2, 1],
  ]);
  assert.deepEqual(compile({ main: 'port = 8' }, 'main', schema), { ok: true, config: { port: 8 } });
});

test('e2e: compile → diff → formatText → applyDiff round-trip', () => {
  const a = compile({ main: 'a { b = [1, 2, 3] }\nx = 1' }, 'main').config;
  const b = compile({ main: 'a { b = [1, 5] }\nx = 2\nc = null' }, 'main').config;
  const ops = diff(a, b);
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x', oldValue: 1, value: 2 },
  ]);
  assert.equal(
    formatText(ops),
    '~ /a/b/1: 2 -> 5\n- /a/b/2 = 3\n+ /c = null\n~ /x: 1 -> 2',
  );
  assert.deepEqual(applyDiff(a, ops), b);
  assert.deepEqual(a, { a: { b: [1, 2, 3] }, x: 1 });
  assert.equal(formatText(diff(b, b)), 'Không có thay đổi');
});

test('e2e: tệp có BOM và \\r\\n', () => {
  const r = compile({ main: '﻿a = 1\r\nb { c = "x${a}" }\r\n' }, 'main');
  assert.deepEqual(r, { ok: true, config: { a: 1, b: { c: 'x1' } } });
  const bad = compile({ main: '﻿a = 1\r\nb = ,' }, 'main');
  assert.equal(bad.stage, 'parse');
  assert.equal(bad.errors[0].line, 2);
  assert.equal(bad.errors[0].column, 5);
});
