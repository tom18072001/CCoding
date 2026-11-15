import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const ok = (src) => {
  const r = parse(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.ast;
};
const bad = (src) => {
  const r = parse(src);
  assert.equal(r.ok, false, `phải lỗi: ${JSON.stringify(src)}`);
  const { code, line, column } = r.error;
  return { code, line, column };
};

test('AST đủ loại nút, đúng trường và vị trí', () => {
  const ast = ok('a = 1\nb { c = "x" }\ninclude "f"\nconst k = [true, null, [], 2]');
  assert.deepEqual(ast, {
    type: 'File', line: 1, column: 1, body: [
      { type: 'Assign', key: 'a', line: 1, column: 1, value: { type: 'Number', value: 1, line: 1, column: 5 } },
      { type: 'Block', key: 'b', line: 2, column: 1, body: [
        { type: 'Assign', key: 'c', line: 2, column: 5, value: { type: 'String', line: 2, column: 9, parts: [{ type: 'Text', value: 'x' }] } },
      ] },
      { type: 'Include', path: 'f', line: 3, column: 1 },
      { type: 'Const', name: 'k', line: 4, column: 1, value: { type: 'Array', line: 4, column: 11, items: [
        { type: 'Bool', value: true, line: 4, column: 12 },
        { type: 'Null', line: 4, column: 18 },
        { type: 'Array', items: [], line: 4, column: 24 },
        { type: 'Number', value: 2, line: 4, column: 28 },
      ] } },
    ],
  });
});

test('File luôn ở 1:1 kể cả khi có chú thích đầu; tệp rỗng', () => {
  assert.deepEqual(ok('  # x\n  a = 1').body[0].line, 2);
  assert.deepEqual(ok(''), { type: 'File', body: [], line: 1, column: 1 });
  assert.deepEqual(ok('\n\n # x').line, 1);
});

test('Ref trong chuỗi giữ nguyên vị trí', () => {
  const ast = ok('a = "x${b.0}"');
  assert.deepEqual(ast.body[0].value.parts[1], { type: 'Ref', path: ['b', '0'], const: false, line: 1, column: 7 });
});

test('mảng: dấu phẩy cuối, rỗng, lỗi', () => {
  assert.equal(ok('a = []').body[0].value.items.length, 0);
  assert.equal(ok('a = [1,]').body[0].value.items.length, 1);
  assert.equal(ok('a = [[1,],[],]').body[0].value.items.length, 2);
  assert.deepEqual(bad('a = [,]'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 6 });
  assert.deepEqual(bad('a = [1,,2]'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 8 });
  assert.deepEqual(bad('a = [1 2]'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 8 });
  assert.deepEqual(bad('a = [1, 2'), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 10 });
  assert.deepEqual(bad('a = ['), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 6 });
  assert.deepEqual(bad('a = [{}]'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 6 });
});

test('PARSE_UNEXPECTED_EOF', () => {
  assert.deepEqual(bad('a ='), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 4 });
  assert.deepEqual(bad('a'), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 2 });
  assert.deepEqual(bad('a {\n b = 1\n'), { code: 'PARSE_UNEXPECTED_EOF', line: 3, column: 1 });
  assert.deepEqual(bad('include'), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 8 });
  assert.deepEqual(bad('const'), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 6 });
  assert.deepEqual(bad('const a'), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 8 });
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  assert.deepEqual(bad('}'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 1 });
  assert.deepEqual(bad('a { } }'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 7 });
  assert.deepEqual(bad('a b'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 3 });
  assert.deepEqual(bad('true = 1'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 1 });
  assert.deepEqual(bad('null { }'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 1 });
  assert.deepEqual(bad('a = b'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 5 });
  assert.deepEqual(bad('a = include'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 5 });
  assert.deepEqual(bad('= 1'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 1 });
  assert.deepEqual(bad('a = 1,'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 6 });
  assert.deepEqual(bad('const include = 1'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 7 });
  assert.deepEqual(bad('const a 1'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 9 });
  assert.deepEqual(bad('a [1]'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 3 });
});

test('ví dụ mục 9: dấu phẩy thừa ở dòng 5 cột 29', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }      # lỗi';
  assert.deepEqual(bad(src), { code: 'PARSE_UNEXPECTED_TOKEN', line: 5, column: 29 });
  assert.equal(parse(src.replace(' , }', ' }')).ok, true);
});

test('include: path, rỗng, nội suy, không phải chuỗi', () => {
  assert.equal(ok('include "a.cfg"').body[0].path, 'a.cfg');
  assert.equal(ok('include ""').body[0].path, '');
  assert.equal(ok('x { include "a\\nb" }').body[0].body[0].path, 'a\nb');
  assert.deepEqual(bad('include "a${b}"'), { code: 'PARSE_BAD_INCLUDE', line: 1, column: 9 });
  assert.deepEqual(bad('x {\n  include "${@a}"\n}'), { code: 'PARSE_BAD_INCLUDE', line: 2, column: 11 });
  assert.deepEqual(bad('include 5'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 9 });
  assert.deepEqual(bad('include a'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 9 });
  assert.equal(ok('include "\\${a}"').body[0].path, '${a}');
});

test('const chỉ ở cấp cao nhất', () => {
  assert.equal(ok('const a = 1').body[0].type, 'Const');
  assert.deepEqual(bad('x {\n  const a = 1\n}'), { code: 'PARSE_CONST_NOT_TOP', line: 2, column: 3 });
  assert.deepEqual(bad('x { y { const a = 1 } }'), { code: 'PARSE_CONST_NOT_TOP', line: 1, column: 9 });
  assert.deepEqual(bad('x { const = }'), { code: 'PARSE_CONST_NOT_TOP', line: 1, column: 5 });
  assert.equal(bad('x { a b const c = 1 }').code, 'PARSE_UNEXPECTED_TOKEN');
});

test('lỗi lexer ưu tiên hơn lỗi cú pháp', () => {
  assert.deepEqual(bad('a b\nc = 01'), { code: 'LEX_BAD_NUMBER', line: 2, column: 5 });
  assert.deepEqual(bad('}\n"abc'), { code: 'LEX_UNTERMINATED_STRING', line: 2, column: 1 });
  assert.deepEqual(bad('x { const a = 1 }\n$'), { code: 'LEX_UNEXPECTED_CHAR', line: 2, column: 1 });
  assert.deepEqual(bad('include "${a}"\n"${}"'), { code: 'LEX_BAD_INTERPOLATION', line: 2, column: 2 });
});

test('BOM, \\r\\n, \\r và cột UTF-16 trong AST', () => {
  const ast = ok('﻿a = 1\r\nb = "😀" c = 2\rd = 3');
  assert.deepEqual(ast.body.map((s) => [s.line, s.column]), [[1, 1], [2, 1], [2, 10], [3, 1]]);
  assert.deepEqual(bad('a = 1\r\nb ='), { code: 'PARSE_UNEXPECTED_EOF', line: 2, column: 4 });
  assert.deepEqual(bad('a = 1\rb\r'), { code: 'PARSE_UNEXPECTED_EOF', line: 3, column: 1 });
});

test('parseProject: duyệt sâu tiền thứ tự, kể cả include trong khối', () => {
  const files = {
    main: 'include "a"\nx { include "c" }\ninclude "b"',
    a: 'include "d"',
    b: 'y = 1',
    c: 'include "d"\nz = 1',
    d: 'w = 1',
    unused: 'a = = =',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'a', 'd', 'c', 'b']);
  assert.equal(r.program.files.main.type, 'File');
});

test('parseProject: bỏ qua include thiếu, vòng, chính nó', () => {
  const r = parseProject({ m: 'include "nope"\ninclude "m"\ninclude "n"', n: 'include "m"' }, 'm');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['m', 'n']);
});

test('parseProject: lỗi có file, tệp đầu tiên theo thứ tự thăm, dừng ngay', () => {
  const files = { m: 'include "a"\ninclude "b"', a: 'x = 1\ny = ', b: 'z = 01' };
  const r = parseProject(files, 'm');
  assert.equal(r.ok, false);
  assert.deepEqual(
    { code: r.error.code, file: r.error.file, line: r.error.line, column: r.error.column },
    { code: 'PARSE_UNEXPECTED_EOF', file: 'a', line: 2, column: 5 });
  assert.equal(typeof r.error.message, 'string');
  const r2 = parseProject({ m: 'a = = 1', x: '' }, 'm');
  assert.equal(r2.error.file, 'm');
  assert.equal(r2.error.code, 'PARSE_UNEXPECTED_TOKEN');
  const r3 = parseProject({ m: 'include "b"', b: '"abc' }, 'm');
  assert.deepEqual([r3.error.code, r3.error.file], ['LEX_UNTERMINATED_STRING', 'b']);
});

test('parseProject: PARSE_ENTRY_NOT_FOUND tại 1:1', () => {
  const r = parseProject({ a: '' }, 'zz');
  assert.equal(r.ok, false);
  assert.deepEqual(
    { code: r.error.code, file: r.error.file, line: r.error.line, column: r.error.column },
    { code: 'PARSE_ENTRY_NOT_FOUND', file: 'zz', line: 1, column: 1 });
  assert.equal(parseProject({}, 'toString').ok, false);
});
