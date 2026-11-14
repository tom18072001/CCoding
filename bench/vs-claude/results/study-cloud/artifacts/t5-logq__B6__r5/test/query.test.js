'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { compile, QuerySyntaxError } = require('../src/query.js');

const m = (q, r) => compile(q)(r);
const errPos = (q) => {
  try { compile(q); } catch (e) {
    assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
    assert.strictEqual(e.name, 'QuerySyntaxError');
    assert.ok(e.message.startsWith(`syntax error at position ${e.position}`), e.message);
    return e.position;
  }
  assert.fail(`no error for ${JSON.stringify(q)}`);
};

test('truy vấn rỗng khớp tất cả', () => {
  assert.ok(m('', {}));
  assert.ok(m('   ', { a: 1 }));
});

test('field:value', () => {
  assert.ok(m('status:500', { status: 500 }));
  assert.ok(m('status:500', { status: '500' }));
  assert.ok(!m('status:500', { status: 5000 }));
  assert.ok(m('level:ERROR', { level: 'error' }));
  assert.ok(m('path:/api/*', { path: '/api/users' }));
  assert.ok(m('path:/api/*', { path: '/api/' }));
  assert.ok(m('a:b?d', { a: 'bcd' }));
  assert.ok(!m('a:b?d', { a: 'bd' }));
  assert.ok(!m('a:x', { a: null }));
  assert.ok(!m('a:*', { a: null }));
  assert.ok(!m('a:*', {}));
  assert.ok(m('a:*', { a: '' }));
  assert.ok(m('a:true', { a: true }));
  assert.ok(m('http.status:5*', { 'http.status': 503 }));
  assert.ok(m('a:x.y', { a: 'x.y' }));
  assert.ok(!m('a:x.y', { a: 'xzy' }));
  assert.ok(m('a:x+y[1]', { a: 'x+y[1]' }));
});

test('QUOTED sau field khớp chính xác, không wildcard', () => {
  assert.ok(m('msg:"connection reset"', { msg: 'Connection Reset' }));
  assert.ok(!m('msg:"connection"', { msg: 'connection reset' }));
  assert.ok(m('a:"x*"', { a: 'x*' }));
  assert.ok(!m('a:"x*"', { a: 'xyz' }));
  assert.ok(m('a:"say \\"hi\\""', { a: 'say "hi"' }));
});

test('so sánh số', () => {
  assert.ok(m('status>=500', { status: 500 }));
  assert.ok(!m('status>500', { status: 500 }));
  assert.ok(m('status<=500', { status: '500' }));
  assert.ok(m('t<1.5', { t: 1.2 }));
  assert.ok(m('t>-1', { t: -0.5 }));
  assert.ok(!m('status>=1', { status: 'abc' }));
  assert.ok(!m('status>=1', { status: true }));
  assert.ok(!m('status>=1', {}));
  assert.ok(!m('status>=1', { status: null }));
  assert.ok(m('http.status>=500', { 'http.status': 502 }));
});

test('_exists_', () => {
  assert.ok(m('_exists_:a', { a: 0 }));
  assert.ok(m('_exists_:a', { a: '' }));
  assert.ok(!m('_exists_:a', { a: null }));
  assert.ok(!m('_exists_:a', {}));
});

test('WORD/QUOTED một mình', () => {
  assert.ok(m('timeout', { msg: 'Request TimeOut' }));
  assert.ok(m('"request time"', { msg: 'Request TimeOut' }));
  assert.ok(m('boom', { message: 'big boom' }));
  assert.ok(!m('boom', { msg: 'x', message: 'boom' }));
  assert.ok(!m('boom', { other: 'boom' }));
  assert.ok(!m('b*m', { msg: 'boom' }));
  assert.ok(m('"a (b) AND c"', { msg: 'x a (b) AND c y' }));
});

test('từ khóa chỉ khi HOA', () => {
  assert.ok(m('and', { msg: 'this and that' }));
  assert.ok(!m('and', { msg: 'xyz' }));
  assert.ok(m('a or b', { msg: 'a or b' }));
  assert.ok(!m('a or b', { msg: 'a' }));
  assert.ok(m('not', { msg: 'not' }));
  assert.ok(m('"AND"', { msg: 'x and y' }));
});

test('độ ưu tiên và AND ngầm', () => {
  const f = compile('a:1 OR b:1 c:1');
  assert.ok(f({ a: 1 }));
  assert.ok(f({ b: 1, c: 1 }));
  assert.ok(!f({ b: 1 }));
  assert.ok(compile('a:1 AND b:1')({ a: 1, b: 1 }));
  assert.ok(!compile('NOT a:1 b:1')({ a: 1, b: 1 }));
  assert.ok(compile('NOT a:1 b:1')({ a: 2, b: 1 }));
  assert.ok(compile('NOT NOT a:1')({ a: 1 }));
  assert.ok(compile('(a:1 OR b:1) c:1')({ b: 1, c: 1 }));
  assert.ok(!compile('(a:1 OR b:1) c:1')({ a: 1 }));
  assert.ok(compile('(a:1)(b:1)')({ a: 1, b: 1 }));
  assert.ok(compile('NOT (a:1 OR b:1)')({ a: 2 }));
});

test('vị trí lỗi: ngoặc', () => {
  assert.strictEqual(errPos('(a'), 2);
  assert.strictEqual(errPos('(a OR b'), 7);
  assert.strictEqual(errPos('a)'), 1);
  assert.strictEqual(errPos('a b ) c'), 4);
  assert.strictEqual(errPos('()'), 1);
  assert.strictEqual(errPos('a ( )'), 4);
  assert.strictEqual(errPos('('), 1);
});

test('vị trí lỗi: thiếu toán hạng', () => {
  assert.strictEqual(errPos('a AND'), 5);
  assert.strictEqual(errPos('a OR'), 4);
  assert.strictEqual(errPos('NOT'), 3);
  assert.strictEqual(errPos('a AND NOT'), 9);
  assert.strictEqual(errPos('a OR   '), 7);
});

test('vị trí lỗi: AND/OR sai chỗ', () => {
  assert.strictEqual(errPos('AND a'), 0);
  assert.strictEqual(errPos('  OR a'), 2);
  assert.strictEqual(errPos('(AND a)'), 1);
  assert.strictEqual(errPos('a AND OR b'), 6);
  assert.strictEqual(errPos('a OR AND b'), 5);
  assert.strictEqual(errPos('NOT AND a'), 4);
  assert.strictEqual(errPos('a AND AND b'), 6);
});

test('vị trí lỗi: so sánh', () => {
  assert.strictEqual(errPos('status>=abc'), 8);
  assert.strictEqual(errPos('status>='), 8);
  assert.strictEqual(errPos('a b>5x'), 4);
  assert.strictEqual(errPos('x status>abc'), 9);
  assert.strictEqual(errPos('status<'), 7);
  assert.strictEqual(errPos('status>= 5'), 8);
});

test('vị trí lỗi: field: thiếu giá trị', () => {
  assert.strictEqual(errPos('status:'), 7);
  assert.strictEqual(errPos('a b status: c'), 11);
  assert.strictEqual(errPos('_exists_:'), 9);
  assert.strictEqual(errPos('(a:)'), 3);
});

test('vị trí lỗi: ngoặc kép không đóng', () => {
  assert.strictEqual(errPos('"abc'), 0);
  assert.strictEqual(errPos('a "abc'), 2);
  assert.strictEqual(errPos('msg:"abc'), 4);
  assert.strictEqual(errPos('msg:"abc\\"'), 4);
});

test('ngoặc kép chứa khoảng trắng và ngoặc', () => {
  assert.ok(m('msg:"a (b) c"', { msg: 'A (B) C' }));
  assert.ok(m('"x)" y', { msg: 'x) y' }));
});
