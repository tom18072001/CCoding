import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (s) => { const r = tokenize(s); assert.equal(r.ok, false, s); return r.error; };
const pos = (e) => [e.code, e.line, e.column];

test('token cơ bản, eof và vị trí', () => {
  const r = tokenize('a = 1\r\nb { }\rc');
  assert.deepEqual(r.tokens.map((t) => [t.type, t.line, t.column]), [
    ['ident', 1, 1], ['punct', 1, 3], ['number', 1, 5], ['ident', 2, 1], ['punct', 2, 3],
    ['punct', 2, 5], ['ident', 3, 1], ['eof', 3, 2],
  ]);
  assert.equal(r.tokens.at(-1).value, null);
});

test('BOM bị bỏ và không tính cột', () => {
  const r = tokenize('﻿a');
  assert.deepEqual([r.tokens[0].line, r.tokens[0].column], [1, 1]);
});

test('chú thích', () => {
  const r = tokenize('# x\n// y\n/* a\nb */ k /* c */');
  assert.deepEqual(r.tokens.map((t) => t.type), ['ident', 'eof']);
  assert.deepEqual([r.tokens[0].line, r.tokens[0].column], [4, 6]);
  assert.deepEqual(pos(err('a /* x\n')), ['LEX_UNTERMINATED_COMMENT', 1, 3]);
  assert.deepEqual(pos(err('a / b')), ['LEX_UNEXPECTED_CHAR', 1, 3]);
});

test('từ khóa và định danh', () => {
  const r = tokenize('include const true false null a-b_1');
  assert.deepEqual(r.tokens.map((t) => t.type).slice(0, 6), ['keyword', 'keyword', 'keyword', 'keyword', 'keyword', 'ident']);
  assert.equal(r.tokens[5].value, 'a-b_1');
});

test('số hợp lệ', () => {
  const vals = tokenize('0 -1.5e2 10 1E+3 -0 [1,2]').tokens.filter((t) => t.type === 'number').map((t) => t.value);
  assert.deepEqual(vals, [0, -150, 10, 1000, 0, 1, 2]);
  assert.ok(Object.is(vals[4], 0));
});

test('số sai', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999']) {
    assert.deepEqual(pos(err(`  ${s}`)), ['LEX_BAD_NUMBER', 1, 3], s);
  }
  assert.deepEqual(pos(err('.5')), ['LEX_UNEXPECTED_CHAR', 1, 1]);
});

test('chuỗi: thoát và nội suy', () => {
  const r = tokenize('"a\\n\\u0041\\$${x}\\${y} $ ${@c.0.k-1}"');
  assert.deepEqual(r.tokens[0].value, [
    { type: 'Text', value: 'a\nA$' },
    { type: 'Ref', path: ['x'], const: false, line: 1, column: 13 },
    { type: 'Text', value: '${y} $ ' },
    { type: 'Ref', path: ['c', '0', 'k-1'], const: true, line: 1, column: 25 },
  ]);
  assert.deepEqual(tokenize('""').tokens[0].value, []);
});

test('lỗi chuỗi', () => {
  assert.deepEqual(pos(err('x = "abc')), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(pos(err('"abc\n"')), ['LEX_UNTERMINATED_STRING', 1, 1]);
  assert.deepEqual(pos(err('"a\\q"')), ['LEX_BAD_ESCAPE', 1, 3]);
  assert.deepEqual(pos(err('"a\\u12"')), ['LEX_BAD_ESCAPE', 1, 3]);
  assert.deepEqual(pos(err('"a\\\n"')), ['LEX_BAD_ESCAPE', 1, 3]);
});

test('lỗi nội suy', () => {
  for (const s of ['${}', '${ a}', '${a', '${1a}', '${a..b}', '${a.01}', '${@}', '${a.}']) {
    assert.deepEqual(pos(err(`"x${s}"`)), ['LEX_BAD_INTERPOLATION', 1, 3], s);
  }
  assert.equal(tokenize('"${a.0.b.10}"').ok, true);
});

test('lỗi đầu tiên theo thứ tự đọc', () => {
  assert.deepEqual(pos(err('"${a')), ['LEX_BAD_INTERPOLATION', 1, 2]);
  assert.deepEqual(pos(err('"ab ${a}')), ['LEX_UNTERMINATED_STRING', 1, 1]);
  assert.deepEqual(pos(err('é "')), ['LEX_UNEXPECTED_CHAR', 1, 1]);
});

test('cột tính theo UTF-16', () => {
  const r = tokenize('"😀" x');
  assert.equal(r.tokens[1].column, 6);
});
