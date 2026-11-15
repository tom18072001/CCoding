import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false, `đáng lẽ lỗi: ${JSON.stringify(src)}`);
  return r.error;
};
const loc = (e) => [e.code, e.line, e.column];

test('token cơ bản và vị trí', () => {
  const r = tokenize('a = [1, "x"]\n  true');
  assert.equal(r.ok, true);
  assert.deepEqual(r.tokens, [
    { type: 'ident', value: 'a', line: 1, column: 1 },
    { type: 'punct', value: '=', line: 1, column: 3 },
    { type: 'punct', value: '[', line: 1, column: 5 },
    { type: 'number', value: 1, line: 1, column: 6 },
    { type: 'punct', value: ',', line: 1, column: 7 },
    { type: 'string', value: [{ type: 'Text', value: 'x' }], line: 1, column: 9 },
    { type: 'punct', value: ']', line: 1, column: 12 },
    { type: 'keyword', value: 'true', line: 2, column: 3 },
    { type: 'eof', value: null, line: 2, column: 7 },
  ]);
});

test('eof sau BOM, \\r\\n và \\r', () => {
  assert.deepEqual(tokenize('﻿').tokens, [{ type: 'eof', value: null, line: 1, column: 1 }]);
  assert.deepEqual(tokenize('﻿a').tokens[1], { type: 'eof', value: null, line: 1, column: 2 });
  assert.deepEqual(tokenize('a\r\n').tokens[1], { type: 'eof', value: null, line: 2, column: 1 });
  assert.deepEqual(tokenize('a\r').tokens[1], { type: 'eof', value: null, line: 2, column: 1 });
  assert.deepEqual(tokenize('a\r\r\nb').tokens[2], { type: 'eof', value: null, line: 3, column: 2 });
  assert.deepEqual(tokenize('').tokens, [{ type: 'eof', value: null, line: 1, column: 1 }]);
});

test('chú thích các loại và xuống dòng', () => {
  const r = tokenize('# c\r// d\n/* x\r\ny */ a');
  assert.equal(r.ok, true);
  assert.deepEqual(r.tokens[0], { type: 'ident', value: 'a', line: 4, column: 6 });
  assert.deepEqual(loc(err('a /* chưa đóng')), ['LEX_UNTERMINATED_COMMENT', 1, 3]);
  assert.deepEqual(loc(err('a / b')), ['LEX_UNEXPECTED_CHAR', 1, 3]);
});

test('số hợp lệ', () => {
  const vals = (s) => tokenize(s).tokens.filter((t) => t.type === 'number').map((t) => t.value);
  assert.deepEqual(vals('0 12 -1.5e2 1E+3 2e-2'), [0, 12, -150, 1000, 0.02]);
  const z = vals('-0')[0];
  assert.ok(Object.is(z, 0));
});

test('số lỗi', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '+1']) {
    const e = err(`x = ${s}`);
    assert.equal(e.line, 1);
    assert.equal(e.column, s === '+1' ? 5 : 5);
    assert.equal(e.code, s === '+1' ? 'LEX_UNEXPECTED_CHAR' : 'LEX_BAD_NUMBER', s);
  }
  assert.deepEqual(loc(err('x = .5')), ['LEX_UNEXPECTED_CHAR', 1, 5]);
});

test('chuỗi: thoát', () => {
  const r = tokenize('"a\\n\\t\\r\\"\\\\\\/\\$\\u0041\\u00e9"');
  assert.deepEqual(r.tokens[0].value, [{ type: 'Text', value: 'a\n\t\r"\\/$Aé' }]);
  assert.deepEqual(tokenize('"\\${a}"').tokens[0].value, [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(tokenize('""').tokens[0].value, []);
  assert.deepEqual(tokenize('"a$b$"').tokens[0].value, [{ type: 'Text', value: 'a$b$' }]);
});

test('chuỗi: lỗi thoát', () => {
  assert.deepEqual(loc(err('"ab\\x"')), ['LEX_BAD_ESCAPE', 1, 4]);
  assert.deepEqual(loc(err('"\\u12G4"')), ['LEX_BAD_ESCAPE', 1, 2]);
  assert.deepEqual(loc(err('"\\u12"')), ['LEX_BAD_ESCAPE', 1, 2]);
  assert.deepEqual(loc(err('"ab\\\n"')), ['LEX_BAD_ESCAPE', 1, 4]);
});

test('chuỗi chưa đóng', () => {
  assert.deepEqual(loc(err('a = "xyz')), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(loc(err('a = "xyz\nb"')), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(loc(err('a = "xyz\r')), ['LEX_UNTERMINATED_STRING', 1, 5]);
});

test('nội suy hợp lệ', () => {
  const r = tokenize('"a${b.0.c-d}${@k.12}x${ y }"'.replace('${ y }', '${y}'));
  assert.deepEqual(r.tokens[0].value, [
    { type: 'Text', value: 'a' },
    { type: 'Ref', path: ['b', '0', 'c-d'], const: false, line: 1, column: 3 },
    { type: 'Ref', path: ['k', '12'], const: true, line: 1, column: 13 },
    { type: 'Text', value: 'x' },
    { type: 'Ref', path: ['y'], const: false, line: 1, column: 22 },
  ]);
});

test('nội suy lỗi', () => {
  for (const body of ['', ' a', 'a ', '1a', '.a', 'a.', 'a..b', 'a.01', '@', '@@a', 'a.-b', 'a b']) {
    assert.deepEqual(loc(err(`x = "p\${${body}}"`)), ['LEX_BAD_INTERPOLATION', 1, 7], JSON.stringify(body));
  }
  assert.deepEqual(loc(err('"${a')), ['LEX_BAD_INTERPOLATION', 1, 2]);
  assert.deepEqual(loc(err('"${a"')), ['LEX_BAD_INTERPOLATION', 1, 2]);
  assert.deepEqual(loc(err('"${a\n}"')), ['LEX_BAD_INTERPOLATION', 1, 2]);
});

test('lỗi đầu tiên theo thứ tự đọc', () => {
  assert.deepEqual(loc(err('"${a b} \\q')), ['LEX_BAD_INTERPOLATION', 1, 2]);
  assert.deepEqual(loc(err('"\\q ${a b}')), ['LEX_BAD_ESCAPE', 1, 2]);
  assert.deepEqual(loc(err('é "')), ['LEX_UNEXPECTED_CHAR', 1, 1]);
});

test('cột theo UTF-16 và BOM không tính cột', () => {
  const r = tokenize('﻿"😀" a');
  assert.equal(r.tokens[0].column, 1);
  assert.equal(r.tokens[1].column, 6);
  assert.deepEqual(loc(err('"😀" é')), ['LEX_UNEXPECTED_CHAR', 1, 6]);
});

test('không bao giờ ném', () => {
  for (const s of ['\\', '"\\', '$', '"$', '/*', '\r', '﻿﻿', '-', '{{']) {
    assert.doesNotThrow(() => tokenize(s));
  }
});
