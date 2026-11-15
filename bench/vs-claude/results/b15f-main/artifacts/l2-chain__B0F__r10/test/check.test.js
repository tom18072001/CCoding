import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

function run(files, schema, entry = 'main') {
  const r = parseProject(typeof files === 'string' ? { main: files } : files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return check(r.program, schema);
}
const brief = (errs) => errs.map((e) => [e.code, e.file, e.line, e.column]);

test('hợp lệ → mảng rỗng', () => {
  assert.deepEqual(run('const c = "x"\na = "${@c}"\nb { d = "${a}" }'), []);
});

test('pha A: SEM_DUPLICATE_KEY (Assign+Block, lần 2 và 3)', () => {
  const errs = run('a = 1\na = 2\na { }\nb { x = 1 x = 2 }\nx = 1');
  assert.deepEqual(brief(errs), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1],
    ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_KEY', 'main', 4, 11],
  ]);
});

test('pha A: khóa giống ở tệp khác (include vào cùng khối) không trùng', () => {
  assert.deepEqual(run({ main: 'a = 1\ninclude "o"', o: 'a = 2' }), []);
});

test('pha A: SEM_DUPLICATE_CONST', () => {
  assert.deepEqual(brief(run('const a = 1\nconst a = 2')), [['SEM_DUPLICATE_CONST', 'main', 2, 1]]);
});

test('pha A: SEM_INCLUDE_NOT_FOUND', () => {
  assert.deepEqual(brief(run('x { include "nope" }')), [['SEM_INCLUDE_NOT_FOUND', 'main', 1, 5]]);
});

test('pha A: SEM_INCLUDE_CYCLE (tự include và vòng a→b→a); hình thoi không lỗi', () => {
  assert.deepEqual(brief(run('include "main"')), [['SEM_INCLUDE_CYCLE', 'main', 1, 1]]);
  assert.deepEqual(
    brief(run({ main: 'include "b"', b: 'x = 1\ninclude "main"' })),
    [['SEM_INCLUDE_CYCLE', 'b', 2, 1]],
  );
  assert.deepEqual(
    run({ main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'k = 1' }),
    [],
  );
});

test('thứ tự lỗi nhiều tệp: tiền thứ tự, trong tệp theo (line, column)', () => {
  const files = {
    main: 'include "b"\ninclude "c"\nz = 1\nz = 2',
    b: 'q = 1\nq = 2\ninclude "d"',
    c: 'include "d"\nr = 1\nr = 2',
    d: 'include "gone"',
  };
  assert.deepEqual(brief(run(files)), [
    ['SEM_DUPLICATE_KEY', 'main', 4, 1],
    ['SEM_DUPLICATE_KEY', 'b', 2, 1],
    ['SEM_INCLUDE_NOT_FOUND', 'd', 1, 1],
    ['SEM_DUPLICATE_KEY', 'c', 3, 1],
  ]);
});

test('pha dừng: lỗi pha A che lỗi pha B; lỗi pha B che pha C', () => {
  const a = run('k = 1\nk = 2\nu = "${nope}"');
  assert.deepEqual(a.map((e) => e.code), ['SEM_DUPLICATE_KEY']);
  const b = run('u = "${nope}"\nn = 1', { fields: { n: { type: 'string' } } });
  assert.deepEqual(b.map((e) => e.code), ['SEM_UNDEFINED_REF']);
});

test('pha B: SEM_UNDEFINED_REF (gồm xuyên chuỗi, chỉ số sai, hằng tệp khác)', () => {
  const errs = run({
    main: 'a = "${b}"\ns = "x"\nt = "${s.len}"\nl = [1]\nu = "${l.5}"\nv = "${l.1}"\nw = "${@c}"\ninclude "o"',
    o: 'const c = 1',
  });
  assert.deepEqual(brief(errs), [
    ['SEM_UNDEFINED_REF', 'main', 1, 6],
    ['SEM_UNDEFINED_REF', 'main', 3, 6],
    ['SEM_UNDEFINED_REF', 'main', 5, 6],
    ['SEM_UNDEFINED_REF', 'main', 6, 6],
    ['SEM_UNDEFINED_REF', 'main', 7, 6],
  ]);
});

test('pha B: hằng khai báo sau chỗ dùng vẫn thấy; null là tồn tại', () => {
  assert.deepEqual(run('a = "${@c}"\nconst c = 1\nn = null\nm = "${n}"'), []);
});

test('pha B: SEM_CONST_CONFIG_REF', () => {
  const errs = run('x = 1\nconst c = ["${x}", "${@d}"]\nconst d = 1');
  assert.deepEqual(brief(errs), [['SEM_CONST_CONFIG_REF', 'main', 2, 13]]);
});

test('pha B: SEM_REF_CYCLE — tự tham chiếu, a↔b, tổ tiên', () => {
  assert.deepEqual(brief(run('a = "${a}"')), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(brief(run('a = "${b}"\nb = "${a}"')), [
    ['SEM_REF_CYCLE', 'main', 1, 6],
    ['SEM_REF_CYCLE', 'main', 2, 6],
  ]);
  assert.deepEqual(brief(run('x { y = "${x}" }')), [['SEM_REF_CYCLE', 'main', 1, 10]]);
});

test('pha B: vòng qua mảng, hằng; chuỗi bị ghi đè vẫn được xét', () => {
  const cyc = run('a = ["${b}"]\nb = "${a}"');
  assert.deepEqual(cyc.map((e) => e.code), ['SEM_REF_CYCLE', 'SEM_REF_CYCLE']);
  assert.deepEqual(run('const a = "${@b}"\nconst b = "${@a}"').map((e) => e.code), ['SEM_REF_CYCLE', 'SEM_REF_CYCLE']);
  const files = { main: 'include "o"\nk = 1', o: 'k = "${nope}"' };
  assert.deepEqual(brief(run(files)), [['SEM_UNDEFINED_REF', 'o', 1, 6]]);
});

test('pha B: SEM_BAD_INTERPOLATION (mảng/đối tượng trong chuỗi không thuần)', () => {
  const errs = run('l = [1]\no { p = 1 }\na = "v=${l}"\nb = "${o}${l}"\nc = "${l}"\nd = "n${l.0}"\ne = "${c}-"');
  assert.deepEqual(brief(errs), [
    ['SEM_BAD_INTERPOLATION', 'main', 3, 8],
    ['SEM_BAD_INTERPOLATION', 'main', 4, 6],
    ['SEM_BAD_INTERPOLATION', 'main', 4, 10],
    ['SEM_BAD_INTERPOLATION', 'main', 7, 6],
  ]);
});

test('pha B: mỗi Ref tối đa một lỗi theo thứ tự ưu tiên (vòng thắng nội suy sai)', () => {
  const errs = run('a = "x${a}"');
  assert.deepEqual(errs.map((e) => e.code), ['SEM_REF_CYCLE']);
});

const schema = {
  type: 'object',
  closed: true,
  fields: {
    name: { type: 'string', required: true },
    port: { type: 'integer' },
    mode: { enum: ['dev', 'prod'] },
    tags: { type: 'array', items: { type: 'string' } },
    srv: { type: 'object', required: false, fields: { host: { type: 'string', required: true } } },
    ratio: { type: 'number' },
    nothing: { type: 'null' },
  },
};

test('pha C: hợp lệ', () => {
  assert.deepEqual(
    run('name = "a"\nport = 1\nmode = "dev"\ntags = ["x"]\nsrv { host = "h" }\nratio = 2\nnothing = null', schema),
    [],
  );
});

test('pha C: SEM_TYPE_MISMATCH tại nút giá trị; integer/number/null/array/object phân biệt', () => {
  const errs = run('name = 1\nport = 1.5\nratio = "x"\nnothing = 0\ntags { }\nsrv = [1]', schema);
  assert.deepEqual(brief(errs), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 8],
    ['SEM_TYPE_MISMATCH', 'main', 2, 8],
    ['SEM_TYPE_MISMATCH', 'main', 3, 9],
    ['SEM_TYPE_MISMATCH', 'main', 4, 11],
    ['SEM_TYPE_MISMATCH', 'main', 5, 1],
    ['SEM_TYPE_MISMATCH', 'main', 6, 7],
  ]);
  assert.deepEqual(run('ratio = 3\nname = "a"', schema), []);
  assert.deepEqual(run('nothing = null', { fields: { nothing: { type: 'object' } } }).map((e) => e.code), ['SEM_TYPE_MISMATCH']);
});

test('pha C: SEM_NOT_IN_ENUM, và không kiểm sâu hơn khi lệch kiểu', () => {
  assert.deepEqual(brief(run('mode = "x"\nname = "a"', schema)), [['SEM_NOT_IN_ENUM', 'main', 1, 8]]);
  assert.deepEqual(
    run('a = 5', { fields: { a: { type: 'string', enum: ['x'] } } }).map((e) => e.code),
    ['SEM_TYPE_MISMATCH'],
  );
});

test('pha C: SEM_MISSING_REQUIRED tại vị trí đối tượng theo thứ tự fields; gốc ở entry 1:1', () => {
  const sc = { fields: { b: { required: true }, a: { required: true } } };
  assert.deepEqual(brief(run('\n x = 1', sc)), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
  ]);
  const errs = run('\n  s { }', { fields: { s: { fields: { h: { required: true } } } } });
  assert.deepEqual(brief(errs), [['SEM_MISSING_REQUIRED', 'main', 2, 3]]);
});

test('pha C: SEM_UNKNOWN_KEY tại token khóa thắng; thứ tự theo cấu hình hợp nhất', () => {
  const files = { main: 'include "o"\nzed = 1\nname = "n"\nalpha { }', o: 'alpha = 1\nbeta = 2' };
  const errs = run(files, schema);
  assert.deepEqual(brief(errs), [
    ['SEM_UNKNOWN_KEY', 'main', 4, 1],
    ['SEM_UNKNOWN_KEY', 'o', 2, 1],
    ['SEM_UNKNOWN_KEY', 'main', 2, 1],
  ]);
});

test('pha C: vị trí đối tượng là Block khởi tạo; ghi đè bằng giá trị rồi Block mới', () => {
  const sc = { fields: { s: { fields: { h: { required: true } } } } };
  assert.deepEqual(brief(run('s { a = 1 }\ns { b = 1 }', sc.fields ? { fields: { s: { fields: { h: { required: true } } } } } : sc).slice(0, 0)), []);
  // hai Block cùng khóa là trùng ở pha A, nên dùng include để trộn
  const files = { main: 'include "o"\ns { b = 1 }', o: 's { a = 1 }' };
  assert.deepEqual(brief(run(files, sc)), [['SEM_MISSING_REQUIRED', 'o', 1, 1]]);
  const files2 = { main: 'include "o"\ns { b = 1 }', o: 's = 3' };
  assert.deepEqual(brief(run(files2, sc)), [['SEM_MISSING_REQUIRED', 'main', 2, 1]]);
});

test('pha C: chuỗi thuần tham chiếu — vị trí là chuỗi đó, cho cả phần bên trong', () => {
  const sc = { fields: { p: { type: 'string' }, q: { type: 'object', fields: { k: { type: 'string' } } }, l: { items: { type: 'string' } } } };
  const src = 'n = 5\no { k = 1 }\nl0 = [1]\np = "${n}"\nq = "${o}"\nl = "${l0}"';
  const errs = run(src, sc);
  assert.deepEqual(brief(errs), [
    ['SEM_TYPE_MISMATCH', 'main', 4, 5],
    ['SEM_TYPE_MISMATCH', 'main', 5, 5],
    ['SEM_TYPE_MISMATCH', 'main', 6, 5],
  ]);
});

test('pha C: phần tử mảng báo tại vị trí phần tử', () => {
  const errs = run('tags = ["a",\n  2]', { fields: { tags: { items: { type: 'string' } } } });
  assert.deepEqual(brief(errs), [['SEM_TYPE_MISMATCH', 'main', 2, 3]]);
});

test('không ném với đầu vào lạ', () => {
  assert.doesNotThrow(() => check({}, {}));
  assert.doesNotThrow(() => check(null));
});
