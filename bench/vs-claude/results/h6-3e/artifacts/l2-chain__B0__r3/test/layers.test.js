import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenize, parse, parseProject, check, evaluate, compile,
  diff, applyDiff, formatText, formatJson, summarize,
  escapePointer, unescapePointer, parsePointer, formatPointer,
} from '../src/index.js';

const lexErr = (s) => { const r = tokenize(s); assert.equal(r.ok, false); const { code, line, column } = r.error; return [code, line, column]; };
const parseErr = (s) => { const r = parse(s); assert.equal(r.ok, false); const { code, line, column } = r.error; return [code, line, column]; };
const errs = (files, schema, entry = 'main') => {
  const p = parseProject(files, entry);
  assert.equal(p.ok, true, JSON.stringify(p));
  return check(p.program, schema).map((e) => [e.code, e.file, e.line, e.column]);
};
const ev = (src, extra = {}) => {
  const files = { main: src, ...extra };
  const p = parseProject(files, 'main');
  assert.equal(p.ok, true);
  assert.deepEqual(check(p.program), []);
  return evaluate(p.program);
};

test('lexer: số', () => {
  const v = (s) => tokenize(s).tokens[0].value;
  assert.equal(v('-1.5e2'), -150);
  assert.ok(Object.is(v('-0'), 0));
  for (const bad of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999']) assert.equal(lexErr(bad)[0], 'LEX_BAD_NUMBER', bad);
  assert.deepEqual(lexErr('.5'), ['LEX_UNEXPECTED_CHAR', 1, 1]);
});

test('lexer: chuỗi, thoát và nội suy', () => {
  const t = tokenize('"a\\n\\u0041\\${x}${@c.1}$b${p.0.q}"').tokens[0];
  assert.deepEqual(t.value, [
    { type: 'Text', value: 'a\nA${x}' },
    { type: 'Ref', path: ['c', '1'], const: true, line: 1, column: 16 },
    { type: 'Text', value: '$b' },
    { type: 'Ref', path: ['p', '0', 'q'], const: false, line: 1, column: 25 },
  ]);
  assert.deepEqual(tokenize('""').tokens[0].value, []);
  assert.deepEqual(lexErr('"abc'), ['LEX_UNTERMINATED_STRING', 1, 1]);
  assert.deepEqual(lexErr('x "a\\q"'), ['LEX_BAD_ESCAPE', 1, 5]);
  assert.deepEqual(lexErr('"\\u12"'), ['LEX_BAD_ESCAPE', 1, 2]);
  assert.deepEqual(lexErr('"a${b"'), ['LEX_BAD_INTERPOLATION', 1, 3]);
  assert.deepEqual(lexErr('"${}"'), ['LEX_BAD_INTERPOLATION', 1, 2]);
  assert.deepEqual(lexErr('"${0a}"'), ['LEX_BAD_INTERPOLATION', 1, 2]);
  assert.deepEqual(lexErr('"${a.01}"'), ['LEX_BAD_INTERPOLATION', 1, 2]);
  assert.deepEqual(lexErr('"${ a}"'), ['LEX_BAD_INTERPOLATION', 1, 2]);
});

test('lexer: chú thích, vị trí, BOM, xuống dòng', () => {
  const r = tokenize('﻿# c\r\n// d\r/* x\ny */ a');
  assert.deepEqual(r.tokens.map((t) => [t.type, t.line, t.column]), [['ident', 4, 6], ['eof', 4, 7]]);
  assert.deepEqual(lexErr('a /* x'), ['LEX_UNTERMINATED_COMMENT', 1, 3]);
  assert.deepEqual(lexErr('a / b'), ['LEX_UNEXPECTED_CHAR', 1, 3]);
  assert.deepEqual(lexErr('é'), ['LEX_UNEXPECTED_CHAR', 1, 1]);
  assert.equal(tokenize('const x').tokens[0].type, 'keyword');
});

test('parser: AST và lỗi', () => {
  const r = parse('const r = "h"\na { b = [1, [2],] }\ninclude ""');
  assert.equal(r.ok, true);
  assert.deepEqual(r.ast.body[0], { type: 'Const', name: 'r', value: { type: 'String', parts: [{ type: 'Text', value: 'h' }], line: 1, column: 11 }, line: 1, column: 1 });
  assert.equal(r.ast.body[1].body[0].value.items[1].type, 'Array');
  assert.deepEqual(r.ast.body[2], { type: 'Include', path: '', line: 3, column: 1 });
  assert.deepEqual(parseErr('a = '), ['PARSE_UNEXPECTED_EOF', 1, 5]);
  assert.deepEqual(parseErr('a {'), ['PARSE_UNEXPECTED_EOF', 1, 4]);
  assert.deepEqual(parseErr('}'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(parseErr('a b'), ['PARSE_UNEXPECTED_TOKEN', 1, 3]);
  assert.deepEqual(parseErr('a = [,]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(parseErr('a = [1,,2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(parseErr('true = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(parseErr('a = b'), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(parseErr('include "a${b}"'), ['PARSE_BAD_INCLUDE', 1, 9]);
  assert.deepEqual(parseErr('include 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  assert.deepEqual(parseErr('a {\n const x = 1\n}'), ['PARSE_CONST_NOT_TOP', 2, 2]);
  // lexer thắng cú pháp
  assert.deepEqual(parseErr('} "abc'), ['LEX_UNTERMINATED_STRING', 1, 3]);
});

test('parser: ví dụ mục 9 và parseProject', () => {
  const main = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }';
  assert.deepEqual(parseErr(main), ['PARSE_UNEXPECTED_TOKEN', 5, 29]);
  const files = { main: 'include "b"\nx { include "c" }\ninclude "b"', b: 'include "d"', c: 'y=1', d: 'z=1', unused: '(((' };
  const p = parseProject({ ...files, nf: '' }, 'main');
  assert.deepEqual(Object.keys(p.program.files), ['main', 'b', 'd', 'c']);
  const bad = parseProject({ main: 'include "b"\ninclude "c"', b: 'a = ', c: '}' }, 'main');
  assert.deepEqual([bad.error.code, bad.error.file, bad.error.line, bad.error.column], ['PARSE_UNEXPECTED_EOF', 'b', 1, 5]);
  assert.equal(parseProject({}, 'm').error.code, 'PARSE_ENTRY_NOT_FOUND');
});

test('check: pha A', () => {
  assert.deepEqual(errs({ main: 'a = 1\nb { }\na = 2\nb = 1\nb = 2\nconst c = 1\nconst c = 2\nx { k = 1 }\ny { k = 1 }' }),
    [['SEM_DUPLICATE_KEY', 'main', 3, 1], ['SEM_DUPLICATE_KEY', 'main', 4, 1], ['SEM_DUPLICATE_KEY', 'main', 5, 1], ['SEM_DUPLICATE_CONST', 'main', 7, 1]]);
  assert.deepEqual(errs({ main: 'a = 1\ninclude "b"', b: 'a = 2' }), []);
  assert.deepEqual(errs({ main: 'include "zz"\ninclude "main"' }),
    [['SEM_INCLUDE_NOT_FOUND', 'main', 1, 1], ['SEM_INCLUDE_CYCLE', 'main', 2, 1]]);
  // hình thoi không phải vòng
  assert.deepEqual(errs({ main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'x = 1' }), []);
  // vòng b -> a
  assert.deepEqual(errs({ main: 'include "b"', b: 'q = 1\ninclude "main"' }), [['SEM_INCLUDE_CYCLE', 'b', 2, 1]]);
  // pha A chặn pha B
  assert.equal(errs({ main: 'a = 1\na = 2\nb = "${zz}"' }).length, 1);
});

test('check: pha B', () => {
  assert.deepEqual(errs({ main: 'const a = 1\nconst b = "${x}"\nconst c = "${@zz}"\nx = 1' }),
    [['SEM_CONST_CONFIG_REF', 'main', 2, 12], ['SEM_UNDEFINED_REF', 'main', 3, 12]]);
  // hằng khai báo sau, hằng của tệp khác không thấy
  assert.deepEqual(errs({ main: 'a = "${@k}"\nconst k = 1\ninclude "b"', b: 'x = "${@k}"' }), [['SEM_UNDEFINED_REF', 'b', 1, 6]]);
  assert.deepEqual(errs({ main: 'a = "${a}"' }), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(errs({ main: 'a = "${b}"\nb = "${a}"' }), [['SEM_REF_CYCLE', 'main', 1, 6], ['SEM_REF_CYCLE', 'main', 2, 6]]);
  assert.deepEqual(errs({ main: 'x { y = "${x}" }' }), [['SEM_REF_CYCLE', 'main', 1, 10]]);
  assert.deepEqual(errs({ main: 'l = [1]\na = "v${l}"\nb = "${l}"\no { z = 1 }\nc = "${o}!"\nd = null\ne = "${d}"' }),
    [['SEM_BAD_INTERPOLATION', 'main', 2, 7], ['SEM_BAD_INTERPOLATION', 'main', 5, 6]]);
  assert.deepEqual(errs({ main: 'a = "${l.5}"\nl = [1]\nb = "${a.x}"\nc = "x"\nd = "${c.y}"' }),
    [['SEM_UNDEFINED_REF', 'main', 1, 6], ['SEM_UNDEFINED_REF', 'main', 3, 6], ['SEM_UNDEFINED_REF', 'main', 5, 6]]);
  // chuỗi bị ghi đè vẫn được kiểm
  assert.deepEqual(errs({ main: 'a = "${zz}"\na2 = 1' }), [['SEM_UNDEFINED_REF', 'main', 1, 6]]);
});

test('check: pha C (lược đồ)', () => {
  const src = 'name = 5\nport = "${n}"\nn = 8080.5\nmode = "x"\nobj { k = 1 }\nlst = [1, "a"]\nextra = 1';
  const schema = {
    type: 'object', closed: true,
    fields: {
      name: { type: 'string' }, port: { type: 'integer' }, mode: { enum: ['a', 'b'] },
      need: { required: true }, obj: { type: 'object', closed: true, fields: { z: { required: true } } },
      lst: { type: 'array', items: { type: 'number' } }, n: { type: 'any' },
    },
  };
  assert.deepEqual(errs({ main: src }, schema), [
    ['SEM_MISSING_REQUIRED', 'main', 1, 1],
    ['SEM_TYPE_MISMATCH', 'main', 1, 8],
    ['SEM_TYPE_MISMATCH', 'main', 2, 8],
    ['SEM_NOT_IN_ENUM', 'main', 4, 8],
    ['SEM_MISSING_REQUIRED', 'main', 5, 1],
    ['SEM_UNKNOWN_KEY', 'main', 5, 7],
    ['SEM_TYPE_MISMATCH', 'main', 6, 11],
    ['SEM_UNKNOWN_KEY', 'main', 7, 1],
  ]);
  // vị trí qua chuỗi thuần tham chiếu
  assert.deepEqual(errs({ main: 'o { a = 1 }\np = "${o}"' }, { fields: { p: { closed: true, fields: {} } } }),
    [['SEM_UNKNOWN_KEY', 'main', 2, 5]]);
});

test('evaluate: hợp nhất, include, thứ tự khóa', () => {
  const r = ev('include "base.cfg"\nserver { port = 2 }\nmode = "prod"', { 'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"' });
  assert.deepEqual(r, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r), ['server', 'mode']);
  const o = ev('include "b"\na { x = 1 }', { b: 'a = 1\nb = 2' });
  assert.deepEqual(Object.keys(o), ['a', 'b']);
  assert.deepEqual(o.a, { x: 1 });
  assert.deepEqual(ev('include "b"\ninclude "c"', { b: 'a = [1,2]', c: 'a = [3]' }), { a: [3] });
  assert.deepEqual(ev('include "b"\na { y = 2 }\ninclude "c"', { b: 'a { x = 1 }', c: 'a = 5' }), { a: 5 });
  assert.deepEqual(ev('include "b"\ninclude "c"', { b: 'a = 5', c: 'a { y = 2 }' }), { a: { y: 2 } });
  assert.deepEqual(ev('include "b"\ninclude "c"', { b: 'a { x = 1 }', c: 'a { y = 2 }' }), { a: { x: 1, y: 2 } });
});

test('evaluate: tham chiếu, giữ kiểu, không chia sẻ', () => {
  const src = 'const env = "prod"\nconst l = [7, [8]]\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\n'
    + 'n = 1.50\ns = "n=${n}|${@l.1.0}|${z}|${big}"\nz = null\nbig = 1e21\nc1 = "${ports}"\nc2 = "${ports}"\nlate = "${later}"\nlater = "L${@env}"\nobj = "${http}"\nemp = ""';
  const r = ev(src);
  assert.equal(r.name, 'svc-prod');
  assert.equal(r.http.port, 80);
  assert.equal(r.s, 'n=1.5|8|null|1e+21');
  assert.deepEqual(r.c1, [80, 443]);
  assert.notEqual(r.c1, r.c2);
  assert.notEqual(r.c1, r.ports);
  r.c1.push(1);
  assert.deepEqual(r.c2, [80, 443]);
  assert.equal(r.late, 'Lprod');
  assert.deepEqual(r.obj, { port: 80 });
  assert.equal(r.emp, '');
  assert.deepEqual(ev('server { host = "h" url = "http://${server.host}:${port}" }\nport = 8080\nlimits { max = "${port}" }').limits, { max: 8080 });
  assert.deepEqual(ev('a = "${b}"\nb = "${c}"\nc = [1]'), { a: [1], b: [1], c: [1] });
  assert.deepEqual(ev('__proto__ = 1'), JSON.parse('{"__proto__":1}'));
});

test('diff: con trỏ JSON', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('a~1b~0c~01'), 'a/b~c~1');
  for (const bad of ['~', 'a~', '~2']) assert.throws(() => unescapePointer(bad), { code: 'DIFF_BAD_POINTER' });
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/0'), ['a/b', '0']);
  assert.throws(() => parsePointer('a'), { code: 'DIFF_BAD_POINTER' });
  assert.throws(() => parsePointer('/~x'), { code: 'DIFF_BAD_POINTER' });
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', 0]), '/a~1b/0');
});

test('diff: thuật toán, áp dụng, định dạng', () => {
  const a = { a: { b: [1, 2, 3] }, 'x/y': 1 };
  const b = { a: { b: [1, 5] }, 'x/y': 2, c: null };
  const ops = diff(a, b);
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(applyDiff(a, ops), b);
  assert.deepEqual(a.a.b, [1, 2, 3]);
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff({ a: [] }, { a: {} }), [{ op: 'replace', path: '/a', oldValue: [], value: {} }]);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.deepEqual(diff({ a: [1] }, { a: [1] }), []);
  assert.equal(formatText(ops), '~ /a/b/1: 2 -> 5\n- /a/b/2 = 3\n+ /c = null\n~ /x~1y: 1 -> 2');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatJson([]), '[]');
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 2 });
  const v = { k: [1] };
  const add = diff({}, { v });
  add[0].value.k.push(2);
  assert.deepEqual(v.k, [1]);
});

test('diff: applyDiff lỗi và gốc', () => {
  const f = (doc, op) => assert.throws(() => applyDiff(doc, [op]), { code: 'DIFF_APPLY_FAILED' });
  f({ a: 1 }, { op: 'add', path: '/a', value: 2 });
  f({ a: 1 }, { op: 'remove', path: '/b', oldValue: 1 });
  f({ a: [1] }, { op: 'replace', path: '/a/1', value: 1 });
  f({ a: [1] }, { op: 'add', path: '/a/3', value: 1 });
  assert.deepEqual(applyDiff({ a: [1] }, [{ op: 'add', path: '/a/1', value: 9 }]), { a: [1, 9] });
  assert.deepEqual(applyDiff({ a: [1] }, [{ op: 'replace', path: '', oldValue: 0, value: 5 }]), 5);
});

test('đầu cuối: compile', () => {
  assert.deepEqual(compile({ main: 'a = ' }, 'main'), { ok: false, stage: 'parse', errors: [{ code: 'PARSE_UNEXPECTED_EOF', message: compile({ main: 'a = ' }, 'main').errors[0].message, file: 'main', line: 1, column: 5 }] });
  const c = compile({ main: 'a = "${b}"' }, 'main');
  assert.equal(c.stage, 'check');
  assert.equal(c.errors[0].code, 'SEM_UNDEFINED_REF');
  assert.equal(compile({ main: 'p = "x"' }, 'main', { fields: { p: { type: 'number' } } }).errors[0].code, 'SEM_TYPE_MISMATCH');
  const ok = compile({ main: 'include "b"\nx = "${y}"', b: 'y = 3' }, 'main');
  assert.deepEqual(ok, { ok: true, config: { y: 3, x: 3 } });
  const before = { main: 'a = 1' };
  const after = compile({ main: 'a = 2' }, 'main');
  assert.equal(formatText(diff(compile(before, 'main').config, after.config)), '~ /a: 1 -> 2');
});
