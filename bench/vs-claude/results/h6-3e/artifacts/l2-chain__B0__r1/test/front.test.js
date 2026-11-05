// Ca biên tầng 1–2 đối chiếu SPEC.md (mục 3, 4, 5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';
import { parse, parseProject } from '../src/parser.js';
import { check } from '../src/check.js';

const lex = (s) => { const r = tokenize(s); return r.ok ? ['ok'] : [r.error.code, r.error.line, r.error.column]; };
const par = (s) => { const r = parse(s); return r.ok ? r.ast : [r.error.code, r.error.line, r.error.column]; };
const chk = (files, schema, entry = 'main') => {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return check(r.program, schema).map((e) => [e.code, e.file, e.line, e.column]);
};

test('lexer: số biên', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '-01', '1.5.2']) {
    assert.deepEqual(lex(s), ['LEX_BAD_NUMBER', 1, 1], s);
  }
  assert.deepEqual(lex('.5'), ['LEX_UNEXPECTED_CHAR', 1, 1]);
  assert.deepEqual(lex('+1'), ['LEX_UNEXPECTED_CHAR', 1, 1]);
  assert.ok(Object.is(tokenize('-0').tokens[0].value, 0));
  assert.equal(tokenize('-1.5e2').tokens[0].value, -150);
  assert.deepEqual(lex('a = 1/2'), ['LEX_UNEXPECTED_CHAR', 1, 6]);
});

test('lexer: lỗi chuỗi và thứ tự đọc', () => {
  assert.deepEqual(lex('x = "ab\\'), ['LEX_BAD_ESCAPE', 1, 8]);
  assert.deepEqual(lex('\\'), ['LEX_UNEXPECTED_CHAR', 1, 1]);
  assert.deepEqual(lex('"a\\\nb"'), ['LEX_BAD_ESCAPE', 1, 3]);
  assert.deepEqual(lex('"a\\u12G4"'), ['LEX_BAD_ESCAPE', 1, 3]);
  assert.deepEqual(lex('"a\\q"'), ['LEX_BAD_ESCAPE', 1, 3]);
  assert.deepEqual(lex('"abc\ndef"'), ['LEX_UNTERMINATED_STRING', 1, 1]);
  assert.deepEqual(lex('  "abc'), ['LEX_UNTERMINATED_STRING', 1, 3]);
  assert.deepEqual(lex('"ab ${a\n'), ['LEX_BAD_INTERPOLATION', 1, 5]);
  assert.deepEqual(lex('"ab ${a" x'), ['LEX_BAD_INTERPOLATION', 1, 5]);
  assert.deepEqual(lex('"ab\n${}"'), ['LEX_UNTERMINATED_STRING', 1, 1]);
  for (const b of ['${}', '${1a}', '${a..b}', '${a.}', '${ a}', '${@}', '${@1}', '${a b}', '${a.01}']) {
    assert.deepEqual(lex(`"${b}"`), ['LEX_BAD_INTERPOLATION', 1, 2], b);
  }
  assert.deepEqual(lex('"é${x}'), ['LEX_UNTERMINATED_STRING', 1, 1]);
});

test('lexer: nội suy hợp lệ, $ thường, \\$', () => {
  const parts = (s) => tokenize(s).tokens[0].value;
  assert.deepEqual(parts('"a$b$"'), [{ type: 'Text', value: 'a$b$' }]);
  assert.deepEqual(parts('"\\${a}"'), [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(parts('""'), []);
  assert.deepEqual(parts('"${@c.1.x-y.0}"'), [{ type: 'Ref', path: ['c', '1', 'x-y', '0'], const: true, line: 1, column: 2 }]);
  // quyết định (SPEC không nói rõ): từ khóa được chấp nhận là ident trong nội suy
  assert.equal(tokenize('"${true}"').ok, true);
});

test('lexer: chú thích và vị trí eof', () => {
  assert.deepEqual(lex('a /* x\ny'), ['LEX_UNTERMINATED_COMMENT', 1, 3]);
  const t = tokenize('/* a\r\n*/ # c\n// d\r').tokens;
  assert.deepEqual(t, [{ type: 'eof', value: null, line: 4, column: 1 }]);
  assert.deepEqual(lex('é = 1'), ['LEX_UNEXPECTED_CHAR', 1, 1]);
  assert.equal(tokenize('"😀" x').tokens[1].column, 6);
});

test('parser: lỗi cú pháp và thứ tự lexer trước', () => {
  const cases = [
    ['a = [,]', 'PARSE_UNEXPECTED_TOKEN', 1, 6],
    ['a = [1,,2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8],
    ['a = [1', 'PARSE_UNEXPECTED_EOF', 1, 7],
    ['a =', 'PARSE_UNEXPECTED_EOF', 1, 4],
    ['a', 'PARSE_UNEXPECTED_EOF', 1, 2],
    ['a {', 'PARSE_UNEXPECTED_EOF', 1, 4],
    ['}', 'PARSE_UNEXPECTED_TOKEN', 1, 1],
    ['a b', 'PARSE_UNEXPECTED_TOKEN', 1, 3],
    ['true = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1],
    ['a = b', 'PARSE_UNEXPECTED_TOKEN', 1, 5],
    ['a = {}', 'PARSE_UNEXPECTED_TOKEN', 1, 5],
    ['include 1', 'PARSE_UNEXPECTED_TOKEN', 1, 9],
    ['include', 'PARSE_UNEXPECTED_EOF', 1, 8],
    ['  include "a${b}"', 'PARSE_BAD_INCLUDE', 1, 11],
    ['a { const x = 1 }', 'PARSE_CONST_NOT_TOP', 1, 5],
    ['const a { }', 'PARSE_UNEXPECTED_TOKEN', 1, 9],
    ['const = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 7],
    ['a b\n"x', 'LEX_UNTERMINATED_STRING', 2, 1],
  ];
  for (const [src, ...want] of cases) assert.deepEqual(par(src), want, src);
});

test('parser: hình dạng AST', () => {
  assert.deepEqual(par('include ""\nconst c = [[1,],]\nk { a = null }'), {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Include', path: '', line: 1, column: 1 },
      { type: 'Const', name: 'c', line: 2, column: 1, value: { type: 'Array', line: 2, column: 11, items: [{ type: 'Array', line: 2, column: 12, items: [{ type: 'Number', value: 1, line: 2, column: 13 }] }] } },
      { type: 'Block', key: 'k', line: 3, column: 1, body: [{ type: 'Assign', key: 'a', line: 3, column: 5, value: { type: 'Null', line: 3, column: 9 } }] },
    ],
  });
  assert.equal(par('include "a\\"b"').body[0].path, 'a"b');
  assert.deepEqual(par('').body, []);
});

test('parseProject: tiền thứ tự, include trong khối, lỗi có file', () => {
  const files = { main: 'a { include "x" }\ninclude "y"', x: 'include "z"', y: 'v = 1', z: 'w = 1', unused: 'a b' };
  assert.deepEqual(Object.keys(parseProject(files, 'main').program.files), ['main', 'x', 'z', 'y']);
  const bad = parseProject({ main: 'include "x"\ninclude "y"', x: 'a = ', y: 'a "' }, 'main');
  assert.deepEqual([bad.error.code, bad.error.file, bad.error.line, bad.error.column], ['PARSE_UNEXPECTED_EOF', 'x', 1, 5]);
  assert.equal(parseProject({ main: 'include "nope"' }, 'main').ok, true);
  const e = parseProject({}, 'm').error;
  assert.deepEqual([e.code, e.file, e.line, e.column], ['PARSE_ENTRY_NOT_FOUND', 'm', 1, 1]);
});

test('check pha A: trùng khóa, vòng include, hình thoi, gom theo tệp', () => {
  assert.deepEqual(chk({ main: 'a = 1\na { }\nb { a = 1 a = 2 a = 3 }\nconst c = 1\nconst c = 2' }),
    [['SEM_DUPLICATE_KEY', 'main', 2, 1], ['SEM_DUPLICATE_KEY', 'main', 3, 11], ['SEM_DUPLICATE_KEY', 'main', 3, 17], ['SEM_DUPLICATE_CONST', 'main', 5, 1]]);
  assert.deepEqual(chk({ main: 'a = 1\ninclude "x"', x: 'a = 2' }), []);
  assert.deepEqual(chk({ main: 'include "main"' }), [['SEM_INCLUDE_CYCLE', 'main', 1, 1]]);
  assert.deepEqual(chk({ main: 'include "a"\ninclude "c"', a: 'include "b"', b: 'include "a"', c: 'include "b"' }),
    [['SEM_INCLUDE_CYCLE', 'b', 1, 1]]);
  assert.deepEqual(chk({ main: 'include "a"\ninclude "c"', a: 'include "d"', c: 'include "d"', d: 'x = 1' }), []);
  assert.deepEqual(chk({ main: 'include "x"\nk = 1\nk = 2\ninclude "q"', x: 'z = 1\nz = 2\ninclude "q2"' }),
    [['SEM_DUPLICATE_KEY', 'main', 3, 1], ['SEM_INCLUDE_NOT_FOUND', 'main', 4, 1], ['SEM_DUPLICATE_KEY', 'x', 2, 1], ['SEM_INCLUDE_NOT_FOUND', 'x', 3, 1]]);
});

test('check pha B: thứ tự kiểm và vòng', () => {
  assert.deepEqual(chk({ main: 'const a = 1\nconst b = "${x}${@a}${@zz}"\nx = 1' }),
    [['SEM_CONST_CONFIG_REF', 'main', 2, 12], ['SEM_UNDEFINED_REF', 'main', 2, 21]]);
  assert.deepEqual(chk({ main: 'a = "${@c}"\nconst c = 1\ninclude "x"', x: 'b = "${@c}"' }), [['SEM_UNDEFINED_REF', 'x', 1, 6]]);
  assert.deepEqual(chk({ main: 'a = "${a}"' }), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(chk({ main: 'a = "${b}"\nb = "${a}"' }), [['SEM_REF_CYCLE', 'main', 1, 6], ['SEM_REF_CYCLE', 'main', 2, 6]]);
  assert.deepEqual(chk({ main: 'x { y = "${x}" }' }), [['SEM_REF_CYCLE', 'main', 1, 10]]);
  assert.deepEqual(chk({ main: 'const a = "${@a}"' }), [['SEM_REF_CYCLE', 'main', 1, 12]]);
  assert.deepEqual(chk({ main: 'a = "x"\nb = "${a.c}"\nn = null\nm = "${n}"' }), [['SEM_UNDEFINED_REF', 'main', 2, 6]]);
  assert.equal(chk({ main: 'a = "${nope}"\ninclude "x"', x: 'a = 1' }).length, 1);
  assert.deepEqual(chk({ main: 'a = 1\ninclude "x"', x: 'a = "${nope}"' }), [['SEM_UNDEFINED_REF', 'x', 1, 6]]);
  assert.deepEqual(chk({ main: 'l = [1]\no { k = 1 }\np = "${l}"\nq = "a${l}"\nr = "${o}${o}"\ns = "${l.0}x"\nt = "a${p}"' }),
    [['SEM_BAD_INTERPOLATION', 'main', 4, 7], ['SEM_BAD_INTERPOLATION', 'main', 5, 6], ['SEM_BAD_INTERPOLATION', 'main', 5, 10], ['SEM_BAD_INTERPOLATION', 'main', 7, 7]]);
  assert.deepEqual(chk({ main: 'a = "${zz}"\na = 1' }), [['SEM_DUPLICATE_KEY', 'main', 2, 1]]);
});

test('check pha C: lược đồ và vị trí', () => {
  const S = { fields: { a: { type: 'integer' }, o: { type: 'object', required: true, closed: true, fields: { k: { enum: [1] } } }, l: { type: 'array', items: { type: 'string' } } } };
  assert.deepEqual(chk({ main: 'a = 1.5\nl = ["x", 2, "y"]\no { k = 2 z = 1 }' }, S),
    [['SEM_TYPE_MISMATCH', 'main', 1, 5], ['SEM_TYPE_MISMATCH', 'main', 2, 11], ['SEM_NOT_IN_ENUM', 'main', 3, 9], ['SEM_UNKNOWN_KEY', 'main', 3, 11]]);
  assert.deepEqual(chk({ main: 'a = 1' }, S), [['SEM_MISSING_REQUIRED', 'main', 1, 1]]);
  assert.deepEqual(chk({ main: 'a = 1' }, { type: 'array' }), [['SEM_TYPE_MISMATCH', 'main', 1, 1]]);
  assert.deepEqual(chk({ main: 'o = null' }, { fields: { o: { type: 'object' } } }), [['SEM_TYPE_MISMATCH', 'main', 1, 5]]);
  assert.deepEqual(chk({ main: 'o = 1' }, { closed: true }), []);
  assert.deepEqual(chk({ main: 'src { k = 1 z = 2 }\ndst = "${src}"\nn = "${src.k}"' },
    { fields: { dst: { closed: true, fields: { k: { type: 'string' } } }, n: { type: 'string' } } }),
    [['SEM_TYPE_MISMATCH', 'main', 2, 7], ['SEM_UNKNOWN_KEY', 'main', 2, 7], ['SEM_TYPE_MISMATCH', 'main', 3, 5]]);
  const req = { fields: { o: { fields: { q: { required: true } } } } };
  assert.deepEqual(chk({ main: 'o { a = 1 }\ninclude "x"', x: 'o { c = 1 }' }, req), [['SEM_MISSING_REQUIRED', 'main', 1, 1]]);
  assert.deepEqual(chk({ main: 'o { a = 1 }\ninclude "x"\ninclude "y"', x: 'o = 5', y: 'k = 1\no { c = 1 }' }, req), [['SEM_MISSING_REQUIRED', 'y', 2, 1]]);
  assert.deepEqual(chk({ main: 'o { a = 1 }\ninclude "x"', x: 'o { b = 1 }\nz = 1' },
    { closed: true, fields: { o: { closed: true, fields: { a: {} } } } }),
    [['SEM_UNKNOWN_KEY', 'x', 1, 5], ['SEM_UNKNOWN_KEY', 'x', 2, 1]]);
});
