import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const perr = (src) => {
  const r = parse(src);
  assert.equal(r.ok, false, `đáng lẽ lỗi: ${JSON.stringify(src)}`);
  const { code, line, column } = r.error;
  return { code, line, column };
};

test('AST đầy đủ đúng hình dạng', () => {
  const r = parse('const c = 1\na = [1, "x${a}",]\nb {\n  include "f"\n  n = null\n  t = true\n}');
  assert.equal(r.ok, true);
  assert.deepStrictEqual(r.ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', line: 1, column: 1, name: 'c', value: { type: 'Number', line: 1, column: 11, value: 1 } },
      {
        type: 'Assign', line: 2, column: 1, key: 'a',
        value: {
          type: 'Array', line: 2, column: 5,
          items: [
            { type: 'Number', line: 2, column: 6, value: 1 },
            {
              type: 'String', line: 2, column: 9,
              parts: [
                { type: 'Text', value: 'x' },
                { type: 'Ref', path: ['a'], const: false, line: 2, column: 11 },
              ],
            },
          ],
        },
      },
      {
        type: 'Block', line: 3, column: 1, key: 'b',
        body: [
          { type: 'Include', line: 4, column: 3, path: 'f' },
          { type: 'Assign', line: 5, column: 3, key: 'n', value: { type: 'Null', line: 5, column: 7 } },
          { type: 'Assign', line: 6, column: 3, key: 't', value: { type: 'Bool', line: 6, column: 7, value: true } },
        ],
      },
    ],
  });
});

test('tệp rỗng, mảng rỗng, include rỗng', () => {
  assert.deepStrictEqual(parse('').ast, { type: 'File', line: 1, column: 1, body: [] });
  assert.deepStrictEqual(parse('a = []').ast.body[0].value, { type: 'Array', line: 1, column: 5, items: [] });
  assert.deepStrictEqual(parse('include ""').ast.body[0], { type: 'Include', line: 1, column: 1, path: '' });
  assert.equal(parse('a = [1,]').ok, true);
});

test('ví dụ mục 9: dấu phẩy thừa', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }';
  assert.deepStrictEqual(perr(src), { code: 'PARSE_UNEXPECTED_TOKEN', line: 5, column: 29 });
  assert.equal(parse(src.replace(' , }', ' }')).ok, true);
});

test('lỗi EOF', () => {
  assert.deepStrictEqual(perr('a = '), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 5 });
  assert.deepStrictEqual(perr('a {\n b = 1\n'), { code: 'PARSE_UNEXPECTED_EOF', line: 3, column: 1 });
  assert.deepStrictEqual(perr('a = [1,'), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 8 });
  assert.deepStrictEqual(perr('a'), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 2 });
  assert.deepStrictEqual(perr('include'), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 8 });
  assert.deepStrictEqual(perr('const x'), { code: 'PARSE_UNEXPECTED_EOF', line: 1, column: 8 });
});

test('lỗi token', () => {
  assert.deepStrictEqual(perr('}'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 1 });
  assert.deepStrictEqual(perr('a b'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 3 });
  assert.deepStrictEqual(perr('true = 1'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 1 });
  assert.deepStrictEqual(perr('a = b'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 5 });
  assert.deepStrictEqual(perr('a = [,]'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 6 });
  assert.deepStrictEqual(perr('a = [1,,2]'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 8 });
  assert.deepStrictEqual(perr('a = [1 2]'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 8 });
  assert.deepStrictEqual(perr('a = [{}]'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 6 });
  assert.deepStrictEqual(perr('include a'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 9 });
  assert.deepStrictEqual(perr('const = 1'), { code: 'PARSE_UNEXPECTED_TOKEN', line: 1, column: 7 });
});

test('include có nội suy / const trong khối', () => {
  assert.deepStrictEqual(perr('x = 1\ninclude "a${b}"'), { code: 'PARSE_BAD_INCLUDE', line: 2, column: 9 });
  assert.deepStrictEqual(perr('a {\n  const x = 1\n}'), { code: 'PARSE_CONST_NOT_TOP', line: 2, column: 3 });
  assert.deepStrictEqual(perr('a { b { const x = 1 } }'), { code: 'PARSE_CONST_NOT_TOP', line: 1, column: 9 });
});

test('lỗi lexer thắng lỗi cú pháp đứng trước', () => {
  assert.deepStrictEqual(perr('a b\nc = 01'), { code: 'LEX_BAD_NUMBER', line: 2, column: 5 });
});

test('parseProject: tiền thứ tự, include lồng và trong khối', () => {
  const files = {
    main: 'include "a"\nblk { include "b" }\ninclude "c"',
    a: 'include "d"\nx = 1',
    b: 'y = 1',
    c: 'z = 1',
    d: 'w = 1',
    unused: 'syntax error here',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepStrictEqual(Object.keys(r.program.files), ['main', 'a', 'd', 'b', 'c']);
  assert.equal(r.program.files.main.type, 'File');
});

test('parseProject: bỏ qua include thiếu tệp, không parse lặp, vòng include', () => {
  const r = parseProject({ main: 'include "nope"\ninclude "main"\ninclude "a"', a: 'include "main"' }, 'main');
  assert.equal(r.ok, true);
  assert.deepStrictEqual(Object.keys(r.program.files), ['main', 'a']);
});

test('parseProject: lỗi có file, dừng ở tệp đầu tiên', () => {
  const files = { main: 'include "a"\ninclude "b"', a: 'x = ', b: 'y = 01' };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, false);
  const { code, file, line, column } = r.error;
  assert.deepStrictEqual({ code, file, line, column }, { code: 'PARSE_UNEXPECTED_EOF', file: 'a', line: 1, column: 5 });
  const r2 = parseProject({ main: 'include "b"', b: 'y = 01' }, 'main');
  assert.deepStrictEqual(
    { code: r2.error.code, file: r2.error.file, line: r2.error.line, column: r2.error.column },
    { code: 'LEX_BAD_NUMBER', file: 'b', line: 1, column: 5 },
  );
});

test('parseProject: entry không có', () => {
  const r = parseProject({ a: '' }, 'main');
  assert.equal(r.ok, false);
  const { code, file, line, column } = r.error;
  assert.deepStrictEqual({ code, file, line, column }, { code: 'PARSE_ENTRY_NOT_FOUND', file: 'main', line: 1, column: 1 });
});
