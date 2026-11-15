import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, parse, parseProject, check, evaluate, diff, applyDiff, formatText, formatJson, summarize,
  escapePointer, unescapePointer, parsePointer, formatPointer, compile } from '../src/index.js';

const pos = (e) => [e.code, e.line, e.column];
const proj = (files, entry = 'main') => parseProject(files, entry).program;

test('lexer: BOM, CRLF, vị trí eof', () => {
  const r = tokenize('﻿a\r\n= 1');
  assert.deepEqual(r.tokens.map((t) => [t.type, t.line, t.column]),
    [['ident', 1, 1], ['punct', 2, 1], ['number', 2, 3], ['eof', 2, 4]]);
});

test('lexer: số', () => {
  for (const bad of ['01', '1.', '1e', '12abc', '1-2', '1e999', '-']) {
    assert.equal(tokenize(`a = ${bad}`).error.code, 'LEX_BAD_NUMBER', bad);
  }
  assert.equal(tokenize('.5').error.code, 'LEX_UNEXPECTED_CHAR');
  const t = tokenize('-0 -1.5e2').tokens;
  assert.ok(Object.is(t[0].value, 0));
  assert.equal(t[1].value, -150);
});

test('lexer: chuỗi, thoát, nội suy', () => {
  const t = tokenize('"a${@r.x}b\\$\\u0041${p.0}"').tokens[0].value;
  assert.deepEqual(t, [
    { type: 'Text', value: 'a' },
    { type: 'Ref', path: ['r', 'x'], const: true, line: 1, column: 3 },
    { type: 'Text', value: 'b$A' },
    { type: 'Ref', path: ['p', '0'], const: false, line: 1, column: 19 },
  ]);
  assert.deepEqual(tokenize('""').tokens[0].value, []);
  assert.equal(tokenize('"\\${a}"').tokens[0].value[0].value, '${a}');
});

test('lexer: mã lỗi và vị trí', () => {
  assert.deepEqual(pos(tokenize('a = "x').error), ['LEX_UNTERMINATED_STRING', 1, 5]);
  assert.deepEqual(pos(tokenize('\n/* x').error), ['LEX_UNTERMINATED_COMMENT', 2, 1]);
  assert.deepEqual(pos(tokenize('a = "\\q"').error), ['LEX_BAD_ESCAPE', 1, 6]);
  assert.deepEqual(pos(tokenize('a = "\\u12"').error), ['LEX_BAD_ESCAPE', 1, 6]);
  assert.deepEqual(pos(tokenize('a = "x${}"').error), ['LEX_BAD_INTERPOLATION', 1, 7]);
  assert.deepEqual(pos(tokenize('a = "${0}"').error), ['LEX_BAD_INTERPOLATION', 1, 6]);
  assert.deepEqual(pos(tokenize('a = "${a').error), ['LEX_BAD_INTERPOLATION', 1, 6]);
  assert.deepEqual(pos(tokenize('a / b').error), ['LEX_UNEXPECTED_CHAR', 1, 3]);
  assert.equal(tokenize('# c\n// d\n/* e\n f */ x').tokens.length, 2);
});

test('parser: AST và vị trí', () => {
  const r = parse('const c = [1, [2],]\nb { include "x" k = null }');
  assert.deepEqual(r.ast, {
    type: 'File', line: 1, column: 1,
    body: [
      { type: 'Const', line: 1, column: 1, name: 'c', value: { type: 'Array', line: 1, column: 11, items: [
        { type: 'Number', line: 1, column: 12, value: 1 },
        { type: 'Array', line: 1, column: 15, items: [{ type: 'Number', line: 1, column: 16, value: 2 }] }] } },
      { type: 'Block', line: 2, column: 1, key: 'b', body: [
        { type: 'Include', line: 2, column: 5, path: 'x' },
        { type: 'Assign', line: 2, column: 17, key: 'k', value: { type: 'Null', line: 2, column: 21 } }] },
    ],
  });
});

test('parser: lỗi cú pháp', () => {
  const e = (s) => pos(parse(s).error);
  assert.deepEqual(e('a = 1 }'), ['PARSE_UNEXPECTED_TOKEN', 1, 7]);
  assert.deepEqual(e('a {'), ['PARSE_UNEXPECTED_EOF', 1, 4]);
  assert.deepEqual(e('a = [,]'), ['PARSE_UNEXPECTED_TOKEN', 1, 6]);
  assert.deepEqual(e('a = [1,,2]'), ['PARSE_UNEXPECTED_TOKEN', 1, 8]);
  assert.deepEqual(e('include "${a}"'), ['PARSE_BAD_INCLUDE', 1, 9]);
  assert.deepEqual(e('include 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 9]);
  assert.deepEqual(e('a { const b = 1 }'), ['PARSE_CONST_NOT_TOP', 1, 5]);
  assert.deepEqual(e('true = 1'), ['PARSE_UNEXPECTED_TOKEN', 1, 1]);
  assert.deepEqual(e('a b'), ['PARSE_UNEXPECTED_TOKEN', 1, 3]);
  assert.deepEqual(e('a = b'), ['PARSE_UNEXPECTED_TOKEN', 1, 5]);
  assert.deepEqual(e('a = =\n"x'), ['LEX_UNTERMINATED_STRING', 2, 1]);
  assert.equal(parse('include ""').ast.body[0].path, '');
});

test('parseProject: thứ tự tiền thứ tự, bỏ qua thiếu, lỗi có file', () => {
  const files = { main: 'include "b"\nx { include "c" }\ninclude "zz"', b: 'include "d"', c: '', d: '' };
  const r = parseProject(files, 'main');
  assert.deepEqual(Object.keys(r.program.files), ['main', 'b', 'd', 'c']);
  assert.equal(parseProject(files, 'nope').error.code, 'PARSE_ENTRY_NOT_FOUND');
  const bad = parseProject({ main: 'include "b"', b: 'a = ' }, 'main');
  assert.deepEqual([bad.error.file, bad.error.code, bad.error.line, bad.error.column], ['b', 'PARSE_UNEXPECTED_EOF', 1, 5]);
});

test('check pha A', () => {
  const errs = check(proj({
    main: 'a = 1\na = 2\na {}\nconst c = 1\nconst c = 2\ninclude "x"\ninclude "main"\ninclude "b"',
    b: 'k = 1\nk = 2',
  }));
  assert.deepEqual(errs.map((e) => [e.code, e.file, e.line, e.column]), [
    ['SEM_DUPLICATE_KEY', 'main', 2, 1], ['SEM_DUPLICATE_KEY', 'main', 3, 1],
    ['SEM_DUPLICATE_CONST', 'main', 5, 1], ['SEM_INCLUDE_NOT_FOUND', 'main', 6, 1],
    ['SEM_INCLUDE_CYCLE', 'main', 7, 1], ['SEM_DUPLICATE_KEY', 'b', 2, 1],
  ]);
  const diamond = check(proj({ main: 'include "b"\ninclude "c"', b: 'include "d"', c: 'include "d"', d: 'v = 1' }));
  assert.deepEqual(diamond, []);
  assert.deepEqual(check(proj({ main: 'a { k = 1 }\nb { k = 1 }\ninclude "o"', o: 'k = 2' })), []);
});

test('check pha B', () => {
  const run = (src) => check(proj({ main: src })).map((e) => [e.code, e.line, e.column]);
  assert.deepEqual(run('const c = "${x}"\nx = 1'), [['SEM_CONST_CONFIG_REF', 1, 12]]);
  assert.deepEqual(run('a = "${@c}"'), [['SEM_UNDEFINED_REF', 1, 6]]);
  assert.deepEqual(run('a = 1\nb = "${a.x}"'), [['SEM_UNDEFINED_REF', 2, 6]]);
  assert.deepEqual(run('a = "${a}"'), [['SEM_REF_CYCLE', 1, 6]]);
  assert.deepEqual(run('a = "${b}"\nb = "${a}"'), [['SEM_REF_CYCLE', 1, 6], ['SEM_REF_CYCLE', 2, 6]]);
  assert.deepEqual(run('x { y = "${x}" }'), [['SEM_REF_CYCLE', 1, 10]]);
  assert.deepEqual(run('l = [1]\ns = "v${l}"'), [['SEM_BAD_INTERPOLATION', 2, 7]]);
  assert.deepEqual(run('l = [1]\ns = "${l}"\nt = "${s}"'), []);
  assert.deepEqual(run('const k = [1, 2]\na = "${@k.1}"\nb = "${@k}"'), []);
  assert.deepEqual(run('s = "x"\na = "${s.0}"'), [['SEM_UNDEFINED_REF', 2, 6]]);
});

const schema = {
  type: 'object', closed: true,
  fields: {
    name: { type: 'string', required: true, enum: ['a', 'b'] },
    port: { type: 'integer' },
    tags: { type: 'array', items: { type: 'string' } },
    srv: { type: 'object', closed: true, fields: { host: { required: true } } },
  },
};

test('check pha C', () => {
  const run = (src) => check(proj({ main: src }), schema).map((e) => [e.code, e.line, e.column]);
  assert.deepEqual(run('name = "a"\nport = 80'), []);
  assert.deepEqual(run('port = 1.5\nname = "c"\nextra = 1'), [
    ['SEM_TYPE_MISMATCH', 1, 8], ['SEM_NOT_IN_ENUM', 2, 8], ['SEM_UNKNOWN_KEY', 3, 1]]);
  assert.deepEqual(run('name = "a"\ntags = ["x", 1]'), [['SEM_TYPE_MISMATCH', 2, 14]]);
  assert.deepEqual(run('name = "a"\nsrv {\n z = 1\n}'), [['SEM_MISSING_REQUIRED', 2, 1], ['SEM_UNKNOWN_KEY', 3, 2]]);
  assert.deepEqual(run(''), [['SEM_MISSING_REQUIRED', 1, 1]]);
  assert.deepEqual(run('name = "a"\nn = "${port}"\nport = "x"\ntags = "${n}"'), [
    ['SEM_UNKNOWN_KEY', 2, 1], ['SEM_TYPE_MISMATCH', 3, 8], ['SEM_TYPE_MISMATCH', 4, 8]]);
});

test('evaluate: ví dụ spec', () => {
  const main = 'const env = "prod"\nname = "svc-${@env}"\nports = [80, 443]\nhttp { port = "${ports.0}" }\nhttps { port = "${ports.1}" }';
  assert.deepEqual(compile({ main }, 'main'), { ok: true, config: {
    name: 'svc-prod', ports: [80, 443], http: { port: 80 }, https: { port: 443 } } });
  const r = compile({ main: 'include "base.cfg"\nserver { port = 2 }\nmode = "prod"', 'base.cfg': 'server { host = "a" port = 1 }\nmode = "dev"' }, 'main');
  assert.equal(JSON.stringify(r.config), '{"server":{"host":"a","port":2},"mode":"prod"}');
});

test('evaluate: kiểu, thứ tự khóa, ghi đè, không chia sẻ tham chiếu', () => {
  const main = [
    'include "o"', 'b = [1]', 'c = "${b}"', 'd = "${b}"', 'n = 1e21',
    's = "${n}-${t}"', 't = null', 'a { x = 1 }', 'z = "${a.x}"',
  ].join('\n');
  const r = compile({ main, o: 'a = 1\nq = 2' }, 'main');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.config), ['a', 'q', 'b', 'c', 'd', 'n', 's', 't', 'z']);
  assert.deepEqual(r.config.a, { x: 1 });
  assert.equal(r.config.s, '1e+21-null');
  assert.equal(r.config.z, 1);
  assert.notEqual(r.config.c, r.config.d);
  assert.deepEqual(r.config.c, [1]);
});

test('compile: giai đoạn lỗi', () => {
  assert.deepEqual(compile({ main: 'a =' }, 'main').stage, 'parse');
  const c = compile({ main: 'a = "${b}"' }, 'main');
  assert.deepEqual([c.ok, c.stage, c.errors[0].code, c.errors[0].file], [false, 'check', 'SEM_UNDEFINED_REF', 'main']);
  assert.equal(compile({ main: 'a = 1' }, 'main', { type: 'object', fields: { a: { type: 'string' } } }).errors[0].code, 'SEM_TYPE_MISMATCH');
});

test('diff: pointer', () => {
  assert.equal(escapePointer('a~/b'), 'a~0~1b');
  assert.equal(unescapePointer('~01'), '~1');
  assert.throws(() => unescapePointer('a~'), { code: 'DIFF_BAD_POINTER' });
  assert.throws(() => unescapePointer('~2'), { code: 'DIFF_BAD_POINTER' });
  assert.deepEqual(parsePointer(''), []);
  assert.deepEqual(parsePointer('/'), ['']);
  assert.throws(() => parsePointer('a'), { code: 'DIFF_BAD_POINTER' });
  assert.equal(formatPointer(['x/y', 0]), '/x~1y/0');
  assert.equal(formatPointer([]), '');
});

test('diff: ví dụ spec và định dạng', () => {
  const ops = diff({ a: { b: [1, 2, 3] }, 'x/y': 1 }, { a: { b: [1, 5] }, 'x/y': 2, c: null });
  assert.deepEqual(ops, [
    { op: 'replace', path: '/a/b/1', oldValue: 2, value: 5 },
    { op: 'remove', path: '/a/b/2', oldValue: 3 },
    { op: 'add', path: '/c', value: null },
    { op: 'replace', path: '/x~1y', oldValue: 1, value: 2 },
  ]);
  assert.deepEqual(Object.keys(ops[0]), ['op', 'path', 'oldValue', 'value']);
  assert.equal(formatText(ops), '~ /a/b/1: 2 -> 5\n- /a/b/2 = 3\n+ /c = null\n~ /x~1y: 1 -> 2');
  assert.equal(formatText([]), 'Không có thay đổi');
  assert.equal(formatText(diff(1, [1])), '~ (root): 1 -> [1]');
  assert.equal(formatJson([]), '[]');
  assert.deepEqual(summarize(ops), { add: 1, remove: 1, replace: 2 });
  assert.deepEqual(diff([1, 2, 3, 4], [1]).map((o) => o.path), ['/3', '/2', '/1']);
  assert.deepEqual(diff([], [7, 8]).map((o) => o.path), ['/0', '/1']);
  assert.deepEqual(diff(null, {}).map((o) => o.op), ['replace']);
  assert.deepEqual(diff([], {}).map((o) => o.op), ['replace']);
});

test('diff: applyDiff bất biến và lỗi', () => {
  const a = { a: [1, 2, { z: 1 }], k: 'v', n: null };
  const b = { a: [1, 9, { z: 2 }, 4], n: [1], m: {} };
  const copy = structuredClone(a);
  assert.deepEqual(applyDiff(a, diff(a, b)), b);
  assert.deepEqual(a, copy);
  assert.deepEqual(applyDiff(1, diff(1, 2)), 2);
  assert.throws(() => applyDiff({ a: 1 }, [{ op: 'add', path: '/a', value: 1 }]), { code: 'DIFF_APPLY_FAILED' });
  assert.throws(() => applyDiff({}, [{ op: 'remove', path: '/a', oldValue: 1 }]), { code: 'DIFF_APPLY_FAILED' });
  assert.throws(() => applyDiff([1], [{ op: 'replace', path: '/1', value: 1, oldValue: 0 }]), { code: 'DIFF_APPLY_FAILED' });
  assert.deepEqual(applyDiff([1], [{ op: 'add', path: '/1', value: 2 }]), [1, 2]);
});
