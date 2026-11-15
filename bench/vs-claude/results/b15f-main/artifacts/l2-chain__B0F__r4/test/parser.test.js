import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const ok = (src) => {
  const r = parse(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.ast;
};
const err = (src) => {
  const r = parse(src);
  assert.equal(r.ok, false, `phải lỗi: ${JSON.stringify(src)}`);
  return r.error;
};
const at = (e, code, line, column) =>
  assert.deepEqual({ code: e.code, line: e.line, column: e.column }, { code, line, column });

test('AST đầy đủ, không trường thừa', () => {
  const ast = ok('const c = 1\na = "x${b}"\nblk {\n  n = null\n  t = true\n}\ninclude "f"\nl = [1, [2],]');
  assert.deepEqual(ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', line: 1, column: 1, name: 'c', value: { type: 'Number', line: 1, column: 11, value: 1 } },
      {
        type: 'Assign', line: 2, column: 1, key: 'a',
        value: {
          type: 'String', line: 2, column: 5,
          parts: [
            { type: 'Text', value: 'x' },
            { type: 'Ref', path: ['b'], const: false, line: 2, column: 7 },
          ],
        },
      },
      {
        type: 'Block', line: 3, column: 1, key: 'blk',
        body: [
          { type: 'Assign', line: 4, column: 3, key: 'n', value: { type: 'Null', line: 4, column: 7 } },
          { type: 'Assign', line: 5, column: 3, key: 't', value: { type: 'Bool', line: 5, column: 7, value: true } },
        ],
      },
      { type: 'Include', line: 7, column: 1, path: 'f' },
      {
        type: 'Assign', line: 8, column: 1, key: 'l',
        value: {
          type: 'Array', line: 8, column: 5,
          items: [
            { type: 'Number', line: 8, column: 6, value: 1 },
            { type: 'Array', line: 8, column: 9, items: [{ type: 'Number', line: 8, column: 10, value: 2 }] },
          ],
        },
      },
    ],
  });
});

test('tệp rỗng và chỉ chú thích', () => {
  assert.deepEqual(ok(''), { type: 'File', line: 1, column: 1, body: [] });
  assert.deepEqual(ok('# x').body, []);
  assert.deepEqual(ok('a = ""').body[0].value.parts, []);
});

test('mảng: [] , [1,] hợp lệ; [,] và [1,,2] lỗi', () => {
  assert.equal(ok('a = []').body[0].value.items.length, 0);
  assert.equal(ok('a = [1,]').body[0].value.items.length, 1);
  at(err('a = [,]'), 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  at(err('a = [1,,2]'), 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at(err('a = [1 2]'), 'PARSE_UNEXPECTED_TOKEN', 1, 8);
});

test('PARSE_UNEXPECTED_EOF tại token eof', () => {
  at(err('a = '), 'PARSE_UNEXPECTED_EOF', 1, 5);
  at(err('a'), 'PARSE_UNEXPECTED_EOF', 1, 2);
  at(err('a {\n b = 1\n'), 'PARSE_UNEXPECTED_EOF', 3, 1);
  at(err('a = [1,'), 'PARSE_UNEXPECTED_EOF', 1, 8);
  at(err('include'), 'PARSE_UNEXPECTED_EOF', 1, 8);
  at(err('const x ='), 'PARSE_UNEXPECTED_EOF', 1, 10);
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  at(err('}'), 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at(err('a b'), 'PARSE_UNEXPECTED_TOKEN', 1, 3);
  at(err('true = 1'), 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at(err('a = b'), 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at(err('a = }'), 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at(err('a = include'), 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at(err('include 5'), 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at(err('const include = 1'), 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  at(err('const x 1'), 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at(err('a { }}'), 'PARSE_UNEXPECTED_TOKEN', 1, 6);
});

test('PARSE_BAD_INCLUDE tại chuỗi; include "" hợp lệ', () => {
  at(err('x = 1\n  include "a${b}"'), 'PARSE_BAD_INCLUDE', 2, 11);
  assert.equal(ok('include ""').body[0].path, '');
  assert.equal(ok('include "a\\nb"').body[0].path, 'a\nb');
});

test('PARSE_CONST_NOT_TOP tại từ khóa const', () => {
  at(err('a {\n  const x = 1\n}'), 'PARSE_CONST_NOT_TOP', 2, 3);
  at(err('a { b { const'), 'PARSE_CONST_NOT_TOP', 1, 9);
});

test('ví dụ mục 9: dấu phẩy thừa tại 5:29', () => {
  const src = [
    'const env = "prod"',
    'name = "svc-${@env}"',
    'ports = [80, 443]',
    'http { port = "${ports.0}" }',
    'https { port = "${ports.1}" , }      # lỗi',
  ].join('\n');
  at(err(src), 'PARSE_UNEXPECTED_TOKEN', 5, 29);
});

test('lỗi lexer thắng lỗi cú pháp đứng trước', () => {
  at(err('a b\nc = 01'), 'LEX_BAD_NUMBER', 2, 5);
  at(err('}\n"x'), 'LEX_UNTERMINATED_STRING', 2, 1);
});

test('\\r\\n và ký tự ngoài BMP trong vị trí lỗi', () => {
  at(err('a = 1\r\nb = ,'), 'PARSE_UNEXPECTED_TOKEN', 2, 5);
  at(err('s = "😀" }'), 'PARSE_UNEXPECTED_TOKEN', 1, 10);
  at(err('﻿a b'), 'PARSE_UNEXPECTED_TOKEN', 1, 3);
});

test('parse không ném', () => {
  for (const s of ['', '{', '"', '[', 'a = [[[', 'include "', '/*']) {
    assert.doesNotThrow(() => parse(s));
  }
});

// ---------- parseProject ----------

test('parseProject: hình thoi, mỗi tệp một lần, khóa theo tiền thứ tự', () => {
  const files = {
    z: 'x = 1',
    d: 'd = 1',
    c: 'include "d"',
    b: 'include "d"',
    a: 'include "b"\nblk { include "c" }\ninclude "b"',
  };
  const r = parseProject(files, 'a');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'a');
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b', 'd', 'c']);
  assert.equal(r.program.files.a.type, 'File');
});

test('parseProject: bỏ qua include thiếu tệp; tệp không tới được không bị phân tích', () => {
  const r = parseProject({ m: 'include "none"\na = 1', bad: 'a = = =' }, 'm');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['m']);
});

test('parseProject: vòng include không lặp vô hạn', () => {
  const r = parseProject({ a: 'include "b"', b: 'include "a"\ninclude "b"' }, 'a');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b']);
});

test('parseProject: lỗi ở tệp con kèm file, dừng ngay, không program', () => {
  const r = parseProject(
    { m: 'include "x"\ninclude "y"', x: 'include "z"', z: 'a = 1\nb = ', y: 'q = 01' },
    'm',
  );
  assert.equal(r.ok, false);
  assert.equal('program' in r, false);
  assert.deepEqual(
    { code: r.error.code, file: r.error.file, line: r.error.line, column: r.error.column },
    { code: 'PARSE_UNEXPECTED_EOF', file: 'z', line: 2, column: 5 },
  );
});

test('parseProject: lỗi tệp gặp đầu tiên theo tiền thứ tự, kể cả lexer', () => {
  const r = parseProject({ m: 'blk { include "a" }\ninclude "b"', a: 'x = 01', b: 'y = =' }, 'm');
  assert.deepEqual(
    { code: r.error.code, file: r.error.file, line: r.error.line, column: r.error.column },
    { code: 'LEX_BAD_NUMBER', file: 'a', line: 1, column: 5 },
  );
});

test('parseProject: lỗi ở entry thắng include phía sau', () => {
  const r = parseProject({ m: 'include "a"\n}', a: 'x = 01' }, 'm');
  assert.equal(r.error.file, 'm');
  assert.equal(r.error.code, 'PARSE_UNEXPECTED_TOKEN');
});

test('parseProject: PARSE_ENTRY_NOT_FOUND tại 1:1', () => {
  const r = parseProject({ a: '' }, 'nope');
  assert.equal(r.ok, false);
  assert.deepEqual(
    { code: r.error.code, file: r.error.file, line: r.error.line, column: r.error.column },
    { code: 'PARSE_ENTRY_NOT_FOUND', file: 'nope', line: 1, column: 1 },
  );
  assert.equal(parseProject({}, 'toString').ok, false);
});
