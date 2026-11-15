import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const perr = (s) => {
  const r = parse(s);
  assert.equal(r.ok, false, s);
  return [r.error.code, r.error.line, r.error.column];
};

test('AST đủ loại nút', () => {
  const r = parse('const c = "x"\na = [1, [true], null,]\nb { include "f" s = "p${@c}" }');
  assert.equal(r.ok, true);
  assert.deepEqual(r.ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', line: 1, column: 1, name: 'c', value: { type: 'String', line: 1, column: 11, parts: [{ type: 'Text', value: 'x' }] } },
      {
        type: 'Assign', line: 2, column: 1, key: 'a',
        value: {
          type: 'Array', line: 2, column: 5,
          items: [
            { type: 'Number', line: 2, column: 6, value: 1 },
            { type: 'Array', line: 2, column: 9, items: [{ type: 'Bool', line: 2, column: 10, value: true }] },
            { type: 'Null', line: 2, column: 17 },
          ],
        },
      },
      {
        type: 'Block', line: 3, column: 1, key: 'b',
        body: [
          { type: 'Include', line: 3, column: 5, path: 'f' },
          {
            type: 'Assign', line: 3, column: 17, key: 's',
            value: {
              type: 'String', line: 3, column: 21,
              parts: [{ type: 'Text', value: 'p' }, { type: 'Ref', path: ['c'], const: true, line: 3, column: 23 }],
            },
          },
        ],
      },
    ],
  });
});

test('mảng rỗng, dấu phẩy cuối, include rỗng', () => {
  assert.equal(parse('a = []').ok, true);
  assert.equal(parse('a = [1,]').ok, true);
  assert.equal(parse('include ""').ast.body[0].path, '');
});

test('lỗi cú pháp', () => {
  assert.deepEqual(perr('a = [,]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(perr('a = [1,,2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(perr('a = '), ['PARSE_UNEXPECTED_EOF', 1, 5]);
  assert.deepEqual(perr('a {\n b = 1'), ['PARSE_UNEXPECTED_EOF', 2, 7]);
  assert.deepEqual(perr('a = [1'), ['PARSE_UNEXPECTED_EOF', 1, 7]);
  assert.deepEqual(perr('a'), ['PARSE_UNEXPECTED_EOF', 1, 2]);
  assert.deepEqual(perr('a b'), ['PARSE_UNEXPECTED_TOKEN', 1, 3]);
  assert.deepEqual(perr('}'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(perr('true = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(perr('a = b'), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(perr('a = [{}]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(perr('include "a${b}"'), ['PARSE_BAD_INCLUDE', 1, 9]);
  assert.deepEqual(perr('include 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  assert.deepEqual(perr('include'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.deepEqual(perr('a {\n  const x = 1\n}'), ['PARSE_CONST_NOT_TOP', 2, 3]);
  assert.deepEqual(perr('const const = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 7]);
});

test('lỗi lexer thắng lỗi cú pháp trước đó', () => {
  assert.deepEqual(perr('a = = \n b = "x'), ['LEX_UNTERMINATED_STRING', 2, 6]);
});

test('parseProject: tiền thứ tự, bỏ qua tệp thiếu và tệp không tới được', () => {
  const files = {
    main: 'include "a"\nx { include "b" }\ninclude "zzz"',
    a: 'include "c"',
    b: '',
    c: '',
    unused: 'sai sai',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'a', 'c', 'b']);
});

test('parseProject: lỗi', () => {
  assert.deepEqual(parseProject({}, 'm'), {
    ok: false,
    error: { code: 'PARSE_ENTRY_NOT_FOUND', message: parseProject({}, 'm').error.message, file: 'm', line: 1, column: 1 },
  });
  const r = parseProject({ m: 'include "a"\ninclude "b"', a: 'x = ', b: 'y = "' }, 'm');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'PARSE_UNEXPECTED_EOF');
  assert.equal(r.error.file, 'a');
  assert.equal(parseProject({ m: 'include "a"', a: 'x = "' }, 'm').error.code, 'LEX_UNTERMINATED_STRING');
  // include vòng không làm treo
  assert.equal(parseProject({ m: 'include "m"' }, 'm').ok, true);
});
