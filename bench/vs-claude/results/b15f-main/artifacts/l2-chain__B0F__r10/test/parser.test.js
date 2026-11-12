import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const ok = (src) => {
  const r = parse(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.ast;
};
const at = (src, code, line, column) => {
  const r = parse(src);
  assert.equal(r.ok, false, `phải lỗi: ${JSON.stringify(src)}`);
  assert.deepEqual({ code: r.error.code, line: r.error.line, column: r.error.column }, { code, line, column });
};

test('AST đủ các loại nút, đúng hình dạng', () => {
  const ast = ok('const c = 1\na = "x${@c}"\nb { n = null  t = true }\ninclude "f"\nl = [1, [false],]');
  assert.deepEqual(ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', name: 'c', value: { type: 'Number', value: 1, line: 1, column: 11 }, line: 1, column: 1 },
      { type: 'Assign', key: 'a', line: 2, column: 1, value: { type: 'String', line: 2, column: 5, parts: [
        { type: 'Text', value: 'x' },
        { type: 'Ref', path: ['c'], const: true, line: 2, column: 7 },
      ] } },
      { type: 'Block', key: 'b', line: 3, column: 1, body: [
        { type: 'Assign', key: 'n', line: 3, column: 5, value: { type: 'Null', line: 3, column: 9 } },
        { type: 'Assign', key: 't', line: 3, column: 15, value: { type: 'Bool', value: true, line: 3, column: 19 } },
      ] },
      { type: 'Include', path: 'f', line: 4, column: 1 },
      { type: 'Assign', key: 'l', line: 5, column: 1, value: { type: 'Array', line: 5, column: 5, items: [
        { type: 'Number', value: 1, line: 5, column: 6 },
        { type: 'Array', line: 5, column: 9, items: [{ type: 'Bool', value: false, line: 5, column: 10 }] },
      ] } },
    ],
  });
});

test('mảng rỗng, phẩy cuối, chuỗi rỗng, include rỗng', () => {
  const ast = ok('a = []\nb = [1,]\nc = ""\ninclude ""');
  assert.deepEqual(ast.body[0].value.items, []);
  assert.equal(ast.body[1].value.items.length, 1);
  assert.deepEqual(ast.body[2].value.parts, []);
  assert.equal(ast.body[3].path, '');
});

test('file rỗng', () => {
  assert.deepEqual(ok(''), { type: 'File', body: [], line: 1, column: 1 });
});

test('ví dụ mục 9: dấu phẩy thừa → 5:29', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }      # lỗi';
  at(src, 'PARSE_UNEXPECTED_TOKEN', 5, 29);
});

test('PARSE_UNEXPECTED_EOF', () => {
  at('a = ', 'PARSE_UNEXPECTED_EOF', 1, 5);
  at('a {\n b = 1', 'PARSE_UNEXPECTED_EOF', 2, 7);
  at('a = [1,', 'PARSE_UNEXPECTED_EOF', 1, 8);
  at('a', 'PARSE_UNEXPECTED_EOF', 1, 2);
  at('include', 'PARSE_UNEXPECTED_EOF', 1, 8);
  at('const x', 'PARSE_UNEXPECTED_EOF', 1, 8);
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  at('a = [,]', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  at('a = [1,,2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at('a b', 'PARSE_UNEXPECTED_TOKEN', 1, 3);
  at('}', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('a { }\n}', 'PARSE_UNEXPECTED_TOKEN', 2, 1);
  at('true = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('a = b', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at('a = [1 2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at('include 5', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at('a = { }', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
});

test('PARSE_BAD_INCLUDE', () => {
  at('x = 1\ninclude "a${b}"', 'PARSE_BAD_INCLUDE', 2, 9);
});

test('PARSE_CONST_NOT_TOP', () => {
  at('a {\n  const x = 1\n}', 'PARSE_CONST_NOT_TOP', 2, 3);
});

test('lexer chạy trọn vẹn trước: lỗi lexer thắng lỗi cú pháp', () => {
  at('a = = \n b = "x\n', 'LEX_UNTERMINATED_STRING', 2, 6);
});

test('parse không ném', () => {
  for (const s of ['{', '"', 'a = [', 'const', '﻿']) assert.doesNotThrow(() => parse(s));
});

test('parseProject: tiền thứ tự, include trong khối, bỏ qua path thiếu', () => {
  const files = {
    main: 'include "a"\nblk { include "missing"\n include "b" }\ninclude "c"',
    c: 'x = 1', b: 'include "d"', a: 'include "c"', d: 'y = 1', unused: '= bad',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program), ['entry', 'files']);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'a', 'c', 'b', 'd']);
});

test('parseProject: vòng include không lặp vô hạn', () => {
  const r = parseProject({ a: 'include "b"', b: 'include "a"' }, 'a');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b']);
});

test('parseProject: lỗi có file, dừng ở tệp gặp đầu tiên', () => {
  const r = parseProject({ main: 'include "b"\ninclude "c"', b: 'x = [,]', c: 'y = "' }, 'main');
  assert.equal(r.ok, false);
  assert.deepEqual({ code: r.error.code, file: r.error.file, line: r.error.line, column: r.error.column },
    { code: 'PARSE_UNEXPECTED_TOKEN', file: 'b', line: 1, column: 6 });
  const l = parseProject({ main: 'a = "' }, 'main');
  assert.equal(l.error.file, 'main');
  assert.equal(l.error.code, 'LEX_UNTERMINATED_STRING');
});

test('parseProject: PARSE_ENTRY_NOT_FOUND', () => {
  const r = parseProject({ a: '' }, 'zzz');
  assert.equal(r.ok, false);
  assert.deepEqual({ code: r.error.code, file: r.error.file, line: r.error.line, column: r.error.column },
    { code: 'PARSE_ENTRY_NOT_FOUND', file: 'zzz', line: 1, column: 1 });
});
