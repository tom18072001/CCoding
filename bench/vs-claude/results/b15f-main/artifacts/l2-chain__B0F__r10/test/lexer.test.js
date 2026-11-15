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
const at = (e, code, line, column) => {
  assert.deepEqual({ code: e.code, line: e.line, column: e.column }, { code, line, column });
};

test('token cơ bản và eof', () => {
  const t = toks('a = [1, "x"] // c\n');
  assert.deepEqual(t.map((x) => x.type), ['ident', 'punct', 'punct', 'number', 'punct', 'string', 'punct', 'eof']);
  assert.deepEqual(t.at(-1), { type: 'eof', value: null, line: 2, column: 1 });
});

test('từ khóa và định danh có gạch ngang', () => {
  const t = toks('include a-b_1 true');
  assert.deepEqual(t.map((x) => [x.type, x.value]).slice(0, 3), [['keyword', 'include'], ['ident', 'a-b_1'], ['keyword', 'true']]);
});

test('vị trí: BOM bị bỏ, không tính cột', () => {
  const t = toks('﻿ab');
  assert.deepEqual([t[0].line, t[0].column], [1, 1]);
  assert.deepEqual([t[1].line, t[1].column], [1, 3]);
});

test('vị trí: \\r\\n tính một lần', () => {
  const t = toks('a\r\nb');
  assert.deepEqual([t[1].line, t[1].column], [2, 1]);
  assert.deepEqual([t[2].line, t[2].column], [2, 2]);
});

test('vị trí: \\r đơn lẻ và \\n', () => {
  const t = toks('a\rb\nc');
  assert.deepEqual([t[1].line, t[1].column], [2, 1]);
  assert.deepEqual([t[2].line, t[2].column], [3, 1]);
});

test('vị trí: eof sau ký tự cuối, cột UTF-16', () => {
  assert.deepEqual(toks('a')[1], { type: 'eof', value: null, line: 1, column: 2 });
  const t = toks('"😀" x');
  assert.equal(t[1].column, 6); // "😀" = 4 đơn vị mã
  assert.deepEqual(toks('')[0], { type: 'eof', value: null, line: 1, column: 1 });
});

test('chú thích: #, //, khối nhiều dòng', () => {
  const t = toks('# a\n// b\n/* c\nd */ x');
  assert.equal(t.length, 2);
  assert.deepEqual([t[0].line, t[0].column], [4, 6]);
});

test('số hợp lệ và -0', () => {
  const t = toks('0 -1.5e2 1E+3 -0');
  assert.deepEqual(t.slice(0, 4).map((x) => x.value), [0, -150, 1000, 0]);
  assert.equal(Object.is(t[3].value, 0), true);
});

test('LEX_BAD_NUMBER', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '+1', '-01']) {
    if (s === '+1') { at(err(s), 'LEX_UNEXPECTED_CHAR', 1, 1); continue; }
    at(err('x = ' + s), 'LEX_BAD_NUMBER', 1, 5);
  }
});

test('LEX_UNEXPECTED_CHAR: .5, /, chữ có dấu, ký tự lạ', () => {
  at(err('a = .5'), 'LEX_UNEXPECTED_CHAR', 1, 5);
  at(err('a / b'), 'LEX_UNEXPECTED_CHAR', 1, 3);
  at(err('é'), 'LEX_UNEXPECTED_CHAR', 1, 1);
  at(err('\n  ;'), 'LEX_UNEXPECTED_CHAR', 2, 3);
});

test('chuỗi: escape và $', () => {
  const t = toks('"a\\n\\t\\r\\"\\\\\\/\\u0041 $ $x \\${a}"');
  assert.deepEqual(t[0].value, [{ type: 'Text', value: 'a\n\t\r"\\/A $ $x ${a}' }]);
  assert.deepEqual(toks('""')[0].value, []);
});

test('chuỗi: nội suy và Text liền kề được gộp', () => {
  const t = toks('"a${x.0.y}b${@c}${d}"');
  assert.deepEqual(t[0].value, [
    { type: 'Text', value: 'a' },
    { type: 'Ref', path: ['x', '0', 'y'], const: false, line: 1, column: 3 },
    { type: 'Text', value: 'b' },
    { type: 'Ref', path: ['c'], const: true, line: 1, column: 12 },
    { type: 'Ref', path: ['d'], const: false, line: 1, column: 17 },
  ]);
});

test('LEX_UNTERMINATED_STRING', () => {
  at(err('a = "abc'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "abc\nd"'), 'LEX_UNTERMINATED_STRING', 1, 5);
  at(err('a = "abc\rd"'), 'LEX_UNTERMINATED_STRING', 1, 5);
});

test('LEX_UNTERMINATED_COMMENT', () => {
  at(err('a = 1\n  /* x'), 'LEX_UNTERMINATED_COMMENT', 2, 3);
});

test('LEX_BAD_ESCAPE', () => {
  at(err('"a\\q"'), 'LEX_BAD_ESCAPE', 1, 3);
  at(err('"\\u12G4"'), 'LEX_BAD_ESCAPE', 1, 2);
  at(err('"\\u12"'), 'LEX_BAD_ESCAPE', 1, 2);
  at(err('"ab\\\ncd"'), 'LEX_BAD_ESCAPE', 1, 4);
});

test('LEX_BAD_INTERPOLATION', () => {
  at(err('"a${b"'), 'LEX_BAD_INTERPOLATION', 1, 3);
  at(err('"a${}"'), 'LEX_BAD_INTERPOLATION', 1, 3);
  at(err('"${a b}"'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"${1a}"'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"${a.01}"'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"${a.}"'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"${@}"'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"${a'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"${a\n}"'), 'LEX_BAD_INTERPOLATION', 1, 2);
});

test('lỗi đầu tiên theo thứ tự đọc', () => {
  at(err('"${a b} \\q'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(err('"\\q ${'), 'LEX_BAD_ESCAPE', 1, 2);
  at(err('"abc ${a} \n x ${'), 'LEX_UNTERMINATED_STRING', 1, 1);
});

test('không bao giờ ném', () => {
  for (const s of ['"', '\\', '${', '/*', '"\\', '"\\u', '-', '﻿', '"$']) {
    assert.doesNotThrow(() => tokenize(s));
  }
});
