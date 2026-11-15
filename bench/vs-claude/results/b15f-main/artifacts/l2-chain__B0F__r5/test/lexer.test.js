import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false, `đáng lẽ lỗi: ${JSON.stringify(src)}`);
  const { code, line, column } = r.error;
  return { code, line, column };
};
const toks = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.tokens;
};

test('token cơ bản và eof', () => {
  assert.deepStrictEqual(toks('a = 1'), [
    { type: 'ident', value: 'a', line: 1, column: 1 },
    { type: 'punct', value: '=', line: 1, column: 3 },
    { type: 'number', value: 1, line: 1, column: 5 },
    { type: 'eof', value: null, line: 1, column: 6 },
  ]);
  assert.deepStrictEqual(toks(''), [{ type: 'eof', value: null, line: 1, column: 1 }]);
});

test('từ khóa', () => {
  assert.deepStrictEqual(toks('const include true false null x').map((t) => t.type),
    ['keyword', 'keyword', 'keyword', 'keyword', 'keyword', 'ident', 'eof']);
});

test('BOM không tính vào cột', () => {
  assert.deepStrictEqual(toks('﻿a')[0], { type: 'ident', value: 'a', line: 1, column: 1 });
});

test('xuống dòng \\n, \\r\\n, \\r', () => {
  for (const nl of ['\n', '\r\n', '\r']) {
    const t = toks(`a${nl}  b${nl}`);
    assert.deepStrictEqual([t[1].line, t[1].column], [2, 3], JSON.stringify(nl));
    assert.deepStrictEqual([t[2].line, t[2].column], [3, 1], JSON.stringify(nl));
  }
});

test('chú thích các loại, kể cả khối nhiều dòng', () => {
  const t = toks('# x\n// y\n/* a\r\nb */ z');
  assert.deepStrictEqual(t.map((x) => [x.type, x.line, x.column]), [['ident', 4, 6], ['eof', 4, 7]]);
});

test('số hợp lệ', () => {
  const vals = toks('0 -1.5e2 1E+2 10 -0 0.5').filter((t) => t.type === 'number').map((t) => t.value);
  assert.deepStrictEqual(vals, [0, -150, 100, 10, 0, 0.5]);
  assert.ok(Object.is(toks('-0')[0].value, 0));
});

test('số lỗi', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '--1', '1.e2']) {
    assert.deepStrictEqual(err(`x = ${s}`), { code: 'LEX_BAD_NUMBER', line: 1, column: 5 }, s);
  }
  assert.deepStrictEqual(err('x = .5'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 5 });
});

test('chuỗi: Text gộp, escape, Ref', () => {
  const t = toks('"a\\n\\u0041\\"$b${x.y.0}${@c}z"')[0];
  assert.deepStrictEqual(t.value, [
    { type: 'Text', value: 'a\nA"$b' },
    { type: 'Ref', path: ['x', 'y', '0'], const: false, line: 1, column: 15 },
    { type: 'Ref', path: ['c'], const: true, line: 1, column: 23 },
    { type: 'Text', value: 'z' },
  ]);
  assert.deepStrictEqual(toks('""')[0].value, []);
});

test('\\${a} là văn bản thường', () => {
  assert.deepStrictEqual(toks('"\\${a}"')[0].value, [{ type: 'Text', value: '${a}' }]);
});

test('lỗi chuỗi và escape', () => {
  assert.deepStrictEqual(err('a = "abc'), { code: 'LEX_UNTERMINATED_STRING', line: 1, column: 5 });
  assert.deepStrictEqual(err('a = "abc\nd"'), { code: 'LEX_UNTERMINATED_STRING', line: 1, column: 5 });
  assert.deepStrictEqual(err('a = "x\\q"'), { code: 'LEX_BAD_ESCAPE', line: 1, column: 7 });
  assert.deepStrictEqual(err('a = "x\\u12G4"'), { code: 'LEX_BAD_ESCAPE', line: 1, column: 7 });
  assert.deepStrictEqual(err('a = "x\\\n"'), { code: 'LEX_BAD_ESCAPE', line: 1, column: 7 });
});

test('lỗi nội suy', () => {
  for (const s of ['${}', '${a.01}', '${0}', '${a b}', '${a.}', '${@}', '${.a}', '${@@a}']) {
    assert.deepStrictEqual(err(`a = "xy${s}"`), { code: 'LEX_BAD_INTERPOLATION', line: 1, column: 8 }, s);
  }
  assert.deepStrictEqual(err('a = "${a'), { code: 'LEX_BAD_INTERPOLATION', line: 1, column: 6 });
  assert.deepStrictEqual(err('a = "${a"'), { code: 'LEX_BAD_INTERPOLATION', line: 1, column: 6 });
  assert.equal(tokenize('a = "${a.0}"').ok, true);
});

test('chuỗi chưa đóng có nội suy hỏng: lỗi nào gặp trước', () => {
  assert.deepStrictEqual(err('a = "${}'), { code: 'LEX_BAD_INTERPOLATION', line: 1, column: 6 });
  assert.deepStrictEqual(err('a = "x ${}'), { code: 'LEX_BAD_INTERPOLATION', line: 1, column: 8 });
  assert.deepStrictEqual(err('a = "x $ ${0}'), { code: 'LEX_BAD_INTERPOLATION', line: 1, column: 10 });
  assert.deepStrictEqual(err('a = "x \\q ${}'), { code: 'LEX_BAD_ESCAPE', line: 1, column: 8 });
});

test('chú thích khối chưa đóng, ký tự lạ', () => {
  assert.deepStrictEqual(err('a = 1\n  /* abc'), { code: 'LEX_UNTERMINATED_COMMENT', line: 2, column: 3 });
  assert.deepStrictEqual(err('a / b'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 3 });
  assert.deepStrictEqual(err('é = 1'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 1 });
  assert.deepStrictEqual(err('a = 1 ;'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 7 });
});

test('dừng ở lỗi đầu tiên; không ném', () => {
  assert.deepStrictEqual(err('a = 01\nb = ;'), { code: 'LEX_BAD_NUMBER', line: 1, column: 5 });
  assert.deepStrictEqual(err('\r\n\r\n  ;'), { code: 'LEX_UNEXPECTED_CHAR', line: 3, column: 3 });
});

test('cột tính theo đơn vị UTF-16', () => {
  const t = toks('"😀" x');
  assert.deepStrictEqual([t[1].line, t[1].column], [1, 6]);
});
