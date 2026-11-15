import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';
import { compile, diff, formatText, applyDiff, summarize } from '../src/index.js';

const MAIN_BAD = [
  'const env = "prod"',
  'name = "svc-${@env}"',
  'ports = [80, 443]',
  'http { port = "${ports.0}" }',
  'https { port = "${ports.1}" , }',
].join('\n');
const MAIN_OK = MAIN_BAD.replace('"${ports.1}" , }', '"${ports.1}" }');

test('ví dụ mục 9: dấu phẩy thừa → stage parse tại 5:29', () => {
  const r = compile({ main: MAIN_BAD }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  const e = r.errors[0];
  assert.equal(e.code, 'PARSE_UNEXPECTED_TOKEN');
  assert.equal(e.file, 'main');
  assert.equal(e.line, 5);
  assert.equal(e.column, 29);
});

test('ví dụ mục 9: bản đã sửa cho config đúng', () => {
  const r = compile({ main: MAIN_OK }, 'main');
  assert.deepEqual(r, {
    ok: true,
    config: { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } },
  });
});

test('include và ghi đè, giữ thứ tự khóa', () => {
  const files = {
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  };
  const r = compile(files, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('stage check: ref không tồn tại', () => {
  const r = compile({ main: 'a = "${b}"' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'SEM_UNDEFINED_REF');
  assert.equal(r.errors[0].file, 'main');
});

test('stage check: vòng include', () => {
  const r = compile({ a: 'include "b"', b: 'include "a"' }, 'a');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => [e.code, e.file]), [['SEM_INCLUDE_CYCLE', 'b']]);
});

test('stage check: include thiếu tệp', () => {
  const r = compile({ main: 'include "nope"' }, 'main');
  assert.equal(r.stage, 'check');
  assert.equal(r.errors[0].code, 'SEM_INCLUDE_NOT_FOUND');
});

test('entry không có → stage parse', () => {
  const r = compile({}, 'main');
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});

test('schema gây SEM_TYPE_MISMATCH tại nút giá trị', () => {
  const schema = { type: 'object', fields: { port: { type: 'string' } } };
  const r = compile({ main: 'port = 80' }, 'main', schema);
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(
    r.errors.map((e) => [e.code, e.file, e.line, e.column]),
    [['SEM_TYPE_MISMATCH', 'main', 1, 8]],
  );
  assert.equal(compile({ main: 'port = "80"' }, 'main', schema).ok, true);
});

test('compile → diff → formatText/applyDiff giữa hai phiên bản', () => {
  const v1 = compile({ main: 'a = 1\nlist = [1, 2]' }, 'main').config;
  const v2 = compile({ main: 'a = 2\nlist = [1, 2]\nb = 3' }, 'main').config;
  const ops = diff(v1, v2);
  assert.equal(formatText(ops), '~ /a: 1 -> 2\n+ /b = 3');
  assert.deepEqual(summarize(ops), { add: 1, remove: 0, replace: 1 });
  assert.deepEqual(applyDiff(v1, ops), v2);
});

test('danh sách export công khai', () => {
  assert.deepEqual(Object.keys(api).sort(), [
    'applyDiff', 'check', 'compile', 'diff', 'escapePointer', 'evaluate',
    'formatJson', 'formatPointer', 'formatText', 'parse', 'parsePointer',
    'parseProject', 'summarize', 'tokenize', 'unescapePointer',
  ]);
});
