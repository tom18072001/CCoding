import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false);
  return r.error;
};
const toks = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.tokens;
};
const at = (e, code, line, column) => {
  assert.equal(e.code, code);
  assert.equal(e.line, line);
  assert.equal(e.column, column);
};

test('token cơ bản và eof ngay sau ký tự cuối', () => {
  const t = toks('a = 1');
  assert.deepEqual(t.map((x) => x.type), ['ident', 'punct', 'number', 'eof']);
  assert.deepEqual(t[3], { type: 'eof', value: null, line: 1, column: 6 });
});

test('từ khóa và dấu câu', () => {
  const t = toks('include const true false null = { } [ ] ,');
  assert.deepEqual(t.slice(0, 5).map((x) => x.type), Array(5).fill('keyword'));
  assert.deepEqual(t.slice(5, 11).map((x) => x.value), ['=', '{', '}', '[', ']', ',']);
});

test('định danh có gạch ngang; true-x là ident', () => {
  assert.deepEqual(toks('a-b_1 true-x')[0].value, 'a-b_1');
  assert.equal(toks('true-x')[0].type, 'ident');
});

test('BOM bị bỏ và không tính cột', () => {
  const t = toks('﻿a');
  assert.equal(t[0].column, 1);
  assert.equal(t[1].column, 2);
});

test('xuống dòng \\n, \\r\\n, \\r', () => {
  const t = toks('a\r\nb\rc\nd');
  assert.deepEqual(t.slice(0, 4).map((x) => [x.line, x.column]), [[1, 1], [2, 1], [3, 1], [4, 1]]);
  assert.deepEqual([t[4].line, t[4].column], [4, 2]);
});

test('chú thích #, //, /* */ nhiều dòng', () => {
  const t = toks('# x\n// y\n/* a\nb */ z');
  assert.equal(t.length, 2);
  assert.deepEqual([t[0].line, t[0].column], [4, 6]);
});

test('cột tính theo đơn vị UTF-16', () => {
  const t = toks('"😀" x');
  assert.equal(t[1].column, 6);
});

test('số hợp lệ, -0 thành 0', () => {
  const v = toks('0 12 -1.5e2 1E+2 -0 0.5').slice(0, 6).map((x) => x.value);
  assert.deepEqual(v, [0, 12, -150, 100, 0, 0.5]);
  assert.ok(Object.is(v[4], 0));
});

test('số không hợp lệ', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '-x']) {
    at(err(`a = ${s}`), 'LEX_BAD_NUMBER', 1, 5);
  }
  at(err('.5'), 'LEX_UNEXPECTED_CHAR', 1, 1);
  at(err('+1'), 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('chuỗi: escape và Text liền nhau được gộp', () => {
  const t = toks('"a\\n\\t\\r\\"\\\\\\/\\$\\u0041$b"');
  assert.deepEqual(t[0].value, [{ type: 'Text', value: 'a\n\t\r"\\/$A$b' }]);
  assert.deepEqual(toks('""')[0].value, []);
});

test('\\${a} là văn bản, không phải tham chiếu', () => {
  assert.deepEqual(toks('"\\${a}"')[0].value, [{ type: 'Text', value: '${a}' }]);
});

test('Ref: đường dẫn, const, vị trí tại $', () => {
  const t = toks('x = "ab${@c.1}${a.b.0}"');
  assert.deepEqual(t[2].value, [
    { type: 'Text', value: 'ab' },
    { type: 'Ref', path: ['c', '1'], const: true, line: 1, column: 8 },
    { type: 'Ref', path: ['a', 'b', '0'], const: false, line: 1, column: 15 },
  ]);
});

test('LEX_UNEXPECTED_CHAR', () => {
  at(err('a = 1 ;'), 'LEX_UNEXPECTED_CHAR', 1, 7);
  at(err('a / b'), 'LEX_UNEXPECTED_CHAR', 1, 3);
  at(err('á = 1'), 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('LEX_UNTERMINATED_STRING', () => {
  at(err('a = "abc'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "abc\nd"'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "abc\rd"'), 'LEX_UNTERMINATED_STRING', 1, 5);
});

test('LEX_UNTERMINATED_COMMENT', () => {
  at(err('a = 1\n  /* x'), 'LEX_UNTERMINATED_COMMENT', 2, 3);
});

test('LEX_BAD_ESCAPE', () => {
  at(err('"a\\q"'), 'LEX_BAD_ESCAPE', 1, 3);
  at(err('"\\u12G4"'), 'LEX_BAD_ESCAPE', 1, 2);
  at(err('"\\u12"'), 'LEX_BAD_ESCAPE', 1, 2);
  at(err('"a\\\nb"'), 'LEX_BAD_ESCAPE', 1, 3);
});

test('LEX_BAD_INTERPOLATION', () => {
  at(err('"x${a"'), 'LEX_BAD_INTERPOLATION', 1, 3);
  at(err('"${}"'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"${a b}"'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"${1a}"'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"${a.01}"'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"${a.}"'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"${@}"'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"${@@a}"'), 'LEX_BAD_INTERPOLATION', 1, 2);
});

test('$ không theo sau bởi { là ký tự thường', () => {
  assert.deepEqual(toks('"$a $"')[0].value, [{ type: 'Text', value: '$a $' }]);
});

test('lỗi đầu tiên theo thứ tự đọc', () => {
  at(err('"${a\\q}'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"\\q ${a'), 'LEX_BAD_ESCAPE', 1, 2);
  at(err('"${a} \\q'), 'LEX_BAD_ESCAPE', 1, 7);
  at(err('x = ; "abc'), 'LEX_UNEXPECTED_CHAR', 1, 5);
});

test('không ném với đầu vào lạ', () => {
  assert.equal(tokenize('').ok, true);
  assert.deepEqual(toks('').map((x) => x.type), ['eof']);
});
