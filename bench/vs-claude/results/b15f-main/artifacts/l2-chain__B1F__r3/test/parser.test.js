import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const ast = (src) => {
  const r = parse(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.ast;
};
const at = (src, code, line, column) => {
  const r = parse(src);
  assert.equal(r.ok, false, `đáng lẽ lỗi: ${JSON.stringify(src)}`);
  assert.deepEqual([r.error.code, r.error.line, r.error.column], [code, line, column], JSON.stringify(src));
};

test('AST đầy đủ các nút với vị trí', () => {
  const a = ast('const c = 1\nk = [true, null, "s"]\nb {\n  x = false\n}\ninclude "f"');
  assert.deepEqual(a, {
    type: 'File', line: 1, column: 1, body: [
      { type: 'Const', name: 'c', value: { type: 'Number', value: 1, line: 1, column: 11 }, line: 1, column: 1 },
      {
        type: 'Assign', key: 'k', line: 2, column: 1, value: {
          type: 'Array', line: 2, column: 5, items: [
            { type: 'Bool', value: true, line: 2, column: 6 },
            { type: 'Null', line: 2, column: 12 },
            { type: 'String', parts: [{ type: 'Text', value: 's' }], line: 2, column: 18 },
          ],
        },
      },
      {
        type: 'Block', key: 'b', line: 3, column: 1, body: [
          { type: 'Assign', key: 'x', value: { type: 'Bool', value: false, line: 4, column: 7 }, line: 4, column: 3 },
        ],
      },
      { type: 'Include', path: 'f', line: 6, column: 1 },
    ],
  });
});

test('tệp rỗng, mảng rỗng / dấu phẩy cuối / mảng lồng, include rỗng', () => {
  assert.deepEqual(ast(''), { type: 'File', body: [], line: 1, column: 1 });
  assert.deepEqual(ast('﻿').body, []);
  const a = ast('a = []\nb = [1,]\nc = [[1], [],]\ninclude ""');
  assert.equal(a.body[0].value.items.length, 0);
  assert.equal(a.body[1].value.items.length, 1);
  assert.equal(a.body[2].value.items.length, 2);
  assert.equal(a.body[3].path, '');
});

test('BOM không tính vào cột', () => {
  assert.equal(ast('﻿a = 1').body[0].column, 1);
});

test('PARSE_UNEXPECTED_EOF', () => {
  at('a = ', 'PARSE_UNEXPECTED_EOF', 1, 5);
  at('a {\n b = 1\n', 'PARSE_UNEXPECTED_EOF', 3, 1);
  at('a = [1,', 'PARSE_UNEXPECTED_EOF', 1, 8);
  at('a', 'PARSE_UNEXPECTED_EOF', 1, 2);
  at('include', 'PARSE_UNEXPECTED_EOF', 1, 8);
  at('const x', 'PARSE_UNEXPECTED_EOF', 1, 8);
  at('a = [1', 'PARSE_UNEXPECTED_EOF', 1, 7);
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  at('a b', 'PARSE_UNEXPECTED_TOKEN', 1, 3);
  at('}', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('a = 1\n}', 'PARSE_UNEXPECTED_TOKEN', 2, 1);
  at('true = 1', 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at('a = b', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at('a = [,]', 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  at('a = [1,,2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at('a = [1 2]', 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at('include 5', 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at('const 1 = 2', 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  at('a = include', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at('a { = 1 }', 'PARSE_UNEXPECTED_TOKEN', 1, 5);
});

test('ví dụ mục 9: dấu phẩy thừa', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }';
  at(src, 'PARSE_UNEXPECTED_TOKEN', 5, 29);
});

test('PARSE_BAD_INCLUDE', () => {
  at('x = 1\ninclude "a${b}"', 'PARSE_BAD_INCLUDE', 2, 9);
  at('blk {\n  include "${@c}"\n}', 'PARSE_BAD_INCLUDE', 2, 11);
});

test('PARSE_CONST_NOT_TOP', () => {
  at('a {\n  const x = 1\n}', 'PARSE_CONST_NOT_TOP', 2, 3);
  at('a {\n  const\n}', 'PARSE_CONST_NOT_TOP', 2, 3);
});

test('lỗi lexer được ưu tiên hơn lỗi cú pháp', () => {
  at('a b\nc = "x', 'LEX_UNTERMINATED_STRING', 2, 5);
  at('}\n@', 'LEX_UNEXPECTED_CHAR', 2, 1);
  at('a {\n const x = 1\n}\n01', 'LEX_BAD_NUMBER', 4, 1);
});

test('parse không ném', () => {
  for (const s of ['{', '"', '[', 'const', '= =']) assert.doesNotThrow(() => parse(s));
});

// ---- parseProject ----

test('parseProject: thứ tự tiền thứ tự, kể cả include trong khối', () => {
  const files = {
    main: 'include "b"\nblk {\n  include "c"\n}\ninclude "d"\ninclude "zzz"',
    d: 'x = 1',
    c: 'include "e"',
    b: 'include "c"\ny = 1',
    e: 'z = 1',
    unused: 'q = 1',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  // main → b → c → e (b include c), rồi blk include c (đã có), d
  assert.deepEqual(Object.keys(r.program.files), ['main', 'b', 'c', 'e', 'd']);
  assert.equal(r.program.files.e.type, 'File');
});

test('parseProject: include trong khối được duyệt theo thứ tự tài liệu', () => {
  const files = {
    main: 'a {\n include "x"\n}\ninclude "y"',
    x: '', y: '',
  };
  const r = parseProject(files, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'x', 'y']);
});

test('parseProject: vòng include không lặp vô hạn', () => {
  const r = parseProject({ a: 'include "b"', b: 'include "a"\ninclude "b"' }, 'a');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b']);
});

test('parseProject: lỗi có file, dừng ở tệp gặp đầu tiên', () => {
  const files = { main: 'include "b"\ninclude "c"', b: 'x = ', c: 'y = "' };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, false);
  assert.deepEqual(
    [r.error.code, r.error.file, r.error.line, r.error.column],
    ['PARSE_UNEXPECTED_EOF', 'b', 1, 5],
  );
});

test('parseProject: lỗi lexer ở tệp entry mang file', () => {
  const r = parseProject({ main: '\n  $' }, 'main');
  assert.deepEqual(
    [r.error.code, r.error.file, r.error.line, r.error.column],
    ['LEX_UNEXPECTED_CHAR', 'main', 2, 3],
  );
});

test('parseProject: tệp không tới được thì không bị phân tích', () => {
  const r = parseProject({ main: 'a = 1', bad: 'a = ' }, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['main']);
});

test('parseProject: PARSE_ENTRY_NOT_FOUND', () => {
  const r = parseProject({ a: '' }, 'main');
  assert.equal(r.ok, false);
  assert.deepEqual(r.error.code, 'PARSE_ENTRY_NOT_FOUND');
  assert.deepEqual([r.error.file, r.error.line, r.error.column], ['main', 1, 1]);
  assert.equal(parseProject({}, 'toString').error.code, 'PARSE_ENTRY_NOT_FOUND');
});
