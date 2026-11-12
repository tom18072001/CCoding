import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const err = (src, code, line, column) => {
  const r = parse(src);
  assert.equal(r.ok, false, src);
  assert.deepEqual([r.error.code, r.error.line, r.error.column], [code, line, column], src);
};
const ok = (src) => {
  const r = parse(src);
  assert.equal(r.ok, true, src);
  return r.ast;
};

test('AST chính xác cho mọi loại nút', () => {
  const ast = ok('const c = 1\na = "x${@c}y${b.0}"\nb { n = -2.5 t = true f = false z = null }\ninclude "p"\nl = [1, [], "s",]');
  assert.deepStrictEqual(ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', name: 'c', value: { type: 'Number', value: 1, line: 1, column: 11 }, line: 1, column: 1 },
      { type: 'Assign', key: 'a', line: 2, column: 1, value: { type: 'String', line: 2, column: 5, parts: [
        { type: 'Text', value: 'x' },
        { type: 'Ref', path: ['c'], const: true, line: 2, column: 7 },
        { type: 'Text', value: 'y' },
        { type: 'Ref', path: ['b', '0'], const: false, line: 2, column: 13 },
      ] } },
      { type: 'Block', key: 'b', line: 3, column: 1, body: [
        { type: 'Assign', key: 'n', line: 3, column: 5, value: { type: 'Number', value: -2.5, line: 3, column: 9 } },
        { type: 'Assign', key: 't', line: 3, column: 14, value: { type: 'Bool', value: true, line: 3, column: 18 } },
        { type: 'Assign', key: 'f', line: 3, column: 23, value: { type: 'Bool', value: false, line: 3, column: 27 } },
        { type: 'Assign', key: 'z', line: 3, column: 33, value: { type: 'Null', line: 3, column: 37 } },
      ] },
      { type: 'Include', path: 'p', line: 4, column: 1 },
      { type: 'Assign', key: 'l', line: 5, column: 1, value: { type: 'Array', line: 5, column: 5, items: [
        { type: 'Number', value: 1, line: 5, column: 6 },
        { type: 'Array', items: [], line: 5, column: 9 },
        { type: 'String', parts: [{ type: 'Text', value: 's' }], line: 5, column: 13 },
      ] } },
    ],
  });
});

test('tệp rỗng và include ""', () => {
  assert.deepStrictEqual(ok(''), { type: 'File', body: [], line: 1, column: 1 });
  assert.deepStrictEqual(ok('include ""').body[0], { type: 'Include', path: '', line: 1, column: 1 });
});

test('mảng: [,] [1,,2] lỗi; [] [1,] hợp lệ', () => {
  err('a = [,]', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  err('a = [1,,2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  ok('a = []');
  assert.equal(ok('a = [1,]').body[0].value.items.length, 1);
  err('a = [1', 'PARSE_UNEXPECTED_EOF', 1, 7);
  err('a = [1 2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
});

test('PARSE_UNEXPECTED_EOF', () => {
  err('a = ', 'PARSE_UNEXPECTED_EOF', 1, 5);
  err('a {', 'PARSE_UNEXPECTED_EOF', 1, 4);
  err('a', 'PARSE_UNEXPECTED_EOF', 1, 2);
  err('const', 'PARSE_UNEXPECTED_EOF', 1, 6);
  err('include', 'PARSE_UNEXPECTED_EOF', 1, 8);
  err('const x', 'PARSE_UNEXPECTED_EOF', 1, 8);
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  err('a b', 'PARSE_UNEXPECTED_TOKEN', 1, 3);
  err('}', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  err('a { }\n}', 'PARSE_UNEXPECTED_TOKEN', 2, 1);
  err('true = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  err('a = b', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  err('include 5', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  err('const 1 = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  err('const include = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  err('a = {', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  err('a = [b {}]', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
});

test('PARSE_BAD_INCLUDE', () => {
  err('x = 1\ninclude "a${b}"', 'PARSE_BAD_INCLUDE', 2, 9);
});

test('PARSE_CONST_NOT_TOP', () => {
  err('a {\n  const x = 1\n}', 'PARSE_CONST_NOT_TOP', 2, 3);
  err('a { b { const x = 1 } }', 'PARSE_CONST_NOT_TOP', 1, 9);
});

test('lỗi lexer được ưu tiên hơn lỗi parser', () => {
  err('a b\nc = "x', 'LEX_UNTERMINATED_STRING', 2, 5);
  err('} \n@', 'LEX_UNEXPECTED_CHAR', 2, 1);
});

test('ví dụ mục 9: dấu phẩy thừa', () => {
  const main = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }';
  err(main, 'PARSE_UNEXPECTED_TOKEN', 5, 29);
  const r = parseProject({ main }, 'main');
  assert.deepEqual([r.error.code, r.error.file, r.error.line, r.error.column], ['PARSE_UNEXPECTED_TOKEN', 'main', 5, 29]);
});

test('parseProject: entry không có', () => {
  const r = parseProject({ a: '' }, 'zz');
  assert.equal(r.ok, false);
  assert.deepEqual(r.error, { code: 'PARSE_ENTRY_NOT_FOUND', message: r.error.message, file: 'zz', line: 1, column: 1 });
});

test('parseProject: thứ tự files tiền thứ tự, include lồng, trong khối, bỏ qua tệp thiếu', () => {
  const files = {
    z: 'x = 1',
    main: 'include "a"\nblk { include "b"\n include "missing" }\ninclude "c"',
    a: 'include "a1"',
    a1: '',
    b: 'include "a1"\ninclude "main"',
    c: '',
    unused: 'syntax error here',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'a', 'a1', 'b', 'c']);
  assert.equal(r.program.files.main.type, 'File');
});

test('parseProject: hình thoi chỉ phân tích một lần, vòng không lặp vô hạn', () => {
  const r = parseProject({ a: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'include "a"' }, 'a');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b', 'd', 'c']);
});

test('parseProject: lỗi gắn file, lỗi của tệp gặp đầu tiên, lỗi lexer', () => {
  const r = parseProject({ m: 'include "x"\ninclude "y"', x: 'a = ', y: 'b = @' }, 'm');
  assert.equal(r.ok, false);
  assert.deepEqual([r.error.code, r.error.file, r.error.line, r.error.column], ['PARSE_UNEXPECTED_EOF', 'x', 1, 5]);
  const r2 = parseProject({ m: 'include "y"', y: '\n b = @' }, 'm');
  assert.deepEqual([r2.error.code, r2.error.file, r2.error.line, r2.error.column], ['LEX_UNEXPECTED_CHAR', 'y', 2, 6]);
  const r3 = parseProject({ m: 'a = 1 }\ninclude "y"', y: 'q' }, 'm');
  assert.equal(r3.error.file, 'm');
});
