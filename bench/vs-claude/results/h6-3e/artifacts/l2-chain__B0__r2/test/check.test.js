import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, schema, entry = 'main') => {
  const p = parseProject(typeof files === 'string' ? { main: files } : files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return check(p.program, schema).map((e) => [e.code, e.file, e.line, e.column]);
};

test('pha A: trùng khóa/hằng', () => {
  assert.deepEqual(run('a = 1\na = 2\na { }\nx { b = 1 b = 2 }\ny { b = 1 }\nconst c = 1\nconst c = 2'), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1],
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'main', 4, 11],
    ['SEM_DUPLICATE_CONST', 'main', 7, 1],
  ]);
  assert.deepEqual(run({ main: 'a = 1\ninclude "b"', b: 'a = 2' }), []);
});

test('pha A: include thiếu, vòng, hình thoi', () => {
  assert.deepEqual(run({ main: 'include "x"\ninclude "main"' }), [
    ['SEM_INCLUDE_NOT_FOUND', 'main', 1, 1],
    ['SEM_INCLUDE_CYCLE', 'main', 2, 1],
  ]);
  assert.deepEqual(run({ main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'k = 1' }), []);
  assert.deepEqual(run({ main: 'include "b"', b: 'include "main"' }), [['SEM_INCLUDE_CYCLE', 'b', 1, 1]]);
});

test('pha A: thứ tự theo tệp tiền thứ tự', () => {
  const r = run({ main: 'include "b"\na = 1\na = 2', b: 'x = 1\nx = 2' });
  assert.deepEqual(r, [['SEM_DUPLICATE_KEY', 'main', 3, 1], ['SEM_DUPLICATE_KEY', 'b', 2, 1]]);
});

test('pha A chặn pha B', () => {
  assert.deepEqual(run('a = 1\na = 2\nb = "${zz}"').map((e) => e[0]), ['SEM_DUPLICATE_KEY']);
});

test('pha B: tham chiếu', () => {
  assert.deepEqual(run('a = "${b}"'), [['SEM_UNDEFINED_REF', 'main', 1, 6]]);
  assert.deepEqual(run('p = 1\nconst c = "${p}"'), [['SEM_CONST_CONFIG_REF', 'main', 2, 12]]);
  assert.deepEqual(run('a = "${@c}"\nconst c = "x"\nl = ["${@c}"]'), []);
  assert.deepEqual(run({ main: 'a = "${@c}"\ninclude "b"', b: 'const c = 1' }), [['SEM_UNDEFINED_REF', 'main', 1, 6]]);
  assert.deepEqual(run('a = [1]\nb = "${a.1}"\nc = "${a.0}"\nd = "x"\ne = "${d.0}"').map((e) => e[2]), [2, 5]);
  assert.deepEqual(run('a = null\nb = "${a}"'), []);
});

test('pha B: vòng tham chiếu', () => {
  assert.deepEqual(run('a = "${a}"'), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(run('a = "${b}"\nb = "${a}"').map((e) => e[0]), ['SEM_REF_CYCLE', 'SEM_REF_CYCLE']);
  assert.deepEqual(run('x { y = "${x}" }'), [['SEM_REF_CYCLE', 'main', 1, 10]]);
  assert.deepEqual(run('a = "${b}"\nb = "ok"\nc = "${a}"'), []);
});

test('pha B: nội suy mảng/đối tượng', () => {
  assert.deepEqual(run('l = [1]\na = "${l}"\nb = "x${l}"'), [['SEM_BAD_INTERPOLATION', 'main', 3, 7]]);
  assert.deepEqual(run('o { k = 1 }\na = "${o}${o}"'), [['SEM_BAD_INTERPOLATION', 'main', 2, 6], ['SEM_BAD_INTERPOLATION', 'main', 2, 10]]);
  assert.deepEqual(run('s = "x"\nn = null\nb = "${s}${n}"'), []);
  assert.deepEqual(run('l = [1]\nm = "${l}"\nb = "x${m}"').map((e) => e[0]), ['SEM_BAD_INTERPOLATION']);
});

const schema = {
  type: 'object', closed: true,
  fields: {
    name: { type: 'string', required: true },
    port: { type: 'integer', enum: [80, 443] },
    tags: { type: 'array', items: { type: 'string' } },
    srv: { type: 'object', fields: { host: { required: true } } },
  },
};

test('pha C: lược đồ', () => {
  assert.deepEqual(run('name = "a"\nport = 80', schema), []);
  assert.deepEqual(run('port = 8080\nzzz = 1', schema), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_NOT_IN_ENUM', 'main', 1, 8],
    ['SEM_UNKNOWN_KEY', 'main', 2, 1],
  ]);
  assert.deepEqual(run('name = 1\nport = 1.5\ntags = ["a", 2]', schema), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 8],
    ['SEM_TYPE_MISMATCH', 'main', 2, 8],
    ['SEM_TYPE_MISMATCH', 'main', 3, 14],
  ]);
  assert.deepEqual(run('name = "a"\nsrv { x = 1 }', schema), [['SEM_MISSING_REQUIRED', 'main', 2, 1]]);
});

test('pha C: vị trí của giá trị từ chuỗi thuần tham chiếu và khối hợp nhất', () => {
  assert.deepEqual(run('name = "${n}"\nn = 5', { type: 'object', fields: { name: { type: 'string' }, n: {} } }),
    [['SEM_TYPE_MISMATCH', 'main', 1, 8]]);
  assert.deepEqual(run({ main: 'name = "a"\nsrv { a = 1 }\ninclude "i"', i: 'srv { b = 1 }' }, schema), [['SEM_MISSING_REQUIRED', 'main', 2, 1]]);
  assert.deepEqual(run({ main: 'name = "a"\ninclude "i"\nsrv { b = 1 }', i: 'srv = 1' }, schema), [['SEM_MISSING_REQUIRED', 'main', 3, 1]]);
  assert.deepEqual(run('name = "a"', { type: 'object', fields: { name: { type: 'any' }, q: { required: true } } }),
    [['SEM_MISSING_REQUIRED', 'main', 1, 1]]);
});

test('pha C chỉ chạy khi không có lỗi trước', () => {
  assert.deepEqual(run('a = "${x}"', schema).map((e) => e[0]), ['SEM_UNDEFINED_REF']);
});

test('pha C: kiểu null/array/object/any/number và enum chuỗi', () => {
  const s = (f) => ({ type: 'object', fields: f });
  assert.deepEqual(run('a = null\nb = [1]\nc = { }'.replace('c = { }', 'c { }'), s({ a: { type: 'null' }, b: { type: 'array' }, c: { type: 'object' } })), []);
  assert.deepEqual(run('a = null\nb = [1]\nc { }', s({ a: { type: 'object' }, b: { type: 'object' }, c: { type: 'array' } })).map((e) => e[3]), [5, 5, 1]);
  assert.deepEqual(run('a = 1\nb = "x"', s({ a: { type: 'number' }, b: { type: 'any', enum: ['y'] } })), [['SEM_NOT_IN_ENUM', 'main', 2, 5]]);
  assert.deepEqual(run('a = 1', s({ a: { type: 'string', enum: ['x'] } })).map((e) => e[0]), ['SEM_TYPE_MISMATCH']);
});

test('pha C: closed không fields theo đúng chữ rule 3; closed + khối hợp nhất', () => {
  assert.deepEqual(run('a = 1', { type: 'object', closed: true }), []);
  assert.deepEqual(run({ main: 's { a = 1 }\ninclude "i"', i: 's { b = 1 }' }, { fields: { s: { fields: { a: {} }, closed: true } } }),
    [['SEM_UNKNOWN_KEY', 'i', 1, 5]]);
});

test('pha B: vòng qua mảng, hằng; thứ tự theo tệp', () => {
  assert.deepEqual(run('a = ["${a}"]').map((e) => e[0]), ['SEM_REF_CYCLE']);
  assert.deepEqual(run('const a = "${@a}"').map((e) => e[0]), ['SEM_REF_CYCLE']);
  assert.deepEqual(run({ main: 'include "b"\nx = "${m}"', b: 'y = "${n}"' }).map((e) => [e[1], e[0]]),
    [['main', 'SEM_UNDEFINED_REF'], ['b', 'SEM_UNDEFINED_REF']]);
  assert.deepEqual(run('const a = "${@zz}"\nconst b = "${q}"').map((e) => e[0]), ['SEM_UNDEFINED_REF', 'SEM_CONST_CONFIG_REF']);
});
