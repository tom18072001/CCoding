import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const prog = (files, entry = 'main') => {
  const r = parseProject(typeof files === 'string' ? { main: files } : files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.program;
};
const errs = (files, schema, entry) => check(prog(files, entry), schema).map((e) => [e.code, e.file, e.line, e.column]);
const codes = (files, schema) => check(prog(files), schema).map((e) => e.code);
const M = (line, column, code) => [code, 'main', line, column];

test('check: chương trình hợp lệ trả mảng rỗng · check: lỗi có đủ code, message, file, line, column', () => {
  {
    assert.deepEqual(check(prog('a = 1\nb { c = "${a}" }')), []);
    assert.deepEqual(check(prog('')), []);
  }
  {
    const e = check(prog('a = 1\na = 2'));
    assert.equal(e.length, 1);
    assert.deepEqual(Object.keys(e[0]).sort(), ['code', 'column', 'file', 'line', 'message']);
    assert.equal(typeof e[0].message, 'string');
  }
});

test('A: khóa trùng báo ở lần xuất hiện thứ hai, thứ ba…', () => {
  assert.deepEqual(errs('a = 1\nb = 2\n  a = 3\na = 4'), [M(3, 3, 'SEM_DUPLICATE_KEY'), M(4, 1, 'SEM_DUPLICATE_KEY')]);
});

test('A: Assign và Block cùng khóa là trùng, theo cả hai thứ tự · A: trùng khóa trong khối lồng nhau; khóa giống nhau ở khối khác nhau không trùng', () => {
  {
    assert.deepEqual(errs('a = 1\na { x = 1 }'), [M(2, 1, 'SEM_DUPLICATE_KEY')]);
    assert.deepEqual(errs('a { x = 1 }\na = 1'), [M(2, 1, 'SEM_DUPLICATE_KEY')]);
    assert.deepEqual(errs('a { x = 1 }\na { y = 1 }'), [M(2, 1, 'SEM_DUPLICATE_KEY')]);
  }
  {
    assert.deepEqual(errs('a { x = 1\n  y = 2\n  x = 3 }\nb { x = 1 y = 1 }'), [M(3, 3, 'SEM_DUPLICATE_KEY')]);
    assert.deepEqual(errs('x = 1\na { x = 1 }\nb { x = 2 a { x = 3 } }'), []);
  }
});

test('A: include vào cùng khối không gây trùng khóa; khóa sau include ghi đè hợp lệ · A: trùng const trong một tệp; const trùng tên khóa thì không', () => {
  {
    assert.deepEqual(errs({ main: 'include "b"\na = 2\nblk { include "b" k = 1 }', b: 'a = 1\nk = 0' }), []);
  }
  {
    assert.deepEqual(errs('const c = 1\nconst d = 2\nconst c = 3\nconst c = 4'), [M(3, 1, 'SEM_DUPLICATE_CONST'), M(4, 1, 'SEM_DUPLICATE_CONST')]);
    assert.deepEqual(errs('const c = 1\nc = 2'), []);
    assert.deepEqual(errs({ main: 'const c = 1\ninclude "b"', b: 'const c = 2' }), []);
  }
});

test('A: include không tồn tại', () => {
  assert.deepEqual(errs('x = 1\n  include "nope.cfg"\nblk { include "zzz" }'), [M(2, 3, 'SEM_INCLUDE_NOT_FOUND'), M(3, 7, 'SEM_INCLUDE_NOT_FOUND')]);
});

test('A: vòng include — tự include và vòng qua tệp khác báo ở tệp chứa câu lệnh include', () => {
  assert.deepEqual(errs({ main: 'x = 1\ninclude "main"' }), [M(2, 1, 'SEM_INCLUDE_CYCLE')]);
  assert.deepEqual(errs({ main: 'include "b"', b: 'y = 1\n  include "main"' }), [['SEM_INCLUDE_CYCLE', 'b', 2, 3]]);
  assert.deepEqual(errs({ main: 'include "b"', b: 'include "c"', c: 'include "b"' }), [['SEM_INCLUDE_CYCLE', 'c', 1, 1]]);
});

test('A: include hình thoi không phải vòng và tệp chung chỉ được kiểm một lần', () => {
  const files = { main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'k = 1\nk = 2' };
  assert.deepEqual(errs(files), [['SEM_DUPLICATE_KEY', 'd', 2, 1]]);
});

test('A: lỗi gom theo tệp theo thứ tự thăm tiền thứ tự, trong tệp theo (dòng, cột) · A: trong một tệp, các loại lỗi pha A sắp xen kẽ theo vị trí', () => {
  {
    const files = {
      z: 'q = 1\nq = 2',
      b: 'p = 1\np = 2',
      main: 'blk { include "z" }\nw = 1\nw = 2\ninclude "b"\ninclude "nope"',
    };
    assert.deepEqual(errs(files), [
      ['SEM_DUPLICATE_KEY', 'main', 3, 1],
      ['SEM_INCLUDE_NOT_FOUND', 'main', 5, 1],
      ['SEM_DUPLICATE_KEY', 'z', 2, 1],
      ['SEM_DUPLICATE_KEY', 'b', 2, 1],
    ]);
  }
  {
    assert.deepEqual(errs('include "x"\na = 1\nconst c = 1\na = 2\nconst c = 2\ninclude "y"'), [
      M(1, 1, 'SEM_INCLUDE_NOT_FOUND'), M(4, 1, 'SEM_DUPLICATE_KEY'), M(5, 1, 'SEM_DUPLICATE_CONST'), M(6, 1, 'SEM_INCLUDE_NOT_FOUND'),
    ]);
  }
});

test('pha A có lỗi thì không chạy pha B và pha C', () => {
  assert.deepEqual(codes('a = 1\na = 2\nb = "${nope}"'), ['SEM_DUPLICATE_KEY']);
  assert.deepEqual(codes('a = 1\na = 2', { type: 'object', fields: { a: { type: 'string' } } }), ['SEM_DUPLICATE_KEY']);
});

test('B: tham chiếu không tồn tại, vị trí tại ký tự $ · B: phân giải đường dẫn qua khối, mảng, null và tham chiếu tới khóa khai báo muộn hơn', () => {
  {
    assert.deepEqual(errs('a = 1\nb = "xx ${c}"'), [M(2, 9, 'SEM_UNDEFINED_REF')]);
    assert.deepEqual(errs('s { u = "${s.nope}" }'), [M(1, 10, 'SEM_UNDEFINED_REF')]);
  }
  {
    const src = 'r = "${s.t.u} ${l.1} ${l.2.0} ${z} ${later}"\ns { t { u = 1 } }\nl = [10, 20, [30]]\nz = null\nlater = "ok"';
    assert.deepEqual(errs(src), []);
  }
});

test('B: chỉ số mảng không hợp lệ hoặc vượt giới hạn, đi xuyên chuỗi/vô hướng, khóa kế thừa → không tồn tại', () => {
  const src = 'l = [1]\ns = "str"\nn = 5\nr1 = "${l.1}"\nr2 = "${s.x}"\nr3 = "${n.x}"\nr4 = "${l.x}"\nr5 = "${toString}"\nr6 = "${constructor}"';
  assert.deepEqual(errs(src), [4, 5, 6, 7, 8, 9].map((l) => M(l, 7, 'SEM_UNDEFINED_REF')));
});

test('B: không đi xuyên qua chuỗi dù chuỗi đó thuần tham chiếu tới đối tượng · B: tham chiếu thấy giá trị cuối cùng sau hợp nhất (khối bị thay bằng vô hướng, và ngược lại)', () => {
  {
    assert.deepEqual(errs('o { k = 1 }\np = "${o}"\nr = "${p.k}"'), [M(3, 6, 'SEM_UNDEFINED_REF')]);
  }
  {
    assert.deepEqual(errs({ main: 'include "b"\ns = 2\nr = "${s.x}"', b: 's { x = 1 }' }), [M(3, 6, 'SEM_UNDEFINED_REF')]);
    assert.deepEqual(errs({ main: 'include "b"\ns { x = 1 }\nr = "${s.x}"', b: 's = 2' }), []);
    assert.deepEqual(errs({ main: 'include "b"\nr = "${h}"', b: 'h = "x"' }), []);
  }
});

test('B: hằng — khai báo ở đâu trong cùng tệp cũng được, không thấy hằng của tệp khác', () => {
  assert.deepEqual(errs('a = "${@c}"\nconst c = 1'), []);
  assert.deepEqual(errs('blk { a = "${@c}" }\nconst c = [5, [6]]\nb = "${@c.1.0}"'), []);
  assert.deepEqual(errs({ main: 'const c = 1\ninclude "b"', b: 'x = "${@c}"' }), [['SEM_UNDEFINED_REF', 'b', 1, 6]]);
  assert.deepEqual(errs('const c = "s"\nx = "${@c.y}"\ny = "${@c.0}"'), [M(2, 6, 'SEM_UNDEFINED_REF'), M(3, 6, 'SEM_UNDEFINED_REF')]);
  assert.deepEqual(errs('const c = 1\nx = "${@d}"'), [M(2, 6, 'SEM_UNDEFINED_REF')]);
});

test('B: SEM_CONST_CONFIG_REF — hằng không được tham chiếu cấu hình, được tham chiếu hằng', () => {
  assert.deepEqual(errs('a = 1\nconst c = "${a}"'), [M(2, 12, 'SEM_CONST_CONFIG_REF')]);
  assert.deepEqual(errs('const d = 1\nconst c = ["x", "${@d}"]'), []);
  assert.deepEqual(errs('const c = [["${nope}"]]'), [M(1, 14, 'SEM_CONST_CONFIG_REF')]);
});

test('B: một Ref chỉ sinh một lỗi theo ưu tiên CONST_CONFIG > UNDEFINED > CYCLE > BAD_INTERPOLATION', () => {
  assert.deepEqual(codes('const c = "${zz}"'), ['SEM_CONST_CONFIG_REF']);
  assert.deepEqual(codes('a = "x${a}"\nl = [1]\nb = "${nope}${l}"'), ['SEM_REF_CYCLE', 'SEM_UNDEFINED_REF', 'SEM_BAD_INTERPOLATION']);
});

test('B: vòng tham chiếu — tự tham chiếu, hai chiều (cả hai Ref đều lỗi), ba chiều', () => {
  assert.deepEqual(errs('a = "${a}"'), [M(1, 6, 'SEM_REF_CYCLE')]);
  assert.deepEqual(errs('a = "${b}"\nb = "${a}"'), [M(1, 6, 'SEM_REF_CYCLE'), M(2, 6, 'SEM_REF_CYCLE')]);
  assert.deepEqual(errs('a = "${b}"\nb = "${c}"\nc = "x${a}"'), [M(1, 6, 'SEM_REF_CYCLE'), M(2, 6, 'SEM_REF_CYCLE'), M(3, 7, 'SEM_REF_CYCLE')]);
});

test('B: vòng tham chiếu tới tổ tiên hoặc qua mảng/đối tượng chứa chuỗi · B: chuỗi chỉ phụ thuộc không phải là vòng; tham chiếu anh em và chuỗi dài không vòng', () => {
  {
    assert.deepEqual(errs('x { y = "${x}" }'), [M(1, 10, 'SEM_REF_CYCLE')]);
    assert.deepEqual(errs('l = ["${l}"]'), [M(1, 7, 'SEM_REF_CYCLE')]);
    assert.deepEqual(errs('o { n = "${p}" }\np { m = "${o.n}" }'), [M(1, 10, 'SEM_REF_CYCLE'), M(2, 10, 'SEM_REF_CYCLE')]);
  }
  {
    assert.deepEqual(errs('a = "${b}"\nb = "${c}"\nc = 1\ns { x = 1 y = "${s.x}" z = "${s.y}" }'), []);
    assert.deepEqual(errs('a = "${b} ${b}"\nb = "v"'), []);
    const chain = Array.from({ length: 50 }, (_, i) => `k${i} = "\${k${i + 1}}"`).join('\n') + '\nk50 = 1';
    assert.deepEqual(errs(chain), []);
  }
});

test('B: định nghĩa bị ghi đè không tính vào vòng (chỉ tính định nghĩa thắng)', () => {
  assert.deepEqual(errs({ main: 'include "b"\na = 1', b: 'a = "${a}"' }), []);
  assert.deepEqual(errs({ main: 'include "b"\na = "${b}"\nb = 1', b: 'a = "${a}"' }), []);
});

test('B: chuỗi bị ghi đè vẫn được kiểm tham chiếu, báo ở tệp chứa nó', () => {
  assert.deepEqual(errs({ main: 'include "b"\na = 1', b: 'p = 0\na = "${nope}"' }), [['SEM_UNDEFINED_REF', 'b', 2, 6]]);
});

test('B: SEM_BAD_INTERPOLATION — chỉ khi chuỗi không thuần tham chiếu và đích là mảng/đối tượng · B: đích là chuỗi thuần tham chiếu tới mảng, nội suy giữa chuỗi → lỗi', () => {
  {
    const src = 'l = [1]\no { k = 1 }\nn = null\nok1 = "${l}"\nok2 = "${o}"\nok3 = "v${n} ${l.0}"\nbad1 = "v${l}"\nbad2 = "${o}${n}"\nbad3 = "${n}${l}"\nbad4 = ["${o} x"]';
    assert.deepEqual(errs(src), [M(7, 10, 'SEM_BAD_INTERPOLATION'), M(8, 9, 'SEM_BAD_INTERPOLATION'), M(9, 13, 'SEM_BAD_INTERPOLATION'), M(10, 10, 'SEM_BAD_INTERPOLATION')]);
  }
  {
    assert.deepEqual(errs('l = [1]\np = "${l}"\nq = "x${p}"'), [M(3, 7, 'SEM_BAD_INTERPOLATION')]);
  }
});

test('B: lỗi sắp theo tệp (tiền thứ tự) rồi theo vị trí Ref trong tệp', () => {
  const files = { main: 'x = "${m2}"\ninclude "b"\ny = "${m1} ${m0}"', b: 'p = "${q}"' };
  assert.deepEqual(errs(files), [
    ['SEM_UNDEFINED_REF', 'main', 1, 6], ['SEM_UNDEFINED_REF', 'main', 3, 6], ['SEM_UNDEFINED_REF', 'main', 3, 12], ['SEM_UNDEFINED_REF', 'b', 1, 6],
  ]);
});

test('pha B có lỗi thì không chạy pha C', () => {
  assert.deepEqual(codes('a = "${zz}"', { type: 'object', fields: { a: { type: 'number' } } }), ['SEM_UNDEFINED_REF']);
});

const S = (fields, extra = {}) => ({ type: 'object', fields, ...extra });

test('C: không có schema thì không có lỗi pha C; any chấp nhận mọi thứ · C: SEM_TYPE_MISMATCH tại vị trí nút giá trị (không phải khóa)', () => {
  {
    assert.deepEqual(codes('a = 1'), []);
    assert.deepEqual(codes('a = [1]\nb { c = null }', S({ a: { type: 'any' }, b: { type: 'any' } })), []);
  }
  {
    const src = 'a = "s"\nb =   5\nc = true\nd = null\ne = [1]\nf { x = 1 }\ng = 1.5';
    const schema = S({ a: { type: 'number' }, b: { type: 'string' }, c: { type: 'null' }, d: { type: 'boolean' }, e: { type: 'object' }, f: { type: 'array' }, g: { type: 'integer' } });
    assert.deepEqual(errs(src, schema), [
      M(1, 5, 'SEM_TYPE_MISMATCH'), M(2, 7, 'SEM_TYPE_MISMATCH'), M(3, 5, 'SEM_TYPE_MISMATCH'), M(4, 5, 'SEM_TYPE_MISMATCH'),
      M(5, 5, 'SEM_TYPE_MISMATCH'), M(6, 1, 'SEM_TYPE_MISMATCH'), M(7, 5, 'SEM_TYPE_MISMATCH'),
    ]);
  }
});

test('C: kiểu khớp — number nhận số nguyên, integer nhận 2 và 2.0, null chỉ nhận null · C: không kiểm sâu hơn sau khi lệch kiểu; enum bỏ qua khi lệch kiểu', () => {
  {
    const src = 'a = 1\nb = 2.5\nc = 2\nd = 2.0\ne = null\nf = []\ng { }\nh = "x"\ni = false';
    const schema = S({ a: { type: 'number' }, b: { type: 'number' }, c: { type: 'integer' }, d: { type: 'integer' }, e: { type: 'null' }, f: { type: 'array' }, g: { type: 'object' }, h: { type: 'string' }, i: { type: 'boolean' } });
    assert.deepEqual(errs(src, schema), []);
  }
  {
    const schema = S({ a: { type: 'string', enum: ['x'], fields: { z: { required: true } } } });
    assert.deepEqual(codes('a { k = 1 }', schema), ['SEM_TYPE_MISMATCH']);
    assert.deepEqual(codes('a = 5', schema), ['SEM_TYPE_MISMATCH']);
  }
});

test('C: enum so sánh bằng ===', () => {
  const schema = S({ m: { enum: ['dev', 'prod'] }, n: { enum: [1, 2] }, b: { enum: [true] } });
  assert.deepEqual(errs('m = "stage"\nn = "1"\nb = false', schema), [M(1, 5, 'SEM_NOT_IN_ENUM'), M(2, 5, 'SEM_NOT_IN_ENUM'), M(3, 5, 'SEM_NOT_IN_ENUM')]);
  assert.deepEqual(codes('m = "dev"\nn = 2\nb = true', schema), []);
});

test('C: SEM_MISSING_REQUIRED theo thứ tự khóa của schema, tại vị trí đối tượng · C: required được thỏa bởi giá trị null; thiếu khi khóa không có', () => {
  {
    const schema = S({ z: { required: true }, a: { required: true }, ok: {} , opt: { required: false } });
    assert.deepEqual(errs('ok = 1', schema), [M(1, 1, 'SEM_MISSING_REQUIRED'), M(1, 1, 'SEM_MISSING_REQUIRED')]);
    assert.deepEqual(errs('\n\nblk { }', S({ blk: { type: 'object', fields: { q: { required: true } } } })), [M(3, 1, 'SEM_MISSING_REQUIRED')]);
  }
  {
    const schema = S({ a: { required: true } });
    assert.deepEqual(codes('a = null', schema), []);
    assert.deepEqual(codes('b = 1', schema), ['SEM_MISSING_REQUIRED']);
  }
});

test('C: closed — khóa lạ báo tại token khóa; mở thì bỏ qua', () => {
  const schema = S({ a: {} }, { closed: true });
  assert.deepEqual(errs('a = 1\n  zz = "x"\nblk { }', schema), [M(2, 3, 'SEM_UNKNOWN_KEY'), M(3, 1, 'SEM_UNKNOWN_KEY')]);
  assert.deepEqual(codes('a = 1\nzz = 2', S({ a: {} })), []);
});

test('C: SEM_UNKNOWN_KEY dùng vị trí định nghĩa thắng sau include', () => {
  const files = { main: 'include "b"\n k = 2', b: 'k = 1' };
  assert.deepEqual(errs(files, S({}, { closed: true })), [M(2, 2, 'SEM_UNKNOWN_KEY')]);
});

test('C: thứ tự lỗi — thiếu bắt buộc trước, rồi theo thứ tự khóa của cấu hình hợp nhất', () => {
  const schema = S({ need: { required: true }, b: { type: 'string' }, a: { type: 'string' } }, { closed: true });
  const src = 'b = 1\nx = 0\na = 2\ny = 0';
  assert.deepEqual(errs(src, schema), [
    M(1, 1, 'SEM_MISSING_REQUIRED'), M(1, 5, 'SEM_TYPE_MISMATCH'), M(2, 1, 'SEM_UNKNOWN_KEY'), M(3, 5, 'SEM_TYPE_MISMATCH'), M(4, 1, 'SEM_UNKNOWN_KEY'),
  ]);
});

test('C: đệ quy vào đối tượng lồng nhau và mảng items theo chỉ số · C: items áp cho mảng lồng — mảng trong mảng', () => {
  {
    const schema = S({ srv: { type: 'object', fields: { port: { type: 'integer', required: true }, tags: { type: 'array', items: { type: 'string' } } } } });
    const src = 'srv {\n  port = "80"\n  tags = ["a", 2,\n    "c", null]\n}';
    assert.deepEqual(errs(src, schema), [M(2, 10, 'SEM_TYPE_MISMATCH'), M(3, 16, 'SEM_TYPE_MISMATCH'), M(4, 10, 'SEM_TYPE_MISMATCH')]);
    assert.deepEqual(errs('srv { tags = [] }', schema), [M(1, 1, 'SEM_MISSING_REQUIRED')]);
  }
  {
    const schema = S({ m: { type: 'array', items: { type: 'array', items: { type: 'number' } } } });
    assert.deepEqual(errs('m = [[1, 2], [3, "x"], 4]', schema), [M(1, 18, 'SEM_TYPE_MISMATCH'), M(1, 24, 'SEM_TYPE_MISMATCH')]);
  }
});

test('C: vị trí đối tượng là khối đã khởi tạo nó (khối đầu tiên, tệp include)', () => {
  const schema = S({ s: { type: 'object', fields: { need: { required: true } } } });
  assert.deepEqual(errs({ main: 'include "b"\ns { x = 1 }', b: '\n s { y = 1 }' }, schema), [['SEM_MISSING_REQUIRED', 'b', 2, 2]]);
  assert.deepEqual(errs({ main: 'include "b"\n s { x = 1 }', b: 's = 5' }, schema), [M(2, 2, 'SEM_MISSING_REQUIRED')]);
  assert.deepEqual(errs({ main: 'include "b"\n s { x = 1 }', b: 'q = 1\n s { y = 1 }' }, schema), [['SEM_MISSING_REQUIRED', 'b', 2, 2]]);
});

test('C: gốc thiếu khóa bắt buộc báo ở tệp entry 1:1', () => {
  assert.deepEqual(errs({ other: 'x = 1', main: '\n\ninclude "other"' }, S({ need: { required: true } })), [M(1, 1, 'SEM_MISSING_REQUIRED')]);
  assert.deepEqual(errs({ main: '\n a = 1' }, { type: 'array' }), [M(1, 1, 'SEM_TYPE_MISMATCH')]);
});

test('C: giá trị đến từ chuỗi thuần tham chiếu được báo tại vị trí chuỗi đó, cho cả phần bên trong', () => {
  const schema = S({
    p: { type: 'object', fields: { n: { type: 'number' }, need: { required: true } } },
    q: { type: 'string' },
    r: { type: 'array', items: { type: 'string' } },
  });
  const src = 'o { n = "x" }\n  p = "${o}"\nq = "${o}"\nl = [1]\nr = "${l}"';
  assert.deepEqual(errs(src, S({ o: {}, ...schema.fields })), [
    M(2, 7, 'SEM_MISSING_REQUIRED'), M(2, 7, 'SEM_TYPE_MISMATCH'), M(3, 5, 'SEM_TYPE_MISMATCH'), M(5, 5, 'SEM_TYPE_MISMATCH'),
  ]);
});

test('C: kiểu của chuỗi nội suy là string; thuần tham chiếu mang kiểu gốc', () => {
  const schema = S({ a: { type: 'string' }, b: { type: 'number' }, c: { type: 'string' } });
  assert.deepEqual(codes('n = 5\na = "v${n}"\nb = "${n}"\nc = "${n}"', S({ n: {}, ...schema.fields })), ['SEM_TYPE_MISMATCH']);
});
