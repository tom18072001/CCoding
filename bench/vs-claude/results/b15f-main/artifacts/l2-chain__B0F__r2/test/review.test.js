// Test hồi quy của S7 (review): các ca SPEC khó/biên, đối chiếu từng mục.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';
import { tokenize, parse, parseProject, check, evaluate, compile, diff, applyDiff } from '../src/index.js';

const lexErr = (s) => {
  const r = tokenize(s);
  assert.equal(r.ok, false, `phải lỗi: ${JSON.stringify(s)}`);
  const { code, line, column } = r.error;
  return [code, line, column];
};
const parseErr = (s) => {
  const r = parse(s);
  assert.equal(r.ok, false, `phải lỗi: ${JSON.stringify(s)}`);
  const { code, line, column } = r.error;
  return [code, line, column];
};
const chk = (files, entry = 'main', schema) => {
  const p = parseProject(files, entry);
  assert.ok(p.ok, JSON.stringify(p.error));
  return check(p.program, schema).map(({ code, file, line, column }) => [code, file, line, column]);
};
const ev = (files, entry = 'main') => {
  const r = compile(files, entry);
  assert.ok(r.ok, JSON.stringify(r.errors));
  return r.config;
};

// ── Lexer ──
test('lexer: số biên', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '-x', '1.5.2', '0x1', '1_0']) {
    assert.equal(lexErr(`a = ${s}`)[0], 'LEX_BAD_NUMBER', s);
  }
  assert.deepEqual(lexErr('a = .5'), ['LEX_UNEXPECTED_CHAR', 1, 5]);
  assert.deepEqual(lexErr('a = +1'), ['LEX_UNEXPECTED_CHAR', 1, 5]);
  const t = tokenize('-0 -0.0 1E+2 0.5e-1').tokens;
  assert.ok(Object.is(t[0].value, 0) && Object.is(t[1].value, 0));
  assert.deepEqual(t.slice(2, 4).map((x) => x.value), [100, 0.05]);
});

test('lexer: nội suy sai dạng đều tại ký tự $', () => {
  for (const s of ['${}', '${1a}', '${0}', '${a.01}', '${a. b}', '${ a}', '${@}', '${@1}', '${a..b}', '${a.}', '${a', '${@@a}']) {
    assert.deepEqual(lexErr(`x = "ab${s}"`), ['LEX_BAD_INTERPOLATION', 1, 8], s);
  }
  assert.equal(tokenize('x = "${a.b.0} ${@lst.1} ${a-b.c_d}"').ok, true);
});

test('lexer: $ thường, \\$ và ghép Text', () => {
  const v = (s) => tokenize(s).tokens[0].value;
  assert.deepEqual(v('"a$b$"'), [{ type: 'Text', value: 'a$b$' }]);
  assert.deepEqual(v('"\\${a}"'), [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(v('""'), []);
  assert.deepEqual(v('"a${x}${y}b"'), [
    { type: 'Text', value: 'a' },
    { type: 'Ref', path: ['x'], const: false, line: 1, column: 3 },
    { type: 'Ref', path: ['y'], const: false, line: 1, column: 7 },
    { type: 'Text', value: 'b' },
  ]);
  assert.deepEqual(v('"\\u00e9\\n\\/\\"\\\\"'), [{ type: 'Text', value: 'é\n/"\\' }]);
});

test('lexer: thứ tự lỗi trong chuỗi', () => {
  assert.deepEqual(lexErr('"abc\\q ${'), ['LEX_BAD_ESCAPE', 1, 5]);
  assert.deepEqual(lexErr('"${a'), ['LEX_BAD_INTERPOLATION', 1, 2]);
  assert.deepEqual(lexErr('"ab\ncd"'), ['LEX_UNTERMINATED_STRING', 1, 1]);
  assert.deepEqual(lexErr('x "ab'), ['LEX_UNTERMINATED_STRING', 1, 3]);
  assert.deepEqual(lexErr('"a\\\nb"'), ['LEX_BAD_ESCAPE', 1, 3]);
  assert.deepEqual(lexErr('"a\\u12G4"'), ['LEX_BAD_ESCAPE', 1, 3]);
  assert.deepEqual(lexErr('"a\\'), ['LEX_BAD_ESCAPE', 1, 3]);
  assert.deepEqual(lexErr('"\\x"'), ['LEX_BAD_ESCAPE', 1, 2]);
});

test('lexer: ký tự lạ, chú thích, vị trí', () => {
  assert.deepEqual(lexErr('a = 1 / 2'), ['LEX_UNEXPECTED_CHAR', 1, 7]);
  assert.deepEqual(lexErr('é'), ['LEX_UNEXPECTED_CHAR', 1, 1]);
  assert.deepEqual(lexErr('a\n  /* x\n y'), ['LEX_UNTERMINATED_COMMENT', 2, 3]);
  assert.equal(lexErr('/*/')[0], 'LEX_UNTERMINATED_COMMENT');
  // CRLF một lần, \r đơn là xuống dòng, BOM không tính cột
  const t = tokenize('﻿a\r\nb\rc\n').tokens;
  assert.deepEqual(t.map((x) => [x.value, x.line, x.column]), [['a', 1, 1], ['b', 2, 1], ['c', 3, 1], [null, 4, 1]]);
  const u = tokenize('# x\n// y\n/* z\n*/ a').tokens;
  assert.deepEqual([u[0].line, u[0].column, u[1].type], [4, 4, 'eof']);
  assert.deepEqual([u[1].line, u[1].column], [4, 5]);
  // cột theo UTF-16: emoji = 2 đơn vị
  const e = tokenize('a = "😀" b').tokens;
  assert.equal(e[3].column, 10);
});

test('lexer: từ khóa và định danh gần giống; không ném', () => {
  const t = tokenize('include-x nullable true const_').tokens;
  assert.deepEqual(t.slice(0, 4).map((x) => x.type), ['ident', 'ident', 'keyword', 'ident']);
  assert.doesNotThrow(() => tokenize('\0\uD800"\\'));
});

// ── Parser ──
test('parser: AST đúng hình dạng, không trường thừa', () => {
  const r = parse('a = [1, null, true, "x"]\nb { c = 2 }\nconst k = 1\ninclude "p"');
  assert.deepEqual(r.ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Assign', key: 'a', line: 1, column: 1, value: { type: 'Array', line: 1, column: 5, items: [
        { type: 'Number', value: 1, line: 1, column: 6 },
        { type: 'Null', line: 1, column: 9 },
        { type: 'Bool', value: true, line: 1, column: 15 },
        { type: 'String', parts: [{ type: 'Text', value: 'x' }], line: 1, column: 21 },
      ] } },
      { type: 'Block', key: 'b', line: 2, column: 1, body: [
        { type: 'Assign', key: 'c', line: 2, column: 5, value: { type: 'Number', value: 2, line: 2, column: 9 } },
      ] },
      { type: 'Const', name: 'k', line: 3, column: 1, value: { type: 'Number', value: 1, line: 3, column: 11 } },
      { type: 'Include', path: 'p', line: 4, column: 1 },
    ],
  });
  assert.deepEqual(parse('').ast, { type: 'File', body: [], line: 1, column: 1 });
});

test('parser: mã lỗi và vị trí', () => {
  assert.deepEqual(parseErr('a = [,]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(parseErr('a = [1,,2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(parseErr('a = [1'), ['PARSE_UNEXPECTED_EOF', 1, 7]);
  assert.deepEqual(parseErr('a = [x {}]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(parseErr('}'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(parseErr('a b'), ['PARSE_UNEXPECTED_TOKEN', 1, 3]);
  assert.deepEqual(parseErr('a = b'), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(parseErr('true = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(parseErr('a ='), ['PARSE_UNEXPECTED_EOF', 1, 4]);
  assert.deepEqual(parseErr('a {'), ['PARSE_UNEXPECTED_EOF', 1, 4]);
  assert.deepEqual(parseErr('a'), ['PARSE_UNEXPECTED_EOF', 1, 2]);
  assert.deepEqual(parseErr('include'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.deepEqual(parseErr('include 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  assert.deepEqual(parseErr('include "a${b}"'), ['PARSE_BAD_INCLUDE', 1, 9]);
  assert.deepEqual(parseErr('s {\n  const x = 1\n}'), ['PARSE_CONST_NOT_TOP', 2, 3]);
  assert.deepEqual(parseErr('const 1 = 2'), ['PARSE_UNEXPECTED_TOKEN', 1, 7]);
  assert.deepEqual(parseErr('const x 2'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  // lexer chạy trọn vẹn trước: lỗi lexer thắng lỗi cú pháp đứng trước
  assert.deepEqual(parseErr('} "abc'), ['LEX_UNTERMINATED_STRING', 1, 3]);
  for (const ok of ['a = []', 'a = [1,]', 'a = [[1,2],[],]', 'include ""', 'a { b { } }']) assert.equal(parse(ok).ok, true, ok);
  assert.equal(parse('include ""').ast.body[0].path, '');
});

test('parseProject: thứ tự tiền thứ tự, include trong khối, bỏ qua thiếu, chịu vòng', () => {
  const files = {
    main: 'include "b"\ns { include "c" }\ninclude "d"\ninclude "nope"',
    b: 'include "d"', c: 'x = 1', d: 'include "main"\ny = 2', unused: 'oops (',
  };
  const r = parseProject(files, 'main');
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.program.files), ['main', 'b', 'd', 'c']);
  assert.equal(r.program.entry, 'main');
});

test('parseProject: lỗi của tệp gặp đầu tiên, có file; entry thiếu', () => {
  const files = { main: 'include "z"\ninclude "a"', a: '=', z: 'q = "' };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, false);
  assert.deepEqual([r.error.code, r.error.file, r.error.line, r.error.column], ['LEX_UNTERMINATED_STRING', 'z', 1, 5]);
  const m = parseProject({}, 'main');
  assert.deepEqual([m.error.code, m.error.file, m.error.line, m.error.column], ['PARSE_ENTRY_NOT_FOUND', 'main', 1, 1]);
  assert.equal(parseProject({ main: '}' }, 'main').error.file, 'main');
});

// ── Check ──
test('check: pha A — thứ tự theo tệp rồi theo vị trí', () => {
  const files = {
    main: 's {\n b = 1\n b = 2\n}\ninclude "x"\na = 1\na = 2\na = 3\nconst c = 1\nconst c = 2\ninclude "y"',
    x: 'k = 1\nk = 2',
    y: 'include "nope"\ninclude "y"',
  };
  assert.deepEqual(chk(files), [
    ['SEM_DUPLICATE_KEY', 'main', 3, 2],
    ['SEM_DUPLICATE_KEY', 'main', 7, 1],
    ['SEM_DUPLICATE_KEY', 'main', 8, 1],
    ['SEM_DUPLICATE_CONST', 'main', 10, 1],
    ['SEM_DUPLICATE_KEY', 'x', 2, 1],
    ['SEM_INCLUDE_NOT_FOUND', 'y', 1, 1],
    ['SEM_INCLUDE_CYCLE', 'y', 2, 1],
  ]);
});

test('check: include hình thoi và vòng gián tiếp', () => {
  assert.deepEqual(chk({ main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'x = 1' }), []);
  assert.deepEqual(chk({ main: 'include "b"', b: 'include "main"' }), [['SEM_INCLUDE_CYCLE', 'b', 1, 1]]);
  // cùng khóa ở tệp khác hay khối khác không trùng
  assert.deepEqual(chk({ main: 'a = 1\ninclude "b"\ns { a = 1 }', b: 'a = 2' }), []);
});

test('check: pha A chặn pha B', () => {
  assert.deepEqual(chk({ main: 'a = 1\na = 2\nb = "${zz}"' }), [['SEM_DUPLICATE_KEY', 'main', 2, 1]]);
});

test('check: pha B — ưu tiên mã và vị trí Ref', () => {
  const src = 'const c = "${x}"\nconst d = "${@nope}"\nx = 1\nu = "ab ${nope}"';
  assert.deepEqual(chk({ main: src }), [
    ['SEM_CONST_CONFIG_REF', 'main', 1, 12],
    ['SEM_UNDEFINED_REF', 'main', 2, 12],
    ['SEM_UNDEFINED_REF', 'main', 4, 9],
  ]);
  // hằng khai báo sau chỗ dùng được; hằng tệp khác không thấy
  assert.deepEqual(chk({ main: 'a = "${@c}"\nconst c = 1\ninclude "o"', o: 'b = "${@c}"' }), [['SEM_UNDEFINED_REF', 'o', 1, 6]]);
  // đi xuyên chuỗi thì không tồn tại, null tồn tại, chỉ số mảng
  assert.deepEqual(chk({ main: 'n = null\ns = "x"\nl = [1,[2]]\na = "${n}"\nb = "${s.0}"\nc = "${l.1.0}"\nd = "${l.2}"' }), [
    ['SEM_UNDEFINED_REF', 'main', 5, 6],
    ['SEM_UNDEFINED_REF', 'main', 7, 6],
  ]);
  assert.deepEqual(chk({ main: 'const l = [5]\nx = "${@l.0}"\ny = "${@l.1}"' }), [['SEM_UNDEFINED_REF', 'main', 3, 6]]);
});

test('check: SEM_BAD_INTERPOLATION chỉ khi không thuần tham chiếu', () => {
  const src = 'l = [1]\no { k = 1 }\np = "${l}"\nq = "${o}"\nr = "${l}${o.k}"\ns = "n=${o.k}${o.k}"\nt = "x${l}"\nu = "${p}!"';
  assert.deepEqual(chk({ main: src }), [
    ['SEM_BAD_INTERPOLATION', 'main', 5, 6],
    ['SEM_BAD_INTERPOLATION', 'main', 7, 7],
    ['SEM_BAD_INTERPOLATION', 'main', 8, 6],
  ]);
});

test('check: SEM_REF_CYCLE', () => {
  assert.deepEqual(chk({ main: 'a = "${a}"' }), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(chk({ main: 'a = "${b}"\nb = "${a}"' }), [['SEM_REF_CYCLE', 'main', 1, 6], ['SEM_REF_CYCLE', 'main', 2, 6]]);
  assert.deepEqual(chk({ main: 'x { y = "${x}" }' }), [['SEM_REF_CYCLE', 'main', 1, 10]]);
  assert.deepEqual(chk({ main: 'a = "${b}"\nb = ["${a}"]' }), [['SEM_REF_CYCLE', 'main', 1, 6], ['SEM_REF_CYCLE', 'main', 2, 7]]);
  assert.deepEqual(chk({ main: 'const a = "${@b}"\nconst b = "${@a}"' }), [['SEM_REF_CYCLE', 'main', 1, 12], ['SEM_REF_CYCLE', 'main', 2, 12]]);
  // định nghĩa bị ghi đè không tạo vòng; chuỗi bị ghi đè vẫn được kiểm
  assert.deepEqual(chk({ main: 'include "o"\nb = 1', o: 'a = "${b}"\nb = "${a}"' }), []);
  assert.deepEqual(chk({ main: 'include "o"\na = 2', o: 'a = "${zz}"' }), [['SEM_UNDEFINED_REF', 'o', 1, 6]]);
  assert.deepEqual(chk({ main: 'include "b"\nk = 2', b: 'k = "${nope}"' }), [['SEM_UNDEFINED_REF', 'b', 1, 6]]);
});

test('check: pha C chỉ chạy khi có schema và pha B sạch', () => {
  const schema = { type: 'object', fields: { a: { type: 'string' } } };
  assert.deepEqual(chk({ main: 'a = 1' }, 'main', schema), [['SEM_TYPE_MISMATCH', 'main', 1, 5]]);
  assert.deepEqual(chk({ main: 'a = 1' }), []);
  assert.deepEqual(chk({ main: 'a = 1\nb = "${z}"' }, 'main', schema), [['SEM_UNDEFINED_REF', 'main', 2, 6]]);
});

test('check: pha C — vị trí đối tượng khởi tạo, required trước unknown, thứ tự khóa', () => {
  const schema = { type: 'object', closed: true, fields: {
    s: { type: 'object', closed: true, fields: { need: { required: true }, need2: { required: true }, ok: { type: 'integer' } } },
    z: { type: 'array', items: { type: 'integer' } },
    e: { enum: ['a', 'b'] },
  } };
  const src = 'z = [1, 2.5, "x"]\ns { bad = 1\n ok = 1.5 }\ne = "c"\nw = 1';
  assert.deepEqual(chk({ main: src }, 'main', schema), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 9],
    ['SEM_TYPE_MISMATCH', 'main', 1, 14],
    ['SEM_MISSING_REQUIRED', 'main', 2, 1],
    ['SEM_MISSING_REQUIRED', 'main', 2, 1],
    ['SEM_UNKNOWN_KEY', 'main', 2, 5],
    ['SEM_TYPE_MISMATCH', 'main', 3, 7],
    ['SEM_NOT_IN_ENUM', 'main', 4, 5],
    ['SEM_UNKNOWN_KEY', 'main', 5, 1],
  ]);
  // vị trí khối khởi tạo nằm ở tệp include; khối sau chỉ trộn thêm
  const r = chk({ main: 'include "b"\ns { y = 1 }', b: '\n s { x = 1 }' }, 'main',
    { type: 'object', fields: { s: { type: 'object', fields: { q: { required: true } } } } });
  assert.deepEqual(r, [['SEM_MISSING_REQUIRED', 'b', 2, 2]]);
  // Block thay thế Assign: vị trí là khối mới
  const r2 = chk({ main: 'include "b"\ns { y = 1 }', b: 's = 1' }, 'main', { type: 'object', fields: { s: { type: 'object', fields: { q: { required: true } } } } });
  assert.deepEqual(r2, [['SEM_MISSING_REQUIRED', 'main', 2, 1]]);
  // gốc 1:1 tại entry
  assert.deepEqual(chk({ main: '\n\na = 1' }, 'main', { type: 'array' }), [['SEM_TYPE_MISMATCH', 'main', 1, 1]]);
  // null / array / object không nhận nhau
  const s2 = { type: 'object', fields: { n: { type: 'null' }, o: { type: 'object' }, l: { type: 'array' } } };
  assert.deepEqual(chk({ main: 'n = 0\no = []\nl = null' }, 'main', s2).map((x) => x[0]), Array(3).fill('SEM_TYPE_MISMATCH'));
});

// ── Evaluate / compile ──
test('evaluate: ví dụ mục 9 và hình dạng', () => {
  const main = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }';
  assert.deepEqual(ev({ main }), { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
  const c = ev({ main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"', 'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"' });
  assert.deepEqual(c, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(c), ['server', 'mode']);
});

test('evaluate: hợp nhất, thứ tự khóa, mảng thay hẳn, không chia sẻ tham chiếu', () => {
  const c = ev({ main: 'include "b"\na { q = 1 }\nb { x = [9] y = 1 }\nl = [1]\nm = "${l}"\nn = "${l}"\no = "${b}"', b: 'a = 1\nb { x = [1,2] }' });
  assert.deepEqual(Object.keys(c), ['a', 'b', 'l', 'm', 'n', 'o']);
  assert.deepEqual(c.b, { x: [9], y: 1 });
  assert.notEqual(c.m, c.n);
  assert.notEqual(c.m, c.l);
  assert.notEqual(c.o, c.b);
  assert.notEqual(c.o.x, c.b.x);
  // Assign đè khối, rồi Block mới tạo đối tượng mới (không trộn với cũ)
  assert.deepEqual(ev({ main: 'include "b"\ninclude "c"\ninclude "d"', b: 's { a = 1 }', c: 's = 5', d: 's { b = 2 }' }), { s: { b: 2 } });
  // ghi đè giữ vị trí khóa
  assert.deepEqual(Object.keys(ev({ main: 'include "b"\na = 3', b: 'a = 1\nb = 2' })), ['a', 'b']);
});

test('evaluate: tham chiếu thấy giá trị cuối; ép kiểu chuỗi; null', () => {
  const c = ev({ main: 'include "b"\nv = "${late}!"\nlate = 1.50\nk = "${late}"\nn = null\nm = "[${n}|${f}|${big}]"\nf = false\nbig = 1e21\nz = "${v}"', b: 'late = "old"' });
  assert.equal(c.v, '1.5!');
  assert.equal(c.k, 1.5);
  assert.equal(c.m, '[null|false|1e+21]');
  assert.equal(c.z, '1.5!');
  assert.equal(ev({ main: 'a = "${a2}"\na2 = null' }).a, null);
});

test('evaluate: khóa __proto__ và chuỗi rỗng', () => {
  const c = ev({ main: '__proto__ { x = 1 }\ne = ""' });
  assert.deepEqual(Object.keys(c), ['__proto__', 'e']);
  assert.equal(c.e, '');
});

test('compile: hình dạng kết quả theo stage', () => {
  assert.deepEqual(Object.keys(compile({ main: 'a = 1' }, 'main')), ['ok', 'config']);
  const p = compile({ main: 'a = [,]' }, 'main');
  assert.equal(p.stage, 'parse');
  assert.equal(p.errors.length, 1);
  assert.equal(p.errors[0].file, 'main');
  const c = compile({ main: 'a = "${b}"' }, 'main');
  assert.equal(c.stage, 'check');
  assert.equal(c.ok, false);
  assert.equal(compile({ main: 'a = 1' }, 'zz').errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
});

test('index: named export đầy đủ, không default', () => {
  for (const n of ['tokenize', 'parse', 'parseProject', 'check', 'evaluate', 'compile', 'diff', 'applyDiff', 'formatText', 'formatJson', 'summarize', 'escapePointer', 'unescapePointer', 'parsePointer', 'formatPointer']) {
    assert.equal(typeof api[n], 'function', n);
  }
  assert.equal('default' in api, false);
});

// ── Diff ──
test('diff: ví dụ mục 9, thứ tự khóa thao tác, mảng, loại', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff({ a: null }, { a: {} }).map((o) => o.op), ['replace']);
  assert.deepEqual(diff([], {}).map((o) => [o.op, o.path]), [['replace', '']]);
  assert.deepEqual(diff(1, 1), []);
  assert.deepEqual(diff({ b: 1, B: 1, é: 1 }, {}).map((o) => o.path), ['/B', '/b', '/é']);
});

test('diff: bản sao sâu, applyDiff, lỗi', () => {
  const a = { x: [{ y: 1 }] };
  const ops = diff({}, a);
  a.x[0].y = 9;
  assert.equal(ops[0].value[0].y, 1);
  const A = { a: [1, { b: 2 }], c: 'x' }, B = { a: [1, { b: 3 }, 4], d: [] };
  const before = JSON.stringify(A);
  assert.deepEqual(applyDiff(A, diff(A, B)), B);
  assert.equal(JSON.stringify(A), before);
  assert.deepEqual(applyDiff(1, [{ op: 'replace', path: '', oldValue: 1, value: 2 }]), 2);
  for (const bad of [
    [{ op: 'add', path: '/c', value: 1 }],
    [{ op: 'remove', path: '/zz', oldValue: 1 }],
    [{ op: 'replace', path: '/a/9', oldValue: 1, value: 1 }],
    [{ op: 'add', path: '/a/9', value: 1 }],
  ]) assert.throws(() => applyDiff(A, bad), { code: 'DIFF_APPLY_FAILED' });
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
});

test('diff: pointer và định dạng', () => {
  assert.throws(() => api.unescapePointer('a~'), { code: 'DIFF_BAD_POINTER' });
  assert.throws(() => api.unescapePointer('~2'), { code: 'DIFF_BAD_POINTER' });
  assert.throws(() => api.parsePointer('a'), { code: 'DIFF_BAD_POINTER' });
  assert.deepEqual(api.parsePointer('/'), ['']);
  assert.deepEqual(api.parsePointer(''), []);
  assert.deepEqual(api.parsePointer('/a~01/b~1c'), ['a~1', 'b/c']);
  assert.equal(api.formatPointer([]), '');
  assert.equal(api.formatPointer(['a~/', 1]), '/a~0~1/1');
  assert.equal(api.escapePointer(5), '5');
  assert.equal(api.formatText([]), 'Không có thay đổi');
  assert.equal(api.formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(api.formatText(diff({ a: 1, b: 2 }, { a: 2, c: [1] })), '~ /a: 1 -> 2\n- /b = 2\n+ /c = [1]');
  assert.equal(api.formatJson([]), '[]');
  assert.deepEqual(api.summarize(diff({ a: 1, b: 1 }, { a: 2, c: 1 })), { add: 1, remove: 1, replace: 1 });
});
