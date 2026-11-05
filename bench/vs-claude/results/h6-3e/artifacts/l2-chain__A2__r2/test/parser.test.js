import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const perr = (s) => { const r = parse(s); assert.equal(r.ok, false, s); return [r.error.code, r.error.line, r.error.column]; };

test('AST đầy đủ', () => {
  const r = parse('const c = 1\na = [1, "x",]\nb { include "f" }');
  assert.deepEqual(r.ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', name: 'c', line: 1, column: 1, value: { type: 'Number', value: 1, line: 1, column: 11 } },
      { type: 'Assign', key: 'a', line: 2, column: 1, value: { type: 'Array', line: 2, column: 5, items: [
        { type: 'Number', value: 1, line: 2, column: 6 },
        { type: 'String', parts: [{ type: 'Text', value: 'x' }], line: 2, column: 9 },
      ] } },
      { type: 'Block', key: 'b', line: 3, column: 1, body: [{ type: 'Include', path: 'f', line: 3, column: 5 }] },
    ],
  });
});

test('lỗi cú pháp', () => {
  assert.deepEqual(perr('a = '), ['PARSE_UNEXPECTED_EOF', 1, 5]);
  assert.deepEqual(perr('a {'), ['PARSE_UNEXPECTED_EOF', 1, 4]);
  assert.deepEqual(perr('}'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(perr('a b'), ['PARSE_UNEXPECTED_TOKEN', 1, 3]);
  assert.deepEqual(perr('true = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(perr('a = b'), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(perr('a = [,]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(perr('a = [1,,2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(perr('a { const x = 1 }'), ['PARSE_CONST_NOT_TOP', 1, 5]);
  assert.deepEqual(perr('include "a${b}"'), ['PARSE_BAD_INCLUDE', 1, 9]);
  assert.deepEqual(perr('include 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  assert.deepEqual(perr('include'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.equal(parse('include ""').ast.body[0].path, '');
  assert.equal(parse('a = []').ok && parse('a = [1,]').ok, true);
});

test('lỗi lexer thắng lỗi cú pháp', () => {
  assert.equal(parse('} \n a = 01').error.code, 'LEX_BAD_NUMBER');
});

test('ví dụ dấu phẩy thừa', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }';
  const r = parse(src);
  assert.deepEqual([r.error.code, r.error.line, r.error.column], ['PARSE_UNEXPECTED_TOKEN', 5, 29]);
});

test('parseProject: tiền thứ tự, bỏ qua thiếu, lỗi có file', () => {
  const files = { m: 'a { include "x" } include "y"', x: 'include "z"', y: 'b = 1', z: 'c = 1', unused: '}' };
  const r = parseProject(files, 'm');
  assert.deepEqual(Object.keys(r.program.files), ['m', 'x', 'z', 'y']);
  assert.equal(parseProject({ m: 'include "nope"' }, 'm').ok, true);
  const e = parseProject({ m: 'include "x"\ninclude "y"', x: 'a = ', y: '}' }, 'm');
  assert.deepEqual([e.error.code, e.error.file, e.error.line, e.error.column], ['PARSE_UNEXPECTED_EOF', 'x', 1, 5]);
  const n = parseProject({}, 'm');
  assert.deepEqual(n.error, { code: 'PARSE_ENTRY_NOT_FOUND', message: n.error.message, file: 'm', line: 1, column: 1 });
});
