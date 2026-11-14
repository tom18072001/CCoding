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
  assert.equal(r.ok, false, src);
  assert.deepEqual([r.error.code, r.error.line, r.error.column], [code, line, column], src);
};

test('AST đầy đủ, không có trường thừa', () => {
  const ast = ok('const c = 1\na = "x${b}"\nb { n = null\n t = true }\ninclude "f"\nl = [1, [2],]');
  assert.deepEqual(ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', line: 1, column: 1, name: 'c', value: { type: 'Number', line: 1, column: 11, value: 1 } },
      {
        type: 'Assign', line: 2, column: 1, key: 'a',
        value: {
          type: 'String', line: 2, column: 5,
          parts: [
            { type: 'Text', value: 'x' },
            { type: 'Ref', path: ['b'], const: false, line: 2, column: 7 },
          ],
        },
      },
      {
        type: 'Block', line: 3, column: 1, key: 'b',
        body: [
          { type: 'Assign', line: 3, column: 5, key: 'n', value: { type: 'Null', line: 3, column: 9 } },
          { type: 'Assign', line: 4, column: 2, key: 't', value: { type: 'Bool', line: 4, column: 6, value: true } },
        ],
      },
      { type: 'Include', line: 5, column: 1, path: 'f' },
      {
        type: 'Assign', line: 6, column: 1, key: 'l',
        value: {
          type: 'Array', line: 6, column: 5,
          items: [
            { type: 'Number', line: 6, column: 6, value: 1 },
            { type: 'Array', line: 6, column: 9, items: [{ type: 'Number', line: 6, column: 10, value: 2 }] },
          ],
        },
      },
    ],
  });
});

test('mảng rỗng, dấu phẩy cuối, include rỗng', () => {
  ok('a = []\nb = [1,]');
  assert.equal(ok('include ""').body[0].path, '');
});

test('PARSE_UNEXPECTED_EOF', () => {
  at('a = ', 'PARSE_UNEXPECTED_EOF', 1, 5);
  at('a {\n b = 1', 'PARSE_UNEXPECTED_EOF', 2, 7);
  at('a = [1,', 'PARSE_UNEXPECTED_EOF', 1, 8);
  at('a', 'PARSE_UNEXPECTED_EOF', 1, 2);
  at('include', 'PARSE_UNEXPECTED_EOF', 1, 8);
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  at('a b', 'PARSE_UNEXPECTED_TOKEN', 1, 3);
  at('}', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('a = 1 }', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  at('true = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('a = b', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at('a = [,]', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  at('a = [1,,2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at('a = [1 2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at('include 5', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at('a { b { } ', 'PARSE_UNEXPECTED_EOF', 1, 11);
});

test('PARSE_BAD_INCLUDE', () => {
  at('a = 1\ninclude "x${y}"', 'PARSE_BAD_INCLUDE', 2, 9);
});

test('PARSE_CONST_NOT_TOP', () => {
  at('a {\n  const x = 1\n}', 'PARSE_CONST_NOT_TOP', 2, 3);
});

test('lỗi lexer được ưu tiên hơn lỗi cú pháp', () => {
  at('a b\nc = 01', 'LEX_BAD_NUMBER', 2, 5);
});

test('ví dụ mục 9: dấu phẩy thừa tại 5:29', () => {
  const src = [
    'const env = "prod"',
    'name = "svc-${@env}"',
    'ports = [80, 443]',
    'http { port = "${ports.0}" }',
    'https { port = "${ports.1}" , }      # lỗi',
  ].join('\n');
  at(src, 'PARSE_UNEXPECTED_TOKEN', 5, 29);
});

test('parseProject: tiền thứ tự, include trong khối, bỏ qua tệp thiếu/không tới được', () => {
  const files = {
    z: 'x { include "b" }\ninclude "missing"\ninclude "c"',
    c: 'include "d"',
    b: 'include "c"',
    d: 'k = 1',
    unused: 'a b c',
  };
  const r = parseProject(files, 'z');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'z');
  assert.deepEqual(Object.keys(r.program.files), ['z', 'b', 'c', 'd']);
});

test('parseProject: include vòng không lặp vô hạn', () => {
  const r = parseProject({ a: 'include "b"', b: 'include "a"' }, 'a');
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b']);
});

test('parseProject: lỗi kèm file, dừng ở lỗi đầu tiên', () => {
  const r = parseProject({ a: 'include "b"\ninclude "c"', b: 'x = ', c: 'y = }' }, 'a');
  assert.equal(r.ok, false);
  assert.deepEqual(r.error, { ...r.error, code: 'PARSE_UNEXPECTED_EOF', file: 'b', line: 1, column: 5 });
  const r2 = parseProject({ a: 'x = "\\q"' }, 'a');
  assert.equal(r2.error.code, 'LEX_BAD_ESCAPE');
  assert.equal(r2.error.file, 'a');
});

test('parseProject: PARSE_ENTRY_NOT_FOUND', () => {
  const r = parseProject({ a: '' }, 'nope');
  assert.equal(r.ok, false);
  assert.deepEqual(
    [r.error.code, r.error.file, r.error.line, r.error.column],
    ['PARSE_ENTRY_NOT_FOUND', 'nope', 1, 1],
  );
});
