import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

function run(files, schema, entry = 'main') {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return check(r.program, schema);
}
const brief = (errs) => errs.map((e) => `${e.code}@${e.file}:${e.line}:${e.column}`);

test('hợp lệ → mảng rỗng', () => {
  assert.deepEqual(run({ main: 'const c = "x"\na = "${@c}"\nb { c = "${a}" }' }), []);
});

// ---------- Pha A ----------
test('A: SEM_DUPLICATE_KEY — lần 2, 3; Assign và Block cùng khóa', () => {
  const errs = run({ main: 'a = 1\na = 2\na { }\nb { x = 1 }\nb = 3\nx { x = 1 x = 2 }' });
  assert.deepEqual(brief(errs), [
    'SEM_DUPLICATE_KEY@main:2:1',
    'SEM_DUPLICATE_KEY@main:3:1',
    'SEM_DUPLICATE_KEY@main:5:1',
    'SEM_DUPLICATE_KEY@main:6:11',
  ]);
});

test('A: khóa giống nhau ở khối/tệp khác nhau không trùng', () => {
  const errs = run({ main: 'a = 1\nb { a = 1 }\ninclude "o"', o: 'a = 2\nb { a = 3 }' });
  assert.deepEqual(errs, []);
});

test('A: SEM_DUPLICATE_CONST', () => {
  const errs = run({ main: 'const a = 1\nconst b = 2\nconst a = 3' });
  assert.deepEqual(brief(errs), ['SEM_DUPLICATE_CONST@main:3:1']);
});

test('A: SEM_INCLUDE_NOT_FOUND', () => {
  const errs = run({ main: 'x {\n  include "nope"\n}' });
  assert.deepEqual(brief(errs), ['SEM_INCLUDE_NOT_FOUND@main:2:3']);
});

test('A: SEM_INCLUDE_CYCLE (tự include, vòng a→b→a)', () => {
  assert.deepEqual(brief(run({ main: 'include "main"' })), ['SEM_INCLUDE_CYCLE@main:1:1']);
  const errs = run({ main: 'include "b"', b: 'x = 1\ninclude "main"' });
  assert.deepEqual(brief(errs), ['SEM_INCLUDE_CYCLE@b:2:1']);
});

test('A: include hình thoi không phải vòng', () => {
  const errs = run({
    main: 'include "b"\ninclude "c"',
    b: 'include "d"',
    c: 'include "d"',
    d: 'x = 1',
  });
  assert.deepEqual(errs, []);
});

test('A: lỗi gom theo tệp theo thứ tự thăm tiền thứ tự, trong tệp sắp theo vị trí', () => {
  const errs = run({
    main: 'include "b"\ninclude "c"\nz = 1\nz = 2',
    b: 'include "d"\nq = 1\nq = 2',
    c: 'k = 1\nk = 2',
    d: 'include "missing"',
  });
  assert.deepEqual(brief(errs), [
    'SEM_DUPLICATE_KEY@main:4:1',
    'SEM_DUPLICATE_KEY@b:3:1',
    'SEM_INCLUDE_NOT_FOUND@d:1:1',
    'SEM_DUPLICATE_KEY@c:2:1',
  ]);
});

test('A: dừng sau pha A, không chạy pha B/C', () => {
  const errs = run({ main: 'a = 1\na = 2\nb = "${nope}"' }, { type: 'object', fields: { a: { type: 'string' } } });
  assert.deepEqual(brief(errs), ['SEM_DUPLICATE_KEY@main:2:1']);
});

// ---------- Pha B ----------
test('B: SEM_UNDEFINED_REF (cấu hình, hằng khác tệp, chỉ số xấu, đi xuyên chuỗi)', () => {
  const errs = run({
    main: 'a = "${zz}"\nl = [1]\nb = "${l.1}"\nc = "${l.x}"\nd = "${@k}"\ns = "t"\ne = "${s.x}"\ninclude "o"',
    o: 'const k = 1',
  });
  assert.deepEqual(brief(errs), [
    'SEM_UNDEFINED_REF@main:1:6',
    'SEM_UNDEFINED_REF@main:3:6',
    'SEM_UNDEFINED_REF@main:4:6',
    'SEM_UNDEFINED_REF@main:5:6',
    'SEM_UNDEFINED_REF@main:7:6',
  ]);
});

test('B: hằng khai báo sau chỗ dùng vẫn hợp lệ; null là tồn tại', () => {
  assert.deepEqual(run({ main: 'a = "${@c}"\nn = null\nm = "${n}"\nconst c = [1]' }), []);
});

test('B: SEM_CONST_CONFIG_REF ưu tiên trước UNDEFINED_REF', () => {
  const errs = run({ main: 'const a = "${nope}"\nconst b = "${@a}-${x}"\nx = 1' });
  assert.deepEqual(brief(errs), ['SEM_CONST_CONFIG_REF@main:1:12', 'SEM_CONST_CONFIG_REF@main:2:18']);
});

test('B: mọi Ref trong chuỗi bị ghi đè, trong mảng, trong const đều được xét', () => {
  const errs = run({
    main: 'include "o"\na = 1\nl = ["${x2}", ["${x3}"]]\nconst c = "${@x4}"',
    o: 'a = "${x1}"',
  });
  assert.deepEqual(brief(errs), [
    'SEM_UNDEFINED_REF@main:3:7',
    'SEM_UNDEFINED_REF@main:3:17',
    'SEM_UNDEFINED_REF@main:4:12',
    'SEM_UNDEFINED_REF@o:1:6',
  ]);
});

test('B: SEM_REF_CYCLE — tự tham chiếu, hai chiều, tổ tiên', () => {
  assert.deepEqual(brief(run({ main: 'a = "${a}"' })), ['SEM_REF_CYCLE@main:1:6']);
  assert.deepEqual(brief(run({ main: 'a = "${b}"\nb = "${a}"' })), ['SEM_REF_CYCLE@main:1:6', 'SEM_REF_CYCLE@main:2:6']);
  assert.deepEqual(brief(run({ main: 'x {\n  y = "${x}"\n}' })), ['SEM_REF_CYCLE@main:2:8']);
});

test('B: vòng qua mảng và qua const', () => {
  assert.deepEqual(brief(run({ main: 'l = ["${l}"]' })), ['SEM_REF_CYCLE@main:1:7']);
  assert.deepEqual(brief(run({ main: 'const a = "${@b}"\nconst b = "${@a}"' })), [
    'SEM_REF_CYCLE@main:1:12',
    'SEM_REF_CYCLE@main:2:12',
  ]);
});

test('B: chỉ tính định nghĩa thắng khi xét vòng', () => {
  // o: a = "${b}" bị ghi đè bằng 1 → b = "${a}" không tạo vòng, nhưng Ref bị ghi đè vẫn được xét (tồn tại → hợp lệ)
  assert.deepEqual(run({ main: 'include "o"\na = 1\nb = "${a}"', o: 'a = "${b}"' }), []);
});

test('B: tham chiếu chuỗi dùng chung không phải vòng (hình thoi)', () => {
  assert.deepEqual(run({ main: 'a = "${c}"\nb = "${c}"\nc = "x"\nd = "${a}${b}"' }), []);
});

test('B: SEM_BAD_INTERPOLATION', () => {
  const errs = run({
    main: 'l = [1]\no { k = 1 }\nn = "${l}"\na = "x${l}"\nb = "${o}${o.k}"\nc = "${l.0}-${o.k}"\nd = "p${n}"',
  });
  assert.deepEqual(brief(errs), [
    'SEM_BAD_INTERPOLATION@main:4:7',
    'SEM_BAD_INTERPOLATION@main:5:6',
    'SEM_BAD_INTERPOLATION@main:7:7',
  ]);
});

test('B: dừng sau pha B, không chạy pha C', () => {
  const errs = run({ main: 'a = "${b}"\nc = 1' }, { type: 'object', fields: { c: { type: 'string' } } });
  assert.deepEqual(brief(errs), ['SEM_UNDEFINED_REF@main:1:6']);
});

test('B: lỗi theo tệp theo thứ tự thăm, trong tệp theo vị trí Ref', () => {
  const errs = run({
    main: 'include "b"\nm = "${q1}${q2}"',
    b: 'x = "${q3}"\ny = "${q4}"',
  });
  assert.deepEqual(brief(errs), [
    'SEM_UNDEFINED_REF@main:2:6',
    'SEM_UNDEFINED_REF@main:2:11',
    'SEM_UNDEFINED_REF@b:1:6',
    'SEM_UNDEFINED_REF@b:2:6',
  ]);
});

// ---------- Pha C ----------
const S = (o) => ({ type: 'object', ...o });

test('C: SEM_TYPE_MISMATCH tại nút giá trị, không kiểm sâu hơn', () => {
  const errs = run(
    { main: 'port = "80"\nn = 1.5\nflag = null\nl = [1]\ns { a = 1 }' },
    S({
      fields: {
        port: { type: 'integer' },
        n: { type: 'integer' },
        flag: { type: 'boolean' },
        l: { type: 'object', fields: { x: { required: true } } },
        s: { type: 'array', items: { type: 'string' } },
      },
    }),
  );
  assert.deepEqual(brief(errs), [
    'SEM_TYPE_MISMATCH@main:1:8',
    'SEM_TYPE_MISMATCH@main:2:5',
    'SEM_TYPE_MISMATCH@main:3:8',
    'SEM_TYPE_MISMATCH@main:4:5',
    'SEM_TYPE_MISMATCH@main:5:1',
  ]);
});

test('C: kiểu number nhận số nguyên; any bỏ qua; null chỉ nhận null', () => {
  const errs = run(
    { main: 'a = 1\nb = [1]\nc = null\nd = 2' },
    S({ fields: { a: { type: 'number' }, b: { type: 'any' }, c: { type: 'null' }, d: { type: 'integer' } } }),
  );
  assert.deepEqual(errs, []);
});

test('C: SEM_NOT_IN_ENUM, kiểm trước required/fields', () => {
  const errs = run(
    { main: 'mode = "x"\nn = null\nok = "a"' },
    S({
      fields: {
        mode: { type: 'string', enum: ['a', 'b'] },
        n: { enum: [0] },
        ok: { enum: ['a'] },
      },
    }),
  );
  assert.deepEqual(brief(errs), ['SEM_NOT_IN_ENUM@main:1:8', 'SEM_NOT_IN_ENUM@main:2:5']);
});

test('C: MISSING_REQUIRED tại Block khởi tạo / gốc (entry 1:1); UNKNOWN_KEY tại token khóa thắng', () => {
  const errs = run(
    { main: 'include "o"\nx = 1\nsrv { yy = 2 }', o: 'srv { zz = 1\n  host = "h" }' },
    S({
      closed: true,
      fields: {
        srv: S({ closed: true, fields: { host: {}, port: { required: true }, tls: { required: true } } }),
        need: { required: true },
        need2: { required: true },
      },
    }),
  );
  assert.deepEqual(brief(errs), [
    'SEM_MISSING_REQUIRED@main:1:1',
    'SEM_MISSING_REQUIRED@main:1:1',
    'SEM_MISSING_REQUIRED@o:1:1',
    'SEM_MISSING_REQUIRED@o:1:1',
    'SEM_UNKNOWN_KEY@o:1:7',
    'SEM_UNKNOWN_KEY@main:3:7',
    'SEM_UNKNOWN_KEY@main:2:1',
  ]);
});

test('C: đối tượng nằm ở Block khởi tạo — khối đầu tiên kể từ lần khóa được đặt lại', () => {
  const errs = run(
    { main: 'include "o"\ninclude "p"\ninclude "q"\ninclude "r"', o: 's { x = 1 }', p: 's = 5', q: 's { y = 1 }', r: 's { z = 1 }' },
    S({ fields: { s: S({ fields: { need: { required: true } } }) } }),
  );
  assert.deepEqual(brief(errs), ['SEM_MISSING_REQUIRED@q:1:1']);
});

test('C: items — theo chỉ số, vị trí phần tử', () => {
  const errs = run(
    { main: 'l = [1, "a", [2], 3.5]' },
    S({ fields: { l: { type: 'array', items: { type: 'integer' } } } }),
  );
  assert.deepEqual(brief(errs), ['SEM_TYPE_MISMATCH@main:1:9', 'SEM_TYPE_MISMATCH@main:1:14', 'SEM_TYPE_MISMATCH@main:1:19']);
});

test('C: chuỗi thuần tham chiếu — mọi thứ bên trong dùng vị trí chuỗi', () => {
  const errs = run(
    { main: 'o { a = 1 }\nl = [1, "x"]\np = "${o}"\nq = "${l}"\nr = "${o.a}"' },
    S({
      closed: true,
      fields: {
        o: { type: 'object' },
        l: { type: 'array', items: { type: 'integer' } },
        p: S({ closed: true, fields: { b: { required: true } } }),
        q: { type: 'array', items: { type: 'string' } },
        r: { type: 'string' },
      },
    }),
  );
  assert.deepEqual(brief(errs), [
    'SEM_TYPE_MISMATCH@main:2:9',
    'SEM_MISSING_REQUIRED@main:3:5',
    'SEM_UNKNOWN_KEY@main:3:5',
    'SEM_TYPE_MISMATCH@main:4:5',
    'SEM_TYPE_MISMATCH@main:5:5',
  ]);
});

test('C: lỗi trong tệp include mang tên tệp đó; schema không có thì bỏ pha C', () => {
  const files = { main: 'include "o"', o: 'port = "x"' };
  assert.deepEqual(run(files), []);
  const errs = run(files, S({ fields: { port: { type: 'number' } } }));
  assert.deepEqual(brief(errs), ['SEM_TYPE_MISMATCH@o:1:8']);
});

test('C: khóa __proto__ và constructor không gây nhầm', () => {
  const errs = run({ main: 'a = 1' }, S({ closed: true, fields: { constructor: { required: true } } }));
  assert.deepEqual(brief(errs).sort(), ['SEM_MISSING_REQUIRED@main:1:1', 'SEM_UNKNOWN_KEY@main:1:1']);
});
