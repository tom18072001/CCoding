import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const perr = (s) => { const r = parse(s); assert.equal(r.ok, false); return r.error; };

test('parser: hình dạng AST', () => {
  const r = parse('const c = 1\nk { a = [1, "x${y}",] }\ninclude "f"');
  assert.deepEqual(r.ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', name: 'c', line: 1, column: 1, value: { type: 'Number', value: 1, line: 1, column: 11 } },
      { type: 'Block', key: 'k', line: 2, column: 1, body: [
        { type: 'Assign', key: 'a', line: 2, column: 5, value: { type: 'Array', line: 2, column: 9, items: [
          { type: 'Number', value: 1, line: 2, column: 10 },
          { type: 'String', line: 2, column: 13, parts: [
            { type: 'Text', value: 'x' },
            { type: 'Ref', path: ['y'], const: false, line: 2, column: 15 }] },
        ] } },
      ] },
      { type: 'Include', path: 'f', line: 3, column: 1 },
    ],
  });
});

test('parser: mã lỗi', () => {
  assert.equal(perr('a = ').code, 'PARSE_UNEXPECTED_EOF');
  assert.equal(perr('a {').code, 'PARSE_UNEXPECTED_EOF');
  assert.equal(perr('a = [1,').code, 'PARSE_UNEXPECTED_EOF');
  assert.equal(perr('}').code, 'PARSE_UNEXPECTED_TOKEN');
  assert.equal(perr('a b').code, 'PARSE_UNEXPECTED_TOKEN');
  assert.equal(perr('a = b').code, 'PARSE_UNEXPECTED_TOKEN');
  assert.equal(perr('true = 1').code, 'PARSE_UNEXPECTED_TOKEN');
  assert.equal(perr('a = [,]').code, 'PARSE_UNEXPECTED_TOKEN');
  assert.equal(perr('a = [1,,2]').code, 'PARSE_UNEXPECTED_TOKEN');
  assert.equal(perr('include 1').code, 'PARSE_UNEXPECTED_TOKEN');
  const inc = perr('x = 1\ninclude "a${b}"');
  assert.deepEqual([inc.code, inc.line, inc.column], ['PARSE_BAD_INCLUDE', 2, 9]);
  const c = perr('a { const x = 1 }');
  assert.deepEqual([c.code, c.line, c.column], ['PARSE_CONST_NOT_TOP', 1, 5]);
  assert.equal(parse('a = []\nb = [1,]\ninclude ""').ok, true);
});

test('parser: lexer chạy trọn vẹn trước', () => {
  assert.equal(perr('a b\nc = "x').code, 'LEX_UNTERMINATED_STRING');
});

test('parser: ví dụ SPEC mục 9 (dòng 5 cột 29)', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }';
  const e = perr(src);
  assert.deepEqual([e.code, e.line, e.column], ['PARSE_UNEXPECTED_TOKEN', 5, 29]);
});

test('parseProject: tiền thứ tự và lỗi', () => {
  const files = {
    main: 'include "b"\nx { include "c" }\ninclude "zzz"',
    a: 'q = 1',
    b: 'include "d"',
    c: 'include "b"',
    d: 'v = 1',
    unused: 'sai sai',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['main', 'b', 'd', 'c']);
  const bad = parseProject({ main: 'include "b"', b: 'a = ' }, 'main');
  assert.deepEqual([bad.error.code, bad.error.file, bad.error.line, bad.error.column], ['PARSE_UNEXPECTED_EOF', 'b', 1, 5]);
  const nf = parseProject({}, 'm');
  assert.deepEqual(nf.error, { code: 'PARSE_ENTRY_NOT_FOUND', message: nf.error.message, file: 'm', line: 1, column: 1 });
});
