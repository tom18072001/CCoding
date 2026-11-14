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

test('token cơ bản, từ khóa, punct, eof', () => {
  const t = toks('const a = [true, null]');
  assert.deepEqual(t.map((x) => [x.type, x.value]), [
    ['keyword', 'const'], ['ident', 'a'], ['punct', '='], ['punct', '['],
    ['keyword', 'true'], ['punct', ','], ['keyword', 'null'], ['punct', ']'], ['eof', null],
  ]);
  assert.deepEqual(t[8], { type: 'eof', value: null, line: 1, column: 23 });
});

test('định danh có gạch ngang và gạch dưới', () => {
  assert.deepEqual(toks('a-b_1')[0], { type: 'ident', value: 'a-b_1', line: 1, column: 1 });
});

test('chú thích các loại và vị trí sau chú thích', () => {
  const t = toks('# x\n// y\n/* a\nb */ k');
  assert.equal(t[0].value, 'k');
  assert.deepEqual([t[0].line, t[0].column], [4, 6]);
});

test('CRLF tính một lần xuống dòng, CR đơn lẻ cũng vậy', () => {
  let t = toks('a\r\nb');
  assert.deepEqual([t[1].line, t[1].column], [2, 1]);
  t = toks('a\rb\nc');
  assert.deepEqual([t[1].line, t[1].column], [2, 1]);
  assert.deepEqual([t[2].line, t[2].column], [3, 1]);
  t = toks('a\r\n');
  assert.deepEqual([t[1].line, t[1].column], [2, 1]);
});

test('BOM bị bỏ và không tính vào cột', () => {
  const t = toks('﻿ab');
  assert.deepEqual([t[0].line, t[0].column], [1, 1]);
  assert.deepEqual([t[1].line, t[1].column], [1, 3]);
  at('﻿@', 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('cột theo đơn vị UTF-16', () => {
  const t = toks('"😀" x');
  assert.deepEqual([t[1].line, t[1].column], [1, 6]);
});

test('số hợp lệ', () => {
  const v = (s) => toks(s)[0].value;
  assert.equal(v('0'), 0);
  assert.equal(v('12'), 12);
  assert.equal(v('-1.5e2'), -150);
  assert.equal(v('1E+2'), 100);
  assert.equal(Object.is(v('-0'), 0), true);
  assert.deepEqual(toks('[1,2]').map((x) => x.value), ['[', 1, ',', 2, ']', null]);
});

test('LEX_BAD_NUMBER và vị trí', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '--1', '-.5', '1.5.2', '0x1', '1_0']) {
    at(`  ${s}`, 'LEX_BAD_NUMBER', 1, 3);
  }
  at('a = 1\nb = 1-2', 'LEX_BAD_NUMBER', 2, 5);
  at('+1', 'LEX_UNEXPECTED_CHAR', 1, 1);
  at('.5', 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('LEX_UNEXPECTED_CHAR', () => {
  at('a = ;', 'LEX_UNEXPECTED_CHAR', 1, 5);
  at('a\n  /x', 'LEX_UNEXPECTED_CHAR', 2, 3);
  at('é', 'LEX_UNEXPECTED_CHAR', 1, 1);
  at('a @', 'LEX_UNEXPECTED_CHAR', 1, 3);
  at('a b', 'LEX_UNEXPECTED_CHAR', 1, 2);
});

test('LEX_UNTERMINATED_COMMENT', () => {
  at('a\n  /* abc', 'LEX_UNTERMINATED_COMMENT', 2, 3);
  at('/* a /* b */ */', 'LEX_UNEXPECTED_CHAR', 1, 14);
});

test('chuỗi: escape hợp lệ', () => {
  const p = toks('"a\\n\\t\\r\\"\\\\\\/\\$\\u0041\\u00e9"')[0].value;
  assert.deepEqual(p, [{ type: 'Text', value: 'a\n\t\r"\\/$Aé' }]);
  assert.deepEqual(toks('""')[0].value, []);
});

test('chuỗi: \\$ chặn nội suy, $ lẻ là thường', () => {
  assert.deepEqual(toks('"\\${a}"')[0].value, [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(toks('"$a $ ${"'.replace('${', '$'))[0].value, [{ type: 'Text', value: '$a $ $' }]);
});

test('chuỗi: Part Ref/Text, không Text rỗng hay Text liền kề', () => {
  const p = toks('"a${x.0}${@c.y}b\\u0041"')[0].value;
  assert.deepEqual(p, [
    { type: 'Text', value: 'a' },
    { type: 'Ref', path: ['x', '0'], const: false, line: 1, column: 3 },
    { type: 'Ref', path: ['c', 'y'], const: true, line: 1, column: 9 },
    { type: 'Text', value: 'bA' },
  ]);
  assert.deepEqual(toks('"${a}"')[0].value, [{ type: 'Ref', path: ['a'], const: false, line: 1, column: 2 }]);
});

test('vị trí token sau chuỗi có nội suy', () => {
  const t = toks('"${abc}" x');
  assert.deepEqual([t[1].line, t[1].column], [1, 10]);
});

test('LEX_UNTERMINATED_STRING', () => {
  at('  "abc', 'LEX_UNTERMINATED_STRING', 1, 3);
  at('a = "abc\nb"', 'LEX_UNTERMINATED_STRING', 1, 5);
  at('"abc\r"', 'LEX_UNTERMINATED_STRING', 1, 1);
  at('"', 'LEX_UNTERMINATED_STRING', 1, 1);
});

test('LEX_BAD_ESCAPE', () => {
  at('"ab\\q"', 'LEX_BAD_ESCAPE', 1, 4);
  at('"\\u12"', 'LEX_BAD_ESCAPE', 1, 2);
  at('"\\u12G4"', 'LEX_BAD_ESCAPE', 1, 2);
  at('"ab\\\ncd"', 'LEX_BAD_ESCAPE', 1, 4);
  at('"ab\\\r\ncd"', 'LEX_BAD_ESCAPE', 1, 4);
});

test('LEX_BAD_INTERPOLATION', () => {
  at('"ab${}"', 'LEX_BAD_INTERPOLATION', 1, 4);
  at('"${ a}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${a }"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${1}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${@}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${@1}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${a.01}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${a..b}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${a.}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${a.b"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"${a\nb}"', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('x = "${a', 'LEX_BAD_INTERPOLATION', 1, 6);
  assert.deepEqual(toks('"${a.0.b-c}"')[0].value[0].path, ['a', '0', 'b-c']);
});

test('lỗi đầu tiên theo thứ tự đọc', () => {
  // nội suy hỏng đứng trước chuỗi chưa đóng
  at('"${}', 'LEX_BAD_INTERPOLATION', 1, 2);
  // escape hỏng trước nội suy hỏng
  at('"\\q${}"', 'LEX_BAD_ESCAPE', 1, 2);
  // nội suy hỏng trước escape hỏng
  at('"${}\\q"', 'LEX_BAD_INTERPOLATION', 1, 2);
  // escape hỏng trước chuỗi chưa đóng
  at('"a\\q', 'LEX_BAD_ESCAPE', 1, 3);
  // số hỏng trước ký tự lạ
  at('1x ;', 'LEX_BAD_NUMBER', 1, 1);
});

test('không bao giờ ném với đầu vào chuỗi', () => {
  for (const s of ['', '﻿', '"', '/*', '\\', '${', '"\\', '"${', '\r', '-']) {
    assert.doesNotThrow(() => tokenize(s));
  }
  assert.deepEqual(toks(''), [{ type: 'eof', value: null, line: 1, column: 1 }]);
});
