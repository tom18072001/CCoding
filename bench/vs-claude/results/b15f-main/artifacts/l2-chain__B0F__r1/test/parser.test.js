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
  assert.equal(r.ok, false, `mong lỗi cho ${JSON.stringify(src)}`);
  return r.error;
};
const at = (e, code, line, column) => assert.deepEqual([e.code, e.line, e.column], [code, line, column]);
const keys = (o) => Object.keys(o);

test('hợp đồng AST: tập khóa của từng loại nút', () => {
  const ast = ok('const c = 1\ninclude "x"\na = 1\nb { }\nn = null\nt = true\ns = "p${a}q"\nl = [1]');
  assert.deepEqual(keys(ast), ['type', 'body', 'line', 'column']);
  assert.deepEqual([ast.line, ast.column], [1, 1]);
  const [c, inc, a, b, n, t, s, l] = ast.body;
  assert.deepEqual(keys(c), ['type', 'name', 'value', 'line', 'column']);
  assert.deepEqual(keys(inc), ['type', 'path', 'line', 'column']);
  assert.deepEqual(keys(a), ['type', 'key', 'value', 'line', 'column']);
  assert.deepEqual(keys(b), ['type', 'key', 'body', 'line', 'column']);
  assert.deepEqual(keys(c.value), ['type', 'value', 'line', 'column']);
  assert.equal(c.value.type, 'Number');
  assert.deepEqual(keys(n.value), ['type', 'line', 'column']);
  assert.equal(n.value.type, 'Null');
  assert.deepEqual(keys(t.value), ['type', 'value', 'line', 'column']);
  assert.equal(t.value.type, 'Bool');
  assert.deepEqual(keys(s.value), ['type', 'parts', 'line', 'column']);
  assert.deepEqual(keys(s.value.parts[0]), ['type', 'value']);
  assert.deepEqual(keys(s.value.parts[1]), ['type', 'path', 'const', 'line', 'column']);
  assert.deepEqual(keys(l.value), ['type', 'items', 'line', 'column']);
});

test('vị trí nút', () => {
  const ast = ok('a {\n  b = [1, "x"]\n}\ninclude "f"\nconst k = false');
  const [blk, inc, cst] = ast.body;
  assert.deepEqual([blk.line, blk.column], [1, 1]);
  const asg = blk.body[0];
  assert.deepEqual([asg.line, asg.column], [2, 3]);
  assert.deepEqual([asg.value.line, asg.value.column], [2, 7]);
  assert.deepEqual([asg.value.items[1].line, asg.value.items[1].column], [2, 11]);
  assert.deepEqual([inc.line, inc.column], [4, 1]);
  assert.deepEqual([cst.line, cst.column, cst.value.line, cst.value.column], [5, 1, 5, 11]);
});

test('giá trị: Number/Bool/Null/String/Array lồng', () => {
  const ast = ok('a = [[1, -0], [], [true, null,],]\nb = ""\nc = "x${@k.1}"');
  assert.deepEqual(ast.body[0].value.items[0].items.map((x) => x.value), [1, 0]);
  assert.equal(ast.body[0].value.items[1].items.length, 0);
  assert.equal(ast.body[0].value.items[2].items[1].type, 'Null');
  assert.deepEqual(ast.body[1].value.parts, []);
  assert.deepEqual(ast.body[2].value.parts[1], { type: 'Ref', path: ['k', '1'], const: true, line: 3, column: 7 });
});

test('Include.path, kể cả rỗng và có thoát', () => {
  const ast = ok('include ""\ninclude "a\\/b"');
  assert.equal(ast.body[0].path, '');
  assert.equal(ast.body[1].path, 'a/b');
});

test('tệp rỗng và chỉ chú thích', () => {
  assert.deepEqual(ok('').body, []);
  assert.deepEqual(ok('# x').body, []);
});

test('PARSE_UNEXPECTED_EOF', () => {
  at(err('a = '), 'PARSE_UNEXPECTED_EOF', 1, 5);
  at(err('a {\n b = 1'), 'PARSE_UNEXPECTED_EOF', 2, 7);
  at(err('a = [1, 2'), 'PARSE_UNEXPECTED_EOF', 1, 10);
  at(err('a'), 'PARSE_UNEXPECTED_EOF', 1, 2);
  at(err('include'), 'PARSE_UNEXPECTED_EOF', 1, 8);
  at(err('const x'), 'PARSE_UNEXPECTED_EOF', 1, 8);
  at(err('const'), 'PARSE_UNEXPECTED_EOF', 1, 6);
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  at(err('a b'), 'PARSE_UNEXPECTED_TOKEN', 1, 3);
  at(err('}'), 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at(err('true = 1'), 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at(err('a = b'), 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at(err('a = [,]'), 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  at(err('a = [1,,2]'), 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at(err('a = [1 2]'), 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at(err('a = 1 , b = 2'), 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  at(err('include 5'), 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at(err('const include = 1'), 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  at(err('const a 1'), 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at(err('a { b = 1 ]'), 'PARSE_UNEXPECTED_TOKEN', 1, 11);
  at(err('a = {}'), 'PARSE_UNEXPECTED_TOKEN', 1, 5);
});

test('PARSE_BAD_INCLUDE', () => {
  at(err('x = 1\ninclude "a${b}"'), 'PARSE_BAD_INCLUDE', 2, 9);
});

test('PARSE_CONST_NOT_TOP', () => {
  at(err('a {\n  const x = 1\n}'), 'PARSE_CONST_NOT_TOP', 2, 3);
});

test('lexer lỗi thắng lỗi cú pháp đứng trước', () => {
  at(err('a b\n c = @'), 'LEX_UNEXPECTED_CHAR', 2, 6);
});

test('ví dụ mục 9: lỗi tại 5:29 rồi sửa được', () => {
  const main = [
    'const env = "prod"',
    'name = "svc-${@env}"',
    'ports = [80, 443]',
    'http { port = "${ports.0}" }',
    'https { port = "${ports.1}" , }      # lỗi',
  ].join('\n');
  at(err(main), 'PARSE_UNEXPECTED_TOKEN', 5, 29);
  const r = parseProject({ main }, 'main');
  assert.equal(r.ok, false);
  assert.deepEqual([r.error.file, r.error.line, r.error.column], ['main', 5, 29]);
  assert.equal(parse(main.replace(' ,', '')).ok, true);
});

test('parseProject: thứ tự tệp tiền thứ tự, kể cả include trong khối', () => {
  const files = {
    z: 'x = 1',
    main: 'include "a"\nblk { include "b"\n }\ninclude "c"\ninclude "missing"',
    a: 'include "d"',
    b: 'include "d"\ninclude "a"',
    c: '',
    d: 'include "main"',
    unused: 'x = ',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'a', 'd', 'b', 'c']);
  assert.equal(r.program.files.main.type, 'File');
});

test('parseProject: include trước khối theo thứ tự tài liệu', () => {
  const files = { main: 'g { include "g1" }\ninclude "h"', g1: '', h: '' };
  const r = parseProject(files, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'g1', 'h']);
});

test('parseProject: lỗi có file, dừng ở tệp gặp đầu tiên', () => {
  const files = { main: 'include "a"\ninclude "b"', a: 'x = 1\ny = ', b: 'z = @' };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.error.file, 'a');
  at(r.error, 'PARSE_UNEXPECTED_EOF', 2, 5);
  assert.deepEqual(Object.keys(r.error).sort(), ['code', 'column', 'file', 'line', 'message']);
});

test('parseProject: lỗi lexer ở tệp entry', () => {
  const r = parseProject({ m: '"abc' }, 'm');
  assert.equal(r.error.file, 'm');
  at(r.error, 'LEX_UNTERMINATED_STRING', 1, 1);
});

test('parseProject: PARSE_ENTRY_NOT_FOUND', () => {
  const r = parseProject({ a: '' }, 'main');
  assert.equal(r.ok, false);
  assert.equal(r.error.file, 'main');
  at(r.error, 'PARSE_ENTRY_NOT_FOUND', 1, 1);
  assert.equal(parseProject({}, 'toString').ok, false);
});
