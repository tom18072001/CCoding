import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false, `phải lỗi: ${JSON.stringify(src)}`);
  return r.error;
};
const ok = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.tokens;
};
const at = (e, code, line, column) => {
  assert.equal(e.code, code);
  assert.equal(e.line, line);
  assert.equal(e.column, column);
};

test('token cơ bản, từ khóa, dấu câu, eof', () => {
  const t = ok('const a-b = [true, null]');
  assert.deepEqual(t.map((x) => [x.type, x.value]), [
    ['keyword', 'const'], ['ident', 'a-b'], ['punct', '='], ['punct', '['],
    ['keyword', 'true'], ['punct', ','], ['keyword', 'null'], ['punct', ']'], ['eof', null],
  ]);
  assert.deepEqual(ok('')[0], { type: 'eof', value: null, line: 1, column: 1 });
});

test('eof ở vị trí con trỏ khi hết đầu vào', () => {
  const t = ok('a\n  ');
  assert.deepEqual(t.at(-1), { type: 'eof', value: null, line: 2, column: 3 });
});

test('BOM bị bỏ và không tính vào cột', () => {
  const t = ok('﻿ab');
  assert.equal(t[0].line, 1);
  assert.equal(t[0].column, 1);
  assert.equal(t[1].column, 3);
});

test('xuống dòng: \\n, \\r\\n (một lần), \\r đơn', () => {
  for (const nl of ['\n', '\r\n', '\r']) {
    const t = ok(`a${nl}b${nl}c`);
    assert.deepEqual(t.slice(0, 3).map((x) => [x.line, x.column]), [[1, 1], [2, 1], [3, 1]]);
  }
});

test('ký tự ngoài BMP đứng trước token chiếm 2 cột', () => {
  const e = err('"😀" @');
  at(e, 'LEX_UNEXPECTED_CHAR', 1, 6);
  const t = ok('"😀" a');
  assert.equal(t[1].column, 6);
});

test('chú thích #, //, /* */ nhiều dòng', () => {
  const t = ok('# c\n// d\n/* x\n y */ a');
  assert.equal(t.length, 2);
  assert.equal(t[0].line, 4);
  assert.equal(t[0].column, 7);
  // không lồng nhau
  at(err('/* a /* b */ */'), 'LEX_UNEXPECTED_CHAR', 1, 14);
});

test('số hợp lệ', () => {
  const v = (s) => ok(s)[0].value;
  assert.equal(v('0'), 0);
  assert.ok(Object.is(v('-0'), 0));
  assert.equal(v('-1.5e2'), -150);
  assert.equal(v('1E+2'), 100);
  assert.equal(v('10'), 10);
});

test('số sai → LEX_BAD_NUMBER tại ký tự đầu', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '+1']) {
    const e = err(`a = ${s}`);
    if (s === '+1') at(e, 'LEX_UNEXPECTED_CHAR', 1, 5);
    else at(e, 'LEX_BAD_NUMBER', 1, 5);
  }
  at(err('.5'), 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('chuỗi: thoát hợp lệ', () => {
  const t = ok('"a\\n\\t\\r\\"\\\\\\/\\$\\u0041"');
  assert.deepEqual(t[0].value, [{ type: 'Text', value: 'a\n\t\r"\\/$A' }]);
  assert.deepEqual(ok('""')[0].value, []);
  assert.deepEqual(ok('"${a}"')[0].value.length, 1);
  assert.deepEqual(ok('"\\${a}"')[0].value, [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(ok('"$ $x"')[0].value, [{ type: 'Text', value: '$ $x' }]);
});

test('nội suy: Ref có vị trí tại $, ghép Text liền nhau', () => {
  const t = ok('x "ab${@c.1}cd${a.b-c.0}"');
  assert.deepEqual(t[1].value, [
    { type: 'Text', value: 'ab' },
    { type: 'Ref', path: ['c', '1'], const: true, line: 1, column: 6 },
    { type: 'Text', value: 'cd' },
    { type: 'Ref', path: ['a', 'b-c', '0'], const: false, line: 1, column: 15 },
  ]);
  assert.deepEqual(ok('"a\\nb"')[0].value, [{ type: 'Text', value: 'a\nb' }]);
});

test('nội suy sai dạng → LEX_BAD_INTERPOLATION tại $', () => {
  for (const s of ['${}', '${1}', '${a b}', '${a.}', '${a.01}', '${@}', '${a..b}', '${ a}', '${@1}', '${a']) {
    at(err(`"x${s}"`), 'LEX_BAD_INTERPOLATION', 1, 3);
  }
  at(err('"${a'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"${a\n}"'), 'LEX_BAD_INTERPOLATION', 1, 2);
});

test('lỗi chuỗi: chưa đóng, thoát sai', () => {
  at(err('a = "abc'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "abc\n"'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "abc\rx"'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('"a\\q"'), 'LEX_BAD_ESCAPE', 1, 3);
  at(err('"a\\u12"'), 'LEX_BAD_ESCAPE', 1, 3);
  at(err('"a\\u12G4"'), 'LEX_BAD_ESCAPE', 1, 3);
  at(err('"a\\\nb"'), 'LEX_BAD_ESCAPE', 1, 3);
});

test('vừa chưa đóng vừa nội suy hỏng: lỗi gặp trước được báo', () => {
  at(err('"a${b'), 'LEX_BAD_INTERPOLATION', 1, 3);
  at(err('"a\\q ${b'), 'LEX_BAD_ESCAPE', 1, 3);
  at(err('"a ${b}'), 'LEX_UNTERMINATED_STRING', 1, 1);
  at(err('"a ${1} "x'), 'LEX_BAD_INTERPOLATION', 1, 4);
});

test('chú thích khối chưa đóng', () => {
  at(err('a\n  /* abc'), 'LEX_UNTERMINATED_COMMENT', 2, 3);
});

test('ký tự lạ', () => {
  at(err('a / b'), 'LEX_UNEXPECTED_CHAR', 1, 3);
  at(err('é'), 'LEX_UNEXPECTED_CHAR', 1, 1);
  at(err('a\n ;'), 'LEX_UNEXPECTED_CHAR', 2, 2);
});

test('dừng ở lỗi đầu tiên theo thứ tự đọc; không ném', () => {
  at(err('a = 01 é'), 'LEX_BAD_NUMBER', 1, 5);
  assert.doesNotThrow(() => tokenize(''));
});
