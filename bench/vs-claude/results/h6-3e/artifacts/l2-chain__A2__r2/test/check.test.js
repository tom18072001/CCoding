import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, schema, entry = 'main') => {
  const r = parseProject(typeof files === 'string' ? { main: files } : files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return check(r.program, schema).map((e) => [e.code, e.file, e.line, e.column]);
};

test('pha A: trùng khóa/hằng, include', () => {
  assert.deepEqual(run('a = 1\na = 2\na {}\nb {a=1 a=2}\nconst c = 1\nconst c = 2'), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1], ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'main', 4, 8], ['SEM_DUPLICATE_CONST', 'main', 6, 1],
  ]);
  assert.deepEqual(run({ main: 'a = 1\ninclude "x"', x: 'a = 2' }), []);
  assert.deepEqual(run('include "nope"'), [['SEM_INCLUDE_NOT_FOUND', 'main', 1, 1]]);
  assert.deepEqual(run({ main: 'include "x"', x: 'include "main"\ninclude "x"' }), [
    ['SEM_INCLUDE_CYCLE', 'x', 1, 1], ['SEM_INCLUDE_CYCLE', 'x', 2, 1]]);
});

test('pha A: hình thoi không phải vòng; lỗi gom theo tệp', () => {
  const d = { main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'k = 1' };
  assert.deepEqual(run(d), []);
  assert.deepEqual(run({ main: 'include "b"\nz=1\nz=2', b: 'q=1\nq=2' }), [
    ['SEM_DUPLICATE_KEY', 'main', 3, 1], ['SEM_DUPLICATE_KEY', 'b', 2, 1]]);
});

test('pha B: tham chiếu', () => {
  assert.deepEqual(run('const a = 1\nconst b = "${x}"'), [['SEM_CONST_CONFIG_REF', 'main', 2, 12]]);
  assert.deepEqual(run('a = "${b}"\nc = "${@k}"\nd = "${a.x}"'), [
    ['SEM_UNDEFINED_REF', 'main', 1, 6], ['SEM_UNDEFINED_REF', 'main', 2, 6], ['SEM_UNDEFINED_REF', 'main', 3, 6]]);
  assert.deepEqual(run('a = "${@k}"\nconst k = 1'), []);
  assert.deepEqual(run({ main: 'include "x"\na = "${@k}"', x: 'const k = 1' }), [['SEM_UNDEFINED_REF', 'main', 2, 6]]);
  assert.deepEqual(run('l = [1]\na = "${l.1}"\nb = "${l.0.0}"\nn = null\nm = "${n}"'), [
    ['SEM_UNDEFINED_REF', 'main', 2, 6], ['SEM_UNDEFINED_REF', 'main', 3, 6]]);
});

test('pha B: vòng', () => {
  assert.deepEqual(run('a = "${a}"'), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(run('a = "${b}"\nb = "${a}"'), [['SEM_REF_CYCLE', 'main', 1, 6], ['SEM_REF_CYCLE', 'main', 2, 6]]);
  assert.deepEqual(run('x { y = "${x}" }'), [['SEM_REF_CYCLE', 'main', 1, 10]]);
  assert.deepEqual(run('a = "${b}"\nb = "${c}"\nc = 1'), []);
});

test('pha B: nội suy xấu', () => {
  assert.deepEqual(run('l = [1]\na = "x${l}"\nb = "${l}"\nc = "${l}${l}"'), [
    ['SEM_BAD_INTERPOLATION', 'main', 2, 7], ['SEM_BAD_INTERPOLATION', 'main', 4, 6], ['SEM_BAD_INTERPOLATION', 'main', 4, 10]]);
  assert.deepEqual(run('o { a = 1 }\nx = "${o}!"'), [['SEM_BAD_INTERPOLATION', 'main', 2, 6]]);
});

test('pha C: lược đồ', () => {
  const schema = { type: 'object', closed: true, fields: {
    port: { type: 'integer', required: true },
    mode: { enum: ['a', 'b'] },
    srv: { type: 'object', fields: { h: { type: 'string', required: true } } },
    l: { type: 'array', items: { type: 'number' } },
  } };
  assert.deepEqual(run('port = 1.5\nmode = "c"\nzzz = 1', schema), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 8], ['SEM_NOT_IN_ENUM', 'main', 2, 8], ['SEM_UNKNOWN_KEY', 'main', 3, 1]]);
  assert.deepEqual(run('srv { }', schema), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1], ['SEM_MISSING_REQUIRED', 'main', 1, 1]]);
  assert.deepEqual(run('port = 1\nsrv { }\nl = [1, "x"]', schema), [
    ['SEM_MISSING_REQUIRED', 'main', 2, 1], ['SEM_TYPE_MISMATCH', 'main', 3, 9]]);
  assert.deepEqual(run('a = 5\nport = "${a}"', { type: 'object', fields: { port: { type: 'string' } } }), [
    ['SEM_TYPE_MISMATCH', 'main', 2, 8]]);
  assert.deepEqual(run('x { y = 1 }\np = "${x}"', { type: 'object', fields: { p: { type: 'object', closed: true, fields: {} } } }), [
    ['SEM_UNKNOWN_KEY', 'main', 2, 5]]);
  assert.deepEqual(run('port = 1', schema), []);
});
