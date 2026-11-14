import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

function ck(files, entry = 'main') {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return check(r.program).map((e) => [e.code, e.file, e.line, e.column]);
}
// Chuỗi test dùng ${...}; viết qua hàm để tránh escape template.
const s = (x) => x.replaceAll('<', '${');

test('hợp lệ → mảng rỗng', () => {
  assert.deepEqual(ck({ main: 'const e = "p"\na = "<@e}"\nb = "<a}"' }), []);
});

test('A: SEM_DUPLICATE_KEY mỗi lần xuất hiện sau lần đầu; Assign + Block cùng khóa', () => {
  assert.deepEqual(ck({ main: 'a = 1\na = 2\na { }\nb = 1' }), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1],
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
  ]);
  assert.deepEqual(ck({ main: 'a { x = 1\n  x = 2 }\nb { x = 1 }' }), [['SEM_DUPLICATE_KEY', 'main', 2, 3]]);
});

test('A: khóa trùng khác tệp / include vào cùng khối không phải trùng', () => {
  assert.deepEqual(ck({ main: 'include "b"\na = 1', b: 'a = 2' }), []);
});

test('A: SEM_DUPLICATE_CONST', () => {
  assert.deepEqual(ck({ main: 'const c = 1\nconst c = 2' }), [['SEM_DUPLICATE_CONST', 'main', 2, 1]]);
});

test('A: SEM_INCLUDE_NOT_FOUND (cả trong khối)', () => {
  assert.deepEqual(ck({ main: 'x { include "zz" }' }), [['SEM_INCLUDE_NOT_FOUND', 'main', 1, 5]]);
});

test('A: SEM_INCLUDE_CYCLE: tự include, vòng a→b→a, hình thoi không phải vòng', () => {
  assert.deepEqual(ck({ main: 'include "main"' }), [['SEM_INCLUDE_CYCLE', 'main', 1, 1]]);
  assert.deepEqual(ck({ main: 'include "b"', b: 'k = 1\ninclude "main"' }), [['SEM_INCLUDE_CYCLE', 'b', 2, 1]]);
  assert.deepEqual(
    ck({ main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'z = 1' }),
    [],
  );
});

test('A: thứ tự lỗi theo tệp tiền thứ tự, trong tệp theo (line, column)', () => {
  const files = {
    main: 'include "b"\nq = 1\nq = 2\ninclude "c"\ninclude "nope"',
    b: 'x = 1\nx = 2',
    c: 'y = 1\ny = 2',
  };
  assert.deepEqual(ck(files), [
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_INCLUDE_NOT_FOUND', 'main', 5, 1],
    ['SEM_DUPLICATE_KEY', 'b', 2, 1],
    ['SEM_DUPLICATE_KEY', 'c', 2, 1],
  ]);
});

test('A: main (tệp thăm đầu tiên) đứng trước b', () => {
  const out = ck({ main: 'include "b"\nq = 1\nq = 2', b: 'x = 1\nx = 2' });
  assert.deepEqual(out.map((e) => e[1]), ['main', 'b']);
});

test('B không chạy khi A có lỗi', () => {
  assert.deepEqual(ck({ main: s('a = 1\na = 2\nb = "<zz}"') }), [['SEM_DUPLICATE_KEY', 'main', 2, 1]]);
});

test('B: SEM_UNDEFINED_REF (cấu hình, mảng, chuỗi không đi xuyên, hằng)', () => {
  assert.deepEqual(ck({ main: s('a = "<b}"') }), [['SEM_UNDEFINED_REF', 'main', 1, 6]]);
  assert.deepEqual(ck({ main: s('l = [1]\na = "<l.1}"\nb = "<l.2}"\nc = "<l.0}"') }), [
    ['SEM_UNDEFINED_REF', 'main', 2, 6],
    ['SEM_UNDEFINED_REF', 'main', 3, 6],
  ]);
  assert.deepEqual(ck({ main: s('s = "x"\na = "<s.y}"') }), [['SEM_UNDEFINED_REF', 'main', 2, 6]]);
  assert.deepEqual(ck({ main: s('n = null\na = "<n}"') }), []);
});

test('B: ref hằng khai báo sau chỗ dùng hợp lệ; hằng tệp khác không thấy', () => {
  assert.deepEqual(ck({ main: s('a = "<@c}"\nconst c = 1') }), []);
  assert.deepEqual(ck({ main: s('include "b"\nconst c = 1'), b: s('x = "<@c}"') }), [
    ['SEM_UNDEFINED_REF', 'b', 1, 6],
  ]);
  assert.deepEqual(ck({ main: s('const c = [1,2]\na = "<@c.1}"\nb = "<@c.2}"') }), [
    ['SEM_UNDEFINED_REF', 'main', 3, 6],
  ]);
});

test('B: SEM_CONST_CONFIG_REF (kể cả trong mảng) ưu tiên trước UNDEFINED', () => {
  assert.deepEqual(ck({ main: s('a = 1\nconst c = ["<a}", "<nope}"]\nconst d = "<@c}"') }), [
    ['SEM_CONST_CONFIG_REF', 'main', 2, 13],
    ['SEM_CONST_CONFIG_REF', 'main', 2, 21],
  ]);
});

test('B: SEM_REF_CYCLE a→a, a↔b (cả hai), tổ tiên', () => {
  assert.deepEqual(ck({ main: s('a = "<a}"') }), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(ck({ main: s('a = "<b}"\nb = "<a}"') }), [
    ['SEM_REF_CYCLE', 'main', 1, 6],
    ['SEM_REF_CYCLE', 'main', 2, 6],
  ]);
  assert.deepEqual(ck({ main: s('x { y = "<x}" }') }), [['SEM_REF_CYCLE', 'main', 1, 10]]);
});

test('B: vòng qua ref hằng và chuỗi trong mảng; chuỗi ngoài vòng chỉ trỏ vào vòng không bị báo', () => {
  assert.deepEqual(ck({ main: s('const c = "<@c}"\na = "<@c}"') }), [['SEM_REF_CYCLE', 'main', 1, 12]]);
  assert.deepEqual(ck({ main: s('l = ["<l.0}"]') }), [['SEM_REF_CYCLE', 'main', 1, 7]]);
  assert.deepEqual(ck({ main: s('a = "x<b}"\nb = "<c}"\nc = "<c}"') }), [['SEM_REF_CYCLE', 'main', 3, 6]]);
});

test('B: định nghĩa bị ghi đè vẫn bị xét; vòng chỉ tính định nghĩa thắng', () => {
  // a đầu bị ghi đè bởi include sau → "<zz}" vẫn là UNDEFINED
  assert.deepEqual(ck({ main: s('include "b"\na = 2'), b: s('a = "<zz}"') }), [['SEM_UNDEFINED_REF', 'b', 1, 6]]);
  // a thắng (=1, ở main) nên định nghĩa cũ "<a}" ở b không tạo vòng
  assert.deepEqual(ck({ main: s('include "b"\na = 1\nb = "<a}"'), b: s('a = "<a}"') }), []);
});

test('B: SEM_BAD_INTERPOLATION chỉ khi chuỗi không thuần ref và đích là mảng/đối tượng', () => {
  assert.deepEqual(ck({ main: s('l = [1]\no { k = 1 }\na = "x<l}"\nc = "<o}<o}"\nd = "<l}"') }), [
    ['SEM_BAD_INTERPOLATION', 'main', 3, 7],
    ['SEM_BAD_INTERPOLATION', 'main', 4, 6],
    ['SEM_BAD_INTERPOLATION', 'main', 4, 10],
  ]);
  // đích là chuỗi thuần ref tới mảng → vẫn là mảng
  assert.deepEqual(ck({ main: s('l = [1]\nm = "<l}"\na = "x<m}"') }), [['SEM_BAD_INTERPOLATION', 'main', 3, 7]]);
  // đích vô hướng (số, null) được phép
  assert.deepEqual(ck({ main: s('n = 1\nz = null\na = "x<n}<z}"') }), []);
});

test('B: lỗi theo tệp, sắp theo vị trí Ref; check không ném khi có vòng', () => {
  const out = ck({ main: s('include "b"\na = "<zz}"'), b: s('p = "<q}"\nr = "<yy}"') });
  assert.deepEqual(out, [
    ['SEM_UNDEFINED_REF', 'main', 2, 6],
    ['SEM_UNDEFINED_REF', 'b', 1, 6],
    ['SEM_UNDEFINED_REF', 'b', 2, 6],
  ]);
});

// ---- Pha C (lược đồ) ----
function ckc(files, schema, entry = 'main') {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return check(r.program, schema).map((e) => [e.code, e.file, e.line, e.column]);
}

test('C: type — integer/number/null/array/object, vị trí nút giá trị', () => {
  const sc = { type: 'object', fields: {
    a: { type: 'integer' }, b: { type: 'number' }, c: { type: 'null' },
    d: { type: 'array' }, e: { type: 'object' }, f: { type: 'string' } } };
  assert.deepEqual(ckc({ main: 'a = 1.5\nb = 2\nc = null\nd = []\ne { }\nf = "x"' }, sc),
    [['SEM_TYPE_MISMATCH', 'main', 1, 5]]);
  assert.deepEqual(ckc({ main: 'a = 1\nb = 2.5\nc = 0\nd { }\ne = []\nf = null' }, sc), [
    ['SEM_TYPE_MISMATCH', 'main', 3, 5], ['SEM_TYPE_MISMATCH', 'main', 4, 1],
    ['SEM_TYPE_MISMATCH', 'main', 5, 5], ['SEM_TYPE_MISMATCH', 'main', 6, 5]]);
});

test('C: enum, items và vị trí phần tử mảng', () => {
  const sc = { fields: { m: { enum: ['a', 'b'] }, l: { type: 'array', items: { type: 'integer' } } } };
  assert.deepEqual(ckc({ main: 'm = "c"\nl = [1, "x", 2]' }, sc),
    [['SEM_NOT_IN_ENUM', 'main', 1, 5], ['SEM_TYPE_MISMATCH', 'main', 2, 9]]);
});

test('C: MISSING_REQUIRED tại đối tượng, UNKNOWN_KEY tại khóa; gốc 1:1', () => {
  const sc = { type: 'object', closed: true, fields: {
    z: { required: true }, y: { required: true },
    s: { type: 'object', fields: { q: { required: true } } } } };
  assert.deepEqual(ckc({ main: '\nx = 1\ns { }\nw = 2' }, sc), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1], ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_UNKNOWN_KEY', 'main', 2, 1], ['SEM_MISSING_REQUIRED', 'main', 3, 1],
    ['SEM_UNKNOWN_KEY', 'main', 4, 1]]);
});

test('C: chuỗi thuần tham chiếu dùng vị trí chuỗi; pha B lỗi thì bỏ pha C', () => {
  const sc = { fields: { p: { type: 'integer' }, o: { fields: { k: { type: 'integer' } } } } };
  assert.deepEqual(ckc({ main: s('base { k = "x" }\np = "<base.k}"\no = "<base}"') }, sc),
    [['SEM_TYPE_MISMATCH', 'main', 2, 5], ['SEM_TYPE_MISMATCH', 'main', 3, 5]]);
  assert.deepEqual(ckc({ main: s('p = "<zz}"') }, sc), [['SEM_UNDEFINED_REF', 'main', 1, 6]]);
});

test('C: type lệch thì không kiểm sâu; đối tượng gộp dùng vị trí Block khởi tạo', () => {
  const sc = { fields: { a: { type: 'object', fields: { q: { required: true } } } } };
  assert.deepEqual(ckc({ main: 'include "b"\na { y = 2 }', b: '\na { x = 1 }' }, sc), [['SEM_MISSING_REQUIRED', 'b', 2, 1]]);
  assert.deepEqual(ckc({ main: 'a = 1' }, sc), [['SEM_TYPE_MISMATCH', 'main', 1, 5]]);
});
