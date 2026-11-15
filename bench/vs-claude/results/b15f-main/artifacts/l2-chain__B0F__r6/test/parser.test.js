import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const perr = (src) => {
  const r = parse(src);
  assert.equal(r.ok, false, `đáng lẽ lỗi: ${JSON.stringify(src)}`);
  return [r.error.code, r.error.line, r.error.column];
};

test('AST đầy đủ, không có trường thừa', () => {
  const src = 'const r = "h"\na = [1, true, null, "x${b.0}${@r}"]\ns { include "f.cfg"\n  k = false }';
  const r = parse(src);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', name: 'r', line: 1, column: 1,
        value: { type: 'String', line: 1, column: 11, parts: [{ type: 'Text', value: 'h' }] } },
      { type: 'Assign', key: 'a', line: 2, column: 1,
        value: { type: 'Array', line: 2, column: 5, items: [
          { type: 'Number', value: 1, line: 2, column: 6 },
          { type: 'Bool', value: true, line: 2, column: 9 },
          { type: 'Null', line: 2, column: 15 },
          { type: 'String', line: 2, column: 21, parts: [
            { type: 'Text', value: 'x' },
            { type: 'Ref', path: ['b', '0'], const: false, line: 2, column: 23 },
            { type: 'Ref', path: ['r'], const: true, line: 2, column: 29 },
          ] },
        ] } },
      { type: 'Block', key: 's', line: 3, column: 1, body: [
        { type: 'Include', path: 'f.cfg', line: 3, column: 5 },
        { type: 'Assign', key: 'k', line: 4, column: 3, value: { type: 'Bool', value: false, line: 4, column: 7 } },
      ] },
    ],
  });
});

test('tệp rỗng và khối rỗng', () => {
  assert.deepEqual(parse('').ast, { type: 'File', body: [], line: 1, column: 1 });
  assert.deepEqual(parse('a {}').ast.body[0].body, []);
  assert.deepEqual(parse('a = []').ast.body[0].value, { type: 'Array', items: [], line: 1, column: 5 });
});

test('mảng: dấu phẩy', () => {
  assert.equal(parse('a = [1,]').ok, true);
  assert.equal(parse('a = [[1],[2,],]').ok, true);
  assert.deepEqual(perr('a = [,]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(perr('a = [1,,2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(perr('a = [1 2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(perr('a = [1,'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
});

test('ví dụ mục 9: dấu phẩy thừa tại 5:29', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }      # lỗi';
  assert.deepEqual(perr(src), ['PARSE_UNEXPECTED_TOKEN', 5, 29]);
});

test('lỗi cú pháp', () => {
  assert.deepEqual(perr('a ='), ['PARSE_UNEXPECTED_EOF', 1, 4]);
  assert.deepEqual(perr('a'), ['PARSE_UNEXPECTED_EOF', 1, 2]);
  assert.deepEqual(perr('a {'), ['PARSE_UNEXPECTED_EOF', 1, 4]);
  assert.deepEqual(perr('a = [1'), ['PARSE_UNEXPECTED_EOF', 1, 7]);
  assert.deepEqual(perr('}'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(perr('a b'), ['PARSE_UNEXPECTED_TOKEN', 1, 3]);
  assert.deepEqual(perr('a = b'), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(perr('true = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(perr('const = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 7]);
  assert.deepEqual(perr('const true = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 7]);
  assert.deepEqual(perr('const a 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  assert.deepEqual(perr('a = 1 }'), ['PARSE_UNEXPECTED_TOKEN', 1, 7]);
});

test('lỗi lexer thắng lỗi cú pháp xảy ra trước', () => {
  assert.deepEqual(perr('a = = \nb = 01'), ['LEX_BAD_NUMBER', 2, 5]);
});

test('include', () => {
  assert.deepEqual(parse('include ""').ast.body[0], { type: 'Include', path: '', line: 1, column: 1 });
  assert.deepEqual(perr('include "a${b}"'), ['PARSE_BAD_INCLUDE', 1, 9]);
  assert.deepEqual(perr('include "${@c}x"'), ['PARSE_BAD_INCLUDE', 1, 9]);
  assert.deepEqual(perr('include 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  assert.deepEqual(perr('include'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.equal(parse('a { include "x" }').ok, true);
});

test('const chỉ ở cấp cao nhất', () => {
  assert.deepEqual(perr('a {\n  const x = 1\n}'), ['PARSE_CONST_NOT_TOP', 2, 3]);
  assert.deepEqual(perr('a { b { const x = 1 } }'), ['PARSE_CONST_NOT_TOP', 1, 9]);
  assert.equal(parse('const x = 1').ok, true);
});

const base = { main: 'include "a"\nblk { include "b"\n}\ninclude "c"', a: 'include "d"', b: 'x = 1', c: 'include "a"', d: '', unused: 'a = = 1' };

test('parseProject: thứ tự tiền thứ tự, chỉ tệp tới được', () => {
  const r = parseProject(base, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'a', 'd', 'b', 'c']);
  assert.equal(r.program.files.main.type, 'File');
});

test('parseProject: include thiếu bị bỏ qua, tự include không lặp', () => {
  const r = parseProject({ m: 'include "m"\ninclude "zz"' }, 'm');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['m']);
});

test('parseProject: lỗi có file, dừng ở tệp đầu tiên', () => {
  const r = parseProject({ m: 'include "p"\ninclude "q"', p: 'a = ', q: 'b = 01' }, 'm');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'PARSE_UNEXPECTED_EOF');
  assert.equal(r.error.file, 'p');
  assert.deepEqual([r.error.line, r.error.column], [1, 5]);
  const r2 = parseProject({ m: 'x = 1 }' }, 'm');
  assert.equal(r2.error.file, 'm');
  assert.equal(r2.error.code, 'PARSE_UNEXPECTED_TOKEN');
});

test('parseProject: không có entry', () => {
  const r = parseProject({ a: '' }, 'zz');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'PARSE_ENTRY_NOT_FOUND');
  assert.equal(r.error.file, 'zz');
  assert.deepEqual([r.error.line, r.error.column], [1, 1]);
});
