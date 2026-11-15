import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const perr = (s) => { const r = parse(s); assert.equal(r.ok, false, s); return [r.error.code, r.error.line, r.error.column]; };

test('AST đầy đủ', () => {
  const r = parse('const k = 1\na = "x${@k}"\nb { c = [true, null, [],] }\ninclude "f"');
  assert.deepEqual(r.ast, {
    type: 'File', line: 1, column: 1, body: [
      { type: 'Const', line: 1, column: 1, name: 'k', value: { type: 'Number', line: 1, column: 11, value: 1 } },
      { type: 'Assign', line: 2, column: 1, key: 'a', value: { type: 'String', line: 2, column: 5, parts: [
        { type: 'Text', value: 'x' }, { type: 'Ref', path: ['k'], const: true, line: 2, column: 7 }] } },
      { type: 'Block', line: 3, column: 1, key: 'b', body: [
        { type: 'Assign', line: 3, column: 5, key: 'c', value: { type: 'Array', line: 3, column: 9, items: [
          { type: 'Bool', line: 3, column: 10, value: true }, { type: 'Null', line: 3, column: 16 },
          { type: 'Array', line: 3, column: 22, items: [] }] } }] },
      { type: 'Include', line: 4, column: 1, path: 'f' },
    ],
  });
  assert.deepEqual(parse('').ast, { type: 'File', line: 1, column: 1, body: [] });
  assert.equal(parse('include ""').ast.body[0].path, '');
});

test('lỗi cú pháp', () => {
  assert.deepEqual(perr('a = '), ['PARSE_UNEXPECTED_EOF', 1, 5]);
  assert.deepEqual(perr('a {'), ['PARSE_UNEXPECTED_EOF', 1, 4]);
  assert.deepEqual(perr('a = [1'), ['PARSE_UNEXPECTED_EOF', 1, 7]);
  assert.deepEqual(perr('a'), ['PARSE_UNEXPECTED_EOF', 1, 2]);
  assert.deepEqual(perr('}'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(perr('a b'), ['PARSE_UNEXPECTED_TOKEN', 1, 3]);
  assert.deepEqual(perr('a = b'), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(perr('true = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(perr('a = [,]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(perr('a = [1,,2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(perr('include 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  assert.deepEqual(perr('include'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.deepEqual(perr('include "a${b}"'), ['PARSE_BAD_INCLUDE', 1, 9]);
  assert.deepEqual(perr('a {\n  const x = 1\n}'), ['PARSE_CONST_NOT_TOP', 2, 3]);
  assert.deepEqual(perr('const x'), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.deepEqual(perr('a = 1\nb = "${5}"\nc = = 3'), ['LEX_BAD_INTERPOLATION', 2, 6]);
  assert.equal(parse('a = [1,]').ok, true);
});

test('ví dụ mục 9: dấu phẩy thừa', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }';
  assert.deepEqual(perr(src), ['PARSE_UNEXPECTED_TOKEN', 5, 29]);
});

test('parseProject: tiền thứ tự, chỉ tệp tới được', () => {
  const files = {
    main: 'include "b"\nx { include "c" }\ninclude "missing"',
    b: 'include "d"', c: 'v = 1', d: 'w = 1', unused: '((',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['main', 'b', 'd', 'c']);
  assert.equal(r.program.entry, 'main');
});

test('parseProject: lỗi có file, entry thiếu, vòng include không lặp', () => {
  let r = parseProject({ main: 'include "b"', b: 'a = [' }, 'main');
  assert.equal(r.ok, false);
  assert.deepEqual([r.error.code, r.error.file, r.error.line, r.error.column], ['PARSE_UNEXPECTED_EOF', 'b', 1, 6]);
  r = parseProject({}, 'zz');
  assert.deepEqual([r.error.code, r.error.file, r.error.line, r.error.column], ['PARSE_ENTRY_NOT_FOUND', 'zz', 1, 1]);
  r = parseProject({ a: 'include "b"', b: 'include "a"' }, 'a');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b']);
});
