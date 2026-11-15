import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.js';
import { parse, parseProject } from '../src/parser.js';
import { check } from '../src/check.js';
import { evaluate } from '../src/evaluate.js';
import {
  diff, applyDiff, formatText, formatJson, summarize,
  escapePointer, unescapePointer, parsePointer, formatPointer,
} from '../src/diff.js';
import { compile } from '../src/index.js';

const lexErr = (s) => { const r = tokenize(s); assert.equal(r.ok, false, s); return r.error; };
const parseErr = (s) => { const r = parse(s); assert.equal(r.ok, false, s); return r.error; };
const pos = (e) => [e.code, e.line, e.column];
const prog = (files, entry = 'main') => {
  const r = parseProject(files, entry);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return r.program;
};
const codes = (files, schema) => check(prog(files), schema).map((e) => [e.code, e.file, e.line, e.column]);

// ---------------- tầng 1a ----------------
test('lexer: BOM, CRLF, CR, cột UTF-16', () => {
  const r = tokenize('﻿a\r\nb\rc = 1');
  assert.deepEqual(r.tokens.map((t) => [t.value, t.line, t.column]), [
    ['a', 1, 1], ['b', 2, 1], ['c', 3, 1], ['=', 3, 3], [1, 3, 5], [null, 3, 6],
  ]);
});

test('lexer: chú thích và số', () => {
  const r = tokenize('# x\n// y\n/* a\nb */ -0 -1.5e2 0');
  assert.deepEqual(r.tokens.slice(0, 3).map((t) => t.value), [0, -150, 0]);
  assert.equal(Object.is(r.tokens[0].value, 0), true);
});

test('lexer: lỗi số', () => {
  for (const s of ['01', '1.', '-', '1e', '12abc', '1-2', '1e999']) assert.equal(lexErr(s).code, 'LEX_BAD_NUMBER', s);
  assert.deepEqual(pos(lexErr('a = .5')), ['LEX_UNEXPECTED_CHAR', 1, 5]);
});

test('lexer: lỗi khác', () => {
  assert.deepEqual(pos(lexErr('a = /')), ['LEX_UNEXPECTED_CHAR', 1, 5]);
  assert.deepEqual(pos(lexErr('a = é')), ['LEX_UNEXPECTED_CHAR', 1, 5]);
  assert.deepEqual(pos(lexErr('a = "x')), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(pos(lexErr('a\n/* x')), ['LEX_UNTERMINATED_COMMENT', 2, 1]);
  assert.deepEqual(pos(lexErr('a = "x\\q"')), ['LEX_BAD_ESCAPE', 1, 7]);
  assert.deepEqual(pos(lexErr('a = "\\u12"')), ['LEX_BAD_ESCAPE', 1, 6]);
  assert.deepEqual(pos(lexErr('a = "ab${}"')), ['LEX_BAD_INTERPOLATION', 1, 8]);
  assert.deepEqual(pos(lexErr('a = "${a b}"')), ['LEX_BAD_INTERPOLATION', 1, 6]);
  assert.deepEqual(pos(lexErr('a = "${1a}"')), ['LEX_BAD_INTERPOLATION', 1, 6]);
  assert.deepEqual(pos(lexErr('a = "${a')), ['LEX_BAD_INTERPOLATION', 1, 6]);
  assert.deepEqual(pos(lexErr('a = "${a.01}"')), ['LEX_BAD_INTERPOLATION', 1, 6]);
});

test('lexer: chuỗi và nội suy', () => {
  const r = tokenize('"a\\$b ${@c.0} \\${x} $ \\u0041"');
  assert.deepEqual(r.tokens[0].value, [
    { type: 'Text', value: 'a$b ' },
    { type: 'Ref', path: ['c', '0'], const: true, line: 1, column: 7 },
    { type: 'Text', value: ' ${x} $ A' },
  ]);
  assert.deepEqual(tokenize('""').tokens[0].value, []);
});

// ---------------- tầng 1b ----------------
test('parser: AST đầy đủ', () => {
  const r = parse('const r = "x"\na = [1, [true],]\nb { include "f" c = null }');
  assert.deepEqual(r.ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', name: 'r', line: 1, column: 1, value: { type: 'String', parts: [{ type: 'Text', value: 'x' }], line: 1, column: 11 } },
      { type: 'Assign', key: 'a', line: 2, column: 1, value: { type: 'Array', line: 2, column: 5, items: [
        { type: 'Number', value: 1, line: 2, column: 6 },
        { type: 'Array', line: 2, column: 9, items: [{ type: 'Bool', value: true, line: 2, column: 10 }] },
      ] } },
      { type: 'Block', key: 'b', line: 3, column: 1, body: [
        { type: 'Include', path: 'f', line: 3, column: 5 },
        { type: 'Assign', key: 'c', line: 3, column: 17, value: { type: 'Null', line: 3, column: 21 } },
      ] },
    ],
  });
});

test('parser: lỗi cú pháp', () => {
  assert.deepEqual(pos(parseErr('a = ')), ['PARSE_UNEXPECTED_EOF', 1, 5]);
  assert.deepEqual(pos(parseErr('a {')), ['PARSE_UNEXPECTED_EOF', 1, 4]);
  assert.deepEqual(pos(parseErr('a = [1')), ['PARSE_UNEXPECTED_EOF', 1, 7]);
  assert.deepEqual(pos(parseErr('}')), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(pos(parseErr('a b')), ['PARSE_UNEXPECTED_TOKEN', 1, 3]);
  assert.deepEqual(pos(parseErr('true = 1')), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(pos(parseErr('a = b')), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(pos(parseErr('a = [,]')), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(pos(parseErr('a = [1,,2]')), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(pos(parseErr('include x')), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  assert.deepEqual(pos(parseErr('include "a${b}"')), ['PARSE_BAD_INCLUDE', 1, 9]);
  assert.deepEqual(pos(parseErr('a { const x = 1 }')), ['PARSE_CONST_NOT_TOP', 1, 5]);
  assert.equal(parse('a = []\nb = [1,]\ninclude ""').ok, true);
  // lexer chạy trọn vẹn trước
  assert.equal(parseErr('a = = \n"x').code, 'LEX_UNTERMINATED_STRING');
});

test('parser: ví dụ SPEC mục 9 (dấu phẩy thừa)', () => {
  const src = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" , }';
  assert.deepEqual(pos(parseErr(src)), ['PARSE_UNEXPECTED_TOKEN', 5, 29]);
});

test('parseProject: duyệt tiền thứ tự, lỗi có file', () => {
  const files = { main: 'x { include "b" }\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'k = 1', unused: '@@@' };
  const r = parseProject(files, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'b', 'd', 'c']);
  const e = parseProject({ main: 'include "b"', b: 'a = = 1' }, 'main');
  assert.deepEqual([e.error.code, e.error.file, e.error.line, e.error.column], ['PARSE_UNEXPECTED_TOKEN', 'b', 1, 5]);
  const n = parseProject({}, 'm');
  assert.deepEqual([n.error.code, n.error.file, n.error.line, n.error.column], ['PARSE_ENTRY_NOT_FOUND', 'm', 1, 1]);
});

// ---------------- tầng 2 ----------------
test('check pha A: trùng khóa, trùng hằng, include', () => {
  assert.deepEqual(
    codes({ main: 'a = 1\nb { x = 1 x { } }\na { }\na = 2\nconst c = 1\nconst c = 2\ninclude "nope"\ninclude "main"' }),
    [
      ['SEM_DUPLICATE_KEY', 'main', 2, 11],
      ['SEM_DUPLICATE_KEY', 'main', 3, 1],
      ['SEM_DUPLICATE_KEY', 'main', 4, 1],
      ['SEM_DUPLICATE_CONST', 'main', 6, 1],
      ['SEM_INCLUDE_NOT_FOUND', 'main', 7, 1],
      ['SEM_INCLUDE_CYCLE', 'main', 8, 1],
    ].map((x) => x),
  );
});

test('check pha A: hình thoi không phải vòng; khóa trùng khác tệp ổn', () => {
  const files = { main: 'a = 1\ninclude "b"\ninclude "c"', b: 'a = 2\ninclude "d"', c: 'include "d"', d: 'a = 3' };
  assert.deepEqual(codes(files), []);
  assert.deepEqual(codes({ main: 'include "b"', b: 'include "main"' }), [['SEM_INCLUDE_CYCLE', 'b', 1, 1]]);
});

test('check pha A: thứ tự tệp theo lần thăm đầu', () => {
  const files = { main: 'a = 1\na = 2\ninclude "b"', b: 'k = 1\nk = 2' };
  assert.deepEqual(codes(files).map((e) => e[1]), ['main', 'b']);
});

test('check pha B: tham chiếu', () => {
  assert.deepEqual(codes({ main: 'const c = "${x}"\nx = 1' }), [['SEM_CONST_CONFIG_REF', 'main', 1, 12]]);
  assert.deepEqual(codes({ main: 'a = "${@z}" b = "${q.r}" c = "${a.b}"' }).map((e) => e[0]), Array(3).fill('SEM_UNDEFINED_REF'));
  assert.deepEqual(codes({ main: 'a = "${a}"' }), [['SEM_REF_CYCLE', 'main', 1, 6]]);
  assert.deepEqual(codes({ main: 'a = "${b}"\nb = "${a}"' }).map((e) => e[3]), [6, 6]);
  assert.deepEqual(codes({ main: 'x { y = "${x}" }' }), [['SEM_REF_CYCLE', 'main', 1, 10]]);
  assert.deepEqual(codes({ main: 'l = [1]\no { k = 1 }\ns = "a${l}"\nt = "${o}${o}"\nu = "${l}"\nn = null\nm = "v${n}"' }).map((e) => [e[0], e[2], e[3]]), [
    ['SEM_BAD_INTERPOLATION', 3, 7],
    ['SEM_BAD_INTERPOLATION', 4, 6],
    ['SEM_BAD_INTERPOLATION', 4, 10],
  ]);
  // hằng của tệp khác không thấy; chuỗi bị ghi đè vẫn kiểm
  assert.deepEqual(codes({ main: 'include "b"\nv = "${@c}"', b: 'const c = 1' }), [['SEM_UNDEFINED_REF', 'main', 2, 6]]);
  assert.deepEqual(codes({ main: 'a = "${nope}"\na2 = 1' }).map((e) => e[0]), ['SEM_UNDEFINED_REF']);
  // đường dẫn không xuyên qua chuỗi
  assert.deepEqual(codes({ main: 'a = "x"\nb = "${a.0}"' }).map((e) => e[0]), ['SEM_UNDEFINED_REF']);
  // pha A chặn pha B
  assert.deepEqual(codes({ main: 'a = 1\na = 2\nb = "${zz}"' }).map((e) => e[0]), ['SEM_DUPLICATE_KEY']);
});

const SCHEMA = {
  type: 'object', closed: true,
  fields: {
    name: { type: 'string', required: true },
    port: { type: 'integer', enum: [80, 443] },
    tags: { type: 'array', items: { type: 'string' } },
    srv: { type: 'object', required: true, closed: true, fields: { host: { type: 'string', required: true } } },
  },
};

test('check pha C: lược đồ', () => {
  assert.deepEqual(codes({ main: 'name = "a"\nport = 80\ntags = ["x"]\nsrv { host = "h" }' }, SCHEMA), []);
  assert.deepEqual(
    codes({ main: 'port = 81\ntags = ["x", 2]\nsrv { z = 1 }\nextra = 1' }, SCHEMA),
    [
      ['SEM_MISSING_REQUIRED', 'main', 1, 1],
      ['SEM_NOT_IN_ENUM', 'main', 1, 8],
      ['SEM_TYPE_MISMATCH', 'main', 2, 14],
      ['SEM_MISSING_REQUIRED', 'main', 3, 1],
      ['SEM_UNKNOWN_KEY', 'main', 3, 7],
      ['SEM_UNKNOWN_KEY', 'main', 4, 1],
    ],
  );
  assert.deepEqual(codes({ main: 'name = 1.5\nport = 1.5\nsrv = null' }, SCHEMA), [
    ['SEM_TYPE_MISMATCH', 'main', 1, 8],
    ['SEM_TYPE_MISMATCH', 'main', 2, 8],
    ['SEM_TYPE_MISMATCH', 'main', 3, 7],
  ]);
});

test('check pha C: vị trí qua tham chiếu thuần và include', () => {
  const files = { main: 'name = "n"\nsrv { host = "h" }\ncopy = "${srv}"\ninclude "b"', b: 'name = 5' };
  const sch = { type: 'object', fields: { name: { type: 'string' }, copy: { type: 'object', closed: true, fields: {} } } };
  assert.deepEqual(codes(files, sch), [
    ['SEM_TYPE_MISMATCH', 'b', 1, 8],
    ['SEM_UNKNOWN_KEY', 'main', 3, 8],
  ]);
});

// ---------------- tầng 3 ----------------
const ev = (files, entry = 'main') => {
  const p = prog(files, entry);
  assert.deepEqual(check(p), []);
  return evaluate(p);
};

test('evaluate: ví dụ SPEC', () => {
  const r = ev({ main: 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }' });
  assert.deepEqual(r, { name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } });
  const r2 = ev({ main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"', 'base.cfg': 'server { host = "a"  port = 1 }\nmode = "dev"' });
  assert.deepEqual(r2, { server: { host: 'a', port: 2 }, mode: 'prod' });
  assert.deepEqual(Object.keys(r2), ['server', 'mode']);
});

test('evaluate: ghi đè, thứ tự khóa, tham chiếu muộn, mảng không trộn', () => {
  const files = {
    main: ['include "p"', 'b { d = [2, 3] }', 'a = "${z}"', 'z = 1.50', 's = "n=${z} ${@k.1}"',
      'const k = [1e21, null]', 'n = "${@k.1}"', 'm = "${b}"', 'm2 = "${b.d}"'].join('\n'),
    p: ['b { c = 1 d = [1] }', 'z = 0', 'q = 1'].join('\n'),
  };
  const r = ev(files);
  assert.deepEqual(r, { b: { c: 1, d: [2, 3] }, z: 1.5, q: 1, a: 1.5, s: 'n=1.5 null', n: null, m: { c: 1, d: [2, 3] }, m2: [2, 3] });
  assert.deepEqual(Object.keys(r), ['b', 'z', 'q', 'a', 's', 'n', 'm', 'm2']);
  assert.notEqual(r.m, r.b);
  assert.notEqual(r.m2, r.b.d);
  assert.deepEqual(ev({ main: 'x = "${@c.0}${@c.1}"\nconst c = [1e21, true]\ne = ""' }), { x: '1e+21true', e: '' });
});

test('evaluate: khối thay giá trị, chuỗi lồng, tham chiếu thấy giá trị cuối', () => {
  const r = ev({ main: 'include "p"\ninclude "q"\nd { q = 2 }\na = "x${b}"\nb = "y${c}"\nc = 3', p: 'd { k = 1 }', q: 'd = 5' });
  assert.deepEqual(r, { d: { q: 2 }, a: 'xy3', b: 'y3', c: 3 });
  assert.deepEqual(ev({ main: 'include "p"\nb = "${a}"\nl = ["${a}", [ "${b}" ]]\nc = 1', p: 'a = 1' }), { a: 1, b: 1, l: [1, [1]], c: 1 });
  assert.deepEqual(ev({ main: 'a = 1\ninclude "p"\nb = "${a}"', p: 'a = 2' }), { a: 2, b: 2 });
});

// ---------------- tầng 4 ----------------
test('diff: ví dụ SPEC và bất biến applyDiff', () => {
  const a = { a: { b: [1, 2, 3] }, 'x/y': 1 };
  const b = { a: { b: [1, 5] }, 'x/y': 2, c: null };
  const ops = diff(a, b);
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
  assert.deepEqual(applyDiff(a, ops), b);
  assert.deepEqual(a, { a: { b: [1, 2, 3] }, 'x/y': 1 });
});

test('diff: mảng, kiểu khác, gốc', () => {
  assert.deepEqual(diff([1], [1, 2, 3]).map((o) => o.path), ['/1', '/2']);
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff({ a: [] }, { a: {} }), [{ op: 'replace', path: '/a', oldValue: [], value: {} }]);
  assert.deepEqual(diff(null, {}), [{ op: 'replace', path: '', oldValue: null, value: {} }]);
  assert.deepEqual(diff({ a: null }, { a: null }), []);
  assert.deepEqual(diff({ b: 1, a: 1, B: 1 }, {}).map((o) => o.path), ['/B', '/a', '/b']);
  const src = { a: [1] };
  const [o] = diff({}, src).filter(Boolean);
  o.value.push(2);
  assert.deepEqual(src, { a: [1] });
});

test('diff: pointer', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(escapePointer(3), '3');
  assert.equal(unescapePointer('~01'), '~1');
  assert.throws(() => unescapePointer('a~'), { code: 'DIFF_BAD_POINTER' });
  assert.throws(() => unescapePointer('~2'), { code: 'DIFF_BAD_POINTER' });
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.deepEqual(parsePointer('/a~1b/0'), ['a/b', '0']);
  assert.throws(() => parsePointer('a'), { code: 'DIFF_BAD_POINTER' });
  assert.equal(formatPointer([]), '');
  assert.equal(formatPointer(['a/b', 0]), '/a~1b/0');
});

test('diff: applyDiff lỗi', () => {
  const bad = (doc, op) => assert.throws(() => applyDiff(doc, [op]), { code: 'DIFF_APPLY_FAILED' });
  bad({ a: 1 }, { op: 'add', path: '/a', value: 2 });
  bad({ a: 1 }, { op: 'remove', path: '/b' });
  bad({ a: 1 }, { op: 'replace', path: '/b', value: 1 });
  bad([1], { op: 'add', path: '/3', value: 1 });
  bad([1], { op: 'remove', path: '/1' });
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
  assert.deepEqual(applyDiff(1, [{ op: 'replace', path: '', oldValue: 1, value: [2] }]), [2]);
});

test('diff: định dạng', () => {
  const ops = diff({ a: 1, b: [1] }, { a: 'x', c: { d: 1 }, b: [] });
  assert.equal(formatText(ops), '~ /a: 1 -> "x"\n- /b/0 = 1\n+ /c = {"d":1}');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatText(diff(1, 2)), '~ (root): 1 -> 2');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson(ops), JSON.stringify(ops, null, 2));
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 1 });
});

// ---------------- đầu cuối ----------------
test('compile: các giai đoạn', () => {
  assert.deepEqual(compile({ main: 'a = = 1' }, 'main').stage, 'parse');
  assert.deepEqual(compile({ main: 'a = = 1' }, 'main').errors.length, 1);
  const c = compile({ main: 'a = "${b}"' }, 'main');
  assert.deepEqual([c.ok, c.stage, c.errors[0].code], [false, 'check', 'SEM_UNDEFINED_REF']);
  assert.deepEqual(compile({ main: 'a = 1' }, 'main', { type: 'object', fields: { a: { type: 'string' } } }).errors[0].code, 'SEM_TYPE_MISMATCH');
  assert.deepEqual(compile({}, 'x').errors[0].code, 'PARSE_ENTRY_NOT_FOUND');
  const x = compile({ main: 'v = 1' }, 'main');
  const y = compile({ main: 'v = 2' }, 'main');
  assert.equal(formatText(diff(x.config, y.config)), '~ /v: 1 -> 2');
});
