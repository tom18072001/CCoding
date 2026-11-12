import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const ok = (src) => {
  const r = parse(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.ast;
};
const err = (src) => {
  const r = parse(src);
  assert.equal(r.ok, false, `phải lỗi: ${JSON.stringify(src)}`);
  const { code, line, column } = r.error;
  return { code, line, column };
};

test('AST đủ các nút, không trường thừa', () => {
  const ast = ok('const c = 1\na = [true, null, [], "x${@c}"]\nb {\n  include "f"\n  k = -2\n}');
  assert.deepEqual(ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', line: 1, column: 1, name: 'c', value: { type: 'Number', line: 1, column: 11, value: 1 } },
      {
        type: 'Assign', line: 2, column: 1, key: 'a',
        value: {
          type: 'Array', line: 2, column: 5,
          items: [
            { type: 'Bool', line: 2, column: 6, value: true },
            { type: 'Null', line: 2, column: 12 },
            { type: 'Array', line: 2, column: 18, items: [] },
            {
              type: 'String', line: 2, column: 22,
              parts: [
                { type: 'Text', value: 'x' },
                { type: 'Ref', path: ['c'], const: true, line: 2, column: 24 },
              ],
            },
          ],
        },
      },
      {
        type: 'Block', line: 3, column: 1, key: 'b',
        body: [
          { type: 'Include', line: 4, column: 3, path: 'f' },
          { type: 'Assign', line: 5, column: 3, key: 'k', value: { type: 'Number', line: 5, column: 7, value: -2 } },
        ],
      },
    ],
  });
});

test('mảng: dấu phẩy cuối được, [,] và [1,,2] lỗi', () => {
  ok('a = []');
  ok('a = [1,]');
  ok('a = [[1,],]');
  assert.deepEqual(err('a = [,]'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 6 });
  assert.deepEqual(err('a = [1,,2]'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 8 });
  assert.deepEqual(err('a = [1 2]'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 8 });
});

test('include: chuỗi rỗng, nội suy, không phải chuỗi', () => {
  assert.equal(ok('include ""').body[0].path, '');
  assert.equal(ok('include "a\\"b"').body[0].path, 'a"b');
  assert.deepEqual(err('x = 1\ninclude "a${b}"'), { code: 'PARSE_BAD_INCLUDE', line: 2, column: 9 });
  assert.deepEqual(err('include 5'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 9 });
  assert.deepEqual(err('include'), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 8 });
});

test('PARSE_CONST_NOT_TOP', () => {
  assert.deepEqual(err('a {\n  const x = 1\n}'), { code: 'PARSE_CONST_NOT_TOP', line: 2, column: 3 });
  assert.deepEqual(err('a { b { const'), { code: 'PARSE_CONST_NOT_TOP', line: 1, column: 9 });
});

test('PARSE_UNEXPECTED_EOF', () => {
  assert.deepEqual(err('a = '), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 5 });
  assert.deepEqual(err('a {\n b = 1\n'), { code: 'PARSE_UNEXPECTED_EOF', line: 3, column: 1 });
  assert.deepEqual(err('a = [1,'), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 8 });
  assert.deepEqual(err('a'), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 2 });
  assert.deepEqual(err('const x'), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 8 });
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  assert.deepEqual(err('}'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 1 });
  assert.deepEqual(err('a b'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 3 });
  assert.deepEqual(err('true = 1'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 1 });
  assert.deepEqual(err('a = b'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 5 });
  assert.deepEqual(err('const include = 1'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 7 });
  assert.deepEqual(err('a { } }'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 7 });
  assert.deepEqual(err('1 = 2'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 1 });
});

test('lỗi lexer thắng lỗi cú pháp xuất hiện trước', () => {
  const r = parse('a b\nc = @');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'LEX_UNEXPECTED_CHAR');
  assert.deepEqual([r.error.line, r.error.column], [2, 5]);
});

test('BOM và \\r\\n trong parse', () => {
  const ast = ok('﻿a = 1\r\nb = 2');
  assert.deepEqual([ast.body[0].line, ast.body[0].column], [1, 1]);
  assert.deepEqual([ast.body[1].line, ast.body[1].column], [2, 1]);
  assert.deepEqual(err('﻿a = 1\r\nb = '), { code: 'PARSE_UNEXPECTED_EOF', line: 2, column: 5 });
});

test('ví dụ mục 9: lỗi tại 5:29, bản sửa parse được', () => {
  const main = [
    'const env = "prod"',
    'name = "svc-${@env}"',
    'ports = [80, 443]',
    'http { port = "${ports.0}" }',
    'https { port = "${ports.1}" , }      # lỗi: dấu phẩy thừa',
  ].join('\n');
  assert.deepEqual(err(main), { code: 'PARSE_UNEXPECTED_TOKEN', line: 5, column: 29 });
  ok(main.replace(' , }', ' }'));
});

test('parseProject: thành công, thứ tự khóa tiền thứ tự (hình thoi)', () => {
  const files = {
    d: 'x = 1',
    c: 'include "d"',
    b: 'include "d"\ny = 2',
    a: 'include "b"\nblk { include "c" }\ninclude "nope"\ninclude "b"',
    unused: 'a = ',
  };
  const r = parseProject(files, 'a');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'a');
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b', 'd', 'c']);
  assert.equal(r.program.files.a.type, 'File');
});

test('parseProject: include trong khối được duyệt theo thứ tự tài liệu', () => {
  const files = { m: 'k { include "z" }\ninclude "y"', y: '', z: '' };
  assert.deepEqual(Object.keys(parseProject(files, 'm').program.files), ['m', 'z', 'y']);
});

test('parseProject: include vòng không lặp vô hạn', () => {
  const r = parseProject({ a: 'include "b"', b: 'include "a"' }, 'a');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b']);
});

test('parseProject: lỗi kèm tên file, dừng ở tệp đầu tiên', () => {
  const files = { a: 'include "b"\ninclude "c"', b: 'x = ', c: 'y = @' };
  const r = parseProject(files, 'a');
  assert.equal(r.ok, false);
  assert.equal(r.error.file, 'b');
  assert.equal(r.error.code, 'PARSE_UNEXPECTED_EOF');
  assert.deepEqual([r.error.line, r.error.column], [1, 5]);
  const r2 = parseProject({ a: 'a = 1\n  @' }, 'a');
  assert.equal(r2.error.file, 'a');
  assert.equal(r2.error.code, 'LEX_UNEXPECTED_CHAR');
  assert.deepEqual([r2.error.line, r2.error.column], [2, 3]);
});

test('parseProject: PARSE_ENTRY_NOT_FOUND tại 1:1', () => {
  const r = parseProject({ a: '' }, 'zz');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'PARSE_ENTRY_NOT_FOUND');
  assert.equal(r.error.file, 'zz');
  assert.deepEqual([r.error.line, r.error.column], [1, 1]);
  assert.equal(parseProject({}, 'toString').ok, false);
});
