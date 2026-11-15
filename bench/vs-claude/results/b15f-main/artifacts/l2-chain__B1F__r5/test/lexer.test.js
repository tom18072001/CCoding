import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src, code, line, column) => {
  const r = tokenize(src);
  assert.equal(r.ok, false, `đợi lỗi cho ${JSON.stringify(src)}`);
  assert.equal(r.error.code, code);
  assert.equal(r.error.line, line);
  assert.equal(r.error.column, column);
};
const toks = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.tokens;
};
const str = (src) => toks(src)[0].value;

test('token cơ bản và eof', () => {
  const t = toks('a = 1\nconst b = true');
  assert.deepEqual(t.map((x) => [x.type, x.value]), [
    ['ident', 'a'], ['punct', '='], ['number', 1],
    ['keyword', 'const'], ['ident', 'b'], ['punct', '='], ['keyword', 'true'], ['eof', null],
  ]);
  assert.deepEqual([t[3].line, t[3].column], [2, 1]);
  assert.deepEqual([t.at(-1).line, t.at(-1).column], [2, 15]);
});

test('định danh có gạch nối', () => {
  assert.deepEqual(toks('a-b_1')[0], { type: 'ident', value: 'a-b_1', line: 1, column: 1 });
});

test('eof ở nguồn rỗng và sau xuống dòng', () => {
  assert.deepEqual(toks('')[0], { type: 'eof', value: null, line: 1, column: 1 });
  assert.deepEqual(toks('a\n').at(-1), { type: 'eof', value: null, line: 2, column: 1 });
});

test('BOM không tính vào cột', () => {
  assert.equal(toks('﻿a')[0].column, 1);
  err('﻿  @', 'LEX_UNEXPECTED_CHAR', 1, 3);
});

test('xuống dòng \\n, \\r\\n, \\r', () => {
  assert.deepEqual(toks('a\r\nb')[1], { type: 'ident', value: 'b', line: 2, column: 1 });
  assert.deepEqual(toks('a\rb')[1], { type: 'ident', value: 'b', line: 2, column: 1 });
  assert.deepEqual(toks('a\r\r\nb')[1], { type: 'ident', value: 'b', line: 3, column: 1 });
  assert.deepEqual(toks('a\n\rb')[1], { type: 'ident', value: 'b', line: 3, column: 1 });
});

test('cột theo đơn vị UTF-16 (ký tự ngoài BMP)', () => {
  const t = toks('a = "😀" b');
  assert.equal(t[3].column, 10);
  err('"😀" ~', 'LEX_UNEXPECTED_CHAR', 1, 6);
  err('é', 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('chú thích', () => {
  const t = toks('# x\n// y\na /* m\nn */ b # z');
  assert.deepEqual(t.map((x) => x.value), ['a', 'b', null]);
  assert.deepEqual([t[1].line, t[1].column], [4, 6]);
  assert.deepEqual(toks('a // x\r\nb')[1].line, 2);
  assert.deepEqual(toks('a # x\rb')[1].line, 2);
  assert.equal(toks('/**/').length, 1);
  assert.equal(toks('/* /* */ a')[0].value, 'a');
});

test('LEX_UNTERMINATED_COMMENT', () => {
  err('a\n  /* abc', 'LEX_UNTERMINATED_COMMENT', 2, 3);
  err('/*/', 'LEX_UNTERMINATED_COMMENT', 1, 1);
});

test('LEX_UNEXPECTED_CHAR', () => {
  err('a / b', 'LEX_UNEXPECTED_CHAR', 1, 3);
  err('a = .5', 'LEX_UNEXPECTED_CHAR', 1, 5);
  err('a;', 'LEX_UNEXPECTED_CHAR', 1, 2);
  err('\n\n  +1', 'LEX_UNEXPECTED_CHAR', 3, 3);
  err('a b', 'LEX_UNEXPECTED_CHAR', 1, 2);
});

test('số hợp lệ', () => {
  const v = (s) => toks(s)[0].value;
  assert.equal(v('0'), 0);
  assert.equal(v('-1.5e2'), -150);
  assert.equal(v('1E+2'), 100);
  assert.equal(v('10'), 10);
  assert.ok(Object.is(v('-0'), 0));
  assert.ok(Object.is(v('-0.0'), 0));
  assert.deepEqual(toks('[1,2]').map((x) => x.value), ['[', 1, ',', 2, ']', null]);
});

test('LEX_BAD_NUMBER', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '-01', '1.e2', '1_0', '--1']) {
    err(`a = ${s}`, 'LEX_BAD_NUMBER', 1, 5);
  }
  err('x\n  -', 'LEX_BAD_NUMBER', 2, 3);
});

test('chuỗi: escape', () => {
  assert.deepEqual(str('"a\\n\\t\\r\\"\\\\\\/\\$b"'), [{ type: 'Text', value: 'a\n\t\r"\\/$b' }]);
  assert.deepEqual(str('"\\u0041\\u00e9"'), [{ type: 'Text', value: 'Aé' }]);
  assert.deepEqual(str('"\\${a}"'), [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(str('"$ $x $"'), [{ type: 'Text', value: '$ $x $' }]);
});

test('chuỗi rỗng và Part', () => {
  assert.deepEqual(str('""'), []);
  assert.deepEqual(str('"${a}"'), [{ type: 'Ref', path: ['a'], const: false, line: 1, column: 2 }]);
  assert.deepEqual(str('"x${@r.1}y${a.b.0}"'), [
    { type: 'Text', value: 'x' },
    { type: 'Ref', path: ['r', '1'], const: true, line: 1, column: 3 },
    { type: 'Text', value: 'y' },
    { type: 'Ref', path: ['a', 'b', '0'], const: false, line: 1, column: 11 },
  ]);
  // Text xung quanh escape gộp thành một Text
  assert.deepEqual(str('"a\\$${x}\\"b"').map((p) => p.type), ['Text', 'Ref', 'Text']);
  assert.deepEqual(str('"${a}${b}"').map((p) => p.type), ['Ref', 'Ref']);
});

test('Ref trên dòng sau có vị trí đúng', () => {
  const t = toks('/* \n */ "ab${c}"');
  assert.deepEqual([t[0].line, t[0].column, t[0].value[1].line, t[0].value[1].column], [2, 5, 2, 8]);
});

test('LEX_UNTERMINATED_STRING', () => {
  err('a = "abc', 'LEX_UNTERMINATED_STRING', 1, 5);
  err('a = "abc\nd"', 'LEX_UNTERMINATED_STRING', 1, 5);
  err('a = "abc\r', 'LEX_UNTERMINATED_STRING', 1, 5);
  err('"', 'LEX_UNTERMINATED_STRING', 1, 1);
});

test('LEX_BAD_ESCAPE', () => {
  err('"ab\\x"', 'LEX_BAD_ESCAPE', 1, 4);
  err('"\\u12"', 'LEX_BAD_ESCAPE', 1, 2);
  err('"\\u12G4"', 'LEX_BAD_ESCAPE', 1, 2);
  err('"ab\\\ncd"', 'LEX_BAD_ESCAPE', 1, 4);
  err('"ab\\\r\ncd"', 'LEX_BAD_ESCAPE', 1, 4);
});

test('LEX_BAD_INTERPOLATION', () => {
  err('a = "x${}"', 'LEX_BAD_INTERPOLATION', 1, 7);
  err('a = "x${a"', 'LEX_BAD_INTERPOLATION', 1, 7);
  err('a = "x${a\n', 'LEX_BAD_INTERPOLATION', 1, 7);
  err('a = "x${a', 'LEX_BAD_INTERPOLATION', 1, 7);
  err('"${a b}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  err('"${ a}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  err('"${0}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  err('"${a.01}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  err('"${a.}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  err('"${a..b}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  err('"${@}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  err('"${@1}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  err('"${@@a}"', 'LEX_BAD_INTERPOLATION', 1, 2);
});

test('lỗi đầu tiên theo thứ tự đọc', () => {
  err('"\\q ${}"', 'LEX_BAD_ESCAPE', 1, 2);
  err('"${} \\q"', 'LEX_BAD_INTERPOLATION', 1, 2);
  err('"ab ${x} \\q', 'LEX_BAD_ESCAPE', 1, 10);
  err('"ab ${x} ', 'LEX_UNTERMINATED_STRING', 1, 1);
  err('a = 01\nb = "', 'LEX_BAD_NUMBER', 1, 5);
  err('b = "\na = 01', 'LEX_UNTERMINATED_STRING', 1, 5);
});

test('không bao giờ ném', () => {
  for (const s of ['', '\\', '"\\', '${', '/', '/*', '"${', '\uD83D', '-']) {
    assert.doesNotThrow(() => tokenize(s));
  }
});
