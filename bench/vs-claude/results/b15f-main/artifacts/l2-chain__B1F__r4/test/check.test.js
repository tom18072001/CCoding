import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, schema, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return check(p.program, schema).map((e) => [e.code, e.file, e.line, e.column]);
};

test('pha A: khóa trùng (mỗi lần lặp một lỗi, Assign/Block, khối khác không trùng)', () => {
  assert.deepEqual(run({ main: 'a = 1\na = 2\na { x = 1 }\nb { a = 1 }\nc { x = 1 x = 2 }' }), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1],
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'main', 5, 11],
  ]);
});

test('pha A: khóa giống nhau giữa các tệp không trùng; const trùng', () => {
  assert.deepEqual(run({ main: 'include "b"\na = 1', b: 'a = 2' }), []);
  assert.deepEqual(run({ main: 'const k = 1\nconst k = 2' }), [['SEM_DUPLICATE_CONST', 'main', 2, 1]]);
});

test('pha A: include không có và include vòng', () => {
  assert.deepEqual(run({ main: 'include "zzz"' }), [['SEM_INCLUDE_NOT_FOUND', 'main', 1, 1]]);
  assert.deepEqual(run({ main: 'include "main"' }), [['SEM_INCLUDE_CYCLE', 'main', 1, 1]]);
  assert.deepEqual(run({ main: 'include "a"', a: 'include "b"', b: 'include "a"' }), [
    ['SEM_INCLUDE_CYCLE', 'b', 1, 1],
  ]);
});

test('pha A: hình thoi không phải vòng', () => {
  const files = { main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'x = 1' };
  assert.deepEqual(run(files), []);
});

test('pha A: thứ tự theo tệp tiền thứ tự, trong tệp theo (line, column)', () => {
  const files = {
    main: 'include "b"\nq = 1\nq = 2\ninclude "nope"',
    b: 'z = 1 z = 2\nz = 3',
  };
  assert.deepEqual(run(files), [
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_INCLUDE_NOT_FOUND', 'main', 4, 1],
    ['SEM_DUPLICATE_KEY', 'b', 1, 7],
    ['SEM_DUPLICATE_KEY', 'b', 2, 1],
  ]);
});

test('pha B: SEM_CONST_CONFIG_REF, SEM_UNDEFINED_REF', () => {
  assert.deepEqual(run({ main: 'a = 1\nconst c = "${a}"' }), [['SEM_CONST_CONFIG_REF', 'main', 2, 12]]);
  assert.deepEqual(run({ main: 'a = "${b}" b = "${@nope}"\nc = "${@k}"\nconst k = 1' }), [
    ['SEM_UNDEFINED_REF', 'main', 1, 17],
  ]);
});

test('pha B: hằng của tệp khác không thấy; hằng khai báo muộn thấy; Ref trong mảng', () => {
  assert.deepEqual(run({ main: 'include "b"', b: 'const k = 1' }), []);
  assert.deepEqual(run({ main: 'include "b"', b: 'x = ["${@k}"]' }), [['SEM_UNDEFINED_REF', 'b', 1, 7]]);
  assert.deepEqual(run({ main: 'x = "${@k}"\nconst k = 1' }), []);
});

test('pha B: Ref trong chuỗi bị ghi đè vẫn được xét', () => {
  assert.deepEqual(run({ main: 'a = "${zz}"\na2 = 1\n' }), [['SEM_UNDEFINED_REF', 'main', 1, 6]]);
  assert.deepEqual(run({ main: 'include "b"\nm = 1', b: 'm = "${zz}"' }), [['SEM_UNDEFINED_REF', 'b', 1, 6]]);
});

test('pha B: vòng tham chiếu', () => {
  assert.deepEqual(run({ main: 'a = "${a}"' }), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(run({ main: 'a = "${b}"\nb = "${a}"' }), [
    ['SEM_REF_CYCLE', 'main', 1, 6],
    ['SEM_REF_CYCLE', 'main', 2, 6],
  ]);
  assert.deepEqual(run({ main: 'x { y = "${x}" }' }), [['SEM_REF_CYCLE', 'main', 1, 10]]);
  assert.deepEqual(run({ main: 'const c = "${@c}"' }), [['SEM_REF_CYCLE', 'main', 1, 12]]);
});

test('pha B: định nghĩa bị ghi đè không tạo vòng; tham chiếu không-vòng', () => {
  assert.deepEqual(run({ main: 'include "b"\na = 1\nb = "${a}"', b: 'a = "${b}"' }), []);
  assert.deepEqual(run({ main: 'a = "${b}"\nb = [1]' }), []);
});

test('pha B: SEM_BAD_INTERPOLATION', () => {
  assert.deepEqual(run({ main: 'l = [1]\no { k = 1 }\na = "x${l}"\nb = "${l}"\nc = "${o}${o}"\nd = "n${o.k}"' }), [
    ['SEM_BAD_INTERPOLATION', 'main', 3, 7],
    ['SEM_BAD_INTERPOLATION', 'main', 5, 6],
    ['SEM_BAD_INTERPOLATION', 'main', 5, 10],
  ]);
  // đích là chuỗi thuần tham chiếu tới mảng
  assert.deepEqual(run({ main: 'l = [1]\nm = "${l}"\na = "x${m}"' }), [['SEM_BAD_INTERPOLATION', 'main', 3, 7]]);
});

test('pha B: mỗi Ref tối đa một lỗi, ưu tiên CONST_CONFIG_REF trước UNDEFINED', () => {
  assert.deepEqual(run({ main: 'const c = "${nope}"' }), [['SEM_CONST_CONFIG_REF', 'main', 1, 12]]);
  // vòng ưu tiên trước nội suy sai: a chứa chính nó trong mảng
  assert.deepEqual(run({ main: 'a = ["x${a}"]' }), [['SEM_REF_CYCLE', 'main', 1, 8]]);
});

test('dừng giữa các pha', () => {
  assert.deepEqual(run({ main: 'a = 1\na = 2\nb = "${zz}"' }, { type: 'object', closed: true }).map((e) => e[0]), ['SEM_DUPLICATE_KEY']);
  assert.deepEqual(run({ main: 'b = "${zz}"' }, { type: 'object', closed: true }).map((e) => e[0]), ['SEM_UNDEFINED_REF']);
  assert.deepEqual(run({ main: 'b = 1' }, { type: 'object', closed: true, fields: {} }).map((e) => e[0]), ['SEM_UNKNOWN_KEY']);
  assert.deepEqual(run({ main: 'b = 1' }), []);
});

test('pha C: type và vị trí giá trị', () => {
  const schema = { type: 'object', fields: { port: { type: 'integer' }, s: { type: 'string' }, n: { type: 'null' }, l: { type: 'array' } } };
  assert.deepEqual(run({ main: 'port = 1.5\ns = 3\nn = false\nl = {}'.replace('{}', 'null') }, schema), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 8],
    ['SEM_TYPE_MISMATCH', 'main', 2, 5],
    ['SEM_TYPE_MISMATCH', 'main', 3, 5],
    ['SEM_TYPE_MISMATCH', 'main', 4, 5],
  ]);
  assert.deepEqual(run({ main: 'port = 80\ns = "x"\nn = null\nl = []' }, schema), []);
  assert.deepEqual(run({ main: 'o { a = 1 }' }, { fields: { o: { type: 'array' } } }), [['SEM_TYPE_MISMATCH', 'main', 1, 1]]);
});

test('pha C: enum (không kiểm sâu hơn), items', () => {
  const schema = { fields: { m: { enum: ['a', 'b'] }, l: { type: 'array', items: { type: 'number', enum: [1, 2] } } } };
  assert.deepEqual(run({ main: 'm = "c"\nl = [1, 3, "x"]' }, schema), [
    ['SEM_NOT_IN_ENUM', 'main', 1, 5],
    ['SEM_NOT_IN_ENUM', 'main', 2, 9],
    ['SEM_TYPE_MISMATCH', 'main', 2, 12],
  ]);
});

test('pha C: required tại vị trí đối tượng, rồi UNKNOWN_KEY theo thứ tự cấu hình', () => {
  const schema = {
    closed: true,
    fields: { a: { required: true }, b: { required: true }, srv: { type: 'object', closed: true, fields: { h: { required: true } } } },
  };
  assert.deepEqual(run({ main: 'z = 1\nsrv { k = 1 }\ny = 2' }, schema), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_UNKNOWN_KEY', 'main', 1, 1],
    ['SEM_MISSING_REQUIRED', 'main', 2, 1],
    ['SEM_UNKNOWN_KEY', 'main', 2, 7],
    ['SEM_UNKNOWN_KEY', 'main', 3, 1],
  ]);
});

test('pha C: khóa thắng khi include ghi đè; đối tượng từ Block khởi tạo', () => {
  const schema = { closed: true, fields: { s: { type: 'object', fields: { q: { required: true } } } } };
  const files = { main: 'x = 1\ninclude "b"\ns { w = 1 }', b: 'x = 2\ns { w = 0 }' };
  assert.deepEqual(run(files, schema), [
    ['SEM_UNKNOWN_KEY', 'b', 1, 1],
    ['SEM_MISSING_REQUIRED', 'b', 2, 1],
  ]);
});

test('pha C: giá trị qua chuỗi thuần tham chiếu lấy vị trí chuỗi', () => {
  const schema = { fields: { p: { type: 'string' }, o: { type: 'object', fields: { k: { type: 'string' } } } } };
  const files = { main: 'src { k = 1 }\nn = 5\np = "${n}"\no = "${src}"' };
  assert.deepEqual(run(files, { fields: { ...schema.fields, src: {}, n: {} } }), [
    ['SEM_TYPE_MISMATCH', 'main', 3, 5],
    ['SEM_TYPE_MISMATCH', 'main', 4, 5],
  ]);
});
