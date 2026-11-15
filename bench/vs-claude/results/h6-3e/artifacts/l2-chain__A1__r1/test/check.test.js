import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, schema, entry = 'main') => {
  if (typeof files === 'string') files = { main: files };
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return check(p.program, schema).map((e) => [e.code, e.file, e.line, e.column]);
};

test('hợp lệ → mảng rỗng', () => {
  assert.deepEqual(run('const c = "x"\na = "${@c}"\nb = "${a}"'), []);
});

test('pha A: khóa trùng, sắp theo vị trí', () => {
  assert.deepEqual(run('a = 1\na = 2\na { }\nb { x = 1 x = 2 }\nc { x = 1 }'), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1],
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'main', 4, 11],
  ]);
});

test('pha A: const trùng; khóa trùng giữa các tệp không phải lỗi', () => {
  assert.deepEqual(run('const a = 1\nconst a = 2'), [['SEM_DUPLICATE_CONST', 'main', 2, 1]]);
  assert.deepEqual(run({ main: 'a = 1\ninclude "b"', b: 'a = 2' }), []);
});

test('pha A: include thiếu, vòng, hình thoi', () => {
  assert.deepEqual(run({ main: 'include "nope"\ninclude "main"' }), [
    ['SEM_INCLUDE_NOT_FOUND', 'main', 1, 1],
    ['SEM_INCLUDE_CYCLE', 'main', 2, 1],
  ]);
  assert.deepEqual(run({ main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'x = 1' }), []);
  // lỗi gom theo tệp theo thứ tự thăm
  assert.deepEqual(run({ main: 'include "b"\nz = 1\nz = 2', b: 'q = 1\nq = 2\ninclude "main"' }), [
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'b', 2, 1],
    ['SEM_INCLUDE_CYCLE', 'b', 3, 1],
  ]);
});

test('pha A chặn pha B', () => {
  assert.deepEqual(run('a = 1\na = 2\nb = "${zz}"'), [['SEM_DUPLICATE_KEY', 'main', 2, 1]]);
});

test('pha B: tham chiếu không có', () => {
  assert.deepEqual(run('a = "${b}"\nl = [1]\nc = "${l.1}${l.0.x}${@k}"'), [
    ['SEM_UNDEFINED_REF', 'main', 1, 6],
    ['SEM_UNDEFINED_REF', 'main', 3, 6],
    ['SEM_UNDEFINED_REF', 'main', 3, 12],
    ['SEM_UNDEFINED_REF', 'main', 3, 20],
  ]);
  // không đi xuyên chuỗi; hằng của tệp khác không thấy; hằng khai báo muộn được
  assert.deepEqual(run('a = "x"\nb = "${a.y}"\nc = "${@k}"\nconst k = 1'), [['SEM_UNDEFINED_REF', 'main', 2, 6]]);
  assert.deepEqual(run({ main: 'include "b"\nx = "${@k}"', b: 'const k = 1' }), [['SEM_UNDEFINED_REF', 'main', 2, 6]]);
  assert.deepEqual(run('a = null\nb = "${a}"'), []);
});

test('pha B: const tham chiếu cấu hình', () => {
  assert.deepEqual(run('a = 1\nconst c = ["${a}", "${@d}"]\nconst d = 2'), [['SEM_CONST_CONFIG_REF', 'main', 2, 13]]);
  assert.deepEqual(run('const c = ["${@d.1}"]\nconst d = [1,2]'), []);
});

test('pha B: vòng tham chiếu', () => {
  assert.deepEqual(run('a = "${a}"'), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(run('a = "${b}"\nb = "${a}"'), [
    ['SEM_REF_CYCLE', 'main', 1, 6],
    ['SEM_REF_CYCLE', 'main', 2, 6],
  ]);
  // định nghĩa bị ghi đè không tính
  assert.deepEqual(run({ main: 'x { y = "${x}" }\ninclude "b"', b: 'x = 1' }), []);
  assert.deepEqual(run('a = "${b}"\nb = ["${c}"]\nc = 1'), []);
  assert.deepEqual(run('const a = "${@a}"'), [['SEM_REF_CYCLE', 'main', 1, 12]]);
});

test('pha B: nội suy mảng/đối tượng', () => {
  assert.deepEqual(run('l = [1]\no { k = 1 }\na = "${l}"\nb = "v${l}"\nc = "${o}${o}"\nd = "${l}${o}"'), [
    ['SEM_BAD_INTERPOLATION', 'main', 4, 7],
    ['SEM_BAD_INTERPOLATION', 'main', 5, 6],
    ['SEM_BAD_INTERPOLATION', 'main', 5, 10],
    ['SEM_BAD_INTERPOLATION', 'main', 6, 6],
    ['SEM_BAD_INTERPOLATION', 'main', 6, 10],
  ]);
  // đích là chuỗi thuần tham chiếu tới mảng cũng là mảng
  assert.deepEqual(run('l = [1]\nm = "${l}"\nb = "v${m}"'), [['SEM_BAD_INTERPOLATION', 'main', 3, 7]]);
  assert.deepEqual(run('s = "x"\nn = 1\nb = "v${s}${n}"'), []);
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
  assert.deepEqual(run('name = "a"\nport = 80\ntags = ["x"]\nsrv { host = 1 }', schema), []);
  assert.deepEqual(run('port = 81\nextra = 1\ntags = ["x", 2]\nsrv { }', schema), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_NOT_IN_ENUM', 'main', 1, 8],
    ['SEM_UNKNOWN_KEY', 'main', 2, 1],
    ['SEM_TYPE_MISMATCH', 'main', 3, 14],
    ['SEM_MISSING_REQUIRED', 'main', 4, 1],
  ]);
  assert.deepEqual(run('name = 1\nport = 1.5', schema), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 8],
    ['SEM_TYPE_MISMATCH', 'main', 2, 8],
  ]);
});

test('pha C: vị trí qua tham chiếu thuần và include', () => {
  const s = { fields: { o: { type: 'object', closed: true, fields: {}, required: true }, n: { type: 'string' } } };
  assert.deepEqual(run({ main: 'src { a = 1 }\no = "${src}"\nn = "${src.a}"' }, s), [
    ['SEM_UNKNOWN_KEY', 'main', 2, 5],
    ['SEM_TYPE_MISMATCH', 'main', 3, 5],
  ]);
  assert.deepEqual(run({ main: 'include "b"', b: 'o { z = 1 }' }, s), [['SEM_UNKNOWN_KEY', 'b', 1, 5]]);
  // đối tượng: vị trí Block khởi tạo (sau khi bị thay bằng giá trị khác)
  const files = { main: 'include "b"\no { }\ninclude "c"', b: 'o = 1', c: 'o { q = 1 }' };
  assert.deepEqual(run(files, { fields: { o: { type: 'string' } } }), [['SEM_TYPE_MISMATCH', 'main', 2, 1]]);
});
