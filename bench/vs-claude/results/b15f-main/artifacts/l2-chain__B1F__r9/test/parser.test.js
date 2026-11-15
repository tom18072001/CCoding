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
  assert.equal(r.ok, false, `đáng lẽ lỗi: ${JSON.stringify(src)}`);
  assert.deepEqual([r.error.code, r.error.line, r.error.column], [code, line, column], JSON.stringify(src));
};

test('AST: hình dạng đầy đủ, không trường thừa', () => {
  const ast = ok('a = 1\nb { c = "x${y}" }\ninclude "f"\nconst k = [true, null, "s"]');
  assert.deepEqual(ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Assign', line: 1, column: 1, key: 'a', value: { type: 'Number', line: 1, column: 5, value: 1 } },
      {
        type: 'Block', line: 2, column: 1, key: 'b',
        body: [{
          type: 'Assign', line: 2, column: 5, key: 'c',
          value: {
            type: 'String', line: 2, column: 9,
            parts: [
              { type: 'Text', value: 'x' },
              { type: 'Ref', path: ['y'], const: false, line: 2, column: 11 },
            ],
          },
        }],
      },
      { type: 'Include', line: 3, column: 1, path: 'f' },
      {
        type: 'Const', line: 4, column: 1, name: 'k',
        value: {
          type: 'Array', line: 4, column: 11,
          items: [
            { type: 'Bool', line: 4, column: 12, value: true },
            { type: 'Null', line: 4, column: 18 },
            { type: 'String', line: 4, column: 24, parts: [{ type: 'Text', value: 's' }] },
          ],
        },
      },
    ],
  });
});

test('tệp rỗng và chỉ có chú thích', () => {
  assert.deepEqual(ok(''), { type: 'File', line: 1, column: 1, body: [] });
  assert.deepEqual(ok('# x'), { type: 'File', line: 1, column: 1, body: [] });
});

test('chuỗi rỗng có parts []; include path rỗng được phép', () => {
  assert.deepEqual(ok('a = ""').body[0].value.parts, []);
  assert.equal(ok('include ""').body[0].path, '');
  assert.equal(ok('include "a\\"b"').body[0].path, 'a"b');
});

test('mảng: lồng nhau, dấu phẩy cuối, rỗng', () => {
  const v = ok('a = [1, [2,], [],]').body[0].value;
  assert.equal(v.items.length, 3);
  assert.equal(v.items[1].items.length, 1);
  assert.equal(v.items[2].items.length, 0);
  at('a = [,]', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  at('a = [1,,2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at('a = [1 2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at('a = [{}]', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
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
  assert.equal(parse(src.replace(' , }', ' }')).ok, true);
});

test('PARSE_UNEXPECTED_EOF tại token eof', () => {
  at('a = ', 'PARSE_UNEXPECTED_EOF', 1, 5);
  at('a', 'PARSE_UNEXPECTED_EOF', 1, 2);
  at('a {\n  b = 1\n', 'PARSE_UNEXPECTED_EOF', 3, 1);
  at('a = [1,', 'PARSE_UNEXPECTED_EOF', 1, 8);
  at('const', 'PARSE_UNEXPECTED_EOF', 1, 6);
  at('const x', 'PARSE_UNEXPECTED_EOF', 1, 8);
  at('include', 'PARSE_UNEXPECTED_EOF', 1, 8);
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  at('}', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('a b', 'PARSE_UNEXPECTED_TOKEN', 1, 3);
  at('true = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('include = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at('a = b', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at('a = include', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at('1 = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('"s" = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('a = =', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at('include a', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at('const 1 = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  at('const x 2', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at('const true = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  at('a { b }', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  at('a { ] }', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at('a = 1 }', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
});

test('PARSE_BAD_INCLUDE tại vị trí chuỗi', () => {
  at('include "a${b}"', 'PARSE_BAD_INCLUDE', 1, 9);
  at('x {\n  include "${@c}"\n}', 'PARSE_BAD_INCLUDE', 2, 11);
});

test('PARSE_CONST_NOT_TOP kể cả khi phần sau hợp lệ', () => {
  at('a {\n  const x = 1\n}', 'PARSE_CONST_NOT_TOP', 2, 3);
  at('a { b { const x = 1 } }', 'PARSE_CONST_NOT_TOP', 1, 9);
  assert.equal(parse('const x = 1\na { b = 1 }').ok, true);
});

test('include trong khối hợp lệ', () => {
  const ast = ok('a {\n include "f"\n}');
  assert.equal(ast.body[0].body[0].type, 'Include');
});

test('lỗi lexer được ưu tiên hơn lỗi cú pháp', () => {
  at('a = = \n b = @', 'LEX_UNEXPECTED_CHAR', 2, 6);
  at('} "abc', 'LEX_UNTERMINATED_STRING', 1, 3);
});

test('CRLF và BOM trong vị trí AST', () => {
  const ast = ok('﻿a = 1\r\nb = 2\rc = 3');
  assert.deepEqual(ast.body.map((s) => [s.line, s.column]), [[1, 1], [2, 1], [3, 1]]);
  at('a = 1\r\nb = ,', 'PARSE_UNEXPECTED_TOKEN', 2, 5);
});

// ---------- parseProject ----------

test('parseProject: thứ tự tiền thứ tự kiểu hình thoi', () => {
  const files = {
    d: 'x = 1',
    c: 'include "d"',
    b: 'include "d"',
    a: 'include "b"\nblk { include "c" }',
    unused: 'x = ',
  };
  const r = parseProject(files, 'a');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'a');
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b', 'd', 'c']);
  assert.equal(r.program.files.a.type, 'File');
});

test('parseProject: include trong khối theo thứ tự tài liệu', () => {
  const files = {
    main: 'blk { include "z" }\ninclude "y"',
    y: '',
    z: '',
  };
  assert.deepEqual(Object.keys(parseProject(files, 'main').program.files), ['main', 'z', 'y']);
});

test('parseProject: bỏ qua đường dẫn thiếu, vòng không treo', () => {
  const files = { a: 'include "nope"\ninclude "b"', b: 'include "a"\ninclude "b"' };
  const r = parseProject(files, 'a');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b']);
});

test('parseProject: lỗi có file, tệp lỗi đầu tiên theo thứ tự duyệt', () => {
  const files = { a: 'include "b"\ninclude "c"', b: 'x = 1\ny = ', c: 'z = @' };
  const r = parseProject(files, 'a');
  assert.equal(r.ok, false);
  assert.deepEqual(
    [r.error.code, r.error.file, r.error.line, r.error.column],
    ['PARSE_UNEXPECTED_EOF', 'b', 2, 5],
  );
  const r2 = parseProject({ a: 'q = @' }, 'a');
  assert.deepEqual([r2.error.code, r2.error.file, r2.error.line, r2.error.column], ['LEX_UNEXPECTED_CHAR', 'a', 1, 5]);
});

test('parseProject: tệp entry lỗi thì không đọc include của nó', () => {
  const r = parseProject({ a: 'include "b"\n}', b: 'x = ' }, 'a');
  assert.equal(r.error.file, 'a');
  assert.equal(r.error.code, 'PARSE_UNEXPECTED_TOKEN');
});

test('parseProject: PARSE_ENTRY_NOT_FOUND', () => {
  const r = parseProject({ a: '' }, 'zz');
  assert.equal(r.ok, false);
  assert.deepEqual(
    [r.error.code, r.error.file, r.error.line, r.error.column],
    ['PARSE_ENTRY_NOT_FOUND', 'zz', 1, 1],
  );
});
