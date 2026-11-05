import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProject, check, evaluate } from '../src/index.js';

const prog = (files, entry = 'main') => {
  const r = parseProject(files, entry);
  assert.ok(r.ok, JSON.stringify(r.error));
  return r.program;
};
const errs = (files, schema) => check(prog(files), schema).map((e) => [e.code, e.file, e.line, e.column]);
const ev = (src) => evaluate(prog({ main: src }));
const schema = (fields, extra = {}) => ({ type: 'object', fields, ...extra });

test('pha A: trùng khóa/hằng, include thiếu, vòng include, hình thoi', () => {
  assert.deepEqual(errs({ main: 'a = 1\na = 2\na { }\nb { a = 1 a = 2 }\nconst c = 1\nconst c = 2' }), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1], ['SEM_DUPLICATE_KEY', 'main', 3, 1], ['SEM_DUPLICATE_KEY', 'main', 4, 11],
    ['SEM_DUPLICATE_CONST', 'main', 6, 1]]);
  assert.deepEqual(errs({ main: 'include "x"\ninclude "main"' }), [
    ['SEM_INCLUDE_NOT_FOUND', 'main', 1, 1], ['SEM_INCLUDE_CYCLE', 'main', 2, 1]]);
  assert.deepEqual(errs({ main: 'a = 1\ninclude "b"', b: 'a = 2' }), []);
  assert.deepEqual(errs({ main: 'include "a"\ninclude "c"', a: 'include "d"', c: 'include "d"', d: 'x = 1' }), []);
});

test('pha A: thứ tự tệp tiền thứ tự; dừng trước pha B', () => {
  const r = errs({ main: 'include "a"\ninclude "b"\nk = 1\nk = 2', a: 'z = 1\nz = 2\nx = "${nope}"', b: 'q = 1\nq = 2' });
  assert.deepEqual(r.map((e) => e[1]), ['main', 'a', 'b']);
  assert.deepEqual(errs({ main: 'a = 1\na = 2\nb = "${nope}"' }).map((e) => e[0]), ['SEM_DUPLICATE_KEY']);
});

test('pha B: undefined, const, mảng, đường dẫn qua chuỗi', () => {
  const src = 'a = "${b}"\nc = "${@k}"\nconst k = 1\nconst m = "${a}"\nl = [1]\nx = "${l.2}"\ny = "${l.1}"\ns = "t"\nz = "${s.x}"\nn = null\nw = "${n}"';
  assert.deepEqual(errs({ main: src }), [
    ['SEM_UNDEFINED_REF', 'main', 1, 6], ['SEM_CONST_CONFIG_REF', 'main', 4, 12],
    ['SEM_UNDEFINED_REF', 'main', 6, 6], ['SEM_UNDEFINED_REF', 'main', 7, 6], ['SEM_UNDEFINED_REF', 'main', 9, 6]]);
  assert.deepEqual(errs({ main: 'include "b"\nx = "${@k}"', b: 'const k = 1' }), [['SEM_UNDEFINED_REF', 'main', 2, 6]]);
});

test('pha B: vòng tham chiếu', () => {
  assert.deepEqual(errs({ main: 'a = "${a}"' }), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(errs({ main: 'a = "${b}"\nb = "${a}"' }), [['SEM_REF_CYCLE', 'main', 1, 6], ['SEM_REF_CYCLE', 'main', 2, 6]]);
  assert.deepEqual(errs({ main: 'x { y = "${x}" }' }), [['SEM_REF_CYCLE', 'main', 1, 10]]);
  assert.deepEqual(errs({ main: 'a = [1, "${b}"]\nb = 2' }), []);
});

test('pha B: nội suy mảng/đối tượng vào chuỗi không thuần', () => {
  assert.deepEqual(errs({ main: 'l = [1]\no { a = 1 }\nx = "${l}"\ny = "p${l}"\nz = "${o}${o}"\nw = "${l.0}-${o.a}"' }),
    [['SEM_BAD_INTERPOLATION', 'main', 4, 7], ['SEM_BAD_INTERPOLATION', 'main', 5, 6], ['SEM_BAD_INTERPOLATION', 'main', 5, 10]]);
  assert.deepEqual(errs({ main: 'l = [1]\nm = "${l}"\ny = "p${m}"' }), [['SEM_BAD_INTERPOLATION', 'main', 3, 7]]);
});

test('pha C: kiểu, enum, required, closed, items và vị trí', () => {
  const src = 'a = "x"\nsrv { p = 1.5 }\nl = [1, "s"]';
  assert.deepEqual(errs({ main: src }, schema({ a: { type: 'integer' } })), [['SEM_TYPE_MISMATCH', 'main', 1, 5]]);
  assert.deepEqual(errs({ main: src }, schema({ a: { enum: ['y'] } })), [['SEM_NOT_IN_ENUM', 'main', 1, 5]]);
  assert.deepEqual(errs({ main: src }, schema({ srv: { fields: { p: { type: 'integer' }, q: { required: true } } } })),
    [['SEM_MISSING_REQUIRED', 'main', 2, 1], ['SEM_TYPE_MISMATCH', 'main', 2, 11]]);
  assert.deepEqual(errs({ main: src }, schema({ l: { items: { type: 'number' } } })), [['SEM_TYPE_MISMATCH', 'main', 3, 9]]);
  assert.deepEqual(errs({ main: src }, schema({ a: {} }, { closed: true })), [['SEM_UNKNOWN_KEY', 'main', 2, 1], ['SEM_UNKNOWN_KEY', 'main', 3, 1]]);
  assert.deepEqual(errs({ main: src }, { type: 'array' }), [['SEM_TYPE_MISMATCH', 'main', 1, 1]]);
  assert.equal(errs({ main: 'a = null' }, schema({ a: { type: 'object' } })).length, 1);
  assert.equal(errs({ main: 'a = 1' }, schema({ a: { type: 'null' } })).length, 1);
});

test('pha C: vị trí qua chuỗi thuần tham chiếu và Block trộn', () => {
  const src = 'o { k = 1 }\nr = "${o}"';
  assert.deepEqual(errs({ main: src }, schema({ r: { type: 'string' } })), [['SEM_TYPE_MISMATCH', 'main', 2, 5]]);
  assert.deepEqual(errs({ main: src }, schema({ r: { type: 'object', fields: {}, closed: true } })), [['SEM_UNKNOWN_KEY', 'main', 2, 5]]);
  // nhiều Block cùng khóa: đối tượng và khóa thuộc Block khởi tạo (đọc sát mục 6.2)
  const m = { main: 'include "b"\no { b = 2 }', b: 'o { a = 1 }' };
  assert.deepEqual(errs(m, schema({ o: { type: 'string' } })), [['SEM_TYPE_MISMATCH', 'b', 1, 1]]);
  assert.deepEqual(errs(m, schema({ o: { fields: { a: {} }, closed: true } })), [['SEM_UNKNOWN_KEY', 'main', 2, 5]]);
  assert.deepEqual(errs(m, schema({}, { closed: true })), [['SEM_UNKNOWN_KEY', 'b', 1, 1]]);
  // Assign ghi đè rồi Block mới: vị trí là Block mới
  assert.deepEqual(errs({ main: 'include "b"\no { a = 1 }', b: 'o = 1' }, schema({ o: { type: 'string' } })), [['SEM_TYPE_MISMATCH', 'main', 2, 1]]);
  assert.deepEqual(errs(m), []);
});

test('evaluate: hợp nhất, include, thứ tự khóa, mảng', () => {
  const r = evaluate(prog({ main: 'include "base"\nserver { port = 2 }\nmode = "prod"\narr = [1]', base: 'server { host = "a" port = 1 }\nmode = "dev"\narr = [1, 2]' }));
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod', arr: [1] });
  assert.deepEqual(Object.keys(r), ['server', 'mode', 'arr']);
  assert.deepEqual(Object.keys(ev('a = 1\nb = 2\na { x = 1 }\nc = 1')), ['a', 'b', 'c']);
  assert.deepEqual(ev('a { x = 1 }\na = 3\na { y = 1 }'), { a: { y: 1 } });
});

test('evaluate: chuỗi, ref cuối cùng, kiểu giữ nguyên, bản sao độc lập', () => {
  const r = ev('const e = "prod"\nn = "svc-${@e}"\np = [80, 443]\nh { port = "${p.0}" }\nq = "${p}"\nq2 = "${p}"\nx = "${later}"\nlater = 1\nlater = 1.50\ns = "v${later}${nn}"\nnn = null\nt = "${nn}"\nf = "${tt}"\ntt = true\nem = ""\nd = "a$b\\${c}"\nal = "${h}"');
  assert.equal(r.n, 'svc-prod');
  assert.equal(r.h.port, 80);
  assert.deepEqual(r.q, [80, 443]);
  assert.notEqual(r.q, r.q2);
  assert.notEqual(r.q, r.p);
  r.q.push(1);
  assert.equal(r.q2.length, 2);
  assert.equal(r.x, 1.5);
  assert.equal(r.s, 'v1.5null');
  assert.equal(r.t, null);
  assert.equal(r.f, true);
  assert.equal(r.em, '');
  assert.equal(r.d, 'a$b${c}');
  assert.notEqual(r.al, r.h);
  assert.equal(ev('a = 1e21\nb = "x${a}"').b, 'x1e+21');
  assert.equal(ev('a = 1\nb = "${c}"\nc = "${a}!"').b, '1!');
  assert.equal(ev('const c = [1, [2]]\nx = "${@c.1.0}"').x, 2);
});

test('evaluate: khóa đặc biệt như __proto__', () => {
  const r = ev('__proto__ { x = 1 }\nconstructor = 2\ny = "${__proto__.x}"');
  assert.deepEqual(Object.keys(r), ['__proto__', 'constructor', 'y']);
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(r, '__proto__').value.x, 1);
  assert.equal(r.y, 1);
  assert.deepEqual(check(prog({ main: 'a = "${toString}"' })).map((e) => e.code), ['SEM_UNDEFINED_REF']);
});

test('chuỗi tham chiếu rất dài không tràn ngăn xếp', () => {
  const N = 20000;
  let src = '';
  for (let i = 0; i < N; i++) src += `a${i} = "\${a${i + 1}}"\nm${i} = "x\${m${i + 1}}"\n`;
  src += `a${N} = 7\nm${N} = "end"\n`;
  const p = prog({ main: src });
  assert.deepEqual(check(p), []);
  const r = evaluate(p);
  assert.equal(r.a0, 7);
  assert.equal(r.m0, 'x'.repeat(N) + 'end');
});
