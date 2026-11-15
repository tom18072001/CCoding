import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

function run(files, schema, entry = 'main') {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p.error));
  return check(p.program, schema);
}
const brief = (errs) => errs.map((e) => [e.code, e.file, e.line, e.column]);

test('pha A: SEM_DUPLICATE_KEY — lần sau, Assign+Block, mỗi lần một lỗi', () => {
  const errs = run({ main: 'a = 1\na = 2\na { }\nb { c = 1 c = 2 }\nc = 1' });
  assert.deepEqual(brief(errs), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1],
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'main', 4, 11],
  ]);
});

test('pha A: khóa trùng giữa tệp khác nhau / khối khác nhau không bị báo', () => {
  const errs = run({ main: 'a = 1\ninclude "o"\nx { a = 1 }', o: 'a = 2\nx { a = 3 }' });
  assert.deepEqual(errs, []);
});

test('pha A: SEM_DUPLICATE_CONST', () => {
  const errs = run({ main: 'const a = 1\nconst b = 2\nconst a = 3' });
  assert.deepEqual(brief(errs), [['SEM_DUPLICATE_CONST', 'main', 3, 1]]);
});

test('pha A: SEM_INCLUDE_NOT_FOUND', () => {
  const errs = run({ main: 'x { include "nope" }' });
  assert.deepEqual(brief(errs), [['SEM_INCLUDE_NOT_FOUND', 'main', 1, 5]]);
});

test('pha A: SEM_INCLUDE_CYCLE (tự include và vòng a→b→a)', () => {
  assert.deepEqual(brief(run({ main: 'include "main"' })), [['SEM_INCLUDE_CYCLE', 'main', 1, 1]]);
  const errs = run({ main: 'include "b"', b: 'x = 1\ninclude "main"' });
  assert.deepEqual(brief(errs), [['SEM_INCLUDE_CYCLE', 'b', 2, 1]]);
});

test('pha A: include hình thoi không phải vòng', () => {
  const errs = run({
    main: 'include "b"\ninclude "c"',
    b: 'include "d"',
    c: 'include "d"',
    d: 'k = 1',
  });
  assert.deepEqual(errs, []);
});

test('pha A: lỗi gom theo tệp (thứ tự thăm), trong tệp sắp theo vị trí', () => {
  const errs = run({
    main: 'include "b"\na = 1\na = 2',
    b: 'z = 1\nz = 2\ninclude "none"',
  });
  assert.deepEqual(brief(errs), [
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'b', 2, 1],
    ['SEM_INCLUDE_NOT_FOUND', 'b', 3, 1],
  ]);
});

test('pha A chặn pha B', () => {
  const errs = run({ main: 'a = 1\na = 2\nb = "${zzz}"' });
  assert.deepEqual(errs.map((e) => e.code), ['SEM_DUPLICATE_KEY']);
});

test('pha B: SEM_UNDEFINED_REF (config, chỉ mục, qua chuỗi, hằng tệp khác)', () => {
  const errs = run({
    main: 'include "o"\na = "${nope}"\nl = [1]\nb = "${l.1}"\ns = "x"\nc = "${s.y}"\nd = "${@k}"',
    o: 'const k = 1',
  });
  assert.deepEqual(errs.map((e) => [e.code, e.line, e.column]), [
    ['SEM_UNDEFINED_REF', 2, 6],
    ['SEM_UNDEFINED_REF', 4, 6],
    ['SEM_UNDEFINED_REF', 6, 6],
    ['SEM_UNDEFINED_REF', 7, 6],
  ]);
});

test('pha B: hằng thấy trong toàn tệp, kể cả khai báo sau', () => {
  assert.deepEqual(run({ main: 'a = "${@c}"\nconst c = 1' }), []);
});

test('pha B: SEM_CONST_CONFIG_REF ưu tiên hơn UNDEFINED_REF', () => {
  const errs = run({ main: 'x = 1\nconst c = "${x}"\nconst d = "${nope}"\nconst e = "${@c}"' });
  assert.deepEqual(brief(errs), [
    ['SEM_CONST_CONFIG_REF', 'main', 2, 12],
    ['SEM_CONST_CONFIG_REF', 'main', 3, 12],
  ]);
});

test('pha B: SEM_REF_CYCLE — ba ví dụ mục 5', () => {
  assert.deepEqual(brief(run({ main: 'a = "${a}"' })), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(brief(run({ main: 'a = "${b}"\nb = "${a}"' })), [
    ['SEM_REF_CYCLE', 'main', 1, 6],
    ['SEM_REF_CYCLE', 'main', 2, 6],
  ]);
  assert.deepEqual(brief(run({ main: 'x { y = "${x}" }' })), [['SEM_REF_CYCLE', 'main', 1, 10]]);
});

test('pha B: vòng qua mảng và hằng; ưu tiên hơn BAD_INTERPOLATION', () => {
  const errs = run({ main: 'a = ["${b}"]\nb = "p ${a}"' });
  assert.deepEqual(errs.map((e) => [e.code, e.line]), [
    ['SEM_REF_CYCLE', 1],
    ['SEM_REF_CYCLE', 2],
  ]);
  const c = run({ main: 'const p = "${@q}"\nconst q = "${@p}"' });
  assert.deepEqual(c.map((e) => e.code), ['SEM_REF_CYCLE', 'SEM_REF_CYCLE']);
});

test('pha B: tham chiếu không vòng (đường chéo) hợp lệ', () => {
  assert.deepEqual(run({ main: 'a = "${c}"\nb = "${c}"\nc = "x"\nd { e = "${a}${b}" }' }), []);
});

test('pha B: SEM_BAD_INTERPOLATION', () => {
  const errs = run({ main: 'l = [1]\no { k = 1 }\na = "x${l}"\nb = "${l}"\nc = "${o}${o}"\nd = "n${o.k}"' });
  assert.deepEqual(brief(errs), [
    ['SEM_BAD_INTERPOLATION', 'main', 3, 7],
    ['SEM_BAD_INTERPOLATION', 'main', 5, 6],
    ['SEM_BAD_INTERPOLATION', 'main', 5, 10],
  ]);
});

test('pha B: chuỗi bị ghi đè vẫn được kiểm', () => {
  const errs = run({ main: 'include "o"\na = 1', o: 'a = "${nope}"' });
  assert.deepEqual(brief(errs), [['SEM_UNDEFINED_REF', 'o', 1, 6]]);
});

test('pha B: Ref trong mảng được kiểm; lỗi gom theo tệp', () => {
  const errs = run({ main: 'include "o"\nl = [["${q}"]]', o: 'k = "${r}"' });
  assert.deepEqual(brief(errs), [
    ['SEM_UNDEFINED_REF', 'main', 2, 8],
    ['SEM_UNDEFINED_REF', 'o', 1, 6],
  ]);
});

test('pha B: vòng chỉ tính định nghĩa thắng', () => {
  // a ban đầu trỏ b, nhưng bị ghi đè bằng số; b = "${a}" không vòng
  assert.deepEqual(run({ main: 'a = "${b}"\nb = "${a}"\na = 1' }).map((e) => e.code), ['SEM_REF_CYCLE', 'SEM_DUPLICATE_KEY'].slice(1));
  assert.deepEqual(run({ main: 'include "o"\na = 1\nb = "${a}"', o: 'a = "${b}"' }).map((e) => e.code), []);
});

const schema = {
  type: 'object',
  closed: true,
  fields: {
    name: { type: 'string', required: true },
    port: { type: 'integer' },
    ratio: { type: 'number' },
    mode: { enum: ['dev', 'prod'] },
    tags: { type: 'array', items: { type: 'string' } },
    srv: { type: 'object', required: true, fields: { host: { type: 'string', required: true }, p: { type: 'any' } } },
    nul: { type: 'null' },
  },
};

test('pha C: schema hợp lệ và không chạy khi không có schema', () => {
  const src = 'name = "a"\nport = 1\nratio = 1.5\nmode = "dev"\ntags = ["x"]\nsrv { host = "h" }\nnul = null';
  assert.deepEqual(run({ main: src }, schema), []);
  assert.deepEqual(run({ main: 'name = 1' }), []);
});

test('pha C: SEM_TYPE_MISMATCH tại nút giá trị; integer khác number', () => {
  const errs = run({ main: 'name = 5\nport = 1.5\nratio = 2\nsrv { host = "h" }' }, schema);
  assert.deepEqual(brief(errs), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 8],
    ['SEM_TYPE_MISMATCH', 'main', 2, 8],
  ]);
  const ok = run({ main: 'name = "a"\nport = 2\nsrv { host = "h" }' }, schema);
  assert.deepEqual(ok, []);
});

test('pha C: type không nhận null / object / array nhầm nhau; any nhận hết', () => {
  const s = { fields: { a: { type: 'object' }, b: { type: 'array' }, c: { type: 'any' }, d: { type: 'string' } } };
  const errs = run({ main: 'a = null\nb { }\nc = null\nd = null' }, s);
  assert.deepEqual(errs.map((e) => [e.code, e.line]), [
    ['SEM_TYPE_MISMATCH', 1],
    ['SEM_TYPE_MISMATCH', 2],
    ['SEM_TYPE_MISMATCH', 4],
  ]);
  assert.equal(errs[1].column, 1); // đối tượng: vị trí Block
});

test('pha C: SEM_NOT_IN_ENUM', () => {
  const errs = run({ main: 'name = "a"\nmode = "x"\nsrv { host = "h" }' }, schema);
  assert.deepEqual(brief(errs), [['SEM_NOT_IN_ENUM', 'main', 2, 8]]);
});

test('pha C: SEM_MISSING_REQUIRED tại vị trí đối tượng, theo thứ tự fields', () => {
  const errs = run({ main: '\n  srv { p = 1 }' }, schema);
  assert.deepEqual(brief(errs), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1], // name (gốc)
    ['SEM_MISSING_REQUIRED', 'main', 2, 3], // srv.host (Block srv)
  ]);
  const root = run({ main: 'srv { host = "h" }' }, schema);
  assert.deepEqual(brief(root), [['SEM_MISSING_REQUIRED', 'main', 1, 1]]);
});

test('pha C: SEM_UNKNOWN_KEY tại token khóa; đối tượng nhiều Block dùng khóa thắng', () => {
  const s = { type: 'object', closed: true, fields: { a: { type: 'any' } } };
  const errs = run({ main: 'a = 1\nb = 2\n  zz { x = 1 }' }, s);
  assert.deepEqual(brief(errs), [
    ['SEM_UNKNOWN_KEY', 'main', 2, 1],
    ['SEM_UNKNOWN_KEY', 'main', 3, 3],
  ]);
});

test('pha C: items, vị trí phần tử, không kiểm sâu sau type mismatch', () => {
  const errs = run({ main: 'name = "a"\ntags = ["x",\n  1, "y", null]\nsrv { host = "h" }' }, schema);
  assert.deepEqual(brief(errs), [
    ['SEM_TYPE_MISMATCH', 'main', 3, 3],
    ['SEM_TYPE_MISMATCH', 'main', 3, 11],
  ]);
  const s = { fields: { o: { type: 'string', fields: { x: { required: true } } } } };
  assert.deepEqual(run({ main: 'o { }' }, s).map((e) => e.code), ['SEM_TYPE_MISMATCH']);
});

test('pha C: chuỗi thuần tham chiếu — vị trí là chuỗi, cho cả giá trị bên trong', () => {
  const s = { closed: true, fields: { t: { type: 'string' }, u: { type: 'object', fields: { r: { required: true } } } } };
  const errs = run({ main: 'src = 1\nt = "${src}"\nu = "${o}"\no { }\n' }, { fields: s.fields });
  assert.deepEqual(brief(errs), [
    ['SEM_TYPE_MISMATCH', 'main', 2, 5],
    ['SEM_MISSING_REQUIRED', 'main', 3, 5],
  ]);
});

test('pha C: tham chiếu chuỗi bị ghi đè không ảnh hưởng, kiểm theo giá trị cuối', () => {
  const s = { fields: { a: { type: 'number' } } };
  assert.deepEqual(run({ main: 'include "o"\na = 5', o: 'a = "x"' }, s), []);
});

test('pha B chặn pha C', () => {
  const errs = run({ main: 'name = "${q}"' }, schema);
  assert.deepEqual(errs.map((e) => e.code), ['SEM_UNDEFINED_REF']);
});

test('check không ném với entry vắng', () => {
  assert.deepEqual(check({ entry: 'x', files: {} }), []);
});
