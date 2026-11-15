'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { compile, QuerySyntaxError } = require('../src/query.js');

function errPos(q) {
  try { compile(q); } catch (e) {
    assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
    assert.strictEqual(e.name, 'QuerySyntaxError');
    assert.ok(e.message.startsWith('syntax error at position ' + e.position));
    return e.position;
  }
  assert.fail('expected error for ' + JSON.stringify(q));
}

test('vị trí lỗi', () => {
  const cases = [
    ['(a', 2], ['(a AND b', 8], ['a)', 1], ['a b )', 4], ['()', 1], ['a AND ( )', 8],
    ['a AND', 5], ['a OR', 4], ['NOT', 3], ['a AND ', 6],
    ['AND a', 0], ['OR a', 0], ['(AND a)', 1], ['a AND OR b', 6], ['a OR AND b', 5],
    ['NOT AND', 4], ['a AND NOT OR', 10],
    ['status>=abc', 8], ['status>=', 8], ['x status>', 9], ['a status<1x', 9],
    ['field:', 6], ['a field: b', 8], ['(f:)', 3],
    ['msg:"abc', 4], ['x "abc', 2], ['"abc', 0],
    ['_exists_:', 9],
  ];
  for (const [q, pos] of cases) assert.strictEqual(errPos(q), pos, q);
});

test('truy vấn rỗng', () => {
  assert.strictEqual(compile('')({}), true);
  assert.strictEqual(compile('   ')({ a: 1 }), true);
});

test('field:value', () => {
  assert.ok(compile('status:500')({ status: 500 }));
  assert.ok(compile('status:500')({ status: '500' }));
  assert.ok(!compile('status:500')({ status: null }));
  assert.ok(!compile('status:500')({}));
  assert.ok(compile('level:ERROR')({ level: 'error' }));
  assert.ok(!compile('level:err')({ level: 'error' }));
  assert.ok(compile('path:/api/*')({ path: '/api/users' }));
  assert.ok(compile('path:/api/*')({ path: '/api/' }));
  assert.ok(compile('a:x?z')({ a: 'xyz' }));
  assert.ok(!compile('a:x?z')({ a: 'xz' }));
  assert.ok(!compile('a:x.z')({ a: 'xyz' }));
  assert.ok(compile('a:x.z')({ a: 'x.z' }));
  assert.ok(compile('a:1+1')({ a: '1+1' }));
  assert.ok(compile('http.status:5*')({ 'http.status': 503 }));
  assert.ok(compile('a:true')({ a: true }));
  assert.ok(!compile('a:*')({ a: null }));
});

test('quoted', () => {
  assert.ok(compile('msg:"connection reset"')({ msg: 'Connection Reset' }));
  assert.ok(!compile('msg:"conn*"')({ msg: 'connection' }));
  assert.ok(compile('msg:"conn*"')({ msg: 'conn*' }));
  assert.ok(compile('msg:"a \\"b\\" (c)"')({ msg: 'a "b" (c)' }));
  assert.strictEqual(compile('"x y"')({ msg: 'AX Yb' }), true);
  assert.strictEqual(compile('"x y"')({ msg: 'axyb' }), false);
  assert.ok(compile('("a b")')({ msg: 'a b' }));
});

test('so sánh', () => {
  const c = compile('status>=500');
  assert.ok(c({ status: 500 }));
  assert.ok(c({ status: '503' }));
  assert.ok(!c({ status: 499 }));
  assert.ok(!c({ status: 'abc' }));
  assert.ok(!c({ status: true }));
  assert.ok(!c({ status: null }));
  assert.ok(!c({}));
  assert.ok(compile('x<=-1.5')({ x: -2 }));
  assert.ok(!compile('x<1')({ x: 1 }));
  assert.ok(compile('x>1')({ x: 1.5 }));
  assert.ok(compile('@t>10')({ '@t': 11 }));
});

test('_exists_', () => {
  const c = compile('_exists_:user');
  assert.ok(c({ user: 0 }));
  assert.ok(c({ user: '' }));
  assert.ok(!c({ user: null }));
  assert.ok(!c({}));
});

test('WORD', () => {
  assert.ok(compile('TIMEOUT')({ msg: 'a timeout b' }));
  assert.ok(compile('timeout')({ message: 'Timeout' }));
  assert.ok(!compile('timeout')({ msg: 'ok', message: 'timeout' }));
  assert.ok(!compile('timeout')({ other: 'timeout' }));
  assert.ok(!compile('ti*out')({ msg: 'timeout' }));
  assert.ok(compile('and')({ msg: 'rock and roll' }));
  assert.ok(compile('or')({ msg: 'or' }));
});

test('toán tử và ưu tiên', () => {
  const r = { a: 1, b: 2, c: 3 };
  assert.ok(compile('a:1 b:2')(r));
  assert.ok(compile('a:1 AND b:2')(r));
  assert.ok(!compile('a:1 b:9')(r));
  assert.ok(compile('a:9 OR b:2')(r));
  assert.ok(compile('a:1 OR b:9 AND c:9')(r));
  assert.ok(!compile('(a:1 OR b:9) AND c:9')(r));
  assert.ok(compile('NOT a:9 AND b:2')(r));
  assert.ok(!compile('NOT a:1 OR c:9')(r));
  assert.ok(compile('NOT NOT a:1')(r));
  assert.ok(compile('NOT (a:9 OR b:9)')(r));
  assert.ok(compile('a:1 NOT b:9')(r));
  assert.ok(compile('((a:1))')(r));
});

test('từ khóa thường không phải từ khóa', () => {
  assert.ok(compile('a and b')({ msg: 'a and b' }));
  assert.ok(!compile('a and b')({ msg: 'a b' }));
  assert.ok(compile('not')({ msg: 'not' }));
});
