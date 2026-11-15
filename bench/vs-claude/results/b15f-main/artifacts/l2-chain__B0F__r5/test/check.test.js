import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, schema, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return check(p.program, schema).map(({ code, file, line, column }) => ({ code, file, line, column }));
};
const E = (code, file, line, column) => ({ code, file, line, column });
const S = (fields, extra = {}) => ({ type: 'object', fields, ...extra });

test('hợp lệ → mảng rỗng', () => {
  assert.deepEqual(run({ main: 'const r = "x"\na = "${@r}"\nb { c = "${a}" }' }), []);
});

// ----- Pha A -----
test('A: DUPLICATE_KEY báo mọi lần sau lần đầu, Assign/Block cùng khóa', () => {
  assert.deepEqual(run({ main: 'a = 1\na = 2\na { }\nb { x = 1 }\nb = 3\nb = 4' }), [
    E('SEM_DUPLICATE_KEY', 'main', 2, 1), E('SEM_DUPLICATE_KEY', 'main', 3, 1),
    E('SEM_DUPLICATE_KEY', 'main', 5, 1), E('SEM_DUPLICATE_KEY', 'main', 6, 1),
  ]);
});

test('A: cùng khóa ở khối khác hoặc tệp khác không trùng', () => {
  assert.deepEqual(run({ main: 'a = 1\nb { a = 1 }\ninclude "o"', o: 'a = 2' }), []);
});

test('A: DUPLICATE_CONST', () => {
  assert.deepEqual(run({ main: 'const a = 1\nconst b = 2\n  const a = 3' }), [E('SEM_DUPLICATE_CONST', 'main', 3, 3)]);
});

test('A: INCLUDE_NOT_FOUND (cả trong khối)', () => {
  assert.deepEqual(run({ main: 'include "x"\nb { include "y" }' }), [
    E('SEM_INCLUDE_NOT_FOUND', 'main', 1, 1), E('SEM_INCLUDE_NOT_FOUND', 'main', 2, 5),
  ]);
});

test('A: INCLUDE_CYCLE gồm tự include; hình thoi không phải vòng', () => {
  assert.deepEqual(run({ main: 'include "main"' }), [E('SEM_INCLUDE_CYCLE', 'main', 1, 1)]);
  assert.deepEqual(run({ main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'x = 1' }), []);
  assert.deepEqual(run({ main: 'include "b"', b: 'k = 1\ninclude "main"' }), [E('SEM_INCLUDE_CYCLE', 'b', 2, 1)]);
});

test('A: thứ tự lỗi theo tệp (tiền thứ tự), trong tệp theo vị trí', () => {
  const files = {
    main: 'x = 1\nx = 2\ninclude "b"\ninclude "c"\ny = 1\ny = 2',
    b: 'q = 1\nq = 2\ninclude "d"',
    c: 'z = 1\nz = 2',
    d: 'const k = 1\nconst k = 2',
  };
  assert.deepEqual(run(files), [
    E('SEM_DUPLICATE_KEY', 'main', 2, 1), E('SEM_DUPLICATE_KEY', 'main', 6, 1),
    E('SEM_DUPLICATE_KEY', 'b', 2, 1),
    E('SEM_DUPLICATE_CONST', 'd', 2, 1),
    E('SEM_DUPLICATE_KEY', 'c', 2, 1),
  ]);
});

test('A: sắp theo (line, column) trong tệp, lẫn các loại lỗi', () => {
  assert.deepEqual(run({ main: 'a = 1\ninclude "nope"\na = 2\nconst c = 1\nconst c = 2' }), [
    E('SEM_INCLUDE_NOT_FOUND', 'main', 2, 1), E('SEM_DUPLICATE_KEY', 'main', 3, 1), E('SEM_DUPLICATE_CONST', 'main', 5, 1),
  ]);
});

test('A có lỗi thì dừng, không chạy pha B', () => {
  assert.deepEqual(run({ main: 'a = 1\na = 2\nb = "${zzz}"' }), [E('SEM_DUPLICATE_KEY', 'main', 2, 1)]);
});

// ----- Pha B -----
test('B: UNDEFINED_REF tại vị trí $, kể cả trong mảng và hằng khác tệp', () => {
  assert.deepEqual(run({ main: 'a = ["x", "p${nope}"]\nb = "${@c}"\ninclude "o"', o: 'const c = 1' }), [
    E('SEM_UNDEFINED_REF', 'main', 1, 13), E('SEM_UNDEFINED_REF', 'main', 2, 6),
  ]);
});

test('B: đi xuyên chuỗi, chỉ số mảng sai/ngoài phạm vi; hằng khai báo muộn hợp lệ', () => {
  const src = 'a = "s"\nb = "${a.x}"\nl = [1]\nc = "${l.x}"\nd = "${l.1}"\ne = "${@k}"\nconst k = 1';
  assert.deepEqual(run({ main: src }), [
    E('SEM_UNDEFINED_REF', 'main', 2, 6), E('SEM_UNDEFINED_REF', 'main', 4, 6), E('SEM_UNDEFINED_REF', 'main', 5, 6),
  ]);
});

test('B: CONST_CONFIG_REF ưu tiên hơn UNDEFINED_REF, mỗi Ref một lỗi', () => {
  assert.deepEqual(run({ main: 'a = 1\nconst c = "${a}"\nconst d = "${nope}${@c}"' }), [
    E('SEM_CONST_CONFIG_REF', 'main', 2, 12), E('SEM_CONST_CONFIG_REF', 'main', 3, 12),
  ]);
});

test('B: REF_CYCLE — tự tham chiếu, cặp, tổ tiên', () => {
  assert.deepEqual(run({ main: 'a = "${a}"' }), [E('SEM_REF_CYCLE', 'main', 1, 6)]);
  assert.deepEqual(run({ main: 'a = "${b}"\nb = "${a}"' }), [E('SEM_REF_CYCLE', 'main', 1, 6), E('SEM_REF_CYCLE', 'main', 2, 6)]);
  assert.deepEqual(run({ main: 'x {\n  y = "${x}"\n}' }), [E('SEM_REF_CYCLE', 'main', 2, 8)]);
});

test('B: định nghĩa bị ghi đè không tạo vòng nhưng Ref của nó vẫn được xét', () => {
  assert.deepEqual(run({ main: 'include "o"\na = 1', o: 'a = "${a}"\nb = "${nope}"' }), [E('SEM_UNDEFINED_REF', 'o', 2, 6)]);
  assert.deepEqual(run({ main: 'include "o"\na = 1', o: 'a = "${a}"' }), []);
});

test('B: BAD_INTERPOLATION chỉ khi không thuần tham chiếu', () => {
  const src = 'l = [1]\no { k = 1 }\na = "${l}"\nb = "x${l}"\nc = "${o}${o}"\nd = "${o.k}${l.0}"\ne = "${o}"';
  assert.deepEqual(run({ main: src }), [
    E('SEM_BAD_INTERPOLATION', 'main', 4, 7),
    E('SEM_BAD_INTERPOLATION', 'main', 5, 6), E('SEM_BAD_INTERPOLATION', 'main', 5, 10),
  ]);
});

test('B: thứ tự lỗi giữa các tệp và trong tệp', () => {
  const files = { main: 'include "o"\nx = "${@c}-${zz}"\nconst c = "k"', o: 'q = "${nope}"\nr = "${r}"' };
  assert.deepEqual(run(files), [
    E('SEM_UNDEFINED_REF', 'main', 2, 12), E('SEM_UNDEFINED_REF', 'o', 1, 6), E('SEM_REF_CYCLE', 'o', 2, 6),
  ]);
});

test('B có lỗi thì dừng, không chạy pha C', () => {
  assert.deepEqual(run({ main: 'a = "${b}"' }, S({ a: { type: 'number' } })), [E('SEM_UNDEFINED_REF', 'main', 1, 6)]);
});

// ----- Pha C -----
test('C: không có schema thì bỏ qua', () => {
  assert.deepEqual(run({ main: 'a = 1' }), []);
});

test('C: TYPE_MISMATCH tại nút giá trị (không phải khóa), Block tại khóa', () => {
  const src = 'a = "s"\nb = 1.5\nc = null\nd = [1]\ne = 1\nf { }\ng = 2';
  const schema = S({
    a: { type: 'number' }, b: { type: 'integer' }, c: { type: 'object' }, d: { type: 'object' },
    e: { type: 'number' }, f: { type: 'array' }, g: { type: 'null' },
  });
  assert.deepEqual(run({ main: src }, schema), [
    E('SEM_TYPE_MISMATCH', 'main', 1, 5), E('SEM_TYPE_MISMATCH', 'main', 2, 5), E('SEM_TYPE_MISMATCH', 'main', 3, 5),
    E('SEM_TYPE_MISMATCH', 'main', 4, 5), E('SEM_TYPE_MISMATCH', 'main', 6, 1), E('SEM_TYPE_MISMATCH', 'main', 7, 5),
  ]);
});

test('C: type any / không type bỏ qua kiểu; null khớp null; gốc sai kiểu tại 1:1', () => {
  assert.deepEqual(run({ main: 'a = null\nb = [1]' }, S({ a: { type: 'null' }, b: { type: 'any' } })), []);
  assert.deepEqual(run({ main: 'a = 1' }, { type: 'array' }), [E('SEM_TYPE_MISMATCH', 'main', 1, 1)]);
});

test('C: NOT_IN_ENUM và TYPE_MISMATCH không kiểm sâu hơn', () => {
  const src = 'a = "x"\nb = [1, 2]\nc { z = 1 }';
  const schema = S({
    a: { enum: ['y'] },
    b: { type: 'object', items: { type: 'string' } },
    c: { type: 'array', fields: { q: { required: true } } },
  });
  assert.deepEqual(run({ main: src }, schema), [
    E('SEM_NOT_IN_ENUM', 'main', 1, 5), E('SEM_TYPE_MISMATCH', 'main', 2, 5), E('SEM_TYPE_MISMATCH', 'main', 3, 1),
  ]);
});

test('C: items — vị trí phần tử mảng', () => {
  assert.deepEqual(run({ main: 'a = [1,\n  "x", [2]]' }, S({ a: { type: 'array', items: { type: 'number' } } })), [
    E('SEM_TYPE_MISMATCH', 'main', 2, 3), E('SEM_TYPE_MISMATCH', 'main', 2, 8),
  ]);
});

test('C: MISSING_REQUIRED theo thứ tự fields tại vị trí đối tượng; UNKNOWN_KEY tại khóa', () => {
  const src = 'x = 1\ns {\n  k = 1\n  w { }\n}';
  const schema = S({
    z: { required: true },
    s: { type: 'object', closed: true, fields: { m: { required: true }, a: { required: true }, w: { type: 'object' } } },
    y: { required: true },
  }, { closed: true });
  assert.deepEqual(run({ main: src }, schema), [
    E('SEM_MISSING_REQUIRED', 'main', 1, 1), E('SEM_MISSING_REQUIRED', 'main', 1, 1),
    E('SEM_UNKNOWN_KEY', 'main', 1, 1),
    E('SEM_MISSING_REQUIRED', 'main', 2, 1), E('SEM_MISSING_REQUIRED', 'main', 2, 1),
    E('SEM_UNKNOWN_KEY', 'main', 3, 3),
  ]);
});

test('C: đối tượng hợp nhất — vị trí Block khởi tạo, khóa thắng ở Block cuối', () => {
  const files = { main: 'include "o"\no { b = 1 }\ninclude "p"', o: 'o { a = 1 }\nz = 1', p: 'o { c = 2 }' };
  const schema = S({ o: { type: 'object', closed: true, fields: { a: { type: 'number' }, q: { required: true } } } });
  assert.deepEqual(run(files, schema), [
    E('SEM_MISSING_REQUIRED', 'o', 1, 1),
    E('SEM_UNKNOWN_KEY', 'main', 2, 5), E('SEM_UNKNOWN_KEY', 'p', 1, 5),
  ]);
});

test('C: chuỗi thuần tham chiếu — vị trí chuỗi cho giá trị và nội dung bên trong', () => {
  const src = 'src { n = "s"\n  l = [1] }\nt = "${src}"\nu = "${src.l}"\nv = "${src.n}"';
  const schema = S({
    src: { type: 'object' },
    t: { type: 'object', fields: { n: { type: 'number' }, l: { type: 'array', items: { type: 'string' } }, k: { required: true } } },
    u: { type: 'array', items: { type: 'string' } },
    v: { type: 'number' },
  });
  assert.deepEqual(run({ main: src }, schema), [
    E('SEM_MISSING_REQUIRED', 'main', 3, 5),
    E('SEM_TYPE_MISMATCH', 'main', 3, 5), E('SEM_TYPE_MISMATCH', 'main', 3, 5),
    E('SEM_TYPE_MISMATCH', 'main', 4, 5), E('SEM_TYPE_MISMATCH', 'main', 5, 5),
  ]);
});

test('C: enum so sánh === trên giá trị đã nội suy', () => {
  assert.deepEqual(run({ main: 'p = 80\nq = "${p}"\ns = "v${p}"' }, S({ q: { enum: [80] }, s: { enum: ['v80'] } })), []);
  assert.deepEqual(run({ main: 'p = 80\nq = "${p}"' }, S({ q: { enum: ['80'] } })), [E('SEM_NOT_IN_ENUM', 'main', 2, 5)]);
});
