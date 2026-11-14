import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';
import { compile, diff, applyDiff, formatText } from '../src/index.js';

const MAIN_BAD = [
  'const env = "prod"',
  'name = "svc-${@env}"',
  'ports = [80, 443]',
  'http { port = "${ports.0}" }',
  'https { port = "${ports.1}" , }',
].join('\n');
const MAIN_OK = MAIN_BAD.replace('" , }', '" }');

test('index: xuất đúng các hàm công khai, không lộ merge', () => {
  for (const n of ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'compile',
    'diff', 'applyDiff', 'formatText', 'formatJson', 'summarize']) {
    assert.equal(typeof api[n], 'function', n);
  }
  assert.equal('createMerged' in api, false);
  assert.equal('MObj' in api, false);
});

test('compile: ví dụ mục 9 lỗi cú pháp tại 5:29', () => {
  const r = compile({ main: MAIN_BAD }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'PARSE_UNEXPECTED_TOKEN');
  assert.equal(r.errors[0].file, 'main');
  assert.equal(r.errors[0].line, 5);
  assert.equal(r.errors[0].column, 29);
});

test('compile: ví dụ mục 9 bản đã sửa', () => {
  const r = compile({ main: MAIN_OK }, 'main');
  assert.deepEqual(r, {
    ok: true,
    config: { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } },
  });
});

test('compile: include và ghi đè, thứ tự khóa', () => {
  const files = {
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
  };
  const r = compile(files, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('compile: lỗi check không schema', () => {
  const r = compile({ main: 'a = "${b}"' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'SEM_UNDEFINED_REF');
});

test('compile: lỗi check với schema', () => {
  const schema = {
    type: 'object',
    closed: true,
    fields: {
      port: { type: 'integer', required: true },
      mode: { enum: ['dev', 'prod'] },
      host: { type: 'string', required: true },
    },
  };
  const r = compile({ main: 'port = "x"\nmode = "qa"\nextra = 1' }, 'main', schema);
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  const codes = r.errors.map((e) => e.code);
  assert.ok(codes.includes('SEM_TYPE_MISMATCH'));
  assert.ok(codes.includes('SEM_NOT_IN_ENUM'));
  assert.ok(codes.includes('SEM_MISSING_REQUIRED'));
  assert.ok(codes.includes('SEM_UNKNOWN_KEY'));
  const ok = compile({ main: 'port = 80\nhost = "h"\nmode = "dev"' }, 'main', schema);
  assert.deepEqual(ok, { ok: true, config: { port: 80, host: 'h', mode: 'dev' } });
});

test('compile: PARSE_ENTRY_NOT_FOUND', () => {
  const r = compile({ main: 'x = 1' }, 'nope');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.deepEqual(r.errors, [{
    code: 'PARSE_ENTRY_NOT_FOUND', message: r.errors[0].message, file: 'nope', line: 1, column: 1,
  }]);
});

test('đường ống: compile → diff → applyDiff → formatText', () => {
  const a = compile({ main: 'name = "a"\nports = [1, 2]\nold = true' }, 'main');
  const b = compile({ main: 'name = "b"\nports = [1, 2, 3]\nnew = null' }, 'main');
  assert.equal(a.ok && b.ok, true);
  const ops = diff(a.config, b.config);
  assert.deepEqual(applyDiff(a.config, ops), b.config);
  assert.deepEqual(a.config, { name: 'a', ports: [1, 2], old: true });
  assert.equal(
    formatText(ops),
    ['~ /name: "a" -> "b"', '+ /new = null', '- /old = true', '+ /ports/2 = 3'].join('\n'),
  );
});
