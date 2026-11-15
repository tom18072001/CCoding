import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

function run(files, schema, entry = 'main') {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return check(r.program, schema);
}
const pick = (errs) => errs.map((e) => [e.code, e.file, e.line, e.column]);

test('hợp lệ → mảng rỗng, mọi lỗi có đủ trường', () => {
  assert.deepEqual(run({ main: 'a = 1\nb { c = "${a}" }' }), []);
  const errs = run({ main: 'a = 1\na = 2' });
  assert.equal(typeof errs[0].message, 'string');
  assert.ok(errs[0].message.length > 0);
});

// ── Pha A ──
test('SEM_DUPLICATE_KEY: từ lần thứ hai, Assign/Block trùng nhau, khối khác không tính', () => {
  const errs = run({ main: 'a = 1\na = 2\n  a { x = 1 }\nb { k = 1 }\nk = 1\nb = 3' });
  assert.deepEqual(pick(errs), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1],
    ['SEM_DUPLICATE_KEY', 'main', 3, 3],
    ['SEM_DUPLICATE_KEY', 'main', 6, 1],
  ]);
});

test('SEM_DUPLICATE_KEY: tệp include cùng khóa không phải trùng', () => {
  assert.deepEqual(run({ main: 'a = 1\ninclude "b"', b: 'a = 2' }), []);
});

test('SEM_DUPLICATE_CONST', () => {
  const errs = run({ main: 'const c = 1\nconst d = 2\n  const c = 3' });
  assert.deepEqual(pick(errs), [['SEM_DUPLICATE_CONST', 'main', 3, 3]]);
});

test('SEM_INCLUDE_NOT_FOUND (cả include trong khối)', () => {
  const errs = run({ main: 'include "x"\nb { include "y" }' });
  assert.deepEqual(pick(errs), [
    ['SEM_INCLUDE_NOT_FOUND', 'main', 1, 1],
    ['SEM_INCLUDE_NOT_FOUND', 'main', 2, 5],
  ]);
});

test('SEM_INCLUDE_CYCLE: tự include và vòng a→b→a, báo trong tệp chứa include', () => {
  assert.deepEqual(pick(run({ main: 'include "main"' })), [['SEM_INCLUDE_CYCLE', 'main', 1, 1]]);
  const errs = run({ main: 'x = 1\ninclude "b"', b: '\ninclude "main"' });
  assert.deepEqual(pick(errs), [['SEM_INCLUDE_CYCLE', 'b', 2, 1]]);
});

test('include hình thoi không phải vòng', () => {
  const files = {
    main: 'include "b"\ninclude "c"',
    b: 'include "d"',
    c: 'include "d"',
    d: 'z = 1',
  };
  assert.deepEqual(run(files), []);
});

test('thứ tự lỗi pha A: tệp theo tiền thứ tự, trong tệp theo (line, column)', () => {
  const files = {
    main: 'include "b"\ninclude "c"\nq = 1\nq = 2',
    b: 'include "d"\nk = 1\nk = 2',
    c: 'm = 1\nm = 2',
    d: 'n = 1\nn = 2',
  };
  assert.deepEqual(pick(run(files)), [
    ['SEM_DUPLICATE_KEY', 'main', 4, 1],
    ['SEM_DUPLICATE_KEY', 'b', 3, 1],
    ['SEM_DUPLICATE_KEY', 'd', 2, 1],
    ['SEM_DUPLICATE_KEY', 'c', 2, 1],
  ]);
});

test('trong một tệp lỗi được sắp theo (line, column) dù loại khác nhau', () => {
  const errs = run({ main: 'include "zz"\na = 1\nconst c = 1\na = 2\nconst c = 2' });
  assert.deepEqual(pick(errs), [
    ['SEM_INCLUDE_NOT_FOUND', 'main', 1, 1],
    ['SEM_DUPLICATE_KEY', 'main', 4, 1],
    ['SEM_DUPLICATE_CONST', 'main', 5, 1],
  ]);
});

// ── dừng sau pha có lỗi ──
test('pha A có lỗi thì không chạy pha B/C', () => {
  const errs = run({ main: 'a = 1\na = 2\nb = "${nope}"' }, { type: 'object', fields: { a: { type: 'string' } } });
  assert.deepEqual(pick(errs), [['SEM_DUPLICATE_KEY', 'main', 2, 1]]);
});

test('pha B có lỗi thì không chạy pha C', () => {
  const errs = run({ main: 'a = 1\nb = "${nope}"' }, { type: 'object', fields: { a: { type: 'string' } } });
  assert.deepEqual(pick(errs), [['SEM_UNDEFINED_REF', 'main', 2, 6]]);
});

// ── Pha B ──
test('SEM_UNDEFINED_REF: cấu hình, chỉ số, đi xuyên chuỗi, hằng của tệp khác', () => {
  const errs = run({
    main: 'a = [1]\nb = "${a.1}"\nc = "x"\nd = "${c.y}"\ne = "${@k}"\ninclude "o"',
    o: 'const k = 1',
  });
  assert.deepEqual(pick(errs), [
    ['SEM_UNDEFINED_REF', 'main', 2, 6],
    ['SEM_UNDEFINED_REF', 'main', 4, 6],
    ['SEM_UNDEFINED_REF', 'main', 5, 6],
  ]);
});

test('tham chiếu tới khóa khai báo muộn, hằng khai báo sau chỗ dùng đều hợp lệ', () => {
  assert.deepEqual(run({ main: 'a = "${b}${@c}"\nb = 1\nconst c = 2' }), []);
});

test('SEM_CONST_CONFIG_REF ưu tiên hơn UNDEFINED_REF; Ref hằng trong hằng hợp lệ', () => {
  const errs = run({ main: 'const a = "${nope}"\nconst b = "${@a}"\nconst c = ["${x}", "${@b}"]\nx = 1' });
  assert.deepEqual(pick(errs), [
    ['SEM_CONST_CONFIG_REF', 'main', 1, 12],
    ['SEM_CONST_CONFIG_REF', 'main', 3, 13],
  ]);
});

test('SEM_REF_CYCLE: a=${a}, a↔b, x{y=${x}}', () => {
  assert.deepEqual(pick(run({ main: 'a = "${a}"' })), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(pick(run({ main: 'a = "${b}"\nb = "${a}"' })), [
    ['SEM_REF_CYCLE', 'main', 1, 6],
    ['SEM_REF_CYCLE', 'main', 2, 6],
  ]);
  assert.deepEqual(pick(run({ main: 'x {\n  y = "${x}"\n}' })), [['SEM_REF_CYCLE', 'main', 2, 8]]);
});

test('vòng qua mảng và gián tiếp; chuỗi không nằm trong vòng thì không lỗi', () => {
  const errs = run({ main: 'l = ["${m}"]\nm = "${l}"\nn = "${l.0}"' });
  // l.0 -> m -> l -> l.0 ; n chỉ trỏ vào vòng nên không bị lỗi vòng
  assert.deepEqual(pick(errs).map((e) => e[0]), ['SEM_REF_CYCLE', 'SEM_REF_CYCLE']);
  assert.deepEqual(pick(errs).map((e) => e[2]), [1, 2]);
});

test('Ref trong chuỗi bị ghi đè vẫn bị kiểm', () => {
  const errs = run({ main: 'include "b"\na = 1', b: 'a = "${nope}"' });
  assert.deepEqual(pick(errs), [['SEM_UNDEFINED_REF', 'b', 1, 6]]);
  const errs2 = run({ main: 'include "b"\nk = 1', b: 'k = "${missing}"' });
  assert.deepEqual(pick(errs2), [['SEM_UNDEFINED_REF', 'b', 1, 6]]);
});

test('Ref trong mảng: lỗi theo (line, column) trong tệp', () => {
  const errs = run({ main: 'a = ["${p}", "${q}"]\nb = "${r}"' });
  assert.deepEqual(pick(errs), [
    ['SEM_UNDEFINED_REF', 'main', 1, 7],
    ['SEM_UNDEFINED_REF', 'main', 1, 15],
    ['SEM_UNDEFINED_REF', 'main', 2, 6],
  ]);
});

test('thứ tự lỗi pha B qua nhiều tệp theo tiền thứ tự', () => {
  const files = {
    main: 'include "b"\nm = "${m1}"',
    b: 'n = "${n1}"',
  };
  assert.deepEqual(pick(run(files)), [
    ['SEM_UNDEFINED_REF', 'main', 2, 6],
    ['SEM_UNDEFINED_REF', 'b', 1, 6],
  ]);
});

test('SEM_BAD_INTERPOLATION: mảng/đối tượng trong chuỗi không thuần; vô hướng và null được', () => {
  const errs = run({
    main: 'l = [1]\no { k = 1 }\nn = null\ns = "x"\na = "p${l}"\nb = "${o}${n}"\nc = "${n}${s}"\nd = "${l}"\ne = "${@k}-"\nconst k = [1]',
  });
  assert.deepEqual(pick(errs), [
    ['SEM_BAD_INTERPOLATION', 'main', 5, 7],
    ['SEM_BAD_INTERPOLATION', 'main', 6, 6],
    ['SEM_BAD_INTERPOLATION', 'main', 9, 6],
  ]);
});

test('SEM_BAD_INTERPOLATION: đích là chuỗi thuần tham chiếu tới mảng', () => {
  const errs = run({ main: 'l = [1]\nm = "${l}"\nn = "a${m}"' });
  assert.deepEqual(pick(errs), [['SEM_BAD_INTERPOLATION', 'main', 3, 7]]);
});

// ── Pha C ──
const S = (o) => ({ type: 'object', ...o });

test('SEM_TYPE_MISMATCH: vị trí nút giá trị, integer/number/null/array/object', () => {
  const errs = run(
    { main: 'a = "x"\nb = 1.5\nc = 2\nd = null\ne = [1]\nf { }\ng = 3\nh = null\ni = []' },
    S({
      fields: {
        a: { type: 'number' },
        b: { type: 'integer' },
        c: { type: 'number' },
        d: { type: 'null' },
        e: { type: 'object' },
        f: { type: 'array' },
        g: { type: 'null' },
        h: { type: 'object' },
        i: { type: 'array' },
      },
    }),
  );
  assert.deepEqual(pick(errs), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 5],
    ['SEM_TYPE_MISMATCH', 'main', 2, 5],
    ['SEM_TYPE_MISMATCH', 'main', 5, 5],
    ['SEM_TYPE_MISMATCH', 'main', 6, 1],
    ['SEM_TYPE_MISMATCH', 'main', 7, 5],
    ['SEM_TYPE_MISMATCH', 'main', 8, 5],
  ]);
});

test('type any và gốc sai kiểu', () => {
  assert.deepEqual(run({ main: 'a = 1' }, S({ fields: { a: { type: 'any' } } })), []);
  assert.deepEqual(pick(run({ main: 'a = 1' }, { type: 'array' })), [['SEM_TYPE_MISMATCH', 'main', 1, 1]]);
});

test('SEM_NOT_IN_ENUM và dừng không kiểm sâu hơn', () => {
  const errs = run(
    { main: 'a = "z"\nb = 5\nc = "ok"\nd = [1]' },
    S({ fields: { a: { enum: ['x', 'y'] }, b: { type: 'string', enum: [5] }, c: { enum: ['ok'] }, d: { enum: [1] } } }),
  );
  assert.deepEqual(pick(errs), [
    ['SEM_NOT_IN_ENUM', 'main', 1, 5],
    ['SEM_TYPE_MISMATCH', 'main', 2, 5],
  ]);
});

test('SEM_MISSING_REQUIRED tại đối tượng (gốc 1:1, Block khởi tạo), theo thứ tự fields', () => {
  const errs = run(
    { main: 'x = 1\nsrv {\n  a = 1\n}' },
    S({
      fields: {
        z: { required: true },
        x: { required: true },
        y: { required: true },
        srv: { fields: { q: { required: true }, a: { required: true }, p: { required: true } } },
      },
    }),
  );
  assert.deepEqual(pick(errs), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_MISSING_REQUIRED', 'main', 2, 1],
    ['SEM_MISSING_REQUIRED', 'main', 2, 1],
  ]);
  assert.match(errs[0].message + errs[1].message, /z/);
});

test('vị trí đối tượng: Block khởi tạo, bị Assign thay thì Block sau là khởi tạo', () => {
  const errs = run(
    { main: 'include "b"\ninclude "c"\ninclude "d"', b: 'o { a = 1 }', c: 'o = 5', d: '\n\no { b = 1 }' },
    S({ fields: { o: { fields: { c: { required: true } } } } }),
  );
  assert.deepEqual(pick(errs), [['SEM_MISSING_REQUIRED', 'd', 3, 1]]);
});

test('SEM_UNKNOWN_KEY: vị trí khóa thắng, theo thứ tự khóa; closed false thì bỏ qua', () => {
  const files = { main: 'include "b"\nk = 2\nz = 1', b: 'k = 1\nextra = 0' };
  const errs = run(files, S({ closed: true, fields: { z: {} } }));
  assert.deepEqual(pick(errs), [
    ['SEM_UNKNOWN_KEY', 'main', 2, 1],
    ['SEM_UNKNOWN_KEY', 'b', 2, 1],
  ]);
  assert.deepEqual(run(files, S({ fields: { z: {} } })), []);
});

test('thứ tự: required trước, rồi khóa đối tượng (unknown / đệ quy xen kẽ)', () => {
  const errs = run(
    { main: 'u = 1\na = "s"\nb = 2' },
    S({ closed: true, fields: { a: { type: 'number' }, r: { required: true } } }),
  );
  assert.deepEqual(pick(errs), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_UNKNOWN_KEY', 'main', 1, 1],
    ['SEM_TYPE_MISMATCH', 'main', 2, 5],
    ['SEM_UNKNOWN_KEY', 'main', 3, 1],
  ]);
});

test('items: phần tử mảng có vị trí riêng; lồng nhau', () => {
  const errs = run(
    { main: 'l = [1, "x", [2, "y"]]' },
    S({ fields: { l: { type: 'array', items: { type: 'number' } } } }),
  );
  assert.deepEqual(pick(errs), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 9],
    ['SEM_TYPE_MISMATCH', 'main', 1, 14],
  ]);
  const errs2 = run(
    { main: 'l = [1, [2, "y"]]' },
    S({ fields: { l: { items: { type: 'array', items: { type: 'number' } } } } }),
  );
  assert.deepEqual(pick(errs2), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 6],
    ['SEM_TYPE_MISMATCH', 'main', 1, 13],
  ]);
});

test('vị trí lỗi pha C qua ${x}: dùng vị trí chuỗi cho cả giá trị và bên trong', () => {
  const src = [
    'src = "abc"', // 1
    'arr = [1, "x"]', // 2
    'obj { k = 1 }', // 3
    'p = "${src}"', // 4
    'q = "${arr}"', // 5
    'r = "${obj}"', // 6
    's = "${p}"', // 7
  ].join('\n');
  const errs = run(
    { main: src },
    S({
      fields: {
        p: { type: 'number' },
        q: { items: { type: 'number' } },
        r: { closed: true, fields: { z: { required: true } } },
        s: { type: 'integer' },
      },
    }),
  );
  assert.deepEqual(pick(errs), [
    ['SEM_TYPE_MISMATCH', 'main', 4, 5],
    ['SEM_TYPE_MISMATCH', 'main', 5, 5],
    ['SEM_MISSING_REQUIRED', 'main', 6, 5],
    ['SEM_UNKNOWN_KEY', 'main', 6, 5],
    ['SEM_TYPE_MISMATCH', 'main', 7, 5],
  ]);
});

test('chuỗi không thuần tham chiếu được đánh giá thành chuỗi khi kiểm kiểu/enum', () => {
  const errs = run(
    { main: 'n = 5\na = "v${n}"\nb = "${n}"' },
    S({ fields: { a: { enum: ['v5'] }, b: { type: 'integer', enum: [5] } } }),
  );
  assert.deepEqual(errs, []);
});

test('ref hằng trỏ vào mảng hằng: lỗi dùng vị trí chuỗi', () => {
  const errs = run(
    { main: 'const l = [1, "a"]\nx = "${@l.1}"' },
    S({ fields: { x: { type: 'number' } } }),
  );
  assert.deepEqual(pick(errs), [['SEM_TYPE_MISMATCH', 'main', 2, 5]]);
});
