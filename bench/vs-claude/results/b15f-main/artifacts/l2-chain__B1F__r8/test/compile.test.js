import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';
import { compile, diff, formatText } from '../src/index.js';

test('index xuất đủ named export', () => {
  for (const n of ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'compile', 'diff', 'applyDiff',
    'formatText', 'formatJson', 'summarize', 'escapePointer', 'unescapePointer', 'parsePointer', 'formatPointer']) {
    assert.equal(typeof api[n], 'function', n);
  }
});

const ex = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }';

test('compile: lỗi parse (ví dụ mục 9)', () => {
  const r = compile({ main: ex.replace('ports.1}" }', 'ports.1}" , }') }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.deepEqual([r.errors[0].code, r.errors[0].line, r.errors[0].column], ['PARSE_UNEXPECTED_TOKEN', 5, 29]);
  assert.equal(compile({}, 'main').errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});

test('compile: lỗi check', () => {
  const r = compile({ main: 'a = 1\na = 2' }, 'main');
  assert.equal(r.stage, 'check');
  assert.equal(r.errors[0].code, 'SEM_DUPLICATE_KEY');
  const r2 = compile({ main: 'a = "x"' }, 'main', { fields: { a: { type: 'integer' } } });
  assert.deepEqual([r2.ok, r2.stage, r2.errors[0].code], [false, 'check', 'SEM_TYPE_MISMATCH']);
});

test('compile: thành công, ví dụ mục 9 và include', () => {
  const r = compile({ main: ex }, 'main', { fields: { name: { type: 'string', required: true } } });
  assert.deepEqual(r, { ok: true, config: { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } } });
  const r2 = compile({ main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"' }, 'main');
  assert.deepEqual(r2.config, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r2.config), ['server', 'mode']);
});

test('diff giữa hai cấu hình đã compile', () => {
  const a = compile({ main: 'p = 1\nl = [1, 2]' }, 'main').config;
  const b = compile({ main: 'p = 2\nl = [1]\nn = null' }, 'main').config;
  const ops = diff(a, b);
  assert.deepEqual(ops.map((o) => o.op + o.path), ['remove/l/1', 'add/n', 'replace/p']);
  assert.equal(formatText(ops), '- /l/1 = 2\n+ /n = null\n~ /p: 1 -> 2');
});
