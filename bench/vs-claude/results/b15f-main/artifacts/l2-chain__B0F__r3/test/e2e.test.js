import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, diff, formatText, formatJson, summarize, applyDiff } from '../src/index.js';

const MAIN = [
  'const env = "prod"',
  'name = "svc-${@env}"',
  'ports = [80, 443]',
  'http { port = "${ports.0}" }',
  'https { port = "${ports.1}" }',
].join('\n');

test('compile: lỗi parse → stage parse, 1 lỗi có file', () => {
  const r = compile({ main: 'a = [1,,2]' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].file, 'main');
  assert.equal(r.errors[0].code, 'PARSE_UNEXPECTED_TOKEN');
});

test('compile: ví dụ spec mục 9 — dấu phẩy thừa ở dòng 5 cột 29', () => {
  const src = MAIN.replace('"${ports.1}" }', '"${ports.1}" , }');
  const r = compile({ main: src }, 'main');
  assert.deepEqual([r.stage, r.errors[0].code, r.errors[0].line, r.errors[0].column],
    ['parse', 'PARSE_UNEXPECTED_TOKEN', 5, 29]);
});

test('compile: entry thiếu → stage parse', () => {
  const r = compile({}, 'main');
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});

test('compile: lỗi check → stage check, đúng mảng lỗi', () => {
  const r = compile({ main: 'a = "${zz}"\nb = "${yy}"' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => [e.code, e.file, e.line, e.column]), [
    ['SEM_UNDEFINED_REF', 'main', 1, 6], ['SEM_UNDEFINED_REF', 'main', 2, 6],
  ]);
});

test('compile: lỗi schema → stage check', () => {
  const r = compile({ main: 'port = "x"' }, 'main', { type: 'object', fields: { port: { type: 'integer' } } });
  assert.equal(r.stage, 'check');
  assert.equal(r.errors[0].code, 'SEM_TYPE_MISMATCH');
});

test('compile: thành công (ví dụ spec) và include ghi đè', () => {
  const r = compile({ main: MAIN }, 'main');
  assert.deepEqual(r, {
    ok: true,
    config: { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } },
  });
  const r2 = compile({
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  }, 'main');
  assert.deepEqual(r2.config, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r2.config), ['server', 'mode']);
});

test('đầu cuối: diff/formatText giữa hai config đã compile', () => {
  const a = compile({ main: 'port = 80\nname = "a"\ntags = ["x", "y"]' }, 'main');
  const b = compile({ main: 'port = 8080\ntags = ["x"]\nextra { k = null }' }, 'main');
  assert.equal(a.ok && b.ok, true);
  const ops = diff(a.config, b.config);
  assert.equal(
    formatText(ops),
    [
      '+ /extra = {"k":null}',
      '- /name = "a"',
      '~ /port: 80 -> 8080',
      '- /tags/1 = "y"',
    ].join('\n'),
  );
  assert.deepEqual(summarize(ops), { add: 1, remove: 2, replace: 1 });
  assert.deepEqual(applyDiff(a.config, ops), b.config);
  assert.equal(JSON.parse(formatJson(ops)).length, 4);
  assert.equal(formatText(diff(a.config, a.config)), 'Không có thay đổi');
});
