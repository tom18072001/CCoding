import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, parse, parseProject } from '../src/index.js';

const lex = (s) => { const r = tokenize(s); assert.equal(r.ok, false, s); const { code, line, column } = r.error; return [code, line, column]; };
const prs = (s) => { const r = parse(s); assert.equal(r.ok, false, s); const { code, line, column } = r.error; return [code, line, column]; };
const toks = (s) => { const r = tokenize(s); assert.equal(r.ok, true, JSON.stringify(r)); return r.tokens; };

test('lexer: BOM, ba kiểu xuống dòng, cột', () => {
  const t = toks('﻿a\r\nb\rc\nd');
  assert.deepEqual(t.map((x) => [x.value, x.line, x.column]), [['a', 1, 1], ['b', 2, 1], ['c', 3, 1], ['d', 4, 1], [null, 4, 2]]);
  assert.equal(t.at(-1).type, 'eof');
  assert.deepEqual(toks('﻿').map((x) => [x.line, x.column]), [[1, 1]]);
});

test('lexer: chú thích', () => {
  const t = toks('# a\n// b\r/* c\n d */ x /**/ y');
  assert.deepEqual(t.map((x) => x.value), ['x', 'y', null]);
  assert.deepEqual([t[0].line, t[0].column], [4, 7]);
  assert.deepEqual(lex('a /* x\n y'), ['LEX_UNTERMINATED_COMMENT', 1, 3]);
  assert.deepEqual(lex('/* /* */ */'), ['LEX_UNEXPECTED_CHAR', 1, 10]);
});

test('lexer: LEX_UNEXPECTED_CHAR', () => {
  assert.deepEqual(lex('a / b'), ['LEX_UNEXPECTED_CHAR', 1, 3]);
  assert.deepEqual(lex('\n  é'), ['LEX_UNEXPECTED_CHAR', 2, 3]);
  assert.deepEqual(lex('.5'), ['LEX_UNEXPECTED_CHAR', 1, 1]);
  assert.deepEqual(lex('a;'), ['LEX_UNEXPECTED_CHAR', 1, 2]);
  assert.deepEqual(lex('+1'), ['LEX_UNEXPECTED_CHAR', 1, 1]);
});

test('lexer: số', () => {
  assert.ok(Object.is(toks('-0')[0].value, 0));
  assert.equal(toks('1.50e+2')[0].value, 150);
  assert.equal(toks('[1,2]').length, 6);
  for (const b of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '-abc']) {
    assert.equal(lex(b)[0], 'LEX_BAD_NUMBER', b);
  }
  assert.deepEqual(lex('a = \n  1-2'), ['LEX_BAD_NUMBER', 2, 3]);
});

test('lexer: chuỗi, thoát, nội suy -> Part', () => {
  const s = (x) => toks(x)[0].value;
  assert.deepEqual(s('""'), []);
  assert.deepEqual(s('"a\\n\\t\\r\\"\\\\\\/\\$\\u0041"'), [{ type: 'Text', value: 'a\n\t\r"\\/$A' }]);
  assert.deepEqual(s('"\\${a}"'), [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(s('"$x $"'), [{ type: 'Text', value: '$x $' }]);
  assert.deepEqual(s('"p${@c.1}${a.b.0}q"'), [
    { type: 'Text', value: 'p' },
    { type: 'Ref', path: ['c', '1'], const: true, line: 1, column: 3 },
    { type: 'Ref', path: ['a', 'b', '0'], const: false, line: 1, column: 10 },
    { type: 'Text', value: 'q' },
  ]);
  assert.deepEqual(s('"${a}"').map((p) => p.type), ['Ref']);
});

test('lexer: LEX_UNTERMINATED_STRING', () => {
  assert.deepEqual(lex('x = "abc'), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(lex('x = "ab\nc"'), ['LEX_UNTERMINATED_STRING', 1, 5]);
  // \r đơn lẻ trong chuỗi = xuống dòng thật
  assert.deepEqual(lex('x = "ab\rc"'), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(lex('"ab\r\nc"'), ['LEX_UNTERMINATED_STRING', 1, 1]);
});

test('lexer: LEX_BAD_ESCAPE', () => {
  assert.deepEqual(lex('"ab\\q"'), ['LEX_BAD_ESCAPE', 1, 4]);
  assert.deepEqual(lex('"\\u12G4"'), ['LEX_BAD_ESCAPE', 1, 2]);
  assert.deepEqual(lex('"\\u12"'), ['LEX_BAD_ESCAPE', 1, 2]);
  assert.deepEqual(lex('"a\\\nb"'), ['LEX_BAD_ESCAPE', 1, 3]);
  assert.deepEqual(lex('"a\\\r\nb"'), ['LEX_BAD_ESCAPE', 1, 3]);
  // `\` ngay trước hết tệp: chốt là LEX_BAD_ESCAPE (thoát thiếu ký tự)
  assert.deepEqual(lex('"a\\'), ['LEX_BAD_ESCAPE', 1, 3]);
});

test('lexer: LEX_BAD_INTERPOLATION và thứ tự lỗi', () => {
  for (const b of ['"${}"', '"${a b}"', '"${1a}"', '"${a.01}"', '"${@}"', '"${@1}"', '"${a..b}"', '"${a.}"', '"${.a}"']) {
    assert.deepEqual(lex(b), ['LEX_BAD_INTERPOLATION', 1, 2], b);
  }
  assert.deepEqual(lex('"xx${a"'), ['LEX_BAD_INTERPOLATION', 1, 4]);
  assert.deepEqual(lex('"${a'), ['LEX_BAD_INTERPOLATION', 1, 2]);
  assert.deepEqual(lex('"${a\n}"'), ['LEX_BAD_INTERPOLATION', 1, 2]);
  assert.deepEqual(toks('"${a.0.b-c}"')[0].value[0].path, ['a', '0', 'b-c']);
  // lỗi gặp trước (từ trái sang) được báo
  assert.deepEqual(lex('"\\q${"'), ['LEX_BAD_ESCAPE', 1, 2]);
  assert.deepEqual(lex('"${}\\q'), ['LEX_BAD_INTERPOLATION', 1, 2]);
  // nội suy không lồng được
  assert.deepEqual(lex('"${a${b}}"'), ['LEX_BAD_INTERPOLATION', 1, 2]);
  // lỗi lexer đứng trước lỗi cú pháp
  assert.equal(parse('= = "\\q"').error.code, 'LEX_BAD_ESCAPE');
});

test('parser: AST và vị trí', () => {
  const r = parse('const r = "x"\nk = [1, [true, null], "a",]\nb {\n  inc = false\n  include ""\n}\ninclude "f.cfg"');
  assert.equal(r.ok, true);
  const [c, k, b, inc] = r.ast.body;
  assert.deepEqual([r.ast.type, r.ast.line, r.ast.column], ['File', 1, 1]);
  assert.deepEqual(c, { type: 'Const', name: 'r', value: { type: 'String', parts: [{ type: 'Text', value: 'x' }], line: 1, column: 11 }, line: 1, column: 1 });
  assert.equal(k.type, 'Assign');
  assert.deepEqual([k.value.type, k.value.line, k.value.column, k.value.items.map((x) => x.type)], ['Array', 2, 5, ['Number', 'Array', 'String']]);
  assert.deepEqual(k.value.items[1].items, [
    { type: 'Bool', value: true, line: 2, column: 10 }, { type: 'Null', line: 2, column: 16 }]);
  assert.deepEqual([b.type, b.key, b.line, b.column], ['Block', 'b', 3, 1]);
  assert.deepEqual(b.body[1], { type: 'Include', path: '', line: 5, column: 3 });
  assert.deepEqual(inc, { type: 'Include', path: 'f.cfg', line: 7, column: 1 });
  assert.deepEqual(parse('').ast, { type: 'File', body: [], line: 1, column: 1 });
  assert.equal(parse('a=[]').ast.body[0].value.items.length, 0);
});

test('parser: PARSE_UNEXPECTED_EOF', () => {
  assert.deepEqual(prs('a = '), ['PARSE_UNEXPECTED_EOF', 1, 5]);
  assert.deepEqual(prs('a'), ['PARSE_UNEXPECTED_EOF', 1, 2]);
  assert.deepEqual(prs('a {\n b = 1'), ['PARSE_UNEXPECTED_EOF', 2, 7]);
  assert.deepEqual(prs('a = [1,'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.deepEqual(prs('a = [1'), ['PARSE_UNEXPECTED_EOF', 1, 7]);
  assert.deepEqual(prs('include'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.deepEqual(prs('const x'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
});

test('parser: PARSE_UNEXPECTED_TOKEN', () => {
  assert.deepEqual(prs('}'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(prs('a {}\n}'), ['PARSE_UNEXPECTED_TOKEN', 2, 1]);
  assert.deepEqual(prs('true = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(prs('a = b'), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(prs('a b'), ['PARSE_UNEXPECTED_TOKEN', 1, 3]);
  assert.deepEqual(prs('a = [,]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(prs('a = [1,,2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(prs('a = [1 2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(prs('a = [b {}]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(prs('include 5'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  assert.deepEqual(prs('const = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 7]);
  assert.deepEqual(prs('const x 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  assert.deepEqual(prs('a = 1 ,'), ['PARSE_UNEXPECTED_TOKEN', 1, 7]);
});

test('parser: PARSE_BAD_INCLUDE', () => {
  assert.deepEqual(prs('include "a${b}"'), ['PARSE_BAD_INCLUDE', 1, 9]);
  assert.deepEqual(prs('x {\n include "${@c}"\n}'), ['PARSE_BAD_INCLUDE', 2, 10]);
  assert.equal(parse('include "a\\${b}"').ast.body[0].path, 'a${b}');
});

test('parser: PARSE_CONST_NOT_TOP', () => {
  assert.deepEqual(prs('a {\n  const x = 1\n}'), ['PARSE_CONST_NOT_TOP', 2, 3]);
  assert.deepEqual(prs('a { b { const'), ['PARSE_CONST_NOT_TOP', 1, 9]);
  assert.equal(parse('const x = [1]\na { b = 1 }').ok, true);
});

test('parseProject: tiền thứ tự, include trong khối, lỗi có file', () => {
  const files = {
    main: 'a = 1\nblk { include "b" }\ninclude "c"\ninclude "missing"',
    b: 'include "d"\nx = 1',
    c: 'include "d"\ninclude "main"',
    d: 'y = 2',
    unused: '}}}',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'b', 'd', 'c']);

  const e = parseProject({ main: 'include "b"\ninclude "c"', b: 'x = ', c: 'y = "\\q"' }, 'main');
  assert.deepEqual([e.ok, e.error.code, e.error.file, e.error.line, e.error.column], [false, 'PARSE_UNEXPECTED_EOF', 'b', 1, 5]);
  const e2 = parseProject({ main: 'include "c"', c: 'y = "\\q"' }, 'main');
  assert.deepEqual([e2.error.code, e2.error.file, e2.error.line, e2.error.column], ['LEX_BAD_ESCAPE', 'c', 1, 6]);
  const e3 = parseProject({ main: 'a = = ' }, 'main');
  assert.deepEqual([e3.error.code, e3.error.file], ['PARSE_UNEXPECTED_TOKEN', 'main']);

  const nf = parseProject({ x: '' }, 'main');
  assert.deepEqual(nf, { ok: false, error: { code: 'PARSE_ENTRY_NOT_FOUND', message: nf.error.message, file: 'main', line: 1, column: 1 } });
  assert.equal(parseProject({}, 'toString').error.code, 'PARSE_ENTRY_NOT_FOUND');
});
