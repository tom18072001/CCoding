import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src) => { const r = tokenize(src); assert.equal(r.ok, false); return r.error; };
const pos = (e) => [e.code, e.line, e.column];

test('số hợp lệ và không hợp lệ', () => {
  const r = tokenize('-0 -1.5e2 0');
  assert.deepEqual(r.tokens.slice(0, 3).map((t) => t.value), [0, -150, 0]);
  assert.ok(Object.is(r.tokens[0].value, 0));
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999']) assert.equal(err(s).code, 'LEX_BAD_NUMBER', s);
  assert.equal(err('.5').code, 'LEX_UNEXPECTED_CHAR');
});

test('chú thích, BOM, xuống dòng và eof', () => {
  const r = tokenize('﻿# c\r\n// d\r/* x\ny */ a');
  assert.deepEqual(r.tokens[0], { type: 'ident', value: 'a', line: 4, column: 6 });
  assert.deepEqual(r.tokens[1], { type: 'eof', value: null, line: 4, column: 7 });
  assert.deepEqual(pos(err('a /* x')), ['LEX_UNTERMINATED_COMMENT', 1, 3]);
  assert.equal(err('a / b').code, 'LEX_UNEXPECTED_CHAR');
});

test('chuỗi: thoát và nội suy', () => {
  const r = tokenize('"a\\n\\u0041\\$${x}$b${@c.0.d}\\${y}"');
  assert.deepEqual(r.tokens[0].value, [
    { type: 'Text', value: 'a\nA$' },
    { type: 'Ref', path: ['x'], const: false, line: 1, column: 13 },
    { type: 'Text', value: '$b' },
    { type: 'Ref', path: ['c', '0', 'd'], const: true, line: 1, column: 19 },
    { type: 'Text', value: '${y}' },
  ]);
  assert.deepEqual(tokenize('""').tokens[0].value, []);
});

test('lỗi chuỗi', () => {
  assert.deepEqual(pos(err('x = "abc')), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(pos(err('"abc\n"')), ['LEX_UNTERMINATED_STRING', 1, 1]);
  assert.deepEqual(pos(err('"a\\q"')), ['LEX_BAD_ESCAPE', 1, 3]);
  assert.deepEqual(pos(err('"\\u12"')), ['LEX_BAD_ESCAPE', 1, 2]);
  assert.deepEqual(pos(err('"a\\\nb"')), ['LEX_BAD_ESCAPE', 1, 3]);
  for (const s of ['"${}"', '"${1a}"', '"${a b}"', '"${a', '"${a"', '"${a.01}"', '"${.a}"', '"${@}"']) {
    assert.equal(err(s).code, 'LEX_BAD_INTERPOLATION', s);
  }
  assert.deepEqual(pos(err('"ab ${x} ${y\n')), ['LEX_BAD_INTERPOLATION', 1, 10]);
  assert.deepEqual(pos(err('"${x} \\q ${')), ['LEX_BAD_ESCAPE', 1, 7]);
});

test('ký tự lạ và từ khóa', () => {
  assert.deepEqual(pos(err('a = é')), ['LEX_UNEXPECTED_CHAR', 1, 5]);
  const r = tokenize('const include a-b true');
  assert.deepEqual(r.tokens.map((t) => t.type), ['keyword', 'keyword', 'ident', 'keyword', 'eof']);
});
