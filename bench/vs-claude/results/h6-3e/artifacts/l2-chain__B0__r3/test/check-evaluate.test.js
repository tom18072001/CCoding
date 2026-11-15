import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject, check, evaluate, compile } from '../src/index.js';

// vị trí (line, column) của lần xuất hiện thứ n của `needle` trong `src`
const at = (src, needle, n = 0) => {
  let i = -1;
  for (let k = 0; k <= n; k++) i = src.indexOf(needle, i + 1);
  assert.ok(i >= 0, `không thấy ${needle}`);
  const before = src.slice(0, i).split('\n');
  return [before.length, before[before.length - 1].length + 1];
};
const prog = (files, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p));
  return p.program;
};
const errs = (files, schema) => check(prog(files), schema).map((e) => [e.code, e.file, e.line, e.column]);
const one = (src, schema) => errs({ main: src }, schema);
const ev = (files) => {
  const p = prog(files);
  assert.deepEqual(check(p), []);
  return evaluate(p);
};

// ---------------- Pha A ----------------
test('A: SEM_DUPLICATE_KEY — lần 2, 3…, Assign/Block trùng nhau, khối khác không trùng', () => {
  const s = 'a = 1\na = 2\na = 3\nb { x = 1 }\nb = 1\nc { k = 1 }\nd { k = 2 }\ne { k = 1 k = 2 }';
  assert.deepEqual(one(s), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1],
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'main', 5, 1],
    ['SEM_DUPLICATE_KEY', 'main', 8, 11],
  ]);
});

test('A: khóa giống nhau ở tệp khác (kể cả include cùng khối) không phải trùng', () => {
  assert.deepEqual(errs({ main: 'include "b"\nx = 1', b: 'x = 2' }), []);
});

test('A: SEM_DUPLICATE_CONST', () => {
  assert.deepEqual(one('const x = 1\nconst y = 2\nconst x = 3'), [['SEM_DUPLICATE_CONST', 'main', 3, 1]]);
  assert.deepEqual(errs({ main: 'const x = 1\ninclude "b"', b: 'const x = 2' }), []);
});

test('A: SEM_INCLUDE_NOT_FOUND (cả trong khối)', () => {
  const s = 'include "zz"\nblk {\n  include "yy"\n}';
  assert.deepEqual(one(s), [
    ['SEM_INCLUDE_NOT_FOUND', 'main', 1, 1],
    ['SEM_INCLUDE_NOT_FOUND', 'main', 3, 3],
  ]);
});

test('A: SEM_INCLUDE_CYCLE — tự include, vòng hai tệp, hình thoi không phải vòng', () => {
  assert.deepEqual(one('include "main"'), [['SEM_INCLUDE_CYCLE', 'main', 1, 1]]);
  assert.deepEqual(errs({ main: 'include "a"', a: 'x = 1\n include "main"' }), [['SEM_INCLUDE_CYCLE', 'a', 2, 2]]);
  const diamond = { main: 'include "a"\ninclude "b"', a: 'include "d"', b: 'include "d"', d: 'k = 1' };
  assert.deepEqual(errs(diamond), []);
  // d include lại a (đang trên đường duyệt) -> vòng báo tại d
  assert.deepEqual(errs({ ...diamond, d: 'include "a"' }), [['SEM_INCLUDE_CYCLE', 'd', 1, 1]]);
});

test('A: lỗi gom theo tệp theo thứ tự thăm tiền thứ tự', () => {
  const files = {
    main: 'include "a"\nx = 1\nx = 2\ninclude "b"',
    a: 'include "c"\ny = 1\ny = 2',
    b: 'z = 1\nz = 2',
    c: 'include "nope"',
  };
  assert.deepEqual(errs(files), [
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'a', 3, 1],
    ['SEM_INCLUDE_NOT_FOUND', 'c', 1, 1],
    ['SEM_DUPLICATE_KEY', 'b', 2, 1],
  ]);
});

test('A: trong một tệp sắp tăng theo (line, column) dù loại lỗi khác nhau', () => {
  const s = 'include "q"\nconst a = 1\nconst a = 2\nk = 1\nk = 2';
  assert.deepEqual(one(s), [
    ['SEM_INCLUDE_NOT_FOUND', 'main', 1, 1],
    ['SEM_DUPLICATE_CONST', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'main', 5, 1],
  ]);
});

test('pha lỗi dừng pha sau: A chặn B, B chặn C', () => {
  const sc = { fields: { a: { type: 'string' } } };
  assert.deepEqual(one('a = 1\na = 2\nb = "${nope}"', sc).map((e) => e[0]), ['SEM_DUPLICATE_KEY']);
  assert.deepEqual(one('a = 1\nb = "${nope}"', sc).map((e) => e[0]), ['SEM_UNDEFINED_REF']);
  assert.deepEqual(one('a = 1', sc).map((e) => e[0]), ['SEM_TYPE_MISMATCH']);
  assert.deepEqual(one('a = 1', undefined), []);
});

// ---------------- Pha B ----------------
test('B: SEM_CONST_CONFIG_REF — chỉ ref cấu hình trong const; ref hằng trong const được', () => {
  const s = 'const a = "${x}"\nconst b = "${@a}"\nconst c = ["${y}", "${@a}"]\nx = 1\ny = 2';
  assert.deepEqual(one(s), [
    ['SEM_CONST_CONFIG_REF', 'main', ...at(s, '${x}')],
    ['SEM_CONST_CONFIG_REF', 'main', ...at(s, '${y}')],
  ]);
});

test('B: SEM_CONST_CONFIG_REF được kiểm trước SEM_UNDEFINED_REF', () => {
  assert.deepEqual(one('const a = "${nope}"'), [['SEM_CONST_CONFIG_REF', 'main', 1, 12]]);
});

test('B: SEM_UNDEFINED_REF — đường dẫn, chỉ số, xuyên chuỗi/vô hướng, hằng', () => {
  const lines = [
    'a = 1', 'arr = [1, [2, 3]]', 's = "txt"', 'p = "${a}"', 'o { k = null }',
    'ok1 = "${arr.1.0}"', 'ok2 = "${o.k}"', 'ok3 = "${@late}"', 'ok4 = "${@late}"',
    'b1 = "${nope}"', 'b2 = "${a.x}"', 'b3 = "${s.0}"', 'b4 = "${p.x}"', 'b5 = "${arr.2}"',
    'b6 = "${arr.0.0}"', 'b7 = "${arr.x}"', 'b8 = "${@zz}"', 'b9 = "${o.k.z}"', 'b10 = "${@late.0}"',
    'const late = "L"',
  ];
  const s = lines.join('\n');
  const bad = [];
  lines.forEach((ln, i) => {
    if (/^b\d+ =/.test(ln)) bad.push(['SEM_UNDEFINED_REF', 'main', i + 1, ln.indexOf('$') + 1]);
  });
  assert.equal(bad.length, 10);
  assert.deepEqual(one(s), bad);
});

test('B: hằng của tệp khác không thấy được; hằng khai báo sau chỗ dùng thì thấy', () => {
  assert.deepEqual(errs({ main: 'include "b"\nconst c = "x"', b: 'k = "${@c}"' }), [['SEM_UNDEFINED_REF', 'b', 1, 6]]);
  assert.deepEqual(one('k = "${@c}"\nconst c = "x"'), []);
});

test('B: SEM_REF_CYCLE — tự tham chiếu, hai chiều (cả hai ref lỗi), tổ tiên, hằng', () => {
  assert.deepEqual(one('a = "${a}"'), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(one('a = "${b}"\nb = "${a}"'), [['SEM_REF_CYCLE', 'main', 1, 6], ['SEM_REF_CYCLE', 'main', 2, 6]]);
  assert.deepEqual(one('x { y = "${x}" }'), [['SEM_REF_CYCLE', 'main', 1, 10]]);
  assert.deepEqual(one('const a = "${@a}"'), [['SEM_REF_CYCLE', 'main', 1, 12]]);
});

test('B: vòng qua mảng/đối tượng; chuỗi trỏ vào vòng nhưng không nằm trong vòng cũng bị vì tới lại chính nó?', () => {
  // a -> b.c -> a là vòng; d = "${a}" trỏ vào vòng nhưng không thuộc vòng: S(a) = {"${b}"}, từ đó
  // không quay lại d nên d không lỗi.
  const s = 'a = ["${b}"]\nb { c = "${a}" }\nd = "${a}"';
  assert.deepEqual(one(s), [['SEM_REF_CYCLE', 'main', 1, 7], ['SEM_REF_CYCLE', 'main', 2, 10]]);
});

test('B: chuỗi dùng chung đích không phải vòng', () => {
  assert.deepEqual(one('a = "x"\nb = "${a}"\nc = "${a}-${b}"\nd { e = "${a}" }'), []);
});

test('B: SEM_BAD_INTERPOLATION — mảng/đối tượng trong chuỗi không thuần; vô hướng và thuần thì được', () => {
  const s = [
    'arr = [1]', 'obj { k = 1 }', 'n = null', 'b = true', 'num = 1.5', 'str = "s"',
    'p = "${arr}"', 'q = "${obj}"', 'ok = "a${n}${b}${num}${str}"',
    'bad1 = "x${arr}"', 'bad2 = "${obj}${str}"', 'bad3 = "${arr.0}${obj}"',
    'via = "${arr}"', 'bad4 = "t${via}"',
  ].join('\n');
  assert.deepEqual(one(s), [
    ['SEM_BAD_INTERPOLATION', 'main', ...at(s, '${arr}', 1)],
    ['SEM_BAD_INTERPOLATION', 'main', ...at(s, '${obj}', 1)],
    ['SEM_BAD_INTERPOLATION', 'main', ...at(s, '${obj}', 2)],
    ['SEM_BAD_INTERPOLATION', 'main', ...at(s, '${via}')],
  ]);
});

test('B: một Ref tối đa một lỗi; sắp theo (line, column) trong tệp, tệp theo tiền thứ tự', () => {
  const files = {
    main: 'include "b"\nx = ["${n1}", "${n2}"]\nconst c = "${n3}"',
    b: 'y = "${m}"',
  };
  assert.deepEqual(errs(files), [
    ['SEM_UNDEFINED_REF', 'main', 2, 7],
    ['SEM_UNDEFINED_REF', 'main', 2, 16],
    ['SEM_CONST_CONFIG_REF', 'main', 3, 12],
    ['SEM_UNDEFINED_REF', 'b', 1, 6],
  ]);
});

test('B: chuỗi bị ghi đè vẫn được kiểm', () => {
  assert.deepEqual(errs({ main: 'include "b"\nk = 1', b: 'k = "${nope}"' }), [['SEM_UNDEFINED_REF', 'b', 1, 6]]);
});

test('B: ref thấy giá trị cuối cùng của đường dẫn (khai báo muộn / bị include ghi đè)', () => {
  assert.deepEqual(errs({ main: 'r = "${k.z}"\ninclude "b"\nk { z = 1 }', b: 'k = 1' }), []);
  assert.deepEqual(errs({ main: 'include "b"\nk = 1\nr = "${k.z}"', b: 'k { z = 1 }' }), [['SEM_UNDEFINED_REF', 'main', 3, 6]]);
});

// ---------------- Pha C ----------------
test('C: SEM_TYPE_MISMATCH — mọi kiểu, vị trí nút giá trị, không kiểm sâu hơn', () => {
  const src = 'str = 1\nnum = "x"\nint = 1.5\nbool = null\nnul = 0\narr { }\nobj = []\nany = 1\nok = 2';
  const schema = { fields: {
    str: { type: 'string' }, num: { type: 'number' }, int: { type: 'integer' }, bool: { type: 'boolean' },
    nul: { type: 'null' }, arr: { type: 'array' }, obj: { type: 'object' }, any: { type: 'any' }, ok: { type: 'integer' },
  } };
  const r = one(src, schema);
  assert.deepEqual(r.map((e) => e[0]), Array(7).fill('SEM_TYPE_MISMATCH'));
  assert.deepEqual(r[0].slice(1), ['main', 1, 7]);
  assert.deepEqual(r[1].slice(1), ['main', 2, 7]);
  assert.deepEqual(r[5].slice(1), ['main', 6, 1]); // đối tượng: vị trí Block
  assert.equal(one('a = 1', { fields: { a: { type: 'string', enum: ['x'] } } }).length, 1);
  assert.deepEqual(one('a = [1]', { fields: { a: { type: 'object', fields: { k: { required: true } } } } }).map((e) => e[0]), ['SEM_TYPE_MISMATCH']);
  assert.deepEqual(one('a = null', { fields: { a: { type: 'object' } } }).map((e) => e[0]), ['SEM_TYPE_MISMATCH']);
  assert.deepEqual(one('a = 1.0 b = 3', { fields: { a: { type: 'integer' }, b: { type: 'number' } } }), []);
});

test('C: SEM_NOT_IN_ENUM — vô hướng, kể cả null', () => {
  const schema = { fields: { m: { enum: ['a', 'b'] }, n: { enum: [null, 1] }, p: { enum: [1] } } };
  assert.deepEqual(one('m = "c"\nn = null\np = "1"', schema), [['SEM_NOT_IN_ENUM', 'main', 1, 5], ['SEM_NOT_IN_ENUM', 'main', 3, 5]]);
  assert.deepEqual(one('m = "a"', schema), []);
});

test('C: SEM_MISSING_REQUIRED theo thứ tự fields, tại vị trí đối tượng; gốc là entry 1:1', () => {
  const schema = { fields: {
    z: { required: true }, y: { required: true }, srv: { type: 'object', fields: { host: { required: true }, port: { required: false } } },
  } };
  assert.deepEqual(one('\n  srv { port = 1 }', schema), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_MISSING_REQUIRED', 'main', 2, 3],
  ]);
});

test('C: required báo trước, rồi SEM_UNKNOWN_KEY theo thứ tự khóa cấu hình, tại token khóa', () => {
  const schema = { closed: true, fields: { req: { required: true }, k: {} } };
  assert.deepEqual(one('x = 1\nk = 1\n  y { }', schema), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_UNKNOWN_KEY', 'main', 1, 1],
    ['SEM_UNKNOWN_KEY', 'main', 3, 3],
  ]);
});

test('C: closed:true không có fields thì không báo khóa lạ; closed không đặt thì cho phép', () => {
  assert.deepEqual(one('a = 1', { closed: true }), []);
  assert.deepEqual(one('a = 1', { fields: {} }), []);
  assert.deepEqual(one('a = 1', { closed: true, fields: {} }).map((e) => e[0]), ['SEM_UNKNOWN_KEY']);
});

test('C: items áp cho từng phần tử, vị trí phần tử', () => {
  const s = 'l = [1, "x",\n  2, [3]]';
  const schema = { fields: { l: { type: 'array', items: { type: 'integer' } } } };
  assert.deepEqual(one(s, schema), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 9],
    ['SEM_TYPE_MISMATCH', 'main', 2, 6],
  ]);
});

test('C: kiểm trên giá trị đã đánh giá; giá trị từ chuỗi thuần tham chiếu có vị trí của chuỗi đó', () => {
  const s = 'port = 80\nr = "${port}"\nlst = [1, 2]\nl2 = "${lst}"\nobj { k = 1 }\no2 = "${obj}"';
  const schema = { fields: {
    r: { type: 'string' }, l2: { type: 'array', items: { type: 'string' } }, o2: { type: 'object', closed: true, fields: {} },
  } };
  assert.deepEqual(one(s, schema), [
    ['SEM_TYPE_MISMATCH', 'main', 2, 5],
    ['SEM_TYPE_MISMATCH', 'main', 4, 6],
    ['SEM_TYPE_MISMATCH', 'main', 4, 6],
    ['SEM_UNKNOWN_KEY', 'main', 6, 6], // vị trí khóa cũng về chuỗi thuần tham chiếu
  ]);
  assert.deepEqual(one('o { a = 1 }\nc = "${o}"', { fields: { c: { fields: { need: { required: true } } } } }),
    [['SEM_MISSING_REQUIRED', 'main', 2, 5]]);
});

test('C: ref thuần lồng nhau — vị trí là chuỗi ngoài cùng', () => {
  assert.deepEqual(one('a = 5\nb = "${a}"\nc = "${b}"', { fields: { c: { type: 'string' } } }), [['SEM_TYPE_MISMATCH', 'main', 3, 5]]);
});

test('C: nhiều tệp — file/vị trí của giá trị từ tệp include, hợp nhất Block, ghi đè', () => {
  const files = {
    main: 'include "base"\nserver { port = "x"\n  extra = 1 }\nmode = 1',
    base: '\nserver { host = 5 }\nmode = "dev"\nref = "${server.host}"',
  };
  const schema = { closed: true, fields: {
    server: { type: 'object', closed: true, fields: { host: { type: 'string' }, port: { type: 'integer' }, need: { required: true } } },
    mode: { type: 'string' },
    ref: { type: 'string' },
  } };
  assert.deepEqual(errs(files, schema), [
    ['SEM_MISSING_REQUIRED', 'base', 2, 1], // Block khởi tạo đối tượng nằm ở base
    ['SEM_TYPE_MISMATCH', 'base', 2, 17],   // host = 5
    ['SEM_TYPE_MISMATCH', 'main', 2, 17],   // port = "x"
    ['SEM_UNKNOWN_KEY', 'main', 3, 3],      // extra
    ['SEM_TYPE_MISMATCH', 'main', 4, 8],    // mode = 1 (ghi đè sau include)
    ['SEM_TYPE_MISMATCH', 'base', 4, 7],    // ref: chuỗi thuần tham chiếu nằm ở base
  ]);
});

test('C: Block đè giá trị khác thì đối tượng mới có vị trí Block mới; Assign đè Block', () => {
  const files = { main: 'include "b"\nk { x = 1 }', b: 'k = 1' };
  assert.deepEqual(errs(files, { fields: { k: { fields: { need: { required: true } } } } }), [['SEM_MISSING_REQUIRED', 'main', 2, 1]]);
  const f2 = { main: 'include "b"\nk = 1', b: 'k { x = 1 }' };
  assert.deepEqual(errs(f2, { fields: { k: { type: 'object' } } }), [['SEM_TYPE_MISMATCH', 'main', 2, 5]]);
});

test('C: khóa lạ giữ vị trí khóa ở nơi khóa xuất hiện lần đầu khi là Assign bị ghi đè', () => {
  // quy ước đã chốt: vị trí khóa là của câu lệnh thắng (Assign sau cùng)
  const files = { main: 'include "b"\nu = 2', b: 'u = 1' };
  assert.deepEqual(errs(files, { closed: true, fields: {} }), [['SEM_UNKNOWN_KEY', 'main', 2, 1]]);
});

// ---------------- evaluate ----------------
test('evaluate: ví dụ SPEC mục 9 và include/ghi đè', () => {
  assert.deepEqual(ev({ main: 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }' }),
    { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
  const r = ev({ main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"', 'base.cfg': 'server { host = "a" port = 1 }\nmode = "dev"' });
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
});

test('evaluate: thứ tự khóa là lần xuất hiện đầu; ghi đè không đổi chỗ', () => {
  const r = ev({ main: 'include "b"\nb = 9\nc = 1', b: 'a = 1\nb = 2\nc { x = 1 }' });
  assert.deepEqual(Object.keys(r), ['a', 'b', 'c']);
  assert.deepEqual(r, { a: 1, b: 9, c: 1 });
});

test('evaluate: Block gộp sâu; Assign/Block thay thế; mảng không trộn; include trong khối', () => {
  const r = ev({
    main: 'a { x = 1 y { p = 1 } }\ninclude "m"\nb { z = 1 }\narr = [1, 2]\ninclude "o"',
    m: 'a { y { q = 2 } w = 3 }\narr = [9]\nb = 1\nblk { include "n" }\nc = 1',
    n: 'in = "${a.x}"',
    o: 'c { d = 1 }',
  });
  assert.deepEqual(r, { a: { x: 1, y: { p: 1, q: 2 }, w: 3 }, arr: [1, 2], c: { d: 1 }, blk: { in: 1 }, b: { z: 1 } });
  assert.deepEqual(Object.keys(r), ['a', 'arr', 'b', 'blk', 'c']);
});

test('evaluate: ref thấy giá trị cuối cùng (khai báo muộn / bị include ghi đè)', () => {
  const r = ev({ main: 'r = "${k}"\nt = "v=${k}"\ninclude "b"\nk = "late"', b: 'k = 1' });
  assert.deepEqual(r, { r: 'late', t: 'v=late', k: 'late' });
});

test('evaluate: chuỗi thuần ref giữ kiểu, nối chuỗi đúng định dạng', () => {
  const r = ev({ main: 'n = 1.50\nbig = 1e21\nt = true\nz = null\ns = "x"\ne = ""\n'
    + 'p1 = "${n}"\np2 = "${z}"\np3 = "${t}"\n'
    + 'i = "${n}|${big}|${t}|${z}|${s}|$"' });
  assert.equal(r.p1, 1.5);
  assert.equal(r.p2, null);
  assert.equal(r.p3, true);
  assert.equal(r.i, '1.5|1e+21|true|null|x|$');
  assert.equal(r.e, '');
});

test('evaluate: nội suy lồng, ref hằng với chỉ mục, hằng theo tệp chứa chuỗi', () => {
  const r = ev({
    main: 'const lst = ["a", "b"]\nconst base = "B-${@lst.1}"\na = "${b}"\nb = "[${c}]"\nc = "${@base}/${@lst.0}"\nd = "${@lst}"\n',
  });
  assert.deepEqual(r, { a: '[B-b/a]', b: '[B-b/a]', c: 'B-b/a', d: ['a', 'b'] });
  const r2 = ev({ main: 'const c = "M"\nx = "${@c}"\ninclude "b"', b: 'const c = "B"\ny = "${@c}"' });
  assert.deepEqual(r2, { x: 'M', y: 'B' });
});

test('evaluate: ref thuần tới mảng/đối tượng không chia sẻ tham chiếu', () => {
  const r = ev({ main: 'l = [1, [2]]\no { k = [1] }\na = "${l}"\nb = "${l}"\nc = "${o}"\nd = "${o}"' });
  assert.deepEqual(r.a, [1, [2]]);
  assert.notEqual(r.a, r.b);
  assert.notEqual(r.a, r.l);
  assert.notEqual(r.a[1], r.b[1]);
  assert.notEqual(r.c, r.d);
  assert.notEqual(r.c.k, r.d.k);
  r.a.push(3);
  assert.deepEqual(r.b, [1, [2]]);
});

test('evaluate: ref qua mảng lồng, tới null, chuỗi trong mảng', () => {
  const r = ev({ main: 'm = [[1, 2], ["${x}"]]\nx = null\ny = "${m.1.0}"\nz = "${m.0.1}"\nw = "n:${x}"' });
  assert.deepEqual(r, { m: [[1, 2], [null]], x: null, y: null, z: 2, w: 'n:null' });
});

test('evaluate: khóa __proto__ là khóa thường, không đổi prototype', () => {
  const r = ev({ main: '__proto__ { x = 1 }\nok = 1\nq = "${__proto__.x}"' });
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
  assert.deepEqual(Object.keys(r), ['__proto__', 'ok', 'q']);
  assert.equal(Object.getOwnPropertyDescriptor(r, '__proto__').value.x, 1);
  assert.equal(r.q, 1);
  assert.equal(r.x, undefined);
  const r2 = ev({ main: '__proto__ = 5' });
  assert.equal(Object.getPrototypeOf(r2), Object.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(r2, '__proto__').value, 5);
});

test('evaluate: kết quả là JSON thuần; rỗng thì {}', () => {
  const r = ev({ main: 'a { b { } }\nl = []' });
  assert.deepEqual(r, { a: { b: {} }, l: [] });
  assert.deepEqual(ev({ main: '# trống' }), {});
});

test('compile: pha parse/check/ok qua API công khai', () => {
  assert.equal(compile({ main: 'a = ' }, 'main').stage, 'parse');
  const c = compile({ main: 'a = "${x}"' }, 'main');
  assert.equal(c.stage, 'check');
  assert.equal(c.errors[0].code, 'SEM_UNDEFINED_REF');
  assert.deepEqual(compile({ main: 'a = 1' }, 'main', { fields: { a: { type: 'integer' } } }), { ok: true, config: { a: 1 } });
  assert.equal(compile({ main: 'a = 1' }, 'main', { fields: { a: { type: 'string' } } }).errors[0].code, 'SEM_TYPE_MISMATCH');
});
