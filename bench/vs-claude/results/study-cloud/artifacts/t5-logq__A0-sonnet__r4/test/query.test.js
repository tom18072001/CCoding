'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, QuerySyntaxError } = require('../src');

const pos = (q) => { try { compile(q); } catch (e) { assert.ok(e instanceof QuerySyntaxError); assert.equal(e.name, 'QuerySyntaxError'); assert.ok(e.message.startsWith('syntax error at position ' + e.position)); return e.position; } return null; };

test('ngữ nghĩa', () => {
  assert.equal(compile('')({ a: 1 }), true);
  assert.equal(compile('status:500')({ status: '500' }), true);
  assert.equal(compile('path:/api/*')({ path: '/API/users' }), true);
  assert.equal(compile('a:?b')({ a: 'xb' }), true);
  assert.equal(compile('a:*')({ a: '' }), true);
  assert.equal(compile('a:*')({ a: null }), false);
  assert.equal(compile('a:"x*"')({ a: 'xy' }), false);
  assert.equal(compile('msg:"a b"')({ msg: 'A B' }), true);
  assert.equal(compile('n>=5')({ n: '5' }), true);
  assert.equal(compile('n>5')({ n: true }), false);
  assert.equal(compile('_exists_:x')({ x: 0 }), true);
  assert.equal(compile('_exists_:x')({ x: null }), false);
  assert.equal(compile('boom')({ message: 'big BOOM' }), true);
  assert.equal(compile('boom')({ msg: 'no', message: 'boom' }), false);
  assert.equal(compile('"a (b)"')({ msg: 'xa (b)' }), true);
  assert.equal(compile('and')({ msg: 'rock and roll' }), true);
});
test('ưu tiên và AND ngầm', () => {
  const r = { a: 1, b: 2 };
  assert.equal(compile('a:9 AND b:2 OR a:1')(r), true);
  assert.equal(compile('a:1 b:2')(r), true);
  assert.equal(compile('a:1 NOT b:2')(r), false);
  assert.equal(compile('NOT (a:9 OR b:9)')(r), true);
  assert.equal(compile('a:9 OR b:2 a:1')(r), true);
});
test('vị trí lỗi', () => {
  assert.equal(pos('(a'), 2);
  assert.equal(pos('a)'), 1);
  assert.equal(pos('()'), 1);
  assert.equal(pos('a AND'), 5);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a'), 0);
  assert.equal(pos('(OR a)'), 1);
  assert.equal(pos('a AND OR b'), 6);
  assert.equal(pos('NOT AND'), 4);
  assert.equal(pos('status>=abc'), 8);
  assert.equal(pos('status>='), 8);
  assert.equal(pos('a:'), 2);
  assert.equal(pos('a b:'), 4);
  assert.equal(pos('a "bc'), 2);
  assert.equal(pos('msg:"bc'), 4);
  assert.equal(pos('a'), null);
});
