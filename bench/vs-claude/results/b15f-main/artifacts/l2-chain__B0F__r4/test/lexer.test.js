import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false, `phải lỗi: ${JSON.stringify(src)}`);
  return r.error;
};
const toks = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.tokens;
};
const at = (e, code, line, column) =>
  assert.deepEqual({ code: e.code, line: e.line, column: e.column }, { code, line, column });

test('token cơ bản và eof', () => {
  const t = toks('a = [1, "x"] { } include const true');
  assert.deepEqual(
    t.map((x) => x.type),
    ['ident', 'punct', 'punct', 'number', 'punct', 'string', 'punct', 'punct', 'punct', 'keyword', 'keyword', 'keyword', 'eof'],
  );
  assert.deepEqual(t.at(-1), { type: 'eof', value: null, line: 1, column: 36 });
});

test('ident chứa gạch ngang; từ khóa', () => {
  const t = toks('a-b_1 null');
  assert.deepEqual([t[0].type, t[0].value, t[1].type, t[1].value], ['ident', 'a-b_1', 'keyword', 'null']);
});

test('BOM bị bỏ và không tính cột', () => {
  const t = toks('﻿a');
  assert.deepEqual([t[0].line, t[0].column], [1, 1]);
  assert.deepEqual([t[1].line, t[1].column], [1, 2]);
});

test('xuống dòng \\n, \\r\\n, \\r', () => {
  for (const nl of ['\n', '\r\n', '\r']) {
    const t = toks(`a${nl}b${nl}c`);
    assert.deepEqual(t.map((x) => [x.line, x.column]), [[1, 1], [2, 1], [3, 1], [3, 2]]);
  }
  assert.deepEqual(toks('\r\n\r\n').at(-1), { type: 'eof', value: null, line: 3, column: 1 });
});

test('cột UTF-16 với ký tự ngoài BMP', () => {
  const t = toks('s = "😀" x');
  assert.equal(t[3].value, 'x');
  assert.equal(t[3].column, 10); // chuỗi: cột 5..9 (😀 chiếm 2 đơn vị)
  at(err('"😀" é'), 'LEX_UNEXPECTED_CHAR', 1, 6);
});

test('chú thích các loại', () => {
  const t = toks('# a\n// b\n/* c\n d */ x');
  assert.equal(t.length, 2);
  assert.deepEqual([t[0].line, t[0].column], [4, 7]);
  assert.equal(toks('a#x\r\nb').length, 3);
});

test('số hợp lệ', () => {
  const v = (s) => toks(s)[0].value;
  assert.equal(v('0'), 0);
  assert.equal(v('-1.5e2'), -150);
  assert.equal(v('1E+2'), 100);
  assert.ok(Object.is(v('-0'), 0));
  assert.deepEqual(toks('[1,2]').map((x) => x.value), ['[', 1, ',', 2, ']', null]);
});

test('LEX_BAD_NUMBER', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '-01', '1_0', '1.5.2']) {
    at(err(`x = ${s}`), 'LEX_BAD_NUMBER', 1, 5);
  }
  at(err('\n  1.'), 'LEX_BAD_NUMBER', 2, 3);
});

test('.5 và + đứng đầu là ký tự lạ', () => {
  at(err('.5'), 'LEX_UNEXPECTED_CHAR', 1, 1);
  at(err('+1'), 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('chuỗi: thoát', () => {
  const v = toks('"a\\n\\t\\r\\"\\\\\\/\\$\\u0041"')[0].value;
  assert.deepEqual(v, [{ type: 'Text', value: 'a\n\t\r"\\/$A' }]);
  assert.deepEqual(toks('""')[0].value, []);
});

test('"\\${a}" là văn bản, không phải Ref', () => {
  assert.deepEqual(toks('"\\${a}"')[0].value, [{ type: 'Text', value: '${a}' }]);
});

test('$ không theo sau bởi { là ký tự thường', () => {
  assert.deepEqual(toks('"$x$"')[0].value, [{ type: 'Text', value: '$x$' }]);
});

test('Ref: vị trí, const, chỉ mục', () => {
  const v = toks('  "a${b.c}${@lst.1}z"')[0].value;
  assert.deepEqual(v, [
    { type: 'Text', value: 'a' },
    { type: 'Ref', path: ['b', 'c'], const: false, line: 1, column: 5 },
    { type: 'Ref', path: ['lst', '1'], const: true, line: 1, column: 11 },
    { type: 'Text', value: 'z' },
  ]);
  assert.deepEqual(toks('"${a.0}"')[0].value[0].path, ['a', '0']);
});

test('Text liền kề được gộp (escape + ký tự thường)', () => {
  assert.equal(toks('"a\\nb\\u0063"')[0].value.length, 1);
});

test('LEX_BAD_INTERPOLATION', () => {
  for (const s of ['"${}"', '"${a.01}"', '"${1a}"', '"${a b}"', '"${a."', '"${a', '"${@}"', '"${a..b}"', '"${@1}"']) {
    const e = err(s);
    assert.equal(e.code, 'LEX_BAD_INTERPOLATION', s);
    assert.deepEqual([e.line, e.column], [1, 2], s);
  }
  at(err('x\n"ab${a\n"'), 'LEX_BAD_INTERPOLATION', 2, 4);
});

test('LEX_UNTERMINATED_STRING tại dấu nháy mở', () => {
  at(err('a = "abc'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "abc\nd"'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "abc\rd"'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('"'), 'LEX_UNTERMINATED_STRING', 1, 1);
});

test('LEX_BAD_ESCAPE tại dấu \\', () => {
  at(err('"ab\\q"'), 'LEX_BAD_ESCAPE', 1, 4);
  at(err('"\\u12"'), 'LEX_BAD_ESCAPE', 1, 2);
  at(err('"\\u12G4"'), 'LEX_BAD_ESCAPE', 1, 2);
  at(err('"ab\\\ncd"'), 'LEX_BAD_ESCAPE', 1, 4);
});

test('lỗi đầu tiên theo thứ tự đọc trong chuỗi', () => {
  at(err('"${}\\q'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"\\q${'), 'LEX_BAD_ESCAPE', 1, 2);
  at(err('"${a'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"\\q'), 'LEX_BAD_ESCAPE', 1, 2);
  at(err('"ab${x}\\'), 'LEX_BAD_ESCAPE', 1, 8);
});

test('LEX_UNTERMINATED_COMMENT', () => {
  at(err('a\n  /* abc'), 'LEX_UNTERMINATED_COMMENT', 2, 3);
  at(err('/*/'), 'LEX_UNTERMINATED_COMMENT', 1, 1);
});

test('LEX_UNEXPECTED_CHAR', () => {
  at(err('a / b'), 'LEX_UNEXPECTED_CHAR', 1, 3);
  at(err('a = @'), 'LEX_UNEXPECTED_CHAR', 1, 5);
  at(err('a;'), 'LEX_UNEXPECTED_CHAR', 1, 2);
  at(err('é'), 'LEX_UNEXPECTED_CHAR', 1, 1);
  at(err('﻿﻿a'), 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('lỗi lexer đầu tiên theo thứ tự đọc; không ném', () => {
  at(err('a = 01 ; "x'), 'LEX_BAD_NUMBER', 1, 5);
  assert.doesNotThrow(() => tokenize(''));
  assert.deepEqual(toks('').map((x) => x.type), ['eof']);
});
