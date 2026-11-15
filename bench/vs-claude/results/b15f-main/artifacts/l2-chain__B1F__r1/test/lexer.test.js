import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false, `phải lỗi: ${JSON.stringify(src)}`);
  return r.error;
};
const at = (src, code, line, column) => {
  const e = err(src);
  assert.deepEqual([e.code, e.line, e.column], [code, line, column], JSON.stringify(src));
};
const toks = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, true);
  return r.tokens;
};

test('token cơ bản và eof', () => {
  const t = toks('a = [1, "x"] include const true');
  assert.deepEqual(t.map((x) => x.type), [
    'ident', 'punct', 'punct', 'number', 'punct', 'string', 'punct', 'keyword', 'keyword', 'keyword', 'eof',
  ]);
  assert.equal(t.at(-1).value, null);
  assert.deepEqual(toks('')[0], { type: 'eof', value: null, line: 1, column: 1 });
});

test('BOM không tính vào cột', () => {
  const t = toks('﻿ab');
  assert.deepEqual([t[0].line, t[0].column], [1, 1]);
  assert.deepEqual([t[1].line, t[1].column], [1, 3]);
});

test('xuống dòng \\n, \\r\\n, \\r', () => {
  for (const nl of ['\n', '\r\n', '\r']) {
    const t = toks(`a${nl}b${nl}  c`);
    assert.deepEqual(t.map((x) => [x.line, x.column]), [[1, 1], [2, 1], [3, 3], [3, 4]]);
  }
});

test('cột theo đơn vị UTF-16, ký tự ngoài BMP', () => {
  const t = toks('"😀" x');
  assert.equal(t[1].column, 6);
  assert.equal(t[0].value[0].value, '😀');
  at('😀', 'LEX_UNEXPECTED_CHAR', 1, 1);
  at('"😀" ?', 'LEX_UNEXPECTED_CHAR', 1, 6);
});

test('chú thích', () => {
  const t = toks('# a\n// b\n/* c\n d */ x /**/ y');
  assert.deepEqual(t.filter((x) => x.type === 'ident').map((x) => [x.value, x.line, x.column]), [['x', 4, 7], ['y', 4, 14]]);
  assert.deepEqual(toks('a # x\r\nb').map((x) => x.line), [1, 2, 2]);
});

test('số hợp lệ', () => {
  const v = (s) => toks(s)[0].value;
  assert.equal(v('0'), 0);
  assert.equal(Object.is(v('-0'), 0), true);
  assert.equal(v('-1.5e2'), -150);
  assert.equal(v('1E+2'), 100);
  assert.equal(v('10'), 10);
  assert.deepEqual(toks('1,2').map((x) => x.type), ['number', 'punct', 'number', 'eof']);
});

test('LEX_BAD_NUMBER', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '-01', '1.e2']) {
    at(`x = ${s}`, 'LEX_BAD_NUMBER', 1, 5);
  }
  at('.5', 'LEX_UNEXPECTED_CHAR', 1, 1);
  at('+1', 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('chuỗi: thoát và phần Text/Ref', () => {
  const s = toks('"a\\n\\t\\r\\"\\\\\\/\\$\\u0041$b"')[0].value;
  assert.deepEqual(s, [{ type: 'Text', value: 'a\n\t\r"\\/$A$b' }]);
  assert.deepEqual(toks('""')[0].value, []);
  assert.deepEqual(toks('"\\${a}"')[0].value, [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(toks('"x${a.b.0}${@c.1}y"')[0].value, [
    { type: 'Text', value: 'x' },
    { type: 'Ref', path: ['a', 'b', '0'], const: false, line: 1, column: 3 },
    { type: 'Ref', path: ['c', '1'], const: true, line: 1, column: 11 },
    { type: 'Text', value: 'y' },
  ]);
  // Hai Text không liền nhau sau thoát
  assert.equal(toks('"a\\nb"')[0].value.length, 1);
});

test('LEX_UNEXPECTED_CHAR', () => {
  at('a = é', 'LEX_UNEXPECTED_CHAR', 1, 5);
  at('a\n  /', 'LEX_UNEXPECTED_CHAR', 2, 3);
  at(';', 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('LEX_UNTERMINATED_STRING', () => {
  at('a = "abc', 'LEX_UNTERMINATED_STRING', 1, 5);
  at('a = "abc\nd"', 'LEX_UNTERMINATED_STRING', 1, 5);
  at('\n"abc\r', 'LEX_UNTERMINATED_STRING', 2, 1);
});

test('LEX_UNTERMINATED_COMMENT', () => {
  at('a\n  /* x', 'LEX_UNTERMINATED_COMMENT', 2, 3);
  at('/* /* */ */', 'LEX_UNEXPECTED_CHAR', 1, 10);
});

test('LEX_BAD_ESCAPE', () => {
  at('"ab\\q"', 'LEX_BAD_ESCAPE', 1, 4);
  at('"\\u12G4"', 'LEX_BAD_ESCAPE', 1, 2);
  at('"\\u12"', 'LEX_BAD_ESCAPE', 1, 2);
  at('"ab\\\ncd"', 'LEX_BAD_ESCAPE', 1, 4);
});

test('LEX_BAD_INTERPOLATION', () => {
  at('a = "x${a"', 'LEX_BAD_INTERPOLATION', 1, 7);
  at('a = "x${a', 'LEX_BAD_INTERPOLATION', 1, 7);
  for (const inner of ['', ' a', 'a ', '0', '1a', 'a.', 'a..b', 'a.01', '@', '@1', 'a.b-', '@@a', 'a.-']) {
    if (inner === 'a.b-') continue; // 'b-' là định danh hợp lệ
    at(`"${'${'}${inner}}"`, 'LEX_BAD_INTERPOLATION', 1, 2);
  }
  assert.equal(tokenize('"${a-b.c_d.10}"').ok, true);
});

test('lỗi đầu tiên theo thứ tự đọc', () => {
  at('"${a ${b}\n', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('"\\q ${a', 'LEX_BAD_ESCAPE', 1, 2);
  at('"${}\\q', 'LEX_BAD_INTERPOLATION', 1, 2);
  at('01 ?', 'LEX_BAD_NUMBER', 1, 1);
});

test('không bao giờ ném', () => {
  for (const s of ['"', '"\\', '/*', '${', '"${', '﻿', '\r', '-', '"\\u']) {
    assert.doesNotThrow(() => tokenize(s));
  }
});
