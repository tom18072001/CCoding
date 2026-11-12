import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, schema, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return check(p.program, schema);
};
const brief = (errs) => errs.map((e) => [e.code, e.file, e.line, e.column]);

// ---------- Pha A ----------
test('A: SEM_DUPLICATE_KEY mỗi lần lặp, Assign và Block cùng khóa', () => {
  const errs = run({ main: 'a = 1\na = 2\na { x = 1 }\nb = 1' });
  assert.deepEqual(brief(errs), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1],
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
  ]);
});

test('A: khóa giống nhau ở khối khác / tệp khác không trùng', () => {
  const errs = run({ main: 'a = 1\nx { a = 1 }\ny { a = 2 }\nz { include "o" }\nz2 { a = 1 }', o: 'a = 5' });
  assert.deepEqual(errs, []);
  assert.deepEqual(run({ main: 'a = 1\ninclude "o"', o: 'a = 2' }), []);
});

test('A: SEM_DUPLICATE_KEY trong khối lồng', () => {
  const errs = run({ main: 'x {\n  k = 1\n  k = 2\n}' });
  assert.deepEqual(brief(errs), [['SEM_DUPLICATE_KEY', 'main', 3, 3]]);
});

test('A: SEM_DUPLICATE_CONST', () => {
  const errs = run({ main: 'const c = 1\nconst d = 1\nconst c = 2' });
  assert.deepEqual(brief(errs), [['SEM_DUPLICATE_CONST', 'main', 3, 1]]);
});

test('A: SEM_INCLUDE_NOT_FOUND', () => {
  const errs = run({ main: 'a = 1\nsub {\n  include "nope"\n}' });
  assert.deepEqual(brief(errs), [['SEM_INCLUDE_NOT_FOUND', 'main', 3, 3]]);
});

test('A: SEM_INCLUDE_CYCLE (a→b→a và tự include)', () => {
  const errs = run({ main: 'include "b"', b: 'x = 1\ninclude "main"' });
  assert.deepEqual(brief(errs), [['SEM_INCLUDE_CYCLE', 'b', 2, 1]]);
  assert.deepEqual(brief(run({ main: 'include "main"' })), [['SEM_INCLUDE_CYCLE', 'main', 1, 1]]);
});

test('A: kiểu hình thoi không phải vòng', () => {
  const files = {
    main: 'include "b"\ninclude "c"',
    b: 'include "d"',
    c: 'include "d"',
    d: 'k = 1',
  };
  assert.deepEqual(run(files), []);
});

test('A: thứ tự lỗi — gom theo tệp tiền thứ tự, trong tệp theo (line, column)', () => {
  const files = {
    main: 'include "b"\nz = 1\nz = 2\ninclude "c"\nq = 1\nq = 2\nconst k = 1\nconst k = 2',
    b: 'm = 1\nm = 2\ninclude "d"',
    c: 'include "nope"',
    d: 'p = 1\np = 2',
  };
  // Thăm: main, b, d, c. Lỗi: main (dòng 3,6,8), rồi b (2), d (2), c (1).
  assert.deepEqual(brief(run(files)), [
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'main', 6, 1],
    ['SEM_DUPLICATE_CONST', 'main', 8, 1],
    ['SEM_DUPLICATE_KEY', 'b', 2, 1],
    ['SEM_DUPLICATE_KEY', 'd', 2, 1],
    ['SEM_INCLUDE_NOT_FOUND', 'c', 1, 1],
  ]);
});

test('A: lỗi trong một tệp sắp theo vị trí dù sinh từ loại khác nhau', () => {
  const errs = run({ main: 'const c = 1\ninclude "x"\na = 1\nconst c = 2\na = 2' });
  assert.deepEqual(brief(errs), [
    ['SEM_INCLUDE_NOT_FOUND', 'main', 2, 1],
    ['SEM_DUPLICATE_CONST', 'main', 4, 1],
    ['SEM_DUPLICATE_KEY', 'main', 5, 1],
  ]);
});

test('A: dừng sau pha A, không chạy pha B', () => {
  const errs = run({ main: 'a = 1\na = 2\nb = "${nope}"' });
  assert.deepEqual(brief(errs), [['SEM_DUPLICATE_KEY', 'main', 2, 1]]);
});

// ---------- Pha B ----------
test('B: SEM_CONST_CONFIG_REF', () => {
  const errs = run({ main: 'a = 1\nconst c = "x${a}"' });
  assert.deepEqual(brief(errs), [['SEM_CONST_CONFIG_REF', 'main', 2, 13]]);
});

test('B: CONST_CONFIG_REF thắng UNDEFINED_REF; mỗi Ref tối đa một lỗi', () => {
  const errs = run({ main: 'const c = "${nope}"' });
  assert.deepEqual(brief(errs), [['SEM_CONST_CONFIG_REF', 'main', 1, 12]]);
});

test('B: SEM_UNDEFINED_REF — đường dẫn, chỉ số, đi xuyên chuỗi, hằng tệp khác', () => {
  const files = {
    main: [
      'include "o"',
      's = "t"',
      'arr = [1]',
      'a = "${nope}"', // 4
      'b = "${arr.1}"', // 5
      'c = "${s.x}"', // 6
      'e = "${@other}"', // 7
      'f = "${arr.0}"', // 8 ok
    ].join('\n'),
    o: 'const other = 1',
  };
  assert.deepEqual(brief(run(files)), [
    ['SEM_UNDEFINED_REF', 'main', 4, 6],
    ['SEM_UNDEFINED_REF', 'main', 5, 6],
    ['SEM_UNDEFINED_REF', 'main', 6, 6],
    ['SEM_UNDEFINED_REF', 'main', 7, 6],
  ]);
});

test('B: hằng khai báo sau chỗ dùng vẫn hợp lệ; null là tồn tại', () => {
  assert.deepEqual(run({ main: 'a = "${@c}"\nn = null\nm = "${n}"\nconst c = 1' }), []);
});

test('B: không có lỗi khi tham chiếu khóa khai báo muộn', () => {
  assert.deepEqual(run({ main: 'a = "${b}"\nb = 1' }), []);
});

test('B: SEM_REF_CYCLE — a = "${a}"', () => {
  assert.deepEqual(brief(run({ main: 'a = "${a}"' })), [['SEM_REF_CYCLE', 'main', 1, 6]]);
});

test('B: SEM_REF_CYCLE — a ↔ b, cả hai Ref đều lỗi', () => {
  const errs = run({ main: 'a = "${b}"\nb = "${a}"' });
  assert.deepEqual(brief(errs), [
    ['SEM_REF_CYCLE', 'main', 1, 6],
    ['SEM_REF_CYCLE', 'main', 2, 6],
  ]);
});

test('B: SEM_REF_CYCLE — x { y = "${x}" } tham chiếu tổ tiên', () => {
  const errs = run({ main: 'x {\n  y = "${x}"\n}' });
  assert.deepEqual(brief(errs), [['SEM_REF_CYCLE', 'main', 2, 8]]);
});

test('B: ref tới chuỗi bị ghi đè không tạo vòng; chuỗi bị ghi đè vẫn được kiểm', () => {
  // a = "${a}" bị include sau ghi đè bằng số: Ref cũ trỏ tới giá trị cuối (số) nên không còn vòng.
  assert.deepEqual(run({ main: 'a = "${a}"\ninclude "o"', o: 'a = 1' }), []);
  // chuỗi bị ghi đè vẫn bị xét: Ref không phân giải được vẫn báo lỗi
  assert.deepEqual(brief(run({ main: 'a = "${nope}"\ninclude "o"', o: 'a = 1' })), [['SEM_UNDEFINED_REF', 'main', 1, 6]]);
});

test('B: Ref không vòng khi đích bị ghi đè sạch (chuỗi cũ không còn trong S)', () => {
  const errs = run({ main: 'a = "${b}"\nb = 1\nb = "${c}"\nc = 2'.replace('b = 1\nb =', 'b =') });
  assert.deepEqual(errs, []);
});

test('B: SEM_BAD_INTERPOLATION — mảng/đối tượng trong chuỗi không thuần', () => {
  const files = { main: 'arr = [1]\nobj { k = 1 }\np = "${arr}"\na = "x${arr}"\nb = "${obj}${obj}"\nc = "x${obj.k}"\nd = "${p}-"' };
  assert.deepEqual(brief(run(files)), [
    ['SEM_BAD_INTERPOLATION', 'main', 4, 7],
    ['SEM_BAD_INTERPOLATION', 'main', 5, 6],
    ['SEM_BAD_INTERPOLATION', 'main', 5, 12],
    ['SEM_BAD_INTERPOLATION', 'main', 7, 6],
  ]);
});

test('B: lỗi đặt theo tệp tiền thứ tự, file là tệp chứa chuỗi; const ref trong mảng', () => {
  const files = {
    main: 'x = ["${nope}"]\ninclude "o"\ny = "${@z}"',
    o: 'const k = ["${@zz}"]\nq = "${nope2}"',
  };
  assert.deepEqual(brief(run(files)), [
    ['SEM_UNDEFINED_REF', 'main', 1, 7],
    ['SEM_UNDEFINED_REF', 'main', 3, 6],
    ['SEM_UNDEFINED_REF', 'o', 1, 13],
    ['SEM_UNDEFINED_REF', 'o', 2, 6],
  ]);
});

test('B: dừng sau pha B, không chạy pha C', () => {
  const errs = run({ main: 'a = "${nope}"' }, { type: 'object', fields: { a: { type: 'number' } } });
  assert.deepEqual(brief(errs), [['SEM_UNDEFINED_REF', 'main', 1, 6]]);
});

// ---------- Pha C ----------
const S = (fields, extra = {}) => ({ type: 'object', fields, ...extra });

test('C: SEM_TYPE_MISMATCH tại nút giá trị; integer vs number', () => {
  const schema = S({ a: { type: 'string' }, b: { type: 'integer' }, c: { type: 'number' }, d: { type: 'integer' } });
  const errs = run({ main: 'a = 1\nb = 1.5\nc = 2\nd = 3.0' }, schema);
  assert.deepEqual(brief(errs), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 5],
    ['SEM_TYPE_MISMATCH', 'main', 2, 5],
  ]);
});

test('C: null / array / object không nhận nhau', () => {
  const schema = S({ a: { type: 'object' }, b: { type: 'array' }, c: { type: 'null' }, d: { type: 'object' } });
  const errs = run({ main: 'a = null\nb { }\nc = 0\nd { }' }, schema);
  assert.deepEqual(brief(errs), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 5],
    ['SEM_TYPE_MISMATCH', 'main', 2, 1],
    ['SEM_TYPE_MISMATCH', 'main', 3, 5],
  ]);
});

test('C: type any và type bị bỏ qua', () => {
  assert.deepEqual(run({ main: 'a = 1' }, S({ a: { type: 'any' } })), []);
  assert.deepEqual(run({ main: 'a = 1' }, S({ a: {} })), []);
});

test('C: SEM_NOT_IN_ENUM, type kiểm trước enum', () => {
  const schema = S({ a: { enum: ['x', 'y'] }, b: { type: 'string', enum: ['x'] }, c: { enum: [1, null] } });
  const errs = run({ main: 'a = "z"\nb = 3\nc = null' }, schema);
  assert.deepEqual(brief(errs), [
    ['SEM_NOT_IN_ENUM', 'main', 1, 5],
    ['SEM_TYPE_MISMATCH', 'main', 2, 5],
  ]);
});

test('C: SEM_MISSING_REQUIRED tại vị trí đối tượng, theo thứ tự fields', () => {
  const schema = S({ z: { required: true }, srv: S({ b: { required: true }, a: { required: true } }), y: { required: true } });
  const errs = run({ main: 'q = 1\nsrv {\n  x = 1\n}' }, schema);
  assert.deepEqual(brief(errs), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_MISSING_REQUIRED', 'main', 2, 1],
    ['SEM_MISSING_REQUIRED', 'main', 2, 1],
  ]);
  assert.deepEqual(errs.map((e) => e.message.includes('z')), [true, false, false, false]);
});

test('C: SEM_UNKNOWN_KEY tại token khóa thắng (closed)', () => {
  const schema = S({ a: {} }, { closed: true });
  const errs = run({ main: 'a = 1\nb = 2\nc {\n}\ninclude "o"', o: 'b = 3\nd = 4' }, schema);
  assert.deepEqual(brief(errs), [
    ['SEM_UNKNOWN_KEY', 'o', 1, 1], // b bị include ghi đè (include đứng sau)
    ['SEM_UNKNOWN_KEY', 'main', 3, 1],
    ['SEM_UNKNOWN_KEY', 'o', 2, 1],
  ]);
});

test('C: không closed thì khóa lạ hợp lệ', () => {
  assert.deepEqual(run({ main: 'a = 1\nb = 2' }, S({ a: {} })), []);
});

test('C: thứ tự — required trước, rồi khóa theo thứ tự đối tượng', () => {
  const schema = S({ need: { required: true }, a: { type: 'string' } }, { closed: true });
  const errs = run({ main: 'zz = 1\na = 1' }, schema);
  assert.deepEqual(errs.map((e) => e.code), ['SEM_MISSING_REQUIRED', 'SEM_UNKNOWN_KEY', 'SEM_TYPE_MISMATCH']);
});

test('C: items — từng phần tử tại vị trí phần tử; mảng lồng', () => {
  const schema = S({ xs: { type: 'array', items: { type: 'number' } }, m: { type: 'array', items: { type: 'array', items: { type: 'string' } } } });
  const errs = run({ main: 'xs = [1, "a", 3, null]\nm = [["a"], [1]]' }, schema);
  assert.deepEqual(brief(errs), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 10],
    ['SEM_TYPE_MISMATCH', 'main', 1, 18],
    ['SEM_TYPE_MISMATCH', 'main', 2, 14],
  ]);
});

test('C: items là đối tượng không thể (mảng không chứa khối) — items kiểu object báo lỗi kiểu', () => {
  const errs = run({ main: 'xs = [1]' }, S({ xs: { items: { type: 'object' } } }));
  assert.deepEqual(brief(errs), [['SEM_TYPE_MISMATCH', 'main', 1, 7]]);
});

test('C: type lỗi thì không kiểm sâu hơn', () => {
  const schema = S({ a: { type: 'array', fields: { x: { required: true } }, items: { type: 'string' } } });
  const errs = run({ main: 'a { k = 1 }' }, schema);
  assert.deepEqual(brief(errs), [['SEM_TYPE_MISMATCH', 'main', 1, 1]]);
});

test('C: vị trí đối tượng là Block khởi tạo (không phải Block trộn sau)', () => {
  const schema = S({ s: S({ need: { required: true } }) });
  const errs = run({ main: 'a = 1\ns { x = 1 }\ninclude "o"', o: 's { y = 1 }' }, schema);
  assert.deepEqual(brief(errs), [['SEM_MISSING_REQUIRED', 'main', 2, 1]]);
});

test('C: khóa bị thay bằng giá trị khác rồi thành khối mới → khối mới là vị trí', () => {
  const schema = S({ s: S({ need: { required: true } }) });
  const files = { main: 's { x = 1 }\ninclude "o"\ninclude "p"', o: 's = 5', p: '\n\ns { y = 1 }' };
  assert.deepEqual(brief(run(files, schema)), [['SEM_MISSING_REQUIRED', 'p', 3, 1]]);
});

test('C: gốc thiếu required báo tại entry 1:1', () => {
  const errs = run({ main: 'include "o"', o: 'q = 1' }, S({ need: { required: true } }));
  assert.deepEqual(brief(errs), [['SEM_MISSING_REQUIRED', 'main', 1, 1]]);
});

test('C: chuỗi thuần tham chiếu — vị trí là chuỗi, cho cả giá trị và thứ bên trong', () => {
  const files = { main: 'src = [1, "x"]\nobj { k = 1 }\nn = 5\na = "${src}"\nb = "${obj}"\nc = "${n}"' };
  const schema = S({
    a: { type: 'array', items: { type: 'number' } },
    b: S({ k: { type: 'string' }, need: { required: true } }),
    c: { type: 'string' },
  });
  assert.deepEqual(brief(run(files, schema)), [
    ['SEM_TYPE_MISMATCH', 'main', 4, 5],
    ['SEM_MISSING_REQUIRED', 'main', 5, 5],
    ['SEM_TYPE_MISMATCH', 'main', 5, 5],
    ['SEM_TYPE_MISMATCH', 'main', 6, 5],
  ]);
});

test('C: chuỗi nội suy không thuần là chuỗi vô hướng', () => {
  const errs = run({ main: 'n = 5\na = "v${n}"' }, S({ a: { type: 'string', enum: ['v5'] }, n: { type: 'number' } }));
  assert.deepEqual(errs, []);
  const errs2 = run({ main: 'n = 5\na = "v${n}"' }, S({ a: { enum: ['x'] } }));
  assert.deepEqual(brief(errs2), [['SEM_NOT_IN_ENUM', 'main', 2, 5]]);
});

test('C: không có schema thì không chạy pha C; hợp lệ trả mảng rỗng', () => {
  assert.deepEqual(run({ main: 'a = 1' }), []);
  assert.deepEqual(run({ main: 'a = 1' }, S({ a: { type: 'number', required: true } })), []);
});

test('C: không ném với entry thiếu', () => {
  assert.deepEqual(check({ entry: 'main', files: {} }), []);
});
