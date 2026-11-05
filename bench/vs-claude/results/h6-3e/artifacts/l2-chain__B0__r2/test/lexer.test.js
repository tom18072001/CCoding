import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (s) => { const r = tokenize(s); assert.equal(r.ok, false, s); return r.error; };
const types = (s) => tokenize(s).tokens.map((t) => t.type);

test('token cơ bản, vị trí, eof', () => {
  const r = tokenize('a = 1\n  b');
  assert.deepEqual(r.tokens.map((t) => [t.type, t.line, t.column]),
    [['ident', 1, 1], ['punct', 1, 3], ['number', 1, 5], ['ident', 2, 3], ['eof', 2, 4]]);
  assert.equal(r.tokens.at(-1).value, null);
});

test('BOM, \\r\\n và \\r đơn', () => {
  const r = tokenize('﻿a\r\nb\rc');
  assert.deepEqual(r.tokens.map((t) => [t.line, t.column]), [[1, 1], [2, 1], [3, 1], [3, 2]]);
});

test('chú thích', () => {
  assert.deepEqual(types('# x\n// y\n/* z\n w */ a'), ['ident', 'eof']);
  const e = err('a /* x');
  assert.deepEqual([e.code, e.line, e.column], ['LEX_UNTERMINATED_COMMENT', 1, 3]);
  assert.equal(err('a / b').code, 'LEX_UNEXPECTED_CHAR');
});

test('số', () => {
  const v = (s) => tokenize(s).tokens[0].value;
  assert.equal(v('-1.5e2'), -150);
  assert.ok(Object.is(v('-0'), 0));
  for (const bad of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999']) {
    assert.equal(err(bad).code, 'LEX_BAD_NUMBER', bad);
  }
  assert.equal(err('x = 01').column, 5);
  assert.equal(err('+1').code, 'LEX_UNEXPECTED_CHAR');
  assert.equal(err('.5').code, 'LEX_UNEXPECTED_CHAR');
  assert.equal(tokenize('[1,2]').tokens.length, 6);
});

test('từ khóa và định danh', () => {
  assert.deepEqual(types('include const true false null a-b_1'),
    ['keyword', 'keyword', 'keyword', 'keyword', 'keyword', 'ident', 'eof']);
});

test('chuỗi: thoát và nội suy', () => {
  const t = tokenize('"a\\n\\u0041\\$${x.0}b${@c}$z"').tokens[0];
  assert.deepEqual(t.value, [
    { type: 'Text', value: 'a\nA$' },
    { type: 'Ref', path: ['x', '0'], const: false, line: 1, column: 13 },
    { type: 'Text', value: 'b' },
    { type: 'Ref', path: ['c'], const: true, line: 1, column: 20 },
    { type: 'Text', value: '$z' },
  ]);
  assert.deepEqual(tokenize('""').tokens[0].value, []);
  assert.deepEqual(tokenize('"\\${a}"').tokens[0].value, [{ type: 'Text', value: '${a}' }]);
});

test('lỗi chuỗi', () => {
  const u = err('x = "abc');
  assert.deepEqual([u.code, u.line, u.column], ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.equal(err('"a\nb"').code, 'LEX_UNTERMINATED_STRING');
  const b = err('"a\\q"');
  assert.deepEqual([b.code, b.column], ['LEX_BAD_ESCAPE', 3]);
  assert.equal(err('"\\u12"').code, 'LEX_BAD_ESCAPE');
  assert.equal(err('"a\\\nb"').code, 'LEX_BAD_ESCAPE');
  for (const bad of ['"${}"', '"${a b}"', '"${1a}"', '"${a.01}"', '"${a"', '"${a', '"${a.}"', '"${@}"']) {
    assert.equal(err(bad).code, 'LEX_BAD_INTERPOLATION', bad);
  }
  assert.equal(err('"ab ${x').code, 'LEX_BAD_INTERPOLATION');
  assert.equal(err('é').code, 'LEX_UNEXPECTED_CHAR');
});

test('lỗi đầu tiên theo thứ tự đọc', () => {
  assert.equal(err('"\\q ${').code, 'LEX_BAD_ESCAPE');
  assert.equal(err('a = 01 "').code, 'LEX_BAD_NUMBER');
});

test('backslash cuối tệp hoặc trước xuống dòng là LEX_BAD_ESCAPE', () => {
  for (const [s, c] of [['"a\\', 3], ['"a\\\nb"', 3], ['"a\\u12', 3]]) {
    const r = tokenize(s);
    assert.equal(r.ok, false);
    assert.deepEqual([r.error.code, r.error.line, r.error.column], ['LEX_BAD_ESCAPE', 1, c]);
  }
  const r = tokenize('"abc');
  assert.deepEqual([r.error.code, r.error.column], ['LEX_UNTERMINATED_STRING', 1]);
});
