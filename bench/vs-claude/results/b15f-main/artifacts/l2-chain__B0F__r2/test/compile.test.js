import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';

const { compile } = api;

test('danh sách named export', () => {
  const expected = ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'compile',
    'escapePointer', 'unescapePointer', 'parsePointer', 'formatPointer', 'diff', 'applyDiff',
    'formatText', 'formatJson', 'summarize'];
  for (const n of expected) assert.equal(typeof api[n], 'function', n);
});

const MAIN = `const env = "prod"
name = "svc-\${@env}"
ports = [80, 443]
http { port = "\${ports.0}" }
https { port = "\${ports.1}" }
`;

test('ví dụ mục 9', () => {
  const r = compile({ main: MAIN }, 'main');
  assert.deepEqual(r, { ok: true, config: { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } } });
});

test('ví dụ mục 9: dấu phẩy thừa → stage parse', () => {
  const bad = MAIN.replace('https { port = "${ports.1}" }', 'https { port = "${ports.1}" , }');
  const r = compile({ main: bad }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'PARSE_UNEXPECTED_TOKEN');
  assert.deepEqual([r.errors[0].file, r.errors[0].line], ['main', 5]);
});

test('include và ghi đè, thứ tự khóa', () => {
  const files = {
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
  };
  const r = compile(files, 'main');
  assert.deepEqual(r.config, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('lỗi stage parse: entry không có, lỗi lexer', () => {
  const r = compile({}, 'main');
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
  const r2 = compile({ main: 'a = "x' }, 'main');
  assert.equal(r2.stage, 'parse');
  assert.equal(r2.errors[0].code, 'LEX_UNTERMINATED_STRING');
});

test('lỗi stage check: pha A, pha B, đúng mảng của check', () => {
  const a = compile({ main: 'a = 1\na = 2' }, 'main');
  assert.equal(a.stage, 'check');
  assert.deepEqual(a.errors.map((e) => e.code), ['SEM_DUPLICATE_KEY']);
  const files = { main: 'a = "${b}"' };
  const b = compile(files, 'main');
  assert.deepEqual(b, { ok: false, stage: 'check', errors: api.check(api.parseProject(files, 'main').program) });
  assert.equal(b.errors[0].code, 'SEM_UNDEFINED_REF');
});

test('lỗi stage check: pha C qua schema', () => {
  const schema = { closed: true, fields: { port: { type: 'integer', required: true } } };
  const r = compile({ main: 'port = "x"\nextra = 1' }, 'main', schema);
  assert.equal(r.stage, 'check');
  assert.deepEqual(r.errors.map((e) => [e.code, e.line, e.column]), [['SEM_TYPE_MISMATCH', 1, 8], ['SEM_UNKNOWN_KEY', 2, 1]]);
  assert.deepEqual(compile({ main: 'port = 80' }, 'main', schema), { ok: true, config: { port: 80 } });
});

test('schema không áp khi pha B lỗi; kết quả đi tiếp tới diff', () => {
  const r = compile({ main: 'a = "${q}"' }, 'main', { fields: { a: { type: 'number' } } });
  assert.deepEqual(r.errors.map((e) => e.code), ['SEM_UNDEFINED_REF']);
  const x = compile({ main: 'a = 1' }, 'main').config;
  const y = compile({ main: 'a = 2' }, 'main').config;
  assert.equal(api.formatText(api.diff(x, y)), '~ /a: 1 -> 2');
});
