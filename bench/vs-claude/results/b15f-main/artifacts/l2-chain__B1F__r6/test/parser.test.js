import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseProject } from '../src/parser.js';

const perr = (src) => {
  const r = parse(src);
  assert.equal(r.ok, false, `đáng lẽ lỗi: ${JSON.stringify(src)}`);
  return r.error;
};
const at = (e, code, line, column) => assert.deepEqual([e.code, e.line, e.column], [code, line, column]);
const ok = (src) => {
  const r = parse(src);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.ast;
};

test('AST đủ loại nút, đúng hình dạng', () => {
  const ast = ok('const c = "x"\na = [1, [true], null, "s${b}"]\nblk {\n  include "f"\n}');
  assert.deepEqual(ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', name: 'c', line: 1, column: 1,
        value: { type: 'String', parts: [{ type: 'Text', value: 'x' }], line: 1, column: 11 } },
      { type: 'Assign', key: 'a', line: 2, column: 1,
        value: { type: 'Array', line: 2, column: 5, items: [
          { type: 'Number', value: 1, line: 2, column: 6 },
          { type: 'Array', line: 2, column: 9, items: [{ type: 'Bool', value: true, line: 2, column: 10 }] },
          { type: 'Null', line: 2, column: 17 },
          { type: 'String', line: 2, column: 23, parts: [
            { type: 'Text', value: 's' },
            { type: 'Ref', path: ['b'], const: false, line: 2, column: 25 },
          ] },
        ] } },
      { type: 'Block', key: 'blk', line: 3, column: 1,
        body: [{ type: 'Include', path: 'f', line: 4, column: 3 }] },
    ],
  });
});

test('File ở 1:1 kể cả khi có BOM và rỗng', () => {
  assert.deepEqual(ok('﻿'), { type: 'File', body: [], line: 1, column: 1 });
});

test('mảng: dấu phẩy cuối', () => {
  assert.deepEqual(ok('a = []').body[0].value.items, []);
  assert.equal(ok('a = [1,]').body[0].value.items.length, 1);
  at(perr('a = [,]'), 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  at(perr('a = [1,,2]'), 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at(perr('a = [1 2]'), 'PARSE_UNEXPECTED_TOKEN', 1, 8);
  at(perr('a = [1,'), 'PARSE_UNEXPECTED_EOF', 1, 8);
  at(perr('a = [x]'), 'PARSE_UNEXPECTED_TOKEN', 1, 6);
  at(perr('a = [b { }]'), 'PARSE_UNEXPECTED_TOKEN', 1, 6);
});

test('ví dụ mục 9: dấu phẩy thừa', () => {
  const src = [
    'const env = "prod"',
    'name = "svc-${@env}"',
    'ports = [80, 443]',
    'http { port = "${ports.0}" }',
    'https { port = "${ports.1}" , }      # lỗi',
  ].join('\n');
  at(perr(src), 'PARSE_UNEXPECTED_TOKEN', 5, 29);
});

test('PARSE_UNEXPECTED_EOF tại token eof', () => {
  at(perr('a = '), 'PARSE_UNEXPECTED_EOF', 1, 5);
  at(perr('a {\n b = 1\n'), 'PARSE_UNEXPECTED_EOF', 3, 1);
  at(perr('a'), 'PARSE_UNEXPECTED_EOF', 1, 2);
  at(perr('const x'), 'PARSE_UNEXPECTED_EOF', 1, 8);
  at(perr('include'), 'PARSE_UNEXPECTED_EOF', 1, 8);
});

test('PARSE_UNEXPECTED_TOKEN', () => {
  at(perr('}'), 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at(perr('a b'), 'PARSE_UNEXPECTED_TOKEN', 1, 3);
  at(perr('true = 1'), 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at(perr('a = b'), 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at(perr('a = include'), 'PARSE_UNEXPECTED_TOKEN', 1, 5);
  at(perr('= 1'), 'PARSE_UNEXPECTED_TOKEN', 1, 1);
  at(perr('a { b = 1 ] }'), 'PARSE_UNEXPECTED_TOKEN', 1, 11);
  at(perr('const = 1'), 'PARSE_UNEXPECTED_TOKEN', 1, 7);
  at(perr('const a { }'), 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at(perr('include 5'), 'PARSE_UNEXPECTED_TOKEN', 1, 9);
  at(perr('a = 1,'), 'PARSE_UNEXPECTED_TOKEN', 1, 6);
});

test('include', () => {
  assert.equal(ok('include "a" "b"'.slice(0, 11)).body[0].path, 'a');
  assert.equal(ok('include ""').body[0].path, '');
  assert.equal(ok('include "a\\"b\\u0041"').body[0].path, 'a"bA');
  at(perr('x = 1\ninclude "a${b}"'), 'PARSE_BAD_INCLUDE', 2, 9);
  at(perr('include "${b}"'), 'PARSE_BAD_INCLUDE', 1, 9);
});

test('const chỉ ở cấp cao nhất', () => {
  at(perr('a {\n  const x = 1\n}'), 'PARSE_CONST_NOT_TOP', 2, 3);
  at(perr('a { b { const x = 1 } }'), 'PARSE_CONST_NOT_TOP', 1, 9);
  // lỗi đọc trước thắng
  at(perr('a { const x = 1 ] '), 'PARSE_CONST_NOT_TOP', 1, 5);
});

test('lỗi lexer luôn được ưu tiên hơn lỗi cú pháp', () => {
  const e = perr('a b\nc = 01');
  at(e, 'LEX_BAD_NUMBER', 2, 5);
  at(perr('}\n"x'), 'LEX_UNTERMINATED_STRING', 2, 1);
});

test('không ném', () => {
  for (const s of ['', '{', '"', 'a = [', 'a {', '\r\n\r']) {
    assert.doesNotThrow(() => parse(s));
  }
});

test('parseProject: entry không có', () => {
  const r = parseProject({ a: '' }, 'b');
  assert.deepEqual(r.error, { code: 'PARSE_ENTRY_NOT_FOUND', message: r.error.message, file: 'b', line: 1, column: 1 });
  assert.equal(r.ok, false);
});

test('parseProject: tiền thứ tự, hình thoi, include trong khối', () => {
  const files = {
    unused: 'x = 1',
    d: 'd = 1',
    c: 'include "d"',
    b: 'include "d"\nb = 1',
    main: 'include "b"\nblk { include "c"\n include "missing" }\ninclude "c"\ninclude "main"',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, true);
  assert.equal(r.program.entry, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'b', 'd', 'c']);
  assert.equal(r.program.files.main.type, 'File');
});

test('parseProject: include trong khối được duyệt theo thứ tự tài liệu', () => {
  const files = {
    main: 'include "x"\nblk { include "y" }\ninclude "z"',
    x: '', y: '', z: '',
  };
  const r = parseProject(files, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'x', 'y', 'z']);
  const r2 = parseProject({ main: 'a { include "y" }\ninclude "x"', x: '', y: 'include "x"' }, 'main');
  assert.deepEqual(Object.keys(r2.program.files), ['main', 'y', 'x']);
});

test('parseProject: lỗi kèm file, dừng ở tệp lỗi đầu tiên, bỏ qua tệp không tới được', () => {
  const files = {
    bad0: 'a = ',
    main: 'include "p"\ninclude "q"',
    p: 'include "r"',
    r: 'x = 01',
    q: 'y = ',
  };
  const r = parseProject(files, 'main');
  assert.equal(r.ok, false);
  assert.deepEqual([r.error.code, r.error.file, r.error.line, r.error.column], ['LEX_BAD_NUMBER', 'r', 1, 5]);
  const r2 = parseProject({ main: 'include "q"', q: 'a b' }, 'main');
  assert.deepEqual([r2.error.code, r2.error.file, r2.error.line, r2.error.column], ['PARSE_UNEXPECTED_TOKEN', 'q', 1, 3]);
  const r3 = parseProject({ main: 'x = 1', bad: '}' }, 'main');
  assert.equal(r3.ok, true);
});
