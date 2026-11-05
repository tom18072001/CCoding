import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, schema) => {
  const p = parseProject(files, 'main');
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return check(p.program, schema).map((e) => [e.code, e.file, e.line, e.column]);
};
const one = (src, schema) => run({ main: src }, schema);

test('pha A: khóa/const trùng, include', () => {
  assert.deepEqual(one('a = 1\na = 2\na { }\nb { x = 1 x = 2 }\nc { x = 1 }\nconst k = 1\nconst k = 2'), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1], ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'main', 4, 11], ['SEM_DUPLICATE_CONST', 'main', 7, 1]]);
  assert.deepEqual(run({ main: 'include "a"\nk = 1', a: 'k = 1' }), []);
  assert.deepEqual(one('include "nope"'), [['SEM_INCLUDE_NOT_FOUND', 'main', 1, 1]]);
});

test('pha A: vòng include, hình thoi, thứ tự theo tệp', () => {
  assert.deepEqual(run({ main: 'include "main"' }), [['SEM_INCLUDE_CYCLE', 'main', 1, 1]]);
  assert.deepEqual(run({ main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'x = 1' }), []);
  assert.deepEqual(run({ main: 'a = 1\na = 2\ninclude "b"', b: 'include "main"\nz = 1\nz = 2' }), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1], ['SEM_INCLUDE_CYCLE', 'b', 1, 1], ['SEM_DUPLICATE_KEY', 'b', 3, 1]]);
});

test('pha A chặn pha B', () => {
  assert.deepEqual(one('a = 1\na = 2\nb = "${zz}"').map((e) => e[0]), ['SEM_DUPLICATE_KEY']);
});

test('pha B: tham chiếu không tồn tại và hằng', () => {
  assert.deepEqual(one('a = "${b}"\nc = "${@k}"\nd = "${a.x}"\ne = [1]\nf = "${e.1}${e.0}"'), [
    ['SEM_UNDEFINED_REF', 'main', 1, 6], ['SEM_UNDEFINED_REF', 'main', 2, 6],
    ['SEM_UNDEFINED_REF', 'main', 3, 6], ['SEM_UNDEFINED_REF', 'main', 5, 6]]);
  assert.deepEqual(one('x = "${@k}"\nconst k = 1'), []);
  assert.deepEqual(run({ main: 'include "b"\nx = "${@k}"', b: 'const k = 1' }), [['SEM_UNDEFINED_REF', 'main', 2, 6]]);
  assert.deepEqual(one('a = 1\nconst k = "${a}"\nconst j = "${@k}"'), [['SEM_CONST_CONFIG_REF', 'main', 2, 12]]);
  assert.deepEqual(one('s = "x"\nt = "${s.0}"'), [['SEM_UNDEFINED_REF', 'main', 2, 6]]);
});

test('pha B: vòng tham chiếu', () => {
  assert.deepEqual(one('a = "${a}"'), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(one('a = "${b}"\nb = "${a}"'), [['SEM_REF_CYCLE', 'main', 1, 6], ['SEM_REF_CYCLE', 'main', 2, 6]]);
  assert.deepEqual(one('x { y = "${x}" }'), [['SEM_REF_CYCLE', 'main', 1, 10]]);
  assert.deepEqual(one('a = "${b}"\nb = "${c}"\nc = 1\nd = "${d2}"\nd2 = 2'), []);
  assert.deepEqual(one('a = ["${a.0}"]'), [['SEM_REF_CYCLE', 'main', 1, 7]]);
  // định nghĩa bị ghi đè không tính
  assert.deepEqual(run({ main: 'include "f"\na = "${b}"\nb = 1', f: 'b = "${a}"' }), []);
});

test('pha B: nội suy mảng/đối tượng vào chuỗi', () => {
  assert.deepEqual(one('l = [1]\no { k = 1 }\na = "x${l}"\nb = "${l}"\nc = "${o}${o}"\nd = "${l.0}x"\ne = "${l}"\nf = "p${e}"'), [
    ['SEM_BAD_INTERPOLATION', 'main', 3, 7], ['SEM_BAD_INTERPOLATION', 'main', 5, 6],
    ['SEM_BAD_INTERPOLATION', 'main', 5, 10], ['SEM_BAD_INTERPOLATION', 'main', 8, 7]]);
  assert.deepEqual(one('n = null\nx = "a${n}"'), []);
});

test('pha B: chuỗi trong mảng, trong const và bị ghi đè đều được kiểm', () => {
  assert.deepEqual(run({ main: 'include "f"\nb = 1\na = ["${q}"]\nconst c = ["${@q3}"]', f: 'b = "${q2}"' }), [
    ['SEM_UNDEFINED_REF', 'main', 3, 7], ['SEM_UNDEFINED_REF', 'main', 4, 13], ['SEM_UNDEFINED_REF', 'f', 1, 6]]);
});

const schema = {
  type: 'object', closed: true,
  fields: {
    name: { type: 'string', required: true, enum: ['a', 'b'] },
    port: { type: 'integer' },
    srv: { type: 'object', required: true, closed: true, fields: { host: { type: 'string', required: true } } },
    tags: { type: 'array', items: { type: 'number' } },
    x: { type: 'null' },
  },
};

test('pha C: kiểu, enum, required, closed, items', () => {
  assert.deepEqual(one('name = "z"\nport = 1.5\ntags = [1, "a", 2, true]\nx = 0\nsrv { h = 1 }\nextra = 1', schema), [
    ['SEM_NOT_IN_ENUM', 'main', 1, 8], ['SEM_TYPE_MISMATCH', 'main', 2, 8],
    ['SEM_TYPE_MISMATCH', 'main', 3, 12], ['SEM_TYPE_MISMATCH', 'main', 3, 20], ['SEM_TYPE_MISMATCH', 'main', 4, 5],
    ['SEM_MISSING_REQUIRED', 'main', 5, 1], ['SEM_UNKNOWN_KEY', 'main', 5, 7], ['SEM_UNKNOWN_KEY', 'main', 6, 1]]);
  assert.deepEqual(one('a = 1', schema), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1], ['SEM_MISSING_REQUIRED', 'main', 1, 1], ['SEM_UNKNOWN_KEY', 'main', 1, 1]]);
  assert.deepEqual(one('name = "a"\nsrv { host = "h" }\nx = null', schema), []);
});

test('pha C: chạy trên giá trị đã đánh giá, vị trí chuỗi thuần tham chiếu', () => {
  const s = { type: 'object', fields: { p: { type: 'string' }, o: { type: 'object', fields: { k: { type: 'string' } } } } };
  assert.deepEqual(one('n = 5\np = "${n}"\nq { k = 1 }\no = "${q}"', s), [
    ['SEM_TYPE_MISMATCH', 'main', 2, 5], ['SEM_TYPE_MISMATCH', 'main', 4, 5]]);
  assert.deepEqual(one('n = 5\np = "n${n}"', s), []);
  // đối tượng: vị trí Block khởi tạo
  assert.deepEqual(run({ main: 'include "f"\no { z = 1 }', f: 'o { k = "a" }' }, { type: 'object', fields: { o: { type: 'object', closed: true, fields: { k: {} } } } }),
    [['SEM_UNKNOWN_KEY', 'main', 2, 5]]);
  assert.deepEqual(run({ main: 'include "f"\no { }', f: 'o = 1' },{ fields: { o: { fields: { k: { required: true } } } } }), [['SEM_MISSING_REQUIRED', 'main', 2, 1]]);
});

test('pha C: chỉ chạy khi pha B sạch', () => {
  assert.deepEqual(one('a = "${zz}"', { fields: { a: { type: 'number' } } }).map((e) => e[0]), ['SEM_UNDEFINED_REF']);
});
