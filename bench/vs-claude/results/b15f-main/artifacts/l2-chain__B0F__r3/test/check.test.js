import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

function run(files, schema, entry = 'main') {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return check(p.program, schema);
}
const brief = (errs) => errs.map((e) => `${e.code}@${e.file}:${e.line}:${e.column}`);
const obj = (fields, extra = {}) => ({ type: 'object', fields, ...extra });

test('hợp lệ → mảng rỗng', () => {
  assert.deepEqual(run({ main: 'a = 1\nb { a = 2 }' }), []);
});

test('SEM_DUPLICATE_KEY: mọi lần xuất hiện sau, Assign+Block cùng khóa, khối khác không trùng', () => {
  const errs = run({ main: 'a = 1\na = 2\na { x = 1 }\nb { a = 1 }\nc { x = 1 x = 2 }' });
  assert.deepEqual(brief(errs), ['SEM_DUPLICATE_KEY@main:2:1', 'SEM_DUPLICATE_KEY@main:3:1', 'SEM_DUPLICATE_KEY@main:5:11']);
});

test('khóa trùng giữa tệp include và tệp cha không phải trùng', () => {
  assert.deepEqual(run({ main: 'include "b"\na = 2', b: 'a = 1' }), []);
});

test('SEM_DUPLICATE_CONST', () => {
  assert.deepEqual(brief(run({ main: 'const c = 1\nconst c = 2' })), ['SEM_DUPLICATE_CONST@main:2:1']);
});

test('SEM_INCLUDE_NOT_FOUND', () => {
  assert.deepEqual(brief(run({ main: 'x { include "nope" }' })), ['SEM_INCLUDE_NOT_FOUND@main:1:5']);
});

test('SEM_INCLUDE_CYCLE: tự include và vòng qua tệp khác', () => {
  assert.deepEqual(brief(run({ main: 'include "main"' })), ['SEM_INCLUDE_CYCLE@main:1:1']);
  assert.deepEqual(
    brief(run({ main: 'include "a"', a: 'q = 1\ninclude "b"', b: '\ninclude "a"\ninclude "main"' })),
    ['SEM_INCLUDE_CYCLE@b:2:1', 'SEM_INCLUDE_CYCLE@b:3:1'],
  );
});

test('include hình thoi không phải vòng', () => {
  const files = { main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'x = 1' };
  assert.deepEqual(run(files), []);
});

test('thứ tự lỗi pha A: theo tệp thăm tiền thứ tự, trong tệp theo (line, column)', () => {
  const files = {
    main: 'include "b"\nz = 1\nz = 2\ninclude "c"\ninclude "gone"',
    b: 'k = 1\nk = 2\ninclude "d"',
    c: 'w = 1\nw = 2',
    d: 'p = 1\np = 2',
  };
  assert.deepEqual(brief(run(files)), [
    'SEM_DUPLICATE_KEY@main:3:1', 'SEM_INCLUDE_NOT_FOUND@main:5:1',
    'SEM_DUPLICATE_KEY@b:2:1', 'SEM_DUPLICATE_KEY@d:2:1', 'SEM_DUPLICATE_KEY@c:2:1',
  ]);
});

test('SEM_UNDEFINED_REF: cấu hình, hằng khác tệp, qua chuỗi, chỉ số mảng', () => {
  const errs = run({
    main: 'const c = 1\nl = [1]\ns = "x"\ninclude "o"\na = "${nope}"\nb = "${s.x}"\nd = "${l.1}"\ne = "${l.x}"\nf = "${@zz}"\ng = "${@c}"',
    o: 'const q = 1\nh = "${@c}"',
  });
  assert.deepEqual(brief(errs), [
    'SEM_UNDEFINED_REF@main:5:6', 'SEM_UNDEFINED_REF@main:6:6', 'SEM_UNDEFINED_REF@main:7:6',
    'SEM_UNDEFINED_REF@main:8:6', 'SEM_UNDEFINED_REF@main:9:6', 'SEM_UNDEFINED_REF@o:2:6',
  ]);
});

test('hằng được dùng trước khi khai báo; null tồn tại', () => {
  assert.deepEqual(run({ main: 'a = "${@c}"\nn = null\nm = "${n}"\nconst c = 1' }), []);
});

test('SEM_CONST_CONFIG_REF, kể cả trong mảng', () => {
  const errs = run({ main: 'a = 1\nconst c = ["x${a}", "${@d}"]\nconst d = 2' });
  assert.deepEqual(brief(errs), ['SEM_CONST_CONFIG_REF@main:2:14']);
});

test('ưu tiên trên cùng một Ref: CONST_CONFIG_REF thắng UNDEFINED_REF', () => {
  assert.deepEqual(brief(run({ main: 'const c = "${zz}"' })), ['SEM_CONST_CONFIG_REF@main:1:12']);
});

test('ưu tiên: REF_CYCLE thắng BAD_INTERPOLATION', () => {
  assert.deepEqual(brief(run({ main: 'x = "t${x}"' })), ['SEM_REF_CYCLE@main:1:7']);
  // đích là đối tượng (sẽ là BAD_INTERPOLATION) nhưng cũng là vòng → vòng
  assert.deepEqual(brief(run({ main: 'o { s = "p${o}" }' })), ['SEM_REF_CYCLE@main:1:11']);
});

test('ba ví dụ vòng trong spec', () => {
  assert.deepEqual(brief(run({ main: 'a = "${a}"' })), ['SEM_REF_CYCLE@main:1:6']);
  assert.deepEqual(brief(run({ main: 'a = "${b}"\nb = "${a}"' })), ['SEM_REF_CYCLE@main:1:6', 'SEM_REF_CYCLE@main:2:6']);
  assert.deepEqual(brief(run({ main: 'x { y = "${x}" }' })), ['SEM_REF_CYCLE@main:1:10']);
});

test('chuỗi không vòng: chuỗi tham chiếu chuỗi khác', () => {
  assert.deepEqual(run({ main: 'a = "${b}"\nb = "${c}"\nc = 1' }), []);
});

test('SEM_BAD_INTERPOLATION: mảng/đối tượng vào chuỗi không thuần; vô hướng và thuần Ref được phép', () => {
  const errs = run({ main: 'l = [1]\no { k = 1 }\na = "x${l}"\nb = "${l}"\nc = "${o}${o}"\nd = "x${o.k}"\ne = "${l}${o.k}"\nf = [ "y${o}" ]' });
  assert.deepEqual(brief(errs), [
    'SEM_BAD_INTERPOLATION@main:3:7', 'SEM_BAD_INTERPOLATION@main:5:6', 'SEM_BAD_INTERPOLATION@main:5:10',
    'SEM_BAD_INTERPOLATION@main:7:6', 'SEM_BAD_INTERPOLATION@main:8:9',
  ]);
});

test('pha B xét chuỗi bị ghi đè', () => {
  const errs = run({ main: 'include "b"\na = 1', b: 'a = "${nope}"' });
  assert.deepEqual(brief(errs), ['SEM_UNDEFINED_REF@b:1:6']);
});

test('dừng theo pha: A che B, B che C', () => {
  const schema = obj({ a: { type: 'string' } });
  assert.deepEqual(brief(run({ main: 'a = "${zz}"\na = 2' }, schema)), ['SEM_DUPLICATE_KEY@main:2:1']);
  assert.deepEqual(brief(run({ main: 'a = "${zz}"' }, schema)), ['SEM_UNDEFINED_REF@main:1:6']);
  assert.deepEqual(brief(run({ main: 'a = 1' }, schema)), ['SEM_TYPE_MISMATCH@main:1:5']);
  assert.deepEqual(run({ main: 'a = 1' }), []);
});

// ───── Pha C ─────
test('C: type — number nhận nguyên; integer từ chối 1.5; null chỉ nhận null; array/object không nhận null', () => {
  const sch = obj({
    n: { type: 'number' }, i: { type: 'integer' }, z: { type: 'null' }, l: { type: 'array' },
    o: { type: 'object' }, s: { type: 'string' }, b: { type: 'boolean' }, y: { type: 'any' },
  });
  assert.deepEqual(run({ main: 'n = 3\ni = 4\nz = null\nl = []\no {}\ns = ""\nb = false\ny = null' }, sch), []);
  const errs = run({ main: 'i = 1.5\nz = 0\nl = null\no = null\nn = "1"\ns = []\nb = 0' }, sch);
  assert.deepEqual(brief(errs), [
    'SEM_TYPE_MISMATCH@main:1:5', 'SEM_TYPE_MISMATCH@main:2:5', 'SEM_TYPE_MISMATCH@main:3:5', 'SEM_TYPE_MISMATCH@main:4:5',
    'SEM_TYPE_MISMATCH@main:5:5', 'SEM_TYPE_MISMATCH@main:6:5', 'SEM_TYPE_MISMATCH@main:7:5',
  ]);
  assert.equal(run({ main: 'o = []' }, sch)[0].code, 'SEM_TYPE_MISMATCH');
  assert.equal(run({ main: 'l {}' }, sch)[0].code, 'SEM_TYPE_MISMATCH');
});

test('C: type sai thì không kiểm sâu hơn; gốc sai kiểu ở entry 1:1', () => {
  assert.deepEqual(brief(run({ main: 'a = 1' }, { type: 'array' })), ['SEM_TYPE_MISMATCH@main:1:1']);
  const s2 = obj({ s: { type: 'string', enum: ['x'], fields: { q: { required: true } } } });
  assert.deepEqual(brief(run({ main: 's = 5' }, s2)), ['SEM_TYPE_MISMATCH@main:1:5']);
});

test('C: enum (===, vô hướng)', () => {
  const sch = obj({ m: { enum: ['a', 'b'] }, n: { enum: [1, null] } });
  assert.deepEqual(run({ main: 'm = "a"\nn = null' }, sch), []);
  assert.deepEqual(brief(run({ main: 'm = "c"\nn = "1"' }, sch)), ['SEM_NOT_IN_ENUM@main:1:5', 'SEM_NOT_IN_ENUM@main:2:5']);
});

test('C: required — nhiều khóa thiếu báo tại đối tượng, theo thứ tự fields, trước UNKNOWN_KEY', () => {
  const sch = obj({ x: { required: true }, y: { required: true }, z: {} }, { closed: true });
  const errs = run({ main: 'q = 1\nz = 1' }, sch);
  assert.deepEqual(brief(errs), ['SEM_MISSING_REQUIRED@main:1:1', 'SEM_MISSING_REQUIRED@main:1:1', 'SEM_UNKNOWN_KEY@main:1:1']);
  assert.match(errs[0].message, /x/);
  assert.match(errs[1].message, /y/);
  const nested = obj({ srv: { type: 'object', fields: { host: { required: true }, port: { required: true } } } });
  assert.deepEqual(
    brief(run({ main: 'a = 1\n\n  srv {\n  port = 1\n}' }, nested)),
    ['SEM_MISSING_REQUIRED@main:3:3'],
  );
});

test('C: vị trí đối tượng là Block khởi tạo (sau khi khóa bị đặt bằng giá trị khác)', () => {
  const sch = obj({ s: { type: 'object', fields: { h: { required: true } } } });
  assert.deepEqual(
    brief(run({
      main: 'include "b"\ninclude "c"\ninclude "d"\ninclude "e"',
      b: 's { a = 1 }', c: 's = 1', d: '\n s { b = 1 }', e: 's { c = 1 }',
    }, sch)),
    ['SEM_MISSING_REQUIRED@d:2:2'],
  );
});

test('C: UNKNOWN_KEY tại token khóa thắng (Assign/Block, đúng tệp)', () => {
  const sch = obj({ ok: {} }, { closed: true });
  assert.deepEqual(
    brief(run({ main: 'include "b"\nok = 1\n  extra = 3', b: 'extra = 1\nblk { }' }, sch)),
    ['SEM_UNKNOWN_KEY@main:3:3', 'SEM_UNKNOWN_KEY@b:2:1'],
  );
  assert.deepEqual(brief(run({ main: 'include "b"\nx { y = 1 }', b: 'x { z = 1 }' }, sch)), ['SEM_UNKNOWN_KEY@main:2:1']);
});

test('C: items — vị trí phần tử, mảng lồng, chuỗi thuần Ref trong mảng', () => {
  const sch = obj({
    l: { type: 'array', items: { type: 'integer' } },
    m: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
  });
  assert.deepEqual(
    brief(run({ main: 'l = [1, 2.5, "x"]\nm = [[ "a", 1 ]]' }, sch)),
    ['SEM_TYPE_MISMATCH@main:1:9', 'SEM_TYPE_MISMATCH@main:1:14', 'SEM_TYPE_MISMATCH@main:2:13'],
  );
  assert.deepEqual(brief(run({ main: 'c = "s"\nl = [1, "${c}"]' }, sch)), ['SEM_TYPE_MISMATCH@main:2:9']);
});

test('C: chuỗi thuần tham chiếu — vị trí chuỗi cho giá trị và mọi thứ bên trong', () => {
  const sch = obj({
    v: { type: 'integer' },
    cp: { type: 'object', closed: true, fields: { a: { type: 'integer' }, need: { required: true } } },
  });
  const errs = run({ main: 'src { a = "no" extra = 1 }\nl = [1.5]\ncp = "${src}"\nv = "${l.0}"' }, sch);
  assert.deepEqual(brief(errs), [
    'SEM_MISSING_REQUIRED@main:3:6', 'SEM_TYPE_MISMATCH@main:3:6', 'SEM_UNKNOWN_KEY@main:3:6', 'SEM_TYPE_MISMATCH@main:4:5',
  ]);
});

test('C: kiểm trên giá trị đã đánh giá (thuần Ref giữ kiểu, nội suy là chuỗi)', () => {
  const sch = obj({ p: { type: 'integer' }, s: { type: 'string' } });
  assert.deepEqual(run({ main: 'n = 80\np = "${n}"\ns = "${n}${n}"' }, sch), []);
  assert.deepEqual(brief(run({ main: 'n = 80\np = "${n}x"\ns = "${n}"' }, sch)), ['SEM_TYPE_MISMATCH@main:2:5', 'SEM_TYPE_MISMATCH@main:3:5']);
});

test('check không ném khi entry thiếu', () => {
  assert.doesNotThrow(() => check({ entry: 'x', files: {} }));
});
