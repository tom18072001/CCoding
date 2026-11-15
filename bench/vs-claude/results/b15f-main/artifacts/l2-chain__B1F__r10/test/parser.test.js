import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const ok = (s) => {
  const r = parse(s);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.ast;
};
const bad = (s) => {
  const r = parse(s);
  assert.equal(r.ok, false, s);
  return r.error;
};
const loc = (e) => [e.code, e.line, e.column];

test('AST đầy đủ, không trường thừa', () => {
  const ast = ok('a = 1\nb { c = "x${a}" }\ninclude "f"\nconst k = [true, null, false]');
  assert.deepEqual(ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Assign', key: 'a', line: 1, column: 1, value: { type: 'Number', value: 1, line: 1, column: 5 } },
      {
        type: 'Block', key: 'b', line: 2, column: 1,
        body: [{
          type: 'Assign', key: 'c', line: 2, column: 5,
          value: {
            type: 'String', line: 2, column: 9,
            parts: [{ type: 'Text', value: 'x' }, { type: 'Ref', path: ['a'], const: false, line: 2, column: 11 }],
          },
        }],
      },
      { type: 'Include', path: 'f', line: 3, column: 1 },
      {
        type: 'Const', name: 'k', line: 4, column: 1,
        value: {
          type: 'Array', line: 4, column: 11,
          items: [
            { type: 'Bool', value: true, line: 4, column: 12 },
            { type: 'Null', line: 4, column: 18 },
            { type: 'Bool', value: false, line: 4, column: 24 },
          ],
        },
      },
    ],
  });
});

test('File luôn ở 1:1 kể cả rỗng/BOM/chú thích', () => {
  for (const s of ['', '\n\n  # x', '﻿a = 1']) {
    const a = ok(s);
    assert.deepEqual([a.line, a.column], [1, 1]);
  }
  assert.deepEqual(ok(''), { type: 'File', body: [], line: 1, column: 1 });
});

test('mảng: lồng, rỗng, dấu phẩy cuối', () => {
  const v = (s) => ok(`a = ${s}`).body[0].value;
  assert.equal(v('[]').items.length, 0);
  assert.equal(v('[1,]').items.length, 1);
  assert.equal(v('["a", "b", [1, 2],]').items[2].items.length, 2);
  assert.deepEqual(loc(bad('a = [,]')), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(loc(bad('a = [1,,2]')), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(loc(bad('a = [1 2]')), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
});

test('mảng không chứa khối', () => {
  assert.equal(bad('a = [b { }]').code, 'PARSE_UNEXPECTED_TOKEN');
});

test('PARSE_UNEXPECTED_EOF tại token eof', () => {
  assert.deepEqual(loc(bad('a = ')), ['PARSE_UNEXPECTED_EOF', 1, 5]);
  assert.deepEqual(loc(bad('a {\n b = 1\n')), ['PARSE_UNEXPECTED_EOF', 3, 1]);
  assert.deepEqual(loc(bad('a = [1,')), ['PARSE_UNEXPECTED_EOF', 1, 8]);
  assert.equal(bad('a').code, 'PARSE_UNEXPECTED_EOF');
  assert.equal(bad('const').code, 'PARSE_UNEXPECTED_EOF');
  assert.equal(bad('const x').code, 'PARSE_UNEXPECTED_EOF');
  assert.equal(bad('include').code, 'PARSE_UNEXPECTED_EOF');
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  assert.deepEqual(loc(bad('}')), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(loc(bad('a b')), ['PARSE_UNEXPECTED_TOKEN', 1, 3]);
  assert.deepEqual(loc(bad('true = 1')), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(loc(bad('a = b')), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(loc(bad('a = =')), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(loc(bad('include 5')), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  assert.deepEqual(loc(bad('const include = 1')), ['PARSE_UNEXPECTED_TOKEN', 1, 7]);
  assert.deepEqual(loc(bad('a = include')), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
});

test('include: path nối Text, rỗng ok, nội suy lỗi', () => {
  assert.equal(ok('include "a\\u0062c"').body[0].path, 'abc');
  assert.equal(ok('include ""').body[0].path, '');
  assert.deepEqual(loc(bad('x = 1\ninclude "a${b}"')), ['PARSE_BAD_INCLUDE', 2, 9]);
});

test('const chỉ cấp cao nhất', () => {
  assert.deepEqual(loc(bad('a {\n  const x = 1\n}')), ['PARSE_CONST_NOT_TOP', 2, 3]);
  assert.equal(bad('a { b { const x = 1 } }').code, 'PARSE_CONST_NOT_TOP');
});

test('lexer lỗi thắng lỗi cú pháp trước đó', () => {
  assert.equal(bad('a b\nc = 01').code, 'LEX_BAD_NUMBER');
  assert.equal(bad('}\n"abc').code, 'LEX_UNTERMINATED_STRING');
});

test('ví dụ mục 9', () => {
  const main = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }';
  assert.deepEqual(loc(bad(main)), ['PARSE_UNEXPECTED_TOKEN', 5, 29]);
  assert.equal(ok(main.replace(' , }', ' }')).body.length, 5);
});

test('parseProject: tiền thứ tự, include trong khối, bỏ qua tệp thiếu', () => {
  const files = {
    main: 'include "a"\nblk { include "b"\n include "missing" }\ninclude "c"',
    a: 'include "d"',
    b: 'x = 1',
    c: 'include "a"',
    d: 'y = 1',
    unused: 'z = ',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'a', 'd', 'b', 'c']);
  assert.equal(r.program.files.d.type, 'File');
});

test('parseProject: vòng include không lặp vô hạn', () => {
  const r = parseProject({ a: 'include "b"', b: 'include "a"\ninclude "b"' }, 'a');
  assert.deepEqual(Object.keys(r.program.files), ['a', 'b']);
});

test('parseProject: lỗi có file, dừng ở tệp gặp đầu tiên', () => {
  const r = parseProject({ main: 'include "a"\ninclude "b"', a: 'x = 1\n\n  y = ', b: '?' }, 'main');
  assert.equal(r.ok, false);
  assert.deepEqual(
    [r.error.code, r.error.file, r.error.line, r.error.column],
    ['PARSE_UNEXPECTED_EOF', 'a', 3, 7],
  );
  const l = parseProject({ main: 'a = ?' }, 'main');
  assert.deepEqual([l.error.code, l.error.file, l.error.line, l.error.column], ['LEX_UNEXPECTED_CHAR', 'main', 1, 5]);
});

test('parseProject: không phân tích tệp lỗi nếu không tới được', () => {
  assert.equal(parseProject({ main: 'a = 1', bad: '?' }, 'main').ok, true);
});

test('parseProject: entry không có', () => {
  const r = parseProject({ a: '' }, 'main');
  assert.equal(r.ok, false);
  assert.deepEqual(
    [r.error.code, r.error.file, r.error.line, r.error.column],
    ['PARSE_ENTRY_NOT_FOUND', 'main', 1, 1],
  );
});
