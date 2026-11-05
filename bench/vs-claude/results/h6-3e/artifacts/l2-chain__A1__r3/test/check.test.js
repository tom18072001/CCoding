import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, schema, entry = 'main') => {
  const p = parseProject(typeof files === 'string' ? { main: files } : files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return check(p.program, schema).map((e) => [e.code, e.file, e.line, e.column]);
};

test('pha A: trùng khóa và hằng', () => {
  assert.deepEqual(run('a = 1\na = 2\na {}\nb {\n a = 1\n a = 2\n}\nconst c = 1\nconst c = 2'), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1],
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'main', 6, 2],
    ['SEM_DUPLICATE_CONST', 'main', 9, 1],
  ]);
  // khóa ở tệp khác / khối khác không trùng
  assert.deepEqual(run({ main: 'a = 1\ninclude "x"\nb { a = 1 }', x: 'a = 2' }), []);
});

test('pha A: include thiếu, vòng, hình thoi', () => {
  assert.deepEqual(run({ main: 'include "nope"\ninclude "main"' }), [
    ['SEM_INCLUDE_NOT_FOUND', 'main', 1, 1],
    ['SEM_INCLUDE_CYCLE', 'main', 2, 1],
  ]);
  assert.deepEqual(run({ main: 'include "b"', b: 'include "main"' }), [['SEM_INCLUDE_CYCLE', 'b', 1, 1]]);
  assert.deepEqual(
    run({ main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'x = 1' }),
    [],
  );
});

test('pha A: thứ tự theo tệp tiền thứ tự', () => {
  const r = run({ main: 'include "b"\nk = 1\nk = 2', b: 'q = 1\nq = 2' });
  assert.deepEqual(r, [
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'b', 2, 1],
  ]);
});

test('pha A chặn pha B', () => {
  assert.deepEqual(run('a = 1\na = 2\nb = "${zz}"'), [['SEM_DUPLICATE_KEY', 'main', 2, 1]]);
});

test('pha B: tham chiếu', () => {
  assert.deepEqual(run('a = "${zz}"\nb = [ "${@q}" ]'), [
    ['SEM_UNDEFINED_REF', 'main', 1, 6],
    ['SEM_UNDEFINED_REF', 'main', 2, 8],
  ]);
  assert.deepEqual(run('const c = "${x}"\nx = 1'), [['SEM_CONST_CONFIG_REF', 'main', 1, 12]]);
  assert.deepEqual(run('a = "${@c}"\nconst c = [1]\nb = "${@c.0}"\nd = "${@c.1}"'), [['SEM_UNDEFINED_REF', 'main', 4, 6]]);
  // hằng của tệp khác không thấy; đường dẫn không xuyên qua chuỗi
  assert.deepEqual(run({ main: 'const c = 1\ninclude "x"', x: 'a = "${@c}"' }), [['SEM_UNDEFINED_REF', 'x', 1, 6]]);
  assert.deepEqual(run('s = "x"\na = "${s.0}"\nn = null\nb = "${n}"\nc = "${n.x}"'), [
    ['SEM_UNDEFINED_REF', 'main', 2, 6],
    ['SEM_UNDEFINED_REF', 'main', 5, 6],
  ]);
  // chuỗi bị ghi đè vẫn được kiểm
  assert.deepEqual(run('a = "${zz}"\na2 = 1'), [['SEM_UNDEFINED_REF', 'main', 1, 6]]);
  assert.deepEqual(run({ main: 'include "x"\na = 1', x: 'a = "${zz}"' }), [['SEM_UNDEFINED_REF', 'x', 1, 6]]);
});

test('pha B: vòng tham chiếu', () => {
  assert.deepEqual(run('a = "${a}"'), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(run('a = "${b}"\nb = "${a}"'), [
    ['SEM_REF_CYCLE', 'main', 1, 6],
    ['SEM_REF_CYCLE', 'main', 2, 6],
  ]);
  assert.deepEqual(run('x { y = "${x}" }'), [['SEM_REF_CYCLE', 'main', 1, 10]]);
  assert.deepEqual(run('a = ["${a}"]'), [['SEM_REF_CYCLE', 'main', 1, 7]]);
  assert.deepEqual(run('const a = "${@b}"\nconst b = "${@a}"'), [
    ['SEM_REF_CYCLE', 'main', 1, 12],
    ['SEM_REF_CYCLE', 'main', 2, 12],
  ]);
  // không phải vòng
  assert.deepEqual(run('a = "${b}"\nb = "${c}"\nc = 1'), []);
});

test('pha B: nội suy mảng/đối tượng', () => {
  assert.deepEqual(run('l = [1]\no { k = 1 }\na = "x${l}"\nb = "${o}${o}"\nc = "${l}"\nd = "${o.k}-${l.0}"'), [
    ['SEM_BAD_INTERPOLATION', 'main', 3, 7],
    ['SEM_BAD_INTERPOLATION', 'main', 4, 6],
    ['SEM_BAD_INTERPOLATION', 'main', 4, 10],
  ]);
  // đích là chuỗi thuần tham chiếu tới mảng
  assert.deepEqual(run('l = [1]\nm = "${l}"\na = "x${m}"'), [['SEM_BAD_INTERPOLATION', 'main', 3, 7]]);
});

const schema = {
  type: 'object',
  closed: true,
  fields: {
    name: { type: 'string', required: true },
    port: { type: 'integer' },
    mode: { enum: ['dev', 'prod'] },
    tags: { type: 'array', items: { type: 'string' } },
    srv: { type: 'object', fields: { host: { required: true } } },
    must: { required: true },
  },
};

test('pha C: lược đồ', () => {
  assert.deepEqual(run('port = 1.5\nmode = "x"\nzzz = 1\ntags = ["a", 2]\nsrv {}\nother = 1', schema), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_TYPE_MISMATCH', 'main', 1, 8],
    ['SEM_NOT_IN_ENUM', 'main', 2, 8],
    ['SEM_UNKNOWN_KEY', 'main', 3, 1],
    ['SEM_TYPE_MISMATCH', 'main', 4, 14],
    ['SEM_MISSING_REQUIRED', 'main', 5, 1],
    ['SEM_UNKNOWN_KEY', 'main', 6, 1],
  ]);
});

test('pha C: vị trí từ chuỗi thuần tham chiếu, kiểu không khớp dừng sâu', () => {
  // srv = "${n}" (số 5) sai kiểu object, báo tại chuỗi; khóa `n` ngoài lược đồ đóng
  assert.deepEqual(run('name = "n"\nmust = 1\nn = 5\nport = "${n}"\nsrv = "${n}"', schema), [
    ['SEM_UNKNOWN_KEY', 'main', 3, 1],
    ['SEM_TYPE_MISMATCH', 'main', 5, 7],
  ]);
  assert.deepEqual(run('name = "n"\nmust = 1\nport = "${n2}"\nn2 = 5.5', { fields: { port: { type: 'integer' } } }), [
    ['SEM_TYPE_MISMATCH', 'main', 3, 8],
  ]);
  assert.deepEqual(run('a = 1', { type: 'object', fields: { a: { type: 'any' } } }), []);
  assert.deepEqual(run('a = null', { fields: { a: { type: 'object' } } }), [['SEM_TYPE_MISMATCH', 'main', 1, 5]]);
});

test('pha C chỉ chạy khi không có lỗi trước; vị trí đối tượng theo Block khởi tạo', () => {
  assert.deepEqual(run('a = "${zz}"', { fields: { a: { type: 'number' } } }), [['SEM_UNDEFINED_REF', 'main', 1, 6]]);
  assert.deepEqual(
    run({ main: 'include "x"\nsrv { b = 1 }', x: 'srv { a = 1 }' }, { fields: { srv: { fields: { z: { required: true } } } } }),
    [['SEM_MISSING_REQUIRED', 'x', 1, 1]],
  );
  assert.deepEqual(
    run({ main: 'include "x"\nsrv { a = 1 }', x: 'srv = 1' }, { fields: { srv: { fields: { z: { required: true } } } } }),
    [['SEM_MISSING_REQUIRED', 'main', 2, 1]],
  );
});
