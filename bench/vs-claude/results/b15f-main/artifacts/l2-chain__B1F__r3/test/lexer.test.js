import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false, `đáng lẽ lỗi: ${JSON.stringify(src)}`);
  return r.error;
};
const at = (src, code, line, column) => {
  const e = err(src);
  assert.deepEqual([e.code, e.line, e.column], [code, line, column], JSON.stringify(src));
};
const toks = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.tokens;
};
const num = (src) => toks(src)[0].value;

test('token cơ bản và eof', () => {
  const t = toks('a = [1, "x"] include const true');
  assert.deepEqual(t.map((x) => x.type), [
    'ident', 'punct', 'punct', 'number', 'punct', 'string', 'punct', 'keyword', 'keyword', 'keyword', 'eof',
  ]);
  assert.equal(t.at(-1).value, null);
});

test('vị trí, \\r\\n, \\r và BOM', () => {
  const t = toks('﻿a\r\n  b\rc\nd');
  assert.deepEqual(t.map((x) => [x.value, x.line, x.column]), [
    ['a', 1, 1], ['b', 2, 3], ['c', 3, 1], ['d', 4, 1], [null, 4, 2],
  ]);
});

test('eof sau ký tự cuối / sau xuống dòng cuối', () => {
  assert.deepEqual(toks('').map((x) => [x.line, x.column]), [[1, 1]]);
  assert.deepEqual(toks('a\n').at(-1), { type: 'eof', value: null, line: 2, column: 1 });
  assert.deepEqual(toks('a\r\n').at(-1), { type: 'eof', value: null, line: 2, column: 1 });
});

test('cột đếm theo UTF-16 (ký tự ngoài BMP chiếm 2)', () => {
  const t = toks('"\u{1F600}" x');
  assert.equal(t[1].column, 6);
});

test('chú thích các loại, kể cả nhiều dòng', () => {
  const t = toks('# a\n// b\n/* c\n d */ x');
  assert.equal(t.length, 2);
  assert.deepEqual([t[0].line, t[0].column], [4, 7]);
});

test('số: hợp lệ và biên', () => {
  assert.equal(num('0'), 0);
  assert.ok(Object.is(num('-0'), 0));
  assert.equal(num('-1.5e2'), -150);
  assert.equal(num('1E+2'), 100);
  assert.equal(num('10'), 10);
  assert.deepEqual(toks('1,2').map((x) => x.type), ['number', 'punct', 'number', 'eof']);
});

test('LEX_BAD_NUMBER', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '-.5', '1.5.2', '+1']) {
    const e = err(s);
    assert.ok(e.code === 'LEX_BAD_NUMBER' || (s === '+1' && e.code === 'LEX_UNEXPECTED_CHAR'), s);
  }
  at('x = 12abc', 'LEX_BAD_NUMBER', 1, 5);
  at('\n  1e999', 'LEX_BAD_NUMBER', 2, 3);
});

test('LEX_UNEXPECTED_CHAR', () => {
  at('.5', 'LEX_UNEXPECTED_CHAR', 1, 1);
  at('a = 1 / 2', 'LEX_UNEXPECTED_CHAR', 1, 7);
  at('a\n  é', 'LEX_UNEXPECTED_CHAR', 2, 3);
  at('﻿;', 'LEX_UNEXPECTED_CHAR', 1, 1);
  at('x @', 'LEX_UNEXPECTED_CHAR', 1, 3);
});

test('LEX_UNTERMINATED_STRING', () => {
  at('a = "abc', 'LEX_UNTERMINATED_STRING', 1, 5);
  at('a = "abc\nd"', 'LEX_UNTERMINATED_STRING', 1, 5);
  at('\n"x\r\n', 'LEX_UNTERMINATED_STRING', 2, 1);
});

test('LEX_UNTERMINATED_COMMENT', () => {
  at('a\n  /* abc', 'LEX_UNTERMINATED_COMMENT', 2, 3);
  at('/* a /* b */ */', 'LEX_UNEXPECTED_CHAR', 1, 14);
});

test('LEX_BAD_ESCAPE', () => {
  at('"ab\\q"', 'LEX_BAD_ESCAPE', 1, 4);
  at('"\\u12G4"', 'LEX_BAD_ESCAPE', 1, 2);
  at('"\\u12"', 'LEX_BAD_ESCAPE', 1, 2);
  at('"a\\\nb"', 'LEX_BAD_ESCAPE', 1, 3);
});

test('LEX_BAD_INTERPOLATION', () => {
  at('a = "x${b"', 'LEX_BAD_INTERPOLATION', 1, 7);
  at('a = "${}"', 'LEX_BAD_INTERPOLATION', 1, 6);
  at('"${a b}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${1a}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${a.01}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${a.}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${@}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${a\n}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${a', 'LEX_BAD_INTERPOLATION', 1, 2);
});

test('lỗi nào gặp trước (trái sang phải) được báo', () => {
  at('"${a\\q', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"\\q${a', 'LEX_BAD_ESCAPE', 1, 2);
  at('"${a}${', 'LEX_BAD_INTERPOLATION', 1, 6);
  at('"${a}x', 'LEX_UNTERMINATED_STRING', 1, 1);
});

test('chuỗi: escape, Part, vị trí Ref', () => {
  const t = toks('"a\\n\\t\\"\\\\\\/\\u0041\\$"');
  assert.deepEqual(t[0].value, [{ type: 'Text', value: 'a\n\t"\\/A$' }]);
  assert.deepEqual(toks('""')[0].value, []);
  assert.deepEqual(toks('"\\${a}"')[0].value, [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(toks('"$ $x $"')[0].value, [{ type: 'Text', value: '$ $x $' }]);
  const p = toks('  "a${b.0.c}${@k.1}\\u00e9z"')[0].value;
  assert.deepEqual(p, [
    { type: 'Text', value: 'a' },
    { type: 'Ref', path: ['b', '0', 'c'], const: false, line: 1, column: 5 },
    { type: 'Ref', path: ['k', '1'], const: true, line: 1, column: 13 },
    { type: 'Text', value: 'éz' },
  ]);
});

test('chuỗi thuần tham chiếu không có Text rỗng', () => {
  const p = toks('"${a}"')[0].value;
  assert.equal(p.length, 1);
  assert.equal(p[0].type, 'Ref');
});

test('không bao giờ ném', () => {
  for (const s of ['"', '"\\', '"\\u', '/*', '${', '\u0000', '-', '"${@a.b"']) {
    assert.doesNotThrow(() => tokenize(s));
  }
});
