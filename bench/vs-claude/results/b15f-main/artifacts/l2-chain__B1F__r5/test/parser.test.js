import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const ok = (src) => {
  const r = parse(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.ast;
};
const bad = (src, code, line, column) => {
  const r = parse(src);
  assert.equal(r.ok, false, `đợi lỗi cho ${JSON.stringify(src)}`);
  assert.equal(r.error.code, code);
  assert.equal(r.error.line, line);
  assert.equal(r.error.column, column);
};

test('AST đầy đủ, không trường thừa', () => {
  const ast = ok('const r = "x"\na = [1, null]\nb {\n  c = true\n}\ninclude "f.cfg"');
  assert.deepEqual(ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', name: 'r', line: 1, column: 1,
        value: { type: 'String', line: 1, column: 11, parts: [{ type: 'Text', value: 'x' }] } },
      { type: 'Assign', key: 'a', line: 2, column: 1,
        value: { type: 'Array', line: 2, column: 5, items: [
          { type: 'Number', value: 1, line: 2, column: 6 },
          { type: 'Null', line: 2, column: 9 },
        ] } },
      { type: 'Block', key: 'b', line: 3, column: 1, body: [
        { type: 'Assign', key: 'c', line: 4, column: 3, value: { type: 'Bool', value: true, line: 4, column: 7 } },
      ] },
      { type: 'Include', path: 'f.cfg', line: 6, column: 1 },
    ],
  });
});

test('File rỗng và chỉ chú thích', () => {
  assert.deepEqual(ok(''), { type: 'File', body: [], line: 1, column: 1 });
  assert.deepEqual(ok('\n\n# x').body, []);
});

test('Ref trong chuỗi giữ path/const/vị trí', () => {
  const ast = ok('a = "x${@r.1}"');
  assert.deepEqual(ast.body[0].value.parts[1], { type: 'Ref', path: ['r', '1'], const: true, line: 1, column: 7 });
});

test('mảng: dấu phẩy cuối, rỗng, lồng', () => {
  assert.equal(ok('a = []').body[0].value.items.length, 0);
  assert.equal(ok('a = [1,]').body[0].value.items.length, 1);
  assert.equal(ok('a = [[1,2,],[],"x",]').body[0].value.items.length, 3);
  bad('a = [,]', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  bad('a = [1,,2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  bad('a = [1 2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  bad('a = [1', 'PARSE_UNEXPECTED_EOF', 1, 7);
  bad('a = [b {}]', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
});

test('PARSE_UNEXPECTED_EOF', () => {
  bad('a = ', 'PARSE_UNEXPECTED_EOF', 1, 5);
  bad('a', 'PARSE_UNEXPECTED_EOF', 1, 2);
  bad('a {\n b = 1', 'PARSE_UNEXPECTED_EOF', 2, 7);
  bad('include', 'PARSE_UNEXPECTED_EOF', 1, 8);
  bad('const', 'PARSE_UNEXPECTED_EOF', 1, 6);
  bad('const a', 'PARSE_UNEXPECTED_EOF', 1, 8);
  bad('const a =', 'PARSE_UNEXPECTED_EOF', 1, 10);
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  bad('}', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  bad('a = 1 }', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  bad('a b', 'PARSE_UNEXPECTED_TOKEN', 1, 3);
  bad('true = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  bad('a = b', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  bad('a = include', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  bad('= 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  bad('1', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  bad('"x"', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  bad('include 5', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  bad('include a', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  bad('const 1 = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  bad('const include = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  bad('const a 2', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  bad('a { b = 1 ,}', 'PARSE_UNEXPECTED_TOKEN', 1, 11);
  bad('a = 1,', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
});

test('PARSE_BAD_INCLUDE', () => {
  bad('include "a${b}"', 'PARSE_BAD_INCLUDE', 1, 9);
  bad('x {\n  include "${@c}"\n}', 'PARSE_BAD_INCLUDE', 2, 11);
});

test('include: path nối Text, rỗng được phép, trong khối', () => {
  assert.equal(ok('include "a\\$b"').body[0].path, 'a$b');
  assert.equal(ok('include ""').body[0].path, '');
  const ast = ok('x {\n  include "f"\n}');
  assert.deepEqual(ast.body[0].body[0], { type: 'Include', path: 'f', line: 2, column: 3 });
});

test('PARSE_CONST_NOT_TOP', () => {
  bad('a {\n  const x = 1\n}', 'PARSE_CONST_NOT_TOP', 2, 3);
  bad('a { b { const 1 } }', 'PARSE_CONST_NOT_TOP', 1, 9);
  ok('const x = 1\nconst y = [1]');
});

test('lexer chạy trọn vẹn trước: lỗi lexer thắng lỗi cú pháp', () => {
  bad('a = = \nb = 01', 'LEX_BAD_NUMBER', 2, 5);
  bad('}\n"abc', 'LEX_UNTERMINATED_STRING', 2, 1);
});

test('ví dụ mục 9', () => {
  const main = [
    'const env = "prod"',
    'name = "svc-${@env}"',
    'ports = [80, 443]',
    'http { port = "${ports.0}" }',
    'https { port = "${ports.1}" , }      # lỗi',
  ].join('\n');
  bad(main, 'PARSE_UNEXPECTED_TOKEN', 5, 29);
  const fixed = main.replace(' , }', ' }');
  assert.equal(parse(fixed).ok, true);
});

test('parse không ném với đầu vào lạ', () => {
  for (const s of ['', '﻿', '{', '"', 'a = [[[[', 'const']) assert.doesNotThrow(() => parse(s));
});

test('parseProject: một tệp', () => {
  const r = parseProject({ main: 'a = 1' }, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main']);
  assert.equal(r.program.files.main.type, 'File');
});

test('parseProject: thứ tự tiền thứ tự, kể cả include trong khối, chỉ tệp tới được', () => {
  const files = {
    z: 'x = 1', // không tới được
    main: 'include "b"\nk { include "c" }\ninclude "missing"\ninclude "e"',
    b: 'include "d"',
    c: 'include "b"',
    d: 'd = 1',
    e: 'include "main"',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['main', 'b', 'd', 'c', 'e']);
});

test('parseProject: hình thoi chỉ phân tích một lần', () => {
  const files = { a: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'v = 1' };
  const r = parseProject(files, 'a');
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b', 'd', 'c']);
});

test('parseProject: lỗi kèm file, dừng ở lỗi đầu tiên theo thứ tự', () => {
  const files = { main: 'include "b"\ninclude "c"', b: 'x = =', c: 'y = 01' };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'PARSE_UNEXPECTED_TOKEN');
  assert.equal(r.error.file, 'b');
  assert.equal(r.error.line, 1);
  assert.equal(r.error.column, 5);
  const r2 = parseProject({ main: 'a = 1\nb = ' }, 'main');
  assert.deepEqual([r2.error.code, r2.error.file, r2.error.line, r2.error.column], ['PARSE_UNEXPECTED_EOF', 'main', 2, 5]);
  const r3 = parseProject({ main: 'include "b"\n}', b: '"' }, 'main');
  assert.equal(r3.error.code, 'PARSE_UNEXPECTED_TOKEN');
  assert.equal(r3.error.file, 'main');
});

test('parseProject: lỗi lexer có file', () => {
  const r = parseProject({ main: 'a = "x', }, 'main');
  assert.deepEqual([r.ok, r.error.code, r.error.file, r.error.line, r.error.column], [false, 'LEX_UNTERMINATED_STRING', 'main', 1, 5]);
});

test('parseProject: tệp không tới được có lỗi thì bị bỏ qua', () => {
  const r = parseProject({ main: 'a = 1', bad: '}' }, 'main');
  assert.equal(r.ok, true);
});

test('parseProject: entry không có', () => {
  const r = parseProject({ a: '' }, 'main');
  assert.equal(r.ok, false);
  assert.deepEqual(
    [r.error.code, r.error.file, r.error.line, r.error.column],
    ['PARSE_ENTRY_NOT_FOUND', 'main', 1, 1],
  );
});
