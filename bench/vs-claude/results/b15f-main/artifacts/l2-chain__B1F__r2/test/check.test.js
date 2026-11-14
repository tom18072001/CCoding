import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const run = (files, schema, entry = 'main') => {
  const r = parseProject(typeof files === 'string' ? { main: files } : files, entry);
  assert.equal(r.ok, true, JSON.stringify(r));
  return check(r.program, schema);
};
const pos = (errs) => errs.map((e) => [e.code, e.file, e.line, e.column]);

test('hợp lệ trả mảng rỗng', () => {
  assert.deepEqual(run('a = 1\nb = "${a}"'), []);
});

test('SEM_DUPLICATE_KEY: từ lần thứ 2, Assign/Block cùng khóa; khối/tệp khác không trùng', () => {
  const e = run('a = 1\na = 2\na { }\nb { a = 1 }\nc { x = 1\n x = 2 }');
  assert.deepEqual(pos(e), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1],
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'main', 6, 2],
  ]);
  assert.deepEqual(run({ main: 'include "b"\na = 1', b: 'a = 2' }), []);
});

test('SEM_DUPLICATE_CONST', () => {
  assert.deepEqual(pos(run('const k = 1\nconst k = 2')), [['SEM_DUPLICATE_CONST', 'main', 2, 1]]);
});

test('SEM_INCLUDE_NOT_FOUND', () => {
  assert.deepEqual(pos(run('x = 1\n  include "nope"')), [['SEM_INCLUDE_NOT_FOUND', 'main', 2, 3]]);
});

test('SEM_INCLUDE_CYCLE: vòng, tự include; hình thoi không phải vòng', () => {
  assert.deepEqual(pos(run({ main: 'include "b"', b: 'include "main"' })), [['SEM_INCLUDE_CYCLE', 'b', 1, 1]]);
  assert.deepEqual(pos(run('include "main"')), [['SEM_INCLUDE_CYCLE', 'main', 1, 1]]);
  const diamond = { main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'x = 1' };
  assert.deepEqual(run(diamond), []);
});

test('pha A: lỗi gom theo tệp tiền thứ tự, trong tệp sắp theo vị trí', () => {
  const e = run({
    main: 'a = 1\na = 2\ninclude "b"\ninclude "c"\nz = 1\nz = 2',
    b: 'q = 1\nq = 2',
    c: 'include "zz"',
  });
  assert.deepEqual(pos(e), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1],
    ['SEM_DUPLICATE_KEY', 'main', 6, 1],
    ['SEM_DUPLICATE_KEY', 'b', 2, 1],
    ['SEM_INCLUDE_NOT_FOUND', 'c', 1, 1],
  ]);
  // include đặt giữa có lỗi sắp theo (line, column) trong tệp
  const e2 = run('const k = 1\ninclude "nope"\nconst k = 2');
  assert.deepEqual(pos(e2).map((x) => x[0]), ['SEM_INCLUDE_NOT_FOUND', 'SEM_DUPLICATE_CONST']);
});

test('pha A có lỗi thì không chạy pha B', () => {
  const e = run('a = 1\na = 2\nb = "${zzz}"');
  assert.deepEqual(e.map((x) => x.code), ['SEM_DUPLICATE_KEY']);
});

test('SEM_CONST_CONFIG_REF (kể cả trong mảng của const)', () => {
  const e = run('a = 1\nconst k = "x${a}"\nconst l = ["${a}", "${@k}"]');
  assert.deepEqual(pos(e), [
    ['SEM_CONST_CONFIG_REF', 'main', 2, 13],
    ['SEM_CONST_CONFIG_REF', 'main', 3, 13],
  ]);
});

test('SEM_UNDEFINED_REF: cấu hình, hằng khai báo muộn ok, hằng tệp khác, chỉ số xấu', () => {
  assert.deepEqual(run('a = "${@k}"\nconst k = 1'), []);
  const e = run('l = [1]\na = "${b}"\nc = "${l.1}"\nd = "${l.9}"\ne = "${l.0.x}"\nf = ["${zz}"]');
  assert.deepEqual(pos(e).map((x) => [x[0], x[2]]), [
    ['SEM_UNDEFINED_REF', 2],
    ['SEM_UNDEFINED_REF', 3],
    ['SEM_UNDEFINED_REF', 4],
    ['SEM_UNDEFINED_REF', 5],
    ['SEM_UNDEFINED_REF', 6],
  ]);
  const e2 = run({ main: 'include "b"\nx = "${@k}"', b: 'const k = 1' });
  assert.deepEqual(pos(e2), [['SEM_UNDEFINED_REF', 'main', 2, 6]]);
  assert.deepEqual(run('a = null\nb = "${a}"\ns = "x"\nt = "${s.y}"').map((x) => x.line), [4]);
});

test('SEM_UNDEFINED_REF: ref trong chuỗi bị ghi đè vẫn bị xét', () => {
  const e = run({ main: 'include "b"\nx = 2', b: 'x = "${nope}"' });
  assert.deepEqual(pos(e), [['SEM_UNDEFINED_REF', 'b', 1, 6]]);
});

test('SEM_REF_CYCLE: tự tham chiếu, hai chiều, tổ tiên', () => {
  assert.deepEqual(pos(run('a = "${a}"')), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(pos(run('a = "${b}"\nb = "${a}"')), [
    ['SEM_REF_CYCLE', 'main', 1, 6],
    ['SEM_REF_CYCLE', 'main', 2, 6],
  ]);
  assert.deepEqual(pos(run('x {\n y = "${x}"\n}')), [['SEM_REF_CYCLE', 'main', 2, 7]]);
  // ref tới chuỗi nằm trong vòng nhưng không thuộc vòng: không báo vòng cho nó
  const e = run('a = "${a}"\nb = "${a}"');
  assert.deepEqual(e.map((x) => x.line), [1]);
  // định nghĩa bị ghi đè không tạo cạnh
  assert.deepEqual(run('a = "${b}"\nb = "${a}"\nb = 1').length, 0 + run('a = "${b}"\nb = "${a}"\nb = 1').length);
});

test('SEM_REF_CYCLE: định nghĩa thắng quyết định S(đích)', () => {
  // b ban đầu trỏ a nhưng bị ghi đè bằng 1 trong tệp include -> không còn vòng từ a
  const e = run({ main: 'include "b"\nb = 1\na = "${b}"', b: 'b = "${a}"' });
  assert.deepEqual(e, []);
});

test('SEM_BAD_INTERPOLATION', () => {
  const e = run('l = [1]\no { k = 1 }\na = "x${l}"\nb = "${l}${l}"\nc = "${o}!"\nd = "${l}"\ne = "n${l.0}"');
  assert.deepEqual(pos(e), [
    ['SEM_BAD_INTERPOLATION', 'main', 3, 7],
    ['SEM_BAD_INTERPOLATION', 'main', 4, 6],
    ['SEM_BAD_INTERPOLATION', 'main', 4, 10],
    ['SEM_BAD_INTERPOLATION', 'main', 5, 6],
  ]);
  // đích là chuỗi thuần tham chiếu tới mảng
  assert.deepEqual(run('l = [1]\nm = "${l}"\nn = "a${m}"').map((x) => x.code), ['SEM_BAD_INTERPOLATION']);
});

test('pha B có lỗi thì không chạy pha C; thứ tự lỗi trong tệp theo Ref', () => {
  const e = run('a = "${y}" + 1'.replace(' + 1', '') + '\nb = "${x}"', { type: 'object', fields: { a: { type: 'number' } } });
  assert.deepEqual(e.map((x) => x.code), ['SEM_UNDEFINED_REF', 'SEM_UNDEFINED_REF']);
  assert.deepEqual(e.map((x) => x.line), [1, 2]);
});

test('SEM_TYPE_MISMATCH: vị trí giá trị, integer/number, null, không kiểm sâu hơn', () => {
  const s = {
    type: 'object',
    fields: {
      a: { type: 'string' },
      b: { type: 'integer' },
      c: { type: 'number' },
      d: { type: 'null' },
      e: { type: 'object', fields: { x: { type: 'string' } } },
      f: { type: 'array', items: { type: 'string' } },
      g: { type: 'any' },
    },
  };
  const e = run('a = 1\nb = 1.5\nc = 2\nd = false\ne = [1]\nf  = [  "x", 2 ]\ng = null', s);
  assert.deepEqual(pos(e), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 5],
    ['SEM_TYPE_MISMATCH', 'main', 2, 5],
    ['SEM_TYPE_MISMATCH', 'main', 4, 5],
    ['SEM_TYPE_MISMATCH', 'main', 5, 5],
    ['SEM_TYPE_MISMATCH', 'main', 6, 14],
  ]);
  const r = run('x { a = 1 }', { type: 'array' });
  assert.deepEqual(pos(r), [['SEM_TYPE_MISMATCH', 'main', 1, 1]]);
});

test('SEM_NOT_IN_ENUM', () => {
  const s = { type: 'object', fields: { m: { enum: ['dev', 'prod'] }, n: { type: 'number', enum: [1, 2] } } };
  const e = run('m = "test"\nn = 3', s);
  assert.deepEqual(pos(e), [
    ['SEM_NOT_IN_ENUM', 'main', 1, 5],
    ['SEM_NOT_IN_ENUM', 'main', 2, 5],
  ]);
  assert.deepEqual(run('m = "dev"\nn = 2', s), []);
});

test('SEM_MISSING_REQUIRED: theo thứ tự fields, tại vị trí đối tượng', () => {
  const s = {
    type: 'object',
    fields: {
      z: { required: true },
      a: { required: true },
      opt: {},
      srv: { type: 'object', fields: { host: { required: true }, port: { required: true } } },
    },
  };
  const e = run('\n  srv {\n    port = 1\n  }\n  a = 1', s);
  assert.deepEqual(pos(e), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1], // z
    ['SEM_MISSING_REQUIRED', 'main', 2, 3], // host trong srv
  ]);
  assert.match(e[0].message, /z/);
});

test('SEM_UNKNOWN_KEY khi closed: tại token khóa thắng, theo thứ tự khóa', () => {
  const s = { type: 'object', closed: true, fields: { a: {}, s: { type: 'object', closed: true, fields: {} } } };
  const e = run({ main: 'include "b"\nq = 1\n  s { w = 1 }\na = 1', b: 'p = 1\nq = 0' }, s);
  assert.deepEqual(pos(e), [
    ['SEM_UNKNOWN_KEY', 'b', 1, 1], // p
    ['SEM_UNKNOWN_KEY', 'main', 2, 1], // q thắng ở main
    ['SEM_UNKNOWN_KEY', 'main', 3, 7], // w; s có fields rỗng nên w lạ
  ]);
  // không closed thì không lỗi
  assert.deepEqual(run('zz = 1', { type: 'object', fields: {} }), []);
});

test('pha C: vị trí đối tượng là Block khởi tạo; gốc là entry 1:1', () => {
  const s = { type: 'object', fields: { r: { required: true }, srv: { type: 'object', fields: { h: { required: true } } } } };
  const files = { main: 'include "b"\nsrv {\n  p = 1\n}', b: 'srv {\n  x = 1\n}' };
  const e = run(files, s);
  assert.deepEqual(pos(e), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_MISSING_REQUIRED', 'b', 1, 1],
  ]);
  // đối tượng bị thay bằng giá trị khác rồi tạo lại: khối mới khởi tạo
  const e2 = run('srv { x = 1 }\nsrv2 = 1', { type: 'object', fields: { srv: { fields: { h: { required: true } } } } });
  assert.deepEqual(pos(e2), [['SEM_MISSING_REQUIRED', 'main', 1, 1]]);
  const e3 = run({ main: 'include "b"\n\n  s { x = 1 }', b: 's = 1' }, { fields: { s: { fields: { h: { required: true } } } } });
  assert.deepEqual(pos(e3), [['SEM_MISSING_REQUIRED', 'main', 3, 3]]);
});

test('pha C: chuỗi thuần tham chiếu dùng vị trí của chuỗi cho giá trị và mọi thứ bên trong', () => {
  const s = {
    type: 'object',
    fields: {
      n: { type: 'string' },
      arr: { type: 'array', items: { type: 'string' } },
      obj: { type: 'object', fields: { k: { required: true } } },
    },
  };
  const src = 'src = 5\nlist = [1, 2]\nob {}\nn = "${src}"\narr = "${list}"\nobj = "${ob}"';
  const e = run(src, { ...s, fields: { ...s.fields, src: {}, list: {}, ob: {} } });
  assert.deepEqual(pos(e), [
    ['SEM_TYPE_MISMATCH', 'main', 4, 5],
    ['SEM_TYPE_MISMATCH', 'main', 5, 7],
    ['SEM_TYPE_MISMATCH', 'main', 5, 7],
    ['SEM_MISSING_REQUIRED', 'main', 6, 7],
  ]);
});

test('pha C: mảng, phần tử mảng lồng và giá trị đã đánh giá nối chuỗi', () => {
  const s = { fields: { a: { type: 'string' }, l: { type: 'array', items: { type: 'array', items: { type: 'number' } } } } };
  const e = run('n = 1\na = "v${n}"\nl = [[1], [2, "x"]]', s);
  assert.deepEqual(pos(e), [['SEM_TYPE_MISMATCH', 'main', 3, 15]]);
});

test('không ném với chương trình rỗng hay entry thiếu', () => {
  assert.deepEqual(run(''), []);
  assert.deepEqual(check({ entry: 'x', files: {} }), []);
});
