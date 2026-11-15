import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, diff, formatText } from '../src/index.js';

const MAIN = [
  'const env = "prod"',
  'name = "svc-${@env}"',
  'ports = [80, 443]',
  'http { port = "${ports.0}" }',
  'https { port = "${ports.1}" , }',
].join('\n');

test('e2e: lỗi parse của ví dụ mục 9', () => {
  const r = compile({ main: MAIN }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.deepEqual(r.errors.map((e) => [e.code, e.file, e.line, e.column]), [['PARSE_UNEXPECTED_TOKEN', 'main', 5, 29]]);
});

test('e2e: ví dụ mục 9 sau khi sửa', () => {
  const r = compile({ main: MAIN.replace(' , }', ' }') }, 'main');
  assert.deepEqual(r, {
    ok: true,
    config: { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } },
  });
});

test('e2e: include và ghi đè, thứ tự khóa', () => {
  const files = {
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  };
  const r = compile(files, 'main');
  assert.deepEqual(r.config, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('e2e: lỗi check có stage và errors', () => {
  const r = compile({ main: 'a = "${b}"' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => [e.code, e.line, e.column]), [['SEM_UNDEFINED_REF', 1, 6]]);
  assert.equal(compile({}, 'main').errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});

test('e2e: có schema', () => {
  const schema = {
    type: 'object',
    closed: true,
    fields: { port: { type: 'integer', required: true }, mode: { enum: ['dev', 'prod'] } },
  };
  assert.deepEqual(compile({ main: 'port = 80\nmode = "dev"' }, 'main', schema), {
    ok: true,
    config: { port: 80, mode: 'dev' },
  });
  const bad = compile({ main: 'mode = "x"\nextra = 1' }, 'main', schema);
  assert.equal(bad.stage, 'check');
  assert.deepEqual(bad.errors.map((e) => [e.code, e.line, e.column]), [
    ['SEM_MISSING_REQUIRED', 1, 1],
    ['SEM_NOT_IN_ENUM', 1, 8],
    ['SEM_UNKNOWN_KEY', 2, 1],
  ]);
});

test('e2e: compile hai lần rồi diff', () => {
  const a = compile({ main: 'x = 1' }, 'main').config;
  const b = compile({ main: 'x = 2\ny = [1]' }, 'main').config;
  assert.equal(formatText(diff(a, b)), '~ /x: 1 -> 2\n+ /y = [1]');
});
