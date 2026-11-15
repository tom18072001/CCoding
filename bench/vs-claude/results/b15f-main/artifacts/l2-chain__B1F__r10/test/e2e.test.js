import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';
import { compile, diff, applyDiff } from '../src/index.js';

const MAIN_BAD = [
  'const env = "prod"',
  'name = "svc-${@env}"',
  'ports = [80, 443]',
  'http { port = "${ports.0}" }',
  'https { port = "${ports.1}" , }',
].join('\n');

test('export công khai đầy đủ', () => {
  for (const n of ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'compile',
    'escapePointer', 'unescapePointer', 'parsePointer', 'formatPointer',
    'diff', 'applyDiff', 'formatText', 'formatJson', 'summarize']) {
    assert.equal(typeof api[n], 'function', n);
  }
  assert.equal(api.buildMerged, undefined);
});

test('ví dụ mục 9: bản lỗi dừng ở parse', () => {
  const r = compile({ main: MAIN_BAD }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'PARSE_UNEXPECTED_TOKEN');
  assert.equal(r.errors[0].line, 5);
  assert.equal(r.errors[0].column, 29);
});

test('ví dụ mục 9: bản đã sửa', () => {
  const r = compile({ main: MAIN_BAD.replace(' , }', ' }') }, 'main');
  assert.deepEqual(r, {
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
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('lỗi entry không tồn tại', () => {
  const r = compile({}, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});

test('lỗi ngữ nghĩa dừng ở check', () => {
  const r = compile({ main: 'a = "${b}"' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.equal(r.errors[0].code, 'SEM_UNDEFINED_REF');
});

test('compile với schema lỗi', () => {
  const schema = {
    type: 'object', closed: true,
    fields: { port: { type: 'integer', required: true }, mode: { enum: ['dev', 'prod'] } },
  };
  const r = compile({ main: 'port = "x"\nmode = "qa"\nextra = 1' }, 'main', schema);
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => e.code), ['SEM_TYPE_MISMATCH', 'SEM_NOT_IN_ENUM', 'SEM_UNKNOWN_KEY']);
  assert.deepEqual(r.errors.map((e) => [e.line, e.column]), [[1, 8], [2, 8], [3, 1]]);
  const ok = compile({ main: 'port = 80\nmode = "dev"' }, 'main', schema);
  assert.deepEqual(ok, { ok: true, config: { port: 80, mode: 'dev' } });
});

test('compile → diff → applyDiff', () => {
  const a = compile({ main: 'name = "x"\nlist = [1, 2, 3]\nsrv { port = 1 }' }, 'main');
  const b = compile({ main: 'name = "y"\nlist = [1, 5]\nsrv { port = 1 host = "h" }' }, 'main');
  assert.equal(a.ok && b.ok, true);
  const ops = diff(a.config, b.config);
  assert.ok(ops.length >= 3);
  assert.deepEqual(applyDiff(a.config, ops), b.config);
  assert.deepEqual(a.config.list, [1, 2, 3]);
});
