import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const ast = (src) => {
  const r = parse(src);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.ast;
};
const perr = (src, code, line, column) => {
  const r = parse(src);
  assert.equal(r.ok, false);
  assert.deepEqual([r.error.code, r.error.line, r.error.column], [code, line, column]);
};

test('File rỗng và AST đúng hình dạng, không trường thừa', () => {
  assert.deepEqual(ast(''), { type: 'File', line: 1, column: 1, body: [] });
  assert.deepEqual(ast('  a = 1'), {
    type: 'File', line: 1, column: 1,
    body: [{ type: 'Assign', line: 1, column: 3, key: 'a', value: { type: 'Number', line: 1, column: 7, value: 1 } }],
  });
});

test('mọi loại giá trị', () => {
  const b = ast('a = [true, false, null, "x", [1,],]').body[0].value;
  assert.deepEqual(b.items.map((x) => x.type), ['Bool', 'Bool', 'Null', 'String', 'Array']);
  assert.deepEqual(b.items[2], { type: 'Null', line: 1, column: 19 });
  assert.equal(b.column, 5);
  assert.deepEqual(ast('a = []').body[0].value.items, []);
});

test('Block, Include, Const và vị trí', () => {
  const f = ast('const k = 1\ninclude "x.cfg"\ns {\n  include ""\n}');
  assert.deepEqual(f.body[0], { type: 'Const', line: 1, column: 1, name: 'k', value: { type: 'Number', line: 1, column: 11, value: 1 } });
  assert.deepEqual(f.body[1], { type: 'Include', line: 2, column: 1, path: 'x.cfg' });
  assert.equal(f.body[2].type, 'Block');
  assert.deepEqual(f.body[2].body[0], { type: 'Include', line: 4, column: 3, path: '' });
});

test('String parts có Ref với vị trí', () => {
  const v = ast('a = "x${@k.0}"').body[0].value;
  assert.deepEqual(v, {
    type: 'String', line: 1, column: 5,
    parts: [{ type: 'Text', value: 'x' }, { type: 'Ref', path: ['k', '0'], const: true, line: 1, column: 7 }],
  });
});

test('ví dụ mục 9: dấu phẩy thừa tại 5:29', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }      # x';
  perr(src, 'PARSE_UNEXPECTED_TOKEN', 5, 29);
});

test('PARSE_UNEXPECTED_EOF', () => {
  perr('a = ', 'PARSE_UNEXPECTED_EOF', 1, 5);
  perr('a {', 'PARSE_UNEXPECTED_EOF', 1, 4);
  perr('a = [1', 'PARSE_UNEXPECTED_EOF', 1, 7);
  perr('a', 'PARSE_UNEXPECTED_EOF', 1, 2);
  perr('include', 'PARSE_UNEXPECTED_EOF', 1, 8);
  perr('const x', 'PARSE_UNEXPECTED_EOF', 1, 8);
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  perr('}', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  perr('true = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  perr('a = b', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  perr('a b', 'PARSE_UNEXPECTED_TOKEN', 1, 3);
  perr('a = [,]', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  perr('a = [1,,2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  perr('a = [1 2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  perr('include 5', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  perr('const 1 = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  perr('const x 2', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  perr('a = { }', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  perr('a { b = 1 ] }', 'PARSE_UNEXPECTED_TOKEN', 1, 11);
});

test('PARSE_BAD_INCLUDE', () => {
  perr('include "a${b}"', 'PARSE_BAD_INCLUDE', 1, 9);
  perr('x {\n include "${@c}"\n}', 'PARSE_BAD_INCLUDE', 2, 10);
});

test('PARSE_CONST_NOT_TOP', () => {
  perr('a {\n  const x = 1\n}', 'PARSE_CONST_NOT_TOP', 2, 3);
  perr('a { const', 'PARSE_CONST_NOT_TOP', 1, 5);
});

test('lỗi lexer thắng lỗi cú pháp trước đó', () => {
  const r = parse('a = = \n b = ;');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'LEX_UNEXPECTED_CHAR');
  assert.deepEqual([r.error.line, r.error.column], [2, 6]);
});

test('parseProject: tiền thứ tự, include trong khối, chỉ tệp tới được', () => {
  const files = {
    z: 'x = 1',
    main: 'include "b"\nblk { include "c" }\ninclude "missing"\ninclude "b"',
    b: 'include "d"',
    c: 'v = 1',
    d: 'w = 1',
    unused: 'syntax error here',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'b', 'd', 'c']);
  assert.equal(r.program.files.main.type, 'File');
});

test('parseProject: include vòng không lặp vô hạn', () => {
  const r = parseProject({ a: 'include "b"', b: 'include "a"' }, 'a');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b']);
});

test('parseProject: lỗi kèm file, lỗi của tệp gặp đầu tiên', () => {
  const r = parseProject({ main: 'include "b"\ninclude "c"', b: 'x = ', c: 'y = ;' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'PARSE_UNEXPECTED_EOF');
  assert.equal(r.error.file, 'b');
  assert.deepEqual([r.error.line, r.error.column], [1, 5]);
  const r2 = parseProject({ main: 'a = ;' }, 'main');
  assert.deepEqual([r2.error.code, r2.error.file], ['LEX_UNEXPECTED_CHAR', 'main']);
});

test('parseProject: PARSE_ENTRY_NOT_FOUND', () => {
  const r = parseProject({ a: '' }, 'nope');
  assert.equal(r.ok, false);
  assert.deepEqual(
    { code: r.error.code, file: r.error.file, line: r.error.line, column: r.error.column },
    { code: 'PARSE_ENTRY_NOT_FOUND', file: 'nope', line: 1, column: 1 },
  );
  assert.equal(parseProject({}, 'toString').ok, false);
});
