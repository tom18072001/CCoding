import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const perr = (src) => { const r = parse(src); assert.equal(r.ok, false); return [r.error.code, r.error.line, r.error.column]; };

test('AST đầy đủ', () => {
  const r = parse('const c = 1\na = [1, "x${y}", [null,], true]\nb { include "f" }');
  assert.equal(r.ok, true);
  assert.deepEqual(r.ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', line: 1, column: 1, name: 'c', value: { type: 'Number', line: 1, column: 11, value: 1 } },
      { type: 'Assign', line: 2, column: 1, key: 'a', value: { type: 'Array', line: 2, column: 5, items: [
        { type: 'Number', line: 2, column: 6, value: 1 },
        { type: 'String', line: 2, column: 9, parts: [
          { type: 'Text', value: 'x' },
          { type: 'Ref', path: ['y'], const: false, line: 2, column: 11 },
        ] },
        { type: 'Array', line: 2, column: 18, items: [{ type: 'Null', line: 2, column: 19 }] },
        { type: 'Bool', line: 2, column: 27, value: true },
      ] } },
      { type: 'Block', line: 3, column: 1, key: 'b', body: [{ type: 'Include', line: 3, column: 5, path: 'f' }] },
    ],
  });
  assert.deepEqual(parse('').ast, { type: 'File', line: 1, column: 1, body: [] });
});

test('lỗi cú pháp', () => {
  assert.deepEqual(perr('a = '), ['PARSE_UNEXPECTED_EOF', 1, 5]);
  assert.deepEqual(perr('a {'), ['PARSE_UNEXPECTED_EOF', 1, 4]);
  assert.deepEqual(perr('a = [1,'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.deepEqual(perr('}'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(perr('a b'), ['PARSE_UNEXPECTED_TOKEN', 1, 3]);
  assert.deepEqual(perr('true = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(perr('a = b'), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.equal(perr('a = [,]')[0], 'PARSE_UNEXPECTED_TOKEN');
  assert.equal(perr('a = [1,,2]')[0], 'PARSE_UNEXPECTED_TOKEN');
  assert.deepEqual(perr('include "a${b}"'), ['PARSE_BAD_INCLUDE', 1, 9]);
  assert.equal(perr('include 3')[0], 'PARSE_UNEXPECTED_TOKEN');
  assert.deepEqual(perr('include'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.deepEqual(perr('a {\n  const x = 1\n}'), ['PARSE_CONST_NOT_TOP', 2, 3]);
  assert.equal(parse('a = [] b = [1,]').ok, true);
  assert.equal(parse('include ""').ast.body[0].path, '');
});

test('lexer chạy trọn vẹn trước parser', () => {
  assert.equal(parse('a b\nc = "x').error.code, 'LEX_UNTERMINATED_STRING');
});

test('parseProject: tiền thứ tự, bỏ qua tệp thiếu, lỗi có file', () => {
  const files = { m: 'include "a"\nx { include "b" }\ninclude "zz"', a: 'include "c"', b: '', c: '', unused: '}' };
  const r = parseProject(files, 'm');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['m', 'a', 'c', 'b']);
  assert.equal(r.program.entry, 'm');
  const bad = parseProject({ m: 'include "a"\ninclude "b"', a: 'x = ', b: '}' }, 'm');
  assert.deepEqual(bad.error, { ...bad.error, code: 'PARSE_UNEXPECTED_EOF', file: 'a', line: 1, column: 5 });
  const nf = parseProject({}, 'm');
  assert.deepEqual(nf.error, { code: 'PARSE_ENTRY_NOT_FOUND', message: nf.error.message, file: 'm', line: 1, column: 1 });
  assert.equal(parseProject({ m: 'include "m"' }, 'm').ok, true);
});
