import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';

const ok = (s) => {
  const r = tokenize(s);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.tokens;
};
const err = (s, code, line, column) => {
  const r = tokenize(s);
  assert.equal(r.ok, false, `phải lỗi: ${JSON.stringify(s)}`);
  assert.deepEqual(
    { code: r.error.code, line: r.error.line, column: r.error.column },
    { code, line, column },
  );
  assert.equal(typeof r.error.message, 'string');
};
const str = (s) => ok(s)[0].value;

test('token cơ bản và eof', () => {
  const t = ok('const a-b = [1, "x"] { } include true null');
  assert.deepEqual(t.map((x) => [x.type, x.value]), [
    ['keyword', 'const'], ['ident', 'a-b'], ['punct', '='], ['punct', '['],
    ['number', 1], ['punct', ','], ['string', [{ type: 'Text', value: 'x' }]],
    ['punct', ']'], ['punct', '{'], ['punct', '}'], ['keyword', 'include'],
    ['keyword', 'true'], ['keyword', 'null'], ['eof', null],
  ]);
  assert.deepEqual(ok('')[0], { type: 'eof', value: null, line: 1, column: 1 });
});

test('từ khóa chỉ khớp nguyên từ', () => {
  assert.equal(ok('constant')[0].type, 'ident');
  assert.equal(ok('_x1')[0].type, 'ident');
});

test('vị trí: \\n, \\r\\n, \\r đơn, BOM', () => {
  const t = ok('a\nb\r\nc\rd');
  assert.deepEqual(t.map((x) => [x.line, x.column]), [[1, 1], [2, 1], [3, 1], [4, 1], [4, 2]]);
  const b = ok('﻿ab');
  assert.deepEqual([b[0].line, b[0].column, b[1].column], [1, 1, 3]);
  assert.deepEqual(ok('﻿')[0], { type: 'eof', value: null, line: 1, column: 1 });
  // chỉ bỏ một BOM
  err('﻿﻿a', 'LEX_UNEXPECTED_CHAR', 1, 1);
  err('a\n\r\r\nb$', 'LEX_UNEXPECTED_CHAR', 4, 2);
});

test('cột đếm theo UTF-16 (ký tự ngoài BMP là 2)', () => {
  const t = ok('s = "😀" x');
  assert.equal(t[3].column, 10);
  err('"😀" é', 'LEX_UNEXPECTED_CHAR', 1, 6);
  err('😀', 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('chú thích #, //, /* */', () => {
  const t = ok('# a\n// b\r\n/* c\nd */ x # e');
  assert.equal(t.length, 2);
  assert.deepEqual([t[0].value, t[0].line, t[0].column], ['x', 4, 6]);
  assert.deepEqual([t[1].line, t[1].column], [4, 11]);
  assert.equal(ok('/**/a').length, 2);
  assert.equal(ok('/* * / **/a').length, 2);
  assert.equal(ok('a # "chưa đóng').length, 2);
});

test('LEX_UNTERMINATED_COMMENT', () => {
  err('a\n  /* abc', 'LEX_UNTERMINATED_COMMENT', 2, 3);
  err('/*/', 'LEX_UNTERMINATED_COMMENT', 1, 1);
  err('/*', 'LEX_UNTERMINATED_COMMENT', 1, 1);
});

test('LEX_UNEXPECTED_CHAR', () => {
  err('a / b', 'LEX_UNEXPECTED_CHAR', 1, 3);
  err('/', 'LEX_UNEXPECTED_CHAR', 1, 1);
  err('é', 'LEX_UNEXPECTED_CHAR', 1, 1);
  err('a = .5', 'LEX_UNEXPECTED_CHAR', 1, 5);
  err('a;', 'LEX_UNEXPECTED_CHAR', 1, 2);
  err('+1', 'LEX_UNEXPECTED_CHAR', 1, 1);
  err('\f', 'LEX_UNEXPECTED_CHAR', 1, 1);
  err("'a'", 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('số hợp lệ', () => {
  const v = (s) => ok(s)[0].value;
  assert.equal(v('0'), 0);
  assert.equal(v('123'), 123);
  assert.equal(v('-1.5e2'), -150);
  assert.equal(v('1E+2'), 100);
  assert.equal(v('0.5'), 0.5);
  assert.equal(v('1e-2'), 0.01);
  assert.ok(Object.is(v('-0'), 0));
  assert.ok(Object.is(v('-0.0'), 0));
  assert.ok(Object.is(v('-0e5'), 0));
  // số kết thúc ở ký tự không thuộc tập
  const t = ok('[1,2]');
  assert.deepEqual([t[1].value, t[3].value], [1, 2]);
});

test('LEX_BAD_NUMBER', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '-01', '1e+', '1_0', '1..2', '--1', '-.5', '-e1', '1.5.2', '00']) {
    err(`x = ${s}`, 'LEX_BAD_NUMBER', 1, 5);
  }
  err('a\n  -', 'LEX_BAD_NUMBER', 2, 3);
  err('1e999,', 'LEX_BAD_NUMBER', 1, 1);
});

test('chuỗi: văn bản thường và thoát', () => {
  assert.deepEqual(str('""'), []);
  assert.deepEqual(str('"a\\n\\t\\r\\"\\\\\\/\\$b"'), [{ type: 'Text', value: 'a\n\t\r"\\/$b' }]);
  assert.deepEqual(str('"\\u0041\\u00e9\\uD83D\\uDE00"'), [{ type: 'Text', value: 'Aé😀' }]);
  assert.deepEqual(str('"$ $x a$"'), [{ type: 'Text', value: '$ $x a$' }]);
  assert.deepEqual(str('"\\${a}"'), [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(str('"tiếng Việt"'), [{ type: 'Text', value: 'tiếng Việt' }]);
});

test('nội suy: Ref, vị trí, gộp Text', () => {
  assert.deepEqual(str('"${a}"'), [{ type: 'Ref', path: ['a'], const: false, line: 1, column: 2 }]);
  assert.deepEqual(str('"x${@r}y\\n${a.b.0.c-d.10}"'), [
    { type: 'Text', value: 'x' },
    { type: 'Ref', path: ['r'], const: true, line: 1, column: 3 },
    { type: 'Text', value: 'y\n' },
    { type: 'Ref', path: ['a', 'b', '0', 'c-d', '10'], const: false, line: 1, column: 11 },
  ]);
  assert.deepEqual(str('"${@l.1}"')[0].path, ['l', '1']);
  // Text liền kề (qua thoát) được gộp; không có Text rỗng
  assert.deepEqual(str('"a\\$b${x}${y}\\u0063"'), [
    { type: 'Text', value: 'a$b' },
    { type: 'Ref', path: ['x'], const: false, line: 1, column: 6 },
    { type: 'Ref', path: ['y'], const: false, line: 1, column: 10 },
    { type: 'Text', value: 'c' },
  ]);
  // vị trí Ref tính sau ký tự ngoài BMP và sau dòng mới
  assert.equal(ok('"😀${a}"')[0].value[1].column, 4);
  assert.equal(ok('\n\n  "${a}"')[0].value[0].line, 3);
  // từ khóa dùng được làm đoạn
  assert.deepEqual(str('"${true.null}"')[0].path, ['true', 'null']);
});

test('LEX_UNTERMINATED_STRING', () => {
  err('a = "abc', 'LEX_UNTERMINATED_STRING', 1, 5);
  err('a = "abc\nd"', 'LEX_UNTERMINATED_STRING', 1, 5);
  err('"abc\r', 'LEX_UNTERMINATED_STRING', 1, 1);
  err('"', 'LEX_UNTERMINATED_STRING', 1, 1);
  err('\n "$', 'LEX_UNTERMINATED_STRING', 2, 2);
});

test('LEX_BAD_ESCAPE', () => {
  err('"ab\\q"', 'LEX_BAD_ESCAPE', 1, 4);
  err('"\\u12"', 'LEX_BAD_ESCAPE', 1, 2);
  err('"\\u12G4"', 'LEX_BAD_ESCAPE', 1, 2);
  err('"\\u"', 'LEX_BAD_ESCAPE', 1, 2);
  err('"ab\\\ncd"', 'LEX_BAD_ESCAPE', 1, 4);
  err('"ab\\\r\ncd"', 'LEX_BAD_ESCAPE', 1, 4);
  err('"\\\'"', 'LEX_BAD_ESCAPE', 1, 2);
  err('"\\x41"', 'LEX_BAD_ESCAPE', 1, 2);
});

test('LEX_BAD_INTERPOLATION', () => {
  for (const s of ['${}', '${ a}', '${a }', '${1}', '${@1}', '${@}', '${a..b}', '${a.}', '${.a}', '${a.01}',
    '${a.-1}', '${a b}', '${@@a}', '${é}', '${a.b-}x}', '${-a}']) {
    // '${a.b-}x}' hợp lệ về dạng? "a.b-" là ident hợp lệ → bỏ khỏi nhóm lỗi
    if (s === '${a.b-}x}') continue;
    err(`x = "${s}"`, 'LEX_BAD_INTERPOLATION', 1, 6);
  }
  err('"ab${a', 'LEX_BAD_INTERPOLATION', 1, 4);
  err('"ab${a"', 'LEX_BAD_INTERPOLATION', 1, 4);
  err('"ab${a\nb}"', 'LEX_BAD_INTERPOLATION', 1, 4);
  err('"${', 'LEX_BAD_INTERPOLATION', 1, 2);
  err('"${a.b"}', 'LEX_BAD_INTERPOLATION', 1, 2);
  assert.equal(ok('"${a.0}"')[0].value[0].path[1], '0');
  assert.equal(ok('"${a.b-}"')[0].value[0].path[1], 'b-');
});

test('thứ tự lỗi: gặp trước báo trước', () => {
  // nội suy hỏng đứng trước chỗ chuỗi không đóng
  err('"${1} abc', 'LEX_BAD_INTERPOLATION', 1, 2);
  // thoát sai trước nội suy hỏng
  err('"\\q ${}', 'LEX_BAD_ESCAPE', 1, 2);
  // nội suy hỏng trước thoát sai
  err('"${} \\q', 'LEX_BAD_INTERPOLATION', 1, 2);
  // lỗi số trước lỗi chuỗi phía sau
  err('01 "abc', 'LEX_BAD_NUMBER', 1, 1);
  // ký tự lạ trước chú thích không đóng
  err('; /*', 'LEX_UNEXPECTED_CHAR', 1, 1);
  err('/* x', 'LEX_UNTERMINATED_COMMENT', 1, 1);
});

test('không bao giờ ném', () => {
  for (const s of ['', '\\', '"\\', '"\\u', '${', '$', '\uD800', '"\uD800"', '-', '/*', '\r', '"${@']) {
    assert.doesNotThrow(() => tokenize(s));
    const r = tokenize(s);
    assert.equal(typeof r.ok, 'boolean');
  }
  err('"\\', 'LEX_BAD_ESCAPE', 1, 2);
});

test('chương trình mẫu đầy đủ', () => {
  const src = [
    '# c', 'const region = "hn"', 'name = "app-${@region}"', 'tags = ["a", [1, 2],]',
    'server {', '  url = "http://${server.host}:${port}"', '}', 'include "common.cfg"',
  ].join('\n');
  const t = ok(src);
  assert.equal(t.at(-1).type, 'eof');
  assert.deepEqual([t.at(-1).line, t.at(-1).column], [8, 21]);
});
