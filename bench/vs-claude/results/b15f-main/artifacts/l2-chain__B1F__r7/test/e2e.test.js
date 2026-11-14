import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, diff, formatText, formatJson, summarize, applyDiff } from '../src/index.js';

const bad = [
  'const env = "prod"',
  'name = "svc-${@env}"',
  'ports = [80, 443]',
  'http { port = "${ports.0}" }',
  'https { port = "${ports.1}" , }      # lỗi',
].join('\n');
const good = bad.replace('" , }', '" }');

test('e2e: ví dụ mục 9 bản lỗi dừng ở parse', () => {
  const r = compile({ main: bad }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'PARSE_UNEXPECTED_TOKEN');
  assert.equal(r.errors[0].line, 5);
  assert.equal(r.errors[0].column, 29);
  assert.equal(r.errors[0].file, 'main');
});

test('e2e: ví dụ mục 9 bản sửa', () => {
  const r = compile({ main: good }, 'main');
  assert.deepEqual(r, {
    ok: true,
    config: { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } },
  });
});

test('e2e: tệp vào không tồn tại', () => {
  const r = compile({}, 'main');
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});

test('e2e: include và ghi đè nhiều tệp', () => {
  const files = {
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  };
  const r = compile(files, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('e2e: lỗi parse nằm trong tệp include', () => {
  const r = compile({ main: 'include "b"', b: 'x = ' }, 'main');
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors[0].file, 'b');
});

test('e2e: lỗi check có file/line/column', () => {
  const r = compile({ main: 'include "b"\na = 1', b: 'x = 1\nx = 2' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.equal(r.errors.length, 1);
  assert.deepEqual(
    { code: r.errors[0].code, file: r.errors[0].file, line: r.errors[0].line, column: r.errors[0].column },
    { code: 'SEM_DUPLICATE_KEY', file: 'b', line: 2, column: 1 },
  );
});

test('e2e: tham chiếu không tồn tại', () => {
  const r = compile({ main: 'a = "${b}"' }, 'main');
  assert.equal(r.stage, 'check');
  assert.equal(r.errors[0].code, 'SEM_UNDEFINED_REF');
  assert.equal(r.errors[0].line, 1);
  assert.equal(r.errors[0].column, 6);
});

const schema = {
  type: 'object',
  closed: true,
  fields: {
    port: { type: 'integer', required: true },
    mode: { enum: ['dev', 'prod'] },
  },
};

test('e2e: schema hợp lệ', () => {
  const r = compile({ main: 'port = 80\nmode = "dev"' }, 'main', schema);
  assert.deepEqual(r, { ok: true, config: { port: 80, mode: 'dev' } });
});

test('e2e: schema không hợp lệ', () => {
  const r = compile({ main: 'port = "x"\nmode = "qa"\nextra = 1' }, 'main', schema);
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(
    r.errors.map((e) => [e.code, e.file, e.line, e.column]),
    [
      ['SEM_TYPE_MISMATCH', 'main', 1, 8],
      ['SEM_NOT_IN_ENUM', 'main', 2, 8],
      ['SEM_UNKNOWN_KEY', 'main', 3, 1],
    ],
  );
});

test('e2e: thiếu trường bắt buộc báo tại gốc 1:1', () => {
  const r = compile({ main: 'mode = "dev"' }, 'main', schema);
  assert.deepEqual(
    r.errors.map((e) => [e.code, e.file, e.line, e.column]),
    [['SEM_MISSING_REQUIRED', 'main', 1, 1]],
  );
});

test('e2e: lỗi pha B chặn schema', () => {
  const r = compile({ main: 'port = "${zz}"' }, 'main', schema);
  assert.equal(r.errors[0].code, 'SEM_UNDEFINED_REF');
});

test('e2e: diff/formatText/summarize trên hai config compile ra', () => {
  const a = compile({ main: 'a { b = 1 }\nlist = [1, 2]' }, 'main').config;
  const b = compile({ main: 'a { b = 2 c = true }\nlist = [1]' }, 'main').config;
  const ops = diff(a, b);
  assert.equal(formatText(ops), '~ /a/b: 1 -> 2\n+ /a/c = true\n- /list/1 = 2');
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
  assert.deepEqual(JSON.parse(formatJson(ops)), ops);
  assert.deepEqual(applyDiff(a, ops), b);
  assert.equal(formatText(diff(a, a)), 'Không có thay đổi');
});
