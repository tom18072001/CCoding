import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false);
  return r.error;
};
const at = (src, code, line, column) => {
  const e = err(src);
  assert.deepEqual([e.code, e.line, e.column], [code, line, column], src);
};
const toks = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.tokens;
};

test('token cơ bản và eof', () => {
  const t = toks('a = [1, "x"] { } include const true');
  assert.deepEqual(t.map((x) => x.type), [
    'ident', 'punct', 'punct', 'number', 'punct', 'string', 'punct', 'punct', 'punct',
    'keyword', 'keyword', 'keyword', 'eof',
  ]);
  assert.equal(t.at(-1).value, null);
});

test('BOM không tính vào cột; xuống dòng \\n \\r\\n \\r', () => {
  const t = toks('﻿a\r\nb\rc\nd');
  assert.deepEqual(t.map((x) => [x.line, x.column]), [[1, 1], [2, 1], [3, 1], [4, 1], [4, 2]]);
});

test('eof tại vị trí con trỏ cuối', () => {
  const t = toks('a\n');
  assert.deepEqual([t.at(-1).line, t.at(-1).column], [2, 1]);
});

test('cột tính theo UTF-16', () => {
  const t = toks('"😀" x');
  assert.equal(t[1].column, 6);
});

test('chú thích các loại', () => {
  const t = toks('# c\n// d\n/* e\n f */ x');
  assert.equal(t.length, 2);
  assert.deepEqual([t[0].line, t[0].column], [4, 7]);
});

test('số hợp lệ', () => {
  const t = toks('0 -0 12 -1.5e2 1E+3 0.5');
  assert.deepEqual(t.slice(0, -1).map((x) => x.value), [0, 0, 12, -150, 1000, 0.5]);
  assert.ok(Object.is(t[1].value, 0));
});

test('LEX_BAD_NUMBER', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '+1']) {
    const e = err(`x = ${s}`);
    assert.equal(e.code, s === '+1' ? 'LEX_UNEXPECTED_CHAR' : 'LEX_BAD_NUMBER', s);
    assert.deepEqual([e.line, e.column], [1, 5]);
  }
  at('.5', 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('chuỗi: escape và \\$', () => {
  const t = toks('"a\\n\\t\\"\\\\\\/\\u0041\\${x}"');
  assert.deepEqual(t[0].value, [{ type: 'Text', value: 'a\n\t"\\/A${x}' }]);
});

test('chuỗi: Text gộp, Ref có vị trí, $ lẻ là thường', () => {
  const t = toks('"a$b${@c.d}e${x.0}"');
  assert.deepEqual(t[0].value, [
    { type: 'Text', value: 'a$b' },
    { type: 'Ref', path: ['c', 'd'], const: true, line: 1, column: 5 },
    { type: 'Text', value: 'e' },
    { type: 'Ref', path: ['x', '0'], const: false, line: 1, column: 13 },
  ]);
  assert.deepEqual(toks('""')[0].value, []);
});

test('LEX_UNEXPECTED_CHAR', () => {
  at('a = 1\n  é', 'LEX_UNEXPECTED_CHAR', 2, 3);
  at('a /', 'LEX_UNEXPECTED_CHAR', 1, 3);
  at('a = @', 'LEX_UNEXPECTED_CHAR', 1, 5);
});

test('LEX_UNTERMINATED_STRING', () => {
  at('a = "abc', 'LEX_UNTERMINATED_STRING', 1, 5);
  at('a = "abc\nb"', 'LEX_UNTERMINATED_STRING', 1, 5);
  at('x\n"a\r', 'LEX_UNTERMINATED_STRING', 2, 1);
});

test('LEX_UNTERMINATED_COMMENT', () => {
  at('a\n  /* x', 'LEX_UNTERMINATED_COMMENT', 2, 3);
});

test('LEX_BAD_ESCAPE', () => {
  at('a = "x\\q"', 'LEX_BAD_ESCAPE', 1, 7);
  at('a = "\\u12G4"', 'LEX_BAD_ESCAPE', 1, 6);
  at('a = "ab\\\nc"', 'LEX_BAD_ESCAPE', 1, 8);
});

test('LEX_BAD_INTERPOLATION', () => {
  at('a = "x${}"', 'LEX_BAD_INTERPOLATION', 1, 7);
  at('a = "${a b}"', 'LEX_BAD_INTERPOLATION', 1, 6);
  at('a = "${1a}"', 'LEX_BAD_INTERPOLATION', 1, 6);
  at('a = "${a.01}"', 'LEX_BAD_INTERPOLATION', 1, 6);
  at('a = "${@1}"', 'LEX_BAD_INTERPOLATION', 1, 6);
  at('a = "${a', 'LEX_BAD_INTERPOLATION', 1, 6);
  at('a = "${a"', 'LEX_BAD_INTERPOLATION', 1, 6);
});

test('lỗi gặp trước được báo (nội suy vs chuỗi chưa đóng)', () => {
  at('a = "${x', 'LEX_BAD_INTERPOLATION', 1, 6);
  at('a = "ab\\q${', 'LEX_BAD_ESCAPE', 1, 8);
});

test('lexer không ném', () => {
  for (const s of ['"', '\\', '/*', '${', '"\\u', '-', '﻿', '']) {
    assert.doesNotThrow(() => tokenize(s));
  }
  assert.equal(toks('').length, 1);
});
