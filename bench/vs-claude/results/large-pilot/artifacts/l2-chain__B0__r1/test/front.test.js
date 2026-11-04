import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';
import { parse, parseProject } from '../src/parser.js';

const lexErr = (src) => {
  const r = tokenize(src);
  assert.equal(r.ok, false);
  return r.error;
};
const parseErr = (src) => {
  const r = parse(src);
  assert.equal(r.ok, false);
  return r.error;
};
const at = (e, code, line, column) => assert.deepEqual([e.code, e.line, e.column], [code, line, column]);

test('lexer: token, eof, BOM, CRLF, cột', () => {
  const r = tokenize('﻿a = 1\r\nb = "x"\rc');
  assert.equal(r.ok, true);
  const t = r.tokens;
  assert.deepEqual([t[0].type, t[0].line, t[0].column], ['ident', 1, 1]);
  assert.deepEqual([t[3].value, t[3].line, t[3].column], ['b', 2, 1]);
  assert.deepEqual([t[6].value, t[6].line, t[6].column], ['c', 3, 1]);
  assert.deepEqual(t.at(-1), { type: 'eof', value: null, line: 3, column: 2 });
  assert.equal(tokenize('').tokens[0].type, 'eof');
});

test('lexer: chú thích và từ khóa', () => {
  const r = tokenize('# a\n// b\n/* c\n d */ const x');
  assert.deepEqual(r.tokens.map((x) => x.type), ['keyword', 'ident', 'eof']);
  assert.equal(r.tokens[0].line, 4);
  at(lexErr('a /* x'), 'LEX_UNTERMINATED_COMMENT', 1, 3);
  at(lexErr('a / b'), 'LEX_UNEXPECTED_CHAR', 1, 3);
  at(lexErr('*/'), 'LEX_UNEXPECTED_CHAR', 1, 1);
  at(lexErr('é'), 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('lexer: số', () => {
  const v = (s) => tokenize(s).tokens[0].value;
  assert.equal(v('-1.5e2'), -150);
  assert.ok(Object.is(v('-0'), 0));
  for (const bad of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999', '-x']) {
    at(lexErr(`  ${bad}`), 'LEX_BAD_NUMBER', 1, 3);
  }
  at(lexErr('.5'), 'LEX_UNEXPECTED_CHAR', 1, 1);
  at(lexErr('+1'), 'LEX_UNEXPECTED_CHAR', 1, 1);
});

test('lexer: chuỗi, thoát, nội suy', () => {
  const v = (s) => tokenize(s).tokens[0].value;
  assert.deepEqual(v('""'), []);
  assert.deepEqual(v('"a\\n\\u0041\\$\\/$x"'), [{ type: 'Text', value: 'a\nA$/$x' }]);
  assert.deepEqual(v('"\\${a}"'), [{ type: 'Text', value: '${a}' }]);
  assert.deepEqual(v('"x${a.b.0}y${@c.1}"'), [
    { type: 'Text', value: 'x' },
    { type: 'Ref', path: ['a', 'b', '0'], const: false, line: 1, column: 3 },
    { type: 'Text', value: 'y' },
    { type: 'Ref', path: ['c', '1'], const: true, line: 1, column: 12 },
  ]);
  at(lexErr('  "abc'), 'LEX_UNTERMINATED_STRING', 1, 3);
  at(lexErr('"abc\ndef"'), 'LEX_UNTERMINATED_STRING', 1, 1);
  at(lexErr('"a\\q"'), 'LEX_BAD_ESCAPE', 1, 3);
  at(lexErr('"\\u12G4"'), 'LEX_BAD_ESCAPE', 1, 2);
  at(lexErr('"ab\\\ncd"'), 'LEX_BAD_ESCAPE', 1, 4);
  at(lexErr('"ab\\'), 'LEX_BAD_ESCAPE', 1, 4);
  for (const bad of ['${}', '${1a}', '${a.01}', '${a b}', '${@}', '${a.}', '${@1}', '${a']) {
    at(lexErr(`x "p${bad}"`), 'LEX_BAD_INTERPOLATION', 1, 5);
  }
  at(lexErr('"${a'), 'LEX_BAD_INTERPOLATION', 1, 2);
  at(lexErr('"\\q ${'), 'LEX_BAD_ESCAPE', 1, 2);
  at(lexErr('"${a" \\q'), 'LEX_BAD_INTERPOLATION', 1, 2);
});

test('parse: AST và vị trí', () => {
  const r = parse('const r = "x"\nserver {\n  h = [1, [true, null],]\n}\ninclude ""');
  assert.equal(r.ok, true);
  assert.deepEqual(r.ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', line: 1, column: 1, name: 'r', value: { type: 'String', line: 1, column: 11, parts: [{ type: 'Text', value: 'x' }] } },
      { type: 'Block', line: 2, column: 1, key: 'server', body: [
        { type: 'Assign', line: 3, column: 3, key: 'h', value: { type: 'Array', line: 3, column: 7, items: [
          { type: 'Number', line: 3, column: 8, value: 1 },
          { type: 'Array', line: 3, column: 11, items: [
            { type: 'Bool', line: 3, column: 12, value: true },
            { type: 'Null', line: 3, column: 18 },
          ] },
        ] } },
      ] },
      { type: 'Include', line: 5, column: 1, path: '' },
    ],
  });
  assert.deepEqual(parse('').ast, { type: 'File', line: 1, column: 1, body: [] });
  assert.equal(parse('a = []\nb = [1,]').ok, true);
});

test('parse: mã lỗi cú pháp', () => {
  at(parseErr('a = [,]'), 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  at(parseErr('a = [1,,2]'), 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at(parseErr('a = [1 2]'), 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at(parseErr('a = [1'), 'PARSE_UNEXPECTED_EOF', 1, 7);
  at(parseErr('a {'), 'PARSE_UNEXPECTED_EOF', 1, 4);
  at(parseErr('a ='), 'PARSE_UNEXPECTED_EOF', 1, 4);
  at(parseErr('a'), 'PARSE_UNEXPECTED_EOF', 1, 2);
  at(parseErr('}'), 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at(parseErr('a {}\n}'), 'PARSE_UNEXPECTED_TOKEN', 2, 1);
  at(parseErr('true = 1'), 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at(parseErr('a = b'), 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at(parseErr('a b'), 'PARSE_UNEXPECTED_TOKEN', 1, 3);
  at(parseErr('const include = 1'), 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  at(parseErr('include 1'), 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at(parseErr('include'), 'PARSE_UNEXPECTED_EOF', 1, 8);
  at(parseErr('  include "a${b}"'), 'PARSE_BAD_INCLUDE', 1, 11);
  at(parseErr('x { const a = 1 }'), 'PARSE_CONST_NOT_TOP', 1, 5);
  at(parseErr('x { const }'), 'PARSE_CONST_NOT_TOP', 1, 5);
  at(parseErr('const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }'),
    'PARSE_UNEXPECTED_TOKEN', 5, 29);
});

test('parse: lỗi lexer thắng lỗi cú pháp trước đó', () => {
  at(parseErr('a b\nc = "x'), 'LEX_UNTERMINATED_STRING', 2, 5);
  at(parseErr('} é'), 'LEX_UNEXPECTED_CHAR', 1, 3);
});

test('parse: lồng sâu không tràn stack', () => {
  const N = 200000;
  const arr = parse(`a = ${'['.repeat(N)}${']'.repeat(N)}`);
  assert.equal(arr.ok, true);
  const blk = parse(`${'a {'.repeat(N)}${'}'.repeat(N)}`);
  assert.equal(blk.ok, true);
  at(parseErr(`a = ${'['.repeat(N)}`), 'PARSE_UNEXPECTED_EOF', 1, N + 5);
  at(parseErr('a {'.repeat(N)), 'PARSE_UNEXPECTED_EOF', 1, N * 3 + 1);
  let d = 0;
  for (let n = blk.ast.body[0]; n; n = n.body[0]) d++;
  assert.equal(d, N);
});

test('parseProject: tiền thứ tự, bỏ qua thiếu/lặp, chỉ tệp tới được', () => {
  const files = {
    main: 'include "a"\nx { include "c"\n include "missing" }\ninclude "a"',
    a: 'include "b"',
    b: 'v = 1',
    c: 'include "main"',
    unused: '}}}',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'a', 'b', 'c']);
  assert.equal(r.program.files.main.type, 'File');
  assert.deepEqual(Object.keys(parseProject({ a: 'include "a"' }, 'a').program.files), ['a']);
});

test('parseProject: lỗi có file, dừng ở tệp đầu tiên', () => {
  const r = parseProject({ m: 'include "a"\ninclude "b"', a: 'x = ', b: 'y = "' }, 'm');
  assert.equal(r.ok, false);
  assert.deepEqual(r.error, { code: 'PARSE_UNEXPECTED_EOF', message: r.error.message, file: 'a', line: 1, column: 5 });
  const r2 = parseProject({ m: 'a = 1\n  $' }, 'm');
  assert.deepEqual([r2.error.code, r2.error.file, r2.error.line, r2.error.column], ['LEX_UNEXPECTED_CHAR', 'm', 2, 3]);
  const r3 = parseProject({ m: 'a = 1' }, 'zz');
  assert.deepEqual(r3.error, { code: 'PARSE_ENTRY_NOT_FOUND', message: r3.error.message, file: 'zz', line: 1, column: 1 });
  assert.equal(parseProject({ m: '}' }, 'm').error.file, 'm');
});

test('parseProject: chuỗi include rất dài', () => {
  const files = {};
  const N = 20000;
  for (let i = 0; i < N; i++) files[`f${i}`] = `include "f${i + 1}"`;
  files[`f${N}`] = 'a = 1';
  const r = parseProject(files, 'f0');
  assert.equal(r.ok, true);
  assert.equal(Object.keys(r.program.files).length, N + 1);
});
