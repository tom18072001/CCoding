import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';
import { compile, diff, applyDiff, formatText, summarize } from '../src/index.js';

const BAD = [
  'const env = "prod"',
  'name = "svc-${@env}"',
  'ports = [80, 443]',
  'http { port = "${ports.0}" }',
  'https { port = "${ports.1}" , }',
].join('\n');
const GOOD = BAD.replace('" , }', '" }');

test('API công khai: đủ named export, không lộ merge', () => {
  for (const n of ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'compile',
    'diff', 'applyDiff', 'formatText', 'formatJson', 'summarize',
    'escapePointer', 'unescapePointer', 'parsePointer', 'formatPointer']) {
    assert.equal(typeof api[n], 'function', n);
  }
  assert.equal(Object.keys(api).some((k) => /merge/i.test(k)), false);
});

test('ví dụ mục 9: bản lỗi rồi bản đã sửa', () => {
  const bad = compile({ main: BAD }, 'main');
  assert.equal(bad.ok, false);
  assert.equal(bad.stage, 'parse');
  assert.equal(bad.errors.length, 1);
  assert.equal(bad.errors[0].code, 'PARSE_UNEXPECTED_TOKEN');
  assert.equal(bad.errors[0].file, 'main');
  assert.equal(bad.errors[0].line, 5);
  assert.equal(bad.errors[0].column, 29);
  assert.deepEqual(compile({ main: GOOD }, 'main'), {
    ok: true,
    config: { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } },
  });
});

test('include và ghi đè', () => {
  const files = {
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
  };
  const r = compile(files, 'main');
  assert.deepEqual(r, { ok: true, config: { server: { host: 'a', port: 2 }, mode: 'prod' } });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('lỗi check: stage check, đúng mảng check', () => {
  const files = { main: 'a = "${b}"\nc = "${d}"' };
  const r = compile(files, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => e.code), ['SEM_UNDEFINED_REF', 'SEM_UNDEFINED_REF']);
  assert.deepEqual(r.errors, api.check(api.parseProject(files, 'main').program));
});

test('entry thiếu và include thiếu', () => {
  const r = compile({}, 'main');
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
  const r2 = compile({ main: 'include "x.cfg"' }, 'main');
  assert.equal(r2.stage, 'check');
  assert.equal(r2.errors[0].code, 'SEM_INCLUDE_NOT_FOUND');
});

test('compile kèm schema: lỗi pha C và thành công', () => {
  const schema = {
    type: 'object', closed: true,
    fields: { port: { type: 'integer', required: true }, mode: { enum: ['dev', 'prod'] } },
  };
  const r = compile({ main: 'port = "80"\nmode = "x"\nextra = 1' }, 'main', schema);
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => [e.code, e.line, e.column]), [
    ['SEM_TYPE_MISMATCH', 1, 8],
    ['SEM_NOT_IN_ENUM', 2, 8],
    ['SEM_UNKNOWN_KEY', 3, 1],
  ]);
  const miss = compile({ main: 'mode = "dev"' }, 'main', schema);
  assert.equal(miss.errors[0].code, 'SEM_MISSING_REQUIRED');
  assert.equal(miss.errors[0].line, 1);
  assert.deepEqual(compile({ main: 'port = 80' }, 'main', schema), { ok: true, config: { port: 80 } });
});

test('lỗi pha B chặn pha C', () => {
  const schema = { type: 'object', fields: { port: { type: 'integer' } } };
  const r = compile({ main: 'port = "${zz}"' }, 'main', schema);
  assert.deepEqual(r.errors.map((e) => e.code), ['SEM_UNDEFINED_REF']);
});

test('chuỗi compile → diff → applyDiff → formatText', () => {
  const v1 = compile({ main: 'name = "svc"\nports = [80, 443]\nold = true\nlog { level = "info" }' }, 'main').config;
  const v2 = compile({ main: 'name = "svc2"\nports = [80]\nlog { level = "debug" }\nnew = null' }, 'main').config;
  const ops = diff(v1, v2);
  assert.equal(formatText(ops), [
    '~ /log/level: "info" -> "debug"',
    '~ /name: "svc" -> "svc2"',
    '+ /new = null',
    '- /old = true',
    '- /ports/1 = 443',
  ].join('\n'));
  assert.deepEqual(summarize(ops), { add: 1, remove: 2, replace: 2 });
  assert.deepEqual(applyDiff(v1, ops), v2);
  assert.equal(formatText(diff(v2, v2)), 'Không có thay đổi');
});
