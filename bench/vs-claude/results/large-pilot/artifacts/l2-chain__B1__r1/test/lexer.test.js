import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (s) => { const r = tokenize(s); assert.equal(r.ok, false); return r.error; };

test('lexer: BOM, CRLF, vị trí eof', () => {
  const r = tokenize('﻿a\r\n= 1');
  assert.deepEqual(r.tokens.map((t) => [t.type, t.line, t.column]),
    [['ident', 1, 1], ['punct', 2, 1], ['number', 2, 3], ['eof', 2, 4]]);
});

test('lexer: chú thích', () => {
  const r = tokenize('# a\n// b\n/* c\nd */ x');
  assert.deepEqual(r.tokens.map((t) => t.type), ['ident', 'eof']);
  assert.equal(r.tokens[0].line, 4);
  assert.equal(err('/* x').code, 'LEX_UNTERMINATED_COMMENT');
  assert.equal(err('a / b').code, 'LEX_UNEXPECTED_CHAR');
});

test('lexer: số', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999']) {
    assert.equal(err(s).code, 'LEX_BAD_NUMBER', s);
  }
  assert.equal(err('+1').code, 'LEX_UNEXPECTED_CHAR');
  assert.equal(err('.5').code, 'LEX_UNEXPECTED_CHAR');
  const t = tokenize('-0 -1.5e2 0').tokens;
  assert.ok(Object.is(t[0].value, 0));
  assert.equal(t[1].value, -150);
});

test('lexer: chuỗi, thoát và nội suy', () => {
  const t = tokenize('"a\\n\\u0041\\${x} $ ${@c.1}${a.b.0}"').tokens[0];
  assert.deepEqual(t.value.map((p) => p.type), ['Text', 'Ref', 'Ref']);
  assert.equal(t.value[0].value, 'a\nA${x} $ ');
  assert.deepEqual(t.value[1], { type: 'Ref', path: ['c', '1'], const: true, line: 1, column: 19 });
  assert.deepEqual(t.value[2].path, ['a', 'b', '0']);
  assert.deepEqual(tokenize('""').tokens[0].value, []);
});

test('lexer: lỗi chuỗi', () => {
  const u = err('x "ab');
  assert.deepEqual([u.code, u.line, u.column], ['LEX_UNTERMINATED_STRING', 1, 3]);
  assert.equal(err('"a\\q"').code, 'LEX_BAD_ESCAPE');
  assert.equal(err('"\\u12"').code, 'LEX_BAD_ESCAPE');
  assert.equal(err('"a\\\n"').column, 3);
  assert.equal(err('"${}"').code, 'LEX_BAD_INTERPOLATION');
  assert.equal(err('"${1a}"').code, 'LEX_BAD_INTERPOLATION');
  assert.equal(err('"${a b}"').code, 'LEX_BAD_INTERPOLATION');
  assert.equal(err('"${a.01}"').code, 'LEX_BAD_INTERPOLATION');
  const i = err('"x ${a');
  assert.deepEqual([i.code, i.column], ['LEX_BAD_INTERPOLATION', 4]);
});

test('lexer: nội suy không nhận từ khóa làm đoạn tên (SPEC §1, §3)', () => {
  for (const s of ['"${true}"', '"${@const}"', '"${a.null}"', '"${include}"']) {
    assert.equal(err(s).code, 'LEX_BAD_INTERPOLATION', s);
  }
  assert.equal(tokenize('"${a.0.true_x}"').ok, true);
});

test('lexer: `\` cuối tệp là LEX_BAD_ESCAPE tại dấu `\`', () => {
  const e = err('"ab\\');
  assert.deepEqual([e.code, e.line, e.column], ['LEX_BAD_ESCAPE', 1, 4]);
});

test('lexer: CR đơn lẻ, CRLF tính một lần, BOM không tính cột', () => {
  const r = tokenize('\uFEFFa\rb\r\n  c');
  assert.deepEqual(r.tokens.map((t) => [t.line, t.column]), [[1, 1], [2, 1], [3, 3], [3, 4]]);
  const e = err('a\r\nb\r"x');
  assert.deepEqual([e.code, e.line, e.column], ['LEX_UNTERMINATED_STRING', 3, 1]);
});

test('lexer: lỗi đầu tiên theo thứ tự đọc', () => {
  assert.equal(err('"${a\n \\q').code, 'LEX_BAD_INTERPOLATION');
  assert.equal(err('"\\q ${').code, 'LEX_BAD_ESCAPE');
});
