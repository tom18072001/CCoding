import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false);
  return r.error;
};
const pos = (e) => [e.code, e.line, e.column];

test('token cơ bản, eof và vị trí', () => {
  const r = tokenize('a = [1, "x"]\n');
  assert.deepEqual(r.tokens.map((t) => t.type), ['ident', 'punct', 'punct', 'number', 'punct', 'string', 'punct', 'eof']);
  assert.deepEqual(r.tokens.at(-1), { type: 'eof', value: null, line: 2, column: 1 });
});

test('BOM không tính cột; \\r\\n tính một lần; \\r đơn lẻ', () => {
  const r = tokenize('﻿a\r\nb\rc');
  assert.deepEqual(r.tokens.map((t) => [t.line, t.column]), [[1, 1], [2, 1], [3, 1], [3, 2]]);
});

test('từ khóa và định danh có gạch nối', () => {
  const r = tokenize('const my-key include');
  assert.deepEqual(r.tokens.slice(0, 3).map((t) => [t.type, t.value]), [['keyword', 'const'], ['ident', 'my-key'], ['keyword', 'include']]);
});

test('chú thích các loại', () => {
  const r = tokenize('# a\n// b\n/* c\n d */ x');
  assert.equal(r.tokens.length, 2);
  assert.deepEqual([r.tokens[0].line, r.tokens[0].column], [4, 7]);
});

test('số hợp lệ', () => {
  const v = (s) => tokenize(s).tokens[0].value;
  assert.equal(v('-1.5e2'), -150);
  assert.ok(Object.is(v('-0'), 0));
  assert.equal(v('0'), 0);
  assert.equal(v('1E+2'), 100);
});

test('số lỗi', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '-x']) {
    assert.equal(err('x = ' + s).code, 'LEX_BAD_NUMBER', s);
    assert.deepEqual([err('x = ' + s).line, err('x = ' + s).column], [1, 5]);
  }
  assert.equal(err('.5').code, 'LEX_UNEXPECTED_CHAR');
});

test('chuỗi: thoát và nội suy', () => {
  const r = tokenize('"a\\n\\u0041\\$${b.0}${@c}$x\\${y}"');
  assert.deepEqual(r.tokens[0].value, [
    { type: 'Text', value: 'a\nA$' },
    { type: 'Ref', path: ['b', '0'], const: false, line: 1, column: 13 },
    { type: 'Ref', path: ['c'], const: true, line: 1, column: 19 },
    { type: 'Text', value: '$x${y}' },
  ]);
  assert.deepEqual(tokenize('""').tokens[0].value, []);
});

test('lỗi chuỗi', () => {
  assert.deepEqual(pos(err('a = "abc')), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(pos(err('a = "abc\n"')), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(pos(err('a = "x\\q"')), ['LEX_BAD_ESCAPE', 1, 7]);
  assert.deepEqual(pos(err('a = "\\u12"')), ['LEX_BAD_ESCAPE', 1, 6]);
  assert.deepEqual(pos(err('a = "x\\\n"')), ['LEX_BAD_ESCAPE', 1, 7]);
});

test('lỗi nội suy', () => {
  for (const s of ['"${}"', '"${a b}"', '"${1a}"', '"${a.01}"', '"${a"', '"${a', '"${a\n}"', '"${.a}"', '"${@}"']) {
    assert.equal(err(s).code, 'LEX_BAD_INTERPOLATION', s);
    assert.deepEqual([err(s).line, err(s).column], [1, 2]);
  }
  // lỗi nào gặp trước
  assert.equal(err('"\\q${}"').code, 'LEX_BAD_ESCAPE');
  assert.equal(err('"${}\\q"').code, 'LEX_BAD_INTERPOLATION');
});

test('ký tự lạ và chú thích chưa đóng', () => {
  assert.deepEqual(pos(err('a = 1 / 2')), ['LEX_UNEXPECTED_CHAR', 1, 7]);
  assert.deepEqual(pos(err('é')), ['LEX_UNEXPECTED_CHAR', 1, 1]);
  assert.deepEqual(pos(err('a\n  /* x')), ['LEX_UNTERMINATED_COMMENT', 2, 3]);
  assert.equal(err('/*/').code, 'LEX_UNTERMINATED_COMMENT');
});
