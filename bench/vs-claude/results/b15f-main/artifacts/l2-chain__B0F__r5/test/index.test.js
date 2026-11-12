import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, diff, applyDiff, formatText, summarize } from '../src/index.js';

const pos = ({ code, file, line, column }) => ({ code, file, line, column });

const MAIN = [
  'const env = "prod"',
  'name = "svc-${@env}"',
  'ports = [80, 443]',
  'http { port = "${ports.0}" }',
  'https { port = "${ports.1}" , }',
].join('\n');

test('ví dụ mục 9: lỗi phân tích', () => {
  const r = compile({ main: MAIN }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.deepStrictEqual(r.errors.map(pos), [
    { code: 'PARSE_UNEXPECTED_TOKEN', file: 'main', line: 5, column: 29 },
  ]);
});

test('ví dụ mục 9: không lỗi', () => {
  const r = compile({ main: MAIN.replace(' , }', ' }') }, 'main');
  assert.deepStrictEqual(r, {
    ok: true,
    config: { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } },
  });
});

test('tệp vào không tồn tại → stage parse', () => {
  const r = compile({ main: 'a = 1' }, 'zzz');
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});

test('nhiều tệp có include, ghi đè và trộn sâu', () => {
  const files = {
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
  };
  const r = compile(files, 'main');
  assert.equal(r.ok, true);
  assert.deepStrictEqual(r.config, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepStrictEqual(Object.keys(r.config), ['server', 'mode']);
});

test('lỗi check: stage check, đúng mảng lỗi', () => {
  const r = compile({ main: 'a = "${b}"' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepStrictEqual(r.errors.map(pos), [
    { code: 'SEM_UNDEFINED_REF', file: 'main', line: 1, column: 6 },
  ]);
});

test('lỗi check có schema, đúng thứ tự', () => {
  const schema = {
    type: 'object',
    closed: true,
    fields: { port: { type: 'integer', required: true }, mode: { enum: ['dev', 'prod'] } },
  };
  const ok = compile({ main: 'port = 80\nmode = "dev"' }, 'main', schema);
  assert.deepStrictEqual(ok, { ok: true, config: { port: 80, mode: 'dev' } });

  const bad = compile({ main: 'port = "x"\nmode = "qa"\nextra = 1' }, 'main', schema);
  assert.equal(bad.stage, 'check');
  assert.deepStrictEqual(bad.errors.map(pos), [
    { code: 'SEM_TYPE_MISMATCH', file: 'main', line: 1, column: 8 },
    { code: 'SEM_NOT_IN_ENUM', file: 'main', line: 2, column: 8 },
    { code: 'SEM_UNKNOWN_KEY', file: 'main', line: 3, column: 1 },
  ]);

  const missing = compile({ main: 'mode = "dev"' }, 'main', schema);
  assert.equal(missing.errors[0].code, 'SEM_MISSING_REQUIRED');
});

test('schema không chạy khi pha trước có lỗi', () => {
  const r = compile({ main: 'a = "${zz}"' }, 'main', { type: 'object', fields: { a: { type: 'integer' } } });
  assert.deepStrictEqual(r.errors.map((e) => e.code), ['SEM_UNDEFINED_REF']);
});

test('compile → diff → formatText/applyDiff giữa hai phiên bản', () => {
  const v1 = compile({ main: 'name = "a"\nports = [80, 443]\nold = true' }, 'main');
  const v2 = compile({ main: 'name = "b"\nports = [80]\nnew = null' }, 'main');
  assert.ok(v1.ok && v2.ok);
  const ops = diff(v1.config, v2.config);
  assert.deepStrictEqual(ops, [
    { op: 'replace', path: '/name', oldValue: 'a', value: 'b' },
    { op: 'add', path: '/new', value: null },
    { op: 'remove', path: '/old', oldValue: true },
    { op: 'remove', path: '/ports/1', oldValue: 443 },
  ]);
  assert.deepStrictEqual(applyDiff(v1.config, ops), v2.config);
  assert.deepStrictEqual(summarize(ops), { add: 1, remove: 2, replace: 1 });
  assert.equal(
    formatText(ops),
    '~ /name: "a" -> "b"\n+ /new = null\n- /old = true\n- /ports/1 = 443',
  );
  assert.equal(formatText(diff(v1.config, v1.config)), 'Không có thay đổi');
});
