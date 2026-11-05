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
  assert.deepEqual([r.error.code, r.error.line, r.error.column], [code, line, column], JSON.stringify(src));
};

test('AST đầy đủ, đúng hình dạng và không trường thừa', () => {
  const ast = ok('const r = "hn"\nname = "a${@r}b"\nt = [1, true, null, [false],]\ns { x = 2 }\ninclude "c.cfg"');
  assert.deepEqual(ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', line: 1, column: 1, name: 'r', value: { type: 'String', line: 1, column: 11, parts: [{ type: 'Text', value: 'hn' }] } },
      {
        type: 'Assign', line: 2, column: 1, key: 'name',
        value: {
          type: 'String', line: 2, column: 8,
          parts: [
            { type: 'Text', value: 'a' },
            { type: 'Ref', path: ['r'], const: true, line: 2, column: 10 },
            { type: 'Text', value: 'b' },
          ],
        },
      },
      {
        type: 'Assign', line: 3, column: 1, key: 't',
        value: {
          type: 'Array', line: 3, column: 5,
          items: [
            { type: 'Number', line: 3, column: 6, value: 1 },
            { type: 'Bool', line: 3, column: 9, value: true },
            { type: 'Null', line: 3, column: 15 },
            { type: 'Array', line: 3, column: 21, items: [{ type: 'Bool', line: 3, column: 22, value: false }] },
          ],
        },
      },
      {
        type: 'Block', line: 4, column: 1, key: 's',
        body: [{ type: 'Assign', line: 4, column: 5, key: 'x', value: { type: 'Number', line: 4, column: 9, value: 2 } }],
      },
      { type: 'Include', line: 5, column: 1, path: 'c.cfg' },
    ],
  });
});

test('file rỗng, include rỗng, mảng rỗng', () => {
  assert.deepEqual(ok(''), { type: 'File', line: 1, column: 1, body: [] });
  assert.equal(ok('include ""').body[0].path, '');
  assert.deepEqual(ok('a = []').body[0].value.items, []);
  assert.equal(ok('a = [1,]').body[0].value.items.length, 1);
  assert.deepEqual(ok('a = ""').body[0].value.parts, []);
});

test('BOM và \\r\\n ảnh hưởng vị trí', () => {
  const ast = ok('﻿a = 1\r\nb = 2');
  assert.deepEqual([ast.body[0].line, ast.body[0].column], [1, 1]);
  assert.deepEqual([ast.body[1].line, ast.body[1].column], [2, 1]);
});

test('PARSE_UNEXPECTED_EOF', () => {
  at('a = ', 'PARSE_UNEXPECTED_EOF', 1, 5);
  at('a {\n b = 1', 'PARSE_UNEXPECTED_EOF', 2, 7);
  at('a = [1,', 'PARSE_UNEXPECTED_EOF', 1, 8);
  at('a', 'PARSE_UNEXPECTED_EOF', 1, 2);
  at('include', 'PARSE_UNEXPECTED_EOF', 1, 8);
  at('const', 'PARSE_UNEXPECTED_EOF', 1, 6);
  at('const a', 'PARSE_UNEXPECTED_EOF', 1, 8);
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  at('}', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('a b', 'PARSE_UNEXPECTED_TOKEN', 1, 3);
  at('true = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('a = b', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at('a = include', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at('[1]', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('a = [,]', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  at('a = [1,,2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at('a = [1 2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at('include 5', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at('const 1 = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  at('const true = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  at('const a { }', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at('a { b = 1 }}', 'PARSE_UNEXPECTED_TOKEN', 1, 12);
  at('a = [{ }]', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  at('a = 1,', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
});

test('PARSE_BAD_INCLUDE', () => {
  at('x = 1\n  include "a${b}"', 'PARSE_BAD_INCLUDE', 2, 11);
  at('a { include "${@c}" }', 'PARSE_BAD_INCLUDE', 1, 13);
});

test('PARSE_CONST_NOT_TOP', () => {
  at('a {\n  const x = 1\n}', 'PARSE_CONST_NOT_TOP', 2, 3);
  at('a { b { const', 'PARSE_CONST_NOT_TOP', 1, 9);
});

test('lỗi lexer thắng lỗi cú pháp trước đó', () => {
  at('a = = \n b = 01', 'LEX_BAD_NUMBER', 2, 6);
  at('} "abc', 'LEX_UNTERMINATED_STRING', 1, 3);
});

test('ví dụ trong spec: lỗi dòng 5 cột 29', () => {
  const main = [
    'const env = "prod"',
    'name = "svc-${@env}"',
    'ports = [80, 443]',
    'http { port = "${ports.0}" }',
    'https { port = "${ports.1}" , }      # lỗi',
  ].join('\n');
  at(main, 'PARSE_UNEXPECTED_TOKEN', 5, 29);
  const fixed = main.replace(' , }', ' }');
  assert.equal(parse(fixed).ok, true);
});

test('parseProject: thứ tự khóa là tiền thứ tự, kể cả include trong khối', () => {
  const files = {
    main: 'a { include "b" }\ninclude "c"\ninclude "missing"',
    b: 'include "d"',
    c: 'include "d"\ninclude "main"',
    d: 'x = 1',
    unused: 'y = 2',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'b', 'd', 'c']);
  assert.equal(r.program.files.d.type, 'File');
});

test('parseProject: include tự tham chiếu / vòng không lặp vô hạn', () => {
  const r = parseProject({ a: 'include "a"\ninclude "b"', b: 'include "a"' }, 'a');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b']);
});

test('parseProject: lỗi có file, dừng ở tệp đầu tiên', () => {
  const r = parseProject({ main: 'include "b"\ninclude "c"', b: 'x = ', c: 'y = 01' }, 'main');
  assert.equal(r.ok, false);
  assert.deepEqual(
    [r.error.code, r.error.file, r.error.line, r.error.column],
    ['PARSE_UNEXPECTED_EOF', 'b', 1, 5],
  );
  const r2 = parseProject({ main: 'a = 01' }, 'main');
  assert.deepEqual([r2.error.code, r2.error.file, r2.error.line, r2.error.column], ['LEX_BAD_NUMBER', 'main', 1, 5]);
  // tệp không tới được thì không bị phân tích
  assert.equal(parseProject({ main: 'a = 1', bad: '=' }, 'main').ok, true);
});

test('parseProject: PARSE_ENTRY_NOT_FOUND', () => {
  const r = parseProject({ a: '' }, 'zz');
  assert.equal(r.ok, false);
  assert.deepEqual(
    [r.error.code, r.error.file, r.error.line, r.error.column],
    ['PARSE_ENTRY_NOT_FOUND', 'zz', 1, 1],
  );
});
