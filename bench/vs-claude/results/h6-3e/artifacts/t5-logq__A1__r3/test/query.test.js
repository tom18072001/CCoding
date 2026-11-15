'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, QuerySyntaxError } = require('../src/query');

const err = (q) => {
  try { compile(q); } catch (e) {
    assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
    assert.equal(e.name, 'QuerySyntaxError');
    assert.ok(e.message.startsWith('syntax error at position ' + e.position));
    return e.position;
  }
  return assert.fail('no error: ' + q);
};

test('truy vấn rỗng', () => {
  assert.equal(compile('')({}), true);
  assert.equal(compile('  ')({ a: 1 }), true);
});

test('field:value', () => {
  assert.equal(compile('status:500')({ status: 500 }), true);
  assert.equal(compile('status:500')({ status: '500' }), true);
  assert.equal(compile('level:ERROR')({ level: 'error' }), true);
  assert.equal(compile('level:err')({ level: 'error' }), false);
  assert.equal(compile('path:/api/*')({ path: '/api/users' }), true);
  assert.equal(compile('a:b?d')({ a: 'bcd' }), true);
  assert.equal(compile('a:b?d')({ a: 'bd' }), false);
  assert.equal(compile('a:*')({ a: '' }), true);
  assert.equal(compile('a:*')({ a: null }), false);
  assert.equal(compile('a:*')({}), false);
  assert.equal(compile('v:1.5')({ v: '105' }), false);
  assert.equal(compile('a:x[y')({ a: 'x[y' }), true);
});

test('quoted', () => {
  assert.equal(compile('msg:"connection reset"')({ msg: 'Connection Reset' }), true);
  assert.equal(compile('msg:"a*"')({ msg: 'abc' }), false);
  assert.equal(compile('msg:"a*"')({ msg: 'a*' }), true);
  assert.equal(compile('msg:"a \\"b\\""')({ msg: 'a "b"' }), true);
  assert.equal(compile('"x (y)"')({ msg: 'say X (Y) now' }), true);
});

test('so sánh', () => {
  const q = compile('status>=500');
  assert.equal(q({ status: 500 }), true);
  assert.equal(q({ status: '503' }), true);
  assert.equal(q({ status: 'abc' }), false);
  assert.equal(q({ status: true }), false);
  assert.equal(q({}), false);
  assert.equal(compile('x>1.5')({ x: 2 }), true);
  assert.equal(compile('x<-1')({ x: -2 }), true);
  assert.equal(compile('x<=1')({ x: 1 }), true);
  assert.equal(compile('x>1')({ x: 1 }), false);
});

test('_exists_', () => {
  const q = compile('_exists_:a');
  assert.equal(q({ a: 0 }), true);
  assert.equal(q({ a: null }), false);
  assert.equal(q({}), false);
});

test('từ tự do dùng msg rồi message', () => {
  assert.equal(compile('boom')({ msg: 'big BOOM' }), true);
  assert.equal(compile('boom')({ message: 'boom' }), true);
  assert.equal(compile('boom')({ msg: 'x', message: 'boom' }), false);
  assert.equal(compile('boom')({}), false);
  assert.equal(compile('bo*')({ msg: 'bo*' }), true);
  assert.equal(compile('bo*')({ msg: 'boom' }), false);
});

test('toán tử và ưu tiên', () => {
  const r = { a: 1, b: 2, c: 3 };
  assert.equal(compile('a:1 b:2')(r), true);
  assert.equal(compile('a:1 AND b:9')(r), false);
  assert.equal(compile('a:9 OR b:2 c:3')(r), true);
  assert.equal(compile('a:9 OR b:2 c:9')(r), false);
  assert.equal(compile('NOT a:9')(r), true);
  assert.equal(compile('NOT NOT a:1')(r), true);
  assert.equal(compile('NOT (a:1 AND b:2)')(r), false);
  assert.equal(compile('(a:9 OR b:2) AND c:3')(r), true);
  assert.equal(compile('NOT a:1 OR b:2')(r), true);
  assert.equal(compile('(a:1)(b:2)')(r), true);
  assert.equal(compile('NOT(a:9)')(r), true);
});

test('and/or thường là từ tìm kiếm', () => {
  assert.equal(compile('cats and dogs')({ msg: 'cats and dogs' }), true);
  assert.equal(compile('cats and dogs')({ msg: 'cats dogs' }), false);
  assert.equal(compile('x or y')({ msg: 'x or y' }), true);
  assert.equal(compile('ANDROID')({ msg: 'android' }), true);
});

test('vị trí lỗi', () => {
  assert.equal(err('(a'), 2);
  assert.equal(err('(a:1 AND (b:2)'), 14);
  assert.equal(err('a)'), 1);
  assert.equal(err('a:1 b:2 )'), 8);
  assert.equal(err('()'), 1);
  assert.equal(err('a AND'), 5);
  assert.equal(err('a OR'), 4);
  assert.equal(err('NOT'), 3);
  assert.equal(err('a AND NOT'), 9);
  assert.equal(err('AND a'), 0);
  assert.equal(err('OR a'), 0);
  assert.equal(err('(AND a)'), 1);
  assert.equal(err('a AND OR b'), 6);
  assert.equal(err('NOT AND a'), 4);
  assert.equal(err('a OR OR b'), 5);
  assert.equal(err('status>=abc'), 8);
  assert.equal(err('status>='), 8);
  assert.equal(err('x:1 status>abc'), 11);
  assert.equal(err('status:'), 7);
  assert.equal(err('a:1 status: b'), 11);
  assert.equal(err('"abc'), 0);
  assert.equal(err('a "abc'), 2);
  assert.equal(err('msg:"abc'), 4);
  assert.equal(err('a AND "x\\"'), 6);
  assert.equal(err(') "abc'), 0);
});
