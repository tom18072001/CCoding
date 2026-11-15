import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, diff, applyDiff } from '../src/index.js';

const MAIN_BAD = [
  'const env = "prod"',
  'name = "svc-${@env}"',
  'ports = [80, 443]',
  'http { port = "${ports.0}" }',
  'https { port = "${ports.1}" , }      # lỗi',
].join('\n');
const MAIN_OK = MAIN_BAD.replace('"${ports.1}" ,', '"${ports.1}"');

test('mục 9: ca lỗi cú pháp → stage parse', () => {
  const r = compile({ main: MAIN_BAD }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  const e = r.errors[0];
  assert.deepEqual([e.code, e.file, e.line, e.column], ['PARSE_UNEXPECTED_TOKEN', 'main', 5, 29]);
});

test('mục 9: ca đã sửa → config', () => {
  assert.deepEqual(compile({ main: MAIN_OK }, 'main'), {
    ok: true,
    config: {
      name: 'svc-prod',
      ports: [80, 443],
      http: { port: 80 },
      https: { port: 443 },
    },
  });
});

test('mục 9: include và ghi đè, thứ tự khóa', () => {
  const files = {
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  };
  const r = compile(files, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('compile: entry thiếu và lỗi lexer → stage parse', () => {
  const r = compile({ a: 'x = 1' }, 'main');
  assert.equal(r.stage, 'parse');
  assert.deepEqual(
    [r.errors[0].code, r.errors[0].file, r.errors[0].line, r.errors[0].column],
    ['PARSE_ENTRY_NOT_FOUND', 'main', 1, 1],
  );
  const r2 = compile({ main: 'x = 1', b: 'y = @' }, 'main');
  assert.equal(r2.ok, true);
  const r3 = compile({ main: 'include "b"', b: 'x = 01' }, 'main');
  assert.equal(r3.errors[0].code, 'LEX_BAD_NUMBER');
  assert.equal(r3.errors[0].file, 'b');
});

test('compile: lỗi ngữ nghĩa → stage check, đúng mảng của check', () => {
  const r = compile({ main: 'a = "${b}"\nc = "${a}"\nd = "${zz}"' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(
    r.errors.map((e) => [e.code, e.line, e.column]),
    [['SEM_UNDEFINED_REF', 1, 6], ['SEM_UNDEFINED_REF', 3, 6]],
  );
});

const schema = {
  type: 'object',
  closed: true,
  fields: {
    name: { type: 'string', required: true },
    mode: { type: 'string', enum: ['dev', 'prod'] },
    port: { type: 'integer' },
    tags: { type: 'array', items: { type: 'string' } },
  },
};

test('schema: cấu hình hợp lệ', () => {
  const r = compile({ main: 'name = "x"\nmode = "dev"\nport = 80\ntags = ["a"]' }, 'main', schema);
  assert.equal(r.ok, true);
});

test('schema: closed, enum, required → stage check', () => {
  const r = compile({ main: 'mode = "test"\nextra = 1\ntags = ["a", 2]' }, 'main', schema);
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(
    r.errors.map((e) => [e.code, e.file, e.line, e.column]),
    [
      ['SEM_MISSING_REQUIRED', 'main', 1, 1],
      ['SEM_NOT_IN_ENUM', 'main', 1, 8],
      ['SEM_UNKNOWN_KEY', 'main', 2, 1],
      ['SEM_TYPE_MISMATCH', 'main', 3, 14],
    ],
  );
});

test('schema: giá trị đã nội suy được kiểm theo kiểu gốc', () => {
  const files = { main: 'n = "svc"\nname = "${n}"\nport = "${p}"\np = "80"' };
  const r = compile(files, 'main', {
    type: 'object',
    fields: { port: { type: 'integer' }, name: { type: 'string' } },
  });
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => [e.code, e.line, e.column]), [['SEM_TYPE_MISMATCH', 3, 8]]);
});

test('vòng compile → diff → applyDiff', () => {
  const old = compile({ main: MAIN_OK }, 'main').config;
  const next = compile(
    { main: MAIN_OK.replace('443', '8443') + '\nextra = null\nports2 = [1]' },
    'main',
  ).config;
  const ops = diff(old, next);
  assert.ok(ops.length > 0);
  assert.deepEqual(applyDiff(old, ops), next);
  assert.deepEqual(diff(old, old), []);
});
