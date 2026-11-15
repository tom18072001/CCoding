import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false, `mong lỗi với ${JSON.stringify(src)}`);
  return r.error;
};
const at = (src, code, line, column) => {
  const e = err(src);
  assert.deepEqual([e.code, e.line, e.column], [code, line, column], JSON.stringify(src));
};
const toks = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.tokens;
};

test('token cơ bản, từ khóa, dấu câu, eof', () => {
  const t = toks('const a = [1, "x"] include true null b-c {}');
  assert.deepEqual(
    t.map((x) => [x.type, x.value]).filter((x) => x[0] !== 'string'),
    [['keyword', 'const'], ['ident', 'a'], ['punct', '='], ['punct', '['], ['number', 1], ['punct', ','],
      ['punct', ']'], ['keyword', 'include'], ['keyword', 'true'], ['keyword', 'null'], ['ident', 'b-c'],
      ['punct', '{'], ['punct', '}'], ['eof', null]],
  );
});

test('vị trí eof và token', () => {
  const t = toks('a\n  b');
  assert.deepEqual([t[1].line, t[1].column], [2, 3]);
  assert.deepEqual([t[2].type, t[2].line, t[2].column], ['eof', 2, 4]);
  const e = toks('');
  assert.deepEqual(e, [{ type: 'eof', value: null, line: 1, column: 1 }]);
});

test('BOM bị bỏ và không tính cột', () => {
  const t = toks('﻿a');
  assert.deepEqual([t[0].line, t[0].column], [1, 1]);
  assert.deepEqual([t[1].line, t[1].column], [1, 2]);
  at('﻿$', 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('xuống dòng: \\n, \\r\\n, \\r đơn lẻ', () => {
  assert.deepEqual(toks('a\r\nb')[1].line, 2);
  assert.deepEqual(toks('a\r\nb')[1].column, 1);
  assert.deepEqual(toks('a\rb')[1].line, 2);
  assert.deepEqual(toks('a\r\r\nb')[1].line, 3);
  assert.deepEqual(toks('a\n\rb')[1].line, 3);
  at('a\r\n  @', 'LEX_UNEXPECTED_CHAR', 2, 3);
});

test('cột theo đơn vị mã UTF-16', () => {
  const t = toks('"😀" x');
  assert.deepEqual([t[1].line, t[1].column], [1, 6]);
  at('"😀" é', 'LEX_UNEXPECTED_CHAR', 1, 6);
});

test('chú thích', () => {
  const t = toks('# a\n// b\n/* c\n d */ x # e');
  assert.equal(t.length, 2);
  assert.deepEqual([t[0].line, t[0].column], [4, 7]);
  assert.equal(toks('a // x\rb')[1].value, 'b');
  at('a /* x\n y', 'LEX_UNTERMINATED_COMMENT', 1, 3);
  at('/*/', 'LEX_UNTERMINATED_COMMENT', 1, 1);
  at('a / b', 'LEX_UNEXPECTED_CHAR', 1, 3);
});

test('số hợp lệ', () => {
  const v = (s) => toks(s)[0].value;
  assert.equal(v('0'), 0);
  assert.equal(v('-1.5e2'), -150);
  assert.equal(v('1E+2'), 100);
  assert.equal(v('12'), 12);
  assert.ok(Object.is(v('-0'), 0));
  assert.ok(Object.is(v('-0.0'), 0));
});

test('số không hợp lệ', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '--1', '1_0', '-a']) {
    at(`a = ${s}`, 'LEX_BAD_NUMBER', 1, 5);
  }
  at('.5', 'LEX_UNEXPECTED_CHAR', 1, 1);
  at('x\n  1e999 y', 'LEX_BAD_NUMBER', 2, 3);
  assert.equal(toks('[1,2]').length, 6);
});

test('chuỗi: escape và Part', () => {
  const s = toks('"a\\n\\t\\r\\"\\\\\\/\\$\\u0041\\u00e9b"')[0].value;
  assert.deepEqual(s, [{ type: 'Text', value: 'a\n\t\r"\\/$Aéb' }]);
  assert.deepEqual(toks('""')[0].value, []);
  assert.deepEqual(toks('"${a}"')[0].value, [{ type: 'Ref', path: ['a'], const: false, line: 1, column: 2 }]);
});

test('chuỗi: \\${a} là văn bản, $ lẻ là ký tự thường', () => {
  assert.deepEqual(toks('"\\${a}"')[0].value, [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(toks('"$a $ ${a}$"')[0].value, [
    { type: 'Text', value: '$a $ ' },
    { type: 'Ref', path: ['a'], const: false, line: 1, column: 7 },
    { type: 'Text', value: '$' },
  ]);
});

test('Ref: đường dẫn, hằng, vị trí, gộp Text', () => {
  const p = toks('x\n  "ab${a.b.0}c${@region}${@l.1}d\\ne"')[1].value;
  assert.deepEqual(p, [
    { type: 'Text', value: 'ab' },
    { type: 'Ref', path: ['a', 'b', '0'], const: false, line: 2, column: 6 },
    { type: 'Text', value: 'c' },
    { type: 'Ref', path: ['region'], const: true, line: 2, column: 15 },
    { type: 'Ref', path: ['l', '1'], const: true, line: 2, column: 25 },
    { type: 'Text', value: 'd\ne' },
  ]);
  // Text gộp qua escape
  assert.equal(toks('"a\\u0062c"')[0].value.length, 1);
});

test('chuỗi chưa đóng', () => {
  at('a = "abc', 'LEX_UNTERMINATED_STRING', 1, 5);
  at('a = "abc\nd"', 'LEX_UNTERMINATED_STRING', 1, 5);
  at('a = "abc\rd"', 'LEX_UNTERMINATED_STRING', 1, 5);
  at('"', 'LEX_UNTERMINATED_STRING', 1, 1);
});

test('escape sai', () => {
  at('"ab\\x"', 'LEX_BAD_ESCAPE', 1, 4);
  at('"\\u12"', 'LEX_BAD_ESCAPE', 1, 2);
  at('"\\u12G4"', 'LEX_BAD_ESCAPE', 1, 2);
  at('"ab\\\ncd"', 'LEX_BAD_ESCAPE', 1, 4);
  at('"ab\\\r\ncd"', 'LEX_BAD_ESCAPE', 1, 4);
});

test('nội suy sai', () => {
  for (const body of ['${}', '${ a}', '${a }', '${1a}', '${a.}', '${a..b}', '${a.01}', '${@}', '${@1}', '${a.b-c.-}', '${a b}', '${.a}']) {
    at(`x = "ab${body}"`, 'LEX_BAD_INTERPOLATION', 1, 8);
  }
  at('"${a"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${a', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${a\n}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  assert.equal(tokenize('"${a-b.c_d.10.0}"').ok, true);
  assert.equal(tokenize('"${@a-b}"').ok, true);
});

test('lỗi đầu tiên theo thứ tự đọc', () => {
  at('"${a"\n', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"\\q ${}', 'LEX_BAD_ESCAPE', 1, 2);
  at('"${} \\q"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"abc ${a} \\q', 'LEX_BAD_ESCAPE', 1, 11);
  at('a = 01 "x', 'LEX_BAD_NUMBER', 1, 5);
  at('"x ${a}\n $', 'LEX_UNTERMINATED_STRING', 1, 1);
});

test('ký tự lạ', () => {
  at('a = ;', 'LEX_UNEXPECTED_CHAR', 1, 5);
  at('é', 'LEX_UNEXPECTED_CHAR', 1, 1);
  at("'a'", 'LEX_UNEXPECTED_CHAR', 1, 1);
  at('a\n\t@', 'LEX_UNEXPECTED_CHAR', 2, 2);
});

test('không ném với đầu vào lạ', () => {
  for (const s of ['\0', '\uD800', '"\uD800', '\\', '"\\', '/*', '${']) {
    assert.doesNotThrow(() => tokenize(s));
  }
});
