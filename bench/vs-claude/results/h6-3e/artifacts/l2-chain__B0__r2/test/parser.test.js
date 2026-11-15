import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const perr = (s) => { const r = parse(s); assert.equal(r.ok, false, s); return r.error; };

test('AST đầy đủ', () => {
  const r = parse('const r = "x"\na = [1, [true],]\nb { c = null }\ninclude "f"\nd = "t${@r}"');
  assert.equal(r.ok, true);
  assert.deepEqual(r.ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', name: 'r', line: 1, column: 1, value: { type: 'String', line: 1, column: 11, parts: [{ type: 'Text', value: 'x' }] } },
      { type: 'Assign', key: 'a', line: 2, column: 1, value: { type: 'Array', line: 2, column: 5, items: [
        { type: 'Number', value: 1, line: 2, column: 6 },
        { type: 'Array', line: 2, column: 9, items: [{ type: 'Bool', value: true, line: 2, column: 10 }] },
      ] } },
      { type: 'Block', key: 'b', line: 3, column: 1, body: [{ type: 'Assign', key: 'c', line: 3, column: 5, value: { type: 'Null', line: 3, column: 9 } }] },
      { type: 'Include', path: 'f', line: 4, column: 1 },
      { type: 'Assign', key: 'd', line: 5, column: 1, value: { type: 'String', line: 5, column: 5, parts: [
        { type: 'Text', value: 't' },
        { type: 'Ref', path: ['r'], const: true, line: 5, column: 7 },
      ] } },
    ],
  });
});

test('mã lỗi cú pháp và vị trí', () => {
  const cases = [
    ['a = ', 'PARSE_UNEXPECTED_EOF', 1, 5],
    ['a {', 'PARSE_UNEXPECTED_EOF', 1, 4],
    ['a = [1', 'PARSE_UNEXPECTED_EOF', 1, 7],
    ['a', 'PARSE_UNEXPECTED_EOF', 1, 2],
    ['}', 'PARSE_UNEXPECTED_TOKEN', 1, 1],
    ['a b', 'PARSE_UNEXPECTED_TOKEN', 1, 3],
    ['true = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1],
    ['a = b', 'PARSE_UNEXPECTED_TOKEN', 1, 5],
    ['a = [,]', 'PARSE_UNEXPECTED_TOKEN', 1, 6],
    ['a = [1,,2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8],
    ['include 5', 'PARSE_UNEXPECTED_TOKEN', 1, 9],
    ['include', 'PARSE_UNEXPECTED_EOF', 1, 8],
    ['include "a${b}"', 'PARSE_BAD_INCLUDE', 1, 9],
    ['a { const x = 1 }', 'PARSE_CONST_NOT_TOP', 1, 5],
  ];
  for (const [src, code, line, column] of cases) {
    const e = perr(src);
    assert.deepEqual([e.code, e.line, e.column], [code, line, column], src);
  }
});

test('[] và [1,] hợp lệ; include rỗng', () => {
  assert.equal(parse('a = []\nb = [1,]\ninclude ""').ok, true);
  assert.equal(parse('include "a"').ast.body[0].path, 'a');
});

test('lexer chạy trọn vẹn trước parser', () => {
  assert.equal(perr('a b\nc = 01').code, 'LEX_BAD_NUMBER');
});

test('ví dụ spec: dấu phẩy thừa', () => {
  const e = perr('const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }');
  assert.deepEqual([e.code, e.line, e.column], ['PARSE_UNEXPECTED_TOKEN', 5, 29]);
});

test('parseProject: tiền thứ tự, bỏ qua thiếu, lỗi có file', () => {
  const files = {
    main: 'include "b"\nx { include "c" }\ninclude "zz"',
    b: 'include "d"',
    c: '',
    d: '',
    unused: 'a = = =',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['main', 'b', 'd', 'c']);
  assert.equal(r.program.entry, 'main');
  const bad = parseProject({ main: 'include "b"\ninclude "c"', b: 'a = ', c: 'a b' }, 'main');
  assert.deepEqual([bad.error.code, bad.error.file, bad.error.line, bad.error.column], ['PARSE_UNEXPECTED_EOF', 'b', 1, 5]);
  const nf = parseProject({}, 'm');
  assert.deepEqual([nf.error.code, nf.error.file, nf.error.line, nf.error.column], ['PARSE_ENTRY_NOT_FOUND', 'm', 1, 1]);
});

test('parseProject: include vòng không lặp vô hạn', () => {
  const r = parseProject({ a: 'include "b"', b: 'include "a"' }, 'a');
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b']);
});

test('parseProject: tên tệp __proto__ là khóa thường', () => {
  const files = { main: 'include "__proto__"' };
  Object.defineProperty(files, '__proto__', { value: 'a = 1', enumerable: true, configurable: true, writable: true });
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['main', '__proto__']);
});
