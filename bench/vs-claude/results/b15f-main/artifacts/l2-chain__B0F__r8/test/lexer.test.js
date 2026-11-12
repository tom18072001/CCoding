import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false, `phải lỗi: ${JSON.stringify(src)}`);
  const { code, line, column } = r.error;
  return { code, line, column };
};
const toks = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.tokens;
};

test('token cơ bản và eof', () => {
  const t = toks('a = [1, "x"] { } include const true null');
  assert.deepEqual(t.map((x) => x.type), [
    'ident', 'punct', 'punct', 'number', 'punct', 'string', 'punct', 'punct', 'punct',
    'keyword', 'keyword', 'keyword', 'keyword', 'eof']);
  assert.deepEqual(t.at(-1), { type: 'eof', value: null, line: 1, column: 41 });
  assert.deepEqual(toks('')[0], { type: 'eof', value: null, line: 1, column: 1 });
});

test('định danh có dấu gạch ngang; từ khóa', () => {
  const t = toks('my-key_1 constant');
  assert.equal(t[0].type, 'ident');
  assert.equal(t[0].value, 'my-key_1');
  assert.equal(t[1].type, 'ident');
});

test('ba loại chú thích', () => {
  const t = toks('# a\n// b\n/* c\n d */ x');
  assert.equal(t.length, 2);
  assert.deepEqual([t[0].line, t[0].column], [4, 7]);
  assert.deepEqual(err('/* abc'), { code: 'LEX_UNTERMINATED_COMMENT', line: 1, column: 1 });
  assert.deepEqual(err('x\n  /* a /* b */ */'), { code: 'LEX_UNEXPECTED_CHAR', line: 2, column: 16 });
});

test('số hợp lệ', () => {
  const t = toks('0 -1.5e2 10 1E+3 -0 0.5');
  assert.deepEqual(t.slice(0, -1).map((x) => x.value), [0, -150, 10, 1000, 0, 0.5]);
  assert.ok(Object.is(t[4].value, 0));
});

test('số không hợp lệ', () => {
  for (const s of ['01', '1.', '1e999', '12abc', '-', '1e', '1-2', '-01', '1.5.2']) {
    assert.deepEqual(err(`a = ${s}`), { code: 'LEX_BAD_NUMBER', line: 1, column: 5 }, s);
  }
  assert.deepEqual(err('a = +1'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 5 });
  assert.deepEqual(err('.5'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 1 });
  assert.deepEqual(err('[1,2x]'), { code: 'LEX_BAD_NUMBER', line: 1, column: 4 });
});

test('chuỗi: escape', () => {
  const t = toks('"a\\n\\t\\r\\"\\\\\\/\\$\\u0041\\u00e9"');
  assert.deepEqual(t[0].value, [{ type: 'Text', value: 'a\n\t\r"\\/$Aé' }]);
  assert.deepEqual(toks('""')[0].value, []);
});

test('chuỗi: \\${a} là văn bản, $ lẻ là ký tự thường', () => {
  assert.deepEqual(toks('"\\${a}"')[0].value, [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(toks('"a$b $"')[0].value, [{ type: 'Text', value: 'a$b $' }]);
});

test('chuỗi: Ref, const, gộp Text, vị trí tại $', () => {
  const t = toks('x = "ab${a.b.0}c${@r.1}${z}"');
  assert.deepEqual(t[2].value, [
    { type: 'Text', value: 'ab' },
    { type: 'Ref', path: ['a', 'b', '0'], const: false, line: 1, column: 8 },
    { type: 'Text', value: 'c' },
    { type: 'Ref', path: ['r', '1'], const: true, line: 1, column: 17 },
    { type: 'Ref', path: ['z'], const: false, line: 1, column: 24 },
  ]);
  assert.deepEqual(toks('"a\\nb\\$c"')[0].value, [{ type: 'Text', value: 'a\nb$c' }]);
});

test('nội suy sai dạng', () => {
  for (const s of ['"${}"', '"${a.01}"', '"${a.}"', '"${.a}"', '"${1a}"', '"${@}"', '"${a b}"', '"${@@a}"', '"${a.b-c.-}"']) {
    assert.deepEqual(err(s), { code: 'LEX_BAD_INTERPOLATION', line: 1, column: 2 }, s);
  }
  assert.equal(tokenize('"${a-b.c_d.10}"').ok, true);
  assert.deepEqual(err('"${a'), { code: 'LEX_BAD_INTERPOLATION', line: 1, column: 2 });
  assert.deepEqual(err('"${a"'), { code: 'LEX_BAD_INTERPOLATION', line: 1, column: 2 });
});

test('chuỗi chưa đóng và xen nội suy hỏng: lỗi đầu tiên theo thứ tự đọc', () => {
  assert.deepEqual(err('"abc'), { code: 'LEX_UNTERMINATED_STRING', line: 1, column: 1 });
  assert.deepEqual(err('x = "abc\ny"'), { code: 'LEX_UNTERMINATED_STRING', line: 1, column: 5 });
  assert.deepEqual(err('"a${}b'), { code: 'LEX_BAD_INTERPOLATION', line: 1, column: 3 });
  assert.deepEqual(err('"ab ${a}'), { code: 'LEX_UNTERMINATED_STRING', line: 1, column: 1 });
  assert.deepEqual(err('"a\\qb ${}'), { code: 'LEX_BAD_ESCAPE', line: 1, column: 3 });
  assert.deepEqual(err('"a ${}\\q'), { code: 'LEX_BAD_INTERPOLATION', line: 1, column: 4 });
});

test('escape sai', () => {
  assert.deepEqual(err('"\\x"'), { code: 'LEX_BAD_ESCAPE', line: 1, column: 2 });
  assert.deepEqual(err('"\\u12"'), { code: 'LEX_BAD_ESCAPE', line: 1, column: 2 });
  assert.deepEqual(err('"\\u12G4"'), { code: 'LEX_BAD_ESCAPE', line: 1, column: 2 });
  assert.deepEqual(err('"ab\\\ncd"'), { code: 'LEX_BAD_ESCAPE', line: 1, column: 4 });
});

test('ký tự lạ', () => {
  assert.deepEqual(err('a = 1 / 2'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 7 });
  assert.deepEqual(err('é = 1'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 1 });
  assert.deepEqual(err('a = @'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 5 });
  assert.deepEqual(err('a ; b'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 3 });
});

test('dừng ở lỗi đầu tiên theo thứ tự đọc', () => {
  assert.deepEqual(err('a = 01\n b = "x'), { code: 'LEX_BAD_NUMBER', line: 1, column: 5 });
});

test('BOM không tính vào cột', () => {
  const t = toks('﻿a = 1');
  assert.deepEqual([t[0].line, t[0].column], [1, 1]);
  assert.deepEqual(err('﻿?'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 1 });
  assert.equal(toks('﻿').length, 1);
  assert.equal(toks('﻿')[0].column, 1);
  assert.equal(err('﻿﻿a').code, 'LEX_UNEXPECTED_CHAR');
});

test('xuống dòng \\n, \\r\\n, \\r', () => {
  for (const nl of ['\n', '\r\n', '\r']) {
    const t = toks(`a${nl}b${nl}  c`);
    assert.deepEqual(t.map((x) => [x.line, x.column]), [[1, 1], [2, 1], [3, 3], [3, 4]], JSON.stringify(nl));
  }
  assert.deepEqual(toks('a\n\rb')[1].line, 3);
  assert.deepEqual(toks('# x\ry')[0].line, 2);
  const c = toks('/*\r\n*/ x')[0];
  assert.deepEqual([c.line, c.column], [2, 4]);
  assert.equal(err('"a\rb"').code, 'LEX_UNTERMINATED_STRING');
  assert.equal(err('"a\r\nb"').code, 'LEX_UNTERMINATED_STRING');
});

test('cột theo UTF-16 với ký tự ngoài BMP', () => {
  const t = toks('a = "😀" b');
  assert.deepEqual([t[3].line, t[3].column], [1, 10]);
  const t2 = toks('# 😀\nx = "é😀${a}" y');
  const s = t2[2].value;
  assert.deepEqual([s[1].line, s[1].column], [2, 9]);
  assert.deepEqual([t2[3].line, t2[3].column], [2, 15]);
  assert.deepEqual(err('"😀" 😀'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 6 });
});
