import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';
import { compile, diff, formatText, applyDiff } from '../src/index.js';

const MAIN9 = `const env = "prod"
name = "svc-\${@env}"
ports = [80, 443]
http { port = "\${ports.0}" }
https { port = "\${ports.1}" }
`;

test('index xuất lại đủ API công khai', () => {
  for (const n of ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'compile',
    'diff', 'applyDiff', 'formatText', 'formatJson', 'summarize',
    'escapePointer', 'unescapePointer', 'parsePointer', 'formatPointer']) {
    assert.equal(typeof api[n], 'function', n);
  }
});

test('ví dụ mục 9: const, nội suy, tham chiếu', () => {
  const r = compile({ main: MAIN9 }, 'main');
  assert.deepEqual(r, {
    ok: true,
    config: { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } },
  });
});

test('include, trộn sâu, ghi đè và thứ tự khóa', () => {
  const files = {
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"\n',
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"\n',
  };
  const r = compile(files, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('schema hợp lệ cho ok:true', () => {
  const schema = { type: 'object', fields: { name: { type: 'string', required: true }, ports: { type: 'array', items: { type: 'integer' } } } };
  assert.equal(compile({ main: MAIN9 }, 'main', schema).ok, true);
});

test('stage parse: dấu phẩy thừa (ví dụ mục 9)', () => {
  const src = MAIN9.replace('"${ports.1}" }', '"${ports.1}" , }');
  const r = compile({ main: src }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'PARSE_UNEXPECTED_TOKEN');
  assert.equal(r.errors[0].file, 'main');
  assert.equal(r.errors[0].line, 5);
  assert.equal(r.errors[0].column, 29);
});

test('stage parse: tệp vào không tồn tại', () => {
  const r = compile({}, 'main');
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});

test('stage check: tham chiếu không tồn tại', () => {
  const r = compile({ main: 'a = "${zz}"' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => [e.code, e.file, e.line, e.column]), [['SEM_UNDEFINED_REF', 'main', 1, 6]]);
});

test('stage check: lỗi schema', () => {
  const schema = { type: 'object', fields: { t: { type: 'object', fields: { x: { type: 'string' } } } } };
  const r = compile({ main: 't { x = 1 }' }, 'main', schema);
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => [e.code, e.line, e.column]), [['SEM_TYPE_MISMATCH', 1, 9]]);
});

test('diff giữa hai config đã compile kèm formatText', () => {
  const a = compile({ main: 'name = "a"\nports = [1, 2]\n' }, 'main');
  const b = compile({ main: 'name = "b"\nports = [1]\nextra = true\n' }, 'main');
  assert.ok(a.ok && b.ok);
  const ops = diff(a.config, b.config);
  assert.equal(formatText(ops), '+ /extra = true\n~ /name: "a" -> "b"\n- /ports/1 = 2');
  assert.deepEqual(applyDiff(a.config, ops), b.config);
  assert.equal(formatText(diff(a.config, a.config)), 'Không có thay đổi');
});
