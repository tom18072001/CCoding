import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false, `đợi lỗi cho ${JSON.stringify(src)}`);
  return [r.error.code, r.error.line, r.error.column];
};
const toks = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.tokens;
};

test('token cơ bản và eof', () => {
  assert.deepEqual(toks('a = 1'), [
    { type: 'ident', value: 'a', line: 1, column: 1 },
    { type: 'punct', value: '=', line: 1, column: 3 },
    { type: 'number', value: 1, line: 1, column: 5 },
    { type: 'eof', value: null, line: 1, column: 6 },
  ]);
  assert.deepEqual(toks('')[0], { type: 'eof', value: null, line: 1, column: 1 });
});

test('từ khóa', () => {
  assert.deepEqual(toks('include const true false null x').map((t) => t.type),
    ['keyword', 'keyword', 'keyword', 'keyword', 'keyword', 'ident', 'eof']);
});

test('BOM không tính vào cột; CRLF và CR là một lần xuống dòng', () => {
  const t = toks('﻿a\r\nb\rc\nd');
  assert.deepEqual(t.map((x) => [x.line, x.column]), [[1, 1], [2, 1], [3, 1], [4, 1], [4, 2]]);
  assert.deepEqual(toks('﻿')[0], { type: 'eof', value: null, line: 1, column: 1 });
});

test('cột đếm theo UTF-16 (cặp thay thế chiếm 2)', () => {
  const t = toks('"😀" x');
  assert.equal(t[1].column, 6);
  const t2 = toks('# é😀\nx');
  assert.deepEqual([t2[0].line, t2[0].column], [2, 1]);
});

test('chú thích các loại', () => {
  const t = toks('# a\n// b\n/* c\n d */ x /**/ y');
  assert.deepEqual(t.map((x) => [x.type, x.line, x.column]), [['ident', 4, 7], ['ident', 4, 14], ['eof', 4, 15]]);
});

test('số hợp lệ', () => {
  const v = (s) => toks(s)[0].value;
  assert.equal(v('0'), 0);
  assert.equal(Object.is(v('-0'), 0), true);
  assert.equal(v('-1.5e2'), -150);
  assert.equal(v('1E+2'), 100);
  assert.equal(v('10.25'), 10.25);
  assert.deepEqual(toks('[1,2]').map((t) => t.value), ['[', 1, ',', 2, ']', null]);
});

test('số lỗi tại ký tự đầu', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '-01', '1.5.2', '0x10', '1_0']) {
    assert.deepEqual(err(`a = ${s}`), ['LEX_BAD_NUMBER', 1, 5], s);
  }
  assert.deepEqual(err('.5'), ['LEX_UNEXPECTED_CHAR', 1, 1]);
  assert.deepEqual(err('+1'), ['LEX_UNEXPECTED_CHAR', 1, 1]);
});

test('chuỗi: thoát và rỗng', () => {
  assert.deepEqual(toks('""')[0].value, []);
  assert.deepEqual(toks('"a\\n\\t\\r\\"\\\\\\/\\u0041\\u00e9"')[0].value, [{ type: 'Text', value: 'a\n\t\r"\\/Aé' }]);
});

test('chuỗi: \\$ và $ thường', () => {
  assert.deepEqual(toks('"\\${a}"')[0].value, [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(toks('"$ $x $"')[0].value, [{ type: 'Text', value: '$ $x $' }]);
});

test('nội suy: Part Text/Ref, vị trí tại $', () => {
  const t = toks('x = "a${b.0}c${@d.e}${f}"')[2];
  assert.deepEqual(t.value, [
    { type: 'Text', value: 'a' },
    { type: 'Ref', path: ['b', '0'], const: false, line: 1, column: 7 },
    { type: 'Text', value: 'c' },
    { type: 'Ref', path: ['d', 'e'], const: true, line: 1, column: 14 },
    { type: 'Ref', path: ['f'], const: false, line: 1, column: 21 },
  ]);
  assert.deepEqual([t.line, t.column], [1, 5]);
});

test('lỗi LEX_UNEXPECTED_CHAR', () => {
  assert.deepEqual(err('a = @'), ['LEX_UNEXPECTED_CHAR', 1, 5]);
  assert.deepEqual(err('\n  / x'), ['LEX_UNEXPECTED_CHAR', 2, 3]);
  assert.deepEqual(err('é = 1'), ['LEX_UNEXPECTED_CHAR', 1, 1]);
  assert.deepEqual(err('a = 1;'), ['LEX_UNEXPECTED_CHAR', 1, 6]);
});

test('lỗi LEX_UNTERMINATED_STRING', () => {
  assert.deepEqual(err('a = "abc'), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(err('a = "abc\nd"'), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(err('a = "abc\r'), ['LEX_UNTERMINATED_STRING', 1, 5]);
});

test('lỗi LEX_UNTERMINATED_COMMENT', () => {
  assert.deepEqual(err('a = 1\n  /* x\n y'), ['LEX_UNTERMINATED_COMMENT', 2, 3]);
  assert.deepEqual(err('/*/'), ['LEX_UNTERMINATED_COMMENT', 1, 1]);
});

test('lỗi LEX_BAD_ESCAPE', () => {
  assert.deepEqual(err('a = "x\\q"'), ['LEX_BAD_ESCAPE', 1, 7]);
  assert.deepEqual(err('a = "x\\u12"'), ['LEX_BAD_ESCAPE', 1, 7]);
  assert.deepEqual(err('a = "x\\u12G4"'), ['LEX_BAD_ESCAPE', 1, 7]);
  assert.deepEqual(err('a = "x\\\ny"'), ['LEX_BAD_ESCAPE', 1, 7]);
  assert.deepEqual(err('a = "x\\'), ['LEX_BAD_ESCAPE', 1, 7]);
});

test('lỗi LEX_BAD_INTERPOLATION', () => {
  for (const s of ['${}', '${a', '${a b}', '${1a}', '${a.}', '${a..b}', '${a.01}', '${@}', '${@@a}', '${ a}', '${.a}']) {
    assert.deepEqual(err(`x = "p${s}"`), ['LEX_BAD_INTERPOLATION', 1, 7], s);
  }
  assert.deepEqual(err('x = "${a\nb}"'), ['LEX_BAD_INTERPOLATION', 1, 6]);
  assert.deepEqual(err('x = "${a'), ['LEX_BAD_INTERPOLATION', 1, 6]);
  // hợp lệ
  assert.equal(tokenize('x = "${a.0.b-c.10}${@_k}"').ok, true);
});

test('thứ tự lỗi: gặp trước báo trước', () => {
  // nội suy hỏng đứng trước phần chưa đóng
  assert.deepEqual(err('x = "${}abc'), ['LEX_BAD_INTERPOLATION', 1, 6]);
  // thoát hỏng đứng trước chuỗi chưa đóng
  assert.deepEqual(err('x = "\\q abc'), ['LEX_BAD_ESCAPE', 1, 6]);
  // chuỗi chưa đóng đứng trước số hỏng ở dòng sau
  assert.deepEqual(err('x = "abc\ny = 01'), ['LEX_UNTERMINATED_STRING', 1, 5]);
  // lỗi đầu tiên theo thứ tự đọc
  assert.deepEqual(err('a = 01\nb = @'), ['LEX_BAD_NUMBER', 1, 5]);
});

test('không ném với đầu vào lạ', () => {
  assert.equal(tokenize('\u0000').ok, false);
  assert.equal(tokenize('"\uD83D"').ok, true);
});
