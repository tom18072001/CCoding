'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { compile, QuerySyntaxError } = require('../src/query');

const m = (q, rec) => compile(q)(rec);
function errPos(q) {
  try { compile(q); } catch (e) {
    assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
    assert.strictEqual(e.name, 'QuerySyntaxError');
    assert.ok(e.message.startsWith(`syntax error at position ${e.position}`), e.message);
    return e.position;
  }
  assert.fail('expected error: ' + q);
}

test('truy vấn rỗng khớp tất cả', () => {
  assert.ok(m('', {}));
  assert.ok(m('   ', { a: 1 }));
});

test('vị trí lỗi', () => {
  assert.strictEqual(errPos('(a b'), 4);
  assert.strictEqual(errPos('a)'), 1);
  assert.strictEqual(errPos('a b ) c'), 4);
  assert.strictEqual(errPos('a ()'), 3);
  assert.strictEqual(errPos('()'), 1);
  assert.strictEqual(errPos('a AND'), 5);
  assert.strictEqual(errPos('a OR '), 5);
  assert.strictEqual(errPos('NOT'), 3);
  assert.strictEqual(errPos('AND a'), 0);
  assert.strictEqual(errPos('  OR a'), 2);
  assert.strictEqual(errPos('(AND a)'), 1);
  assert.strictEqual(errPos('a AND OR b'), 6);
  assert.strictEqual(errPos('NOT AND a'), 4);
  assert.strictEqual(errPos('a OR OR b'), 5);
  assert.strictEqual(errPos('status>=abc'), 8);
  assert.strictEqual(errPos('status>='), 8);
  assert.strictEqual(errPos('x status>1.'), 9);
  assert.strictEqual(errPos('status:'), 7);
  assert.strictEqual(errPos('a status: b'), 9);
  assert.strictEqual(errPos('a "abc'), 2);
  assert.strictEqual(errPos('msg:"abc'), 4);
});

test('độ ưu tiên và AND ngầm', () => {
  const r = { a: 1, b: 1, c: 0 };
  assert.ok(m('a:1 OR c:1 AND c:2', r));
  assert.ok(!m('(a:1 OR c:1) AND c:2', r));
  assert.ok(m('NOT c:1 a:1', r));
  assert.ok(!m('NOT (a:1 b:1)', r));
  assert.ok(m('a:1 b:1', r));
  assert.ok(!m('a:1 b:2', r));
  assert.ok(m('a:1 AND b:1', r));
  assert.ok(m('NOT NOT a:1', r));
});

test('and/or thường là từ tìm kiếm', () => {
  assert.ok(m('and', { msg: 'rock and roll' }));
  assert.ok(!m('or', { msg: 'rock and roll' }));
  assert.ok(m('rock and roll', { msg: 'rock and roll' }));
  assert.ok(m('or', { msg: 'color' }));
});

test('field:value, wildcard, quoted', () => {
  assert.ok(m('status:500', { status: 500 }));
  assert.ok(m('status:500', { status: '500' }));
  assert.ok(!m('status:500', { status: null }));
  assert.ok(!m('status:500', {}));
  assert.ok(m('lvl:ERROR', { lvl: 'error' }));
  assert.ok(m('path:/api/*', { path: '/api/users' }));
  assert.ok(!m('path:/api/*', { path: 'x/api/users' }));
  assert.ok(m('p:a?c', { p: 'abc' }));
  assert.ok(!m('p:a?c', { p: 'ac' }));
  assert.ok(m('p:*', { p: '' }));
  assert.ok(m('p:a.c', { p: 'a.c' }));
  assert.ok(!m('p:a.c', { p: 'abc' }));
  assert.ok(m('p:a+b[', { p: 'a+b[' }));
  assert.ok(m('msg:"a*b"', { msg: 'A*B' }));
  assert.ok(!m('msg:"a*b"', { msg: 'axxb' }));
  assert.ok(m('msg:"connection reset"', { msg: 'Connection Reset' }));
  assert.ok(!m('msg:"connection"', { msg: 'connection reset' }));
  assert.ok(m('msg:"say \\"hi\\" (x)"', { msg: 'say "hi" (x)' }));
  assert.ok(m('p:"a\\\\b"', { p: 'a\\b' }));
  assert.ok(m('http.status:500', { 'http.status': 500 }));
  assert.ok(m('flag:true', { flag: true }));
});

test('so sánh CMP', () => {
  assert.ok(m('status>=500', { status: 500 }));
  assert.ok(!m('status>500', { status: 500 }));
  assert.ok(m('status<=500', { status: '500' }));
  assert.ok(m('status<501', { status: 500 }));
  assert.ok(m('x>-1.5', { x: -1 }));
  assert.ok(!m('status>=500', {}));
  assert.ok(!m('status>=500', { status: true }));
  assert.ok(!m('status>=500', { status: 'abc' }));
  assert.ok(!m('status>=500', { status: null }));
  assert.ok(!m('status>=0', { status: '' }));
  assert.ok(m('a>1 b<5', { a: 2, b: 4 }));
  assert.ok(m('(a>1)', { a: 2 }));
});

test('_exists_', () => {
  assert.ok(m('_exists_:a', { a: 0 }));
  assert.ok(!m('_exists_:a', { a: null }));
  assert.ok(!m('_exists_:a', {}));
  assert.ok(m('NOT _exists_:a', {}));
});

test('WORD/QUOTED tìm trong msg hoặc message', () => {
  assert.ok(m('TIMEOUT', { msg: 'a timeout b' }));
  assert.ok(m('timeout', { message: 'A Timeout' }));
  assert.ok(!m('timeout', { msg: 'ok', message: 'timeout' }));
  assert.ok(!m('timeout', { other: 'timeout' }));
  assert.ok(m('"a  b"', { msg: 'x a  b y' }));
  assert.ok(!m('"a  b"', { msg: 'a b' }));
  assert.ok(m('"(x)"', { msg: 'f(x)' }));
  assert.ok(!m('a*', { msg: 'abc' }));
});

test('ngoặc là token riêng', () => {
  assert.ok(m('(a:1)b:2', { a: 1, b: 2 }));
  assert.ok(m('NOT(a:1)', { a: 2 }));
});
