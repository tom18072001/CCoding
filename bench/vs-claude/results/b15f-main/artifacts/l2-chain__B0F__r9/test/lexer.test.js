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
  const t = toks('a = [1, "x"] true null const');
  assert.deepEqual(t.map((x) => x.type), [
    'ident', 'punct', 'punct', 'number', 'punct', 'string', 'punct', 'keyword', 'keyword', 'keyword', 'eof',
  ]);
  assert.equal(t.at(-1).value, null);
  assert.deepEqual(t[0], { type: 'ident', value: 'a', line: 1, column: 1 });
});

test('eof đặt tại vị trí con trỏ cuối', () => {
  assert.deepEqual(toks('')[0], { type: 'eof', value: null, line: 1, column: 1 });
  const e = toks('a\n  ').at(-1);
  assert.deepEqual([e.line, e.column], [2, 3]);
});

test('BOM không tính vào cột', () => {
  const t = toks('﻿a = 1');
  assert.deepEqual([t[0].line, t[0].column], [1, 1]);
  assert.deepEqual(err('﻿@'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 1 });
});

test('xuống dòng \\n, \\r\\n (một lần), \\r đơn', () => {
  for (const nl of ['\n', '\r\n', '\r']) {
    const t = toks(`a${nl}b${nl}  c`);
    assert.deepEqual(t.slice(0, 3).map((x) => [x.line, x.column]), [[1, 1], [2, 1], [3, 3]], JSON.stringify(nl));
  }
  assert.deepEqual(err('a\r\n\r\n@'), { code: 'LEX_UNEXPECTED_CHAR', line: 3, column: 1 });
});

test('chú thích các loại, kể cả nhiều dòng', () => {
  const t = toks('# x\n// y\n/* a\nb */ k /**/ = 1');
  assert.deepEqual([t[0].value, t[0].line, t[0].column], ['k', 4, 6]);
  assert.equal(t.length, 4);
});

test('số hợp lệ', () => {
  const v = (s) => toks(s)[0].value;
  assert.equal(v('0'), 0);
  assert.equal(v('-1.5e2'), -150);
  assert.equal(v('1E+2'), 100);
  assert.ok(Object.is(v('-0'), 0));
  assert.ok(Object.is(v('-0.0'), 0));
  assert.equal(v('10'), 10);
});

test('số biên lỗi tại ký tự đầu', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '-01', '--1', '1e+']) {
    assert.deepEqual(err(`x = ${s}`), { code: 'LEX_BAD_NUMBER', line: 1, column: 5 }, s);
  }
  assert.deepEqual(err('.5'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 1 });
  assert.deepEqual(err('+1'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 1 });
  // số dính liền dấu phẩy thì dừng ở dấu phẩy
  assert.equal(toks('[1,2]').filter((x) => x.type === 'number').length, 2);
});

test('chuỗi: escape và gộp Text', () => {
  const s = toks('"a\\n\\t\\r\\"\\\\\\/\\$\\u0041b"')[0];
  assert.deepEqual(s.value, [{ type: 'Text', value: 'a\n\t\r"\\/$Ab' }]);
  assert.deepEqual(toks('""')[0].value, []);
  assert.deepEqual(toks('"\\${a}"')[0].value, [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(toks('"$a $ {"')[0].value, [{ type: 'Text', value: '$a $ {' }]);
});

test('chuỗi: nội suy', () => {
  const s = toks('x "a${b.0.c}-${@k.1}${d}"')[1];
  assert.deepEqual(s.value, [
    { type: 'Text', value: 'a' },
    { type: 'Ref', path: ['b', '0', 'c'], const: false, line: 1, column: 5 },
    { type: 'Text', value: '-' },
    { type: 'Ref', path: ['k', '1'], const: true, line: 1, column: 14 },
    { type: 'Ref', path: ['d'], const: false, line: 1, column: 21 },
  ]);
  assert.deepEqual(s.value[1].column, 5);
  assert.deepEqual([s.line, s.column], [1, 3]);
});

test('LEX_UNEXPECTED_CHAR', () => {
  assert.deepEqual(err('a = 1\n  /'), { code: 'LEX_UNEXPECTED_CHAR', line: 2, column: 3 });
  assert.deepEqual(err('é'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 1 });
  assert.deepEqual(err('a ; b'), { code: 'LEX_UNEXPECTED_CHAR', line: 1, column: 3 });
});

test('LEX_UNTERMINATED_STRING', () => {
  assert.deepEqual(err('a = "abc'), { code: 'LEX_UNTERMINATED_STRING', line: 1, column: 5 });
  assert.deepEqual(err('a = "abc\nd"'), { code: 'LEX_UNTERMINATED_STRING', line: 1, column: 5 });
  assert.deepEqual(err('a = "abc\rd"'), { code: 'LEX_UNTERMINATED_STRING', line: 1, column: 5 });
});

test('LEX_UNTERMINATED_COMMENT', () => {
  assert.deepEqual(err('a = 1\n  /* x\n y'), { code: 'LEX_UNTERMINATED_COMMENT', line: 2, column: 3 });
});

test('LEX_BAD_ESCAPE', () => {
  assert.deepEqual(err('a = "x\\q"'), { code: 'LEX_BAD_ESCAPE', line: 1, column: 7 });
  assert.deepEqual(err('a = "\\u12G4"'), { code: 'LEX_BAD_ESCAPE', line: 1, column: 6 });
  assert.deepEqual(err('a = "\\u12"'), { code: 'LEX_BAD_ESCAPE', line: 1, column: 6 });
  assert.deepEqual(err('a = "xy\\\nz"'), { code: 'LEX_BAD_ESCAPE', line: 1, column: 8 });
});

test('LEX_BAD_INTERPOLATION', () => {
  for (const body of ['${}', '${a', '${1a}', '${a b}', '${a.}', '${a.01}', '${@}', '${@@a}', '${0}', '${ a}']) {
    const r = err(`k = "ab${body}"`);
    assert.deepEqual(r, { code: 'LEX_BAD_INTERPOLATION', line: 1, column: 8 }, body);
  }
  assert.deepEqual(err('k = "${a\nb}"'), { code: 'LEX_BAD_INTERPOLATION', line: 1, column: 6 });
  assert.deepEqual(err('k = "${a'), { code: 'LEX_BAD_INTERPOLATION', line: 1, column: 6 });
});

test('thứ tự lỗi: lỗi gặp trước theo thứ tự đọc', () => {
  // nội suy hỏng đứng trước escape hỏng
  assert.equal(err('"${} \\q"').code, 'LEX_BAD_INTERPOLATION');
  // escape hỏng đứng trước nội suy chưa đóng
  assert.equal(err('"\\q ${a').code, 'LEX_BAD_ESCAPE');
  // lỗi ký tự ở trước chuỗi chưa đóng
  assert.equal(err('@ "abc').code, 'LEX_UNEXPECTED_CHAR');
  // số hỏng trước chú thích chưa đóng
  assert.equal(err('01 /* x').code, 'LEX_BAD_NUMBER');
});

test('cột đếm theo UTF-16 trong chuỗi', () => {
  const t = toks('"😀é" x');
  // 😀 = 2 đơn vị: " (1) 😀 (2-3) é (4) " (5) space (6) x (7)
  assert.equal(t[1].column, 7);
});

test('không ném với đầu vào lạ', () => {
  assert.doesNotThrow(() => tokenize('\u0000\ud800"'));
});
