import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const err = (s) => {
  const r = tokenize(s);
  assert.equal(r.ok, false, s);
  return r.error;
};
const codeAt = (s) => {
  const e = err(s);
  return [e.code, e.line, e.column];
};

test('token cơ bản, từ khóa, eof', () => {
  const r = tokenize('const a-b = [1, "x"] # c\n// d\n/* e\n f */ true');
  assert.equal(r.ok, true);
  assert.deepEqual(r.tokens.map((t) => [t.type, t.line, t.column]), [
    ['keyword', 1, 1], ['ident', 1, 7], ['punct', 1, 11], ['punct', 1, 13], ['number', 1, 14],
    ['punct', 1, 15], ['string', 1, 17], ['punct', 1, 20], ['keyword', 4, 7], ['eof', 4, 11],
  ]);
});

test('BOM, \\r\\n và \\r', () => {
  const r = tokenize('﻿a\r\nb\rc');
  assert.deepEqual(r.tokens.map((t) => [t.line, t.column]), [[1, 1], [2, 1], [3, 1], [3, 2]]);
});

test('số', () => {
  const v = (s) => tokenize(s).tokens[0].value;
  assert.equal(v('-1.5e2'), -150);
  assert.ok(Object.is(v('-0'), 0));
  assert.equal(v('0'), 0);
  for (const bad of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '-abc', '1.5.2']) {
    assert.equal(err(`x = ${bad}`).code, 'LEX_BAD_NUMBER', bad);
  }
  assert.deepEqual(codeAt('  .5'), ['LEX_UNEXPECTED_CHAR', 1, 3]);
});

test('chuỗi: escape và nội suy', () => {
  const v = (s) => tokenize(s).tokens[0].value;
  assert.deepEqual(v('"a\\n\\u0041\\$\\"\\/"'), [{ type: 'Text', value: 'a\nA$"/' }]);
  assert.deepEqual(v('""'), []);
  assert.deepEqual(v('"\\${a}"'), [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(v('"$x $"'), [{ type: 'Text', value: '$x $' }]);
  assert.deepEqual(v('"a${@c.1}b${x.y}"'), [
    { type: 'Text', value: 'a' },
    { type: 'Ref', path: ['c', '1'], const: true, line: 1, column: 3 },
    { type: 'Text', value: 'b' },
    { type: 'Ref', path: ['x', 'y'], const: false, line: 1, column: 11 },
  ]);
});

test('mã lỗi và vị trí', () => {
  assert.deepEqual(codeAt('a = 1\n  /'), ['LEX_UNEXPECTED_CHAR', 2, 3]);
  assert.deepEqual(codeAt('é'), ['LEX_UNEXPECTED_CHAR', 1, 1]);
  assert.deepEqual(codeAt('a = "abc'), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(codeAt('a = "abc\nd"'), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(codeAt('x /* oops'), ['LEX_UNTERMINATED_COMMENT', 1, 3]);
  assert.deepEqual(codeAt('"a\\q"'), ['LEX_BAD_ESCAPE', 1, 3]);
  assert.deepEqual(codeAt('"\\u12G4"'), ['LEX_BAD_ESCAPE', 1, 2]);
  assert.deepEqual(codeAt('"a\\\nb"'), ['LEX_BAD_ESCAPE', 1, 3]);
  assert.deepEqual(codeAt('"ab${x"'), ['LEX_BAD_INTERPOLATION', 1, 4]);
  assert.deepEqual(codeAt('"ab${x'), ['LEX_BAD_INTERPOLATION', 1, 4]);
  for (const bad of ['${}', '${1a}', '${a..b}', '${a.01}', '${ a}', '${a.}', '${@}', '${@@a}']) {
    assert.equal(err(`"${bad}"`).code, 'LEX_BAD_INTERPOLATION', bad);
  }
});

test('lỗi đầu tiên theo thứ tự đọc', () => {
  assert.equal(err('"${} \\q').code, 'LEX_BAD_INTERPOLATION');
  assert.equal(err('"\\q ${').code, 'LEX_BAD_ESCAPE');
  assert.equal(err('"abc ${a').code, 'LEX_BAD_INTERPOLATION');
});
