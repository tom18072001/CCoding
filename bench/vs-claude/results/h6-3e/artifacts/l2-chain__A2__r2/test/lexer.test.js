import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (s) => { const r = tokenize(s); assert.equal(r.ok, false, s); return r.error; };
const pos = (e) => [e.code, e.line, e.column];

test('số hợp lệ và -0', () => {
  const r = tokenize('-0 1.5e2 0 -1.5e+2');
  assert.deepEqual(r.tokens.slice(0, 4).map((t) => t.value), [0, 150, 0, -150]);
  assert.ok(Object.is(r.tokens[0].value, 0));
});

test('số lỗi', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999']) assert.equal(err(s).code, 'LEX_BAD_NUMBER', s);
  assert.deepEqual(pos(err('.5')), ['LEX_UNEXPECTED_CHAR', 1, 1]);
});

test('BOM, CRLF và vị trí eof', () => {
  const r = tokenize('﻿a\r\nb\rc');
  assert.deepEqual(r.tokens.map((t) => [t.line, t.column]), [[1, 1], [2, 1], [3, 1], [3, 2]]);
});

test('chú thích', () => {
  assert.equal(tokenize('# x\n// y\n/* z\n */ a').tokens.length, 2);
  assert.deepEqual(pos(err('a /* x')), ['LEX_UNTERMINATED_COMMENT', 1, 3]);
  assert.deepEqual(pos(err('a / b')), ['LEX_UNEXPECTED_CHAR', 1, 3]);
});

test('chuỗi, thoát và nội suy', () => {
  const r = tokenize('"a\\n\\u0041\\$${x.0}${@c}$b"');
  assert.deepEqual(r.tokens[0].value, [
    { type: 'Text', value: 'a\nA$' },
    { type: 'Ref', path: ['x', '0'], const: false, line: 1, column: 13 },
    { type: 'Ref', path: ['c'], const: true, line: 1, column: 19 },
    { type: 'Text', value: '$b' },
  ]);
  assert.deepEqual(tokenize('""').tokens[0].value, []);
});

test('lỗi chuỗi', () => {
  assert.deepEqual(pos(err('x = "abc')), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(pos(err('"a\nb"')), ['LEX_UNTERMINATED_STRING', 1, 1]);
  assert.deepEqual(pos(err('"a\\q"')), ['LEX_BAD_ESCAPE', 1, 3]);
  assert.deepEqual(pos(err('"\\u12"')), ['LEX_BAD_ESCAPE', 1, 2]);
  assert.deepEqual(pos(err('"a\\\nb"')), ['LEX_BAD_ESCAPE', 1, 3]);
  for (const s of ['"${}"', '"${a b}"', '"${1a}"', '"${a.01}"', '"${a"', '"${a.}"', '"x${a']) {
    assert.equal(err(s).code, 'LEX_BAD_INTERPOLATION', s);
  }
  assert.deepEqual(pos(err('"ab${a')), ['LEX_BAD_INTERPOLATION', 1, 4]);
});

test('ký tự lạ', () => {
  assert.deepEqual(pos(err('a = é')), ['LEX_UNEXPECTED_CHAR', 1, 5]);
});
