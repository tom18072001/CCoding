import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

function run(files, schema, entry = 'main') {
  const r = parseProject(files, entry);
  assert.ok(r.ok, JSON.stringify(r.error));
  return check(r.program, schema).map((e) => `${e.code}@${e.file}:${e.line}:${e.column}`);
}

test('hợp lệ → mảng rỗng', () => {
  assert.deepEqual(run({ main: 'const e = "p"\na = "${@e}"\nb { c = "${a}" }' }), []);
});

test('pha A: SEM_DUPLICATE_KEY từ lần thứ hai, Assign/Block cùng khóa, khối khác không trùng', () => {
  const src = 'a = 1\na = 2\na { x = 1 }\nb { a = 1 a = 2 }\nc { a = 1 }';
  assert.deepEqual(run({ main: src }), [
    'SEM_DUPLICATE_KEY@main:2:1',
    'SEM_DUPLICATE_KEY@main:3:1',
    'SEM_DUPLICATE_KEY@main:4:11',
  ]);
});

test('pha A: khóa giống nhau qua include không phải trùng', () => {
  assert.deepEqual(run({ main: 'include "b"\na = 1', b: 'a = 2' }), []);
});

test('pha A: SEM_DUPLICATE_CONST', () => {
  assert.deepEqual(run({ main: 'const x = 1\nconst y = 2\nconst x = 3' }), ['SEM_DUPLICATE_CONST@main:3:1']);
});

test('pha A: SEM_INCLUDE_NOT_FOUND (cả trong khối)', () => {
  assert.deepEqual(run({ main: 'include "zz"\nk { include "yy" }' }), [
    'SEM_INCLUDE_NOT_FOUND@main:1:1',
    'SEM_INCLUDE_NOT_FOUND@main:2:5',
  ]);
});

test('pha A: SEM_INCLUDE_CYCLE gồm cả tự include, hình thoi không phải vòng', () => {
  assert.deepEqual(run({ main: 'include "main"' }), ['SEM_INCLUDE_CYCLE@main:1:1']);
  assert.deepEqual(run({ main: 'include "a"', a: 'include "b"', b: 'include "a"' }), ['SEM_INCLUDE_CYCLE@b:1:1']);
  assert.deepEqual(
    run({ main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'x = 1' }),
    [],
  );
});

test('pha A: gom lỗi theo tệp theo tiền thứ tự, trong tệp sắp theo vị trí', () => {
  const files = {
    main: 'include "b"\ninclude "c"\nz = 1\nz = 2',
    b: 'q = 1\nq = 2\ninclude "nope"',
    c: 'r = 1\nr = 2',
  };
  assert.deepEqual(run(files), [
    'SEM_DUPLICATE_KEY@main:4:1',
    'SEM_DUPLICATE_KEY@b:2:1',
    'SEM_INCLUDE_NOT_FOUND@b:3:1',
    'SEM_DUPLICATE_KEY@c:2:1',
  ]);
});

test('pha A: trong tệp sắp theo (line, column) dù loại lỗi khác nhau', () => {
  assert.deepEqual(run({ main: 'include "zz"\nconst c = 1\nconst c = 2\na = 1\na = 2' }), [
    'SEM_INCLUDE_NOT_FOUND@main:1:1',
    'SEM_DUPLICATE_CONST@main:3:1',
    'SEM_DUPLICATE_KEY@main:5:1',
  ]);
  assert.deepEqual(run({ main: 'a = 1\ninclude "zz"\nconst c = 1\nconst c = 2\nb { x = 1 x = 2 }\na = 3' }), [
    'SEM_INCLUDE_NOT_FOUND@main:2:1',
    'SEM_DUPLICATE_CONST@main:4:1',
    'SEM_DUPLICATE_KEY@main:5:11',
    'SEM_DUPLICATE_KEY@main:6:1',
  ]);
});

test('pha A có lỗi thì dừng, không chạy pha B', () => {
  assert.deepEqual(run({ main: 'a = 1\na = 2\nb = "${nope}"' }), ['SEM_DUPLICATE_KEY@main:2:1']);
});

test('pha B: SEM_UNDEFINED_REF (cấu hình, hằng, hằng tệp khác, qua chuỗi, ngoài mảng)', () => {
  const files = {
    main: 'include "b"\nconst c = 1\na = "${x}"\nb = "${@d}"\ns = "t"\nu = "${s.0}"\nl = [1]\nv = "${l.1}"\nw = "${l.x}"\nk = "${@c}"',
    b: 'const d = 1',
  };
  assert.deepEqual(run(files), [
    'SEM_UNDEFINED_REF@main:3:6',
    'SEM_UNDEFINED_REF@main:4:6',
    'SEM_UNDEFINED_REF@main:6:6',
    'SEM_UNDEFINED_REF@main:8:6',
    'SEM_UNDEFINED_REF@main:9:6',
  ]);
});

test('pha B: hằng khai báo sau chỗ dùng vẫn thấy; tham chiếu tới null tồn tại', () => {
  assert.deepEqual(run({ main: 'a = "${@c}"\nconst c = 1\nn = null\nm = "${n}"' }), []);
});

test('pha B: SEM_CONST_CONFIG_REF ưu tiên trước undefined, trong mảng const', () => {
  assert.deepEqual(run({ main: 'const c = ["${nope}", "${@c2}"]\nconst c2 = "${a}"\na = 1' }), [
    'SEM_CONST_CONFIG_REF@main:1:13',
    'SEM_CONST_CONFIG_REF@main:2:13',
  ]);
});

test('pha B: SEM_REF_CYCLE — tự tham chiếu, hai chiều, tổ tiên, undefined ưu tiên', () => {
  assert.deepEqual(run({ main: 'a = "${a}"' }), ['SEM_REF_CYCLE@main:1:6']);
  assert.deepEqual(run({ main: 'a = "${b}"\nb = "${a}"' }), ['SEM_REF_CYCLE@main:1:6', 'SEM_REF_CYCLE@main:2:6']);
  assert.deepEqual(run({ main: 'x { y = "${x}" }' }), ['SEM_REF_CYCLE@main:1:10']);
  assert.deepEqual(run({ main: 'a = "${a.q}"' }), ['SEM_UNDEFINED_REF@main:1:6']);
});

test('pha B: chuỗi bị ghi đè không tạo vòng; vòng qua hằng; một chiều không phải vòng', () => {
  assert.deepEqual(run({ main: 'include "b"\na = 1', b: 'a = "${a}"' }), []);
  assert.deepEqual(run({ main: 'const p = "${@q}"\nconst q = "${@p}"' }), [
    'SEM_REF_CYCLE@main:1:12',
    'SEM_REF_CYCLE@main:2:12',
  ]);
  assert.deepEqual(run({ main: 'a = "${b}"\nb = 1' }), []);
});

test('pha B: vòng qua mảng', () => {
  assert.deepEqual(run({ main: 'l = ["${l}"]' }), ['SEM_REF_CYCLE@main:1:7']);
});

test('pha B: SEM_BAD_INTERPOLATION chỉ với chuỗi không thuần tham chiếu', () => {
  const src = 'o { k = 1 }\nl = [1]\na = "${o}"\nb = "x${o}"\nc = "${l}${l}"\nd = "${l}"\ne = "${a}"\nf = "p${e}"\ng = "${l.0}x"';
  assert.deepEqual(run({ main: src }), [
    'SEM_BAD_INTERPOLATION@main:4:7',
    'SEM_BAD_INTERPOLATION@main:5:6',
    'SEM_BAD_INTERPOLATION@main:5:10',
    'SEM_BAD_INTERPOLATION@main:8:7',
  ]);
});

test('pha B: gom theo tệp (tiền thứ tự), không chạy pha C khi B lỗi', () => {
  const files = { main: 'include "b"\nx = "${m}"', b: 'y = "${n}"' };
  assert.deepEqual(run(files, { type: 'object', fields: { x: { type: 'number' } } }), [
    'SEM_UNDEFINED_REF@main:2:6',
    'SEM_UNDEFINED_REF@b:1:6',
  ]);
});

// ---- Pha C
const S = (fields, extra = {}) => ({ type: 'object', fields, ...extra });

test('pha C: không có schema thì không chạy', () => {
  assert.deepEqual(run({ main: 'a = 1' }), []);
});

test('pha C: TYPE_MISMATCH tại nút giá trị, dừng sâu; integer/number/null', () => {
  const src = 'a = "x"\nb = 1.5\nc = 2\nd = null\ne = [1,\n "y"]\nf { g = 1 }';
  const schema = S({
    a: { type: 'number' }, b: { type: 'integer' }, c: { type: 'integer' }, d: { type: 'null' },
    e: { type: 'array', items: { type: 'number' } },
    f: { type: 'array', fields: { h: { required: true } } },
  });
  assert.deepEqual(run({ main: src }, schema), [
    'SEM_TYPE_MISMATCH@main:1:5',
    'SEM_TYPE_MISMATCH@main:2:5',
    'SEM_TYPE_MISMATCH@main:6:2',
    'SEM_TYPE_MISMATCH@main:7:1',
  ]);
  assert.deepEqual(run({ main: 'a = null\nb = [1]\nc { }' }, S({
    a: { type: 'object' }, b: { type: 'object' }, c: { type: 'array' },
  })), ['SEM_TYPE_MISMATCH@main:1:5', 'SEM_TYPE_MISMATCH@main:2:5', 'SEM_TYPE_MISMATCH@main:3:1']);
  assert.deepEqual(run({ main: 'a = 1' }, { type: 'array' }), ['SEM_TYPE_MISMATCH@main:1:1']);
});

test('pha C: NOT_IN_ENUM', () => {
  const schema = S({ m: { enum: ['a', 'b'] }, n: { enum: [1, null] }, k: { type: 'any', enum: ['z'] } });
  assert.deepEqual(run({ main: 'm = "c"\nn = null\nk = "z"' }, schema), ['SEM_NOT_IN_ENUM@main:1:5']);
  assert.deepEqual(run({ main: 'm = "a"\nn = 2' }, schema), ['SEM_NOT_IN_ENUM@main:2:5']);
});

test('pha C: MISSING_REQUIRED theo thứ tự fields tại vị trí đối tượng; gốc 1:1', () => {
  const schema = S({
    z: { required: true }, a: { required: true }, o: S({ q: { required: true } }, { required: true }),
  });
  assert.deepEqual(run({ main: '\nb = 1\no { }' }, schema), [
    'SEM_MISSING_REQUIRED@main:1:1',
    'SEM_MISSING_REQUIRED@main:1:1',
    'SEM_MISSING_REQUIRED@main:3:1',
  ]);
  // vị trí là Block khởi tạo, không phải Block trộn thêm
  assert.deepEqual(run({ main: 'include "i"\n\no { y = 1 }', i: 'o { x = 1 }' }, S({ o: S({ q: { required: true } }) })), [
    'SEM_MISSING_REQUIRED@i:1:1',
  ]);
  // khóa bị thay bằng giá trị khác rồi tạo Block mới: vị trí Block mới
  assert.deepEqual(run({
    main: 'include "i1"\ninclude "i2"\no { y = 1 }', i1: 'o { x = 1 }', i2: 'o = 5',
  }, S({ o: S({ q: { required: true } }) })), [
    'SEM_MISSING_REQUIRED@main:3:1',
  ]);
});

test('pha C: Block khởi tạo nằm trong tệp include; gốc luôn là entry 1:1', () => {
  assert.deepEqual(run({ main: 'include "b"', b: 'o { x = 1 }' }, S({ o: S({ q: { required: true } }) })), [
    'SEM_MISSING_REQUIRED@b:1:1',
  ]);
  assert.deepEqual(run({ main: 'include "b"', b: 'o = 1' }, S({ r: { required: true } })), [
    'SEM_MISSING_REQUIRED@main:1:1',
  ]);
});

test('pha C: UNKNOWN_KEY tại khóa thắng khi closed, theo thứ tự khóa; không closed thì bỏ qua', () => {
  const files = { main: 'include "i"\nb = 3\nc { x = 1 }', i: 'a = 1\nb = 2' };
  assert.deepEqual(run(files, S({ a: {} }, { closed: true })), [
    'SEM_UNKNOWN_KEY@main:2:1',
    'SEM_UNKNOWN_KEY@main:3:1',
  ]);
  assert.deepEqual(run(files, S({ a: {} })), []);
});

test('pha C: MISSING_REQUIRED trước rồi mới tới khóa của đối tượng (UNKNOWN_KEY, đệ quy)', () => {
  const src = 'x { u = 1\n v = "s" }';
  const schema = S({ x: S({ v: { type: 'number' }, w: { required: true } }, { closed: true }), r: { required: true } });
  assert.deepEqual(run({ main: src }, schema), [
    'SEM_MISSING_REQUIRED@main:1:1', // r tại gốc
    'SEM_MISSING_REQUIRED@main:1:1', // w tại x
    'SEM_UNKNOWN_KEY@main:1:5',
    'SEM_TYPE_MISMATCH@main:2:6',
  ]);
});

test('pha C: phần tử mảng có vị trí riêng; items trên mảng lồng', () => {
  const src = 'l = [\n 1,\n "a",\n [true]]';
  assert.deepEqual(run({ main: src }, S({ l: { type: 'array', items: { type: 'number' } } })), [
    'SEM_TYPE_MISMATCH@main:3:2',
    'SEM_TYPE_MISMATCH@main:4:2',
  ]);
  assert.deepEqual(
    run({ main: src }, S({ l: { items: { type: 'array', items: { type: 'number' } } } })),
    ['SEM_TYPE_MISMATCH@main:2:2', 'SEM_TYPE_MISMATCH@main:3:2', 'SEM_TYPE_MISMATCH@main:4:3'],
  );
});

test('pha C: giá trị từ chuỗi thuần tham chiếu mang vị trí chuỗi, kể cả bên trong', () => {
  const src = 'src { k = 1\n  w = "s" }\nlst = [1, "a"]\nref = "${src}"\nlref = "${lst}"\nnum = "${src.k}"\ntxt = "n${src.k}"';
  const schema = S({
    ref: S({ k: { type: 'string' }, w: { type: 'number' }, extra: { required: true } }, { closed: true }),
    lref: { type: 'array', items: { type: 'number' } },
    num: { type: 'string' },
    txt: { type: 'number' },
  });
  assert.deepEqual(run({ main: src }, schema), [
    'SEM_MISSING_REQUIRED@main:4:7',
    'SEM_TYPE_MISMATCH@main:4:7',
    'SEM_TYPE_MISMATCH@main:4:7',
    'SEM_TYPE_MISMATCH@main:5:8',
    'SEM_TYPE_MISMATCH@main:6:7',
    'SEM_TYPE_MISMATCH@main:7:7',
  ]);
  assert.deepEqual(run({ main: 'src { k = 1 }\nref = "${src}"' }, S({ ref: S({}, { closed: true }) })), [
    'SEM_UNKNOWN_KEY@main:2:7',
  ]);
});

test('pha C: lỗi theo thứ tự khóa của cấu hình hợp nhất (khóa ghi đè giữ chỗ cũ)', () => {
  const src = { main: 'include "i"\na = 1\nb = "x"', i: 'b = 1' };
  assert.deepEqual(run(src, S({ a: { type: 'string' }, b: { type: 'number' } })), [
    'SEM_TYPE_MISMATCH@main:3:5',
    'SEM_TYPE_MISMATCH@main:2:5',
  ]);
});
