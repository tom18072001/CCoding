import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

function run(files, schema, entry = 'main') {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return check(p.program, schema);
}
const pos = (errs) => errs.map((e) => [e.code, e.file, e.line, e.column]);

test('pha A: SEM_DUPLICATE_KEY ở mỗi lần xuất hiện sau, Assign/Block cùng khóa', () => {
  const errs = run({ main: 'a = 1\na = 2\na { x = 1 }\nb { k = 1 }\nc { k = 1 }\nb { }' });
  assert.deepEqual(pos(errs), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1],
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'main', 6, 1],
  ]);
});

test('pha A: khóa trùng trong khối lồng; khác khối/khác tệp không phải trùng', () => {
  const errs = run({ main: 'include "o.cfg"\nx = 1\ns { a = 1\n  a = 2 }', 'o.cfg': 'x = 5' });
  assert.deepEqual(pos(errs), [['SEM_DUPLICATE_KEY', 'main', 4, 3]]);
});

test('pha A: SEM_DUPLICATE_CONST', () => {
  const errs = run({ main: 'const a = 1\nconst b = 2\nconst a = 3' });
  assert.deepEqual(pos(errs), [['SEM_DUPLICATE_CONST', 'main', 3, 1]]);
});

test('pha A: SEM_INCLUDE_NOT_FOUND (cả include trong khối)', () => {
  const errs = run({ main: 'include "x.cfg"\ns {\n  include "y.cfg"\n}' });
  assert.deepEqual(pos(errs), [
    ['SEM_INCLUDE_NOT_FOUND', 'main', 1, 1],
    ['SEM_INCLUDE_NOT_FOUND', 'main', 3, 3],
  ]);
});

test('pha A: SEM_INCLUDE_CYCLE gồm tự include và vòng a→b→a', () => {
  assert.deepEqual(pos(run({ main: 'include "main"' })), [['SEM_INCLUDE_CYCLE', 'main', 1, 1]]);
  const errs = run({ main: 'include "b"', b: 'x = 1\n  include "main"' });
  assert.deepEqual(pos(errs), [['SEM_INCLUDE_CYCLE', 'b', 2, 3]]);
});

test('pha A: hình thoi không phải vòng', () => {
  const errs = run({
    main: 'include "b"\ninclude "c"',
    b: 'include "d"',
    c: 'include "d"',
    d: 'x = 1',
  });
  assert.deepEqual(errs, []);
});

test('pha A: lỗi gom theo tệp tiền thứ tự, trong tệp sắp theo vị trí', () => {
  const files = {
    main: 'include "b"\ninclude "c"\nq = 1\nq = 2',
    b: 'include "d"\nk = 1\nk = 2',
    c: 'z = 1\nz = 2',
    d: 'const a = 1\nconst a = 2',
  };
  assert.deepEqual(pos(run(files)), [
    ['SEM_DUPLICATE_KEY', 'main', 4, 1],
    ['SEM_DUPLICATE_KEY', 'b', 3, 1],
    ['SEM_DUPLICATE_CONST', 'd', 2, 1],
    ['SEM_DUPLICATE_KEY', 'c', 2, 1],
  ]);
});

test('pha A: lỗi trong tệp được sắp theo (line, column) kể cả khác loại', () => {
  const errs = run({ main: 'include "no"\nconst a = 1\nx = 1\nconst a = 2\nx = 3' });
  assert.deepEqual(pos(errs).map((e) => e[0]), [
    'SEM_INCLUDE_NOT_FOUND',
    'SEM_DUPLICATE_CONST',
    'SEM_DUPLICATE_KEY',
  ]);
});

test('pha B không chạy khi pha A có lỗi', () => {
  const errs = run({ main: 'a = 1\na = 2\nb = "${zzz}"' });
  assert.deepEqual(pos(errs), [['SEM_DUPLICATE_KEY', 'main', 2, 1]]);
});

test('pha B: SEM_UNDEFINED_REF mọi dạng, kể cả trong mảng, vị trí tại $', () => {
  const errs = run({
    main: 'const c = 1\na = ["x", ["${nope}"]]\nb = "${@zz}"\nd = "${a.5}"\ne = "${c}"\nf = 1\ng = "${f.x}"',
  });
  assert.deepEqual(pos(errs), [
    ['SEM_UNDEFINED_REF', 'main', 2, 13],
    ['SEM_UNDEFINED_REF', 'main', 3, 6],
    ['SEM_UNDEFINED_REF', 'main', 4, 6],
    ['SEM_UNDEFINED_REF', 'main', 5, 6], // ${c} là cấu hình, không phải hằng
    ['SEM_UNDEFINED_REF', 'main', 7, 6],
  ]);
});

test('pha B: hằng của tệp khác không thấy được, hằng khai báo muộn thấy được', () => {
  const errs = run({
    main: 'include "o"\nx = "${@late}"\nconst late = 1',
    o: 'const k = 1\ny = "${@k}"',
  });
  assert.deepEqual(errs, []);
  const errs2 = run({ main: 'include "o"\nconst k = 1', o: 'y = "${@k}"' });
  assert.deepEqual(pos(errs2), [['SEM_UNDEFINED_REF', 'o', 1, 6]]);
});

test('pha B: SEM_CONST_CONFIG_REF trong const (kể cả trong mảng), hằng tham chiếu hằng thì được', () => {
  const errs = run({ main: 'port = 1\nconst a = "${port}"\nconst b = ["${@a}", "${port}"]\nconst c = "${@a}"' });
  assert.deepEqual(pos(errs), [
    ['SEM_CONST_CONFIG_REF', 'main', 2, 12],
    ['SEM_CONST_CONFIG_REF', 'main', 3, 22],
  ]);
});

test('pha B: const-config ưu tiên hơn undefined', () => {
  const errs = run({ main: 'const a = "${nope}"' });
  assert.deepEqual(pos(errs), [['SEM_CONST_CONFIG_REF', 'main', 1, 12]]);
});

test('pha B: kiểm cả chuỗi bị ghi đè', () => {
  const errs2 = run({ main: 'include "o"\na = 1', o: 'a = "${nope}"' });
  assert.deepEqual(pos(errs2), [['SEM_UNDEFINED_REF', 'o', 1, 6]]);
});

test('pha B: SEM_REF_CYCLE a = "${a}"', () => {
  assert.deepEqual(pos(run({ main: 'a = "${a}"' })), [['SEM_REF_CYCLE', 'main', 1, 6]]);
});

test('pha B: a="${b}" + b="${a}" cho hai lỗi', () => {
  const errs = run({ main: 'a = "${b}"\nb = "${a}"' });
  assert.deepEqual(pos(errs), [
    ['SEM_REF_CYCLE', 'main', 1, 6],
    ['SEM_REF_CYCLE', 'main', 2, 6],
  ]);
});

test('pha B: x { y = "${x}" } là vòng; tham chiếu anh em/cha không chứa mình thì không', () => {
  assert.deepEqual(pos(run({ main: 'x { y = "${x}" }' })), [['SEM_REF_CYCLE', 'main', 1, 10]]);
  assert.deepEqual(run({ main: 'x { y = 1 }\nz = "${x}"\nw = "${x.y}"' }), []);
});

test('pha B: vòng gián tiếp chỉ gán lỗi cho Ref nằm trên vòng', () => {
  // a -> b -> a là vòng; c chỉ trỏ vào a nên không thuộc vòng
  const errs = run({ main: 'a = "${b}"\nb = "${a}"\nc = "${a}"' });
  assert.deepEqual(pos(errs), [
    ['SEM_REF_CYCLE', 'main', 1, 6],
    ['SEM_REF_CYCLE', 'main', 2, 6],
  ]);
});

test('pha B: định nghĩa bị ghi đè không tạo vòng', () => {
  const files = { main: 'include "o"\na = "ok"\nb = "${a}"', o: 'a = "${b}"' };
  assert.deepEqual(run(files), []);
});

test('pha B: SEM_BAD_INTERPOLATION cho mảng/đối tượng, không cho vô hướng hoặc chuỗi thuần', () => {
  const errs = run({
    main: 'arr = [1]\nobj { k = 1 }\np = "${arr}"\nq = "x${arr}"\nr = "${obj}${arr}"\ns = "v${arr.0}"\nt = "${obj}"\nn = null\nu = "<${n}>"',
  });
  assert.deepEqual(pos(errs), [
    ['SEM_BAD_INTERPOLATION', 'main', 4, 7],
    ['SEM_BAD_INTERPOLATION', 'main', 5, 6],
    ['SEM_BAD_INTERPOLATION', 'main', 5, 12],
  ]);
});

test('pha B: BAD_INTERPOLATION theo giá trị đã đánh giá (đích là chuỗi thuần tham chiếu tới mảng)', () => {
  const errs = run({ main: 'arr = [1]\nalias = "${arr}"\nm = "x${alias}"' });
  assert.deepEqual(pos(errs), [['SEM_BAD_INTERPOLATION', 'main', 3, 7]]);
});

test('pha B: một Ref tối đa một lỗi và lỗi trong tệp sắp theo vị trí', () => {
  const errs = run({ main: 'const c = "${@c}"\na = "${nope}${nope}"' });
  assert.deepEqual(pos(errs), [
    ['SEM_REF_CYCLE', 'main', 1, 12],
    ['SEM_UNDEFINED_REF', 'main', 2, 6],
    ['SEM_UNDEFINED_REF', 'main', 2, 13],
  ]);
});

test('pha B: lỗi gom theo thứ tự tệp, pha C không chạy khi pha B lỗi', () => {
  const files = { main: 'include "o"\nb = "${y}"', o: 'a = "${x}"' };
  const errs = run(files, { type: 'object', fields: { a: { type: 'number' } } });
  assert.deepEqual(pos(errs), [
    ['SEM_UNDEFINED_REF', 'main', 2, 6],
    ['SEM_UNDEFINED_REF', 'o', 1, 6],
  ]);
});

test('không có schema thì không chạy pha C', () => {
  assert.deepEqual(run({ main: 'a = 1' }), []);
});

const schema = {
  type: 'object',
  closed: true,
  fields: {
    name: { type: 'string', required: true },
    port: { type: 'integer' },
    mode: { enum: ['dev', 'prod'] },
    tags: { type: 'array', items: { type: 'string' } },
    srv: { type: 'object', required: true, fields: { host: { type: 'string', required: true } } },
  },
};

test('pha C: hợp lệ', () => {
  const ok = 'name = "a"\nport = 80\nmode = "dev"\ntags = ["a"]\nsrv { host = "h" }';
  assert.deepEqual(run({ main: ok }, schema), []);
});

test('pha C: SEM_TYPE_MISMATCH tại nút giá trị; không kiểm sâu hơn', () => {
  const errs = run({ main: 'name = "a"\nsrv { host = "h" }\n  port = 1.5\ntags = [1, "a", 2]\nmode = 5' }, schema);
  assert.deepEqual(pos(errs), [
    ['SEM_TYPE_MISMATCH', 'main', 3, 10],
    ['SEM_TYPE_MISMATCH', 'main', 4, 9],
    ['SEM_TYPE_MISMATCH', 'main', 4, 17],
    ['SEM_NOT_IN_ENUM', 'main', 5, 8],
  ]);
});

test('pha C: type mismatch dừng kiểm sâu (object nhận mảng)', () => {
  const errs = run({ main: 'srv = [1]\nname = "n"' }, schema);
  assert.deepEqual(pos(errs), [['SEM_TYPE_MISMATCH', 'main', 1, 7]]);
});

test('pha C: SEM_MISSING_REQUIRED theo thứ tự fields, tại gốc 1:1 của entry và tại Block', () => {
  const errs = run({ main: 'include "o"\nport = 1', o: 'srv { }' }, schema);
  assert.deepEqual(pos(errs), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1], // name (gốc, entry)
    ['SEM_MISSING_REQUIRED', 'o', 1, 1], // srv.host tại Block srv
  ]);
  const only = run({ main: 'x = 1' }, { type: 'object', fields: { b: { required: true }, a: { required: true } } });
  assert.deepEqual(only.map((e) => e.message.includes("'b'")), [true, false]);
  assert.equal(only.length, 2);
});

test('pha C: vị trí đối tượng là Block khởi tạo (sau khi bị thay bằng giá trị khác)', () => {
  const files = { main: 'include "o"\nsrv {\n  a = 1 }', o: 'srv = 5' };
  const sc = { type: 'object', fields: { srv: { type: 'object', fields: { host: { required: true } } } } };
  const errs = run(files, sc);
  assert.deepEqual(pos(errs), [['SEM_MISSING_REQUIRED', 'main', 2, 1]]);
});

test('pha C: SEM_UNKNOWN_KEY tại token khóa thắng (sau ghi đè)', () => {
  const files = { main: 'include "o"\n  extra = 2\nname = "n"\nsrv { host = "h" }', o: 'extra = 1' };
  const errs = run(files, schema);
  assert.deepEqual(pos(errs), [['SEM_UNKNOWN_KEY', 'main', 2, 3]]);
});

test('pha C: UNKNOWN_KEY là Block lạ, theo thứ tự khóa hợp nhất', () => {
  const errs = run({ main: 'zz { }\nname = "n"\nyy = 1\nsrv { host = "h" }' }, schema);
  assert.deepEqual(pos(errs), [
    ['SEM_UNKNOWN_KEY', 'main', 1, 1],
    ['SEM_UNKNOWN_KEY', 'main', 3, 1],
  ]);
});

test('pha C: vị trí lỗi trên giá trị lấy từ "${x}" là vị trí chuỗi', () => {
  const sc = {
    type: 'object',
    fields: {
      n: { type: 'string' },
      o: { type: 'object', closed: true, fields: { k: { type: 'string' } } },
      l: { type: 'array', items: { type: 'string' } },
    },
  };
  const files = {
    main: 'src = 5\nsobj { k = 1  z = 2 }\nsl = [1]\nn = "${src}"\no = "${sobj}"\nl = "${sl}"',
  };
  const errs = run(files, sc);
  assert.deepEqual(pos(errs), [
    ['SEM_TYPE_MISMATCH', 'main', 4, 5], // n
    ['SEM_TYPE_MISMATCH', 'main', 5, 5], // o.k, ép về vị trí chuỗi
    ['SEM_UNKNOWN_KEY', 'main', 5, 5], // o.z
    ['SEM_TYPE_MISMATCH', 'main', 6, 5], // l[0]
  ]);
});

test('pha C: không có required/closed mặc định, enum không áp cho mảng/đối tượng, any', () => {
  const sc = { type: 'object', fields: { a: { type: 'any', enum: [1] }, b: { enum: ['x'] } } };
  assert.deepEqual(run({ main: 'a = 1\nb = ["q"]\nc = 3' }, sc), []);
  assert.deepEqual(pos(run({ main: 'a = 2' }, sc)), [['SEM_NOT_IN_ENUM', 'main', 1, 5]]);
});

test('pha C: type null / integer / number', () => {
  const sc = { type: 'object', fields: { n: { type: 'null' }, i: { type: 'integer' }, f: { type: 'number' } } };
  assert.deepEqual(run({ main: 'n = null\ni = 3\nf = 3' }, sc), []);
  assert.equal(run({ main: 'n = 0\ni = 3.5\nf = "s"' }, sc).length, 3);
});

test('check không ném với entry thiếu', () => {
  assert.doesNotThrow(() => check({ entry: 'm', files: {} }));
});
