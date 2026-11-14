import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const perr = (src) => {
  const r = parse(src);
  assert.equal(r.ok, false);
  return [r.error.code, r.error.line, r.error.column];
};

test('AST đầy đủ', () => {
  const r = parse('const r = "x"\na = [1, [true],]\nb { c = null }\ninclude "f"');
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
    ],
  });
});

test('include chuỗi rỗng; mảng rỗng', () => {
  assert.equal(parse('include ""').ast.body[0].path, '');
  assert.deepEqual(parse('a = []').ast.body[0].value.items, []);
});

test('lỗi cú pháp', () => {
  assert.deepEqual(perr('a ='), ['PARSE_UNEXPECTED_EOF', 1, 4]);
  assert.deepEqual(perr('a {'), ['PARSE_UNEXPECTED_EOF', 1, 4]);
  assert.deepEqual(perr('a = [1'), ['PARSE_UNEXPECTED_EOF', 1, 7]);
  assert.deepEqual(perr('}'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(perr('a b'), ['PARSE_UNEXPECTED_TOKEN', 1, 3]);
  assert.deepEqual(perr('a = b'), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(perr('true = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(perr('a = [,]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(perr('a = [1,,2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(perr('a = [1 2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(perr('a = { }'), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(perr('include 5'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  assert.deepEqual(perr('include'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.deepEqual(perr('include "${a}"'), ['PARSE_BAD_INCLUDE', 1, 9]);
  assert.deepEqual(perr('a { const x = 1 }'), ['PARSE_CONST_NOT_TOP', 1, 5]);
  assert.deepEqual(perr('const = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 7]);
});

test('lỗi lexer ưu tiên hơn lỗi cú pháp', () => {
  assert.equal(parse('} \n a = 01').error.code, 'LEX_BAD_NUMBER');
});

test('parseProject: tiền thứ tự, bỏ qua tệp thiếu và tệp không tới được', () => {
  const files = {
    main: 'include "b"\nx { include "c" }\ninclude "zzz"\ninclude "d"',
    d: 'include "main"',
    c: 'a = 1',
    b: 'include "c"',
    orphan: '!!!',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['main', 'b', 'c', 'd']);
  assert.equal(r.program.entry, 'main');
});

test('parseProject: lỗi đầu tiên theo thứ tự thăm', () => {
  const files = { main: 'include "b"\ninclude "c"', b: 'a = ', c: 'a = 01' };
  const r = parseProject(files, 'main');
  assert.deepEqual([r.error.code, r.error.file, r.error.line, r.error.column], ['PARSE_UNEXPECTED_EOF', 'b', 1, 5]);
  const r2 = parseProject({ main: 'a = 1' }, 'nope');
  assert.deepEqual(r2.error, { code: 'PARSE_ENTRY_NOT_FOUND', message: r2.error.message, file: 'nope', line: 1, column: 1 });
});
