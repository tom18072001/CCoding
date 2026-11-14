import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const toks = (s) => {
  const r = tokenize(s);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.tokens;
};
const err = (s) => {
  const r = tokenize(s);
  assert.equal(r.ok, false);
  return r.error;
};
const str = (s) => toks(s)[0].value;

test('token cơ bản và eof', () => {
  const t = toks('a = [1, "x"] { } include const true');
  assert.deepEqual(t.map((x) => x.type), [
    'ident', 'punct', 'punct', 'number', 'punct', 'string', 'punct', 'punct', 'punct',
    'keyword', 'keyword', 'keyword', 'eof',
  ]);
  assert.equal(t.at(-1).value, null);
});

test('định danh có gạch ngang, từ khóa', () => {
  const t = toks('a-b_1 include');
  assert.deepEqual(t.slice(0, 2).map((x) => [x.type, x.value]), [['ident', 'a-b_1'], ['keyword', 'include']]);
});

test('vị trí: \\n, \\r\\n, \\r đơn', () => {
  for (const nl of ['\n', '\r\n', '\r']) {
    const t = toks(`a${nl}  b`);
    assert.deepEqual([t[1].line, t[1].column], [2, 3]);
    assert.deepEqual([t[2].line, t[2].column], [2, 4]);
  }
});

test('BOM không tính cột', () => {
  const t = toks('﻿ab');
  assert.deepEqual([t[0].line, t[0].column], [1, 1]);
  assert.deepEqual([t[1].line, t[1].column], [1, 3]);
  assert.deepEqual(err('﻿?'), { ...err('﻿?') });
  assert.equal(err('﻿?').column, 1);
});

test('cột theo đơn vị UTF-16', () => {
  const t = toks('"😀" x');
  assert.equal(t[1].column, 6);
});

test('eof ở vị trí con trỏ cuối', () => {
  assert.deepEqual([toks('')[0].line, toks('')[0].column], [1, 1]);
  const t = toks('a\n');
  assert.deepEqual([t[1].line, t[1].column], [2, 1]);
  const u = toks('a # c');
  assert.deepEqual([u[1].line, u[1].column], [1, 6]);
});

test('ba loại chú thích', () => {
  const t = toks('# a\n// b\n/* c\n d */ x');
  assert.equal(t.length, 2);
  assert.deepEqual([t[0].value, t[0].line, t[0].column], ['x', 4, 7]);
  assert.equal(toks('a // x\r b')[1].line, 2);
  assert.equal(toks('/* /* */ x')[0].value, 'x');
});

test('số hợp lệ', () => {
  const v = (s) => toks(s)[0].value;
  assert.equal(v('0'), 0);
  assert.equal(v('42'), 42);
  assert.equal(v('-1.5e2'), -150);
  assert.equal(v('1E+2'), 100);
  assert.ok(Object.is(v('-0'), 0));
  assert.ok(Object.is(v('-0.0'), 0));
  assert.equal(toks('[1,2]').length, 6);
});

test('số lỗi', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '--1', '1_0']) {
    const e = err(`x = ${s}`);
    assert.equal(e.code, 'LEX_BAD_NUMBER', s);
    assert.deepEqual([e.line, e.column], [1, 5], s);
  }
  assert.equal(err('.5').code, 'LEX_UNEXPECTED_CHAR');
});

test('chuỗi: escape', () => {
  assert.deepEqual(str('"a\\n\\t\\r\\"\\\\\\/\\u0041\\$"'), [
    { type: 'Text', value: 'a\n\t\r"\\/A$' },
  ]);
  assert.deepEqual(str('""'), []);
});

test('chuỗi: \\$ không phải tham chiếu; $ thường', () => {
  assert.deepEqual(str('"\\${a}"'), [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(str('"$a $"'), [{ type: 'Text', value: '$a $' }]);
});

test('chuỗi: Part Ref, không Text rỗng/liền nhau', () => {
  assert.deepEqual(str('"${a}"'), [{ type: 'Ref', path: ['a'], const: false, line: 1, column: 2 }]);
  assert.deepEqual(str('"x${a.b.0}\\n${@c.1}y"'), [
    { type: 'Text', value: 'x' },
    { type: 'Ref', path: ['a', 'b', '0'], const: false, line: 1, column: 3 },
    { type: 'Text', value: '\n' },
    { type: 'Ref', path: ['c', '1'], const: true, line: 1, column: 13 },
    { type: 'Text', value: 'y' },
  ]);
  assert.deepEqual(str('"a\\u0062c"'), [{ type: 'Text', value: 'abc' }]);
});

test('lỗi: ký tự lạ', () => {
  for (const [s, c] of [['a ; b', 5], ['/', 1], ['é', 1], ['a\n  @', 3]]) {
    const e = err(s);
    assert.equal(e.code, 'LEX_UNEXPECTED_CHAR');
    assert.equal(e.column, c === 5 ? 3 : c);
  }
  assert.equal(err('a\n  @').line, 2);
});

test('lỗi: chuỗi chưa đóng', () => {
  let e = err('a = "abc');
  assert.deepEqual([e.code, e.line, e.column], ['LEX_UNTERMINATED_STRING', 1, 5]);
  e = err('a = "abc\nd"');
  assert.deepEqual([e.code, e.line, e.column], ['LEX_UNTERMINATED_STRING', 1, 5]);
  e = err('"abc\r');
  assert.equal(e.code, 'LEX_UNTERMINATED_STRING');
});

test('lỗi: chú thích khối chưa đóng', () => {
  const e = err('a\n  /* abc');
  assert.deepEqual([e.code, e.line, e.column], ['LEX_UNTERMINATED_COMMENT', 2, 3]);
});

test('lỗi: escape', () => {
  for (const s of ['"\\q"', '"\\u12"', '"\\u12G4"', '"\\\n"']) {
    const e = err(s);
    assert.equal(e.code, 'LEX_BAD_ESCAPE', s);
    assert.deepEqual([e.line, e.column], [1, 2], s);
  }
});

test('lỗi: nội suy', () => {
  for (const s of ['"${}"', '"${a"', '"${a b}"', '"${1a}"', '"${a.}"', '"${a.01}"', '"${@}"', '"${a\n}"']) {
    const e = err(s);
    assert.equal(e.code, 'LEX_BAD_INTERPOLATION', s);
    assert.deepEqual([e.line, e.column], [1, 2], s);
  }
  assert.equal(err('"ab ${@1}"').column, 5);
});

test('lỗi đầu tiên theo thứ tự đọc', () => {
  assert.equal(err('"${a b" \n').code, 'LEX_BAD_INTERPOLATION');
  assert.equal(err('"\\q ${').code, 'LEX_BAD_ESCAPE');
  assert.equal(err('"x ${a} \\q').code, 'LEX_BAD_ESCAPE');
  assert.equal(err('a = 01 ;').code, 'LEX_BAD_NUMBER');
});

test('không bao giờ ném', () => {
  for (const s of ['', '"', '/*', '\\', '${', '"\\', '"\\u', '\uD800']) {
    assert.doesNotThrow(() => tokenize(s));
  }
});
