import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, diff, applyDiff, formatText } from '../src/index.js';

const BAD = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }';
const GOOD = BAD.replace('" , }', '" }');

test('ví dụ mục 9: lỗi parse 5:29', () => {
  const r = compile({ main: BAD }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  assert.deepEqual(
    [r.errors[0].code, r.errors[0].file, r.errors[0].line, r.errors[0].column],
    ['PARSE_UNEXPECTED_TOKEN', 'main', 5, 29],
  );
});

test('ví dụ mục 9: bản đã sửa cho config', () => {
  const r = compile({ main: GOOD }, 'main');
  assert.deepEqual(r, {
    ok: true,
    config: { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } },
  });
});

test('ví dụ mục 9: include và ghi đè, thứ tự khóa', () => {
  const files = {
    'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"',
    main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"',
  };
  const r = compile(files, 'main');
  assert.deepEqual(r.config, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r.config), ['server', 'mode']);
});

test('lỗi check có schema', () => {
  const schema = { type: 'object', closed: true, fields: { port: { type: 'integer', required: true }, host: { required: true } } };
  const r = compile({ main: 'port = "x"\nextra = 1' }, 'main', schema);
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'check');
  assert.deepEqual(
    r.errors.map((e) => [e.code, e.file, e.line, e.column]),
    [
      ['SEM_MISSING_REQUIRED', 'main', 1, 1],
      ['SEM_TYPE_MISMATCH', 'main', 1, 8],
      ['SEM_UNKNOWN_KEY', 'main', 2, 1],
    ],
  );
});

test('lỗi check không schema: tham chiếu không tồn tại', () => {
  const r = compile({ main: 'a = "${b}"' }, 'main');
  assert.equal(r.stage, 'check');
  assert.equal(r.errors[0].code, 'SEM_UNDEFINED_REF');
});

test('schema hợp lệ cho config', () => {
  const r = compile({ main: 'port = 80' }, 'main', { type: 'object', fields: { port: { type: 'integer' } } });
  assert.deepEqual(r, { ok: true, config: { port: 80 } });
});

test('entry không tồn tại', () => {
  const r = compile({ a: 'x = 1' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'parse');
  assert.equal(r.errors.length, 1);
  const e = r.errors[0];
  assert.deepEqual([e.code, e.file, e.line, e.column], ['PARSE_ENTRY_NOT_FOUND', 'main', 1, 1]);
});

test('đường ống compile → diff → formatText', () => {
  const v1 = compile({ main: 'name = "a"\nports = [1, 2]\nold = true' }, 'main').config;
  const v2 = compile({ main: 'name = "b"\nports = [1, 2, 3]\nnew = null' }, 'main').config;
  const ops = diff(v1, v2);
  assert.equal(
    formatText(ops),
    ['~ /name: "a" -> "b"', '+ /new = null', '- /old = true', '+ /ports/2 = 3'].join('\n'),
  );
  assert.equal(formatText(diff(v1, v1)), 'Không có thay đổi');
});

test('bất biến applyDiff(a, diff(a, b)) = b', () => {
  const a = { a: { b: [1, 2, 3] }, 'x/y': 1 };
  const b = { a: { b: [1, 5] }, 'x/y': 2, c: null };
  const snap = structuredClone(a);
  assert.deepEqual(applyDiff(a, diff(a, b)), b);
  assert.deepEqual(a, snap);
  const c1 = compile({ main: 'p = [1,2]\nq { r = 1 }' }, 'main').config;
  const c2 = compile({ main: 'q { r = 2 s = "t" }' }, 'main').config;
  assert.deepEqual(applyDiff(c1, diff(c1, c2)), c2);
});
