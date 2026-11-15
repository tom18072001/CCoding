import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false, `mong lỗi cho ${JSON.stringify(src)}`);
  return r.error;
};
const at = (e, code, line, column) => assert.deepEqual([e.code, e.line, e.column], [code, line, column]);
const toks = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, true);
  return r.tokens;
};

test('token cơ bản và eof', () => {
  const t = toks('a = [1, "x"] true const');
  assert.deepEqual(t.map((x) => x.type), [
    'ident', 'punct', 'punct', 'number', 'punct', 'string', 'punct', 'keyword', 'keyword', 'eof',
  ]);
  assert.deepEqual(t.at(-1), { type: 'eof', value: null, line: 1, column: 24 });
});

test('định danh có gạch ngang, từ khóa', () => {
  const t = toks('a-b_1 include');
  assert.equal(t[0].value, 'a-b_1');
  assert.equal(t[1].type, 'keyword');
});

test('chú thích các loại và vị trí sau chú thích', () => {
  const t = toks('# a\n// b\n/* c\nd */ x');
  assert.equal(t.length, 2);
  assert.deepEqual([t[0].line, t[0].column], [4, 6]);
});

test('xuống dòng \\r\\n tính một lần, \\r đơn lẻ', () => {
  const t = toks('a\r\nb\rc\nd');
  assert.deepEqual(t.slice(0, 4).map((x) => [x.line, x.column]), [[1, 1], [2, 1], [3, 1], [4, 1]]);
  assert.deepEqual([t[4].line, t[4].column], [4, 2]);
});

test('BOM bị bỏ và không tính vào cột', () => {
  const t = toks('﻿a');
  assert.deepEqual([t[0].line, t[0].column], [1, 1]);
  assert.deepEqual([t[1].line, t[1].column], [1, 2]);
  at(err('﻿@'), 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('eof ngay sau ký tự cuối', () => {
  const t = toks('a\n');
  assert.deepEqual([t.at(-1).line, t.at(-1).column], [2, 1]);
  const e = toks('');
  assert.deepEqual(e, [{ type: 'eof', value: null, line: 1, column: 1 }]);
});

test('số hợp lệ, -0 thành 0', () => {
  const t = toks('0 -1.5e2 10 1E+3 -0 -0.0');
  assert.deepEqual(t.slice(0, 6).map((x) => x.value), [0, -150, 10, 1000, 0, 0]);
  assert.ok(Object.is(t[4].value, 0));
  assert.ok(Object.is(t[5].value, 0));
});

for (const bad of ['01', '1.', '1e', '12abc', '1-2', '1e999', '-', '1_0', '-01', '1e+']) {
  test(`LEX_BAD_NUMBER: ${bad}`, () => {
    at(err(`x = ${bad}`), 'LEX_BAD_NUMBER', 1, 5);
  });
}

test('.5 là ký tự lạ; số bị dính vào chữ sau đó', () => {
  at(err('x = .5'), 'LEX_UNEXPECTED_CHAR', 1, 5);
  at(err('[1,2abc]'), 'LEX_BAD_NUMBER', 1, 4);
});

test('LEX_UNEXPECTED_CHAR', () => {
  at(err('a = 1\n  @'), 'LEX_UNEXPECTED_CHAR', 2, 3);
  at(err('a / b'), 'LEX_UNEXPECTED_CHAR', 1, 3);
  at(err('é = 1'), 'LEX_UNEXPECTED_CHAR', 1, 1);
  at(err('a = +1'), 'LEX_UNEXPECTED_CHAR', 1, 5);
});

test('LEX_UNTERMINATED_STRING', () => {
  at(err('a = "abc'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "abc\nd"'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "abc\rd"'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "'), 'LEX_UNTERMINATED_STRING', 1, 5);
});

test('LEX_UNTERMINATED_COMMENT', () => {
  at(err('a = 1\n  /* abc'), 'LEX_UNTERMINATED_COMMENT', 2, 3);
  at(err('/*/'), 'LEX_UNTERMINATED_COMMENT', 1, 1);
});

test('LEX_BAD_ESCAPE', () => {
  at(err('a = "x\\q"'), 'LEX_BAD_ESCAPE', 1, 7);
  at(err('a = "\\u12G4"'), 'LEX_BAD_ESCAPE', 1, 6);
  at(err('a = "\\u12"'), 'LEX_BAD_ESCAPE', 1, 6);
  at(err('a = "ab\\\ncd"'), 'LEX_BAD_ESCAPE', 1, 8);
});

test('LEX_BAD_INTERPOLATION', () => {
  at(err('a = "x ${b"'), 'LEX_BAD_INTERPOLATION', 1, 8);
  at(err('a = "${}"'), 'LEX_BAD_INTERPOLATION', 1, 6);
  at(err('a = "${ b}"'), 'LEX_BAD_INTERPOLATION', 1, 6);
  at(err('a = "${1a}"'), 'LEX_BAD_INTERPOLATION', 1, 6);
  at(err('a = "${a.}"'), 'LEX_BAD_INTERPOLATION', 1, 6);
  at(err('a = "${a.01}"'), 'LEX_BAD_INTERPOLATION', 1, 6);
  at(err('a = "${@}"'), 'LEX_BAD_INTERPOLATION', 1, 6);
  at(err('a = "${@1}"'), 'LEX_BAD_INTERPOLATION', 1, 6);
  at(err('a = "${b\n}"'), 'LEX_BAD_INTERPOLATION', 1, 6);
  at(err('a = "${b'), 'LEX_BAD_INTERPOLATION', 1, 6);
});

test('lỗi đầu tiên theo thứ tự đọc', () => {
  at(err('a = "${x" "\\q'), 'LEX_BAD_INTERPOLATION', 1, 6);
  at(err('a = "\\q ${x'), 'LEX_BAD_ESCAPE', 1, 6);
  at(err('a = "${x}\\q ${'), 'LEX_BAD_ESCAPE', 1, 10);
  at(err('@ "'), 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('chuỗi: thoát, Part gộp Text, không Text rỗng', () => {
  const t = toks('"a\\n\\t\\"\\\\\\/\\$\\u0041${b.0}c${@k}"');
  assert.deepEqual(t[0].value, [
    { type: 'Text', value: 'a\n\t"\\/$A' },
    { type: 'Ref', path: ['b', '0'], const: false, line: 1, column: 21 },
    { type: 'Text', value: 'c' },
    { type: 'Ref', path: ['k'], const: true, line: 1, column: 28 },
  ]);
  assert.deepEqual(toks('""')[0].value, []);
  assert.deepEqual(toks('"${a}${b}"')[0].value.map((p) => p.type), ['Ref', 'Ref']);
});

test('\\${a} là văn bản; $ đơn lẻ là ký tự thường', () => {
  assert.deepEqual(toks('"\\${a}"')[0].value, [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(toks('"$ $x"')[0].value, [{ type: 'Text', value: '$ $x' }]);
});

test('cột đếm theo đơn vị UTF-16', () => {
  const t = toks('"😀é" x');
  assert.deepEqual([t[1].line, t[1].column], [1, 7]);
});

test('vị trí token sau chuỗi/nội suy nhiều dòng chú thích', () => {
  const t = toks('a = "${x.y}" b');
  assert.deepEqual([t[3].line, t[3].column], [1, 14]);
});

test('không bao giờ ném', () => {
  for (const s of ['"', '"\\', '"\\u', '/*', '$', '"${', '-', '﻿']) {
    assert.doesNotThrow(() => tokenize(s));
  }
});
