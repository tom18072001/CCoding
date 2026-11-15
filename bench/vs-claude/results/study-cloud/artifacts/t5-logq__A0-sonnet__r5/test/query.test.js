'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, QuerySyntaxError } = require('../src');

const m = (q, r) => compile(q)(r);
const pos = (q) => { try { compile(q); } catch (e) { assert.ok(e instanceof QuerySyntaxError); assert.equal(e.name, 'QuerySyntaxError'); assert.ok(e.message.startsWith(`syntax error at position ${e.position}`)); return e.position; } assert.fail('no error: ' + q); };

test('rỗng khớp tất cả', () => { assert.equal(m('  ', {}), true); assert.equal(m('', { a: 1 }), true); });
test('field:value', () => {
  assert.equal(m('status:500', { status: 500 }), true);
  assert.equal(m('status:500', { status: '500' }), true);
  assert.equal(m('path:/api/*', { path: '/api/users' }), true);
  assert.equal(m('a:?b?d', { a: 'ABCD' }), true);
  assert.equal(m('a:b', { a: 'bb' }), false);
  assert.equal(m('a:b', { a: null }), false);
  assert.equal(m('a:*', { a: '' }), true);
  assert.equal(m('a:"x*"', { a: 'xy' }), false);
  assert.equal(m('a:"x*"', { a: 'X*' }), true);
  assert.equal(m('msg:"conn reset"', { msg: 'Conn Reset' }), true);
  assert.equal(m('a.b:1', { 'a.b': 1 }), true);
});
test('so sánh', () => {
  assert.equal(m('s>=500', { s: '500' }), true);
  assert.equal(m('s>500', { s: 500 }), false);
  assert.equal(m('s<=1.5', { s: 1.5 }), true);
  assert.equal(m('s<0', { s: -1 }), true);
  assert.equal(m('s>=1', { s: true }), false);
  assert.equal(m('s>=1', { s: 'abc' }), false);
  assert.equal(m('s>=1', {}), false);
});
test('_exists_', () => {
  assert.equal(m('_exists_:a', { a: 0 }), true);
  assert.equal(m('_exists_:a', { a: null }), false);
  assert.equal(m('_exists_:a', {}), false);
});
test('từ tìm kiếm', () => {
  assert.equal(m('boom', { msg: 'Big BOOM' }), true);
  assert.equal(m('boom', { message: 'boom' }), true);
  assert.equal(m('boom', { msg: 'x', message: 'boom' }), false);
  assert.equal(m('boom', {}), false);
  assert.equal(m('"a (b)"', { msg: 'xa (b)' }), true);
  assert.equal(m('and', { msg: 'this and that' }), true);
});
test('toán tử và ưu tiên', () => {
  const r = { a: 1, b: 2, c: 3 };
  assert.equal(m('a:1 b:2', r), true);
  assert.equal(m('a:9 OR a:1 AND b:9', r), false);
  assert.equal(m('a:1 OR a:9 AND b:9', r), true);
  assert.equal(m('NOT a:9 AND b:2', r), true);
  assert.equal(m('NOT NOT a:1', r), true);
  assert.equal(m('(a:9 OR b:2) c:3', r), true);
  assert.equal(m('a:1 b:2 OR c:9', r), true);
  assert.equal(m('(a:1)(b:2)', r), true);
});
test('vị trí lỗi', () => {
  assert.equal(pos('(a'), 2);
  assert.equal(pos('a)'), 1);
  assert.equal(pos('a b)'), 3);
  assert.equal(pos('()'), 1);
  assert.equal(pos('a AND'), 5);
  assert.equal(pos('a OR '), 5);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a'), 0);
  assert.equal(pos('OR a'), 0);
  assert.equal(pos('(AND a)'), 1);
  assert.equal(pos('a AND OR b'), 6);
  assert.equal(pos('NOT AND'), 4);
  assert.equal(pos('status>=abc'), 8);
  assert.equal(pos('a:1 status>='), 12);
  assert.equal(pos('a:'), 2);
  assert.equal(pos('x a:'), 4);
  assert.equal(pos('a "bc'), 2);
  assert.equal(pos('msg:"bc'), 4);
});
