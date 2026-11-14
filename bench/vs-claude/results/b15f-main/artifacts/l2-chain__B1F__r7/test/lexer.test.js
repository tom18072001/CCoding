import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false, `mong lỗi cho ${JSON.stringify(src)}`);
  return r.error;
};
const toks = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.tokens;
};
const at = (e, code, line, column) => {
  assert.deepEqual({ code: e.code, line: e.line, column: e.column }, { code, line, column });
};

test('token cơ bản, từ khóa và vị trí eof', () => {
  const t = toks('const a = [true, null]');
  assert.deepEqual(t.map((x) => x.type), ['keyword', 'ident', 'punct', 'punct', 'keyword', 'punct', 'keyword', 'punct', 'eof']);
  assert.deepEqual(t.at(-1), { type: 'eof', value: null, line: 1, column: 23 });
});

test('đầu vào rỗng chỉ có eof', () => {
  assert.deepEqual(toks(''), [{ type: 'eof', value: null, line: 1, column: 1 }]);
});

test('BOM bị bỏ và không tính cột', () => {
  const t = toks('﻿a');
  assert.equal(t[0].column, 1);
  assert.equal(t[1].column, 2);
});

test('xuống dòng \\n, \\r\\n, \\r', () => {
  const t = toks('a\r\nb\rc\nd');
  assert.deepEqual(t.map((x) => [x.line, x.column]), [[1, 1], [2, 1], [3, 1], [4, 1], [4, 2]]);
});

test('chú thích #, //, /* */ nhiều dòng', () => {
  const t = toks('# x\na // y\n/* m\nn */ b');
  assert.deepEqual(t.map((x) => x.value), ['a', 'b', null]);
  assert.deepEqual([t[1].line, t[1].column], [4, 6]);
});

test('chú thích khối chưa đóng', () => {
  at(err('a\n  /* abc'), 'LEX_UNTERMINATED_COMMENT', 2, 3);
});

test('"/" đơn lẻ và chữ có dấu ngoài chuỗi là ký tự lạ', () => {
  at(err('a = /'), 'LEX_UNEXPECTED_CHAR', 1, 5);
  at(err('a = 1\nđ = 2'), 'LEX_UNEXPECTED_CHAR', 2, 1);
  at(err('.5'), 'LEX_UNEXPECTED_CHAR', 1, 1);
  at(err('a ; b'), 'LEX_UNEXPECTED_CHAR', 1, 3);
});

test('chữ có dấu trong chuỗi và chú thích hợp lệ', () => {
  const t = toks('a = "đẹp" # tiếng Việt');
  assert.deepEqual(t[2].value, [{ type: 'Text', value: 'đẹp' }]);
});

test('số hợp lệ', () => {
  const v = toks('0 -1.5e2 10 1E+2 2.50 -0').filter((x) => x.type === 'number').map((x) => x.value);
  assert.deepEqual(v, [0, -150, 10, 100, 2.5, 0]);
  assert.ok(Object.is(v[5], 0));
});

test('số không hợp lệ', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '+1'.slice(1) + '.', '-01', '1__']) {
    const e = err(`x = ${s}`);
    at(e, 'LEX_BAD_NUMBER', 1, 5);
  }
  at(err('+1'), 'LEX_UNEXPECTED_CHAR', 1, 1);
  at(err('a\n  1e'), 'LEX_BAD_NUMBER', 2, 3);
});

test('escape trong chuỗi', () => {
  const t = toks('"a\\n\\t\\r\\"\\\\\\/\\$\\u0041\\u00e9"');
  assert.deepEqual(t[0].value, [{ type: 'Text', value: 'a\n\t\r"\\/$Aé' }]);
});

test('"\\${a}" là văn bản, không phải tham chiếu', () => {
  const t = toks('"\\${a}"');
  assert.deepEqual(t[0].value, [{ type: 'Text', value: '${a}' }]);
});

test('$ không theo sau bởi { là ký tự thường', () => {
  assert.deepEqual(toks('"$a $"')[0].value, [{ type: 'Text', value: '$a $' }]);
});

test('chuỗi rỗng có parts rỗng', () => {
  assert.deepEqual(toks('""')[0].value, []);
});

test('Ref, gộp Text liền kề, vị trí $', () => {
  const t = toks('"a\\nb${x.y.0}c${@k.1}"');
  assert.deepEqual(t[0].value, [
    { type: 'Text', value: 'a\nb' },
    { type: 'Ref', path: ['x', 'y', '0'], const: false, line: 1, column: 6 },
    { type: 'Text', value: 'c' },
    { type: 'Ref', path: ['k', '1'], const: true, line: 1, column: 15 },
  ]);
  assert.deepEqual(toks('"${a}${b}"')[0].value.map((p) => p.type), ['Ref', 'Ref']);
  assert.deepEqual(toks('"a\\$b\\u0063"')[0].value, [{ type: 'Text', value: 'a$bc' }]);
});

test('Ref trên dòng sau, cột sau BOM', () => {
  const t = toks('﻿x\n  "${a}"');
  assert.deepEqual(t[1].value[0], { type: 'Ref', path: ['a'], const: false, line: 2, column: 4 });
});

test('chuỗi chưa đóng', () => {
  at(err('a = "abc'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "abc\nd"'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "abc\rd"'), 'LEX_UNTERMINATED_STRING', 1, 5);
});

test('escape sai', () => {
  at(err('"ab\\q"'), 'LEX_BAD_ESCAPE', 1, 4);
  at(err('"\\u12G4"'), 'LEX_BAD_ESCAPE', 1, 2);
  at(err('"\\u12"'), 'LEX_BAD_ESCAPE', 1, 2);
  at(err('"ab\\\ncd"'), 'LEX_BAD_ESCAPE', 1, 4);
});

test('nội suy sai', () => {
  for (const s of ['${}', '${a', '${ a}', '${a.}', '${.a}', '${1a}', '${a.01}', '${a b}', '${@}', '${@@a}', '${@1}']) {
    at(err(`x = "ab${s}"`), 'LEX_BAD_INTERPOLATION', 1, 8);
  }
  at(err('"${a"'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"${a'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"${a\n}"'), 'LEX_BAD_INTERPOLATION', 1, 2);
});

test('nội suy hợp lệ: ident có gạch ngang, số 0, số nhiều chữ số', () => {
  const r = toks('"${a-b._c.0.10}"')[0].value[0];
  assert.deepEqual(r.path, ['a-b', '_c', '0', '10']);
});

test('lỗi đầu tiên theo thứ tự đọc', () => {
  at(err('"${a" \\q'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"\\q ${'), 'LEX_BAD_ESCAPE', 1, 2);
  at(err('"${}" "abc'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('1x "abc'), 'LEX_BAD_NUMBER', 1, 1);
});

test('cột theo đơn vị UTF-16', () => {
  const t = toks('"😀" a');
  assert.equal(t[1].column, 6);
});

test('không bao giờ ném', () => {
  for (const s of ['"', '/', '/*', '\\', '﻿', '"\\', '"\\u', '-', '${', '\r', '\r\n\r']) {
    assert.doesNotThrow(() => tokenize(s));
  }
});
