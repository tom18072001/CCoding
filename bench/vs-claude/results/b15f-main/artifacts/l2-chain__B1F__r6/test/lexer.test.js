import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false, `đáng lẽ lỗi: ${JSON.stringify(src)}`);
  return r.error;
};
const at = (e, code, line, column) => assert.deepEqual([e.code, e.line, e.column], [code, line, column]);
const first = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.tokens[0];
};

test('vị trí, BOM, \\r\\n và \\r đơn lẻ', () => {
  const r = tokenize('﻿a\r\nb\rc\nd');
  const pos = r.tokens.map((t) => [t.line, t.column]);
  assert.deepEqual(pos, [[1, 1], [2, 1], [3, 1], [4, 1], [4, 2]]);
  assert.deepEqual(tokenize('').tokens, [{ type: 'eof', value: null, line: 1, column: 1 }]);
  assert.deepEqual(tokenize('﻿').tokens[0].column, 1);
});

test('eof ở vị trí con trỏ', () => {
  const t = tokenize('a = 1  \n  ').tokens.at(-1);
  assert.deepEqual([t.type, t.line, t.column], ['eof', 2, 3]);
});

test('chú thích', () => {
  const r = tokenize('# x\n// y\n/* a\nb */ k /**/');
  assert.deepEqual(r.tokens.map((t) => t.type), ['ident', 'eof']);
  assert.deepEqual([r.tokens[0].line, r.tokens[0].column], [4, 6]);
  at(err('a\n  /* mở'), 'LEX_UNTERMINATED_COMMENT', 2, 3);
});

test('từ khóa và định danh', () => {
  assert.equal(first('include').type, 'keyword');
  assert.deepEqual([first('a-b_1').type, first('a-b_1').value], ['ident', 'a-b_1']);
  assert.equal(first('includes').type, 'ident');
});

test('số hợp lệ', () => {
  assert.equal(first('-1.5e2').value, -150);
  assert.equal(first('0').value, 0);
  assert.equal(first('1E+2').value, 100);
  const z = first('-0').value;
  assert.ok(Object.is(z, 0));
  const r = tokenize('[1,2]');
  assert.deepEqual(r.tokens.map((t) => t.value), ['[', 1, ',', 2, ']', null]);
});

test('số lỗi', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '-01', '1e+']) {
    at(err(`x = ${s}`), 'LEX_BAD_NUMBER', 1, 5);
  }
  at(err('.5'), 'LEX_UNEXPECTED_CHAR', 1, 1);
  at(err('+1'), 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('ký tự lạ', () => {
  at(err('a = /'), 'LEX_UNEXPECTED_CHAR', 1, 5);
  at(err('é'), 'LEX_UNEXPECTED_CHAR', 1, 1);
  at(err('a ;'), 'LEX_UNEXPECTED_CHAR', 1, 3);
  at(err('﻿  @'), 'LEX_UNEXPECTED_CHAR', 1, 3);
});

test('chuỗi: thoát và Part', () => {
  assert.deepEqual(first('""').value, []);
  assert.deepEqual(first('"a\\n\\t\\r\\"\\\\\\/\\$\\u0041é"').value, [
    { type: 'Text', value: 'a\n\t\r"\\/$Aé' },
  ]);
  assert.deepEqual(first('"\\${a}"').value, [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(first('"a$b$"').value, [{ type: 'Text', value: 'a$b$' }]);
});

test('chuỗi: nội suy', () => {
  assert.deepEqual(first('"x${a.b.0}y${@c.1}"').value, [
    { type: 'Text', value: 'x' },
    { type: 'Ref', path: ['a', 'b', '0'], const: false, line: 1, column: 3 },
    { type: 'Text', value: 'y' },
    { type: 'Ref', path: ['c', '1'], const: true, line: 1, column: 12 },
  ]);
  assert.deepEqual(first('"${a}${b}"').value.map((p) => p.type), ['Ref', 'Ref']);
  assert.deepEqual(first('"${a-b.c_d}"').value[0].path, ['a-b', 'c_d']);
});

test('nội suy hỏng', () => {
  for (const s of ['${}', '${ a}', '${a }', '${1}', '${a.}', '${a..b}', '${a.01}', '${@}', '${@1}', '${a', '${a.-}', '${@@a}']) {
    at(err(`x = "ab${s}"`), 'LEX_BAD_INTERPOLATION', 1, 8);
  }
});

test('lỗi chuỗi: vị trí', () => {
  at(err('a = "abc'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "abc\nd"'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "abc\rd"'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "x\\q"'), 'LEX_BAD_ESCAPE', 1, 7);
  at(err('a = "x\\u12G4"'), 'LEX_BAD_ESCAPE', 1, 7);
  at(err('a = "x\\u12'), 'LEX_BAD_ESCAPE', 1, 7);
  at(err('a = "x\\\ny"'), 'LEX_BAD_ESCAPE', 1, 7);
});

test('chuỗi vừa chưa đóng vừa nội suy hỏng: lỗi gặp trước thắng', () => {
  at(err('a = "x ${b'), 'LEX_BAD_INTERPOLATION', 1, 8);
  at(err('a = "x ${}'), 'LEX_BAD_INTERPOLATION', 1, 8);
  at(err('a = "x ${b}'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "${b}${'), 'LEX_BAD_INTERPOLATION', 1, 10);
  at(err('a = "\\q ${'), 'LEX_BAD_ESCAPE', 1, 6);
  at(err('a = "${x} \\q'), 'LEX_BAD_ESCAPE', 1, 11);
});

test('dừng ở lỗi đầu tiên', () => {
  at(err('a = 01\nb = "'), 'LEX_BAD_NUMBER', 1, 5);
  at(err('a = "\nb = 01'), 'LEX_UNTERMINATED_STRING', 1, 5);
});

test('không ném với chuỗi', () => {
  for (const s of ['"', '\\', '${', '/*', '"\\', '﻿"', '$']) {
    assert.doesNotThrow(() => tokenize(s));
  }
});
